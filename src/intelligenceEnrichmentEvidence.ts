import type {
  DataCoverageItem,
  ProviderEnrichmentAudit,
  ProviderEnrichmentEndpointAudit,
  ProviderHealthSnapshot,
} from "./types";

export type IntelligenceEnrichmentEvidenceItem = {
  key: ProviderEnrichmentEndpointAudit["key"];
  label: string;
  endpoint: string;
  attempted: number;
  fulfilled: number;
  live: number;
  errors: number;
  sampleIds: string[];
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
  requiredReady: number;
  requiredTotal: number;
  productionReady: boolean;
  missingSignals: DataCoverageItem["key"][];
  items: IntelligenceEnrichmentEvidenceItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const requiredKeys: ProviderEnrichmentEndpointAudit["key"][] = ["lineups", "injuries", "odds"];

const labels: Record<ProviderEnrichmentEndpointAudit["key"], string> = {
  lineups: "Lineups",
  injuries: "Injuries",
  odds: "Odds",
};

const defaultEndpoint = (key: ProviderEnrichmentEndpointAudit["key"]) => {
  if (key === "lineups") return "fixtures/lineups?fixture=<fixture-id>";
  if (key === "injuries") return "injuries?fixture=<fixture-id>";
  return "odds?fixture=<fixture-id> or The Odds API h2h";
};

const actionFor = (key: ProviderEnrichmentEndpointAudit["key"]) => {
  if (key === "lineups") return "Run lineup endpoint read-back for the selected production fixtures.";
  if (key === "injuries") return "Run injury endpoint read-back so unavailable players are provider-backed.";
  return "Read odds from API-Football odds or The Odds API h2h before treating market picks as live.";
};

export const buildIntelligenceEnrichmentEvidencePacket = ({
  audit,
  health,
  checkedAt = audit?.checkedAt ?? new Date().toISOString(),
}: {
  audit?: ProviderEnrichmentAudit;
  health?: ProviderHealthSnapshot;
  checkedAt?: string;
}): IntelligenceEnrichmentEvidencePacket => {
  const auditsByKey = new Map(audit?.endpointAudits.map((item) => [item.key, item]));
  const items = requiredKeys.map<IntelligenceEnrichmentEvidenceItem>((key) => {
    const endpoint = auditsByKey.get(key);
    const attempted = endpoint?.attempted ?? 0;
    const fulfilled = endpoint?.fulfilled ?? 0;
    const live = endpoint?.live ?? 0;
    const errors = endpoint?.errors ?? 0;
    const productionReady = attempted > 0 && fulfilled >= attempted && live > 0 && errors === 0;
    return {
      key,
      label: labels[key],
      endpoint: endpoint?.endpoint ?? defaultEndpoint(key),
      attempted,
      fulfilled,
      live,
      errors,
      sampleIds: endpoint?.sampleIds ?? [],
      productionReady,
      detail:
        attempted > 0
          ? `${fulfilled}/${attempted} fulfilled · ${live} live · ${errors} errors`
          : "endpoint read-back has not run",
      action: productionReady ? "Endpoint read-back is production evidence." : actionFor(key),
    };
  });
  const requiredReady = items.filter((item) => item.productionReady).length;
  const liveSignals = items.reduce((sum, item) => sum + item.live, 0);
  const missingSignals = items.filter((item) => !item.productionReady).map((item) => item.key);
  const productionReady = Boolean(audit && requiredReady === items.length && health?.responseVerified && health.fresh);
  const source = audit?.source ?? health?.source ?? "unconfigured";
  const summary = `${source} enrichment · ${requiredReady}/${items.length} endpoint groups production-ready · ${liveSignals} live signals`;
  const nextAction =
    missingSignals.length === 0
      ? "Lineups, injuries and odds endpoint read-back are ready for production judging."
      : `Complete endpoint read-back for ${missingSignals.join(", ")}.`;
  const copyText = [
    "Kickoff Lock Agent intelligence enrichment evidence",
    summary,
    `Checked: ${checkedAt}`,
    `Fixtures: ${audit?.attemptedFixtures ?? 0}/${audit?.totalFixtures ?? 0}`,
    `Provider response: ${health?.responseVerified ? "verified" : "unverified"}`,
    `Fresh: ${health?.fresh ? "yes" : "no"}`,
    `Missing: ${missingSignals.join(", ") || "none"}`,
    ...items.map((item) => `${item.label}: ${item.detail} · ${item.endpoint} · samples ${item.sampleIds.join(", ") || "none"}`),
  ].join("\n");

  return {
    checkedAt,
    source,
    totalFixtures: audit?.totalFixtures ?? 0,
    attemptedFixtures: audit?.attemptedFixtures ?? 0,
    liveSignals,
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
