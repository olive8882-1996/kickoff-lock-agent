import { describe, expect, it } from "vitest";
import { buildFilecoinSealLifecyclePacket } from "./filecoinSealLifecycleEvidence";
import type { GameModeRun, MemoryRecord, SealJob } from "./types";

const verifiedJob = (id: string, artifactId: string, payloadHash: string): SealJob => ({
  id,
  capsuleId: artifactId,
  status: "verified",
  startedAt: "2099-07-01T00:00:00.000Z",
  updatedAt: "2099-07-01T00:02:00.000Z",
  endpoint: "https://seal.example/seal",
  healthStatus: "ready",
  backendHealth: {
    ok: true,
    mockMode: false,
    hasPrivateKey: true,
    authRequired: true,
    productionReady: true,
    blockers: [],
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

const record = (sealJob?: SealJob): MemoryRecord => ({
  capsule: {
    id: "cap-filecoin",
    matchId: "match",
    matchLabel: "Spain vs Austria",
    kickoffAt: "2099-07-01T20:00:00.000Z",
    createdAt: "2099-07-01T10:00:00.000Z",
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

describe("Filecoin seal lifecycle evidence", () => {
  it("passes only when prediction and required mode lanes complete the full lifecycle", () => {
    const packet = buildFilecoinSealLifecyclePacket([
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
    expect(packet.completeArtifacts).toBe(7);
    expect(packet.productionBackends).toBe(7);
    expect(packet.registryProofs).toBe(7);
    expect(packet.uploadStatusPolls).toBe(14);
    expect(packet.verificationPolls).toBe(14);
    expect(packet.readBackReady).toBe(21);
    expect(packet.readBackDossierReady).toBe(7);
    expect(packet.readBackCommands).toHaveLength(21);
    expect(packet.readBackDossiers).toHaveLength(7);
    expect(packet.readBackDossiers[0]).toMatchObject({
      label: "Prediction proof dossier",
      ready: true,
      passedSteps: 3,
      totalSteps: 3,
      steps: [
        expect.objectContaining({
          route: "upload-status",
          passed: true,
          commandReady: true,
          requiredFields: ["ok", "jobId", "status", "payloadHash", "byteLength"],
        }),
        expect.objectContaining({
          route: "verify",
          passed: true,
          commandReady: true,
          requiredFields: ["ok", "cid", "payloadHash", "byteLength", "proofStatus"],
        }),
        expect.objectContaining({
          route: "proof",
          passed: true,
          commandReady: true,
          requiredFields: ["ok", "cid", "payloadHash", "byteLength", "storedAt"],
        }),
      ],
    });
    expect(packet.readBackCommands.slice(0, 3)).toEqual([
      expect.objectContaining({
        route: "upload-status",
        authMode: "bearer-env",
        command: `curl -sS 'https://seal.example/jobs/seal-job-cap-filecoin' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
        responseExpectation: expect.objectContaining({
          expectedJobId: "seal-job-cap-filecoin",
          expectedPayloadHash: "a".repeat(64),
        }),
      }),
      expect.objectContaining({
        route: "verify",
        command: `curl -sS 'https://seal.example/verify?cid=bafy-cap-filecoin' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
        responseExpectation: expect.objectContaining({
          expectedCid: "bafy-cap-filecoin",
        }),
      }),
      expect.objectContaining({
        route: "proof",
        command: `curl -sS 'https://seal.example/proof/bafy-cap-filecoin' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
      }),
    ]);
    expect(packet.artifacts[0].readBackCommands).toHaveLength(3);
    expect(packet.copyText).toContain("CID read-back commands:");
    expect(packet.copyText).toContain("Judge read-back dossiers: 7/7");
    expect(packet.copyText).toContain("Prediction proof dossier: ready (3/3)");
    expect(packet.resumeQueueReady).toBe(0);
    expect(packet.resumeQueue).toHaveLength(0);
    expect(packet.copyText).toContain("Kickoff Lock Agent Filecoin lifecycle evidence");
    expect(packet.nextAction).toContain("complete across prediction");
  });

  it("keeps same-origin proxy CID read-back commands secretless", () => {
    const proxyJob = {
      ...verifiedJob("seal-proxy", "cap-filecoin", "a".repeat(64)),
      endpoint: "https://kickoff-lock-agent.pages.dev/seal",
      proofUrl: "https://kickoff-lock-agent.pages.dev/proof/bafy-cap-filecoin",
      verifyUrl: "https://kickoff-lock-agent.pages.dev/verify?cid=bafy-cap-filecoin",
      uploadStatusUrl: "https://kickoff-lock-agent.pages.dev/jobs/seal-job-cap-filecoin",
      backendHealth: {
        ...verifiedJob("seal-proxy", "cap-filecoin", "a".repeat(64)).backendHealth!,
        service: "kickoff-lock-filecoin-seal-proxy",
        authRequired: true,
      },
    };
    const packet = buildFilecoinSealLifecyclePacket([
      record(proxyJob),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
      modeRun("penalty-pressure", verifiedJob("seal-penalty-pressure", "mode-penalty-pressure", "1".repeat(64))),
    ]);

    const commands = packet.artifacts[0].readBackCommands.map((command) => command.command).join("\n");

    expect(packet.artifacts[0].readBackCommands.every((command) => command.authMode === "same-origin-proxy")).toBe(true);
    expect(commands).toContain("curl -sS 'https://kickoff-lock-agent.pages.dev/jobs/seal-job-cap-filecoin'");
    expect(commands).toContain("curl -sS 'https://kickoff-lock-agent.pages.dev/verify?cid=bafy-cap-filecoin'");
    expect(commands).not.toContain("Authorization");
  });

  it("does not accept a real CID when async upload status polling is missing", () => {
    const manualProofOnly = {
      ...verifiedJob("seal-manual", "cap-filecoin", "a".repeat(64)),
      backendJobId: undefined,
      uploadStatusUrl: undefined,
      uploadStatusPolls: undefined,
      uploadStatusLog: undefined,
    };
    const packet = buildFilecoinSealLifecyclePacket([
      record(manualProofOnly),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
      modeRun("penalty-pressure", verifiedJob("seal-penalty-pressure", "mode-penalty-pressure", "1".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.completeArtifacts).toBe(6);
    expect(packet.artifacts[0]).toMatchObject({
      status: "blocked",
      passedStages: 4,
      uploadStatusPolls: 0,
    });
    expect(packet.artifacts[0].stages.find((stage) => stage.key === "one-click")?.passed).toBe(false);
    expect(packet.artifacts[0].stages.find((stage) => stage.key === "upload-status")?.passed).toBe(false);
    expect(packet.nextAction).toContain("no async backend upload job yet");
  });

  it("does not complete lifecycle when Filecoin proof metadata still looks like placeholder data", () => {
    const baseJob = verifiedJob("seal-placeholder", "cap-filecoin", "a".repeat(64));
    const placeholderProofJob = {
      ...baseJob,
      proof: {
        ...baseJob.proof!,
        provider: "seal-api-provider",
        dataSetId: "seal-api-dataset",
      },
    };
    const packet = buildFilecoinSealLifecyclePacket([
      record(placeholderProofJob),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.completeArtifacts).toBe(5);
    expect(packet.artifacts[0]).toMatchObject({
      status: "blocked",
      passedStages: 5,
    });
    expect(packet.artifacts[0].stages.find((stage) => stage.key === "cid")).toMatchObject({
      passed: false,
      detail: "sealed proof provider looks like mock, demo or placeholder data",
    });
    expect(packet.nextAction).toContain("placeholder data");
  });

  it("does not complete lifecycle when latest upload status is for a stale payload", () => {
    const staleUploadJob = {
      ...verifiedJob("seal-stale", "cap-filecoin", "a".repeat(64)),
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2099-07-01T00:00:30.000Z",
          status: "running" as const,
          httpStatus: 200,
          detail: "Seal job running.",
          jobId: "seal-job-cap-filecoin",
        },
        {
          attempt: 2,
          checkedAt: "2099-07-01T00:01:00.000Z",
          status: "verified" as const,
          httpStatus: 200,
          detail: "Seal job returned CID bafy-cap-filecoin.",
          jobId: "seal-job-cap-filecoin",
          cid: "bafy-cap-filecoin",
          payloadHash: "f".repeat(64),
          byteLength: 1200,
        },
      ],
    };
    const packet = buildFilecoinSealLifecyclePacket([
      record(staleUploadJob),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.completeArtifacts).toBe(5);
    expect(packet.artifacts[0]).toMatchObject({
      status: "blocked",
      passedStages: 5,
    });
    expect(packet.artifacts[0].stages.find((stage) => stage.key === "upload-status")?.passed).toBe(false);
    expect(packet.nextAction).toContain("2 polls");
  });

  it("does not complete lifecycle when upload status URL targets another backend job", () => {
    const staleStatusUrlJob = {
      ...verifiedJob("seal-stale-status-url", "cap-filecoin", "a".repeat(64)),
      uploadStatusUrl: "https://seal.example/jobs/old-job",
    };
    const packet = buildFilecoinSealLifecyclePacket([
      record(staleStatusUrlJob),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.completeArtifacts).toBe(5);
    expect(packet.artifacts[0]).toMatchObject({
      status: "blocked",
      passedStages: 4,
    });
    expect(packet.artifacts[0].stages.find((stage) => stage.key === "one-click")).toMatchObject({
      passed: false,
      detail: "seal-job-cap-filecoin · upload status URL must target /jobs/:backendJobId",
    });
    expect(packet.artifacts[0].stages.find((stage) => stage.key === "upload-status")).toMatchObject({
      passed: false,
      detail: "2 polls · verified · upload status URL must target /jobs/:backendJobId",
    });
  });

  it("does not complete lifecycle when poll logs only contain final verified snapshots", () => {
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
    const packet = buildFilecoinSealLifecyclePacket([
      record(finalOnly),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.artifacts[0]).toMatchObject({
      status: "blocked",
      passedStages: 4,
      uploadStatusPolls: 1,
      verificationPolls: 1,
    });
    expect(packet.artifacts[0].stages.find((stage) => stage.key === "upload-status")).toMatchObject({
      passed: false,
      detail: "1 poll · verified · progression missing",
    });
    expect(packet.artifacts[0].stages.find((stage) => stage.key === "verification-poll")).toMatchObject({
      passed: false,
      detail: "1 attempt · verified · verification polling must include pending or retrievable progress before verified",
    });
    expect(packet.readBackDossierReady).toBe(5);
    expect(packet.readBackDossiers[0]).toMatchObject({
      ready: false,
      passedSteps: 1,
    });
    expect(packet.readBackDossiers[0].steps.find((step) => step.route === "upload-status")).toMatchObject({
      passed: false,
      commandReady: true,
    });
    expect(packet.readBackDossiers[0].steps.find((step) => step.route === "verify")).toMatchObject({
      passed: false,
      commandReady: true,
    });
    expect(packet.readBackDossiers[0].steps.find((step) => step.route === "proof")).toMatchObject({
      passed: true,
      commandReady: true,
    });
  });

  it("does not complete lifecycle when final verification poll lacks CID and payload metadata", () => {
    const statusOnlyVerification = {
      ...verifiedJob("seal-status-only", "cap-filecoin", "a".repeat(64)),
      pollLog: [
        {
          attempt: 1,
          checkedAt: "2099-07-01T00:01:00.000Z",
          status: "pending" as const,
          proofStatus: "sealed" as const,
          httpStatus: 200,
          detail: "pending",
        },
        {
          attempt: 2,
          checkedAt: "2099-07-01T00:02:00.000Z",
          status: "verified" as const,
          proofStatus: "verified" as const,
          httpStatus: 200,
          detail: "verified without CID metadata",
        },
      ],
    };
    const packet = buildFilecoinSealLifecyclePacket([
      record(statusOnlyVerification),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.artifacts[0]).toMatchObject({
      status: "blocked",
      passedStages: 5,
    });
    expect(packet.artifacts[0].stages.find((stage) => stage.key === "verification-poll")).toMatchObject({
      passed: false,
      detail: "2 attempts · verified · latest verification poll CID is missing or does not match attached proof CID",
    });
    expect(packet.artifacts[0].resumeBlockers).toEqual(
      expect.arrayContaining([
        "latest verification poll CID is missing or does not match attached proof CID",
        "latest verification poll payload hash is missing or does not match uploaded payload hash",
        "latest verification poll byte length is missing or does not match uploaded byte length",
      ]),
    );
  });

  it("marks running backend upload jobs as resumable instead of complete", () => {
    const runningJob: SealJob = {
      ...verifiedJob("seal-running", "cap-filecoin", "a".repeat(64)),
      status: "running",
      proof: undefined,
      proofUrl: undefined,
      verifyUrl: undefined,
      uploadStatusPolls: 1,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2099-07-01T00:00:30.000Z",
          status: "running",
          httpStatus: 200,
          detail: "Seal job still running.",
          jobId: "seal-job-cap-filecoin",
        },
      ],
      pollAttempts: 0,
      pollLog: [],
      proofRegistryStatus: "unchecked",
      proofRegistryHash: undefined,
      proofRegistryByteLength: undefined,
    };
    const packet = buildFilecoinSealLifecyclePacket([
      record(runningJob),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
      modeRun("penalty-pressure", verifiedJob("seal-penalty-pressure", "mode-penalty-pressure", "1".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.resumableArtifacts).toBe(1);
    expect(packet.artifacts[0]).toMatchObject({
      status: "resumable",
      resumable: true,
      backendJobId: "seal-job-cap-filecoin",
      resumeRisk: "ready",
      resumeEvidence: expect.arrayContaining(["backend job seal-job-cap-filecoin", "payload hash captured"]),
    });
    expect(packet.resumeQueueReady).toBe(1);
    expect(packet.resumeQueue[0]).toMatchObject({
      id: "record-cap-filecoin",
      label: "Prediction proof",
      canResume: true,
      risk: "ready",
      backendJobId: "seal-job-cap-filecoin",
      uploadStatusUrl: "https://seal.example/jobs/seal-job-cap-filecoin",
      nextAction: "poll-upload-status",
    });
    expect(packet.artifacts[0].nextAction).toContain("Resume backend seal job");
    expect(packet.checks.find((check) => check.key === "recovery")?.passed).toBe(true);
    expect(packet.checks.find((check) => check.key === "recovery")?.detail).toBe("1/1 resume-ready job · 0 queued lanes");
    expect(packet.copyText).toContain("resume ready");
    expect(packet.copyText).toContain("Resume queue: 1/1 ready");
    expect(packet.copyText).toContain("Prediction proof · ready · seal-job-cap-filecoin");
  });

  it("shows missing required mode lanes as explicit lifecycle gaps", () => {
    const packet = buildFilecoinSealLifecyclePacket([
      record(verifiedJob("seal-record", "cap-filecoin", "a".repeat(64))),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.totalArtifacts).toBe(7);
    expect(packet.missingArtifacts).toBe(5);
    expect(packet.checks.find((check) => check.key === "artifacts")).toMatchObject({
      passed: false,
      detail: "2/7 prediction/mode artifacts exist",
    });
    expect(packet.artifacts.find((artifact) => artifact.modeId === "upset")).toMatchObject({
      status: "missing",
      artifactId: undefined,
    });
    expect(packet.resumeQueueReady).toBe(0);
    expect(packet.resumeQueue.find((item) => item.modeId === "upset")).toMatchObject({
      canResume: false,
      risk: "needs-config",
      backendJobId: undefined,
      nextAction: "configure-seal-endpoint",
    });
    expect(packet.readBackDossierReady).toBe(2);
    expect(packet.readBackDossiers.find((dossier) => dossier.modeId === "upset")).toMatchObject({
      ready: false,
      passedSteps: 0,
      blockers: expect.arrayContaining([
        "Upload status read-back: Missing a ready /jobs/:backendJobId read-back command.",
        "CID verification read-back: Missing a ready /verify read-back command for the sealed CID.",
        "Proof registry read-back: Missing a ready /proof/:cid registry read-back command.",
      ]),
    });
  });

  it("keeps metadata-broken seal jobs visible but not resume-ready", () => {
    const missingMetadata: SealJob = {
      ...verifiedJob("seal-metadata", "cap-filecoin", "a".repeat(64)),
      status: "running",
      uploadPayloadHash: undefined,
      uploadByteLength: undefined,
      proof: undefined,
      proofUrl: undefined,
      verifyUrl: undefined,
      proofRegistryStatus: "unchecked",
    };
    const packet = buildFilecoinSealLifecyclePacket([
      record(missingMetadata),
    ], [
      modeRun("bracket", verifiedJob("seal-bracket", "mode-bracket", "b".repeat(64))),
      modeRun("parlay", verifiedJob("seal-parlay", "mode-parlay", "c".repeat(64))),
      modeRun("agent-vs-human", verifiedJob("seal-agent", "mode-agent-vs-human", "d".repeat(64))),
      modeRun("upset", verifiedJob("seal-upset", "mode-upset", "e".repeat(64))),
      modeRun("group-path", verifiedJob("seal-group-path", "mode-group-path", "f".repeat(64))),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.resumeQueueReady).toBe(0);
    expect(packet.resumeQueue[0]).toMatchObject({
      canResume: false,
      risk: "metadata-missing",
      nextAction: "restore-upload-metadata",
      blockers: expect.arrayContaining(["uploaded payload hash is missing", "uploaded byte length is missing"]),
    });
    expect(packet.checks.find((check) => check.key === "recovery")?.passed).toBe(false);
  });
});
