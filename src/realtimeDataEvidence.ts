import { buildDataCoverage } from "./providers";
import { matchHasProductionSignalContent } from "./intelligenceSignalQuality";
import type {
  DataCoverageItem,
  Match,
  ProviderHealthSnapshot,
  ProviderReadinessItem,
  ProviderRouteAuditItem,
  RealtimeDataAudit,
} from "./types";

export type RealtimeDataEvidenceSignal = {
  key: DataCoverageItem["key"];
  label: string;
  status: DataCoverageItem["status"] | "unverified";
  provider: string;
  sample: string;
  productionReady: boolean;
  action: string;
};

export type RealtimeDataFixtureEvidenceRow = {
  id: string;
  label: string;
  source: string;
  status: Match["status"];
  kickoffAt: string;
  readySignals: number;
  totalSignals: number;
  liveSignals: number;
  missingSignals: DataCoverageItem["key"][];
  productionReady: boolean;
  detail: string;
};

export type RealtimeDataEvidencePacket = {
  checkedAt: string;
  source: string;
  routeStatus: ProviderRouteAuditItem["status"] | "unknown";
  productionReady: boolean;
  responseVerified: boolean;
  fresh: boolean;
  requiredReady: number;
  requiredTotal: number;
  matchCount: number;
  liveMatches: number;
  finishedMatches: number;
  upcomingMatches: number;
  missingSignals: DataCoverageItem["key"][];
  signals: RealtimeDataEvidenceSignal[];
  fixtures: RealtimeDataFixtureEvidenceRow[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const signalActions: Record<DataCoverageItem["key"], string> = {
  schedule: "Keep at least one public schedule route returning World Cup rows.",
  score: "Verify live/final score rows from the active provider before relying on automatic reveal.",
  rankings: "Attach a ranking source for both teams in the active fixture set.",
  lineups: "Configure API-Football or TheSportsDB lineup read-back and enrich target fixtures.",
  injuries: "Configure API-Football injuries read-back for target fixtures.",
  odds: "Configure API-Football odds or The Odds API h2h markets for target fixtures.",
};

const statusRank: Record<DataCoverageItem["status"], number> = {
  missing: 0,
  manual: 1,
  fallback: 2,
  configured: 3,
  live: 4,
};

const coverageKeys: DataCoverageItem["key"][] = ["schedule", "score", "rankings", "lineups", "injuries", "odds"];
const endpointBackedKeys = new Set<DataCoverageItem["key"]>(["rankings", "lineups", "injuries", "odds"]);

const readinessFor = (readiness: ProviderReadinessItem[], key: DataCoverageItem["key"]) =>
  readiness.find((item) => item.key === key);

const endpointReady = (audit: RealtimeDataAudit | undefined, key: DataCoverageItem["key"]) => {
  if (!endpointBackedKeys.has(key)) return true;
  const endpointKey = key === "rankings" ? "standings" : key;
  const endpoint = audit?.enrichmentAudit?.endpointAudits.find((item) => item.key === endpointKey);
  return Boolean(endpoint && endpoint.attempted > 0 && endpoint.fulfilled >= endpoint.attempted && endpoint.live >= endpoint.attempted && endpoint.errors === 0);
};

const bestCoverageFor = (matches: Match[], key: DataCoverageItem["key"]) =>
  matches
    .flatMap((match) =>
      matchHasProductionSignalContent(match, key)
        ? match.insights?.dataCoverage ?? buildDataCoverage(match)
        : buildDataCoverage(match).map((item) => (item.key === key ? { ...item, status: "missing" as const } : item)),
    )
    .filter((item) => item.key === key)
    .sort((a, b) => statusRank[b.status] - statusRank[a.status])[0];

const sampleFor = (matches: Match[], key: DataCoverageItem["key"]) => {
  const match = matches.find((item) =>
    matchHasProductionSignalContent(item, key) &&
    (item.insights?.dataCoverage ?? buildDataCoverage(item)).some(
      (coverage) => coverage.key === key && statusRank[coverage.status] >= statusRank.configured,
    ),
  );
  return match ? `${match.homeTeam} vs ${match.awayTeam}` : "no production sample";
};

const fixtureSignalReady = (
  match: Match,
  key: DataCoverageItem["key"],
  status: DataCoverageItem["status"] | undefined,
  audit: RealtimeDataAudit | undefined,
) => {
  if (!matchHasProductionSignalContent(match, key)) return false;
  if (key === "score") return status === "live";
  if (key === "rankings") return (status === "live" || status === "configured") && endpointReady(audit, key);
  if (endpointBackedKeys.has(key)) return status === "live" && endpointReady(audit, key);
  return status === "live" || status === "configured";
};

const buildFixtureRows = (
  matches: Match[],
  audit: RealtimeDataAudit | undefined,
): RealtimeDataFixtureEvidenceRow[] =>
  matches.slice(0, 12).map((match) => {
    const coverage = match.insights?.dataCoverage ?? buildDataCoverage(match);
    const byKey = new Map(coverage.map((item) => [item.key, item]));
    const missingSignals = coverageKeys.filter((key) => !fixtureSignalReady(match, key, byKey.get(key)?.status, audit));
    const readySignals = coverageKeys.length - missingSignals.length;
    const liveSignals = coverageKeys.filter((key) => byKey.get(key)?.status === "live").length;
    const productionReady = missingSignals.length === 0 && match.dataSource !== "seed" && match.dataSource !== "manual";
    return {
      id: match.id,
      label: `${match.homeTeam} vs ${match.awayTeam}`,
      source: match.dataSource,
      status: match.status,
      kickoffAt: match.kickoffAt,
      readySignals,
      totalSignals: coverageKeys.length,
      liveSignals,
      missingSignals,
      productionReady,
      detail: productionReady
        ? "fixture has schedule, score, ranking, lineup, injury and odds evidence"
        : `missing ${missingSignals.join(", ") || "production fixture evidence"}`,
    };
  });

export const buildRealtimeDataEvidencePacket = ({
  matches,
  readiness,
  routeAudit,
  health,
  audit,
  checkedAt = audit?.checkedAt ?? new Date().toISOString(),
}: {
  matches: Match[];
  readiness: ProviderReadinessItem[];
  routeAudit: ProviderRouteAuditItem[];
  health: ProviderHealthSnapshot;
  audit?: RealtimeDataAudit;
  checkedAt?: string;
}): RealtimeDataEvidencePacket => {
  const activeRoute = routeAudit.find((item) => item.status === "active" || item.status === "fallback");
  const signals = coverageKeys.map<RealtimeDataEvidenceSignal>((key) => {
    const item = readinessFor(readiness, key);
    const best = bestCoverageFor(matches, key);
    const status = item?.status ?? best?.status ?? "missing";
    const endpointVerified = endpointReady(audit, key);
    const hasProductionSample = matches.some((match) => matchHasProductionSignalContent(match, key));
    const productionReady =
      key === "score"
        ? status === "live" && hasProductionSample
        : key === "rankings"
          ? (status === "live" || status === "configured") && endpointVerified && hasProductionSample
        : endpointBackedKeys.has(key)
          ? status === "live" && endpointVerified && hasProductionSample
          : (status === "live" || status === "configured") && hasProductionSample;
    return {
      key,
      label: item?.label ?? best?.label ?? key,
      status: productionReady ? status : endpointBackedKeys.has(key) ? "unverified" : status,
      provider: item?.source ?? best?.source ?? "Not available",
      sample: sampleFor(matches, key),
      productionReady,
      action: productionReady ? "Verified for production evidence." : signalActions[key],
    };
  });
  const fixtures = buildFixtureRows(matches, audit);
  const requiredReady = signals.filter((item) => item.productionReady).length;
  const missingSignals = signals.filter((item) => !item.productionReady).map((item) => item.key);
  const readyFixtures = fixtures.filter((fixture) => fixture.productionReady).length;
  const responseVerified = audit?.responseVerified ?? health.responseVerified;
  const routeStatus = activeRoute?.status ?? audit?.routeStatus ?? "unknown";
  const productionReady = Boolean(
    matches.length > 0 &&
      health.fresh &&
      responseVerified &&
      activeRoute?.status === "active" &&
      missingSignals.length === 0 &&
      fixtures.length > 0 &&
      readyFixtures === fixtures.length,
  );
  const source = audit?.sourceLabel ?? activeRoute?.label ?? health.source;
  const summary = `${source} · ${requiredReady}/${signals.length} required data signals · ${
    responseVerified ? "provider response verified" : "provider response unverified"
  } · ${readyFixtures}/${fixtures.length} target fixtures ready`;
  const nextAction =
    missingSignals.length === 0 && readyFixtures === fixtures.length
      ? "Realtime schedule, score, rankings, lineup, injury and odds evidence is production-ready."
      : `Fill ${missingSignals.join(", ") || "fixture row gaps"} with provider read-back before claiming realtime data completion.`;
  const copyLines = [
    "Kickoff Lock Agent realtime data evidence",
    summary,
    `Route: ${routeStatus}`,
    `Fresh: ${health.fresh ? "yes" : "no"}`,
    `Matches: ${matches.length}`,
    `Missing: ${missingSignals.join(", ") || "none"}`,
    ...signals.map((item) => `${item.label}: ${item.status} · ${item.provider} · ${item.sample}`),
    "",
    "Target fixtures",
    ...fixtures.map(
      (fixture) =>
        `${fixture.label}: ${fixture.readySignals}/${fixture.totalSignals} signals · ${fixture.source} · ${fixture.detail}`,
    ),
  ];

  return {
    checkedAt,
    source,
    routeStatus,
    productionReady,
    responseVerified,
    fresh: health.fresh,
    requiredReady,
    requiredTotal: signals.length,
    matchCount: matches.length,
    liveMatches: matches.filter((match) => match.status === "live").length,
    finishedMatches: matches.filter((match) => match.status === "finished").length,
    upcomingMatches: matches.filter((match) => match.status === "upcoming").length,
    missingSignals,
    signals,
    fixtures,
    summary,
    nextAction,
    copyText: copyLines.join("\n"),
  };
};
