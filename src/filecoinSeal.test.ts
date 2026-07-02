import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { lookupFilecoinProof, runSealJob, sealApiHeaders, sealApiUrl } from "./filecoinSeal";
import type { MemoryRecord } from "./types";

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
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://seal.example/health",
      "POST https://seal.example/seal",
      "GET https://seal.example/verify?cid=bafy-real-1234567890",
    ]);
    expect(calls[1].body).toContain(record.capsule.payloadHash);
    expect(updated.capsule.filecoinProof.mode).toBe("real");
    expect(updated.capsule.filecoinProof.proofStatus).toBe("verified");
    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.healthStatus).toBe("ready");
    expect(updated.sealJob?.backendHealth?.mockMode).toBe(false);
    expect(updated.sealJob?.backendHealth?.hasPrivateKey).toBe(true);
    expect(updated.sealJob?.backendHealth?.authRequired).toBe(true);
    expect(updated.sealJob?.backendHealth?.persistence).toBe("file");
    expect(updated.sealJob?.backendHealth?.maxUploadBytes).toBe(262144);
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("real Synapse");
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("file proof registry");
    expect(updated.sealJob?.pollAttempts).toBe(1);
    expect(updated.sealJob?.uploadPayloadHash).toBe(updated.sealJob?.proof?.payloadHash);
    expect(updated.sealJob?.proof?.byteLength).toBeGreaterThan(0);
    expect(updated.sealJob?.steps.find((step) => step.id === "deal")?.status).toBe("passed");
    expect(updated.sealJob?.lastCheckedAt).toBe("2099-01-01T00:00:00.000Z");
    expect(updated.sealJob?.proofUrl).toBe("https://seal.example/proof/bafy-real-1234567890");
    expect(updated.sealJob?.verifyUrl).toBe("https://seal.example/verify?cid=bafy-real-1234567890");
    expect(updated.sealJob?.steps.every((step) => step.status === "passed")).toBe(true);
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
