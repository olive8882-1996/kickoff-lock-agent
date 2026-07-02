import { createDemoProof, sha256, stableJson } from "./proof";
import type { GameMode, GameModeRun, MemoryRecord } from "./types";

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
    return {
      modeId,
      eligibleRecords: locked.slice(0, 3),
      requirements: ["3 sealed match capsules", "Market picks included in each capsule"],
      ready: locked.length >= 3,
      nextAction: locked.length >= 3 ? "Seal parlay proof" : `Seal ${3 - locked.length} more picks`,
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

export const createGameModeRun = async (
  mode: GameMode,
  records: MemoryRecord[],
): Promise<GameModeRun> => {
  const readiness = getModeReadiness(mode.id, records);
  if (!readiness.ready) throw new Error(readiness.nextAction);
  const scored = readiness.eligibleRecords.filter((record) => record.result);
  const score =
    scored.length > 0
      ? Math.round(scored.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0) / scored.length)
      : undefined;
  const payload = {
    modeId: mode.id,
    title: mode.title,
    createdAt: new Date().toISOString(),
    capsuleIds: readiness.eligibleRecords.map((record) => record.capsule.id),
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
    summary: `${mode.title} sealed with ${payload.capsuleIds.length} capsule${payload.capsuleIds.length === 1 ? "" : "s"}.`,
    requirements: readiness.requirements,
  };
};
