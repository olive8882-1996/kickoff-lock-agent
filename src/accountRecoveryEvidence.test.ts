import { describe, expect, it } from "vitest";
import {
  buildAccountRecoveryEvidencePacket,
  cleanSessionRendersFromProductionEvidence,
} from "./accountRecoveryEvidence";
import type {
  CloudBackendHealth,
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

const cloudProfileIdentity = {
  id: profile.id,
  email: profile.email,
  displayName: profile.displayName,
  location: profile.location,
  friendCode: "chengdu",
};

const record = (id: string): MemoryRecord => ({
  capsule: {
    id,
    matchId: "match-1",
    matchLabel: "Brazil vs Japan",
    kickoffAt: "2099-07-01T19:00:00.000Z",
    createdAt: "2099-07-01T12:00:00.000Z",
    sealedAt: "2099-07-01T12:30:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "real",
      cid: "bafy-record",
      pieceCid: "piece-record",
      provider: "synapse",
      dataSetId: "dataset",
      proofStatus: "verified",
    },
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Brazil",
      keyPlayers: [],
      confidence: 74,
      style: "analysis",
      reasoning: "Brazil press",
      agentSummary: "Brazil edge",
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
    mode: "real",
    cid: "bafy-mode",
    pieceCid: "piece-mode",
    provider: "synapse",
    dataSetId: "dataset",
    proofStatus: "verified",
  },
  status: "scored",
  score: 88,
  summary: "Path sealed and scored.",
  requirements: ["one locked capsule"],
});

const shareArtifact = (id: string): ShareArtifactEvidence => ({
  id,
  kind: "record",
  proofUrl: `https://example.com/kickoff-lock-agent/?proof=${id}`,
  imageGenerated: true,
  generatedAt: "2099-07-01T12:05:00.000Z",
  fileName: `${id}-public-proof.png`,
  imageUrl: `https://cdn.example.com/cards/${id}.png`,
  imageMime: "image/png",
  imageByteLength: 240000,
  imageHash: "c".repeat(64),
});

const leaderboardTargetQuery = (scope: LeaderboardScope) => {
  const params = new URLSearchParams({
    id: `eq.${profile.id}`,
    order: "xp.desc",
    limit: "1",
  });
  if (scope === "friend") params.set("friend_code", "eq.chengdu");
  if (scope === "season") params.set("season_key", "eq.world-cup-run");
  return `kickoff_leaderboard?${params.toString()}`;
};

const leaderboard = (
  scope: LeaderboardScope,
  patch: Partial<LeaderboardScopeEvidence> = {},
): LeaderboardScopeEvidence => ({
  scope,
  status: "loaded",
  rows: 3,
  filter: scope === "global" ? "global xp desc" : scope === "friend" ? "friend_code=eq.chengdu" : "season_key=eq.world-cup-run",
  targetQuery: leaderboardTargetQuery(scope),
  currentUserPresent: true,
  currentUserRank: 1,
  currentUserXp: 1200,
  currentUserLocks: 4,
  currentUserRevealed: 3,
  currentUserVerifiedProofs: 2,
  currentUserModeProofs: 1,
  currentUserExactHits: 1,
  currentUserFriendCode: scope === "friend" ? "chengdu" : undefined,
  currentUserSeasonKey: scope === "season" ? "world-cup-run" : undefined,
  expectedFriendCode: "chengdu",
  expectedSeasonKey: "world-cup-run",
  checkedAt: "2099-07-01T13:00:00.000Z",
  sampleIds: ["user-1", `sample-${scope}`],
  ...patch,
});

const cleanRender = (kind: "profile" | "proof" | "mode", targetId: string, patch = {}) => ({
  kind,
  targetId,
  url: `https://example.com/kickoff-lock-agent/?${kind}=${targetId}`,
  passed: true,
  cloudLoaded: true,
  detail: `rendered ${kind} from cloud`,
  checkedAt: "2099-07-01T13:05:00.000Z",
  ...patch,
});

const backendHealth: CloudBackendHealth = {
  checkedAt: "2099-07-01T13:00:00.000Z",
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
  detail: "ready",
};

const productionEvidence = (patch: {
  profileIds?: string[];
  cleanSessionIds?: string[];
  proofIds?: string[];
  modeIds?: string[];
  profileUrl?: string;
  proofUrl?: string;
  modeUrl?: string;
} = {}) => ({
  generatedAt: "2099-07-01T13:10:00.000Z",
  source: "local-script" as const,
  strict: true,
  checks: [
    {
      id: "public-clean-session-restore",
      category: "sharing" as const,
      label: "Clean-session account restore",
      required: true,
      status: "passed" as const,
      detail: "cloud profile, prediction proof and mode proof pages rendered in a clean browser context without localStorage",
      checkedAt: "2099-07-01T13:10:00.000Z",
      sampleIds: patch.cleanSessionIds ?? [
        ...(patch.profileIds ?? ["user-1"]),
        ...(patch.proofIds ?? ["cap-1"]),
        ...(patch.modeIds ?? ["mode-1"]),
      ],
    },
    {
      id: "public-profile-link",
      category: "sharing" as const,
      label: "Public profile link",
      required: true,
      status: "passed" as const,
      detail: "rendered profile proof page for user-1",
      checkedAt: "2099-07-01T13:10:00.000Z",
      url: patch.profileUrl ?? "https://example.com/kickoff-lock-agent/?profile=user-1",
      sampleIds: patch.profileIds ?? ["user-1"],
    },
    {
      id: "public-proof-link",
      category: "sharing" as const,
      label: "Public prediction proof link",
      required: true,
      status: "passed" as const,
      detail: "rendered proof proof page for cap-1",
      checkedAt: "2099-07-01T13:10:00.000Z",
      url: patch.proofUrl ?? "https://example.com/kickoff-lock-agent/?proof=cap-1",
      sampleIds: patch.proofIds ?? ["cap-1"],
    },
    {
      id: "public-mode-link",
      category: "sharing" as const,
      label: "Public mode proof links",
      required: true,
      status: "passed" as const,
      detail: "rendered 1/1 mode proof pages",
      checkedAt: "2099-07-01T13:10:00.000Z",
      url: patch.modeUrl ?? "https://example.com/kickoff-lock-agent/?mode=mode-1",
      sampleIds: patch.modeIds ?? ["mode-1"],
    },
  ],
});

describe("account recovery evidence", () => {
  it("does not treat localStorage-only history as cross-device recovery", () => {
    const packet = buildAccountRecoveryEvidencePacket({
      profile: { ...profile, cloudMode: "local" },
      cloudState: {
        configured: false,
        authenticated: false,
        mode: "local",
        status: "offline",
        message: "Local profile active. Add Supabase env vars to enable cloud sync.",
      },
      records: [record("cap-1")],
      modeRuns: [],
      shareEvidence: [],
      leaderboardScopeEvidence: [],
      publicProfileUrl: "http://127.0.0.1:4173/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.recoveryScore).not.toBe("10/10");
    expect(packet.steps.find((step) => step.key === "runtime")?.status).toBe("blocked");
    expect(packet.steps.find((step) => step.key === "records")?.detail).toBe("0/1 prediction records · owners 0/1");
    expect(packet.copyText).toContain("cross-device recovery rehearsal");
  });

  it("requires private rows, anonymous pages, fingerprints and every leaderboard scope", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
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
          message: "all read back",
        },
      } satisfies CloudSyncState,
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(true);
    expect(packet.recoveryScore).toBe("12/12");
    expect(packet.recoveredArtifacts).toBe(3);
    expect(packet.fingerprintMatches).toBe(3);
    expect(packet.leaderboardScopes).toEqual(["global", "friend", "season"]);
    expect(packet.recoveryProofs).toHaveLength(4);
    expect(packet.recoveryProofs.map((proof) => proof.kind)).toEqual(["profile", "record", "mode", "share"]);
    expect(packet.recoveryProofs.every((proof) => proof.status === "passed")).toBe(true);
    expect(packet.recoveryProofs.find((proof) => proof.kind === "share")).toMatchObject({
      id: "record:cap-1",
      cloudRow: true,
      contentFingerprint: true,
      publicArchive: true,
      cleanSession: true,
      imageUrl: "https://cdn.example.com/cards/cap-1.png",
    });
    expect(packet.steps.find((step) => step.key === "cloud-targets")).toMatchObject({
      status: "passed",
      detail:
        "expected records 1/1 · modes 1/1 · shares 1/1 · ids records 1/1 · modes 1/1 · shares 1/1 · owners records 1/1 · modes 1/1 · shares 1/1",
    });
    expect(packet.copyText).toContain("Leaderboard scopes: global, friend, season");
    expect(packet.copyText).toContain("Cloud targets: aligned");
    expect(packet.copyText).toContain("Clean renders: profile 1/1 · proofs 1/1 · modes 1/1");
    expect(packet.copyText).toContain("Recovery proofs: 4/4");
    expect(packet.copyText).toContain("share:record:cap-1 · passed · cloud yes · fingerprint yes · public yes · clean yes");
  });

  it("does not accept cloud rows owned by a different Supabase profile", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Rows matched by id but belonged to another user",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-2" },
          modeRunOwnerIds: { "mode-1": "user-2" },
          shareArtifactOwnerIds: { "record:cap-1": "user-2" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
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
          message: "id matches were not owner-bound",
        },
      } satisfies CloudSyncState,
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "cloud-targets")).toMatchObject({
      status: "pending",
      detail: expect.stringContaining("record cap-1 owner user-2 != user-1"),
    });
    expect(packet.steps.find((step) => step.key === "records")).toMatchObject({
      status: "pending",
      detail: "1/1 prediction records · owners 0/1",
    });
    expect(packet.steps.find((step) => step.key === "shares")).toMatchObject({
      status: "pending",
      detail: "1/1 manifests · owners 0/1 · 1/1 public images",
    });
    expect(packet.recoveryProofs.find((proof) => proof.kind === "record")).toMatchObject({
      status: "pending",
      cloudRow: false,
      blockers: expect.arrayContaining(["record cap-1 owner user-2 != user-1"]),
    });
    expect(packet.copyText).toContain("Cloud targets: mismatched");
  });

  it("does not accept a private profile flag without cloud identity fields", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Profile flag was set without identity read-back",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
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
          message: "counts look complete but identity was not captured",
        },
      } satisfies CloudSyncState,
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "profile")).toMatchObject({
      status: "pending",
      detail: "cloud profile identity fields were not read back",
    });
  });

  it("does not treat matching counts and fingerprints as recovery without target ids", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Counts were produced without target id evidence",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
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
          message: "counts and fingerprints read back, row ids omitted",
        },
      } satisfies CloudSyncState,
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "records")).toMatchObject({
      status: "pending",
      detail: "0/1 prediction records · owners 0/1",
    });
    expect(packet.steps.find((step) => step.key === "cloud-targets")?.detail).toContain("records missing cap-1");
    expect(packet.steps.find((step) => step.key === "proof-links")?.detail).toBe("0/2 proof links · 0/2 proof fingerprints");
    expect(packet.copyText).toContain("Cloud targets: mismatched");
  });

  it("does not pass recovery when Supabase rows align but clean-session renders were not captured", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced without clean browser render evidence",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "all rows read back, clean render not captured",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")).toMatchObject({
      status: "pending",
      detail:
        "anonymous 2/2 proof links · proof fingerprints 2/2 · archive 3/3 · targets aligned · fingerprints 3/3 · clean renders profile 0/1 · proofs 0/1 · modes 0/1",
    });
    expect(packet.recoveryProofs.find((proof) => proof.kind === "record")).toMatchObject({
      status: "pending",
      blockers: expect.arrayContaining(["clean-session proof render missing"]),
    });
    expect(packet.recoveryProofs.find((proof) => proof.kind === "mode")).toMatchObject({
      status: "pending",
      blockers: expect.arrayContaining(["clean-session mode render missing"]),
    });
  });

  it("does not pass recovery when clean-session renders use non-production URLs", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced with local clean render evidence",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          cleanSessionPublicRenders: [
            cleanRender("profile", "user-1", { url: "http://127.0.0.1:4173/kickoff-lock-agent/?profile=user-1" }),
            cleanRender("proof", "cap-1", { url: "http://127.0.0.1:4173/kickoff-lock-agent/?proof=cap-1" }),
            cleanRender("mode", "mode-1", { url: "http://127.0.0.1:4173/kickoff-lock-agent/?mode=mode-1" }),
          ],
          message: "all rows read back, but clean renders came from localhost",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")).toMatchObject({
      status: "pending",
      detail:
        "anonymous 2/2 proof links · proof fingerprints 2/2 · archive 3/3 · targets aligned · fingerprints 3/3 · clean renders profile 0/1 · proofs 0/1 · modes 0/1 · failures profile:user-1 non-production public URL | proof:cap-1 non-production public URL | mode:mode-1 non-production public URL",
    });
  });

  it("does not pass recovery when clean-session social proof metadata is stale", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced with stale public metadata",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          cleanSessionPublicRenders: [
            cleanRender("profile", "user-1"),
            cleanRender("proof", "cap-1", { socialOk: false }),
            cleanRender("mode", "mode-1", { shareImageMatched: false }),
          ],
          message: "all rows read back, but public metadata was stale",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")).toMatchObject({
      status: "pending",
      detail:
        "anonymous 2/2 proof links · proof fingerprints 2/2 · archive 3/3 · targets aligned · fingerprints 3/3 · clean renders profile 1/1 · proofs 0/1 · modes 0/1 · failures proof:cap-1 social metadata incomplete | mode:mode-1 share image mismatch",
    });
  });

  it("can use production evidence clean-session renders when sample ids match the recovered account", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "all rows read back",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      productionEvidence: productionEvidence(),
    });

    expect(cleanSessionRendersFromProductionEvidence(productionEvidence())).toHaveLength(3);
    expect(packet.ready).toBe(true);
    expect(packet.steps.find((step) => step.key === "clean-session")).toMatchObject({
      status: "passed",
      detail: "profile, proof and mode pages cloud-load in a clean browser context without localStorage",
    });
  });

  it("does not reuse non-strict production evidence for clean-session recovery", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const nonStrictEvidence = {
      ...productionEvidence(),
      strict: false,
    };
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "all rows read back",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      productionEvidence: nonStrictEvidence,
    });

    expect(cleanSessionRendersFromProductionEvidence(nonStrictEvidence)).toEqual([]);
    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")).toMatchObject({
      status: "pending",
      detail:
        "anonymous 2/2 proof links · proof fingerprints 2/2 · archive 3/3 · targets aligned · fingerprints 3/3 · clean renders profile 0/1 · proofs 0/1 · modes 0/1",
    });
  });

  it("does not reuse localhost production evidence for clean-session recovery", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const localEvidence = productionEvidence({
      profileUrl: "http://127.0.0.1:4173/kickoff-lock-agent/?profile=user-1",
      proofUrl: "http://127.0.0.1:4173/kickoff-lock-agent/?proof=cap-1",
      modeUrl: "http://127.0.0.1:4173/kickoff-lock-agent/?mode=mode-1",
    });
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "all rows read back",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      productionEvidence: localEvidence,
    });

    expect(cleanSessionRendersFromProductionEvidence(localEvidence)).toEqual([]);
    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")?.detail).toContain(
      "clean renders profile 0/1 · proofs 0/1 · modes 0/1",
    );
  });

  it("does not reuse production clean-session renders for mismatched proof or mode targets", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "all rows read back",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      productionEvidence: productionEvidence({ proofIds: ["cap-other"], modeIds: ["mode-other"] }),
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")?.detail).toContain(
      "clean renders profile 1/1 · proofs 0/1 · modes 0/1",
    );
  });

  it("does not reuse production clean-session renders when URLs do not target the matching artifact ids", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const genericEvidence = productionEvidence({
      profileUrl: "https://example.com/kickoff-lock-agent/?view=profile",
      proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-other",
      modeUrl: "https://example.com/kickoff-lock-agent/?mode=mode-other",
      cleanSessionIds: ["user-1", "cap-1", "mode-1"],
      profileIds: ["user-1"],
      proofIds: ["cap-1"],
      modeIds: ["mode-1"],
    });
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "all rows read back",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      productionEvidence: genericEvidence,
    });

    expect(cleanSessionRendersFromProductionEvidence(genericEvidence)).toEqual([]);
    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")?.detail).toContain(
      "clean renders profile 0/1 · proofs 0/1 · modes 0/1",
    );
  });

  it("does not stitch profile render evidence from a different clean-session target set", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const mismatchedEvidence = productionEvidence({ cleanSessionIds: ["user-other", "cap-1", "mode-1"] });
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "all rows read back",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      productionEvidence: mismatchedEvidence,
    });

    expect(cleanSessionRendersFromProductionEvidence(mismatchedEvidence).map((render) => render.targetId)).toEqual([
      "cap-1",
      "mode-1",
    ]);
    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")?.detail).toContain(
      "clean renders profile 0/1 · proofs 1/1 · modes 1/1",
    );
  });

  it("does not pass recovery when private cloud rows read back but anonymous restore evidence is incomplete", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Private rows read back",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 1,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1"],
          publicProofContentIds: ["record:cap-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: [],
          publicProfileShareArtifactIds: [],
          message: "private rows restored but anonymous archive incomplete",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")).toMatchObject({
      status: "pending",
      detail:
        "anonymous 1/2 proof links · proof fingerprints 1/2 · archive 1/3 · targets mismatched · fingerprints 3/3 · clean renders profile 0/1 · proofs 0/1 · modes 0/1 · target ids proof links missing mode:mode-1 | proof content missing mode:mode-1 | profile modes missing mode-1 | profile shares missing record:cap-1",
    });
    expect(packet.steps.find((step) => step.key === "public-profile")?.status).toBe("pending");
  });

  it("does not pass clean-session restore when public archive counts exist but content fingerprints are stale", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Public pages read back stale rows",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: [],
          shareArtifactContentIds: [],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "public archive rows exist but content fingerprints are stale",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "clean-session")).toMatchObject({
      status: "pending",
      detail:
        "anonymous 2/2 proof links · proof fingerprints 2/2 · archive 3/3 · targets aligned · fingerprints 1/3 · clean renders profile 0/1 · proofs 0/1 · modes 0/1",
    });
    expect(packet.steps.find((step) => step.key === "fingerprints")).toMatchObject({
      status: "pending",
      detail: "1/3 remote payload fingerprints",
    });
  });

  it("does not pass clean-session recovery when cloud verification targets do not match local artifacts", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Read-back was produced for a stale target set",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 0,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "stale expected mode count",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [leaderboard("global"), leaderboard("friend"), leaderboard("season")],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "cloud-targets")).toMatchObject({
      status: "pending",
      detail:
        "expected records 1/1 · modes 0/1 · shares 1/1 · ids records 0/1 · modes 0/1 · shares 0/1 · owners records 0/1 · modes 0/1 · shares 0/1 · records missing cap-1 · modes missing mode-1 · shares missing record:cap-1 · record owners not read back · mode owners not read back · share owners not read back · proof links missing record:cap-1, mode:mode-1 · proof content missing record:cap-1, mode:mode-1",
    });
    expect(packet.steps.find((step) => step.key === "clean-session")?.detail).toContain("targets mismatched");
    expect(packet.copyText).toContain("Cloud targets: mismatched");
  });

  it("flags missing current-user leaderboard scopes even when other cloud rows recovered", () => {
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Synced",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 0,
          shareArtifacts: 0,
          publicShareImages: 0,
          publicProofs: 1,
          publicProfile: true,
          recordIds: ["cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          publicProofIds: ["record:cap-1"],
          publicProofContentIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 0,
          expectedShareArtifacts: 0,
          recordContentIds: ["cap-1"],
          publicProfileRecordIds: ["cap-1"],
          message: "record restored",
        },
      },
      records: [record("cap-1")],
      modeRuns: [],
      shareEvidence: [],
      leaderboardScopeEvidence: [
        leaderboard("global", { currentUserPresent: false, sampleIds: ["other"] }),
        leaderboard("friend", { status: "empty", rows: 0, currentUserPresent: false }),
      ],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.steps.find((step) => step.key === "leaderboard")?.detail).toContain("global, friend, season");
    expect(packet.nextAction).toContain("Create a bracket");
  });

  it("does not count leaderboard recovery when current-user rows omit scoped ranks or stats", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Rows read back without scoped rank evidence",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-1"],
          modeRunContentIds: ["mode-1"],
          shareArtifactContentIds: ["record:cap-1"],
          publicProfileRecordIds: ["cap-1"],
          publicProfileModeRunIds: ["mode-1"],
          publicProfileShareArtifactIds: ["record:cap-1"],
          message: "all rows read back",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [
        leaderboard("global", { currentUserRank: undefined }),
        leaderboard("friend", { currentUserRank: 0 }),
        leaderboard("season", { currentUserXp: 1400 }),
      ],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.leaderboardScopes).toEqual(["season"]);
    expect(packet.steps.find((step) => step.key === "leaderboard")).toMatchObject({
      status: "pending",
      detail: "missing current-user scoped rank in global, friend",
    });
  });

  it("does not count leaderboard recovery when target queries are not bound to the recovered profile", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const packet = buildAccountRecoveryEvidencePacket({
      profile,
      cloudState: {
        configured: true,
        authenticated: true,
        refreshable: true,
        mode: "supabase",
        status: "synced",
        message: "Rows read back with generic leaderboard queries",
        verification: {
          checkedAt: "2099-07-01T13:00:00.000Z",
          backendHealth,
          profile: true,
          profileIdentity: cloudProfileIdentity,
          records: 1,
          modeRuns: 1,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProofs: 2,
          publicProfile: true,
          recordIds: ["cap-1"],
          modeRunIds: ["mode-1"],
          shareArtifactIds: ["record:cap-1"],
          recordOwnerIds: { "cap-1": "user-1" },
          modeRunOwnerIds: { "mode-1": "user-1" },
          shareArtifactOwnerIds: { "record:cap-1": "user-1" },
          publicProofIds: ["record:cap-1", "mode:mode-1"],
          publicProofContentIds: ["record:cap-1", "mode:mode-1"],
          publicShareImageIds: ["record:cap-1"],
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
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
          message: "all rows read back",
        },
      },
      records,
      modeRuns,
      shareEvidence,
      leaderboardScopeEvidence: [
        leaderboard("global", { targetQuery: "kickoff_leaderboard?order=xp.desc&limit=20" }),
        leaderboard("friend", { targetQuery: "kickoff_leaderboard?id=eq.user-2&order=xp.desc&limit=1&friend_code=eq.chengdu" }),
        leaderboard("season", { targetQuery: "kickoff_leaderboard?id=eq.user-1&order=xp.desc&limit=1" }),
      ],
      publicProfileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });

    expect(packet.ready).toBe(false);
    expect(packet.leaderboardScopes).toEqual([]);
    expect(packet.steps.find((step) => step.key === "leaderboard")).toMatchObject({
      status: "pending",
      detail: "missing current-user scoped rank in global, friend, season",
    });
  });
});
