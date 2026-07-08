import { dataProxyUrlProblem } from "./dataProviderReadiness";
import { parseEnvText } from "./productionEvidence";
import { normalizePublicAppUrl } from "./publicUrls";
import { DEFAULT_SUPABASE_SHARE_BUCKET, sameOriginBackendHostProblem } from "./runtimeConfig";
import { deployedSupabaseProjectUrlProblem } from "./supabaseStorageUrl";

export type RuntimeConfigExportEnv = Record<string, string | undefined>;

export type RuntimeConfigExportReport = {
  ready: boolean;
  keys: string[];
  presentKeys: string[];
  missingRecommendedKeys: string[];
  invalidRecommendedKeys: string[];
  readBackCommands: RuntimeConfigReadBackCommand[];
  text: string;
  json: Record<string, string>;
  detail: string;
};

export type RuntimeConfigReadBackCommand = {
  id: "local-strict-check" | "published-runtime-config";
  label: string;
  command: string;
  ready: boolean;
  url?: string;
};

export type PublishedRuntimeConfigEvaluation = {
  ready: boolean;
  parsed: boolean;
  presentRecommendedKeys: string[];
  missingRecommendedKeys: string[];
  invalidRecommendedKeys: string[];
  mismatchedKeys: string[];
  forbiddenKeys: string[];
  detail: string;
  json: Record<string, string>;
};

export const RUNTIME_CONFIG_EXPORT_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_REDIRECT_URL",
  "VITE_SUPABASE_SHARE_BUCKET",
  "VITE_PUBLIC_APP_URL",
  "VITE_DATA_PROXY_URL",
  "VITE_DATA_PROXY_SAME_ORIGIN",
  "VITE_APIFOOTBALL_KEY",
  "VITE_APIFOOTBALL_ENRICHMENT_LIMIT",
  "VITE_FOOTBALL_DATA_TOKEN",
  "VITE_FOOTBALL_DATA_COMPETITION",
  "VITE_THESPORTSDB_KEY",
  "VITE_THESPORTSDB_LEAGUE_ID",
  "VITE_THESPORTSDB_SEASON",
  "VITE_THESPORTSDB_ENRICHMENT_LIMIT",
  "VITE_ODDS_API_KEY",
  "VITE_ODDS_API_SPORT_KEY",
  "VITE_FILECOIN_SEAL_API",
  "VITE_FILECOIN_SEAL_SAME_ORIGIN",
  "VITE_FILECOIN_SEAL_TOKEN",
] as const;

export const RUNTIME_CONFIG_RECOMMENDED_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_REDIRECT_URL",
  "VITE_SUPABASE_SHARE_BUCKET",
  "VITE_PUBLIC_APP_URL",
  "VITE_DATA_PROXY_URL",
  "VITE_FILECOIN_SEAL_API",
  "VITE_FILECOIN_SEAL_TOKEN",
] as const;

export const RUNTIME_CONFIG_FORBIDDEN_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "SYNAPSE_PRIVATE_KEY",
  "FILECOIN_PROOF_STORE_PATH",
  "FILECOIN_SEAL_TOKEN",
  "ODDS_API_KEY",
  "THE_ODDS_API_KEY",
  "KICKOFF_SEED_EMAIL",
] as const;

export const runtimeConfigMissingKeyLabel = (key: string) => {
  if (key === "VITE_DATA_PROXY_URL") return "VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1";
  if (key === "VITE_FILECOIN_SEAL_API") return "VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1";
  return key;
};

export const formatRuntimeConfigMissingKeys = (keys: readonly string[]) =>
  keys.map(runtimeConfigMissingKeyLabel).join(", ");

const defaultValues: Partial<Record<(typeof RUNTIME_CONFIG_EXPORT_KEYS)[number], string>> = {
  VITE_SUPABASE_SHARE_BUCKET: DEFAULT_SUPABASE_SHARE_BUCKET,
  VITE_FOOTBALL_DATA_COMPETITION: "WC",
  VITE_THESPORTSDB_KEY: "123",
  VITE_THESPORTSDB_LEAGUE_ID: "4429",
  VITE_THESPORTSDB_SEASON: "2026",
  VITE_THESPORTSDB_ENRICHMENT_LIMIT: "8",
  VITE_APIFOOTBALL_ENRICHMENT_LIMIT: "12",
  VITE_DATA_PROXY_SAME_ORIGIN: "0",
  VITE_FILECOIN_SEAL_SAME_ORIGIN: "0",
};

const isExplicitlySet = (env: RuntimeConfigExportEnv, key: string) =>
  Object.prototype.hasOwnProperty.call(env, key) && Boolean(env[key]?.trim());

const cloudflarePagesUrl = (env: RuntimeConfigExportEnv) => {
  const explicitUrl = env.VITE_PUBLIC_APP_URL?.trim();
  if (explicitUrl) return explicitUrl;
  return env.CF_PAGES_URL?.trim() ?? "";
};

const isCloudflarePagesHost = (value?: string) => {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.protocol === "https:" && (url.hostname === "pages.dev" || url.hostname.endsWith(".pages.dev"));
  } catch {
    return false;
  }
};

const isGitHubPagesHost = (value?: string) => {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.hostname.endsWith("github.io");
  } catch {
    return false;
  }
};

const cloudflarePagesFunctionsAvailable = (env: RuntimeConfigExportEnv) =>
  /^(1|true)$/i.test(env.CF_PAGES?.trim() ?? "") || isCloudflarePagesHost(cloudflarePagesUrl(env));

const publicAppUrlFor = (env: RuntimeConfigExportEnv) => {
  const explicitUrl = env.VITE_PUBLIC_APP_URL?.trim();
  const pagesUrl = env.CF_PAGES_URL?.trim();
  if (pagesUrl && /^(1|true)$/i.test(env.CF_PAGES?.trim() ?? "") && (!explicitUrl || isGitHubPagesHost(explicitUrl))) {
    return pagesUrl;
  }
  return explicitUrl || pagesUrl || "";
};

const autoSameOriginFlag = (
  env: RuntimeConfigExportEnv,
  explicitUrlKey: "VITE_DATA_PROXY_URL" | "VITE_FILECOIN_SEAL_API",
  explicitFlagKey: "VITE_DATA_PROXY_SAME_ORIGIN" | "VITE_FILECOIN_SEAL_SAME_ORIGIN",
) => {
  if (isExplicitlySet(env, explicitFlagKey)) return env[explicitFlagKey]?.trim() ?? "";
  if (env[explicitUrlKey]?.trim()) return defaultValues[explicitFlagKey] ?? "0";
  return cloudflarePagesFunctionsAvailable(env) ? "1" : defaultValues[explicitFlagKey] ?? "0";
};

const valueFor = (env: RuntimeConfigExportEnv, key: string) => {
  if (key === "VITE_PUBLIC_APP_URL") return publicAppUrlFor(env);
  if (key === "VITE_DATA_PROXY_SAME_ORIGIN") {
    return autoSameOriginFlag(env, "VITE_DATA_PROXY_URL", "VITE_DATA_PROXY_SAME_ORIGIN");
  }
  if (key === "VITE_FILECOIN_SEAL_SAME_ORIGIN") {
    return autoSameOriginFlag(env, "VITE_FILECOIN_SEAL_API", "VITE_FILECOIN_SEAL_SAME_ORIGIN");
  }
  if (key === "VITE_FILECOIN_SEAL_TOKEN") {
    const sameOriginSeal = autoSameOriginFlag(env, "VITE_FILECOIN_SEAL_API", "VITE_FILECOIN_SEAL_SAME_ORIGIN") === "1";
    return sameOriginSeal ? "" : env[key]?.trim() || "";
  }
  return env[key]?.trim() || defaultValues[key as keyof typeof defaultValues] || "";
};

const deployedHttpsUrl = (value?: string) => {
  const text = value?.trim() ?? "";
  if (!text) return true;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
};

const deployedPublicAppUrl = (value?: string) => {
  if (!deployedHttpsUrl(value)) return undefined;
  return normalizePublicAppUrl(value);
};

const validRuntimeConfigValue = (key: string, json: Record<string, string>) => {
  const value = json[key]?.trim();
  if (!value) {
    if (key === "VITE_DATA_PROXY_URL" && json.VITE_DATA_PROXY_SAME_ORIGIN?.trim() === "1") {
      return Boolean(deployedPublicAppUrl(json.VITE_PUBLIC_APP_URL)) &&
        !sameOriginBackendHostProblem(json.VITE_PUBLIC_APP_URL, "VITE_DATA_PROXY_SAME_ORIGIN");
    }
    if (key === "VITE_FILECOIN_SEAL_API" && json.VITE_FILECOIN_SEAL_SAME_ORIGIN?.trim() === "1") {
      return Boolean(deployedPublicAppUrl(json.VITE_PUBLIC_APP_URL)) &&
        !sameOriginBackendHostProblem(json.VITE_PUBLIC_APP_URL, "VITE_FILECOIN_SEAL_SAME_ORIGIN");
    }
    return true;
  }
  if (key === "VITE_SUPABASE_URL") {
    return !deployedSupabaseProjectUrlProblem(value);
  }
  if (key === "VITE_DATA_PROXY_URL") {
    return !dataProxyUrlProblem(value);
  }
  if (key === "VITE_PUBLIC_APP_URL") {
    return Boolean(deployedPublicAppUrl(value));
  }
  if (key === "VITE_SUPABASE_REDIRECT_URL") {
    const redirectUrl = deployedPublicAppUrl(value);
    const publicAppUrl = deployedPublicAppUrl(json.VITE_PUBLIC_APP_URL);
    return Boolean(redirectUrl) && (!publicAppUrl || redirectUrl === publicAppUrl);
  }
  if (key === "VITE_FILECOIN_SEAL_API") {
    if (!deployedHttpsUrl(value)) return false;
    return /\/seal\/?$/.test(new URL(value).pathname);
  }
  return true;
};

const dataProxyPublished = (json: Record<string, string>) =>
  Boolean(json.VITE_DATA_PROXY_URL?.trim()) || json.VITE_DATA_PROXY_SAME_ORIGIN?.trim() === "1";

const filecoinSealApiPublished = (json: Record<string, string>) =>
  Boolean(json.VITE_FILECOIN_SEAL_API?.trim()) || json.VITE_FILECOIN_SEAL_SAME_ORIGIN?.trim() === "1";

const recommendedKeyPresent = (key: (typeof RUNTIME_CONFIG_RECOMMENDED_KEYS)[number], json: Record<string, string>) =>
  key === "VITE_DATA_PROXY_URL"
    ? dataProxyPublished(json)
    : key === "VITE_FILECOIN_SEAL_API"
      ? filecoinSealApiPublished(json)
      : key === "VITE_FILECOIN_SEAL_TOKEN" && json.VITE_FILECOIN_SEAL_SAME_ORIGIN?.trim() === "1"
        ? true
      : Boolean(json[key]?.trim());

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

const runtimeConfigPublishedUrl = (json: Record<string, string>) => {
  const publicAppUrl = deployedPublicAppUrl(json.VITE_PUBLIC_APP_URL);
  return publicAppUrl ? new URL("runtime-config.js", publicAppUrl).toString() : "";
};

const runtimeConfigReadBackCommands = (
  ready: boolean,
  json: Record<string, string>,
): RuntimeConfigReadBackCommand[] => {
  const publishedUrl = runtimeConfigPublishedUrl(json);
  return [
    {
      id: "local-strict-check",
      label: "Local strict runtime config check",
      command: "bun run runtime:config:check",
      ready,
    },
    {
      id: "published-runtime-config",
      label: "Published runtime-config.js",
      command: publishedUrl
        ? `curl -sS ${shellSingleQuote(publishedUrl)}`
        : "Set VITE_PUBLIC_APP_URL before reading published runtime-config.js.",
      ready: Boolean(ready && publishedUrl),
      url: publishedUrl,
    },
  ];
};

export const buildRuntimeConfigJs = (env: RuntimeConfigExportEnv): RuntimeConfigExportReport => {
  const json = Object.fromEntries(
    RUNTIME_CONFIG_EXPORT_KEYS.map((key) => [key, valueFor(env, key)]),
  ) as Record<string, string>;
  const presentKeys = RUNTIME_CONFIG_EXPORT_KEYS.filter((key) => Boolean(json[key]));
  const missingRecommendedKeys = RUNTIME_CONFIG_RECOMMENDED_KEYS.filter((key) => !recommendedKeyPresent(key, json));
  const invalidRecommendedKeys = RUNTIME_CONFIG_RECOMMENDED_KEYS.filter((key) => !validRuntimeConfigValue(key, json));
  const text = [
    "window.__KICKOFF_RUNTIME_CONFIG__ = Object.freeze(",
    JSON.stringify(json, null, 2),
    ");",
    "",
  ].join("\n");
  const ready = missingRecommendedKeys.length === 0 && invalidRecommendedKeys.length === 0;
  return {
    ready,
    keys: [...RUNTIME_CONFIG_EXPORT_KEYS],
    presentKeys,
    missingRecommendedKeys,
    invalidRecommendedKeys,
    readBackCommands: runtimeConfigReadBackCommands(ready, json),
    text,
    json,
    detail: ready
      ? `${presentKeys.length}/${RUNTIME_CONFIG_EXPORT_KEYS.length} browser runtime config keys exported`
      : [
          missingRecommendedKeys.length ? `missing recommended ${formatRuntimeConfigMissingKeys(missingRecommendedKeys)}` : "",
          invalidRecommendedKeys.length ? `invalid recommended ${invalidRecommendedKeys.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("; "),
  };
};

export const buildRuntimeConfigJsFromEnvTexts = (
  envTexts: string[],
  baseEnv: RuntimeConfigExportEnv = {},
): RuntimeConfigExportReport => {
  const merged = Object.assign({}, ...envTexts.map(parseEnvText), baseEnv);
  return buildRuntimeConfigJs(merged);
};

export const parseRuntimeConfigJs = (text: string): Record<string, string> | undefined => {
  const match = text.match(/window\.__KICKOFF_RUNTIME_CONFIG__\s*=\s*(?:Object\.freeze\()?([\s\S]*?)\)?\s*;?\s*$/);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, typeof value === "string" ? value : String(value ?? "")]),
    );
  } catch {
    return undefined;
  }
};

const leakedForbiddenKeys = (text: string, json?: Record<string, string>) =>
  RUNTIME_CONFIG_FORBIDDEN_KEYS.filter((key) => {
    if (json && Object.prototype.hasOwnProperty.call(json, key)) return true;
    return new RegExp(`(^|[^A-Z0-9_])${key}([^A-Z0-9_]|$)`).test(text);
  });

export const evaluatePublishedRuntimeConfig = (
  text: string,
  expectedEnv: RuntimeConfigExportEnv = {},
): PublishedRuntimeConfigEvaluation => {
  const json = parseRuntimeConfigJs(text);
  const forbiddenKeys = leakedForbiddenKeys(text, json);
  if (!json) {
    return {
      ready: false,
      parsed: false,
      presentRecommendedKeys: [],
      missingRecommendedKeys: [...RUNTIME_CONFIG_RECOMMENDED_KEYS],
      invalidRecommendedKeys: [],
      mismatchedKeys: [],
      forbiddenKeys,
      detail: "runtime-config.js did not contain parseable window.__KICKOFF_RUNTIME_CONFIG__ JSON",
      json: {},
    };
  }
  const presentRecommendedKeys = RUNTIME_CONFIG_RECOMMENDED_KEYS.filter((key) => recommendedKeyPresent(key, json));
  const missingRecommendedKeys = RUNTIME_CONFIG_RECOMMENDED_KEYS.filter((key) => !recommendedKeyPresent(key, json));
  const invalidRecommendedKeys = RUNTIME_CONFIG_RECOMMENDED_KEYS.filter((key) => !validRuntimeConfigValue(key, json));
  const mismatchedKeys = RUNTIME_CONFIG_RECOMMENDED_KEYS.filter((key) => {
    const expected = expectedEnv[key]?.trim();
    return Boolean(expected && json[key]?.trim() && json[key].trim() !== expected);
  });
  const ready =
    missingRecommendedKeys.length === 0 &&
    invalidRecommendedKeys.length === 0 &&
    mismatchedKeys.length === 0 &&
    forbiddenKeys.length === 0;
  return {
    ready,
    parsed: true,
    presentRecommendedKeys,
    missingRecommendedKeys,
    invalidRecommendedKeys,
    mismatchedKeys,
    forbiddenKeys,
    detail: ready
      ? `${presentRecommendedKeys.length}/${RUNTIME_CONFIG_RECOMMENDED_KEYS.length} recommended runtime keys published`
      : [
          missingRecommendedKeys.length ? `missing ${formatRuntimeConfigMissingKeys(missingRecommendedKeys)}` : "",
          invalidRecommendedKeys.length ? `invalid ${invalidRecommendedKeys.join(", ")}` : "",
          mismatchedKeys.length ? `mismatched ${mismatchedKeys.join(", ")}` : "",
          forbiddenKeys.length ? `forbidden ${forbiddenKeys.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("; "),
    json,
  };
};
