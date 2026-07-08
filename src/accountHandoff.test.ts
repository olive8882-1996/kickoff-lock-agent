import { describe, expect, it } from "vitest";
import { buildAccountHandoffPacket } from "./accountHandoff";
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

const profile: UserProfile = {
  id: "user-1",
  email: "fan@example.com",
  displayName: "Kickoff Analyst",
  location: "Chengdu",
  createdAt: "2099-01-01T00:00:00.000Z",
  cloudMode: "supabase",
};

const record = (id: string): MemoryRecord => ({
  capsule: {
    id,
    matchId: "m1",
    matchLabel: "Spain vs Austria",
    kickoffAt: "2099-07-01T19:00:00.000Z",
    createdAt: "2099-07-01T12:00:00.000Z",
    sealedAt: "2099-07-01T12:30:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: "bafy-demo",
      pieceCid: "piece-demo",
      provider: "demo",
      dataSetId: "demo",
      proofStatus: "retrievable",
    },
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Spain",
      keyPlayers: [],
      confidence: 72,
      style: "analysis",
      reasoning: "Spain pressure",
      agentSummary: "Spain edge",
      markets: [],
    },
  },
});

const modeRun = (id: string): GameModeRun => ({
  id,
  modeId: "bracket",
  title: "Bracket path",
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: ["cap-1"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: "bafy-mode",
    pieceCid: "piece-mode",
    provider: "demo",
    dataSetId: "demo",
    proofStatus: "retrievable",
  },
  status: "sealed",
  summary: "Path sealed",
  requirements: ["one locked capsule"],
});

const shareArtifact = (id: string): ShareArtifactEvidence => ({
  id,
  kind: "record",
  proofUrl: `https://example.com/?proof=${id}`,
  imageGenerated: true,
  imageUrl: `https://example.com/cards/${id}.png`,
  imageHash: "c".repeat(64),
  imageByteLength: 120000,
  imageMime: "image/png",
  fileName: `${id}.png`,
});

const leaderboardTargetQuery = (scope: LeaderboardScope) => {
  const params = new URLSearchParams({
    select: "*",
    order: "xp.desc",
    limit: "1",
    id: "eq.user-1",
  });
  if (scope === "friend") params.set("friend_code", "eq.chengdu");
  if (scope === "season") params.set("season_key", "eq.world-cup");
  return `kickoff_leaderboard?${params.toString()}`;
};

const leaderboardFilter = (scope: LeaderboardScope) =>
  scope === "global" ? "global xp desc" : scope === "friend" ? "friend_code=eq.chengdu" : "season_key=eq.world-cup";

const leaderboard = (scope: LeaderboardScope, patch: Partial<LeaderboardScopeEvidence> = {}): LeaderboardScopeEvidence => ({
  scope,
  status: "loaded",
  rows: 4,
  currentUserPresent: true,
  currentUserRank: 1,
  currentUserXp: 1200,
  currentUserLocks: 1,
  currentUserModeProofs: 1,
  currentUserRevealed: 1,
  currentUserVerifiedProofs: 1,
  currentUserExactHits: 0,
  currentUserFriendCode: scope === "friend" ? "chengdu" : undefined,
  expectedFriendCode: scope === "friend" ? "chengdu" : undefined,
  currentUserSeasonKey: scope === "season" ? "world-cup" : undefined,
  expectedSeasonKey: scope === "season" ? "world-cup" : undefined,
  filter: leaderboardFilter(scope),
  targetQuery: leaderboardTargetQuery(scope),
  sampleIds: [`user-1-${scope}`],
  ...patch,
});

const cleanRender = (
  kind: CloudCleanSessionPublicRender["kind"],
  targetId: string,
): CloudCleanSessionPublicRender => ({
  kind,
  targetId,
  url: `https://example.com/kickoff-lock-agent/?${kind === "proof" ? "proof" : kind}=${targetId}`,
  passed: true,
  cloudLoaded: true,
  detail: `${kind} rendered from cloud`,
  checkedAt: "2099-07-01T13:05:00.000Z",
});

const productionVerifyEnv = [
  "KICKOFF_VERIFY_USER_ID=user-1",
  "KICKOFF_VERIFY_PROFILE_ID=user-1",
  "KICKOFF_VERIFY_PUBLIC_PROFILE_URL=https://example.com/?profile=user-1",
  "KICKOFF_VERIFY_PROOF_ID=cap-1",
  'KICKOFF_VERIFY_MODE_IDS="mode-1"',
  'KICKOFF_VERIFY_SHARE_ARTIFACT_IDS="record:cap-1"',
  "KICKOFF_VERIFY_FRIEND_CODE=chengdu",
  "KICKOFF_VERIFY_SEASON_KEY=world-cup",
  "KICKOFF_VERIFY_LEADERBOARD_SCOPES=global,friend,season",
].join("\n");

describe("account handoff packet", () => {
  it("blocks cross-device handoff when Supabase runtime or read-back is missing", () => {
    const cloudState: CloudSyncState = {
      configured: false,
      authenticated: false,
      mode: "local",
      status: "offline",
      message: "Local profile active. Add Supabase env vars to enable cloud sync.",
    };

    const packet = buildAccountHandoffPacket({
      profile: { ...profile, cloudMode: "local" },
      cloudState,
      records: [record("cap-1")],
      modeRuns: [],
      shareEvidence: [],
      publicProfileUrl: "https://example.com/?profile=user-1",
      productionVerifyEnv: "KICKOFF_VERIFY_PROFILE_ID=\nKICKOFF_VERIFY_PROOF_ID=cap-1",
      missingRuntimeEnv: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    });

    expect(packet.crossDeviceReady).toBe(false);
    expect(packet.pendingSyncItems).toBe(1);
    expect(packet.checklist.find((item) => item.key === "runtime")?.status).toBe("blocked");
    expect(packet.nextAction).toContain("Supabase runtime");
    expect(packet.copyText).toContain("Production verify env");
  });

  it("marks handoff ready only after private, content and public profile read-back all match", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-07-01T13:00:00.000Z",
        profile: true,
        records: 1,
        modeRuns: 1,
        shareArtifacts: 1,
        publicProofs: 2,
        publicShareImages: 1,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        expectedShareArtifacts: 1,
        profileIdentity: {
          id: "user-1",
          email: "fan@example.com",
          displayName: "Kickoff Analyst",
          location: "Chengdu",
          friendCode: "chengdu",
        },
        recordIds: ["cap-1"],
        modeRunIds: ["mode-1"],
        shareArtifactIds: ["record:cap-1"],
        recordContentIds: ["cap-1"],
        modeRunContentIds: ["mode-1"],
        shareArtifactContentIds: ["record:cap-1"],
        publicProfileRecordIds: ["cap-1"],
        publicProfileModeRunIds: ["mode-1"],
        publicProfileShareArtifactIds: ["record:cap-1"],
        publicProfileRecordContentIds: ["cap-1"],
        publicProfileModeRunContentIds: ["mode-1"],
        publicProfileShareArtifactContentIds: ["record:cap-1"],
        cleanSessionPublicRenders: [
          cleanRender("profile", "user-1"),
          cleanRender("proof", "cap-1"),
          cleanRender("mode", "mode-1"),
        ],
        message: "all synced",
      },
    };

    const packet = buildAccountHandoffPacket({
      profile,
      cloudState,
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/?profile=user-1",
      productionVerifyEnv,
    });

    expect(packet.crossDeviceReady).toBe(true);
    expect(packet.pendingSyncItems).toBe(0);
    expect(packet.cleanSessionArtifacts).toBe(3);
    expect(packet.leaderboardScopes).toEqual(["global", "friend", "season"]);
    expect(packet.checklist.every((item) => item.status === "ready")).toBe(true);
    expect(packet.copyText).toContain("Profile identity: verified");
    expect(packet.copyText).toContain("Clean-session renders: profile 1/1, proofs 1/1, modes 1/1");
    expect(packet.copyText).toContain("Public profile: https://example.com/?profile=user-1");
  });

  it("keeps handoff blocked when the public profile archive IDs exist but payload fingerprints are stale", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-07-01T13:00:00.000Z",
        profile: true,
        records: 1,
        modeRuns: 1,
        shareArtifacts: 1,
        publicProofs: 2,
        publicShareImages: 1,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        expectedShareArtifacts: 1,
        profileIdentity: {
          id: "user-1",
          email: "fan@example.com",
          displayName: "Kickoff Analyst",
          location: "Chengdu",
          friendCode: "chengdu",
        },
        recordIds: ["cap-1"],
        modeRunIds: ["mode-1"],
        shareArtifactIds: ["record:cap-1"],
        recordContentIds: ["cap-1"],
        modeRunContentIds: ["mode-1"],
        shareArtifactContentIds: ["record:cap-1"],
        publicProfileRecordIds: ["cap-1"],
        publicProfileModeRunIds: ["mode-1"],
        publicProfileShareArtifactIds: ["record:cap-1"],
        publicProfileRecordContentIds: [],
        publicProfileModeRunContentIds: [],
        publicProfileShareArtifactContentIds: [],
        cleanSessionPublicRenders: [
          cleanRender("profile", "user-1"),
          cleanRender("proof", "cap-1"),
          cleanRender("mode", "mode-1"),
        ],
        message: "profile archive IDs exist, but payload fingerprints are stale",
      },
    };

    const packet = buildAccountHandoffPacket({
      profile,
      cloudState,
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/?profile=user-1",
      productionVerifyEnv,
    });

    expect(packet.crossDeviceReady).toBe(false);
    expect(packet.checklist.find((item) => item.key === "public-profile")).toMatchObject({
      status: "pending",
      detail: expect.stringContaining("archive fingerprints"),
    });
    expect(packet.copyText).toContain("Public profile archive fingerprints: records 0/1, modes 0/1, shares 0/1");
  });

  it("does not mark handoff ready without clean-session restore and scoped leaderboard rows", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-07-01T13:00:00.000Z",
        profile: true,
        profileIdentity: {
          id: "user-1",
          email: "fan@example.com",
          displayName: "Kickoff Analyst",
          location: "Chengdu",
          friendCode: "chengdu",
        },
        records: 1,
        modeRuns: 1,
        shareArtifacts: 1,
        publicProofs: 2,
        publicShareImages: 1,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        expectedShareArtifacts: 1,
        recordIds: ["cap-1"],
        modeRunIds: ["mode-1"],
        shareArtifactIds: ["record:cap-1"],
        recordContentIds: ["cap-1"],
        modeRunContentIds: ["mode-1"],
        shareArtifactContentIds: ["record:cap-1"],
        publicProfileRecordIds: ["cap-1"],
        publicProfileModeRunIds: ["mode-1"],
        publicProfileShareArtifactIds: ["record:cap-1"],
        cleanSessionPublicRenders: [cleanRender("profile", "user-1"), cleanRender("proof", "cap-1")],
        message: "all synced except mode clean render",
      },
    };

    const packet = buildAccountHandoffPacket({
      profile,
      cloudState,
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [
        leaderboard("global"),
        leaderboard("friend", { currentUserRank: undefined }),
        leaderboard("season"),
      ],
      publicProfileUrl: "https://example.com/?profile=user-1",
      productionVerifyEnv: "KICKOFF_VERIFY_PROFILE_ID=user-1\nKICKOFF_VERIFY_PROOF_ID=cap-1",
    });

    expect(packet.crossDeviceReady).toBe(false);
    expect(packet.cleanSessionArtifacts).toBe(2);
    expect(packet.leaderboardScopes).toEqual(["global", "season"]);
    expect(packet.checklist.find((item) => item.key === "clean-session")).toMatchObject({
      status: "pending",
      detail: "profile 1/1 · proofs 1/1 · modes 0/1",
    });
    expect(packet.checklist.find((item) => item.key === "leaderboard")).toMatchObject({
      status: "pending",
      detail: "friend: missing positive scoped rank · loaded · friend_code=eq.chengdu",
    });
  });

  it("does not mark handoff ready when production target env or public profile URL can only restore locally", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-07-01T13:00:00.000Z",
        profile: true,
        records: 1,
        modeRuns: 1,
        shareArtifacts: 1,
        publicProofs: 2,
        publicShareImages: 1,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        expectedShareArtifacts: 1,
        profileIdentity: {
          id: "user-1",
          email: "fan@example.com",
          displayName: "Kickoff Analyst",
          location: "Chengdu",
          friendCode: "chengdu",
        },
        recordIds: ["cap-1"],
        modeRunIds: ["mode-1"],
        shareArtifactIds: ["record:cap-1"],
        recordContentIds: ["cap-1"],
        modeRunContentIds: ["mode-1"],
        shareArtifactContentIds: ["record:cap-1"],
        publicProfileRecordIds: ["cap-1"],
        publicProfileModeRunIds: ["mode-1"],
        publicProfileShareArtifactIds: ["record:cap-1"],
        cleanSessionPublicRenders: [
          cleanRender("profile", "user-1"),
          cleanRender("proof", "cap-1"),
          cleanRender("mode", "mode-1"),
        ],
        message: "all synced",
      },
    };

    const packet = buildAccountHandoffPacket({
      profile,
      cloudState,
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "http://localhost:5173/?profile=user-1",
      productionVerifyEnv: [
        "KICKOFF_VERIFY_USER_ID=user-1",
        "KICKOFF_VERIFY_PROFILE_ID=user-1",
        "KICKOFF_VERIFY_PROOF_ID=cap-1",
        'KICKOFF_VERIFY_MODE_IDS="mode-other"',
        "KICKOFF_VERIFY_FRIEND_CODE=wrong",
        "KICKOFF_VERIFY_SEASON_KEY=world-cup",
      ].join("\n"),
    });

    expect(packet.crossDeviceReady).toBe(false);
    expect(packet.checklist.find((item) => item.key === "public-profile")).toMatchObject({
      status: "pending",
      detail: "public profile URL must be a deployed HTTPS URL",
    });
    expect(packet.checklist.find((item) => item.key === "target-env")).toMatchObject({
      status: "pending",
      detail: expect.stringContaining("KICKOFF_VERIFY_MODE_IDS missing mode-1"),
    });
    expect(packet.checklist.find((item) => item.key === "target-env")?.detail).toContain(
      "KICKOFF_VERIFY_FRIEND_CODE does not match profile friend code",
    );
  });
});
