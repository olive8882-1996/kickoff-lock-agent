import { ACCEPTANCE_TEST_SUITES, summarizeAcceptanceCoverage } from "./acceptance";
import type {
  CloudSyncState,
  GameMode,
  GameModeRun,
  LeaderboardEntry,
  MemoryRecord,
  ProviderReadinessItem,
  ProviderRouteAuditItem,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";

export type ProductionReadinessLevel = "verified" | "ready" | "partial" | "blocked";

export type ProductionReadinessItem = {
  key: "account" | "data" | "filecoin" | "sharing" | "leaderboard" | "modes" | "tests";
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
  sealEndpointConfigured: boolean;
  shareImageReady: boolean;
  shareEvidence?: ShareArtifactEvidence[];
};

const levelFrom = (passed: number, total: number, canBeVerified = true): ProductionReadinessLevel => {
  if (passed <= 0) return "blocked";
  if (passed >= total) return canBeVerified ? "verified" : "ready";
  if (passed / total >= 0.65) return "ready";
  return "partial";
};

const count = (checks: boolean[]) => checks.filter(Boolean).length;

const hasRealVerifiedProof = (record: MemoryRecord) =>
  record.capsule.filecoinProof.mode === "real" &&
  ["retrievable", "verified"].includes(record.capsule.filecoinProof.proofStatus);

const hasVerifiedSealJob = (record: MemoryRecord) =>
  record.sealJob?.status === "verified" &&
  record.sealJob.proof?.mode === "real" &&
  Boolean(record.sealJob.verifyUrl || record.sealJob.proofUrl);

const hasPayloadHashMatch = (record: MemoryRecord) =>
  Boolean(
    record.sealJob?.uploadPayloadHash &&
      record.sealJob.proof?.payloadHash &&
      record.sealJob.uploadPayloadHash === record.sealJob.proof.payloadHash,
  );

const liveOrConfigured = (item?: ProviderReadinessItem) =>
  item?.status === "live" || item?.status === "configured";

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
}: ProductionReadinessInput): ProductionReadinessItem[] => {
  const cloudProfile = profile.cloudMode === "supabase" && !profile.id.startsWith("local-");
  const cloudItems = records.length + modeRuns.length;
  const verification = cloudState.verification;
  const readbackVerified = Boolean(
    verification &&
      verification.profile &&
      verification.records >= records.length &&
      verification.modeRuns >= modeRuns.length &&
      verification.publicProofs >= cloudItems &&
      verification.publicProfile,
  );
  const accountChecks = [
    cloudState.configured,
    cloudState.authenticated,
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
    Boolean(activeRoute && !["seed", "manual"].includes(activeRoute.key)),
    liveOrConfigured(schedule),
    liveOrConfigured(score),
    liveOrConfigured(rankings),
    liveOrConfigured(lineups),
    liveOrConfigured(injuries),
    liveOrConfigured(odds),
  ];
  const dataPassed = count(dataChecks);

  const anyBackendReady = records.some((record) => record.sealJob?.backendHealth?.ok);
  const anyProductionBackend = records.some(
    (record) => record.sealJob?.backendHealth?.ok && !record.sealJob.backendHealth.mockMode && record.sealJob.backendHealth.hasPrivateKey,
  );
  const filecoinChecks = [
    sealEndpointConfigured,
    anyBackendReady,
    anyProductionBackend,
    records.some(hasRealVerifiedProof),
    records.some(hasVerifiedSealJob),
    records.some(hasPayloadHashMatch),
  ];
  const filecoinPassed = count(filecoinChecks);

  const publicProofItems = records.length + modeRuns.length;
  const recordShareIds = new Set(
    shareEvidence.filter((item) => item.kind === "record" && item.imageGenerated).map((item) => item.id),
  );
  const modeShareIds = new Set(
    shareEvidence.filter((item) => item.kind === "mode" && item.imageGenerated).map((item) => item.id),
  );
  const shareChannelReady = shareEvidence.some((item) => item.xIntentOpenedAt || item.nativeShareOpenedAt);
  const publicLinksVerified = Boolean(
    verification &&
      publicProofItems > 0 &&
      verification.publicProofs >= publicProofItems &&
      verification.publicProfile,
  );
  const shareChecks = [
    publicProofItems > 0,
    records.length > 0 && recordShareIds.size > 0,
    modeRuns.length > 0 && modeShareIds.size > 0,
    shareImageReady || recordShareIds.size + modeShareIds.size > 0,
    publicLinksVerified,
    shareChannelReady,
  ];
  const sharingPassed = count(shareChecks);

  const remoteLeaderboardRows = leaderboardEntries.filter((entry) => entry.source !== "local").length;
  const leaderboardScopes = new Set(leaderboardEntries.filter((entry) => entry.source !== "local").map((entry) => entry.source));
  const leaderboardChecks = [
    cloudState.configured,
    remoteLeaderboardRows > 0,
    leaderboardScopes.has("global"),
    leaderboardScopes.has("friend"),
    leaderboardScopes.has("season"),
  ];
  const leaderboardPassed = count(leaderboardChecks);

  const modeIds = new Set(modeRuns.map((run) => run.modeId));
  const modeChecks = [
    gameModes.length >= 4,
    gameModes.every((mode) => mode.status === "playable"),
    modeIds.has("bracket"),
    modeIds.has("parlay"),
    modeIds.has("agent-vs-human"),
    modeIds.has("upset"),
  ];
  const modePassed = count(modeChecks);

  const testCoverage = summarizeAcceptanceCoverage(ACCEPTANCE_TEST_SUITES);

  return [
    {
      key: "account",
      label: "真实账号系统",
      level: levelFrom(accountPassed, accountChecks.length),
      passed: accountPassed,
      total: accountChecks.length,
      evidence: cloudProfile
        ? `${profile.email} · ${verification ? verification.message : `${cloudState.status} · ${cloudItems} cloud item candidates`}`
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
      evidence: `${activeRoute?.label ?? "No route"} · schedule ${schedule?.status ?? "missing"} · score ${score?.status ?? "missing"} · odds ${odds?.status ?? "missing"}`,
      nextAction:
        dataPassed === dataChecks.length
          ? "Live schedule, score and enrichment feeds are all configured."
          : "Configure API-Football or equivalent enrichment for lineups, injuries and odds.",
    },
    {
      key: "filecoin",
      label: "真实 Filecoin 自动封存",
      level: levelFrom(filecoinPassed, filecoinChecks.length),
      passed: filecoinPassed,
      total: filecoinChecks.length,
      evidence: `${records.filter(hasRealVerifiedProof).length} real proof record${records.filter(hasRealVerifiedProof).length === 1 ? "" : "s"} · endpoint ${sealEndpointConfigured ? "configured" : "missing"}`,
      nextAction:
        filecoinPassed === filecoinChecks.length
          ? "One-click seal has production backend, verified CID and matching payload hash."
          : "Deploy seal API with funded Synapse key, token, persistent proof store and verify one real capsule.",
    },
    {
      key: "sharing",
      label: "公开分享卡片",
      level: levelFrom(sharingPassed, shareChecks.length),
      passed: sharingPassed,
      total: shareChecks.length,
      evidence: `${recordShareIds.size}/${records.length} record card${records.length === 1 ? "" : "s"} · ${modeShareIds.size}/${modeRuns.length} mode card${modeRuns.length === 1 ? "" : "s"} · public links ${publicLinksVerified ? "read back" : "unverified"} · share channel ${shareChannelReady ? "opened" : "not exercised"}`,
      nextAction:
        sharingPassed === shareChecks.length
          ? "Proof links, mode links and share images are ready for public posting."
          : "Generate one proof card and one mode card, verify public links by cloud read-back, then open X intent/native share.",
    },
    {
      key: "leaderboard",
      label: "排行榜后端",
      level: levelFrom(leaderboardPassed, leaderboardChecks.length),
      passed: leaderboardPassed,
      total: leaderboardChecks.length,
      evidence: `${remoteLeaderboardRows} remote row${remoteLeaderboardRows === 1 ? "" : "s"} · scopes ${[...leaderboardScopes].join(", ") || "none"}`,
      nextAction:
        leaderboardPassed === leaderboardChecks.length
          ? "Global, friend and season scopes have remote evidence."
          : "Load Supabase leaderboard rows for global, friend and season scopes instead of local fallback only.",
    },
    {
      key: "modes",
      label: "完整比赛模式",
      level: levelFrom(modePassed, modeChecks.length),
      passed: modePassed,
      total: modeChecks.length,
      evidence: `${gameModes.length} playable modes · ${modeRuns.length} sealed mode proof run${modeRuns.length === 1 ? "" : "s"}`,
      nextAction:
        modePassed === modeChecks.length
          ? "Bracket, parlay, Agent vs Human and upset proofs all have sealed runs."
          : "Create and verify one proof run for every playable mode.",
    },
    {
      key: "tests",
      label: "自动化测试",
      level: levelFrom(testCoverage.covered, testCoverage.total, false),
      passed: testCoverage.covered,
      total: testCoverage.total,
      evidence: `${ACCEPTANCE_TEST_SUITES.length} suites · coverage ${testCoverage.covered}/${testCoverage.total}`,
      nextAction: testCoverage.complete
        ? "Run bun run test, bun run test:e2e and bun run test:e2e:seal before final submission."
        : `Add coverage for ${testCoverage.missing.join(", ")}.`,
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
