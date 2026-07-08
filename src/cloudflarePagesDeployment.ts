import {
  buildCloudflarePagesRuntimePreflight,
  type CloudflarePagesDeployEnv,
  type CloudflarePagesRuntimePreflight,
} from "./cloudflarePagesDeployPreflight";

export type CloudflarePagesDeployStageStatus = "done" | "ready" | "blocked";

export type CloudflarePagesDeployStage = {
  id: "functions" | "runtime-secrets" | "auth" | "deploy";
  label: string;
  status: CloudflarePagesDeployStageStatus;
  command: string;
  requiredEnv: string[];
  missingEnv: string[];
  outputEnv: string[];
  detail: string;
};

export type CloudflarePagesDeployPlan = {
  ready: boolean;
  projectName: string;
  branch: string;
  outputDir: string;
  plannedPagesUrl: string;
  tokenAuthReady: boolean;
  wranglerLoginReady: boolean;
  sameOriginData: boolean;
  sameOriginSeal: boolean;
  functionsReady: boolean;
  runtimePreflight: CloudflarePagesRuntimePreflight;
  stageReadyCount: number;
  totalStages: number;
  blockedStages: number;
  missingEnv: string[];
  stages: CloudflarePagesDeployStage[];
  commands: string[];
  readBackCommands: CloudflarePagesReadBackCommand[];
  secretExposureChecks: CloudflarePagesSecretExposureCheck[];
  proxyCapabilityChecks: CloudflarePagesProxyCapabilityCheck[];
  nextAction: string;
  copyText: string;
};

export type CloudflarePagesReadBackCommand = {
  id: "app-root" | "runtime-config" | "data-proxy-health" | "seal-health";
  label: string;
  url: string;
  command: string;
  ready: boolean;
  responseExpectation: CloudflarePagesReadBackExpectation;
};

export type CloudflarePagesReadBackExpectation = {
  responseType: "html" | "runtime-config-js" | "json";
  requiredFields: string[];
  forbiddenFields?: string[];
  expectedService?: "kickoff-data-proxy" | "kickoff-lock-filecoin-seal-proxy";
  expectedSameOrigin?: boolean;
};

export type CloudflarePagesSecretExposureCheck = {
  id:
    | "runtime-config-public-safe"
    | "readback-commands-public-safe"
    | "browser-api-keys-not-required"
    | "browser-seal-token-not-required";
  label: string;
  passed: boolean;
  detail: string;
};

export type CloudflarePagesProxyCapabilityCheck = {
  id:
    | "data-free-feeds"
    | "data-football-data-backup"
    | "data-api-football-enrichment"
    | "data-odds-enrichment"
    | "filecoin-async-upload"
    | "filecoin-job-polling"
    | "filecoin-cid-readback";
  service: "data-proxy" | "filecoin-seal";
  label: string;
  passed: boolean;
  detail: string;
  readBackCommand: string;
};

export type CloudflarePagesDeployPlanOptions = {
  projectName?: string;
  branch?: string;
  outputDir?: string;
  plannedPagesUrl?: string;
  functionsBundleReady?: boolean;
  functionsBundleDetail?: string;
  tokenAuthReady?: boolean;
  wranglerLoginReady?: boolean;
  tokenAuthMissing?: string[];
  functionEntries?: Record<string, string | undefined>;
};

const truthyFlag = (value: string | undefined) => /^(1|true|yes|on)$/i.test(String(value ?? "").trim());

const value = (env: CloudflarePagesDeployEnv, key: string) => env[key]?.trim() ?? "";

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const projectUrlFor = (projectName: string) => `https://${projectName}.pages.dev/`;

const pageUrl = (baseUrl: string, path: string) => new URL(path, baseUrl).toString();

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

const curlCommand = (url: string) => `curl -sS ${shellSingleQuote(url)}`;

const sensitiveEnvKeys = [
  "APIFOOTBALL_KEY",
  "API_FOOTBALL_KEY",
  "FOOTBALL_DATA_TOKEN",
  "FOOTBALL_DATA_ORG_TOKEN",
  "ODDS_API_KEY",
  "THE_ODDS_API_KEY",
  "FILECOIN_SEAL_TOKEN",
  "SEAL_PROXY_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SYNAPSE_PRIVATE_KEY",
];

const exposedSecretValues = (text: string, env: CloudflarePagesDeployEnv) =>
  sensitiveEnvKeys
    .map((key) => ({ key, value: value(env, key) }))
    .filter(({ value: secret }) => secret.length >= 8 && text.includes(secret))
    .map(({ key }) => key);

const plannedSameOriginFlag = (
  env: CloudflarePagesDeployEnv,
  directUrlKey: "VITE_DATA_PROXY_URL" | "VITE_FILECOIN_SEAL_API",
) => {
  if (value(env, directUrlKey)) return "0";
  return "1";
};

export const buildPlannedCloudflarePagesRuntimeEnv = (
  env: CloudflarePagesDeployEnv,
  projectName: string,
  plannedPagesUrl: string,
): CloudflarePagesDeployEnv => {
  const pagesUrl = value(env, "CF_PAGES_URL") || plannedPagesUrl || projectUrlFor(projectName);
  return {
    ...env,
    CF_PAGES: value(env, "CF_PAGES") || "1",
    CF_PAGES_URL: pagesUrl,
    VITE_PUBLIC_APP_URL: pagesUrl,
    VITE_DATA_PROXY_SAME_ORIGIN: plannedSameOriginFlag(env, "VITE_DATA_PROXY_URL"),
    VITE_FILECOIN_SEAL_SAME_ORIGIN: plannedSameOriginFlag(env, "VITE_FILECOIN_SEAL_API"),
  };
};

const runtimeSecretNames = (preflight: CloudflarePagesRuntimePreflight) =>
  unique(
    preflight.problems.flatMap((problem) => {
      if (problem.includes("APIFOOTBALL_KEY")) return ["APIFOOTBALL_KEY"];
      if (problem.includes("FOOTBALL_DATA_TOKEN")) return ["FOOTBALL_DATA_TOKEN"];
      if (problem.includes("ODDS_API_KEY")) return ["ODDS_API_KEY"];
      if (problem.includes("FILECOIN_SEAL_UPSTREAM_URL")) return ["FILECOIN_SEAL_UPSTREAM_URL"];
      if (problem.includes("FILECOIN_SEAL_TOKEN")) return ["FILECOIN_SEAL_TOKEN"];
      if (problem.includes("ALLOW_ORIGIN")) return ["ALLOW_ORIGIN"];
      return [];
    }),
  );

const readBackCommandsFor = (
  plannedPagesUrl: string,
  deployReady: boolean,
  runtimePreflight: CloudflarePagesRuntimePreflight,
): CloudflarePagesReadBackCommand[] => [
  {
    id: "app-root",
    label: "Published app root",
    url: plannedPagesUrl,
    command: curlCommand(plannedPagesUrl),
    ready: deployReady,
    responseExpectation: {
      responseType: "html",
      requiredFields: ["Kickoff Lock Agent", "runtime-config.js", "site.webmanifest", "assets/kickoff-lock-icon"],
    },
  },
  {
    id: "runtime-config",
    label: "Published runtime config",
    url: pageUrl(plannedPagesUrl, "runtime-config.js"),
    command: curlCommand(pageUrl(plannedPagesUrl, "runtime-config.js")),
    ready: deployReady,
    responseExpectation: {
      responseType: "runtime-config-js",
      requiredFields: [
        "window.__KICKOFF_RUNTIME_CONFIG__",
        "VITE_PUBLIC_APP_URL",
        "VITE_SUPABASE_URL",
        "VITE_DATA_PROXY_SAME_ORIGIN",
        "VITE_FILECOIN_SEAL_SAME_ORIGIN",
      ],
      forbiddenFields: sensitiveEnvKeys,
    },
  },
  ...(runtimePreflight.sameOriginData
    ? [
        {
          id: "data-proxy-health" as const,
          label: "Same-origin data proxy health",
          url: pageUrl(plannedPagesUrl, "data-proxy/health"),
          command: curlCommand(pageUrl(plannedPagesUrl, "data-proxy/health")),
          ready: deployReady,
          responseExpectation: {
            responseType: "json" as const,
            expectedService: "kickoff-data-proxy" as const,
            expectedSameOrigin: true,
            requiredFields: [
              "ok",
              "service",
              "allowedHosts",
              "allowedRoutes",
              "providerCapabilities",
              "apiFootballServerKey",
              "oddsApiServerKey",
              "footballDataServerToken",
            ],
          },
        },
      ]
    : []),
  ...(runtimePreflight.sameOriginSeal
    ? [
        {
          id: "seal-health" as const,
          label: "Same-origin Filecoin seal health",
          url: pageUrl(plannedPagesUrl, "seal/health"),
          command: curlCommand(pageUrl(plannedPagesUrl, "seal/health")),
          ready: deployReady,
          responseExpectation: {
            responseType: "json" as const,
            expectedService: "kickoff-lock-filecoin-seal-proxy" as const,
            expectedSameOrigin: true,
            requiredFields: [
              "ok",
              "service",
              "tokenInjected",
              "proxyCapabilities",
              "asyncUpload",
              "uploadStatus",
              "cidQuery",
              "verificationPolling",
            ],
          },
        },
      ]
    : []),
];

const readBackCommandById = (commands: CloudflarePagesReadBackCommand[], id: CloudflarePagesReadBackCommand["id"]) =>
  commands.find((command) => command.id === id)?.command ?? "";

const buildSecretExposureChecks = (
  env: CloudflarePagesDeployEnv,
  runtimePreflight: CloudflarePagesRuntimePreflight,
  readBackCommands: CloudflarePagesReadBackCommand[],
): CloudflarePagesSecretExposureCheck[] => {
  const runtimePublicKeys = [
    "VITE_PUBLIC_APP_URL",
    "VITE_DATA_PROXY_SAME_ORIGIN",
    "VITE_FILECOIN_SEAL_SAME_ORIGIN",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
  ];
  const runtimeText = runtimePublicKeys.map((key) => `${key}=${value(env, key)}`).join("\n");
  const readBackText = readBackCommands.map((command) => command.command).join("\n");
  const runtimeLeaks = exposedSecretValues(runtimeText, env);
  const readBackLeaks = exposedSecretValues(readBackText, env);
  const browserApiKeys = ["VITE_APIFOOTBALL_KEY", "VITE_ODDS_API_KEY", "VITE_FOOTBALL_DATA_TOKEN"].filter((key) =>
    Boolean(value(env, key)),
  );
  const browserSealToken = value(env, "VITE_FILECOIN_SEAL_TOKEN");
  return [
    {
      id: "runtime-config-public-safe",
      label: "Published runtime config excludes server secrets",
      passed: runtimeLeaks.length === 0,
      detail: runtimeLeaks.length === 0 ? "runtime-config.js only needs public VITE values" : `leaks ${runtimeLeaks.join(", ")}`,
    },
    {
      id: "readback-commands-public-safe",
      label: "Read-back commands exclude secret values",
      passed: readBackLeaks.length === 0,
      detail: readBackLeaks.length === 0 ? "curl commands use public health/read-back URLs only" : `leaks ${readBackLeaks.join(", ")}`,
    },
    {
      id: "browser-api-keys-not-required",
      label: "Browser API keys are not required for enrichment",
      passed: !runtimePreflight.sameOriginData || browserApiKeys.length === 0,
      detail:
        !runtimePreflight.sameOriginData || browserApiKeys.length === 0
          ? "same-origin /data-proxy injects API-Football/Odds credentials server-side"
          : `move ${browserApiKeys.join(", ")} to Pages runtime secrets`,
    },
    {
      id: "browser-seal-token-not-required",
      label: "Browser seal token is not required",
      passed: !runtimePreflight.sameOriginSeal || !browserSealToken,
      detail:
        !runtimePreflight.sameOriginSeal || !browserSealToken
          ? "same-origin /seal injects FILECOIN_SEAL_TOKEN server-side"
          : "remove VITE_FILECOIN_SEAL_TOKEN when same-origin /seal is enabled",
    },
  ];
};

const buildProxyCapabilityChecks = (
  env: CloudflarePagesDeployEnv,
  runtimePreflight: CloudflarePagesRuntimePreflight,
  readBackCommands: CloudflarePagesReadBackCommand[],
): CloudflarePagesProxyCapabilityCheck[] => {
  const dataHealth = readBackCommandById(readBackCommands, "data-proxy-health");
  const sealHealth = readBackCommandById(readBackCommands, "seal-health");
  const dataBase = runtimePreflight.sameOriginData && runtimePreflight.functionsReady;
  const sealBase = runtimePreflight.sameOriginSeal && runtimePreflight.functionsReady;
  const apiFootballReady = dataBase && Boolean(value(env, "APIFOOTBALL_KEY") || value(env, "API_FOOTBALL_KEY"));
  const footballDataReady = dataBase && Boolean(value(env, "FOOTBALL_DATA_TOKEN") || value(env, "FOOTBALL_DATA_ORG_TOKEN"));
  const oddsReady = dataBase && Boolean(value(env, "ODDS_API_KEY") || value(env, "THE_ODDS_API_KEY"));
  const sealReady = sealBase && Boolean(value(env, "FILECOIN_SEAL_UPSTREAM_URL") && value(env, "FILECOIN_SEAL_TOKEN"));
  return [
    {
      id: "data-free-feeds",
      service: "data-proxy",
      label: "Free schedule/score feeds",
      passed: dataBase,
      detail: dataBase
        ? "same-origin proxy exposes ESPN, openfootball, TheSportsDB and worldcup26 allowlisted reads"
        : "deploy the same-origin /data-proxy Pages Function",
      readBackCommand: dataHealth,
    },
    {
      id: "data-football-data-backup",
      service: "data-proxy",
      label: "Football-Data standings backup",
      passed: footballDataReady,
      detail: footballDataReady
        ? "FOOTBALL_DATA_TOKEN is injected server-side for matches/standings read-back"
        : "set FOOTBALL_DATA_TOKEN as a Pages runtime secret for standings backup",
      readBackCommand: dataHealth,
    },
    {
      id: "data-api-football-enrichment",
      service: "data-proxy",
      label: "API-Football lineups/injuries/rankings",
      passed: apiFootballReady,
      detail: apiFootballReady ? "APIFOOTBALL_KEY is injected server-side" : "set APIFOOTBALL_KEY as a Pages runtime secret",
      readBackCommand: dataHealth,
    },
    {
      id: "data-odds-enrichment",
      service: "data-proxy",
      label: "Odds/handicap enrichment",
      passed: oddsReady,
      detail: oddsReady ? "ODDS_API_KEY is injected server-side" : "set ODDS_API_KEY as a Pages runtime secret",
      readBackCommand: dataHealth,
    },
    {
      id: "filecoin-async-upload",
      service: "filecoin-seal",
      label: "Async Filecoin upload",
      passed: sealReady,
      detail: sealReady
        ? "POST /seal?async=1 forwards to the trusted upstream with server token injection"
        : "set FILECOIN_SEAL_UPSTREAM_URL and FILECOIN_SEAL_TOKEN",
      readBackCommand: sealHealth,
    },
    {
      id: "filecoin-job-polling",
      service: "filecoin-seal",
      label: "Upload status polling",
      passed: sealReady,
      detail: sealReady
        ? "GET /jobs/:id is routed through the same-origin seal proxy"
        : "deploy /jobs/:id Pages Function and upstream seal API",
      readBackCommand: sealHealth,
    },
    {
      id: "filecoin-cid-readback",
      service: "filecoin-seal",
      label: "CID proof read-back",
      passed: sealReady,
      detail: sealReady
        ? "GET /proof/:cid and GET /verify?cid= are routed through the same-origin seal proxy"
        : "deploy /proof/:cid and /verify routes",
      readBackCommand: sealHealth,
    },
  ];
};

export const buildCloudflarePagesDeployPlan = (
  env: CloudflarePagesDeployEnv,
  options: CloudflarePagesDeployPlanOptions = {},
): CloudflarePagesDeployPlan => {
  const projectName = options.projectName || value(env, "CLOUDFLARE_PAGES_PROJECT_NAME") || "kickoff-lock-agent";
  const branch = options.branch || value(env, "CLOUDFLARE_PAGES_BRANCH") || "main";
  const outputDir = options.outputDir || "dist";
  const plannedPagesUrl = options.plannedPagesUrl || value(env, "CF_PAGES_URL") || projectUrlFor(projectName);
  const tokenAuthReady =
    options.tokenAuthReady ?? Boolean(value(env, "CLOUDFLARE_API_TOKEN") && value(env, "CLOUDFLARE_ACCOUNT_ID"));
  const wranglerLoginReady =
    options.wranglerLoginReady ??
    (truthyFlag(value(env, "CLOUDFLARE_WRANGLER_LOGIN")) ||
      value(env, "CLOUDFLARE_AUTH_MODE") === "wrangler-login");
  const tokenAuthMissing =
    options.tokenAuthMissing ??
    ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => !value(env, key));
  const functionsBundleReady = options.functionsBundleReady ?? true;
  const runtimePreflight = buildCloudflarePagesRuntimePreflight(
    buildPlannedCloudflarePagesRuntimeEnv(env, projectName, plannedPagesUrl),
    {
      functionEntries: options.functionEntries,
    },
  );
  const functionEntryProblems = runtimePreflight.functionEntryProblems;
  const runtimeSecretProblems = runtimePreflight.problems.filter((problem) => !functionEntryProblems.includes(problem));
  const runtimeMissing = runtimeSecretNames(runtimePreflight);
  const authReady = tokenAuthReady || wranglerLoginReady;
  const deployReady =
    functionsBundleReady && runtimePreflight.functionsReady && runtimeSecretProblems.length === 0 && authReady;
  const stages: CloudflarePagesDeployStage[] = [
    {
      id: "functions",
      label: "Build Cloudflare Pages Functions bundle",
      status: functionsBundleReady && runtimePreflight.functionsReady ? "done" : "blocked",
      command: "bun run pages:functions:build",
      requiredEnv: [],
      missingEnv: functionEntryProblems,
      outputEnv: [".wrangler/pages-functions.js"],
      detail:
        functionsBundleReady && runtimePreflight.functionsReady
          ? options.functionsBundleDetail || "Cloudflare Pages Functions bundle compiles and every route forwards to the shared worker."
          : options.functionsBundleDetail || "Fix the Pages Functions bundle before deploying same-origin backend routes.",
    },
    {
      id: "runtime-secrets",
      label: "Set Pages runtime secrets",
      status: runtimeSecretProblems.length === 0 ? "done" : "blocked",
      command:
        "Set Cloudflare Pages environment variables: APIFOOTBALL_KEY, ODDS_API_KEY, FILECOIN_SEAL_UPSTREAM_URL, FILECOIN_SEAL_TOKEN, ALLOW_ORIGIN",
      requiredEnv: [
        ...(runtimePreflight.sameOriginData ? ["APIFOOTBALL_KEY", "ODDS_API_KEY"] : []),
        ...(runtimePreflight.sameOriginSeal ? ["FILECOIN_SEAL_UPSTREAM_URL", "FILECOIN_SEAL_TOKEN", "ALLOW_ORIGIN"] : []),
      ],
      missingEnv: runtimeMissing.length > 0 ? runtimeMissing : runtimeSecretProblems,
      outputEnv: ["same-origin /data-proxy/health", "same-origin /seal health"],
      detail:
        runtimeSecretProblems.length === 0
          ? `Runtime secrets are ready for${runtimePreflight.sameOriginData ? " /data-proxy" : ""}${
              runtimePreflight.sameOriginSeal ? " /seal" : ""
            } Pages Functions.`
          : runtimeSecretProblems.join(" "),
    },
    {
      id: "auth",
      label: "Authenticate Cloudflare deploy",
      status: authReady ? "done" : "blocked",
      command: "bun run pages:cf:check",
      requiredEnv: ["CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID or wrangler login"],
      missingEnv: authReady ? [] : tokenAuthMissing.length > 0 ? tokenAuthMissing : ["wrangler login"],
      outputEnv: ["Cloudflare Pages deploy authorization"],
      detail: authReady
        ? tokenAuthReady
          ? "Cloudflare API token credentials are present."
          : "Wrangler OAuth login is available for this shell."
        : "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, or run bunx wrangler login and set CLOUDFLARE_WRANGLER_LOGIN=1.",
    },
    {
      id: "deploy",
      label: "Deploy app and same-origin backend routes",
      status: deployReady ? "ready" : "blocked",
      command: "bun run pages:cf:deploy",
      requiredEnv: ["Cloudflare Pages project", "dist build", "functions bundle", "deploy auth"],
      missingEnv: unique([
        ...(functionsBundleReady && runtimePreflight.functionsReady ? [] : ["Cloudflare Pages Functions bundle"]),
        ...runtimeMissing,
        ...(authReady ? [] : tokenAuthMissing.length > 0 ? tokenAuthMissing : ["wrangler login"]),
      ]),
      outputEnv: [plannedPagesUrl, "VITE_DATA_PROXY_SAME_ORIGIN=1", "VITE_FILECOIN_SEAL_SAME_ORIGIN=1"],
      detail: deployReady
        ? `Deploy ${outputDir} to ${projectName}/${branch}, then set VITE_PUBLIC_APP_URL=${plannedPagesUrl} and enable same-origin runtime flags.`
        : "Complete Functions, runtime secrets and Cloudflare auth before deploying the same-origin backend routes.",
    },
  ];
  const blockedStages = stages.filter((stage) => stage.status === "blocked").length;
  const stageReadyCount = stages.filter((stage) => stage.status === "done" || stage.status === "ready").length;
  const missingEnv = unique(stages.flatMap((stage) => stage.missingEnv));
  const commands = unique(["bun run pages:functions:build", "bun run pages:cf:check", "bun run pages:cf:deploy"]);
  const readBackCommands = readBackCommandsFor(plannedPagesUrl, deployReady, runtimePreflight);
  const secretExposureChecks = buildSecretExposureChecks(env, runtimePreflight, readBackCommands);
  const proxyCapabilityChecks = buildProxyCapabilityChecks(env, runtimePreflight, readBackCommands);
  const next = stages.find((stage) => stage.status === "blocked") ?? stages.find((stage) => stage.status === "ready");
  const nextAction = next
    ? next.status === "ready"
      ? `${next.label}: run ${next.command}.`
      : `${next.label}: ${next.detail}`
    : "Cloudflare Pages same-origin backend deployment is ready.";
  const ready = blockedStages === 0;
  const copyText = [
    "Kickoff Lock Agent Cloudflare Pages deploy plan",
    `Ready: ${ready ? "yes" : "no"}`,
    `Project: ${projectName}`,
    `Branch: ${branch}`,
    `Planned URL: ${plannedPagesUrl}`,
    `Same-origin data proxy: ${runtimePreflight.sameOriginData ? "yes" : "no"}`,
    `Same-origin Filecoin seal proxy: ${runtimePreflight.sameOriginSeal ? "yes" : "no"}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Read-back commands:",
    ...readBackCommands.map((item) => `- ${item.label}: ${item.command}`),
    "Secret exposure checks:",
    ...secretExposureChecks.map((check) => `- ${check.label}: ${check.passed ? "passed" : "failed"} · ${check.detail}`),
    "Proxy capability checks:",
    ...proxyCapabilityChecks.map((check) => `- ${check.label}: ${check.passed ? "passed" : "pending"} · ${check.detail}`),
    "Stages:",
    ...stages.map((stage) =>
      [
        `- ${stage.label} [${stage.status}]`,
        `  command: ${stage.command}`,
        `  missing: ${stage.missingEnv.join(", ") || "none"}`,
        `  detail: ${stage.detail}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready,
    projectName,
    branch,
    outputDir,
    plannedPagesUrl,
    tokenAuthReady,
    wranglerLoginReady,
    sameOriginData: runtimePreflight.sameOriginData,
    sameOriginSeal: runtimePreflight.sameOriginSeal,
    functionsReady: functionsBundleReady && runtimePreflight.functionsReady,
    runtimePreflight,
    stageReadyCount,
    totalStages: stages.length,
    blockedStages,
    missingEnv,
    stages,
    commands,
    readBackCommands,
    secretExposureChecks,
    proxyCapabilityChecks,
    nextAction,
    copyText,
  };
};
