import { buildDataCoverage, sourceLabel } from "./providers";
import { matchHasProductionSignalContent } from "./intelligenceSignalQuality";
import type { DataCoverageItem, DataSource, Match, ProviderRouteAuditItem } from "./types";

const freeSources = new Set<DataSource>(["football-data", "thesportsdb", "openfootball", "espn", "worldcup26"]);
const sourceOrder: DataSource[] = ["football-data", "thesportsdb", "openfootball", "espn", "worldcup26"];
const signalKeys: DataCoverageItem["key"][] = ["schedule", "score", "rankings", "lineups", "injuries", "odds"];
const notPublishedByFreeFeeds = new Set<DataCoverageItem["key"]>(["injuries", "odds"]);
const productionProviderSignals = new Set<DataCoverageItem["key"]>(["lineups", "injuries", "odds"]);

export type FreeDataSourceSignalEvidence = {
  key: DataCoverageItem["key"];
  label: string;
  status: "covered" | "partial" | "gap" | "not-published";
  sampleCount: number;
  totalFreeMatches: number;
  provider: string;
  sample: string;
  detail: string;
  action: string;
};

export type FreeDataSourceRouteEvidence = {
  source: DataSource;
  label: string;
  active: boolean;
  routeStatus: ProviderRouteAuditItem["status"] | "unknown";
  matchCount: number;
  sampleIds: string[];
  capability: string;
};

export type FreeDataSourceEvidencePacket = {
  checkedAt: string;
  continuityReady: boolean;
  crossSourceReady: boolean;
  productionReady: boolean;
  freeMatchCount: number;
  activeRoutes: number;
  scheduleSourceCount: number;
  scoreSourceCount: number;
  crossSourceSamples: string[];
  routes: FreeDataSourceRouteEvidence[];
  signals: FreeDataSourceSignalEvidence[];
  missingSignals: DataCoverageItem["key"][];
  productionGapSignals: DataCoverageItem["key"][];
  continuitySignals: DataCoverageItem["key"][];
  summary: string;
  nextAction: string;
  copyText: string;
};

const labels: Record<DataCoverageItem["key"], string> = {
  schedule: "Schedule",
  score: "Scores",
  rankings: "Ranking baseline",
  lineups: "Lineups",
  injuries: "Injuries",
  odds: "Odds",
};

const capabilityFor = (source: DataSource) => {
  if (source === "football-data") return "Free-tier token route for World Cup schedule, score, venue, team metadata and standings read-back.";
  if (source === "thesportsdb") return "Schedule, score, venue and event lineup/stat endpoints when event detail rows are published.";
  if (source === "openfootball") return "Public-domain World Cup 2026 JSON schedule and full-time score continuity feed, no API key required.";
  if (source === "espn") return "Public World Cup scoreboard with schedule, status, score and venue metadata.";
  if (source === "worldcup26") return "Public World Cup schedule and finished-score continuity feed.";
  return "Not a free continuity route.";
};

const actionFor = (key: DataCoverageItem["key"]) => {
  if (key === "lineups") return "Use TheSportsDB event detail read-back for free lineup continuity, then API-Football for production target fixtures.";
  if (key === "injuries") return "Use API-Football injuries read-back; the configured free feeds do not publish injury rows.";
  if (key === "odds") return "Use API-Football odds or The Odds API; the configured free feeds do not publish betting markets.";
  if (key === "score") return "Keep ESPN, TheSportsDB or worldcup26 reachable and refresh near kickoff/final time.";
  if (key === "rankings") return "Keep FIFA ranking baseline attached, and add Football-Data.org or API-Football standings read-back for production target fixtures.";
  return "Keep at least one public schedule route reachable before falling back to seed data.";
};

const signalCoveredByFreeRoute = (match: Match, key: DataCoverageItem["key"]) => {
  if (!freeSources.has(match.dataSource) || !matchHasProductionSignalContent(match, key)) return false;
  if (key === "lineups") {
    const coverage = match.insights?.dataCoverage ?? buildDataCoverage(match);
    const source = coverage.find((item) => item.key === "lineups")?.source ?? match.insights?.lineupSource ?? "";
    return /thesportsdb/i.test(source);
  }
  if (notPublishedByFreeFeeds.has(key)) return false;
  return true;
};

const signalProvider = (matches: Match[], key: DataCoverageItem["key"]) => {
  const match = matches.find((item) => signalCoveredByFreeRoute(item, key));
  if (!match) {
    if (key === "injuries") return "API-Football required";
    if (key === "odds") return "API-Football / The Odds API required";
    return "No free sample";
  }
  const coverage = match.insights?.dataCoverage ?? buildDataCoverage(match);
  return coverage.find((item) => item.key === key)?.source ?? sourceLabel(match.dataSource);
};

const sourcesForSignal = (matches: Match[], key: DataCoverageItem["key"]) => [
  ...new Set(matches.filter((match) => signalCoveredByFreeRoute(match, key)).map((match) => match.dataSource)),
];

export const buildFreeDataSourceEvidencePacket = ({
  matches,
  routeAudit = [],
  checkedAt = new Date().toISOString(),
}: {
  matches: Match[];
  routeAudit?: ProviderRouteAuditItem[];
  checkedAt?: string;
}): FreeDataSourceEvidencePacket => {
  const freeMatches = matches.filter((match) => freeSources.has(match.dataSource));
  const routes = sourceOrder.map<FreeDataSourceRouteEvidence>((source) => {
    const route = routeAudit.find((item) => item.key === source);
    const sourceMatches = freeMatches.filter((match) => match.dataSource === source);
    return {
      source,
      label: sourceLabel(source),
      active: route?.status === "active" || sourceMatches.length > 0,
      routeStatus: route?.status ?? (sourceMatches.length > 0 ? "active" : "unknown"),
      matchCount: sourceMatches.length,
      sampleIds: sourceMatches.map((match) => match.id).slice(0, 5),
      capability: capabilityFor(source),
    };
  });
  const signals = signalKeys.map<FreeDataSourceSignalEvidence>((key) => {
    const sampleMatches = freeMatches.filter((match) => signalCoveredByFreeRoute(match, key));
    const sample = sampleMatches[0];
    const status: FreeDataSourceSignalEvidence["status"] = notPublishedByFreeFeeds.has(key)
      ? "not-published"
      : sampleMatches.length === 0
        ? "gap"
        : sampleMatches.length >= freeMatches.length
          ? "covered"
          : "partial";
    return {
      key,
      label: labels[key],
      status,
      sampleCount: sampleMatches.length,
      totalFreeMatches: freeMatches.length,
      provider: signalProvider(freeMatches, key),
      sample: sample ? `${sample.homeTeam} vs ${sample.awayTeam}` : "no free-source sample",
      detail: notPublishedByFreeFeeds.has(key)
        ? `${labels[key]} are not published by ESPN, openfootball, worldcup26 or TheSportsDB free routes.`
        : `${sampleMatches.length}/${freeMatches.length} free-source match${freeMatches.length === 1 ? "" : "es"} have this signal.`,
      action: status === "covered" ? "Free-route read-back covers this continuity signal." : actionFor(key),
    };
  });
  const activeRoutes = routes.filter((route) => route.active).length;
  const scheduleSources = sourcesForSignal(freeMatches, "schedule");
  const scoreSources = sourcesForSignal(freeMatches, "score");
  const crossSourceSamples = sourceOrder
    .flatMap((source) =>
      freeMatches
        .filter((match) => match.dataSource === source)
        .slice(0, 1)
        .map((match) => `${sourceLabel(source)}:${match.id}`),
    )
    .slice(0, 6);
  const missingSignals = signals.filter((item) => item.status !== "covered").map((item) => item.key);
  const continuitySignals = signals
    .filter((item) => ["schedule", "score", "rankings"].includes(item.key) && item.sampleCount > 0)
    .map((item) => item.key);
  const productionGapSignals = signals
    .filter((item) => productionProviderSignals.has(item.key) && item.status !== "covered")
    .map((item) => item.key);
  const continuityReady = Boolean(
    freeMatches.length > 0 &&
      activeRoutes > 0 &&
      signals.some((item) => item.key === "schedule" && item.sampleCount > 0) &&
      signals.some((item) => item.key === "score" && item.sampleCount > 0),
  );
  const crossSourceReady = scheduleSources.length >= 2 && scoreSources.length >= 1;
  const productionReady = missingSignals.length === 0 && productionGapSignals.length === 0;
  const summary = `${activeRoutes}/${routes.length} free routes active · ${freeMatches.length} free-source matches · ${
    continuitySignals.length
  }/3 continuity signals sampled · cross-source ${crossSourceReady ? "ready" : "pending"} · production gaps ${productionGapSignals.join(", ") || "none"}`;
  const nextAction = productionReady
    ? "Free routes cover every required signal."
    : !crossSourceReady
      ? "Keep at least two independent free schedule sources and one free score source returning World Cup rows, then fill paid intelligence gaps."
      : `Use free routes for continuity, then fill ${productionGapSignals.join(", ") || missingSignals.join(", ")} with API-Football/Odds read-back.`;
  const copyText = [
    "Kickoff Lock Agent free data source evidence",
    summary,
    `Continuity ready: ${continuityReady ? "yes" : "no"}`,
    `Cross-source continuity: ${crossSourceReady ? "yes" : "no"} · schedule ${scheduleSources.map(sourceLabel).join(", ") || "none"} · score ${scoreSources.map(sourceLabel).join(", ") || "none"}`,
    `Production ready: ${productionReady ? "yes" : "no"}`,
    `Continuity signals: ${continuitySignals.join(", ") || "none"}`,
    `Production gaps: ${productionGapSignals.join(", ") || "none"}`,
    `Cross-source samples: ${crossSourceSamples.join(", ") || "none"}`,
    ...routes.map((route) => `${route.label}: ${route.routeStatus} · ${route.matchCount} matches · ${route.capability}`),
    ...signals.map((signal) => `${signal.label}: ${signal.status} · ${signal.detail} · ${signal.provider}`),
  ].join("\n");

  return {
    checkedAt,
    continuityReady,
    crossSourceReady,
    productionReady,
    freeMatchCount: freeMatches.length,
    activeRoutes,
    scheduleSourceCount: scheduleSources.length,
    scoreSourceCount: scoreSources.length,
    crossSourceSamples,
    routes,
    signals,
    missingSignals,
    productionGapSignals,
    continuitySignals,
    summary,
    nextAction,
    copyText,
  };
};
