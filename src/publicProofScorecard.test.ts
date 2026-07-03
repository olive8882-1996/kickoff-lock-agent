import { describe, expect, it } from "vitest";
import { buildModePublicProofScorecard, buildRecordPublicProofScorecard } from "./publicProofScorecard";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

const artifact: ShareArtifactEvidence = {
  id: "cap-1",
  kind: "record",
  proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-1",
  imageGenerated: true,
  generatedAt: "2099-01-01T00:05:00.000Z",
  fileName: "cap-1-proof-card.png",
  imageUrl: "https://cdn.example.com/cards/cap-1-proof-card.png",
  imageMime: "image/png",
  imageByteLength: 220000,
  imageHash: "a".repeat(64),
};

const record: MemoryRecord = {
  capsule: {
    id: "cap-1",
    matchId: "match-1",
    matchLabel: "Brazil vs Japan",
    kickoffAt: "2099-07-01T19:00:00.000Z",
    createdAt: "2099-07-01T12:00:00.000Z",
    sealedAt: "2099-07-01T12:30:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "b".repeat(64),
    filecoinProof: {
      mode: "real",
      cid: "bafy-real",
      pieceCid: "piece-real",
      provider: "synapse",
      dataSetId: "dataset",
      proofStatus: "verified",
    },
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Brazil",
      keyPlayers: [],
      confidence: 70,
      style: "analysis",
      reasoning: "Brazil edge",
      agentSummary: "Brazil edge",
      markets: [],
    },
  },
  result: {
    id: "result-1",
    capsuleId: "cap-1",
    revealedAt: "2099-07-01T21:00:00.000Z",
    homeScore: 2,
    awayScore: 1,
    keyPlayers: [],
    source: "manual",
    totalScore: 92,
    breakdown: { winner: 30, exactScore: 30, goalDifference: 12, markets: 8, keyPlayer: 4, confidence: 4, reasoning: 4 },
    explanation: [],
    agentReview: [],
  },
};

const modeRun: GameModeRun = {
  id: "mode-1",
  modeId: "bracket",
  title: "Bracket path",
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: ["cap-1", "cap-2"],
  payloadHash: "c".repeat(64),
  filecoinProof: {
    mode: "real",
    cid: "bafy-mode-real",
    pieceCid: "piece-mode-real",
    provider: "synapse",
    dataSetId: "dataset",
    proofStatus: "retrievable",
  },
  status: "scored",
  score: 88,
  summary: "Path sealed and scored.",
  requirements: ["two locks"],
};

describe("public proof scorecard", () => {
  it("marks a deployed prediction proof package production-ready", () => {
    const scorecard = buildRecordPublicProofScorecard(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      artifact,
    );

    expect(scorecard.productionReady).toBe(true);
    expect(scorecard.passed).toBe(scorecard.total);
    expect(scorecard.summary).toContain("production-ready");
  });

  it("keeps local demo proof pages out of production-ready status", () => {
    const scorecard = buildRecordPublicProofScorecard(
      {
        ...record,
        capsule: {
          ...record.capsule,
          lateLock: true,
          filecoinProof: { ...record.capsule.filecoinProof, mode: "demo" },
        },
        result: undefined,
      },
      "http://127.0.0.1:4173/kickoff-lock-agent/?proof=cap-1",
      { ...artifact, imageUrl: undefined, proofUrl: "http://127.0.0.1:4173/?proof=cap-1" },
    );

    expect(scorecard.productionReady).toBe(false);
    expect(scorecard.items.find((item) => item.key === "lock")?.status).toBe("failed");
    expect(scorecard.items.find((item) => item.key === "filecoin")?.status).toBe("pending");
    expect(scorecard.items.find((item) => item.key === "url")?.status).toBe("pending");
    expect(scorecard.nextAction).toContain("Prediction was locked after kickoff");
  });

  it("builds a mode proof scorecard with linked lock evidence", () => {
    const scorecard = buildModePublicProofScorecard(
      modeRun,
      "https://example.com/kickoff-lock-agent/?mode=mode-1",
      { ...artifact, id: "mode-1", kind: "mode", proofUrl: "https://example.com/kickoff-lock-agent/?mode=mode-1" },
    );

    expect(scorecard.kind).toBe("mode");
    expect(scorecard.productionReady).toBe(true);
    expect(scorecard.items.find((item) => item.key === "linked-locks")?.detail).toContain("2 capsules");
  });
});
