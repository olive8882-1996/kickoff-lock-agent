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

const sampleIds = (rows: any[], ...keys: string[]) =>
  rows
    .map((row) => sampleValue(keys.map((key) => row?.[key]).find((value) => value !== undefined && value !== null) ?? row?.id))
    .map(String)
    .filter(Boolean)
    .slice(0, 5);

const apiFootballHeaders = (values: DataDoctorEnv) => ({
  "x-apisports-key": env(values, "VITE_APIFOOTBALL_KEY"),
});

const apiFootballUrl = (path: string) => `https://v3.football.api-sports.io${path}`;

const endpointRows = async (
  values: DataDoctorEnv,
  fetcher: FetchLike,
  checks: DataDoctorCheck[],
  options: {
    id: string;
    label: string;
    path: string;
    action: string;
    sampleKeys?: string[];
  },
) => {
  if (!has(values, "VITE_APIFOOTBALL_KEY")) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      detail: "Missing VITE_APIFOOTBALL_KEY",
      action: "Configure API-Football before claiming live lineups, injuries or odds.",
    });
    return 0;
  }
  if (!has(values, "KICKOFF_VERIFY_FIXTURE_ID")) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      detail: "KICKOFF_VERIFY_FIXTURE_ID missing",
      action: "Set KICKOFF_VERIFY_FIXTURE_ID to a fixture where this endpoint returns live rows.",
    });
    return 0;
  }
  const url = apiFootballUrl(options.path);
  try {
    const { response, body } = await readJson(fetcher, url, { headers: apiFootballHeaders(values) });
    const rows = Array.isArray(body?.response) ? body.response : [];
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      passed: response.ok && rows.length > 0,
      detail: response.ok
        ? `${rows.length} row${rows.length === 1 ? "" : "s"} returned`
        : `HTTP ${response.status}`,
      action: options.action,
      url,
      sampleIds: sampleIds(rows, ...(options.sampleKeys ?? ["team", "player", "fixture", "league", "id"])),
    });
    return response.ok ? rows.length : 0;
  } catch (error) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      detail: String(error),
      action: options.action,
      url,
    });
    return 0;
  }
};

const checkFreeFeeds = async (
  values: DataDoctorEnv,
  fetcher: FetchLike,
  checks: DataDoctorCheck[],
) => {
  const key = env(values, "VITE_THESPORTSDB_KEY") || "123";
  const league = env(values, "VITE_THESPORTSDB_LEAGUE_ID") || "4429";
  const season = env(values, "VITE_THESPORTSDB_SEASON") || String(new Date().getUTCFullYear());
  const feeds = [
    {
      id: "thesportsdb-season",
      label: "TheSportsDB season feed",
      url: `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsseason.php?id=${encodeURIComponent(league)}&s=${encodeURIComponent(season)}`,
      validate: (body: any, text: string) => Array.isArray(body?.events) || text.includes("\"events\""),
      ids: (body: any) => sampleIds(Array.isArray(body?.events) ? body.events : [], "idEvent"),
    },
    {
      id: "espn-world-cup-scoreboard",
      label: "ESPN World Cup scoreboard",
      url: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40",
      validate: (body: any) =>
        Array.isArray(body?.leagues) && body.leagues.some((leagueItem: any) => String(leagueItem?.slug ?? "").includes("fifa.world")),
      ids: (body: any) => sampleIds(Array.isArray(body?.events) ? body.events : [], "id"),
    },
  ];
  const results: Array<{ id: string; label: string; passed: boolean; detail: string }> = [];
  for (const feed of feeds) {
    try {
      const { response, body, text } = await readJson(fetcher, feed.url);
      const passed = response.ok && feed.validate(body, text);
      results.push({ id: feed.id, label: feed.label, passed, detail: passed ? `HTTP ${response.status}` : `HTTP ${response.status}, World Cup payload missing` });
      addCheck(checks, {
        id: feed.id,
        label: feed.label,
        required: false,
        passed,
        warning: !passed,
        detail: passed ? `HTTP ${response.status}` : `HTTP ${response.status}, World Cup payload missing`,
        action: "Keep at least one free public schedule source healthy for continuity.",
        url: feed.url,
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
        action: "Keep at least one free public schedule source healthy for continuity.",
        url: feed.url,
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
  const configured = has(values, "VITE_ODDS_API_KEY") && has(values, "VITE_ODDS_API_SPORT_KEY");
  addCheck(checks, {
    id: "odds-provider-config",
    label: "Odds provider config",
    required: true,
    passed: has(values, "VITE_APIFOOTBALL_KEY") || configured,
    detail: configured
      ? "The Odds API configured"
      : has(values, "VITE_APIFOOTBALL_KEY")
        ? "API-Football odds route configured"
        : "Missing odds provider keys",
    action: "Configure API-Football odds or VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY.",
  });
  if (!configured) {
    addCheck(checks, {
      id: "odds-api-h2h-readback",
      label: "The Odds API H2H read-back",
      required: false,
      skipped: true,
      detail: "VITE_ODDS_API_KEY or VITE_ODDS_API_SPORT_KEY missing",
      action: "Optionally configure The Odds API to enrich H2H prices for non API-Football fixtures.",
    });
    return;
  }
  const params = new URLSearchParams({
    regions: env(values, "VITE_ODDS_API_REGIONS") || "us,uk,eu",
    markets: "h2h",
    oddsFormat: "decimal",
    apiKey: env(values, "VITE_ODDS_API_KEY"),
  });
  const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(env(values, "VITE_ODDS_API_SPORT_KEY"))}/odds?${params.toString()}`;
  try {
    const { response, body } = await readJson(fetcher, url);
    const rows = Array.isArray(body) ? body : [];
    addCheck(checks, {
      id: "odds-api-h2h-readback",
      label: "The Odds API H2H read-back",
      required: false,
      passed: response.ok && rows.length > 0,
      warning: response.ok && rows.length === 0,
      detail: response.ok ? `${rows.length} event${rows.length === 1 ? "" : "s"} returned` : `HTTP ${response.status}`,
      action: "Use a sport key and region where H2H odds are available.",
      url,
      sampleIds: sampleIds(rows, "id", "home_team"),
    });
  } catch (error) {
    addCheck(checks, {
      id: "odds-api-h2h-readback",
      label: "The Odds API H2H read-back",
      required: false,
      warning: true,
      detail: String(error),
      action: "Use a sport key and region where H2H odds are available.",
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

  const fixtureId = env(values, "KICKOFF_VERIFY_FIXTURE_ID");
  addCheck(checks, {
    id: "api-football-key",
    label: "API-Football key",
    required: true,
    passed: has(values, "VITE_APIFOOTBALL_KEY"),
    detail: has(values, "VITE_APIFOOTBALL_KEY") ? "API-Football key configured" : "Missing VITE_APIFOOTBALL_KEY",
    action: "Configure API-Football for fixtures, lineups, injuries and odds.",
  });
  addCheck(checks, {
    id: "api-football-fixture-target",
    label: "API-Football fixture target",
    required: true,
    passed: Boolean(fixtureId),
    detail: fixtureId || "KICKOFF_VERIFY_FIXTURE_ID missing",
    action: "Set KICKOFF_VERIFY_FIXTURE_ID to a World Cup fixture with enrichment rows available.",
  });

  const fixtureParam = encodeURIComponent(fixtureId);
  await Promise.all([
    endpointRows(values, fetcher, checks, {
      id: "api-football-lineups-readback",
      label: "API-Football lineups read-back",
      path: `/fixtures/lineups?fixture=${fixtureParam}`,
      action: "Use a fixture close enough to kickoff that API-Football lineups returns rows.",
      sampleKeys: ["team"],
    }),
    endpointRows(values, fetcher, checks, {
      id: "api-football-injuries-readback",
      label: "API-Football injuries read-back",
      path: `/injuries?fixture=${fixtureParam}`,
      action: "Use a fixture where API-Football injuries returns unavailable-player rows.",
      sampleKeys: ["player", "team"],
    }),
    endpointRows(values, fetcher, checks, {
      id: "api-football-odds-readback",
      label: "API-Football odds read-back",
      path: `/odds?fixture=${fixtureParam}`,
      action: "Use a fixture and plan where API-Football odds returns bookmaker rows.",
      sampleKeys: ["bookmakers", "league", "fixture"],
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
