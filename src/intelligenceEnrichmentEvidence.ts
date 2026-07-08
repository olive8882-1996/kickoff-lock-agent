import type {
  DataCoverageItem,
  Match,
  ProviderEnrichmentAudit,
  ProviderEnrichmentEndpointAudit,
  ProviderHealthSnapshot,
} from "./types";
import { matchHasProductionSignalContent } from "./intelligenceSignalQuality";

export type IntelligenceEnrichmentEvidenceItem = {
  key: ProviderEnrichmentEndpointAudit["key"];
  label: string;
  endpoint: string;
  attempted: number;
  fulfilled: number;
  live: number;
  errors: number;
  sampleIds: string[];
  contentSamples: number;
  contentSampleLabels: string[];
  qualityIssues: string[];
  productionReady: boolean;
  detail: string;
  action: string;
};

export type IntelligenceEnrichmentEvidencePacket = {
  checkedAt: string;
  source: string;
  totalFixtures: number;
  attemptedFixtures: number;
  liveSignals: number;
  contentSamples: number;
  qualityIssueCount: number;
  requiredReady: number;
  requiredTotal: number;
  productionReady: boolean;
  missingSignals: DataCoverageItem["key"][];
  items: IntelligenceEnrichmentEvidenceItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const requiredKeys: ProviderEnrichmentEndpointAudit["key"][] = ["lineups", "injuries", "odds", "standings"];

const labels: Record<ProviderEnrichmentEndpointAudit["key"], string> = {
  lineups: "Lineups",
  injuries: "Injuries",
  odds: "Odds",
  standings: "Standings",
};

const defaultEndpoint = (key: ProviderEnrichmentEndpointAudit["key"]) => {
  if (key === "lineups") return "fixtures/lineups?fixture=<fixture-id>";
  if (key === "injuries") return "injuries?fixture=<fixture-id>";
  if (key === "standings") return "standings?league=<league-id>&season=<season>";
  return "odds?fixture=<fixture-id> or The Odds API h2h";
};

const actionFor = (key: ProviderEnrichmentEndpointAudit["key"]) => {
  if (key === "lineups") return "Run lineup endpoint read-back for the selected production fixtures.";
  if (key === "injuries") return "Run injury endpoint read-back so unavailable players are provider-backed.";
  if (key === "standings") return "Run standings endpoint read-back so ranking picks are provider-backed.";
  return "Read odds from API-Football odds or The Odds API h2h before treating market picks as live.";
};

const signalKeyFor = (key: ProviderEnrichmentEndpointAudit["key"]): DataCoverageItem["key"] =>
  key === "standings" ? "rankings" : key;

const sampleLabelsFor = (matches: Match[] | undefined, signalKey: DataCoverageItem["key"]) =>
  (matches ?? [])
    .filter((match) => matchHasProductionSignalContent(match, signalKey))
    .map((match) => `${match.homeTeam} vs ${match.awayTeam}`)
    .slice(0, 4);

export const buildIntelligenceEnrichmentEvidencePacket = ({
  audit,
  health,
  matches,
  checkedAt = audit?.checkedAt ?? new Date().toISOString(),
}: {
  audit?: ProviderEnrichmentAudit;
  health?: ProviderHealthSnapshot;
  matches?: Match[];
  checkedAt?: string;
}): IntelligenceEnrichmentEvidencePacket => {
  const auditsByKey = new Map(audit?.endpointAudits.map((item) => [item.key, item]));
  const items = requiredKeys.map<IntelligenceEnrichmentEvidenceItem>((key) => {
    const endpoint = auditsByKey.get(key);
    const attempted = endpoint?.attempted ?? 0;
    const fulfilled = endpoint?.fulfilled ?? 0;
    const live = endpoint?.live ?? 0;
    const errors = endpoint?.errors ?? 0;
    const signalKey = signalKeyFor(key);
    const contentSampleLabels = sampleLabelsFor(matches, signalKey);
    const contentSamples = matches ? contentSampleLabels.length : live;
    const contentVerified = !matches || contentSamples >= attempted;
    const qualityIssues =
      matches && attempted > 0 && contentSamples < attempted
        ? [`${labels[key]} audit reported ${live} live row${live === 1 ? "" : "s"}, but only ${contentSamples}/${attempted} target fixture content sample${contentSamples === 1 ? "" : "s"} passed placeholder/source checks.`]
        : [];
    const productionReady =
      attempted > 0 && fulfilled >= attempted && live >= attempted && errors === 0 && contentVerified;
    return {
      key,
      label: labels[key],
      endpoint: endpoint?.endpoint ?? defaultEndpoint(key),
      attempted,
      fulfilled,
      live,
      errors,
      sampleIds: endpoint?.sampleIds ?? [],
      contentSamples,
      contentSampleLabels,
      qualityIssues,
      productionReady,
      detail:
        attempted > 0
          ? `${fulfilled}/${attempted} fulfilled · ${live} live · ${contentSamples} content samples · ${errors} errors`
          : "endpoint read-back has not run",
      action: productionReady ? "Endpoint read-back is production evidence." : actionFor(key),
    };
  });
  const requiredReady = items.filter((item) => item.productionReady).length;
  const liveSignals = items.reduce((sum, item) => sum + item.live, 0);
  const contentSamples = items.reduce((sum, item) => sum + item.contentSamples, 0);
  const qualityIssueCount = items.reduce((sum, item) => sum + item.qualityIssues.length, 0);
  const missingSignals = items.filter((item) => !item.productionReady).map((item) => signalKeyFor(item.key));
  const productionReady = Boolean(audit && requiredReady === items.length && health?.responseVerified && health.fresh);
  const source = audit?.source ?? health?.source ?? "unconfigured";
  const summary = `${source} enrichment · ${requiredReady}/${items.length} endpoint groups production-ready · ${liveSignals} live signals · ${qualityIssueCount} content quality issues`;
  const nextAction =
    missingSignals.length === 0
      ? "Lineups, injuries, odds and standings endpoint read-back are ready for production judging."
      : qualityIssueCount > 0
        ? `Replace placeholder enrichment content for ${missingSignals.join(", ")} before claiming live intelligence.`
        : `Complete endpoint read-back for ${missingSignals.join(", ")}.`;
  const copyText = [
    "Kickoff Lock Agent intelligence enrichment evidence",
    summary,
    `Checked: ${checkedAt}`,
    `Fixtures: ${audit?.attemptedFixtures ?? 0}/${audit?.totalFixtures ?? 0}`,
    `Provider response: ${health?.responseVerified ? "verified" : "unverified"}`,
    `Fresh: ${health?.fresh ? "yes" : "no"}`,
    `Content quality issues: ${qualityIssueCount}`,
    `Missing: ${missingSignals.join(", ") || "none"}`,
    ...items.map((item) => `${item.label}: ${item.detail} · ${item.endpoint} · samples ${item.sampleIds.join(", ") || "none"} · content ${item.contentSampleLabels.join(", ") || "none"}`),
    ...items.flatMap((item) => item.qualityIssues.map((issue) => `Quality: ${issue}`)),
  ].join("\n");

  return {
    checkedAt,
    source,
    totalFixtures: audit?.totalFixtures ?? 0,
    attemptedFixtures: audit?.attemptedFixtures ?? 0,
    liveSignals,
    contentSamples,
    qualityIssueCount,
    requiredReady,
    requiredTotal: items.length,
    productionReady,
    missingSignals,
    items,
    summary,
    nextAction,
    copyText,
  };
};
