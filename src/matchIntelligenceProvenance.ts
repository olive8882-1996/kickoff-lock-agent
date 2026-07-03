import { buildDataCoverage, sourceLabel } from "./providers";
import type { DataCoverageItem, Match } from "./types";

export type MatchIntelligenceProvenanceItem = {
  key: DataCoverageItem["key"];
  label: string;
  status: DataCoverageItem["status"];
  source: string;
  endpoint: string;
  sample: string;
  productionReady: boolean;
  detail: string;
};

export type MatchIntelligenceProvenancePacket = {
  matchId: string;
  matchLabel: string;
  provider: string;
  providerId: string;
  productionReady: boolean;
  readySignals: number;
  totalSignals: number;
  liveEndpoints: number;
  missingSignals: DataCoverageItem["key"][];
  items: MatchIntelligenceProvenanceItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const productionReadyStatuses = new Set<DataCoverageItem["status"]>(["live", "configured"]);

const providerId = (match: Match) => {
  const prefix = `${match.dataSource}-`;
  return match.id.startsWith(prefix) ? match.id.slice(prefix.length) : match.id;
};

const endpointFor = (match: Match, key: DataCoverageItem["key"]) => {
  const id = providerId(match);
  if (match.dataSource === "api-football") {
    if (key === "schedule" || key === "score") return `fixtures?id=${id}`;
    if (key === "lineups") return `fixtures/lineups?fixture=${id}`;
    if (key === "injuries") return `injuries?fixture=${id}`;
    if (key === "odds") return `odds?fixture=${id}`;
    return "FIFA ranking snapshot + team aliases";
  }
  if (match.dataSource === "thesportsdb") {
    if (key === "schedule" || key === "score") return `eventsseason.php + event ${id}`;
    if (key === "lineups") return `lookuplineup.php?id=${id}`;
    if (key === "injuries") return "not published by TheSportsDB";
    if (key === "odds") return "The Odds API h2h batch when configured";
    return "FIFA ranking snapshot + team aliases";
  }
  if (match.dataSource === "football-data") {
    if (key === "schedule" || key === "score") return `matches/${id}`;
    if (key === "rankings") return "FIFA ranking snapshot + team aliases";
    return "no enrichment endpoint in Football-Data.org match payload";
  }
  if (match.dataSource === "espn") {
    if (key === "schedule" || key === "score") return "site.api.espn.com soccer/fifa.world scoreboard";
    if (key === "rankings") return "FIFA ranking snapshot + team aliases";
    return "requires configured enrichment provider";
  }
  if (match.dataSource === "worldcup26") {
    if (key === "schedule" || key === "score") return "worldcup26.ir/get/games";
    if (key === "rankings") return "FIFA ranking snapshot + team aliases";
    return "requires configured enrichment provider";
  }
  if (key === "rankings") return "bundled FIFA ranking snapshot";
  return "bundled seed continuity pack";
};

const sampleFor = (match: Match, item: DataCoverageItem) => {
  if (item.key === "schedule") return `${match.stage} · ${match.kickoffAt}`;
  if (item.key === "score") {
    return match.homeScore === undefined || match.awayScore === undefined
      ? "score pending"
      : `${match.homeScore}-${match.awayScore}`;
  }
  if (item.key === "rankings") {
    return `${match.homeTeam} #${match.insights?.home.fifaRank ?? "?"} · ${match.awayTeam} #${match.insights?.away.fifaRank ?? "?"}`;
  }
  if (item.key === "lineups") {
    const home = match.insights?.home.probableLineup.filter(Boolean).slice(0, 3).join(", ");
    const away = match.insights?.away.probableLineup.filter(Boolean).slice(0, 3).join(", ");
    return [home, away].filter(Boolean).join(" / ") || "no lineup sample";
  }
  if (item.key === "injuries") {
    const home = match.insights?.home.unavailable.filter(Boolean).slice(0, 3).join(", ");
    const away = match.insights?.away.unavailable.filter(Boolean).slice(0, 3).join(", ");
    return [home, away].filter(Boolean).join(" / ") || "no unavailable-player sample";
  }
  return match.insights?.oddsSnapshot ?? match.insights?.marketLine ?? "no odds sample";
};

export const buildMatchIntelligenceProvenancePacket = (match: Match): MatchIntelligenceProvenancePacket => {
  const coverage = match.insights?.dataCoverage ?? buildDataCoverage(match);
  const items = coverage.map<MatchIntelligenceProvenanceItem>((item) => ({
    key: item.key,
    label: item.label,
    status: item.status,
    source: item.source,
    endpoint: endpointFor(match, item.key),
    sample: sampleFor(match, item),
    productionReady: productionReadyStatuses.has(item.status),
    detail: item.detail,
  }));
  const readySignals = items.filter((item) => item.productionReady).length;
  const liveEndpoints = items.filter((item) => item.status === "live").length;
  const missingSignals = items
    .filter((item) => item.status === "missing" || item.status === "manual" || item.status === "fallback")
    .map((item) => item.key);
  const productionReady = missingSignals.length === 0 && readySignals === items.length;
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;
  const provider = sourceLabel(match.dataSource);
  const nextAction =
    missingSignals.length === 0
      ? "Every match-intelligence signal has an auditable provider endpoint or configured snapshot."
      : `Replace ${missingSignals.join(", ")} with live provider endpoint read-back.`;
  const summary = `${matchLabel} · ${provider} provenance · ${readySignals}/${items.length} auditable signals · ${liveEndpoints} live endpoints`;
  const copyText = [
    "Kickoff Lock Agent match intelligence provenance",
    `Match: ${matchLabel} (${match.id})`,
    `Provider: ${provider}`,
    `Provider id: ${providerId(match)}`,
    `Production ready: ${productionReady ? "yes" : "no"}`,
    `Signals: ${readySignals}/${items.length}`,
    `Live endpoints: ${liveEndpoints}`,
    `Missing: ${missingSignals.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    ...items.map((item) => `${item.label}: ${item.status} · ${item.endpoint} · ${item.source} · sample ${item.sample}`),
  ].join("\n");

  return {
    matchId: match.id,
    matchLabel,
    provider,
    providerId: providerId(match),
    productionReady,
    readySignals,
    totalSignals: items.length,
    liveEndpoints,
    missingSignals,
    items,
    summary,
    nextAction,
    copyText,
  };
};
