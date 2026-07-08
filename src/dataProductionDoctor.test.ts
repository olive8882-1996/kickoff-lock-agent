import { describe, expect, it, vi } from "vitest";
import { buildDataProductionDoctorReport, dataDoctorFixtureIds } from "./dataProductionDoctor";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

const dataProxyProviderCapabilities = (patch: Record<string, unknown> = {}) => [
  {
    source: "api-football",
    label: "API-Football",
    host: "v3.football.api-sports.io",
    routes: ["fixtures", "fixtures/lineups", "injuries", "odds", "standings"],
    serverCredentialRequired: true,
    serverCredentialPresent: patch.apiFootballServerKey === true,
    serverCredentialKeys: ["APIFOOTBALL_KEY", "API_FOOTBALL_KEY"],
    browserCredentialAccepted: false,
    cacheable: true,
    staleFallback: true,
  },
  {
    source: "football-data",
    label: "Football-Data.org",
    host: "api.football-data.org",
    routes: ["competitions/:competition/matches", "competitions/:competition/standings"],
    serverCredentialRequired: true,
    serverCredentialPresent: patch.footballDataServerToken === true,
    serverCredentialKeys: ["FOOTBALL_DATA_TOKEN", "FOOTBALL_DATA_ORG_TOKEN"],
    browserCredentialAccepted: false,
    cacheable: true,
    staleFallback: true,
  },
  {
    source: "odds-api",
    label: "The Odds API",
    host: "api.the-odds-api.com",
    routes: ["sports/:sport/odds"],
    serverCredentialRequired: true,
    serverCredentialPresent: patch.oddsApiServerKey === true,
    serverCredentialKeys: ["ODDS_API_KEY", "THE_ODDS_API_KEY"],
    browserCredentialAccepted: false,
    cacheable: true,
    staleFallback: true,
  },
  ...["espn", "openfootball", "thesportsdb", "worldcup26"].map((source) => ({
    source,
    label: source,
    host:
      source === "espn"
        ? "site.api.espn.com"
        : source === "openfootball"
          ? "raw.githubusercontent.com"
          : source === "thesportsdb"
            ? "www.thesportsdb.com"
            : "worldcup26.ir",
    routes: [source === "espn" ? "scoreboard" : source === "worldcup26" ? "get/games" : "public-feed"],
    serverCredentialRequired: false,
    serverCredentialPresent: true,
    serverCredentialKeys: [],
    browserCredentialAccepted: true,
    cacheable: true,
    staleFallback: true,
  })),
];

const dataProxyHealthResponse = (patch: Record<string, unknown> = {}, init?: ResponseInit) =>
  jsonResponse(
    {
      ok: true,
      service: "kickoff-data-proxy",
      allowedHosts: [
        "api.football-data.org",
        "api.the-odds-api.com",
        "raw.githubusercontent.com",
        "site.api.espn.com",
        "v3.football.api-sports.io",
        "www.thesportsdb.com",
        "worldcup26.ir",
      ],
      allowedRoutes: [
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
      ],
      cacheTtlSeconds: 60,
      staleTtlSeconds: 600,
      staleFallback: true,
      maxResponseBytes: 524_288,
      apiFootballServerKey: false,
      footballDataServerToken: false,
      providerCapabilities: dataProxyProviderCapabilities(patch),
      ...patch,
    },
    {
      headers: { "access-control-allow-origin": "*", ...(init?.headers ?? {}) },
      ...init,
    },
  );

const env = {
  VITE_APIFOOTBALL_KEY: "api-football",
  VITE_FOOTBALL_DATA_TOKEN: "football-data",
  KICKOFF_VERIFY_FIXTURE_IDS: "12345,67890,24680",
  KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
    "12345:lineups=2|injuries=1|odds=1|standings=2,67890:lineups=2|injuries=1|odds=1|standings=2,24680:lineups=2|injuries=1|odds=1|standings=2",
  VITE_ODDS_API_KEY: "odds",
  VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
  VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
};

const fixtureIdFromUrl = (url: string) => new URL(url).searchParams.get("fixture") ?? "12345";
const injuryFor = (fixtureId: string, team: Record<string, unknown> = { name: "Spain" }) => ({
  fixture: { id: fixtureId },
  player: { id: 9, name: "Player" },
  team,
});
const pricedOddsFor = (fixtureId: string) => ({
  fixture: { id: fixtureId },
  league: { id: 1 },
  bookmakers: [
    {
      id: 1,
      name: "Book",
      bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.80" }] }],
    },
  ],
});

const successfulFetcher = vi.fn(async (url: string, init?: RequestInit) => {
  if (url.includes("data.example.workers.dev/proxy/health")) {
    return dataProxyHealthResponse();
  }
  if (url.includes("api.football-data.org") && url.includes("/matches?")) {
    expect(init?.headers).toMatchObject({ "X-Auth-Token": "football-data" });
    return jsonResponse({
      matches: [
        {
          id: 100,
          utcDate: "2026-06-11T19:00:00Z",
          homeTeam: { id: 1, name: "Spain" },
          awayTeam: { id: 2, name: "Austria" },
        },
      ],
    });
  }
  if (url.includes("api.football-data.org") && url.includes("/standings?")) {
    expect(init?.headers).toMatchObject({ "X-Auth-Token": "football-data" });
    return jsonResponse({
      standings: [
        {
          table: [
            { position: 1, team: { id: 1, name: "Spain" }, points: 9 },
            { position: 2, team: { id: 2, name: "Austria" }, points: 4 },
          ],
        },
      ],
    });
  }
  if (url.includes("thesportsdb.com")) {
    return jsonResponse({ events: [{ idEvent: "tsdb-1" }] });
  }
  if (url.includes("raw.githubusercontent.com")) {
    return jsonResponse({ name: "World Cup 2026", matches: [{ id: "of-1", num: 1 }] });
  }
  if (url.includes("espn.com")) {
    return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
  }
  if (url.includes("/standings?")) {
    expect(init?.headers).toMatchObject({ "x-apisports-key": "api-football" });
    return jsonResponse({
      response: [
        {
          league: {
            standings: [
              [
                { rank: 1, team: { id: 1, name: "Spain" }, points: 9 },
                { rank: 3, team: { id: 2, name: "Austria" }, points: 4 },
              ],
            ],
          },
        },
      ],
    });
  }
  if (url.includes("/fixtures/lineups")) {
    expect(init?.headers).toMatchObject({ "x-apisports-key": "api-football" });
    return jsonResponse({
      response: [
        { team: { id: 1, name: "Spain" }, startXI: [{ player: { id: 10, name: "Starter" } }] },
        { team: { id: 2, name: "Austria" }, startXI: [{ player: { id: 11, name: "Starter" } }] },
      ],
    });
  }
  if (url.includes("/injuries")) {
    return jsonResponse({ response: [injuryFor(fixtureIdFromUrl(url))] });
  }
  if (url.includes("/odds?fixture=")) {
    return jsonResponse({ response: [pricedOddsFor(fixtureIdFromUrl(url))] });
  }
  if (url.includes("api.the-odds-api.com")) {
    expect(url).toContain("markets=h2h%2Cspreads");
    return jsonResponse([
      {
        id: "odds-1",
        home_team: "Spain",
        away_team: "Austria",
        bookmakers: [
          {
            key: "book",
            title: "Book",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Spain", price: 1.8 },
                  { name: "Austria", price: 4.2 },
                ],
              },
              {
                key: "spreads",
                outcomes: [
                  { name: "Spain", price: 1.91, point: -1.5 },
                  { name: "Austria", price: 1.91, point: 1.5 },
                ],
              },
            ],
          },
        ],
      },
    ]);
  }
  return jsonResponse({ error: "unexpected" }, { status: 404 });
});

describe("Realtime data production doctor", () => {
  it("normalizes production fixture targets from plural env only", () => {
    expect(
      dataDoctorFixtureIds({
        KICKOFF_VERIFY_FIXTURE_ID: "99999",
        KICKOFF_VERIFY_FIXTURE_IDS: "12345, 67890\n24680",
      }),
    ).toEqual(["12345", "67890", "24680"]);
  });

  it("keeps required enrichment checks incomplete when API-Football and fixture env are missing", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      if (url.includes("raw.githubusercontent.com")) return jsonResponse({ name: "World Cup 2026", matches: [{ id: "of-1" }] });
      return jsonResponse({}, { status: 429 });
    });

    const report = await buildDataProductionDoctorReport({}, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "data-proxy-config")?.status).toBe("failed");
    expect(report.checks.find((check) => check.id === "data-proxy-health")?.status).toBe("failed");
    expect(report.checks.find((check) => check.id === "free-feed-continuity")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "api-football-key")?.status).toBe("failed");
    expect(report.checks.find((check) => check.id === "football-data-readback")).toMatchObject({
      required: false,
      status: "warning",
    });
    expect(report.checks.find((check) => check.id === "api-football-standings-readback")?.detail).toContain("Missing API-Football key or data proxy");
    expect(report.checks.find((check) => check.id === "api-football-lineups-readback")?.detail).toContain("Missing API-Football key or data proxy");
    expect(report.checks.find((check) => check.id === "odds-api-h2h-readback")?.status).toBe("skipped");
  });

  it("keeps Football-Data read-back required when public free feeds are disabled", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      if (url.includes("raw.githubusercontent.com")) return jsonResponse({ name: "World Cup 2026", matches: [{ id: "of-1" }] });
      return jsonResponse({}, { status: 429 });
    });

    const report = await buildDataProductionDoctorReport({ KICKOFF_DISABLE_PUBLIC_FREE_FEEDS: "1" }, fetcher as any);

    expect(report.checks.find((check) => check.id === "football-data-readback")).toMatchObject({
      required: true,
      status: "failed",
      detail: "Missing Football-Data.org token or data proxy",
    });
    expect(report.nextActions.map((check) => check.id)).toContain("football-data-readback");
  });

  it("accepts server-side Football-Data token names for direct production diagnostics", async () => {
    const seenHeaders: unknown[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("api.football-data.org") && url.includes("/matches?")) {
        seenHeaders.push(init?.headers);
        return jsonResponse({
          matches: [
            {
              id: 100,
              utcDate: "2026-06-11T19:00:00Z",
              homeTeam: { id: 1, name: "Spain" },
              awayTeam: { id: 2, name: "Austria" },
            },
          ],
        });
      }
      if (url.includes("api.football-data.org") && url.includes("/standings?")) {
        seenHeaders.push(init?.headers);
        return jsonResponse({
          standings: [
            {
              table: [
                { position: 1, team: { id: 1, name: "Spain" }, points: 9 },
                { position: 2, team: { id: 2, name: "Austria" }, points: 4 },
              ],
            },
          ],
        });
      }
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [] });
      if (url.includes("raw.githubusercontent.com")) return jsonResponse({ name: "World Cup 2026", matches: [] });
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [] });
      if (url.includes("worldcup26.ir")) return jsonResponse({ games: [] });
      return jsonResponse({}, { status: 429 });
    });

    const report = await buildDataProductionDoctorReport(
      {
        FOOTBALL_DATA_TOKEN: "server-football-data",
        KICKOFF_DISABLE_PUBLIC_FREE_FEEDS: "1",
      },
      fetcher as any,
    );

    expect(seenHeaders).toEqual([
      { "X-Auth-Token": "server-football-data" },
      { "X-Auth-Token": "server-football-data" },
    ]);
    expect(report.checks.find((check) => check.id === "football-data-readback")).toMatchObject({
      required: true,
      status: "passed",
      sampleIds: expect.arrayContaining(["100", "1", "2"]),
    });
  });

  it("does not accept empty free-feed payloads as schedule continuity", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [] });
      if (url.includes("raw.githubusercontent.com")) return jsonResponse({ name: "World Cup 2026", matches: [] });
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [] });
      if (url.includes("worldcup26.ir")) return jsonResponse({ games: [] });
      return jsonResponse({}, { status: 429 });
    });

    const report = await buildDataProductionDoctorReport({}, fetcher as any);

    expect(report.checks.find((check) => check.id === "thesportsdb-season")?.status).toBe("warning");
    expect(report.checks.find((check) => check.id === "openfootball-worldcup-json")?.status).toBe("warning");
    expect(report.checks.find((check) => check.id === "espn-world-cup-scoreboard")?.status).toBe("warning");
    expect(report.checks.find((check) => check.id === "worldcup26-games")?.status).toBe("warning");
    expect(report.checks.find((check) => check.id === "free-feed-continuity")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("worldcup26 games feed:HTTP 200, World Cup 2026 payload missing or stale"),
    });
  });

  it("does not accept stale non-empty free-feed payloads as current World Cup continuity", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [{ idEvent: "tsdb-old", dateEvent: "2018-06-14" }] });
      if (url.includes("raw.githubusercontent.com")) {
        return jsonResponse({ name: "World Cup 2018", matches: [{ id: "of-old", date: "2018-06-14" }] });
      }
      if (url.includes("espn.com")) {
        return jsonResponse({
          leagues: [{ slug: "fifa.world", season: { year: 2018 } }],
          events: [{ id: "espn-old", date: "2018-06-14T15:00:00Z" }],
        });
      }
      if (url.includes("worldcup26.ir")) return jsonResponse({ games: [{ id: "wc-old", date: "2018-06-14" }] });
      return jsonResponse({}, { status: 429 });
    });

    const report = await buildDataProductionDoctorReport({}, fetcher as any);

    expect(report.checks.find((check) => check.id === "thesportsdb-season")).toMatchObject({
      status: "warning",
      detail: "HTTP 200, World Cup 2026 payload missing or stale",
    });
    expect(report.checks.find((check) => check.id === "openfootball-worldcup-json")?.status).toBe("warning");
    expect(report.checks.find((check) => check.id === "espn-world-cup-scoreboard")?.status).toBe("warning");
    expect(report.checks.find((check) => check.id === "worldcup26-games")?.status).toBe("warning");
    expect(report.checks.find((check) => check.id === "free-feed-continuity")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("World Cup 2026 payload missing or stale"),
    });
  });

  it("uses worldcup26 games as free continuity when TheSportsDB and ESPN are empty", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [] });
      if (url.includes("raw.githubusercontent.com")) return jsonResponse({ name: "World Cup 2026", matches: [] });
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [] });
      if (url.includes("worldcup26.ir")) return jsonResponse({ games: [{ id: "wc26-1" }] });
      return jsonResponse({}, { status: 429 });
    });

    const report = await buildDataProductionDoctorReport({}, fetcher as any);

    expect(report.checks.find((check) => check.id === "worldcup26-games")).toMatchObject({
      status: "passed",
      sampleIds: ["wc26-1"],
    });
    expect(report.checks.find((check) => check.id === "free-feed-continuity")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("worldcup26 games feed:ok"),
    });
  });

  it("uses openfootball World Cup JSON as a free continuity read-back", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [] });
      if (url.includes("raw.githubusercontent.com")) {
        return jsonResponse({ name: "World Cup 2026", matches: [{ id: "open-1", num: 1 }] });
      }
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [] });
      if (url.includes("worldcup26.ir")) return jsonResponse({ games: [] });
      return jsonResponse({}, { status: 429 });
    });

    const report = await buildDataProductionDoctorReport({}, fetcher as any);

    expect(report.checks.find((check) => check.id === "openfootball-worldcup-json")).toMatchObject({
      status: "passed",
      sampleIds: ["open-1"],
    });
    expect(report.checks.find((check) => check.id === "free-feed-continuity")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("openfootball World Cup 2026 JSON:ok"),
    });
  });

  it("builds readable openfootball samples when rows have no explicit id", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [] });
      if (url.includes("raw.githubusercontent.com")) {
        return jsonResponse({
          name: "World Cup 2026",
          matches: [{ date: "2026-06-11", team1: "Mexico", team2: "South Africa" }],
        });
      }
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [] });
      if (url.includes("worldcup26.ir")) return jsonResponse({ games: [] });
      return jsonResponse({}, { status: 429 });
    });

    const report = await buildDataProductionDoctorReport({}, fetcher as any);

    expect(report.checks.find((check) => check.id === "openfootball-worldcup-json")?.sampleIds).toEqual([
      "2026-06-11:Mexico-South Africa",
    ]);
  });

  it("passes required checks when free continuity and API-Football lineups, injuries and odds read back live rows", async () => {
    successfulFetcher.mockClear();
    const report = await buildDataProductionDoctorReport(env, successfulFetcher as any);

    expect(report.ready).toBe(true);
    expect(report.requiredPassed).toBe(report.requiredTotal);
    expect(report.checks.find((check) => check.id === "api-football-lineups-readback")?.sampleIds).toContain("1");
    expect(report.checks.find((check) => check.id === "api-football-standings-readback")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("2/2 valid standings rows"),
    });
    expect(report.checks.find((check) => check.id === "odds-api-h2h-readback")?.status).toBe("passed");
    expect(successfulFetcher.mock.calls.some(([url]) => String(url).includes("fixture=12345"))).toBe(true);
    expect(successfulFetcher.mock.calls.some(([url]) => String(url).includes("fixture=67890"))).toBe(true);
  });

  it("can read The Odds API through the data proxy without a browser odds key", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("data.example.workers.dev/proxy/health")) {
        return dataProxyHealthResponse({ oddsApiServerKey: true });
      }
      if (url.includes("data.example.workers.dev/proxy?")) {
        const proxied = new URL(url);
        const target = proxied.searchParams.get("url") ?? "";
        if (proxied.searchParams.get("source") === "odds-api") {
          expect(target).toContain("api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds");
          expect(target).toContain("markets=h2h%2Cspreads");
          expect(target).not.toContain("apiKey=");
          return jsonResponse([
            {
              id: "odds-proxied",
              home_team: "Spain",
              away_team: "Austria",
              bookmakers: [
                {
                  key: "book",
                  markets: [
                    { key: "h2h", outcomes: [{ name: "Spain", price: 1.8 }] },
                    { key: "spreads", outcomes: [{ name: "Spain", price: 1.91, point: -1.5 }] },
                  ],
                },
              ],
            },
          ]);
        }
      }
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(
      {
        ...env,
        VITE_ODDS_API_KEY: "",
        VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "data-proxy-health")).toMatchObject({ status: "passed" });
    expect(report.checks.find((check) => check.id === "odds-provider-config")).toMatchObject({
      status: "passed",
      detail: "The Odds API routed through data proxy",
    });
    expect(report.checks.find((check) => check.id === "odds-api-h2h-readback")).toMatchObject({
      status: "passed",
      detail: "1/1 event returned with priced H2H markets · 1/1 with priced spread/handicap markets",
    });
  });

  it("can read Football-Data.org through the data proxy without a browser token", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("data.example.workers.dev/proxy/health")) {
        return dataProxyHealthResponse({ footballDataServerToken: true });
      }
      if (url.includes("data.example.workers.dev/proxy?")) {
        const proxied = new URL(url);
        const target = proxied.searchParams.get("url") ?? "";
        if (proxied.searchParams.get("source") === "football-data" && target.includes("/matches?")) {
          expect(target).toContain("api.football-data.org/v4/competitions/WC/matches");
          expect(init).toBeUndefined();
          return jsonResponse({
            matches: [
              {
                id: 100,
                utcDate: "2026-06-11T19:00:00Z",
                homeTeam: { id: 1, name: "Spain" },
                awayTeam: { id: 2, name: "Austria" },
              },
            ],
          });
        }
        if (proxied.searchParams.get("source") === "football-data" && target.includes("/standings?")) {
          expect(target).toContain("api.football-data.org/v4/competitions/WC/standings");
          return jsonResponse({
            standings: [
              {
                table: [
                  { position: 1, team: { id: 1, name: "Spain" }, points: 9 },
                  { position: 2, team: { id: 2, name: "Austria" }, points: 4 },
                ],
              },
            ],
          });
        }
      }
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(
      {
        ...env,
        VITE_FOOTBALL_DATA_TOKEN: "",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "data-proxy-health")).toMatchObject({ status: "passed" });
    expect(report.checks.find((check) => check.id === "football-data-readback")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("1 valid match rows, 2 valid standing rows"),
    });
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("source=football-data"))).toBe(true);
  });

  it("requires every configured target fixture to return lineups, injuries and odds rows", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [{ idEvent: "tsdb-1" }] });
      if (url.includes("api.the-odds-api.com")) return jsonResponse([{ id: "odds-1" }]);
      expect(init?.headers).toMatchObject({ "x-apisports-key": "api-football" });
      if (url.includes("fixture=200") && url.includes("/odds?")) return jsonResponse({ response: [] });
      if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [{ team: { id: 1 }, startXI: [{ player: { id: 10, name: "Starter" } }] }] });
      if (url.includes("/injuries")) return jsonResponse({ response: [injuryFor(fixtureIdFromUrl(url), { id: 1 })] });
      if (url.includes("football.api-sports.io")) {
        return jsonResponse({
          response: [
            {
              fixture: { id: fixtureIdFromUrl(url) },
              bookmakers: [
                {
                  id: 7,
                  name: "Book",
                  bets: [{ id: 1, name: "Match Winner", values: [{ value: "Away", odd: "2.10" }] }],
                },
              ],
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildDataProductionDoctorReport(
      {
        ...env,
        KICKOFF_VERIFY_FIXTURE_ID: undefined,
        KICKOFF_VERIFY_FIXTURE_IDS: "100,200",
        KICKOFF_DATA_SCOUT_TARGETS: "2",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-fixture-target")).toMatchObject({
      status: "passed",
      detail: expect.stringContaining("2 target fixtures"),
    });
    expect(report.checks.find((check) => check.id === "api-football-fixture-signal-matrix")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing 100; KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing 200",
    });
    expect(report.checks.find((check) => check.id === "api-football-lineups-readback")?.detail).toContain("100:1/1 valid");
    expect(report.checks.find((check) => check.id === "api-football-lineups-readback")?.detail).toContain("200:1/1 valid");
    expect(report.checks.find((check) => check.id === "api-football-odds-readback")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("200:0/0 valid"),
    });
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("fixture=100"))).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("fixture=200"))).toBe(true);
  });

  it("rejects API-Football read-back rows that explicitly belong to a different fixture", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("data.example.workers.dev/proxy/health")) return dataProxyHealthResponse();
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [{ idEvent: "tsdb-1" }] });
      if (url.includes("/standings?")) return jsonResponse({ response: [{ league: { standings: [[{ rank: 1, team: { id: 1, name: "Spain" }, points: 9 }, { rank: 2, team: { id: 2, name: "Austria" }, points: 6 }]] } }] });
      if (url.includes("/fixtures/lineups")) {
        return jsonResponse({ response: [{ team: { id: 1, name: "Spain" }, startXI: [{ player: { id: 10, name: "Starter" } }] }] });
      }
      if (url.includes("/injuries")) {
        return jsonResponse({ response: [{ fixture: { id: 100 }, player: { id: 9, name: "Player" }, team: { id: 1, name: "Spain" } }] });
      }
      if (url.includes("/odds?fixture=")) {
        return jsonResponse({
          response: [
            {
              fixture: { id: 999 },
              bookmakers: [
                {
                  id: 7,
                  name: "Book",
                  bets: [{ id: 1, name: "Match Winner", values: [{ value: "Away", odd: "2.10" }] }],
                },
              ],
            },
          ],
        });
      }
      if (url.includes("api.the-odds-api.com")) return jsonResponse([{ id: "odds-1" }]);
      return jsonResponse({ error: "unexpected" }, { status: 404 });
    });

    const report = await buildDataProductionDoctorReport(
      {
        ...env,
        KICKOFF_VERIFY_FIXTURE_IDS: "100",
        KICKOFF_DATA_SCOUT_TARGETS: "1",
        KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX: "100:lineups=1|injuries=1|odds=1|standings=2",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-odds-readback")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("100:0/1 valid odds row; 1 fixture id mismatch for 100"),
    });
  });

  it("routes free public feeds through VITE_DATA_PROXY_URL when configured", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const parsed = new URL(url);
      if (parsed.hostname === "data.example.workers.dev") {
        if (parsed.pathname.endsWith("/health")) {
          return dataProxyHealthResponse();
        }
        const target = parsed.searchParams.get("url") ?? "";
        if (target.includes("thesportsdb.com")) return jsonResponse({ events: [{ idEvent: "tsdb-1" }] });
        if (target.includes("raw.githubusercontent.com")) return jsonResponse({ name: "World Cup 2026", matches: [{ id: "open-1" }] });
        if (target.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      }
      return successfulFetcher(url, init);
    });
    const report = await buildDataProductionDoctorReport(
      { ...env, VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy" },
      fetcher as any,
    );

    expect(report.checks.find((check) => check.id === "data-proxy-config")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "data-proxy-health")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "thesportsdb-season")?.detail).toContain("via data proxy");
    expect(report.checks.find((check) => check.id === "openfootball-worldcup-json")?.detail).toContain("via data proxy");
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("data.example.workers.dev")).length).toBeGreaterThanOrEqual(2);
  });

  it("requires the data proxy health contract to expose API-Football enrichment routes", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("data.example.workers.dev/proxy/health")) {
        return dataProxyHealthResponse({
          allowedHosts: ["api.the-odds-api.com", "site.api.espn.com", "www.thesportsdb.com", "worldcup26.ir"],
          allowedRoutes: [
            "api.the-odds-api.com/v4/sports/:sport/odds",
            "site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
            "worldcup26.ir/get/games",
            "www.thesportsdb.com/api/v1/json/:key/eventsseason.php",
            "www.thesportsdb.com/api/v1/json/:key/eventsnextleague.php",
            "www.thesportsdb.com/api/v1/json/:key/lookuptable.php",
            "www.thesportsdb.com/api/v1/json/:key/lookuplineup.php",
            "www.thesportsdb.com/api/v1/json/:key/lookupeventstats.php",
          ],
        });
      }
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    const healthCheck = report.checks.find((check) => check.id === "data-proxy-health");
    expect(healthCheck?.status).toBe("failed");
    expect(healthCheck?.detail.includes("allowed host coverage incomplete")).toBe(true);
    expect(healthCheck?.detail.includes("allowed route coverage incomplete")).toBe(true);
  });

  it("routes free public feeds through the same-origin Pages data proxy when enabled", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const parsed = new URL(url);
      if (parsed.hostname === "app.example") {
        if (parsed.pathname === "/data-proxy/health") {
          return dataProxyHealthResponse();
        }
        if (parsed.pathname === "/data-proxy/proxy") {
          const target = parsed.searchParams.get("url") ?? "";
          if (target.includes("thesportsdb.com")) return jsonResponse({ events: [{ idEvent: "tsdb-same-origin" }] });
          if (target.includes("espn.com")) {
            return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-same-origin" }] });
          }
          if (target.includes("worldcup26.ir")) return jsonResponse({ games: [{ id: "wc-same-origin" }] });
        }
      }
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(
      {
        ...env,
        VITE_DATA_PROXY_URL: "",
        VITE_PUBLIC_APP_URL: "https://app.example/kickoff-lock-agent/",
        VITE_DATA_PROXY_SAME_ORIGIN: "1",
      },
      fetcher as any,
    );

    expect(report.checks.find((check) => check.id === "data-proxy-config")).toMatchObject({
      status: "passed",
      detail: "https://app.example/data-proxy/proxy (same-origin)",
    });
    expect(report.checks.find((check) => check.id === "data-proxy-health")).toMatchObject({
      status: "passed",
      url: "https://app.example/data-proxy/health",
    });
    expect(report.checks.find((check) => check.id === "thesportsdb-season")?.detail).toContain("via data proxy");
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("app.example/data-proxy/proxy"))).toBe(true);
  });

  it("verifies API-Football enrichment through the data proxy without exposing a browser key", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toBeUndefined();
      const parsed = new URL(url);
      if (parsed.href.includes("/proxy/health")) return dataProxyHealthResponse({ apiFootballServerKey: true });
      if (parsed.hostname === "data.example.workers.dev" && parsed.pathname === "/proxy") {
        const target = parsed.searchParams.get("url") ?? "";
        if (target.includes("thesportsdb.com")) return jsonResponse({ events: [{ idEvent: "tsdb-proxy" }] });
        if (target.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-proxy" }] });
        if (target.includes("worldcup26.ir")) return jsonResponse({ games: [{ id: "wc-proxy" }] });
        if (target.includes("/standings?")) {
          return jsonResponse({ response: [{ league: { standings: [[{ rank: 1, team: { id: 1, name: "Spain" }, points: 9 }, { rank: 2, team: { id: 2, name: "Austria" }, points: 6 }]] } }] });
        }
        if (target.includes("/fixtures/lineups")) return jsonResponse({ response: [{ team: { id: 1, name: "Spain" }, startXI: [{ player: { id: 10, name: "Starter" } }] }] });
        if (target.includes("/injuries")) {
          return jsonResponse({ response: [injuryFor(new URL(target).searchParams.get("fixture") ?? "12345")] });
        }
        if (target.includes("/odds?fixture=")) {
          return jsonResponse({ response: [pricedOddsFor(new URL(target).searchParams.get("fixture") ?? "12345")] });
        }
      }
      return jsonResponse({}, { status: 404 });
    });

    const report = await buildDataProductionDoctorReport(
      {
        ...env,
        VITE_APIFOOTBALL_KEY: "",
        VITE_ODDS_API_KEY: "",
        VITE_ODDS_API_SPORT_KEY: "",
      },
      fetcher as any,
    );

    expect(report.checks.find((check) => check.id === "api-football-key")).toMatchObject({
      status: "passed",
      detail: "API-Football routed through data proxy",
    });
    expect(report.checks.find((check) => check.id === "api-football-standings-readback")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "api-football-lineups-readback")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "api-football-injuries-readback")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "api-football-odds-readback")?.status).toBe("passed");
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("source=api-football"))).toBe(true);
  });

  it("does not pass data proxy health for API-Football proxy enrichment without a server key", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("data.example.workers.dev/proxy/health")) {
        return dataProxyHealthResponse({ apiFootballServerKey: false });
      }
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(
      {
        ...env,
        VITE_APIFOOTBALL_KEY: "",
        APIFOOTBALL_KEY: "",
        API_FOOTBALL_KEY: "",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "data-proxy-health")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("server-side APIFOOTBALL_KEY missing from data proxy"),
    });
  });

  it("does not pass data proxy health when the production guard contract is incomplete", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("data.example.workers.dev/proxy/health")) {
        return jsonResponse({
          ok: true,
          service: "kickoff-data-proxy",
          allowedHosts: ["site.api.espn.com", "www.thesportsdb.com", "worldcup26.ir"],
        });
      }
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    const healthCheck = report.checks.find((check) => check.id === "data-proxy-health");
    expect(healthCheck?.status).toBe("failed");
    expect(healthCheck?.detail.includes("cacheTtlSeconds missing or too low")).toBe(true);
    expect(healthCheck?.detail.includes("stale fallback missing or too low")).toBe(true);
    expect(healthCheck?.detail.includes("maxResponseBytes missing or too low")).toBe(true);
    expect(healthCheck?.detail.includes("CORS wildcard header missing")).toBe(true);
  });

  it("does not pass data proxy health when endpoint route restrictions are not published", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("data.example.workers.dev/proxy/health")) {
        return dataProxyHealthResponse({ allowedRoutes: [] });
      }
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "data-proxy-health")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("allowed route coverage incomplete"),
    });
  });

  it("rejects non-HTTPS data proxy URLs and does not route free feeds through them", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("127.0.0.1:8787")) return jsonResponse({ ok: true, service: "kickoff-data-proxy" });
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(
      { ...env, VITE_DATA_PROXY_URL: "http://127.0.0.1:8787/proxy" },
      fetcher as any,
    );

    expect(report.checks.find((check) => check.id === "data-proxy-config")).toMatchObject({
      status: "failed",
      detail: "VITE_DATA_PROXY_URL must be a deployed HTTPS /proxy endpoint",
    });
    expect(report.checks.find((check) => check.id === "data-proxy-health")?.status).toBe("failed");
    expect(report.checks.find((check) => check.id === "thesportsdb-season")?.detail).not.toContain("via data proxy");
    expect(report.checks.find((check) => check.id === "openfootball-worldcup-json")?.detail).not.toContain("via data proxy");
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("127.0.0.1:8787"))).toBe(false);
  });

  it("rejects local HTTPS or wrong-path data proxy URLs in the production doctor", async () => {
    const localReport = await buildDataProductionDoctorReport(
      { ...env, VITE_DATA_PROXY_URL: "https://localhost:8787/proxy" },
      successfulFetcher as any,
    );
    expect(localReport.ready).toBe(false);
    expect(localReport.checks.find((check) => check.id === "data-proxy-config")).toMatchObject({
      status: "failed",
      detail: "VITE_DATA_PROXY_URL must be a deployed HTTPS /proxy endpoint",
    });

    const wrongPathReport = await buildDataProductionDoctorReport(
      { ...env, VITE_DATA_PROXY_URL: "https://data.example.workers.dev/status" },
      successfulFetcher as any,
    );
    expect(wrongPathReport.ready).toBe(false);
    expect(wrongPathReport.checks.find((check) => check.id === "data-proxy-config")).toMatchObject({
      status: "failed",
      detail: "VITE_DATA_PROXY_URL must end with /proxy",
    });
  });

  it("requires the fixture signal matrix to cover every target and every enrichment signal", async () => {
    const report = await buildDataProductionDoctorReport(
      {
        ...env,
        KICKOFF_VERIFY_FIXTURE_IDS: "100,200,300",
        KICKOFF_DATA_SCOUT_TARGETS: "3",
        KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
          "100:lineups=1|injuries=1|odds=1,200:lineups=1|injuries=0|odds=1",
      },
      successfulFetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-fixture-signal-matrix")).toMatchObject({
      status: "failed",
      detail:
        "100 missing lineups rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX; 100 missing standings rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX; 200 missing lineups rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX; 200 missing injuries rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX; 200 missing standings rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX; KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing 300",
      sampleIds: ["100", "200", "300"],
    });
  });

  it("accepts API-Football as odds provider config even when The Odds API is absent", async () => {
    const report = await buildDataProductionDoctorReport(
      {
        VITE_APIFOOTBALL_KEY: "api-football",
        KICKOFF_VERIFY_FIXTURE_IDS: "12345,67890,24680",
      },
      successfulFetcher as any,
    );

    expect(report.checks.find((check) => check.id === "odds-provider-config")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "odds-api-h2h-readback")?.status).toBe("skipped");
  });

  it("does not pass fixture target coverage with only the legacy single fixture id", async () => {
    const report = await buildDataProductionDoctorReport(
      {
        VITE_APIFOOTBALL_KEY: "api-football",
        KICKOFF_VERIFY_FIXTURE_ID: "12345",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      successfulFetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-fixture-target")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_FIXTURE_IDS missing; legacy KICKOFF_VERIFY_FIXTURE_ID is not enough",
    });
    expect(report.checks.find((check) => check.id === "api-football-lineups-readback")?.detail).toContain(
      "legacy KICKOFF_VERIFY_FIXTURE_ID is not enough",
    );
  });

  it("does not pass production enrichment when endpoint payloads are empty", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [] });
      if (url.includes("football.api-sports.io")) return jsonResponse({ response: [{}] });
      return jsonResponse([], { status: 200 });
    });

    const report = await buildDataProductionDoctorReport(env, fetcher as any);
    const lineupReadback = report.checks.find((check) => check.id === "api-football-lineups-readback");

    expect(report.ready).toBe(false);
    expect(lineupReadback?.status).toBe("failed");
    expect(lineupReadback?.detail).toContain("12345:0/1 valid");
    expect(lineupReadback?.detail).toContain("67890:0/1 valid");
    expect(report.checks.find((check) => check.id === "api-football-injuries-readback")?.status).toBe("failed");
    expect(report.checks.find((check) => check.id === "api-football-odds-readback")?.status).toBe("failed");
  });

  it("does not pass API-Football odds read-back when bookmaker rows have no priced markets", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("data.example.workers.dev/proxy/health")) {
        return dataProxyHealthResponse();
      }
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [{ idEvent: "tsdb-1" }] });
      if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [{ team: { id: 1 }, startXI: [{ player: { id: 10, name: "Starter" } }] }] });
      if (url.includes("/injuries")) return jsonResponse({ response: [injuryFor(fixtureIdFromUrl(url), { id: 1 })] });
      if (url.includes("/odds?fixture=")) {
        return jsonResponse({ response: [{ bookmakers: [{ id: 7, name: "Book", bets: [{ id: 1, name: "Match Winner", values: [] }] }] }] });
      }
      if (url.includes("api.the-odds-api.com")) return jsonResponse([{ id: "odds-1" }]);
      return jsonResponse({}, { status: 404 });
    });

    const report = await buildDataProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-odds-readback")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("12345:0/1 valid odds"),
    });
  });

  it("does not pass ranking evidence when API-Football standings rows are empty shells", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("data.example.workers.dev/proxy/health")) {
        return dataProxyHealthResponse();
      }
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [{ idEvent: "tsdb-1" }] });
      if (url.includes("/standings?")) return jsonResponse({ response: [{ league: { standings: [[{}]] } }] });
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-standings-readback")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("0/1 valid standings rows"),
    });
  });

  it("does not accept The Odds API events unless they include priced H2H and spread markets", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("data.example.workers.dev/proxy/health")) {
        return dataProxyHealthResponse();
      }
      if (url.includes("api.the-odds-api.com")) {
        return jsonResponse([
          {
            id: "odds-empty",
            home_team: "Spain",
            away_team: "Austria",
            bookmakers: [{ key: "book", markets: [{ key: "h2h", outcomes: [{ name: "Spain" }] }] }],
          },
        ]);
      }
      return successfulFetcher(url, init);
    });

    const report = await buildDataProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "odds-api-h2h-readback")).toMatchObject({
      status: "warning",
      detail: "0/1 event returned with priced H2H markets · 0/1 with priced spread/handicap markets",
      sampleIds: [],
    });
  });
});
