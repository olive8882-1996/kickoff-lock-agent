import { describe, expect, it } from "vitest";
import { buildLeaderboardEvidencePacket } from "./leaderboardEvidence";
import type { LeaderboardScope, LeaderboardScopeEvidence, UserProfile } from "./types";

const profile: UserProfile = {
  id: "user-1",
  email: "fan@example.com",
  displayName: "Kickoff Analyst",
  location: "Chengdu",
  createdAt: "2099-01-01T00:00:00.000Z",
  cloudMode: "supabase",
};

const targetQueryFor = (scope: LeaderboardScope) => {
  const params = new URLSearchParams({
    id: `eq.${profile.id}`,
    order: "xp.desc",
    limit: "1",
  });
  if (scope === "friend") params.set("friend_code", "eq.chengdu");
  if (scope === "season") params.set("season_key", "eq.world-cup-run");
  return `kickoff_leaderboard?${params.toString()}`;
};

const evidence = (
  scope: LeaderboardScope,
  patch: Partial<LeaderboardScopeEvidence> = {},
): LeaderboardScopeEvidence => ({
  scope,
  status: "loaded",
  rows: 2,
  filter: scope === "global" ? "global xp desc" : scope === "friend" ? "friend_code=eq.chengdu" : "season_key=eq.world-cup-run",
  targetQuery: targetQueryFor(scope),
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
  checkedAt: "2099-01-01T00:00:00.000Z",
  sampleIds: ["user-1", `sample-${scope}`],
  ...patch,
});

describe("leaderboard evidence packet", () => {
  it("requires the current user in global, friend and season scopes", () => {
    const packet = buildLeaderboardEvidencePacket(profile, [
      evidence("global"),
      evidence("friend"),
      evidence("season"),
    ]);

    expect(packet.complete).toBe(true);
    expect(packet.passedScopes).toBe(3);
    expect(packet.remoteRows).toBe(6);
    expect(packet.targetQueries.global).toContain("id=eq.user-1");
    expect(packet.nextAction).toContain("verified");
    expect(packet.copyText).toContain("Current user scopes: global, friend, season");
    expect(packet.copyText).toContain("Current user ranks: global=#1; friend=#1; season=#1");
    expect(packet.copyText).toContain("Current user stats: global=xp 1200, locks 4, modes 1");
    expect(packet.copyText).toContain("friend=xp 1200, locks 4, modes 1, friend chengdu/chengdu");
    expect(packet.copyText).toContain("season=xp 1200, locks 4, modes 1, season world-cup-run/world-cup-run");
    expect(packet.copyText).toContain("Target queries:");
  });

  it("surfaces missing scoped queries without trusting remote rows alone", () => {
    const packet = buildLeaderboardEvidencePacket(profile, [
      evidence("global", { currentUserPresent: false, sampleIds: ["other-user"] }),
      evidence("friend", { status: "error", rows: 0, currentUserPresent: false, error: "401" }),
      evidence("season"),
    ]);

    expect(packet.complete).toBe(false);
    expect(packet.currentUserScopes).toEqual(["season"]);
    expect(packet.missingScopes).toEqual(["global", "friend"]);
    expect(packet.nextAction).toContain("global, friend");
    expect(packet.copyText).toContain("Missing scopes: global, friend");
  });

  it("does not trust current-user rows without positive scoped ranks", () => {
    const packet = buildLeaderboardEvidencePacket(profile, [
      evidence("global", { currentUserRank: undefined }),
      evidence("friend", { currentUserRank: 0 }),
      evidence("season", { currentUserRank: 2 }),
    ]);

    expect(packet.complete).toBe(false);
    expect(packet.currentUserScopes).toEqual(["season"]);
    expect(packet.missingScopes).toEqual(["global", "friend"]);
    expect(packet.nextAction).toContain("scoped rank");
    expect(packet.copyText).toContain("Current user ranks: global=missing; friend=missing; season=#2");
  });

  it("does not trust current-user rows without leaderboard activity stats", () => {
    const packet = buildLeaderboardEvidencePacket(profile, [
      evidence("global", { currentUserXp: undefined }),
      evidence("friend", { currentUserLocks: 0, currentUserModeProofs: 0 }),
      evidence("season", { currentUserXp: 1500, currentUserLocks: 2, currentUserModeProofs: 4 }),
    ]);

    expect(packet.complete).toBe(false);
    expect(packet.currentUserScopes).toEqual(["season"]);
    expect(packet.missingScopes).toEqual(["global", "friend"]);
    expect(packet.copyText).toContain("global=current user XP missing");
    expect(packet.copyText).toContain("friend=current user has no lock or mode proof activity");
  });

  it("does not pass friend or season scopes when the current-user row belongs to another scope", () => {
    const packet = buildLeaderboardEvidencePacket(profile, [
      evidence("global"),
      evidence("friend", { currentUserFriendCode: "wrong-friend" }),
      evidence("season", { currentUserSeasonKey: "old-season" }),
    ]);

    expect(packet.complete).toBe(false);
    expect(packet.currentUserScopes).toEqual(["global"]);
    expect(packet.missingScopes).toEqual(["friend", "season"]);
    expect(packet.copyText).toContain("friend=friend scope mismatch");
    expect(packet.copyText).toContain("season=season scope mismatch");
  });

  it("does not pass when current-user evidence was produced by a generic or mismatched target query", () => {
    const packet = buildLeaderboardEvidencePacket(profile, [
      evidence("global", { targetQuery: "kickoff_leaderboard?order=xp.desc&limit=20" }),
      evidence("friend", { targetQuery: "kickoff_leaderboard?id=eq.user-2&order=xp.desc&limit=1&friend_code=eq.chengdu" }),
      evidence("season", { targetQuery: "kickoff_leaderboard?id=eq.user-1&order=xp.desc&limit=1" }),
    ]);

    expect(packet.complete).toBe(false);
    expect(packet.currentUserScopes).toEqual([]);
    expect(packet.missingScopes).toEqual(["global", "friend", "season"]);
    expect(packet.copyText).toContain("global=target query id missing != eq.user-1");
    expect(packet.copyText).toContain("friend=target query id eq.user-2 != eq.user-1");
    expect(packet.copyText).toContain("season=target query season_key missing != eq.world-cup-run");
  });
});
