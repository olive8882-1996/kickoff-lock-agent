import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { lookupFilecoinProof, runSealJob, sealApiHeaders, sealApiUrl } from "./filecoinSeal";
import type { GameModeRun, MemoryRecord } from "./types";

const record: MemoryRecord = {
  capsule: {
    id: "cap-seal",
    matchId: "m1",
    matchLabel: "A vs B",
    kickoffAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2098-12-31T00:00:00.000Z",
    sealedAt: "2098-12-31T00:00:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: "bafy",
      pieceCid: "piece",
      provider: "demo",
      dataSetId: "set",
      proofStatus: "retrievable",
    },
    prediction: {
      homeScore: 1,
      awayScore: 0,
      winner: "A",
      keyPlayers: [],
      confidence: 55,
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
      markets: [],
    },
  },
};

const modeRun: GameModeRun = {
  id: "mode-parlay-seal",
  modeId: "parlay",
  title: "Multi-match parlay",
  createdAt: "2099-01-01T00:00:00.000Z",
  capsuleIds: ["cap-one", "cap-two", "cap-three"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: "bafy-mode-demo",
    pieceCid: "piece-mode-demo",
    provider: "demo",
    dataSetId: "mode-set",
    proofStatus: "retrievable",
  },
  status: "sealed",
  summary: "Mode proof sealed.",
  requirements: ["3 sealed match capsules"],
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

describe("Filecoin seal workflow", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("marks workflow as needing configuration when no seal API exists", async () => {
    const updated = await runSealJob(record);
    expect(updated.sealJob?.status).toBe("needs-config");
    expect(updated.sealJob?.steps.some((step) => step.status === "needs-config")).toBe(true);
  });

  it("builds proof and verify URLs from a seal endpoint", () => {
    expect(sealApiUrl("health", undefined, "https://seal.example/seal")).toBe("https://seal.example/health");
    expect(sealApiUrl("verify", "bafy123", "https://seal.example/seal")).toBe(
      "https://seal.example/verify?cid=bafy123",
    );
    expect(sealApiUrl("proof", "bafy123", "https://seal.example/seal")).toBe(
      "https://seal.example/proof/bafy123",
    );
  });

  it("adds a bearer token to configured seal API upload headers", () => {
    expect(sealApiHeaders({ "Content-Type": "application/json" }, "secret-token")).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer secret-token",
    });
    expect(sealApiHeaders({ "Content-Type": "application/json" }, undefined)).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("reports needs-config for CID lookup without a seal API", async () => {
    const result = await lookupFilecoinProof("bafy123");
    expect(result.status).toBe("needs-config");
    expect(result.message).toContain("VITE_FILECOIN_SEAL_API");
  });

  it("reports missing when the seal API has no registered proof for the CID", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, proofStatus: "draft" }, 404)),
    );
    const { lookupFilecoinProof: lookupConfiguredProof } = await import("./filecoinSeal");

    const result = await lookupConfiguredProof("bafy-unknown");

    expect(result.status).toBe("missing");
    expect(result.message).toContain("No proof metadata");
  });

  it("runs configured one-click sealing through health, upload and verification polling", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? "GET", body: init?.body?.toString() });
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            proofCount: 4,
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            cid: "bafy-real-1234567890",
            pieceCid: "baga-real-1234567890",
            provider: "synapse-provider",
            dataSetId: "dataset-1",
            proofStatus: "retrievable",
            retrievalUrl: "https://cid.ipfs.tech/#bafy-real-1234567890",
            payloadHash,
            byteLength: init?.body?.toString().length,
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-real-1234567890") {
          return jsonResponse({
            cid: "bafy-real-1234567890",
            pieceCid: "baga-real-1234567890",
            provider: "synapse-provider",
            dataSetId: "dataset-1",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:00.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-real-1234567890") {
          const payloadHash = sha256Hex(calls.find((call) => call.method === "POST")?.body ?? "");
          return jsonResponse({
            cid: "bafy-real-1234567890",
            pieceCid: "baga-real-1234567890",
            provider: "synapse-provider",
            dataSetId: "dataset-1",
            proofStatus: "verified",
            retrievalUrl: "https://cid.ipfs.tech/#bafy-real-1234567890",
            payloadHash,
            byteLength: calls.find((call) => call.method === "POST")?.body?.length,
            checkedAt: "2099-01-01T00:01:00.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://seal.example/health",
      "POST https://seal.example/seal",
      "GET https://seal.example/verify?cid=bafy-real-1234567890",
      "GET https://seal.example/proof/bafy-real-1234567890",
    ]);
    expect(calls[1].body).toContain(record.capsule.payloadHash);
    expect(updated.capsule.filecoinProof.mode).toBe("real");
    expect(updated.capsule.filecoinProof.proofStatus).toBe("verified");
    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.healthStatus).toBe("ready");
    expect(updated.sealJob?.backendHealth?.mockMode).toBe(false);
    expect(updated.sealJob?.backendHealth?.hasPrivateKey).toBe(true);
    expect(updated.sealJob?.backendHealth?.authRequired).toBe(true);
    expect(updated.sealJob?.backendHealth?.productionReady).toBe(true);
    expect(updated.sealJob?.backendHealth?.persistence).toBe("file");
    expect(updated.sealJob?.backendHealth?.maxUploadBytes).toBe(262144);
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("real Synapse");
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("production-ready");
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("file proof registry");
    expect(updated.sealJob?.pollAttempts).toBe(1);
    expect(updated.sealJob?.pollLog).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "verified",
        proofStatus: "verified",
        httpStatus: 200,
      }),
    ]);
    expect(updated.sealJob?.uploadPayloadHash).toBe(updated.sealJob?.proof?.payloadHash);
    expect(updated.sealJob?.proofRegistryStatus).toBe("verified");
    expect(updated.sealJob?.proofRegistryHash).toBe(updated.sealJob?.uploadPayloadHash);
    expect(updated.sealJob?.proofRegistryCheckedAt).toBe("2099-01-01T00:01:00.000Z");
    expect(updated.sealJob?.proof?.byteLength).toBeGreaterThan(0);
    expect(updated.sealJob?.steps.find((step) => step.id === "deal")?.status).toBe("passed");
    expect(updated.sealJob?.steps.find((step) => step.id === "registry")?.status).toBe("passed");
    expect(updated.sealJob?.lastCheckedAt).toBe("2099-01-01T00:00:00.000Z");
    expect(updated.sealJob?.proofUrl).toBe("https://seal.example/proof/bafy-real-1234567890");
    expect(updated.sealJob?.verifyUrl).toBe("https://seal.example/verify?cid=bafy-real-1234567890");
    expect(updated.sealJob?.steps.every((step) => step.status === "passed")).toBe(true);
  });

  it("keeps an auditable polling log when verification is pending before becoming verified", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    let verifyAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            proofCount: 8,
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal") {
          return jsonResponse({
            cid: "bafy-polling-real",
            pieceCid: "baga-polling-real",
            provider: "synapse-provider",
            dataSetId: "dataset-polling",
            proofStatus: "sealed",
            payloadHash: sha256Hex(init?.body?.toString() ?? ""),
            byteLength: init?.body?.toString().length,
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-polling-real") {
          verifyAttempts += 1;
          return verifyAttempts === 1
            ? jsonResponse({
                cid: "bafy-polling-real",
                proofStatus: "sealed",
                checkedAt: "2099-01-01T00:00:00.000Z",
              })
            : jsonResponse({
                cid: "bafy-polling-real",
                proofStatus: "verified",
                checkedAt: "2099-01-01T00:00:01.000Z",
              });
        }
        if (url === "https://seal.example/proof/bafy-polling-real") {
          const payloadHash = sha256Hex((globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]) === "https://seal.example/seal")?.[1]?.body?.toString() ?? "");
          return jsonResponse({
            cid: "bafy-polling-real",
            pieceCid: "baga-polling-real",
            provider: "synapse-provider",
            dataSetId: "dataset-polling",
            proofStatus: "verified",
            payloadHash,
            checkedAt: "2099-01-01T00:00:02.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.pollAttempts).toBe(2);
    expect(updated.sealJob?.pollLog).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "pending",
        proofStatus: "sealed",
        httpStatus: 200,
      }),
      expect.objectContaining({
        attempt: 2,
        status: "verified",
        proofStatus: "verified",
        httpStatus: 200,
      }),
    ]);
    expect(updated.sealJob?.lastCheckedAt).toBe("2099-01-01T00:00:01.000Z");
  });

  it("runs configured one-click sealing for a tournament mode proof", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? "GET", body: init?.body?.toString() });
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            proofCount: 4,
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            cid: "bafy-mode-real-1234567890",
            pieceCid: "baga-mode-real-1234567890",
            provider: "synapse-provider",
            dataSetId: "dataset-mode",
            proofStatus: "retrievable",
            retrievalUrl: "https://cid.ipfs.tech/#bafy-mode-real-1234567890",
            payloadHash,
            byteLength: init?.body?.toString().length,
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-mode-real-1234567890") {
          return jsonResponse({
            cid: "bafy-mode-real-1234567890",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:00.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-mode-real-1234567890") {
          const payloadHash = sha256Hex(calls.find((call) => call.method === "POST")?.body ?? "");
          return jsonResponse({
            cid: "bafy-mode-real-1234567890",
            pieceCid: "baga-mode-real-1234567890",
            provider: "synapse-provider",
            dataSetId: "dataset-mode",
            proofStatus: "verified",
            payloadHash,
            byteLength: calls.find((call) => call.method === "POST")?.body?.length,
            checkedAt: "2099-01-01T00:01:00.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runModeSealJob } = await import("./filecoinSeal");

    const updated = await runModeSealJob(modeRun);

    expect(calls[1].body).toContain('"modeRun"');
    expect(calls[1].body).toContain(modeRun.payloadHash);
    expect(calls[1].body).not.toContain('"sealJob"');
    expect(updated.filecoinProof.mode).toBe("real");
    expect(updated.filecoinProof.cid).toBe("bafy-mode-real-1234567890");
    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.pollLog?.[0]).toEqual(expect.objectContaining({ status: "verified" }));
    expect(updated.sealJob?.proofRegistryStatus).toBe("verified");
    expect(updated.sealJob?.proofRegistryHash).toBe(updated.sealJob?.uploadPayloadHash);
    expect(updated.sealJob?.steps.find((step) => step.id === "verify")?.detail).toContain("Mode proof CID");
  });

  it("records seal API production blockers when health is only demo-safe", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            mockMode: true,
            hasPrivateKey: false,
            authRequired: false,
            productionReady: false,
            blockers: [
              "FILECOIN_SEAL_MOCK is enabled",
              "SYNAPSE_PRIVATE_KEY is missing",
              "FILECOIN_SEAL_TOKEN is missing",
              "FILECOIN_PROOF_STORE_PATH is missing",
            ],
            persistence: "memory",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            cid: "bafy-demo-ready",
            pieceCid: "baga-demo-ready",
            provider: "mock-synapse-provider",
            dataSetId: "mock-dataset",
            proofStatus: "verified",
            payloadHash,
            byteLength: init?.body?.toString().length,
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-demo-ready") {
          return jsonResponse({ cid: "bafy-demo-ready", proofStatus: "verified" });
        }
        if (url === "https://seal.example/proof/bafy-demo-ready") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            cid: "bafy-demo-ready",
            proofStatus: "verified",
            payloadHash: sha256Hex((globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]) === "https://seal.example/seal")?.[1]?.body?.toString() ?? ""),
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob, sealBackendProductionReady: isProductionReady } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.sealJob?.status).toBe("verified");
    expect(isProductionReady(updated.sealJob?.backendHealth)).toBe(false);
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("production blockers");
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("FILECOIN_SEAL_MOCK");
  });

  it("fails sealing when the proof registry read-back does not match the uploaded payload", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({ ok: true, mockMode: false, hasPrivateKey: true, persistence: "file", authRequired: true });
        }
        if (url === "https://seal.example/seal") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            cid: "bafy-registry-mismatch",
            pieceCid: "baga-registry-mismatch",
            provider: "synapse-provider",
            dataSetId: "dataset-1",
            proofStatus: "retrievable",
            payloadHash,
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-registry-mismatch") {
          return jsonResponse({
            cid: "bafy-registry-mismatch",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:00.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-registry-mismatch") {
          return jsonResponse({
            cid: "bafy-registry-mismatch",
            proofStatus: "verified",
            payloadHash: "0".repeat(64),
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.proofRegistryStatus).toBe("failed");
    expect(updated.sealJob?.steps.find((step) => step.id === "registry")?.status).toBe("failed");
    expect(updated.sealJob?.error).toContain("Proof registry payload hash");
  });

  it("fails sealing when the seal API returns proof metadata for a different payload", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({ ok: true, mockMode: true, persistence: "memory", authRequired: false });
        }
        if (url === "https://seal.example/seal") {
          return jsonResponse({
            cid: "bafy-wrong-payload",
            pieceCid: "baga-wrong-payload",
            provider: "seal-api-provider",
            dataSetId: "dataset",
            proofStatus: "verified",
            payloadHash: "0".repeat(64),
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.error).toContain("payload hash");
    expect(updated.sealJob?.steps.find((step) => step.id === "deal")?.status).toBe("failed");
  });

  it("stores a failed seal job when the configured backend health check fails", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse({ ok: false }, 503);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(calls).toEqual(["https://seal.example/health"]);
    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.healthStatus).toBe("failed");
    expect(updated.sealJob?.error).toContain("503");
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.status).toBe("failed");
  });
});
