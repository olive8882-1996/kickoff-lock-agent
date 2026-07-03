import type { CloudSyncState, GameModeRun, MemoryRecord, ShareArtifactEvidence, UserProfile } from "./types";

export type AccountHandoffChecklistItem = {
  key: string;
  label: string;
  status: "ready" | "pending" | "blocked";
  detail: string;
};

export type AccountHandoffPacket = {
  profileId: string;
  displayName: string;
  cloudMode: UserProfile["cloudMode"];
  authenticated: boolean;
  crossDeviceReady: boolean;
  localArtifacts: number;
  cloudReadBackArtifacts: number;
  pendingSyncItems: number;
  publicProfileUrl: string;
  envFilled: number;
  envTotal: number;
  missingRuntimeEnv: string[];
  checklist: AccountHandoffChecklistItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

type AccountHandoffInput = {
  profile: UserProfile;
  cloudState: CloudSyncState;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  shareEvidence: ShareArtifactEvidence[];
  productionVerifyEnv: string;
  publicProfileUrl: string;
  missingRuntimeEnv?: string[];
};

const parseEnvRows = (envText: string) =>
  envText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("="))
    .map((line) => {
      const [key, ...rest] = line.split("=");
      return { key, value: rest.join("=").trim() };
    });

const statusFor = (ready: boolean, blocked: boolean) => (ready ? "ready" : blocked ? "blocked" : "pending");

export const buildAccountHandoffPacket = ({
  profile,
  cloudState,
  records,
  modeRuns,
  shareEvidence,
  productionVerifyEnv,
  publicProfileUrl,
  missingRuntimeEnv = [],
}: AccountHandoffInput): AccountHandoffPacket => {
  const verification = cloudState.verification;
  const envRows = parseEnvRows(productionVerifyEnv);
  const envFilled = envRows.filter((row) => row.value.length > 0).length;
  const localArtifacts = records.length + modeRuns.length + shareEvidence.length;
  const cloudReadBackArtifacts =
    (verification?.records ?? 0) +
    (verification?.modeRuns ?? 0) +
    (verification?.shareArtifacts ?? 0);
  const expectedPublicProfileArtifacts = records.length + modeRuns.length + shareEvidence.length;
  const publicProfileArtifacts =
    (verification?.publicProfileRecordIds?.length ?? 0) +
    (verification?.publicProfileModeRunIds?.length ?? 0) +
    (verification?.publicProfileShareArtifactIds?.length ?? 0);
  const contentFingerprints =
    (verification?.recordContentIds?.length ?? 0) +
    (verification?.modeRunContentIds?.length ?? 0) +
    (verification?.shareArtifactContentIds?.length ?? 0);
  const pendingSyncItems = Math.max(0, localArtifacts - cloudReadBackArtifacts);
  const hasLocalArtifacts = localArtifacts > 0;
  const cloudConfigured = cloudState.configured;
  const authenticated = cloudState.authenticated;
  const profileReady = Boolean(verification?.profile);
  const contentReady = !hasLocalArtifacts || contentFingerprints >= localArtifacts;
  const archiveReady =
    Boolean(verification?.publicProfile) &&
    (!hasLocalArtifacts || publicProfileArtifacts >= expectedPublicProfileArtifacts);
  const envReady = missingRuntimeEnv.length === 0 && envFilled === envRows.length;
  const crossDeviceReady =
    cloudConfigured &&
    authenticated &&
    profileReady &&
    pendingSyncItems === 0 &&
    contentReady &&
    archiveReady;

  const checklist: AccountHandoffChecklistItem[] = [
    {
      key: "runtime",
      label: "Supabase runtime",
      status: statusFor(cloudConfigured, missingRuntimeEnv.includes("VITE_SUPABASE_URL") || missingRuntimeEnv.includes("VITE_SUPABASE_ANON_KEY")),
      detail: cloudConfigured ? "browser build has Supabase env" : "missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY",
    },
    {
      key: "session",
      label: "Signed-in session",
      status: statusFor(authenticated, !cloudConfigured),
      detail: authenticated ? "session active" : cloudState.message,
    },
    {
      key: "profile",
      label: "Private profile row",
      status: statusFor(profileReady, !authenticated),
      detail: profileReady ? profile.id : "kickoff_profiles has not read back this user",
    },
    {
      key: "history",
      label: "Prediction and mode history",
      status: statusFor(pendingSyncItems === 0 && hasLocalArtifacts, !authenticated),
      detail: hasLocalArtifacts
        ? `${cloudReadBackArtifacts}/${localArtifacts} artifacts read back`
        : "create records, mode proofs or share cards before handoff",
    },
    {
      key: "fingerprints",
      label: "Content fingerprints",
      status: statusFor(contentReady && hasLocalArtifacts, !authenticated),
      detail: hasLocalArtifacts ? `${contentFingerprints}/${localArtifacts} fingerprints matched` : "nothing to fingerprint yet",
    },
    {
      key: "public-profile",
      label: "Public profile archive",
      status: statusFor(archiveReady, !authenticated),
      detail: archiveReady
        ? publicProfileUrl
        : `${publicProfileArtifacts}/${expectedPublicProfileArtifacts} public archive artifacts`,
    },
    {
      key: "target-env",
      label: "Production verify env",
      status: statusFor(envReady, false),
      detail: missingRuntimeEnv.length > 0
        ? `missing ${missingRuntimeEnv.join(", ")}`
        : `${envFilled}/${envRows.length} verification variables filled`,
    },
  ];

  const firstOpen = checklist.find((item) => item.status !== "ready");
  const nextAction = firstOpen
    ? `${firstOpen.label}: ${firstOpen.detail}`
    : "Account handoff is ready for cross-device verification.";
  const summary = `${profile.displayName} · ${cloudState.mode} · ${cloudReadBackArtifacts}/${localArtifacts} cloud read-back · ${pendingSyncItems} pending`;
  const copyText = [
    "Kickoff Lock Agent account handoff",
    `Profile: ${profile.displayName} (${profile.id})`,
    `Public profile: ${publicProfileUrl}`,
    `Cloud read-back: ${cloudReadBackArtifacts}/${localArtifacts}`,
    `Pending sync: ${pendingSyncItems}`,
    `Next action: ${nextAction}`,
    "",
    "Production verify env:",
    productionVerifyEnv,
  ].join("\n");

  return {
    profileId: profile.id,
    displayName: profile.displayName,
    cloudMode: profile.cloudMode,
    authenticated,
    crossDeviceReady,
    localArtifacts,
    cloudReadBackArtifacts,
    pendingSyncItems,
    publicProfileUrl,
    envFilled,
    envTotal: envRows.length,
    missingRuntimeEnv,
    checklist,
    summary,
    nextAction,
    copyText,
  };
};
