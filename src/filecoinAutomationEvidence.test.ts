import { describe, expect, it } from "vitest";
import { buildFilecoinAutomationEvidencePacket } from "./filecoinAutomationEvidence";
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
    },
  ],
  lastCheckedAt: "2099-07-01T00:02:00.000Z",
  proofRegistryStatus: "verified",
  proofRegistryCheckedAt: "2099-07-01T00:02:00.000Z",
  proofRegistryHash: payloadHash,
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

const modeRun = (sealJob?: SealJob): GameModeRun => ({
  id: "mode-filecoin",
  modeId: "bracket",
  title: "Bracket path",
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
  it("marks record and mode lanes ready when both have verified production seal jobs", () => {
    const packet = buildFilecoinAutomationEvidencePacket([
      record(verifiedJob("seal-record", "cap-filecoin", "a".repeat(64))),
    ], [
      modeRun(verifiedJob("seal-mode", "mode-filecoin", "b".repeat(64))),
    ]);

    expect(packet.ready).toBe(true);
    expect(packet.lanesReady).toBe(2);
    expect(packet.productionBackends).toBe(2);
    expect(packet.registryMatches).toBe(2);
    expect(packet.pollAttempts).toBe(4);
    expect(packet.copyText).toContain("Kickoff Lock Agent Filecoin automation evidence");
    expect(packet.nextAction).toContain("production verified");
  });

  it("keeps the packet pending when only mock backend evidence exists", () => {
    const packet = buildFilecoinAutomationEvidencePacket([
      record(verifiedJob("seal-record", "cap-filecoin", "a".repeat(64), true)),
    ], [
      modeRun(verifiedJob("seal-mode", "mode-filecoin", "b".repeat(64), true)),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.lanesReady).toBe(0);
    expect(packet.productionBackends).toBe(0);
    expect(packet.lanes[0].blockers).toContain("FILECOIN_SEAL_MOCK is enabled");
  });

  it("reports missing lanes before one-click sealing has run", () => {
    const packet = buildFilecoinAutomationEvidencePacket([record()], []);

    expect(packet.ready).toBe(false);
    expect(packet.lanes).toHaveLength(2);
    expect(packet.lanes[0].status).toBe("missing");
    expect(packet.lanes[1].summary).toContain("has not run");
    expect(packet.nextAction).toContain("missing record seal job");
  });
});
