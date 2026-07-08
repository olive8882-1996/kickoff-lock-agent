import { evaluatePublicAuthRedirect, normalizePublicAppUrl } from "./publicUrls";

export type RuntimeConfigCategory = "account" | "data" | "filecoin" | "sharing";

export type RuntimeConfigItem = {
  key: string;
  category: RuntimeConfigCategory;
  label: string;
  required: boolean;
  passed: boolean;
  detail: string;
  action: string;
};

export type RuntimeConfigSummary = {
  requiredPassed: number;
  requiredTotal: number;
  recommendedPassed: number;
  recommendedTotal: number;
  ready: boolean;
};

export type RuntimeConfigEnv = Record<string, string | boolean | undefined>;

export const DEFAULT_SUPABASE_SHARE_BUCKET = "kickoff-share-cards";
export const SAME_ORIGIN_DATA_PROXY_PATH = "/data-proxy/proxy";
export const SAME_ORIGIN_FILECOIN_SEAL_PATH = "/seal";

declare global {
  interface Window {
    __KICKOFF_RUNTIME_CONFIG__?: RuntimeConfigEnv;
  }
}

export const getBrowserRuntimeConfig = (): RuntimeConfigEnv => {
  if (typeof window === "undefined") return {};
  return window.__KICKOFF_RUNTIME_CONFIG__ ?? {};
};

export const runtimeConfigValue = (env: RuntimeConfigEnv, key: string) => {
  const runtimeValue = getBrowserRuntimeConfig()[key];
  if (typeof runtimeValue === "boolean") return runtimeValue ? "1" : "";
  const runtimeText = runtimeValue?.trim() ?? "";
  if (runtimeText) return runtimeText;
  const envValue = env[key];
  if (typeof envValue === "boolean") return envValue ? "1" : "";
  return envValue?.trim() ?? "";
};

export const mergeRuntimeConfigEnv = (env: RuntimeConfigEnv): RuntimeConfigEnv => ({
  ...env,
  ...Object.fromEntries(
    Object.entries(getBrowserRuntimeConfig()).filter(([, value]) =>
      typeof value === "boolean" ? value : Boolean(value?.trim()),
    ),
  ),
});

const hasValue = (value: string | boolean | undefined) =>
  typeof value === "boolean" ? value : Boolean(value && value.trim().length > 0);

const runtimeText = (value: string | boolean | undefined) =>
  typeof value === "string" ? value.trim() : "";

const enabledFlag = (value: string | boolean | undefined) => {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(runtimeText(value).toLowerCase());
};

const httpsProductionUrl = (value: string | boolean | undefined) => {
  const text = runtimeText(value);
  if (!text) return { passed: false, detail: "missing" };
  try {
    const url = new URL(text);
    const localHosts = ["localhost", "127.0.0.1", "::1"];
    if (url.protocol !== "https:" || localHosts.includes(url.hostname)) {
      return { passed: false, detail: `${text} is not a deployed HTTPS URL` };
    }
    return { passed: true, detail: url.toString() };
  } catch {
    return { passed: false, detail: `${text} is not a valid URL` };
  }
};

export const sameOriginDataProxyEnabled = (env: RuntimeConfigEnv) =>
  enabledFlag(mergeRuntimeConfigEnv(env).VITE_DATA_PROXY_SAME_ORIGIN);

export const sameOriginDataProxyUrl = (env: RuntimeConfigEnv, path = SAME_ORIGIN_DATA_PROXY_PATH) => {
  if (!sameOriginDataProxyEnabled(env)) return "";
  const mergedEnv = mergeRuntimeConfigEnv(env);
  const publicAppUrl = normalizePublicAppUrl(mergedEnv.VITE_PUBLIC_APP_URL);
  if (publicAppUrl) {
    const url = new URL(publicAppUrl);
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return new URL(path, window.location.origin).toString();
  }
  return "";
};

export const resolvedDataProxyUrl = (env: RuntimeConfigEnv) => {
  const mergedEnv = mergeRuntimeConfigEnv(env);
  return runtimeText(mergedEnv.VITE_DATA_PROXY_URL) || sameOriginDataProxyUrl(mergedEnv);
};

export const sameOriginFilecoinSealEnabled = (env: RuntimeConfigEnv) =>
  enabledFlag(mergeRuntimeConfigEnv(env).VITE_FILECOIN_SEAL_SAME_ORIGIN);

export const sameOriginFilecoinSealUrl = (env: RuntimeConfigEnv, path = SAME_ORIGIN_FILECOIN_SEAL_PATH) => {
  if (!sameOriginFilecoinSealEnabled(env)) return "";
  const mergedEnv = mergeRuntimeConfigEnv(env);
  const publicAppUrl = normalizePublicAppUrl(mergedEnv.VITE_PUBLIC_APP_URL);
  if (publicAppUrl) {
    const url = new URL(publicAppUrl);
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return new URL(path, window.location.origin).toString();
  }
  return "";
};

export const resolvedFilecoinSealApiUrl = (env: RuntimeConfigEnv) => {
  const mergedEnv = mergeRuntimeConfigEnv(env);
  return runtimeText(mergedEnv.VITE_FILECOIN_SEAL_API) || sameOriginFilecoinSealUrl(mergedEnv);
};

export const sameOriginBackendHostProblem = (
  publicAppUrlValue: string | boolean | undefined,
  serviceLabel: string,
) => {
  const publicAppUrl = normalizePublicAppUrl(publicAppUrlValue);
  if (!publicAppUrl) return "";
  const url = new URL(publicAppUrl);
  if (url.hostname.endsWith("github.io")) {
    return `${serviceLabel} cannot use same-origin backend routes on GitHub Pages; deploy Cloudflare Pages Functions or set an external Worker URL.`;
  }
  return "";
};

const sealEndpointUrl = (value: string | boolean | undefined) => {
  const result = httpsProductionUrl(value);
  if (!result.passed) return result;
  const url = new URL(result.detail);
  if (!/\/seal\/?$/.test(url.pathname)) {
    return { passed: false, detail: `${url.toString()} must point to the deployed /seal endpoint` };
  }
  return result;
};

const item = (
  key: string,
  category: RuntimeConfigCategory,
  label: string,
  required: boolean,
  passed: boolean,
  detail: string,
  action: string,
): RuntimeConfigItem => ({ key, category, label, required, passed, detail, action });

export const buildRuntimeConfigReadiness = (env: RuntimeConfigEnv): RuntimeConfigItem[] => {
  const mergedEnv = mergeRuntimeConfigEnv(env);
  const supabaseUrl = httpsProductionUrl(mergedEnv.VITE_SUPABASE_URL);
  const supabaseAnon = hasValue(mergedEnv.VITE_SUPABASE_ANON_KEY);
  const publicAppUrl = normalizePublicAppUrl(mergedEnv.VITE_PUBLIC_APP_URL);
  const supabaseRedirect = evaluatePublicAuthRedirect(mergedEnv.VITE_SUPABASE_REDIRECT_URL, mergedEnv.VITE_PUBLIC_APP_URL);
  const theSportsDbKey = hasValue(mergedEnv.VITE_THESPORTSDB_KEY) || mergedEnv.VITE_THESPORTSDB_KEY === undefined;
  const theSportsDbLeague = hasValue(mergedEnv.VITE_THESPORTSDB_LEAGUE_ID) || mergedEnv.VITE_THESPORTSDB_LEAGUE_ID === undefined;
  const theSportsDbSeason = hasValue(mergedEnv.VITE_THESPORTSDB_SEASON) || mergedEnv.VITE_THESPORTSDB_SEASON === undefined;
  const resolvedProxyUrl = resolvedDataProxyUrl(mergedEnv);
  const sameOriginData = sameOriginDataProxyEnabled(mergedEnv);
  const sameOriginDataProblem =
    sameOriginData && !hasValue(mergedEnv.VITE_DATA_PROXY_URL)
      ? sameOriginBackendHostProblem(mergedEnv.VITE_PUBLIC_APP_URL, "VITE_DATA_PROXY_SAME_ORIGIN")
      : "";
  const dataProxy = sameOriginDataProblem
    ? { passed: false, detail: sameOriginDataProblem }
    : httpsProductionUrl(resolvedProxyUrl);
  const apiFootball = hasValue(mergedEnv.VITE_APIFOOTBALL_KEY) || dataProxy.passed;
  const footballData = hasValue(mergedEnv.VITE_FOOTBALL_DATA_TOKEN) || dataProxy.passed;
  const oddsApi =
    hasValue(mergedEnv.VITE_ODDS_API_SPORT_KEY) && (hasValue(mergedEnv.VITE_ODDS_API_KEY) || dataProxy.passed);
  const resolvedSealApiUrl = resolvedFilecoinSealApiUrl(mergedEnv);
  const sameOriginSeal = sameOriginFilecoinSealEnabled(mergedEnv);
  const sameOriginSealProblem =
    sameOriginSeal && !hasValue(mergedEnv.VITE_FILECOIN_SEAL_API)
      ? sameOriginBackendHostProblem(mergedEnv.VITE_PUBLIC_APP_URL, "VITE_FILECOIN_SEAL_SAME_ORIGIN")
      : "";
  const sealApi = sameOriginSealProblem
    ? { passed: false, detail: sameOriginSealProblem }
    : sealEndpointUrl(resolvedSealApiUrl);
  const sealToken = sameOriginSeal || hasValue(mergedEnv.VITE_FILECOIN_SEAL_TOKEN);
  const shareBucketValue =
    typeof mergedEnv.VITE_SUPABASE_SHARE_BUCKET === "boolean"
      ? mergedEnv.VITE_SUPABASE_SHARE_BUCKET
      : mergedEnv.VITE_SUPABASE_SHARE_BUCKET?.trim() || DEFAULT_SUPABASE_SHARE_BUCKET;
  const shareBucket = hasValue(shareBucketValue);
  const baseUrl = hasValue(mergedEnv.BASE_URL);

  return [
    item(
      "supabase-core",
      "account",
      "Supabase auth + REST",
      true,
      supabaseUrl.passed && supabaseAnon,
      supabaseUrl.passed && supabaseAnon
        ? "URL and anon key configured"
        : !supabaseUrl.passed
          ? `VITE_SUPABASE_URL ${supabaseUrl.detail}`
          : "Missing VITE_SUPABASE_ANON_KEY",
      "Set Supabase project URL and anon key before claiming cross-device account sync.",
    ),
    item(
      "supabase-redirect",
      "account",
      "OAuth redirect",
      true,
      supabaseRedirect.passed,
      supabaseRedirect.detail,
      "Set VITE_SUPABASE_REDIRECT_URL to the same deployed HTTPS app URL used by VITE_PUBLIC_APP_URL for Google OAuth and magic links.",
    ),
    item(
      "thesportsdb-free",
      "data",
      "Free schedule source",
      true,
      theSportsDbKey && theSportsDbLeague && theSportsDbSeason,
      "TheSportsDB free route is available for schedule, score, event status and limited lineup/stat enrichment continuity",
      "Keep VITE_THESPORTSDB_LEAGUE_ID, VITE_THESPORTSDB_SEASON and VITE_THESPORTSDB_ENRICHMENT_LIMIT aligned with the tournament.",
    ),
    item(
      "data-proxy",
      "data",
      "Free feed CORS proxy",
      false,
      dataProxy.passed,
      dataProxy.passed
        ? `${dataProxy.detail}${hasValue(mergedEnv.VITE_DATA_PROXY_URL) ? "" : " (same-origin)"}`
        : sameOriginDataProblem
          ? dataProxy.detail
        : hasValue(mergedEnv.VITE_DATA_PROXY_URL)
          ? `VITE_DATA_PROXY_URL ${dataProxy.detail}`
          : "Optional VITE_DATA_PROXY_URL missing; set VITE_DATA_PROXY_SAME_ORIGIN=1 when /data-proxy/proxy is deployed on the app origin",
      "Deploy server/data-proxy-worker.mjs as a Worker URL, or deploy the bundled Cloudflare Pages function at /data-proxy/proxy and set VITE_DATA_PROXY_SAME_ORIGIN=1.",
    ),
    item(
      "api-football-enrichment",
      "data",
      "Lineups + injuries",
      true,
      apiFootball,
      hasValue(mergedEnv.VITE_APIFOOTBALL_KEY)
        ? "API-Football browser key configured"
        : dataProxy.passed
          ? "API-Football routed through data proxy"
          : "Missing VITE_APIFOOTBALL_KEY or deployed data proxy with server-side APIFOOTBALL_KEY",
      "Configure API-Football directly for diagnostics, or deploy the data proxy with server-side APIFOOTBALL_KEY to fetch fixture lineups, injuries and richer odds without exposing the key.",
    ),
    item(
      "odds-enrichment",
      "data",
      "Odds /盘口",
      true,
      apiFootball || oddsApi,
      oddsApi
        ? hasValue(mergedEnv.VITE_ODDS_API_KEY)
          ? "The Odds API configured"
          : "The Odds API routed through data proxy"
        : apiFootball
          ? hasValue(mergedEnv.VITE_APIFOOTBALL_KEY)
            ? "API-Football odds route configured"
            : "API-Football odds routed through data proxy"
          : "Missing odds provider keys",
      "Configure API-Football odds directly, deploy the data proxy with server-side APIFOOTBALL_KEY/ODDS_API_KEY, or set VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY for diagnostics.",
    ),
    item(
      "football-data-backup",
      "data",
      "Paid/free backup feed",
      false,
      footballData,
      hasValue(mergedEnv.VITE_FOOTBALL_DATA_TOKEN)
        ? "Football-Data.org browser diagnostics token configured"
        : dataProxy.passed
          ? "Football-Data.org routed through data proxy"
          : "Optional VITE_FOOTBALL_DATA_TOKEN missing, or deploy data proxy with server-side FOOTBALL_DATA_TOKEN",
      "Add Football-Data.org as a backup fixture, score and standings route through server-side FOOTBALL_DATA_TOKEN when quota allows.",
    ),
    item(
      "filecoin-seal-api",
      "filecoin",
      "Browser seal endpoint",
      true,
      sealApi.passed,
      sealApi.passed
        ? `${sealApi.detail}${hasValue(mergedEnv.VITE_FILECOIN_SEAL_API) ? "" : " (same-origin)"}`
        : sameOriginSealProblem
          ? sealApi.detail
        : hasValue(mergedEnv.VITE_FILECOIN_SEAL_API)
          ? `VITE_FILECOIN_SEAL_API ${sealApi.detail}`
          : "Missing VITE_FILECOIN_SEAL_API; set VITE_FILECOIN_SEAL_SAME_ORIGIN=1 when a production seal API is mounted at /seal on the app origin",
      "Deploy the seal API as an HTTPS /seal endpoint, or mount it behind the app origin at /seal and set VITE_FILECOIN_SEAL_SAME_ORIGIN=1; clients use POST /seal?async=1 and GET /jobs/:id.",
    ),
    item(
      "filecoin-seal-token",
      "filecoin",
      "Upload token",
      true,
      sealToken,
      sameOriginSeal
        ? "Same-origin proxy injects FILECOIN_SEAL_TOKEN server-side"
        : sealToken
          ? "Bearer token configured"
          : "Missing VITE_FILECOIN_SEAL_TOKEN",
      sameOriginSeal
        ? "Set FILECOIN_SEAL_TOKEN on the Pages/Worker runtime; the browser does not need VITE_FILECOIN_SEAL_TOKEN in same-origin proxy mode."
        : "Require a bearer token before browser uploads can spend backend sealing resources.",
    ),
    item(
      "public-app-url",
      "sharing",
      "Public HTTPS app URL",
      true,
      Boolean(publicAppUrl),
      publicAppUrl ?? "Missing valid VITE_PUBLIC_APP_URL",
      "Set VITE_PUBLIC_APP_URL to the deployed HTTPS app URL so proof/profile/share links are public.",
    ),
    item(
      "share-storage-bucket",
      "sharing",
      "Public share image bucket",
      true,
      shareBucket,
      shareBucket ? String(shareBucketValue) : "Missing VITE_SUPABASE_SHARE_BUCKET",
      `Create a public Supabase Storage bucket for generated proof-card PNGs; default bucket is ${DEFAULT_SUPABASE_SHARE_BUCKET}.`,
    ),
    item(
      "public-base-path",
      "sharing",
      "Build base path",
      false,
      baseUrl,
      baseUrl ? String(mergedEnv.BASE_URL) : "BASE_URL missing",
      "Keep BASE_URL aligned with the deployed path so static assets resolve correctly.",
    ),
  ];
};

export const summarizeRuntimeConfigReadiness = (items: RuntimeConfigItem[]): RuntimeConfigSummary => {
  const required = items.filter((item) => item.required);
  const recommended = items.filter((item) => !item.required);
  const requiredPassed = required.filter((item) => item.passed).length;
  const recommendedPassed = recommended.filter((item) => item.passed).length;
  return {
    requiredPassed,
    requiredTotal: required.length,
    recommendedPassed,
    recommendedTotal: recommended.length,
    ready: requiredPassed === required.length,
  };
};
