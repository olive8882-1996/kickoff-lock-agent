import type { GameMode, GameModeRun } from "./types";

export type ModeSettlementStatus = "settled" | "scorable" | "pending";

export type ModeSettlementItem = {
  modeId: GameMode["id"];
  title: string;
  runId: string;
  status: ModeSettlementStatus;
  settled: number;
  total: number;
  score?: number;
  reward: string;
  summary: string;
  nextAction: string;
};

export type ModeSettlementPacket = {
  runs: number;
  settledRuns: number;
  scorableRuns: number;
  pendingRuns: number;
  averageScore: number;
  bonusXp: number;
  items: ModeSettlementItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const statusFor = (settled: number, total: number, score?: number): ModeSettlementStatus => {
  if (total > 0 && settled >= total && score !== undefined) return "settled";
  if (settled > 0 || score !== undefined) return "scorable";
  return "pending";
};

const itemFor = (run: GameModeRun): ModeSettlementItem => {
  const artifact = run.artifact;
  if (artifact?.kind === "parlay-ticket") {
    const status = statusFor(artifact.settledLegs, artifact.legs.length, run.score);
    return {
      modeId: run.modeId,
      title: run.title,
      runId: run.id,
      status,
      settled: artifact.settledLegs,
      total: artifact.legs.length,
      score: run.score,
      reward: `${artifact.hitLegs}/${artifact.settledLegs || artifact.legs.length} hits`,
      summary: `${run.title} · ${artifact.settledLegs}/${artifact.legs.length} legs settled · ${artifact.hitLegs} hits`,
      nextAction: status === "settled" ? "Parlay can be shown as a settled ticket." : "Reveal the remaining parlay legs.",
    };
  }
  if (artifact?.kind === "agent-calibration") {
    const status = statusFor(artifact.samples.length, Math.max(1, artifact.samples.length), run.score);
    return {
      modeId: run.modeId,
      title: run.title,
      runId: run.id,
      status,
      settled: artifact.samples.length,
      total: Math.max(1, artifact.samples.length),
      score: run.score,
      reward: `Avg error ${artifact.averageCalibrationError}`,
      summary: `${run.title} · ${artifact.samples.length} calibration sample${artifact.samples.length === 1 ? "" : "s"} · avg error ${artifact.averageCalibrationError}`,
      nextAction: status === "settled" ? "Calibration report is ready for public comparison." : "Reveal at least one prediction before calibration.",
    };
  }
  if (artifact?.kind === "upset-ticket") {
    const status = statusFor(artifact.resolvedPicks, artifact.picks.length, run.score);
    return {
      modeId: run.modeId,
      title: run.title,
      runId: run.id,
      status,
      settled: artifact.resolvedPicks,
      total: artifact.picks.length,
      score: run.score,
      reward: `${artifact.bonusXp} bonus XP`,
      summary: `${run.title} · ${artifact.resolvedPicks}/${artifact.picks.length} upsets resolved · ${artifact.hitPicks} hits`,
      nextAction: status === "settled" ? "Upset bonus can be awarded." : "Reveal the remaining upset picks.",
    };
  }
  if (artifact?.kind === "bracket-path") {
    const total = artifact.bracketPath.picks.length;
    const status = run.score !== undefined ? "settled" : "pending";
    return {
      modeId: run.modeId,
      title: run.title,
      runId: run.id,
      status,
      settled: run.score !== undefined ? total : 0,
      total,
      score: run.score,
      reward: `${total} path picks`,
      summary: `${run.title} · ${total} knockout path picks sealed`,
      nextAction: status === "settled" ? "Bracket path has a scored settlement." : "Resolve knockout path picks as results arrive.",
    };
  }
  return {
    modeId: run.modeId,
    title: run.title,
    runId: run.id,
    status: run.score !== undefined ? "scorable" : "pending",
    settled: run.score !== undefined ? 1 : 0,
    total: 1,
    score: run.score,
    reward: "Generic proof",
    summary: run.summary,
    nextAction: run.score !== undefined ? "Mode proof has a score." : "Attach a mode artifact or score.",
  };
};

export const buildModeSettlementPacket = (runs: GameModeRun[]): ModeSettlementPacket => {
  const items = runs.map(itemFor).sort((a, b) => {
    const score = (item: ModeSettlementItem) =>
      (item.status === "settled" ? 3 : item.status === "scorable" ? 2 : 1) +
      (item.score ?? 0) / 1000;
    return score(b) - score(a);
  });
  const settledRuns = items.filter((item) => item.status === "settled").length;
  const scorableRuns = items.filter((item) => item.status === "scorable").length;
  const pendingRuns = items.filter((item) => item.status === "pending").length;
  const scored = items.filter((item) => item.score !== undefined);
  const averageScore =
    scored.length > 0 ? Math.round(scored.reduce((sum, item) => sum + (item.score ?? 0), 0) / scored.length) : 0;
  const bonusXp = items.reduce((sum, item) => {
    const match = item.reward.match(/^(\d+) bonus XP$/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
  const nextAction =
    items.length === 0
      ? "Create a bracket, parlay, Agent vs Human or upset proof to start settlement tracking."
      : items.find((item) => item.status !== "settled")?.nextAction ??
        "All mode proof runs have a settlement summary.";
  const summary =
    items.length === 0
      ? "No mode proof runs have been created yet."
      : `${settledRuns}/${items.length} mode proof runs settled · ${averageScore}/100 avg score · ${bonusXp} bonus XP`;
  const copyText = [
    "Kickoff Lock Agent mode settlement",
    summary,
    `Settled: ${settledRuns}`,
    `Scorable: ${scorableRuns}`,
    `Pending: ${pendingRuns}`,
    `Average score: ${averageScore}`,
    `Bonus XP: ${bonusXp}`,
    `Next action: ${nextAction}`,
    ...items.map((item) => `${item.modeId}: ${item.status} · ${item.settled}/${item.total} · ${item.reward}`),
  ].join("\n");

  return {
    runs: items.length,
    settledRuns,
    scorableRuns,
    pendingRuns,
    averageScore,
    bonusXp,
    items,
    summary,
    nextAction,
    copyText,
  };
};
