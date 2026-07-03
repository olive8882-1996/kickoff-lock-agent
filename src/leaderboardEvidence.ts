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
  sampleIds: string[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const scopes: LeaderboardScope[] = ["global", "friend", "season"];

export const buildLeaderboardEvidencePacket = (
  profile: Pick<UserProfile, "id" | "displayName">,
  evidence: LeaderboardScopeEvidence[],
): LeaderboardEvidencePacket => {
  const byScope = new Map(evidence.map((item) => [item.scope, item]));
  const currentUserScopes = scopes.filter((scope) => {
    const item = byScope.get(scope);
    return item?.status === "loaded" && item.rows > 0 && item.currentUserPresent;
  });
  const missingScopes = scopes.filter((scope) => !currentUserScopes.includes(scope));
  const remoteRows = scopes.reduce((sum, scope) => sum + (byScope.get(scope)?.rows ?? 0), 0);
  const filters = Object.fromEntries(scopes.map((scope) => [scope, byScope.get(scope)?.filter ?? "not checked"])) as Record<
    LeaderboardScope,
    string
  >;
  const sampleIds = scopes.flatMap((scope) => byScope.get(scope)?.sampleIds ?? []).slice(0, 9);
  const complete = missingScopes.length === 0;
  const summary = `${profile.displayName} · ${currentUserScopes.length}/3 leaderboard scopes · ${remoteRows} remote rows`;
  const nextAction = complete
    ? "Leaderboard backend is verified for global, friend and season scopes."
    : `Load current user in ${missingScopes.join(", ")} leaderboard scope${missingScopes.length === 1 ? "" : "s"}.`;
  const copyText = [
    "Kickoff Lock Agent leaderboard evidence",
    `Profile: ${profile.displayName} (${profile.id})`,
    `Scopes passed: ${currentUserScopes.length}/3`,
    `Remote rows: ${remoteRows}`,
    `Current user scopes: ${currentUserScopes.join(", ") || "none"}`,
    `Missing scopes: ${missingScopes.join(", ") || "none"}`,
    `Filters: global=${filters.global}; friend=${filters.friend}; season=${filters.season}`,
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
    sampleIds,
    summary,
    nextAction,
    copyText,
  };
};
