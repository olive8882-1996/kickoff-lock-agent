import { friendCodeFor, shareArtifactCloudId } from "./cloud";
import { buildLeaderboardQueryContractPacket } from "./leaderboardQueryContract";
import type {
  CloudCleanSessionPublicRender,
  CloudSyncState,
  GameModeRun,
  LeaderboardScope,
  LeaderboardScopeEvidence,
  MemoryRecord,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";

export type AccountHandoffChecklistItem = {
  key: string;
  label: string;
  status: "ready" | "pending" | "blocked";
  detail: string;
};

export type AccountHandoffPacket = {
  profileId: string;
  displayName: string;
  cloudMode: UserProfile["cloudMode"];
  authenticated: boolean;
  crossDeviceReady: boolean;
  localArtifacts: number;
  cloudReadBackArtifacts: number;
  pendingSyncItems: number;
  cleanSessionArtifacts: number;
  leaderboardScopes: LeaderboardScope[];
  publicProfileUrl: string;
  envFilled: number;
  envTotal: number;
  missingRuntimeEnv: string[];
  checklist: AccountHandoffChecklistItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

type AccountHandoffInput = {
  profile: UserProfile;
  cloudState: CloudSyncState;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  shareEvidence: ShareArtifactEvidence[];
  leaderboardScopeEvidence?: LeaderboardScopeEvidence[];
  productionVerifyEnv: string;
  publicProfileUrl: string;
  missingRuntimeEnv?: string[];
};

const parseEnvRows = (envText: string) =>
  envText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("="))
    .map((line) => {
      const [key, ...rest] = line.split("=");
      return { key, value: rest.join("=").trim() };
    });

const unquote = (value: string) => value.replace(/^['"]|['"]$/g, "");

const envRecord = (rows: ReturnType<typeof parseEnvRows>) =>
  Object.fromEntries(rows.map((row) => [row.key, unquote(row.value)]));

const listEnvValue = (value = "") =>
  unquote(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const statusFor = (ready: boolean, blocked: boolean) => (ready ? "ready" : blocked ? "blocked" : "pending");

const matchingCount = (actual: string[] | undefined, expected: string[]) =>
  expected.filter((id) => actual?.includes(id)).length;

const isProductionPublicUrl = (urlText?: string) => {
  if (!urlText) return false;
  try {
    const url = new URL(urlText);
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname) &&
      !url.hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
};

const countCleanRenders = (
  renders: CloudCleanSessionPublicRender[] | undefined,
  kind: CloudCleanSessionPublicRender["kind"],
  targetIds: string[],
) =>
  targetIds.filter((targetId) =>
    renders?.some(
      (render) =>
        render.kind === kind &&
        render.targetId === targetId &&
        render.passed &&
        render.cloudLoaded &&
        isProductionPublicUrl(render.url),
    ),
  ).length;

const profileIdentityProblems = (profile: UserProfile, verification: CloudSyncState["verification"]) => {
  if (!verification?.profile) return ["kickoff_profiles has not read back this user"];
  if (verification.profileIdentityProblems?.length) return verification.profileIdentityProblems;
  const identity = verification.profileIdentity;
  if (!identity) return ["cloud profile identity fields were not read back"];
  const expectedFriendCode = friendCodeFor(profile);
  return [
    identity.id === profile.id ? "" : "id mismatch",
    identity.email ? "" : "email missing",
    profile.email && identity.email !== profile.email ? "email mismatch" : "",
    identity.displayName ? "" : "display name missing",
    identity.displayName !== profile.displayName ? "display name mismatch" : "",
    identity.location ? "" : "location missing",
    identity.location !== profile.location ? "location mismatch" : "",
    identity.friendCode ? "" : "friend code missing",
    identity.friendCode !== expectedFriendCode ? "friend code mismatch" : "",
  ].filter(Boolean);
};

const targetEnvProblems = ({
  env,
  profile,
  expectedRecordIds,
  expectedModeRunIds,
  expectedShareArtifactIds,
  publicProfileUrl,
  expectedSeasonKey,
}: {
  env: Record<string, string>;
  profile: UserProfile;
  expectedRecordIds: string[];
  expectedModeRunIds: string[];
  expectedShareArtifactIds: string[];
  publicProfileUrl: string;
  expectedSeasonKey?: string;
}) => {
  const requiredLeaderboardScopes: LeaderboardScope[] = ["global", "friend", "season"];
  const required = [
    "KICKOFF_VERIFY_USER_ID",
    "KICKOFF_VERIFY_PROFILE_ID",
    "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
    ...(expectedRecordIds.length > 0 ? ["KICKOFF_VERIFY_PROOF_ID"] : []),
    ...(expectedModeRunIds.length > 0 ? ["KICKOFF_VERIFY_MODE_IDS"] : []),
    ...(expectedShareArtifactIds.length > 0 ? ["KICKOFF_VERIFY_SHARE_ARTIFACT_IDS"] : []),
    "KICKOFF_VERIFY_FRIEND_CODE",
    "KICKOFF_VERIFY_SEASON_KEY",
    "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
  ];
  const modeIds = listEnvValue(env.KICKOFF_VERIFY_MODE_IDS);
  const shareArtifactIds = listEnvValue(env.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS);
  const leaderboardScopes = listEnvValue(env.KICKOFF_VERIFY_LEADERBOARD_SCOPES).map((scope) => scope.toLowerCase());
  return [
    ...required.filter((key) => !env[key]).map((key) => `${key} missing`),
    env.KICKOFF_VERIFY_USER_ID && env.KICKOFF_VERIFY_USER_ID !== profile.id
      ? "KICKOFF_VERIFY_USER_ID does not match profile id"
      : "",
    env.KICKOFF_VERIFY_PROFILE_ID && env.KICKOFF_VERIFY_PROFILE_ID !== profile.id
      ? "KICKOFF_VERIFY_PROFILE_ID does not match profile id"
      : "",
    env.KICKOFF_VERIFY_PUBLIC_PROFILE_URL && env.KICKOFF_VERIFY_PUBLIC_PROFILE_URL !== publicProfileUrl
      ? "KICKOFF_VERIFY_PUBLIC_PROFILE_URL does not match the public profile URL"
      : "",
    env.KICKOFF_VERIFY_PUBLIC_PROFILE_URL && !isProductionPublicUrl(env.KICKOFF_VERIFY_PUBLIC_PROFILE_URL)
      ? "KICKOFF_VERIFY_PUBLIC_PROFILE_URL must be deployed HTTPS"
      : "",
    env.KICKOFF_VERIFY_PROOF_ID && expectedRecordIds.length > 0 && !expectedRecordIds.includes(env.KICKOFF_VERIFY_PROOF_ID)
      ? "KICKOFF_VERIFY_PROOF_ID does not match a synced proof id"
      : "",
    expectedModeRunIds.length > 0 && modeIds.length < expectedModeRunIds.length
      ? `KICKOFF_VERIFY_MODE_IDS needs ${expectedModeRunIds.length} mode ids`
      : "",
    ...expectedModeRunIds
      .filter((id) => modeIds.length > 0 && !modeIds.includes(id))
      .map((id) => `KICKOFF_VERIFY_MODE_IDS missing ${id}`),
    expectedShareArtifactIds.length > 0 && shareArtifactIds.length < expectedShareArtifactIds.length
      ? `KICKOFF_VERIFY_SHARE_ARTIFACT_IDS needs ${expectedShareArtifactIds.length} share artifact ids`
      : "",
    ...expectedShareArtifactIds
      .filter((id) => shareArtifactIds.length > 0 && !shareArtifactIds.includes(id))
      .map((id) => `KICKOFF_VERIFY_SHARE_ARTIFACT_IDS missing ${id}`),
    env.KICKOFF_VERIFY_FRIEND_CODE && env.KICKOFF_VERIFY_FRIEND_CODE !== friendCodeFor(profile)
      ? "KICKOFF_VERIFY_FRIEND_CODE does not match profile friend code"
      : "",
    env.KICKOFF_VERIFY_SEASON_KEY && expectedSeasonKey && env.KICKOFF_VERIFY_SEASON_KEY !== expectedSeasonKey
      ? "KICKOFF_VERIFY_SEASON_KEY does not match leaderboard season key"
      : "",
    ...requiredLeaderboardScopes
      .filter((scope) => leaderboardScopes.length > 0 && !leaderboardScopes.includes(scope))
      .map((scope) => `KICKOFF_VERIFY_LEADERBOARD_SCOPES missing ${scope}`),
  ].filter(Boolean);
};

export const buildAccountHandoffPacket = ({
  profile,
  cloudState,
  records,
  modeRuns,
  shareEvidence,
  leaderboardScopeEvidence = [],
  productionVerifyEnv,
  publicProfileUrl,
  missingRuntimeEnv = [],
}: AccountHandoffInput): AccountHandoffPacket => {
  const verification = cloudState.verification;
  const envRows = parseEnvRows(productionVerifyEnv);
  const targetEnv = envRecord(envRows);
  const envFilled = envRows.filter((row) => row.value.length > 0).length;
  const localArtifacts = records.length + modeRuns.length + shareEvidence.length;
  const expectedRecordIds = records.map((item) => item.capsule.id);
  const expectedModeRunIds = modeRuns.map((item) => item.id);
  const expectedShareArtifactIds = shareEvidence.map(shareArtifactCloudId);
  const cloudReadBackArtifacts =
    (verification?.records ?? 0) +
    (verification?.modeRuns ?? 0) +
    (verification?.shareArtifacts ?? 0);
  const expectedPublicProfileArtifacts = records.length + modeRuns.length + shareEvidence.length;
  const publicProfileArtifacts =
    (verification?.publicProfileRecordIds?.length ?? 0) +
    (verification?.publicProfileModeRunIds?.length ?? 0) +
    (verification?.publicProfileShareArtifactIds?.length ?? 0);
  const publicProfileArchiveFingerprints =
    (verification?.publicProfileRecordContentIds?.length ?? verification?.publicProfileRecordIds?.length ?? 0) +
    (verification?.publicProfileModeRunContentIds?.length ?? verification?.publicProfileModeRunIds?.length ?? 0) +
    (verification?.publicProfileShareArtifactContentIds?.length ?? verification?.publicProfileShareArtifactIds?.length ?? 0);
  const contentFingerprints =
    (verification?.recordContentIds?.length ?? 0) +
    (verification?.modeRunContentIds?.length ?? 0) +
    (verification?.shareArtifactContentIds?.length ?? 0);
  const matchedRecordRows = matchingCount(verification?.recordIds, expectedRecordIds);
  const matchedModeRows = matchingCount(verification?.modeRunIds, expectedModeRunIds);
  const matchedShareRows = matchingCount(verification?.shareArtifactIds, expectedShareArtifactIds);
  const matchedProfileRecords = matchingCount(verification?.publicProfileRecordIds, expectedRecordIds);
  const matchedProfileModes = matchingCount(verification?.publicProfileModeRunIds, expectedModeRunIds);
  const matchedProfileShares = matchingCount(verification?.publicProfileShareArtifactIds, expectedShareArtifactIds);
  const matchedProfileRecordContent = matchingCount(
    verification?.publicProfileRecordContentIds ?? verification?.publicProfileRecordIds,
    expectedRecordIds,
  );
  const matchedProfileModeContent = matchingCount(
    verification?.publicProfileModeRunContentIds ?? verification?.publicProfileModeRunIds,
    expectedModeRunIds,
  );
  const matchedProfileShareContent = matchingCount(
    verification?.publicProfileShareArtifactContentIds ?? verification?.publicProfileShareArtifactIds,
    expectedShareArtifactIds,
  );
  const cleanProfileRenders = countCleanRenders(verification?.cleanSessionPublicRenders, "profile", [profile.id]);
  const cleanProofRenders = countCleanRenders(verification?.cleanSessionPublicRenders, "proof", expectedRecordIds);
  const cleanModeRenders = countCleanRenders(verification?.cleanSessionPublicRenders, "mode", expectedModeRunIds);
  const cleanSessionArtifacts = cleanProfileRenders + cleanProofRenders + cleanModeRenders;
  const leaderboardContract = buildLeaderboardQueryContractPacket(profile, leaderboardScopeEvidence);
  const leaderboardScopes = leaderboardContract.scopes.filter((item) => item.passed).map((item) => item.scope);
  const profileProblems = profileIdentityProblems(profile, verification);
  const profileIdentityReady = profileProblems.length === 0;
  const pendingSyncItems = Math.max(0, localArtifacts - cloudReadBackArtifacts);
  const hasLocalArtifacts = localArtifacts > 0;
  const cloudConfigured = cloudState.configured;
  const authenticated = cloudState.authenticated;
  const contentReady =
    hasLocalArtifacts &&
    contentFingerprints >= localArtifacts &&
    matchedRecordRows >= expectedRecordIds.length &&
    matchedModeRows >= expectedModeRunIds.length &&
    matchedShareRows >= expectedShareArtifactIds.length;
  const archiveReady =
    Boolean(verification?.publicProfile) &&
    hasLocalArtifacts &&
    publicProfileArtifacts >= expectedPublicProfileArtifacts &&
    publicProfileArchiveFingerprints >= expectedPublicProfileArtifacts &&
    matchedProfileRecords >= expectedRecordIds.length &&
    matchedProfileModes >= expectedModeRunIds.length &&
    matchedProfileShares >= expectedShareArtifactIds.length &&
    matchedProfileRecordContent >= expectedRecordIds.length &&
    matchedProfileModeContent >= expectedModeRunIds.length &&
    matchedProfileShareContent >= expectedShareArtifactIds.length;
  const cleanSessionReady =
    cleanProfileRenders >= 1 &&
    cleanProofRenders >= expectedRecordIds.length &&
    cleanModeRenders >= expectedModeRunIds.length;
  const leaderboardReady = leaderboardScopes.length === 3;
  const publicProfileUrlReady = isProductionPublicUrl(publicProfileUrl);
  const expectedSeasonKey = leaderboardScopeEvidence.find((item) => item.scope === "season")?.expectedSeasonKey;
  const envProblems = targetEnvProblems({
    env: targetEnv,
    profile,
    expectedRecordIds,
    expectedModeRunIds,
    expectedShareArtifactIds,
    publicProfileUrl,
    expectedSeasonKey,
  });
  const envReady = missingRuntimeEnv.length === 0 && envRows.length > 0 && envProblems.length === 0;
  const crossDeviceReady =
    profile.cloudMode === "supabase" &&
    cloudConfigured &&
    authenticated &&
    profileIdentityReady &&
    pendingSyncItems === 0 &&
    contentReady &&
    archiveReady &&
    publicProfileUrlReady &&
    cleanSessionReady &&
    leaderboardReady &&
    envReady;

  const checklist: AccountHandoffChecklistItem[] = [
    {
      key: "runtime",
      label: "Supabase runtime",
      status: statusFor(cloudConfigured, missingRuntimeEnv.includes("VITE_SUPABASE_URL") || missingRuntimeEnv.includes("VITE_SUPABASE_ANON_KEY")),
      detail: cloudConfigured ? "browser build has Supabase env" : "missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY",
    },
    {
      key: "session",
      label: "Signed-in session",
      status: statusFor(authenticated, !cloudConfigured),
      detail: authenticated ? "session active" : cloudState.message,
    },
    {
      key: "profile",
      label: "Private profile row",
      status: statusFor(profileIdentityReady, !authenticated),
      detail: profileIdentityReady
        ? `${verification?.profileIdentity?.email} · ${verification?.profileIdentity?.displayName} · friend ${verification?.profileIdentity?.friendCode}`
        : profileProblems.join(" · "),
    },
    {
      key: "history",
      label: "Prediction and mode history",
      status: statusFor(pendingSyncItems === 0 && hasLocalArtifacts && contentReady, !authenticated),
      detail: hasLocalArtifacts
        ? `${cloudReadBackArtifacts}/${localArtifacts} artifacts read back · ids records ${matchedRecordRows}/${expectedRecordIds.length}, modes ${matchedModeRows}/${expectedModeRunIds.length}, shares ${matchedShareRows}/${expectedShareArtifactIds.length}`
        : "create records, mode proofs or share cards before handoff",
    },
    {
      key: "fingerprints",
      label: "Content fingerprints",
      status: statusFor(contentReady && hasLocalArtifacts, !authenticated),
      detail: hasLocalArtifacts ? `${contentFingerprints}/${localArtifacts} fingerprints matched` : "nothing to fingerprint yet",
    },
    {
      key: "public-profile",
      label: "Public profile archive",
      status: statusFor(archiveReady && publicProfileUrlReady, !authenticated),
      detail: archiveReady
        ? publicProfileUrlReady
          ? publicProfileUrl
          : "public profile URL must be a deployed HTTPS URL"
        : `${publicProfileArtifacts}/${expectedPublicProfileArtifacts} public archive artifacts · ${publicProfileArchiveFingerprints}/${expectedPublicProfileArtifacts} archive fingerprints`,
    },
    {
      key: "clean-session",
      label: "Clean-session restore",
      status: statusFor(cleanSessionReady, !authenticated),
      detail: `profile ${cleanProfileRenders}/1 · proofs ${cleanProofRenders}/${expectedRecordIds.length} · modes ${cleanModeRenders}/${expectedModeRunIds.length}`,
    },
    {
      key: "leaderboard",
      label: "Leaderboard backend",
      status: statusFor(leaderboardReady, !authenticated),
      detail: leaderboardReady
        ? `current user ranked in ${leaderboardScopes.join(", ")}`
        : leaderboardContract.scopes
            .filter((scope) => !scope.passed)
            .map((scope) => `${scope.scope}: ${scope.detail}`)
            .join(" · "),
    },
    {
      key: "target-env",
      label: "Production verify env",
      status: statusFor(envReady, false),
      detail: missingRuntimeEnv.length > 0
        ? `missing ${missingRuntimeEnv.join(", ")}`
        : envProblems.length > 0
          ? envProblems.join(" · ")
          : `${envFilled}/${envRows.length} verification variables filled`,
    },
  ];

  const firstOpen = checklist.find((item) => item.status !== "ready");
  const nextAction = firstOpen
    ? `${firstOpen.label}: ${firstOpen.detail}`
    : "Account handoff is ready for cross-device verification.";
  const summary = `${profile.displayName} · ${cloudState.mode} · ${cloudReadBackArtifacts}/${localArtifacts} cloud read-back · ${cleanSessionArtifacts}/${1 + expectedRecordIds.length + expectedModeRunIds.length} clean renders · ${leaderboardScopes.length}/3 leaderboard scopes · ${pendingSyncItems} pending`;
  const copyText = [
    "Kickoff Lock Agent account handoff",
    `Profile: ${profile.displayName} (${profile.id})`,
    `Public profile: ${publicProfileUrl}`,
    `Cloud read-back: ${cloudReadBackArtifacts}/${localArtifacts}`,
    `Cloud target ids: records ${matchedRecordRows}/${expectedRecordIds.length}, modes ${matchedModeRows}/${expectedModeRunIds.length}, shares ${matchedShareRows}/${expectedShareArtifactIds.length}`,
    `Public profile archive fingerprints: records ${matchedProfileRecordContent}/${expectedRecordIds.length}, modes ${matchedProfileModeContent}/${expectedModeRunIds.length}, shares ${matchedProfileShareContent}/${expectedShareArtifactIds.length}`,
    `Profile identity: ${profileIdentityReady ? "verified" : profileProblems.join(", ")}`,
    `Clean-session renders: profile ${cleanProfileRenders}/1, proofs ${cleanProofRenders}/${expectedRecordIds.length}, modes ${cleanModeRenders}/${expectedModeRunIds.length}`,
    `Leaderboard scopes: ${leaderboardScopes.join(", ") || "none"} (${leaderboardContract.passedScopes}/3 query contracts)`,
    `Pending sync: ${pendingSyncItems}`,
    `Next action: ${nextAction}`,
    "",
    "Production verify env:",
    productionVerifyEnv,
  ].join("\n");

  return {
    profileId: profile.id,
    displayName: profile.displayName,
    cloudMode: profile.cloudMode,
    authenticated,
    crossDeviceReady,
    localArtifacts,
    cloudReadBackArtifacts,
    pendingSyncItems,
    cleanSessionArtifacts,
    leaderboardScopes,
    publicProfileUrl,
    envFilled,
    envTotal: envRows.length,
    missingRuntimeEnv,
    checklist,
    summary,
    nextAction,
    copyText,
  };
};
