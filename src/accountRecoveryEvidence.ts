import type {
  CloudCleanSessionPublicRender,
  CloudSyncState,
  GameModeRun,
  LeaderboardScope,
  LeaderboardScopeEvidence,
  MemoryRecord,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";
import type { ProductionEvidencePacket } from "./productionEvidence";
import { friendCodeFor, shareArtifactCloudId } from "./cloud";
import { hasLeaderboardScopeEvidence } from "./leaderboardEvidence";

export type AccountRecoveryStep = {
  key:
    | "runtime"
    | "session"
    | "profile"
    | "records"
    | "modes"
    | "shares"
    | "cloud-targets"
    | "clean-session"
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
  recoveryProofs: AccountRecoveryProof[];
  summary: string;
  nextAction: string;
  copyText: string;
};

export type AccountRecoveryProof = {
  id: string;
  kind: "profile" | "record" | "mode" | "share";
  label: string;
  cloudRow: boolean;
  contentFingerprint: boolean;
  publicArchive: boolean;
  cleanSession: boolean;
  publicUrl?: string;
  imageUrl?: string;
  blockers: string[];
  status: "passed" | "pending";
};

type AccountRecoveryEvidenceInput = {
  profile: UserProfile;
  cloudState: CloudSyncState;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  shareEvidence: ShareArtifactEvidence[];
  leaderboardScopeEvidence: LeaderboardScopeEvidence[];
  publicProfileUrl: string;
  productionEvidence?: ProductionEvidencePacket;
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

const countMatchingIds = (actual: string[] | undefined, expected: string[]) =>
  expected.filter((id) => actual?.includes(id)).length;

const missingIds = (actual: string[] | undefined, expected: string[]) =>
  expected.filter((id) => !actual?.includes(id));

const summarizeMissingIds = (label: string, ids: string[]) =>
  ids.length > 0 ? `${label} missing ${ids.slice(0, 3).join(", ")}${ids.length > 3 ? ` +${ids.length - 3}` : ""}` : "";

const ownerProblems = (
  owners: Record<string, string> | undefined,
  expectedIds: string[],
  profileId: string,
  label: string,
) => {
  if (expectedIds.length === 0) return [];
  if (!owners) return [`${label} owners not read back`];
  return expectedIds
    .map((id) => {
      const owner = owners[id];
      if (!owner) return `${label} owner missing ${id}`;
      return owner === profileId ? "" : `${label} ${id} owner ${owner} != ${profileId}`;
    })
    .filter(Boolean);
};

const countMatchingOwners = (owners: Record<string, string> | undefined, expectedIds: string[], profileId: string) =>
  expectedIds.filter((id) => owners?.[id] === profileId).length;

const summarizeOwnerProblems = (problems: string[]) =>
  problems.length > 0 ? `${problems.slice(0, 3).join(" · ")}${problems.length > 3 ? ` +${problems.length - 3}` : ""}` : "";

const leaderboardScopesReady = (evidence: LeaderboardScopeEvidence[], profileId: string) => {
  const scopes: LeaderboardScope[] = ["global", "friend", "season"];
  return scopes.filter((scope) => {
    const item = evidence.find((entry) => entry.scope === scope);
    return hasLeaderboardScopeEvidence(item, profileId);
  });
};

const isProductionPublicUrl = (urlText?: string) => {
  if (!urlText) return false;
  try {
    const url = new URL(urlText);
    const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
    return url.protocol === "https:" && !localHosts.has(url.hostname) && !url.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
};

const publicUrlTargetsCleanRender = (
  urlText: string | undefined,
  kind: CloudCleanSessionPublicRender["kind"],
  targetId: string,
) => {
  if (!urlText || !targetId) return false;
  try {
    const url = new URL(urlText);
    const targetParam = kind === "profile" ? "profile" : kind === "proof" ? "proof" : kind === "mode" ? "mode" : "";
    return Boolean(targetParam && url.searchParams.get(targetParam) === targetId);
  } catch {
    return false;
  }
};

const profileIdentityProblems = (profile: UserProfile, verification: CloudSyncState["verification"]) => {
  if (!verification?.profile) return ["kickoff_profiles has not read back this user"];
  if (verification.profileIdentityProblems?.length) return verification.profileIdentityProblems;
  const identity = verification.profileIdentity;
  if (!identity) return ["cloud profile identity fields were not read back"];
  const expectedFriendCode = friendCodeFor(profile);
  return [
    identity.id === profile.id ? "" : "id mismatch",
    identity.email ? "" : "email missing",
    profile.email && identity.email !== profile.email ? "email mismatch" : "",
    identity.displayName ? "" : "display name missing",
    identity.displayName !== profile.displayName ? "display name mismatch" : "",
    identity.location ? "" : "location missing",
    identity.location !== profile.location ? "location mismatch" : "",
    identity.friendCode ? "" : "friend code missing",
    identity.friendCode !== expectedFriendCode ? "friend code mismatch" : "",
  ].filter(Boolean);
};

export const cleanSessionRendersFromProductionEvidence = (
  packet?: ProductionEvidencePacket,
): CloudCleanSessionPublicRender[] => {
  const cleanSessionCheck = packet?.checks.find((check) => check.id === "public-clean-session-restore");
  if (!packet || packet.strict !== true || cleanSessionCheck?.status !== "passed") return [];
  const cleanSessionTargetIds = new Set(cleanSessionCheck.sampleIds ?? []);
  const renderChecks: Array<{ id: string; kind: CloudCleanSessionPublicRender["kind"] }> = [
    { id: "public-profile-link", kind: "profile" },
    { id: "public-proof-link", kind: "proof" },
    { id: "public-mode-link", kind: "mode" },
  ];
  return renderChecks.flatMap(({ id, kind }) => {
    const check = packet.checks.find((item) => item.id === id);
    if (!check || check.status !== "passed") return [];
    if (!isProductionPublicUrl(check.url)) return [];
    return (check.sampleIds ?? [])
      .filter((targetId) => cleanSessionTargetIds.has(targetId))
      .filter((targetId) => publicUrlTargetsCleanRender(check.url, kind, targetId))
      .map((targetId) => ({
        kind,
        targetId,
        url: check.url,
        passed: true,
        cloudLoaded: true,
        detail: check.detail,
        checkedAt: check.checkedAt,
      }));
  });
};

const mergeCleanRenders = (
  verification: CloudSyncState["verification"],
  productionEvidence?: ProductionEvidencePacket,
) => [
  ...(verification?.cleanSessionPublicRenders ?? []),
  ...cleanSessionRendersFromProductionEvidence(productionEvidence),
];

const countCleanRendersForTargets = (
  renders: CloudCleanSessionPublicRender[],
  kind: CloudCleanSessionPublicRender["kind"],
  targetIds: string[],
) =>
  targetIds.filter((targetId) =>
    renders.some(
      (result) =>
        result.kind === kind &&
        result.targetId === targetId &&
        result.passed &&
        result.cloudLoaded &&
        isProductionPublicUrl(result.url) &&
        publicUrlTargetsCleanRender(result.url, kind, targetId) &&
        result.canonicalOk !== false &&
        result.publicTargetOk !== false &&
        result.socialOk !== false &&
        result.shareImageMatched !== false &&
        result.structuredImageMatched !== false,
    ),
  ).length;

const failedCleanRenderDetails = (renders: CloudCleanSessionPublicRender[]) =>
  renders
    ?.filter(
      (result) =>
        !result.passed ||
        !result.cloudLoaded ||
        !isProductionPublicUrl(result.url) ||
        !publicUrlTargetsCleanRender(result.url, result.kind, result.targetId ?? "") ||
        result.canonicalOk === false ||
        result.publicTargetOk === false ||
        result.socialOk === false ||
        result.shareImageMatched === false ||
        result.structuredImageMatched === false,
    )
    .map((result) => {
      const detail = !isProductionPublicUrl(result.url)
        ? "non-production public URL"
        : !publicUrlTargetsCleanRender(result.url, result.kind, result.targetId ?? "")
          ? "public URL does not target this artifact"
        : !result.cloudLoaded
          ? "fixture fallback or local-only page rendered"
          : result.canonicalOk === false
          ? "canonical URL mismatch"
          : result.publicTargetOk === false
            ? "public target mismatch"
          : result.socialOk === false
              ? "social metadata incomplete"
              : result.shareImageMatched === false
                ? "share image mismatch"
                : result.structuredImageMatched === false
                  ? "structured image metadata mismatch"
                  : result.detail;
      return `${result.kind}:${result.targetId ?? "unknown"} ${detail}`;
    })
    .slice(0, 3) ?? [];

const cleanRenderReadyFor = (
  renders: CloudCleanSessionPublicRender[],
  kind: CloudCleanSessionPublicRender["kind"],
  targetId: string,
) =>
  renders.some(
    (result) =>
      result.kind === kind &&
      result.targetId === targetId &&
      result.passed &&
      result.cloudLoaded &&
      isProductionPublicUrl(result.url) &&
      publicUrlTargetsCleanRender(result.url, kind, targetId) &&
      result.canonicalOk !== false &&
      result.publicTargetOk !== false &&
      result.socialOk !== false &&
      result.shareImageMatched !== false &&
      result.structuredImageMatched !== false,
  );

const proofStatus = (proof: Omit<AccountRecoveryProof, "status">): AccountRecoveryProof => ({
  ...proof,
  status: proof.blockers.length === 0 ? "passed" : "pending",
});

export const buildAccountRecoveryEvidencePacket = ({
  profile,
  cloudState,
  records,
  modeRuns,
  shareEvidence,
  leaderboardScopeEvidence,
  publicProfileUrl,
  productionEvidence,
}: AccountRecoveryEvidenceInput): AccountRecoveryEvidencePacket => {
  const verification = cloudState.verification;
  const expectedArtifacts = records.length + modeRuns.length + shareEvidence.length;
  const expectedProofLinks = records.length + modeRuns.length;
  const expectedRecordIds = records.map((item) => item.capsule.id);
  const expectedModeRunIds = modeRuns.map((item) => item.id);
  const expectedShareArtifactIds = shareEvidence.map(shareArtifactCloudId);
  const expectedPublicProofIds = [
    ...expectedRecordIds.map((id) => `record:${id}`),
    ...expectedModeRunIds.map((id) => `mode:${id}`),
  ];
  const recoveredArtifacts = (verification?.records ?? 0) + (verification?.modeRuns ?? 0) + (verification?.shareArtifacts ?? 0);
  const anonymousArtifacts = (verification?.publicProofs ?? 0) + countPublicProfileArtifacts(cloudState);
  const matchedRecordRows = countMatchingIds(verification?.recordIds, expectedRecordIds);
  const matchedModeRows = countMatchingIds(verification?.modeRunIds, expectedModeRunIds);
  const matchedShareRows = countMatchingIds(verification?.shareArtifactIds, expectedShareArtifactIds);
  const matchedRecordOwners = countMatchingOwners(verification?.recordOwnerIds, expectedRecordIds, profile.id);
  const matchedModeOwners = countMatchingOwners(verification?.modeRunOwnerIds, expectedModeRunIds, profile.id);
  const matchedShareOwners = countMatchingOwners(verification?.shareArtifactOwnerIds, expectedShareArtifactIds, profile.id);
  const matchedPublicProofLinks = countMatchingIds(verification?.publicProofIds, expectedPublicProofIds);
  const matchedPublicProofContentLinks = countMatchingIds(verification?.publicProofContentIds, expectedPublicProofIds);
  const matchedPublicProfileRecords = countMatchingIds(verification?.publicProfileRecordIds, expectedRecordIds);
  const matchedPublicProfileModes = countMatchingIds(verification?.publicProfileModeRunIds, expectedModeRunIds);
  const matchedPublicProfileShares = countMatchingIds(verification?.publicProfileShareArtifactIds, expectedShareArtifactIds);
  const matchedRecordFingerprints = countMatchingIds(verification?.recordContentIds, expectedRecordIds);
  const matchedModeFingerprints = countMatchingIds(verification?.modeRunContentIds, expectedModeRunIds);
  const matchedShareFingerprints = countMatchingIds(verification?.shareArtifactContentIds, expectedShareArtifactIds);
  const matchedFingerprintCount = matchedRecordFingerprints + matchedModeFingerprints + matchedShareFingerprints;
  const scopesReady = leaderboardScopesReady(leaderboardScopeEvidence, profile.id);
  const missingScopes = (["global", "friend", "season"] as LeaderboardScope[]).filter(
    (scope) => !scopesReady.includes(scope),
  );
  const publicProfileArtifacts = countPublicProfileArtifacts(cloudState);
  const publicImages = verification?.publicShareImages ?? 0;
  const cleanRenders = mergeCleanRenders(verification, productionEvidence);
  const cleanProfiles = countCleanRendersForTargets(cleanRenders, "profile", [profile.id]);
  const cleanProofs = countCleanRendersForTargets(cleanRenders, "proof", records.map((item) => item.capsule.id));
  const cleanModes = countCleanRendersForTargets(cleanRenders, "mode", modeRuns.map((item) => item.id));
  const cleanFailures = failedCleanRenderDetails(cleanRenders);
  const configured = cloudState.configured;
  const authenticated = cloudState.authenticated;
  const backendReady = Boolean(verification?.backendHealth?.ready);
  const profileProblems = profileIdentityProblems(profile, verification);
  const profileIdentityReady = profileProblems.length === 0;
  const expectedTargetsAligned = Boolean(
    verification &&
      verification.expectedRecords === records.length &&
      verification.expectedModeRuns === modeRuns.length &&
      (verification.expectedShareArtifacts ?? 0) === shareEvidence.length,
  );
  const recordOwnerProblems = ownerProblems(verification?.recordOwnerIds, expectedRecordIds, profile.id, "record");
  const modeOwnerProblems = ownerProblems(verification?.modeRunOwnerIds, expectedModeRunIds, profile.id, "mode");
  const shareOwnerProblems = ownerProblems(verification?.shareArtifactOwnerIds, expectedShareArtifactIds, profile.id, "share");
  const ownersAligned = recordOwnerProblems.length === 0 && modeOwnerProblems.length === 0 && shareOwnerProblems.length === 0;
  const expectedTargetIdsAligned = Boolean(
    matchedRecordRows >= expectedRecordIds.length &&
      matchedModeRows >= expectedModeRunIds.length &&
      matchedShareRows >= expectedShareArtifactIds.length &&
      matchedRecordOwners >= expectedRecordIds.length &&
      matchedModeOwners >= expectedModeRunIds.length &&
      matchedShareOwners >= expectedShareArtifactIds.length &&
      matchedPublicProofLinks >= expectedPublicProofIds.length &&
      matchedPublicProofContentLinks >= expectedPublicProofIds.length &&
      matchedPublicProfileRecords >= expectedRecordIds.length &&
      matchedPublicProfileModes >= expectedModeRunIds.length &&
      matchedPublicProfileShares >= expectedShareArtifactIds.length,
  );
  const targetProblems = [
    summarizeMissingIds("records", missingIds(verification?.recordIds, expectedRecordIds)),
    summarizeMissingIds("modes", missingIds(verification?.modeRunIds, expectedModeRunIds)),
    summarizeMissingIds("shares", missingIds(verification?.shareArtifactIds, expectedShareArtifactIds)),
    summarizeOwnerProblems(recordOwnerProblems),
    summarizeOwnerProblems(modeOwnerProblems),
    summarizeOwnerProblems(shareOwnerProblems),
    summarizeMissingIds("proof links", missingIds(verification?.publicProofIds, expectedPublicProofIds)),
    summarizeMissingIds("proof content", missingIds(verification?.publicProofContentIds, expectedPublicProofIds)),
    summarizeMissingIds("profile records", missingIds(verification?.publicProfileRecordIds, expectedRecordIds)),
    summarizeMissingIds("profile modes", missingIds(verification?.publicProfileModeRunIds, expectedModeRunIds)),
    summarizeMissingIds("profile shares", missingIds(verification?.publicProfileShareArtifactIds, expectedShareArtifactIds)),
  ].filter(Boolean);
  const fingerprintsReady = Boolean(
    expectedArtifacts > 0 &&
      matchedRecordFingerprints >= expectedRecordIds.length &&
      matchedModeFingerprints >= expectedModeRunIds.length &&
      matchedShareFingerprints >= expectedShareArtifactIds.length,
  );
  const cleanRenderReady =
    cleanProfiles >= 1 &&
    cleanProofs >= records.length &&
    cleanModes >= modeRuns.length &&
    cleanFailures.length === 0;
  const recoveryProofs: AccountRecoveryProof[] = [
    proofStatus({
      id: profile.id,
      kind: "profile",
      label: "Public profile",
      cloudRow: profileIdentityReady,
      contentFingerprint: profileIdentityReady,
      publicArchive: Boolean(verification?.publicProfile),
      cleanSession: cleanRenderReadyFor(cleanRenders, "profile", profile.id),
      publicUrl: publicProfileUrl,
      blockers: [
        profileIdentityReady ? "" : "profile identity not read back",
        verification?.publicProfile ? "" : "public profile archive not verified",
        cleanRenderReadyFor(cleanRenders, "profile", profile.id) ? "" : "clean-session profile render missing",
        isProductionPublicUrl(publicProfileUrl) ? "" : "public profile URL is not deployed HTTPS",
      ].filter(Boolean),
    }),
    ...records.map((record) => {
      const id = record.capsule.id;
      const publicProofId = `record:${id}`;
      const publicUrl = cleanRenders.find((render) => render.kind === "proof" && render.targetId === id)?.url;
      const ownerProblem = ownerProblems(verification?.recordOwnerIds, [id], profile.id, "record")[0];
      return proofStatus({
        id,
        kind: "record" as const,
        label: record.capsule.matchLabel,
        cloudRow: Boolean(verification?.recordIds?.includes(id) && !ownerProblem),
        contentFingerprint: Boolean(verification?.recordContentIds?.includes(id)),
        publicArchive: Boolean(
          verification?.publicProofIds?.includes(publicProofId) &&
            verification.publicProofContentIds?.includes(publicProofId) &&
            verification.publicProfileRecordIds?.includes(id),
        ),
        cleanSession: cleanRenderReadyFor(cleanRenders, "proof", id),
        publicUrl,
        blockers: [
          verification?.recordIds?.includes(id) ? "" : "record row missing",
          ownerProblem ?? "",
          verification?.recordContentIds?.includes(id) ? "" : "record fingerprint missing",
          verification?.publicProofIds?.includes(publicProofId) ? "" : "public proof link missing",
          verification?.publicProofContentIds?.includes(publicProofId) ? "" : "public proof fingerprint missing",
          verification?.publicProfileRecordIds?.includes(id) ? "" : "public profile record archive missing",
          cleanRenderReadyFor(cleanRenders, "proof", id) ? "" : "clean-session proof render missing",
        ].filter(Boolean),
      });
    }),
    ...modeRuns.map((run) => {
      const publicProofId = `mode:${run.id}`;
      const publicUrl = cleanRenders.find((render) => render.kind === "mode" && render.targetId === run.id)?.url;
      const ownerProblem = ownerProblems(verification?.modeRunOwnerIds, [run.id], profile.id, "mode")[0];
      return proofStatus({
        id: run.id,
        kind: "mode" as const,
        label: run.title,
        cloudRow: Boolean(verification?.modeRunIds?.includes(run.id) && !ownerProblem),
        contentFingerprint: Boolean(verification?.modeRunContentIds?.includes(run.id)),
        publicArchive: Boolean(
          verification?.publicProofIds?.includes(publicProofId) &&
            verification.publicProofContentIds?.includes(publicProofId) &&
            verification.publicProfileModeRunIds?.includes(run.id),
        ),
        cleanSession: cleanRenderReadyFor(cleanRenders, "mode", run.id),
        publicUrl,
        blockers: [
          verification?.modeRunIds?.includes(run.id) ? "" : "mode row missing",
          ownerProblem ?? "",
          verification?.modeRunContentIds?.includes(run.id) ? "" : "mode fingerprint missing",
          verification?.publicProofIds?.includes(publicProofId) ? "" : "public mode link missing",
          verification?.publicProofContentIds?.includes(publicProofId) ? "" : "public mode fingerprint missing",
          verification?.publicProfileModeRunIds?.includes(run.id) ? "" : "public profile mode archive missing",
          cleanRenderReadyFor(cleanRenders, "mode", run.id) ? "" : "clean-session mode render missing",
        ].filter(Boolean),
      });
    }),
    ...shareEvidence.map((share) => {
      const id = shareArtifactCloudId(share);
      const ownerProblem = ownerProblems(verification?.shareArtifactOwnerIds, [id], profile.id, "share")[0];
      return proofStatus({
        id,
        kind: "share" as const,
        label: `${share.kind} share card`,
        cloudRow: Boolean(verification?.shareArtifactIds?.includes(id) && !ownerProblem),
        contentFingerprint: Boolean(verification?.shareArtifactContentIds?.includes(id)),
        publicArchive: Boolean(
          verification?.publicShareImageIds?.includes(id) &&
            verification.publicProfileShareArtifactIds?.includes(id) &&
            isProductionPublicUrl(share.imageUrl),
        ),
        cleanSession: Boolean(verification?.publicProfileShareArtifactIds?.includes(id)),
        publicUrl: share.proofUrl,
        imageUrl: share.imageUrl,
        blockers: [
          verification?.shareArtifactIds?.includes(id) ? "" : "share artifact row missing",
          ownerProblem ?? "",
          verification?.shareArtifactContentIds?.includes(id) ? "" : "share artifact fingerprint missing",
          verification?.publicShareImageIds?.includes(id) ? "" : "public share image read-back missing",
          verification?.publicProfileShareArtifactIds?.includes(id) ? "" : "public profile share archive missing",
          isProductionPublicUrl(share.imageUrl) ? "" : "share image URL is not deployed HTTPS",
        ].filter(Boolean),
      });
    }),
  ];
  const cleanSessionReady = Boolean(
    expectedProofLinks > 0 &&
      (verification?.publicProofs ?? 0) >= expectedProofLinks &&
      verification?.publicProfile &&
      publicProfileArtifacts >= expectedArtifacts &&
      backendReady &&
      expectedTargetsAligned &&
      expectedTargetIdsAligned &&
      fingerprintsReady &&
      cleanRenderReady,
  );

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
      status: statusFor(profileIdentityReady, !authenticated),
      detail: profileIdentityReady
        ? `${verification?.profileIdentity?.email ?? profile.email} · ${verification?.profileIdentity?.displayName ?? profile.displayName} · ${verification?.profileIdentity?.location ?? profile.location} · friend ${verification?.profileIdentity?.friendCode ?? friendCodeFor(profile)}`
        : profileProblems.join(" · "),
      action: "Save profile and run cloud sync read-back.",
    },
    {
      key: "records",
      label: "Prediction history restore",
      status: statusFor(
        records.length > 0 && matchedRecordRows >= records.length && matchedRecordOwners >= records.length,
        !authenticated,
      ),
      detail: records.length > 0 ? `${matchedRecordRows}/${records.length} prediction records · owners ${matchedRecordOwners}/${records.length}` : "no local locked predictions",
      action: "Lock at least one prediction, sync it, then pull cloud history on a clean session.",
    },
    {
      key: "modes",
      label: "Mode history restore",
      status: statusFor(
        modeRuns.length > 0 && matchedModeRows >= modeRuns.length && matchedModeOwners >= modeRuns.length,
        !authenticated,
      ),
      detail: modeRuns.length > 0 ? `${matchedModeRows}/${modeRuns.length} mode runs · owners ${matchedModeOwners}/${modeRuns.length}` : "no tournament mode run yet",
      action: "Create a bracket or challenge mode proof, sync it, then verify read-back.",
    },
    {
      key: "shares",
      label: "Share card restore",
      status: statusFor(
        shareEvidence.length > 0 &&
          matchedShareRows >= shareEvidence.length &&
          matchedShareOwners >= shareEvidence.length &&
          publicImages >= shareEvidence.length,
        !authenticated,
      ),
      detail:
        shareEvidence.length > 0
          ? `${matchedShareRows}/${shareEvidence.length} manifests · owners ${matchedShareOwners}/${shareEvidence.length} · ${publicImages}/${shareEvidence.length} public images`
          : "no share card manifest yet",
      action: "Generate share cards, upload public PNG URLs and sync their manifests.",
    },
    {
      key: "cloud-targets",
      label: "Cloud target alignment",
      status: statusFor(backendReady && expectedTargetsAligned && expectedTargetIdsAligned, !authenticated),
      detail: backendReady
        ? verification
          ? [
              `expected records ${verification.expectedRecords}/${records.length} · modes ${verification.expectedModeRuns}/${modeRuns.length} · shares ${verification.expectedShareArtifacts ?? 0}/${shareEvidence.length}`,
              `ids records ${matchedRecordRows}/${records.length} · modes ${matchedModeRows}/${modeRuns.length} · shares ${matchedShareRows}/${shareEvidence.length}`,
              `owners records ${matchedRecordOwners}/${records.length} · modes ${matchedModeOwners}/${modeRuns.length} · shares ${matchedShareOwners}/${shareEvidence.length}`,
              targetProblems.length > 0 ? targetProblems.join(" · ") : "",
            ].filter(Boolean).join(" · ")
          : "cloud verification missing"
        : `backend not ready: ${verification?.backendHealth?.detail ?? "health check missing"}`,
      action: "Run cloud sync read-back against the same profile, prediction records, mode runs and share manifests being verified.",
    },
    {
      key: "proof-links",
      label: "Anonymous proof links",
      status: statusFor(
        expectedProofLinks > 0 &&
          matchedPublicProofLinks >= expectedProofLinks &&
          matchedPublicProofContentLinks >= expectedProofLinks,
        !configured,
      ),
      detail: expectedProofLinks > 0
        ? `${matchedPublicProofLinks}/${expectedProofLinks} proof links · ${matchedPublicProofContentLinks}/${expectedProofLinks} proof fingerprints`
        : "no proof links to restore",
      action: "Verify public proof and mode URLs without the signed-in local session.",
    },
    {
      key: "clean-session",
      label: "Clean-session restore rehearsal",
      status: statusFor(cleanSessionReady, !configured),
      detail: cleanSessionReady
        ? "profile, proof and mode pages cloud-load in a clean browser context without localStorage"
        : [
            `anonymous ${verification?.publicProofs ?? 0}/${expectedProofLinks} proof links`,
            `proof fingerprints ${matchedPublicProofContentLinks}/${expectedProofLinks}`,
            `archive ${publicProfileArtifacts}/${expectedArtifacts}`,
            `targets ${expectedTargetsAligned && expectedTargetIdsAligned && ownersAligned ? "aligned" : "mismatched"}`,
            `fingerprints ${matchedFingerprintCount}/${expectedArtifacts}`,
            `clean renders profile ${cleanProfiles}/1 · proofs ${cleanProofs}/${records.length} · modes ${cleanModes}/${modeRuns.length}`,
            targetProblems.length > 0 ? `target ids ${targetProblems.join(" | ")}` : "",
            cleanFailures.length > 0 ? `failures ${cleanFailures.join(" | ")}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
      action: "Open proof/profile URLs in a clean or anonymous session and confirm cloud artifacts render without localStorage.",
    },
    {
      key: "public-profile",
      label: "Public profile archive",
      status: statusFor(
        Boolean(verification?.publicProfile) &&
          matchedPublicProfileRecords >= records.length &&
          matchedPublicProfileModes >= modeRuns.length &&
          matchedPublicProfileShares >= shareEvidence.length &&
          expectedArtifacts > 0,
        !configured,
      ),
      detail: verification?.publicProfile
        ? `${matchedPublicProfileRecords + matchedPublicProfileModes + matchedPublicProfileShares}/${expectedArtifacts} archived artifacts · ${publicProfileUrl}`
        : `profile page not anonymously verified · ${publicProfileUrl}`,
      action: "Open the profile URL anonymously and confirm records, mode proofs and share cards render.",
    },
    {
      key: "fingerprints",
      label: "Content fingerprint match",
      status: statusFor(fingerprintsReady, !authenticated),
      detail: `${matchedFingerprintCount}/${expectedArtifacts} remote payload fingerprints`,
      action: "Sync again or pull cloud history until remote rows match local content fingerprints.",
    },
    {
      key: "leaderboard",
      label: "Rank context restore",
      status: statusFor(scopesReady.length === 3, !configured),
      detail: scopesReady.length === 3
        ? `current user has scoped rank in ${scopesReady.join(", ")} scopes`
        : `missing current-user scoped rank in ${missingScopes.join(", ") || "leaderboard scopes"}`,
      action: "Load global, friend and season leaderboard rows with positive scoped ranks for the signed-in user.",
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
    `Cloud targets: ${expectedTargetsAligned && expectedTargetIdsAligned && ownersAligned ? "aligned" : "mismatched"}`,
    `Content fingerprints: ${matchedFingerprintCount}/${expectedArtifacts}`,
    `Clean renders: profile ${cleanProfiles}/1 · proofs ${cleanProofs}/${records.length} · modes ${cleanModes}/${modeRuns.length}`,
    `Recovery proofs: ${recoveryProofs.filter((proof) => proof.status === "passed").length}/${recoveryProofs.length}`,
    `Leaderboard scopes: ${scopesReady.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "",
    ...steps.map((step) => `${step.label}: ${step.status} · ${step.detail}`),
    "",
    "Recovery proof ledger:",
    ...recoveryProofs.map(
      (proof) =>
        `- ${proof.kind}:${proof.id} · ${proof.status} · cloud ${proof.cloudRow ? "yes" : "no"} · fingerprint ${
          proof.contentFingerprint ? "yes" : "no"
        } · public ${proof.publicArchive ? "yes" : "no"} · clean ${proof.cleanSession ? "yes" : "no"}${
          proof.blockers.length ? ` · ${proof.blockers.join("; ")}` : ""
        }`,
    ),
  ].join("\n");

  return {
    ready,
    profileId: profile.id,
    displayName: profile.displayName,
    expectedArtifacts,
    recoveredArtifacts,
    anonymousArtifacts,
    fingerprintMatches: matchedFingerprintCount,
    leaderboardScopes: scopesReady,
    recoveryScore,
    steps,
    recoveryProofs,
    summary,
    nextAction,
    copyText,
  };
};
