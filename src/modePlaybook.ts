import { isBracketPathReady } from "./bracket";
import { requiredProductionModeIds, type ModeEvidencePacket } from "./modeEvidence";
import { getModeReadiness } from "./modes";
import type { BracketPath, GameMode, GameModeRun, MemoryRecord } from "./types";

export type ModePlaybookStatus = "sealed" | "ready-to-seal" | "needs-input";

export type ModePlaybookItem = {
  modeId: GameMode["id"];
  title: string;
  status: ModePlaybookStatus;
  eligibleCount: number;
  requiredCount: number;
  runCount: number;
  latestRunId?: string;
  requirements: string[];
  nextAction: string;
};

export type ModeCreationQueueItem = {
  modeId: GameMode["id"];
  title: string;
  status: ModePlaybookStatus;
  runnable: boolean;
  latestRunId?: string;
  nextAction: string;
};

export type ModePlaybookPacket = {
  complete: boolean;
  productionComplete: boolean;
  sealedModes: number;
  productionReadyModes: number;
  readyToSealModes: number;
  totalModes: number;
  totalRuns: number;
  productionMissingModes: GameMode["id"][];
  items: ModePlaybookItem[];
  queue: ModeCreationQueueItem[];
  runnableQueue: number;
  summary: string;
  nextAction: string;
  copyText: string;
};

const requiredCounts: Record<GameMode["id"], number> = {
  bracket: 4,
  parlay: 3,
  "agent-vs-human": 1,
  upset: 1,
  "group-path": 4,
  "penalty-pressure": 2,
};

const latestRunFor = (modeId: GameMode["id"], runs: GameModeRun[]) =>
  runs
    .filter((run) => run.modeId === modeId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

const modeRunsFor = (modeId: GameMode["id"], runs: GameModeRun[]) =>
  runs.filter((run) => run.modeId === modeId);

const buildBracketItem = (
  mode: GameMode,
  bracketPath: BracketPath,
  runs: GameModeRun[],
): ModePlaybookItem => {
  const latestRun = latestRunFor("bracket", runs);
  const runCount = modeRunsFor("bracket", runs).length;
  const ready = isBracketPathReady(bracketPath);
  const status: ModePlaybookStatus = latestRun ? "sealed" : ready ? "ready-to-seal" : "needs-input";
  return {
    modeId: "bracket",
    title: mode.title,
    status,
    eligibleCount: bracketPath.picks.length,
    requiredCount: requiredCounts.bracket,
    runCount,
    latestRunId: latestRun?.id,
    requirements: ["4 knockout path picks", "winner on every pick", "confidence on every pick"],
    nextAction: latestRun
      ? "Bracket path proof exists; add real Filecoin, cloud read-back and share card evidence."
      : ready
        ? "Seal bracket proof from the knockout path builder."
        : `Complete ${requiredCounts.bracket - bracketPath.picks.length} more knockout path pick${requiredCounts.bracket - bracketPath.picks.length === 1 ? "" : "s"}.`,
  };
};

const buildStandardItem = (
  mode: GameMode,
  records: MemoryRecord[],
  runs: GameModeRun[],
): ModePlaybookItem => {
  const readiness = getModeReadiness(mode.id, records);
  const latestRun = latestRunFor(mode.id, runs);
  const runCount = modeRunsFor(mode.id, runs).length;
  const status: ModePlaybookStatus = latestRun ? "sealed" : readiness.ready ? "ready-to-seal" : "needs-input";
  return {
    modeId: mode.id,
    title: mode.title,
    status,
    eligibleCount: readiness.eligibleRecords.length,
    requiredCount: requiredCounts[mode.id],
    runCount,
    latestRunId: latestRun?.id,
    requirements: readiness.requirements,
    nextAction: latestRun
      ? `${mode.title} proof run exists; finish production evidence for this mode.`
      : readiness.ready
        ? `Create ${mode.title} mode proof.`
        : readiness.nextAction,
  };
};

export const buildModePlaybookPacket = ({
  modes,
  records,
  bracketPath,
  runs,
  productionEvidence,
}: {
  modes: GameMode[];
  records: MemoryRecord[];
  bracketPath: BracketPath;
  runs: GameModeRun[];
  productionEvidence?: ModeEvidencePacket;
}): ModePlaybookPacket => {
  const items = modes.map((mode) =>
    mode.id === "bracket"
      ? buildBracketItem(mode, bracketPath, runs)
      : buildStandardItem(mode, records, runs),
  );
  const queue = items
    .filter((item) => item.status !== "sealed")
    .map<ModeCreationQueueItem>((item) => ({
      modeId: item.modeId,
      title: item.title,
      status: item.status,
      runnable: item.status === "ready-to-seal",
      latestRunId: item.latestRunId,
      nextAction: item.nextAction,
    }));
  const runnableQueue = queue.filter((item) => item.runnable).length;
  const sealedModes = items.filter((item) => item.status === "sealed").length;
  const readyToSealModes = items.filter((item) => item.status === "ready-to-seal").length;
  const totalRuns = items.reduce((sum, item) => sum + item.runCount, 0);
  const complete = sealedModes === items.length;
  const productionComplete = productionEvidence?.complete ?? false;
  const productionReadyModes = productionEvidence?.passedModes ?? 0;
  const productionModeTargetCount = productionEvidence?.totalModes ?? requiredProductionModeIds.length;
  const productionMissingModes = productionEvidence?.missingModes ?? requiredProductionModeIds;
  const nextItem = items.find((item) => item.status !== "sealed");
  const nextAction = nextItem
    ? `${nextItem.title}: ${nextItem.nextAction}`
    : productionComplete
      ? "All tournament mode proof runs and production evidence are complete."
      : productionEvidence?.nextAction ?? "All tournament mode proof runs exist; finish Filecoin, cloud and share-card production evidence.";
  const summary = `${sealedModes}/${items.length} modes sealed · ${productionReadyModes}/${productionModeTargetCount} production-ready · ${readyToSealModes}/${items.length} ready to seal · ${totalRuns} proof run${totalRuns === 1 ? "" : "s"}.`;
  const copyText = [
    "Kickoff Lock Agent tournament mode playbook",
    `Complete: ${complete ? "yes" : "no"}`,
    `Production complete: ${productionComplete ? "yes" : "no"}`,
    `Modes sealed: ${sealedModes}/${items.length}`,
    `Production-ready modes: ${productionReadyModes}/${productionModeTargetCount}`,
    `Production missing modes: ${productionMissingModes.join(", ") || "none"}`,
    `Ready to seal: ${readyToSealModes}/${items.length}`,
    `Proof runs: ${totalRuns}`,
    `Creation queue: ${runnableQueue} runnable`,
    `Next action: ${nextAction}`,
    "Queue:",
    ...queue.map(
      (item) =>
        `- ${item.modeId} · ${item.runnable ? "runnable" : item.status} · ${item.nextAction}`,
    ),
    ...items.map(
      (item) =>
        `${item.modeId}: ${item.status} · eligible ${item.eligibleCount}/${item.requiredCount} · runs ${item.runCount} · next ${item.nextAction}`,
    ),
  ].join("\n");

  return {
    complete,
    productionComplete,
    sealedModes,
    productionReadyModes,
    readyToSealModes,
    totalModes: items.length,
    totalRuns,
    productionMissingModes,
    items,
    queue,
    runnableQueue,
    summary,
    nextAction,
    copyText,
  };
};
