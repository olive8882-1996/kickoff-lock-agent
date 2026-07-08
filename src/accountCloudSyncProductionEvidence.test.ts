import { describe, expect, it } from "vitest";
import { buildAccountCloudSyncProductionEvidence } from "./accountCloudSyncProductionEvidence";
import type { LeaderboardProductionArtifact } from "./leaderboardProductionBootstrap";
import type { ProductionTargetSeedArtifact } from "./productionTargetSeed";
import type { PublicRestoreEvidenceArtifact } from "./sharingProductionDoctor";
import type { ShareChannelEvidenceArtifact } from "./sharingProductionBootstrap";
import type { SupabaseSchemaApplyArtifact } from "./supabaseSchemaApply";
import type { GameModeRun, LeaderboardScope, MemoryRecord, ShareArtifactEvidence, UserProfile } from "./types";

const leaderboardSelect = [
  "id",
  "xp",
  "locks",
  "revealed",
  "verified_proofs",
  "mode_proofs",
  "exact_hits",
  "global_rank",
  "friend_rank",
  "season_rank",
  "rank",
  "friend_code",
  "season_key",
].join(",");

const leaderboardTargetQuery = (scope: LeaderboardScope) => {
  const params = new URLSearchParams({
    select: leaderboardSelect,
    order: "xp.desc",
    limit: "1",
    id: "eq.user-1",
  });
  if (scope === "friend") params.set("friend_code", "eq.chengdu");
  if (scope === "season") params.set("season_key", "eq.world-cup-run");
  return `kickoff_leaderboard?${params.toString()}`;
};

const profile: UserProfile = {
  id: "user-1",
  email: "fan@example.com",
  displayName: "Fan One",
  location: "Chengdu",
  createdAt: "2026-07-01T00:00:00.000Z",
  cloudMode: "supabase",
};

const record: MemoryRecord = {
  capsule: {
    id: "cap-1",
    matchId: "match-1",
    matchLabel: "A vs B",
    kickoffAt: "2026-07-01T12:00:00.000Z",
    createdAt: "2026-07-01T10:00:00.000Z",
    sealedAt: "2026-07-01T10:01:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: { mode: "real", cid: "bafy-record", pieceCid: "piece", provider: "production", dataSetId: "set", proofStatus: "verified" },
    prediction: {
      homeScore: 1,
      awayScore: 0,
      winner: "A",
      confidence: 70,
      keyPlayers: [],
      markets: [],
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
    },
  },
};

const modes: GameModeRun[] = ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"].map((id) => ({
  id,
  modeId: id === "mode-bracket" ? "bracket" : id === "mode-parlay" ? "parlay" : id === "mode-agent" ? "agent-vs-human" : id === "mode-group-path" ? "group-path" : "upset",
  title: id,
  createdAt: "2026-07-01T10:02:00.000Z",
  capsuleIds: ["cap-1"],
  payloadHash: "b".repeat(64),
  status: "sealed",
  summary: "sealed",
  requirements: ["capsule"],
  filecoinProof: { mode: "real", cid: `bafy-${id}`, pieceCid: "piece", provider: "production", dataSetId: "set", proofStatus: "verified" },
}));

const shares: ShareArtifactEvidence[] = [
  { id: "cap-1", kind: "record" as const },
  ...modes.map((mode) => ({ id: mode.id, kind: "mode" as const })),
].map((item) => ({
  ...item,
  proofUrl: `https://example.com/kickoff-lock-agent/?${item.kind === "record" ? "proof" : "mode"}=${item.id}`,
  imageGenerated: true,
  imageUrl: `https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/${item.kind}/${item.id}/card.png`,
  imageMime: "image/png",
  imageByteLength: 120_000,
  imageHash: "c".repeat(64),
}));

const seedArtifact = (patch: Partial<ProductionTargetSeedArtifact> = {}): ProductionTargetSeedArtifact => ({
  ready: true,
  missing: [],
  seed: {
    profile,
    record,
    modeRun: modes[0],
    modeRuns: modes,
    shareArtifacts: shares,
    rows: { profile: {}, record: {}, modeRun: {}, modeRuns: [], shareArtifacts: [] },
    verifyEnv: "",
    targets: {
      userId: "user-1",
      profileId: "user-1",
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      proofId: "cap-1",
      modeId: "mode-bracket",
      modeIds: modes.map((mode) => mode.id),
      shareArtifactIds: shares.map((share) => `${share.kind}:${share.id}`),
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      leaderboardScopes: ["global", "friend", "season"],
      shareImageUrl: shares[0].imageUrl ?? "",
      modeShareImageUrl: shares[1].imageUrl ?? "",
    },
  },
  generatedAt: "2026-07-01T10:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  dryRun: false,
  upserted: true,
  authUser: { ready: true, userId: "user-1", detail: "ok", missing: [], sampleIds: ["user-1"] },
  acceptance: {
    authUserReady: true,
    upserted: true,
    doctorReady: true,
    profileTarget: true,
    recordTarget: true,
    modeTargetCount: 6,
    requiredModeTargetCount: 6,
    shareArtifactCount: 7,
    requiredShareArtifactCount: 7,
    recordShareChannelOpened: true,
    modeShareChannelCount: 6,
    requiredModeShareChannelCount: 6,
    shareChannelCount: 7,
    requiredShareChannelCount: 7,
    outputEnvKeys: [],
  },
  ...patch,
});

const schemaArtifact = (ready = true): SupabaseSchemaApplyArtifact => ({
  ready,
  schemaPath: "supabase/schema.sql",
  databaseUrl: "postgres://example",
  maskedDatabaseUrl: "postgres://***",
  args: ["-f", "supabase/schema.sql"],
  schemaContract: { ready, passed: ready ? 1 : 0, total: 1, missing: ready ? [] : ["schema"], checks: [] },
  action: ready ? "applied" : "blocked",
  generatedAt: "2026-07-01T10:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  schemaReadable: ready,
  dryRun: false,
  applied: ready,
  missing: [],
  command: "psql",
  acceptance: {
    schemaReadable: ready,
    contractReady: ready,
    psqlAvailable: true,
    dryRun: false,
    applied: ready,
    outputEnvKeys: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts", "kickoff_leaderboard", "kickoff_backend_health"],
  },
});

const publicRestoreArtifact = (ready = true): PublicRestoreEvidenceArtifact => ({
  ready,
  requiredPassed: ready ? 1 : 0,
  requiredTotal: 1,
  checks: [],
  nextActions: [],
  generatedAt: "2026-07-01T10:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  readBackCommands: [],
  pageTargets: [],
  targets: {
    publicAppUrl: "https://example.com/kickoff-lock-agent/",
    profileId: "user-1",
    proofId: "cap-1",
    modeIds: modes.map((mode) => mode.id),
    shareImageUrl: shares[0].imageUrl ?? "",
    modeShareImageUrl: shares[1].imageUrl ?? "",
  },
  acceptance: {
    publicAppUrlReady: true,
    cleanSessionRestore: ready,
    profileRender: ready,
    proofRender: ready,
    modeRenderCount: ready ? 6 : 0,
    requiredModeRenderCount: 6,
    cleanSessionProfileIds: ready ? ["user-1"] : [],
    cleanSessionProofIds: ready ? ["cap-1"] : [],
    cleanSessionModeIds: ready ? modes.map((mode) => mode.id) : [],
    shareImageReadBack: ready,
    modeShareImageReadBack: ready,
    outputEnvKeys: [],
  },
});

const shareChannelArtifact = (ready = true): ShareChannelEvidenceArtifact => ({
  ready,
  execute: ready,
  stageReadyCount: ready ? 1 : 0,
  totalStages: 1,
  blockedStages: ready ? 0 : 1,
  missingEnv: [],
  stages: [],
  commands: [],
  readBackCommands: [],
  generatedAt: "2026-07-01T10:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  targets: {
    publicAppUrl: "https://example.com/kickoff-lock-agent/",
    proofId: "cap-1",
    proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-1",
    proofXIntentUrl: "https://twitter.com/intent/tweet?url=https%3A%2F%2Fexample.com%2Fkickoff-lock-agent%2F%3Fproof%3Dcap-1",
    modeIds: modes.map((mode) => mode.id),
    modeProofUrls: modes.map((mode) => `https://example.com/kickoff-lock-agent/?mode=${mode.id}`),
    modeXIntentUrls: modes.map(
      (mode) => `https://twitter.com/intent/tweet?url=https%3A%2F%2Fexample.com%2Fkickoff-lock-agent%2F%3Fmode%3D${mode.id}`,
    ),
    shareArtifactIds: shares.map((share) => `${share.kind}:${share.id}`),
    shareImageUrl: shares[0].imageUrl ?? "",
    modeShareImageUrl: shares[1].imageUrl ?? "",
  },
  doctor: { ready, requiredPassed: ready ? 1 : 0, requiredTotal: 1, shareChannelCheckIds: [], passedShareChannelCheckIds: [], failedShareChannelCheckIds: [] },
  acceptance: {
    recordChannelOpened: ready,
    modeChannelCount: ready ? 6 : 0,
    requiredModeChannelCount: 6,
    passedTargetCount: ready ? 7 : 0,
    requiredTargetCount: 7,
    targetEnvReady: ready,
    publicTargetUrlsReady: ready,
    outputEnvKeys: [],
  },
  nextAction: ready ? "ready" : "blocked",
  copyText: "share",
});

const leaderboardArtifact = (ready = true): LeaderboardProductionArtifact => ({
  ready,
  execute: ready,
  stageReadyCount: ready ? 1 : 0,
  totalStages: 1,
  blockedStages: ready ? 0 : 1,
  missingEnv: [],
  stages: [],
  commands: [],
  targetQueries: {
    global: leaderboardTargetQuery("global"),
    friend: leaderboardTargetQuery("friend"),
    season: leaderboardTargetQuery("season"),
  },
  boardQueries: {
    global: "kickoff_leaderboard?select=*&order=global_rank.asc&limit=10",
    friend: "kickoff_leaderboard?select=*&friend_code=eq.chengdu&order=friend_rank.asc&limit=10",
    season: "kickoff_leaderboard?select=*&season_key=eq.world-cup-run&order=season_rank.asc&limit=10",
  },
  queryContracts: (["global", "friend", "season"] as const).map((scope) => ({
    scope,
    passed: ready,
    targetQueryReady: ready,
    boardQueryReady: ready,
    targetQuery: leaderboardTargetQuery(scope),
    boardQuery:
      scope === "global"
        ? "kickoff_leaderboard?select=*&order=global_rank.asc&limit=10"
        : scope === "friend"
          ? "kickoff_leaderboard?select=*&friend_code=eq.chengdu&order=friend_rank.asc&limit=10"
          : "kickoff_leaderboard?select=*&season_key=eq.world-cup-run&order=season_rank.asc&limit=10",
    detail: ready ? `${scope} target and board queries are complete` : `${scope} missing current-user target query`,
  })),
  readBackCommands: [],
  generatedAt: "2026-07-01T10:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  targets: { userId: "user-1", friendCode: "chengdu", seasonKey: "world-cup-run", leaderboardScopes: ["global", "friend", "season"] },
  acceptance: {
    globalCurrentUser: ready,
    friendCurrentUser: ready,
    seasonCurrentUser: ready,
    globalBoardRows: ready,
    friendBoardRows: ready,
    seasonBoardRows: ready,
    passedScopeCount: ready ? 3 : 1,
    requiredScopeCount: 3,
    passedBoardCount: ready ? 3 : 1,
    requiredBoardCount: 3,
    targetEnvReady: ready,
    queryContractsReady: ready,
    scopeClaims: (["global", "friend", "season"] as const).map((scope) => ({
      scope,
      doctorCheckId: scope,
      boardCheckId: `${scope}-board`,
      currentUser: ready || scope === "global",
      boardRows: ready || scope === "global",
      doctorPassed: ready || scope === "global",
      boardPassed: ready || scope === "global",
      targetQueryReady: ready || scope === "global",
      boardQueryReady: ready || scope === "global",
      targetQuery: leaderboardTargetQuery(scope),
      boardQuery:
        scope === "global"
          ? "kickoff_leaderboard?select=*&order=global_rank.asc&limit=10"
          : scope === "friend"
            ? "kickoff_leaderboard?select=*&friend_code=eq.chengdu&order=friend_rank.asc&limit=10"
            : "kickoff_leaderboard?select=*&season_key=eq.world-cup-run&order=season_rank.asc&limit=10",
      blockers: ready || scope === "global" ? [] : ["missing"],
    })),
    outputEnvKeys: [],
  },
  nextAction: ready ? "ready" : "blocked",
  copyText: "leaderboard",
});

describe("account cloud sync production evidence", () => {
  it("assembles a ready account evidence artifact from production read-back artifacts", () => {
    const artifact = buildAccountCloudSyncProductionEvidence({
      seedArtifact: seedArtifact(),
      schemaArtifact: schemaArtifact(),
      publicRestoreArtifact: publicRestoreArtifact(),
      shareChannelArtifact: shareChannelArtifact(),
      leaderboardArtifact: leaderboardArtifact(),
      generatedAt: "2026-07-01T10:10:00.000Z",
      source: "test",
    });

    expect(artifact.ready).toBe(true);
    expect(artifact.profileId).toBe("user-1");
    expect(artifact.expectedIds.modeRuns).toHaveLength(6);
    expect(artifact.expectedIds.shareArtifacts).toHaveLength(7);
    expect(artifact.expectedIds.leaderboardScopes).toEqual(["global", "friend", "season"]);
    expect(artifact.acceptance.outboxEmpty).toBe(true);
    expect(artifact.verifiedTotals.publicProfileArchives).toBe(14);
  });

  it("stays blocked when public restore, share channels or leaderboard scopes are incomplete", () => {
    const artifact = buildAccountCloudSyncProductionEvidence({
      seedArtifact: seedArtifact(),
      schemaArtifact: schemaArtifact(false),
      publicRestoreArtifact: publicRestoreArtifact(false),
      shareChannelArtifact: shareChannelArtifact(false),
      leaderboardArtifact: leaderboardArtifact(false),
      generatedAt: "2026-07-01T10:10:00.000Z",
      source: "test",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance).toMatchObject({
      backendReady: false,
      publicProofsReady: false,
      shareArtifactsReady: false,
      publicProfileReady: false,
      leaderboardScopesReady: false,
    });
    expect(artifact.missing).toEqual(
      expect.arrayContaining([
        "backend schema health not ready",
        "public proof fingerprints incomplete",
        "share card manifest/image read-back incomplete",
        "public profile archive read-back incomplete",
        "global/friend/season leaderboard current-user query contracts incomplete",
      ]),
    );
  });
});
