import type {
  CloudSyncState,
  GameModeRun,
  LeaderboardScope,
  LeaderboardScopeEvidence,
  MemoryRecord,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";

export type AccountRecoveryStep = {
  key:
    | "runtime"
    | "session"
    | "profile"
    | "records"
    | "modes"
    | "shares"
    | "proof-links"
    | "public-profile"
    | "fingerprints"
    | "leaderboard";
  label: string;
  status: "passed" | "pending" | "blocked";
  detail: string;
  action: string;
};

export type AccountRecoveryEvidencePacket = {
  ready: boolean;
  profileId: string;
  displayName: string;
  expectedArtifacts: number;
  recoveredArtifacts: number;
  anonymousArtifacts: number;
  fingerprintMatches: number;
  leaderboardScopes: LeaderboardScope[];
  recoveryScore: string;
  steps: AccountRecoveryStep[];
  summary: string;
  nextAction: string;
  copyText: string;
};

type AccountRecoveryEvidenceInput = {
  profile: UserProfile;
  cloudState: CloudSyncState;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  shareEvidence: ShareArtifactEvidence[];
  leaderboardScopeEvidence: LeaderboardScopeEvidence[];
  publicProfileUrl: string;
};

const statusFor = (passed: boolean, blocked = false): AccountRecoveryStep["status"] =>
  passed ? "passed" : blocked ? "blocked" : "pending";

const countPublicProfileArtifacts = (cloudState: CloudSyncState) => {
  const verification = cloudState.verification;
  return (
    (verification?.publicProfileRecordIds?.length ?? 0) +
    (verification?.publicProfileModeRunIds?.length ?? 0) +
    (verification?.publicProfileShareArtifactIds?.length ?? 0)
  );
};

const countFingerprintMatches = (cloudState: CloudSyncState) => {
  const verification = cloudState.verification;
  return (
    (verification?.recordContentIds?.length ?? 0) +
    (verification?.modeRunContentIds?.length ?? 0) +
    (verification?.shareArtifactContentIds?.length ?? 0)
  );
};

const leaderboardScopesReady = (evidence: LeaderboardScopeEvidence[]) => {
  const scopes: LeaderboardScope[] = ["global", "friend", "season"];
  return scopes.filter((scope) => {
    const item = evidence.find((entry) => entry.scope === scope);
    return item?.status === "loaded" && item.currentUserPresent && item.rows > 0;
  });
};

export const buildAccountRecoveryEvidencePacket = ({
  profile,
  cloudState,
  records,
  modeRuns,
  shareEvidence,
  leaderboardScopeEvidence,
  publicProfileUrl,
}: AccountRecoveryEvidenceInput): AccountRecoveryEvidencePacket => {
  const verification = cloudState.verification;
  const expectedArtifacts = records.length + modeRuns.length + shareEvidence.length;
  const expectedProofLinks = records.length + modeRuns.length;
  const recoveredArtifacts = (verification?.records ?? 0) + (verification?.modeRuns ?? 0) + (verification?.shareArtifacts ?? 0);
  const anonymousArtifacts = (verification?.publicProofs ?? 0) + countPublicProfileArtifacts(cloudState);
  const fingerprintMatches = countFingerprintMatches(cloudState);
  const scopesReady = leaderboardScopesReady(leaderboardScopeEvidence);
  const missingScopes = (["global", "friend", "season"] as LeaderboardScope[]).filter(
    (scope) => !scopesReady.includes(scope),
  );
  const publicProfileArtifacts = countPublicProfileArtifacts(cloudState);
  const publicImages = verification?.publicShareImages ?? 0;
  const configured = cloudState.configured;
  const authenticated = cloudState.authenticated;

  const steps: AccountRecoveryStep[] = [
    {
      key: "runtime",
      label: "Supabase runtime",
      status: statusFor(configured, true),
      detail: configured ? "browser build can reach Supabase" : "VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing",
      action: "Configure Supabase URL and anon key in the deployed build.",
    },
    {
      key: "session",
      label: "Recoverable login session",
      status: statusFor(authenticated && Boolean(cloudState.refreshable), !configured),
      detail: authenticated
        ? cloudState.refreshable
          ? "access token and refresh path are available"
          : "signed in but refresh token evidence is missing"
        : cloudState.message,
      action: "Sign in with Google or magic link, then confirm the session can refresh.",
    },
    {
      key: "profile",
      label: "Private profile row",
      status: statusFor(Boolean(verification?.profile), !authenticated),
      detail: verification?.profile ? profile.id : "kickoff_profiles has not read back this user",
      action: "Save profile and run cloud sync read-back.",
    },
    {
      key: "records",
      label: "Prediction history restore",
      status: statusFor(records.length > 0 && (verification?.records ?? 0) >= records.length, !authenticated),
      detail: records.length > 0 ? `${verification?.records ?? 0}/${records.length} prediction records` : "no local locked predictions",
      action: "Lock at least one prediction, sync it, then pull cloud history on a clean session.",
    },
    {
      key: "modes",
      label: "Mode history restore",
      status: statusFor(modeRuns.length > 0 && (verification?.modeRuns ?? 0) >= modeRuns.length, !authenticated),
      detail: modeRuns.length > 0 ? `${verification?.modeRuns ?? 0}/${modeRuns.length} mode runs` : "no tournament mode run yet",
      action: "Create a bracket or challenge mode proof, sync it, then verify read-back.",
    },
    {
      key: "shares",
      label: "Share card restore",
      status: statusFor(
        shareEvidence.length > 0 &&
          (verification?.shareArtifacts ?? 0) >= shareEvidence.length &&
          publicImages >= shareEvidence.length,
        !authenticated,
      ),
      detail:
        shareEvidence.length > 0
          ? `${verification?.shareArtifacts ?? 0}/${shareEvidence.length} manifests · ${publicImages}/${shareEvidence.length} public images`
          : "no share card manifest yet",
      action: "Generate share cards, upload public PNG URLs and sync their manifests.",
    },
    {
      key: "proof-links",
      label: "Anonymous proof links",
      status: statusFor(expectedProofLinks > 0 && (verification?.publicProofs ?? 0) >= expectedProofLinks, !configured),
      detail: expectedProofLinks > 0 ? `${verification?.publicProofs ?? 0}/${expectedProofLinks} proof links` : "no proof links to restore",
      action: "Verify public proof and mode URLs without the signed-in local session.",
    },
    {
      key: "public-profile",
      label: "Public profile archive",
      status: statusFor(Boolean(verification?.publicProfile) && publicProfileArtifacts >= expectedArtifacts && expectedArtifacts > 0, !configured),
      detail: verification?.publicProfile
        ? `${publicProfileArtifacts}/${expectedArtifacts} archived artifacts · ${publicProfileUrl}`
        : `profile page not anonymously verified · ${publicProfileUrl}`,
      action: "Open the profile URL anonymously and confirm records, mode proofs and share cards render.",
    },
    {
      key: "fingerprints",
      label: "Content fingerprint match",
      status: statusFor(expectedArtifacts > 0 && fingerprintMatches >= expectedArtifacts, !authenticated),
      detail: `${fingerprintMatches}/${expectedArtifacts} remote payload fingerprints`,
      action: "Sync again or pull cloud history until remote rows match local content fingerprints.",
    },
    {
      key: "leaderboard",
      label: "Rank context restore",
      status: statusFor(scopesReady.length === 3, !configured),
      detail: scopesReady.length === 3
        ? `current user found in ${scopesReady.join(", ")} scopes`
        : `missing current user in ${missingScopes.join(", ") || "leaderboard scopes"}`,
      action: "Load global, friend and season leaderboard rows for the signed-in user.",
    },
  ];

  const ready = steps.every((step) => step.status === "passed");
  const passed = steps.filter((step) => step.status === "passed").length;
  const recoveryScore = `${passed}/${steps.length}`;
  const nextAction = steps.find((step) => step.status !== "passed")?.action ?? "Account recovery rehearsal is complete.";
  const summary = `${profile.displayName} · ${recoveryScore} recovery checks · ${recoveredArtifacts}/${expectedArtifacts} cloud artifacts · ${scopesReady.length}/3 leaderboard scopes`;
  const copyText = [
    "Kickoff Lock Agent cross-device recovery rehearsal",
    `Profile: ${profile.displayName} (${profile.id})`,
    `Public profile: ${publicProfileUrl}`,
    `Recovery checks: ${recoveryScore}`,
    `Cloud artifacts: ${recoveredArtifacts}/${expectedArtifacts}`,
    `Anonymous artifacts: ${anonymousArtifacts}`,
    `Content fingerprints: ${fingerprintMatches}/${expectedArtifacts}`,
    `Leaderboard scopes: ${scopesReady.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "",
    ...steps.map((step) => `${step.label}: ${step.status} · ${step.detail}`),
  ].join("\n");

  return {
    ready,
    profileId: profile.id,
    displayName: profile.displayName,
    expectedArtifacts,
    recoveredArtifacts,
    anonymousArtifacts,
    fingerprintMatches,
    leaderboardScopes: scopesReady,
    recoveryScore,
    steps,
    summary,
    nextAction,
    copyText,
  };
};
