import { evaluateApiFootballEndpointRows, type ApiFootballEndpointKey } from "./apiFootballEndpointEvidence";
import { dataProxyUrlProblem, resolvedDataProviderProxyHealthUrl, resolvedDataProviderProxyUrl } from "./dataProviderReadiness";

export type DataDoctorStatus = "passed" | "failed" | "skipped" | "warning";

export type DataDoctorCheck = {
  id: string;
  label: string;
  required: boolean;
  status: DataDoctorStatus;
  detail: string;
  action: string;
  url?: string;
  sampleIds?: string[];
};

export type DataDoctorReport = {
  ready: boolean;
  requiredPassed: number;
  requiredTotal: number;
  checks: DataDoctorCheck[];
  nextActions: DataDoctorCheck[];
};

export type DataDoctorEnv = Record<string, string | undefined>;

type FetchLike = typeof fetch;

const env = (values: DataDoctorEnv, key: string) => values[key]?.trim() ?? "";
const has = (values: DataDoctorEnv, key: string) => env(values, key).length > 0;
const flagEnabled = (values: DataDoctorEnv, key: string) =>
  ["1", "true", "yes", "on"].includes(env(values, key).toLowerCase());
const dataProxyBase = (values: DataDoctorEnv) => resolvedDataProviderProxyUrl(values);
const usingSameOriginDataProxy = (values: DataDoctorEnv) =>
  !has(values, "VITE_DATA_PROXY_URL") && flagEnabled(values, "VITE_DATA_PROXY_SAME_ORIGIN") && Boolean(dataProxyBase(values));
const dataProxyReady = (values: DataDoctorEnv) => {
  const proxyBase = dataProxyBase(values);
  return Boolean(proxyBase && !dataProxyUrlProblem(proxyBase));
};
const proxiedPublicUrl = (values: DataDoctorEnv, targetUrl: string, source: string) => {
  const proxyBase = dataProxyBase(values);
  if (!dataProxyReady(values)) return targetUrl;
  const proxy = new URL(proxyBase, "http://localhost/");
  proxy.searchParams.set("url", targetUrl);
  proxy.searchParams.set("source", source);
  return proxy.toString();
};

const dataProxyHealthUrl = (values: DataDoctorEnv) => {
  if (!dataProxyReady(values)) return "";
  return resolvedDataProviderProxyHealthUrl(values);
};

const dataProxyConfigProblem = (values: DataDoctorEnv) => {
  const proxyBase = dataProxyBase(values);
  if (!proxyBase) return "VITE_DATA_PROXY_URL missing or VITE_DATA_PROXY_SAME_ORIGIN=1 without VITE_PUBLIC_APP_URL";
  return dataProxyUrlProblem(proxyBase, usingSameOriginDataProxy(values) ? "same-origin data proxy URL" : "VITE_DATA_PROXY_URL");
};

const dataProxyConfigDetail = (values: DataDoctorEnv) => {
  if (dataProxyReady(values)) return `${dataProxyBase(values)}${usingSameOriginDataProxy(values) ? " (same-origin)" : ""}`;
  return dataProxyConfigProblem(values);
};

const addCheck = (
  checks: DataDoctorCheck[],
  check: Omit<DataDoctorCheck, "status"> & { passed?: boolean; skipped?: boolean; warning?: boolean },
) => {
  const { passed, skipped, warning, ...rest } = check;
  checks.push({
    ...rest,
    status: skipped ? "skipped" : warning ? "warning" : passed ? "passed" : "failed",
  });
};

const readJson = async (fetcher: FetchLike, url: string, init?: RequestInit) => {
  const response = await fetcher(url, init);
  const text = await response.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { response, body, text };
};

const sampleValue = (value: any) => {
  if (value && typeof value === "object") return value.id ?? value.name ?? value.title ?? JSON.stringify(value).slice(0, 80);
  return value;
};
const hasIdentityValue = (value: unknown) => value !== undefined && value !== null && String(value).trim().length > 0;
const objectHasIdentity = (value: any) =>
  Boolean(value && typeof value === "object" && (hasIdentityValue(value.id) || hasIdentityValue(value.name)));

const sampleIds = (rows: any[], ...keys: string[]) =>
  rows
    .map((row) => sampleValue(keys.map((key) => row?.[key]).find((value) => value !== undefined && value !== null) ?? row?.id))
    .filter(hasIdentityValue)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, 5);

const openFootballSampleIds = (body: any) =>
  (Array.isArray(body?.matches) ? body.matches : [])
    .map((match: any, index: number) => {
      const explicit = sampleValue(match?.id ?? match?.num);
      if (hasIdentityValue(explicit)) return String(explicit).trim();
      const teams = [match?.team1, match?.team2].filter(hasIdentityValue).join("-");
      const date = hasIdentityValue(match?.date) ? String(match.date).trim() : `match-${index + 1}`;
      return teams ? `${date}:${teams}` : date;
    })
    .filter(Boolean)
    .slice(0, 5);

const apiFootballKey = (values: DataDoctorEnv) =>
  env(values, "APIFOOTBALL_KEY") || env(values, "API_FOOTBALL_KEY") || env(values, "VITE_APIFOOTBALL_KEY");
const apiFootballConfigured = (values: DataDoctorEnv) => Boolean(apiFootballKey(values) || dataProxyReady(values));
const apiFootballProxyConfigured = (values: DataDoctorEnv) => !apiFootballKey(values) && dataProxyReady(values);
const apiFootballTargetUrl = (path: string) => `https://v3.football.api-sports.io${path}`;
const apiFootballUrl = (values: DataDoctorEnv, path: string) =>
  apiFootballKey(values) ? apiFootballTargetUrl(path) : proxiedPublicUrl(values, apiFootballTargetUrl(path), "api-football");
const apiFootballRequestInit = (values: DataDoctorEnv) =>
  apiFootballKey(values)
    ? { headers: { "x-apisports-key": apiFootballKey(values) } }
    : undefined;
const oddsApiDirectConfigured = (values: DataDoctorEnv) =>
  has(values, "VITE_ODDS_API_KEY") && has(values, "VITE_ODDS_API_SPORT_KEY");
const oddsApiProxyConfigured = (values: DataDoctorEnv) =>
  dataProxyReady(values) && has(values, "VITE_ODDS_API_SPORT_KEY") && !has(values, "VITE_ODDS_API_KEY");
const oddsApiConfigured = (values: DataDoctorEnv) => oddsApiDirectConfigured(values) || oddsApiProxyConfigured(values);
const footballDataToken = (values: DataDoctorEnv) =>
  env(values, "FOOTBALL_DATA_TOKEN") || env(values, "FOOTBALL_DATA_ORG_TOKEN") || env(values, "VITE_FOOTBALL_DATA_TOKEN");
const footballDataCompetition = (values: DataDoctorEnv) => env(values, "VITE_FOOTBALL_DATA_COMPETITION") || "WC";
const footballDataBackupRequired = (values: DataDoctorEnv) =>
  flagEnabled(values, "KICKOFF_REQUIRE_FOOTBALL_DATA_BACKUP") || flagEnabled(values, "KICKOFF_DISABLE_PUBLIC_FREE_FEEDS");
const footballDataConfigured = (values: DataDoctorEnv) => Boolean(footballDataToken(values) || dataProxyReady(values));
const footballDataProxyConfigured = (values: DataDoctorEnv) =>
  footballDataBackupRequired(values) && !footballDataToken(values) && dataProxyReady(values);
const footballDataTargetUrl = (values: DataDoctorEnv, route: "matches" | "standings") => {
  const season = env(values, "KICKOFF_DATA_SCOUT_SEASON") || String(new Date().getUTCFullYear());
  return `https://api.football-data.org/v4/competitions/${encodeURIComponent(footballDataCompetition(values))}/${route}?season=${encodeURIComponent(season)}`;
};
const footballDataUrl = (values: DataDoctorEnv, route: "matches" | "standings") =>
  footballDataToken(values)
    ? footballDataTargetUrl(values, route)
    : proxiedPublicUrl(values, footballDataTargetUrl(values, route), "football-data");
const footballDataRequestInit = (values: DataDoctorEnv) =>
  footballDataToken(values)
    ? { headers: { "X-Auth-Token": footballDataToken(values) } }
    : undefined;

const worldcup26Rows = (body: any) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.games)) return body.games;
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

const yearFromText = (value: unknown) => {
  const match = String(value ?? "").match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : undefined;
};

const yearFromRow = (row: any, keys: string[]) => {
  for (const key of keys) {
    const value = row?.[key];
    const year = yearFromText(value);
    if (year) return year;
  }
  return undefined;
};

const explicitSeasonYears = (rows: any[], keys: string[]) =>
  rows
    .map((row) => Number(row?.season?.year ?? row?.league?.season ?? row?.strSeason ?? yearFromRow(row, keys)))
    .filter((year) => Number.isInteger(year) && year > 2000 && year < 2100);

const scopedSeasonPayload = (rows: any[], targetSeason: number, keys: string[]) => {
  const years = explicitSeasonYears(rows, keys);
  return {
    hasRows: rows.length > 0,
    years,
    passed: rows.length > 0 && years.every((year) => year === targetSeason),
  };
};

const targetSeasonTextPresent = (body: any, targetSeason: number) =>
  String(body?.name ?? body?.title ?? body?.season ?? body?.strSeason ?? "").includes(String(targetSeason));

const espnWorldCupRowsFresh = (body: any, targetSeason: number) => {
  const events = Array.isArray(body?.events) ? body.events : [];
  const leagueSeasonYears: number[] = (Array.isArray(body?.leagues) ? body.leagues : [])
    .map((league: any) => Number(league?.season?.year ?? league?.calendar?.[0]?.season))
    .filter((year: number) => Number.isInteger(year));
  const eventYears = explicitSeasonYears(events, ["date", "competitions.0.date"]);
  return (
    events.length > 0 &&
    (leagueSeasonYears.includes(targetSeason) || eventYears.includes(targetSeason)) &&
    [...leagueSeasonYears, ...eventYears].every((year: number) => year === targetSeason)
  );
};

export const dataDoctorFixtureIds = (values: DataDoctorEnv) => {
  const multi = env(values, "KICKOFF_VERIFY_FIXTURE_IDS")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(multi)];
};

export const dataDoctorRequiredFixtureTargetCount = (values: DataDoctorEnv) =>
  Math.max(1, Number(env(values, "KICKOFF_DATA_SCOUT_TARGETS") || 3) || 3);

const requiredSignals: ApiFootballEndpointKey[] = ["lineups", "injuries", "odds", "standings"];
const requiredSignalRows = (signal: ApiFootballEndpointKey) => (signal === "standings" || signal === "lineups" ? 2 : 1);

const parseFixtureSignalMatrix = (matrix: string) =>
  matrix
    .split(/[,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [fixtureId = "", signalText = ""] = entry.split(":");
      const signals = Object.fromEntries(
        signalText
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => {
            const [key = "", rows = "0"] = item.split("=");
            return [key.trim(), Number(rows)];
          }),
      ) as Partial<Record<ApiFootballEndpointKey, number>>;
      return { fixtureId: fixtureId.trim(), signals };
    });

const fixtureSignalMatrixProblems = (values: DataDoctorEnv) => {
  const fixtureIds = dataDoctorFixtureIds(values);
  const matrix = env(values, "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX");
  if (!matrix) return ["KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing"];
  const rows = parseFixtureSignalMatrix(matrix);
  return fixtureIds.flatMap((fixtureId) => {
    const row = rows.find((item) => item.fixtureId === fixtureId);
    if (!row) return [`KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing ${fixtureId}`];
    return requiredSignals
      .filter((signal) => !Number.isFinite(row.signals[signal]) || Number(row.signals[signal]) < requiredSignalRows(signal))
      .map((signal) => `${fixtureId} missing ${signal} rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX`);
  });
};

const standingsRows = (body: any) => {
  const leagues = Array.isArray(body?.response) ? body.response : [];
  return leagues.flatMap((item: any) => {
    const groups = Array.isArray(item?.league?.standings)
      ? item.league.standings
      : Array.isArray(item?.standings)
        ? item.standings
        : [];
    return groups.flatMap((groupRows: any) => (Array.isArray(groupRows) ? groupRows : [groupRows]));
  });
};

const footballDataStandingRows = (body: any) =>
  (Array.isArray(body?.standings) ? body.standings : []).flatMap((group: any) =>
    Array.isArray(group?.table) ? group.table : [],
  );

const validFootballDataMatches = (body: any) =>
  (Array.isArray(body?.matches) ? body.matches : []).filter(
    (match: any) =>
      (match?.id || match?.utcDate) &&
      (match?.homeTeam?.name || match?.homeTeam?.shortName || match?.homeTeam?.id) &&
      (match?.awayTeam?.name || match?.awayTeam?.shortName || match?.awayTeam?.id),
  );

const validFootballDataStandings = (body: any) =>
  footballDataStandingRows(body).filter(
    (row: any) =>
      (row?.team?.name || row?.team?.shortName || row?.team?.id) &&
      (Number.isFinite(Number(row?.position)) || Number.isFinite(Number(row?.rank))) &&
      Number.isFinite(Number(row?.points)),
  );

const checkFootballDataReadback = async (
  values: DataDoctorEnv,
  fetcher: FetchLike,
  checks: DataDoctorCheck[],
) => {
  if (!footballDataConfigured(values)) {
    addCheck(checks, {
      id: "football-data-readback",
      label: "Football-Data.org matches/standings read-back",
      required: footballDataBackupRequired(values),
      warning: !footballDataBackupRequired(values),
      detail: "Missing Football-Data.org token or data proxy",
      action:
        "Optional: set FOOTBALL_DATA_TOKEN, FOOTBALL_DATA_ORG_TOKEN or VITE_FOOTBALL_DATA_TOKEN for direct diagnostics, or deploy the data proxy with FOOTBALL_DATA_TOKEN for a second matches/standings backup.",
    });
    return;
  }

  const matchesUrl = footballDataUrl(values, "matches");
  const standingsUrl = footballDataUrl(values, "standings");
  try {
    const [matchesResult, standingsResult] = await Promise.all([
      readJson(fetcher, matchesUrl, footballDataRequestInit(values)),
      readJson(fetcher, standingsUrl, footballDataRequestInit(values)),
    ]);
    const matches = matchesResult.response.ok ? validFootballDataMatches(matchesResult.body) : [];
    const standings = standingsResult.response.ok ? validFootballDataStandings(standingsResult.body) : [];
    addCheck(checks, {
      id: "football-data-readback",
      label: "Football-Data.org matches/standings read-back",
      required: footballDataBackupRequired(values),
      passed: matches.length > 0 && standings.length >= 2,
      warning: !footballDataBackupRequired(values) && !(matches.length > 0 && standings.length >= 2),
      detail:
        matchesResult.response.ok && standingsResult.response.ok
          ? `${matches.length} valid match rows, ${standings.length} valid standing rows for ${footballDataCompetition(values)}`
          : `matches HTTP ${matchesResult.response.status}, standings HTTP ${standingsResult.response.status}`,
      action:
        "Use a Football-Data.org competition/season where matches returns fixture rows and standings returns at least two ranked teams.",
      url: matchesUrl,
      sampleIds: [...sampleIds(matches, "id", "utcDate"), ...sampleIds(standings, "position", "team")].slice(0, 5),
    });
  } catch (error) {
    addCheck(checks, {
      id: "football-data-readback",
      label: "Football-Data.org matches/standings read-back",
      required: footballDataBackupRequired(values),
      warning: !footballDataBackupRequired(values),
      detail: String(error),
      action:
        "Optional: verify the Football-Data.org token, competition code and data proxy route for a second matches/standings backup.",
      url: matchesUrl,
    });
  }
};

const checkApiFootballStandings = async (
  values: DataDoctorEnv,
  fetcher: FetchLike,
  checks: DataDoctorCheck[],
) => {
  if (!apiFootballConfigured(values)) {
    addCheck(checks, {
      id: "api-football-standings-readback",
      label: "API-Football standings read-back",
      required: true,
      detail: "Missing API-Football key or data proxy",
      action: "Configure APIFOOTBALL_KEY for server-side proxy calls, VITE_APIFOOTBALL_KEY for direct calls, or deploy a data proxy with the server key.",
    });
    return;
  }
  const league = env(values, "KICKOFF_DATA_SCOUT_LEAGUE_ID") || "1";
  const season = env(values, "KICKOFF_DATA_SCOUT_SEASON") || String(new Date().getUTCFullYear());
  const url = apiFootballUrl(values, `/standings?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`);
  try {
    const { response, body } = await readJson(fetcher, url, apiFootballRequestInit(values));
    const rows = standingsRows(body);
    const evaluation = evaluateApiFootballEndpointRows("standings", rows);
    const validRows = response.ok ? evaluation.validRows : [];
    addCheck(checks, {
      id: "api-football-standings-readback",
      label: "API-Football standings read-back",
      required: true,
      passed: response.ok && validRows.length >= 2,
      detail: response.ok
        ? `${validRows.length}/${rows.length} valid standings rows for league ${league} season ${season}`
        : `HTTP ${response.status}`,
      action: "Use an API-Football league/season where standings returns at least two team rank and points rows for target fixture context.",
      url,
      sampleIds: sampleIds(validRows, "team", "rank", "position"),
    });
  } catch (error) {
    addCheck(checks, {
      id: "api-football-standings-readback",
      label: "API-Football standings read-back",
      required: true,
      detail: String(error),
      action: "Use an API-Football league/season where standings returns team rank and points rows.",
      url,
    });
  }
};

const endpointRows = async (
  values: DataDoctorEnv,
  fetcher: FetchLike,
  checks: DataDoctorCheck[],
  options: {
    id: string;
    label: string;
    key: ApiFootballEndpointKey;
    path: (fixtureId: string) => string;
    action: string;
  },
) => {
  if (!apiFootballConfigured(values)) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      detail: "Missing API-Football key or data proxy",
      action: "Configure APIFOOTBALL_KEY for server-side proxy calls, VITE_APIFOOTBALL_KEY for direct calls, or deploy a data proxy with the server key.",
    });
    return 0;
  }
  const fixtureIds = dataDoctorFixtureIds(values);
  if (fixtureIds.length === 0) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      detail: has(values, "KICKOFF_VERIFY_FIXTURE_ID")
        ? "KICKOFF_VERIFY_FIXTURE_IDS missing; legacy KICKOFF_VERIFY_FIXTURE_ID is not enough"
        : "KICKOFF_VERIFY_FIXTURE_IDS missing",
      action: "Set KICKOFF_VERIFY_FIXTURE_IDS to fixture ids where this endpoint returns live rows.",
    });
    return 0;
  }
  const results = await Promise.all(
    fixtureIds.map(async (fixtureId) => {
      const url = apiFootballUrl(values, options.path(fixtureId));
      try {
        const { response, body } = await readJson(fetcher, url, apiFootballRequestInit(values));
        const rows = Array.isArray(body?.response) ? body.response : [];
        const evaluation = evaluateApiFootballEndpointRows(options.key, rows, {
          fixtureId,
          requireFixtureIdentity: options.key === "injuries" || options.key === "odds",
        });
        return {
          fixtureId,
          url,
          rows: evaluation.validRows,
          rowCount: response.ok ? evaluation.validRows.length : 0,
          passed: response.ok && evaluation.passed,
          detail: response.ok ? evaluation.detail : `HTTP ${response.status}`,
        };
      } catch (error) {
        return {
          fixtureId,
          url,
          rows: [],
          rowCount: 0,
          passed: false,
          detail: String(error),
        };
      }
    }),
  );
  const passed = results.every((result) => result.passed);
  const totalRows = results.reduce((sum, result) => sum + result.rowCount, 0);
  addCheck(checks, {
    id: options.id,
    label: options.label,
    required: true,
    passed,
    detail: results.map((result) => `${result.fixtureId}:${result.detail}`).join(" · "),
    action: options.action,
    url: results[0]?.url,
    sampleIds: [
      ...new Set(
        results.flatMap((result) =>
          sampleIds(result.rows, "team", "player", "fixture", "league", "bookmakers", "id"),
        ),
      ),
    ].slice(0, 5),
  });
  return totalRows;
};

const checkFreeFeeds = async (
  values: DataDoctorEnv,
  fetcher: FetchLike,
  checks: DataDoctorCheck[],
) => {
  const key = env(values, "VITE_THESPORTSDB_KEY") || "123";
  const league = env(values, "VITE_THESPORTSDB_LEAGUE_ID") || "4429";
  const season = env(values, "VITE_THESPORTSDB_SEASON") || String(new Date().getUTCFullYear());
  const targetSeason = Number(season) || new Date().getUTCFullYear();
  const feeds = [
    {
      id: "thesportsdb-season",
      label: "TheSportsDB season feed",
      source: "thesportsdb",
      url: `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsseason.php?id=${encodeURIComponent(league)}&s=${encodeURIComponent(season)}`,
      validate: (body: any) =>
        scopedSeasonPayload(Array.isArray(body?.events) ? body.events : [], targetSeason, [
          "dateEvent",
          "strTimestamp",
          "strSeason",
        ]).passed,
      ids: (body: any) => sampleIds(Array.isArray(body?.events) ? body.events : [], "idEvent"),
    },
    {
      id: "openfootball-worldcup-json",
      label: "openfootball World Cup 2026 JSON",
      source: "openfootball",
      url: "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
      validate: (body: any) => {
        const rows = Array.isArray(body?.matches) ? body.matches : [];
        const scoped = scopedSeasonPayload(rows, targetSeason, ["date"]);
        return rows.length > 0 && scoped.years.every((year) => year === targetSeason) && targetSeasonTextPresent(body, targetSeason);
      },
      ids: openFootballSampleIds,
    },
    {
      id: "espn-world-cup-scoreboard",
      label: "ESPN World Cup scoreboard",
      source: "espn",
      url: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40",
      validate: (body: any) =>
        Array.isArray(body?.events) &&
        body.events.length > 0 &&
        Array.isArray(body?.leagues) &&
        body.leagues.some((leagueItem: any) => String(leagueItem?.slug ?? "").includes("fifa.world")) &&
        espnWorldCupRowsFresh(body, targetSeason),
      ids: (body: any) => sampleIds(Array.isArray(body?.events) ? body.events : [], "id"),
    },
    {
      id: "worldcup26-games",
      label: "worldcup26 games feed",
      source: "worldcup26",
      url: "https://worldcup26.ir/get/games",
      validate: (body: any) =>
        scopedSeasonPayload(worldcup26Rows(body), targetSeason, ["date", "utcDate", "start_time"]).passed,
      ids: (body: any) => sampleIds(worldcup26Rows(body), "id", "game_id"),
    },
  ];
  const results: Array<{ id: string; label: string; passed: boolean; detail: string }> = [];
  const useDataProxy = dataProxyReady(values);
  for (const feed of feeds) {
    const url = proxiedPublicUrl(values, feed.url, feed.source);
    try {
      const { response, body } = await readJson(fetcher, url);
      const passed = response.ok && feed.validate(body);
      const detail = passed
        ? `HTTP ${response.status}${useDataProxy ? " via data proxy" : ""}`
        : `HTTP ${response.status}, World Cup ${targetSeason} payload missing or stale`;
      results.push({ id: feed.id, label: feed.label, passed, detail });
      addCheck(checks, {
        id: feed.id,
        label: feed.label,
        required: false,
        passed,
        warning: !passed,
        detail,
      action: useDataProxy
        ? "Keep the data proxy healthy for static-hosting free feed continuity."
          : "Configure an HTTPS VITE_DATA_PROXY_URL, enable VITE_DATA_PROXY_SAME_ORIGIN=1, or keep direct public feed access healthy for continuity.",
        url,
        sampleIds: passed ? feed.ids(body) : [],
      });
    } catch (error) {
      results.push({ id: feed.id, label: feed.label, passed: false, detail: String(error) });
      addCheck(checks, {
        id: feed.id,
        label: feed.label,
        required: false,
        warning: true,
        detail: String(error),
        action: dataProxyBase(values)
          ? "Keep the data proxy healthy for static-hosting free feed continuity."
          : "Configure VITE_DATA_PROXY_URL, enable VITE_DATA_PROXY_SAME_ORIGIN=1, or keep direct public feed access healthy for continuity.",
        url,
      });
    }
  }
  addCheck(checks, {
    id: "data-proxy-config",
    label: "Static hosting data proxy",
    required: true,
    passed: dataProxyReady(values),
    detail: dataProxyConfigDetail(values),
    action:
      "Deploy server/data-proxy-worker.mjs as a Worker URL, or deploy the bundled Pages function and set VITE_DATA_PROXY_SAME_ORIGIN=1.",
  });
  const healthUrl = dataProxyHealthUrl(values);
  if (!healthUrl) {
    addCheck(checks, {
      id: "data-proxy-health",
      label: "Static hosting data proxy health",
      required: true,
      detail: "data proxy URL missing or invalid",
      action:
        "Deploy server/data-proxy-worker.mjs and expose /health from the Worker URL, or /data-proxy/health from the same-origin Pages function.",
    });
  } else {
    try {
      const { response, body } = await readJson(fetcher, healthUrl);
      const allowedHosts = Array.isArray(body?.allowedHosts) ? body.allowedHosts : [];
      const allowedRoutes = Array.isArray(body?.allowedRoutes) ? body.allowedRoutes : [];
      const expectedHosts = [
        "api.football-data.org",
        "api.the-odds-api.com",
        "raw.githubusercontent.com",
        "site.api.espn.com",
        "v3.football.api-sports.io",
        "www.thesportsdb.com",
        "worldcup26.ir",
      ];
      const expectedRoutes = [
        "api.football-data.org/v4/competitions/:competition/matches",
        "api.football-data.org/v4/competitions/:competition/standings",
        "api.the-odds-api.com/v4/sports/:sport/odds",
        "raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
        "v3.football.api-sports.io/fixtures",
        "v3.football.api-sports.io/fixtures/lineups",
        "v3.football.api-sports.io/injuries",
        "v3.football.api-sports.io/odds",
        "v3.football.api-sports.io/standings",
        "site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
        "worldcup26.ir/get/games",
        "www.thesportsdb.com/api/v1/json/:key/eventsseason.php",
        "www.thesportsdb.com/api/v1/json/:key/eventsnextleague.php",
        "www.thesportsdb.com/api/v1/json/:key/lookuptable.php",
        "www.thesportsdb.com/api/v1/json/:key/lookuplineup.php",
        "www.thesportsdb.com/api/v1/json/:key/lookupeventstats.php",
      ];
      const providerCapabilities = Array.isArray(body?.providerCapabilities) ? body.providerCapabilities : [];
      const expectedProviderSources = [
        "api-football",
        "football-data",
        "odds-api",
        "espn",
        "openfootball",
        "thesportsdb",
        "worldcup26",
      ];
      const providerFor = (source: string) => providerCapabilities.find((item: any) => item?.source === source);
      const hostCoverage = expectedHosts.every((host) => allowedHosts.includes(host));
      const routeCoverage = expectedRoutes.every((route) => allowedRoutes.includes(route));
      const providerCoverage = expectedProviderSources.every((source) => {
        const provider = providerFor(source);
        return Boolean(
          provider &&
            typeof provider.host === "string" &&
            Array.isArray(provider.routes) &&
            provider.routes.length > 0 &&
            provider.cacheable === true &&
            provider.staleFallback === true &&
            typeof provider.serverCredentialRequired === "boolean" &&
            typeof provider.serverCredentialPresent === "boolean",
        );
      });
      const publicProviderMatrixReady = ["espn", "openfootball", "thesportsdb", "worldcup26"].every((source) => {
        const provider = providerFor(source);
        return Boolean(provider && provider.serverCredentialRequired === false && provider.serverCredentialPresent === true);
      });
      const cacheTtlSeconds = Number(body?.cacheTtlSeconds);
      const staleTtlSeconds = Number(body?.staleTtlSeconds);
      const maxResponseBytes = Number(body?.maxResponseBytes);
      const cacheReady = Number.isFinite(cacheTtlSeconds) && cacheTtlSeconds >= 30;
      const staleFallbackReady =
        body?.staleFallback === true && Number.isFinite(staleTtlSeconds) && staleTtlSeconds >= cacheTtlSeconds;
      const sizeGuardReady = Number.isFinite(maxResponseBytes) && maxResponseBytes >= 100_000;
      const corsReady = response.headers.get("access-control-allow-origin") === "*";
      const apiFootballServerKeyReady = !apiFootballProxyConfigured(values) || body?.apiFootballServerKey === true;
      const oddsApiServerKeyReady = !oddsApiProxyConfigured(values) || body?.oddsApiServerKey === true;
      const footballDataServerTokenReady =
        !footballDataProxyConfigured(values) || body?.footballDataServerToken === true;
      const providerCredentialMatrixReady =
        (!apiFootballProxyConfigured(values) || providerFor("api-football")?.serverCredentialPresent === true) &&
        (!oddsApiProxyConfigured(values) || providerFor("odds-api")?.serverCredentialPresent === true) &&
        (!footballDataProxyConfigured(values) || providerFor("football-data")?.serverCredentialPresent === true);
      const contractReady =
        body?.ok === true &&
        body?.service === "kickoff-data-proxy" &&
        hostCoverage &&
        routeCoverage &&
        providerCoverage &&
        publicProviderMatrixReady &&
        cacheReady &&
        staleFallbackReady &&
        sizeGuardReady &&
        corsReady &&
        apiFootballServerKeyReady &&
        oddsApiServerKeyReady &&
        footballDataServerTokenReady &&
        providerCredentialMatrixReady;
      addCheck(checks, {
        id: "data-proxy-health",
        label: "Static hosting data proxy health",
        required: true,
        passed: response.ok && contractReady,
        detail: response.ok
          ? contractReady
            ? `healthy; allowed ${allowedHosts.join(", ")}; providers ${providerCapabilities.length}; cache ${cacheTtlSeconds}s; stale ${staleTtlSeconds}s; max ${maxResponseBytes} bytes`
            : [
                body?.ok === true ? "" : "ok flag missing",
                body?.service === "kickoff-data-proxy" ? "" : "service mismatch",
                hostCoverage ? "" : "allowed host coverage incomplete",
                routeCoverage ? "" : "allowed route coverage incomplete",
                providerCoverage ? "" : "provider capability matrix incomplete",
                publicProviderMatrixReady ? "" : "public provider capability matrix incomplete",
                cacheReady ? "" : "cacheTtlSeconds missing or too low",
                staleFallbackReady ? "" : "stale fallback missing or too low",
                sizeGuardReady ? "" : "maxResponseBytes missing or too low",
                corsReady ? "" : "CORS wildcard header missing",
                apiFootballServerKeyReady ? "" : "server-side APIFOOTBALL_KEY missing from data proxy",
                oddsApiServerKeyReady ? "" : "server-side ODDS_API_KEY missing from data proxy",
                footballDataServerTokenReady ? "" : "server-side FOOTBALL_DATA_TOKEN missing from data proxy",
                providerCredentialMatrixReady ? "" : "provider capability matrix credential status is not ready",
              ].filter(Boolean).join("; ")
          : `HTTP ${response.status}`,
        action:
          "Deploy server/data-proxy-worker.mjs and expose /health with allowed hosts/routes, provider capability matrix, cache TTL, stale fallback, response size guard, CORS headers and server-side APIFOOTBALL_KEY/ODDS_API_KEY/FOOTBALL_DATA_TOKEN when enrichment is proxied.",
        url: healthUrl,
        sampleIds: [...allowedHosts, ...allowedRoutes, ...providerCapabilities.map((provider: any) => String(provider?.source ?? "")).filter(Boolean)],
      });
    } catch (error) {
      addCheck(checks, {
        id: "data-proxy-health",
        label: "Static hosting data proxy health",
        required: true,
        detail: String(error),
        action: "Deploy server/data-proxy-worker.mjs and expose /health with allowed hosts/routes, cache TTL, stale fallback, response size guard and CORS headers.",
        url: healthUrl,
      });
    }
  }
  const continuityPassed = results.some((result) => result.passed);
  addCheck(checks, {
    id: "free-feed-continuity",
    label: "Free public football feed continuity",
    required: true,
    passed: continuityPassed,
    detail: results.map((result) => `${result.label}:${result.passed ? "ok" : result.detail}`).join(" · "),
    action: "Keep TheSportsDB or ESPN reachable so schedule/score continuity does not depend on seed data.",
  });
};

const checkOddsApi = async (
  values: DataDoctorEnv,
  fetcher: FetchLike,
  checks: DataDoctorCheck[],
) => {
  const configured = oddsApiConfigured(values);
  addCheck(checks, {
    id: "odds-provider-config",
    label: "Odds provider config",
    required: true,
    passed: apiFootballConfigured(values) || configured,
    detail: configured
      ? oddsApiProxyConfigured(values)
        ? "The Odds API routed through data proxy"
        : "The Odds API configured"
      : apiFootballConfigured(values)
        ? "API-Football odds route configured"
        : "Missing odds provider keys",
    action:
      "Configure API-Football odds through APIFOOTBALL_KEY/VITE_APIFOOTBALL_KEY/data proxy, or set VITE_ODDS_API_SPORT_KEY with server-side ODDS_API_KEY on the data proxy.",
  });
  if (!configured) {
    addCheck(checks, {
      id: "odds-api-h2h-readback",
      label: "The Odds API H2H/spread read-back",
      required: false,
      skipped: true,
      detail: "VITE_ODDS_API_SPORT_KEY missing, or VITE_ODDS_API_KEY/data proxy ODDS_API_KEY missing",
      action: "Optionally configure The Odds API to enrich H2H and spread/handicap prices for non API-Football fixtures without exposing the key.",
    });
    return;
  }
  const params = new URLSearchParams({
    regions: env(values, "VITE_ODDS_API_REGIONS") || "us,uk,eu",
    markets: "h2h,spreads",
    oddsFormat: "decimal",
  });
  if (has(values, "VITE_ODDS_API_KEY")) params.set("apiKey", env(values, "VITE_ODDS_API_KEY"));
  const directUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(env(values, "VITE_ODDS_API_SPORT_KEY"))}/odds?${params.toString()}`;
  const url = oddsApiProxyConfigured(values) ? proxiedPublicUrl(values, directUrl, "odds-api") : directUrl;
  try {
    const { response, body } = await readJson(fetcher, url);
    const rows = Array.isArray(body) ? body : [];
    const hasPricedMarket = (row: any, key: "h2h" | "spreads") =>
      Array.isArray(row?.bookmakers) &&
      row.bookmakers.some((bookmaker: any) =>
        Array.isArray(bookmaker?.markets) &&
        bookmaker.markets.some((market: any) => {
          if (market?.key !== key || !Array.isArray(market?.outcomes)) return false;
          return market.outcomes.some(
            (outcome: any) =>
              hasIdentityValue(outcome?.name) &&
              Number.isFinite(Number(outcome?.price)) &&
              (key === "h2h" || Number.isFinite(Number(outcome?.point))),
          );
        }),
      );
    const validH2hRows = rows.filter((row: any) => hasPricedMarket(row, "h2h"));
    const validSpreadRows = rows.filter((row: any) => hasPricedMarket(row, "spreads"));
    const validRows = rows.filter((row: any) => hasPricedMarket(row, "h2h") && hasPricedMarket(row, "spreads"));
    addCheck(checks, {
      id: "odds-api-h2h-readback",
      label: "The Odds API H2H/spread read-back",
      required: false,
      passed: response.ok && validRows.length > 0,
      warning: response.ok && validRows.length === 0,
      detail: response.ok
        ? `${validH2hRows.length}/${rows.length} event${rows.length === 1 ? "" : "s"} returned with priced H2H markets · ${validSpreadRows.length}/${rows.length} with priced spread/handicap markets`
        : `HTTP ${response.status}`,
      action: "Use a sport key and region where H2H plus spreads/handicap odds are available.",
      url,
      sampleIds: sampleIds(validRows, "id", "home_team"),
    });
  } catch (error) {
    addCheck(checks, {
      id: "odds-api-h2h-readback",
      label: "The Odds API H2H/spread read-back",
      required: false,
      warning: true,
      detail: String(error),
      action: "Use a sport key and region where H2H plus spreads/handicap odds are available.",
      url,
    });
  }
};

export const buildDataProductionDoctorReport = async (
  values: DataDoctorEnv,
  fetcher: FetchLike = fetch,
): Promise<DataDoctorReport> => {
  const checks: DataDoctorCheck[] = [];
  await checkFreeFeeds(values, fetcher, checks);

  const fixtureIds = dataDoctorFixtureIds(values);
  const requiredFixtureTargets = dataDoctorRequiredFixtureTargetCount(values);
  addCheck(checks, {
    id: "api-football-key",
    label: "API-Football key",
    required: true,
    passed: apiFootballConfigured(values),
    detail: apiFootballKey(values)
      ? "API-Football key configured for doctor calls"
      : dataProxyReady(values)
        ? "API-Football routed through data proxy"
        : "Missing API-Football key or data proxy",
    action: "Configure APIFOOTBALL_KEY for server-side proxy calls, VITE_APIFOOTBALL_KEY for direct calls, or deploy the data proxy with APIFOOTBALL_KEY for fixtures, lineups, injuries and odds.",
  });
  addCheck(checks, {
    id: "api-football-fixture-target",
    label: "API-Football fixture targets",
    required: true,
    passed: fixtureIds.length >= requiredFixtureTargets,
    detail: fixtureIds.length > 0
      ? `${fixtureIds.length}/${requiredFixtureTargets} target fixture${requiredFixtureTargets === 1 ? "" : "s"}: ${fixtureIds.join(", ")}`
      : has(values, "KICKOFF_VERIFY_FIXTURE_ID")
        ? "KICKOFF_VERIFY_FIXTURE_IDS missing; legacy KICKOFF_VERIFY_FIXTURE_ID is not enough"
        : "KICKOFF_VERIFY_FIXTURE_IDS missing",
    action: `Set KICKOFF_VERIFY_FIXTURE_IDS to at least ${requiredFixtureTargets} World Cup fixtures with enrichment rows available.`,
  });
  const signalMatrixProblems = fixtureSignalMatrixProblems(values);
  addCheck(checks, {
    id: "api-football-fixture-signal-matrix",
    label: "API-Football fixture signal matrix",
    required: true,
    passed: fixtureIds.length >= requiredFixtureTargets && signalMatrixProblems.length === 0,
    detail:
      fixtureIds.length === 0
        ? "KICKOFF_VERIFY_FIXTURE_IDS missing"
        : signalMatrixProblems.length === 0
          ? `${fixtureIds.length}/${requiredFixtureTargets} target fixtures declare lineups, injuries, odds and standings rows`
          : signalMatrixProblems.join("; "),
    action: "Run bun run scout:data-targets so KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX covers every target fixture with positive lineups, injuries, odds and standings rows.",
    sampleIds: fixtureIds,
  });

  await Promise.all([
    checkFootballDataReadback(values, fetcher, checks),
    checkApiFootballStandings(values, fetcher, checks),
    endpointRows(values, fetcher, checks, {
      id: "api-football-lineups-readback",
      label: "API-Football lineups read-back",
      key: "lineups",
      path: (fixtureId) => `/fixtures/lineups?fixture=${encodeURIComponent(fixtureId)}`,
      action: "Use target fixtures close enough to kickoff that API-Football lineups returns rows for every target.",
    }),
    endpointRows(values, fetcher, checks, {
      id: "api-football-injuries-readback",
      label: "API-Football injuries read-back",
      key: "injuries",
      path: (fixtureId) => `/injuries?fixture=${encodeURIComponent(fixtureId)}`,
      action: "Use target fixtures where API-Football injuries returns unavailable-player rows for every target.",
    }),
    endpointRows(values, fetcher, checks, {
      id: "api-football-odds-readback",
      label: "API-Football odds read-back",
      key: "odds",
      path: (fixtureId) => `/odds?fixture=${encodeURIComponent(fixtureId)}`,
      action: "Use target fixtures and plan where API-Football odds returns bookmaker rows for every target.",
    }),
  ]);
  await checkOddsApi(values, fetcher, checks);

  const required = checks.filter((check) => check.required);
  const requiredPassed = required.filter((check) => check.status === "passed").length;
  return {
    ready: required.length > 0 && requiredPassed === required.length,
    requiredPassed,
    requiredTotal: required.length,
    checks,
    nextActions: checks.filter((check) => check.required && check.status !== "passed"),
  };
};
