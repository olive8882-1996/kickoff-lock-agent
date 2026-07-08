import { evaluatePublicAuthRedirect, normalizePublicAppUrl } from "./publicUrls";

export type ProductionAccessProvider = "cloudflare" | "supabase";

export type ProductionAccessCliCheck = {
  provider: ProductionAccessProvider;
  command: string;
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
};

export type ProductionAccessStageStatus = "ready" | "blocked";

export type ProductionAccessStage = {
  id: "cloudflare-cli" | "supabase-cli" | "manual-env" | "account-cloud" | "runtime-targets";
  label: string;
  status: ProductionAccessStageStatus;
  command: string;
  missingEnv: string[];
  detail: string;
  nextAction: string;
};

export type ProductionAccessPreflightPacket = {
  ready: boolean;
  stageReadyCount: number;
  totalStages: number;
  blockedStages: number;
  missingEnv: string[];
  cliAuthenticated: Record<ProductionAccessProvider, boolean>;
  stages: ProductionAccessStage[];
  commands: string[];
  nextAction: string;
  copyText: string;
};

export type ProductionAccessPreflightInput = {
  env: Record<string, string | undefined>;
  cliChecks?: ProductionAccessCliCheck[];
};

const value = (env: Record<string, string | undefined>, key: string) => env[key]?.trim() ?? "";
const has = (env: Record<string, string | undefined>, key: string) => Boolean(value(env, key));
const hasAny = (env: Record<string, string | undefined>, keys: string[]) => keys.some((key) => has(env, key));
const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const normalize = (text = "") => text.toLowerCase();

export const productionCliAuthenticated = (check: ProductionAccessCliCheck | undefined) => {
  if (!check) return false;
  const output = normalize(`${check.stdout ?? ""}\n${check.stderr ?? ""}`);
  if (output.includes("not authenticated")) return false;
  if (output.includes("access token not provided")) return false;
  if (output.includes("authrequired")) return false;
  if (output.includes("please run `wrangler login`") || output.includes("wrangler login")) return false;
  if (output.includes("supabase login")) return false;
  if (check.exitCode !== 0) return false;
  if (check.provider === "cloudflare") {
    return output.includes("you are logged in") || output.includes("user settings") || output.includes("account id");
  }
  return output.includes("linked") || output.includes("name") || output.includes("organization") || output.includes("project");
};

const envMissing = (env: Record<string, string | undefined>, keys: string[]) =>
  keys.filter((key) => {
    if (key.includes(" or ")) return !hasAny(env, key.split(/\s+or\s+/));
    return !has(env, key);
  });

const accountCloudMissing = (env: Record<string, string | undefined>) => {
  const missing = envMissing(env, [
    "VITE_PUBLIC_APP_URL",
    "VITE_SUPABASE_REDIRECT_URL",
    "KICKOFF_VERIFY_USER_ID",
    "KICKOFF_VERIFY_PROFILE_ID",
    "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
    "KICKOFF_VERIFY_PROOF_ID",
    "KICKOFF_VERIFY_FRIEND_CODE",
    "KICKOFF_VERIFY_SEASON_KEY",
  ]);
  const publicAppUrl = normalizePublicAppUrl(value(env, "VITE_PUBLIC_APP_URL"));
  const redirect = evaluatePublicAuthRedirect(value(env, "VITE_SUPABASE_REDIRECT_URL"), value(env, "VITE_PUBLIC_APP_URL"));
  const userId = value(env, "KICKOFF_VERIFY_USER_ID");
  const profileId = value(env, "KICKOFF_VERIFY_PROFILE_ID");
  const publicProfileUrl = value(env, "KICKOFF_VERIFY_PUBLIC_PROFILE_URL");
  if (has(env, "VITE_PUBLIC_APP_URL") && !publicAppUrl) missing.push("VITE_PUBLIC_APP_URL must be deployed HTTPS");
  if (has(env, "VITE_SUPABASE_REDIRECT_URL") && !redirect.passed) missing.push("VITE_SUPABASE_REDIRECT_URL must match VITE_PUBLIC_APP_URL");
  if (userId && profileId && userId !== profileId) missing.push("KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID");
  if (publicAppUrl && publicProfileUrl) {
    try {
      const expected = new URL(publicAppUrl);
      const actual = new URL(publicProfileUrl);
      if (actual.origin !== expected.origin || !actual.searchParams.get("profile")) {
        missing.push("KICKOFF_VERIFY_PUBLIC_PROFILE_URL must be a deployed profile URL for VITE_PUBLIC_APP_URL");
      }
    } catch {
      missing.push("KICKOFF_VERIFY_PUBLIC_PROFILE_URL must be a valid deployed profile URL");
    }
  }
  return unique(missing);
};

const stage = (
  id: ProductionAccessStage["id"],
  label: string,
  command: string,
  missingEnv: string[],
  detail: string,
  nextAction: string,
): ProductionAccessStage => ({
  id,
  label,
  command,
  missingEnv,
  status: missingEnv.length === 0 && !/^blocked:/i.test(detail) ? "ready" : "blocked",
  detail: detail.replace(/^blocked:\s*/i, ""),
  nextAction,
});

export const buildProductionAccessPreflight = ({
  env,
  cliChecks = [],
}: ProductionAccessPreflightInput): ProductionAccessPreflightPacket => {
  const cloudflareCheck = cliChecks.find((check) => check.provider === "cloudflare");
  const supabaseCheck = cliChecks.find((check) => check.provider === "supabase");
  const cloudflareCli = productionCliAuthenticated(cloudflareCheck);
  const supabaseCli = productionCliAuthenticated(supabaseCheck);
  const cloudflareTokenAuth = has(env, "CLOUDFLARE_API_TOKEN") && has(env, "CLOUDFLARE_ACCOUNT_ID");
  const cloudflareDeployReady = cloudflareTokenAuth || cloudflareCli || has(env, "CLOUDFLARE_WRANGLER_LOGIN");
  const supabaseRuntimeMissing = envMissing(env, [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_DB_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  const providerMissing = envMissing(env, [
    "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY",
    "ODDS_API_KEY or VITE_ODDS_API_KEY",
    "VITE_ODDS_API_SPORT_KEY",
  ]);
  const filecoinMissing = envMissing(env, [
    "FILECOIN_SEAL_UPSTREAM_URL",
    "FILECOIN_SEAL_TOKEN",
    "SYNAPSE_PRIVATE_KEY",
    "FILECOIN_PROOF_STORE_PATH",
  ]);
  const targetMissing = envMissing(env, [
    "KICKOFF_VERIFY_MODE_IDS",
    "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
    "KICKOFF_VERIFY_SHARE_IMAGE_URL",
    "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
    "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
    "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
    "KICKOFF_VERIFY_FIXTURE_IDS",
    "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
  ]);
  const accountMissing = accountCloudMissing(env);
  const stages = [
    stage(
      "cloudflare-cli",
      "Cloudflare deploy access",
      "bunx wrangler whoami",
      cloudflareDeployReady ? [] : ["CLOUDFLARE_API_TOKEN or wrangler login", "CLOUDFLARE_ACCOUNT_ID or wrangler login"],
      cloudflareDeployReady
        ? cloudflareTokenAuth
          ? "Cloudflare API token auth is configured."
          : "Cloudflare Wrangler login is available for local deploy."
        : "blocked: Cloudflare deploy auth is not available in CLI env or browser-independent shell.",
      "Run wrangler login in Chrome/terminal, or set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID before Cloudflare Pages deploy.",
    ),
    stage(
      "supabase-cli",
      "Supabase management access",
      "bunx supabase projects list",
      supabaseCli || has(env, "SUPABASE_ACCESS_TOKEN") ? [] : ["SUPABASE_ACCESS_TOKEN or supabase login"],
      supabaseCli || has(env, "SUPABASE_ACCESS_TOKEN")
        ? "Supabase CLI management access is available."
        : "blocked: Supabase CLI is not logged in and SUPABASE_ACCESS_TOKEN is not set.",
      "Run supabase login or set SUPABASE_ACCESS_TOKEN before creating/applying production Supabase resources.",
    ),
    stage(
      "manual-env",
      "Manual production env values",
      "bun run env:production:plan",
      unique([...supabaseRuntimeMissing, ...providerMissing, ...filecoinMissing]),
      "Supabase, realtime data and Filecoin production values must be present before strict evidence can pass.",
      "Fill .env.production.local with Supabase, data provider and Filecoin values, then rerun access:preflight.",
    ),
    stage(
      "account-cloud",
      "Account cloud sync targets",
      "bun run supabase:bootstrap && bun run sharing:bootstrap",
      accountMissing,
      "User login, cloud profile identity, public profile URL and clean-session proof targets must be generated from Supabase read-back.",
      "Run supabase:bootstrap after Supabase access is ready, then run sharing:bootstrap to prove the public profile/proof pages restore without localStorage.",
    ),
    stage(
      "runtime-targets",
      "Generated verification targets",
      "bun run env:production",
      targetMissing,
      "Production verification targets must come from cloud rows, live fixture scouting and Filecoin CID read-back.",
      "Run supabase:bootstrap, scout:data-targets, seal:production-targets and env:production after backend access is ready.",
    ),
  ];
  const blocked = stages.filter((item) => item.status !== "ready");
  const commands = unique([
    ...stages.map((item) => item.command),
    "bun run supabase:bootstrap",
    "bun run pages:cf:deploy",
    "bun run data:bootstrap",
    "bun run filecoin:bootstrap",
    "bun run collect:production",
  ]);
  const missingEnv = unique(stages.flatMap((item) => item.missingEnv));
  const nextAction =
    blocked[0]?.nextAction ?? "Production access is ready; run production:bootstrap -- --execute for final service setup.";
  const copyText = [
    "Kickoff Lock Agent production access preflight",
    `Ready: ${blocked.length === 0 ? "yes" : "no"}`,
    `Stages: ${stages.length - blocked.length}/${stages.length}`,
    `Cloudflare CLI: ${cloudflareCli ? "authenticated" : "not authenticated"}`,
    `Supabase CLI: ${supabaseCli ? "authenticated" : "not authenticated"}`,
    `Missing: ${missingEnv.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
  ].join("\n");

  return {
    ready: blocked.length === 0,
    stageReadyCount: stages.length - blocked.length,
    totalStages: stages.length,
    blockedStages: blocked.length,
    missingEnv,
    cliAuthenticated: {
      cloudflare: cloudflareCli,
      supabase: supabaseCli,
    },
    stages,
    commands,
    nextAction,
    copyText,
  };
};
