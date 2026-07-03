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

const filterValue = (filter: string, key: "friend_code" | "season_key") => {
  const marker = `${key}=eq.`;
  return filter.includes(marker) ? filter.slice(filter.indexOf(marker) + marker.length) : "";
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
    return scopeEvidence?.status === "loaded" && scopeEvidence.rows > 0 && scopeEvidence.currentUserPresent && currentUserByScope.has(scope);
  });
  const missingScopes = scopes.filter((scope) => !currentUserScopes.includes(scope));
  const seasonRow = currentUserByScope.get("season");
  const friendRow = currentUserByScope.get("friend");
  const bestRank = Math.min(
    ...currentUserRows
      .map((entry) => entry.rank)
      .filter((rank): rank is number => typeof rank === "number" && Number.isFinite(rank)),
    ...evidence
      .map((item) => item.currentUserRank)
      .filter((rank): rank is number => typeof rank === "number" && Number.isFinite(rank)),
  );
  const bestRankValue = Number.isFinite(bestRank) ? bestRank : undefined;
  const scoringRow = seasonRow ?? currentUserRows.sort((a, b) => b.xp - a.xp)[0];
  const friendFilter = byEvidenceScope.get("friend")?.filter ?? "";
  const seasonFilter = byEvidenceScope.get("season")?.filter ?? "";
  const friendCode = friendRow?.friendCode ?? filterValue(friendFilter, "friend_code") ?? "not checked";
  const seasonKey = seasonRow?.seasonKey ?? filterValue(seasonFilter, "season_key") ?? "not checked";

  const scopeChecks: SeasonEvidenceCheck[] = scopes.map((scope) => {
    const scopeEvidence = byEvidenceScope.get(scope);
    const row = currentUserByScope.get(scope);
    const passed = currentUserScopes.includes(scope);
    return {
      key: scope,
      label: scopeLabel[scope],
      passed,
      detail: passed
        ? `current user rank ${row?.rank ?? scopeEvidence?.currentUserRank ?? "listed"} · ${row?.xp ?? 0} XP`
        : `${scopeEvidence?.status ?? "unchecked"} · ${scopeEvidence?.rows ?? 0} rows · current user ${scopeEvidence?.currentUserPresent ? "not in packet rows" : "missing"}`,
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
  const ready = missingScopes.length === 0 && remoteEntries.length > 0 && localFallbackRows === 0;
  const nextAction = ready
    ? "Season leaderboard claim is backed by Supabase global, friend and season read-back."
    : `Read back current user from ${missingScopes.join(", ") || "all remote"} scope${missingScopes.length === 1 ? "" : "s"} and remove local fallback rows.`;
  const summary = `${profile.displayName} · ${currentUserScopes.length}/3 season claim scopes · ${remoteEntries.length} remote rows`;
  const copyText = [
    "Kickoff Lock Agent season leaderboard claim",
    `Profile: ${profile.displayName} (${profile.id})`,
    `Ready: ${ready ? "yes" : "no"}`,
    `Scopes passed: ${currentUserScopes.join(", ") || "none"} (${currentUserScopes.length}/3)`,
    `Missing scopes: ${missingScopes.join(", ") || "none"}`,
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
    passedScopes: currentUserScopes.length,
    totalScopes: scopes.length,
    remoteRows: remoteEntries.length,
    localFallbackRows,
    currentUserScopes,
    missingScopes,
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
