import { seedMatches } from "./data/seedMatches";
import { lookupFifaRanking } from "./data/fifaRankings";
import type {
  DataCoverageItem,
  DataCoverageStatus,
  DataSource,
  Match,
  MatchIntelligenceScore,
  ProviderReadinessItem,
  ProviderResult,
  ProviderRouteAuditItem,
} from "./types";

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40";
const WORLDCUP26_URL = "https://worldcup26.ir/get/games";
const API_FOOTBALL_KEY = import.meta.env.VITE_APIFOOTBALL_KEY as string | undefined;
const API_FOOTBALL_HOST = "https://v3.football.api-sports.io";
const FOOTBALL_DATA_TOKEN = import.meta.env.VITE_FOOTBALL_DATA_TOKEN as string | undefined;
const FOOTBALL_DATA_COMPETITION = (import.meta.env.VITE_FOOTBALL_DATA_COMPETITION as string | undefined) ?? "WC";
const FOOTBALL_DATA_HOST = "https://api.football-data.org/v4";
const THESPORTSDB_KEY = (import.meta.env.VITE_THESPORTSDB_KEY as string | undefined) ?? "123";
const THESPORTSDB_LEAGUE_ID = (import.meta.env.VITE_THESPORTSDB_LEAGUE_ID as string | undefined) ?? "4429";
const THESPORTSDB_SEASON = (import.meta.env.VITE_THESPORTSDB_SEASON as string | undefined) ?? String(new Date().getUTCFullYear());
const THESPORTSDB_HOST = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_KEY}`;
const ODDS_API_KEY = import.meta.env.VITE_ODDS_API_KEY as string | undefined;
const ODDS_API_SPORT_KEY = import.meta.env.VITE_ODDS_API_SPORT_KEY as string | undefined;
const ODDS_API_HOST = "https://api.the-odds-api.com/v4";

const providerRouteConfig: Array<{
  key: DataSource;
  label: string;
  configured: boolean;
  detail: string;
}> = [
  {
    key: "api-football",
    label: "API-Football",
    configured: Boolean(API_FOOTBALL_KEY),
    detail: "Fixtures plus lineups, injuries and odds when plan supports enrichment.",
  },
  {
    key: "football-data",
    label: "Football-Data.org",
    configured: Boolean(FOOTBALL_DATA_TOKEN),
    detail: `Competition ${FOOTBALL_DATA_COMPETITION} fixtures, scores, venue and team metadata.`,
  },
  {
    key: "thesportsdb",
    label: "TheSportsDB",
    configured: Boolean(THESPORTSDB_KEY),
    detail: `Free v1 route ${THESPORTSDB_LEAGUE_ID}/${THESPORTSDB_SEASON} for schedule, score and event details.`,
  },
  {
    key: "espn",
    label: "ESPN",
    configured: true,
    detail: "Public FIFA World Cup scoreboard fallback.",
  },
  {
    key: "worldcup26",
    label: "worldcup26",
    configured: true,
    detail: "Public games fallback route.",
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

const placeholderPattern = /not published|not configured|configure|unavailable|waiting|waits|not loaded|no injury feed|no odds|not returned|does not publish|no betting/i;

const hasUsefulList = (items?: string[]) =>
  Boolean(items?.some((item) => item.trim() && !placeholderPattern.test(item)));

const listCoverage = (
  source: DataSource,
  items: string[] | undefined,
  configuredSource: string | undefined,
): DataCoverageStatus => {
  if (source === "seed") return "fallback";
  if (hasUsefulList(items)) return "live";
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
    return API_FOOTBALL_KEY
      ? "VITE_APIFOOTBALL_KEY configured; run Enrich on API-Football fixtures."
      : "Configure VITE_APIFOOTBALL_KEY for lineups and injuries.";
  }
  if (key === "odds") {
    if (API_FOOTBALL_KEY || (ODDS_API_KEY && ODDS_API_SPORT_KEY)) {
      return "Odds enrichment configured through API-Football or The Odds API.";
    }
    return "Configure VITE_APIFOOTBALL_KEY or VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY.";
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
      (key === "lineups" || key === "injuries") && API_FOOTBALL_KEY
        ? true
        : key === "odds" && (API_FOOTBALL_KEY || (ODDS_API_KEY && ODDS_API_SPORT_KEY));
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

export const buildDataCoverage = (match: Match): DataCoverageItem[] => {
  const provider = sourceLabel(match.dataSource);
  const scoreKnown = match.homeScore !== undefined && match.awayScore !== undefined;
  const isFallback = match.dataSource === "seed";
  const hasRanks = Boolean(match.insights?.home.fifaRank && match.insights?.away.fifaRank);
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
      source: hasRanks ? (match.insights?.rankingSource ?? provider) : "Not available",
      detail: hasRanks
        ? `${match.homeTeam} ${match.insights?.home.fifaRank} · ${match.awayTeam} ${match.insights?.away.fifaRank}`
        : "No ranking feed attached",
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
        form: homeRanking ? ["FIFA", "RANK", `#${homeRanking.rank}`] : match.insights.home.form,
      },
      away: {
        ...match.insights.away,
        fifaRank: awayRanking?.rank ?? match.insights.away.fifaRank,
        form: awayRanking ? ["FIFA", "RANK", `#${awayRanking.rank}`] : match.insights.away.form,
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
  const res = await timeoutFetch(ESPN_URL);
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
  return {
    source: "espn",
    matches,
    evidence: [
      "ESPN FIFA World Cup scoreboard endpoint",
      "Live status, score, venue and kickoff metadata",
      `${matches.length} ESPN events normalized`,
    ],
  };
};

export const loadFromWorldcup26 = async (): Promise<ProviderResult> => {
  const res = await timeoutFetch(WORLDCUP26_URL);
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
  return {
    source: "worldcup26",
    matches,
    evidence: [
      "worldcup26 games endpoint",
      "Schedule and finished-score fallback",
      `${matches.length} worldcup26 games normalized`,
    ],
  };
};

export const loadFromApiFootball = async (): Promise<ProviderResult> => {
  if (!API_FOOTBALL_KEY) throw new Error("VITE_APIFOOTBALL_KEY is not configured");
  const season = new Date().getUTCFullYear();
  const res = await timeoutFetch(`${API_FOOTBALL_HOST}/fixtures?league=1&season=${season}&next=40`, 7500, {
    "x-apisports-key": API_FOOTBALL_KEY,
  });
  if (!res.ok) throw new Error(`API-Football returned ${res.status}`);
  const data = await res.json();
  const fixtures = Array.isArray(data.response) ? data.response : [];
  const matches: Match[] = fixtures.map((item: any) =>
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
          unavailable: ["Use injuries endpoint for configured deployments"],
          probableLineup: ["Use lineups endpoint when fixture enters pre-match window"],
        },
        away: {
          fifaRank: 0,
          form: ["API", "LIVE", "FORM"],
          lastFiveGoalsFor: numberOrUndefined(item.goals?.away) ?? 0,
          lastFiveGoalsAgainst: numberOrUndefined(item.goals?.home) ?? 0,
          unavailable: ["Use injuries endpoint for configured deployments"],
          probableLineup: ["Use lineups endpoint when fixture enters pre-match window"],
        },
        headToHead: "API-Football can supply H2H by team ids after fixture selection.",
        marketLine: "Odds endpoint is available when the API key plan includes odds.",
        oddsSnapshot: "Configured API-Football fixture feed active.",
        lineupSource: "API-Football lineups endpoint",
        injurySource: "API-Football injuries endpoint",
        dataFreshness: new Date().toISOString(),
      },
    }),
  );
  if (matches.length === 0) throw new Error("API-Football returned no matches");
  return {
    source: "api-football",
    matches,
    evidence: [
      "API-Football fixtures endpoint",
      "Lineups, injuries and odds are represented as configured-data sources",
    ],
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
  if (!FOOTBALL_DATA_TOKEN) throw new Error("VITE_FOOTBALL_DATA_TOKEN is not configured");
  const season = new Date().getUTCFullYear();
  const res = await timeoutFetch(
    `${FOOTBALL_DATA_HOST}/competitions/${FOOTBALL_DATA_COMPETITION}/matches?season=${season}`,
    7500,
    { "X-Auth-Token": FOOTBALL_DATA_TOKEN },
  );
  if (!res.ok) throw new Error(`Football-Data.org returned ${res.status}`);
  const data = await res.json();
  const matches = Array.isArray(data.matches) ? data.matches.map(normalizeFootballDataMatch) : [];
  if (matches.length === 0) throw new Error("Football-Data.org returned no matches");
  return {
    source: "football-data",
    matches,
    evidence: [
      `Football-Data.org competition ${FOOTBALL_DATA_COMPETITION} matches endpoint`,
      "Fixtures, live/final scores, stage, venue and team metadata",
      `${matches.length} Football-Data.org matches normalized`,
    ],
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
  const seasonUrl = `${THESPORTSDB_HOST}/eventsseason.php?id=${encodeURIComponent(THESPORTSDB_LEAGUE_ID)}&s=${encodeURIComponent(THESPORTSDB_SEASON)}`;
  const seasonRes = await timeoutFetch(seasonUrl, 7500);
  if (!seasonRes.ok) throw new Error(`TheSportsDB season returned ${seasonRes.status}`);
  const seasonData = await seasonRes.json();
  let events = Array.isArray(seasonData.events) ? seasonData.events : [];
  let endpoint = `eventsseason ${THESPORTSDB_LEAGUE_ID}/${THESPORTSDB_SEASON}`;

  if (events.length === 0) {
    const nextRes = await timeoutFetch(
      `${THESPORTSDB_HOST}/eventsnextleague.php?id=${encodeURIComponent(THESPORTSDB_LEAGUE_ID)}`,
      7500,
    );
    if (!nextRes.ok) throw new Error(`TheSportsDB next league returned ${nextRes.status}`);
    const nextData = await nextRes.json();
    events = Array.isArray(nextData.events) ? nextData.events : [];
    endpoint = `eventsnextleague ${THESPORTSDB_LEAGUE_ID}`;
  }

  const matches = events.map(normalizeTheSportsDbEvent);
  if (matches.length === 0) throw new Error("TheSportsDB returned no World Cup events");
  return {
    source: "thesportsdb",
    matches,
    evidence: [
      `TheSportsDB ${endpoint}`,
      "Free v1 JSON API with schedule, score, venue, event artwork and status fields",
      `${matches.length} TheSportsDB World Cup events normalized`,
    ],
  };
};

const apiFootballJson = async (path: string) => {
  if (!API_FOOTBALL_KEY) throw new Error("VITE_APIFOOTBALL_KEY is not configured");
  const res = await timeoutFetch(`${API_FOOTBALL_HOST}${path}`, 7500, {
    "x-apisports-key": API_FOOTBALL_KEY,
  });
  if (!res.ok) throw new Error(`API-Football ${path} returned ${res.status}`);
  return res.json();
};

const teamKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const oddsApiJson = async () => {
  if (!ODDS_API_KEY || !ODDS_API_SPORT_KEY) {
    throw new Error("VITE_ODDS_API_KEY and VITE_ODDS_API_SPORT_KEY are not configured");
  }
  const params = new URLSearchParams({
    regions: "us,uk,eu",
    markets: "h2h",
    oddsFormat: "decimal",
    apiKey: ODDS_API_KEY,
  });
  const res = await timeoutFetch(`${ODDS_API_HOST}/sports/${ODDS_API_SPORT_KEY}/odds?${params.toString()}`, 7500);
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
  const [lineups, stats] = await Promise.allSettled([
    timeoutFetch(`${THESPORTSDB_HOST}/lookuplineup.php?id=${encodeURIComponent(eventId)}`, 7500),
    timeoutFetch(`${THESPORTSDB_HOST}/lookupeventstats.php?id=${encodeURIComponent(eventId)}`, 7500),
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
  const activeIndex = providerRouteConfig.findIndex((route) => route.key === activeSource);
  return providerRouteConfig.map((route, index) => {
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
          ? `Not needed after ${providerRouteConfig[activeIndex].label} returned matches.`
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
  if (source === "api-football") return "API-Football";
  if (source === "football-data") return "Football-Data.org";
  if (source === "thesportsdb") return "TheSportsDB";
  if (source === "manual") return "Manual";
  return "Seed";
};
