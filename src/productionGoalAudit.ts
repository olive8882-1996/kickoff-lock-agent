import {
  summarizeAcceptanceCoverage,
  summarizeAcceptanceRunEvidence,
  type AcceptanceCoverageKey,
  type AcceptanceEvidencePacket,
} from "./acceptance";
import { productionCheckPassed, summarizeProductionEvidence, type ProductionEvidencePacket } from "./productionEvidence";
import type { ProductionEnvBlankDeclaration, ProductionEnvPlanPacket } from "./productionEnvPlan";
import type { ProductionAcceptanceCollectorPacket } from "./productionAcceptanceCollector";

export type ProductionGoalAuditStatus = "done" | "todo";

export type ProductionGoalAuditRequirement = {
  id:
    | "account"
    | "realtime-data"
    | "filecoin"
    | "share-cards"
    | "leaderboard"
    | "modes"
    | "tests"
    | "public-proof-pages"
    | "share-images"
    | "final-production";
  label: string;
  status: ProductionGoalAuditStatus;
  passed: number;
  total: number;
  checkIds: string[];
  coverage: AcceptanceCoverageKey[];
  missing: string[];
  envHints: string[];
  evidence: string;
  nextAction: string;
  command: string;
};

export type ProductionGoalAuditCommandStatus = "done" | "ready" | "blocked";

export type ProductionGoalAuditCommandQueueItem = {
  id: string;
  label: string;
  command: string;
  status: ProductionGoalAuditCommandStatus;
  envHints: string[];
  reason: string;
};

export type ProductionGoalAuditPacket = {
  ready: boolean;
  passedRequirements: number;
  totalRequirements: number;
  passedChecks: number;
  totalChecks: number;
  openCommands: number;
  blockedCommands: number;
  productionEvidenceLoaded: boolean;
  acceptanceEvidenceLoaded: boolean;
  envPlanLoaded: boolean;
  productionCollectorLoaded: boolean;
  blankEnvDeclarations: ProductionEnvBlankDeclaration[];
  commandQueue: ProductionGoalAuditCommandQueueItem[];
  requirements: ProductionGoalAuditRequirement[];
  nextAction: string;
  copyText: string;
};

export type ProductionGoalAuditInput = {
  productionEvidence?: ProductionEvidencePacket;
  acceptanceEvidence?: AcceptanceEvidencePacket;
  envPlan?: ProductionEnvPlanPacket;
  productionCollector?: ProductionAcceptanceCollectorPacket;
  now?: number;
};

type RequirementDefinition = {
  id: ProductionGoalAuditRequirement["id"];
  label: string;
  checkIds: string[];
  coverage?: AcceptanceCoverageKey[];
  envKeys?: string[];
  collectorStageIds?: string[];
  command: string;
  nextAction: string;
};

const definitions: RequirementDefinition[] = [
  {
    id: "account",
    label: "真实账号系统",
    checkIds: [
      "runtime-supabase-core",
      "runtime-supabase-redirect",
      "supabase-auth-user-target",
      "supabase-auth-profile-identity",
      "supabase-backend-health",
      "supabase-profile-target",
      "supabase-record-target",
      "supabase-mode-target",
      "public-clean-session-restore",
    ],
    coverage: ["cloud-readback"],
    envKeys: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    command: "bun run supabase:bootstrap",
    nextAction: "配置 Supabase、完成登录/云端同步，并跑 supabase:bootstrap 与 doctor:supabase。",
  },
  {
    id: "realtime-data",
    label: "真实实时比赛数据",
    checkIds: [
      "runtime-thesportsdb-free",
      "runtime-data-proxy",
      "data-proxy-health",
      "runtime-api-football-enrichment",
      "runtime-odds-enrichment",
      "public-football-feed-continuity",
      "api-football-enrichment-live",
    ],
    coverage: ["providers"],
    envKeys: [
      "VITE_DATA_PROXY_URL",
      "VITE_DATA_PROXY_SAME_ORIGIN",
      "APIFOOTBALL_KEY",
      "VITE_APIFOOTBALL_KEY",
      "ODDS_API_KEY",
      "VITE_ODDS_API_KEY",
      "VITE_ODDS_API_SPORT_KEY",
      "KICKOFF_VERIFY_FIXTURE_ID",
      "KICKOFF_VERIFY_FIXTURE_IDS",
      "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
    ],
    command: "bun run data:providers:check && bun run scout:data-targets && bun run doctor:data",
    collectorStageIds: ["data-scout"],
    nextAction: "配置 API-Football、data proxy 和可读回阵容/伤停/赔率/排名的 fixture targets，然后跑 provider preflight、target scout 与 doctor:data。",
  },
  {
    id: "filecoin",
    label: "真实 Filecoin 自动封存流程",
    checkIds: [
      "runtime-filecoin-seal-api",
      "runtime-filecoin-seal-token",
      "filecoin-seal-health",
      "filecoin-seal-contract",
      "filecoin-record-proof-readback",
      "filecoin-mode-proof-readback",
    ],
    coverage: ["filecoin-api", "seal-e2e"],
    envKeys: [
      "VITE_FILECOIN_SEAL_API",
      "VITE_FILECOIN_SEAL_SAME_ORIGIN",
      "VITE_FILECOIN_SEAL_TOKEN",
      "SYNAPSE_PRIVATE_KEY",
      "FILECOIN_SEAL_TOKEN",
      "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
      "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
      "KICKOFF_VERIFY_FILECOIN_MODE_CID",
      "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH",
      "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
      "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
    ],
    collectorStageIds: ["filecoin-seal"],
    command: "bun run filecoin:bootstrap",
    nextAction: "部署真实 seal API，封存 record/mode proof，并验证 CID 与 payload hash read-back。",
  },
  {
    id: "share-cards",
    label: "公开分享卡片",
    checkIds: [
      "runtime-share-storage-bucket",
      "supabase-share-artifact-target",
      "supabase-mode-share-artifact-target",
      "supabase-share-channel-target",
      "supabase-mode-share-channel-target",
    ],
    coverage: ["share-cards"],
    envKeys: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    command: "bun run share:upload-image && bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png && bun run sharing:bootstrap",
    nextAction: "上传 record/mode 分享图到 Supabase Storage、打开 X/native share，并同步 share artifact/channel evidence。",
  },
  {
    id: "leaderboard",
    label: "排行榜后端",
    checkIds: [
      "leaderboard-global-current-user",
      "leaderboard-friend-current-user",
      "leaderboard-season-current-user",
      "leaderboard-global-board",
      "leaderboard-friend-board",
      "leaderboard-season-board",
    ],
    coverage: ["cloud-readback"],
    envKeys: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    command: "bun run leaderboard:bootstrap",
    nextAction: "让当前用户和榜单页都能从 global/friend/season 三个 kickoff_leaderboard 查询读回。",
  },
  {
    id: "modes",
    label: "更完整的比赛模式",
    checkIds: [
      "supabase-mode-target",
      "supabase-mode-share-artifact-target",
      "filecoin-mode-proof-readback",
      "public-mode-link",
      "public-mode-share-image",
    ],
    coverage: ["modes"],
    envKeys: [
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
      "KICKOFF_VERIFY_FILECOIN_MODE_CID",
      "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH",
      "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
      "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
    ],
    command: "bun run test src/modes.test.ts src/modePlaybook.test.ts",
    nextAction: "确保 bracket、parlay、Agent vs Human、upset、group-path、penalty-pressure 六类 mode 都有云端行、公开 proof、分享图和 Filecoin read-back。",
  },
  {
    id: "tests",
    label: "自动化测试",
    checkIds: ["public-acceptance-evidence"],
    coverage: [
      "scoring",
      "proof-hash",
      "cloud-readback",
      "providers",
      "share-cards",
      "filecoin-api",
      "pages-functions",
      "modes",
      "browser-e2e",
      "seal-e2e",
    ],
    command: "bun run verify:acceptance",
    nextAction: "跑完整 acceptance suite，发布新 acceptance-evidence.json，并确保未过期。",
  },
  {
    id: "public-proof-pages",
    label: "公开 proof 页面美化",
    checkIds: [
      "runtime-public-app-url",
      "public-profile-link",
      "public-proof-link",
      "public-mode-link",
      "public-clean-session-restore",
    ],
    coverage: ["share-cards", "browser-e2e"],
    envKeys: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    command: "bun run doctor:sharing",
    nextAction: "部署公开页面，验证 profile/proof/mode 的 canonical、OG/Twitter metadata、JSON-LD 和页面内容。",
  },
  {
    id: "share-images",
    label: "分享图生成",
    checkIds: ["public-share-image", "public-mode-share-image"],
    coverage: ["share-cards"],
    command: "bun run share:upload-image && bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
    nextAction: "上传 record/mode 两张公开 PNG，写入 KICKOFF_VERIFY_SHARE_IMAGE_URL 与 KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL。",
  },
  {
    id: "final-production",
    label: "最终生产证据",
    checkIds: [
      "public-app-root",
      "public-runtime-config",
      "public-deployment-evidence",
      "public-logo-asset",
      "public-acceptance-evidence",
    ],
    coverage: ["browser-e2e", "pages-functions"],
    envKeys: [
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
      "VITE_DATA_PROXY_URL",
      "VITE_DATA_PROXY_SAME_ORIGIN",
      "VITE_FILECOIN_SEAL_API",
      "VITE_FILECOIN_SEAL_SAME_ORIGIN",
      "VITE_FILECOIN_SEAL_TOKEN",
    ],
    command: "bun run collect:production",
    collectorStageIds: ["access-preflight", "cloudflare-pages-backend", "final-verify"],
    nextAction: "收齐所有 KICKOFF_VERIFY_* 后运行 verify:production、doctor:production 和 collect:production。",
  },
];

const formatBlankEnvDeclaration = (item: ProductionEnvBlankDeclaration) =>
  `${item.key}${item.fileName ? ` (${item.fileName})` : ""}`;

const checkMap = (packet?: ProductionEvidencePacket) =>
  new Map((packet?.checks ?? []).map((check) => [check.id, check]));

const semanticProblemsFor = (
  definition: RequirementDefinition,
  checks: ReturnType<typeof checkMap>,
  productionComplete: boolean,
) =>
  [
    definition.id === "final-production" && !productionComplete ? "Strict production evidence complete" : "",
  ].filter(Boolean);

const coveragePassed = (
  key: AcceptanceCoverageKey,
  coverage: ReturnType<typeof summarizeAcceptanceCoverage>,
  runs: ReturnType<typeof summarizeAcceptanceRunEvidence>,
) => {
  if (coverage.missing.includes(key)) return false;
  return runs.complete || runs.passedSuiteIds.some((suiteId) => {
    if (key === "browser-e2e") return suiteId === "browser-flow";
    if (key === "seal-e2e") return suiteId === "seal-flow";
    if (key === "modes") return suiteId === "game-modes";
    if (key === "filecoin-api") return suiteId === "filecoin-api";
    if (key === "pages-functions") return suiteId === "pages-functions";
    if (key === "share-cards") return suiteId === "share-cards";
    if (key === "providers") return suiteId === "live-data";
    if (key === "cloud-readback") return suiteId === "cloud-account";
    if (key === "scoring" || key === "proof-hash") return suiteId === "scoring-proof";
    return false;
  });
};

const collectorHintsFor = (
  stageIds: string[] | undefined,
  collector: ProductionAcceptanceCollectorPacket | undefined,
) => {
  if (!stageIds?.length || !collector) return [];
  const stageIdSet = new Set(stageIds);
  return [
    ...new Set(
      collector.stages
        .filter((stage) => stageIdSet.has(stage.id) && stage.status === "blocked")
        .flatMap((stage) => stage.missingEnv)
        .filter(
          (hint) =>
            hint.startsWith("Cloudflare Pages ") ||
            hint.startsWith("access preflight ") ||
            /^[A-Z0-9_]+$/.test(hint) ||
            /^KICKOFF_VERIFY_[A-Z0-9_]+ missing$/.test(hint),
        ),
    ),
  ];
};

const collectorHasCloudflareBackend = (collector: ProductionAcceptanceCollectorPacket | undefined) =>
  Boolean(collector?.stages.some((stage) => stage.id === "cloudflare-pages-backend"));

const directRuntimeHintIsReplacedByCloudflare = (
  definitionId: RequirementDefinition["id"],
  hint: string,
  collector: ProductionAcceptanceCollectorPacket | undefined,
) => {
  if (!collectorHasCloudflareBackend(collector)) return false;
  if ((definitionId === "realtime-data" || definitionId === "final-production") && hint.startsWith("VITE_DATA_PROXY_URL ")) {
    return true;
  }
  if (
    (definitionId === "filecoin" || definitionId === "final-production") &&
    (hint.startsWith("VITE_FILECOIN_SEAL_API ") || hint.startsWith("VITE_FILECOIN_SEAL_TOKEN "))
  ) {
    return true;
  }
  return false;
};

export const buildProductionGoalAudit = ({
  productionEvidence,
  acceptanceEvidence,
  envPlan,
  productionCollector,
  now,
}: ProductionGoalAuditInput): ProductionGoalAuditPacket => {
  const checks = checkMap(productionEvidence);
  const productionSummary = summarizeProductionEvidence(productionEvidence);
  const acceptanceCoverage = summarizeAcceptanceCoverage();
  const acceptanceRuns = summarizeAcceptanceRunEvidence(acceptanceEvidence, undefined, { now });
  const blankEnvDeclarations = envPlan?.blankDeclarations ?? [];
  const blankEnvByKey = new Map(blankEnvDeclarations.map((item) => [item.key, item]));

  const requirements = definitions.map<ProductionGoalAuditRequirement>((definition) => {
    const productionChecks = definition.checkIds.map((id) => checks.get(id));
    const missingProduction = definition.checkIds.filter((id) => checks.get(id)?.status !== "passed");
    const outputProblems = semanticProblemsFor(definition, checks, productionSummary.complete);
    const coverage = definition.coverage ?? [];
    const missingCoverage = coverage.filter((key) => !coveragePassed(key, acceptanceCoverage, acceptanceRuns));
    const passed =
      definition.checkIds.length - missingProduction.length - outputProblems.length + (coverage.length - missingCoverage.length);
    const total = definition.checkIds.length + coverage.length;
    const missing = [
      ...missingProduction.map((id) => checks.get(id)?.label ?? id),
      ...outputProblems,
      ...missingCoverage.map((key) => `acceptance:${key}`),
    ];
    const envHints = (definition.envKeys ?? [])
      .map((key) => blankEnvByKey.get(key))
      .filter((item): item is ProductionEnvBlankDeclaration => Boolean(item))
      .map(formatBlankEnvDeclaration)
      .filter((hint) => !directRuntimeHintIsReplacedByCloudflare(definition.id, hint, productionCollector));
    const collectorHints = collectorHintsFor(definition.collectorStageIds, productionCollector);
    const combinedEnvHints = [...new Set([...envHints, ...collectorHints])];
    const firstFailed = productionChecks.find((check) => check && !productionCheckPassed(check));
    const status: ProductionGoalAuditStatus = total > 0 && passed === total ? "done" : "todo";
    const visibleEnvHints = status === "done" ? [] : combinedEnvHints;
    return {
      id: definition.id,
      label: definition.label,
      status,
      passed,
      total,
      checkIds: definition.checkIds,
      coverage,
      missing,
      envHints: visibleEnvHints,
      evidence:
        status === "done"
          ? `${passed}/${total} checks passed.`
          : firstFailed
            ? `${passed}/${total} checks passed · next failed check: ${firstFailed.label} (${firstFailed.detail})`
            : `${passed}/${total} checks passed · missing ${missing[0] ?? "evidence"}`,
      nextAction: firstFailed?.action ?? definition.nextAction,
      command: definition.command,
    };
  });

  const passedRequirements = requirements.filter((item) => item.status === "done").length;
  const passedChecks = requirements.reduce((sum, item) => sum + item.passed, 0);
  const totalChecks = requirements.reduce((sum, item) => sum + item.total, 0);
  const commandQueue = requirements.map<ProductionGoalAuditCommandQueueItem>((item) => {
    const status: ProductionGoalAuditCommandStatus =
      item.status === "done" ? "done" : item.envHints.length > 0 ? "blocked" : "ready";
    return {
      id: item.id,
      label: item.label,
      command: item.command,
      status,
      envHints: item.envHints,
      reason:
        status === "done"
          ? "Requirement already has complete evidence."
          : item.envHints.length > 0
            ? `Fill ${item.envHints.join(", ")} before running this command.`
            : item.nextAction,
    };
  });
  const openCommands = commandQueue.filter((item) => item.status !== "done").length;
  const blockedCommands = commandQueue.filter((item) => item.status === "blocked").length;
  const next = requirements.find((item) => item.status !== "done");
  const ready =
    requirements.length > 0 &&
    passedRequirements === requirements.length &&
    productionSummary.complete &&
    acceptanceRuns.complete;
  const nextAction = next
    ? `${next.label}: ${next.nextAction} Command: ${next.command}.`
    : "All goal requirements are verified.";
  const blankEnvSummary = blankEnvDeclarations.map(formatBlankEnvDeclaration).join(", ");
  const copyText = [
    "Kickoff Lock Agent production goal audit",
    `Ready: ${ready ? "yes" : "no"}`,
    `Requirements: ${passedRequirements}/${requirements.length}`,
    `Checks: ${passedChecks}/${totalChecks}`,
    `Command queue: ${openCommands} open, ${blockedCommands} blocked`,
    `Production evidence: ${productionSummary.requiredPassed}/${productionSummary.requiredTotal || 0}`,
    `Acceptance evidence: ${acceptanceRuns.passed}/${acceptanceRuns.total}`,
    `Blank env declarations: ${blankEnvSummary || "none"}`,
    `Next action: ${nextAction}`,
    "Command queue:",
    ...commandQueue.map((item) =>
      [
        `- ${item.label} [${item.status}]`,
        `  command: ${item.command}`,
        `  env hints: ${item.envHints.join(", ") || "none"}`,
        `  reason: ${item.reason}`,
      ].join("\n"),
    ),
    "Requirements:",
    ...requirements.map((item) =>
      [
        `- ${item.label} [${item.status}] ${item.passed}/${item.total}`,
        `  command: ${item.command}`,
        `  missing: ${item.missing.join(", ") || "none"}`,
        `  env hints: ${item.envHints.join(", ") || "none"}`,
        `  evidence: ${item.evidence}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready,
    passedRequirements,
    totalRequirements: requirements.length,
    passedChecks,
    totalChecks,
    openCommands,
    blockedCommands,
    productionEvidenceLoaded: Boolean(productionEvidence),
    acceptanceEvidenceLoaded: Boolean(acceptanceEvidence),
    envPlanLoaded: Boolean(envPlan),
    productionCollectorLoaded: Boolean(productionCollector),
    blankEnvDeclarations,
    commandQueue,
    requirements,
    nextAction,
    copyText,
  };
};
