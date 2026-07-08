import type { LeaderboardEntry, LeaderboardScope, LeaderboardScopeEvidence, UserProfile } from "./types";

type SeasonEvidenceCheck = {
  key: "global" | "friend" | "season" | "remoteRows" | "fallback";
  label: string;
  passed: boolean;
  detail: string;
};

export type LeaderboardSeasonEvidencePacket = {
  profileId: string;
  displayName: string;
  ready: boolean;
  passedScopes: number;
  totalScopes: number;
  remoteRows: number;
  localFallbackRows: number;
  currentUserScopes: LeaderboardScope[];
  missingScopes: LeaderboardScope[];
  bestRank?: number;
  seasonXp: number;
  verifiedProofs: number;
  modeProofs: number;
  exactHits: number;
  friendCode: string;
  seasonKey: string;
  checks: SeasonEvidenceCheck[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const scopes: LeaderboardScope[] = ["global", "friend", "season"];
const hasScopedRank = (rank: unknown) => Number.isInteger(rank) && Number(rank) > 0;

const filterValue = (filter: string, key: "friend_code" | "season_key") => {
  const marker = `${key}=eq.`;
  const raw = filter.includes(marker) ? filter.slice(filter.indexOf(marker) + marker.length) : "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const scopeLabel: Record<LeaderboardScope, string> = {
  global: "Global scope",
  friend: "Friend scope",
  season: "Season scope",
};

export const buildLeaderboardSeasonEvidencePacket = ({
  profile,
  entries,
  evidence,
}: {
  profile: Pick<UserProfile, "id" | "displayName">;
  entries: LeaderboardEntry[];
  evidence: LeaderboardScopeEvidence[];
}): LeaderboardSeasonEvidencePacket => {
  const remoteEntries = entries.filter((entry) => entry.source !== "local");
  const localFallbackRows = entries.length - remoteEntries.length;
  const byEvidenceScope = new Map(evidence.map((item) => [item.scope, item]));
  const currentUserRows = remoteEntries.filter((entry) => entry.id === profile.id);
  const currentUserByScope = new Map(
    scopes.flatMap((scope) => {
      const row = currentUserRows.find((entry) => entry.source === scope);
      return row ? ([[scope, row]] as const) : [];
    }),
  );
  const currentUserScopes = scopes.filter((scope) => {
    const scopeEvidence = byEvidenceScope.get(scope);
    const row = currentUserByScope.get(scope);
    return (
      scopeEvidence?.status === "loaded" &&
      scopeEvidence.rows > 0 &&
      scopeEvidence.currentUserPresent &&
      Boolean(row) &&
      hasScopedRank(scopeEvidence.currentUserRank) &&
      hasScopedRank(row?.rank)
    );
  });
  const missingScopes = scopes.filter((scope) => !currentUserScopes.includes(scope));
  const seasonRow = currentUserByScope.get("season");
  const friendRow = currentUserByScope.get("friend");
  const bestRank = Math.min(
    ...currentUserRows
      .map((entry) => entry.rank)
      .filter((rank): rank is number => hasScopedRank(rank)),
    ...evidence
      .map((item) => item.currentUserRank)
      .filter((rank): rank is number => hasScopedRank(rank)),
  );
  const bestRankValue = Number.isFinite(bestRank) ? bestRank : undefined;
  const scoringRow = seasonRow ?? currentUserRows.sort((a, b) => b.xp - a.xp)[0];
  const friendFilter = byEvidenceScope.get("friend")?.filter ?? "";
  const seasonFilter = byEvidenceScope.get("season")?.filter ?? "";
  const friendCode = friendRow?.friendCode ?? filterValue(friendFilter, "friend_code") ?? "not checked";
  const seasonKey = seasonRow?.seasonKey ?? filterValue(seasonFilter, "season_key") ?? "not checked";
  const expectedFriendCode = filterValue(friendFilter, "friend_code");
  const expectedSeasonKey = filterValue(seasonFilter, "season_key");

  const scopeValueReady = (scope: LeaderboardScope, row: LeaderboardEntry | undefined) => {
    if (!row) return false;
    if (scope === "friend") return Boolean(expectedFriendCode && row.friendCode === expectedFriendCode);
    if (scope === "season") return Boolean(expectedSeasonKey && row.seasonKey === expectedSeasonKey);
    return true;
  };

  const scopeChecks: SeasonEvidenceCheck[] = scopes.map((scope) => {
    const scopeEvidence = byEvidenceScope.get(scope);
    const row = currentUserByScope.get(scope);
    const passed = currentUserScopes.includes(scope) && scopeValueReady(scope, row);
    const scopeMismatch =
      row && scope === "friend" && !scopeValueReady(scope, row)
        ? `friend code mismatch ${row.friendCode || "missing"} != ${expectedFriendCode || "expected filter missing"}`
        : row && scope === "season" && !scopeValueReady(scope, row)
          ? `season key mismatch ${row.seasonKey || "missing"} != ${expectedSeasonKey || "expected filter missing"}`
          : "";
    return {
      key: scope,
      label: scopeLabel[scope],
      passed,
      detail: passed
        ? `current user rank ${row?.rank ?? scopeEvidence?.currentUserRank ?? "listed"} · ${row?.xp ?? 0} XP`
        : scopeMismatch
          ? `${scopeEvidence?.status ?? "unchecked"} · ${scopeMismatch}`
        : `${scopeEvidence?.status ?? "unchecked"} · ${scopeEvidence?.rows ?? 0} rows · current user ${
            scopeEvidence?.currentUserPresent
              ? !row
                ? "not in packet rows"
                : hasScopedRank(scopeEvidence.currentUserRank)
                  ? "missing scoped rank in packet rows"
                  : "missing scoped rank"
              : "missing"
          }`,
    };
  });
  const checks: SeasonEvidenceCheck[] = [
    ...scopeChecks,
    {
      key: "remoteRows",
      label: "Remote leaderboard rows",
      passed: remoteEntries.length > 0,
      detail: `${remoteEntries.length} Supabase row${remoteEntries.length === 1 ? "" : "s"} in packet`,
    },
    {
      key: "fallback",
      label: "Local fallback rows",
      passed: localFallbackRows === 0,
      detail: localFallbackRows === 0 ? "no local fallback rows used" : `${localFallbackRows} local fallback row${localFallbackRows === 1 ? "" : "s"} present`,
    },
  ];
  const valueMissingScopes = scopes.filter((scope) => {
    const row = currentUserByScope.get(scope);
    return currentUserScopes.includes(scope) && !scopeValueReady(scope, row);
  });
  const finalMissingScopes = [...new Set([...missingScopes, ...valueMissingScopes])];
  const finalPassedScopes = scopes.filter((scope) => currentUserScopes.includes(scope) && !valueMissingScopes.includes(scope));
  const ready = finalMissingScopes.length === 0 && remoteEntries.length > 0 && localFallbackRows === 0;
  const nextAction = ready
    ? "Season leaderboard claim is backed by Supabase global, friend and season read-back."
    : `Read back current user with scoped rank from ${finalMissingScopes.join(", ") || "all remote"} scope${finalMissingScopes.length === 1 ? "" : "s"} and remove local fallback rows.`;
  const summary = `${profile.displayName} · ${finalPassedScopes.length}/3 season claim scopes · ${remoteEntries.length} remote rows`;
  const copyText = [
    "Kickoff Lock Agent season leaderboard claim",
    `Profile: ${profile.displayName} (${profile.id})`,
    `Ready: ${ready ? "yes" : "no"}`,
    `Scopes passed: ${finalPassedScopes.join(", ") || "none"} (${finalPassedScopes.length}/3)`,
    `Missing scopes: ${finalMissingScopes.join(", ") || "none"}`,
    `Best rank: ${bestRankValue ? `#${bestRankValue}` : "not available"}`,
    `Season XP: ${scoringRow?.xp ?? 0}`,
    `Verified proofs: ${scoringRow?.verifiedProofs ?? 0}`,
    `Mode proofs: ${scoringRow?.modeProofs ?? 0}`,
    `Exact hits: ${scoringRow?.exactHits ?? 0}`,
    `Friend code: ${friendCode || "not checked"}`,
    `Season key: ${seasonKey || "not checked"}`,
    `Remote rows: ${remoteEntries.length}`,
    `Local fallback rows: ${localFallbackRows}`,
    `Next action: ${nextAction}`,
  ].join("\n");

  return {
    profileId: profile.id,
    displayName: profile.displayName,
    ready,
    passedScopes: finalPassedScopes.length,
    totalScopes: scopes.length,
    remoteRows: remoteEntries.length,
    localFallbackRows,
    currentUserScopes: finalPassedScopes,
    missingScopes: finalMissingScopes,
    bestRank: bestRankValue,
    seasonXp: scoringRow?.xp ?? 0,
    verifiedProofs: scoringRow?.verifiedProofs ?? 0,
    modeProofs: scoringRow?.modeProofs ?? 0,
    exactHits: scoringRow?.exactHits ?? 0,
    friendCode: friendCode || "not checked",
    seasonKey: seasonKey || "not checked",
    checks,
    summary,
    nextAction,
    copyText,
  };
};
