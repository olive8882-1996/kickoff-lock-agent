import { describe, expect, it } from "vitest";
import { buildShareCardPayload } from "./shareCard";
import type { MemoryRecord } from "./types";

const record: MemoryRecord = {
  capsule: {
    id: "cap-share",
    matchId: "m1",
    matchLabel: "Spain vs Austria",
    kickoffAt: "2099-07-01T20:00:00.000Z",
    createdAt: "2099-07-01T10:00:00.000Z",
    sealedAt: "2099-07-01T10:10:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "abc123".repeat(11),
    filecoinProof: {
      mode: "real",
      cid: "bafy-share-proof",
      pieceCid: "baga-share-piece",
      provider: "synapse",
      dataSetId: "dataset",
      proofStatus: "verified",
    },
    prediction: {
      homeScore: 2,
      awayScore: 0,
      winner: "Spain",
      keyPlayers: ["Pedri"],
      confidence: 68,
      style: "analysis",
      reasoning: "Spain controls midfield.",
      agentSummary: "Spain 2-0 Austria",
      markets: [],
    },
  },
  result: {
    id: "result-share",
    capsuleId: "cap-share",
    revealedAt: "2099-07-01T22:00:00.000Z",
    homeScore: 2,
    awayScore: 1,
    keyPlayers: ["Pedri"],
    source: "manual",
    totalScore: 76,
    breakdown: {
      winner: 30,
      exactScore: 0,
      goalDifference: 10,
      markets: 12,
      keyPlayer: 10,
      confidence: 6,
      reasoning: 8,
    },
    explanation: [],
    agentReview: [],
  },
};

describe("share card payload", () => {
  it("carries proof, score and public verification fields for social images", () => {
    const payload = buildShareCardPayload(record, "https://example.com/kickoff-lock-agent/?proof=cap-share");

    expect(payload.matchLabel).toBe("SPAIN VS AUSTRIA");
    expect(payload.prediction).toBe("2-0");
    expect(payload.actual).toBe("2-1");
    expect(payload.score).toBe("76/100");
    expect(payload.confidence).toBe("68% CONFIDENCE");
    expect(payload.proofMode).toBe("REAL PROOF");
    expect(payload.proofStatus).toBe("VERIFIED");
    expect(payload.cid).toBe("bafy-share-proof");
    expect(payload.hash).toContain("abc123");
    expect(payload.proofUrl).toContain("?proof=cap-share");
  });

  it("labels unrevealed capsules as pending without hiding the proof URL", () => {
    const payload = buildShareCardPayload({ capsule: record.capsule }, "https://example.com/?proof=cap-share");

    expect(payload.actual).toBe("PENDING");
    expect(payload.score).toBe("PENDING");
    expect(payload.proofUrl).toContain("proof=cap-share");
  });
});
