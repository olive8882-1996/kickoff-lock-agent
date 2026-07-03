import { buildDataCoverage } from "./providers";
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
const endpointBackedKeys = new Set<DataCoverageItem["key"]>(["lineups", "injuries", "odds"]);

const readinessFor = (readiness: ProviderReadinessItem[], key: DataCoverageItem["key"]) =>
  readiness.find((item) => item.key === key);

const endpointReady = (audit: RealtimeDataAudit | undefined, key: DataCoverageItem["key"]) => {
  if (!endpointBackedKeys.has(key)) return true;
  const endpoint = audit?.enrichmentAudit?.endpointAudits.find((item) => item.key === key);
  return Boolean(endpoint && endpoint.attempted > 0 && endpoint.fulfilled > 0 && endpoint.live > 0);
};

const bestCoverageFor = (matches: Match[], key: DataCoverageItem["key"]) =>
  matches
    .flatMap((match) => match.insights?.dataCoverage ?? buildDataCoverage(match))
    .filter((item) => item.key === key)
    .sort((a, b) => statusRank[b.status] - statusRank[a.status])[0];

const sampleFor = (matches: Match[], key: DataCoverageItem["key"]) => {
  const match = matches.find((item) =>
    (item.insights?.dataCoverage ?? buildDataCoverage(item)).some(
      (coverage) => coverage.key === key && statusRank[coverage.status] >= statusRank.configured,
    ),
  );
  return match ? `${match.homeTeam} vs ${match.awayTeam}` : "no production sample";
};

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
    const productionReady =
      key === "score"
        ? status === "live"
        : endpointBackedKeys.has(key)
          ? status === "live" && endpointVerified
          : status === "live" || status === "configured";
    return {
      key,
      label: item?.label ?? best?.label ?? key,
      status: productionReady || endpointVerified ? status : endpointBackedKeys.has(key) ? "unverified" : status,
      provider: item?.source ?? best?.source ?? "Not available",
      sample: sampleFor(matches, key),
      productionReady,
      action: productionReady ? "Verified for production evidence." : signalActions[key],
    };
  });
  const requiredReady = signals.filter((item) => item.productionReady).length;
  const missingSignals = signals.filter((item) => !item.productionReady).map((item) => item.key);
  const responseVerified = audit?.responseVerified ?? health.responseVerified;
  const routeStatus = activeRoute?.status ?? audit?.routeStatus ?? "unknown";
  const productionReady = Boolean(
    matches.length > 0 &&
      health.fresh &&
      responseVerified &&
      activeRoute?.status === "active" &&
      missingSignals.length === 0,
  );
  const source = audit?.sourceLabel ?? activeRoute?.label ?? health.source;
  const summary = `${source} · ${requiredReady}/${signals.length} required data signals · ${
    responseVerified ? "provider response verified" : "provider response unverified"
  }`;
  const nextAction =
    missingSignals.length === 0
      ? "Realtime schedule, score, rankings, lineup, injury and odds evidence is production-ready."
      : `Fill ${missingSignals.join(", ")} with provider read-back before claiming realtime data completion.`;
  const copyLines = [
    "Kickoff Lock Agent realtime data evidence",
    summary,
    `Route: ${routeStatus}`,
    `Fresh: ${health.fresh ? "yes" : "no"}`,
    `Matches: ${matches.length}`,
    `Missing: ${missingSignals.join(", ") || "none"}`,
    ...signals.map((item) => `${item.label}: ${item.status} · ${item.provider} · ${item.sample}`),
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
    summary,
    nextAction,
    copyText: copyLines.join("\n"),
  };
};
