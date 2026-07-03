import { describe, expect, it } from "vitest";
import { createEmptyBracketPath } from "./bracket";
import { buildModePlaybookPacket } from "./modePlaybook";
import type { BracketPath, GameMode, GameModeRun, MemoryRecord } from "./types";

const modes: GameMode[] = [
  { id: "bracket", title: "Bracket path", status: "playable", description: "Path", progress: 100, reward: "Badge" },
  { id: "parlay", title: "Multi-match parlay", status: "playable", description: "Parlay", progress: 100, reward: "XP" },
  { id: "agent-vs-human", title: "Agent vs Human", status: "playable", description: "Calibration", progress: 100, reward: "Badge" },
  { id: "upset", title: "Upset Challenge", status: "playable", description: "Upset", progress: 100, reward: "XP" },
];

const record = (id: string, score?: number, confidence = 60): MemoryRecord => ({
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
      confidence,
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
      markets: [
        {
          id: "winner",
          label: "1X2",
          pick: `${id} home`,
          confidence,
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
          agentReview: ["Agent review"],
        },
});

const run = (modeId: GameMode["id"]): GameModeRun => ({
  id: `mode-${modeId}`,
  modeId,
  title: modes.find((mode) => mode.id === modeId)?.title ?? modeId,
  createdAt: "2099-01-01T03:00:00.000Z",
  capsuleIds: [`cap-${modeId}`],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: `bafy-${modeId}`,
    pieceCid: `piece-${modeId}`,
    provider: "demo",
    dataSetId: "set",
    proofStatus: "retrievable",
  },
  status: "sealed",
  summary: `${modeId} sealed`,
  requirements: [],
});

const readyBracketPath = (): BracketPath => ({
  ...createEmptyBracketPath(),
  picks: Array.from({ length: 4 }, (_, index) => ({
    id: `pick-${index}`,
    matchId: `match-${index}`,
    matchLabel: `Team ${index}A vs Team ${index}B`,
    stage: "Quarterfinal",
    winner: `Team ${index}A`,
    confidence: 65,
    note: "Path note",
  })),
});

describe("mode playbook packet", () => {
  it("turns ready mode inputs into actionable seal lanes", () => {
    const packet = buildModePlaybookPacket({
      modes,
      records: [record("one", 80), record("two"), record("three"), record("bold", undefined, 44)],
      bracketPath: readyBracketPath(),
      runs: [],
    });

    expect(packet.complete).toBe(false);
    expect(packet.readyToSealModes).toBe(4);
    expect(packet.sealedModes).toBe(0);
    expect(packet.items.map((item) => item.status)).toEqual([
      "ready-to-seal",
      "ready-to-seal",
      "ready-to-seal",
      "ready-to-seal",
    ]);
    expect(packet.nextAction).toContain("Bracket path");
    expect(packet.copyText).toContain("Ready to seal: 4/4");
  });

  it("marks the playbook complete only when every mode has a proof run", () => {
    const packet = buildModePlaybookPacket({
      modes,
      records: [],
      bracketPath: createEmptyBracketPath(),
      runs: modes.map((mode) => run(mode.id)),
    });

    expect(packet.complete).toBe(true);
    expect(packet.sealedModes).toBe(4);
    expect(packet.totalRuns).toBe(4);
    expect(packet.items.every((item) => item.latestRunId)).toBe(true);
    expect(packet.nextAction).toContain("finish Filecoin");
  });

  it("keeps missing inputs visible before the user has enough locks", () => {
    const packet = buildModePlaybookPacket({
      modes,
      records: [record("one")],
      bracketPath: createEmptyBracketPath(),
      runs: [],
    });

    expect(packet.readyToSealModes).toBe(0);
    expect(packet.items.find((item) => item.modeId === "parlay")?.nextAction).toContain("Seal 2 more");
    expect(packet.items.find((item) => item.modeId === "agent-vs-human")?.nextAction).toContain("Reveal one");
    expect(packet.items.find((item) => item.modeId === "upset")?.nextAction).toContain("lower-confidence");
  });
});
