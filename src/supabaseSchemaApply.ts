export type SupabaseSchemaApplyEnv = Record<string, string | undefined>;

export type SupabaseSchemaApplyPlan = {
  ready: boolean;
  dryRun: boolean;
  schemaPath: string;
  databaseUrl: string;
  maskedDatabaseUrl: string;
  command: string;
  args: string[];
  missing: string[];
  schemaContract?: SupabaseSchemaContractReport;
  action: string;
};

export type SupabaseSchemaApplyArtifact = SupabaseSchemaApplyPlan & {
  generatedAt: string;
  envFiles: string[];
  artifactVersion: 1;
  schemaReadable: boolean;
  psqlAvailable?: boolean;
  applied: boolean;
  executeStatus?: number;
  executeError?: string;
  acceptance: {
    schemaReadable: boolean;
    contractReady: boolean;
    psqlAvailable?: boolean;
    applied: boolean;
    dryRun: boolean;
    outputEnvKeys: string[];
  };
};

export type SupabaseSchemaContractCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type SupabaseSchemaContractReport = {
  ready: boolean;
  passed: number;
  total: number;
  missing: string[];
  checks: SupabaseSchemaContractCheck[];
};

const env = (values: SupabaseSchemaApplyEnv, key: string) => values[key]?.trim() ?? "";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const blockFor = (sql: string, startPattern: RegExp, endPattern: RegExp) => {
  const start = sql.search(startPattern);
  if (start < 0) return "";
  const rest = sql.slice(start);
  const end = rest.search(endPattern);
  return end < 0 ? rest : rest.slice(0, end);
};

const tableBlock = (sql: string, table: string) =>
  blockFor(
    sql,
    new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${escapeRegex(table)}\\s*\\(`, "i"),
    /\n\);\s*\n/i,
  );

const viewBlock = (sql: string, view: string) =>
  blockFor(
    sql,
    new RegExp(`create\\s+or\\s+replace\\s+view\\s+public\\.${escapeRegex(view)}\\s+as`, "i"),
    new RegExp(`comment\\s+on\\s+view\\s+public\\.${escapeRegex(view)}\\s+is`, "i"),
  );

const hasColumn = (block: string, column: string) => new RegExp(`\\b${escapeRegex(column)}\\b`, "i").test(block);

const hasRequiredViewColumnEntry = (block: string, view: string, column: string) =>
  new RegExp(`\\(\\s*'${escapeRegex(view)}'\\s*,\\s*'${escapeRegex(column)}'\\s*\\)`, "i").test(block);

const requiredTables = ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"];

const requiredShareArtifactColumns = [
  "id",
  "kind",
  "user_id",
  "friend_code",
  "season_key",
  "proof_url",
  "image_generated",
  "generated_at",
  "file_name",
  "image_url",
  "image_mime",
  "image_byte_length",
  "image_hash",
  "x_intent_url",
  "x_intent_opened_at",
  "native_share_opened_at",
  "artifact",
];

const requiredLeaderboardColumns = [
  "id",
  "season_key",
  "friend_code",
  "display_name",
  "location",
  "locks",
  "average_score",
  "best_score",
  "xp",
  "streak",
  "revealed",
  "exact_hits",
  "verified_proofs",
  "mode_proofs",
  "global_rank",
  "friend_rank",
  "season_rank",
  "rank",
  "updated_at",
];

const requiredBackendHealthColumns = [
  "missing_columns",
  "missing_view_columns",
  "unsafe_write_policies",
  "storage_bucket_public",
  "storage_policy_count",
  "storage_unsafe_write_policies",
  "required_storage_policy_count",
];

const requiredStoragePolicies = [
  "public can read kickoff share card images",
  "authenticated users can upload kickoff share card images",
  "authenticated users can update kickoff share card images",
];

const requiredAuthUidPolicies = [
  'using (auth.uid()::text = id)',
  'with check (auth.uid()::text = id)',
  'using (auth.uid()::text = user_id)',
  'with check (auth.uid()::text = user_id)',
  'unsafe_write_policies',
];

const contractCheck = (
  checks: SupabaseSchemaContractCheck[],
  id: string,
  label: string,
  passed: boolean,
  detail: string,
) => checks.push({ id, label, passed, detail });

export const validateSupabaseSchemaContract = (schemaSql: string): SupabaseSchemaContractReport => {
  const checks: SupabaseSchemaContractCheck[] = [];
  const normalized = schemaSql.toLowerCase();
  const missingTables = requiredTables.filter((table) => !tableBlock(schemaSql, table));
  contractCheck(
    checks,
    "required-tables",
    "Required public tables",
    missingTables.length === 0,
    missingTables.length === 0 ? `${requiredTables.length}/${requiredTables.length} tables declared` : `missing ${missingTables.join(", ")}`,
  );

  const shareBlock = tableBlock(schemaSql, "kickoff_share_artifacts");
  const missingShareColumns = requiredShareArtifactColumns.filter((column) => !hasColumn(shareBlock, column));
  contractCheck(
    checks,
    "share-artifact-columns",
    "Share artifact production columns",
    missingShareColumns.length === 0,
    missingShareColumns.length === 0
      ? `${requiredShareArtifactColumns.length}/${requiredShareArtifactColumns.length} share columns declared`
      : `missing ${missingShareColumns.join(", ")}`,
  );

  const leaderboardBlock = viewBlock(schemaSql, "kickoff_leaderboard");
  const missingLeaderboardColumns = requiredLeaderboardColumns.filter((column) => !hasColumn(leaderboardBlock, column));
  contractCheck(
    checks,
    "leaderboard-columns",
    "Leaderboard scope rank columns",
    missingLeaderboardColumns.length === 0,
    missingLeaderboardColumns.length === 0
      ? `${requiredLeaderboardColumns.length}/${requiredLeaderboardColumns.length} leaderboard columns declared`
      : `missing ${missingLeaderboardColumns.join(", ")}`,
  );

  const healthBlock = viewBlock(schemaSql, "kickoff_backend_health");
  const missingHealthColumns = requiredBackendHealthColumns.filter((column) => !hasColumn(healthBlock, column));
  contractCheck(
    checks,
    "backend-health-columns",
    "Backend health deep checks",
    missingHealthColumns.length === 0,
    missingHealthColumns.length === 0
      ? `${requiredBackendHealthColumns.length}/${requiredBackendHealthColumns.length} health columns declared`
      : `missing ${missingHealthColumns.join(", ")}`,
  );

  const missingHealthLeaderboardColumns = requiredLeaderboardColumns.filter(
    (column) => !hasRequiredViewColumnEntry(healthBlock, "kickoff_leaderboard", column),
  );
  contractCheck(
    checks,
    "backend-health-leaderboard-columns",
    "Backend health leaderboard field contract",
    missingHealthLeaderboardColumns.length === 0,
    missingHealthLeaderboardColumns.length === 0
      ? `${requiredLeaderboardColumns.length}/${requiredLeaderboardColumns.length} leaderboard fields are health-checked`
      : `missing ${missingHealthLeaderboardColumns.join(", ")}`,
  );

  const storageReady =
    normalized.includes("insert into storage.buckets") &&
    normalized.includes("kickoff-share-cards") &&
    normalized.includes("public = true") &&
    requiredStoragePolicies.every((policy) => normalized.includes(policy));
  contractCheck(
    checks,
    "share-storage-contract",
    "Share card Storage bucket and policies",
    storageReady,
    storageReady ? "public bucket and upload/update/read policies declared" : "missing public bucket or storage object policies",
  );

  const compactSchema = normalized.replace(/\s+/g, " ");
  const storageOwnerPolicyFragment = "(storage.foldername(name))[1] = auth.uid()::text";
  const storageOwnerOccurrences = compactSchema.split(storageOwnerPolicyFragment).length - 1;
  const storageOwnerWriteReady =
    storageOwnerOccurrences >= 3 &&
    compactSchema.includes("storage_unsafe_write_policy_rows") &&
    compactSchema.includes("storage_unsafe_write_policies");
  contractCheck(
    checks,
    "storage-owner-write-policies",
    "Share card Storage owner write policies",
    storageOwnerWriteReady,
    storageOwnerWriteReady
      ? "Storage uploads and updates are scoped to auth.uid() user folders and health-check unsafe policies"
      : "Storage upload/update policies must bind object paths to auth.uid() user folders",
  );

  const writePolicySectionEnd = normalized.indexOf("create or replace view public.kickoff_leaderboard");
  const writePolicySection = writePolicySectionEnd >= 0 ? normalized.slice(0, writePolicySectionEnd) : normalized;
  const authUidWriteReady =
    !writePolicySection.includes("auth.jwt") &&
    !writePolicySection.includes("->> 'email'") &&
    requiredAuthUidPolicies.every((fragment) => normalized.includes(fragment));
  contractCheck(
    checks,
    "auth-uid-write-policies",
    "Auth user id write policies",
    authUidWriteReady,
    authUidWriteReady
      ? "write policies bind profile, records, mode runs and share artifacts to auth.uid()"
      : "write policies must not accept email/JWT fallback identity",
  );

  const grantReady = [
    "grant select on public.kickoff_profiles to anon, authenticated",
    "grant select on public.kickoff_records to anon, authenticated",
    "grant select on public.kickoff_mode_runs to anon, authenticated",
    "grant select on public.kickoff_share_artifacts to anon, authenticated",
    "grant select on public.kickoff_leaderboard to anon, authenticated",
    "grant select on public.kickoff_backend_health to anon, authenticated",
  ].every((grant) => normalized.includes(grant));
  contractCheck(
    checks,
    "public-read-grants",
    "Public REST read grants",
    grantReady,
    grantReady ? "public REST grants declared" : "missing one or more anon/authenticated read grants",
  );

  const passed = checks.filter((check) => check.passed).length;
  return {
    ready: passed === checks.length,
    passed,
    total: checks.length,
    missing: checks.filter((check) => !check.passed).map((check) => check.id),
    checks,
  };
};

export const resolveSupabaseDatabaseUrl = (values: SupabaseSchemaApplyEnv) =>
  env(values, "SUPABASE_DB_URL") || env(values, "SUPABASE_DATABASE_URL") || env(values, "DATABASE_URL");

export const maskDatabaseUrl = (value: string) => {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.password) url.password = "***";
    if (url.username) url.username = url.username === "postgres" ? "postgres" : "***";
    return url.toString();
  } catch {
    return value.replace(/:[^:@/]+@/, ":***@");
  }
};

export const buildSupabaseSchemaApplyPlan = (
  values: SupabaseSchemaApplyEnv,
  options: {
    schemaPath?: string;
    psqlPath?: string;
    dryRun?: boolean;
    schemaSql?: string;
  } = {},
): SupabaseSchemaApplyPlan => {
  const schemaPath = options.schemaPath ?? "supabase.schema.sql";
  const command = options.psqlPath ?? "psql";
  const databaseUrl = resolveSupabaseDatabaseUrl(values);
  const schemaContract = options.schemaSql === undefined ? undefined : validateSupabaseSchemaContract(options.schemaSql);
  const missing = [
    ...(databaseUrl ? [] : ["SUPABASE_DB_URL"]),
    ...(schemaContract && !schemaContract.ready ? schemaContract.missing.map((id) => `schema:${id}`) : []),
  ];
  const args = ["--set", "ON_ERROR_STOP=1", "--file", schemaPath, databaseUrl].filter(Boolean);
  return {
    ready: missing.length === 0,
    dryRun: Boolean(options.dryRun),
    schemaPath,
    databaseUrl,
    maskedDatabaseUrl: maskDatabaseUrl(databaseUrl),
    command,
    args,
    missing,
    schemaContract,
    action:
      missing.length === 0
        ? "Run psql against the Supabase Postgres connection string, then run bun run doctor:supabase."
        : schemaContract && !schemaContract.ready && databaseUrl
          ? "Update supabase.schema.sql until the local schema contract passes, then run bun run supabase:schema:check again."
        : "Set SUPABASE_DB_URL to the Supabase project Postgres connection string, for example postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres.",
  };
};

export const buildSupabaseSchemaApplyArtifact = (
  plan: SupabaseSchemaApplyPlan,
  options: {
    envFiles?: string[];
    schemaReadable: boolean;
    psqlAvailable?: boolean;
    applied?: boolean;
    executeStatus?: number;
    executeError?: string;
    generatedAt?: string;
  },
): SupabaseSchemaApplyArtifact => {
  const contractReady = Boolean(plan.schemaContract?.ready);
  const applied = Boolean(options.applied);
  return {
    ...plan,
    ready: plan.ready && !plan.dryRun && options.schemaReadable && contractReady && applied,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    envFiles: options.envFiles ?? [],
    artifactVersion: 1,
    schemaReadable: options.schemaReadable,
    psqlAvailable: options.psqlAvailable,
    applied,
    executeStatus: options.executeStatus,
    executeError: options.executeError,
    acceptance: {
      schemaReadable: options.schemaReadable,
      contractReady,
      psqlAvailable: options.psqlAvailable,
      applied,
      dryRun: plan.dryRun,
      outputEnvKeys: [
        "kickoff_profiles",
        "kickoff_records",
        "kickoff_mode_runs",
        "kickoff_share_artifacts",
        "kickoff_leaderboard",
        "kickoff_backend_health",
      ],
    },
  };
};
