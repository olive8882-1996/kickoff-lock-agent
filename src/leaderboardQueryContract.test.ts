import { describe, expect, it } from "vitest";
import { buildLeaderboardQueryContractPacket } from "./leaderboardQueryContract";
import type { LeaderboardScope, LeaderboardScopeEvidence, UserProfile } from "./types";

const profile: UserProfile = {
  id: "user-1",
  email: "fan@example.com",
  displayName: "Kickoff Analyst",
  location: "Chengdu",
  createdAt: "2099-01-01T00:00:00.000Z",
  cloudMode: "supabase",
};

const filterFor = (scope: LeaderboardScope) =>
  scope === "global" ? "global xp desc" : scope === "friend" ? "friend_code=eq.chengdu" : "season_key=eq.world-cup-run";

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

const queryFor = (scope: LeaderboardScope) => {
  const params = new URLSearchParams({
    select: leaderboardSelect,
    order: "xp.desc",
    limit: "1",
    id: `eq.${profile.id}`,
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
  filter: filterFor(scope),
  targetQuery: queryFor(scope),
  currentUserPresent: true,
  currentUserRank: scope === "global" ? 4 : scope === "friend" ? 2 : 1,
  currentUserXp: 1400,
  currentUserLocks: 4,
  currentUserRevealed: 3,
  currentUserVerifiedProofs: 2,
  currentUserModeProofs: 1,
  currentUserExactHits: 1,
  currentUserFriendCode: scope === "season" ? "chengdu" : scope === "friend" ? "chengdu" : undefined,
  currentUserSeasonKey: scope === "friend" ? "world-cup-run" : scope === "season" ? "world-cup-run" : undefined,
  expectedFriendCode: "chengdu",
  expectedSeasonKey: "world-cup-run",
  checkedAt: "2099-01-01T00:00:00.000Z",
  sampleIds: [profile.id, `sample-${scope}`],
  ...patch,
});

describe("leaderboard query contract", () => {
  it("passes only when global, friend and season current-user target queries are complete", () => {
    const packet = buildLeaderboardQueryContractPacket(profile, [
      evidence("global"),
      evidence("friend"),
      evidence("season"),
    ]);

    expect(packet.ready).toBe(true);
    expect(packet.passedScopes).toBe(3);
    expect(packet.scopes.every((scope) => scope.targetQueryReady && scope.statsReady)).toBe(true);
    expect(packet.copyText).toContain("Ready: yes");
    expect(packet.targetQueries.friend).toContain("friend_code=eq.chengdu");
    expect(packet.targetQueries.season).toContain("season_key=eq.world-cup-run");
  });

  it("does not pass when a scope saw rows but did not read back the current user", () => {
    const packet = buildLeaderboardQueryContractPacket(profile, [
      evidence("global"),
      evidence("friend", { currentUserPresent: false, currentUserRank: undefined, targetQuery: "kickoff_leaderboard?limit=20" }),
      evidence("season"),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.passedScopes).toBe(2);
    expect(packet.scopes.find((scope) => scope.scope === "friend")).toMatchObject({
      passed: false,
      currentUserReady: false,
      scopeBindingReady: true,
      targetQueryReady: false,
    });
    expect(packet.nextAction).toContain("friend");
    expect(packet.copyText).toContain("current-user target query");
  });

  it("requires friend and season scoped filters instead of accepting stale global rows", () => {
    const packet = buildLeaderboardQueryContractPacket(profile, [
      evidence("global"),
      evidence("friend", {
        filter: "global xp desc",
        targetQuery: "kickoff_leaderboard?select=*&order=xp.desc&limit=1&id=eq.user-1",
      }),
      evidence("season", {
        filter: "season_key=eq.",
        targetQuery: "kickoff_profiles?select=*&id=eq.user-1",
      }),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.scopes.find((scope) => scope.scope === "friend")).toMatchObject({
      filterReady: false,
      targetQueryReady: false,
    });
    expect(packet.scopes.find((scope) => scope.scope === "season")).toMatchObject({
      filterReady: false,
      targetQueryReady: false,
    });
    expect(packet.nextAction).toContain("friend, season");
  });

  it("rejects current-user target queries that omit required leaderboard rank fields", () => {
    const params = new URLSearchParams({
      select: "id,xp,locks,revealed,verified_proofs,mode_proofs,exact_hits,friend_code,season_key",
      order: "xp.desc",
      limit: "1",
      id: `eq.${profile.id}`,
    });
    const packet = buildLeaderboardQueryContractPacket(profile, [
      evidence("global", { targetQuery: `kickoff_leaderboard?${params.toString()}` }),
      evidence("friend"),
      evidence("season"),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.scopes.find((scope) => scope.scope === "global")).toMatchObject({
      targetQueryReady: false,
    });
    expect(packet.copyText).toContain("current-user target query");
  });

  it("rejects friend and season rows that do not match the scoped target values", () => {
    const packet = buildLeaderboardQueryContractPacket(profile, [
      evidence("global"),
      evidence("friend", { currentUserFriendCode: "wrong-friend" }),
      evidence("season", { currentUserSeasonKey: "old-season" }),
    ]);

    expect(packet.ready).toBe(false);
    expect(packet.scopes.find((scope) => scope.scope === "friend")).toMatchObject({
      scopeBindingReady: false,
    });
    expect(packet.scopes.find((scope) => scope.scope === "season")).toMatchObject({
      scopeBindingReady: false,
    });
    expect(packet.copyText).toContain("scope binding");
  });
});
