import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFilecoinProductionDoctorReport, filecoinDoctorUrl } from "./filecoinProductionDoctor";

let tempDir: string | undefined;

const recordHash = "a".repeat(64);
const modeHash = "b".repeat(64);
const env = {
  VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
  VITE_FILECOIN_SEAL_TOKEN: "seal-token",
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
  KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: recordHash,
  KICKOFF_VERIFY_FILECOIN_MODE_CID: "bafy-mode",
  KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH: modeHash,
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
  endpoints: ["POST /seal", "GET /verify?cid=", "GET /proof/:cid"],
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

  it("fails clearly before contacting the network when the seal API is missing", async () => {
    const fetcher = vi.fn();
    const report = await buildFilecoinProductionDoctorReport({}, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.requiredPassed).toBe(0);
    expect(report.checks.find((check) => check.id === "seal-api-env")?.detail).toContain("Missing");
    expect(report.nextActions.map((check) => check.id)).toEqual(
      expect.arrayContaining(["seal-api-env", "seal-token-env", "seal-api-health", "record-proof-readback", "mode-proof-readback"]),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("passes only when health is production-ready and record plus mode proofs read back with matching hashes", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer seal-token" });
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/verify?cid=bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url === "https://seal.example/proof/bafy-record") return jsonResponse(proofFor("bafy-record"));
      if (url === "https://seal.example/verify?cid=bafy-mode") return jsonResponse(proofFor("bafy-mode"));
      if (url === "https://seal.example/proof/bafy-mode") return jsonResponse(proofFor("bafy-mode"));
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(true);
    expect(report.requiredPassed).toBe(report.requiredTotal);
    expect(report.checks.find((check) => check.id === "optional-seal-upload-smoke")?.status).toBe("skipped");
    expect(report.checks.find((check) => check.id === "record-proof-readback")?.detail).toContain("1024 bytes");
    expect(report.checks.find((check) => check.id === "mode-proof-readback")?.detail).toContain("bafy-mode");
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
      if (url.includes("bafy-mode")) return jsonResponse(proofFor("bafy-mode"));
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "seal-api-health")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("FILECOIN_SEAL_MOCK is enabled"),
    });
  });

  it("fails proof read-back when registry hash does not match the expected upload payload hash", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url.includes("bafy-record")) return jsonResponse({ ...proofFor("bafy-record"), payloadHash: "c".repeat(64) });
      if (url.includes("bafy-mode")) return jsonResponse(proofFor("bafy-mode"));
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildFilecoinProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "record-proof-readback")?.detail).toContain("payload hash mismatch");
  });

  it("optionally exercises POST /seal with a local locked payload file", async () => {
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
      if (url.includes("bafy-mode")) return jsonResponse(proofFor("bafy-mode"));
      if (url === "https://seal.example/seal") {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ Authorization: "Bearer seal-token" });
        expect(init?.body).toBe(payload);
        return jsonResponse({ cid: "bafy-smoke", payloadHash: uploadHash, proofStatus: "verified" });
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
      sampleIds: ["bafy-smoke"],
    });
  });
});

