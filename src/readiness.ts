import {
  ACCEPTANCE_TEST_SUITES,
  summarizeAcceptanceCoverage,
  summarizeAcceptanceRunEvidence,
  type AcceptanceEvidencePacket,
} from "./acceptance";
import { isCloudReadbackComplete } from "./cloud";
import { sealBackendProductionReady } from "./filecoinSeal";
import { summarizeProductionEvidence, type ProductionEvidencePacket } from "./productionEvidence";
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

const count = (checks: boolean[]) => checks.filter(Boolean).length;

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
  return Boolean(endpoint && endpoint.attempted > 0 && endpoint.fulfilled > 0 && endpoint.live > 0);
};

const productionDataReady = (item: ProviderReadinessItem | undefined, providerHealth: ProviderHealthSnapshot | undefined) => {
  if (!item) return false;
  if (!productionEnrichmentKeys.has(item.key)) return liveOrConfigured(item);
  return item.status === "live" && hasProductionEnrichmentReadback(providerHealth, item.key);
};

const requiredModeIds: GameMode["id"][] = ["bracket", "parlay", "agent-vs-human", "upset"];

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
  const readbackVerified = isCloudReadbackComplete(verification, records.length, modeRuns.length, shareEvidence.length);
  const accountChecks = [
    cloudState.configured,
    cloudState.authenticated,
    backendReady,
    cloudProfile,
    cloudItems > 0,
    readbackVerified,
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
    Boolean(activeRoute && !["seed", "manual"].includes(activeRoute.key) && providerHealth?.fresh !== false),
    Boolean(providerHealth?.fresh),
    Boolean(providerHealth?.responseVerified),
    liveOrConfigured(schedule),
    liveOrConfigured(score),
    liveOrConfigured(rankings),
    productionDataReady(lineups, providerHealth),
    productionDataReady(injuries, providerHealth),
    productionDataReady(odds, providerHealth),
  ];
  const dataPassed = count(dataChecks);

  const sealedArtifacts = [...records, ...modeRuns];
  const realRecordProofs = records.filter(hasRealVerifiedRecordProof).length;
  const realModeProofs = modeRuns.filter(hasRealVerifiedModeProof).length;
  const anyBackendReady = sealedArtifacts.some((artifact) => artifact.sealJob?.backendHealth?.ok);
  const anyProductionBackend = sealedArtifacts.some((artifact) => sealBackendProductionReady(artifact.sealJob?.backendHealth));
  const filecoinChecks = [
    sealEndpointConfigured,
    anyBackendReady,
    anyProductionBackend,
    records.some(hasRealVerifiedRecordProof),
    modeRuns.some(hasRealVerifiedModeProof),
    records.some(hasVerifiedSealJob),
    modeRuns.some(hasVerifiedSealJob),
    records.some(hasPayloadHashMatch),
    modeRuns.some(hasPayloadHashMatch),
    records.some(hasProofRegistryReadback),
    modeRuns.some(hasProofRegistryReadback),
  ];
  const filecoinPassed = count(filecoinChecks);

  const publicProofItems = records.length + modeRuns.length;
  const productionShareEvidence = shareEvidence.filter(isProductionShareArtifact);
  const recordShareIds = new Set(productionShareEvidence.filter((item) => item.kind === "record").map((item) => item.id));
  const modeShareIds = new Set(productionShareEvidence.filter((item) => item.kind === "mode").map((item) => item.id));
  const shareChannelReady = productionShareEvidence.some((item) => item.xIntentOpenedAt || item.nativeShareOpenedAt);
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
    publicProofItems > 0,
    records.length > 0 && records.every((record) => recordShareIds.has(record.capsule.id)),
    modeRuns.length > 0 && modeRuns.every((run) => modeShareIds.has(run.id)),
    shareImageReady || recordShareIds.size + modeShareIds.size > 0,
    publicLinksVerified,
    shareArtifactsVerified,
    publicShareImagesVerified,
    shareChannelReady,
  ];
  const sharingPassed = count(shareChecks);

  const remoteLeaderboardRows = leaderboardEntries.filter((entry) => entry.source !== "local").length;
  const leaderboardScopes = new Set(leaderboardEntries.filter((entry) => entry.source !== "local").map((entry) => entry.source));
  const requiredLeaderboardScopes: LeaderboardScope[] = ["global", "friend", "season"];
  const leaderboardEvidenceByScope = new Map(leaderboardScopeEvidence.map((item) => [item.scope, item]));
  const leaderboardScopeQueriesPassed = requiredLeaderboardScopes.every((scope) => {
    const evidence = leaderboardEvidenceByScope.get(scope);
    return evidence
      ? evidence.status === "loaded" && evidence.rows > 0 && evidence.currentUserPresent
      : leaderboardEntries.some((entry) => entry.source === scope && entry.id === profile.id);
  });
  const leaderboardChecks = [
    cloudState.configured,
    remoteLeaderboardRows > 0,
    leaderboardEvidenceByScope.get("global")
      ? leaderboardEvidenceByScope.get("global")?.status === "loaded" && (leaderboardEvidenceByScope.get("global")?.rows ?? 0) > 0 && Boolean(leaderboardEvidenceByScope.get("global")?.currentUserPresent)
      : leaderboardEntries.some((entry) => entry.source === "global" && entry.id === profile.id),
    leaderboardEvidenceByScope.get("friend")
      ? leaderboardEvidenceByScope.get("friend")?.status === "loaded" && (leaderboardEvidenceByScope.get("friend")?.rows ?? 0) > 0 && Boolean(leaderboardEvidenceByScope.get("friend")?.currentUserPresent)
      : leaderboardEntries.some((entry) => entry.source === "friend" && entry.id === profile.id),
    leaderboardEvidenceByScope.get("season")
      ? leaderboardEvidenceByScope.get("season")?.status === "loaded" && (leaderboardEvidenceByScope.get("season")?.rows ?? 0) > 0 && Boolean(leaderboardEvidenceByScope.get("season")?.currentUserPresent)
      : leaderboardEntries.some((entry) => entry.source === "season" && entry.id === profile.id),
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
    gameModes.length >= 4,
    requiredModeIds.every((modeId) => gameModes.some((mode) => mode.id === modeId && mode.status === "playable")),
    requiredModeIds.every((modeId) => sealedModeIds.has(modeId)),
    allModesHaveCloudContent,
    allModesHavePublicProofs,
    allModesHaveShareCards,
  ];
  const modePassed = count(modeChecks);

  const testCoverage = summarizeAcceptanceCoverage(ACCEPTANCE_TEST_SUITES);
  const testRuns = summarizeAcceptanceRunEvidence(acceptanceEvidence, ACCEPTANCE_TEST_SUITES);
  const testPassed = testCoverage.covered + testRuns.passed;
  const testTotal = testCoverage.total + testRuns.total;
  const externalEvidence = summarizeProductionEvidence(productionEvidence);
  const externalTotal = externalEvidence.loaded ? Math.max(1, externalEvidence.requiredTotal) : 1;
  const externalPassed = externalEvidence.loaded ? externalEvidence.requiredPassed : 0;
  const externalOpen = externalEvidence.openRequired.slice(0, 3).map((check) => check.id).join(", ");

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
    },
    {
      key: "sharing",
      label: "公开分享卡片",
      level: levelFrom(sharingPassed, shareChecks.length),
      passed: sharingPassed,
      total: shareChecks.length,
      evidence: `${recordShareIds.size}/${records.length} production HTTPS record card${records.length === 1 ? "" : "s"} · ${modeShareIds.size}/${modeRuns.length} production HTTPS mode card${modeRuns.length === 1 ? "" : "s"} · manifests ${shareArtifactsVerified ? "read back" : "local only"} · images ${publicShareImagesVerified ? "read back" : "unverified"} · public links ${publicLinksVerified ? "read back" : "unverified"} · share channel ${shareChannelReady ? "opened" : "not exercised"}`,
      nextAction:
        sharingPassed === shareChecks.length
          ? "Proof links, mode links and share images are ready for public posting."
          : "Generate publishable proof and mode cards with deployed HTTPS proof/image URLs, sync card manifests, verify public links and public image URLs by cloud read-back, then open X intent/native share.",
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
                return `${scope}:${evidence ? `${evidence.status}/${evidence.rows}/${evidence.currentUserPresent ? "user" : "missing-user"}` : "unchecked"}`;
              })
              .join(" · ")
          : `${remoteLeaderboardRows} remote row${remoteLeaderboardRows === 1 ? "" : "s"} · scopes ${[...leaderboardScopes].join(", ") || "none"}`,
      nextAction:
        leaderboardPassed === leaderboardChecks.length && leaderboardScopeQueriesPassed
          ? "Global, friend and season scopes list the current user from Supabase."
          : "Load Supabase leaderboard rows for global, friend and season scopes and confirm the current user appears in each scope.",
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
