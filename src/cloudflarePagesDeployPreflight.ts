export type CloudflarePagesDeployEnv = Record<string, string | undefined>;

export type CloudflarePagesRuntimePreflight = {
  sameOriginData: boolean;
  sameOriginSeal: boolean;
  functionsReady: boolean;
  functionEntryProblems: string[];
  problems: string[];
};

export type CloudflarePagesFunctionEntry = {
  path: string;
  workerImport: string;
  exportsOnRequest: boolean;
};

export type CloudflarePagesRuntimePreflightOptions = {
  functionEntries?: Record<string, string | undefined>;
  checkFunctionEntries?: boolean;
};

export const REQUIRED_CLOUDFLARE_PAGES_FUNCTION_ENTRIES: CloudflarePagesFunctionEntry[] = [
  {
    path: "functions/data-proxy/[[path]].js",
    workerImport: "../../server/data-proxy-worker.mjs",
    exportsOnRequest: true,
  },
  {
    path: "functions/seal/[[path]].js",
    workerImport: "../../server/filecoin-seal-proxy-worker.mjs",
    exportsOnRequest: true,
  },
  {
    path: "functions/health.js",
    workerImport: "../server/filecoin-seal-proxy-worker.mjs",
    exportsOnRequest: true,
  },
  {
    path: "functions/verify.js",
    workerImport: "../server/filecoin-seal-proxy-worker.mjs",
    exportsOnRequest: true,
  },
  {
    path: "functions/proof/[[path]].js",
    workerImport: "../../server/filecoin-seal-proxy-worker.mjs",
    exportsOnRequest: true,
  },
  {
    path: "functions/jobs/[[path]].js",
    workerImport: "../../server/filecoin-seal-proxy-worker.mjs",
    exportsOnRequest: true,
  },
];

const truthyFlag = (value: string | undefined) => /^(1|true|yes|on)$/i.test(String(value ?? "").trim());

const value = (env: CloudflarePagesDeployEnv, key: string) => env[key]?.trim() ?? "";

const hasAny = (env: CloudflarePagesDeployEnv, keys: string[]) => keys.some((key) => Boolean(value(env, key)));

const isCloudflarePagesHost = (urlText: string) => {
  try {
    const url = new URL(urlText);
    return url.protocol === "https:" && (url.hostname === "pages.dev" || url.hostname.endsWith(".pages.dev"));
  } catch {
    return false;
  }
};

const cloudflarePagesFunctionsAvailable = (env: CloudflarePagesDeployEnv) =>
  truthyFlag(value(env, "CF_PAGES")) || isCloudflarePagesHost(value(env, "CF_PAGES_URL") || value(env, "VITE_PUBLIC_APP_URL"));

const sameOriginSelected = (
  env: CloudflarePagesDeployEnv,
  flagKey: "VITE_DATA_PROXY_SAME_ORIGIN" | "VITE_FILECOIN_SEAL_SAME_ORIGIN",
  directUrlKey: "VITE_DATA_PROXY_URL" | "VITE_FILECOIN_SEAL_API",
) => {
  if (value(env, flagKey)) return truthyFlag(value(env, flagKey));
  if (value(env, directUrlKey)) return false;
  return cloudflarePagesFunctionsAvailable(env);
};

const deployedHttpsUrlProblem = (urlText: string, label: string, requiredPath?: RegExp) => {
  if (!urlText) return `${label} is missing.`;
  try {
    const url = new URL(urlText);
    if (
      url.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.hostname.endsWith(".localhost")
    ) {
      return `${label} must be a deployed HTTPS URL.`;
    }
    if (requiredPath && !requiredPath.test(url.pathname)) {
      return `${label} must point to the deployed /seal endpoint.`;
    }
    return "";
  } catch {
    return `${label} must be a valid deployed HTTPS URL.`;
  }
};

export const buildCloudflarePagesRuntimePreflight = (
  env: CloudflarePagesDeployEnv,
  options: CloudflarePagesRuntimePreflightOptions = {},
): CloudflarePagesRuntimePreflight => {
  const sameOriginData = sameOriginSelected(env, "VITE_DATA_PROXY_SAME_ORIGIN", "VITE_DATA_PROXY_URL");
  const sameOriginSeal = sameOriginSelected(env, "VITE_FILECOIN_SEAL_SAME_ORIGIN", "VITE_FILECOIN_SEAL_API");
  const sealAllowOrigin = value(env, "ALLOW_ORIGIN") || value(env, "VITE_PUBLIC_APP_URL") || value(env, "CF_PAGES_URL");
  const shouldCheckFunctionEntries = options.checkFunctionEntries ?? (sameOriginData || sameOriginSeal);
  const functionEntryProblems = shouldCheckFunctionEntries
    ? REQUIRED_CLOUDFLARE_PAGES_FUNCTION_ENTRIES.flatMap((entry) => {
        const source = options.functionEntries?.[entry.path];
        if (source === undefined) return [`${entry.path} is missing from the Pages Functions bundle.`];
        return [
          source.includes(entry.workerImport) ? "" : `${entry.path} must import ${entry.workerImport}.`,
          !entry.exportsOnRequest || /export\s+const\s+onRequest\s*=/.test(source)
            ? ""
            : `${entry.path} must export an onRequest handler.`,
          source.includes("worker.fetch(request, env, ctx)")
            ? ""
            : `${entry.path} must forward request, env and ctx to the shared worker.`,
        ].filter(Boolean);
      })
    : [];
  const problems = [
    ...functionEntryProblems,
    sameOriginData && !hasAny(env, ["APIFOOTBALL_KEY", "API_FOOTBALL_KEY", "VITE_APIFOOTBALL_KEY"])
      ? "APIFOOTBALL_KEY is missing for same-origin /data-proxy enrichment."
      : "",
    sameOriginData && !hasAny(env, ["FOOTBALL_DATA_TOKEN", "FOOTBALL_DATA_ORG_TOKEN"])
      ? "FOOTBALL_DATA_TOKEN is missing for same-origin /data-proxy standings backup."
      : "",
    sameOriginData &&
    value(env, "VITE_ODDS_API_SPORT_KEY") &&
    !hasAny(env, ["ODDS_API_KEY", "THE_ODDS_API_KEY", "VITE_ODDS_API_KEY"])
      ? "ODDS_API_KEY is missing for proxied The Odds API reads."
      : "",
    sameOriginSeal
      ? deployedHttpsUrlProblem(value(env, "FILECOIN_SEAL_UPSTREAM_URL"), "FILECOIN_SEAL_UPSTREAM_URL", /\/seal\/?$/)
      : "",
    sameOriginSeal && !value(env, "FILECOIN_SEAL_TOKEN")
      ? "FILECOIN_SEAL_TOKEN is missing for same-origin /seal token injection."
      : "",
    sameOriginSeal
      ? deployedHttpsUrlProblem(sealAllowOrigin, "ALLOW_ORIGIN")
      : "",
  ].filter(Boolean);

  return {
    sameOriginData,
    sameOriginSeal,
    functionsReady: functionEntryProblems.length === 0,
    functionEntryProblems,
    problems: [...new Set(problems)],
  };
};
