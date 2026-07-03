import type { DataCoverageItem, Match } from "./types";
import { buildDataCoverage, buildMatchIntelligenceScore, sourceLabel } from "./providers";

export type MatchDataEvidenceSignal = {
  key: DataCoverageItem["key"];
  label: string;
  status: DataCoverageItem["status"];
  source: string;
  productionReady: boolean;
};

export type MatchDataEvidencePacket = {
  matchId: string;
  matchLabel: string;
  source: string;
  status: Match["status"];
  kickoffAt: string;
  score: number;
  level: ReturnType<typeof buildMatchIntelligenceScore>["level"];
  readySignals: number;
  totalSignals: number;
  missingSignals: DataCoverageItem["key"][];
  liveSignals: DataCoverageItem["key"][];
  fallbackSignals: DataCoverageItem["key"][];
  signals: MatchDataEvidenceSignal[];
  summary: string;
  nextAction: string;
};

const productionReadyStatuses = new Set<DataCoverageItem["status"]>(["live", "configured"]);

export const buildMatchDataEvidencePacket = (match: Match): MatchDataEvidencePacket => {
  const coverage = match.insights?.dataCoverage ?? buildDataCoverage(match);
  const score = buildMatchIntelligenceScore(match);
  const signals = coverage.map<MatchDataEvidenceSignal>((item) => ({
    key: item.key,
    label: item.label,
    status: item.status,
    source: item.source,
    productionReady: productionReadyStatuses.has(item.status),
  }));
  const readySignals = signals.filter((item) => item.productionReady).length;
  const missingSignals = signals
    .filter((item) => item.status === "missing" || item.status === "manual")
    .map((item) => item.key);
  const liveSignals = signals.filter((item) => item.status === "live").map((item) => item.key);
  const fallbackSignals = signals.filter((item) => item.status === "fallback").map((item) => item.key);
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;
  return {
    matchId: match.id,
    matchLabel,
    source: sourceLabel(match.dataSource),
    status: match.status,
    kickoffAt: match.kickoffAt,
    score: score.score,
    level: score.level,
    readySignals,
    totalSignals: signals.length,
    missingSignals,
    liveSignals,
    fallbackSignals,
    signals,
    summary: `${matchLabel} · ${sourceLabel(match.dataSource)} · ${readySignals}/${signals.length} production signals · ${score.score}/100 intelligence`,
    nextAction:
      missingSignals.length > 0
        ? `Fill ${missingSignals.join(", ")} before treating this match as production-grade intelligence.`
        : "All match intelligence signals are live or configured.",
  };
};
