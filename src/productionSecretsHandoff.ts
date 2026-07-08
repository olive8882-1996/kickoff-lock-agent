import type { ProductionAcceptanceCollectorPacket } from "./productionAcceptanceCollector";
import type { ProductionEnvPlanPacket } from "./productionEnvPlan";

export type ProductionSecretsDestination =
  | "local-env"
  | "browser-runtime"
  | "cloudflare-pages"
  | "cloudflare-deploy"
  | "seal-upstream"
  | "generated-evidence";

export type ProductionSecretsHandoffStatus = "ready" | "missing" | "generated" | "stale-evidence";

export type ProductionSecretsHandoffItem = {
  key: string;
  destination: ProductionSecretsDestination;
  status: ProductionSecretsHandoffStatus;
  manual: boolean;
  setupCommand?: string;
  command: string;
  detail: string;
};

export type ProductionSecretsHandoffGroup = {
  id: string;
  label: string;
  destination: ProductionSecretsDestination;
  ready: boolean;
  missing: string[];
  manualMissing: string[];
  generatedMissing: string[];
  staleEvidence: string[];
  items: ProductionSecretsHandoffItem[];
};

export type ProductionSecretsHandoffPacket = {
  ready: boolean;
  groups: ProductionSecretsHandoffGroup[];
  missingManualKeys: string[];
  missingGeneratedKeys: string[];
  staleEvidenceKeys: string[];
  setupCommands: string[];
  commands: string[];
  nextAction: string;
  copyText: string;
};

export type ProductionSecretsHandoffInput = {
  env: Record<string, string | undefined>;
  envPlan?: ProductionEnvPlanPacket;
  collector?: ProductionAcceptanceCollectorPacket;
};

const value = (env: Record<string, string | undefined>, key: string) => env[key]?.trim() ?? "";

const unique = <T,>(items: T[]) => [...new Set(items.filter(Boolean))];

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const pagesProjectName = (env: Record<string, string | undefined>) =>
  env.CLOUDFLARE_PAGES_PROJECT_NAME?.trim() || "kickoff-lock-agent";

const pagesSecretPutCommand = (env: Record<string, string | undefined>, key: string) =>
  `printf '%s' "$${key}" | bunx wrangler pages secret put ${key} --project-name ${shellQuote(pagesProjectName(env))}`;

const collectorStageMissing = (collector: ProductionAcceptanceCollectorPacket | undefined, stageId: string) =>
  collector?.stages.find((stage) => stage.id === stageId)?.missingEnv ?? [];

const envPlanMissing = (envPlan: ProductionEnvPlanPacket | undefined, key: string) =>
  Boolean(envPlan?.missingRequired.includes(key) || envPlan?.blankDeclarations.some((item) => item.key === key));

const item = (
  env: Record<string, string | undefined>,
  key: string,
  destination: ProductionSecretsDestination,
  manual: boolean,
  command: string,
  detail: string,
  forcedMissing = false,
  setupCommand?: string,
): ProductionSecretsHandoffItem => {
  const filled = Boolean(value(env, key));
  const status = filled && forcedMissing ? "stale-evidence" : filled ? "ready" : manual ? "missing" : "generated";
  return {
    key,
    destination,
    status,
    manual,
    setupCommand,
    command,
    detail,
  };
};

const group = (
  id: string,
  label: string,
  destination: ProductionSecretsDestination,
  items: ProductionSecretsHandoffItem[],
): ProductionSecretsHandoffGroup => {
  const missing = items.filter((entry) => entry.status !== "ready").map((entry) => entry.key);
  const manualMissing = items.filter((entry) => entry.status === "missing").map((entry) => entry.key);
  const generatedMissing = items.filter((entry) => entry.status === "generated").map((entry) => entry.key);
  const staleEvidence = items.filter((entry) => entry.status === "stale-evidence").map((entry) => entry.key);
  return {
    id,
    label,
    destination,
    ready: missing.length === 0,
    missing,
    manualMissing,
    generatedMissing,
    staleEvidence,
    items,
  };
};

const cloudflareMissing = (
  collector: ProductionAcceptanceCollectorPacket | undefined,
  key: string,
) => collectorStageMissing(collector, "cloudflare-pages-backend").includes(key);

const generatedMissing = (
  env: Record<string, string | undefined>,
  envPlan: ProductionEnvPlanPacket | undefined,
  key: string,
) => !value(env, key) || envPlanMissing(envPlan, key);

export const buildProductionSecretsHandoff = ({
  env,
  envPlan,
  collector,
}: ProductionSecretsHandoffInput): ProductionSecretsHandoffPacket => {
  const groups = [
    group("supabase", "Supabase account, storage and leaderboard backend", "local-env", [
      item(env, "VITE_SUPABASE_URL", "browser-runtime", true, "bun run supabase:bootstrap", "Public Supabase project URL."),
      item(env, "VITE_SUPABASE_ANON_KEY", "browser-runtime", true, "bun run supabase:bootstrap", "Browser Supabase anon key."),
      item(env, "SUPABASE_DB_URL", "local-env", true, "bun run supabase:schema:apply", "Postgres URL for applying supabase.schema.sql."),
      item(env, "SUPABASE_SERVICE_ROLE_KEY", "local-env", true, "bun run seed:production-targets", "Server-only key for target seeding, storage upload and doctors."),
    ]),
    group("cloudflare", "Cloudflare Pages same-origin backend", "cloudflare-pages", [
      item(
        env,
        "APIFOOTBALL_KEY",
        "cloudflare-pages",
        true,
        "bun run pages:cf:preflight",
        "Server-side API-Football key for /data-proxy enrichment.",
        cloudflareMissing(collector, "APIFOOTBALL_KEY"),
        pagesSecretPutCommand(env, "APIFOOTBALL_KEY"),
      ),
      item(
        env,
        "FOOTBALL_DATA_TOKEN",
        "cloudflare-pages",
        false,
        "bun run pages:cf:preflight",
        "Optional server-side Football-Data.org token for a second /data-proxy matches and standings backup.",
        cloudflareMissing(collector, "FOOTBALL_DATA_TOKEN"),
        pagesSecretPutCommand(env, "FOOTBALL_DATA_TOKEN"),
      ),
      item(
        env,
        "ODDS_API_KEY",
        "cloudflare-pages",
        true,
        "bun run pages:cf:preflight",
        "Server-side The Odds API key for proxied odds and handicap reads.",
        cloudflareMissing(collector, "ODDS_API_KEY"),
        pagesSecretPutCommand(env, "ODDS_API_KEY"),
      ),
      item(
        env,
        "FILECOIN_SEAL_UPSTREAM_URL",
        "cloudflare-pages",
        true,
        "bun run pages:cf:preflight",
        "Trusted upstream /seal endpoint behind the same-origin Pages Function.",
        cloudflareMissing(collector, "FILECOIN_SEAL_UPSTREAM_URL"),
        pagesSecretPutCommand(env, "FILECOIN_SEAL_UPSTREAM_URL"),
      ),
      item(
        env,
        "FILECOIN_SEAL_TOKEN",
        "cloudflare-pages",
        true,
        "bun run pages:cf:preflight",
        "Server-side upload token injected by the same-origin /seal proxy.",
        cloudflareMissing(collector, "FILECOIN_SEAL_TOKEN"),
        pagesSecretPutCommand(env, "FILECOIN_SEAL_TOKEN"),
      ),
      item(
        env,
        "ALLOW_ORIGIN",
        "cloudflare-pages",
        true,
        "bun run pages:cf:preflight",
        "Deployed HTTPS app origin allowed by the same-origin Filecoin seal proxy.",
        cloudflareMissing(collector, "ALLOW_ORIGIN"),
        pagesSecretPutCommand(env, "ALLOW_ORIGIN"),
      ),
    ]),
    group("cloudflare-auth", "Cloudflare deploy authorization", "cloudflare-deploy", [
      item(
        env,
        "CLOUDFLARE_API_TOKEN",
        "cloudflare-deploy",
        true,
        "bun run pages:cf:deploy",
        "Cloudflare API token for CI or local non-OAuth deploy.",
        cloudflareMissing(collector, "CLOUDFLARE_API_TOKEN"),
      ),
      item(
        env,
        "CLOUDFLARE_ACCOUNT_ID",
        "cloudflare-deploy",
        true,
        "bun run pages:cf:deploy",
        "Cloudflare account id for Pages deploy.",
        cloudflareMissing(collector, "CLOUDFLARE_ACCOUNT_ID"),
      ),
    ]),
    group("seal-upstream", "Real Filecoin seal upstream service", "seal-upstream", [
      item(env, "SYNAPSE_PRIVATE_KEY", "seal-upstream", true, "bun run filecoin:api:check", "Real Synapse private key for the upstream seal service."),
      item(env, "FILECOIN_PROOF_STORE_PATH", "seal-upstream", true, "bun run filecoin:api:check", "Persistent proof registry path used by the upstream seal service."),
    ]),
    group("verification-targets", "Generated production verification targets", "generated-evidence", [
      item(
        env,
        "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
        "generated-evidence",
        false,
        "bun run supabase:bootstrap",
        "Generated from the deployed public profile URL after the production profile target exists.",
        generatedMissing(env, envPlan, "KICKOFF_VERIFY_PUBLIC_PROFILE_URL"),
      ),
      item(
        env,
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
        "generated-evidence",
        false,
        "bun run sharing:bootstrap",
        "Generated from synced record and mode share-card manifest ids.",
        generatedMissing(env, envPlan, "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS"),
      ),
      item(
        env,
        "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
        "generated-evidence",
        false,
        "bun run leaderboard:bootstrap",
        "Generated after global, friend and season leaderboard current-user read-back succeeds.",
        generatedMissing(env, envPlan, "KICKOFF_VERIFY_LEADERBOARD_SCOPES"),
      ),
      item(
        env,
        "KICKOFF_VERIFY_FIXTURE_IDS",
        "generated-evidence",
        false,
        "bun run data:providers:check && bun run scout:data-targets",
        "Generated after live fixture scouting finds complete lineup, injury, odds and standings rows.",
        generatedMissing(env, envPlan, "KICKOFF_VERIFY_FIXTURE_IDS"),
      ),
      item(
        env,
        "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
        "generated-evidence",
        false,
        "bun run data:providers:check && bun run scout:data-targets",
        "Generated signal matrix proving each fixture has required intelligence rows.",
        generatedMissing(env, envPlan, "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"),
      ),
      item(
        env,
        "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
        "generated-evidence",
        false,
        "bun run filecoin:bootstrap",
        "Generated after the production record proof is sealed and read back.",
        generatedMissing(env, envPlan, "KICKOFF_VERIFY_FILECOIN_RECORD_CID"),
      ),
      item(
        env,
        "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
        "generated-evidence",
        false,
        "bun run filecoin:bootstrap",
        "Generated after every required mode proof is sealed and read back.",
        generatedMissing(env, envPlan, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS"),
      ),
      item(
        env,
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "generated-evidence",
        false,
        "bun run share:upload-image",
        "Generated by uploading the record proof PNG to public Supabase Storage.",
        generatedMissing(env, envPlan, "KICKOFF_VERIFY_SHARE_IMAGE_URL"),
      ),
      item(
        env,
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
        "generated-evidence",
        false,
        "bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
        "Generated by uploading the mode proof PNG to public Supabase Storage.",
        generatedMissing(env, envPlan, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"),
      ),
    ]),
  ];
  const missingManualKeys = unique(groups.flatMap((entry) => entry.manualMissing));
  const missingGeneratedKeys = unique(groups.flatMap((entry) => entry.generatedMissing));
  const staleEvidenceKeys = unique(groups.flatMap((entry) => entry.staleEvidence));
  const commands = unique(groups.flatMap((entry) => entry.items.filter((row) => row.status !== "ready").map((row) => row.command)));
  const setupCommands = unique(
    groups.flatMap((entry) => entry.items.filter((row) => row.status !== "ready").map((row) => row.setupCommand ?? "")),
  );
  const ready = missingManualKeys.length === 0 && missingGeneratedKeys.length === 0 && staleEvidenceKeys.length === 0;
  const nextAction = missingManualKeys.length > 0
    ? `Fill manual production secrets first: ${missingManualKeys.join(", ")}.`
    : missingGeneratedKeys.length > 0
      ? `Run production target generators: ${commands[0]}.`
      : staleEvidenceKeys.length > 0
        ? `Rerun production verification so stale evidence can see filled keys: ${commands[0]}.`
      : "All production secrets and generated verification targets are ready.";
  const copyText = [
    "Kickoff Lock Agent production secrets handoff",
    `Ready: ${ready ? "yes" : "no"}`,
    `Manual missing: ${missingManualKeys.join(", ") || "none"}`,
    `Generated missing: ${missingGeneratedKeys.join(", ") || "none"}`,
    `Stale evidence: ${staleEvidenceKeys.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Setup commands:",
    ...(setupCommands.length ? setupCommands.map((command) => `- ${command}`) : ["- none"]),
    "Groups:",
    ...groups.map((entry) =>
      [
        `- ${entry.label} [${entry.ready ? "ready" : "blocked"}]`,
        `  destination: ${entry.destination}`,
        `  manual missing: ${entry.manualMissing.join(", ") || "none"}`,
        `  generated missing: ${entry.generatedMissing.join(", ") || "none"}`,
        `  stale evidence: ${entry.staleEvidence.join(", ") || "none"}`,
        ...entry.items.map((row) =>
          `  ${row.key}: ${row.status} · ${row.setupCommand ? `${row.setupCommand} · ` : ""}${row.command} · ${row.detail}`,
        ),
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready,
    groups,
    missingManualKeys,
    missingGeneratedKeys,
    staleEvidenceKeys,
    setupCommands,
    commands,
    nextAction,
    copyText,
  };
};
