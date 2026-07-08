import { buildDataCoverage, sourceLabel } from "./providers";
import type {
  DataCoverageItem,
  DataSource,
  Match,
  ProviderHealthSnapshot,
  ProviderResponseAudit,
  ProviderRouteAuditItem,
} from "./types";

export type DataContinuityCheck = {
  key: "primary-free-feed" | "scoreboard-backup" | "seed-continuity" | "schedule-coverage" | "score-coverage" | "freshness";
  label: string;
  status: "passed" | "pending" | "failed";
  detail: string;
  action: string;
};

export type DataContinuityEvidencePacket = {
  continuityReady: boolean;
  source: string;
  activeRoute: string;
  externalMatches: number;
  seedMatches: number;
  scheduleReady: number;
  scoreReady: number;
  totalMatches: number;
  checks: DataContinuityCheck[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const freeExternalSources = new Set<DataSource>(["thesportsdb", "openfootball", "espn", "worldcup26"]);
const preferredFreeSources = new Set<DataSource>(["thesportsdb", "openfootball", "espn"]);

const statusFor = (passed: boolean, failed = false): DataContinuityCheck["status"] =>
  passed ? "passed" : failed ? "failed" : "pending";

const routeFor = (routeAudit: ProviderRouteAuditItem[], source: DataSource) =>
  routeAudit.find((route) => route.key === source);

const routeUsable = (route?: ProviderRouteAuditItem) =>
  Boolean(route && route.configured && !["failed", "needs-config"].includes(route.status));

const coverageStatusAtLeast = (match: Match, key: DataCoverageItem["key"], minimum: DataCoverageItem["status"][]) => {
  const coverage = match.insights?.dataCoverage ?? buildDataCoverage(match);
  return coverage.some((item) => item.key === key && minimum.includes(item.status));
};

const verifiedResponse = (responseAudit?: ProviderResponseAudit) =>
  Boolean(responseAudit && responseAudit.source !== "seed" && responseAudit.status === "ok" && responseAudit.rowCount > 0);

export const buildDataContinuityEvidencePacket = ({
  matches,
  routeAudit,
  health,
  evidence = [],
  responseAudit,
}: {
  matches: Match[];
  routeAudit: ProviderRouteAuditItem[];
  health: ProviderHealthSnapshot;
  evidence?: string[];
  responseAudit?: ProviderResponseAudit;
}): DataContinuityEvidencePacket => {
  const activeRoute = routeAudit.find((route) => route.status === "active" || route.status === "fallback");
  const activeSource = activeRoute?.key;
  const activeFreeExternal = Boolean(activeSource && freeExternalSources.has(activeSource) && activeRoute?.status === "active");
  const primaryFreeFeedReady = Boolean(
    activeSource &&
      preferredFreeSources.has(activeSource) &&
      activeRoute?.status === "active" &&
      verifiedResponse(responseAudit),
  );
  const espnRoute = routeFor(routeAudit, "espn");
  const openFootballRoute = routeFor(routeAudit, "openfootball");
  const theSportsDbRoute = routeFor(routeAudit, "thesportsdb");
  const seedRoute = routeFor(routeAudit, "seed");
  const backupReady = routeUsable(espnRoute) || routeUsable(openFootballRoute) || routeUsable(theSportsDbRoute);
  const seedEvidence = evidence.some((item) => /seed .*merged|seed matches loaded|offline seed/i.test(item));
  const seedReady = routeUsable(seedRoute) && seedEvidence;
  const externalMatches = matches.filter((match) => match.dataSource !== "seed" && match.dataSource !== "manual").length;
  const seedMatches = matches.filter((match) => match.dataSource === "seed").length;
  const scheduleReady = matches.filter((match) =>
    coverageStatusAtLeast(match, "schedule", ["live", "configured", "fallback"]),
  ).length;
  const scoreReady = matches.filter((match) =>
    coverageStatusAtLeast(match, "score", ["live", "configured", "fallback"]),
  ).length;
  const scheduleCoverageReady = matches.length > 0 && scheduleReady === matches.length && externalMatches > 0;
  const scoreCoverageReady = scoreReady > 0 && activeFreeExternal;
  const freshReady = health.fresh && health.responseVerified && verifiedResponse(responseAudit);

  const checks: DataContinuityCheck[] = [
    {
      key: "primary-free-feed",
      label: "Primary free feed",
      status: statusFor(primaryFreeFeedReady, Boolean(activeRoute && activeRoute.status === "fallback")),
      detail: primaryFreeFeedReady
        ? `${sourceLabel(activeSource as DataSource)} returned ${responseAudit?.rowCount ?? 0} rows`
        : activeRoute
          ? `${activeRoute.label} is ${activeRoute.status}`
          : "no provider route selected",
      action: "Keep TheSportsDB, openfootball or ESPN returning World Cup rows before relying on seed continuity.",
    },
    {
      key: "scoreboard-backup",
      label: "Scoreboard backup",
      status: statusFor(backupReady),
      detail: `TheSportsDB ${theSportsDbRoute?.status ?? "unknown"} · openfootball ${openFootballRoute?.status ?? "unknown"} · ESPN ${espnRoute?.status ?? "unknown"}`,
      action: "Keep openfootball and ESPN available as free fallback routes when TheSportsDB is empty or unavailable.",
    },
    {
      key: "seed-continuity",
      label: "Seed continuity",
      status: statusFor(seedReady),
      detail: seedReady ? `${seedMatches} seed rows supplement the live route` : "seed fallback evidence missing",
      action: "Merge seed upcoming matches only as schedule continuity, not as realtime evidence.",
    },
    {
      key: "schedule-coverage",
      label: "Schedule coverage",
      status: statusFor(scheduleCoverageReady, matches.length === 0),
      detail: `${scheduleReady}/${matches.length} scheduled rows · ${externalMatches} external rows`,
      action: "Return at least one external schedule row and keep every board row scheduled.",
    },
    {
      key: "score-coverage",
      label: "Score coverage",
      status: statusFor(scoreCoverageReady),
      detail: scoreReady > 0 ? `${scoreReady}/${matches.length} rows have score read-back` : "all current fixtures are pending score rows",
      action: "Verify live/final score rows from TheSportsDB or ESPN before automatic reveal.",
    },
    {
      key: "freshness",
      label: "Fresh response",
      status: statusFor(freshReady),
      detail: `${health.fresh ? "fresh" : "stale/pending"} · ${health.responseVerified ? "response verified" : "response unverified"}`,
      action: "Refresh the match board until the active free route response is verified and fresh.",
    },
  ];

  const continuityReady = checks
    .filter((check) => check.key !== "score-coverage")
    .every((check) => check.status === "passed");
  const firstOpen = checks.find((check) => check.status !== "passed");
  const source = activeSource ? sourceLabel(activeSource) : health.source;
  const summary = `${source} · ${externalMatches} external rows · ${seedMatches} seed continuity rows · ${scheduleReady}/${matches.length} schedule coverage · ${scoreReady}/${matches.length} scores`;
  const nextAction = firstOpen?.action ?? "Free feed continuity is ready; add paid enrichment for lineups, injuries and odds.";
  const copyText = [
    "Kickoff Lock Agent free data continuity evidence",
    summary,
    `Active route: ${activeRoute?.label ?? "none"}`,
    `Continuity ready: ${continuityReady ? "yes" : "no"}`,
    `Next action: ${nextAction}`,
    ...checks.map((check) => `${check.label}: ${check.status} · ${check.detail}`),
  ].join("\n");

  return {
    continuityReady,
    source,
    activeRoute: activeRoute?.label ?? "none",
    externalMatches,
    seedMatches,
    scheduleReady,
    scoreReady,
    totalMatches: matches.length,
    checks,
    summary,
    nextAction,
    copyText,
  };
};
