import { describe, expect, it } from "vitest";
import { createCapsule, stableJson } from "./proof";
import type { Match, PredictionDraft } from "./types";

const match: Match = {
  id: "test-match",
  homeTeam: "Red",
  awayTeam: "Blue",
  kickoffAt: "2099-07-02T20:00:00.000Z",
  stage: "Final",
  status: "upcoming",
  dataSource: "manual",
};

const prediction: PredictionDraft = {
  homeScore: 2,
  awayScore: 1,
  winner: "Red",
  keyPlayers: ["No. 10"],
  confidence: 72,
  style: "analysis",
  reasoning: "A long enough tactical explanation for scoring and review.",
  agentSummary: "Agent summary",
  markets: [
    { id: "winner", label: "1X2", pick: "Red", confidence: 72, rationale: "Home edge." },
    { id: "total-goals", label: "Total goals", pick: "Over 2.5", confidence: 61, rationale: "Open match." },
    { id: "both-score", label: "Both teams score", pick: "Yes", confidence: 58, rationale: "Both attacks." },
    { id: "first-goal", label: "First goal signal", pick: "No. 10", confidence: 50, rationale: "Creator." },
  ],
};

describe("proof capsules", () => {
  it("serializes stable JSON independent of object key order", () => {
    expect(stableJson({ b: 1, a: 2 })).toBe(stableJson({ a: 2, b: 1 }));
  });

  it("creates a locked non-late capsule before kickoff", async () => {
    const capsule = await createCapsule(match, prediction);
    expect(capsule.locked).toBe(true);
    expect(capsule.lateLock).toBe(false);
    expect(capsule.payloadHash).toHaveLength(64);
    expect(capsule.filecoinProof.cid).toContain("bafy-kickoff-");
  });
});
