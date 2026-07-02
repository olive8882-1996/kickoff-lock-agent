import { describe, expect, it } from "vitest";
import { createGameModeRun, getModeReadiness } from "./modes";
import type { GameMode, MemoryRecord } from "./types";

const mode: GameMode = {
  id: "parlay",
  title: "Multi-match parlay",
  status: "playable",
  description: "Bundle three locks.",
  progress: 50,
  reward: "XP",
};

const record = (id: string, score?: number): MemoryRecord => ({
  capsule: {
    id,
    matchId: `match-${id}`,
    matchLabel: `${id} home vs ${id} away`,
    kickoffAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2098-12-31T00:00:00.000Z",
    sealedAt: "2098-12-31T00:00:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: `bafy-${id}`,
      pieceCid: `piece-${id}`,
      provider: "demo",
      dataSetId: "set",
      proofStatus: "retrievable",
    },
    prediction: {
      homeScore: 1,
      awayScore: 0,
      winner: `${id} home`,
      keyPlayers: [],
      confidence: 60,
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
      markets: [
        {
          id: "winner",
          label: "1X2",
          pick: `${id} home`,
          confidence: 60,
          rationale: "Rationale",
        },
      ],
    },
  },
  result:
    score === undefined
      ? undefined
      : {
          id: `res-${id}`,
          capsuleId: id,
          revealedAt: "2099-01-01T02:00:00.000Z",
          homeScore: 1,
          awayScore: 0,
          keyPlayers: [],
          source: "manual",
          totalScore: score,
          breakdown: {
            winner: 24,
            exactScore: 24,
            goalDifference: 12,
            markets: 10,
            keyPlayer: 0,
            confidence: 10,
            reasoning: 5,
          },
          explanation: [],
          agentReview: [],
        },
});

describe("game mode proof runs", () => {
  it("requires enough sealed records before parlay proof creation", () => {
    const readiness = getModeReadiness("parlay", [record("one"), record("two")]);
    expect(readiness.ready).toBe(false);
    expect(readiness.nextAction).toMatch(/Seal 1 more/);
  });

  it("creates a deterministic mode proof run with score when records are revealed", async () => {
    const run = await createGameModeRun(mode, [record("one", 80), record("two", 70), record("three", 90)]);
    expect(run.modeId).toBe("parlay");
    expect(run.capsuleIds).toEqual(["one", "two", "three"]);
    expect(run.score).toBe(80);
    expect(run.payloadHash).toHaveLength(64);
    expect(run.filecoinProof.cid).toMatch(/^bafy-kickoff-/);
  });
});
