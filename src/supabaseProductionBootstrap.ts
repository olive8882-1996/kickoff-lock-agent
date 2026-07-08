import { parseEnvText } from "./productionEvidence";
import {
  buildProductionAccountBootstrapPacket,
  type ProductionAccountBootstrapReadBackCommand,
} from "./productionAccountBootstrap";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { evaluatePublicAuthRedirect } from "./publicUrls";
import { buildSupabaseSchemaApplyPlan } from "./supabaseSchemaApply";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { deployedSupabaseProjectUrlProblem } from "./supabaseStorageUrl";

export type SupabaseProductionBootstrapStatus = "done" | "ready" | "blocked";

export type SupabaseProductionBootstrapStage = {
  id: "schema" | "auth" | "seed" | "doctor";
  label: string;
  status: SupabaseProductionBootstrapStatus;
  command: string;
  executeCommand: string;
  requiredEnv: string[];
  missingEnv: string[];
  outputEnv: string[];
  detail: string;
};

export type SupabaseProductionBootstrapPlan = {
  ready: boolean;
  execute: boolean;
  stageReadyCount: number;
  totalStages: number;
  blockedStages: number;
  missingEnv: string[];
  stages: SupabaseProductionBootstrapStage[];
  setup: SupabaseProductionSetupPacket;
  authReadBackCommand: ProductionAccountBootstrapReadBackCommand;
  readBackCommands: ProductionAccountBootstrapReadBackCommand[];
  cleanSessionReadBackCommands: ProductionAccountBootstrapReadBackCommand[];
  commands: string[];
  nextAction: string;
  copyText: string;
};

export type SupabaseProductionBootstrapEnv = Record<string, string | undefined>;

export type SupabaseSetupChecklistItem = {
  id:
    | "create-project"
    | "env-keys"
    | "auth-redirect"
    | "schema"
    | "runtime-config"
    | "share-storage"
    | "seed-targets"
    | "doctor";
  label: string;
  status: SupabaseProductionBootstrapStatus;
  requiredEnv: string[];
  missingEnv: string[];
  command?: string;
  url?: string;
  detail: string;
  action: string;
};

export type SupabaseProductionSetupPacket = {
  ready: boolean;
  projectRef: string;
  projectDashboardUrl: string;
  apiSettingsUrl: string;
  authRedirectUrlConfigUrl: string;
  storageUrl: string;
  redirectUrl: string;
  envTemplateText: string;
  checklist: SupabaseSetupChecklistItem[];
  nextAction: string;
  copyText: string;
};

const value = (env: SupabaseProductionBootstrapEnv, key: string) => env[key]?.trim() ?? "";

const present = (env: SupabaseProductionBootstrapEnv, key: string) => Boolean(value(env, key));

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const missing = (env: SupabaseProductionBootstrapEnv, keys: string[]) =>
  keys.filter((key) => !present(env, key));

const supabaseUrlProblem = (env: SupabaseProductionBootstrapEnv) => {
  const url = value(env, "VITE_SUPABASE_URL");
  return deployedSupabaseProjectUrlProblem(url);
};

const targetKeys = [
  "KICKOFF_VERIFY_USER_ID",
  "KICKOFF_VERIFY_PROFILE_ID",
  "KICKOFF_VERIFY_PROOF_ID",
  "KICKOFF_VERIFY_MODE_IDS",
  "KICKOFF_VERIFY_FRIEND_CODE",
  "KICKOFF_VERIFY_SEASON_KEY",
];

const requiredModeTargetCount = requiredProductionModeIds.length;

const runtimeKeys = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
const authKeys = ["VITE_PUBLIC_APP_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_REDIRECT_URL"];

const writeKeys = ["VITE_PUBLIC_APP_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

const listParsed = (values: Record<string, string>, key: string) =>
  (values[key] ?? "").split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const targetOutputProblems = (values: Record<string, string>) => {
  const problems = targetKeys.filter((key) => !values[key]);
  if (
    values.KICKOFF_VERIFY_USER_ID &&
    values.KICKOFF_VERIFY_PROFILE_ID &&
    values.KICKOFF_VERIFY_USER_ID !== values.KICKOFF_VERIFY_PROFILE_ID
  ) {
    problems.push("KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID");
  }
  const modeIds = listParsed(values, "KICKOFF_VERIFY_MODE_IDS");
  if (modeIds.length > 0 && modeIds.length < requiredModeTargetCount) {
    problems.push(`KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids`);
  }
  return unique(problems);
};

const shareImageProblem = (
  env: SupabaseProductionBootstrapEnv,
  keys: string[],
  label: string,
) => {
  const imageUrl = keys.map((key) => value(env, key)).find(Boolean) ?? "";
  if (!imageUrl) return `${keys.join(" or ")} missing`;
  return publicShareImageUrlProblem(imageUrl, label);
};

const isShareImageIssue = (item: string) =>
  item.toLowerCase().includes("share image") || item.includes("SHARE_IMAGE_URL");

const seedUserProblems = (env: SupabaseProductionBootstrapEnv) => {
  const seedUserId = value(env, "KICKOFF_SEED_USER_ID");
  const verifyUserId = value(env, "KICKOFF_VERIFY_USER_ID");
  const verifyProfileId = value(env, "KICKOFF_VERIFY_PROFILE_ID");
  return [
    !seedUserId && !verifyUserId ? "KICKOFF_SEED_USER_ID or KICKOFF_VERIFY_USER_ID" : "",
    seedUserId && verifyUserId && seedUserId !== verifyUserId
      ? "KICKOFF_SEED_USER_ID must match KICKOFF_VERIFY_USER_ID"
      : "",
    seedUserId && verifyProfileId && seedUserId !== verifyProfileId
      ? "KICKOFF_SEED_USER_ID must match KICKOFF_VERIFY_PROFILE_ID"
      : "",
    !seedUserId && verifyUserId && verifyProfileId && verifyUserId !== verifyProfileId
      ? "KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID"
      : "",
  ].filter(Boolean);
};

const supabaseProjectRef = (env: SupabaseProductionBootstrapEnv) => {
  const url = value(env, "VITE_SUPABASE_URL");
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    if (match?.[1]) return match[1];
  } catch {
    // Fall through to database URL parsing.
  }
  const dbUrl = value(env, "SUPABASE_DB_URL");
  try {
    const host = new URL(dbUrl).hostname;
    const match = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
};

const dashboardUrl = (projectRef: string, path: string) =>
  projectRef ? `https://supabase.com/dashboard/project/${projectRef}${path}` : "";

const envTemplate = (env: SupabaseProductionBootstrapEnv) => {
  const keys = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_REDIRECT_URL",
    "VITE_SUPABASE_SHARE_BUCKET",
    "SUPABASE_DB_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_PUBLIC_APP_URL",
  ];
  return keys
    .map((key) => {
      const fallback =
        key === "VITE_SUPABASE_SHARE_BUCKET"
          ? "kickoff-share-cards"
          : key === "VITE_SUPABASE_REDIRECT_URL"
            ? value(env, "VITE_PUBLIC_APP_URL")
            : "";
      return `${key}=${value(env, key) || fallback}`;
    })
    .join("\n");
};

const buildSupabaseSetupPacket = (
  env: SupabaseProductionBootstrapEnv,
  stages: SupabaseProductionBootstrapStage[],
): SupabaseProductionSetupPacket => {
  const projectRef = supabaseProjectRef(env);
  const redirectUrl = value(env, "VITE_SUPABASE_REDIRECT_URL") || value(env, "VITE_PUBLIC_APP_URL");
  const setupEnvMissing = unique([
    ...missing(env, ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY"]),
    supabaseUrlProblem(env),
  ]);
  const authStage = stages.find((stage) => stage.id === "auth");
  const schemaStage = stages.find((stage) => stage.id === "schema");
  const seedStage = stages.find((stage) => stage.id === "seed");
  const doctorStage = stages.find((stage) => stage.id === "doctor");
  const runtimeConfigMissing = unique([
    ...missing(env, ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_REDIRECT_URL"]),
    supabaseUrlProblem(env),
    authStage?.missingEnv.find((item) => item.startsWith("VITE_SUPABASE_REDIRECT_URL")) ?? "",
  ]);
  const shareStorageMissing = unique([
    ...missing(env, ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]),
    supabaseUrlProblem(env),
    ...(seedStage?.missingEnv.filter(isShareImageIssue) ?? []),
  ]);
  const checklist: SupabaseSetupChecklistItem[] = [
    {
      id: "create-project",
      label: "Create or select Supabase project",
      status: projectRef ? "done" : "blocked",
      requiredEnv: ["VITE_SUPABASE_URL or SUPABASE_DB_URL"],
      missingEnv: projectRef ? [] : ["Supabase project ref"],
      url: projectRef ? dashboardUrl(projectRef, "") : "https://supabase.com/dashboard/projects",
      detail: projectRef ? `Project ref detected: ${projectRef}.` : "Create a hosted Supabase project, then copy its project URL and database connection string.",
      action: projectRef ? "Project detected." : "Open Supabase dashboard, create a project, then fill VITE_SUPABASE_URL and SUPABASE_DB_URL.",
    },
    {
      id: "env-keys",
      label: "Copy project API and database keys",
      status: setupEnvMissing.length === 0 ? "done" : "blocked",
      requiredEnv: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      missingEnv: setupEnvMissing,
      url: dashboardUrl(projectRef, "/settings/api"),
      detail: "Browser code uses only the project URL and anon key; schema apply and production seed use local-only database/service role secrets.",
      action: setupEnvMissing.length === 0 ? "Required Supabase keys are present." : "Fill the missing Supabase keys in .env.production.local.",
    },
    {
      id: "auth-redirect",
      label: "Allow deployed OAuth and magic-link redirect",
      status: authStage?.status ?? "blocked",
      requiredEnv: authStage?.requiredEnv ?? authKeys,
      missingEnv: authStage?.missingEnv ?? [],
      url: dashboardUrl(projectRef, "/auth/url-configuration"),
      detail: `Add ${redirectUrl || "the deployed app URL"} to Supabase Auth redirect allow-list.`,
      action: authStage?.status === "ready" ? "Redirect env is ready; confirm it is allow-listed in Supabase Auth settings." : "Set VITE_SUPABASE_REDIRECT_URL to VITE_PUBLIC_APP_URL and allow-list it in Supabase.",
    },
    {
      id: "schema",
      label: "Apply production tables, RLS, storage and views",
      status: schemaStage?.status ?? "blocked",
      requiredEnv: ["SUPABASE_DB_URL"],
      missingEnv: schemaStage?.missingEnv ?? [],
      command: "bun run supabase:schema:apply",
      url: dashboardUrl(projectRef, "/sql/new"),
      detail: "Applies kickoff_profiles, records, mode runs, share artifacts, kickoff_leaderboard, backend health, RLS and Storage policy contract.",
      action: schemaStage?.status === "ready" ? "Run bun run supabase:schema:apply." : "Set SUPABASE_DB_URL first, then run bun run supabase:schema:check.",
    },
    {
      id: "runtime-config",
      label: "Publish browser runtime config",
      status: runtimeConfigMissing.length === 0 ? "ready" : "blocked",
      requiredEnv: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_REDIRECT_URL"],
      missingEnv: runtimeConfigMissing,
      command: "bun run runtime:config && bun run deploy:pages",
      detail: "Writes public/runtime-config.js without leaking service-role or database secrets, then publishes it with the app.",
      action: runtimeConfigMissing.length === 0
        ? "Run runtime:config and deploy after Supabase browser keys are present."
        : "Set deployed Supabase browser keys and the deployed auth redirect before publishing runtime config.",
    },
    {
      id: "share-storage",
      label: "Upload record and mode share-card images",
      status: shareStorageMissing.length === 0 ? "ready" : "blocked",
      requiredEnv: ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      missingEnv: shareStorageMissing,
      command: "bun run share:upload-image && bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
      url: dashboardUrl(projectRef, "/storage/buckets/kickoff-share-cards"),
      detail: "Uploads production PNG share cards to the public kickoff-share-cards bucket and records public URL/hash read-back evidence.",
      action: shareStorageMissing.length === 0
        ? "Upload both record and mode cards before seeding production target rows."
        : "Set the deployed Supabase URL, service-role key and share image targets before upload.",
    },
    {
      id: "seed-targets",
      label: "Seed profile, proof, modes, shares and leaderboard rows",
      status: seedStage?.status ?? "blocked",
      requiredEnv: seedStage?.requiredEnv ?? writeKeys,
      missingEnv: seedStage?.missingEnv ?? [],
      command: "bun run seed:production-targets --upload-share-image --upload-mode-share-image",
      detail: "Creates the Auth-bound production profile, prediction proof row, required mode proof rows, share artifacts and leaderboard scope evidence.",
      action: seedStage?.status === "ready" ? "Run the seed command." : "Complete Supabase keys and share image URLs first.",
    },
    {
      id: "doctor",
      label: "Prove Supabase read-back",
      status: doctorStage?.status ?? "blocked",
      requiredEnv: doctorStage?.requiredEnv ?? runtimeKeys,
      missingEnv: doctorStage?.missingEnv ?? [],
      command: "bun run doctor:supabase",
      detail: "Verifies Auth target user, backend health, public target rows, share artifacts/channels and global/friend/season leaderboard scopes.",
      action: doctorStage?.status === "ready" ? "Run doctor:supabase and then goal:audit." : "Collect KICKOFF_VERIFY_* targets, then run doctor:supabase.",
    },
  ];
  const next = checklist.find((item) => item.status !== "done");
  const ready = checklist.every((item) => item.status !== "blocked");
  const copyText = [
    "Kickoff Lock Agent Supabase setup packet",
    `Ready: ${ready ? "yes" : "no"}`,
    `Project ref: ${projectRef || "missing"}`,
    `Redirect URL: ${redirectUrl || "missing"}`,
    `Next action: ${next?.action ?? "Run bun run doctor:supabase."}`,
    "Env template:",
    envTemplate(env),
    "Checklist:",
    ...checklist.map((item) =>
      [
        `- ${item.label} [${item.status}]`,
        item.url ? `  url: ${item.url}` : "",
        item.command ? `  command: ${item.command}` : "",
        `  missing: ${item.missingEnv.join(", ") || "none"}`,
        `  action: ${item.action}`,
      ].filter(Boolean).join("\n"),
    ),
  ].join("\n");
  return {
    ready,
    projectRef,
    projectDashboardUrl: projectRef ? dashboardUrl(projectRef, "") : "https://supabase.com/dashboard/projects",
    apiSettingsUrl: dashboardUrl(projectRef, "/settings/api"),
    authRedirectUrlConfigUrl: dashboardUrl(projectRef, "/auth/url-configuration"),
    storageUrl: dashboardUrl(projectRef, "/storage/buckets/kickoff-share-cards"),
    redirectUrl,
    envTemplateText: envTemplate(env),
    checklist,
    nextAction: next?.action ?? "Run bun run doctor:supabase.",
    copyText,
  };
};

export const buildSupabaseProductionBootstrapPlan = (
  env: SupabaseProductionBootstrapEnv,
  options: { execute?: boolean; schemaPath?: string; psqlPath?: string } = {},
): SupabaseProductionBootstrapPlan => {
  const execute = Boolean(options.execute);
  const schema = buildSupabaseSchemaApplyPlan(env, {
    schemaPath: options.schemaPath,
    psqlPath: options.psqlPath,
    dryRun: !execute,
  });
  const parsed = parseEnvText(
    Object.entries(env)
      .map(([key, item]) => `${key}=${item ?? ""}`)
      .join("\n"),
  );
  const authRedirect = evaluatePublicAuthRedirect(env.VITE_SUPABASE_REDIRECT_URL, env.VITE_PUBLIC_APP_URL);
  const supabaseUrlIssue = supabaseUrlProblem(env);
  const authMissing = unique([
    ...missing(env, authKeys).filter((key) => key !== "VITE_SUPABASE_URL"),
    supabaseUrlIssue,
    authRedirect.passed ? "" : authRedirect.detail,
  ]);
  const targetMissing = targetOutputProblems(parsed);
  const shareImageIssue = shareImageProblem(
    env,
    ["KICKOFF_SEED_SHARE_IMAGE_URL", "KICKOFF_VERIFY_SHARE_IMAGE_URL"],
    "Record share image URL",
  );
  const modeShareImageIssue = shareImageProblem(
    env,
    ["KICKOFF_SEED_MODE_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
    "Mode share image URL",
  );
  const seedMissing = unique([
    ...missing(env, writeKeys).filter((key) => key !== "VITE_SUPABASE_URL"),
    supabaseUrlIssue,
    ...seedUserProblems(env),
    ...(shareImageIssue ? [shareImageIssue] : []),
    ...(modeShareImageIssue ? [modeShareImageIssue] : []),
  ]);
  const doctorMissing = [
    ...missing(env, runtimeKeys).filter((key) => key !== "VITE_SUPABASE_URL"),
    supabaseUrlIssue,
    ...(execute && seedMissing.length === 0 ? [] : targetMissing),
  ].filter(Boolean);

  const stages: SupabaseProductionBootstrapStage[] = [
    {
      id: "schema",
      label: "Apply Supabase schema",
      status: schema.ready ? "ready" : "blocked",
      command: "bun run supabase:schema:check",
      executeCommand: "bun run supabase:schema:apply",
      requiredEnv: ["SUPABASE_DB_URL"],
      missingEnv: schema.missing,
      outputEnv: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts", "kickoff_leaderboard"],
      detail: schema.ready
        ? `Postgres command ready: ${schema.command} ${schema.args.map((arg) => (arg === schema.databaseUrl ? schema.maskedDatabaseUrl : arg)).join(" ")}`
        : schema.action,
    },
    {
      id: "auth",
      label: "Verify account auth redirect",
      status: authMissing.length === 0 ? "ready" : "blocked",
      command: "bun run runtime:config:check",
      executeCommand: "bun run runtime:config:check",
      requiredEnv: authKeys,
      missingEnv: authMissing,
      outputEnv: ["Google OAuth authorize URL", "magic-link redirect URL"],
      detail: authMissing.length === 0
        ? `Google OAuth and magic links redirect to ${authRedirect.redirectUrl}.`
        : `Supabase auth is blocked by ${authMissing.join(", ")}.`,
    },
    {
      id: "seed",
      label: "Seed account, proof and leaderboard rows",
      status: targetMissing.length === 0 && seedMissing.length === 0 ? "done" : seedMissing.length === 0 ? "ready" : "blocked",
      command: "bun run seed:production-targets --dry-run",
      executeCommand: "bun run seed:production-targets --upload-share-image --upload-mode-share-image",
      requiredEnv: [
        ...writeKeys,
        "KICKOFF_SEED_SHARE_IMAGE_URL or KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ],
      missingEnv: seedMissing,
      outputEnv: targetKeys,
      detail:
        targetMissing.length === 0
          ? seedMissing.length === 0
            ? `${targetKeys.length}/${targetKeys.length} Supabase target env keys collected and write prerequisites are configured.`
            : `${targetKeys.length}/${targetKeys.length} Supabase target env keys collected; waiting for write prerequisites.`
          : "Upsert production profile, prediction, mode proof, share artifact and leaderboard scope rows.",
    },
    {
      id: "doctor",
      label: "Verify Supabase read-back",
      status: doctorMissing.length === 0 ? "ready" : "blocked",
      command: "bun run doctor:supabase",
      executeCommand: "bun run doctor:supabase",
      requiredEnv: [...runtimeKeys, ...targetKeys],
      missingEnv: doctorMissing,
      outputEnv: ["supabase production evidence"],
      detail: "Verify public REST reads, target rows, share artifacts and global/friend/season leaderboard scopes.",
    },
  ];

  const blockedStages = stages.filter((stage) => stage.status === "blocked").length;
  const stageReadyCount = stages.filter((stage) => stage.status === "ready" || stage.status === "done").length;
  const missingEnv = unique(stages.flatMap((stage) => stage.missingEnv));
  const setup = buildSupabaseSetupPacket(env, stages);
  const accountPacket = buildProductionAccountBootstrapPacket({
    envText: Object.entries(env)
      .map(([key, item]) => `${key}=${item ?? ""}`)
      .join("\n"),
    publicAppUrl: value(env, "VITE_PUBLIC_APP_URL"),
    runtimeEnv: env,
  });
  const authReadBackCommand = accountPacket.authReadBackCommand;
  const readBackCommands = accountPacket.readBackCommands;
  const cleanSessionReadBackCommands = accountPacket.cleanSessionReadBackCommands;
  const commands = stages.filter((stage) => stage.status !== "done").map((stage) => (execute ? stage.executeCommand : stage.command));
  const next = stages.find((stage) => stage.status !== "done");
  const nextAction = next
    ? next.status === "ready"
      ? `${next.label}: run ${execute ? next.executeCommand : next.command}.`
      : `${next.label}: set ${next.missingEnv.join(", ")} first.`
    : "Supabase account bootstrap targets are ready. Run bun run doctor:supabase.";
  const copyText = [
    "Kickoff Lock Agent Supabase production bootstrap",
    `Mode: ${execute ? "execute" : "plan"}`,
    `Stages: ${stageReadyCount}/${stages.length} ready or done`,
    `Missing env: ${missingEnv.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Supabase Auth admin read-back command:",
    `- ${accountPacket.authReadBackCommand.label}: ${accountPacket.authReadBackCommand.command}`,
    "Anonymous Supabase read-back commands:",
    ...readBackCommands.map((item) => `- ${item.label}: ${item.command}`),
    "Clean-session public page read-back commands:",
    ...accountPacket.cleanSessionReadBackCommands.map((item) => `- ${item.label}: ${item.command}`),
    "Stages:",
    ...stages.map((stage) =>
      [
        `- ${stage.label} [${stage.status}]`,
        `  command: ${stage.command}`,
        `  execute: ${stage.executeCommand}`,
        `  requires: ${stage.requiredEnv.join(", ")}`,
        `  missing: ${stage.missingEnv.join(", ") || "none"}`,
        `  outputs: ${stage.outputEnv.join(", ")}`,
        `  detail: ${stage.detail}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready: blockedStages === 0,
    execute,
    stageReadyCount,
    totalStages: stages.length,
    blockedStages,
    missingEnv,
    stages,
    setup,
    authReadBackCommand,
    readBackCommands,
    cleanSessionReadBackCommands,
    commands,
    nextAction,
    copyText,
  };
};
