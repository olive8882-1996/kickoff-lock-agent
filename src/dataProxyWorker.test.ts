import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The deployed Worker is authored as a small ESM script; this test keeps it in the default src test suite.
import worker from "../server/data-proxy-worker.mjs";
// @ts-expect-error Cloudflare Pages function entry is JavaScript and reuses the deployed Worker.
import { onRequest } from "../functions/data-proxy/[[path]].js";

const requestFor = (url: string, init?: RequestInit) => new Request(url, init);
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("data proxy worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("answers health and preflight requests with CORS headers", async () => {
    const health = await worker.fetch(requestFor("https://data.example.workers.dev/health"));
    const preflight = await worker.fetch(requestFor("https://data.example.workers.dev/proxy", { method: "OPTIONS" }));

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      service: "kickoff-data-proxy",
      allowedHosts: expect.arrayContaining([
        "api.football-data.org",
        "api.the-odds-api.com",
        "raw.githubusercontent.com",
        "site.api.espn.com",
        "v3.football.api-sports.io",
        "www.thesportsdb.com",
        "worldcup26.ir",
      ]),
      allowedRoutes: expect.arrayContaining([
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
      ]),
      cacheTtlSeconds: 60,
      staleTtlSeconds: 600,
      maxResponseBytes: 524288,
      staleFallback: true,
      cacheWriteMode: "waitUntil",
      secretlessCacheKeys: true,
      footballDataServerToken: false,
      oddsApiServerKey: false,
      providerCapabilities: expect.arrayContaining([
        expect.objectContaining({
          source: "api-football",
          host: "v3.football.api-sports.io",
          serverCredentialRequired: true,
          serverCredentialPresent: false,
          browserCredentialAccepted: false,
          cacheable: true,
          staleFallback: true,
        }),
        expect.objectContaining({
          source: "football-data",
          host: "api.football-data.org",
          serverCredentialRequired: true,
          serverCredentialPresent: false,
        }),
        expect.objectContaining({
          source: "odds-api",
          host: "api.the-odds-api.com",
          serverCredentialRequired: true,
          serverCredentialPresent: false,
        }),
        expect.objectContaining({
          source: "espn",
          serverCredentialRequired: false,
          serverCredentialPresent: true,
        }),
      ]),
    });
    expect(preflight.status).toBe(200);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("exposes the same worker through the same-origin Pages function entry", async () => {
    const response = await onRequest({
      request: requestFor("https://app.example.com/data-proxy/health"),
      env: {},
      ctx: {},
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "kickoff-data-proxy",
    });
  });

  it("rejects missing, invalid and non-allowlisted target URLs", async () => {
    const missing = await worker.fetch(requestFor("https://data.example.workers.dev/proxy"));
    const invalid = await worker.fetch(requestFor("https://data.example.workers.dev/proxy?url=not-a-url"));
    const privateHost = await worker.fetch(
      requestFor("https://data.example.workers.dev/proxy?url=https%3A%2F%2Fexample.com%2Ffeed.json&source=espn"),
    );
    const insecure = await worker.fetch(
      requestFor("https://data.example.workers.dev/proxy?url=http%3A%2F%2Fsite.api.espn.com%2Ffeed.json&source=espn"),
    );

    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ error: "missing_url" });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: "invalid_url" });
    expect(privateHost.status).toBe(403);
    await expect(privateHost.json()).resolves.toMatchObject({ error: "host_not_allowed", host: "example.com" });
    expect(insecure.status).toBe(403);
    await expect(insecure.json()).resolves.toMatchObject({ error: "host_not_allowed", host: "site.api.espn.com" });
  });

  it("rejects arbitrary paths on otherwise allowlisted upstream hosts", async () => {
    const disallowed = await worker.fetch(
      requestFor(
        "https://data.example.workers.dev/proxy?url=https%3A%2F%2Fsite.api.espn.com%2Fapis%2Fsite%2Fv2%2Fsports%2Fsoccer%2Fsecret%2Fscoreboard&source=espn",
      ),
    );

    expect(disallowed.status).toBe(403);
    await expect(disallowed.json()).resolves.toMatchObject({
      error: "route_not_allowed",
      host: "site.api.espn.com",
      path: "/apis/site/v2/sports/soccer/secret/scoreboard",
    });
  });

  it("forwards allowlisted public feeds and returns cacheable CORS responses", async () => {
    const upstream = vi.fn(async () =>
      new Response(JSON.stringify({ events: [{ id: "espn-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", upstream);

    const target = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40";
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set("url", target);
    url.searchParams.set("source", "espn");

    const response = await worker.fetch(requestFor(url.toString()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ events: [{ id: "espn-1" }] });
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("max-age=60");
    expect(response.headers.get("x-kickoff-data-source")).toBe("espn");
    expect(response.headers.get("x-kickoff-upstream-host")).toBe("site.api.espn.com");
    expect(response.headers.get("x-kickoff-proxy-cache")).toBe("fresh");
    expect(upstream).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: expect.stringContaining("application/json"),
          "user-agent": "KickoffLockAgentDataProxy/1.0",
        }),
      }),
    );
  });

  it("allows every production public football endpoint used by the app", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const targets = [
      "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40",
      "https://worldcup26.ir/get/games",
      "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
      "https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026",
      "https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4429",
      "https://www.thesportsdb.com/api/v1/json/123/lookuptable.php?l=4429&s=2026",
      "https://www.thesportsdb.com/api/v1/json/123/lookuplineup.php?id=event-1",
      "https://www.thesportsdb.com/api/v1/json/123/lookupeventstats.php?id=event-1",
      "https://v3.football.api-sports.io/fixtures?league=1&season=2026",
      "https://v3.football.api-sports.io/fixtures/lineups?fixture=100",
      "https://v3.football.api-sports.io/injuries?fixture=100",
      "https://v3.football.api-sports.io/odds?fixture=100",
      "https://v3.football.api-sports.io/standings?league=1&season=2026",
      "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?regions=us%2Cuk%2Ceu&markets=h2h&oddsFormat=decimal",
      "https://api.football-data.org/v4/competitions/WC/matches?season=2026",
      "https://api.football-data.org/v4/competitions/WC/standings?season=2026",
    ];

    for (const target of targets) {
      const url = new URL("https://data.example.workers.dev/proxy");
      url.searchParams.set("url", target);
      url.searchParams.set("source", "thesportsdb");

      const response = await worker.fetch(requestFor(url.toString()), {
        APIFOOTBALL_KEY: "server-key",
        ODDS_API_KEY: "odds-server-key",
        FOOTBALL_DATA_TOKEN: "football-data-server-token",
      });

      expect(response.status).toBe(200);
    }
  });

  it("injects the server-side The Odds API key without exposing it in browser runtime", async () => {
    const upstream = vi.fn(async () =>
      jsonResponse([
        {
          id: "odds-1",
          bookmakers: [{ markets: [{ key: "h2h", outcomes: [{ name: "Spain", price: 1.8 }] }] }],
        },
      ]),
    );
    vi.stubGlobal("fetch", upstream);
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set(
      "url",
      "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?regions=us%2Cuk%2Ceu&markets=h2h&oddsFormat=decimal",
    );
    url.searchParams.set("source", "odds-api");

    const missing = await worker.fetch(requestFor(url.toString()));
    const passed = await worker.fetch(requestFor(url.toString()), { ODDS_API_KEY: "server-odds-secret" });

    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toMatchObject({ error: "missing_odds_api_key" });
    expect(passed.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    const forwardedCalls = upstream.mock.calls as unknown as Array<[string, RequestInit?]>;
    const forwarded = new URL(String(forwardedCalls[0][0]));
    expect(forwarded.searchParams.get("apiKey")).toBe("server-odds-secret");
    expect(forwarded.searchParams.get("regions")).toBe("us,uk,eu");
    expect(forwarded.searchParams.get("markets")).toBe("h2h");
  });

  it("injects the server-side Football-Data.org token without exposing it in browser runtime", async () => {
    const upstream = vi.fn(async () => jsonResponse({ matches: [{ id: 100 }] }));
    vi.stubGlobal("fetch", upstream);
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set("url", "https://api.football-data.org/v4/competitions/WC/matches?season=2026");
    url.searchParams.set("source", "football-data");

    const missing = await worker.fetch(requestFor(url.toString()));
    const passed = await worker.fetch(requestFor(url.toString()), { FOOTBALL_DATA_TOKEN: "server-football-data-secret" });

    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toMatchObject({ error: "missing_football_data_token" });
    expect(passed.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledWith(
      "https://api.football-data.org/v4/competitions/WC/matches?season=2026",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Auth-Token": "server-football-data-secret",
        }),
      }),
    );
  });

  it("reports provider credential readiness in the health capability matrix", async () => {
    const response = await worker.fetch(requestFor("https://data.example.workers.dev/health"), {
      APIFOOTBALL_KEY: "server-api-football",
      ODDS_API_KEY: "server-odds",
      FOOTBALL_DATA_TOKEN: "server-football-data",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.providerCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "api-football", serverCredentialPresent: true }),
        expect.objectContaining({ source: "odds-api", serverCredentialPresent: true }),
        expect.objectContaining({ source: "football-data", serverCredentialPresent: true }),
        expect.objectContaining({ source: "openfootball", serverCredentialRequired: false, serverCredentialPresent: true }),
      ]),
    );
    expect(body.providerCapabilities.find((item: any) => item.source === "api-football").routes).toEqual(
      expect.arrayContaining(["fixtures/lineups", "injuries", "odds", "standings"]),
    );
  });

  it("keeps server-side odds API keys out of stale cache keys", async () => {
    const storedCacheKeys: string[] = [];
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async (request: Request, _response: Response) => {
          storedCacheKeys.push(request.url);
        }),
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{ id: "odds-cache" }])));
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set(
      "url",
      "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?regions=us&markets=h2h",
    );
    url.searchParams.set("source", "odds-api");

    const response = await worker.fetch(requestFor(url.toString()), { ODDS_API_KEY: "server-odds-secret" });

    expect(response.status).toBe(200);
    expect(storedCacheKeys).toHaveLength(1);
    expect(decodeURIComponent(storedCacheKeys[0])).not.toContain("apiKey=");
    expect(decodeURIComponent(storedCacheKeys[0])).not.toContain("server-odds-secret");
  });

  it("writes successful upstream responses to Cache API through waitUntil when Cloudflare provides context", async () => {
    const storedCacheKeys: string[] = [];
    let releaseCachePut = () => {};
    const cachePutStarted = new Promise<void>((resolve) => {
      releaseCachePut = resolve;
    });
    const pendingWrites: Promise<unknown>[] = [];
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(async (request: Request) => {
          storedCacheKeys.push(request.url);
          await cachePutStarted;
        }),
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ events: [{ id: "espn-wait-until" }] })));
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set("url", "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40");
    url.searchParams.set("source", "espn");

    const response = await worker.fetch(requestFor(url.toString()), {}, {
      waitUntil: (promise: Promise<unknown>) => {
        pendingWrites.push(promise);
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ events: [{ id: "espn-wait-until" }] });
    expect(pendingWrites).toHaveLength(1);
    expect(storedCacheKeys).toHaveLength(1);
    releaseCachePut();
    await expect(pendingWrites[0]).resolves.toBeUndefined();
  });

  it("rejects caller-supplied The Odds API keys on the proxy URL", async () => {
    const upstream = vi.fn(async () => jsonResponse([{ id: "odds-should-not-fetch" }]));
    vi.stubGlobal("fetch", upstream);
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set(
      "url",
      "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?regions=us&markets=h2h&apiKey=browser-secret",
    );
    url.searchParams.set("source", "odds-api");

    const response = await worker.fetch(requestFor(url.toString()), { ODDS_API_KEY: "server-odds-secret" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "browser_odds_api_key_not_allowed",
      source: "odds-api",
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("injects the server-side API-Football key and rejects missing-key proxy calls", async () => {
    const upstream = vi.fn(async () => jsonResponse({ response: [{ fixture: { id: 100 } }] }));
    vi.stubGlobal("fetch", upstream);
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set("url", "https://v3.football.api-sports.io/fixtures?league=1&season=2026");
    url.searchParams.set("source", "api-football");

    const missing = await worker.fetch(requestFor(url.toString()));
    const passed = await worker.fetch(requestFor(url.toString()), { APIFOOTBALL_KEY: "server-secret" });

    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toMatchObject({ error: "missing_api_football_key" });
    expect(passed.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledWith(
      "https://v3.football.api-sports.io/fixtures?league=1&season=2026",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-apisports-key": "server-secret",
        }),
      }),
    );
  });

  it("serves the last successful cached body when an allowlisted upstream temporarily fails", async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
        put: vi.fn(async (request: Request, response: Response) => {
          store.set(request.url, response.clone());
        }),
      },
    });
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ events: [{ id: "espn-cached" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "temporary" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", upstream);

    const target = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40";
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set("url", target);
    url.searchParams.set("source", "espn");

    const fresh = await worker.fetch(requestFor(url.toString()));
    const stale = await worker.fetch(requestFor(url.toString()));

    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("x-kickoff-proxy-cache")).toBe("fresh");
    expect(stale.status).toBe(200);
    expect(stale.headers.get("x-kickoff-proxy-cache")).toBe("stale");
    await expect(stale.json()).resolves.toEqual({ events: [{ id: "espn-cached" }] });
  });

  it("returns a proxy error instead of stale data when no successful response is cached", async () => {
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => undefined),
        put: vi.fn(),
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    const target = "https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026";
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set("url", target);
    url.searchParams.set("source", "thesportsdb");

    const response = await worker.fetch(requestFor(url.toString()));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "upstream_fetch_failed",
      source: "thesportsdb",
    });
  });

  it("rejects allowlisted upstream responses that exceed the production size guard", async () => {
    const upstream = vi.fn(async () =>
      new Response("too large", {
        status: 200,
        headers: { "content-type": "application/json", "content-length": String(524_289) },
      }),
    );
    vi.stubGlobal("fetch", upstream);

    const target = "https://worldcup26.ir/get/games";
    const url = new URL("https://data.example.workers.dev/proxy");
    url.searchParams.set("url", target);
    url.searchParams.set("source", "worldcup26");

    const response = await worker.fetch(requestFor(url.toString()));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "upstream_response_too_large",
      maxResponseBytes: 524288,
      source: "worldcup26",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
