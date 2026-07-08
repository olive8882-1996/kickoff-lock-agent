import { describe, expect, it } from "vitest";
import {
  buildFilecoinAutomationEvidencePacket,
  buildFilecoinAutomationSealQueue,
} from "./filecoinAutomationEvidence";
import type { GameModeRun, MemoryRecord, SealJob } from "./types";

const verifiedJob = (id: string, artifactId: string, payloadHash: string, mockMode = false): SealJob => ({
  id,
  capsuleId: artifactId,
  status: "verified",
  startedAt: "2099-07-01T00:00:00.000Z",
  updatedAt: "2099-07-01T00:02:00.000Z",
  endpoint: "https://seal.example/seal",
  healthStatus: "ready",
  backendHealth: {
    ok: true,
    mockMode,
    hasPrivateKey: true,
    authRequired: true,
    productionReady: !mockMode,
    blockers: mockMode ? ["FILECOIN_SEAL_MOCK is enabled"] : [],
    proofCount: 4,
    persistence: "file",
    maxUploadBytes: 262144,
  },
  proof: {
    mode: "real",
    cid: `bafy-${artifactId}`,
    pieceCid: `baga-${artifactId}`,
    provider: "synapse",
    dataSetId: "dataset",
    proofStatus: "verified",
    payloadHash,
    byteLength: 1200,
  },
  proofUrl: `https://seal.example/proof/bafy-${artifactId}`,
  verifyUrl: `https://seal.example/verify?cid=bafy-${artifactId}`,
  backendJobId: `seal-job-${artifactId}`,
  uploadStatusUrl: `https://seal.example/jobs/seal-job-${artifactId}`,
  uploadStatusPolls: 2,
  uploadStatusLog: [
    {
      attempt: 1,
      checkedAt: "2099-07-01T00:00:30.000Z",
      status: "running",
      httpStatus: 200,
      detail: "Seal job running.",
      jobId: `seal-job-${artifactId}`,
    },
    {
      attempt: 2,
      checkedAt: "2099-07-01T00:01:00.000Z",
      status: "verified",
      httpStatus: 200,
      detail: `Seal job returned CID bafy-${artifactId}.`,
      jobId: `seal-job-${artifactId}`,
      cid: `bafy-${artifactId}`,
      payloadHash,
      byteLength: 1200,
    },
  ],
  uploadPayloadHash: payloadHash,
  uploadByteLength: 1200,
  pollAttempts: 2,
  pollLog: [
    {
      attempt: 1,
      checkedAt: "2099-07-01T00:01:00.000Z",
      status: "pending",
      proofStatus: "sealed",
      httpStatus: 200,
      detail: "pending",
    },
    {
      attempt: 2,
      checkedAt: "2099-07-01T00:02:00.000Z",
      status: "verified",
      proofStatus: "verified",
      httpStatus: 200,
      detail: "verified",
      cid: `bafy-${artifactId}`,
      payloadHash,
      byteLength: 1200,
    },
  ],
  lastCheckedAt: "2099-07-01T00:02:00.000Z",
  proofRegistryStatus: "verified",
  proofRegistryCheckedAt: "2099-07-01T00:02:00.000Z",
  proofRegistryHash: payloadHash,
  proofRegistryByteLength: 1200,
  steps: [],
});

const record = (sealJob?: SealJob, id = "cap-filecoin", createdAt = "2099-07-01T10:00:00.000Z"): MemoryRecord => ({
  capsule: {
    id,
    matchId: "match",
    matchLabel: "Spain vs Austria",
    kickoffAt: "2099-07-01T20:00:00.000Z",
    createdAt,
    sealedAt: "2099-07-01T10:01:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: "bafy-demo",
      pieceCid: "piece-demo",
      provider: "demo",
      dataSetId: "demo",
      proofStatus: "retrievable",
    },
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Spain",
      keyPlayers: [],
      confidence: 72,
      style: "analysis",
      reasoning: "test",
      agentSummary: "test",
      markets: [],
    },
  },
  sealJob,
});

const modeRun = (modeId: GameModeRun["modeId"], sealJob?: SealJob): GameModeRun => ({
  id: `mode-${modeId}`,
  modeId,
  title: `${modeId} proof`,
  createdAt: "2099-07-01T10:05:00.000Z",
  capsuleIds: ["cap-filecoin"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: "bafy-mode-demo",
    pieceCid: "piece-mode-demo",
    provider: "demo",
    dataSetId: "demo",
    proofStatus: "retrievable",
  },
  status: "sealed",
  summary: "sealed",
  requirements: [],
  sealJob,
});

describe("Filecoin automation evidence", () => {
  it("marks record and every required mode lane ready when all have verified production seal jobs", () => {
    const packet = buildFilecoinAutomationEvidencePacket([
      record(verifiedJob("seal-record", "cap-filecoin", "a".repeat(64))),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
      modeRun("penalty-pressure", verifiedJob("seal-penalty-pressure", "mode-penalty-pressure", "1".repeat(64))),
    ]);

    expect(packet.ready).toBe(true);
    expect(packet.totalLanes).toBe(7);
    expect(packet.lanesReady).toBe(7);
    expect(packet.productionBackends).toBe(7);
    expect(packet.registryMatches).toBe(7);
    expect(packet.uploadStatusPolls).toBe(14);
    expect(packet.pollAttempts).toBe(14);
    expect(packet.runnableQueue).toBe(0);
    expect(packet.missingArtifacts).toBe(0);
    expect(packet.copyText).toContain("Kickoff Lock Agent Filecoin automation evidence");
    expect(packet.nextAction).toContain("production verified");
  });

  it("keeps the packet pending when only mock backend evidence exists", () => {
    const packet = buildFilecoinAutomationEvidencePacket([
      record(verifiedJob("seal-record", "cap-filecoin", "a".repeat(64), true)),
    ], [
      modeRun("bracket", verifiedJob("seal-mode", "mode-bracket", "b".repeat(64), true)),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.lanesReady).toBe(0);
    expect(packet.productionBackends).toBe(0);
    expect(packet.lanes[0].blockers).toContain("FILECOIN_SEAL_MOCK is enabled");
    expect(packet.lanes).toHaveLength(7);
    expect(packet.checks.find((check) => check.key === "mode")?.detail).toBe("0/6 required mode lanes verified");
  });

  it("keeps the packet pending when any required mode lane is missing", () => {
    const packet = buildFilecoinAutomationEvidencePacket([
      record(verifiedJob("seal-record", "cap-filecoin", "a".repeat(64))),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.lanesReady).toBe(4);
    expect(packet.runnableQueue).toBe(0);
    expect(packet.missingArtifacts).toBe(3);
    expect(packet.checks.find((check) => check.key === "mode")).toMatchObject({
      passed: false,
      detail: "3/6 required mode lanes verified",
    });
    expect(packet.nextAction).toContain("mode upset");
  });

  it("reports missing lanes before one-click sealing has run", () => {
    const packet = buildFilecoinAutomationEvidencePacket([record()], []);

    expect(packet.ready).toBe(false);
    expect(packet.lanes).toHaveLength(7);
    expect(packet.lanes[0].status).toBe("missing");
    expect(packet.lanes[1].summary).toContain("has not run");
    expect(packet.runnableQueue).toBe(1);
    expect(packet.missingArtifacts).toBe(6);
    expect(packet.checks.find((check) => check.key === "batch-queue")?.detail).toContain("1 runnable lane");
    expect(packet.nextAction).toContain("Run batch Filecoin seal");
  });

  it("builds a runnable batch queue for unverified record and mode lanes", () => {
    const queue = buildFilecoinAutomationSealQueue([record()], [
      modeRun("bracket"),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human"),
    ]);

    expect(queue.filter((item) => item.runnable).map((item) => `${item.kind}:${item.modeId ?? item.artifactId}`)).toEqual([
      "record:cap-filecoin",
      "mode:bracket",
      "mode:agent-vs-human",
    ]);
    expect(queue.find((item) => item.modeId === "upset")).toMatchObject({
      runnable: false,
      reason: "create a upset mode proof before sealing",
    });
  });

  it("queues every locked prediction capsule that still needs a real production seal", () => {
    const queue = buildFilecoinAutomationSealQueue([
      record(undefined, "cap-newer", "2099-07-01T11:00:00.000Z"),
      record(verifiedJob("seal-old", "cap-old", "a".repeat(64)), "cap-old", "2099-07-01T09:00:00.000Z"),
      record(verifiedJob("seal-mock", "cap-mock", "f".repeat(64), true), "cap-mock", "2099-07-01T10:30:00.000Z"),
    ], []);

    expect(queue.filter((item) => item.kind === "record").map((item) => item.artifactId)).toEqual([
      "cap-mock",
      "cap-newer",
    ]);
    expect(queue.find((item) => item.artifactId === "cap-old")).toBeUndefined();
    expect(queue.filter((item) => item.kind === "record").every((item) => item.runnable)).toBe(true);
  });

  it("treats registry byte-length mismatches as unverified Filecoin automation", () => {
    const mismatched = {
      ...verifiedJob("seal-byte-mismatch", "cap-filecoin", "a".repeat(64)),
      proofRegistryByteLength: 1199,
    };
    const packet = buildFilecoinAutomationEvidencePacket([
      record(mismatched),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.registryMatches).toBe(5);
    expect(packet.lanes[0]).toMatchObject({
      status: "partial",
      registryHashMatch: true,
      registryByteLengthMatch: false,
    });
    expect(packet.lanes[0].blockers).toContain("proof registry read-back missing");
    expect(packet.checks.find((check) => check.key === "registry")?.detail).toContain("payload hashes and byte lengths");
    expect(packet.queue.find((item) => item.kind === "record" && item.artifactId === "cap-filecoin")).toMatchObject({
      runnable: true,
      reason: "retry verified prediction seal lane",
    });
  });

  it("does not treat a real CID without async upload status polling as complete automation", () => {
    const manualProofOnly = {
      ...verifiedJob("seal-manual", "cap-filecoin", "a".repeat(64)),
      backendJobId: undefined,
      uploadStatusUrl: undefined,
      uploadStatusPolls: undefined,
      uploadStatusLog: undefined,
    };
    const packet = buildFilecoinAutomationEvidencePacket([
      record(manualProofOnly),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.uploadStatusPolls).toBe(10);
    expect(packet.lanes[0]).toMatchObject({
      status: "partial",
      uploadStatusPolls: 0,
    });
    expect(packet.lanes[0].blockers).toContain("upload job status polling missing");
    expect(packet.checks.find((check) => check.key === "upload-status")).toMatchObject({
      passed: false,
      detail: "5/7 lanes progressed to verified upload status · 10 polls",
    });
  });

  it("requires final upload and verification poll states to be verified", () => {
    const runningUpload = {
      ...verifiedJob("seal-running-upload", "cap-filecoin", "a".repeat(64)),
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2099-07-01T00:00:30.000Z",
          status: "running" as const,
          httpStatus: 200,
          detail: "Seal job still running.",
          jobId: "seal-job-cap-filecoin",
        },
      ],
    };
    const pendingVerify = {
      ...verifiedJob("seal-pending-verify", "mode-bracket", "b".repeat(64)),
      pollLog: [
        {
          attempt: 1,
          checkedAt: "2099-07-01T00:01:00.000Z",
          status: "pending" as const,
          proofStatus: "sealed" as const,
          httpStatus: 200,
          detail: "Seal API returned sealed proof status.",
        },
      ],
    };
    const packet = buildFilecoinAutomationEvidencePacket([
      record(runningUpload),
    ], [
      modeRun("bracket", pendingVerify),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.lanes[0].blockers).toContain("upload job did not finish with matching CID");
    expect(packet.lanes.find((lane) => lane.modeId === "bracket")?.blockers).toContain(
      "verification polling did not reach verified",
    );
    expect(packet.checks.find((check) => check.key === "upload-status")).toMatchObject({
      passed: false,
      detail: "5/7 lanes progressed to verified upload status · 12 polls",
    });
    expect(packet.checks.find((check) => check.key === "polling")).toMatchObject({
      passed: false,
      detail: "5/7 lanes progressed to verified status · 12 total poll attempts",
    });
  });

  it("requires upload and verification poll logs to show progression before counting automation complete", () => {
    const finalOnly = {
      ...verifiedJob("seal-final-only", "cap-filecoin", "a".repeat(64)),
      uploadStatusPolls: 1,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2099-07-01T00:01:00.000Z",
          status: "verified" as const,
          httpStatus: 200,
          detail: "Seal job returned CID bafy-cap-filecoin.",
          jobId: "seal-job-cap-filecoin",
          cid: "bafy-cap-filecoin",
          payloadHash: "a".repeat(64),
          byteLength: 1200,
        },
      ],
      pollAttempts: 1,
      pollLog: [
        {
          attempt: 1,
          checkedAt: "2099-07-01T00:02:00.000Z",
          status: "verified" as const,
          proofStatus: "verified" as const,
          httpStatus: 200,
          detail: "verified",
          cid: "bafy-cap-filecoin",
          payloadHash: "a".repeat(64),
          byteLength: 1200,
        },
      ],
    };
    const packet = buildFilecoinAutomationEvidencePacket([
      record(finalOnly),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.lanes[0]).toMatchObject({
      status: "partial",
      uploadStatusVerified: true,
      uploadStatusProgression: false,
      verificationPollVerified: true,
      verificationPollProgression: false,
    });
    expect(packet.lanes[0].blockers).toEqual(
      expect.arrayContaining([
        "upload job status did not progress from running to verified",
        "verification polling did not progress to verified",
      ]),
    );
    expect(packet.checks.find((check) => check.key === "upload-status")?.detail).toBe(
      "5/7 lanes progressed to verified upload status · 11 polls",
    );
    expect(packet.checks.find((check) => check.key === "polling")?.detail).toBe(
      "5/7 lanes progressed to verified status · 11 total poll attempts",
    );
  });

  it("does not count verified-looking lanes from local or non-/seal endpoints", () => {
    const localEndpointJob = {
      ...verifiedJob("seal-local", "cap-filecoin", "a".repeat(64)),
      endpoint: "http://127.0.0.1:8787/seal",
    };
    const wrongPathJob = {
      ...verifiedJob("seal-wrong-path", "mode-bracket", "b".repeat(64)),
      endpoint: "https://seal.example/status",
    };
    const packet = buildFilecoinAutomationEvidencePacket([
      record(localEndpointJob),
    ], [
      modeRun("bracket", wrongPathJob),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.lanesReady).toBe(4);
    expect(packet.lanes[0].blockers).toContain("VITE_FILECOIN_SEAL_API must be a deployed HTTPS /seal endpoint");
    expect(packet.lanes.find((lane) => lane.modeId === "bracket")?.blockers).toContain(
      "VITE_FILECOIN_SEAL_API must point to the deployed /seal endpoint",
    );
  });
});
