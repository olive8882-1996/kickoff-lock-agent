import {
  ACCEPTANCE_TEST_SUITES,
  REQUIRED_ACCEPTANCE_COVERAGE,
  summarizeAcceptanceCoverage,
  summarizeAcceptanceRunEvidence,
  type AcceptanceEvidencePacket,
} from "./acceptance";
import { isCloudReadbackComplete, shareArtifactCloudId } from "./cloud";
import { sealBackendProductionReady } from "./filecoinSeal";
import { hasLeaderboardScopeEvidence } from "./leaderboardEvidence";
import { productionCheckPassed, summarizeProductionEvidence, type ProductionEvidencePacket } from "./productionEvidence";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { isProductionShareArtifact } from "./shareCard";
import type {
  CloudSyncState,
  GameMode,
  GameModeRun,
  LeaderboardEntry,
  LeaderboardScope,
  LeaderboardScopeEvidence,
  MemoryRecord,
  ProviderReadinessItem,
  ProviderRouteAuditItem,
  ProviderHealthSnapshot,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";

export type ProductionReadinessLevel = "verified" | "ready" | "partial" | "blocked";

export type ProductionReadinessItem = {
  key: "account" | "data" | "filecoin" | "sharing" | "leaderboard" | "modes" | "tests" | "external";
  label: string;
  level: ProductionReadinessLevel;
  passed: number;
  total: number;
  evidence: string;
  nextAction: string;
  checks: ProductionReadinessCheck[];
};

export type ProductionReadinessCheck = {
  id: string;
  label: string;
  passed: boolean;
  evidence: string;
  command?: string;
};

type ProductionReadinessInput = {
  cloudState: CloudSyncState;
  profile: UserProfile;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  gameModes: GameMode[];
  providerReadiness: ProviderReadinessItem[];
  providerRouteAudit: ProviderRouteAuditItem[];
  leaderboardEntries: LeaderboardEntry[];
  leaderboardScopeEvidence?: LeaderboardScopeEvidence[];
  sealEndpointConfigured: boolean;
  shareImageReady: boolean;
  shareEvidence?: ShareArtifactEvidence[];
  providerHealth?: ProviderHealthSnapshot;
  acceptanceEvidence?: AcceptanceEvidencePacket;
  productionEvidence?: ProductionEvidencePacket;
};

const levelFrom = (passed: number, total: number, canBeVerified = true): ProductionReadinessLevel => {
  if (passed <= 0) return "blocked";
  if (passed >= total) return canBeVerified ? "verified" : "ready";
  if (passed / total >= 0.65) return "ready";
  return "partial";
};

const check = (
  id: string,
  label: string,
  passed: boolean,
  evidence: string,
  command?: string,
): ProductionReadinessCheck => ({ id, label, passed, evidence, command });

const count = (checks: ProductionReadinessCheck[]) => checks.filter((item) => item.passed).length;

const realProofReady = (proof?: MemoryRecord["capsule"]["filecoinProof"]) =>
  proof?.mode === "real" && ["retrievable", "verified"].includes(proof.proofStatus);

const hasRealVerifiedRecordProof = (record: MemoryRecord) => realProofReady(record.capsule.filecoinProof);

const hasRealVerifiedModeProof = (run: GameModeRun) => realProofReady(run.filecoinProof);

const hasVerifiedSealJob = (artifact: Pick<MemoryRecord, "sealJob"> | Pick<GameModeRun, "sealJob">) =>
  artifact.sealJob?.status === "verified" &&
  artifact.sealJob.proof?.mode === "real" &&
  Boolean(artifact.sealJob.verifyUrl || artifact.sealJob.proofUrl);

const hasPayloadHashMatch = (artifact: Pick<MemoryRecord, "sealJob"> | Pick<GameModeRun, "sealJob">) =>
  Boolean(
    artifact.sealJob?.uploadPayloadHash &&
      artifact.sealJob.proof?.payloadHash &&
      artifact.sealJob.uploadPayloadHash === artifact.sealJob.proof.payloadHash,
  );

const hasProofRegistryReadback = (artifact: Pick<MemoryRecord, "sealJob"> | Pick<GameModeRun, "sealJob">) =>
  Boolean(
    artifact.sealJob?.proofRegistryStatus === "verified" &&
      artifact.sealJob.proofRegistryHash &&
      artifact.sealJob.uploadPayloadHash &&
      artifact.sealJob.proofRegistryHash === artifact.sealJob.uploadPayloadHash,
  );

const liveOrConfigured = (item?: ProviderReadinessItem) =>
  item?.status === "live" || item?.status === "configured";

const productionEnrichmentKeys = new Set<ProviderReadinessItem["key"]>(["lineups", "injuries", "odds"]);

const hasProductionEnrichmentReadback = (providerHealth: ProviderHealthSnapshot | undefined, key: ProviderReadinessItem["key"]) => {
  if (!productionEnrichmentKeys.has(key)) return true;
  const endpoint = providerHealth?.enrichmentAudit?.endpointAudits.find((item) => item.key === key);
  return Boolean(endpoint && endpoint.attempted > 0 && endpoint.fulfilled >= endpoint.attempted && endpoint.live >= endpoint.attempted && endpoint.errors === 0);
};

const productionDataReady = (item: ProviderReadinessItem | undefined, providerHealth: ProviderHealthSnapshot | undefined) => {
  if (!item) return false;
  if (!productionEnrichmentKeys.has(item.key)) return liveOrConfigured(item);
  return item.status === "live" && hasProductionEnrichmentReadback(providerHealth, item.key);
};

const requiredModeIds: GameMode["id"][] = requiredProductionModeIds;

const sealedModeRun = (run?: GameModeRun) =>
  Boolean(
    run &&
      (run.status === "sealed" || run.status === "scored") &&
      run.payloadHash &&
      realProofReady(run.filecoinProof) &&
      run.filecoinProof.cid &&
      run.capsuleIds.length > 0,
  );

export const buildProductionReadiness = ({
  cloudState,
  profile,
  records,
  modeRuns,
  gameModes,
  providerReadiness,
  providerRouteAudit,
  leaderboardEntries,
  sealEndpointConfigured,
  shareImageReady,
  shareEvidence = [],
  providerHealth,
  leaderboardScopeEvidence = [],
  acceptanceEvidence,
  productionEvidence,
}: ProductionReadinessInput): ProductionReadinessItem[] => {
  const cloudProfile = profile.cloudMode === "supabase" && !profile.id.startsWith("local-");
  const cloudItems = records.length + modeRuns.length;
  const verification = cloudState.verification;
  const backendReady = Boolean(verification?.backendHealth?.ready);
  const shareImagesVerified = Boolean(verification && (verification.publicShareImages ?? 0) >= shareEvidence.length);
  const readbackVerified = isCloudReadbackComplete(verification, records.length, modeRuns.length, shareEvidence.length, {
    recordIds: records.map((record) => record.capsule.id),
    modeRunIds: modeRuns.map((run) => run.id),
    shareArtifactIds: shareEvidence.map(shareArtifactCloudId),
  });
  const accountChecks = [
    check("supabase-env", "Supabase env configured", cloudState.configured, cloudState.configured ? "VITE_SUPABASE_URL and anon key are available." : "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.", "bun run verify:production"),
    check("supabase-session", "Authenticated cloud session", cloudState.authenticated, cloudState.authenticated ? cloudState.message : "Sign in with Google or magic link before syncing."),
    check("backend-health", "Backend schema health", backendReady, verification?.backendHealth?.detail ?? "kickoff_backend_health has not passed.", "bun run doctor:supabase"),
    check("cloud-profile", "Non-local cloud profile", cloudProfile, cloudProfile ? `${profile.id} · ${profile.email}` : "Profile is still local-only."),
    check("cloud-history", "Cloud history candidate exists", cloudItems > 0, `${records.length} record(s), ${modeRuns.length} mode run(s).`),
    check("cloud-readback", "Profile/history/share read-back", readbackVerified, verification?.message ?? "Cloud read-back evidence missing.", "bun run doctor:supabase"),
  ];
  const accountPassed = count(accountChecks);

  const activeRoute = providerRouteAudit.find((route) => route.status === "active" || route.status === "fallback");
  const schedule = providerReadiness.find((item) => item.key === "schedule");
  const score = providerReadiness.find((item) => item.key === "score");
  const rankings = providerReadiness.find((item) => item.key === "rankings");
  const lineups = providerReadiness.find((item) => item.key === "lineups");
  const injuries = providerReadiness.find((item) => item.key === "injuries");
  const odds = providerReadiness.find((item) => item.key === "odds");
  const dataChecks = [
    check("non-seed-route", "Non-seed active route", Boolean(activeRoute && !["seed", "manual"].includes(activeRoute.key) && providerHealth?.fresh !== false), activeRoute ? `${activeRoute.label} · ${activeRoute.status}` : "No active route.", "bun run doctor:data"),
    check("fresh-response", "Fresh provider response", Boolean(providerHealth?.fresh), providerHealth?.detail ?? "Provider freshness not verified.", "bun run doctor:data"),
    check("response-audit", "Response audit verified", Boolean(providerHealth?.responseVerified), providerHealth?.responseAudit?.detail ?? "No live response audit.", "bun run doctor:data"),
    check("schedule-feed", "Schedule feed", liveOrConfigured(schedule), `${schedule?.source ?? "missing"} · ${schedule?.status ?? "missing"}`),
    check("score-feed", "Score feed", liveOrConfigured(score), `${score?.source ?? "missing"} · ${score?.status ?? "missing"}`),
    check("rankings-feed", "Rankings feed", liveOrConfigured(rankings), `${rankings?.source ?? "missing"} · ${rankings?.status ?? "missing"}`),
    check("lineups-readback", "Lineups endpoint read-back", productionDataReady(lineups, providerHealth), `${lineups?.source ?? "missing"} · ${lineups?.status ?? "missing"}`, "bun run doctor:data"),
    check("injuries-readback", "Injuries endpoint read-back", productionDataReady(injuries, providerHealth), `${injuries?.source ?? "missing"} · ${injuries?.status ?? "missing"}`, "bun run doctor:data"),
    check("odds-readback", "Odds endpoint read-back", productionDataReady(odds, providerHealth), `${odds?.source ?? "missing"} · ${odds?.status ?? "missing"}`, "bun run doctor:data"),
  ];
  const dataPassed = count(dataChecks);

  const sealedArtifacts = [...records, ...modeRuns];
  const realRecordProofs = records.filter(hasRealVerifiedRecordProof).length;
  const realModeProofs = modeRuns.filter(hasRealVerifiedModeProof).length;
  const anyBackendReady = sealedArtifacts.some((artifact) => artifact.sealJob?.backendHealth?.ok);
  const anyProductionBackend = sealedArtifacts.some((artifact) => sealBackendProductionReady(artifact.sealJob?.backendHealth));
  const filecoinChecks = [
    check(
      "seal-endpoint",
      "Browser seal endpoint configured",
      sealEndpointConfigured,
      sealEndpointConfigured
        ? "Filecoin seal endpoint is configured for browser use."
        : "Missing VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1.",
      "bun run doctor:filecoin",
    ),
    check("seal-health", "Seal backend health reachable", anyBackendReady, anyBackendReady ? "At least one seal job has backend health." : "No seal job has successful backend health.", "bun run test:e2e:seal"),
    check("production-synapse", "Production Synapse backend", anyProductionBackend, anyProductionBackend ? "Mock mode is off, auth is required and persistence is durable." : "Backend is missing production Synapse readiness.", "bun run doctor:filecoin"),
    check("real-record-cid", "Real record CID verified", records.some(hasRealVerifiedRecordProof), `${realRecordProofs} real record proof(s).`, "bun run seal:production-targets"),
    check("real-mode-cid", "Real mode CID verified", modeRuns.some(hasRealVerifiedModeProof), `${realModeProofs} real mode proof(s).`, "bun run seal:production-targets"),
    check("record-seal-job", "Record seal job verified", records.some(hasVerifiedSealJob), "Prediction seal job status, proof URL and verify URL are required."),
    check("mode-seal-job", "Mode seal job verified", modeRuns.some(hasVerifiedSealJob), "Mode proof seal job status, proof URL and verify URL are required."),
    check("record-hash-match", "Record payload hash match", records.some(hasPayloadHashMatch), "Upload payload hash must equal returned proof payload hash."),
    check("mode-hash-match", "Mode payload hash match", modeRuns.some(hasPayloadHashMatch), "Mode upload payload hash must equal returned proof payload hash."),
    check("record-registry-readback", "Record registry read-back", records.some(hasProofRegistryReadback), "Persistent proof registry must read back the record payload hash.", "bun run doctor:filecoin"),
    check("mode-registry-readback", "Mode registry read-back", modeRuns.some(hasProofRegistryReadback), "Persistent proof registry must read back the mode payload hash.", "bun run doctor:filecoin"),
  ];
  const filecoinPassed = count(filecoinChecks);

  const publicProofItems = records.length + modeRuns.length;
  const productionShareEvidence = shareEvidence.filter(isProductionShareArtifact);
  const recordShareIds = new Set(productionShareEvidence.filter((item) => item.kind === "record").map((item) => item.id));
  const modeShareIds = new Set(productionShareEvidence.filter((item) => item.kind === "mode").map((item) => item.id));
  const shareChannelEvidence = productionShareEvidence.filter(
    (item) => item.xIntentUrl && (item.xIntentOpenedAt || item.nativeShareOpenedAt),
  );
  const recordShareChannelIds = new Set(shareChannelEvidence.filter((item) => item.kind === "record").map((item) => item.id));
  const modeShareChannelIds = new Set(shareChannelEvidence.filter((item) => item.kind === "mode").map((item) => item.id));
  const shareChannelReady = Boolean(
    records.length > 0 &&
      modeRuns.length > 0 &&
      records.every((record) => recordShareChannelIds.has(record.capsule.id)) &&
      modeRuns.every((run) => modeShareChannelIds.has(run.id)),
  );
  const publicLinksVerified = Boolean(
    verification &&
      publicProofItems > 0 &&
      verification.publicProofs >= publicProofItems &&
      verification.publicProfile,
  );
  const shareArtifactsVerified = Boolean(
    verification &&
      productionShareEvidence.length > 0 &&
      (verification.shareArtifacts ?? 0) >= productionShareEvidence.length,
  );
  const publicShareImagesVerified = Boolean(
    verification &&
      productionShareEvidence.length > 0 &&
      (verification.publicShareImages ?? 0) >= productionShareEvidence.length,
  );
  const shareChecks = [
    check("proof-artifacts", "Record or mode proof exists", publicProofItems > 0, `${records.length} record(s), ${modeRuns.length} mode run(s).`),
    check("record-share-cards", "Every record has production share card", records.length > 0 && records.every((record) => recordShareIds.has(record.capsule.id)), `${recordShareIds.size}/${records.length} record card(s).`, "bun run doctor:sharing"),
    check("mode-share-cards", "Every mode has production share card", modeRuns.length > 0 && modeRuns.every((run) => modeShareIds.has(run.id)), `${modeShareIds.size}/${modeRuns.length} mode card(s).`, "bun run doctor:sharing"),
    check("share-image-generated", "Share image generated", shareImageReady || recordShareIds.size + modeShareIds.size > 0, `${productionShareEvidence.length} production manifest(s).`, "bun run share:production-image"),
    check("public-proof-links", "Public proof/profile links read back", publicLinksVerified, verification ? `${verification.publicProofs} public proof(s), profile ${verification.publicProfile ? "yes" : "no"}.` : "Cloud public link read-back missing.", "bun run doctor:sharing"),
    check("share-manifests", "Share manifests read back", shareArtifactsVerified, verification ? `${verification.shareArtifacts ?? 0}/${productionShareEvidence.length} share manifest(s).` : "Cloud share manifest read-back missing.", "bun run doctor:sharing"),
    check("public-image-urls", "Public image URLs read back", publicShareImagesVerified, verification ? `${verification.publicShareImages ?? 0}/${productionShareEvidence.length} public image(s).` : "Supabase Storage image read-back missing.", "bun run doctor:sharing"),
    check(
      "share-channel",
      "X or native share exercised for every card",
      shareChannelReady,
      shareChannelReady
        ? `${shareChannelEvidence.length}/${publicProofItems} production card share channel timestamp(s).`
        : `record ${recordShareChannelIds.size}/${records.length}, mode ${modeShareChannelIds.size}/${modeRuns.length} share channel timestamp(s).`,
      "Open X intent or native share for every production record and mode card before final submission.",
    ),
  ];
  const sharingPassed = count(shareChecks);

  const remoteLeaderboardRows = leaderboardEntries.filter((entry) => entry.source !== "local").length;
  const leaderboardScopes = new Set(leaderboardEntries.filter((entry) => entry.source !== "local").map((entry) => entry.source));
  const requiredLeaderboardScopes: LeaderboardScope[] = ["global", "friend", "season"];
  const leaderboardEvidenceByScope = new Map(leaderboardScopeEvidence.map((item) => [item.scope, item]));
  const leaderboardScopePassed = (scope: LeaderboardScope) => {
    return hasLeaderboardScopeEvidence(leaderboardEvidenceByScope.get(scope));
  };
  const leaderboardScopeQueriesPassed = requiredLeaderboardScopes.every((scope) => {
    return leaderboardScopePassed(scope);
  });
  const globalLeaderboardPassed = leaderboardScopePassed("global");
  const friendLeaderboardPassed = leaderboardScopePassed("friend");
  const seasonLeaderboardPassed = leaderboardScopePassed("season");
  const leaderboardChecks = [
    check("supabase-leaderboard-env", "Supabase leaderboard backend configured", cloudState.configured, cloudState.configured ? "Supabase REST is configured." : "Supabase env missing.", "bun run doctor:supabase"),
    check("remote-rows", "Remote leaderboard rows loaded", remoteLeaderboardRows > 0, `${remoteLeaderboardRows} remote row(s).`),
    check("global-current-user", "Global scope contains ranked current user", Boolean(globalLeaderboardPassed), leaderboardEvidenceByScope.get("global")?.filter ?? "global xp desc", "bun run doctor:supabase"),
    check("friend-current-user", "Friend scope contains ranked current user", Boolean(friendLeaderboardPassed), leaderboardEvidenceByScope.get("friend")?.filter ?? "friend_code filter", "bun run doctor:supabase"),
    check("season-current-user", "Season scope contains ranked current user", Boolean(seasonLeaderboardPassed), leaderboardEvidenceByScope.get("season")?.filter ?? "season_key filter", "bun run doctor:supabase"),
  ];
  const leaderboardPassed = count(leaderboardChecks);

  const requiredModeRuns = requiredModeIds
    .map((modeId) => modeRuns.find((run) => run.modeId === modeId && sealedModeRun(run)))
    .filter(Boolean) as GameModeRun[];
  const sealedModeIds = new Set(requiredModeRuns.map((run) => run.modeId));
  const modeContentIds = new Set(verification?.modeRunContentIds ?? []);
  const publicModeProofIds = new Set(verification?.publicProofIds ?? []);
  const allModesHaveCloudContent = Boolean(
    verification &&
      requiredModeRuns.length === requiredModeIds.length &&
      requiredModeRuns.every((run) => modeContentIds.has(run.id)),
  );
  const allModesHavePublicProofs = Boolean(
    verification &&
      requiredModeRuns.length === requiredModeIds.length &&
      requiredModeRuns.every((run) => publicModeProofIds.has(`mode:${run.id}`)),
  );
  const allModesHaveShareCards =
    requiredModeRuns.length === requiredModeIds.length &&
    requiredModeRuns.every((run) => modeShareIds.has(run.id));
  const modeChecks = [
    check("mode-catalog", "Four tournament modes registered", gameModes.length >= 4, `${gameModes.length} mode(s) registered.`),
    check("mode-lanes-playable", "Required mode lanes playable", requiredModeIds.every((modeId) => gameModes.some((mode) => mode.id === modeId && mode.status === "playable")), requiredModeIds.join(", ")),
    check("mode-runs-sealed", "Every required mode has sealed run", requiredModeIds.every((modeId) => sealedModeIds.has(modeId)), `${sealedModeIds.size}/${requiredModeIds.length} sealed real Filecoin mode type(s).`),
    check("mode-cloud-readback", "Mode content read back from cloud", allModesHaveCloudContent, verification ? `${verification.modeRunContentIds?.length ?? 0}/${requiredModeIds.length} mode content id(s).` : "Cloud verification missing.", "bun run doctor:supabase"),
    check("mode-public-proofs", "Mode public proof links read back", allModesHavePublicProofs, verification ? `${verification.publicProofIds?.filter((id) => id.startsWith("mode:")).length ?? 0}/${requiredModeIds.length} public mode proof id(s).` : "Public proof verification missing.", "bun run doctor:sharing"),
    check("mode-share-cards", "Mode production share cards", allModesHaveShareCards, `${modeShareIds.size}/${requiredModeIds.length} mode share card(s).`, "bun run doctor:sharing"),
  ];
  const modePassed = count(modeChecks);

  const testCoverage = summarizeAcceptanceCoverage(ACCEPTANCE_TEST_SUITES);
  const testRuns = summarizeAcceptanceRunEvidence(acceptanceEvidence, ACCEPTANCE_TEST_SUITES);
  const testPassed = testCoverage.covered + testRuns.passed;
  const testTotal = testCoverage.total + testRuns.total;
  const testChecks = [
    ...testCoverage.missing.map((key) =>
      check(`coverage-${key}`, `${key} coverage`, false, "No suite declares this required acceptance coverage.", "bun run test"),
    ),
    ...REQUIRED_ACCEPTANCE_COVERAGE.map((key) =>
      check(`coverage-${key}`, `${key} coverage`, !testCoverage.missing.includes(key), "Acceptance manifest coverage."),
    ).filter((item) => item.passed),
    ...ACCEPTANCE_TEST_SUITES.map((suite) => {
      const failed = testRuns.failedSuiteIds.includes(suite.id);
      const missing = testRuns.missingSuiteIds.includes(suite.id);
      const mismatch = testRuns.commandMismatches.includes(suite.id);
      const passed = testRuns.passedSuiteIds.includes(suite.id) && !testRuns.manifestHashMismatch && !testRuns.evidenceStale;
      return check(
        `suite-${suite.id}`,
        suite.label,
        passed,
        failed
          ? "Suite failed in the latest acceptance evidence."
          : missing
            ? "Suite run evidence missing."
            : mismatch
              ? "Recorded command does not match the manifest."
              : testRuns.manifestHashMismatch
                ? "Acceptance manifest hash changed."
                : testRuns.evidenceStale
                  ? "Acceptance run evidence is older than 7 days."
                  : suite.proves,
        suite.command,
      );
    }),
  ];
  const externalEvidence = summarizeProductionEvidence(productionEvidence);
  const externalTotal = externalEvidence.loaded ? Math.max(1, externalEvidence.requiredTotal) : 1;
  const externalPassed = externalEvidence.loaded ? externalEvidence.requiredPassed : 0;
  const externalOpen = externalEvidence.openRequired.slice(0, 3).map((check) => check.id).join(", ");
  const externalChecks = externalEvidence.loaded
    ? [
        ...externalEvidence.openRequired.map((item) =>
          check(`external-${item.id}`, item.label, false, item.detail, item.action ?? "bun run verify:production"),
        ),
        ...productionEvidence!.checks
          .filter((item) => item.required && productionCheckPassed(item))
          .map((item) => check(`external-${item.id}`, item.label, true, item.detail, item.action ?? "bun run verify:production")),
      ]
    : [check("external-evidence-file", "Production evidence file loaded", false, "production-evidence.json not loaded.", "bun run verify:production")];

  return [
    {
      key: "account",
      label: "真实账号系统",
      level: levelFrom(accountPassed, accountChecks.length),
      passed: accountPassed,
      total: accountChecks.length,
      evidence: cloudProfile
        ? `${profile.email} · ${verification ? `${verification.message} · fingerprints record ${verification.recordContentIds?.length ?? 0}/${records.length}, mode ${verification.modeRunContentIds?.length ?? 0}/${modeRuns.length}, share ${verification.shareArtifactContentIds?.length ?? 0}/${shareEvidence.length} · share images ${shareImagesVerified ? "read back" : "pending"}` : `${cloudState.status} · ${cloudItems} cloud item candidates`}`
        : cloudState.configured
          ? "Supabase configured, but sign-in/sync evidence is still missing"
          : "Supabase env missing; app is using local profile",
      nextAction: accountPassed === accountChecks.length ? "Cloud account acceptance is satisfied." : "Sign in, sync history, then verify Supabase read-back from another device.",
      checks: accountChecks,
    },
    {
      key: "data",
      label: "真实实时比赛数据",
      level: levelFrom(dataPassed, dataChecks.length),
      passed: dataPassed,
      total: dataChecks.length,
      evidence: providerHealth
        ? `${providerHealth.detail} · missing ${providerHealth.missingSignals.join(", ") || "none"}`
        : `${activeRoute?.label ?? "No route"} · schedule ${schedule?.status ?? "missing"} · score ${score?.status ?? "missing"} · odds ${odds?.status ?? "missing"}`,
      nextAction:
        dataPassed === dataChecks.length
          ? "Live schedule, score and enrichment feeds are all configured."
          : providerHealth?.nextAction ?? "Configure API-Football or equivalent enrichment for lineups, injuries and odds.",
      checks: dataChecks,
    },
    {
      key: "filecoin",
      label: "真实 Filecoin 自动封存",
      level: levelFrom(filecoinPassed, filecoinChecks.length),
      passed: filecoinPassed,
      total: filecoinChecks.length,
      evidence: `${realRecordProofs} real proof record${realRecordProofs === 1 ? "" : "s"} · ${realModeProofs} real proof mode${realModeProofs === 1 ? "" : "s"} · endpoint ${sealEndpointConfigured ? "configured" : "missing"} · production backend ${anyProductionBackend ? "ready" : "missing"}`,
      nextAction:
        filecoinPassed === filecoinChecks.length
          ? "One-click seal has production backend, verified CIDs, matching payload hashes and registry read-back for records and mode proofs."
          : "Deploy seal API with funded Synapse key, token, persistent proof store, then verify one real record capsule and one real mode proof.",
      checks: filecoinChecks,
    },
    {
      key: "sharing",
      label: "公开分享卡片",
      level: levelFrom(sharingPassed, shareChecks.length),
      passed: sharingPassed,
      total: shareChecks.length,
      evidence: `${recordShareIds.size}/${records.length} production HTTPS record card${records.length === 1 ? "" : "s"} · ${modeShareIds.size}/${modeRuns.length} production HTTPS mode card${modeRuns.length === 1 ? "" : "s"} · manifests ${shareArtifactsVerified ? "read back" : "local only"} · images ${publicShareImagesVerified ? "read back" : "unverified"} · public links ${publicLinksVerified ? "read back" : "unverified"} · share channel record ${recordShareChannelIds.size}/${records.length}, mode ${modeShareChannelIds.size}/${modeRuns.length}`,
      nextAction:
        sharingPassed === shareChecks.length
          ? "Proof links, mode links and share images are ready for public posting."
          : "Generate publishable proof and mode cards with deployed HTTPS proof/image URLs, sync card manifests, verify public links and public image URLs by cloud read-back, then open X intent/native share.",
      checks: shareChecks,
    },
    {
      key: "leaderboard",
      label: "排行榜后端",
      level: levelFrom(leaderboardPassed, leaderboardChecks.length),
      passed: leaderboardPassed,
      total: leaderboardChecks.length,
      evidence:
        leaderboardScopeEvidence.length > 0
          ? requiredLeaderboardScopes
              .map((scope) => {
                const evidence = leaderboardEvidenceByScope.get(scope);
                const userState = evidence?.currentUserPresent
                  ? hasLeaderboardScopeEvidence(evidence)
                    ? `rank-${evidence.currentUserRank}/xp-${evidence.currentUserXp}`
                    : "missing-rank-or-stats"
                  : "missing-user";
                return `${scope}:${evidence ? `${evidence.status}/${evidence.rows}/${userState}` : "unchecked"}`;
              })
              .join(" · ")
          : `${remoteLeaderboardRows} remote row${remoteLeaderboardRows === 1 ? "" : "s"} · scopes ${[...leaderboardScopes].join(", ") || "none"}`,
      nextAction:
        leaderboardPassed === leaderboardChecks.length && leaderboardScopeQueriesPassed
          ? "Global, friend and season scopes list the current user from Supabase with positive ranks."
          : "Load Supabase leaderboard rows for global, friend and season scopes and confirm the current user has a positive rank in each scope.",
      checks: leaderboardChecks,
    },
    {
      key: "modes",
      label: "完整比赛模式",
      level: levelFrom(modePassed, modeChecks.length),
      passed: modePassed,
      total: modeChecks.length,
      evidence: `${sealedModeIds.size}/${requiredModeIds.length} real Filecoin mode type${requiredModeIds.length === 1 ? "" : "s"} · cloud ${allModesHaveCloudContent ? "read back" : "pending"} · public ${allModesHavePublicProofs ? "read back" : "pending"} · cards ${allModesHaveShareCards ? "ready" : "pending"}`,
      nextAction:
        modePassed === modeChecks.length
          ? "Bracket, parlay, Agent vs Human and upset proofs have synced public mode cards."
          : "Create one sealed run for every mode, auto seal each mode proof to real Filecoin, sync mode runs, verify anonymous mode proof links, then generate production HTTPS mode cards.",
      checks: modeChecks,
    },
    {
      key: "tests",
      label: "自动化测试",
      level: levelFrom(testPassed, testTotal, testRuns.complete),
      passed: testPassed,
      total: testTotal,
      evidence: `${ACCEPTANCE_TEST_SUITES.length} suites · coverage ${testCoverage.covered}/${testCoverage.total} · run evidence ${testRuns.passed}/${testRuns.total}${testRuns.generatedAt ? ` · ${testRuns.generatedAt}` : ""}${testRuns.manifestHashMismatch ? " · manifest stale" : ""}${testRuns.evidenceStale ? " · evidence too old" : ""}`,
      nextAction:
        testCoverage.complete && testRuns.complete
          ? "Automated acceptance coverage and run evidence are complete."
          : testRuns.manifestHashMismatch
            ? "Run bun run verify:acceptance again because the acceptance suite manifest changed."
          : testRuns.evidenceStale
            ? "Run bun run verify:acceptance again because the acceptance evidence is older than 7 days."
          : testCoverage.complete
            ? "Run bun run verify:acceptance before final submission so the app can load acceptance-evidence.json."
            : `Add coverage for ${testCoverage.missing.join(", ")}.`,
      checks: testChecks,
    },
    {
      key: "external",
      label: "外部生产证据",
      level: levelFrom(externalPassed, externalTotal),
      passed: externalPassed,
      total: externalTotal,
      evidence: externalEvidence.loaded
        ? `${externalEvidence.requiredPassed}/${externalEvidence.requiredTotal} required deployment checks · ${externalEvidence.generatedAt}`
        : "production-evidence.json not loaded",
      nextAction: externalEvidence.complete
        ? "Deployment evidence is complete."
        : externalEvidence.loaded
          ? `Resolve production evidence gaps${externalOpen ? `: ${externalOpen}` : ""}.`
          : "Run bun run verify:production after deploying and syncing production artifacts.",
      checks: externalChecks,
    },
  ];
};

export const summarizeProductionReadiness = (items: ProductionReadinessItem[]) => {
  const verified = items.filter((item) => item.level === "verified").length;
  const ready = items.filter((item) => item.level === "ready").length;
  const blocked = items.filter((item) => item.level === "blocked").length;
  const totalPassed = items.reduce((sum, item) => sum + item.passed, 0);
  const totalChecks = items.reduce((sum, item) => sum + item.total, 0);
  return {
    verified,
    ready,
    blocked,
    total: items.length,
    score: totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0,
  };
};
