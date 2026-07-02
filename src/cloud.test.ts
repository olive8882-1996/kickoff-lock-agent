import { describe, expect, it } from "vitest";
import { buildLocalLeaderboard } from "./cloud";
import type { MemoryRecord, UserProfile } from "./types";

const profile: UserProfile = {
  id: "local-test",
  email: "test@example.com",
  displayName: "Tester",
  location: "Chengdu",
  createdAt: "2099-01-01T00:00:00.000Z",
  cloudMode: "local",
};

describe("local leaderboard", () => {
  it("builds an XP entry from local records", () => {
    const records: MemoryRecord[] = [
      {
        capsule: {
          id: "cap-1",
          matchId: "m1",
          matchLabel: "A vs B",
          kickoffAt: "2099-01-01T00:00:00.000Z",
          createdAt: "2098-12-31T00:00:00.000Z",
          sealedAt: "2098-12-31T00:00:00.000Z",
          locked: true,
          lateLock: false,
          payloadHash: "a".repeat(64),
          filecoinProof: {
            mode: "demo",
            cid: "bafy",
            pieceCid: "piece",
            provider: "demo",
            dataSetId: "set",
            proofStatus: "retrievable",
          },
          prediction: {
            homeScore: 1,
            awayScore: 0,
            winner: "A",
            keyPlayers: [],
            confidence: 55,
            style: "analysis",
            reasoning: "Reasoning",
            agentSummary: "Summary",
            markets: [],
          },
        },
        result: {
          id: "res-1",
          capsuleId: "cap-1",
          revealedAt: "2099-01-01T02:00:00.000Z",
          homeScore: 1,
          awayScore: 0,
          keyPlayers: [],
          source: "manual",
          totalScore: 88,
          breakdown: {
            winner: 24,
            exactScore: 24,
            goalDifference: 12,
            markets: 0,
            keyPlayer: 0,
            confidence: 10,
            reasoning: 5,
          },
          explanation: [],
          agentReview: [],
        },
      },
    ];
    const [entry] = buildLocalLeaderboard(profile, records);
    expect(entry.displayName).toBe("Tester");
    expect(entry.xp).toBe(208);
    expect(entry.bestScore).toBe(88);
    expect(entry.source).toBe("local");
  });
});
