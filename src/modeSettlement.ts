import type { GameMode, GameModeRun } from "./types";
import type { ModeEvidencePacket } from "./modeEvidence";

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
  requiredModes: number;
  acceptedModes: number;
  blockedModes: number;
  settlementReadyModes: number;
  productionComplete: boolean;
  averageScore: number;
  bonusXp: number;
  items: ModeSettlementItem[];
  acceptanceItems: ModeSettlementAcceptanceItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

export type ModeSettlementAcceptanceItem = {
  modeId: GameMode["id"];
  title: string;
  runId?: string;
  accepted: boolean;
  settlementStatus?: ModeSettlementStatus;
  score?: number;
  productionReady: boolean;
  settlementReady: boolean;
  missing: string[];
  nextAction: string;
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
    const chainHitLegs = artifact.chainHitLegs ?? artifact.hitLegs;
    const chainStatus =
      artifact.chainBustedAt !== undefined
        ? `busted at leg ${artifact.chainBustedAt}`
        : artifact.chainStatus === "complete"
          ? "completed"
          : "live";
    return {
      modeId: run.modeId,
      title: run.title,
      runId: run.id,
      status,
      settled: artifact.settledLegs,
      total: artifact.legs.length,
      score: run.score,
      reward: `${chainHitLegs}/${artifact.legs.length} chain hits`,
      summary: `${run.title} · ${artifact.settledLegs}/${artifact.legs.length} legs settled · ${chainStatus} · ${chainHitLegs} chain hits`,
      nextAction: status === "settled" ? "Parlay chain can be shown as a settled ticket." : "Reveal the remaining parlay chain legs.",
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
  if (artifact?.kind === "group-table-path") {
    const status = statusFor(artifact.resolvedMatches, artifact.picks.length, run.score);
    const topTwo = artifact.topTwo.join(" / ") || "pending";
    return {
      modeId: run.modeId,
      title: run.title,
      runId: run.id,
      status,
      settled: artifact.resolvedMatches,
      total: artifact.picks.length,
      score: run.score,
      reward: `${artifact.winnerHits}/${artifact.resolvedMatches || artifact.picks.length} winner hits`,
      summary: `${run.title} · ${artifact.resolvedMatches}/${artifact.picks.length} group locks resolved · projected top two ${topTwo}`,
      nextAction: status === "settled" ? "Group path table has a scored settlement." : "Reveal the remaining group path locks.",
    };
  }
  if (artifact?.kind === "bracket-path") {
    const total = artifact.bracketPath.picks.length;
    const settled = artifact.resolvedPicks ?? (run.score !== undefined ? total : 0);
    const hits = artifact.hitPicks ?? 0;
    const status = statusFor(settled, total, run.score);
    return {
      modeId: run.modeId,
      title: run.title,
      runId: run.id,
      status,
      settled,
      total,
      score: run.score,
      reward: `${hits}/${settled || total} path hits`,
      summary: `${run.title} · ${settled}/${total} knockout path picks resolved · ${hits} hits`,
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

const buildAcceptanceItems = (
  items: ModeSettlementItem[],
  evidence?: ModeEvidencePacket,
): ModeSettlementAcceptanceItem[] => {
  if (!evidence) return [];
  return evidence.acceptanceClaims.map((claim) => {
    const settlement = items.find((item) => item.modeId === claim.modeId && (!claim.runId || item.runId === claim.runId));
    const settlementReady = Boolean(settlement && settlement.status !== "pending");
    const missing = [
      ...claim.missing,
      ...(settlement ? [] : ["mode settlement row"]),
      ...(settlementReady ? [] : ["settlement score or resolved picks"]),
    ];
    return {
      modeId: claim.modeId,
      title: claim.title,
      runId: claim.runId,
      accepted: claim.accepted,
      settlementStatus: settlement?.status,
      score: settlement?.score,
      productionReady: claim.accepted,
      settlementReady,
      missing,
      nextAction:
        claim.accepted && settlementReady
          ? `${claim.title} is ready for the mode settlement packet.`
          : `Finish ${missing[0] ?? "mode evidence"} for ${claim.title}.`,
    };
  });
};

export const buildModeSettlementPacket = (runs: GameModeRun[], evidence?: ModeEvidencePacket): ModeSettlementPacket => {
  const items = runs.map(itemFor).sort((a, b) => {
    const score = (item: ModeSettlementItem) =>
      (item.status === "settled" ? 3 : item.status === "scorable" ? 2 : 1) +
      (item.score ?? 0) / 1000;
    return score(b) - score(a);
  });
  const acceptanceItems = buildAcceptanceItems(items, evidence);
  const settledRuns = items.filter((item) => item.status === "settled").length;
  const scorableRuns = items.filter((item) => item.status === "scorable").length;
  const pendingRuns = items.filter((item) => item.status === "pending").length;
  const requiredModes = evidence?.totalModes ?? 0;
  const acceptedModes = acceptanceItems.filter((item) => item.productionReady).length;
  const blockedModes = acceptanceItems.filter((item) => !item.productionReady).length;
  const settlementReadyModes = acceptanceItems.filter((item) => item.settlementReady).length;
  const productionComplete = Boolean(
    evidence?.complete &&
      requiredModes > 0 &&
      acceptedModes === requiredModes &&
      settlementReadyModes === requiredModes,
  );
  const scored = items.filter((item) => item.score !== undefined);
  const averageScore =
    scored.length > 0 ? Math.round(scored.reduce((sum, item) => sum + (item.score ?? 0), 0) / scored.length) : 0;
  const bonusXp = items.reduce((sum, item) => {
    const match = item.reward.match(/^(\d+) bonus XP$/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
  const nextAction =
    items.length === 0
      ? "Create a bracket, parlay, Agent vs Human, group path or upset proof to start settlement tracking."
      : evidence && !evidence.complete
        ? evidence.nextAction
      : evidence && !productionComplete
        ? acceptanceItems.find((item) => !item.settlementReady)?.nextAction ??
          "Settle every required production mode before marking the mode package complete."
      : acceptanceItems.find((item) => !item.settlementReady)?.nextAction ??
        items.find((item) => item.status !== "settled")?.nextAction ??
        "All mode proof runs have a settlement summary.";
  const summary =
    items.length === 0
      ? "No mode proof runs have been created yet."
      : evidence
        ? `${settledRuns}/${items.length} mode proof runs settled · ${acceptedModes}/${requiredModes} production accepted · ${settlementReadyModes}/${requiredModes} settlement-ready · ${averageScore}/100 avg score · ${bonusXp} bonus XP`
        : `${settledRuns}/${items.length} mode proof runs settled · ${averageScore}/100 avg score · ${bonusXp} bonus XP`;
  const copyText = [
    "Kickoff Lock Agent mode settlement",
    summary,
    `Settled: ${settledRuns}`,
    `Scorable: ${scorableRuns}`,
    `Pending: ${pendingRuns}`,
    `Production accepted: ${acceptedModes}/${requiredModes}`,
    `Settlement-ready modes: ${settlementReadyModes}/${requiredModes}`,
    `Blocked modes: ${blockedModes}`,
    `Average score: ${averageScore}`,
    `Bonus XP: ${bonusXp}`,
    `Next action: ${nextAction}`,
    ...(acceptanceItems.length > 0
      ? [
          "Mode acceptance:",
          ...acceptanceItems.map(
            (item) =>
              `${item.modeId}: ${item.productionReady ? "accepted" : "blocked"} · settlement ${item.settlementStatus ?? "missing"} · score ${item.score ?? "pending"} · missing ${item.missing.join(", ") || "none"}`,
          ),
        ]
      : []),
    ...items.map((item) => `${item.modeId}: ${item.status} · ${item.settled}/${item.total} · ${item.reward}`),
  ].join("\n");

  return {
    runs: items.length,
    settledRuns,
    scorableRuns,
    pendingRuns,
    requiredModes,
    acceptedModes,
    blockedModes,
    settlementReadyModes,
    productionComplete,
    averageScore,
    bonusXp,
    items,
    acceptanceItems,
    summary,
    nextAction,
    copyText,
  };
};
