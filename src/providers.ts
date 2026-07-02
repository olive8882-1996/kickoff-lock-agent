import { seedMatches } from "./data/seedMatches";
import type { DataSource, Match, ProviderResult } from "./types";

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40";
const WORLDCUP26_URL = "https://worldcup26.ir/get/games";
const API_FOOTBALL_KEY = import.meta.env.VITE_APIFOOTBALL_KEY as string | undefined;
const API_FOOTBALL_HOST = "https://v3.football.api-sports.io";

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
    return {
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
    };
  });
  if (matches.length === 0) throw new Error("ESPN returned no matches");
  return { source: "espn", matches };
};

export const loadFromWorldcup26 = async (): Promise<ProviderResult> => {
  const res = await timeoutFetch(WORLDCUP26_URL);
  if (!res.ok) throw new Error(`worldcup26 returned ${res.status}`);
  const data = await res.json();
  const games = Array.isArray(data.games) ? data.games : [];
  const matches: Match[] = games.map((game: any) => {
    const kickoffAt = new Date(`${game.local_date ?? ""} UTC`).toISOString();
    const finished = String(game.finished).toLowerCase() === "true";
    return {
      id: `worldcup26-${game.id}`,
      homeTeam: game.home_team_name_en ?? "Home",
      awayTeam: game.away_team_name_en ?? "Away",
      kickoffAt,
      stage: game.type ?? `Matchday ${game.matchday ?? ""}`,
      status: finished ? "finished" : "upcoming",
      dataSource: "worldcup26",
      homeScore: numberOrUndefined(game.home_score),
      awayScore: numberOrUndefined(game.away_score),
    };
  });
  if (matches.length === 0) throw new Error("worldcup26 returned no matches");
  return { source: "worldcup26", matches };
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
  const matches: Match[] = fixtures.map((item: any) => ({
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
        fifaRank: Number(item.teams?.home?.id ?? 0),
        form: ["API", "LIVE", "FORM"],
        lastFiveGoalsFor: numberOrUndefined(item.goals?.home) ?? 0,
        lastFiveGoalsAgainst: numberOrUndefined(item.goals?.away) ?? 0,
        unavailable: ["Use injuries endpoint for configured deployments"],
        probableLineup: ["Use lineups endpoint when fixture enters pre-match window"],
      },
      away: {
        fifaRank: Number(item.teams?.away?.id ?? 0),
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
  }));
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

const apiFootballJson = async (path: string) => {
  if (!API_FOOTBALL_KEY) throw new Error("VITE_APIFOOTBALL_KEY is not configured");
  const res = await timeoutFetch(`${API_FOOTBALL_HOST}${path}`, 7500, {
    "x-apisports-key": API_FOOTBALL_KEY,
  });
  if (!res.ok) throw new Error(`API-Football ${path} returned ${res.status}`);
  return res.json();
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
  return {
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
      oddsSnapshot: oddsSnapshot ?? "No odds payload returned.",
      lineupSource: lineups.status === "fulfilled" ? "API-Football lineups endpoint" : `Lineups unavailable: ${lineups.reason}`,
      injurySource: injuries.status === "fulfilled" ? "API-Football injuries endpoint" : `Injuries unavailable: ${injuries.reason}`,
      dataFreshness: new Date().toISOString(),
    },
  };
};

export const loadSeedMatches = (): ProviderResult => ({
  source: "seed",
  matches: seedMatches,
  warning: "Using bundled seed data. External score sync is unavailable.",
});

const withSeedUpcoming = (result: ProviderResult): ProviderResult => {
  const existing = new Set(
    result.matches.map((match) => `${match.homeTeam.toLowerCase()}-${match.awayTeam.toLowerCase()}`),
  );
  const futureSeed = seedMatches.filter((match) => {
    const key = `${match.homeTeam.toLowerCase()}-${match.awayTeam.toLowerCase()}`;
    return match.status === "upcoming" && !existing.has(key);
  });
  return { ...result, matches: [...result.matches, ...futureSeed] };
};

export const loadMatchesWithFallback = async (
  forceFailure: boolean,
): Promise<ProviderResult> => {
  const errors: string[] = [];
  if (!forceFailure) {
    try {
      return withSeedUpcoming(await loadFromApiFootball());
    } catch (error) {
      errors.push(`API-Football: ${(error as Error).message}`);
    }
    try {
      return withSeedUpcoming(await loadFromEspn());
    } catch (error) {
      errors.push(`ESPN: ${(error as Error).message}`);
    }
    try {
      const result = withSeedUpcoming(await loadFromWorldcup26());
      return {
        ...result,
        warning: `ESPN unavailable, using worldcup26 fallback. ${errors.join(" ")}`,
      };
    } catch (error) {
      errors.push(`worldcup26: ${(error as Error).message}`);
    }
  } else {
    errors.push("Forced API failure enabled for fallback testing.");
  }
  const seed = loadSeedMatches();
  return { ...seed, warning: errors.join(" ") || seed.warning };
};

export const sourceLabel = (source: DataSource) => {
  if (source === "espn") return "ESPN";
  if (source === "worldcup26") return "worldcup26";
  if (source === "api-football") return "API-Football";
  if (source === "thesportsdb") return "TheSportsDB";
  if (source === "manual") return "Manual";
  return "Seed";
};
