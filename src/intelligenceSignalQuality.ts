import type { DataCoverageItem, Match } from "./types";

export const placeholderPattern =
  /not published|no published|not configured|configure|endpoint configured|route configured|key configured|unavailable|waiting|waits|not loaded|not yet loaded|no api-reported|no injury feed|no odds|no market rows|not returned|returned no|does not publish|no betting/i;

export const hasUsefulSignalText = (value?: string) =>
  Boolean(value?.trim() && !placeholderPattern.test(value));

export const hasUsefulSignalList = (items?: string[]) =>
  Boolean(items?.some((item) => hasUsefulSignalText(item)));

const hasCleanSource = (value?: string) => !value || !placeholderPattern.test(value);

const productionSource = (match: Match) => match.dataSource !== "seed" && match.dataSource !== "manual";

export const matchHasProductionSignalContent = (match: Match, key: DataCoverageItem["key"]) => {
  if (!productionSource(match)) return false;
  if (key === "schedule") return Boolean(match.homeTeam && match.awayTeam && match.kickoffAt);
  if (key === "score") return Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
  if (!match.insights) return false;
  if (key === "rankings") {
    const hasFifaRanks = Boolean(match.insights.home.fifaRank && match.insights.away.fifaRank);
    const hasTableRanks = Boolean(match.insights.home.tablePosition && match.insights.away.tablePosition);
    return (hasFifaRanks || hasTableRanks) && hasCleanSource(match.insights.standingsSource ?? match.insights.rankingSource);
  }
  if (key === "lineups") {
    return (
      hasUsefulSignalList([...match.insights.home.probableLineup, ...match.insights.away.probableLineup]) &&
      hasCleanSource(match.insights.lineupSource)
    );
  }
  if (key === "injuries") {
    return (
      hasUsefulSignalList([...match.insights.home.unavailable, ...match.insights.away.unavailable]) &&
      hasCleanSource(match.insights.injurySource)
    );
  }
  if (key === "odds") {
    return hasUsefulSignalText(match.insights.oddsSnapshot) || hasUsefulSignalText(match.insights.marketLine);
  }
  return false;
};
