import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFilecoinProductionDoctorReport, filecoinDoctorUrl } from "./filecoinProductionDoctor";

let tempDir: string | undefined;

const recordHash = "a".repeat(64);
const modeHash = "b".repeat(64);
const modeHashes = ["b", "c", "d", "e", "f", "1"].map((char) => char.repeat(64));
const env = {
  FILECOIN_SEAL_TOKEN: "seal-token",
  VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
  VITE_FILECOIN_SEAL_TOKEN: "seal-token",
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
  KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: recordHash,
  KICKOFF_VERIFY_FILECOIN_MODE_CID: "bafy-mode",
  KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH: modeHash,
  KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-mode-1,bafy-mode-2,bafy-mode-3,bafy-mode-4,bafy-mode-5,bafy-mode-6",
  KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: modeHashes.join(","),
};

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

const productionHealth = {
  ok: true,
  service: "kickoff-lock-filecoin-seal-api",
  mockMode: false,
  hasPrivateKey: true,
  authRequired: true,
  productionReady: true,
  blockers: [],
  proofCount: 2,
  persistence: "file",
  maxUploadBytes: 262144,
  allowOrigin: "restricted",
  corsRestricted: true,
  endpoints: ["POST /seal", "POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"],
};

const proxyCapabilities = {
  service: "kickoff-lock-filecoin-seal-proxy",
  upstreamConfigured: true,
  tokenInjected: true,
  protectedUpload: true,
  allowedRoutes: ["GET /health", "POST /seal", "POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"],
  asyncUpload: {
    route: "POST /seal?async=1",
    available: true,
    statusUrlRequired: true,
  },
  uploadStatus: {
    route: "GET /jobs/:id",
    available: true,
    proves: "upload status polling",
  },
  cidQuery: {
    route: "GET /proof/:cid",
    available: true,
    proves: "CID metadata read-back",
  },
  verificationPolling: {
    route: "GET /verify?cid=",
    available: true,
    proves: "retrievability and verified status polling",
  },
};

const proofFor = (cid: string) => ({
  ok: true,
  mode: "real",
  cid,
  pieceCid: `piece-${cid}`,
  provider: "synapse-provider",
  dataSetId: "dataset-1",
  proofStatus: "verified",
  payloadHash: cid === "bafy-record" ? recordHash : modeHash,
  byteLength: 1024,
  checkedAt: "2099-01-01T00:00:00.000Z",
});

const modeProofFor = (cid: string) => {
  const index = Number(cid.replace("bafy-mode-", "")) - 1;
  return {
    ...proofFor(cid),
    payloadHash: modeHashes[index] ?? modeHash,
  };
};

describe("Filecoin production doctor", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("builds health, seal, verify and proof URLs from the browser seal endpoint", () => {
    expect(filecoinDoctorUrl(env, "health")).toBe("https://seal.example/health");
    expect(filecoinDoctorUrl(env, "seal")).toBe("https://seal.example/seal");
    expect(filecoinDoctorUrl(env, "verify", "bafy123")).toBe("https://seal.example/verify?cid=bafy123");
    expect(filecoinDoctorUrl(env, "proof", "bafy123")).toBe("https://seal.example/proof/bafy123");
  });

  it("builds doctor URLs from a same-origin seal endpoint", async () => {
    const sameOriginEnv = {
      ...env,
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://example.com/health") {
        return jsonResponse({
          ...productionHealth,
          service: "kickoff-lock-filecoin-seal-proxy",
          upstreamService: "kickoff-lock-filecoin-seal-api",
          tokenInjected: true,
          proxyCapabilities,
        });
      }
      if (url === "https://example.com/verify?cid=bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url === "https://example.com/proof/bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    expect(filecoinDoctorUrl(sameOriginEnv, "seal")).toBe("https://example.com/seal");
    expect(filecoinDoctorUrl(sameOriginEnv, "health")).toBe("https://example.com/health");

    const report = await buildFilecoinProductionDoctorReport(sameOriginEnv, fetcher as any);

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "seal-api-env")).toMatchObject({
      status: "passed",
      detail: "https://example.com/seal",
    });
    expect(report.checks.find((check) => check.id === "seal-api-health")?.detail).toContain(
      "proxy token injection and route capabilities verified",
    );
  });

  it("keeps same-origin seal health failed when the proxy does not inject the server token", async () => {
    const sameOriginEnv = {
      ...env,
      FILECOIN_SEAL_TOKEN: "",
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_TOKEN: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://example.com/health") {
        return jsonResponse({
          ...productionHealth,
          service: "kickoff-lock-filecoin-seal-proxy",
          upstreamService: "kickoff-lock-filecoin-seal-api",
          tokenInjected: false,
          proxyCapabilities: { ...proxyCapabilities, tokenInjected: false, protectedUpload: false },
        });
      }
      if (url.includes("bafy-record")) return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(sameOriginEnv, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "seal-token-env")).toMatchObject({
      status: "failed",
      detail: "Missing FILECOIN_SEAL_TOKEN for same-origin proxy injection",
    });
    expect(report.checks.find((check) => check.id === "seal-api-health")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("same-origin FILECOIN_SEAL_TOKEN injection missing"),
    });
  });

  it("keeps same-origin seal health failed when the proxy does not publish upload, job, proof and verify capabilities", async () => {
    const sameOriginEnv = {
      ...env,
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_TOKEN: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://example.com/health") {
        return jsonResponse({
          ...productionHealth,
          service: "kickoff-lock-filecoin-seal-proxy",
          upstreamService: "kickoff-lock-filecoin-seal-api",
          tokenInjected: true,
        });
      }
      if (url.includes("bafy-record")) return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(sameOriginEnv, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "seal-api-health")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("same-origin seal proxy capability matrix incomplete"),
    });
  });

  it("fails clearly before contacting the network when the seal API is missing", async () => {
    const fetcher = vi.fn();
    const report = await buildFilecoinProductionDoctorReport({}, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.requiredPassed).toBe(0);
    expect(report.checks.find((check) => check.id === "seal-api-env")?.detail).toContain("missing");
    expect(report.nextActions.map((check) => check.id)).toEqual(
      expect.arrayContaining(["seal-api-env", "seal-token-env", "seal-api-health", "record-proof-readback", "mode-proof-readback"]),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects local or non-/seal browser endpoints before contacting the network", async () => {
    const fetcher = vi.fn();
    const localReport = await buildFilecoinProductionDoctorReport(
      { ...env, VITE_FILECOIN_SEAL_API: "http://127.0.0.1:8787/seal" },
      fetcher as any,
    );
    const wrongPathReport = await buildFilecoinProductionDoctorReport(
      { ...env, VITE_FILECOIN_SEAL_API: "https://seal.example/status" },
      fetcher as any,
    );

    expect(localReport.ready).toBe(false);
    expect(localReport.checks.find((check) => check.id === "seal-api-env")).toMatchObject({
      status: "failed",
      detail: "VITE_FILECOIN_SEAL_API must be a deployed HTTPS /seal endpoint",
    });
    expect(localReport.checks.find((check) => check.id === "seal-api-health")?.detail).toBe(
      "VITE_FILECOIN_SEAL_API must be a deployed HTTPS /seal endpoint",
    );
    expect(wrongPathReport.ready).toBe(false);
    expect(wrongPathReport.checks.find((check) => check.id === "seal-api-env")?.detail).toBe(
      "VITE_FILECOIN_SEAL_API must point to the deployed /seal endpoint",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("passes only when health is production-ready and record plus mode proofs read back with matching hashes", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer seal-token" });
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/verify?cid=bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url === "https://seal.example/proof/bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(true);
    expect(report.requiredPassed).toBe(report.requiredTotal);
    expect(report.checks.find((check) => check.id === "optional-seal-upload-smoke")?.status).toBe("skipped");
    expect(report.checks.find((check) => check.id === "record-proof-readback")?.detail).toContain("1024 bytes");
    expect(report.checks.find((check) => check.id === "mode-proof-readback")?.detail).toContain("6/6 mode CIDs");
  });

  it("verifies every mode CID when plural mode proof targets are configured", async () => {
    const pluralEnv = {
      ...env,
      KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-mode-1,bafy-mode-2,bafy-mode-3,bafy-mode-4,bafy-mode-5,bafy-mode-6",
      KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: modeHashes.join(","),
    };
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer seal-token" });
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/verify?cid=bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url === "https://seal.example/proof/bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(pluralEnv, fetcher as any);

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "mode-proof-payload-hash-target")?.detail).toBe("6/6 hashes configured");
    expect(report.checks.find((check) => check.id === "mode-proof-readback")).toMatchObject({
      status: "passed",
      detail: "6/6 mode CIDs verified with matching payload hashes",
      sampleIds: ["bafy-mode-1", "bafy-mode-2", "bafy-mode-3", "bafy-mode-4", "bafy-mode-5", "bafy-mode-6"],
    });
  });

  it("fails plural mode proof read-back when fewer CIDs than required mode ids are configured", async () => {
    const partialEnv = {
      ...env,
      KICKOFF_VERIFY_MODE_IDS: "mode-bracket,mode-parlay,mode-agent,mode-upset,mode-group-path,mode-penalty-pressure",
      KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-mode-1",
      KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: modeHashes[0],
    };
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/verify?cid=bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url === "https://seal.example/proof/bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-1")) return jsonResponse(modeProofFor("bafy-mode-1"));
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(partialEnv, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "mode-proof-readback")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs 6 mode CIDs; got 1; KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs 6 mode payload hashes; got 1",
    });
  });

  it("does not accept legacy single mode CID/hash for full Filecoin production acceptance", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url.includes("bafy-record")) return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode")) return jsonResponse(proofFor("bafy-mode"));
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(
      {
        ...env,
        KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "",
        KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: "",
        KICKOFF_VERIFY_FILECOIN_MODE_CID: "bafy-mode",
        KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH: modeHash,
      },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "mode-proof-readback")).toMatchObject({
      status: "failed",
      detail:
        "KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs 6 mode CIDs; legacy KICKOFF_VERIFY_FILECOIN_MODE_CID is not enough; KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs 6 mode payload hashes; legacy KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH is not enough",
    });
  });

  it("keeps health failed when the seal backend is mock or memory-only", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") {
        return jsonResponse({
          ...productionHealth,
          mockMode: true,
          productionReady: false,
          persistence: "memory",
          blockers: ["FILECOIN_SEAL_MOCK is enabled", "FILECOIN_PROOF_STORE_PATH is missing"],
        });
      }
      if (url.includes("bafy-record")) return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "seal-api-health")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("FILECOIN_SEAL_MOCK is enabled"),
    });
  });

  it("keeps health failed when the seal backend exposes wildcard or unreported CORS", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") {
        return jsonResponse({
          ...productionHealth,
          productionReady: false,
          allowOrigin: "wildcard-or-invalid",
          corsRestricted: false,
          blockers: ["ALLOW_ORIGIN must be a deployed HTTPS app origin"],
        });
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "seal-api-health")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("ALLOW_ORIGIN must be a deployed HTTPS app origin"),
    });
  });

  it("fails proof read-back when registry hash does not match the expected upload payload hash", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url.includes("bafy-record")) return jsonResponse({ ...proofFor("bafy-record"), payloadHash: "c".repeat(64) });
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "record-proof-readback")?.detail).toContain("payload hash mismatch");
  });

  it("fails proof read-back when proof metadata is mock or demo even with matching hashes", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/verify?cid=bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url === "https://seal.example/proof/bafy-record") {
        return jsonResponse({
          ...proofFor("bafy-record"),
          mode: "demo",
          provider: "mock-synapse-provider",
          dataSetId: "seal-api-dataset",
        });
      }
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);
    const detail = report.checks.find((check) => check.id === "record-proof-readback")?.detail ?? "";

    expect(report.ready).toBe(false);
    expect(detail).toContain("record proof mode must be real");
    expect(detail).toContain("record proof provider looks like mock");
    expect(detail).toContain("record proof data set id looks like mock");
  });

  it("fails proof read-back when /verify returns a different CID than the requested proof", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/verify?cid=bafy-record") {
        return jsonResponse({ ...proofFor("bafy-record"), cid: "bafy-other-record" });
      }
      if (url === "https://seal.example/proof/bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "record-proof-readback")?.detail).toContain(
      "verify 200/bafy-other-record/verified",
    );
  });

  it("fails proof read-back when /verify and /proof disagree on the payload hash", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/verify?cid=bafy-record") {
        return jsonResponse({ ...proofFor("bafy-record"), payloadHash: "f".repeat(64) });
      }
      if (url === "https://seal.example/proof/bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "record-proof-readback")?.detail).toContain(
      "verify/proof payload hashes differ",
    );
  });

  it("optionally exercises async POST /seal and job polling with a local locked payload file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-doctor-"));
    const payloadPath = join(tempDir, "payload.json");
    const payload = JSON.stringify({
      capsule: {
        id: "cap-smoke",
        payloadHash: "d".repeat(64),
        locked: true,
        sealedAt: "2099-01-01T00:00:00.000Z",
        prediction: { homeScore: 1, awayScore: 0, winner: "Home", confidence: 66 },
      },
    });
    await writeFile(payloadPath, payload, "utf8");
    const uploadHash = createHash("sha256").update(payload).digest("hex");
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url.includes("bafy-record")) return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      if (url === "https://seal.example/seal?async=1") {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ Authorization: "Bearer seal-token" });
        expect(init?.body).toBe(payload);
        return jsonResponse(
          {
            ok: true,
            jobId: "seal-job-doctor-smoke",
            status: "running",
            statusUrl: "/jobs/seal-job-doctor-smoke",
            payloadHash: uploadHash,
          },
          { status: 202 },
        );
      }
      if (url === "https://seal.example/jobs/seal-job-doctor-smoke") {
        return jsonResponse({
          ok: true,
          jobId: "seal-job-doctor-smoke",
          status: "verified",
          proof: {
            cid: "bafy-smoke",
            payloadHash: uploadHash,
            proofStatus: "verified",
            byteLength: payload.length,
          },
        });
      }
      if (url === "https://seal.example/verify?cid=bafy-smoke" || url === "https://seal.example/proof/bafy-smoke") {
        return jsonResponse({
          ok: true,
          mode: "real",
          cid: "bafy-smoke",
          pieceCid: "piece-bafy-smoke",
          provider: "synapse-provider",
          dataSetId: "dataset-smoke",
          proofStatus: "verified",
          payloadHash: uploadHash,
          byteLength: payload.length,
        });
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(
      { ...env, KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD: payloadPath },
      fetcher as any,
    );

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "optional-seal-upload-smoke")).toMatchObject({
      status: "passed",
      required: false,
      detail: expect.stringContaining(`registry read-back and ${payload.length} bytes after 1 job poll`),
      url: "https://seal.example/seal?async=1",
      sampleIds: ["bafy-smoke"],
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toContain("https://seal.example/jobs/seal-job-doctor-smoke");
    expect(fetcher.mock.calls.map(([url]) => url)).toContain("https://seal.example/verify?cid=bafy-smoke");
    expect(fetcher.mock.calls.map(([url]) => url)).toContain("https://seal.example/proof/bafy-smoke");
  });

  it("does not pass optional async seal smoke when registry read-back disagrees with the job result", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-doctor-"));
    const payloadPath = join(tempDir, "payload.json");
    const payload = JSON.stringify({
      capsule: {
        id: "cap-registry-mismatch",
        payloadHash: "3".repeat(64),
        locked: true,
        sealedAt: "2099-01-01T00:00:00.000Z",
        prediction: { homeScore: 1, awayScore: 1, winner: "Draw", confidence: 60 },
      },
    });
    await writeFile(payloadPath, payload, "utf8");
    const uploadHash = createHash("sha256").update(payload).digest("hex");
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url.includes("bafy-record")) return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      if (url === "https://seal.example/seal?async=1") {
        return jsonResponse(
          {
            ok: true,
            jobId: "seal-job-registry-mismatch",
            status: "running",
            statusUrl: "/jobs/seal-job-registry-mismatch",
            payloadHash: uploadHash,
          },
          { status: 202 },
        );
      }
      if (url === "https://seal.example/jobs/seal-job-registry-mismatch") {
        return jsonResponse({
          ok: true,
          jobId: "seal-job-registry-mismatch",
          status: "verified",
          proof: {
            cid: "bafy-registry-mismatch",
            payloadHash: uploadHash,
            proofStatus: "verified",
            byteLength: payload.length,
          },
        });
      }
      if (url === "https://seal.example/verify?cid=bafy-registry-mismatch") {
        return jsonResponse({
          ok: true,
          mode: "real",
          cid: "bafy-registry-mismatch",
          pieceCid: "piece-registry-mismatch",
          provider: "synapse-provider",
          dataSetId: "dataset-smoke",
          proofStatus: "verified",
          payloadHash: uploadHash,
          byteLength: payload.length,
        });
      }
      if (url === "https://seal.example/proof/bafy-registry-mismatch") {
        return jsonResponse({
          ok: true,
          mode: "real",
          cid: "bafy-registry-mismatch",
          pieceCid: "piece-registry-mismatch",
          provider: "synapse-provider",
          dataSetId: "dataset-smoke",
          proofStatus: "verified",
          payloadHash: "0".repeat(64),
          byteLength: payload.length,
        });
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(
      { ...env, KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD: payloadPath },
      fetcher as any,
    );

    expect(report.checks.find((check) => check.id === "optional-seal-upload-smoke")).toMatchObject({
      status: "failed",
      required: false,
      detail: expect.stringContaining("verify/proof registry read-back failed"),
      sampleIds: ["bafy-registry-mismatch"],
    });
    expect(report.checks.find((check) => check.id === "optional-seal-upload-smoke")?.detail).toContain(
      "registry payload hash mismatch",
    );
  });

  it("does not pass optional async seal smoke when POST /seal?async=1 returns a direct CID without a job", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-doctor-"));
    const payloadPath = join(tempDir, "payload.json");
    const payload = JSON.stringify({
      capsule: {
        id: "cap-direct",
        payloadHash: "f".repeat(64),
        locked: true,
        sealedAt: "2099-01-01T00:00:00.000Z",
        prediction: { homeScore: 2, awayScore: 1, winner: "Home", confidence: 70 },
      },
    });
    await writeFile(payloadPath, payload, "utf8");
    const uploadHash = createHash("sha256").update(payload).digest("hex");
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url.includes("bafy-record")) return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      if (url === "https://seal.example/seal?async=1") {
        return jsonResponse({
          ok: true,
          cid: "bafy-direct-smoke",
          payloadHash: uploadHash,
          proofStatus: "verified",
        });
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(
      { ...env, KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD: payloadPath },
      fetcher as any,
    );

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "optional-seal-upload-smoke")).toMatchObject({
      status: "failed",
      required: false,
      detail: "POST /seal?async=1 did not return a jobId",
      sampleIds: ["bafy-direct-smoke"],
    });
    expect(fetcher.mock.calls.map(([url]) => url)).not.toContain("https://seal.example/jobs/bafy-direct-smoke");
  });

  it("does not pass optional async seal smoke until the job reports a terminal proof status", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-doctor-"));
    const payloadPath = join(tempDir, "payload.json");
    const payload = JSON.stringify({
      capsule: {
        id: "cap-pending",
        payloadHash: "1".repeat(64),
        locked: true,
        sealedAt: "2099-01-01T00:00:00.000Z",
      },
    });
    await writeFile(payloadPath, payload, "utf8");
    const uploadHash = createHash("sha256").update(payload).digest("hex");
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url.includes("bafy-record")) return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      if (url === "https://seal.example/seal?async=1") {
        return jsonResponse(
          {
            ok: true,
            jobId: "seal-job-pending",
            status: "running",
            statusUrl: "/jobs/seal-job-pending",
            payloadHash: uploadHash,
          },
          { status: 202 },
        );
      }
      if (url === "https://seal.example/jobs/seal-job-pending") {
        return jsonResponse({
          ok: true,
          jobId: "seal-job-pending",
          status: "pending",
          proof: {
            cid: "bafy-pending",
            payloadHash: uploadHash,
            proofStatus: "pending",
            byteLength: payload.length,
          },
        });
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(
      { ...env, KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD: payloadPath },
      fetcher as any,
    );

    expect(report.checks.find((check) => check.id === "optional-seal-upload-smoke")).toMatchObject({
      status: "failed",
      required: false,
      detail: "CID bafy-pending returned with status pending",
      sampleIds: ["bafy-pending"],
    });
  });

  it("does not pass optional async seal smoke without byte length read-back", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-doctor-"));
    const payloadPath = join(tempDir, "payload.json");
    const payload = JSON.stringify({
      capsule: {
        id: "cap-no-bytes",
        payloadHash: "2".repeat(64),
        locked: true,
        sealedAt: "2099-01-01T00:00:00.000Z",
      },
    });
    await writeFile(payloadPath, payload, "utf8");
    const uploadHash = createHash("sha256").update(payload).digest("hex");
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url.includes("bafy-record")) return jsonResponse(proofFor("bafy-record"));
      if (url.includes("bafy-mode-")) {
        const cid = url.includes("/verify") ? new URL(url).searchParams.get("cid")! : url.split("/").pop()!;
        return jsonResponse(modeProofFor(cid));
      }
      if (url === "https://seal.example/seal?async=1") {
        return jsonResponse(
          {
            ok: true,
            jobId: "seal-job-no-bytes",
            status: "running",
            statusUrl: "/jobs/seal-job-no-bytes",
            payloadHash: uploadHash,
          },
          { status: 202 },
        );
      }
      if (url === "https://seal.example/jobs/seal-job-no-bytes") {
        return jsonResponse({
          ok: true,
          jobId: "seal-job-no-bytes",
          status: "verified",
          proof: {
            cid: "bafy-no-bytes",
            payloadHash: uploadHash,
            proofStatus: "verified",
          },
        });
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(
      { ...env, KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD: payloadPath },
      fetcher as any,
    );

    expect(report.checks.find((check) => check.id === "optional-seal-upload-smoke")).toMatchObject({
      status: "failed",
      required: false,
      detail: "CID bafy-no-bytes returned without byte length read-back",
      sampleIds: ["bafy-no-bytes"],
    });
  });
});
