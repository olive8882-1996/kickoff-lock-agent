const ALLOWED_HOSTS = new Set([
  "v3.football.api-sports.io",
  "site.api.espn.com",
  "worldcup26.ir",
  "raw.githubusercontent.com",
  "www.thesportsdb.com",
  "api.the-odds-api.com",
  "api.football-data.org",
]);
const ALLOWED_ROUTE_LABELS = [
  "api.football-data.org/v4/competitions/:competition/matches",
  "api.football-data.org/v4/competitions/:competition/standings",
  "v3.football.api-sports.io/fixtures",
  "v3.football.api-sports.io/fixtures/lineups",
  "v3.football.api-sports.io/injuries",
  "v3.football.api-sports.io/odds",
  "v3.football.api-sports.io/standings",
  "site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
  "worldcup26.ir/get/games",
  "raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
  "www.thesportsdb.com/api/v1/json/:key/eventsseason.php",
  "www.thesportsdb.com/api/v1/json/:key/eventsnextleague.php",
  "www.thesportsdb.com/api/v1/json/:key/lookuptable.php",
  "www.thesportsdb.com/api/v1/json/:key/lookuplineup.php",
  "www.thesportsdb.com/api/v1/json/:key/lookupeventstats.php",
  "api.the-odds-api.com/v4/sports/:sport/odds",
];
const SERVICE_NAME = "kickoff-data-proxy";
const CACHE_TTL_SECONDS = 60;
const STALE_TTL_SECONDS = 600;
const MAX_RESPONSE_BYTES = 512 * 1024;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=60" : "no-store",
    },
  });

const cacheApi = () => globalThis.caches?.default;

const cacheKeyFor = (targetUrl) =>
  new Request(`https://kickoff-data-proxy-cache.local/${encodeURIComponent(targetUrl.toString())}`);

const readCachedResponse = async (targetUrl, source, cacheStatus) => {
  const cache = cacheApi();
  if (!cache) return undefined;
  const cached = await cache.match(cacheKeyFor(targetUrl));
  if (!cached) return undefined;
  const headers = new Headers(cached.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("cache-control", "public, max-age=30");
  headers.set("x-kickoff-data-source", source);
  headers.set("x-kickoff-upstream-host", targetUrl.hostname);
  headers.set("x-kickoff-proxy-cache", cacheStatus);
  return new Response(await cached.arrayBuffer(), {
    status: 200,
    headers,
  });
};

const writeCachedResponse = async (targetUrl, response) => {
  const cache = cacheApi();
  if (!cache || !response.ok) return;
  const headers = new Headers(response.headers);
  headers.set("cache-control", `public, max-age=${STALE_TTL_SECONDS}`);
  await cache.put(cacheKeyFor(targetUrl), new Response(await response.clone().arrayBuffer(), {
    status: 200,
    headers,
  }));
};

const writeCachedResponseInBackground = (ctx, targetUrl, response) => {
  const promise = writeCachedResponse(targetUrl, response).catch(() => undefined);
  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(promise);
    return undefined;
  }
  return promise;
};

const routeAllowed = (targetUrl) => {
  if (targetUrl.hostname === "v3.football.api-sports.io") {
    return /^\/(fixtures|fixtures\/lineups|injuries|odds|standings)$/.test(targetUrl.pathname);
  }
  if (targetUrl.hostname === "site.api.espn.com") {
    return targetUrl.pathname === "/apis/site/v2/sports/soccer/fifa.world/scoreboard";
  }
  if (targetUrl.hostname === "worldcup26.ir") {
    return targetUrl.pathname === "/get/games";
  }
  if (targetUrl.hostname === "raw.githubusercontent.com") {
    return targetUrl.pathname === "/openfootball/worldcup.json/master/2026/worldcup.json";
  }
  if (targetUrl.hostname === "www.thesportsdb.com") {
    return /^\/api\/v1\/json\/[^/]+\/(eventsseason|eventsnextleague|lookuptable|lookuplineup|lookupeventstats)\.php$/.test(
      targetUrl.pathname,
    );
  }
  if (targetUrl.hostname === "api.the-odds-api.com") {
    return /^\/v4\/sports\/[^/]+\/odds$/.test(targetUrl.pathname);
  }
  if (targetUrl.hostname === "api.football-data.org") {
    return /^\/v4\/competitions\/[^/]+\/(matches|standings)$/.test(targetUrl.pathname);
  }
  return false;
};

const apiFootballKey = (env) =>
  String(env?.APIFOOTBALL_KEY ?? env?.API_FOOTBALL_KEY ?? env?.VITE_APIFOOTBALL_KEY ?? "").trim();

const oddsApiKey = (env) => String(env?.ODDS_API_KEY ?? env?.THE_ODDS_API_KEY ?? env?.VITE_ODDS_API_KEY ?? "").trim();
const footballDataToken = (env) =>
  String(env?.FOOTBALL_DATA_TOKEN ?? env?.FOOTBALL_DATA_ORG_TOKEN ?? env?.VITE_FOOTBALL_DATA_TOKEN ?? "").trim();

const isApiFootballHost = (targetUrl) => targetUrl.hostname === "v3.football.api-sports.io";
const isOddsApiHost = (targetUrl) => targetUrl.hostname === "api.the-odds-api.com";
const isFootballDataHost = (targetUrl) => targetUrl.hostname === "api.football-data.org";

const providerCapabilities = (env) => [
  {
    source: "api-football",
    label: "API-Football",
    host: "v3.football.api-sports.io",
    routes: [
      "fixtures",
      "fixtures/lineups",
      "injuries",
      "odds",
      "standings",
    ],
    serverCredentialRequired: true,
    serverCredentialPresent: Boolean(apiFootballKey(env)),
    serverCredentialKeys: ["APIFOOTBALL_KEY", "API_FOOTBALL_KEY"],
    browserCredentialAccepted: false,
    cacheable: true,
    staleFallback: true,
  },
  {
    source: "football-data",
    label: "Football-Data.org",
    host: "api.football-data.org",
    routes: [
      "competitions/:competition/matches",
      "competitions/:competition/standings",
    ],
    serverCredentialRequired: true,
    serverCredentialPresent: Boolean(footballDataToken(env)),
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
    serverCredentialPresent: Boolean(oddsApiKey(env)),
    serverCredentialKeys: ["ODDS_API_KEY", "THE_ODDS_API_KEY"],
    browserCredentialAccepted: false,
    cacheable: true,
    staleFallback: true,
  },
  {
    source: "espn",
    label: "ESPN World Cup scoreboard",
    host: "site.api.espn.com",
    routes: ["apis/site/v2/sports/soccer/fifa.world/scoreboard"],
    serverCredentialRequired: false,
    serverCredentialPresent: true,
    serverCredentialKeys: [],
    browserCredentialAccepted: true,
    cacheable: true,
    staleFallback: true,
  },
  {
    source: "openfootball",
    label: "openfootball World Cup JSON",
    host: "raw.githubusercontent.com",
    routes: ["openfootball/worldcup.json/master/2026/worldcup.json"],
    serverCredentialRequired: false,
    serverCredentialPresent: true,
    serverCredentialKeys: [],
    browserCredentialAccepted: true,
    cacheable: true,
    staleFallback: true,
  },
  {
    source: "thesportsdb",
    label: "TheSportsDB public event feeds",
    host: "www.thesportsdb.com",
    routes: ["eventsseason.php", "eventsnextleague.php", "lookuptable.php", "lookuplineup.php", "lookupeventstats.php"],
    serverCredentialRequired: false,
    serverCredentialPresent: true,
    serverCredentialKeys: [],
    browserCredentialAccepted: true,
    cacheable: true,
    staleFallback: true,
  },
  {
    source: "worldcup26",
    label: "worldcup26 games feed",
    host: "worldcup26.ir",
    routes: ["get/games"],
    serverCredentialRequired: false,
    serverCredentialPresent: true,
    serverCredentialKeys: [],
    browserCredentialAccepted: true,
    cacheable: true,
    staleFallback: true,
  },
];

export default {
  async fetch(request, env = {}, ctx = {}) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname.endsWith("/health")) {
      return json({
        ok: true,
        service: SERVICE_NAME,
        allowedHosts: [...ALLOWED_HOSTS].sort(),
        allowedRoutes: [...ALLOWED_ROUTE_LABELS].sort(),
        cacheTtlSeconds: CACHE_TTL_SECONDS,
        staleTtlSeconds: STALE_TTL_SECONDS,
        maxResponseBytes: MAX_RESPONSE_BYTES,
        staleFallback: true,
        cacheWriteMode: "waitUntil",
        secretlessCacheKeys: true,
        apiFootballServerKey: Boolean(apiFootballKey(env)),
        oddsApiServerKey: Boolean(oddsApiKey(env)),
        footballDataServerToken: Boolean(footballDataToken(env)),
        providerCapabilities: providerCapabilities(env),
      });
    }

    const target = requestUrl.searchParams.get("url");
    const source = requestUrl.searchParams.get("source") ?? "unknown";
    if (!target) {
      return json({ error: "missing_url" }, 400);
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return json({ error: "invalid_url" }, 400);
    }

    if (targetUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return json({ error: "host_not_allowed", host: targetUrl.hostname, source }, 403);
    }
    if (!routeAllowed(targetUrl)) {
      return json({ error: "route_not_allowed", host: targetUrl.hostname, path: targetUrl.pathname, source }, 403);
    }
    const cacheTargetUrl = new URL(targetUrl.toString());
    const apiKey = isApiFootballHost(targetUrl) ? apiFootballKey(env) : "";
    if (isApiFootballHost(targetUrl) && !apiKey) {
      return json({ error: "missing_api_football_key", source }, 503);
    }
    const oddsKey = isOddsApiHost(targetUrl) ? oddsApiKey(env) : "";
    if (isOddsApiHost(targetUrl) && targetUrl.searchParams.has("apiKey")) {
      return json({ error: "browser_odds_api_key_not_allowed", source }, 403);
    }
    if (isOddsApiHost(targetUrl) && !oddsKey) {
      return json({ error: "missing_odds_api_key", source }, 503);
    }
    if (oddsKey) targetUrl.searchParams.set("apiKey", oddsKey);
    const footballDataServerToken = isFootballDataHost(targetUrl) ? footballDataToken(env) : "";
    if (isFootballDataHost(targetUrl) && !footballDataServerToken) {
      return json({ error: "missing_football_data_token", source }, 503);
    }

    let upstream;
    try {
      const upstreamHeaders = {
        accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "KickoffLockAgentDataProxy/1.0",
        ...(apiKey ? { "x-apisports-key": apiKey } : {}),
        ...(footballDataServerToken ? { "X-Auth-Token": footballDataServerToken } : {}),
      };
      upstream = await fetch(targetUrl.toString(), {
        headers: upstreamHeaders,
        cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
      });
    } catch {
      const stale = await readCachedResponse(cacheTargetUrl, source, "stale");
      if (stale) return stale;
      return json({ error: "upstream_fetch_failed", source }, 502);
    }
    if (!upstream.ok) {
      const stale = await readCachedResponse(cacheTargetUrl, source, "stale");
      if (stale) return stale;
    }
    const contentLength = Number(upstream.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      return json({ error: "upstream_response_too_large", maxResponseBytes: MAX_RESPONSE_BYTES, source }, 502);
    }
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_RESPONSE_BYTES) {
      return json({ error: "upstream_response_too_large", maxResponseBytes: MAX_RESPONSE_BYTES, source }, 502);
    }
    const response = new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": upstream.ok ? `public, max-age=${CACHE_TTL_SECONDS}` : "no-store",
        "x-kickoff-data-source": source,
        "x-kickoff-upstream-host": targetUrl.hostname,
        "x-kickoff-proxy-cache": upstream.ok ? "fresh" : "bypass",
      },
    });
    const cacheWrite = writeCachedResponseInBackground(ctx, cacheTargetUrl, response);
    if (cacheWrite) await cacheWrite;
    return response;
  },
};
