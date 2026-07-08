import { buildProductionVerifyEnv, productionFriendCode } from "./productionEvidence";
import type { GameMode, GameModeRun, MemoryRecord, ShareArtifactEvidence, UserProfile } from "./types";

export const requiredProductionModeIds: GameMode["id"][] = [
  "bracket",
  "parlay",
  "agent-vs-human",
  "upset",
  "group-path",
  "penalty-pressure",
];

const realRecordProof = (record?: MemoryRecord) =>
  record?.sealJob?.proof?.mode === "real"
    ? record.sealJob.proof
    : record?.capsule.filecoinProof.mode === "real"
      ? record.capsule.filecoinProof
      : undefined;

const realModeProof = (run?: GameModeRun) =>
  run?.sealJob?.proof?.mode === "real"
    ? run.sealJob.proof
    : run?.filecoinProof.mode === "real"
      ? run.filecoinProof
      : undefined;

const modeProofPayloadHash = (run?: GameModeRun) =>
  run?.sealJob?.uploadPayloadHash ?? run?.sealJob?.proof?.payloadHash ?? realModeProof(run)?.payloadHash;

export const buildProductionVerifyEnvFromArtifacts = ({
  profile,
  records,
  modeRuns,
  shareEvidence,
  publicProfileUrl,
}: {
  profile: UserProfile;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  shareEvidence: ShareArtifactEvidence[];
  publicProfileUrl?: string;
}) => {
  const productionTargetRecord = records.find((record) => record.capsule.locked) ?? records[0];
  const productionTargetModeRuns = requiredProductionModeIds
    .map((modeId) => modeRuns.find((run) => run.modeId === modeId))
    .filter(Boolean) as GameModeRun[];
  const productionTargetMode = productionTargetModeRuns[0] ?? modeRuns[0];
  const productionTargetModeIds =
    productionTargetModeRuns.length > 0
      ? productionTargetModeRuns.map((run) => run.id)
      : productionTargetMode
        ? [productionTargetMode.id]
        : [];
  const productionTargetImage =
    shareEvidence.find((item) => item.kind === "record" && item.imageUrl?.startsWith("https://"))?.imageUrl ??
    shareEvidence.find((item) => item.imageUrl?.startsWith("https://"))?.imageUrl;
  const productionTargetModeImage = shareEvidence.find((item) => item.kind === "mode" && item.imageUrl?.startsWith("https://"))?.imageUrl;
  const productionRecordProof = realRecordProof(productionTargetRecord);
  const productionModeProof = realModeProof(productionTargetMode);
  const productionModeProofRuns = productionTargetModeRuns.filter((run) => realModeProof(run)?.cid && modeProofPayloadHash(run));
  const shareArtifactIds = shareEvidence.map((artifact) => `${artifact.kind}:${artifact.id}`);

  return buildProductionVerifyEnv({
    userId: profile.cloudMode === "supabase" ? profile.id : "",
    profileId: profile.cloudMode === "supabase" ? profile.id : "",
    publicProfileUrl,
    proofId: productionTargetRecord?.capsule.id,
    modeId: productionTargetMode?.id,
    modeIds: productionTargetModeIds,
    shareArtifactIds,
    filecoinRecordCid: productionRecordProof?.cid,
    filecoinRecordJobId: productionTargetRecord?.sealJob?.backendJobId,
    filecoinRecordPayloadHash:
      productionTargetRecord?.sealJob?.uploadPayloadHash ??
      productionTargetRecord?.sealJob?.proof?.payloadHash ??
      productionRecordProof?.payloadHash,
    filecoinModeCid: productionModeProof?.cid,
    filecoinModePayloadHash: modeProofPayloadHash(productionTargetMode),
    filecoinModeJobIds: productionModeProofRuns.map((run) => run.sealJob?.backendJobId ?? "").filter(Boolean),
    filecoinModeCids: productionModeProofRuns.map((run) => realModeProof(run)!.cid),
    filecoinModePayloadHashes: productionModeProofRuns.map((run) => modeProofPayloadHash(run)!),
    friendCode: productionFriendCode(profile.location, profile.email),
    leaderboardScopes: ["global", "friend", "season"],
    shareImageUrl: productionTargetImage,
    modeShareImageUrl: productionTargetModeImage,
    allowFailures: true,
  });
};
