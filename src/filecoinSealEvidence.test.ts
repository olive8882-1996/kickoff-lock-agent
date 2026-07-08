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
    expect(packet.blockers[0]).toBe("VITE_FILECOIN_SEAL_API missing");
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
        backendJobId: "seal-job-ready",
        uploadStatusUrl: "https://seal.example/jobs/seal-job-ready",
        uploadStatusPolls: 2,
        uploadStatusLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:00:00.250Z",
            status: "running",
            httpStatus: 200,
            detail: "Seal job is running.",
            jobId: "seal-job-ready",
          },
          {
            attempt: 2,
            checkedAt: "2099-01-01T00:00:00.500Z",
            status: "verified",
            httpStatus: 200,
            detail: "Seal job returned CID bafy-real.",
            jobId: "seal-job-ready",
            cid: "bafy-real",
            payloadHash: "a".repeat(64),
            byteLength: 2048,
          },
        ],
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
            cid: "bafy-real",
            payloadHash: "a".repeat(64),
            byteLength: 2048,
          },
        ],
        proofRegistryStatus: "verified",
        proofRegistryHash: "a".repeat(64),
        proofRegistryByteLength: 2048,
        proofUrl: "https://seal.example/proof/bafy-real",
        verifyUrl: "https://seal.example/verify?cid=bafy-real",
        steps: baseJob().steps.map((step) => ({ ...step, status: "passed" })),
      }),
    );

    expect(packet.productionReady).toBe(true);
    expect(packet.backendProductionReady).toBe(true);
    expect(packet.uploadStatusComplete).toBe(true);
    expect(packet.verificationPollingComplete).toBe(true);
    expect(packet.registryReadBackComplete).toBe(true);
    expect(packet.backendJobId).toBe("seal-job-ready");
    expect(packet.uploadStatusPolls).toBe(2);
    expect(packet.latestUploadStatus?.status).toBe("verified");
    expect(packet.registryHashMatch).toBe(true);
    expect(packet.registryByteLengthMatch).toBe(true);
    expect(packet.latestPoll?.status).toBe("verified");
    expect(packet.pollLog).toHaveLength(2);
    expect(packet.blockers).toEqual([]);
    expect(packet.nextAction).toContain("Seal evidence is ready");
    expect(packet.copyText).toContain("Latest poll: verified verified 200");
    expect(packet.copyText).toContain("Backend upload job: seal-job-ready");
    expect(packet.copyText).toContain("Registry: verified hash-match bytes-match");
    expect(packet.copyText).toContain("Production backend: ready");
    expect(packet.copyText).toContain("Upload status polling: complete");
    expect(packet.copyText).toContain("Verification polling: complete");
    expect(packet.copyText).toContain("Registry read-back: complete");
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
        uploadByteLength: 1200,
        proofRegistryStatus: "verified",
        proofRegistryHash: "b".repeat(64),
        proofRegistryByteLength: 1200,
        steps: baseJob().steps.map((step) => ({ ...step, status: "passed" })),
      }),
    );

    expect(packet.productionReady).toBe(false);
    expect(packet.blockers).toContain("mock mode enabled");
    expect(packet.blockers).toContain("VITE_FILECOIN_SEAL_API must be a deployed HTTPS /seal endpoint");
  });

  it("does not accept a verified-looking proof from a non-/seal endpoint", () => {
    const packet = buildSealEvidencePacket(
      baseJob({
        status: "verified",
        endpoint: "https://seal.example/status",
        healthStatus: "ready",
        backendHealth: {
          ok: true,
          mockMode: false,
          hasPrivateKey: true,
          authRequired: true,
          productionReady: true,
          blockers: [],
          persistence: "file",
          proofCount: 1,
          maxUploadBytes: 262144,
        },
        proof: {
          mode: "real",
          cid: "bafy-real",
          pieceCid: "piece-real",
          provider: "synapse",
          dataSetId: "dataset",
          proofStatus: "verified",
          payloadHash: "d".repeat(64),
          byteLength: 2048,
        },
        uploadPayloadHash: "d".repeat(64),
        uploadByteLength: 2048,
        backendJobId: "seal-job-wrong-path",
        uploadStatusPolls: 1,
        pollAttempts: 1,
        pollLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:00:01.000Z",
            status: "verified",
            proofStatus: "verified",
            httpStatus: 200,
            detail: "Seal API verified the CID.",
            cid: "bafy-real",
            payloadHash: "d".repeat(64),
            byteLength: 2048,
          },
        ],
        proofRegistryStatus: "verified",
        proofRegistryHash: "d".repeat(64),
        proofRegistryByteLength: 2048,
        steps: baseJob().steps.map((step) => ({ ...step, status: "passed" })),
      }),
    );

    expect(packet.productionReady).toBe(false);
    expect(packet.backendProductionReady).toBe(true);
    expect(packet.blockers[0]).toBe("VITE_FILECOIN_SEAL_API must point to the deployed /seal endpoint");
    expect(packet.nextAction).toBe("VITE_FILECOIN_SEAL_API must point to the deployed /seal endpoint");
  });

  it("does not accept registry evidence without matching byte length", () => {
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
          proofCount: 1,
          maxUploadBytes: 262144,
        },
        proof: {
          mode: "real",
          cid: "bafy-real",
          pieceCid: "piece-real",
          provider: "synapse",
          dataSetId: "dataset",
          proofStatus: "verified",
          payloadHash: "c".repeat(64),
          byteLength: 2048,
        },
        uploadPayloadHash: "c".repeat(64),
        uploadByteLength: 2048,
        backendJobId: "seal-job-byte-mismatch",
        uploadStatusUrl: "https://seal.example/jobs/seal-job-byte-mismatch",
        uploadStatusLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:00:00.250Z",
            status: "running",
            httpStatus: 200,
            detail: "Seal job is running.",
            jobId: "seal-job-byte-mismatch",
          },
          {
            attempt: 2,
            checkedAt: "2099-01-01T00:00:00.500Z",
            status: "verified",
            httpStatus: 200,
            detail: "Seal job returned CID bafy-real.",
            jobId: "seal-job-byte-mismatch",
            cid: "bafy-real",
            payloadHash: "c".repeat(64),
            byteLength: 2048,
          },
        ],
        uploadStatusPolls: 2,
        pollAttempts: 2,
        pollLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:00:00.750Z",
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
            cid: "bafy-real",
            payloadHash: "c".repeat(64),
            byteLength: 2048,
          },
        ],
        proofRegistryStatus: "verified",
        proofRegistryHash: "c".repeat(64),
        proofRegistryByteLength: 1024,
        proofUrl: "https://seal.example/proof/bafy-real",
        verifyUrl: "https://seal.example/verify?cid=bafy-real",
        steps: baseJob().steps.map((step) => ({ ...step, status: "passed" })),
      }),
    );

    expect(packet.registryHashMatch).toBe(true);
    expect(packet.registryByteLengthMatch).toBe(false);
    expect(packet.registryReadBackComplete).toBe(false);
    expect(packet.productionReady).toBe(false);
    expect(packet.backendProductionReady).toBe(true);
    expect(packet.blockers).toContain("proof registry read-back not matched");
    expect(packet.nextAction).toBe("proof registry read-back not matched");
    expect(packet.copyText).toContain("Registry: verified hash-match bytes-pending");
    expect(packet.copyText).toContain("Registry read-back: incomplete");
  });

  it("does not accept final-only upload and verification snapshots as production polling evidence", () => {
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
          proofCount: 1,
          maxUploadBytes: 262144,
        },
        proof: {
          mode: "real",
          cid: "bafy-real",
          pieceCid: "piece-real",
          provider: "synapse",
          dataSetId: "dataset",
          proofStatus: "verified",
          payloadHash: "e".repeat(64),
          byteLength: 2048,
        },
        uploadPayloadHash: "e".repeat(64),
        uploadByteLength: 2048,
        backendJobId: "seal-job-final-only",
        uploadStatusUrl: "https://seal.example/jobs/seal-job-final-only",
        uploadStatusPolls: 1,
        uploadStatusLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:00:00.500Z",
            status: "verified",
            httpStatus: 200,
            detail: "Seal job returned CID bafy-real.",
            jobId: "seal-job-final-only",
            cid: "bafy-real",
            payloadHash: "e".repeat(64),
            byteLength: 2048,
          },
        ],
        pollAttempts: 1,
        pollLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:00:01.000Z",
            status: "verified",
            proofStatus: "verified",
            httpStatus: 200,
            detail: "Seal API verified the CID.",
            cid: "bafy-real",
            payloadHash: "e".repeat(64),
            byteLength: 2048,
          },
        ],
        proofRegistryStatus: "verified",
        proofRegistryHash: "e".repeat(64),
        proofRegistryByteLength: 2048,
        proofUrl: "https://seal.example/proof/bafy-real",
        verifyUrl: "https://seal.example/verify?cid=bafy-real",
        steps: baseJob().steps.map((step) => ({ ...step, status: "passed" })),
      }),
    );

    expect(packet.productionReady).toBe(false);
    expect(packet.uploadStatusComplete).toBe(false);
    expect(packet.verificationPollingComplete).toBe(false);
    expect(packet.blockers).toEqual(expect.arrayContaining([
      "seal upload status log must include queued or running progress before verified",
      "verification polling must include pending or retrievable progress before verified",
    ]));
    expect(packet.copyText).toContain("Upload status polling: incomplete");
    expect(packet.copyText).toContain("Verification polling: incomplete");
  });
});
