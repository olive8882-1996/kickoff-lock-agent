import { createDemoProof, sha256, stableJson } from "./proof";
import type { GameMode, GameModeRun, MemoryRecord, ModeArtifact } from "./types";

export type ModeReadiness = {
  modeId: GameMode["id"];
  eligibleRecords: MemoryRecord[];
  requirements: string[];
  ready: boolean;
  nextAction: string;
};

const revealed = (records: MemoryRecord[]) => records.filter((record) => record.result);

export const getModeReadiness = (
  modeId: GameMode["id"],
  records: MemoryRecord[],
): ModeReadiness => {
  const locked = records.filter((record) => record.capsule.locked);
  const scored = revealed(records);
  if (modeId === "bracket") {
    return {
      modeId,
      eligibleRecords: locked.slice(0, 4),
      requirements: ["4 sealed knockout path picks", "At least 2 revealed results for scoring"],
      ready: locked.length >= 4,
      nextAction: locked.length >= 4 ? "Seal bracket path proof" : `Seal ${4 - locked.length} more picks`,
    };
  }
  if (modeId === "parlay") {
    const parlayRecords = locked.filter((record) => record.capsule.prediction.markets.length > 0);
    return {
      modeId,
      eligibleRecords: parlayRecords.slice(0, 3),
      requirements: ["3 sealed match capsules", "Market picks included in each capsule"],
      ready: parlayRecords.length >= 3,
      nextAction: parlayRecords.length >= 3 ? "Seal parlay proof" : `Seal ${3 - parlayRecords.length} more market locks`,
    };
  }
  if (modeId === "agent-vs-human") {
    return {
      modeId,
      eligibleRecords: scored.slice(0, 3),
      requirements: ["At least 1 revealed lock", "Agent review generated after reveal"],
      ready: scored.length >= 1,
      nextAction: scored.length >= 1 ? "Seal calibration proof" : "Reveal one locked prediction",
    };
  }
  const upsetRecords = locked.filter((record) => record.capsule.prediction.confidence <= 58);
  return {
    modeId,
    eligibleRecords: upsetRecords.slice(0, 3),
    requirements: ["At least 1 low-confidence or underdog-style sealed pick", "Public leaderboard multiplier after reveal"],
    ready: upsetRecords.length >= 1,
    nextAction: upsetRecords.length >= 1 ? "Seal upset challenge proof" : "Create a bold lower-confidence lock",
  };
};

const createModeArtifact = (modeId: GameMode["id"], records: MemoryRecord[]): ModeArtifact | undefined => {
  if (modeId === "parlay") {
    const legs = records.map((record) => ({
      capsuleId: record.capsule.id,
      matchLabel: record.capsule.matchLabel,
      pick: record.capsule.prediction.winner,
      confidence: record.capsule.prediction.confidence,
      markets: record.capsule.prediction.markets,
      resultScore: record.result?.totalScore,
      winnerHit: record.result ? record.result.breakdown.winner > 0 : undefined,
    }));
    return {
      kind: "parlay-ticket",
      legs,
      settledLegs: legs.filter((leg) => leg.resultScore !== undefined).length,
      hitLegs: legs.filter((leg) => leg.winnerHit).length,
    };
  }
  if (modeId === "agent-vs-human") {
    const samples = records
      .filter((record) => record.result)
      .map((record) => {
        const totalScore = record.result?.totalScore ?? 0;
        return {
          capsuleId: record.capsule.id,
          matchLabel: record.capsule.matchLabel,
          confidence: record.capsule.prediction.confidence,
          totalScore,
          winnerHit: (record.result?.breakdown.winner ?? 0) > 0,
          calibrationError: Math.abs(record.capsule.prediction.confidence - totalScore),
          review: record.result?.agentReview ?? [],
        };
      });
    const averageCalibrationError =
      samples.length > 0
        ? Math.round(samples.reduce((sum, sample) => sum + sample.calibrationError, 0) / samples.length)
        : 0;
    return {
      kind: "agent-calibration",
      samples,
      averageCalibrationError,
    };
  }
  if (modeId === "upset") {
    const picks = records.map((record) => {
      const winnerHit = record.result ? record.result.breakdown.winner > 0 : undefined;
      const multiplier = record.capsule.prediction.confidence <= 45 ? 3 : 2;
      return {
        capsuleId: record.capsule.id,
        matchLabel: record.capsule.matchLabel,
        predictedWinner: record.capsule.prediction.winner,
        confidence: record.capsule.prediction.confidence,
        resultScore: record.result?.totalScore,
        winnerHit,
        multiplier,
      };
    });
    const resolvedPicks = picks.filter((pick) => pick.resultScore !== undefined).length;
    const hitPicks = picks.filter((pick) => pick.winnerHit).length;
    return {
      kind: "upset-ticket",
      picks,
      resolvedPicks,
      hitPicks,
      bonusXp: picks.reduce((sum, pick) => sum + (pick.winnerHit ? pick.multiplier * 50 : 0), 0),
    };
  }
  return undefined;
};

const scoreModeArtifact = (artifact: ModeArtifact | undefined, fallbackScore: number | undefined) => {
  if (!artifact) return fallbackScore;
  if (artifact.kind === "agent-calibration") {
    return artifact.samples.length > 0 ? Math.max(0, 100 - artifact.averageCalibrationError) : fallbackScore;
  }
  if (artifact.kind === "parlay-ticket") {
    return artifact.settledLegs > 0 ? Math.round((artifact.hitLegs / artifact.settledLegs) * 100) : fallbackScore;
  }
  if (artifact.kind === "upset-ticket") {
    return artifact.resolvedPicks > 0 ? Math.round((artifact.hitPicks / artifact.resolvedPicks) * 100) : fallbackScore;
  }
  return fallbackScore;
};

const summarizeModeRun = (
  mode: GameMode,
  capsuleCount: number,
  artifact: ModeArtifact | undefined,
  score: number | undefined,
) => {
  if (artifact?.kind === "parlay-ticket") {
    return `Parlay ticket sealed with ${artifact.legs.length} legs${score !== undefined ? ` · ${artifact.hitLegs}/${artifact.settledLegs} settled hits` : ""}.`;
  }
  if (artifact?.kind === "agent-calibration") {
    return `Agent calibration sealed with ${artifact.samples.length} revealed samples · avg error ${artifact.averageCalibrationError}.`;
  }
  if (artifact?.kind === "upset-ticket") {
    return `Upset challenge sealed with ${artifact.picks.length} bold pick${artifact.picks.length === 1 ? "" : "s"} · ${artifact.bonusXp} bonus XP.`;
  }
  return `${mode.title} sealed with ${capsuleCount} capsule${capsuleCount === 1 ? "" : "s"}.`;
};

export const createGameModeRun = async (
  mode: GameMode,
  records: MemoryRecord[],
): Promise<GameModeRun> => {
  const readiness = getModeReadiness(mode.id, records);
  if (!readiness.ready) throw new Error(readiness.nextAction);
  const scored = readiness.eligibleRecords.filter((record) => record.result);
  const fallbackScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0) / scored.length)
      : undefined;
  const artifact = createModeArtifact(mode.id, readiness.eligibleRecords);
  const score = scoreModeArtifact(artifact, fallbackScore);
  const payload = {
    modeId: mode.id,
    title: mode.title,
    createdAt: new Date().toISOString(),
    capsuleIds: readiness.eligibleRecords.map((record) => record.capsule.id),
    artifact,
    score,
  };
  const payloadHash = await sha256(stableJson(payload));
  return {
    id: `mode-${mode.id}-${payloadHash.slice(0, 10)}`,
    modeId: mode.id,
    title: mode.title,
    createdAt: payload.createdAt,
    capsuleIds: payload.capsuleIds,
    payloadHash,
    filecoinProof: createDemoProof(payloadHash),
    status: score === undefined ? "sealed" : "scored",
    score,
    summary: summarizeModeRun(mode, payload.capsuleIds.length, artifact, score),
    requirements: readiness.requirements,
    artifact,
  };
};
