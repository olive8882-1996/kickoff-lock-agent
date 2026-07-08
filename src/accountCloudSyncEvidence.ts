import {
  buildCloudSyncAudit,
  buildCloudSyncCoverage,
  buildCloudSyncOutbox,
  shareArtifactCloudId,
} from "./cloud";
import { buildLeaderboardQueryContractPacket } from "./leaderboardQueryContract";
import { stableJson } from "./proof";
import type {
  CloudSyncAuditItem,
  CloudSyncOutboxItem,
  CloudSyncState,
  GameModeRun,
  LeaderboardEntry,
  LeaderboardScope,
  LeaderboardScopeEvidence,
  MemoryRecord,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";

export type AccountCloudSyncEvidenceInput = {
  profile: UserProfile;
  cloudState: CloudSyncState;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  shareArtifacts?: ShareArtifactEvidence[];
  leaderboardEntries?: LeaderboardEntry[];
  leaderboardScopeEvidence?: LeaderboardScopeEvidence[];
};

export type AccountCloudSyncEvidencePacket = {
  ready: boolean;
  profileId: string;
  cloudMode: UserProfile["cloudMode"];
  configured: boolean;
  authenticated: boolean;
  localTotals: {
    profile: 1;
    records: number;
    modeRuns: number;
    shareArtifacts: number;
    publicProofs: number;
    historyArtifacts: number;
  };
  verifiedTotals: {
    records: number;
    modeRuns: number;
    shareArtifacts: number;
    publicProofs: number;
    publicShareImages: number;
    publicProfileArchives: number;
    contentFingerprints: number;
  };
  expectedIds: {
    records: string[];
    modeRuns: string[];
    shareArtifacts: string[];
    publicProofs: string[];
    leaderboardScopes: LeaderboardScope[];
  };
  acceptance: {
    backendReady: boolean;
    profileIdentityReady: boolean;
    historyReady: boolean;
    publicProofsReady: boolean;
    shareArtifactsReady: boolean;
    publicProfileReady: boolean;
    outboxEmpty: boolean;
    auditPassed: boolean;
    leaderboardScopesReady: boolean;
    cloudReadBackReady: boolean;
  };
  outbox: CloudSyncOutboxItem[];
  audit: CloudSyncAuditItem[];
  coverage: ReturnType<typeof buildCloudSyncCoverage>;
  leaderboardQueryContract: ReturnType<typeof buildLeaderboardQueryContractPacket>;
  missing: string[];
  evidenceFingerprint: string;
  nextAction: string;
  copyText: string;
};

export type AccountCloudSyncEvidenceArtifact = AccountCloudSyncEvidencePacket & {
  artifactVersion: 1;
  generatedAt: string;
  source: "browser-runtime" | "local-script" | "test";
};

const REQUIRED_LEADERBOARD_SCOPES: LeaderboardScope[] = ["global", "friend", "season"];

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const countPresent = (actual: string[] | undefined, expected: string[]) =>
  expected.filter((id) => actual?.includes(id)).length;

const publicProofIdsFor = (records: MemoryRecord[], modeRuns: GameModeRun[]) => [
  ...records.map((record) => `record:${record.capsule.id}`),
  ...modeRuns.map((run) => `mode:${run.id}`),
];

const publicProfileArchiveCount = (verification: CloudSyncState["verification"]) =>
  (verification?.publicProfileRecordContentIds?.length ?? verification?.publicProfileRecordIds?.length ?? 0) +
  (verification?.publicProfileModeRunContentIds?.length ?? verification?.publicProfileModeRunIds?.length ?? 0) +
  (verification?.publicProfileShareArtifactContentIds?.length ?? verification?.publicProfileShareArtifactIds?.length ?? 0);

const firstAction = (audit: CloudSyncAuditItem[], outbox: CloudSyncOutboxItem[]) =>
  audit.find((item) => item.status !== "passed")?.action ??
  outbox.find((item) => item.status !== "verified")?.action ??
  "Cloud account evidence is ready.";

const shortList = (items: string[]) => {
  if (items.length <= 3) return items.join(", ");
  return `${items.slice(0, 3).join(", ")} +${items.length - 3} more`;
};

export const buildAccountCloudSyncEvidence = ({
  profile,
  cloudState,
  records,
  modeRuns,
  shareArtifacts = [],
  leaderboardEntries = [],
  leaderboardScopeEvidence = [],
}: AccountCloudSyncEvidenceInput): AccountCloudSyncEvidencePacket => {
  const outbox = buildCloudSyncOutbox(cloudState, profile, records, modeRuns, shareArtifacts);
  const audit = buildCloudSyncAudit(cloudState, profile, records, modeRuns, leaderboardEntries, shareArtifacts);
  const coverage = buildCloudSyncCoverage(cloudState, records, modeRuns, shareArtifacts);
  const leaderboardQueryContract = buildLeaderboardQueryContractPacket(profile, leaderboardScopeEvidence);
  const verification = cloudState.verification;
  const recordIds = records.map((record) => record.capsule.id);
  const modeRunIds = modeRuns.map((run) => run.id);
  const shareArtifactIds = shareArtifacts.map(shareArtifactCloudId);
  const publicProofIds = publicProofIdsFor(records, modeRuns);
  const remoteLeaderboardScopes = new Set(
    leaderboardEntries.filter((entry) => entry.source !== "local").map((entry) => entry.source as LeaderboardScope),
  );
  const leaderboardScopes = REQUIRED_LEADERBOARD_SCOPES.filter((scope) => remoteLeaderboardScopes.has(scope));
  const leaderboardContractScopes = REQUIRED_LEADERBOARD_SCOPES.filter((scope) =>
    leaderboardQueryContract.scopes.some((row) => row.scope === scope && row.passed),
  );
  const historyArtifacts = records.length + modeRuns.length + shareArtifacts.length;
  const contentFingerprints =
    countPresent(verification?.recordContentIds, recordIds) +
    countPresent(verification?.modeRunContentIds, modeRunIds) +
    countPresent(verification?.shareArtifactContentIds, shareArtifactIds);
  const publicProofFingerprints = countPresent(verification?.publicProofContentIds, publicProofIds);
  const shareImages = countPresent(verification?.publicShareImageIds, shareArtifactIds);
  const publicProfileArchives = publicProfileArchiveCount(verification);
  const acceptance = {
    backendReady: Boolean(verification?.backendHealth?.ready),
    profileIdentityReady: Boolean(
      verification?.profile &&
        verification.profileIdentity &&
        (verification.profileIdentityProblems?.length ?? 0) === 0 &&
        (verification.authUserProblems?.length ?? 0) === 0,
    ),
    historyReady: historyArtifacts > 0 && contentFingerprints >= historyArtifacts,
    publicProofsReady: publicProofIds.length > 0 && publicProofFingerprints >= publicProofIds.length,
    shareArtifactsReady:
      shareArtifacts.length === 0 ||
      (countPresent(verification?.shareArtifactContentIds, shareArtifactIds) >= shareArtifacts.length &&
        shareImages >= shareArtifacts.length),
    publicProfileReady:
      Boolean(verification?.publicProfile) &&
      publicProfileArchives >= historyArtifacts &&
      historyArtifacts > 0,
    outboxEmpty: outbox.every((item) => item.status === "verified" && item.queued === 0),
    auditPassed: audit.every((item) => item.status === "passed"),
    leaderboardScopesReady: leaderboardQueryContract.ready,
    cloudReadBackReady: coverage.passed,
  };
  const missing = unique([
    cloudState.configured ? "" : "Supabase runtime not configured",
    cloudState.authenticated ? "" : "Supabase session not authenticated",
    profile.cloudMode === "supabase" && !profile.id.startsWith("local-") ? "" : "profile is still local-only",
    acceptance.backendReady ? "" : "backend schema health not ready",
    acceptance.profileIdentityReady ? "" : "profile/Auth identity read-back incomplete",
    acceptance.historyReady ? "" : "cloud history fingerprints incomplete",
    acceptance.publicProofsReady ? "" : "public proof fingerprints incomplete",
    acceptance.shareArtifactsReady ? "" : "share card manifest/image read-back incomplete",
    acceptance.publicProfileReady ? "" : "public profile archive read-back incomplete",
    acceptance.outboxEmpty ? "" : "cloud sync outbox still has queued items",
    acceptance.auditPassed ? "" : "cloud sync audit has pending checks",
    acceptance.leaderboardScopesReady ? "" : "global/friend/season leaderboard current-user query contracts incomplete",
    acceptance.cloudReadBackReady ? "" : "strict cloud read-back helper did not pass",
  ]);
  const ready = missing.length === 0;
  const evidenceFingerprint = stableJson({
    profileId: profile.id,
    expected: { recordIds, modeRunIds, shareArtifactIds, publicProofIds },
    verified: {
      recordContentIds: verification?.recordContentIds ?? [],
      modeRunContentIds: verification?.modeRunContentIds ?? [],
      shareArtifactContentIds: verification?.shareArtifactContentIds ?? [],
      publicProofContentIds: verification?.publicProofContentIds ?? [],
      publicShareImageIds: verification?.publicShareImageIds ?? [],
      publicProfileRecordContentIds: verification?.publicProfileRecordContentIds ?? [],
      publicProfileModeRunContentIds: verification?.publicProfileModeRunContentIds ?? [],
      publicProfileShareArtifactContentIds: verification?.publicProfileShareArtifactContentIds ?? [],
      leaderboardScopes,
      leaderboardContractScopes,
      leaderboardTargetQueries: leaderboardQueryContract.targetQueries,
    },
  });
  const nextAction = ready ? "Cloud account evidence is ready." : firstAction(audit, outbox);
  const copyText = [
    "Kickoff Lock Agent account cloud sync evidence",
    `Ready: ${ready ? "yes" : "no"}`,
    `Profile: ${profile.displayName} (${profile.id})`,
    `Cloud: ${cloudState.mode} · configured ${cloudState.configured ? "yes" : "no"} · authenticated ${cloudState.authenticated ? "yes" : "no"}`,
    `History: records ${countPresent(verification?.recordContentIds, recordIds)}/${records.length}, modes ${countPresent(verification?.modeRunContentIds, modeRunIds)}/${modeRuns.length}, shares ${countPresent(verification?.shareArtifactContentIds, shareArtifactIds)}/${shareArtifacts.length}`,
    `Public: proofs ${publicProofFingerprints}/${publicProofIds.length}, profile archives ${publicProfileArchives}/${historyArtifacts}, share images ${shareImages}/${shareArtifacts.length}`,
    `Outbox queued: ${outbox.reduce((sum, item) => sum + item.queued, 0)}`,
    `Leaderboard rows: ${leaderboardScopes.join(", ") || "none"}`,
    `Leaderboard query contracts: ${leaderboardQueryContract.passedScopes}/${leaderboardQueryContract.totalScopes}`,
    `Missing: ${missing.length ? shortList(missing) : "none"}`,
    `Next action: ${nextAction}`,
  ].join("\n");
  return {
    ready,
    profileId: profile.id,
    cloudMode: profile.cloudMode,
    configured: cloudState.configured,
    authenticated: cloudState.authenticated,
    localTotals: {
      profile: 1,
      records: records.length,
      modeRuns: modeRuns.length,
      shareArtifacts: shareArtifacts.length,
      publicProofs: publicProofIds.length,
      historyArtifacts,
    },
    verifiedTotals: {
      records: countPresent(verification?.recordContentIds, recordIds),
      modeRuns: countPresent(verification?.modeRunContentIds, modeRunIds),
      shareArtifacts: countPresent(verification?.shareArtifactContentIds, shareArtifactIds),
      publicProofs: publicProofFingerprints,
      publicShareImages: shareImages,
      publicProfileArchives,
      contentFingerprints,
    },
    expectedIds: {
      records: recordIds,
      modeRuns: modeRunIds,
      shareArtifacts: shareArtifactIds,
      publicProofs: publicProofIds,
      leaderboardScopes,
    },
    acceptance,
    outbox,
    audit,
    coverage,
    leaderboardQueryContract,
    missing,
    evidenceFingerprint,
    nextAction,
    copyText,
  };
};

export const buildAccountCloudSyncEvidenceArtifact = (
  input: AccountCloudSyncEvidenceInput,
  options: {
    generatedAt?: string;
    source?: AccountCloudSyncEvidenceArtifact["source"];
  } = {},
): AccountCloudSyncEvidenceArtifact => ({
  artifactVersion: 1,
  generatedAt: options.generatedAt ?? new Date().toISOString(),
  source: options.source ?? "browser-runtime",
  ...buildAccountCloudSyncEvidence(input),
});
