const serviceName = "kickoff-lock-filecoin-seal-proxy";
const allowedMethods = new Set(["GET", "POST", "OPTIONS"]);
const allowedRootPaths = new Set(["/health", "/seal", "/verify"]);
const hopByHopHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const truthyFlag = (value) => /^(1|true|yes|on)$/i.test(String(value ?? "").trim());

const corsHeaders = (origin = "*") => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
});

const json = (body, status = 200, origin = "*") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const configuredOrigin = (env) => {
  const allowOrigin = String(env?.ALLOW_ORIGIN ?? "").trim();
  return allowOrigin || "*";
};

const proxySealToken = (env) => String(env?.FILECOIN_SEAL_TOKEN ?? env?.SEAL_PROXY_TOKEN ?? "").trim();

const upstreamSealUrl = (env) => {
  const value = String(env?.FILECOIN_SEAL_UPSTREAM_URL ?? env?.VITE_FILECOIN_SEAL_API ?? "").trim();
  if (!value) return { error: "missing_upstream" };
  try {
    const url = new URL(value);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    if (!truthyFlag(env?.FILECOIN_SEAL_PROXY_ALLOW_INSECURE)) {
      if (url.protocol !== "https:" || localHosts.has(url.hostname) || url.hostname.endsWith(".localhost")) {
        return { error: "invalid_upstream", detail: "FILECOIN_SEAL_UPSTREAM_URL must be a deployed HTTPS /seal endpoint" };
      }
    }
    if (!/\/seal\/?$/.test(url.pathname)) {
      return { error: "invalid_upstream", detail: "FILECOIN_SEAL_UPSTREAM_URL must point to /seal" };
    }
    url.search = "";
    url.hash = "";
    return { url };
  } catch {
    return { error: "invalid_upstream", detail: "FILECOIN_SEAL_UPSTREAM_URL must be a valid URL" };
  }
};

const publicPathname = (pathname) => {
  if (pathname === "/seal") return "/seal";
  if (pathname.startsWith("/seal/")) return pathname.slice("/seal".length) || "/";
  return pathname;
};

const routeKind = (pathname) => {
  pathname = publicPathname(pathname);
  if (allowedRootPaths.has(pathname)) return "root";
  if (/^\/proof\/[^/]+$/.test(pathname)) return "proof";
  if (/^\/jobs\/[^/]+$/.test(pathname)) return "jobs";
  return "";
};

const upstreamUrlFor = (requestUrl, sealUrl) => {
  const url = new URL(requestUrl);
  const target = new URL(sealUrl);
  const pathname = publicPathname(url.pathname);
  if (pathname === "/health") target.pathname = target.pathname.replace(/\/seal\/?$/, "/health");
  if (pathname === "/verify") target.pathname = target.pathname.replace(/\/seal\/?$/, "/verify");
  if (pathname.startsWith("/proof/")) {
    target.pathname = target.pathname.replace(/\/seal\/?$/, pathname);
  }
  if (pathname.startsWith("/jobs/")) {
    target.pathname = target.pathname.replace(/\/seal\/?$/, pathname);
  }
  target.search = url.search;
  target.hash = "";
  return target;
};

const forwardedHeaders = (request, env = {}) => {
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (hopByHopHeaders.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === "origin") continue;
    if (key.toLowerCase() === "authorization" && proxySealToken(env)) continue;
    headers.set(key, value);
  }
  const token = proxySealToken(env);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", request.headers.get("Accept") || "application/json");
  headers.set("User-Agent", "KickoffLockAgentSealProxy/1.0");
  return headers;
};

const proxyCapabilities = (env = {}) => ({
  service: serviceName,
  upstreamConfigured: !upstreamSealUrl(env).error,
  tokenInjected: Boolean(proxySealToken(env)),
  protectedUpload: Boolean(proxySealToken(env)),
  allowedRoutes: ["GET /health", "POST /seal", "POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"],
  asyncUpload: {
    route: "POST /seal?async=1",
    available: Boolean(proxySealToken(env)),
    statusUrlRequired: true,
  },
  uploadStatus: {
    route: "GET /jobs/:id",
    available: true,
    proves: "upload status polling",
  },
  cidQuery: {
    route: "GET /proof/:cid",
    available: true,
    proves: "CID metadata read-back",
  },
  verificationPolling: {
    route: "GET /verify?cid=",
    available: true,
    proves: "retrievability and verified status polling",
  },
});

const proxyResponse = async (response, origin) => {
  const headers = new Headers();
  for (const [key, value] of response.headers.entries()) {
    if (hopByHopHeaders.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Kickoff-Seal-Proxy", serviceName);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const fetchHandler = async (request, env = {}, ctx = {}) => {
  const origin = configuredOrigin(env);
  const requestUrl = new URL(request.url);
  const pathname = publicPathname(requestUrl.pathname);
  const route = routeKind(pathname);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (!allowedMethods.has(request.method)) {
    return json({ ok: false, service: serviceName, error: "method_not_allowed" }, 405, origin);
  }
  if (!route) {
    return json(
      {
        ok: false,
        service: serviceName,
        error: "route_not_allowed",
        allowedRoutes: ["GET /health", "POST /seal", "POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"],
      },
      404,
      origin,
    );
  }
  const upstream = upstreamSealUrl(env);
  if (upstream.error) {
    return json(
      {
        ok: false,
        service: serviceName,
        error: upstream.error,
        detail: upstream.detail ?? "Set FILECOIN_SEAL_UPSTREAM_URL to the trusted production /seal API.",
      },
      503,
      origin,
    );
  }
  if (pathname !== "/seal" && request.method !== "GET") {
    return json({ ok: false, service: serviceName, error: "method_not_allowed", detail: "This seal route is GET-only." }, 405, origin);
  }
  if (pathname === "/health") {
    const upstreamHealthUrl = upstreamUrlFor(request.url, upstream.url);
    try {
      const upstreamResponse = await fetch(upstreamHealthUrl.toString(), {
        method: "GET",
        headers: forwardedHeaders(request, env),
        redirect: "manual",
      });
      const body = await upstreamResponse.json().catch(() => undefined);
      return json(
        {
          ...(body && typeof body === "object" ? body : {}),
          ok: upstreamResponse.ok && body?.ok !== false,
          service: serviceName,
          upstreamService: body?.service,
          tokenInjected: Boolean(proxySealToken(env)),
          proxyCapabilities: proxyCapabilities(env),
        },
        upstreamResponse.status,
        origin,
      );
    } catch (error) {
      return json(
        {
          ok: false,
          service: serviceName,
          error: "upstream_fetch_failed",
          detail: error?.message ?? "Failed to reach Filecoin seal upstream.",
          tokenInjected: Boolean(proxySealToken(env)),
        },
        502,
        origin,
      );
    }
  }
  if (pathname === "/seal" && request.method !== "POST") {
    return json({ ok: false, service: serviceName, error: "method_not_allowed", detail: "Use POST /seal." }, 405, origin);
  }
  if (pathname === "/seal" && !proxySealToken(env)) {
    return json(
      {
        ok: false,
        service: serviceName,
        error: "missing_proxy_token",
        detail: "Set FILECOIN_SEAL_TOKEN so same-origin seal uploads are authenticated server-side.",
      },
      503,
      origin,
    );
  }

  const targetUrl = upstreamUrlFor(request.url, upstream.url);
  const init = {
    method: request.method,
    headers: forwardedHeaders(request, env),
    body: request.method === "POST" ? request.body : undefined,
    redirect: "manual",
  };
  try {
    const upstreamResponse = await fetch(targetUrl.toString(), init);
    return proxyResponse(upstreamResponse, origin);
  } catch (error) {
    return json(
      {
        ok: false,
        service: serviceName,
        error: "upstream_fetch_failed",
        detail: error?.message ?? "Failed to reach Filecoin seal upstream.",
      },
      502,
      origin,
    );
  }
};

export default {
  fetch(request, env, ctx) {
    return fetchHandler(request, env, ctx);
  },
};
