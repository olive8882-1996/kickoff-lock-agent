import { buildFilecoinSealApiReadinessReport } from "./filecoinSealApiReadiness";
import { buildProductionEnvLedger } from "./productionEnvLedger";
import { mergeProductionVerifyEnv, parseEnvText } from "./productionEvidence";
import { buildRuntimeConfigReadiness } from "./runtimeConfig";

export type ProductionEnvPlanGroup = "runtime" | "server" | "deployment" | "verification";
export type ProductionEnvPlanStatus = "filled" | "missing" | "invalid" | "optional";

export type ProductionEnvPlanRow = {
  key: string;
  label: string;
  group: ProductionEnvPlanGroup;
  required: boolean;
  status: ProductionEnvPlanStatus;
  detail: string;
  command: string;
  action: string;
};

export type ProductionEnvBlankDeclaration = {
  key: string;
  fileName?: string;
};

export type ProductionEnvPlanPacket = {
  ready: boolean;
  rows: ProductionEnvPlanRow[];
  missingRequired: string[];
  invalidRequired: string[];
  blankDeclarations: ProductionEnvBlankDeclaration[];
  groups: Array<{
    group: ProductionEnvPlanGroup;
    label: string;
    ready: boolean;
    filled: number;
    total: number;
  }>;
  templateText: string;
  copyText: string;
  nextAction: string;
};

type EnvValues = Record<string, string | undefined>;

export const detectBlankEnvDeclarations = (text: string, fileName?: string): ProductionEnvBlankDeclaration[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .flatMap((match) => {
      const withoutComment = (match[2] ?? "").replace(/\s+#.*$/, "").trim();
      const unquoted = withoutComment === `""` || withoutComment === `''` ? "" : withoutComment;
      return unquoted ? [] : [{ key: match[1], fileName }];
    });

const groupLabels: Record<ProductionEnvPlanGroup, string> = {
  runtime: "Browser runtime",
  server: "Server/service",
  deployment: "Deployment",
  verification: "Production targets",
};

const truthyFlag = (value: string | undefined) => /^(1|true|yes|on)$/i.test(value?.trim() ?? "");

const runtimeEnvKeys: Record<string, string[]> = {
  "supabase-core": ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
  "supabase-redirect": ["VITE_SUPABASE_REDIRECT_URL"],
  "thesportsdb-free": ["VITE_THESPORTSDB_KEY", "VITE_THESPORTSDB_LEAGUE_ID", "VITE_THESPORTSDB_SEASON"],
  "data-proxy": ["VITE_DATA_PROXY_URL", "VITE_DATA_PROXY_SAME_ORIGIN"],
  "api-football-enrichment": ["APIFOOTBALL_KEY_OR_VITE_APIFOOTBALL_KEY_OR_DATA_PROXY"],
  "odds-enrichment": ["API_FOOTBALL_OR_ODDS_PROVIDER"],
  "football-data-backup": ["VITE_FOOTBALL_DATA_TOKEN"],
  "filecoin-seal-api": ["VITE_FILECOIN_SEAL_API", "VITE_FILECOIN_SEAL_SAME_ORIGIN"],
  "filecoin-seal-token": ["VITE_FILECOIN_SEAL_TOKEN"],
  "public-app-url": ["VITE_PUBLIC_APP_URL"],
  "share-storage-bucket": ["VITE_SUPABASE_SHARE_BUCKET"],
  "public-base-path": ["BASE_URL"],
};

const runtimeCommand: Record<string, string> = {
  "supabase-core": "bun run supabase:bootstrap",
  "supabase-redirect": "bun run runtime:config:check",
  "data-proxy": "bun run data:bootstrap",
  "api-football-enrichment": "bun run data:bootstrap",
  "odds-enrichment": "bun run data:bootstrap",
  "filecoin-seal-api": "bun run filecoin:bootstrap",
  "filecoin-seal-token": "bun run filecoin:bootstrap",
  "public-app-url": "bun run runtime:config:check",
  "share-storage-bucket": "bun run supabase:bootstrap",
};

const serverRows = (env: EnvValues): ProductionEnvPlanRow[] => {
  const filecoin = buildFilecoinSealApiReadinessReport(env);
  const filecoinChecks = filecoin.checks.filter((check) =>
    ["synapse-private-key", "server-upload-token", "proof-store", "cors-origin", "same-origin-seal-upstream"].includes(check.id),
  );
  const mapped = filecoinChecks.map((check) => {
    const key =
      check.id === "synapse-private-key"
        ? "SYNAPSE_PRIVATE_KEY"
        : check.id === "server-upload-token"
          ? "FILECOIN_SEAL_TOKEN"
          : check.id === "proof-store"
            ? "FILECOIN_PROOF_STORE_PATH"
            : check.id === "same-origin-seal-upstream"
              ? "FILECOIN_SEAL_UPSTREAM_URL"
              : "ALLOW_ORIGIN";
    const required = check.id !== "same-origin-seal-upstream" || truthyFlag(env.VITE_FILECOIN_SEAL_SAME_ORIGIN);
    return {
      key,
      label: check.label,
      group: "server" as const,
      required,
      status: check.passed ? ("filled" as const) : required ? ("missing" as const) : ("optional" as const),
      detail: check.detail,
      command: "bun run filecoin:api:check",
      action: check.action,
    };
  });

  const supabaseServiceRole = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseDb = env.SUPABASE_DB_URL?.trim();
  const sameOriginData = truthyFlag(env.VITE_DATA_PROXY_SAME_ORIGIN);
  const dataProxyUrl = env.VITE_DATA_PROXY_URL?.trim();
  const browserApiFootballKey = env.VITE_APIFOOTBALL_KEY?.trim();
  const serverApiFootballKey = env.APIFOOTBALL_KEY?.trim() || env.API_FOOTBALL_KEY?.trim();
  const browserFootballDataToken = env.VITE_FOOTBALL_DATA_TOKEN?.trim();
  const serverFootballDataToken = env.FOOTBALL_DATA_TOKEN?.trim() || env.FOOTBALL_DATA_ORG_TOKEN?.trim();
  const browserOddsKey = env.VITE_ODDS_API_KEY?.trim();
  const serverOddsKey = env.ODDS_API_KEY?.trim() || env.THE_ODDS_API_KEY?.trim();
  const oddsSportKey = env.VITE_ODDS_API_SPORT_KEY?.trim();
  const dataProxySelected = sameOriginData || Boolean(dataProxyUrl);
  const apiFootballServerKeyRequired = dataProxySelected && !browserApiFootballKey;
  const footballDataServerTokenRequired = dataProxySelected && !browserFootballDataToken;
  const oddsServerKeyRequired = dataProxySelected && Boolean(oddsSportKey) && !browserOddsKey;
  return [
    {
      key: "SUPABASE_DB_URL",
      label: "Supabase database URL",
      group: "server",
      required: true,
      status: supabaseDb ? "filled" : "missing",
      detail: supabaseDb ? "configured" : "missing",
      command: "bun run supabase:schema:apply",
      action: "Set the local-only Postgres connection string used to apply supabase.schema.sql.",
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      label: "Supabase service role key",
      group: "server",
      required: true,
      status: supabaseServiceRole ? "filled" : "missing",
      detail: supabaseServiceRole ? "configured" : "missing",
      command: "bun run seed:production-targets",
      action: "Set the local-only service role key for storage upload, target seeding and Supabase doctor checks.",
    },
    {
      key: "APIFOOTBALL_KEY",
      label: "Data proxy API-Football key",
      group: "server",
      required: apiFootballServerKeyRequired,
      status: serverApiFootballKey
        ? "filled"
        : apiFootballServerKeyRequired
          ? "missing"
          : "optional",
      detail: serverApiFootballKey
        ? "server-side API-Football key configured"
        : browserApiFootballKey
          ? "browser diagnostics key configured; server-side proxy key optional"
          : dataProxySelected
            ? "missing server-side key for proxied lineups, injuries, standings and odds"
            : "set when deploying the data proxy so API-Football is not exposed in the browser",
      command: "bun run data:providers:check",
      action:
        "Set APIFOOTBALL_KEY on the Worker/Pages runtime when VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1 carries API-Football enrichment.",
    },
    {
      key: "FOOTBALL_DATA_TOKEN",
      label: "Data proxy Football-Data.org token",
      group: "server",
      required: footballDataServerTokenRequired,
      status: serverFootballDataToken
        ? "filled"
        : footballDataServerTokenRequired
          ? "missing"
          : "optional",
      detail: serverFootballDataToken
        ? "server-side Football-Data.org token configured"
        : browserFootballDataToken
          ? "browser diagnostics Football-Data.org token configured; server-side proxy token optional"
          : dataProxySelected
            ? "missing server-side token for proxied matches and standings"
            : "set when deploying the data proxy so Football-Data.org is not exposed in the browser",
      command: "bun run data:providers:check",
      action:
        "Set FOOTBALL_DATA_TOKEN on the Worker/Pages runtime when VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1 carries Football-Data.org matches and standings.",
    },
    {
      key: "ODDS_API_KEY",
      label: "Data proxy Odds API key",
      group: "server",
      required: oddsServerKeyRequired,
      status: serverOddsKey
        ? "filled"
        : oddsServerKeyRequired
          ? "missing"
          : "optional",
      detail: serverOddsKey
        ? "server-side Odds API key configured"
        : browserOddsKey
          ? "browser diagnostics Odds API key configured; server-side proxy key optional"
          : oddsSportKey && dataProxySelected
            ? "missing server-side key for proxied The Odds API reads"
            : "set with VITE_ODDS_API_SPORT_KEY when using The Odds API through the data proxy",
      command: "bun run data:providers:check",
      action:
        "Set ODDS_API_KEY on the Worker/Pages runtime when VITE_ODDS_API_SPORT_KEY is enabled and odds reads are routed through the data proxy.",
    },
    ...mapped,
  ];
};

const deploymentRows = (env: EnvValues): ProductionEnvPlanRow[] => {
  const sameOriginData = truthyFlag(env.VITE_DATA_PROXY_SAME_ORIGIN);
  const sameOriginSeal = truthyFlag(env.VITE_FILECOIN_SEAL_SAME_ORIGIN);
  const required = sameOriginData || sameOriginSeal;
  const tokenAuthReady = Boolean(env.CLOUDFLARE_API_TOKEN?.trim() && env.CLOUDFLARE_ACCOUNT_ID?.trim());
  const wranglerLoginReady = truthyFlag(env.CLOUDFLARE_WRANGLER_LOGIN) || env.CLOUDFLARE_AUTH_MODE?.trim() === "wrangler-login";
  const deployAuthReady = tokenAuthReady || wranglerLoginReady;
  const reason = sameOriginData && sameOriginSeal
    ? "same-origin data proxy and Filecoin seal proxy"
    : sameOriginData
      ? "same-origin data proxy"
      : sameOriginSeal
        ? "same-origin Filecoin seal proxy"
        : "optional Cloudflare Pages deployment";
  const rows = [
    {
      key: "CLOUDFLARE_DEPLOY_AUTH",
      label: "Cloudflare deploy auth",
      configured: deployAuthReady ? "configured" : "",
      action:
        "Set CLOUDFLARE_API_TOKEN plus CLOUDFLARE_ACCOUNT_ID for CI, or run bunx wrangler login locally and set CLOUDFLARE_WRANGLER_LOGIN=1.",
    },
    {
      key: "CLOUDFLARE_PAGES_PROJECT_NAME",
      label: "Cloudflare Pages project",
      configured: env.CLOUDFLARE_PAGES_PROJECT_NAME?.trim() || "kickoff-lock-agent",
      action: "Set the Pages project name, or keep kickoff-lock-agent when that is the deployed project.",
    },
  ];
  return rows.map((row) => {
    const configured = row.configured ?? env[row.key]?.trim();
    return {
      key: row.key,
      label: row.label,
      group: "deployment" as const,
      required,
      status: configured ? ("filled" as const) : required ? ("missing" as const) : ("optional" as const),
      detail: configured ? "configured" : reason,
      command: "bun run pages:cf:deploy",
      action: row.action,
    };
  });
};

const runtimeRows = (env: EnvValues): ProductionEnvPlanRow[] =>
  buildRuntimeConfigReadiness(env)
    .map((item) => ({
      item,
      required: item.required || item.key === "data-proxy",
    }))
    .filter(({ item, required }) => required || !item.passed)
    .flatMap((item) => {
      const runtimeItem = item.item;
      const keys =
        runtimeItem.key === "data-proxy"
          ? ["VITE_DATA_PROXY_URL_OR_SAME_ORIGIN"]
          : runtimeItem.key === "filecoin-seal-api"
            ? ["VITE_FILECOIN_SEAL_API_OR_SAME_ORIGIN"]
            : runtimeEnvKeys[runtimeItem.key] ?? [runtimeItem.key];
      const required = item.required;
      const status: ProductionEnvPlanStatus = runtimeItem.passed ? "filled" : required ? "missing" : "optional";
      return keys.map((key) => ({
        key,
        label: runtimeItem.label,
        group: "runtime" as const,
        required,
        status,
        detail: runtimeItem.detail,
        command: runtimeCommand[runtimeItem.key] ?? "bun run runtime:config:check",
        action: runtimeItem.action,
      }));
    });

const verificationRows = (env: EnvValues): ProductionEnvPlanRow[] => {
  const merged = mergeProductionVerifyEnv([], env as Record<string, string>);
  const ledger = buildProductionEnvLedger(merged.text);
  return ledger.rows.map((row) => ({
    key: row.key,
    label: row.label,
    group: "verification" as const,
    required: row.required,
    status: row.status === "filled" ? "filled" : row.status === "invalid" ? "invalid" : row.required ? "missing" : "optional",
    detail: row.valuePreview,
    command: row.command,
    action: row.action,
  }));
};

const uniqueRows = (rows: ProductionEnvPlanRow[]) => {
  const byKey = new Map<string, ProductionEnvPlanRow>();
  for (const row of rows) {
    const existing = byKey.get(row.key);
    if (!existing || (!existing.required && row.required) || (existing.status === "filled" && row.status !== "filled")) {
      byKey.set(row.key, row);
    }
  }
  return [...byKey.values()];
};

const valueForTemplate = (row: ProductionEnvPlanRow, env: EnvValues) => {
  if (row.status === "invalid") return "";
  const current = env[row.key]?.trim();
  if (current) return current;
  if (row.key === "VITE_SUPABASE_SHARE_BUCKET") return "kickoff-share-cards";
  if (row.key === "VITE_DATA_PROXY_SAME_ORIGIN" || row.key === "VITE_FILECOIN_SEAL_SAME_ORIGIN") return "0";
  if (row.key === "KICKOFF_VERIFY_ALLOW_FAILURES") return "1";
  return "";
};

const templateLinesForRow = (row: ProductionEnvPlanRow, env: EnvValues) => {
  if (row.key === "VITE_DATA_PROXY_URL_OR_SAME_ORIGIN") {
    return [
      `VITE_DATA_PROXY_URL=${env.VITE_DATA_PROXY_URL?.trim() ?? ""}`,
      `VITE_DATA_PROXY_SAME_ORIGIN=${env.VITE_DATA_PROXY_SAME_ORIGIN?.trim() || "0"}`,
    ];
  }
  if (row.key === "VITE_FILECOIN_SEAL_API_OR_SAME_ORIGIN") {
    return [
      `VITE_FILECOIN_SEAL_API=${env.VITE_FILECOIN_SEAL_API?.trim() ?? ""}`,
      `VITE_FILECOIN_SEAL_SAME_ORIGIN=${env.VITE_FILECOIN_SEAL_SAME_ORIGIN?.trim() || "0"}`,
    ];
  }
  if (row.key === "APIFOOTBALL_KEY_OR_VITE_APIFOOTBALL_KEY_OR_DATA_PROXY") {
    return [
      `APIFOOTBALL_KEY=${env.APIFOOTBALL_KEY?.trim() ?? ""}`,
      `VITE_APIFOOTBALL_KEY=${env.VITE_APIFOOTBALL_KEY?.trim() ?? ""}`,
      `VITE_DATA_PROXY_URL=${env.VITE_DATA_PROXY_URL?.trim() ?? ""}`,
      `VITE_DATA_PROXY_SAME_ORIGIN=${env.VITE_DATA_PROXY_SAME_ORIGIN?.trim() || "0"}`,
    ];
  }
  if (row.key === "API_FOOTBALL_OR_ODDS_PROVIDER") {
    return [
      `APIFOOTBALL_KEY=${env.APIFOOTBALL_KEY?.trim() ?? ""}`,
      `VITE_APIFOOTBALL_KEY=${env.VITE_APIFOOTBALL_KEY?.trim() ?? ""}`,
      `VITE_DATA_PROXY_URL=${env.VITE_DATA_PROXY_URL?.trim() ?? ""}`,
      `VITE_DATA_PROXY_SAME_ORIGIN=${env.VITE_DATA_PROXY_SAME_ORIGIN?.trim() || "0"}`,
      `ODDS_API_KEY=${env.ODDS_API_KEY?.trim() ?? ""}`,
      `VITE_ODDS_API_KEY=${env.VITE_ODDS_API_KEY?.trim() ?? ""}`,
      `VITE_ODDS_API_SPORT_KEY=${env.VITE_ODDS_API_SPORT_KEY?.trim() ?? ""}`,
    ];
  }
  if (row.key === "CLOUDFLARE_DEPLOY_AUTH") {
    return [
      `CLOUDFLARE_API_TOKEN=${env.CLOUDFLARE_API_TOKEN?.trim() ?? ""}`,
      `CLOUDFLARE_ACCOUNT_ID=${env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? ""}`,
      `CLOUDFLARE_WRANGLER_LOGIN=${env.CLOUDFLARE_WRANGLER_LOGIN?.trim() || "0"}`,
    ];
  }
  return [`${row.key}=${valueForTemplate(row, env)}`];
};

const buildTemplate = (rows: ProductionEnvPlanRow[], env: EnvValues) => {
  const missing = rows.filter((row) => row.required && row.status !== "filled");
  const grouped = Object.entries(groupLabels).map(([group, label]) => {
    const groupRows = missing.filter((row) => row.group === group);
    if (groupRows.length === 0) return "";
    const lines = [...new Set(groupRows.flatMap((row) => templateLinesForRow(row, env)))];
    return [
      `# ${label}`,
      ...lines,
    ].join("\n");
  });
  return `${grouped.filter(Boolean).join("\n\n")}\n`;
};

export const buildProductionEnvPlan = (
  envTextOrValues: string | EnvValues,
  options: { blankDeclarations?: ProductionEnvBlankDeclaration[] } = {},
): ProductionEnvPlanPacket => {
  const env = typeof envTextOrValues === "string" ? parseEnvText(envTextOrValues) : envTextOrValues;
  const sourceBlankDeclarations =
    options.blankDeclarations ?? (typeof envTextOrValues === "string" ? detectBlankEnvDeclarations(envTextOrValues) : []);
  const rows = uniqueRows([...runtimeRows(env), ...serverRows(env), ...deploymentRows(env), ...verificationRows(env)]);
  const missingRequired = rows.filter((row) => row.required && row.status === "missing").map((row) => row.key);
  const invalidRequired = rows.filter((row) => row.required && row.status === "invalid").map((row) => row.key);
  const unfilledTemplateKeys = new Set(
    rows
      .filter((row) => row.required && row.status !== "filled")
      .flatMap((row) => templateLinesForRow(row, env).map((line) => line.split("=")[0])),
  );
  const blankDeclarations = sourceBlankDeclarations.filter((item) => unfilledTemplateKeys.has(item.key));
  const groups = (Object.keys(groupLabels) as ProductionEnvPlanGroup[]).map((group) => {
    const groupRows = rows.filter((row) => row.group === group && row.required);
    const filled = groupRows.filter((row) => row.status === "filled").length;
    return {
      group,
      label: groupLabels[group],
      ready: groupRows.length > 0 && filled === groupRows.length,
      filled,
      total: groupRows.length,
    };
  });
  const ready = missingRequired.length === 0 && invalidRequired.length === 0;
  const next = rows.find((row) => row.required && row.status !== "filled");
  const templateText = buildTemplate(rows, env);
  const copyText = [
    "Kickoff Lock Agent production env plan",
    `Ready: ${ready ? "yes" : "no"}`,
    `Missing required: ${missingRequired.join(", ") || "none"}`,
    `Invalid required: ${invalidRequired.join(", ") || "none"}`,
    `Blank declarations: ${
      blankDeclarations.length
        ? blankDeclarations.map((item) => `${item.key}${item.fileName ? ` (${item.fileName})` : ""}`).join(", ")
        : "none"
    }`,
    `Next action: ${next ? `${next.command} · ${next.action}` : "Run bun run verify:production with strict mode."}`,
    "",
    templateText.trimEnd(),
  ].join("\n");
  return {
    ready,
    rows,
    missingRequired,
    invalidRequired,
    blankDeclarations,
    groups,
    templateText,
    copyText,
    nextAction: next ? `${next.command}: ${next.action}` : "All production env rows are filled. Run bun run verify:production.",
  };
};
