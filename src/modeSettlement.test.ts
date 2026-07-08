import { describe, expect, it } from "vitest";
import { buildModeSettlementPacket } from "./modeSettlement";
import type { ModeEvidencePacket } from "./modeEvidence";
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

const productionEvidence = (claims: ModeEvidencePacket["acceptanceClaims"]): ModeEvidencePacket => ({
  complete: claims.every((claim) => claim.accepted),
  passedModes: claims.filter((claim) => claim.accepted).length,
  totalModes: claims.length,
  modeRuns: claims.length,
  realFilecoinModes: claims.filter((claim) => claim.filecoinReady).length,
  cloudModes: claims.filter((claim) => claim.cloudReadBack).length,
  publicProofModes: claims.filter((claim) => claim.publicProofReady).length,
  shareCardModes: claims.filter((claim) => claim.shareCardReady).length,
  missingModes: claims.filter((claim) => !claim.accepted).map((claim) => claim.modeId),
  items: [],
  acceptanceClaims: claims,
  summary: `${claims.filter((claim) => claim.accepted).length}/${claims.length} tournament modes production-ready`,
  nextAction: "Finish mode evidence.",
  copyText: "mode evidence",
});

const acceptedClaim = (
  modeId: GameModeRun["modeId"],
  title: string,
  runId: string,
  artifactKind: ModeEvidencePacket["acceptanceClaims"][number]["expectedArtifactKind"],
): ModeEvidencePacket["acceptanceClaims"][number] => ({
  modeId,
  title,
  accepted: true,
  runId,
  artifactKind,
  expectedArtifactKind: artifactKind,
  payloadHash: "a".repeat(64),
  cid: `bafy-${runId}`,
  proofStatus: "verified",
  proofUrl: `https://example.com/kickoff-lock-agent/?mode=${runId}`,
  shareImageUrl: `https://cdn.example.com/${runId}.png`,
  artifactReady: true,
  payloadHashReady: true,
  filecoinReady: true,
  cloudReadBack: true,
  publicProofReady: true,
  shareCardReady: true,
  missing: [],
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
          chainResolvedLegs: 3,
          chainHitLegs: 1,
          chainBustedAt: 2,
          chainStatus: "busted",
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
      baseRun({
        id: "mode-group",
        modeId: "group-path",
        title: "Group path",
        status: "scored",
        score: 50,
        artifact: {
          kind: "group-table-path",
          table: [
            { team: "Spain", projectedRank: 1, predictedPoints: 6, predictedGoalDifference: 2, actualPoints: 3, actualGoalDifference: 1, locks: 2 },
            { team: "Brazil", projectedRank: 2, predictedPoints: 4, predictedGoalDifference: 1, actualPoints: 3, actualGoalDifference: 2, locks: 2 },
          ],
          picks: [
            { capsuleId: "cap-group-1", matchLabel: "Spain vs Japan", predictedWinner: "Spain", predictedScore: "2-1", actualScore: "1-0", winnerHit: true },
            { capsuleId: "cap-group-2", matchLabel: "Brazil vs Canada", predictedWinner: "Draw", predictedScore: "1-1", actualScore: "2-0", winnerHit: false },
          ],
          resolvedMatches: 2,
          winnerHits: 1,
          topTwo: ["Spain", "Brazil"],
        },
      }),
    ]);

    expect(packet.runs).toBe(5);
    expect(packet.settledRuns).toBe(4);
    expect(packet.pendingRuns).toBe(1);
    expect(packet.averageScore).toBe(75);
    expect(packet.bonusXp).toBe(150);
    expect(packet.items.find((item) => item.modeId === "bracket")?.status).toBe("pending");
    expect(packet.items.find((item) => item.modeId === "parlay")?.summary).toContain("busted at leg 2");
    expect(packet.items.find((item) => item.modeId === "parlay")?.reward).toBe("1/3 chain hits");
    expect(packet.items.find((item) => item.modeId === "group-path")).toMatchObject({
      status: "settled",
      reward: "1/2 winner hits",
    });
    expect(packet.copyText).toContain("Bonus XP: 150");
  });

  it("returns an actionable empty packet before any modes are created", () => {
    const packet = buildModeSettlementPacket([]);

    expect(packet.summary).toBe("No mode proof runs have been created yet.");
    expect(packet.nextAction).toBe("Create a bracket, parlay, Agent vs Human, group path or upset proof to start settlement tracking.");
    expect(packet.copyText).toContain("Pending: 0");
  });

  it("settles bracket paths from resolved and hit knockout picks", () => {
    const packet = buildModeSettlementPacket([
      baseRun({
        id: "mode-bracket-scored",
        modeId: "bracket",
        title: "Bracket path",
        status: "scored",
        score: 50,
        artifact: {
          kind: "bracket-path",
          resolvedPicks: 2,
          hitPicks: 1,
          settlements: [
            { capsuleId: "cap-1", matchLabel: "A vs B", stage: "R16", predictedWinner: "A", confidence: 60, resultScore: 80, winnerHit: true },
            { capsuleId: "cap-2", matchLabel: "C vs D", stage: "QF", predictedWinner: "C", confidence: 62, resultScore: 40, winnerHit: false },
          ],
          bracketPath: {
            id: "bracket-scored",
            title: "Path",
            createdAt: "2099-07-01T12:00:00.000Z",
            updatedAt: "2099-07-01T12:00:00.000Z",
            picks: [
              { id: "pick-1", matchId: "m1", matchLabel: "A vs B", stage: "R16", winner: "A", confidence: 60, note: "note" },
              { id: "pick-2", matchId: "m2", matchLabel: "C vs D", stage: "QF", winner: "C", confidence: 62, note: "note" },
            ],
          },
        },
      }),
    ]);

    expect(packet.settledRuns).toBe(1);
    expect(packet.pendingRuns).toBe(0);
    expect(packet.items[0]).toMatchObject({
      status: "settled",
      settled: 2,
      total: 2,
      score: 50,
      reward: "1/2 path hits",
    });
    expect(packet.items[0]?.summary).toContain("2/2 knockout path picks resolved · 1 hits");
  });

  it("combines settlement rows with production mode evidence", () => {
    const parlayRun = baseRun({
      id: "mode-parlay",
      modeId: "parlay",
      title: "Multi-match parlay",
      status: "scored",
      score: 100,
      artifact: {
        kind: "parlay-ticket",
        legs: [
          { capsuleId: "cap-1", matchLabel: "A vs B", pick: "A", confidence: 62, markets: [], resultScore: 80, winnerHit: true },
        ],
        settledLegs: 1,
        hitLegs: 1,
      },
    });
    const upsetRun = baseRun({
      id: "mode-upset",
      modeId: "upset",
      title: "Upset Challenge",
      artifact: {
        kind: "upset-ticket",
        picks: [
          {
            capsuleId: "cap-upset",
            matchLabel: "Underdog vs Favorite",
            predictedWinner: "Underdog",
            confidence: 44,
            multiplier: 3,
          },
        ],
        resolvedPicks: 0,
        hitPicks: 0,
        bonusXp: 0,
      },
    });
    const evidence: ModeEvidencePacket = {
      complete: false,
      passedModes: 1,
      totalModes: 2,
      modeRuns: 2,
      realFilecoinModes: 1,
      cloudModes: 1,
      publicProofModes: 1,
      shareCardModes: 1,
      missingModes: ["upset"],
      items: [],
      acceptanceClaims: [
        {
          modeId: "parlay",
          title: "Multi-match parlay",
          accepted: true,
          runId: "mode-parlay",
          artifactKind: "parlay-ticket",
          expectedArtifactKind: "parlay-ticket",
          payloadHash: "a".repeat(64),
          cid: "bafy-real",
          proofStatus: "verified",
          proofUrl: "https://example.com/proof/mode-parlay",
          shareImageUrl: "https://example.com/share/mode-parlay.png",
          artifactReady: true,
          payloadHashReady: true,
          filecoinReady: true,
          cloudReadBack: true,
          publicProofReady: true,
          shareCardReady: true,
          missing: [],
        },
        {
          modeId: "upset",
          title: "Upset Challenge",
          accepted: false,
          runId: "mode-upset",
          artifactKind: "upset-ticket",
          expectedArtifactKind: "upset-ticket",
          payloadHash: "a".repeat(64),
          artifactReady: true,
          payloadHashReady: true,
          filecoinReady: false,
          cloudReadBack: false,
          publicProofReady: false,
          shareCardReady: false,
          missing: ["real Filecoin proof"],
        },
      ],
      summary: "1/2 tournament modes production-ready",
      nextAction: "Finish real Filecoin proof for Upset Challenge.",
      copyText: "mode evidence",
    };

    const packet = buildModeSettlementPacket([parlayRun, upsetRun], evidence);

    expect(packet.productionComplete).toBe(false);
    expect(packet.acceptedModes).toBe(1);
    expect(packet.blockedModes).toBe(1);
    expect(packet.settlementReadyModes).toBe(1);
    expect(packet.nextAction).toBe("Finish real Filecoin proof for Upset Challenge.");
    expect(packet.acceptanceItems.find((item) => item.modeId === "parlay")).toMatchObject({
      productionReady: true,
      settlementReady: true,
      settlementStatus: "settled",
    });
    expect(packet.acceptanceItems.find((item) => item.modeId === "upset")?.missing).toEqual([
      "real Filecoin proof",
      "settlement score or resolved picks",
    ]);
    expect(packet.copyText).toContain("Production accepted: 1/2");
    expect(packet.copyText).toContain("upset: blocked");
  });

  it("does not mark production complete when accepted mode proofs have not settled", () => {
    const bracketRun = baseRun({
      id: "mode-bracket",
      modeId: "bracket",
      title: "Bracket path",
      artifact: {
        kind: "bracket-path",
        bracketPath: {
          id: "bracket-unsettled",
          title: "Path",
          createdAt: "2099-07-01T12:00:00.000Z",
          updatedAt: "2099-07-01T12:00:00.000Z",
          picks: [{ id: "pick-1", matchId: "m1", matchLabel: "A vs B", stage: "R16", winner: "A", confidence: 60, note: "note" }],
        },
      },
    });
    const evidence = productionEvidence([
      acceptedClaim("bracket", "Bracket path", "mode-bracket", "bracket-path"),
    ]);

    const packet = buildModeSettlementPacket([bracketRun], evidence);

    expect(packet.productionComplete).toBe(false);
    expect(packet.acceptedModes).toBe(1);
    expect(packet.settlementReadyModes).toBe(0);
    expect(packet.nextAction).toBe("Finish settlement score or resolved picks for Bracket path.");
    expect(packet.summary).toContain("1/1 production accepted · 0/1 settlement-ready");
  });

  it("marks production complete only when every accepted production mode is settlement-ready", () => {
    const bracketRun = baseRun({
      id: "mode-bracket",
      modeId: "bracket",
      title: "Bracket path",
      status: "scored",
      score: 75,
      artifact: {
        kind: "bracket-path",
        resolvedPicks: 1,
        hitPicks: 1,
        bracketPath: {
          id: "bracket-settled",
          title: "Path",
          createdAt: "2099-07-01T12:00:00.000Z",
          updatedAt: "2099-07-01T12:00:00.000Z",
          picks: [{ id: "pick-1", matchId: "m1", matchLabel: "A vs B", stage: "R16", winner: "A", confidence: 60, note: "note" }],
        },
      },
    });
    const evidence = productionEvidence([
      acceptedClaim("bracket", "Bracket path", "mode-bracket", "bracket-path"),
    ]);

    const packet = buildModeSettlementPacket([bracketRun], evidence);

    expect(packet.productionComplete).toBe(true);
    expect(packet.acceptedModes).toBe(1);
    expect(packet.settlementReadyModes).toBe(1);
    expect(packet.nextAction).toBe("All mode proof runs have a settlement summary.");
    expect(packet.copyText).toContain("Settlement-ready modes: 1/1");
  });
});
