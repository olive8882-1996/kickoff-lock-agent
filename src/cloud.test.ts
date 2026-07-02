import { describe, expect, it } from "vitest";
import { buildLocalLeaderboard, buildPublicProfile, mergeMemoryRecords } from "./cloud";
import type { MemoryRecord, UserProfile } from "./types";

const profile: UserProfile = {
  id: "local-test",
  email: "test@example.com",
  displayName: "Tester",
  location: "Chengdu",
  createdAt: "2099-01-01T00:00:00.000Z",
  cloudMode: "local",
};

const record = (id: string, patch: Partial<MemoryRecord> = {}): MemoryRecord => ({
  capsule: {
    id,
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
  ...patch,
});

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

  it("builds a public profile from local records", () => {
    const records: MemoryRecord[] = [
      {
        capsule: {
          id: "cap-2",
          matchId: "m2",
          matchLabel: "C vs D",
          kickoffAt: "2099-01-02T00:00:00.000Z",
          createdAt: "2099-01-01T00:00:00.000Z",
          sealedAt: "2099-01-01T00:00:00.000Z",
          locked: true,
          lateLock: false,
          payloadHash: "c".repeat(64),
          filecoinProof: {
            mode: "demo",
            cid: "bafy-public",
            pieceCid: "piece-public",
            provider: "demo",
            dataSetId: "set-public",
            proofStatus: "verified",
          },
          prediction: {
            homeScore: 2,
            awayScore: 1,
            winner: "C",
            keyPlayers: [],
            confidence: 70,
            style: "analysis",
            reasoning: "Reasoning",
            agentSummary: "Summary",
            markets: [],
          },
        },
        result: {
          id: "res-2",
          capsuleId: "cap-2",
          revealedAt: "2099-01-02T02:00:00.000Z",
          homeScore: 2,
          awayScore: 1,
          keyPlayers: [],
          source: "manual",
          totalScore: 92,
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

    const publicProfile = buildPublicProfile(profile, records);
    expect(publicProfile.displayName).toBe("Tester");
    expect(publicProfile.friendCode).toBe("chengdu");
    expect(publicProfile.locks).toBe(1);
    expect(publicProfile.revealed).toBe(1);
    expect(publicProfile.averageScore).toBe(92);
    expect(publicProfile.bestScore).toBe(92);
    expect(publicProfile.xp).toBe(212);
  });

  it("merges cloud history by keeping the richer capsule version", () => {
    const local = record("cap-merge");
    const cloud = record("cap-merge", {
      result: {
        id: "res-merge",
        capsuleId: "cap-merge",
        revealedAt: "2099-01-01T02:00:00.000Z",
        homeScore: 1,
        awayScore: 0,
        keyPlayers: [],
        source: "manual",
        totalScore: 91,
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
    });

    const [merged] = mergeMemoryRecords([local], [cloud]);
    expect(merged.result?.totalScore).toBe(91);
  });

  it("does not replace a real local proof with a weaker cloud demo record", () => {
    const local = record("cap-proof", {
      capsule: {
        ...record("cap-proof").capsule,
        filecoinProof: {
          mode: "real",
          cid: "bafy-real",
          pieceCid: "piece-real",
          provider: "synapse",
          dataSetId: "dataset",
          proofStatus: "verified",
        },
      },
    });
    const cloud = record("cap-proof");

    const [merged] = mergeMemoryRecords([local], [cloud]);
    expect(merged.capsule.filecoinProof.mode).toBe("real");
    expect(merged.capsule.filecoinProof.cid).toBe("bafy-real");
  });
});
