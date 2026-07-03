import { describe, expect, it } from "vitest";
import { buildSealEvidencePacket } from "./filecoinSealEvidence";
import type { SealJob } from "./types";

const baseJob = (patch: Partial<SealJob> = {}): SealJob => ({
  id: "seal-cap-1",
  capsuleId: "cap-1",
  status: "needs-config",
  startedAt: "2099-01-01T00:00:00.000Z",
  updatedAt: "2099-01-01T00:00:00.000Z",
  healthStatus: "failed",
  steps: [
    { id: "payload", label: "Payload", status: "passed", detail: "payload ready" },
    { id: "health", label: "Health", status: "needs-config", detail: "missing endpoint" },
    { id: "upload", label: "Upload", status: "needs-config", detail: "missing endpoint" },
    { id: "deal", label: "Deal", status: "needs-config", detail: "missing endpoint" },
    { id: "poll", label: "Poll", status: "needs-config", detail: "missing endpoint" },
    { id: "registry", label: "Registry", status: "needs-config", detail: "missing endpoint" },
    { id: "verify", label: "Verify", status: "needs-config", detail: "missing endpoint" },
  ],
  ...patch,
});

describe("Filecoin seal evidence packet", () => {
  it("surfaces missing backend configuration as the first blocker", () => {
    const packet = buildSealEvidencePacket(baseJob());

    expect(packet.productionReady).toBe(false);
    expect(packet.blockers[0]).toBe("missing VITE_FILECOIN_SEAL_API");
    expect(packet.pendingSteps).toEqual(["health", "upload", "deal", "poll", "registry", "verify"]);
    expect(packet.copyText).toContain("CID: missing");
  });

  it("requires non-mock production health and proof registry hash match", () => {
    const packet = buildSealEvidencePacket(
      baseJob({
        status: "verified",
        endpoint: "https://seal.example/seal",
        healthStatus: "ready",
        backendHealth: {
          ok: true,
          mockMode: false,
          hasPrivateKey: true,
          authRequired: true,
          productionReady: true,
          blockers: [],
          persistence: "file",
          proofCount: 4,
          maxUploadBytes: 262144,
        },
        proof: {
          mode: "real",
          cid: "bafy-real",
          pieceCid: "piece-real",
          provider: "synapse",
          dataSetId: "dataset",
          proofStatus: "verified",
          payloadHash: "a".repeat(64),
          byteLength: 2048,
        },
        uploadPayloadHash: "a".repeat(64),
        uploadByteLength: 2048,
        pollAttempts: 2,
        pollLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:00:00.000Z",
            status: "pending",
            proofStatus: "sealed",
            httpStatus: 200,
            detail: "Seal API returned sealed proof status.",
          },
          {
            attempt: 2,
            checkedAt: "2099-01-01T00:00:01.000Z",
            status: "verified",
            proofStatus: "verified",
            httpStatus: 200,
            detail: "Seal API verified the CID.",
          },
        ],
        proofRegistryStatus: "verified",
        proofRegistryHash: "a".repeat(64),
        proofUrl: "https://seal.example/proof/bafy-real",
        verifyUrl: "https://seal.example/verify?cid=bafy-real",
        steps: baseJob().steps.map((step) => ({ ...step, status: "passed" })),
      }),
    );

    expect(packet.productionReady).toBe(true);
    expect(packet.registryHashMatch).toBe(true);
    expect(packet.latestPoll?.status).toBe("verified");
    expect(packet.pollLog).toHaveLength(2);
    expect(packet.blockers).toEqual([]);
    expect(packet.nextAction).toContain("Seal evidence is ready");
    expect(packet.copyText).toContain("Latest poll: verified verified 200");
    expect(packet.copyText).toContain("Production backend: ready");
  });

  it("keeps mock seal API evidence out of production-ready status", () => {
    const packet = buildSealEvidencePacket(
      baseJob({
        status: "verified",
        endpoint: "http://127.0.0.1:8788/seal",
        healthStatus: "ready",
        backendHealth: {
          ok: true,
          mockMode: true,
          hasPrivateKey: false,
          authRequired: false,
          productionReady: false,
          blockers: ["mock mode enabled"],
          persistence: "memory",
          maxUploadBytes: 262144,
        },
        proof: {
          mode: "real",
          cid: "bafy-mock",
          pieceCid: "piece-mock",
          provider: "mock",
          dataSetId: "mock",
          proofStatus: "verified",
          payloadHash: "b".repeat(64),
        },
        uploadPayloadHash: "b".repeat(64),
        proofRegistryStatus: "verified",
        proofRegistryHash: "b".repeat(64),
        steps: baseJob().steps.map((step) => ({ ...step, status: "passed" })),
      }),
    );

    expect(packet.productionReady).toBe(false);
    expect(packet.blockers).toContain("mock mode enabled");
  });
});
