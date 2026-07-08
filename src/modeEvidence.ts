import { isProductionShareArtifact } from "./shareCard";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import type { CloudSyncVerification, GameMode, GameModeRun, ShareArtifactEvidence } from "./types";

export type ModeEvidenceStatus =
  | "ready"
  | "missing-run"
  | "needs-artifact"
  | "needs-filecoin"
  | "needs-cloud"
  | "needs-public-proof"
  | "needs-share-card";

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

export type ModeAcceptanceClaim = {
  modeId: GameMode["id"];
  title: string;
  accepted: boolean;
  runId?: string;
  artifactKind?: NonNullable<GameModeRun["artifact"]>["kind"];
  expectedArtifactKind: NonNullable<GameModeRun["artifact"]>["kind"];
  payloadHash?: string;
  cid?: string;
  proofStatus?: GameModeRun["filecoinProof"]["proofStatus"];
  proofUrl?: string;
  shareImageUrl?: string;
  artifactReady: boolean;
  payloadHashReady: boolean;
  filecoinReady: boolean;
  cloudReadBack: boolean;
  publicProofReady: boolean;
  shareCardReady: boolean;
  missing: string[];
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
  acceptanceClaims: ModeAcceptanceClaim[];
  summary: string;
  nextAction: string;
  copyText: string;
};

export { requiredProductionModeIds };
const expectedArtifactKinds: Record<GameMode["id"], NonNullable<GameModeRun["artifact"]>["kind"]> = {
  bracket: "bracket-path",
  parlay: "parlay-ticket",
  "agent-vs-human": "agent-calibration",
  upset: "upset-ticket",
  "group-path": "group-table-path",
  "penalty-pressure": "penalty-pressure-ticket",
};

type ProductionModeCoverageRow = {
  id?: unknown;
  mode_id?: unknown;
  modeId?: unknown;
  mode_run?: { mode_id?: unknown; modeId?: unknown };
};

const rowModeId = (row: ProductionModeCoverageRow) =>
  String(row.mode_id ?? row.modeId ?? row.mode_run?.mode_id ?? row.mode_run?.modeId ?? "").trim();

export const productionModeCoverageProblem = (rows: ProductionModeCoverageRow[], label = "mode proofs") => {
  const required = new Set(requiredProductionModeIds);
  const present = new Set<GameMode["id"]>();
  const invalid = rows
    .map((row) => {
      const modeId = rowModeId(row);
      if (!modeId) return `${String(row.id ?? "row")} mode_id missing`;
      if (!required.has(modeId as GameMode["id"])) return `${String(row.id ?? "row")} mode_id ${modeId} is not a required production mode`;
      present.add(modeId as GameMode["id"]);
      return "";
    })
    .filter(Boolean);
  if (invalid.length > 0) return `${label} mode type invalid: ${invalid.join(" | ")}`;
  const missing = requiredProductionModeIds.filter((modeId) => !present.has(modeId));
  if (missing.length > 0) return `${label} mode type coverage missing ${missing.join(", ")}`;
  return "";
};

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

const artifactReady = (modeId: GameMode["id"], run?: GameModeRun) => run?.artifact?.kind === expectedArtifactKinds[modeId];
const payloadHashReady = (run?: GameModeRun) => Boolean(run?.payloadHash && /^[a-f0-9]{64}$/.test(run.payloadHash));
const proofFor = (run?: GameModeRun) => run?.sealJob?.proof ?? run?.filecoinProof;

const bestRunFor = (modeId: GameMode["id"], runs: GameModeRun[]) =>
  runs
    .filter((run) => run.modeId === modeId)
    .sort((a, b) => {
      const score = (run: GameModeRun) =>
        (artifactReady(modeId, run) ? 16 : 0) +
        (proofReady(run) ? 8 : 0) +
        (run.filecoinProof.mode === "real" ? 4 : 0) +
        (run.status === "scored" ? 2 : 0) +
        new Date(run.createdAt).getTime() / 1_000_000_000_000_000;
      return score(b) - score(a);
    })[0];

const shareArtifactFor = (run: GameModeRun | undefined, shareArtifacts: ShareArtifactEvidence[]) =>
  run
    ? shareArtifacts.find(
        (artifact) =>
          artifact.kind === "mode" &&
          artifact.id === run.id &&
          isProductionShareArtifact(artifact) &&
          !publicShareImageUrlProblem(artifact.imageUrl ?? "", "Mode share image URL"),
      )
    : undefined;

const shareReady = (run: GameModeRun | undefined, shareArtifacts: ShareArtifactEvidence[]) =>
  Boolean(shareArtifactFor(run, shareArtifacts));

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

  const hasMatchingArtifact = artifactReady(modeId, run);
  const filecoinReady = proofReady(run);
  const cloudReadBack = includes(verification?.modeRunIds, run.id) && includes(verification?.modeRunContentIds, run.id);
  const publicProofReady = includes(verification?.publicProofIds, `mode:${run.id}`);
  const shareCardReady = shareReady(run, shareArtifacts);
  const missing = [
    ...(hasMatchingArtifact ? [] : [`${expectedArtifactKinds[modeId]} artifact`]),
    ...(filecoinReady ? [] : ["real Filecoin proof"]),
    ...(cloudReadBack ? [] : ["cloud mode content read-back"]),
    ...(publicProofReady ? [] : ["anonymous mode proof link"]),
    ...(shareCardReady ? [] : ["production share card"]),
  ];
  const status: ModeEvidenceStatus =
    missing.length === 0
      ? "ready"
      : !hasMatchingArtifact
        ? "needs-artifact"
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

const buildAcceptanceClaim = (
  item: ModeEvidenceItem,
  run: GameModeRun | undefined,
  shareArtifacts: ShareArtifactEvidence[],
): ModeAcceptanceClaim => {
  const proof = proofFor(run);
  const shareArtifact = shareArtifactFor(run, shareArtifacts);
  const claimPayloadHashReady = payloadHashReady(run);
  const missing = [
    ...item.missing,
    ...(claimPayloadHashReady ? [] : ["valid SHA-256 payload hash"]),
  ];
  const accepted = item.status === "ready" && claimPayloadHashReady;
  return {
    modeId: item.modeId,
    title: item.title,
    accepted,
    runId: run?.id,
    artifactKind: run?.artifact?.kind,
    expectedArtifactKind: expectedArtifactKinds[item.modeId],
    payloadHash: run?.payloadHash,
    cid: proof?.cid,
    proofStatus: proof?.proofStatus,
    proofUrl: shareArtifact?.proofUrl,
    shareImageUrl: shareArtifact?.imageUrl,
    artifactReady: artifactReady(item.modeId, run),
    payloadHashReady: claimPayloadHashReady,
    filecoinReady: item.filecoinReady,
    cloudReadBack: item.cloudReadBack,
    publicProofReady: item.publicProofReady,
    shareCardReady: item.shareCardReady,
    missing,
  };
};

export const buildModeEvidencePacket = (
  modes: GameMode[],
  runs: GameModeRun[],
  shareArtifacts: ShareArtifactEvidence[],
  verification?: CloudSyncVerification,
): ModeEvidencePacket => {
  const items = requiredProductionModeIds.map((modeId) => buildItem(modeId, modes, runs, shareArtifacts, verification));
  const acceptanceClaims = items.map((item) => buildAcceptanceClaim(item, item.runId ? runs.find((run) => run.id === item.runId) : undefined, shareArtifacts));
  const passedModes = acceptanceClaims.filter((claim) => claim.accepted).length;
  const missingModes = acceptanceClaims.filter((claim) => !claim.accepted).map((claim) => claim.modeId);
  const modeRuns = items.filter((item) => item.runId).length;
  const realFilecoinModes = items.filter((item) => item.filecoinReady).length;
  const cloudModes = items.filter((item) => item.cloudReadBack).length;
  const publicProofModes = items.filter((item) => item.publicProofReady).length;
  const shareCardModes = items.filter((item) => item.shareCardReady).length;
  const complete = passedModes === requiredProductionModeIds.length;
  const blockedClaim = acceptanceClaims.find((claim) => !claim.accepted);
  const nextAction =
    items.find((item) => item.status !== "ready")?.nextAction ??
    (blockedClaim ? `Finish ${blockedClaim.missing[0]} for ${blockedClaim.title}.` : undefined) ??
    "All tournament modes have real Filecoin, cloud read-back, public proof links and share cards.";
  const summary = `${passedModes}/${requiredProductionModeIds.length} tournament modes production-ready · ${realFilecoinModes}/${requiredProductionModeIds.length} real Filecoin · ${shareCardModes}/${requiredProductionModeIds.length} share cards`;
  const copyText = [
    "Kickoff Lock Agent mode evidence",
    `Modes ready: ${passedModes}/${requiredProductionModeIds.length}`,
    `Mode runs: ${modeRuns}/${requiredProductionModeIds.length}`,
    `Real Filecoin: ${realFilecoinModes}/${requiredProductionModeIds.length}`,
    `Cloud read-back: ${cloudModes}/${requiredProductionModeIds.length}`,
    `Public proof links: ${publicProofModes}/${requiredProductionModeIds.length}`,
    `Share cards: ${shareCardModes}/${requiredProductionModeIds.length}`,
    `Missing modes: ${missingModes.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Acceptance claims:",
    ...acceptanceClaims.map(
      (claim) =>
        `${claim.modeId}: ${claim.accepted ? "accepted" : "blocked"} · run ${claim.runId ?? "missing"} · artifact ${claim.artifactKind ?? "missing"}/${claim.expectedArtifactKind} · hash ${claim.payloadHashReady ? "ok" : "missing"} · cid ${claim.cid ?? "missing"} · missing ${claim.missing.join(", ") || "none"}`,
    ),
    ...items.map((item) => `${item.modeId}: ${item.status}${item.runId ? ` · ${item.runId}` : ""} · missing ${item.missing.join(", ") || "none"}`),
  ].join("\n");

  return {
    complete,
    passedModes,
    totalModes: requiredProductionModeIds.length,
    modeRuns,
    realFilecoinModes,
    cloudModes,
    publicProofModes,
    shareCardModes,
    missingModes,
    items,
    acceptanceClaims,
    summary,
    nextAction,
    copyText,
  };
};
