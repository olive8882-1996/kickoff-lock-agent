import { describe, expect, it } from "vitest";
import {
  filecoinSealProofUrlProblem,
  filecoinSealPollEvidenceProblems,
  filecoinSealStatusUrlProblem,
  filecoinSealVerifyUrlProblem,
  hasUploadStatusProgression,
  hasVerificationPollProgression,
} from "./filecoinSealJobChecks";
import type { SealJob } from "./types";

const baseJob = (patch: Partial<SealJob> = {}): SealJob => ({
  id: "seal-job",
  capsuleId: "cap-1",
  status: "verified",
  startedAt: "2099-01-01T00:00:00.000Z",
  updatedAt: "2099-01-01T00:02:00.000Z",
  endpoint: "https://seal.example/seal",
  healthStatus: "ready",
  backendJobId: "seal-backend-job",
  uploadStatusUrl: "https://seal.example/jobs/seal-backend-job",
  proofUrl: "https://seal.example/proof/bafy-real",
  verifyUrl: "https://seal.example/verify?cid=bafy-real",
  uploadPayloadHash: "a".repeat(64),
  uploadByteLength: 2048,
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
  uploadStatusPolls: 2,
  uploadStatusLog: [
    {
      attempt: 1,
      checkedAt: "2099-01-01T00:00:30.000Z",
      status: "running",
      detail: "Seal job is running.",
      jobId: "seal-backend-job",
    },
    {
      attempt: 2,
      checkedAt: "2099-01-01T00:01:00.000Z",
      status: "verified",
      detail: "Seal job returned CID bafy-real.",
      jobId: "seal-backend-job",
      cid: "bafy-real",
      payloadHash: "a".repeat(64),
      byteLength: 2048,
    },
  ],
  pollAttempts: 2,
  pollLog: [
    {
      attempt: 1,
      checkedAt: "2099-01-01T00:01:30.000Z",
      status: "pending",
      proofStatus: "sealed",
      detail: "CID is not fully verified yet.",
      cid: "bafy-real",
    },
    {
      attempt: 2,
      checkedAt: "2099-01-01T00:02:00.000Z",
      status: "verified",
      proofStatus: "verified",
      detail: "CID verified.",
      cid: "bafy-real",
      payloadHash: "a".repeat(64),
      byteLength: 2048,
    },
  ],
  steps: [],
  ...patch,
});

describe("Filecoin seal job checks", () => {
  it("accepts production polling evidence only when upload and verification logs show progress", () => {
    const job = baseJob();

    expect(hasUploadStatusProgression(job)).toBe(true);
    expect(hasVerificationPollProgression(job)).toBe(true);
    expect(filecoinSealPollEvidenceProblems(job)).toEqual([]);
  });

  it("rejects final-only status snapshots even when the final CID and payload hash match", () => {
    const job = baseJob({
      uploadStatusPolls: 1,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2099-01-01T00:01:00.000Z",
          status: "verified",
          detail: "Seal job returned CID bafy-real.",
          jobId: "seal-backend-job",
          cid: "bafy-real",
          payloadHash: "a".repeat(64),
          byteLength: 2048,
        },
      ],
      pollAttempts: 1,
      pollLog: [
        {
          attempt: 1,
          checkedAt: "2099-01-01T00:02:00.000Z",
          status: "verified",
          proofStatus: "verified",
          detail: "CID verified.",
          cid: "bafy-real",
          payloadHash: "a".repeat(64),
          byteLength: 2048,
        },
      ],
    });

    expect(hasUploadStatusProgression(job)).toBe(false);
    expect(hasVerificationPollProgression(job)).toBe(false);
    expect(filecoinSealPollEvidenceProblems(job)).toEqual([
      "seal upload status log must include queued or running progress before verified",
      "verification polling must include pending or retrievable progress before verified",
    ]);
  });

  it("rejects stale CID, payload hash and byte length evidence inside poll logs", () => {
    const job = baseJob({
      pollLog: [
        {
          attempt: 1,
          checkedAt: "2099-01-01T00:01:30.000Z",
          status: "retrievable",
          proofStatus: "retrievable",
          detail: "Stale CID is retrievable.",
          cid: "bafy-old",
          payloadHash: "b".repeat(64),
          byteLength: 1024,
        },
        {
          attempt: 2,
          checkedAt: "2099-01-01T00:02:00.000Z",
          status: "verified",
          proofStatus: "verified",
          detail: "CID verified.",
          cid: "bafy-real",
          payloadHash: "a".repeat(64),
          byteLength: 2048,
        },
      ],
    });

    expect(filecoinSealPollEvidenceProblems(job)).toEqual([
      "verification poll log contains a stale CID",
      "verification poll log contains a stale payload hash",
      "verification poll log contains a stale byte length",
    ]);
  });

  it("rejects final verified verification polls that omit CID, payload hash or byte length", () => {
    const job = baseJob({
      pollLog: [
        {
          attempt: 1,
          checkedAt: "2099-01-01T00:01:30.000Z",
          status: "pending",
          proofStatus: "sealed",
          detail: "CID is not fully verified yet.",
          cid: "bafy-real",
        },
        {
          attempt: 2,
          checkedAt: "2099-01-01T00:02:00.000Z",
          status: "verified",
          proofStatus: "verified",
          detail: "CID verified without metadata.",
        },
      ],
    });

    expect(hasVerificationPollProgression(job)).toBe(false);
    expect(filecoinSealPollEvidenceProblems(job)).toEqual([
      "latest verification poll CID is missing or does not match attached proof CID",
      "latest verification poll payload hash is missing or does not match uploaded payload hash",
      "latest verification poll byte length is missing or does not match uploaded byte length",
    ]);
  });

  it("rejects upload status URLs that are local, cross-origin or not bound to the backend job", () => {
    const local = baseJob({
      uploadStatusUrl: "http://127.0.0.1:8788/jobs/seal-backend-job",
    });
    const crossOrigin = baseJob({
      uploadStatusUrl: "https://other-seal.example/jobs/seal-backend-job",
    });
    const staleJob = baseJob({
      uploadStatusUrl: "https://seal.example/jobs/old-job",
    });

    expect(filecoinSealStatusUrlProblem(local)).toBe("upload status URL must use deployed HTTPS");
    expect(filecoinSealStatusUrlProblem(crossOrigin)).toBe("upload status URL must use the same seal API origin");
    expect(filecoinSealStatusUrlProblem(staleJob)).toBe("upload status URL must target /jobs/:backendJobId");
    expect(filecoinSealPollEvidenceProblems(staleJob)).toContain("upload status URL must target /jobs/:backendJobId");
  });

  it("requires verified jobs to expose proof and verification read-back URLs for the attached CID", () => {
    const missing = baseJob({ proofUrl: undefined, verifyUrl: undefined });
    const wrongCid = baseJob({
      proofUrl: "https://seal.example/proof/bafy-other",
      verifyUrl: "https://seal.example/verify?cid=bafy-other",
    });
    const crossOrigin = baseJob({
      proofUrl: "https://other-seal.example/proof/bafy-real",
      verifyUrl: "https://other-seal.example/verify?cid=bafy-real",
    });

    expect(filecoinSealProofUrlProblem(missing)).toBe("proof registry URL is missing");
    expect(filecoinSealVerifyUrlProblem(missing)).toBe("verification URL is missing");
    expect(filecoinSealPollEvidenceProblems(missing)).toEqual([
      "proof registry URL is missing",
      "verification URL is missing",
    ]);
    expect(filecoinSealProofUrlProblem(wrongCid)).toBe("proof registry URL must reference the attached CID");
    expect(filecoinSealVerifyUrlProblem(wrongCid)).toBe("verification URL must reference the attached CID");
    expect(filecoinSealProofUrlProblem(crossOrigin)).toBe("proof registry URL must use the same seal API origin");
    expect(filecoinSealVerifyUrlProblem(crossOrigin)).toBe("verification URL must use the same seal API origin");
  });

  it("does not require proof and verify URLs before the proof registry read-back stage", () => {
    const uploadOnly = baseJob({
      status: "running",
      proofRegistryStatus: "unchecked",
      proofUrl: undefined,
      verifyUrl: undefined,
      pollAttempts: 0,
      pollLog: [],
    });

    expect(filecoinSealPollEvidenceProblems(uploadOnly)).toEqual([]);
  });
});
