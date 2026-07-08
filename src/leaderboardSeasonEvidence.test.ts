import { describe, expect, it } from "vitest";
import { buildLeaderboardSeasonEvidencePacket } from "./leaderboardSeasonEvidence";
import type { LeaderboardEntry, LeaderboardScope, LeaderboardScopeEvidence, UserProfile } from "./types";

const profile: UserProfile = {
  id: "user-1",
  email: "fan@example.com",
  displayName: "Kickoff Analyst",
  location: "Chengdu",
  createdAt: "2099-01-01T00:00:00.000Z",
  cloudMode: "supabase",
};

const remoteEntry = (scope: LeaderboardScope, patch: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  id: profile.id,
  displayName: profile.displayName,
  location: profile.location,
  rank: scope === "global" ? 4 : scope === "friend" ? 2 : 1,
  locks: 8,
  revealed: 7,
  averageScore: 83,
  bestScore: 97,
  xp: scope === "season" ? 1420 : 1200,
  streak: 3,
  exactHits: 2,
  verifiedProofs: 5,
  modeProofs: 4,
  seasonKey: "world-cup-run",
  friendCode: "chengdu",
  updatedAt: "2099-01-01T00:00:00.000Z",
  source: scope,
  ...patch,
});

const scopeEvidence = (
  scope: LeaderboardScope,
  patch: Partial<LeaderboardScopeEvidence> = {},
): LeaderboardScopeEvidence => ({
  scope,
  status: "loaded",
  rows: 3,
  filter: scope === "global" ? "global xp desc" : scope === "friend" ? "friend_code=eq.chengdu" : "season_key=eq.world-cup-run",
  currentUserPresent: true,
  currentUserRank: scope === "global" ? 4 : scope === "friend" ? 2 : 1,
  checkedAt: "2099-01-01T00:00:00.000Z",
  sampleIds: [profile.id, `sample-${scope}`],
  ...patch,
});

describe("leaderboard season evidence packet", () => {
  it("builds a ready season claim from global, friend and season Supabase rows", () => {
    const packet = buildLeaderboardSeasonEvidencePacket({
      profile,
      entries: [remoteEntry("global"), remoteEntry("friend"), remoteEntry("season")],
      evidence: [scopeEvidence("global"), scopeEvidence("friend"), scopeEvidence("season")],
    });

    expect(packet.ready).toBe(true);
    expect(packet.passedScopes).toBe(3);
    expect(packet.remoteRows).toBe(3);
    expect(packet.localFallbackRows).toBe(0);
    expect(packet.bestRank).toBe(1);
    expect(packet.seasonXp).toBe(1420);
    expect(packet.friendCode).toBe("chengdu");
    expect(packet.seasonKey).toBe("world-cup-run");
    expect(packet.copyText).toContain("Ready: yes");
    expect(packet.copyText).toContain("Best rank: #1");
  });

  it("does not trust local fallback rows as leaderboard backend evidence", () => {
    const packet = buildLeaderboardSeasonEvidencePacket({
      profile,
      entries: [
        {
          ...remoteEntry("global"),
          source: "local",
        },
      ],
      evidence: [
        scopeEvidence("global", { currentUserPresent: false, sampleIds: ["other-user"] }),
        scopeEvidence("friend", { status: "empty", rows: 0, currentUserPresent: false, currentUserRank: undefined }),
        scopeEvidence("season", { status: "unchecked", rows: 0, currentUserPresent: false, currentUserRank: undefined }),
      ],
    });

    expect(packet.ready).toBe(false);
    expect(packet.remoteRows).toBe(0);
    expect(packet.localFallbackRows).toBe(1);
    expect(packet.missingScopes).toEqual(["global", "friend", "season"]);
    expect(packet.nextAction).toContain("global, friend, season");
    expect(packet.copyText).toContain("Local fallback rows: 1");
  });

  it("requires matching packet rows even when query evidence says a scope saw the current user", () => {
    const packet = buildLeaderboardSeasonEvidencePacket({
      profile,
      entries: [remoteEntry("global"), remoteEntry("season")],
      evidence: [scopeEvidence("global"), scopeEvidence("friend"), scopeEvidence("season")],
    });

    expect(packet.ready).toBe(false);
    expect(packet.currentUserScopes).toEqual(["global", "season"]);
    expect(packet.missingScopes).toEqual(["friend"]);
    expect(packet.checks.find((check) => check.key === "friend")?.detail).toContain("not in packet rows");
  });

  it("does not trust current-user packet rows without scoped ranks", () => {
    const packet = buildLeaderboardSeasonEvidencePacket({
      profile,
      entries: [
        remoteEntry("global", { rank: undefined }),
        remoteEntry("friend", { rank: 0 }),
        remoteEntry("season", { rank: 1 }),
      ],
      evidence: [
        scopeEvidence("global", { currentUserRank: undefined }),
        scopeEvidence("friend", { currentUserRank: 0 }),
        scopeEvidence("season", { currentUserRank: 1 }),
      ],
    });

    expect(packet.ready).toBe(false);
    expect(packet.currentUserScopes).toEqual(["season"]);
    expect(packet.missingScopes).toEqual(["global", "friend"]);
    expect(packet.nextAction).toContain("scoped rank");
    expect(packet.checks.find((check) => check.key === "global")?.detail).toContain("missing scoped rank");
    expect(packet.checks.find((check) => check.key === "friend")?.detail).toContain("missing scoped rank");
  });

  it("requires friend and season rows to match the scoped filters", () => {
    const packet = buildLeaderboardSeasonEvidencePacket({
      profile,
      entries: [
        remoteEntry("global"),
        remoteEntry("friend", { friendCode: "other-friends" }),
        remoteEntry("season", { seasonKey: "other-season" }),
      ],
      evidence: [scopeEvidence("global"), scopeEvidence("friend"), scopeEvidence("season")],
    });

    expect(packet.ready).toBe(false);
    expect(packet.currentUserScopes).toEqual(["global"]);
    expect(packet.missingScopes).toEqual(["friend", "season"]);
    expect(packet.passedScopes).toBe(1);
    expect(packet.summary).toContain("1/3 season claim scopes");
    expect(packet.checks.find((check) => check.key === "friend")).toMatchObject({
      passed: false,
      detail: "loaded · friend code mismatch other-friends != chengdu",
    });
    expect(packet.checks.find((check) => check.key === "season")).toMatchObject({
      passed: false,
      detail: "loaded · season key mismatch other-season != world-cup-run",
    });
  });
});
