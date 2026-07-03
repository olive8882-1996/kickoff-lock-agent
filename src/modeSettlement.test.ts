import { describe, expect, it } from "vitest";
import { buildModeSettlementPacket } from "./modeSettlement";
import type { GameModeRun } from "./types";

const baseRun = (patch: Partial<GameModeRun>): GameModeRun => ({
  id: "mode-test",
  modeId: "parlay",
  title: "Mode Test",
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: ["cap-1"],
  payloadHash: "a".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: "bafy-demo",
    pieceCid: "piece-demo",
    provider: "demo",
    dataSetId: "demo",
    proofStatus: "retrievable",
  },
  status: "sealed",
  summary: "sealed",
  requirements: [],
  ...patch,
});

describe("mode settlement packet", () => {
  it("summarizes settled and pending mode proof runs", () => {
    const packet = buildModeSettlementPacket([
      baseRun({
        id: "mode-parlay",
        modeId: "parlay",
        title: "Multi-match parlay",
        status: "scored",
        score: 67,
        artifact: {
          kind: "parlay-ticket",
          legs: [
            { capsuleId: "cap-1", matchLabel: "A vs B", pick: "A", confidence: 62, markets: [], resultScore: 80, winnerHit: true },
            { capsuleId: "cap-2", matchLabel: "C vs D", pick: "C", confidence: 58, markets: [], resultScore: 40, winnerHit: false },
            { capsuleId: "cap-3", matchLabel: "E vs F", pick: "E", confidence: 70, markets: [], resultScore: 90, winnerHit: true },
          ],
          settledLegs: 3,
          hitLegs: 2,
        },
      }),
      baseRun({
        id: "mode-agent",
        modeId: "agent-vs-human",
        title: "Agent vs Human",
        status: "scored",
        score: 82,
        artifact: {
          kind: "agent-calibration",
          samples: [
            {
              capsuleId: "cap-agent",
              matchLabel: "Agent vs Human",
              confidence: 70,
              totalScore: 88,
              winnerHit: true,
              calibrationError: 18,
              review: ["calibrated"],
            },
          ],
          averageCalibrationError: 18,
        },
      }),
      baseRun({
        id: "mode-upset",
        modeId: "upset",
        title: "Upset Challenge",
        status: "scored",
        score: 100,
        artifact: {
          kind: "upset-ticket",
          picks: [
            {
              capsuleId: "cap-upset",
              matchLabel: "Underdog vs Favorite",
              predictedWinner: "Underdog",
              confidence: 44,
              resultScore: 91,
              winnerHit: true,
              multiplier: 3,
            },
          ],
          resolvedPicks: 1,
          hitPicks: 1,
          bonusXp: 150,
        },
      }),
      baseRun({
        id: "mode-bracket",
        modeId: "bracket",
        title: "Bracket path",
        artifact: {
          kind: "bracket-path",
          bracketPath: {
            id: "bracket-1",
            title: "Path",
            createdAt: "2099-07-01T12:00:00.000Z",
            updatedAt: "2099-07-01T12:00:00.000Z",
            picks: [
              { id: "pick-1", matchId: "m1", matchLabel: "A vs B", stage: "R16", winner: "A", confidence: 60, note: "note" },
            ],
          },
        },
      }),
    ]);

    expect(packet.runs).toBe(4);
    expect(packet.settledRuns).toBe(3);
    expect(packet.pendingRuns).toBe(1);
    expect(packet.averageScore).toBe(83);
    expect(packet.bonusXp).toBe(150);
    expect(packet.items.find((item) => item.modeId === "bracket")?.status).toBe("pending");
    expect(packet.copyText).toContain("Bonus XP: 150");
  });

  it("returns an actionable empty packet before any modes are created", () => {
    const packet = buildModeSettlementPacket([]);

    expect(packet.summary).toBe("No mode proof runs have been created yet.");
    expect(packet.nextAction).toBe("Create a bracket, parlay, Agent vs Human or upset proof to start settlement tracking.");
    expect(packet.copyText).toContain("Pending: 0");
  });
});
