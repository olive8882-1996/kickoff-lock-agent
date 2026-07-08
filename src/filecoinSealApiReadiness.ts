export type FilecoinSealApiReadinessEnv = Record<string, string | undefined>;

export type FilecoinSealApiReadinessCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  action: string;
};

export type FilecoinSealApiReadinessReport = {
  ready: boolean;
  passed: number;
  total: number;
  checks: FilecoinSealApiReadinessCheck[];
  blockers: FilecoinSealApiReadinessCheck[];
  masked: {
    privateKey: string;
    sealToken: string;
    browserSealToken: string;
    publicSealApi: string;
    publicSealHealthUrl: string;
  };
};

const env = (values: FilecoinSealApiReadinessEnv, key: string) => values[key]?.trim() ?? "";
const has = (values: FilecoinSealApiReadinessEnv, key: string) => env(values, key).length > 0;
const truthyFlag = (value: string) => /^(1|true|yes|on)$/i.test(value.trim());
const SAME_ORIGIN_FILECOIN_SEAL_PATH = "/seal";
const isCloudflarePagesHost = (urlText: string) => {
  try {
    const url = new URL(urlText);
    return url.protocol === "https:" && (url.hostname === "pages.dev" || url.hostname.endsWith(".pages.dev"));
  } catch {
    return false;
  }
};
const isGitHubPagesHost = (urlText: string) => {
  try {
    return new URL(urlText).hostname.endsWith("github.io");
  } catch {
    return false;
  }
};
const cloudflarePagesFunctionsAvailable = (values: FilecoinSealApiReadinessEnv) =>
  truthyFlag(env(values, "CF_PAGES")) || isCloudflarePagesHost(env(values, "CF_PAGES_URL") || env(values, "VITE_PUBLIC_APP_URL"));
const sameOriginPublicAppUrl = (values: FilecoinSealApiReadinessEnv) => {
  const publicAppUrl = env(values, "VITE_PUBLIC_APP_URL");
  const pagesUrl = env(values, "CF_PAGES_URL");
  if (pagesUrl && truthyFlag(env(values, "CF_PAGES")) && (!publicAppUrl || isGitHubPagesHost(publicAppUrl))) return pagesUrl;
  return publicAppUrl || pagesUrl;
};

export const maskSecret = (value: string) => {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const validPrivateKey = (value: string) => /^0x[a-f0-9]{64}$/i.test(value);

export const filecoinSealApiEndpointProblem = (value: string, label = "VITE_FILECOIN_SEAL_API") => {
  if (!value.trim()) return `${label} missing`;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.hostname.endsWith(".localhost")
    ) {
      return `${label} must be a deployed HTTPS /seal endpoint`;
    }
    if (!/\/seal\/?$/.test(url.pathname)) return `${label} must point to the deployed /seal endpoint`;
    return "";
  } catch {
    return `${label} must be a deployed HTTPS /seal endpoint`;
  }
};

export const publicSealApiReady = (value: string) => !filecoinSealApiEndpointProblem(value);

export const sameOriginSealSelected = (values: FilecoinSealApiReadinessEnv) => {
  if (env(values, "VITE_FILECOIN_SEAL_API")) return false;
  if (has(values, "VITE_FILECOIN_SEAL_SAME_ORIGIN")) return truthyFlag(env(values, "VITE_FILECOIN_SEAL_SAME_ORIGIN"));
  return cloudflarePagesFunctionsAvailable(values);
};

export const resolvedPublicSealApi = (values: FilecoinSealApiReadinessEnv) => {
  const explicit = env(values, "VITE_FILECOIN_SEAL_API");
  if (explicit) return explicit;
  if (!sameOriginSealSelected(values)) return "";
  const publicAppUrl = sameOriginPublicAppUrl(values);
  if (!publicAppUrl) return "";
  try {
    const url = new URL(publicAppUrl);
    url.pathname = SAME_ORIGIN_FILECOIN_SEAL_PATH;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};

export const resolvedPublicSealHealthUrl = (values: FilecoinSealApiReadinessEnv) => {
  const sealApi = resolvedPublicSealApi(values);
  if (!sealApi) return "";
  try {
    const url = new URL(sealApi);
    url.pathname = url.pathname.replace(/\/seal\/?$/, "/health");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};

const lifecycleRoutes = ["POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"];

const healthRoutes = (health: unknown) => {
  if (!health || typeof health !== "object") return [];
  const body = health as Record<string, unknown>;
  const direct = Array.isArray(body.endpoints) ? body.endpoints.map(String) : [];
  const proxyCapabilities = body.proxyCapabilities && typeof body.proxyCapabilities === "object"
    ? body.proxyCapabilities as Record<string, unknown>
    : undefined;
  const proxyRoutes = Array.isArray(proxyCapabilities?.allowedRoutes) ? proxyCapabilities.allowedRoutes.map(String) : [];
  return [...new Set([...direct, ...proxyRoutes])];
};

const healthReadyFlag = (values: FilecoinSealApiReadinessEnv, key: string) => truthyFlag(env(values, key));

const healthProductionReady = (values: FilecoinSealApiReadinessEnv, health?: unknown) => {
  if (healthReadyFlag(values, "KICKOFF_FILECOIN_SEAL_HEALTH_READY")) return true;
  if (!health || typeof health !== "object") return false;
  const body = health as Record<string, unknown>;
  return (
    body.ok === true &&
    (body.service === "kickoff-lock-filecoin-seal-api" || body.upstreamService === "kickoff-lock-filecoin-seal-api") &&
    body.productionReady === true &&
    body.authRequired === true &&
    body.mockMode === false
  );
};

const healthLifecycleReady = (values: FilecoinSealApiReadinessEnv, health?: unknown) => {
  if (healthReadyFlag(values, "KICKOFF_FILECOIN_SEAL_LIFECYCLE_READY")) return true;
  const routes = healthRoutes(health);
  return lifecycleRoutes.every((route) => routes.includes(route));
};

export const buildFilecoinSealApiReadinessReport = (
  values: FilecoinSealApiReadinessEnv,
  options: {
    proofStoreWritable?: boolean;
    health?: unknown;
    healthStatus?: number;
  } = {},
): FilecoinSealApiReadinessReport => {
  const maxUploadBytes = Number(env(values, "FILECOIN_MAX_UPLOAD_BYTES") || 262_144);
  const sealToken = env(values, "FILECOIN_SEAL_TOKEN");
  const browserSealToken = env(values, "VITE_FILECOIN_SEAL_TOKEN");
  const publicSealApi = resolvedPublicSealApi(values);
  const publicSealHealthUrl = resolvedPublicSealHealthUrl(values);
  const sameOriginSeal = sameOriginSealSelected(values);
  const sameOriginUpstream = env(values, "FILECOIN_SEAL_UPSTREAM_URL");
  const upstreamProblem = sameOriginSeal ? filecoinSealApiEndpointProblem(sameOriginUpstream, "FILECOIN_SEAL_UPSTREAM_URL") : "";
  const sameOriginHostProblem =
    sameOriginSeal && isGitHubPagesHost(sameOriginPublicAppUrl(values))
      ? "VITE_FILECOIN_SEAL_SAME_ORIGIN cannot use same-origin backend routes on GitHub Pages; deploy Cloudflare Pages Functions or set an external seal API URL."
      : "";
  const publicSealApiProblem = sameOriginHostProblem || filecoinSealApiEndpointProblem(publicSealApi);
  const proofStorePath = env(values, "FILECOIN_PROOF_STORE_PATH");
  const allowOrigin = env(values, "ALLOW_ORIGIN");
  const checks: FilecoinSealApiReadinessCheck[] = [
    {
      id: "mock-disabled",
      label: "Mock mode disabled",
      passed: !truthyFlag(env(values, "FILECOIN_SEAL_MOCK")),
      detail: truthyFlag(env(values, "FILECOIN_SEAL_MOCK"))
        ? `FILECOIN_SEAL_MOCK=${env(values, "FILECOIN_SEAL_MOCK")}`
        : "real Synapse mode requested",
      action: "Set FILECOIN_SEAL_MOCK=0 or leave it unset for production.",
    },
    {
      id: "synapse-private-key",
      label: "Synapse private key",
      passed: validPrivateKey(env(values, "SYNAPSE_PRIVATE_KEY")),
      detail: has(values, "SYNAPSE_PRIVATE_KEY") ? maskSecret(env(values, "SYNAPSE_PRIVATE_KEY")) : "missing",
      action: "Set SYNAPSE_PRIVATE_KEY to a funded 0x-prefixed 32-byte Filecoin/Synapse private key.",
    },
    {
      id: "server-upload-token",
      label: "Server upload token",
      passed: sealToken.length >= 16,
      detail: sealToken ? maskSecret(sealToken) : "missing",
      action: "Set FILECOIN_SEAL_TOKEN to a strong bearer token before exposing POST /seal.",
    },
    {
      id: "browser-token-match",
      label: sameOriginSeal ? "Proxy upload token injection" : "Browser token matches server",
      passed: sameOriginSeal ? sealToken.length >= 16 : Boolean(sealToken && browserSealToken && sealToken === browserSealToken),
      detail:
        sameOriginSeal && sealToken.length >= 16
          ? "same-origin proxy injects FILECOIN_SEAL_TOKEN server-side"
          : sealToken && browserSealToken
          ? sealToken === browserSealToken
            ? "tokens match"
            : "VITE_FILECOIN_SEAL_TOKEN does not match FILECOIN_SEAL_TOKEN"
          : "server or browser token missing",
      action: sameOriginSeal
        ? "Set FILECOIN_SEAL_TOKEN on the Pages/Worker runtime so the same-origin proxy can inject the upload token without exposing it to the browser."
        : "Set VITE_FILECOIN_SEAL_TOKEN to the same value expected by FILECOIN_SEAL_TOKEN in the deployed seal API.",
    },
    {
      id: "proof-store",
      label: "Persistent proof store",
      passed: Boolean(proofStorePath) && options.proofStoreWritable !== false,
      detail:
        proofStorePath && options.proofStoreWritable !== false
          ? proofStorePath
          : proofStorePath
            ? "parent directory is not writable"
            : "missing",
      action: "Set FILECOIN_PROOF_STORE_PATH to a durable mounted file path and ensure its parent directory is writable.",
    },
    {
      id: "upload-limit",
      label: "Upload size limit",
      passed: Number.isFinite(maxUploadBytes) && maxUploadBytes > 0 && maxUploadBytes <= 1_048_576,
      detail: Number.isFinite(maxUploadBytes) ? `${maxUploadBytes} bytes` : "invalid",
      action: "Set FILECOIN_MAX_UPLOAD_BYTES to a positive value no larger than 1048576 for capsule-sized JSON uploads.",
    },
    {
      id: "cors-origin",
      label: "Restricted CORS origin",
      passed: Boolean(allowOrigin && allowOrigin !== "*" && allowOrigin.startsWith("https://")),
      detail: allowOrigin || "missing",
      action: "Set ALLOW_ORIGIN to the deployed HTTPS app origin, not '*'.",
    },
    {
      id: "browser-seal-endpoint",
      label: "Browser seal endpoint",
      passed: !publicSealApiProblem,
      detail: publicSealApiProblem || `${publicSealApi}${has(values, "VITE_FILECOIN_SEAL_API") ? "" : " (same-origin)"}`,
      action:
        "Set VITE_FILECOIN_SEAL_API to the deployed HTTPS /seal endpoint, or set VITE_FILECOIN_SEAL_SAME_ORIGIN=1 when the production API is mounted at /seal on the app origin.",
    },
    {
      id: "same-origin-seal-upstream",
      label: "Same-origin seal upstream",
      passed: !upstreamProblem,
      detail: sameOriginSeal
        ? upstreamProblem || sameOriginUpstream
        : "not needed when VITE_FILECOIN_SEAL_API points directly at the seal API",
      action:
        "When VITE_FILECOIN_SEAL_SAME_ORIGIN=1, set FILECOIN_SEAL_UPSTREAM_URL on the Pages/Worker runtime to the trusted production /seal API.",
    },
    {
      id: "production-health-response",
      label: "Production health response",
      passed: healthProductionReady(values, options.health),
      detail: healthProductionReady(values, options.health)
        ? publicSealHealthUrl || "health response verified"
        : options.healthStatus
          ? `HTTP ${options.healthStatus}; health response does not prove productionReady/authRequired/mockMode=false`
          : "missing production /health read-back",
      action:
        "Fetch the deployed /health endpoint and verify productionReady=true, authRequired=true, mockMode=false and service=kickoff-lock-filecoin-seal-api.",
    },
    {
      id: "seal-lifecycle-routes",
      label: "Async seal lifecycle routes",
      passed: healthLifecycleReady(values, options.health),
      detail: healthLifecycleReady(values, options.health)
        ? lifecycleRoutes.join(", ")
        : `missing lifecycle routes: ${lifecycleRoutes.filter((route) => !healthRoutes(options.health).includes(route)).join(", ")}`,
      action:
        "Use a seal API health response that advertises POST /seal?async=1, GET /jobs/:id, GET /verify?cid= and GET /proof/:cid.",
    },
  ];
  const blockers = checks.filter((check) => !check.passed);
  return {
    ready: blockers.length === 0,
    passed: checks.length - blockers.length,
    total: checks.length,
    checks,
    blockers,
    masked: {
      privateKey: maskSecret(env(values, "SYNAPSE_PRIVATE_KEY")),
      sealToken: maskSecret(sealToken),
      browserSealToken: maskSecret(browserSealToken),
      publicSealApi,
      publicSealHealthUrl,
    },
  };
};
