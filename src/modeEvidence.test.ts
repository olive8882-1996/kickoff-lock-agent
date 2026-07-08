import { describe, expect, it } from "vitest";
import { buildModeEvidencePacket, productionModeCoverageProblem, requiredProductionModeIds } from "./modeEvidence";
import type { CloudSyncVerification, GameMode, GameModeRun, ModeArtifact, ShareArtifactEvidence } from "./types";

const modes: GameMode[] = [
  { id: "bracket", title: "Bracket path", status: "playable", description: "Path", progress: 100, reward: "Badge" },
  { id: "parlay", title: "Multi-match parlay", status: "playable", description: "Parlay", progress: 100, reward: "XP" },
  { id: "agent-vs-human", title: "Agent vs Human", status: "playable", description: "Calibration", progress: 100, reward: "Badge" },
  { id: "upset", title: "Upset Challenge", status: "playable", description: "Upset", progress: 100, reward: "XP" },
  { id: "group-path", title: "Group path", status: "playable", description: "Group table", progress: 100, reward: "Badge" },
  { id: "penalty-pressure", title: "Penalty pressure", status: "playable", description: "Pressure", progress: 100, reward: "Badge" },
];

const modeArtifact = (modeId: GameMode["id"]): ModeArtifact => {
  if (modeId === "bracket") {
    return {
      kind: "bracket-path",
      bracketPath: {
        id: "bracket-test",
        title: "Path",
        createdAt: "2099-07-01T12:00:00.000Z",
        updatedAt: "2099-07-01T12:00:00.000Z",
        picks: [{ id: "pick-1", matchId: "m1", matchLabel: "A vs B", stage: "Final", winner: "A", confidence: 60, note: "note" }],
      },
      resolvedPicks: 1,
      hitPicks: 1,
    };
  }
  if (modeId === "parlay") {
    return {
      kind: "parlay-ticket",
      legs: [
        {
          capsuleId: "cap-parlay",
          matchLabel: "A vs B",
          sequenceIndex: 1,
          chainStep: "Leg 1",
          pick: "A",
          confidence: 60,
          markets: [],
          resultScore: 80,
          winnerHit: true,
          survivesChain: true,
          chainStatus: "hit",
        },
      ],
      settledLegs: 1,
      hitLegs: 1,
      chainResolvedLegs: 1,
      chainHitLegs: 1,
      chainStatus: "complete",
    };
  }
  if (modeId === "agent-vs-human") {
    return {
      kind: "agent-calibration",
      samples: [
        {
          capsuleId: "cap-agent",
          matchLabel: "A vs B",
          confidence: 70,
          totalScore: 88,
          winnerHit: true,
          calibrationError: 18,
          review: ["calibrated"],
        },
      ],
      averageCalibrationError: 18,
    };
  }
  if (modeId === "upset") {
    return {
      kind: "upset-ticket",
      picks: [
        {
          capsuleId: "cap-upset",
          matchLabel: "A vs B",
          predictedWinner: "A",
          confidence: 44,
          resultScore: 91,
          winnerHit: true,
          multiplier: 3,
        },
      ],
      resolvedPicks: 1,
      hitPicks: 1,
      bonusXp: 150,
    };
  }
  if (modeId === "penalty-pressure") {
    return {
      kind: "penalty-pressure-ticket",
      takers: [
        {
          capsuleId: "cap-penalty",
          matchLabel: "A vs B",
          pressurePick: "A",
          pickType: "winner",
          confidence: 78,
          pressureRating: 63,
          resultScore: 86,
          pressureHit: true,
        },
      ],
      resolvedPicks: 1,
      hitPicks: 1,
      averagePressure: 63,
    };
  }
  return {
    kind: "group-table-path",
    table: [
      {
        team: "A",
        projectedRank: 1,
        predictedPoints: 3,
        predictedGoalDifference: 1,
        actualPoints: 3,
        actualGoalDifference: 1,
        locks: 1,
      },
      {
        team: "B",
        projectedRank: 2,
        predictedPoints: 0,
        predictedGoalDifference: -1,
        actualPoints: 0,
        actualGoalDifference: -1,
        locks: 1,
      },
    ],
    picks: [
      {
        capsuleId: "cap-group",
        matchLabel: "A vs B",
        predictedWinner: "A",
        predictedScore: "2-1",
        actualScore: "2-1",
        winnerHit: true,
      },
    ],
    resolvedMatches: 1,
    winnerHits: 1,
    topTwo: ["A", "B"],
  };
};

const run = (modeId: GameMode["id"], mode: "demo" | "real" = "real"): GameModeRun => ({
  id: `mode-${modeId}`,
  modeId,
  title: modes.find((item) => item.id === modeId)?.title ?? modeId,
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: [`cap-${modeId}`],
  payloadHash: "a".repeat(64),
  filecoinProof: {
    mode,
    cid: `bafy-${modeId}`,
    pieceCid: `piece-${modeId}`,
    provider: mode === "real" ? "synapse" : "demo",
    dataSetId: `set-${modeId}`,
    proofStatus: "verified",
    payloadHash: "a".repeat(64),
    byteLength: 2048,
  },
  status: "sealed",
  summary: `${modeId} sealed`,
  requirements: [],
  artifact: modeArtifact(modeId),
});

const artifact = (id: string): ShareArtifactEvidence => ({
  id,
  kind: "mode",
  proofUrl: `https://example.com/kickoff-lock-agent/?mode=${id}`,
  imageGenerated: true,
  generatedAt: "2099-07-01T12:05:00.000Z",
  fileName: `${id}.png`,
  imageUrl: `https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/${id}/card.png`,
  imageMime: "image/png",
  imageByteLength: 120_000,
  imageHash: "a".repeat(64),
});

const verificationFor = (runs: GameModeRun[]): CloudSyncVerification => ({
  checkedAt: "2099-07-01T12:10:00.000Z",
  profile: true,
  records: 0,
  modeRuns: runs.length,
  publicProofs: runs.length,
  publicProfile: true,
  expectedRecords: 0,
  expectedModeRuns: runs.length,
  modeRunIds: runs.map((item) => item.id),
  modeRunContentIds: runs.map((item) => item.id),
  publicProofIds: runs.map((item) => `mode:${item.id}`),
  message: "verified",
});

describe("mode evidence packet", () => {
  it("defines the six required production tournament mode types", () => {
    expect(requiredProductionModeIds).toEqual(["bracket", "parlay", "agent-vs-human", "upset", "group-path", "penalty-pressure"]);
  });

  it("rejects target mode rows that do not cover every production mode type", () => {
    const problem = productionModeCoverageProblem(
      [
        { id: "mode-1", mode_id: "parlay" },
        { id: "mode-2", mode_id: "parlay" },
        { id: "mode-3", mode_id: "parlay" },
        { id: "mode-4", mode_id: "upset" },
      ],
      "mode proofs",
    );

    expect(problem).toBe("mode proofs mode type coverage missing bracket, agent-vs-human, group-path, penalty-pressure");
  });

  it("rejects unknown production mode target row types", () => {
    const problem = productionModeCoverageProblem([{ id: "mode-1", mode_id: "training" }], "mode proofs");

    expect(problem).toBe("mode proofs mode type invalid: mode-1 mode_id training is not a required production mode");
  });

  it("requires all six modes to have real Filecoin, cloud read-back, public proof links and share cards", () => {
    const productionModes = modes.filter((mode) => requiredProductionModeIds.includes(mode.id));
    const runs = productionModes.map((mode) => run(mode.id));
    const packet = buildModeEvidencePacket(modes, runs, runs.map((item) => artifact(item.id)), verificationFor(runs));

    expect(packet.complete).toBe(true);
    expect(packet.passedModes).toBe(6);
    expect(packet.realFilecoinModes).toBe(6);
    expect(packet.cloudModes).toBe(6);
    expect(packet.publicProofModes).toBe(6);
    expect(packet.shareCardModes).toBe(6);
    expect(packet.acceptanceClaims).toHaveLength(6);
    expect(packet.acceptanceClaims.every((claim) => claim.accepted)).toBe(true);
    expect(packet.acceptanceClaims.map((claim) => claim.expectedArtifactKind)).toEqual([
      "bracket-path",
      "parlay-ticket",
      "agent-calibration",
      "upset-ticket",
      "group-table-path",
      "penalty-pressure-ticket",
    ]);
    expect(packet.copyText).toContain("Modes ready: 6/6");
    expect(packet.copyText).toContain("Acceptance claims:");
  });

  it("counts penalty pressure as a required production mode", () => {
    const penaltyRun = run("penalty-pressure");
    const packet = buildModeEvidencePacket(modes, [penaltyRun], [artifact(penaltyRun.id)], verificationFor([penaltyRun]));

    expect(packet.complete).toBe(false);
    expect(packet.totalModes).toBe(6);
    expect(packet.modeRuns).toBe(1);
    expect(packet.missingModes).toEqual(["bracket", "parlay", "agent-vs-human", "upset", "group-path"]);
    expect(packet.items.map((item) => item.modeId)).toEqual(requiredProductionModeIds);
  });

  it("keeps local demo mode runs out of production-ready status", () => {
    const localRun = run("bracket", "demo");
    const packet = buildModeEvidencePacket(modes, [localRun], [], undefined);

    expect(packet.complete).toBe(false);
    expect(packet.modeRuns).toBe(1);
    expect(packet.missingModes).toEqual(["bracket", "parlay", "agent-vs-human", "upset", "group-path", "penalty-pressure"]);
    expect(packet.items.find((item) => item.modeId === "bracket")?.status).toBe("needs-filecoin");
    expect(packet.items.find((item) => item.modeId === "parlay")?.status).toBe("missing-run");
    expect(packet.nextAction).toContain("real Filecoin proof");
  });

  it("does not accept non-public bitmap mode share cards as production mode evidence", () => {
    const runs = modes.filter((mode) => requiredProductionModeIds.includes(mode.id)).map((mode) => run(mode.id));
    const invalidArtifacts = runs.map((item) => ({
      ...artifact(item.id),
      imageUrl: `https://cdn.example.com/cards/${item.id}.svg`,
    }));
    const packet = buildModeEvidencePacket(modes, runs, invalidArtifacts, verificationFor(runs));

    expect(packet.complete).toBe(false);
    expect(packet.shareCardModes).toBe(0);
    expect(packet.items.map((item) => item.status)).toEqual(requiredProductionModeIds.map(() => "needs-share-card"));
    expect(packet.nextAction).toContain("production share card");
  });

  it("keeps mode evidence blocked when the production run hash is not a SHA-256 payload hash", () => {
    const runs = modes.filter((mode) => requiredProductionModeIds.includes(mode.id)).map((mode) => run(mode.id));
    const invalidHashRun = {
      ...runs[0],
      payloadHash: "local-mode-hash",
      filecoinProof: {
        ...runs[0].filecoinProof,
        payloadHash: "local-mode-hash",
      },
    };
    const patchedRuns = [invalidHashRun, ...runs.slice(1)];
    const packet = buildModeEvidencePacket(
      modes,
      patchedRuns,
      patchedRuns.map((item) => artifact(item.id)),
      verificationFor(patchedRuns),
    );

    expect(packet.complete).toBe(false);
    expect(packet.passedModes).toBe(5);
    expect(packet.missingModes).toContain("bracket");
    expect(packet.acceptanceClaims.find((claim) => claim.modeId === "bracket")?.payloadHashReady).toBe(false);
    expect(packet.acceptanceClaims.find((claim) => claim.modeId === "bracket")?.missing).toContain(
      "valid SHA-256 payload hash",
    );
    expect(packet.nextAction).toContain("valid SHA-256 payload hash");
  });

  it("requires each mode run to carry the matching gameplay artifact", () => {
    const wrongArtifactRun = {
      ...run("bracket"),
      artifact: modeArtifact("parlay"),
    };
    const packet = buildModeEvidencePacket(
      modes,
      [wrongArtifactRun],
      [artifact(wrongArtifactRun.id)],
      verificationFor([wrongArtifactRun]),
    );

    expect(packet.complete).toBe(false);
    expect(packet.items.find((item) => item.modeId === "bracket")?.status).toBe("needs-artifact");
    expect(packet.items.find((item) => item.modeId === "bracket")?.missing).toContain("bracket-path artifact");
    expect(packet.nextAction).toContain("bracket-path artifact");
  });
});
