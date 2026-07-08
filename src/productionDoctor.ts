import {
  summarizeProductionEvidence,
  type ProductionEvidenceCategory,
  type ProductionEvidencePacket,
} from "./productionEvidence";
import { buildRuntimeConfigReadiness, summarizeRuntimeConfigReadiness, type RuntimeConfigEnv } from "./runtimeConfig";

export type ProductionDoctorStatus = "done" | "todo" | "pending";

export type ProductionDoctorItem = {
  id: string;
  label: string;
  status: ProductionDoctorStatus;
  detail: string;
  action: string;
  checkIds: string[];
  envKeys: string[];
};

export type ProductionDoctorReport = {
  ready: boolean;
  headline: string;
  runtime: {
    passed: number;
    total: number;
    missingEnvKeys: string[];
  };
  evidence: {
    loaded: boolean;
    passed: number;
    total: number;
    generatedAt?: string;
  };
  items: ProductionDoctorItem[];
  nextActions: ProductionDoctorItem[];
};

const runtimeEnvKeys: Record<string, string[]> = {
  "supabase-core": ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
  "supabase-redirect": ["VITE_SUPABASE_REDIRECT_URL"],
  "api-football-enrichment": ["APIFOOTBALL_KEY", "VITE_APIFOOTBALL_KEY", "VITE_DATA_PROXY_URL", "VITE_DATA_PROXY_SAME_ORIGIN"],
  "odds-enrichment": [
    "APIFOOTBALL_KEY",
    "VITE_APIFOOTBALL_KEY",
    "VITE_DATA_PROXY_URL",
    "VITE_DATA_PROXY_SAME_ORIGIN",
    "ODDS_API_KEY",
    "VITE_ODDS_API_KEY",
    "VITE_ODDS_API_SPORT_KEY",
  ],
  "filecoin-seal-api": ["VITE_FILECOIN_SEAL_API", "VITE_FILECOIN_SEAL_SAME_ORIGIN"],
  "filecoin-seal-token": ["VITE_FILECOIN_SEAL_TOKEN", "FILECOIN_SEAL_TOKEN"],
  "public-app-url": ["VITE_PUBLIC_APP_URL"],
  "share-storage-bucket": ["VITE_SUPABASE_SHARE_BUCKET"],
  "thesportsdb-free": ["VITE_THESPORTSDB_KEY", "VITE_THESPORTSDB_LEAGUE_ID", "VITE_THESPORTSDB_SEASON"],
  "data-proxy": ["VITE_DATA_PROXY_URL", "VITE_DATA_PROXY_SAME_ORIGIN"],
};

const evidenceEnvKeys: Record<string, string[]> = {
  "supabase-auth-user-target": ["KICKOFF_VERIFY_USER_ID", "SUPABASE_SERVICE_ROLE_KEY"],
  "supabase-auth-profile-identity": ["KICKOFF_VERIFY_USER_ID", "KICKOFF_VERIFY_PROFILE_ID", "SUPABASE_SERVICE_ROLE_KEY"],
  "leaderboard-global-current-user": ["KICKOFF_VERIFY_USER_ID"],
  "leaderboard-friend-current-user": ["KICKOFF_VERIFY_USER_ID", "KICKOFF_VERIFY_FRIEND_CODE"],
  "leaderboard-season-current-user": ["KICKOFF_VERIFY_USER_ID", "KICKOFF_VERIFY_SEASON_KEY"],
  "leaderboard-global-board": ["KICKOFF_VERIFY_USER_ID"],
  "leaderboard-friend-board": ["KICKOFF_VERIFY_FRIEND_CODE"],
  "leaderboard-season-board": ["KICKOFF_VERIFY_SEASON_KEY"],
  "supabase-profile-target": ["KICKOFF_VERIFY_PROFILE_ID"],
  "supabase-record-target": ["KICKOFF_VERIFY_PROOF_ID"],
  "supabase-mode-target": ["KICKOFF_VERIFY_MODE_IDS"],
  "supabase-share-artifact-target": ["KICKOFF_VERIFY_PROOF_ID", "KICKOFF_VERIFY_SHARE_IMAGE_URL"],
  "supabase-mode-share-artifact-target": ["KICKOFF_VERIFY_MODE_IDS", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
  "supabase-share-channel-target": ["KICKOFF_VERIFY_PROOF_ID"],
  "supabase-mode-share-channel-target": ["KICKOFF_VERIFY_MODE_IDS"],
  "api-football-enrichment-live": [
    "APIFOOTBALL_KEY",
    "VITE_APIFOOTBALL_KEY",
    "VITE_DATA_PROXY_URL",
    "VITE_DATA_PROXY_SAME_ORIGIN",
    "KICKOFF_VERIFY_FIXTURE_IDS",
  ],
  "football-data-readback": [
    "FOOTBALL_DATA_TOKEN",
    "FOOTBALL_DATA_ORG_TOKEN",
    "VITE_FOOTBALL_DATA_TOKEN",
    "VITE_DATA_PROXY_URL",
    "VITE_DATA_PROXY_SAME_ORIGIN",
  ],
  "filecoin-record-proof-readback": ["KICKOFF_VERIFY_FILECOIN_RECORD_CID", "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH"],
  "filecoin-mode-proof-readback": ["KICKOFF_VERIFY_FILECOIN_MODE_CIDS", "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES"],
  "public-profile-link": ["KICKOFF_VERIFY_PROFILE_ID"],
  "public-proof-link": ["KICKOFF_VERIFY_PROOF_ID"],
  "public-mode-link": ["KICKOFF_VERIFY_MODE_IDS"],
  "public-clean-session-restore": ["KICKOFF_VERIFY_PROFILE_ID", "KICKOFF_VERIFY_PROOF_ID", "KICKOFF_VERIFY_MODE_IDS"],
  "public-share-image": ["KICKOFF_VERIFY_SHARE_IMAGE_URL"],
  "public-mode-share-image": ["KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
};

const categoryOrder: ProductionEvidenceCategory[] = ["runtime", "public-app", "supabase", "data", "filecoin", "sharing"];

const groups: Array<{
  id: string;
  label: string;
  checkIds: string[];
  defaultAction: string;
}> = [
  {
    id: "account-cloud",
    label: "真实账号与云端历史",
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
    defaultAction: "配置 Supabase、应用 supabase.schema.sql，用真实登录账号同步 profile、prediction 和 mode proof，并用 Auth admin read-back 证明账号本体。",
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
      "football-data-readback",
      "api-football-enrichment-live",
    ],
    defaultAction:
      "配置 APIFOOTBALL_KEY 到 data proxy、或用 VITE_APIFOOTBALL_KEY 直连诊断、或配置 Odds API，然后选择有阵容、伤停、赔率和排名返回的 fixture 作为生产验收目标。",
  },
  {
    id: "filecoin-auto-seal",
    label: "真实 Filecoin 自动封存",
    checkIds: [
      "runtime-filecoin-seal-api",
      "runtime-filecoin-seal-token",
      "filecoin-seal-health",
      "filecoin-seal-contract",
      "filecoin-record-proof-readback",
      "filecoin-mode-proof-readback",
    ],
    defaultAction: "部署非 mock Synapse seal API，封存一条 prediction capsule 和全部五个 required mode proofs，再写入 CID/hash 验收变量。",
  },
  {
    id: "public-sharing",
    label: "公开分享卡片与 proof 页",
    checkIds: [
      "runtime-public-app-url",
      "runtime-share-storage-bucket",
      "supabase-share-artifact-target",
      "supabase-mode-share-artifact-target",
      "supabase-share-channel-target",
      "supabase-mode-share-channel-target",
      "public-profile-link",
      "public-proof-link",
      "public-mode-link",
      "public-clean-session-restore",
      "public-share-image",
      "public-mode-share-image",
    ],
    defaultAction: "生成并上传公开 PNG 分享图，确保 profile/proof/mode 页面通过 deployed HTTPS URL 渲染和读回。",
  },
  {
    id: "leaderboards",
    label: "排行榜后端",
    checkIds: [
      "leaderboard-global-current-user",
      "leaderboard-friend-current-user",
      "leaderboard-season-current-user",
      "leaderboard-global-board",
      "leaderboard-friend-board",
      "leaderboard-season-board",
    ],
    defaultAction: "让当前用户和榜单页都出现在 Supabase global/friend/season 三个 leaderboard scope 查询结果中。",
  },
  {
    id: "public-deployment",
    label: "公开部署资产",
    checkIds: ["public-app-root", "public-runtime-config", "public-deployment-evidence", "public-logo-asset"],
    defaultAction: "部署最新 dist 到 VITE_PUBLIC_APP_URL，并确认 runtime-config、logo 与应用入口可公开访问。",
  },
  {
    id: "automation-evidence",
    label: "自动化测试证据",
    checkIds: ["public-acceptance-evidence"],
    defaultAction: "运行 bun run verify:acceptance、bun run build、bun run verify:production，并发布新的 evidence JSON。",
  },
];

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const evidenceCheckMap = (packet?: ProductionEvidencePacket) =>
  new Map((packet?.checks ?? []).map((check) => [check.id, check]));

const checkSortScore = (category?: ProductionEvidenceCategory) => {
  const index = category ? categoryOrder.indexOf(category) : -1;
  return index === -1 ? categoryOrder.length : index;
};

export const buildProductionDoctorReport = (
  env: RuntimeConfigEnv,
  packet?: ProductionEvidencePacket,
): ProductionDoctorReport => {
  const runtimeItems = buildRuntimeConfigReadiness(env);
  const runtimeSummary = summarizeRuntimeConfigReadiness(runtimeItems);
  const evidenceSummary = summarizeProductionEvidence(packet);
  const checks = evidenceCheckMap(packet);
  const runtimeEvidenceChecks = (packet?.checks ?? []).filter((check) => check.required && check.category === "runtime");
  const runtimeEvidencePassed = runtimeEvidenceChecks.filter((check) => check.status === "passed").length;
  const runtimePassed = runtimeEvidenceChecks.length > 0 ? runtimeEvidencePassed : runtimeSummary.requiredPassed;
  const runtimeTotal = runtimeEvidenceChecks.length > 0 ? runtimeEvidenceChecks.length : runtimeSummary.requiredTotal;
  const runtimeReady = runtimeEvidenceChecks.length > 0 ? runtimeEvidencePassed === runtimeEvidenceChecks.length : runtimeSummary.ready;
  const missingRuntimeEnv = unique(
    runtimeEvidenceChecks.length > 0
      ? runtimeEvidenceChecks
          .filter((check) => check.status !== "passed")
          .flatMap((check) => runtimeEnvKeys[check.id.replace(/^runtime-/, "")] ?? [])
      : runtimeItems
          .filter((item) => item.required && !item.passed)
          .flatMap((item) => runtimeEnvKeys[item.key] ?? []),
  );

  const items = groups.map<ProductionDoctorItem>((group) => {
    const groupChecks = group.checkIds.map((id) => checks.get(id)).filter(Boolean);
    const missingChecks = group.checkIds.filter((id) => checks.get(id)?.status !== "passed");
    const passed = group.checkIds.length - missingChecks.length;
    const firstFailed = groupChecks
      .filter((check) => check?.status !== "passed")
      .sort((a, b) => checkSortScore(a?.category) - checkSortScore(b?.category))[0];
    const envKeys = unique(missingChecks.flatMap((id) => evidenceEnvKeys[id] ?? []));
    const status: ProductionDoctorStatus = !packet ? "pending" : missingChecks.length === 0 ? "done" : "todo";
    return {
      id: group.id,
      label: group.label,
      status,
      detail: packet
        ? `${passed}/${group.checkIds.length} checks passed${
            firstFailed ? ` · next: ${firstFailed.label} (${firstFailed.detail})` : ""
          }`
        : "production-evidence.json not loaded",
      action: firstFailed?.action ?? group.defaultAction,
      checkIds: group.checkIds,
      envKeys,
    };
  });

  const ready = runtimeReady && evidenceSummary.complete;
  const nextActions = items.filter((item) => item.status !== "done");
  return {
    ready,
    headline: ready
      ? "Production acceptance is externally verified."
      : `${runtimePassed}/${runtimeTotal} runtime gates and ${evidenceSummary.requiredPassed}/${evidenceSummary.requiredTotal || 0} required production checks are verified.`,
    runtime: {
      passed: runtimePassed,
      total: runtimeTotal,
      missingEnvKeys: missingRuntimeEnv,
    },
    evidence: {
      loaded: evidenceSummary.loaded,
      passed: evidenceSummary.requiredPassed,
      total: evidenceSummary.requiredTotal,
      generatedAt: evidenceSummary.generatedAt,
    },
    items,
    nextActions,
  };
};
