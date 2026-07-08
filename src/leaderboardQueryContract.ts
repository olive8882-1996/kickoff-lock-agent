import type { LeaderboardScope, LeaderboardScopeEvidence, UserProfile } from "./types";

const scopes: LeaderboardScope[] = ["global", "friend", "season"];

export type LeaderboardQueryContractScope = {
  scope: LeaderboardScope;
  passed: boolean;
  filterReady: boolean;
  targetQueryReady: boolean;
  currentUserReady: boolean;
  scopeBindingReady: boolean;
  scopedRankReady: boolean;
  statsReady: boolean;
  detail: string;
  action: string;
};

export type LeaderboardQueryContractPacket = {
  profileId: string;
  ready: boolean;
  passedScopes: number;
  totalScopes: number;
  targetQueries: Record<LeaderboardScope, string>;
  filters: Record<LeaderboardScope, string>;
  scopes: LeaderboardQueryContractScope[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const positiveInteger = (value: unknown) => Number.isInteger(value) && Number(value) > 0;
const nonNegativeInteger = (value: unknown) => Number.isInteger(value) && Number(value) >= 0;

const queryParams = (query = "") => {
  const search = query.includes("?") ? query.slice(query.indexOf("?") + 1) : "";
  return new URLSearchParams(search);
};

const requiredSelectFields = [
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
];

const selectReady = (select = "") => {
  if (select === "*") return true;
  const fields = new Set(
    select
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean),
  );
  return requiredSelectFields.every((field) => fields.has(field));
};

const filterReadyFor = (scope: LeaderboardScope, filter = "") => {
  if (scope === "global") return filter === "global xp desc";
  if (scope === "friend") return /^friend_code=eq\.[a-z0-9-]+$/.test(filter);
  return /^season_key=eq\.[a-z0-9-]+$/.test(filter);
};

const targetQueryReadyFor = (scope: LeaderboardScope, profileId: string, query = "") => {
  if (!query.startsWith("kickoff_leaderboard?")) return false;
  const params = queryParams(query);
  const id = params.get("id");
  const limit = params.get("limit");
  const order = params.get("order");
  const select = params.get("select");
  const scopeFilter =
    scope === "friend"
      ? Boolean(params.get("friend_code")?.startsWith("eq."))
      : scope === "season"
        ? Boolean(params.get("season_key")?.startsWith("eq."))
        : true;
  return id === `eq.${profileId}` && limit === "1" && order === "xp.desc" && selectReady(select ?? "") && scopeFilter;
};

const statsReadyFor = (item?: LeaderboardScopeEvidence) =>
  Boolean(
    item &&
      positiveInteger(item.currentUserXp) &&
      nonNegativeInteger(item.currentUserLocks) &&
      nonNegativeInteger(item.currentUserRevealed) &&
      nonNegativeInteger(item.currentUserVerifiedProofs) &&
      nonNegativeInteger(item.currentUserModeProofs) &&
      nonNegativeInteger(item.currentUserExactHits) &&
      ((item.currentUserLocks ?? 0) > 0 || (item.currentUserModeProofs ?? 0) > 0),
  );

const scopeBindingReadyFor = (scope: LeaderboardScope, item?: LeaderboardScopeEvidence) => {
  if (!item) return false;
  if (scope === "friend") {
    return Boolean(item.expectedFriendCode && item.currentUserFriendCode === item.expectedFriendCode);
  }
  if (scope === "season") {
    return Boolean(item.expectedSeasonKey && item.currentUserSeasonKey === item.expectedSeasonKey);
  }
  return true;
};

const actionFor = (scope: LeaderboardScope) => {
  if (scope === "friend") return "Read back the signed-in user with friend_code filter and positive friend rank.";
  if (scope === "season") return "Read back the signed-in user with season_key filter and positive season rank.";
  return "Read back the signed-in user from the global leaderboard with positive global rank.";
};

export const buildLeaderboardQueryContractPacket = (
  profile: Pick<UserProfile, "id" | "displayName">,
  evidence: LeaderboardScopeEvidence[],
): LeaderboardQueryContractPacket => {
  const byScope = new Map(evidence.map((item) => [item.scope, item]));
  const rows = scopes.map<LeaderboardQueryContractScope>((scope) => {
    const item = byScope.get(scope);
    const filterReady = filterReadyFor(scope, item?.filter);
    const targetQueryReady = targetQueryReadyFor(scope, profile.id, item?.targetQuery);
    const currentUserReady = item?.status === "loaded" && item.rows > 0 && item.currentUserPresent;
    const scopedRankReady = positiveInteger(item?.currentUserRank);
    const statsReady = statsReadyFor(item);
    const scopeBindingReady = scopeBindingReadyFor(scope, item);
    const passed = filterReady && targetQueryReady && currentUserReady && scopeBindingReady && scopedRankReady && statsReady;
    const missing = [
      filterReady ? "" : "scope filter",
      targetQueryReady ? "" : "current-user target query",
      currentUserReady ? "" : "current-user row",
      scopeBindingReady ? "" : "scope binding",
      scopedRankReady ? "" : "positive scoped rank",
      statsReady ? "" : "activity stats",
    ].filter(Boolean);
    return {
      scope,
      passed,
      filterReady,
      targetQueryReady,
      currentUserReady,
      scopeBindingReady,
      scopedRankReady,
      statsReady,
      detail: passed
        ? `${item?.rows ?? 0} rows · current user rank ${item?.currentUserRank} · ${item?.filter}`
        : `missing ${missing.join(", ")} · ${item?.status ?? "unchecked"} · ${item?.filter ?? "filter missing"}`,
      action: passed ? "Leaderboard query contract is ready for this scope." : actionFor(scope),
    };
  });
  const passedScopes = rows.filter((row) => row.passed).length;
  const ready = passedScopes === scopes.length;
  const targetQueries = Object.fromEntries(scopes.map((scope) => [scope, byScope.get(scope)?.targetQuery ?? "not checked"])) as Record<
    LeaderboardScope,
    string
  >;
  const filters = Object.fromEntries(scopes.map((scope) => [scope, byScope.get(scope)?.filter ?? "not checked"])) as Record<
    LeaderboardScope,
    string
  >;
  const missingScopes = rows.filter((row) => !row.passed).map((row) => row.scope);
  const summary = `${profile.displayName} · ${passedScopes}/3 leaderboard query contracts`;
  const nextAction = ready
    ? "Global, friend and season leaderboard queries have current-user read-back contracts."
    : `Fix leaderboard current-user read-back for ${missingScopes.join(", ")}.`;
  const copyText = [
    "Kickoff Lock Agent leaderboard query contract",
    `Profile: ${profile.displayName} (${profile.id})`,
    `Ready: ${ready ? "yes" : "no"}`,
    `Scopes passed: ${passedScopes}/3`,
    ...rows.map((row) => `${row.scope}: ${row.passed ? "passed" : row.detail}`),
    `Target queries: global=${targetQueries.global}; friend=${targetQueries.friend}; season=${targetQueries.season}`,
    `Filters: global=${filters.global}; friend=${filters.friend}; season=${filters.season}`,
    `Next action: ${nextAction}`,
  ].join("\n");

  return {
    profileId: profile.id,
    ready,
    passedScopes,
    totalScopes: scopes.length,
    targetQueries,
    filters,
    scopes: rows,
    summary,
    nextAction,
    copyText,
  };
};
