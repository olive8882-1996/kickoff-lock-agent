import { describe, expect, it } from "vitest";
import { buildAccountRecoveryEvidencePacket } from "./accountRecoveryEvidence";
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

const leaderboard = (
  scope: LeaderboardScope,
  patch: Partial<LeaderboardScopeEvidence> = {},
): LeaderboardScopeEvidence => ({
  scope,
  status: "loaded",
  rows: 3,
  filter: scope === "global" ? "global xp desc" : `${scope}=eq.user-1`,
  currentUserPresent: true,
  currentUserRank: 1,
  checkedAt: "2099-07-01T13:00:00.000Z",
  sampleIds: ["user-1", `sample-${scope}`],
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
    expect(packet.steps.find((step) => step.key === "records")?.detail).toBe("0/1 prediction records");
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
    expect(packet.recoveryScore).toBe("10/10");
    expect(packet.recoveredArtifacts).toBe(3);
    expect(packet.fingerprintMatches).toBe(3);
    expect(packet.leaderboardScopes).toEqual(["global", "friend", "season"]);
    expect(packet.copyText).toContain("Leaderboard scopes: global, friend, season");
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
          records: 1,
          modeRuns: 0,
          shareArtifacts: 0,
          publicShareImages: 0,
          publicProofs: 1,
          publicProfile: true,
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
});
