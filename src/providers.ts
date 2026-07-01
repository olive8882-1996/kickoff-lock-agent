import { seedMatches } from "./data/seedMatches";
import type { DataSource, Match, ProviderResult } from "./types";

const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40";
const WORLDCUP26_URL = "https://worldcup26.ir/get/games";

const timeoutFetch = async (url: string, timeoutMs = 6500): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
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
  if (source === "manual") return "Manual";
  return "Seed";
};
