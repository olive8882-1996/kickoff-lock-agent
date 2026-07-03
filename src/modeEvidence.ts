import { isProductionShareArtifact } from "./shareCard";
import type { CloudSyncVerification, GameMode, GameModeRun, ShareArtifactEvidence } from "./types";

export type ModeEvidenceStatus = "ready" | "missing-run" | "needs-filecoin" | "needs-cloud" | "needs-public-proof" | "needs-share-card";

export type ModeEvidenceItem = {
  modeId: GameMode["id"];
  title: string;
  runId?: string;
  status: ModeEvidenceStatus;
  filecoinReady: boolean;
  cloudReadBack: boolean;
  publicProofReady: boolean;
  shareCardReady: boolean;
  missing: string[];
  nextAction: string;
};

export type ModeEvidencePacket = {
  complete: boolean;
  passedModes: number;
  totalModes: number;
  modeRuns: number;
  realFilecoinModes: number;
  cloudModes: number;
  publicProofModes: number;
  shareCardModes: number;
  missingModes: GameMode["id"][];
  items: ModeEvidenceItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const requiredModeIds: GameMode["id"][] = ["bracket", "parlay", "agent-vs-human", "upset"];

const titleFor = (modeId: GameMode["id"], modes: GameMode[]) =>
  modes.find((mode) => mode.id === modeId)?.title ?? modeId;

const proofReady = (run?: GameModeRun) => {
  const proof = run?.sealJob?.proof ?? run?.filecoinProof;
  const realProof = proof?.mode === "real" && ["retrievable", "verified"].includes(proof.proofStatus);
  const sealVerified = run?.sealJob?.status === "verified";
  const payloadHashMatch =
    Boolean(run?.payloadHash && proof?.payloadHash === run.payloadHash) ||
    Boolean(run?.sealJob?.uploadPayloadHash && proof?.payloadHash === run.sealJob.uploadPayloadHash);
  return Boolean(realProof && (sealVerified || payloadHashMatch));
};

const bestRunFor = (modeId: GameMode["id"], runs: GameModeRun[]) =>
  runs
    .filter((run) => run.modeId === modeId)
    .sort((a, b) => {
      const score = (run: GameModeRun) =>
        (proofReady(run) ? 8 : 0) +
        (run.filecoinProof.mode === "real" ? 4 : 0) +
        (run.status === "scored" ? 2 : 0) +
        new Date(run.createdAt).getTime() / 1_000_000_000_000_000;
      return score(b) - score(a);
    })[0];

const shareReady = (run: GameModeRun | undefined, shareArtifacts: ShareArtifactEvidence[]) =>
  Boolean(run && shareArtifacts.some((artifact) => artifact.kind === "mode" && artifact.id === run.id && isProductionShareArtifact(artifact)));

const includes = (values: string[] | undefined, value: string) => values?.includes(value) ?? false;

const buildItem = (
  modeId: GameMode["id"],
  modes: GameMode[],
  runs: GameModeRun[],
  shareArtifacts: ShareArtifactEvidence[],
  verification?: CloudSyncVerification,
): ModeEvidenceItem => {
  const run = bestRunFor(modeId, runs);
  if (!run) {
    return {
      modeId,
      title: titleFor(modeId, modes),
      status: "missing-run",
      filecoinReady: false,
      cloudReadBack: false,
      publicProofReady: false,
      shareCardReady: false,
      missing: ["mode proof run"],
      nextAction: `Create and seal a ${titleFor(modeId, modes)} mode proof run.`,
    };
  }

  const filecoinReady = proofReady(run);
  const cloudReadBack = includes(verification?.modeRunIds, run.id) && includes(verification?.modeRunContentIds, run.id);
  const publicProofReady = includes(verification?.publicProofIds, `mode:${run.id}`);
  const shareCardReady = shareReady(run, shareArtifacts);
  const missing = [
    ...(filecoinReady ? [] : ["real Filecoin proof"]),
    ...(cloudReadBack ? [] : ["cloud mode content read-back"]),
    ...(publicProofReady ? [] : ["anonymous mode proof link"]),
    ...(shareCardReady ? [] : ["production share card"]),
  ];
  const status: ModeEvidenceStatus =
    missing.length === 0
      ? "ready"
      : !filecoinReady
        ? "needs-filecoin"
        : !cloudReadBack
          ? "needs-cloud"
          : !publicProofReady
            ? "needs-public-proof"
            : "needs-share-card";
  const nextAction =
    missing.length === 0
      ? `${titleFor(modeId, modes)} mode proof is production-ready.`
      : `Finish ${missing[0]} for ${titleFor(modeId, modes)}.`;

  return {
    modeId,
    title: run.title || titleFor(modeId, modes),
    runId: run.id,
    status,
    filecoinReady,
    cloudReadBack,
    publicProofReady,
    shareCardReady,
    missing,
    nextAction,
  };
};

export const buildModeEvidencePacket = (
  modes: GameMode[],
  runs: GameModeRun[],
  shareArtifacts: ShareArtifactEvidence[],
  verification?: CloudSyncVerification,
): ModeEvidencePacket => {
  const items = requiredModeIds.map((modeId) => buildItem(modeId, modes, runs, shareArtifacts, verification));
  const passedModes = items.filter((item) => item.status === "ready").length;
  const missingModes = items.filter((item) => item.status !== "ready").map((item) => item.modeId);
  const modeRuns = items.filter((item) => item.runId).length;
  const realFilecoinModes = items.filter((item) => item.filecoinReady).length;
  const cloudModes = items.filter((item) => item.cloudReadBack).length;
  const publicProofModes = items.filter((item) => item.publicProofReady).length;
  const shareCardModes = items.filter((item) => item.shareCardReady).length;
  const complete = passedModes === requiredModeIds.length;
  const nextAction =
    items.find((item) => item.status !== "ready")?.nextAction ??
    "All tournament modes have real Filecoin, cloud read-back, public proof links and share cards.";
  const summary = `${passedModes}/${requiredModeIds.length} tournament modes production-ready · ${realFilecoinModes}/${requiredModeIds.length} real Filecoin · ${shareCardModes}/${requiredModeIds.length} share cards`;
  const copyText = [
    "Kickoff Lock Agent mode evidence",
    `Modes ready: ${passedModes}/${requiredModeIds.length}`,
    `Mode runs: ${modeRuns}/${requiredModeIds.length}`,
    `Real Filecoin: ${realFilecoinModes}/${requiredModeIds.length}`,
    `Cloud read-back: ${cloudModes}/${requiredModeIds.length}`,
    `Public proof links: ${publicProofModes}/${requiredModeIds.length}`,
    `Share cards: ${shareCardModes}/${requiredModeIds.length}`,
    `Missing modes: ${missingModes.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    ...items.map((item) => `${item.modeId}: ${item.status}${item.runId ? ` · ${item.runId}` : ""} · missing ${item.missing.join(", ") || "none"}`),
  ].join("\n");

  return {
    complete,
    passedModes,
    totalModes: requiredModeIds.length,
    modeRuns,
    realFilecoinModes,
    cloudModes,
    publicProofModes,
    shareCardModes,
    missingModes,
    items,
    summary,
    nextAction,
    copyText,
  };
};
