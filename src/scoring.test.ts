import { describe, expect, it } from "vitest";
import { scorePrediction } from "./scoring";
import type { Match, PredictionCapsule } from "./types";

const match: Match = {
  id: "m1",
  homeTeam: "Red",
  awayTeam: "Blue",
  kickoffAt: "2099-07-02T20:00:00.000Z",
  stage: "Final",
  status: "finished",
  dataSource: "manual",
};

const capsule: PredictionCapsule = {
  id: "cap-test",
  matchId: match.id,
  matchLabel: "Red vs Blue",
  kickoffAt: match.kickoffAt,
  createdAt: "2099-07-01T20:00:00.000Z",
  sealedAt: "2099-07-01T20:00:00.000Z",
  locked: true,
  lateLock: false,
  payloadHash: "a".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: "bafy-test",
    pieceCid: "piece-test",
    provider: "demo",
    dataSetId: "set",
    proofStatus: "retrievable",
  },
  prediction: {
    homeScore: 2,
    awayScore: 1,
    winner: "Red",
    keyPlayers: ["No. 10"],
    confidence: 70,
    style: "analysis",
    reasoning: "This is a detailed tactical prediction with enough substance for reasoning points.",
    agentSummary: "Summary",
    markets: [
      { id: "winner", label: "1X2", pick: "Red", confidence: 70, rationale: "Home edge." },
      { id: "total-goals", label: "Total goals", pick: "Over 2.5", confidence: 61, rationale: "Open match." },
      { id: "both-score", label: "Both teams score", pick: "Yes", confidence: 58, rationale: "Both attacks." },
      { id: "first-goal", label: "First goal signal", pick: "No. 10", confidence: 50, rationale: "Creator." },
    ],
  },
};

describe("scoring", () => {
  it("scores exact result and market hits", () => {
    const result = scorePrediction(capsule, match, 2, 1, ["No. 10 scored first"]);
    expect(result.breakdown.exactScore).toBe(24);
    expect(result.breakdown.winner).toBe(24);
    expect(result.breakdown.markets).toBe(15);
    expect(result.totalScore).toBeGreaterThan(85);
    expect(result.agentReview).toHaveLength(3);
  });
});
