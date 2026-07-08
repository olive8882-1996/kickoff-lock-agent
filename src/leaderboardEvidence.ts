import type { LeaderboardScope, LeaderboardScopeEvidence, UserProfile } from "./types";

export type LeaderboardEvidencePacket = {
  profileId: string;
  complete: boolean;
  passedScopes: number;
  totalScopes: number;
  remoteRows: number;
  currentUserScopes: LeaderboardScope[];
  missingScopes: LeaderboardScope[];
  filters: Record<LeaderboardScope, string>;
  targetQueries: Record<LeaderboardScope, string>;
  sampleIds: string[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const scopes: LeaderboardScope[] = ["global", "friend", "season"];
const hasScopedRank = (rank: unknown) => Number.isInteger(rank) && Number(rank) > 0;
const nonNegativeInteger = (value: unknown) => Number.isInteger(value) && Number(value) >= 0;
const positiveInteger = (value: unknown) => Number.isInteger(value) && Number(value) > 0;

const targetQueryParams = (query = "") => {
  if (!query.startsWith("kickoff_leaderboard?")) return undefined;
  return new URLSearchParams(query.slice(query.indexOf("?") + 1));
};

const targetQueryProblem = (item: LeaderboardScopeEvidence, profileId?: string) => {
  if (!profileId) return "";
  const params = targetQueryParams(item.targetQuery);
  if (!params) return "current-user target query missing or not kickoff_leaderboard";
  if (params.get("id") !== `eq.${profileId}`) return `target query id ${params.get("id") ?? "missing"} != eq.${profileId}`;
  if (params.get("limit") !== "1") return "target query must limit to the current user row";
  if (params.get("order") !== "xp.desc") return "target query must order by xp.desc";
  if (item.scope === "friend" && params.get("friend_code") !== `eq.${item.expectedFriendCode ?? ""}`) {
    return `target query friend_code ${params.get("friend_code") ?? "missing"} != eq.${item.expectedFriendCode ?? "missing"}`;
  }
  if (item.scope === "season" && params.get("season_key") !== `eq.${item.expectedSeasonKey ?? ""}`) {
    return `target query season_key ${params.get("season_key") ?? "missing"} != eq.${item.expectedSeasonKey ?? "missing"}`;
  }
  return "";
};

const scopeBindingProblem = (item: LeaderboardScopeEvidence, profileId?: string) => {
  const queryProblem = targetQueryProblem(item, profileId);
  if (queryProblem) return queryProblem;
  if (item.scope === "friend") {
    if (!item.expectedFriendCode) return "friend scope target missing";
    if (item.currentUserFriendCode !== item.expectedFriendCode) {
      return `friend scope mismatch (${item.currentUserFriendCode ?? "missing"} != ${item.expectedFriendCode})`;
    }
  }
  if (item.scope === "season") {
    if (!item.expectedSeasonKey) return "season scope target missing";
    if (item.currentUserSeasonKey !== item.expectedSeasonKey) {
      return `season scope mismatch (${item.currentUserSeasonKey ?? "missing"} != ${item.expectedSeasonKey})`;
    }
  }
  return "";
};

export const leaderboardScopeStatsProblem = (item?: LeaderboardScopeEvidence, profileId?: string) => {
  if (!item) return "scope not checked";
  if (item.status !== "loaded") return `${item.status} scope`;
  if (item.rows <= 0) return "no remote rows";
  if (!item.currentUserPresent) return "current user missing";
  const bindingProblem = scopeBindingProblem(item, profileId);
  if (bindingProblem) return bindingProblem;
  if (!hasScopedRank(item.currentUserRank)) return "current user scoped rank missing";
  if (!positiveInteger(item.currentUserXp)) return "current user XP missing";
  if (!nonNegativeInteger(item.currentUserLocks)) return "current user locks missing";
  if (!nonNegativeInteger(item.currentUserModeProofs)) return "current user mode proofs missing";
  if (!nonNegativeInteger(item.currentUserRevealed)) return "current user revealed count missing";
  if (!nonNegativeInteger(item.currentUserVerifiedProofs)) return "current user verified proof count missing";
  if (!nonNegativeInteger(item.currentUserExactHits)) return "current user exact hit count missing";
  if ((item.currentUserLocks ?? 0) + (item.currentUserModeProofs ?? 0) <= 0) {
    return "current user has no lock or mode proof activity";
  }
  return "";
};

export const hasLeaderboardScopeEvidence = (item?: LeaderboardScopeEvidence, profileId?: string) =>
  !leaderboardScopeStatsProblem(item, profileId);

export const buildLeaderboardEvidencePacket = (
  profile: Pick<UserProfile, "id" | "displayName">,
  evidence: LeaderboardScopeEvidence[],
): LeaderboardEvidencePacket => {
  const byScope = new Map(evidence.map((item) => [item.scope, item]));
  const currentUserScopes = scopes.filter((scope) => hasLeaderboardScopeEvidence(byScope.get(scope), profile.id));
  const missingScopes = scopes.filter((scope) => !currentUserScopes.includes(scope));
  const remoteRows = scopes.reduce((sum, scope) => sum + (byScope.get(scope)?.rows ?? 0), 0);
  const filters = Object.fromEntries(scopes.map((scope) => [scope, byScope.get(scope)?.filter ?? "not checked"])) as Record<
    LeaderboardScope,
    string
  >;
  const targetQueries = Object.fromEntries(scopes.map((scope) => [scope, byScope.get(scope)?.targetQuery ?? "not checked"])) as Record<
    LeaderboardScope,
    string
  >;
  const sampleIds = scopes.flatMap((scope) => byScope.get(scope)?.sampleIds ?? []).slice(0, 9);
  const complete = missingScopes.length === 0;
  const summary = `${profile.displayName} · ${currentUserScopes.length}/3 leaderboard scopes · ${remoteRows} remote rows`;
  const nextAction = complete
    ? "Leaderboard backend is verified for global, friend and season scopes."
    : `Load current user with scoped rank in ${missingScopes.join(", ")} leaderboard scope${missingScopes.length === 1 ? "" : "s"}.`;
  const currentUserRanks = scopes
    .map((scope) => {
      const rank = byScope.get(scope)?.currentUserRank;
      return hasScopedRank(rank) ? `${scope}=#${rank}` : `${scope}=missing`;
    })
    .join("; ");
  const scopeProblems = scopes
    .map((scope) => {
      const problem = leaderboardScopeStatsProblem(byScope.get(scope), profile.id);
      return problem ? `${scope}=${problem}` : "";
    })
    .filter(Boolean)
    .join("; ");
  const currentUserStats = scopes
    .map((scope) => {
      const item = byScope.get(scope);
      const binding =
        scope === "friend"
          ? `, friend ${item?.currentUserFriendCode ?? "missing"}/${item?.expectedFriendCode ?? "missing"}`
          : scope === "season"
            ? `, season ${item?.currentUserSeasonKey ?? "missing"}/${item?.expectedSeasonKey ?? "missing"}`
            : "";
      return `${scope}=xp ${item?.currentUserXp ?? "missing"}, locks ${item?.currentUserLocks ?? "missing"}, modes ${item?.currentUserModeProofs ?? "missing"}${binding}`;
    })
    .join("; ");
  const copyText = [
    "Kickoff Lock Agent leaderboard evidence",
    `Profile: ${profile.displayName} (${profile.id})`,
    `Scopes passed: ${currentUserScopes.length}/3`,
    `Remote rows: ${remoteRows}`,
    `Current user scopes: ${currentUserScopes.join(", ") || "none"}`,
    `Missing scopes: ${missingScopes.join(", ") || "none"}`,
    `Current user ranks: ${currentUserRanks}`,
    `Current user stats: ${currentUserStats}`,
    `Scope problems: ${scopeProblems || "none"}`,
    `Filters: global=${filters.global}; friend=${filters.friend}; season=${filters.season}`,
    `Target queries: global=${targetQueries.global}; friend=${targetQueries.friend}; season=${targetQueries.season}`,
    `Samples: ${sampleIds.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
  ].join("\n");

  return {
    profileId: profile.id,
    complete,
    passedScopes: currentUserScopes.length,
    totalScopes: scopes.length,
    remoteRows,
    currentUserScopes,
    missingScopes,
    filters,
    targetQueries,
    sampleIds,
    summary,
    nextAction,
    copyText,
  };
};
