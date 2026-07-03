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

const evidence = (
  scope: LeaderboardScope,
  patch: Partial<LeaderboardScopeEvidence> = {},
): LeaderboardScopeEvidence => ({
  scope,
  status: "loaded",
  rows: 2,
  filter: scope === "global" ? "global xp desc" : `${scope}=eq.test`,
  currentUserPresent: true,
  currentUserRank: 1,
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
    expect(packet.nextAction).toContain("verified");
    expect(packet.copyText).toContain("Current user scopes: global, friend, season");
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
});
