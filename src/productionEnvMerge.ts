export type ProductionEnvMergeFileOptions = {
  includeExample?: boolean;
};

export const productionEnvMergeFileList = ({ includeExample = false }: ProductionEnvMergeFileOptions = {}) => [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

export type ProductionEnvArtifactSource = {
  fileName: string;
  artifact?: unknown;
};

export const productionEnvArtifactFileList = () => [
  "public/supabase-target-seed.json",
  "public/share-channel-evidence.json",
  "public/leaderboard-backend.json",
  "public/data-target-scout.json",
  "public/filecoin-target-seal.json",
  "public/share-image-upload-record.json",
  "public/share-image-upload-mode.json",
];

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const envLine = (key: string, value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? `${key}=${JSON.stringify(text)}` : "";
};

const verifyEnvFromArtifact = (artifact: unknown) => {
  const value = objectValue(artifact).verifyEnv;
  return typeof value === "string" && value.trim() ? value : "";
};

const verifyEnvFromSeedArtifact = (artifact: unknown) => {
  const seed = objectValue(objectValue(artifact).seed);
  const value = seed.verifyEnv;
  return typeof value === "string" && value.trim() ? value : "";
};

const verifyEnvFromShareImageArtifact = (artifact: unknown) => {
  const root = objectValue(artifact);
  const target = objectValue(root.target);
  const result = objectValue(root.result);
  const kind = String(target.kind ?? "");
  const publicUrl = String(result.publicUrl ?? "").trim();
  if (!publicUrl) return "";
  if (kind === "mode") {
    return [
      envLine("KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL", publicUrl),
    ].filter(Boolean).join("\n");
  }
  if (kind === "record") {
    return [
      envLine("KICKOFF_VERIFY_SHARE_IMAGE_URL", publicUrl),
    ].filter(Boolean).join("\n");
  }
  return "";
};

const stringList = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : String(value ?? "")
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);

const verifyEnvFromShareChannelArtifact = (artifact: unknown) => {
  const root = objectValue(artifact);
  const targets = objectValue(root.targets);
  const explicitShareArtifactIds = stringList(targets.shareArtifactIds);
  const proofId = String(targets.proofId ?? "").trim();
  const modeIds = stringList(targets.modeIds);
  const derivedShareArtifactIds = [proofId ? `record:${proofId}` : "", ...modeIds.map((id) => `mode:${id}`)].filter(Boolean);
  const shareArtifactIds = explicitShareArtifactIds.length > 0 ? explicitShareArtifactIds : derivedShareArtifactIds;
  return [
    envLine("KICKOFF_VERIFY_SHARE_ARTIFACT_IDS", shareArtifactIds.join(",")),
  ].filter(Boolean).join("\n");
};

const verifyEnvFromLeaderboardArtifact = (artifact: unknown) => {
  const root = objectValue(artifact);
  const targets = objectValue(root.targets);
  const explicitScopes = stringList(targets.leaderboardScopes);
  const queryContractScopes = Array.isArray(root.queryContracts)
    ? root.queryContracts
        .map((item) => objectValue(item).scope)
        .map((scope) => String(scope ?? "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  const scopes = explicitScopes.length > 0 ? explicitScopes : queryContractScopes;
  return [
    envLine("KICKOFF_VERIFY_LEADERBOARD_SCOPES", scopes.join(",")),
  ].filter(Boolean).join("\n");
};

export const productionEnvBlocksFromArtifacts = (sources: ProductionEnvArtifactSource[]) =>
  sources
    .flatMap((source) => [
      verifyEnvFromSeedArtifact(source.artifact),
      verifyEnvFromArtifact(source.artifact),
      source.fileName.endsWith("share-channel-evidence.json") ? verifyEnvFromShareChannelArtifact(source.artifact) : "",
      source.fileName.endsWith("leaderboard-backend.json") ? verifyEnvFromLeaderboardArtifact(source.artifact) : "",
      verifyEnvFromShareImageArtifact(source.artifact),
    ])
    .map((block) => block.trim())
    .filter(Boolean);

export const productionVerifyEnvKeys = [
  "KICKOFF_VERIFY_USER_ID",
  "KICKOFF_VERIFY_PROFILE_ID",
  "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
  "KICKOFF_VERIFY_PROOF_ID",
  "KICKOFF_VERIFY_MODE_ID",
  "KICKOFF_VERIFY_MODE_IDS",
  "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
  "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
  "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
  "KICKOFF_VERIFY_FILECOIN_MODE_CID",
  "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH",
  "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
  "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
  "KICKOFF_VERIFY_FRIEND_CODE",
  "KICKOFF_VERIFY_SEASON_KEY",
  "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
  "KICKOFF_VERIFY_FIXTURE_ID",
  "KICKOFF_VERIFY_FIXTURE_IDS",
  "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
  "KICKOFF_VERIFY_SHARE_IMAGE_URL",
  "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
  "KICKOFF_VERIFY_ALLOW_FAILURES",
];

const verifyEnvLinePattern = new RegExp(`^(${productionVerifyEnvKeys.join("|")})=`);

export const mergeVerifyEnvIntoEnvText = (existingText: string, verifyEnvText: string) => {
  const preserved = existingText
    .split("\n")
    .filter((line) => !verifyEnvLinePattern.test(line.trim()))
    .join("\n")
    .replace(/\s+$/g, "");
  const verify = verifyEnvText.trim();
  return `${[preserved, verify].filter(Boolean).join("\n\n")}\n`;
};
