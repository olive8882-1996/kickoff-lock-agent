import { describe, expect, it } from "vitest";
import { buildAgentCalibrationEvidencePacket } from "./agentCalibrationEvidence";
import type { GameModeRun } from "./types";

const run = (patch: Partial<GameModeRun> = {}): GameModeRun => ({
  id: "mode-agent-vs-human-1",
  modeId: "agent-vs-human",
  title: "Agent vs Human",
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: ["cap-1", "cap-2", "cap-3"],
  payloadHash: "a".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: "bafy-agent-calibration",
    pieceCid: "piece-agent-calibration",
    provider: "demo",
    dataSetId: "mode",
    proofStatus: "retrievable",
  },
  status: "scored",
  score: 84,
  summary: "Agent calibration sealed.",
  requirements: ["At least 1 revealed lock"],
  artifact: {
    kind: "agent-calibration",
    averageCalibrationError: 16,
    samples: [
      {
        capsuleId: "cap-1",
        matchLabel: "Spain vs Austria",
        confidence: 72,
        totalScore: 74,
        winnerHit: true,
        calibrationError: 2,
        review: [],
      },
      {
        capsuleId: "cap-2",
        matchLabel: "Brazil vs Japan",
        confidence: 82,
        totalScore: 48,
        winnerHit: false,
        calibrationError: 34,
        review: [],
      },
      {
        capsuleId: "cap-3",
        matchLabel: "USA vs Ghana",
        confidence: 42,
        totalScore: 75,
        winnerHit: true,
        calibrationError: 33,
        review: [],
      },
    ],
  },
  ...patch,
});

describe("agent calibration evidence", () => {
  it("builds a copyable calibration packet with human and agent edge flags", () => {
    const packet = buildAgentCalibrationEvidencePacket([run()]);

    expect(packet.ready).toBe(true);
    expect(packet.runId).toBe("mode-agent-vs-human-1");
    expect(packet.samples).toBe(3);
    expect(packet.averageCalibrationError).toBe(16);
    expect(packet.calibratedSamples).toBe(1);
    expect(packet.overconfidentSamples).toBe(1);
    expect(packet.underconfidentSamples).toBe(1);
    expect(packet.humanEdgeSamples).toBe(1);
    expect(packet.agentEdgeSamples).toBe(2);
    expect(packet.copyText).toContain("Kickoff Lock Agent Agent vs Human calibration");
    expect(packet.copyText).toContain("Brazil vs Japan");
    expect(packet.items.map((item) => item.status)).toEqual(["calibrated", "overconfident", "underconfident"]);
  });

  it("keeps the packet pending when no Agent vs Human run exists", () => {
    const packet = buildAgentCalibrationEvidencePacket([]);

    expect(packet.ready).toBe(false);
    expect(packet.samples).toBe(0);
    expect(packet.nextAction).toContain("Reveal one locked prediction");
    expect(packet.copyText).toContain("Ready: no");
  });

  it("uses the latest Agent vs Human run when several exist", () => {
    const older = run({
      id: "mode-agent-vs-human-old",
      createdAt: "2099-06-01T12:00:00.000Z",
      artifact: {
        kind: "agent-calibration",
        averageCalibrationError: 4,
        samples: [],
      },
    });
    const packet = buildAgentCalibrationEvidencePacket([older, run()]);

    expect(packet.runId).toBe("mode-agent-vs-human-1");
    expect(packet.samples).toBe(3);
  });
});
