import { describe, expect, it } from "vitest";
import { buildAccountCloudSyncEvidence, buildAccountCloudSyncEvidenceArtifact } from "./accountCloudSyncEvidence";
import type {
  CloudBackendHealth,
  CloudSyncState,
  GameModeRun,
  LeaderboardEntry,
  LeaderboardScope,
  LeaderboardScopeEvidence,
  MemoryRecord,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";

const profile: UserProfile = {
  id: "user-1",
  email: "fan@example.com",
  displayName: "Fan One",
  location: "Chengdu",
  createdAt: "2026-07-01T00:00:00.000Z",
  cloudMode: "supabase",
};

const record = (id: string): MemoryRecord => ({
  capsule: {
    id,
    matchId: "match-1",
    matchLabel: "A vs B",
    kickoffAt: "2026-07-01T12:00:00.000Z",
    createdAt: "2026-07-01T10:00:00.000Z",
    sealedAt: "2026-07-01T10:01:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "real",
      cid: `bafy-${id}`,
      pieceCid: `piece-${id}`,
      provider: "production",
      dataSetId: "set",
      proofStatus: "verified",
    },
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
});

const modeRun = (id: string): GameModeRun => ({
  id,
  modeId: "bracket",
  title: "Bracket",
  createdAt: "2026-07-01T10:02:00.000Z",
  capsuleIds: ["cap-1"],
  payloadHash: "b".repeat(64),
  status: "sealed",
  summary: "Bracket sealed",
  requirements: ["capsule"],
  filecoinProof: {
    mode: "real",
    cid: `bafy-${id}`,
    pieceCid: `piece-${id}`,
    provider: "production",
    dataSetId: "set",
    proofStatus: "verified",
  },
});

const shareArtifact = (id: string): ShareArtifactEvidence => ({
  id,
  kind: "record",
  proofUrl: `https://example.com/kickoff-lock-agent/?proof=${id}`,
  imageGenerated: true,
  generatedAt: "2026-07-01T10:03:00.000Z",
  fileName: `${id}.png`,
  imageUrl: `https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/${id}/card.png`,
  imageMime: "image/png",
  imageByteLength: 120_000,
  imageHash: "c".repeat(64),
});

const backendHealth = (): CloudBackendHealth => ({
  checkedAt: "2026-07-01T10:04:00.000Z",
  schemaVersion: "2026-07-03-cloud-v2",
  ready: true,
  requiredTables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
  missingTables: [],
  requiredViews: ["kickoff_leaderboard", "kickoff_backend_health"],
  missingViews: [],
  rlsTables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
  missingRlsTables: [],
  policyCount: 8,
  requiredPolicyCount: 8,
  storageBucketPublic: true,
  storagePolicyCount: 3,
  requiredStoragePolicyCount: 3,
  detail: "schema ready",
});

const syncedState = (patch: Partial<CloudSyncState["verification"]> = {}): CloudSyncState => ({
  configured: true,
  authenticated: true,
  mode: "supabase",
  status: "synced",
  message: "synced",
  verification: {
    checkedAt: "2026-07-01T10:05:00.000Z",
    backendHealth: backendHealth(),
    profile: true,
    profileIdentity: {
      id: "user-1",
      email: "fan@example.com",
      displayName: "Fan One",
      location: "Chengdu",
      friendCode: "chengdu",
    },
    authUserIdentity: {
      id: "user-1",
      email: "fan@example.com",
    },
    profileIdentityProblems: [],
    authUserProblems: [],
    records: 1,
    modeRuns: 1,
    publicProofs: 2,
    shareArtifacts: 1,
    publicShareImages: 1,
    publicProfile: true,
    expectedRecords: 1,
    expectedModeRuns: 1,
    expectedShareArtifacts: 1,
    recordIds: ["cap-1"],
    modeRunIds: ["mode-1"],
    shareArtifactIds: ["record:cap-1"],
    publicProofIds: ["record:cap-1", "mode:mode-1"],
    publicProofContentIds: ["record:cap-1", "mode:mode-1"],
    publicShareImageIds: ["record:cap-1"],
    recordContentIds: ["cap-1"],
    modeRunContentIds: ["mode-1"],
    shareArtifactContentIds: ["record:cap-1"],
    publicProfileRecordIds: ["cap-1"],
    publicProfileModeRunIds: ["mode-1"],
    publicProfileShareArtifactIds: ["record:cap-1"],
    publicProfileRecordContentIds: ["cap-1"],
    publicProfileModeRunContentIds: ["mode-1"],
    publicProfileShareArtifactContentIds: ["record:cap-1"],
    message: "Cloud read-back verified.",
    ...patch,
  },
});

const leaderboard = (): LeaderboardEntry[] =>
  (["global", "friend", "season"] as const).map((scope, index) => ({
    id: "user-1",
    displayName: "Fan One",
    location: "Chengdu",
    rank: index + 1,
    locks: 1,
    revealed: 1,
    averageScore: 88,
    bestScore: 88,
    xp: 300,
    streak: 1,
    exactHits: 1,
    verifiedProofs: 1,
    modeProofs: 1,
    source: scope,
  }));

const leaderboardSelect = [
  "id",
  "display_name",
  "location",
  "friend_code",
  "season_key",
  "locks",
  "revealed",
  "average_score",
  "best_score",
  "xp",
  "streak",
  "exact_hits",
  "verified_proofs",
  "mode_proofs",
  "global_rank",
  "friend_rank",
  "season_rank",
  "rank",
  "updated_at",
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

const leaderboardScopeEvidence = (
  scope: LeaderboardScope,
  patch: Partial<LeaderboardScopeEvidence> = {},
): LeaderboardScopeEvidence => ({
  scope,
  status: "loaded",
  rows: 2,
  filter: scope === "global" ? "global xp desc" : scope === "friend" ? "friend_code=eq.chengdu" : "season_key=eq.world-cup-run",
  targetQuery: leaderboardTargetQuery(scope),
  currentUserPresent: true,
  currentUserRank: scope === "global" ? 3 : scope === "friend" ? 2 : 1,
  currentUserXp: 300,
  currentUserLocks: 1,
  currentUserRevealed: 1,
  currentUserVerifiedProofs: 1,
  currentUserModeProofs: 1,
  currentUserExactHits: 1,
  currentUserFriendCode: scope === "friend" || scope === "season" ? "chengdu" : undefined,
  currentUserSeasonKey: scope === "friend" || scope === "season" ? "world-cup-run" : undefined,
  expectedFriendCode: "chengdu",
  expectedSeasonKey: "world-cup-run",
  checkedAt: "2026-07-01T10:05:30.000Z",
  sampleIds: ["user-1", `sample-${scope}`],
  ...patch,
});

const leaderboardScopeEvidenceSet = () =>
  (["global", "friend", "season"] as const).map((scope) => leaderboardScopeEvidence(scope));

describe("account cloud sync evidence", () => {
  it("keeps a local-only profile blocked with every account artifact in the outbox", () => {
    const packet = buildAccountCloudSyncEvidence({
      profile: { ...profile, id: "local-1", cloudMode: "local" },
      cloudState: {
        configured: false,
        authenticated: false,
        mode: "local",
        status: "offline",
        message: "local",
      },
      records: [record("cap-1")],
      modeRuns: [modeRun("mode-1")],
      shareArtifacts: [shareArtifact("cap-1")],
    });

    expect(packet.ready).toBe(false);
    expect(packet.acceptance).toMatchObject({
      backendReady: false,
      profileIdentityReady: false,
      historyReady: false,
      outboxEmpty: false,
      leaderboardScopesReady: false,
    });
    expect(packet.outbox.reduce((sum, item) => sum + item.queued, 0)).toBe(6);
    expect(packet.missing).toEqual(expect.arrayContaining(["Supabase runtime not configured", "profile is still local-only"]));
  });

  it("marks account cloud sync ready only when history, public pages, outbox and all leaderboard scopes read back", () => {
    const packet = buildAccountCloudSyncEvidenceArtifact(
      {
        profile,
        cloudState: syncedState(),
        records: [record("cap-1")],
        modeRuns: [modeRun("mode-1")],
        shareArtifacts: [shareArtifact("cap-1")],
        leaderboardEntries: leaderboard(),
        leaderboardScopeEvidence: leaderboardScopeEvidenceSet(),
      },
      { generatedAt: "2026-07-01T10:06:00.000Z", source: "test" },
    );

    expect(packet.ready).toBe(true);
    expect(packet.artifactVersion).toBe(1);
    expect(packet.acceptance).toMatchObject({
      backendReady: true,
      profileIdentityReady: true,
      historyReady: true,
      publicProofsReady: true,
      shareArtifactsReady: true,
      publicProfileReady: true,
      outboxEmpty: true,
      auditPassed: true,
      leaderboardScopesReady: true,
      cloudReadBackReady: true,
    });
    expect(packet.expectedIds).toMatchObject({
      records: ["cap-1"],
      modeRuns: ["mode-1"],
      shareArtifacts: ["record:cap-1"],
      publicProofs: ["record:cap-1", "mode:mode-1"],
      leaderboardScopes: ["global", "friend", "season"],
    });
    expect(packet.evidenceFingerprint).toContain('"profileId": "user-1"');
    expect(packet.copyText).toContain("Ready: yes");
    expect(packet.copyText).toContain("Leaderboard query contracts: 3/3");
    expect(packet.leaderboardQueryContract.ready).toBe(true);
  });

  it("does not pass account evidence from generic remote leaderboard rows without current-user query contracts", () => {
    const packet = buildAccountCloudSyncEvidence({
      profile,
      cloudState: syncedState(),
      records: [record("cap-1")],
      modeRuns: [modeRun("mode-1")],
      shareArtifacts: [shareArtifact("cap-1")],
      leaderboardEntries: leaderboard(),
    });

    expect(packet.ready).toBe(false);
    expect(packet.acceptance.leaderboardScopesReady).toBe(false);
    expect(packet.leaderboardQueryContract.ready).toBe(false);
    expect(packet.missing).toContain("global/friend/season leaderboard current-user query contracts incomplete");
    expect(packet.copyText).toContain("Leaderboard rows: global, friend, season");
    expect(packet.copyText).toContain("Leaderboard query contracts: 0/3");
  });

  it("does not pass when leaderboard scopes or public profile fingerprints are stale", () => {
    const packet = buildAccountCloudSyncEvidence({
      profile,
      cloudState: syncedState({
        publicProfileShareArtifactContentIds: [],
        missingPublicProfileShareArtifactContentIds: ["record:cap-1"],
      }),
      records: [record("cap-1")],
      modeRuns: [modeRun("mode-1")],
      shareArtifacts: [shareArtifact("cap-1")],
      leaderboardEntries: leaderboard().filter((entry) => entry.source === "global"),
      leaderboardScopeEvidence: [leaderboardScopeEvidence("global")],
    });

    expect(packet.ready).toBe(false);
    expect(packet.acceptance.publicProfileReady).toBe(false);
    expect(packet.acceptance.leaderboardScopesReady).toBe(false);
    expect(packet.missing).toEqual(
      expect.arrayContaining([
        "public profile archive read-back incomplete",
        "global/friend/season leaderboard current-user query contracts incomplete",
      ]),
    );
    expect(packet.copyText).toContain("Leaderboard rows: global");
    expect(packet.copyText).toContain("Leaderboard query contracts: 1/3");
  });
});
