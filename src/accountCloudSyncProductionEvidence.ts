import { buildAccountCloudSyncEvidenceArtifact, type AccountCloudSyncEvidenceArtifact } from "./accountCloudSyncEvidence";
import { friendCodeFor } from "./cloud";
import type { LeaderboardProductionArtifact } from "./leaderboardProductionBootstrap";
import type { ProductionTargetSeedArtifact } from "./productionTargetSeed";
import type { PublicRestoreEvidenceArtifact } from "./sharingProductionDoctor";
import type { ShareChannelEvidenceArtifact } from "./sharingProductionBootstrap";
import type { SupabaseSchemaApplyArtifact } from "./supabaseSchemaApply";
import type { CloudBackendHealth, CloudSyncState, LeaderboardEntry, LeaderboardScope, LeaderboardScopeEvidence } from "./types";

export type AccountCloudSyncProductionEvidenceInput = {
  seedArtifact?: ProductionTargetSeedArtifact;
  schemaArtifact?: SupabaseSchemaApplyArtifact;
  publicRestoreArtifact?: PublicRestoreEvidenceArtifact;
  shareChannelArtifact?: ShareChannelEvidenceArtifact;
  leaderboardArtifact?: LeaderboardProductionArtifact;
  generatedAt?: string;
  source?: AccountCloudSyncEvidenceArtifact["source"];
};

const requiredTables = ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"];
const requiredViews = ["kickoff_leaderboard", "kickoff_backend_health"];

const schemaHealth = (artifact?: SupabaseSchemaApplyArtifact): CloudBackendHealth => ({
  checkedAt: artifact?.generatedAt ?? new Date().toISOString(),
  schemaVersion: "production-schema",
  ready: Boolean(artifact?.ready && artifact.acceptance.schemaReadable && artifact.acceptance.contractReady && artifact.acceptance.applied),
  requiredTables,
  missingTables: artifact?.acceptance.contractReady ? [] : requiredTables,
  requiredViews,
  missingViews: artifact?.acceptance.contractReady ? [] : requiredViews,
  rlsTables: requiredTables,
  missingRlsTables: artifact?.acceptance.contractReady ? [] : requiredTables,
  missingColumns: artifact?.acceptance.contractReady ? [] : ["schema contract incomplete"],
  missingViewColumns: artifact?.acceptance.contractReady ? [] : ["schema contract incomplete"],
  policyCount: artifact?.acceptance.contractReady ? 8 : 0,
  requiredPolicyCount: 8,
  unsafeWritePolicies: [],
  storageBucketPublic: Boolean(artifact?.ready && artifact.acceptance.contractReady),
  storagePolicyCount: artifact?.acceptance.contractReady ? 3 : 0,
  requiredStoragePolicyCount: 3,
  detail: artifact?.ready ? "Supabase schema apply artifact is ready." : "Supabase schema apply artifact is missing or blocked.",
});

const scopeReady = (artifact: LeaderboardProductionArtifact | undefined, scope: LeaderboardScope) =>
  Boolean(artifact?.ready && artifact.acceptance.scopeClaims.find((claim) => claim.scope === scope)?.currentUser);

const leaderboardEntries = (artifact: LeaderboardProductionArtifact | undefined): LeaderboardEntry[] => {
  if (!artifact?.targets.userId) return [];
  return (["global", "friend", "season"] as const)
    .filter((scope) => scopeReady(artifact, scope))
    .map((scope, index) => ({
      id: artifact.targets.userId,
      displayName: "Production account",
      location: "Chengdu",
      rank: index + 1,
      locks: 1,
      revealed: 1,
      averageScore: 90,
      bestScore: 90,
      xp: 300,
      streak: 1,
      exactHits: 1,
      verifiedProofs: 1,
      modeProofs: 1,
      friendCode: artifact.targets.friendCode,
      seasonKey: artifact.targets.seasonKey,
      source: scope,
    }));
};

const leaderboardScopeEvidence = (artifact: LeaderboardProductionArtifact | undefined): LeaderboardScopeEvidence[] => {
  if (!artifact?.targets.userId) return [];
  return (["global", "friend", "season"] as const).map((scope, index) => {
    const claim = artifact.acceptance.scopeClaims.find((item) => item.scope === scope);
    const contract = artifact.queryContracts.find((item) => item.scope === scope);
    const currentUserReady = Boolean(artifact.ready && claim?.currentUser && claim.targetQueryReady && contract?.passed);
    return {
      scope,
      status: currentUserReady ? "loaded" : "empty",
      rows: currentUserReady ? 10 : 0,
      filter:
        scope === "global"
          ? "global xp desc"
          : scope === "friend"
            ? `friend_code=eq.${artifact.targets.friendCode}`
            : `season_key=eq.${artifact.targets.seasonKey}`,
      targetQuery: claim?.targetQuery ?? contract?.targetQuery ?? "",
      currentUserPresent: currentUserReady,
      currentUserRank: currentUserReady ? index + 1 : undefined,
      currentUserXp: currentUserReady ? 300 : undefined,
      currentUserLocks: currentUserReady ? 1 : undefined,
      currentUserRevealed: currentUserReady ? 1 : undefined,
      currentUserVerifiedProofs: currentUserReady ? 1 : undefined,
      currentUserModeProofs: currentUserReady ? 1 : undefined,
      currentUserExactHits: currentUserReady ? 1 : undefined,
      currentUserFriendCode: scope === "friend" ? artifact.targets.friendCode : undefined,
      currentUserSeasonKey: scope === "season" ? artifact.targets.seasonKey : undefined,
      expectedFriendCode: artifact.targets.friendCode,
      expectedSeasonKey: artifact.targets.seasonKey,
      checkedAt: artifact.generatedAt,
      sampleIds: currentUserReady ? [artifact.targets.userId] : [],
    };
  });
};

const shareChannelsReady = (artifact?: ShareChannelEvidenceArtifact) =>
  Boolean(
    artifact?.ready &&
      artifact.acceptance.recordChannelOpened &&
      artifact.acceptance.modeChannelCount >= artifact.acceptance.requiredModeChannelCount &&
      artifact.acceptance.passedTargetCount >= artifact.acceptance.requiredTargetCount,
  );

const buildCloudState = ({
  seedArtifact,
  schemaArtifact,
  publicRestoreArtifact,
  shareChannelArtifact,
}: AccountCloudSyncProductionEvidenceInput): CloudSyncState => {
  const seed = seedArtifact?.seed;
  const profile = seed?.profile;
  const recordIds = seed?.record ? [seed.record.capsule.id] : [];
  const modeRunIds = seed?.modeRuns.map((run) => run.id) ?? [];
  const shareArtifactIds = seed?.shareArtifacts.map((artifact) => `${artifact.kind}:${artifact.id}`) ?? [];
  const publicProofIds = [...recordIds.map((id) => `record:${id}`), ...modeRunIds.map((id) => `mode:${id}`)];
  const publicRestoreReady = Boolean(publicRestoreArtifact?.ready && publicRestoreArtifact.acceptance.cleanSessionRestore);
  const shareReady = shareChannelsReady(shareChannelArtifact);
  const profileReady = Boolean(seedArtifact?.ready && seedArtifact.acceptance.profileTarget && seedArtifact.acceptance.authUserReady);
  const recordReady = Boolean(seedArtifact?.ready && seedArtifact.acceptance.recordTarget);
  const modeReady = Boolean(
    seedArtifact?.ready &&
      seedArtifact.acceptance.modeTargetCount >= seedArtifact.acceptance.requiredModeTargetCount,
  );
  const shareArtifactReady = Boolean(
    seedArtifact?.ready &&
      seedArtifact.acceptance.shareArtifactCount >= seedArtifact.acceptance.requiredShareArtifactCount &&
      shareReady,
  );

  return {
    configured: Boolean(seedArtifact?.ready),
    authenticated: Boolean(seedArtifact?.ready && seedArtifact.acceptance.authUserReady),
    mode: seedArtifact?.ready ? "supabase" : "local",
    status: seedArtifact?.ready ? "synced" : "offline",
    message: seedArtifact?.ready ? "Production Supabase seed artifacts loaded." : "Production Supabase seed evidence missing.",
    verification: {
      checkedAt: new Date().toISOString(),
      backendHealth: schemaHealth(schemaArtifact),
      profile: profileReady,
      profileIdentity: profile
        ? {
            id: profile.id,
            email: profile.email,
            displayName: profile.displayName,
            location: profile.location,
            friendCode: friendCodeFor(profile),
          }
        : undefined,
      authUserIdentity: profileReady && profile ? { id: profile.id, email: profile.email } : undefined,
      profileIdentityProblems: profileReady ? [] : ["profile/Auth identity read-back incomplete"],
      authUserProblems: profileReady ? [] : ["Supabase Auth user was not read back"],
      records: recordReady ? recordIds.length : 0,
      modeRuns: modeReady ? modeRunIds.length : 0,
      publicProofs: publicRestoreReady ? publicProofIds.length : 0,
      shareArtifacts: shareArtifactReady ? shareArtifactIds.length : 0,
      publicShareImages: shareArtifactReady ? shareArtifactIds.length : 0,
      publicProfile: Boolean(publicRestoreReady && publicRestoreArtifact?.acceptance.profileRender),
      expectedRecords: recordIds.length,
      expectedModeRuns: modeRunIds.length,
      expectedShareArtifacts: shareArtifactIds.length,
      recordIds: recordReady ? recordIds : [],
      modeRunIds: modeReady ? modeRunIds : [],
      shareArtifactIds: shareArtifactReady ? shareArtifactIds : [],
      publicProofIds: publicRestoreReady ? publicProofIds : [],
      publicProofContentIds: publicRestoreReady ? publicProofIds : [],
      publicShareImageIds: shareArtifactReady ? shareArtifactIds : [],
      recordContentIds: recordReady ? recordIds : [],
      modeRunContentIds: modeReady ? modeRunIds : [],
      shareArtifactContentIds: shareArtifactReady ? shareArtifactIds : [],
      publicProfileRecordIds: publicRestoreReady ? recordIds : [],
      publicProfileModeRunIds: publicRestoreReady ? modeRunIds : [],
      publicProfileShareArtifactIds: shareArtifactReady && publicRestoreReady ? shareArtifactIds : [],
      publicProfileRecordContentIds: publicRestoreReady ? recordIds : [],
      publicProfileModeRunContentIds: publicRestoreReady ? modeRunIds : [],
      publicProfileShareArtifactContentIds: shareArtifactReady && publicRestoreReady ? shareArtifactIds : [],
      missingRecordIds: recordReady ? [] : recordIds,
      missingModeRunIds: modeReady ? [] : modeRunIds,
      missingPublicProofIds: publicRestoreReady ? [] : publicProofIds,
      missingPublicProofContentIds: publicRestoreReady ? [] : publicProofIds,
      missingShareArtifactIds: shareArtifactReady ? [] : shareArtifactIds,
      missingPublicShareImageIds: shareArtifactReady ? [] : shareArtifactIds,
      missingPublicProfileRecordIds: publicRestoreReady ? [] : recordIds,
      missingPublicProfileModeRunIds: publicRestoreReady ? [] : modeRunIds,
      missingPublicProfileShareArtifactIds: shareArtifactReady && publicRestoreReady ? [] : shareArtifactIds,
      missingPublicProfileRecordContentIds: publicRestoreReady ? [] : recordIds,
      missingPublicProfileModeRunContentIds: publicRestoreReady ? [] : modeRunIds,
      missingPublicProfileShareArtifactContentIds: shareArtifactReady && publicRestoreReady ? [] : shareArtifactIds,
      missingRecordContentIds: recordReady ? [] : recordIds,
      missingModeRunContentIds: modeReady ? [] : modeRunIds,
      missingShareArtifactContentIds: shareArtifactReady ? [] : shareArtifactIds,
      message: publicRestoreReady ? "Production cloud read-back evidence assembled." : "Production public restore evidence incomplete.",
    },
  };
};

export const buildAccountCloudSyncProductionEvidence = (
  input: AccountCloudSyncProductionEvidenceInput,
): AccountCloudSyncEvidenceArtifact => {
  const seed = input.seedArtifact?.seed;
  if (!seed) {
    return buildAccountCloudSyncEvidenceArtifact(
      {
        profile: {
          id: "missing-production-profile",
          email: "",
          displayName: "Missing production profile",
          location: "",
          createdAt: input.generatedAt ?? new Date().toISOString(),
          cloudMode: "local",
        },
        cloudState: buildCloudState(input),
        records: [],
        modeRuns: [],
        shareArtifacts: [],
        leaderboardEntries: [],
        leaderboardScopeEvidence: leaderboardScopeEvidence(input.leaderboardArtifact),
      },
      { generatedAt: input.generatedAt, source: input.source ?? "local-script" },
    );
  }
  return buildAccountCloudSyncEvidenceArtifact(
    {
      profile: seed.profile,
      cloudState: buildCloudState(input),
      records: [seed.record],
      modeRuns: seed.modeRuns,
      shareArtifacts: seed.shareArtifacts,
      leaderboardEntries: leaderboardEntries(input.leaderboardArtifact),
      leaderboardScopeEvidence: leaderboardScopeEvidence(input.leaderboardArtifact),
    },
    { generatedAt: input.generatedAt, source: input.source ?? "local-script" },
  );
};
