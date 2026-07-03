import { normalizePublicAppUrl } from "./publicUrls";

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

const hasValue = (value: string | boolean | undefined) =>
  typeof value === "boolean" ? value : Boolean(value && value.trim().length > 0);

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
  const supabaseUrl = hasValue(env.VITE_SUPABASE_URL);
  const supabaseAnon = hasValue(env.VITE_SUPABASE_ANON_KEY);
  const supabaseRedirect = hasValue(env.VITE_SUPABASE_REDIRECT_URL);
  const apiFootball = hasValue(env.VITE_APIFOOTBALL_KEY);
  const footballData = hasValue(env.VITE_FOOTBALL_DATA_TOKEN);
  const theSportsDbKey = hasValue(env.VITE_THESPORTSDB_KEY) || env.VITE_THESPORTSDB_KEY === undefined;
  const theSportsDbLeague = hasValue(env.VITE_THESPORTSDB_LEAGUE_ID) || env.VITE_THESPORTSDB_LEAGUE_ID === undefined;
  const theSportsDbSeason = hasValue(env.VITE_THESPORTSDB_SEASON) || env.VITE_THESPORTSDB_SEASON === undefined;
  const oddsApi = hasValue(env.VITE_ODDS_API_KEY) && hasValue(env.VITE_ODDS_API_SPORT_KEY);
  const sealApi = hasValue(env.VITE_FILECOIN_SEAL_API);
  const sealToken = hasValue(env.VITE_FILECOIN_SEAL_TOKEN);
  const publicAppUrl = normalizePublicAppUrl(env.VITE_PUBLIC_APP_URL);
  const shareBucket = hasValue(env.VITE_SUPABASE_SHARE_BUCKET);
  const baseUrl = hasValue(env.BASE_URL);

  return [
    item(
      "supabase-core",
      "account",
      "Supabase auth + REST",
      true,
      supabaseUrl && supabaseAnon,
      supabaseUrl && supabaseAnon ? "URL and anon key configured" : "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY",
      "Set Supabase project URL and anon key before claiming cross-device account sync.",
    ),
    item(
      "supabase-redirect",
      "account",
      "OAuth redirect",
      true,
      supabaseRedirect,
      supabaseRedirect ? String(env.VITE_SUPABASE_REDIRECT_URL) : "Uses current origin fallback",
      "Set VITE_SUPABASE_REDIRECT_URL to the deployed app URL for Google OAuth and magic links.",
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
      "api-football-enrichment",
      "data",
      "Lineups + injuries",
      true,
      apiFootball,
      apiFootball ? "API-Football key configured" : "Missing VITE_APIFOOTBALL_KEY",
      "Configure API-Football to fetch fixture lineups, injuries and richer odds.",
    ),
    item(
      "odds-enrichment",
      "data",
      "Odds /盘口",
      true,
      apiFootball || oddsApi,
      oddsApi ? "The Odds API configured" : apiFootball ? "API-Football odds route configured" : "Missing odds provider keys",
      "Configure API-Football odds or VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY.",
    ),
    item(
      "football-data-backup",
      "data",
      "Paid/free backup feed",
      false,
      footballData,
      footballData ? "Football-Data.org token configured" : "Optional VITE_FOOTBALL_DATA_TOKEN missing",
      "Add Football-Data.org as a backup fixture and score route if quota allows.",
    ),
    item(
      "filecoin-seal-api",
      "filecoin",
      "Browser seal endpoint",
      true,
      sealApi,
      sealApi ? String(env.VITE_FILECOIN_SEAL_API) : "Missing VITE_FILECOIN_SEAL_API",
      "Deploy the seal API and point the browser build at POST /seal.",
    ),
    item(
      "filecoin-seal-token",
      "filecoin",
      "Upload token",
      true,
      sealToken,
      sealToken ? "Bearer token configured" : "Missing VITE_FILECOIN_SEAL_TOKEN",
      "Require a bearer token before browser uploads can spend backend sealing resources.",
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
      shareBucket ? String(env.VITE_SUPABASE_SHARE_BUCKET) : "Missing VITE_SUPABASE_SHARE_BUCKET",
      "Create a public Supabase Storage bucket for generated proof-card PNGs.",
    ),
    item(
      "public-base-path",
      "sharing",
      "Build base path",
      false,
      baseUrl,
      baseUrl ? String(env.BASE_URL) : "BASE_URL missing",
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
