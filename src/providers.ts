import { seedMatches } from "./data/seedMatches";
import { lookupFifaRanking } from "./data/fifaRankings";
import { hasUsefulSignalList, placeholderPattern } from "./intelligenceSignalQuality";
import { resolvedDataProxyUrl, runtimeConfigValue } from "./runtimeConfig";
import type {
  DataCoverageItem,
  DataCoverageStatus,
  DataSource,
  Match,
  MatchIntelligenceScore,
  ProviderEnrichmentMatrixItem,
  ProviderHealthSnapshot,
  ProviderEnrichmentAudit,
  ProviderResponseAudit,
  ProviderReadinessItem,
  ProviderResult,
  ProviderRouteAuditItem,
  RealtimeDataAudit,
} from "./types";

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40";
const WORLDCUP26_URL = "https://worldcup26.ir/get/games";
const OPENFOOTBALL_WORLDCUP_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const runtimeEnv = import.meta.env as Record<string, string | boolean | undefined>;
const envValue = (key: string, fallback = "") => runtimeConfigValue(runtimeEnv, key) || fallback;
const numberEnvValue = (key: string, fallback: number) => Math.max(0, Number(envValue(key, String(fallback))) || 0);
const API_FOOTBALL_KEY = () => envValue("VITE_APIFOOTBALL_KEY");
const API_FOOTBALL_HOST = "https://v3.football.api-sports.io";
const API_FOOTBALL_ENRICHMENT_LIMIT = () => numberEnvValue("VITE_APIFOOTBALL_ENRICHMENT_LIMIT", 12);
const FOOTBALL_DATA_TOKEN = () => envValue("VITE_FOOTBALL_DATA_TOKEN");
const FOOTBALL_DATA_COMPETITION = () => envValue("VITE_FOOTBALL_DATA_COMPETITION", "WC");
const FOOTBALL_DATA_HOST = "https://api.football-data.org/v4";
const THESPORTSDB_KEY = () => envValue("VITE_THESPORTSDB_KEY", "123");
const THESPORTSDB_LEAGUE_ID = () => envValue("VITE_THESPORTSDB_LEAGUE_ID", "4429");
const THESPORTSDB_SEASON = () => envValue("VITE_THESPORTSDB_SEASON", String(new Date().getUTCFullYear()));
const THESPORTSDB_ENRICHMENT_LIMIT = () => numberEnvValue("VITE_THESPORTSDB_ENRICHMENT_LIMIT", 8);
const THESPORTSDB_HOST = () => `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_KEY()}`;
const ODDS_API_KEY = () => envValue("VITE_ODDS_API_KEY");
const ODDS_API_SPORT_KEY = () => envValue("VITE_ODDS_API_SPORT_KEY");
const ODDS_API_HOST = "https://api.the-odds-api.com/v4";
const DATA_PROXY_URL = () => resolvedDataProxyUrl(runtimeEnv);
const ODDS_API_CONFIGURED = () => Boolean((ODDS_API_KEY() || DATA_PROXY_URL()) && ODDS_API_SPORT_KEY());

export const buildDataProxyUrl = (
  targetUrl: string,
  source: DataSource,
  proxyBaseUrl = DATA_PROXY_URL(),
) => {
  if (!proxyBaseUrl) return targetUrl;
  const base = typeof window === "undefined" ? "http://localhost/" : window.location.href;
  const proxy = new URL(proxyBaseUrl, base);
  proxy.searchParams.set("url", targetUrl);
  proxy.searchParams.set("source", source);
  return proxy.toString();
};

const publicDataUrl = (targetUrl: string, source: DataSource) => buildDataProxyUrl(targetUrl, source);

const providerRouteConfig = (): Array<{
  key: DataSource;
  label: string;
  configured: boolean;
  detail: string;
}> => [
  {
    key: "api-football",
    label: "API-Football",
    configured: Boolean(API_FOOTBALL_KEY() || DATA_PROXY_URL()),
    detail: DATA_PROXY_URL()
      ? "Fixtures plus lineups, injuries and odds through the data proxy with a server-side key."
      : "Fixtures plus lineups, injuries and odds when plan supports enrichment.",
  },
  {
    key: "football-data",
    label: "Football-Data.org",
    configured: Boolean(FOOTBALL_DATA_TOKEN() || DATA_PROXY_URL()),
    detail: `Competition ${FOOTBALL_DATA_COMPETITION()} fixtures, scores, venue and team metadata${
      DATA_PROXY_URL() ? " through the data proxy with a server-side token" : ""
    }.`,
  },
  {
    key: "thesportsdb",
    label: "TheSportsDB",
    configured: Boolean(THESPORTSDB_KEY()),
    detail: `Free v1 route ${THESPORTSDB_LEAGUE_ID()}/${THESPORTSDB_SEASON()} for schedule, score and event details${DATA_PROXY_URL() ? " via data proxy" : ""}.`,
  },
  {
    key: "openfootball",
    label: "openfootball",
    configured: true,
    detail: `Public-domain World Cup 2026 JSON schedule/results continuity feed${DATA_PROXY_URL() ? " via data proxy" : ""}.`,
  },
  {
    key: "espn",
    label: "ESPN",
    configured: true,
    detail: `Public FIFA World Cup scoreboard fallback${DATA_PROXY_URL() ? " via data proxy" : ""}.`,
  },
  {
    key: "worldcup26",
    label: "worldcup26",
    configured: true,
    detail: `Public games fallback route${DATA_PROXY_URL() ? " via data proxy" : ""}.`,
  },
  {
    key: "seed",
    label: "Seed continuity",
    configured: true,
    detail: "Bundled offline schedule and manual result safety net.",
  },
];

const timeoutFetch = async (
  url: string,
  timeoutMs = 6500,
  headers?: Record<string, string>,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    window.clearTimeout(timer);
  }
};

const providerResponseAudit = ({
  source,
  endpoint,
  rowCount,
  sampleIds,
  httpStatus,
  checkedAt = new Date().toISOString(),
  startedAt = Date.now(),
  status = rowCount > 0 ? "ok" : "empty",
  detail,
}: {
  source: DataSource;
  endpoint: string;
  rowCount: number;
  sampleIds: string[];
  httpStatus?: number;
  checkedAt?: string;
  startedAt?: number;
  status?: ProviderResponseAudit["status"];
  detail?: string;
}): ProviderResponseAudit => ({
  source,
  endpoint,
  status,
  httpStatus,
  checkedAt,
  rowCount,
  sampleIds: sampleIds.slice(0, 5),
  durationMs: Math.max(0, Date.now() - startedAt),
  detail: detail ?? `${rowCount} row${rowCount === 1 ? "" : "s"} returned from ${sourceLabel(source)}`,
});

const normalizeStatus = (description?: string): Match["status"] => {
  const text = (description ?? "").toLowerCase();
  if (text.includes("full") || text.includes("final")) return "finished";
  if (text.includes("half") || text.includes("'") || text.includes("progress")) {
    return "live";
  }
  return "upcoming";
};

const numberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const normalizeFootballDataStatus = (status?: string): Match["status"] => {
  const text = (status ?? "").toLowerCase();
  if (text.includes("finished") || text.includes("awarded")) return "finished";
  if (text.includes("live") || text.includes("play") || text.includes("pause")) return "live";
  return "upcoming";
};

const normalizeTheSportsDbStatus = (status?: string): Match["status"] => {
  const text = (status ?? "").toLowerCase();
  if (text === "ft" || text.includes("match finished") || text.includes("full")) return "finished";
  if (["1h", "2h", "ht", "et", "p"].includes(text) || text.includes("progress") || text.includes("live")) {
    return "live";
  }
  return "upcoming";
};

const normalizeTheSportsDbKickoff = (event: any) => {
  if (event.strTimestamp) {
    const stamp = String(event.strTimestamp);
    return stamp.endsWith("Z") ? stamp : `${stamp.replace(" ", "T")}Z`;
  }
  return new Date(`${event.dateEvent ?? ""}T${event.strTime ?? "00:00:00"}Z`).toISOString();
};

const normalizeTheSportsDbStage = (round?: string | number) => {
  const n = Number(round);
  if (!Number.isFinite(n)) return "FIFA World Cup";
  if (n <= 3) return `Group matchday ${n}`;
  if (n === 32) return "Round of 32";
  if (n === 16) return "Round of 16";
  if (n === 8) return "Quarterfinal";
  if (n === 4) return "Semifinal";
  if (n === 2) return "Third-place match";
  if (n === 1) return "Final";
  return `Round ${n}`;
};

const normalizeOpenFootballKickoff = (date: string | undefined, time: string | undefined) => {
  const cleanDate = date?.trim() || new Date().toISOString().slice(0, 10);
  const match = String(time ?? "").match(/^(\d{1,2}):(\d{2})(?:\s+UTC([+-]\d{1,2}))?/i);
  if (!match) return `${cleanDate}T00:00:00.000Z`;
  const hour = match[1]!.padStart(2, "0");
  const minute = match[2]!;
  const offsetHour = match[3] ? Number(match[3]) : 0;
  const sign = offsetHour >= 0 ? "+" : "-";
  const offset = `${sign}${String(Math.abs(offsetHour)).padStart(2, "0")}:00`;
  return new Date(`${cleanDate}T${hour}:${minute}:00${offset}`).toISOString();
};

const listCoverage = (
  source: DataSource,
  items: string[] | undefined,
  configuredSource: string | undefined,
): DataCoverageStatus => {
  if (source === "seed") return "fallback";
  if (hasUsefulSignalList(items)) return "live";
  if (configuredSource && /endpoint/i.test(configuredSource) && !placeholderPattern.test(configuredSource)) return "configured";
  return "missing";
};

const statusSource = (status: DataCoverageStatus, source: string) => {
  if (status === "missing") return "Not available";
  if (status === "manual") return "Manual input";
  return source;
};

const statusRank: Record<DataCoverageStatus, number> = {
  missing: 0,
  manual: 1,
  fallback: 2,
  configured: 3,
  live: 4,
};

const isLiveOrConfigured = (item: ProviderReadinessItem) =>
  item.status === "live" || item.status === "configured";

const productionEnrichmentKeys = new Set<DataCoverageItem["key"]>(["rankings", "lineups", "injuries", "odds"]);
const requiredEnrichmentEndpointKeys: ProviderEnrichmentMatrixItem["key"][] = [
  "lineups",
  "injuries",
  "odds",
  "standings",
];

const enrichmentEndpointLabels: Record<ProviderEnrichmentMatrixItem["key"], string> = {
  lineups: "Lineups",
  injuries: "Injuries",
  odds: "Odds",
  standings: "Standings",
};

const defaultEnrichmentEndpoint = (key: ProviderEnrichmentMatrixItem["key"]) => {
  if (key === "lineups") return "fixtures/lineups?fixture=<fixture-id>";
  if (key === "injuries") return "injuries?fixture=<fixture-id>";
  if (key === "standings") return "standings?league=<league-id>&season=<season>";
  return "odds?fixture=<fixture-id> or The Odds API h2h";
};

const endpointAuditKeyFor = (key: DataCoverageItem["key"]) => (key === "rankings" ? "standings" : key);

const hasProductionEnrichmentReadback = (
  key: DataCoverageItem["key"],
  enrichmentAudit?: ProviderEnrichmentAudit,
) => {
  if (!productionEnrichmentKeys.has(key)) return true;
  const endpointKey = endpointAuditKeyFor(key);
  const endpoint = enrichmentAudit?.endpointAudits.find((item) => item.key === endpointKey);
  return Boolean(endpoint && endpoint.attempted > 0 && endpoint.fulfilled >= endpoint.attempted && endpoint.live >= endpoint.attempted && endpoint.errors === 0);
};

const isProductionSignalReady = (item: ProviderReadinessItem, enrichmentAudit?: ProviderEnrichmentAudit) => {
  if (!productionEnrichmentKeys.has(item.key)) return isLiveOrConfigured(item);
  const signalReady = item.key === "rankings" ? isLiveOrConfigured(item) : item.status === "live";
  return signalReady && hasProductionEnrichmentReadback(item.key, enrichmentAudit);
};

export const buildProviderEnrichmentMatrix = (
  enrichmentAudit?: ProviderEnrichmentAudit,
): ProviderEnrichmentMatrixItem[] =>
  requiredEnrichmentEndpointKeys.map((key) => {
    const endpoint = enrichmentAudit?.endpointAudits.find((item) => item.key === key);
    const attempted = endpoint?.attempted ?? 0;
    const fulfilled = endpoint?.fulfilled ?? 0;
    const live = endpoint?.live ?? 0;
    const errors = endpoint?.errors ?? 0;
    const ready = attempted > 0 && fulfilled >= attempted && live >= attempted && errors === 0;
    const endpointName = endpoint?.endpoint ?? defaultEnrichmentEndpoint(key);
    return {
      key,
      label: enrichmentEndpointLabels[key],
      endpoint: endpointName,
      attempted,
      fulfilled,
      live,
      errors,
      ready,
      sampleIds: endpoint?.sampleIds ?? [],
      detail: ready
        ? `${live}/${attempted} live read-back rows`
        : attempted > 0
          ? `${live}/${attempted} live, ${fulfilled}/${attempted} fulfilled, ${errors} errors`
          : "endpoint read-back not attempted",
    };
  });

export const buildProviderHealthSnapshot = ({
  providerSource,
  readiness,
  routeAudit,
  evidence,
  lastSyncedAt,
  responseAudit,
  enrichmentAudit,
  now = Date.now(),
  freshnessMs = 2 * 60 * 1000,
}: {
  providerSource: string;
  readiness: ProviderReadinessItem[];
  routeAudit: ProviderRouteAuditItem[];
  evidence: string[];
  lastSyncedAt?: string;
  responseAudit?: ProviderResponseAudit;
  enrichmentAudit?: ProviderEnrichmentAudit;
  now?: number;
  freshnessMs?: number;
}): ProviderHealthSnapshot => {
  const activeRoute = routeAudit.find((route) => route.status === "active" || route.status === "fallback");
  const liveOrConfiguredItems = readiness.filter(isLiveOrConfigured);
  const productionReadyItems = readiness.filter((item) => isProductionSignalReady(item, enrichmentAudit));
  const enrichmentMatrix = buildProviderEnrichmentMatrix(enrichmentAudit);
  const missingSignals = readiness
    .filter(
      (item) =>
        item.status === "missing" ||
        item.status === "manual" ||
        (productionEnrichmentKeys.has(item.key) && !isProductionSignalReady(item, enrichmentAudit)),
    )
    .map((item) => item.key);
  const lastSyncMs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : Number.NaN;
  const ageSeconds = Number.isFinite(lastSyncMs) ? Math.max(0, Math.round((now - lastSyncMs) / 1000)) : undefined;
  const fresh = ageSeconds !== undefined && ageSeconds <= Math.round(freshnessMs / 1000);
  const activeLiveRoute = Boolean(activeRoute && activeRoute.key !== "seed" && activeRoute.status === "active");
  const responseVerified = Boolean(
    responseAudit &&
      responseAudit.status === "ok" &&
      responseAudit.rowCount > 0 &&
      responseAudit.source !== "seed" &&
      activeRoute &&
      activeRoute.key === responseAudit.source,
  );
  const totalSignals = readiness.length;
  const liveOrConfiguredCount = liveOrConfiguredItems.length;
  const productionReadyCount = productionReadyItems.length;
  const status: ProviderHealthSnapshot["status"] =
    activeLiveRoute && fresh && responseVerified && missingSignals.length === 0
      ? "verified"
      : activeLiveRoute && fresh && responseVerified && productionReadyCount >= Math.ceil(totalSignals * 0.65)
        ? "ready"
        : activeRoute
          ? "partial"
          : "blocked";
  const detail = `${activeRoute?.label ?? providerSource} · ${liveOrConfiguredCount}/${totalSignals} live/configured · ${
    fresh ? "fresh" : "stale or pending"
  } · response ${responseVerified ? "verified" : "unverified"} · ${productionReadyCount}/${totalSignals} production read-back`;
  const nextAction =
    status === "verified"
      ? "Realtime schedule, score and enrichment signals are fresh."
      : activeLiveRoute
        ? `Refresh data and fill missing signals: ${missingSignals.join(", ") || "none"}.`
        : "Connect a live provider route before treating seed/manual data as production.";

  return {
    source: providerSource,
    status,
    lastSyncedAt,
    ageSeconds,
    fresh,
    responseVerified,
    responseAudit,
    enrichmentAudit,
    enrichmentMatrix,
    liveOrConfigured: liveOrConfiguredCount,
    totalSignals,
    activeRoute: activeRoute?.label,
    missingSignals,
    evidence,
    detail,
    nextAction,
  };
};

const coverageWeights: Record<DataCoverageItem["key"], number> = {
  schedule: 18,
  score: 18,
  rankings: 16,
  lineups: 16,
  injuries: 16,
  odds: 16,
};

const coverageScore: Record<DataCoverageStatus, number> = {
  live: 1,
  configured: 0.78,
  fallback: 0.52,
  manual: 0.34,
  missing: 0,
};

const coverageSuggestion: Record<DataCoverageItem["key"], string> = {
  schedule: "Load a live schedule provider before treating this as production match data.",
  score: "Keep live score polling active or expect manual reveal for this fixture.",
  rankings: "Attach a ranking source so the agent can explain relative team strength.",
  lineups: "Run enrichment close to kickoff or configure API-Football lineups.",
  injuries: "Configure injury enrichment so unavailable players are not treated as speculation.",
  odds: "Configure API-Football odds or The Odds API before using market picks as live signals.",
};

const bestCoverage = (matches: Match[], key: DataCoverageItem["key"]) => {
  const items = matches.flatMap((match) => match.insights?.dataCoverage ?? buildDataCoverage(match));
  return items
    .filter((item) => item.key === key)
    .sort((a, b) => statusRank[b.status] - statusRank[a.status])[0];
};

const envDetail = (key: DataCoverageItem["key"]) => {
  if (key === "lineups" || key === "injuries") {
    return API_FOOTBALL_KEY() || DATA_PROXY_URL()
      ? "API-Football enrichment configured; run Enrich on API-Football fixtures."
      : "Configure VITE_APIFOOTBALL_KEY or a data proxy with server-side APIFOOTBALL_KEY for lineups and injuries.";
  }
  if (key === "odds") {
    if (API_FOOTBALL_KEY() || DATA_PROXY_URL() || ODDS_API_CONFIGURED()) {
      return "Odds enrichment configured through API-Football or The Odds API.";
    }
    return "Configure VITE_APIFOOTBALL_KEY, a data proxy with server-side APIFOOTBALL_KEY/ODDS_API_KEY, or VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY.";
  }
  return "Waiting for configured live provider.";
};

const providerScoreStatus = (matches: Match[]): ProviderReadinessItem => {
  const score = bestCoverage(matches, "score");
  const liveSource = matches.find((match) => match.dataSource !== "seed" && match.dataSource !== "manual");
  if (score?.status === "live" || score?.status === "fallback") {
    return {
      key: "score",
      label: "Scores",
      status: score.status,
      source: score.source,
      detail: score.detail,
    };
  }
  if (liveSource) {
    return {
      key: "score",
      label: "Scores",
      status: "configured",
      source: sourceLabel(liveSource.dataSource),
      detail: "Live/final score endpoint is active; current upcoming fixtures may still require manual reveal.",
    };
  }
  return {
    key: "score",
    label: "Scores",
    status: "manual",
    source: "Manual reveal",
    detail: "No live score provider active for the current schedule.",
  };
};

export const buildProviderReadiness = (matches: Match[]): ProviderReadinessItem[] => {
  const items: ProviderReadinessItem[] = [];
  const labels: Record<DataCoverageItem["key"], string> = {
    schedule: "Schedule",
    score: "Scores",
    rankings: "Ranking",
    lineups: "Lineups",
    injuries: "Injuries",
    odds: "Odds",
  };

  for (const key of ["schedule", "rankings", "lineups", "injuries", "odds"] as const) {
    const coverage = bestCoverage(matches, key);
    const configured =
      (key === "lineups" || key === "injuries") && (API_FOOTBALL_KEY() || DATA_PROXY_URL())
        ? true
        : key === "odds" && (API_FOOTBALL_KEY() || DATA_PROXY_URL() || ODDS_API_CONFIGURED());
    const enrichmentKey = key === "lineups" || key === "injuries" || key === "odds";
    const usableCoverage =
      coverage && (!enrichmentKey || coverage.status !== "fallback" || configured)
        ? coverage
        : undefined;
    items.push({
      key,
      label: labels[key],
      status: usableCoverage?.status && statusRank[usableCoverage.status] >= statusRank.configured
        ? usableCoverage.status
        : configured
          ? "configured"
          : enrichmentKey
            ? "missing"
            : usableCoverage?.status ?? "missing",
      source:
        usableCoverage?.status && statusRank[usableCoverage.status] >= statusRank.configured
          ? usableCoverage.source
          : configured
            ? key === "odds"
              ? "API-Football / The Odds API"
              : "API-Football"
            : enrichmentKey
              ? "Not available"
              : usableCoverage?.source ?? "Not available",
      detail:
        usableCoverage?.status && statusRank[usableCoverage.status] >= statusRank.configured
          ? usableCoverage.detail
          : configured
            ? envDetail(key)
            : key === "lineups" || key === "injuries" || key === "odds"
              ? envDetail(key)
              : usableCoverage?.detail ?? envDetail(key),
    });
  }

  items.splice(1, 0, providerScoreStatus(matches));
  return items;
};

const coverageKeys: DataCoverageItem["key"][] = ["schedule", "score", "rankings", "lineups", "injuries", "odds"];

export const buildRealtimeDataAudit = ({
  source,
  matches,
  routeAudit = [],
  evidence = [],
  responseAudit,
  enrichmentAudit,
  warning,
  checkedAt = new Date().toISOString(),
}: {
  source: DataSource;
  matches: Match[];
  routeAudit?: ProviderRouteAuditItem[];
  evidence?: string[];
  responseAudit?: ProviderResponseAudit;
  enrichmentAudit?: ProviderEnrichmentAudit;
  warning?: string;
  checkedAt?: string;
}): RealtimeDataAudit => {
  const activeRoute = routeAudit.find((route) => route.key === source);
  const responseVerified = Boolean(
    responseAudit &&
      responseAudit.status === "ok" &&
      responseAudit.rowCount > 0 &&
      responseAudit.source === source &&
      source !== "seed",
  );
  const coverageRows = matches.map((match) => ({
    match,
    coverage: match.insights?.dataCoverage ?? buildDataCoverage(match),
  }));
  const signals = coverageKeys.map((key) => {
    const items = coverageRows
      .flatMap((row) => row.coverage)
      .filter((item) => item.key === key);
    const best = [...items].sort((a, b) => statusRank[b.status] - statusRank[a.status])[0];
    return {
      key,
      label: best?.label ?? key,
      bestStatus: best?.status ?? "missing",
      bestSource: best?.source ?? "Not available",
      live: items.filter((item) => item.status === "live").length,
      configured: items.filter((item) => item.status === "configured").length,
      fallback: items.filter((item) => item.status === "fallback").length,
      manual: items.filter((item) => item.status === "manual").length,
      missing: items.filter((item) => item.status === "missing").length,
      total: matches.length,
    };
  });
  const signalHasProductionReadback = (key: DataCoverageItem["key"]) => {
    if (!productionEnrichmentKeys.has(key)) return true;
    const endpointKey = endpointAuditKeyFor(key);
    const endpoint = enrichmentAudit?.endpointAudits.find((item) => item.key === endpointKey);
    return Boolean(endpoint && endpoint.attempted > 0 && endpoint.fulfilled >= endpoint.attempted && endpoint.live >= endpoint.attempted && endpoint.errors === 0);
  };
  const missingSignals = signals
    .filter((signal) => {
      const coverageCount = signal.live + (signal.key === "rankings" ? signal.configured : 0);
      return productionEnrichmentKeys.has(signal.key)
        ? coverageCount < signal.total || !signalHasProductionReadback(signal.key)
        : signal.live + signal.configured < signal.total;
    })
    .map((signal) => signal.key);
  const apiFootballEnrichmentReadback = Boolean(
    source !== "api-football" ||
      (enrichmentAudit &&
        enrichmentAudit.attemptedFixtures > 0 &&
        enrichmentAudit.endpointAudits.every(
          (endpoint) => endpoint.attempted > 0 && endpoint.fulfilled >= endpoint.attempted && endpoint.live >= endpoint.attempted && endpoint.errors === 0,
        )),
  );
  const samples = coverageRows.slice(0, 3).map(({ match, coverage }) => {
    const missing = coverage
      .filter((item) => statusRank[item.status] < statusRank.configured)
      .map((item) => item.key);
    return {
      id: match.id,
      label: `${match.homeTeam} vs ${match.awayTeam}`,
      status: match.status,
      kickoffAt: match.kickoffAt,
      liveOrConfigured: coverage.filter((item) => item.status === "live" || item.status === "configured").length,
      missing,
    };
  });
  const productionReady = Boolean(
    matches.length > 0 &&
      activeRoute &&
      activeRoute.status === "active" &&
      source !== "seed" &&
      responseVerified &&
      apiFootballEnrichmentReadback &&
      missingSignals.length === 0,
  );

  return {
    checkedAt,
    source,
    sourceLabel: sourceLabel(source),
    routeStatus: activeRoute?.status ?? "unknown",
    responseVerified,
    responseAudit,
    enrichmentAudit,
    matchCount: matches.length,
    liveMatches: matches.filter((match) => match.status === "live").length,
    finishedMatches: matches.filter((match) => match.status === "finished").length,
    upcomingMatches: matches.filter((match) => match.status === "upcoming").length,
    productionReady,
    warning,
    evidence,
    missingSignals,
    signals,
    samples,
  };
};

export const buildDataCoverage = (match: Match): DataCoverageItem[] => {
  const provider = sourceLabel(match.dataSource);
  const scoreKnown = match.homeScore !== undefined && match.awayScore !== undefined;
  const isFallback = match.dataSource === "seed";
  const hasFifaRanks = Boolean(match.insights?.home.fifaRank && match.insights?.away.fifaRank);
  const hasTableRanks = Boolean(match.insights?.home.tablePosition && match.insights?.away.tablePosition);
  const hasRanks = hasFifaRanks || hasTableRanks;
  const rankingDetail = hasTableRanks
    ? `${match.homeTeam} table #${match.insights?.home.tablePosition} (${match.insights?.home.tablePoints} pts) · ${match.awayTeam} table #${match.insights?.away.tablePosition} (${match.insights?.away.tablePoints} pts)`
    : `${match.homeTeam} ${match.insights?.home.fifaRank} · ${match.awayTeam} ${match.insights?.away.fifaRank}`;
  const lineupStatus = listCoverage(
    match.dataSource,
    [...(match.insights?.home.probableLineup ?? []), ...(match.insights?.away.probableLineup ?? [])],
    match.insights?.lineupSource,
  );
  const injuryStatus = listCoverage(
    match.dataSource,
    [...(match.insights?.home.unavailable ?? []), ...(match.insights?.away.unavailable ?? [])],
    match.insights?.injurySource,
  );
  const oddsStatus: DataCoverageStatus =
    match.dataSource === "seed"
      ? "fallback"
      : match.insights?.oddsSnapshot && !placeholderPattern.test(match.insights.oddsSnapshot)
        ? "live"
        : match.insights?.marketLine && !placeholderPattern.test(match.insights.marketLine)
          ? "configured"
          : "missing";

  return [
    {
      key: "schedule",
      label: "Schedule",
      status: isFallback ? "fallback" : "live",
      source: provider,
      detail: `${match.stage}${match.venue ? ` · ${match.venue}` : ""}`,
    },
    {
      key: "score",
      label: "Score",
      status: scoreKnown ? (isFallback ? "fallback" : "live") : "manual",
      source: scoreKnown ? provider : "Manual reveal",
      detail: scoreKnown ? `${match.homeScore}-${match.awayScore}` : "Awaiting live score or manual result entry",
    },
    {
      key: "rankings",
      label: "Rank signal",
      status: hasRanks ? (isFallback ? "fallback" : "configured") : "missing",
      source: hasRanks ? (match.insights?.standingsSource ?? match.insights?.rankingSource ?? provider) : "Not available",
      detail: hasRanks ? rankingDetail : "No ranking feed attached",
    },
    {
      key: "lineups",
      label: "Lineups",
      status: lineupStatus,
      source: statusSource(lineupStatus, match.insights?.lineupSource ?? provider),
      detail: lineupStatus === "missing" ? "Lineups not published by this provider" : "Probable or official lineup signal available",
    },
    {
      key: "injuries",
      label: "Injuries",
      status: injuryStatus,
      source: statusSource(injuryStatus, match.insights?.injurySource ?? provider),
      detail: injuryStatus === "missing" ? "No injury feed attached" : "Availability signal available",
    },
    {
      key: "odds",
      label: "Odds",
      status: oddsStatus,
      source: statusSource(oddsStatus, match.insights?.oddsSnapshot ? "Odds feed" : provider),
      detail: match.insights?.oddsSnapshot ?? match.insights?.marketLine ?? "No odds feed attached",
    },
  ];
};

export const buildMatchIntelligenceScore = (match: Match): MatchIntelligenceScore => {
  const coverage = match.insights?.dataCoverage ?? buildDataCoverage(match);
  const byKey = new Map(coverage.map((item) => [item.key, item]));
  const total = Object.entries(coverageWeights).reduce((sum, [key, weight]) => {
    const item = byKey.get(key as DataCoverageItem["key"]);
    return sum + weight * coverageScore[item?.status ?? "missing"];
  }, 0);
  const score = Math.round(total);
  const missing = coverage
    .filter((item) => item.status === "missing" || item.status === "manual")
    .map((item) => item.key);
  const suggestions = missing.map((key) => coverageSuggestion[key]).slice(0, 3);
  const liveOrConfigured = coverage.filter((item) => item.status === "live" || item.status === "configured").length;
  const level: MatchIntelligenceScore["level"] =
    score >= 84 && missing.length === 0
      ? "live-ready"
      : score >= 68 && liveOrConfigured >= 4
        ? "configured"
        : score >= 45
          ? "thin"
          : "manual-risk";
  const label =
    level === "live-ready"
      ? "Live-ready"
      : level === "configured"
        ? "Configured"
        : level === "thin"
          ? "Thin intel"
          : "Manual risk";
  const detail =
    level === "live-ready"
      ? "Schedule, score and enrichment signals are strong enough for a production lock."
      : level === "configured"
        ? "Core match data is usable, with some enrichment still provider-dependent."
        : level === "thin"
          ? "The capsule can be locked, but several intelligence layers are fallback or manual."
          : "Use as a demo or manual workflow until live data providers are configured.";
  return {
    score,
    level,
    label,
    detail,
    missing,
    suggestions: suggestions.length > 0 ? suggestions : ["Data layers are sufficiently covered for this fixture."],
  };
};

const applyRankingBaseline = (match: Match): Match => {
  if (!match.insights) return match;
  const homeRanking = lookupFifaRanking(match.homeTeam);
  const awayRanking = lookupFifaRanking(match.awayTeam);
  if (!homeRanking && !awayRanking) return match;
  const rankingSource = homeRanking?.source ?? awayRanking?.source;
  return {
    ...match,
    insights: {
      ...match.insights,
      rankingSource,
      home: {
        ...match.insights.home,
        fifaRank: homeRanking?.rank ?? match.insights.home.fifaRank,
        form: homeRanking && !match.insights.home.tablePosition
          ? ["FIFA", "RANK", `#${homeRanking.rank}`]
          : match.insights.home.form,
      },
      away: {
        ...match.insights.away,
        fifaRank: awayRanking?.rank ?? match.insights.away.fifaRank,
        form: awayRanking && !match.insights.away.tablePosition
          ? ["FIFA", "RANK", `#${awayRanking.rank}`]
          : match.insights.away.form,
      },
    },
  };
};

const withCoverage = (match: Match): Match => {
  const ranked = applyRankingBaseline(match);
  return {
    ...ranked,
    insights: ranked.insights
      ? {
          ...ranked.insights,
          dataCoverage: buildDataCoverage(ranked),
        }
      : ranked.insights,
  };
};

const insightShell = (homeTeam: string, awayTeam: string, source: string, stamp = new Date().toISOString()) => ({
  home: {
    fifaRank: 0,
    form: [source, "LIVE", "DATA"],
    lastFiveGoalsFor: 0,
    lastFiveGoalsAgainst: 0,
    unavailable: ["Configure injury provider or API-Football fixture enrichment"],
    probableLineup: ["Lineup not published by this provider"],
  },
  away: {
    fifaRank: 0,
    form: [source, "LIVE", "DATA"],
    lastFiveGoalsFor: 0,
    lastFiveGoalsAgainst: 0,
    unavailable: ["Configure injury provider or API-Football fixture enrichment"],
    probableLineup: ["Lineup not published by this provider"],
  },
  headToHead: `${homeTeam} vs ${awayTeam} matchup built from ${source}.`,
  marketLine: "Market data waits for odds enrichment.",
  oddsSnapshot: "Odds enrichment not loaded.",
  lineupSource: `${source} match feed`,
  injurySource: "No injury feed configured for this source",
  dataFreshness: stamp,
});

export const loadFromEspn = async (): Promise<ProviderResult> => {
  const startedAt = Date.now();
  const res = await timeoutFetch(publicDataUrl(ESPN_URL, "espn"));
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  const data = await res.json();
  const events = Array.isArray(data.events) ? data.events : [];
  const matches: Match[] = events.map((event: any) => {
    const competition = event.competitions?.[0] ?? {};
    const competitors = competition.competitors ?? [];
    const home = competitors.find((item: any) => item.homeAway === "home") ?? competitors[0];
    const away = competitors.find((item: any) => item.homeAway === "away") ?? competitors[1];
    const statusDescription = event.status?.type?.description;
    return withCoverage({
      id: `espn-${event.id}`,
      homeTeam: home?.team?.displayName ?? "Home",
      awayTeam: away?.team?.displayName ?? "Away",
      kickoffAt: event.date,
      stage: data.leagues?.[0]?.season?.type?.name ?? "FIFA World Cup",
      status: normalizeStatus(statusDescription),
      dataSource: "espn",
      homeScore: numberOrUndefined(home?.score),
      awayScore: numberOrUndefined(away?.score),
      venue: competition.venue?.fullName,
      insights: insightShell(home?.team?.displayName ?? "Home", away?.team?.displayName ?? "Away", "ESPN"),
    });
  });
  if (matches.length === 0) throw new Error("ESPN returned no matches");
  const oddsEnriched = await enrichMatchesFromOddsApi(matches, "espn");
  return {
    source: "espn",
    matches: oddsEnriched.matches,
    evidence: [
      "ESPN FIFA World Cup scoreboard endpoint",
      "Live status, score, venue and kickoff metadata",
      `${matches.length} ESPN events normalized`,
      ...(oddsEnriched.enrichmentAudit ? [oddsEnriched.enrichmentAudit.detail] : []),
    ],
    enrichmentAudit: oddsEnriched.enrichmentAudit,
    responseAudit: providerResponseAudit({
      source: "espn",
      endpoint: "scoreboard",
      rowCount: events.length,
      sampleIds: events.map((event: any) => String(event.id ?? "")).filter(Boolean),
      httpStatus: res.status,
      startedAt,
    }),
  };
};

export const loadFromWorldcup26 = async (): Promise<ProviderResult> => {
  const startedAt = Date.now();
  const res = await timeoutFetch(publicDataUrl(WORLDCUP26_URL, "worldcup26"));
  if (!res.ok) throw new Error(`worldcup26 returned ${res.status}`);
  const data = await res.json();
  const games = Array.isArray(data.games) ? data.games : [];
  const matches: Match[] = games.map((game: any) => {
    const kickoffAt = new Date(`${game.local_date ?? ""} UTC`).toISOString();
    const finished = String(game.finished).toLowerCase() === "true";
    return withCoverage({
      id: `worldcup26-${game.id}`,
      homeTeam: game.home_team_name_en ?? "Home",
      awayTeam: game.away_team_name_en ?? "Away",
      kickoffAt,
      stage: game.type ?? `Matchday ${game.matchday ?? ""}`,
      status: finished ? "finished" : "upcoming",
      dataSource: "worldcup26",
      homeScore: numberOrUndefined(game.home_score),
      awayScore: numberOrUndefined(game.away_score),
      insights: insightShell(game.home_team_name_en ?? "Home", game.away_team_name_en ?? "Away", "worldcup26"),
    });
  });
  if (matches.length === 0) throw new Error("worldcup26 returned no matches");
  const oddsEnriched = await enrichMatchesFromOddsApi(matches, "worldcup26");
  return {
    source: "worldcup26",
    matches: oddsEnriched.matches,
    evidence: [
      "worldcup26 games endpoint",
      "Schedule and finished-score fallback",
      `${matches.length} worldcup26 games normalized`,
      ...(oddsEnriched.enrichmentAudit ? [oddsEnriched.enrichmentAudit.detail] : []),
    ],
    enrichmentAudit: oddsEnriched.enrichmentAudit,
    responseAudit: providerResponseAudit({
      source: "worldcup26",
      endpoint: "get/games",
      rowCount: games.length,
      sampleIds: games.map((game: any) => String(game.id ?? "")).filter(Boolean),
      httpStatus: res.status,
      startedAt,
    }),
  };
};

export const normalizeOpenFootballMatch = (match: any, index = 0): Match => {
  const ft = Array.isArray(match.score?.ft) ? match.score.ft : undefined;
  const homeScore = numberOrUndefined(ft?.[0]);
  const awayScore = numberOrUndefined(ft?.[1]);
  const hasFullTimeScore = homeScore !== undefined && awayScore !== undefined;
  const homeTeam = match.team1 ?? "Home";
  const awayTeam = match.team2 ?? "Away";
  return withCoverage({
    id: `openfootball-${match.num ?? match.id ?? `${match.date ?? "match"}-${index + 1}`}`,
    homeTeam,
    awayTeam,
    kickoffAt: normalizeOpenFootballKickoff(match.date, match.time),
    stage: match.group ? `${match.group} · ${match.round ?? "World Cup"}` : match.round ?? "FIFA World Cup",
    status: hasFullTimeScore ? "finished" : "upcoming",
    dataSource: "openfootball",
    homeScore,
    awayScore,
    venue: match.ground,
    insights: insightShell(homeTeam, awayTeam, "openfootball"),
  });
};

export const loadFromOpenFootball = async (): Promise<ProviderResult> => {
  const startedAt = Date.now();
  const res = await timeoutFetch(publicDataUrl(OPENFOOTBALL_WORLDCUP_URL, "openfootball"), 7500);
  if (!res.ok) throw new Error(`openfootball returned ${res.status}`);
  const data = await res.json();
  const rawMatches = Array.isArray(data.matches) ? data.matches : [];
  const matches = rawMatches.map(normalizeOpenFootballMatch);
  if (matches.length === 0) throw new Error("openfootball returned no matches");
  const oddsEnriched = await enrichMatchesFromOddsApi(matches, "openfootball");
  return {
    source: "openfootball",
    matches: oddsEnriched.matches,
    evidence: [
      "openfootball/worldcup.json 2026 public-domain JSON feed",
      "No-key schedule and full-time score continuity route",
      `${matches.length} openfootball matches normalized`,
      ...(oddsEnriched.enrichmentAudit ? [oddsEnriched.enrichmentAudit.detail] : []),
    ],
    enrichmentAudit: oddsEnriched.enrichmentAudit,
    responseAudit: providerResponseAudit({
      source: "openfootball",
      endpoint: "openfootball/worldcup.json/2026/worldcup.json",
      rowCount: rawMatches.length,
      sampleIds: rawMatches.map((item: any, index: number) => String(item.num ?? item.id ?? index + 1)).filter(Boolean),
      httpStatus: res.status,
      startedAt,
    }),
  };
};

export const normalizeApiFootballFixture = (item: any, stamp = new Date().toISOString()): Match =>
  withCoverage({
    id: `api-football-${item.fixture?.id}`,
    homeTeam: item.teams?.home?.name ?? "Home",
    awayTeam: item.teams?.away?.name ?? "Away",
    kickoffAt: item.fixture?.date,
    stage: item.league?.round ?? "FIFA World Cup",
    status: normalizeStatus(item.fixture?.status?.long),
    dataSource: "api-football",
    homeScore: numberOrUndefined(item.goals?.home),
    awayScore: numberOrUndefined(item.goals?.away),
    venue: item.fixture?.venue?.name,
    insights: {
      home: {
        fifaRank: 0,
        form: ["API", "LIVE", "FORM"],
        lastFiveGoalsFor: numberOrUndefined(item.goals?.home) ?? 0,
        lastFiveGoalsAgainst: numberOrUndefined(item.goals?.away) ?? 0,
        unavailable: ["Injury enrichment not yet loaded"],
        probableLineup: ["Lineup enrichment not yet loaded"],
      },
      away: {
        fifaRank: 0,
        form: ["API", "LIVE", "FORM"],
        lastFiveGoalsFor: numberOrUndefined(item.goals?.away) ?? 0,
        lastFiveGoalsAgainst: numberOrUndefined(item.goals?.home) ?? 0,
        unavailable: ["Injury enrichment not yet loaded"],
        probableLineup: ["Lineup enrichment not yet loaded"],
      },
      headToHead: "API-Football can supply H2H by team ids after fixture selection.",
      marketLine: "Odds enrichment not yet loaded.",
      oddsSnapshot: "Odds enrichment not yet loaded.",
      lineupSource: "API-Football fixture feed only; lineups endpoint not yet loaded",
      injurySource: "API-Football fixture feed only; injuries endpoint not yet loaded",
      dataFreshness: stamp,
    },
  });

const fixtureIdFromApiFootballMatch = (match: Match) =>
  match.id.startsWith("api-football-") ? match.id.replace("api-football-", "") : "";

const endpointLiveCount = (matches: Match[], key: DataCoverageItem["key"]) =>
  matches.filter((match) => {
    const item = (match.insights?.dataCoverage ?? buildDataCoverage(match)).find((coverage) => coverage.key === key);
    return item?.status === "live";
  }).length;

const endpointReadbackCount = (matches: Match[], key: DataCoverageItem["key"]) =>
  matches.filter((match) => {
    const item = (match.insights?.dataCoverage ?? buildDataCoverage(match)).find((coverage) => coverage.key === key);
    return item?.status === "live" || item?.status === "configured";
  }).length;

export const buildApiFootballEnrichmentAudit = ({
  totalFixtures,
  attemptedFixtureIds,
  enrichedMatches,
  failures,
  checkedAt = new Date().toISOString(),
}: {
  totalFixtures: number;
  attemptedFixtureIds: string[];
  enrichedMatches: Match[];
  failures: Array<{ fixtureId: string; message: string }>;
  checkedAt?: string;
}): ProviderEnrichmentAudit => {
  const attempted = attemptedFixtureIds.length;
  const fulfilled = Math.max(0, attempted - failures.length);
  const sampleIds = attemptedFixtureIds.slice(0, 5);
  const endpointAudits = [
    {
      key: "lineups" as const,
      endpoint: "fixtures/lineups?fixture=<fixture-id>",
      attempted,
      fulfilled,
      live: endpointLiveCount(enrichedMatches, "lineups"),
      errors: failures.length,
      sampleIds,
    },
    {
      key: "injuries" as const,
      endpoint: "injuries?fixture=<fixture-id>",
      attempted,
      fulfilled,
      live: endpointLiveCount(enrichedMatches, "injuries"),
      errors: failures.length,
      sampleIds,
    },
    {
      key: "odds" as const,
      endpoint: "odds?fixture=<fixture-id>",
      attempted,
      fulfilled,
      live: endpointLiveCount(enrichedMatches, "odds"),
      errors: failures.length,
      sampleIds,
    },
    {
      key: "standings" as const,
      endpoint: "standings?league=<league-id>&season=<season>",
      attempted,
      fulfilled,
      live: endpointReadbackCount(enrichedMatches, "rankings"),
      errors: failures.length,
      sampleIds,
    },
  ];
  const liveSignals = endpointAudits.reduce((sum, item) => sum + item.live, 0);
  return {
    source: "api-football",
    checkedAt,
    totalFixtures,
    attemptedFixtures: attempted,
    endpointAudits,
    detail: `${attempted}/${totalFixtures} fixtures attempted · ${liveSignals} live enrichment signal${liveSignals === 1 ? "" : "s"} · ${failures.length} failed fixture${failures.length === 1 ? "" : "s"}`,
  };
};

const eventIdFromTheSportsDbMatch = (match: Match) =>
  match.id.startsWith("thesportsdb-") ? match.id.replace("thesportsdb-", "") : "";

type TheSportsDbTableStanding = {
  teamKey: string;
  teamName: string;
  position: number;
  points: number;
  record: string;
  played?: number;
  goalDifference?: number;
};

export const normalizeTheSportsDbTable = (data: any): TheSportsDbTableStanding[] => {
  const rows = Array.isArray(data?.table) ? data.table : [];
  return rows
    .map((row: any) => {
      const teamName = row.strTeam ?? row.name ?? row.team ?? "";
      const position = numberOrUndefined(row.intRank ?? row.intPosition ?? row.rank);
      const points = numberOrUndefined(row.intPoints ?? row.points);
      if (!teamName || !position || points === undefined) return undefined;
      const played = numberOrUndefined(row.intPlayed ?? row.played);
      const wins = numberOrUndefined(row.intWin ?? row.won) ?? 0;
      const draws = numberOrUndefined(row.intDraw ?? row.draw) ?? 0;
      const losses = numberOrUndefined(row.intLoss ?? row.lost) ?? 0;
      return {
        teamKey: teamKey(teamName),
        teamName,
        position,
        points,
        played,
        goalDifference: numberOrUndefined(row.intGoalDifference ?? row.intGoalsDiff ?? row.goalDifference),
        record: `${wins}-${draws}-${losses}`,
      } satisfies TheSportsDbTableStanding;
    })
    .filter(Boolean) as TheSportsDbTableStanding[];
};

const theSportsDbStandingForTeam = (standings: TheSportsDbTableStanding[], teamName: string) => {
  const key = teamKey(teamName);
  return standings.find((standing) => {
    const candidate = standing.teamKey;
    return candidate === key || candidate.includes(key) || key.includes(candidate);
  });
};

export const mergeTheSportsDbTable = (
  matches: Match[],
  standings: TheSportsDbTableStanding[],
  source = `TheSportsDB league table ${THESPORTSDB_LEAGUE_ID()}/${THESPORTSDB_SEASON()}`,
) => matches.map((match) => {
  const homeStanding = theSportsDbStandingForTeam(standings, match.homeTeam);
  const awayStanding = theSportsDbStandingForTeam(standings, match.awayTeam);
  if (!homeStanding && !awayStanding) return match;
  return withCoverage({
    ...match,
    insights: match.insights
      ? {
          ...match.insights,
          standingsSource: source,
          rankingSource: [match.insights.rankingSource, source].filter(Boolean).join(" + "),
          home: {
            ...match.insights.home,
            tablePosition: homeStanding?.position ?? match.insights.home.tablePosition,
            tablePoints: homeStanding?.points ?? match.insights.home.tablePoints,
            tableRecord: homeStanding?.record ?? match.insights.home.tableRecord,
            form: homeStanding
              ? [
                  "TABLE",
                  `#${homeStanding.position}`,
                  `${homeStanding.points}PTS`,
                  ...(homeStanding.played !== undefined ? [`${homeStanding.played}P`] : []),
                  ...(homeStanding.goalDifference !== undefined ? [`GD${homeStanding.goalDifference}`] : []),
                ]
              : match.insights.home.form,
          },
          away: {
            ...match.insights.away,
            tablePosition: awayStanding?.position ?? match.insights.away.tablePosition,
            tablePoints: awayStanding?.points ?? match.insights.away.tablePoints,
            tableRecord: awayStanding?.record ?? match.insights.away.tableRecord,
            form: awayStanding
              ? [
                  "TABLE",
                  `#${awayStanding.position}`,
                  `${awayStanding.points}PTS`,
                  ...(awayStanding.played !== undefined ? [`${awayStanding.played}P`] : []),
                  ...(awayStanding.goalDifference !== undefined ? [`GD${awayStanding.goalDifference}`] : []),
                ]
              : match.insights.away.form,
          },
        }
      : match.insights,
  });
});

export const buildTheSportsDbEnrichmentAudit = ({
  totalFixtures,
  attemptedEventIds,
  enrichedMatches,
  failures,
  standingsRows = 0,
  standingsOk = false,
  standingsEndpoint = "lookuptable.php?l=<league-id>&s=<season>",
  checkedAt = new Date().toISOString(),
}: {
  totalFixtures: number;
  attemptedEventIds: string[];
  enrichedMatches: Match[];
  failures: Array<{ eventId: string; message: string }>;
  standingsRows?: number;
  standingsOk?: boolean;
  standingsEndpoint?: string;
  checkedAt?: string;
}): ProviderEnrichmentAudit => {
  const attempted = attemptedEventIds.length;
  const fulfilled = Math.max(0, attempted - failures.length);
  const sampleIds = attemptedEventIds.slice(0, 5);
  const lineupsLive = endpointLiveCount(enrichedMatches, "lineups");
  const endpointAudits = [
    {
      key: "lineups" as const,
      endpoint: "lookuplineup.php?id=<event-id> + lookupeventstats.php?id=<event-id>",
      attempted,
      fulfilled,
      live: lineupsLive,
      errors: failures.length,
      sampleIds,
    },
    {
      key: "injuries" as const,
      endpoint: "not published by TheSportsDB",
      attempted: 0,
      fulfilled: 0,
      live: 0,
      errors: 0,
      sampleIds: [],
    },
    {
      key: "odds" as const,
      endpoint: "use The Odds API batch route when configured",
      attempted: 0,
      fulfilled: 0,
      live: endpointLiveCount(enrichedMatches, "odds"),
      errors: 0,
      sampleIds: [],
    },
    {
      key: "standings" as const,
      endpoint: standingsEndpoint,
      attempted: standingsOk ? attempted : 0,
      fulfilled: standingsOk ? attempted : 0,
      live: standingsOk && standingsRows > 0 ? endpointReadbackCount(enrichedMatches, "rankings") : 0,
      errors: standingsOk ? 0 : 1,
      sampleIds: standingsOk ? sampleIds : [],
    },
  ];
  const standingsDetail = standingsOk
    ? ` · ${standingsRows} table row${standingsRows === 1 ? "" : "s"} read back`
    : " · standings read-back missing";
  return {
    source: "thesportsdb",
    checkedAt,
    totalFixtures,
    attemptedFixtures: attempted,
    endpointAudits,
    detail: `${attempted}/${totalFixtures} events attempted · ${lineupsLive} live lineup signal${
      lineupsLive === 1 ? "" : "s"
    }${standingsDetail} · ${failures.length} failed event${failures.length === 1 ? "" : "s"}`,
  };
};

export const buildOddsApiEnrichmentAudit = ({
  source,
  totalFixtures,
  attemptedMatchIds,
  enrichedMatches,
  errors = 0,
  detail,
  checkedAt = new Date().toISOString(),
}: {
  source: DataSource;
  totalFixtures: number;
  attemptedMatchIds: string[];
  enrichedMatches: Match[];
  errors?: number;
  detail?: string;
  checkedAt?: string;
}): ProviderEnrichmentAudit => {
  const attempted = attemptedMatchIds.length;
  const live = endpointLiveCount(enrichedMatches, "odds");
  return {
    source,
    checkedAt,
    totalFixtures,
    attemptedFixtures: attempted,
    endpointAudits: [
      {
        key: "odds",
        endpoint: `The Odds API sports/${ODDS_API_SPORT_KEY() || "<sport-key>"}/odds`,
        attempted,
        fulfilled: Math.max(0, attempted - errors),
        live,
        errors,
        sampleIds: attemptedMatchIds.slice(0, 5),
      },
    ],
    detail: detail ?? `The Odds API batch read-back · ${live}/${attempted} fixture odds matched · ${errors} error${errors === 1 ? "" : "s"}`,
  };
};

export const buildFootballDataStandingsEnrichmentAudit = ({
  totalFixtures,
  attemptedMatchIds,
  enrichedMatches,
  standingsRows,
  standingsOk,
  endpoint,
  checkedAt = new Date().toISOString(),
}: {
  totalFixtures: number;
  attemptedMatchIds: string[];
  enrichedMatches: Match[];
  standingsRows: number;
  standingsOk: boolean;
  endpoint: string;
  checkedAt?: string;
}): ProviderEnrichmentAudit => {
  const attempted = standingsOk ? attemptedMatchIds.length : 0;
  const live = standingsOk && standingsRows > 0 ? endpointReadbackCount(enrichedMatches, "rankings") : 0;
  return {
    source: "football-data",
    checkedAt,
    totalFixtures,
    attemptedFixtures: attempted,
    endpointAudits: [
      {
        key: "standings",
        endpoint,
        attempted,
        fulfilled: attempted,
        live,
        errors: standingsOk ? 0 : 1,
        sampleIds: attemptedMatchIds.slice(0, 5),
      },
    ],
    detail: standingsOk
      ? `Football-Data.org standings read-back · ${live}/${attempted} fixture ranking rows matched · ${standingsRows} table row${standingsRows === 1 ? "" : "s"}`
      : "Football-Data.org standings read-back failed.",
  };
};

const mergeEnrichmentAudits = (
  base: ProviderEnrichmentAudit | undefined,
  odds: ProviderEnrichmentAudit | undefined,
): ProviderEnrichmentAudit | undefined => {
  if (!base) return odds;
  if (!odds) return base;
  const oddsEndpoint = odds.endpointAudits.find((item) => item.key === "odds");
  return {
    ...base,
    checkedAt: odds.checkedAt,
    endpointAudits: [
      ...base.endpointAudits.filter((item) => item.key !== "odds"),
      ...(oddsEndpoint ? [oddsEndpoint] : []),
    ],
    detail: `${base.detail} · ${odds.detail}`,
  };
};

const enrichApiFootballMatches = async (matches: Match[]) => {
  const targets = matches
    .map((match) => ({ match, fixtureId: fixtureIdFromApiFootballMatch(match) }))
    .filter((item) => item.fixtureId)
    .slice(0, API_FOOTBALL_ENRICHMENT_LIMIT());
  if (targets.length === 0) {
    return {
      matches,
      enrichmentAudit: buildApiFootballEnrichmentAudit({
        totalFixtures: matches.length,
        attemptedFixtureIds: [],
        enrichedMatches: [],
        failures: [],
      }),
    };
  }

  const settled = await Promise.allSettled(targets.map(({ match }) => enrichMatchFromApiFootball(match)));
  const enrichedById = new Map<string, Match>();
  const failures: Array<{ fixtureId: string; message: string }> = [];
  settled.forEach((result, index) => {
    const fixtureId = targets[index]?.fixtureId ?? "";
    if (result.status === "fulfilled") {
      enrichedById.set(targets[index].match.id, result.value);
    } else {
      failures.push({ fixtureId, message: (result.reason as Error).message });
    }
  });
  const nextMatches = matches.map((match) => enrichedById.get(match.id) ?? match);
  const enrichmentAudit = buildApiFootballEnrichmentAudit({
    totalFixtures: matches.length,
    attemptedFixtureIds: targets.map((target) => target.fixtureId),
    enrichedMatches: [...enrichedById.values()],
    failures,
  });
  return { matches: nextMatches, enrichmentAudit };
};

export const loadFromApiFootball = async (): Promise<ProviderResult> => {
  const directApiFootballKey = API_FOOTBALL_KEY();
  const startedAt = Date.now();
  const season = new Date().getUTCFullYear();
  const fixturesEndpoint = `${API_FOOTBALL_HOST}/fixtures?league=1&season=${season}&next=40`;
  const fixturesUrl = buildDataProxyUrl(fixturesEndpoint, "api-football");
  if (!directApiFootballKey && fixturesUrl === fixturesEndpoint) {
    throw new Error("VITE_APIFOOTBALL_KEY or data proxy API-Football key is not configured");
  }
  const [fixturesResult, standingsResult] = await Promise.allSettled([
    timeoutFetch(fixturesUrl, 7500, fixturesUrl === fixturesEndpoint ? { "x-apisports-key": directApiFootballKey } : undefined),
    apiFootballJson(`/standings?league=1&season=${season}`),
  ]);
  if (fixturesResult.status === "rejected") throw fixturesResult.reason;
  const res = fixturesResult.value;
  if (!res.ok) throw new Error(`API-Football returned ${res.status}`);
  const data = await res.json();
  const fixtures = Array.isArray(data.response) ? data.response : [];
  const baseMatches: Match[] = fixtures.map((item: any) => normalizeApiFootballFixture(item));
  if (baseMatches.length === 0) throw new Error("API-Football returned no matches");
  let matches = baseMatches;
  let standingsEvidence = "API-Football standings endpoint not read back.";
  if (standingsResult.status === "fulfilled") {
    const standings = normalizeApiFootballStandings(standingsResult.value);
    matches = mergeFootballDataStandings(baseMatches, standings, `API-Football standings league=1 season=${season}`);
    standingsEvidence = `${standings.length} API-Football standing rows normalized`;
  } else {
    standingsEvidence = `API-Football standings failed: ${(standingsResult.reason as Error).message}`;
  }
  const enriched = await enrichApiFootballMatches(matches);
  return {
    source: "api-football",
    matches: enriched.matches,
    evidence: [
      "API-Football fixtures endpoint",
      standingsEvidence,
      "Fixture rows prove schedule/score only; enrichment evidence comes from lineups, injuries and odds endpoint read-back",
      enriched.enrichmentAudit.detail,
    ],
    enrichmentAudit: enriched.enrichmentAudit,
    responseAudit: providerResponseAudit({
      source: "api-football",
      endpoint: `fixtures league=1 season=${season} next=40`,
      rowCount: fixtures.length,
      sampleIds: fixtures.map((item: any) => String(item.fixture?.id ?? "")).filter(Boolean),
      httpStatus: res.status,
      startedAt,
    }),
  };
};

export const normalizeFootballDataMatch = (item: any): Match => {
  const homeTeam = item.homeTeam?.shortName ?? item.homeTeam?.name ?? "Home";
  const awayTeam = item.awayTeam?.shortName ?? item.awayTeam?.name ?? "Away";
  const homeScore = numberOrUndefined(item.score?.fullTime?.home ?? item.score?.regularTime?.home);
  const awayScore = numberOrUndefined(item.score?.fullTime?.away ?? item.score?.regularTime?.away);
  const stamp = new Date().toISOString();
  return withCoverage({
    id: `football-data-${item.id}`,
    homeTeam,
    awayTeam,
    kickoffAt: item.utcDate,
    stage: item.stage ?? item.group ?? "FIFA World Cup",
    status: normalizeFootballDataStatus(item.status),
    dataSource: "football-data",
    homeScore,
    awayScore,
    venue: item.venue,
    insights: {
      ...insightShell(homeTeam, awayTeam, "Football-Data.org", stamp),
      home: {
        ...insightShell(homeTeam, awayTeam, "Football-Data.org", stamp).home,
        lastFiveGoalsFor: homeScore ?? 0,
        lastFiveGoalsAgainst: awayScore ?? 0,
      },
      away: {
        ...insightShell(homeTeam, awayTeam, "Football-Data.org", stamp).away,
        lastFiveGoalsFor: awayScore ?? 0,
        lastFiveGoalsAgainst: homeScore ?? 0,
      },
    },
  });
};

export const loadFromFootballData = async (): Promise<ProviderResult> => {
  const directFootballDataToken = FOOTBALL_DATA_TOKEN();
  const startedAt = Date.now();
  const season = new Date().getUTCFullYear();
  const matchesEndpoint = `${FOOTBALL_DATA_HOST}/competitions/${FOOTBALL_DATA_COMPETITION()}/matches?season=${season}`;
  const standingsEndpoint = `${FOOTBALL_DATA_HOST}/competitions/${FOOTBALL_DATA_COMPETITION()}/standings?season=${season}`;
  const matchesUrl = buildDataProxyUrl(matchesEndpoint, "football-data");
  const standingsUrl = buildDataProxyUrl(standingsEndpoint, "football-data");
  if (!directFootballDataToken && matchesUrl === matchesEndpoint) {
    throw new Error("VITE_FOOTBALL_DATA_TOKEN or data proxy Football-Data token is not configured");
  }
  const requestHeaders = matchesUrl === matchesEndpoint ? { "X-Auth-Token": directFootballDataToken } : undefined;
  const [matchesResult, standingsResult] = await Promise.allSettled([
    timeoutFetch(matchesUrl, 7500, requestHeaders),
    timeoutFetch(standingsUrl, 7500, requestHeaders),
  ]);
  if (matchesResult.status === "rejected") throw matchesResult.reason;
  const res = matchesResult.value;
  if (!res.ok) throw new Error(`Football-Data.org returned ${res.status}`);
  const data = await res.json();
  const baseMatches: Match[] = Array.isArray(data.matches) ? data.matches.map(normalizeFootballDataMatch) : [];
  if (baseMatches.length === 0) throw new Error("Football-Data.org returned no matches");
  let matches: Match[] = baseMatches;
  let standingsRows = 0;
  let standingsOk = false;
  let standingsEvidence = "Football-Data.org standings endpoint not read back.";
  if (standingsResult.status === "fulfilled" && standingsResult.value.ok) {
    const standingsData = await standingsResult.value.json();
    const standings = normalizeFootballDataStandings(standingsData);
    standingsRows = standings.length;
    standingsOk = true;
    matches = mergeFootballDataStandings(baseMatches, standings, `Football-Data.org ${FOOTBALL_DATA_COMPETITION()} standings ${season}`);
    standingsEvidence = `${standings.length} Football-Data.org standing rows normalized`;
  } else if (standingsResult.status === "fulfilled") {
    standingsEvidence = `Football-Data.org standings returned ${standingsResult.value.status}`;
  } else {
    standingsEvidence = `Football-Data.org standings failed: ${(standingsResult.reason as Error).message}`;
  }
  const standingAudit = buildFootballDataStandingsEnrichmentAudit({
    totalFixtures: matches.length,
    attemptedMatchIds: matches.map((match) => match.id),
    enrichedMatches: matches,
    standingsRows,
    standingsOk,
    endpoint: `competitions/${FOOTBALL_DATA_COMPETITION()}/standings?season=${season}`,
  });
  const oddsEnriched = await enrichMatchesFromOddsApi(matches, "football-data");
  const enrichmentAudit = mergeEnrichmentAudits(standingAudit, oddsEnriched.enrichmentAudit);
  return {
    source: "football-data",
    matches: oddsEnriched.matches,
    evidence: [
      `Football-Data.org competition ${FOOTBALL_DATA_COMPETITION()} matches endpoint`,
      "Fixtures, live/final scores, stage, venue, team metadata and standings when the plan exposes them",
      `${matches.length} Football-Data.org matches normalized`,
      standingsEvidence,
      ...(oddsEnriched.enrichmentAudit ? [oddsEnriched.enrichmentAudit.detail] : []),
      standingAudit.detail,
    ],
    enrichmentAudit,
    responseAudit: providerResponseAudit({
      source: "football-data",
      endpoint: `competitions/${FOOTBALL_DATA_COMPETITION()}/matches season=${season}`,
      rowCount: Array.isArray(data.matches) ? data.matches.length : 0,
      sampleIds: Array.isArray(data.matches) ? data.matches.map((item: any) => String(item.id ?? "")).filter(Boolean) : [],
      httpStatus: res.status,
      startedAt,
    }),
  };
};

export const normalizeTheSportsDbEvent = (event: any): Match => {
  const homeTeam = event.strHomeTeam ?? "Home";
  const awayTeam = event.strAwayTeam ?? "Away";
  const homeScore = numberOrUndefined(event.intHomeScore);
  const awayScore = numberOrUndefined(event.intAwayScore);
  const stamp = new Date().toISOString();
  return withCoverage({
    id: `thesportsdb-${event.idEvent}`,
    homeTeam,
    awayTeam,
    kickoffAt: normalizeTheSportsDbKickoff(event),
    stage: normalizeTheSportsDbStage(event.intRound),
    status: normalizeTheSportsDbStatus(event.strStatus),
    dataSource: "thesportsdb",
    homeScore,
    awayScore,
    venue: [event.strVenue, event.strCity, event.strCountry].filter(Boolean).join(" · ") || undefined,
    insights: {
      ...insightShell(homeTeam, awayTeam, "TheSportsDB", stamp),
      home: {
        ...insightShell(homeTeam, awayTeam, "TheSportsDB", stamp).home,
        lastFiveGoalsFor: homeScore ?? 0,
        lastFiveGoalsAgainst: awayScore ?? 0,
      },
      away: {
        ...insightShell(homeTeam, awayTeam, "TheSportsDB", stamp).away,
        lastFiveGoalsFor: awayScore ?? 0,
        lastFiveGoalsAgainst: homeScore ?? 0,
      },
      headToHead: event.strEvent
        ? `${event.strEvent} normalized from TheSportsDB event ${event.idEvent}.`
        : `${homeTeam} vs ${awayTeam} normalized from TheSportsDB.`,
      marketLine: "TheSportsDB does not publish betting odds; enrich with The Odds API for markets.",
      oddsSnapshot: "Odds enrichment not loaded.",
      lineupSource: "TheSportsDB event lineup endpoint",
      injurySource: "No injury feed configured for TheSportsDB",
    },
  });
};

export const loadFromTheSportsDb = async (): Promise<ProviderResult> => {
  const seasonUrl = `${THESPORTSDB_HOST()}/eventsseason.php?id=${encodeURIComponent(THESPORTSDB_LEAGUE_ID())}&s=${encodeURIComponent(THESPORTSDB_SEASON())}`;
  const tableEndpoint = `lookuptable ${THESPORTSDB_LEAGUE_ID()}/${THESPORTSDB_SEASON()}`;
  const tableUrl = `${THESPORTSDB_HOST()}/lookuptable.php?l=${encodeURIComponent(THESPORTSDB_LEAGUE_ID())}&s=${encodeURIComponent(THESPORTSDB_SEASON())}`;
  const startedAt = Date.now();
  const [seasonResult, tableResult] = await Promise.allSettled([
    timeoutFetch(publicDataUrl(seasonUrl, "thesportsdb"), 7500),
    timeoutFetch(publicDataUrl(tableUrl, "thesportsdb"), 7500),
  ]);
  if (seasonResult.status === "rejected") throw seasonResult.reason;
  const seasonRes = seasonResult.value;
  if (!seasonRes.ok) throw new Error(`TheSportsDB season returned ${seasonRes.status}`);
  const seasonData = await seasonRes.json();
  let events = Array.isArray(seasonData.events) ? seasonData.events : [];
  let endpoint = `eventsseason ${THESPORTSDB_LEAGUE_ID()}/${THESPORTSDB_SEASON()}`;
  let httpStatus = seasonRes.status;

  if (events.length === 0) {
    const nextRes = await timeoutFetch(
      publicDataUrl(
        `${THESPORTSDB_HOST()}/eventsnextleague.php?id=${encodeURIComponent(THESPORTSDB_LEAGUE_ID())}`,
        "thesportsdb",
      ),
      7500,
    );
    if (!nextRes.ok) throw new Error(`TheSportsDB next league returned ${nextRes.status}`);
    const nextData = await nextRes.json();
    events = Array.isArray(nextData.events) ? nextData.events : [];
    endpoint = `eventsnextleague ${THESPORTSDB_LEAGUE_ID()}`;
    httpStatus = nextRes.status;
  }

  const baseMatches = events.map(normalizeTheSportsDbEvent);
  if (baseMatches.length === 0) throw new Error("TheSportsDB returned no World Cup events");
  let tableRows: TheSportsDbTableStanding[] = [];
  let tableOk = false;
  let tableEvidence = "TheSportsDB league table read-back missing.";
  if (tableResult.status === "fulfilled" && tableResult.value.ok) {
    const tableData = await tableResult.value.json();
    tableRows = normalizeTheSportsDbTable(tableData);
    tableOk = tableRows.length > 0;
    tableEvidence = `${tableRows.length} TheSportsDB league table rows normalized`;
  } else if (tableResult.status === "fulfilled") {
    tableEvidence = `TheSportsDB league table returned ${tableResult.value.status}`;
  } else {
    tableEvidence = `TheSportsDB league table failed: ${(tableResult.reason as Error).message}`;
  }
  const matches = tableRows.length > 0
    ? mergeTheSportsDbTable(baseMatches, tableRows, `TheSportsDB ${tableEndpoint}`)
    : baseMatches;
  const enriched = await enrichTheSportsDbMatches(matches, {
    rows: tableRows.length,
    ok: tableOk,
    endpoint: tableEndpoint,
  });
  const oddsEnriched = await enrichMatchesFromOddsApi(enriched.matches, "thesportsdb", enriched.enrichmentAudit);
  return {
    source: "thesportsdb",
    matches: oddsEnriched.matches,
    evidence: [
      `TheSportsDB ${endpoint}`,
      "Free v1 JSON API with schedule, score, venue, event artwork and status fields",
      `${matches.length} TheSportsDB World Cup events normalized`,
      tableEvidence,
      oddsEnriched.enrichmentAudit?.detail ?? enriched.enrichmentAudit.detail,
    ],
    enrichmentAudit: oddsEnriched.enrichmentAudit,
    responseAudit: providerResponseAudit({
      source: "thesportsdb",
      endpoint,
      rowCount: events.length,
      sampleIds: events.map((event: any) => String(event.idEvent ?? "")).filter(Boolean),
      httpStatus,
      startedAt,
    }),
  };
};

const apiFootballJson = async (path: string) => {
  const targetUrl = `${API_FOOTBALL_HOST}${path}`;
  const proxyUrl = buildDataProxyUrl(targetUrl, "api-football");
  if (!API_FOOTBALL_KEY() && proxyUrl === targetUrl) throw new Error("VITE_APIFOOTBALL_KEY or data proxy API-Football key is not configured");
  const headers = proxyUrl === targetUrl ? { "x-apisports-key": API_FOOTBALL_KEY() } : undefined;
  const res = await timeoutFetch(proxyUrl, 7500, headers);
  if (!res.ok) throw new Error(`API-Football ${path} returned ${res.status}`);
  return res.json();
};

const teamKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

type FootballDataStanding = {
  teamKey: string;
  teamName: string;
  position: number;
  points: number;
  record: string;
  group?: string;
};

const normalizeFootballDataStandings = (data: any): FootballDataStanding[] => {
  const groups = Array.isArray(data?.standings) ? data.standings : [];
  return groups.flatMap((standing: any) => {
    const group = standing.group ?? standing.stage ?? standing.type;
    const table = Array.isArray(standing.table) ? standing.table : [];
    return table
      .map((row: any) => {
        const teamName = row.team?.shortName ?? row.team?.name ?? row.team?.tla ?? "";
        const position = numberOrUndefined(row.position);
        const points = numberOrUndefined(row.points);
        if (!teamName || !position || points === undefined) return undefined;
        return {
          teamKey: teamKey(teamName),
          teamName,
          position,
          points,
          record: `${row.won ?? 0}-${row.draw ?? 0}-${row.lost ?? 0}`,
          group: group ? String(group) : undefined,
        } satisfies FootballDataStanding;
      })
      .filter(Boolean) as FootballDataStanding[];
  });
};

export const normalizeApiFootballStandings = (data: any): FootballDataStanding[] => {
  const leagues = Array.isArray(data?.response) ? data.response : [];
  return leagues.flatMap((item: any) => {
    const groups = Array.isArray(item?.league?.standings)
      ? item.league.standings
      : Array.isArray(item?.standings)
        ? item.standings
        : [];
    return groups.flatMap((groupRows: any) => {
      const table = Array.isArray(groupRows) ? groupRows : [groupRows];
      return table
        .map((row: any) => {
          const teamName = row.team?.name ?? row.teamName ?? "";
          const position = numberOrUndefined(row.rank ?? row.position);
          const points = numberOrUndefined(row.points);
          if (!teamName || !position || points === undefined) return undefined;
          return {
            teamKey: teamKey(teamName),
            teamName,
            position,
            points,
            record: `${row.all?.win ?? row.won ?? 0}-${row.all?.draw ?? row.draw ?? 0}-${row.all?.lose ?? row.lost ?? 0}`,
            group: row.group ? String(row.group) : undefined,
          } satisfies FootballDataStanding;
        })
        .filter(Boolean) as FootballDataStanding[];
    });
  });
};

const standingForTeam = (standings: FootballDataStanding[], teamName: string) => {
  const key = teamKey(teamName);
  return standings.find((standing) => {
    const candidate = standing.teamKey;
    return candidate === key || candidate.includes(key) || key.includes(candidate);
  });
};

export const mergeFootballDataStandings = (
  matches: Match[],
  standings: FootballDataStanding[],
  source = `Football-Data.org standings ${FOOTBALL_DATA_COMPETITION()}`,
) => matches.map((match) => {
  const homeStanding = standingForTeam(standings, match.homeTeam);
  const awayStanding = standingForTeam(standings, match.awayTeam);
  if (!homeStanding && !awayStanding) return match;
  return withCoverage({
    ...match,
    insights: match.insights
      ? {
          ...match.insights,
          standingsSource: source,
          rankingSource: [match.insights.rankingSource, source].filter(Boolean).join(" + "),
          home: {
            ...match.insights.home,
            tablePosition: homeStanding?.position ?? match.insights.home.tablePosition,
            tablePoints: homeStanding?.points ?? match.insights.home.tablePoints,
            tableRecord: homeStanding?.record ?? match.insights.home.tableRecord,
            form: homeStanding
              ? [`TABLE`, `#${homeStanding.position}`, `${homeStanding.points}PTS`, ...(homeStanding.group ? [homeStanding.group] : [])]
              : match.insights.home.form,
          },
          away: {
            ...match.insights.away,
            tablePosition: awayStanding?.position ?? match.insights.away.tablePosition,
            tablePoints: awayStanding?.points ?? match.insights.away.tablePoints,
            tableRecord: awayStanding?.record ?? match.insights.away.tableRecord,
            form: awayStanding
              ? [`TABLE`, `#${awayStanding.position}`, `${awayStanding.points}PTS`, ...(awayStanding.group ? [awayStanding.group] : [])]
              : match.insights.away.form,
          },
        }
      : match.insights,
  });
});

const oddsApiJson = async () => {
  if (!ODDS_API_CONFIGURED()) {
    throw new Error("The Odds API is not configured; set VITE_ODDS_API_SPORT_KEY plus a data proxy with server-side ODDS_API_KEY, or VITE_ODDS_API_KEY for direct diagnostics");
  }
  const params = new URLSearchParams({
    regions: "us,uk,eu",
    markets: "h2h",
    oddsFormat: "decimal",
  });
  if (ODDS_API_KEY() && !DATA_PROXY_URL()) params.set("apiKey", ODDS_API_KEY());
  const targetUrl = `${ODDS_API_HOST}/sports/${ODDS_API_SPORT_KEY()}/odds?${params.toString()}`;
  const res = await timeoutFetch(
    ODDS_API_KEY() && !DATA_PROXY_URL() ? targetUrl : buildDataProxyUrl(targetUrl, "odds-api"),
    7500,
  );
  if (!res.ok) throw new Error(`The Odds API returned ${res.status}`);
  return res.json();
};

export const mergeOddsIntoMatch = (match: Match, oddsRows: any[]): Match | undefined => {
  const home = teamKey(match.homeTeam);
  const away = teamKey(match.awayTeam);
  const event = oddsRows.find((row) => {
    const rowHome = teamKey(row.home_team ?? "");
    const rowAway = teamKey(row.away_team ?? "");
    return (rowHome.includes(home) || home.includes(rowHome)) && (rowAway.includes(away) || away.includes(rowAway));
  });
  const bookmaker = event?.bookmakers?.[0];
  const market = bookmaker?.markets?.find((item: any) => item.key === "h2h") ?? bookmaker?.markets?.[0];
  const oddsSnapshot = market?.outcomes
    ?.slice(0, 3)
    ?.map((outcome: any) => `${outcome.name} ${outcome.price}`)
    ?.join(" · ");
  if (!oddsSnapshot) return undefined;
  return withCoverage({
    ...match,
    insights: {
      ...(match.insights ?? insightShell(match.homeTeam, match.awayTeam, sourceLabel(match.dataSource))),
      marketLine: `${bookmaker?.title ?? "Bookmaker"} · ${market?.key ?? "odds"} · ${oddsSnapshot}`,
      oddsSnapshot,
      dataFreshness: new Date().toISOString(),
    },
  });
};

const enrichMatchesFromOddsApi = async (
  matches: Match[],
  source: DataSource,
  baseAudit?: ProviderEnrichmentAudit,
) => {
  if (!ODDS_API_CONFIGURED() || matches.length === 0) {
    return { matches, enrichmentAudit: baseAudit };
  }
  const attemptedIds = matches.map((match) => match.id);
  try {
    const oddsRows = await oddsApiJson();
    if (!Array.isArray(oddsRows)) {
      return {
        matches,
        enrichmentAudit: mergeEnrichmentAudits(
          baseAudit,
          buildOddsApiEnrichmentAudit({
            source,
            totalFixtures: matches.length,
            attemptedMatchIds: attemptedIds,
            enrichedMatches: [],
            errors: matches.length,
            detail: "The Odds API batch response was not an array.",
          }),
        ),
      };
    }
    const enrichedById = new Map<string, Match>();
    for (const match of matches) {
      const enriched = mergeOddsIntoMatch(match, oddsRows);
      if (enriched) enrichedById.set(match.id, enriched);
    }
    const nextMatches = matches.map((match) => enrichedById.get(match.id) ?? match);
    return {
      matches: nextMatches,
      enrichmentAudit: mergeEnrichmentAudits(
        baseAudit,
        buildOddsApiEnrichmentAudit({
          source,
          totalFixtures: matches.length,
          attemptedMatchIds: attemptedIds,
          enrichedMatches: [...enrichedById.values()],
        }),
      ),
    };
  } catch (error) {
    return {
      matches,
      enrichmentAudit: mergeEnrichmentAudits(
        baseAudit,
        buildOddsApiEnrichmentAudit({
          source,
          totalFixtures: matches.length,
          attemptedMatchIds: attemptedIds,
          enrichedMatches: [],
          errors: matches.length,
          detail: `The Odds API batch read-back failed: ${(error as Error).message}`,
        }),
      ),
    };
  }
};

const enrichMatchFromOddsApi = async (match: Match): Promise<Match | undefined> => {
  const oddsRows = await oddsApiJson();
  if (!Array.isArray(oddsRows)) return undefined;
  return mergeOddsIntoMatch(match, oddsRows);
};

type ApiFootballEnrichmentPayload = {
  lineupRows: any[];
  injuryRows: any[];
  oddsRows: any[];
  lineupsOk: boolean;
  injuriesOk: boolean;
  oddsOk: boolean;
  lineupsError?: unknown;
  injuriesError?: unknown;
};

export const mergeApiFootballEnrichment = (
  match: Match,
  {
    lineupRows,
    injuryRows,
    oddsRows,
    lineupsOk,
    injuriesOk,
    oddsOk,
    lineupsError,
    injuriesError,
  }: ApiFootballEnrichmentPayload,
): Match => {
  const homeLineup = lineupRows.find((row: any) => row.team?.name === match.homeTeam);
  const awayLineup = lineupRows.find((row: any) => row.team?.name === match.awayTeam);
  const homeInjuries = injuryRows
    .filter((row: any) => row.team?.name === match.homeTeam)
    .map((row: any) => row.player?.name ?? row.player?.id)
    .filter(Boolean)
    .slice(0, 5);
  const awayInjuries = injuryRows
    .filter((row: any) => row.team?.name === match.awayTeam)
    .map((row: any) => row.player?.name ?? row.player?.id)
    .filter(Boolean)
    .slice(0, 5);
  const firstBookmaker = oddsRows[0]?.bookmakers?.[0];
  const firstBet = firstBookmaker?.bets?.[0];
  const oddsSnapshot = firstBet?.values
    ?.slice(0, 3)
    ?.map((value: any) => `${value.value} ${value.odd}`)
    ?.join(" · ");
  return withCoverage({
    ...match,
    insights: {
      home: {
        ...(match.insights?.home ?? {
          fifaRank: 0,
          form: [],
          lastFiveGoalsFor: 0,
          lastFiveGoalsAgainst: 0,
          unavailable: [],
          probableLineup: [],
        }),
        unavailable: homeInjuries.length > 0 ? homeInjuries : ["No API-reported injuries"],
        probableLineup: homeLineup?.startXI?.map((item: any) => item.player?.name).filter(Boolean).slice(0, 11) ?? ["Lineup not published yet"],
      },
      away: {
        ...(match.insights?.away ?? {
          fifaRank: 0,
          form: [],
          lastFiveGoalsFor: 0,
          lastFiveGoalsAgainst: 0,
          unavailable: [],
          probableLineup: [],
        }),
        unavailable: awayInjuries.length > 0 ? awayInjuries : ["No API-reported injuries"],
        probableLineup: awayLineup?.startXI?.map((item: any) => item.player?.name).filter(Boolean).slice(0, 11) ?? ["Lineup not published yet"],
      },
      headToHead: match.insights?.headToHead ?? "H2H endpoint can be called once both team ids are available.",
      marketLine: oddsSnapshot ? `${firstBookmaker?.name ?? "Bookmaker"} · ${firstBet?.name ?? "Odds"} · ${oddsSnapshot}` : "Odds not published for this fixture.",
      oddsSnapshot: oddsSnapshot ?? (oddsOk ? "No odds payload returned." : "API-Football odds endpoint unavailable."),
      lineupSource: lineupsOk ? "API-Football lineups endpoint" : `Lineups unavailable: ${lineupsError}`,
      injurySource: injuriesOk ? "API-Football injuries endpoint" : `Injuries unavailable: ${injuriesError}`,
      dataFreshness: new Date().toISOString(),
    },
  });
};

export const enrichMatchFromApiFootball = async (match: Match): Promise<Match> => {
  const fixtureId = match.id.startsWith("api-football-")
    ? match.id.replace("api-football-", "")
    : "";
  if (!fixtureId) throw new Error("Select an API-Football fixture to enrich lineups, injuries and odds.");
  const [lineups, injuries, odds] = await Promise.allSettled([
    apiFootballJson(`/fixtures/lineups?fixture=${fixtureId}`),
    apiFootballJson(`/injuries?fixture=${fixtureId}`),
    apiFootballJson(`/odds?fixture=${fixtureId}`),
  ]);
  const lineupRows = lineups.status === "fulfilled" && Array.isArray(lineups.value.response)
    ? lineups.value.response
    : [];
  const injuryRows = injuries.status === "fulfilled" && Array.isArray(injuries.value.response)
    ? injuries.value.response
    : [];
  const oddsRows = odds.status === "fulfilled" && Array.isArray(odds.value.response)
    ? odds.value.response
    : [];
  return mergeApiFootballEnrichment(match, {
    lineupRows,
    injuryRows,
    oddsRows,
    lineupsOk: lineups.status === "fulfilled",
    injuriesOk: injuries.status === "fulfilled",
    oddsOk: odds.status === "fulfilled",
    lineupsError: lineups.status === "rejected" ? lineups.reason : undefined,
    injuriesError: injuries.status === "rejected" ? injuries.reason : undefined,
  });
};

export const mergeTheSportsDbEventDetails = (match: Match, lineupRows: any[], statRows: any[]): Match => {
  const starters = lineupRows.filter((row: any) => String(row.strSubstitute).toLowerCase() !== "yes");
  const homeLineup = starters
    .filter((row: any) => String(row.strHome).toLowerCase() === "yes")
    .map((row: any) => row.strPlayer)
    .filter(Boolean)
    .slice(0, 11);
  const awayLineup = starters
    .filter((row: any) => String(row.strHome).toLowerCase() === "no")
    .map((row: any) => row.strPlayer)
    .filter(Boolean)
    .slice(0, 11);
  const statSummary = statRows
    .slice(0, 4)
    .map((row: any) => `${row.strStat}: ${row.intHome ?? "-"}-${row.intAway ?? "-"}`)
    .join(" · ");
  const publishedLineups = homeLineup.length > 0 || awayLineup.length > 0;
  return withCoverage({
    ...match,
    insights: {
      ...(match.insights ?? insightShell(match.homeTeam, match.awayTeam, "TheSportsDB")),
      home: {
        ...(match.insights?.home ?? insightShell(match.homeTeam, match.awayTeam, "TheSportsDB").home),
        probableLineup: homeLineup.length > 0 ? homeLineup : ["Lineup not published yet"],
      },
      away: {
        ...(match.insights?.away ?? insightShell(match.homeTeam, match.awayTeam, "TheSportsDB").away),
        probableLineup: awayLineup.length > 0 ? awayLineup : ["Lineup not published yet"],
      },
      headToHead: statSummary
        ? `TheSportsDB match stats · ${statSummary}`
        : match.insights?.headToHead ?? `${match.homeTeam} vs ${match.awayTeam} TheSportsDB event.`,
      lineupSource: publishedLineups
        ? "TheSportsDB event lineup endpoint"
        : "TheSportsDB lineup endpoint returned no published XI",
      injurySource: match.insights?.injurySource ?? "No injury feed configured for TheSportsDB",
      dataFreshness: new Date().toISOString(),
    },
  });
};

export const enrichMatchFromTheSportsDb = async (match: Match): Promise<Match> => {
  const eventId = match.id.startsWith("thesportsdb-") ? match.id.replace("thesportsdb-", "") : "";
  if (!eventId) throw new Error("Select a TheSportsDB fixture to enrich event lineups and stats.");
  const lineupUrl = `${THESPORTSDB_HOST()}/lookuplineup.php?id=${encodeURIComponent(eventId)}`;
  const statsUrl = `${THESPORTSDB_HOST()}/lookupeventstats.php?id=${encodeURIComponent(eventId)}`;
  const [lineups, stats] = await Promise.allSettled([
    timeoutFetch(publicDataUrl(lineupUrl, "thesportsdb"), 7500),
    timeoutFetch(publicDataUrl(statsUrl, "thesportsdb"), 7500),
  ]);
  const lineupRows =
    lineups.status === "fulfilled" && lineups.value.ok
      ? ((await lineups.value.json()).lineup ?? [])
      : [];
  const statRows =
    stats.status === "fulfilled" && stats.value.ok
      ? ((await stats.value.json()).eventstats ?? [])
      : [];
  return mergeTheSportsDbEventDetails(
    match,
    Array.isArray(lineupRows) ? lineupRows : [],
    Array.isArray(statRows) ? statRows : [],
  );
};

const enrichTheSportsDbMatches = async (
  matches: Match[],
  standings?: {
    rows: number;
    ok: boolean;
    endpoint: string;
  },
) => {
  const targets = matches
    .map((match) => ({ match, eventId: eventIdFromTheSportsDbMatch(match) }))
    .filter((item) => item.eventId)
    .slice(0, THESPORTSDB_ENRICHMENT_LIMIT());
  if (targets.length === 0) {
    return {
      matches,
      enrichmentAudit: buildTheSportsDbEnrichmentAudit({
        totalFixtures: matches.length,
        attemptedEventIds: [],
        enrichedMatches: [],
        failures: [],
        standingsRows: standings?.rows ?? 0,
        standingsOk: standings?.ok ?? false,
        standingsEndpoint: standings?.endpoint,
      }),
    };
  }

  const settled = await Promise.allSettled(targets.map(({ match }) => enrichMatchFromTheSportsDb(match)));
  const enrichedById = new Map<string, Match>();
  const failures: Array<{ eventId: string; message: string }> = [];
  settled.forEach((result, index) => {
    const target = targets[index];
    if (!target) return;
    if (result.status === "fulfilled") {
      enrichedById.set(target.match.id, result.value);
    } else {
      failures.push({ eventId: target.eventId, message: (result.reason as Error).message });
    }
  });
  const nextMatches = matches.map((match) => enrichedById.get(match.id) ?? match);
  const enrichmentAudit = buildTheSportsDbEnrichmentAudit({
    totalFixtures: matches.length,
    attemptedEventIds: targets.map((target) => target.eventId),
    enrichedMatches: [...enrichedById.values()],
    failures,
    standingsRows: standings?.rows ?? 0,
    standingsOk: standings?.ok ?? false,
    standingsEndpoint: standings?.endpoint,
  });
  return { matches: nextMatches, enrichmentAudit };
};

export const enrichMatchWithDataProviders = async (match: Match): Promise<Match> => {
  const errors: string[] = [];
  if (match.id.startsWith("api-football-")) {
    try {
      const enriched = await enrichMatchFromApiFootball(match);
      const oddsEnriched = await enrichMatchFromOddsApi(enriched).catch(() => undefined);
      return oddsEnriched ? withCoverage(oddsEnriched) : enriched;
    } catch (error) {
      errors.push(`API-Football: ${(error as Error).message}`);
    }
  }
  if (match.id.startsWith("thesportsdb-")) {
    try {
      const enriched = await enrichMatchFromTheSportsDb(match);
      const oddsEnriched = await enrichMatchFromOddsApi(enriched).catch(() => undefined);
      return oddsEnriched ? withCoverage(oddsEnriched) : enriched;
    } catch (error) {
      errors.push(`TheSportsDB: ${(error as Error).message}`);
    }
  }
  try {
    const oddsEnriched = await enrichMatchFromOddsApi(match);
    if (oddsEnriched) return withCoverage(oddsEnriched);
    errors.push("The Odds API returned no matching event.");
  } catch (error) {
    errors.push(`The Odds API: ${(error as Error).message}`);
  }
  throw new Error(`No configured enrichment provider could enrich this fixture. ${errors.join(" ")}`);
};

export const loadSeedMatches = (): ProviderResult => ({
  source: "seed",
  matches: seedMatches.map(withCoverage),
  warning: "Using bundled seed data. External score sync is unavailable.",
  evidence: [
    "Bundled offline seed schedule",
    "Manual result entry remains available",
    `${seedMatches.length} seed matches loaded`,
  ],
  responseAudit: providerResponseAudit({
    source: "seed",
    endpoint: "bundled seedMatches",
    status: "fallback",
    rowCount: seedMatches.length,
    sampleIds: seedMatches.map((match) => match.id),
    detail: "Bundled seed fallback loaded; not external realtime evidence.",
  }),
});

const withSeedUpcoming = (result: ProviderResult): ProviderResult => {
  const existing = new Set(
    result.matches.map((match) => `${match.homeTeam.toLowerCase()}-${match.awayTeam.toLowerCase()}`),
  );
  const futureSeed = seedMatches.filter((match) => {
    const key = `${match.homeTeam.toLowerCase()}-${match.awayTeam.toLowerCase()}`;
    return match.status === "upcoming" && !existing.has(key);
  });
  return {
    ...result,
    matches: [...result.matches, ...futureSeed],
    evidence: [
      ...(result.evidence ?? []),
      futureSeed.length > 0
        ? `${futureSeed.length} seed upcoming matches merged for schedule continuity`
        : "No seed merge needed",
    ],
  };
};

const errorForRoute = (errors: string[], label: string) =>
  errors.find((error) => error.toLowerCase().startsWith(`${label.toLowerCase()}:`));

export const buildProviderRouteAudit = (
  activeSource: DataSource,
  errors: string[] = [],
  forceFailure = false,
): ProviderRouteAuditItem[] => {
  const routes = providerRouteConfig();
  const activeIndex = routes.findIndex((route) => route.key === activeSource);
  return routes.map((route, index) => {
    const routeError = errorForRoute(errors, route.label) ?? (route.key === "worldcup26" ? errorForRoute(errors, "worldcup26") : undefined);
    if (route.key === activeSource) {
      return {
        key: route.key,
        label: route.label,
        configured: route.configured,
        status: route.key === "seed" ? "fallback" : "active",
        detail: route.key === "seed" ? "Offline seed data is serving the board." : route.detail,
      };
    }
    if (forceFailure && route.key !== "seed") {
      return {
        key: route.key,
        label: route.label,
        configured: route.configured,
        status: "failed",
        detail: "Forced fallback test skipped live provider attempts.",
      };
    }
    if (routeError) {
      const missingConfig = /VITE_|not configured/i.test(routeError);
      return {
        key: route.key,
        label: route.label,
        configured: route.configured,
        status: missingConfig ? "needs-config" : "failed",
        detail: routeError.includes(":") ? routeError.slice(routeError.indexOf(":") + 1).trim() : routeError,
      };
    }
    return {
      key: route.key,
      label: route.label,
      configured: route.configured,
      status: activeIndex >= 0 && index > activeIndex ? "skipped" : "failed",
      detail:
        activeIndex >= 0 && index > activeIndex
          ? `Not needed after ${routes[activeIndex].label} returned matches.`
          : route.detail,
    };
  });
};

const withRouteAudit = (
  result: ProviderResult,
  errors: string[],
  forceFailure = false,
): ProviderResult => ({
  ...result,
  routeAudit: buildProviderRouteAudit(result.source, errors, forceFailure),
});

export const loadMatchesWithFallback = async (
  forceFailure: boolean,
): Promise<ProviderResult> => {
  const errors: string[] = [];
  if (!forceFailure) {
    try {
      return withRouteAudit(withSeedUpcoming(await loadFromApiFootball()), errors);
    } catch (error) {
      errors.push(`API-Football: ${(error as Error).message}`);
    }
    try {
      return withRouteAudit(withSeedUpcoming(await loadFromFootballData()), errors);
    } catch (error) {
      errors.push(`Football-Data.org: ${(error as Error).message}`);
    }
    try {
      return withRouteAudit(withSeedUpcoming(await loadFromTheSportsDb()), errors);
    } catch (error) {
      errors.push(`TheSportsDB: ${(error as Error).message}`);
    }
    try {
      return withRouteAudit(withSeedUpcoming(await loadFromOpenFootball()), errors);
    } catch (error) {
      errors.push(`openfootball: ${(error as Error).message}`);
    }
    try {
      return withRouteAudit(withSeedUpcoming(await loadFromEspn()), errors);
    } catch (error) {
      errors.push(`ESPN: ${(error as Error).message}`);
    }
    try {
      const result = withSeedUpcoming(await loadFromWorldcup26());
      return withRouteAudit({
        ...result,
        warning: `ESPN unavailable, using worldcup26 fallback. ${errors.join(" ")}`,
      }, errors);
    } catch (error) {
      errors.push(`worldcup26: ${(error as Error).message}`);
    }
  } else {
    errors.push("Forced API failure enabled for fallback testing.");
  }
  const seed = loadSeedMatches();
  return withRouteAudit({ ...seed, warning: errors.join(" ") || seed.warning }, errors, forceFailure);
};

export const sourceLabel = (source: DataSource) => {
  if (source === "espn") return "ESPN";
  if (source === "worldcup26") return "worldcup26";
  if (source === "openfootball") return "openfootball";
  if (source === "api-football") return "API-Football";
  if (source === "football-data") return "Football-Data.org";
  if (source === "thesportsdb") return "TheSportsDB";
  if (source === "odds-api") return "The Odds API";
  if (source === "manual") return "Manual";
  return "Seed";
};
