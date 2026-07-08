import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Cloud,
  Database,
  Download,
  FileCheck2,
  Flame,
  Gauge,
  HelpCircle,
  ImageDown,
  Link2,
  LockKeyhole,
  Medal,
  Radar,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  TerminalSquare,
  Timer,
  Trophy,
  UploadCloud,
  UserCircle2,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  buildBracketPathFromMatches,
  createBracketModeRun,
  createEmptyBracketPath,
  isBracketPathReady,
} from "./bracket";
import { buildBrandAssetPacket, type BrandAssetPacket } from "./brandAssets";
import {
  ACCEPTANCE_TEST_SUITES,
  summarizeAcceptanceRunEvidence,
  type AcceptanceEvidencePacket,
} from "./acceptance";
import { buildAccountHandoffPacket, type AccountHandoffPacket } from "./accountHandoff";
import {
  buildAccountCloudSyncEvidenceArtifact,
  type AccountCloudSyncEvidenceArtifact,
} from "./accountCloudSyncEvidence";
import {
  buildAccountRecoveryEvidencePacket,
  type AccountRecoveryEvidencePacket,
} from "./accountRecoveryEvidence";
import {
  buildAgentCalibrationEvidencePacket,
  type AgentCalibrationEvidencePacket,
} from "./agentCalibrationEvidence";
import {
  buildPublicProfile,
  buildCloudSyncAudit,
  buildLocalLeaderboard,
  buildLeaderboardReadiness,
  buildLeaderboardScopeEvidence,
  buildCloudRecoverySnapshot,
  cloudRecoveryMessage,
  consumeSupabaseAuthCallback,
  buildCloudSyncCoverage,
  buildCloudSyncOutbox,
  friendCodeFor,
  getCloudState,
  hasSupabaseAuthCallback,
  hydrateProfileFromAuth,
  isCloudReadbackComplete,
  loadLeaderboard,
  loadProfile,
  loadModeRunsFromCloud,
  loadPublicModeRun,
  loadPublicProfile,
  loadPublicRecord,
  loadPublicShareArtifact,
  loadProfileFromCloud,
  loadRecordsFromCloud,
  loadShareArtifactsFromCloud,
  saveProfile,
  sendMagicLink,
  shareArtifactCloudId,
  normalizeFriendCode,
  resolveCloudProfileForSync,
  shouldAutoRecoverCloudSession,
  signOutCloud,
  startGoogleSignIn,
  syncCloudOutboxToCloud,
  syncProfileToCloud,
  uploadShareImageToCloud,
  verifyCloudSyncReadback,
} from "./cloud";
import {
  buildFilecoinSealResumeQueue,
  filecoinSealConfigured,
  lookupFilecoinProof,
  runModeSealJob,
  runSealJob,
  sealBackendProductionReady,
} from "./filecoinSeal";
import {
  buildFilecoinAutomationEvidencePacket,
  buildFilecoinAutomationSealQueue,
  type FilecoinAutomationEvidencePacket,
  type FilecoinAutomationQueueItem,
} from "./filecoinAutomationEvidence";
import {
  buildFilecoinSealLifecyclePacket,
  type FilecoinSealLifecyclePacket,
} from "./filecoinSealLifecycleEvidence";
import {
  buildFreeDataSourceEvidencePacket,
  type FreeDataSourceEvidencePacket,
} from "./freeDataSourceEvidence";
import {
  buildProductionAccountBootstrapPacket,
  type ProductionAccountBootstrapPacket,
} from "./productionAccountBootstrap";
import { buildSealEvidencePacket, type SealEvidencePacket } from "./filecoinSealEvidence";
import {
  buildLeaderboardEvidencePacket,
  hasLeaderboardScopeEvidence,
  leaderboardScopeStatsProblem,
  type LeaderboardEvidencePacket,
} from "./leaderboardEvidence";
import {
  buildLeaderboardQueryContractPacket,
  type LeaderboardQueryContractPacket,
} from "./leaderboardQueryContract";
import {
  buildLeaderboardSeasonEvidencePacket,
  type LeaderboardSeasonEvidencePacket,
} from "./leaderboardSeasonEvidence";
import type { LeaderboardProductionArtifact } from "./leaderboardProductionBootstrap";
import type { DataProviderReadinessArtifact } from "./dataProviderReadiness";
import type { DataTargetScoutArtifact } from "./dataTargetScout";
import {
  buildIntelligenceEnrichmentEvidencePacket,
  type IntelligenceEnrichmentEvidencePacket,
} from "./intelligenceEnrichmentEvidence";
import {
  buildDataContinuityEvidencePacket,
  type DataContinuityEvidencePacket,
} from "./dataContinuityEvidence";
import type { DataProductionBootstrapPlan } from "./dataProductionBootstrap";
import type { FilecoinProductionBootstrapPlan } from "./filecoinProductionBootstrap";
import type { FilecoinTargetSealArtifact } from "./filecoinTargetSeal";
import type { CloudflarePagesDeployPlan } from "./cloudflarePagesDeployment";
import type { SupabaseSchemaApplyArtifact } from "./supabaseSchemaApply";
import type { ProductionTargetSeedArtifact } from "./productionTargetSeed";
import type { ShareImageUploadArtifact } from "./shareImageUpload";
import type { PublicRestoreEvidenceArtifact } from "./sharingProductionDoctor";
import { buildModeEvidencePacket, type ModeEvidencePacket } from "./modeEvidence";
import { buildModePlaybookPacket, type ModePlaybookPacket } from "./modePlaybook";
import { buildModeSettlementPacket, type ModeSettlementPacket } from "./modeSettlement";
import { createGameModeRun, getModeReadiness } from "./modes";
import { buildMatchDataEvidencePacket, type MatchDataEvidencePacket } from "./matchDataEvidence";
import {
  buildMatchIntelligenceProvenancePacket,
  type MatchIntelligenceProvenancePacket,
} from "./matchIntelligenceProvenance";
import { applyRealProof, applyVerifiedProof, createCapsule, stableJson } from "./proof";
import {
  applyPublicProofMeta,
  buildModeProofMeta,
  buildProfileMeta,
  buildRecordProofMeta,
  type PublicProofMeta,
} from "./publicProofMeta";
import {
  buildModeVerifierPacket,
  buildProfileVerifierPacket,
  buildRecordVerifierPacket,
  type VerifierPacket,
} from "./publicProofPacket";
import {
  buildProfileArchiveEvidencePacket,
  type ProfileArchiveEvidencePacket,
} from "./profileArchiveEvidence";
import {
  buildModePublicProofScorecard,
  buildRecordPublicProofScorecard,
  type PublicProofScorecard,
} from "./publicProofScorecard";
import {
  buildModePublicProofJudgeSummary,
  buildRecordPublicProofJudgeSummary,
  type PublicProofJudgeSummary,
} from "./publicProofJudgeSummary";
import {
  buildModePublicProofShareKit,
  buildPublicProofPublicationLedger,
  buildRecordPublicProofShareKit,
  type PublicProofPublicationLedger,
  type PublicProofShareKit,
} from "./publicProofShareKit";
import type { PublicDeploymentEvidencePacket } from "./publicDeploymentEvidence";
import {
  fixturePublicModeRun,
  fixturePublicProfile,
  fixturePublicRecord,
  fixturePublicShareArtifact,
  loadProductionPublicFixtures,
} from "./publicFixtures";
import { buildModeProofTimeline, buildRecordProofTimeline, type ProofTimelineItem } from "./proofTimeline";
import { buildPublicUrl } from "./publicUrls";
import {
  buildDataCoverage,
  buildMatchIntelligenceScore,
  buildProviderHealthSnapshot,
  buildProviderReadiness,
  buildRealtimeDataAudit,
  enrichMatchWithDataProviders,
  loadMatchesWithFallback,
  sourceLabel,
} from "./providers";
import {
  parseEnvText,
  summarizeProductionEvidence,
  type ProductionEvidencePacket,
} from "./productionEvidence";
import { buildProductionVerifyEnvFromArtifacts } from "./productionVerifyTargets";
import { buildProductionDoctorReport, type ProductionDoctorReport } from "./productionDoctor";
import {
  buildProductionAcceptanceCollector,
  type ProductionAcceptanceCollectorPacket,
} from "./productionAcceptanceCollector";
import type { ProductionAccessPreflightPacket } from "./productionAccessPreflight";
import {
  productionBootstrapStepProgress,
  productionBootstrapStepDetail,
  summarizeProductionBootstrapRunbook,
  type ProductionBootstrapRunbook,
} from "./productionBootstrapRunbook";
import { buildProductionEnvLedger, type ProductionEnvLedgerPacket } from "./productionEnvLedger";
import type { ProductionEnvPlanPacket } from "./productionEnvPlan";
import { buildProductionGoalAudit, type ProductionGoalAuditPacket } from "./productionGoalAudit";
import { buildProductionLaunchPacket, type ProductionLaunchPacket } from "./productionLaunchPacket";
import { buildProfileAutosyncStatus, canAutoSyncCloudWrites } from "./profileAutosync";
import { buildRealtimeDataEvidencePacket, type RealtimeDataEvidencePacket } from "./realtimeDataEvidence";
import { buildProductionReadiness, summarizeProductionReadiness } from "./readiness";
import type { SupabaseProductionBootstrapPlan } from "./supabaseProductionBootstrap";
import {
  buildRuntimeConfigReadiness,
  mergeRuntimeConfigEnv,
  runtimeConfigValue,
  summarizeRuntimeConfigReadiness,
  type RuntimeConfigItem,
  type RuntimeConfigSummary,
} from "./runtimeConfig";
import { scorePrediction } from "./scoring";
import {
  buildProofShareText,
  buildModeProofShareText,
  buildModeXIntentUrl,
  buildShareArtifactEvidence,
  buildXIntentUrl,
  canNativeShareFiles,
  dataUrlToFile,
  downloadDataUrl,
  generateModeShareCard,
  generateShareCard,
  isPublishableShareArtifact,
  isProductionShareArtifact,
} from "./shareCard";
import {
  buildOpenedShareChannelArtifacts,
  buildShareChannelEvidencePacket,
  buildShareChannelQueue,
  buildSharePublishQueue,
  hasShareChannelEvidence,
  isProductionShareCardEvidence,
  type ShareChannelEvidencePacket,
} from "./sharePublishing";
import type { ShareChannelEvidenceArtifact } from "./sharingProductionBootstrap";
import { initialAppViewFromLocation } from "./viewRouting";
import type {
  AppView,
  BracketPath,
  CloudSyncOutboxItem,
  CloudSyncState,
  FilecoinLookupState,
  FilecoinProof,
  GameMode,
  GameModeRun,
  LeaderboardEntry,
  LeaderboardReadinessItem,
  LeaderboardScope,
  LeaderboardScopeEvidence,
  Match,
  MemoryRecord,
  PredictionDraft,
  ProviderEnrichmentAudit,
  ProviderHealthSnapshot,
  ProviderReadinessItem,
  ProviderResponseAudit,
  ProviderRouteAuditItem,
  PublicProfile,
  RealtimeDataAudit,
  SealJob,
  ShareArtifactEvidence,
} from "./types";

const STORAGE_KEY = "kickoff-lock-agent-records-v1";
const MODE_RUNS_KEY = "kickoff-lock-agent-mode-runs-v1";
const BRACKET_PATH_KEY = "kickoff-lock-agent-bracket-path-v1";
const SHARE_EVIDENCE_KEY = "kickoff-lock-agent-share-evidence-v1";
const ACCEPTANCE_EVIDENCE_URL = `${import.meta.env.BASE_URL}acceptance-evidence.json`;
const PRODUCTION_EVIDENCE_URL = `${import.meta.env.BASE_URL}production-evidence.json`;
const PUBLIC_DEPLOYMENT_EVIDENCE_URL = `${import.meta.env.BASE_URL}public-deployment-evidence.json`;
const PRODUCTION_BOOTSTRAP_RUNBOOK_URL = `${import.meta.env.BASE_URL}production-bootstrap-runbook.json`;
const PRODUCTION_ACCESS_PREFLIGHT_URL = `${import.meta.env.BASE_URL}production-access-preflight.json`;
const PRODUCTION_ENV_PLAN_URL = `${import.meta.env.BASE_URL}production-env-plan.json`;
const SUPABASE_BOOTSTRAP_PLAN_URL = `${import.meta.env.BASE_URL}supabase-bootstrap-plan.json`;
const SUPABASE_SCHEMA_APPLY_URL = `${import.meta.env.BASE_URL}supabase-schema-apply.json`;
const SUPABASE_TARGET_SEED_URL = `${import.meta.env.BASE_URL}supabase-target-seed.json`;
const ACCOUNT_CLOUD_SYNC_EVIDENCE_URL = `${import.meta.env.BASE_URL}account-cloud-sync-evidence.json`;
const DATA_BOOTSTRAP_PLAN_URL = `${import.meta.env.BASE_URL}data-bootstrap-plan.json`;
const DATA_PROVIDER_READINESS_URL = `${import.meta.env.BASE_URL}data-provider-readiness.json`;
const DATA_TARGET_SCOUT_URL = `${import.meta.env.BASE_URL}data-target-scout.json`;
const FILECOIN_BOOTSTRAP_PLAN_URL = `${import.meta.env.BASE_URL}filecoin-bootstrap-plan.json`;
const FILECOIN_TARGET_SEAL_URL = `${import.meta.env.BASE_URL}filecoin-target-seal.json`;
const CLOUDFLARE_PAGES_DEPLOY_PLAN_URL = `${import.meta.env.BASE_URL}cloudflare-pages-deploy-plan.json`;
const LEADERBOARD_BACKEND_URL = `${import.meta.env.BASE_URL}leaderboard-backend.json`;
const PUBLIC_RESTORE_EVIDENCE_URL = `${import.meta.env.BASE_URL}public-restore-evidence.json`;
const SHARE_CHANNEL_EVIDENCE_URL = `${import.meta.env.BASE_URL}share-channel-evidence.json`;
const SHARE_IMAGE_UPLOAD_RECORD_URL = `${import.meta.env.BASE_URL}share-image-upload-record.json`;
const SHARE_IMAGE_UPLOAD_MODE_URL = `${import.meta.env.BASE_URL}share-image-upload-mode.json`;
const leaderboardScopes: LeaderboardScope[] = ["global", "friend", "season"];
const emptyLeaderboardCache = (): Record<LeaderboardScope, LeaderboardEntry[]> => ({
  global: [],
  friend: [],
  season: [],
});

const emptyLeaderboardEvidence = (profile: ReturnType<typeof loadProfile>): Record<LeaderboardScope, LeaderboardScopeEvidence> => ({
  global: buildLeaderboardScopeEvidence("global", profile, [], { status: "unchecked", rows: 0, checkedAt: undefined, sampleIds: [] }),
  friend: buildLeaderboardScopeEvidence("friend", profile, [], { status: "unchecked", rows: 0, checkedAt: undefined, sampleIds: [] }),
  season: buildLeaderboardScopeEvidence("season", profile, [], { status: "unchecked", rows: 0, checkedAt: undefined, sampleIds: [] }),
});

const queryParams = () => new URLSearchParams(window.location.search);
const e2eMode = () => queryParams().has("e2e");

const gameModes: GameMode[] = [
  {
    id: "bracket",
    title: "Bracket path",
    status: "playable",
    description: "Pick quarterfinal, semifinal and final paths as a sealed tournament tree.",
    progress: 62,
    reward: "Pathfinder badge",
  },
  {
    id: "parlay",
    title: "Multi-match parlay",
    status: "playable",
    description: "Bundle three locks into one higher-risk proof capsule.",
    progress: 48,
    reward: "Accumulator XP",
  },
  {
    id: "agent-vs-human",
    title: "Agent vs Human",
    status: "playable",
    description: "Lock your instinct against the agent model and compare calibration after reveal.",
    progress: 74,
    reward: "Calibration score",
  },
  {
    id: "upset",
    title: "Upset challenge",
    status: "playable",
    description: "Hunt one underdog call per matchday with a public leaderboard multiplier.",
    progress: 72,
    reward: "Underdog multiplier",
  },
  {
    id: "group-path",
    title: "Group path",
    status: "playable",
    description: "Turn sealed group-stage locks into a projected qualification table.",
    progress: 66,
    reward: "Table oracle badge",
  },
  {
    id: "penalty-pressure",
    title: "Penalty pressure",
    status: "playable",
    description: "Seal clutch taker, market or winner calls for knockout pressure moments.",
    progress: 58,
    reward: "Ice-vein badge",
  },
];

const assetUrl = (fileName: string) => `${import.meta.env.BASE_URL}assets/${fileName}`;

const imageLayer = (fileName: string, overlay: string) => ({
  backgroundImage: `${overlay}, url("${assetUrl(fileName)}")`,
});

const defaultDraft: PredictionDraft = {
  homeScore: 2,
  awayScore: 1,
  winner: "Home",
  keyPlayers: ["No. 10"],
  confidence: 68,
  style: "analysis",
  reasoning:
    "The home side should control territory early, but the away side has enough transition threat to keep the match close.",
  agentSummary:
    "Agent sees a narrow match: tempo control matters more than raw possession, and the first goal changes the risk profile.",
  markets: [
    {
      id: "winner",
      label: "1X2",
      pick: "Home",
      confidence: 68,
      rationale: "Baseline result market follows the projected scoreline.",
    },
    {
      id: "total-goals",
      label: "Total goals",
      pick: "Over 2.5",
      confidence: 56,
      rationale: "Knockout pressure still leaves room for late transitions.",
    },
    {
      id: "both-score",
      label: "Both teams score",
      pick: "Yes",
      confidence: 61,
      rationale: "The away side has enough counter threat to find one chance.",
    },
    {
      id: "first-goal",
      label: "First goal signal",
      pick: "No. 10",
      confidence: 52,
      rationale: "Creative central player is the most likely swing factor.",
    },
  ],
};

const loadRecords = (): MemoryRecord[] => {
  try {
    const params = queryParams();
    if (params.get("reset") === "1") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(MODE_RUNS_KEY);
      localStorage.removeItem(BRACKET_PATH_KEY);
      localStorage.removeItem(SHARE_EVIDENCE_KEY);
      params.delete("reset");
      const nextQuery = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
      return [];
    }
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as MemoryRecord[];
  } catch {
    return [];
  }
};

const saveRecords = (records: MemoryRecord[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

const loadModeRuns = (): GameModeRun[] => {
  try {
    return JSON.parse(localStorage.getItem(MODE_RUNS_KEY) ?? "[]") as GameModeRun[];
  } catch {
    return [];
  }
};

const saveModeRuns = (runs: GameModeRun[]) => {
  localStorage.setItem(MODE_RUNS_KEY, JSON.stringify(runs));
};

const loadBracketPath = (): BracketPath => {
  try {
    return JSON.parse(localStorage.getItem(BRACKET_PATH_KEY) ?? "null") ?? createEmptyBracketPath();
  } catch {
    return createEmptyBracketPath();
  }
};

const saveBracketPath = (path: BracketPath) => {
  localStorage.setItem(BRACKET_PATH_KEY, JSON.stringify(path));
};

const loadShareEvidence = (): ShareArtifactEvidence[] => {
  try {
    return JSON.parse(localStorage.getItem(SHARE_EVIDENCE_KEY) ?? "[]") as ShareArtifactEvidence[];
  } catch {
    return [];
  }
};

const saveShareEvidence = (evidence: ShareArtifactEvidence[]) => {
  localStorage.setItem(SHARE_EVIDENCE_KEY, JSON.stringify(evidence));
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const AUTO_DATA_REFRESH_MS = 90_000;

const matchLabel = (match: Match) => `${match.homeTeam} vs ${match.awayTeam}`;

const configuredPublicAppUrl = () => runtimeConfigValue(import.meta.env, "VITE_PUBLIC_APP_URL");

const fallbackPublicAppUrl = () =>
  typeof window === "undefined" ? import.meta.env.BASE_URL : window.location.origin + import.meta.env.BASE_URL;

const runtimeEnvTextValues = () =>
  Object.fromEntries(
    Object.entries(mergeRuntimeConfigEnv(import.meta.env)).map(([key, value]) => [
      key,
      typeof value === "boolean" ? (value ? "1" : "") : value?.trim() || undefined,
    ]),
  ) as Record<string, string | undefined>;

const proofUrl = (capsuleId: string) => {
  return buildPublicUrl("proof", capsuleId, configuredPublicAppUrl(), window.location.href);
};

const profileUrl = (profileId: string) => {
  return buildPublicUrl("profile", profileId, configuredPublicAppUrl(), window.location.href);
};

const modeRunUrl = (runId: string) => {
  return buildPublicUrl("mode", runId, configuredPublicAppUrl(), window.location.href);
};

const friendInviteUrl = (friendCode: string) => {
  const url = new URL(configuredPublicAppUrl() || window.location.href, window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("friend", friendCode);
  return url.toString();
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
};

const deriveWinner = (home: number, away: number, match: Match) => {
  if (home === away) return "Draw";
  return home > away ? match.homeTeam : match.awayTeam;
};

const buildAgentDraft = (match: Match, prompt: string, previous: PredictionDraft): PredictionDraft => {
  const seed = `${match.homeTeam}${match.awayTeam}${prompt}`.split("").reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const homeScore = seed % 4;
  const awayScore = Math.floor(seed / 7) % 4;
  const confidence = 48 + (seed % 42);
  const winner = deriveWinner(homeScore, awayScore, match);
  const style: PredictionDraft["style"] =
    confidence > 76 ? "bold-call" : prompt.toLowerCase().includes("feel") ? "fan-instinct" : "analysis";
  const keyPlayers =
    prompt
      .split(/[,.;\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 2 && item.length < 32)
      .slice(0, 2) || previous.keyPlayers;
  const safeKeyPlayers = keyPlayers.length > 0 ? keyPlayers : [`${match.homeTeam} creator`];
  const totalPick = homeScore + awayScore >= 3 ? "Over 2.5" : "Under 2.5";
  const bothScorePick = homeScore > 0 && awayScore > 0 ? "Yes" : "No";
  const winnerPick = winner === match.homeTeam ? match.homeTeam : winner === match.awayTeam ? match.awayTeam : "Draw";
  return {
    homeScore,
    awayScore,
    winner,
    keyPlayers: safeKeyPlayers,
    confidence,
    style,
    reasoning:
      prompt.trim().length > 0
        ? `${prompt.trim()} Agent converts that into a ${homeScore}-${awayScore} lock because ${match.homeTeam} can shape the first phase while ${match.awayTeam} still carries counter-pressure.`
        : `Agent projects ${match.homeTeam} vs ${match.awayTeam} as a tactical pressure test. The locked call favors ${winner} with a ${homeScore}-${awayScore} scoreline and a confidence level of ${confidence}%.`,
    agentSummary: `Prediction agent sealed a ${winner} call at ${confidence}% confidence, with ${safeKeyPlayers.join(
      " and ",
    )} marked as the swing factor.`,
    markets: [
      {
        id: "winner",
        label: "1X2",
        pick: winnerPick,
        confidence,
        rationale: `Result market follows the ${homeScore}-${awayScore} model and current matchup pressure.`,
      },
      {
        id: "total-goals",
        label: "Total goals",
        pick: totalPick,
        confidence: Math.max(45, confidence - 12),
        rationale: `${match.insights?.marketLine ?? "Fallback market line"} supports a totals check before sealing.`,
      },
      {
        id: "both-score",
        label: "Both teams score",
        pick: bothScorePick,
        confidence: Math.max(42, confidence - 7),
        rationale: `${match.awayTeam} transition profile drives the both-score call.`,
      },
      {
        id: "first-goal",
        label: "First goal signal",
        pick: safeKeyPlayers[0],
        confidence: Math.max(38, confidence - 18),
        rationale: "First-goal market is tied to the named swing player/signal.",
      },
    ],
  };
};

const statusText = (match: Match, record?: MemoryRecord) => {
  if (record?.result) return "revealed";
  if (record?.capsule.locked) return "locked";
  return match.status;
};

const getLockState = (match: Match, locked: boolean, now: number) => {
  if (locked) return { state: "locked", label: "Locked", secondsLeft: 0 };
  const kickoffTime = new Date(match.kickoffAt).getTime();
  const secondsLeft = Math.max(0, Math.floor((kickoffTime - now) / 1000));
  if (!Number.isFinite(kickoffTime) || secondsLeft <= 0 || match.status !== "upcoming") {
    return { state: "closed", label: "Closed after kickoff", secondsLeft: 0 };
  }
  if (secondsLeft <= 15 * 60) return { state: "closing", label: "Final lock window", secondsLeft };
  return { state: "open", label: "Open before kickoff", secondsLeft };
};

const formatCountdown = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m`;
};

const stabilizeE2eMatches = (matches: Match[]) => {
  if (!e2eMode()) return matches;
  const base = Date.now() + 90 * 60 * 1000;
  let upcomingIndex = 0;
  return matches.map((match) => {
    upcomingIndex += 1;
    if (upcomingIndex > 8 && match.status !== "upcoming") return match;
    return {
      ...match,
      status: "upcoming" as const,
      homeScore: upcomingIndex <= 8 ? undefined : match.homeScore,
      awayScore: upcomingIndex <= 8 ? undefined : match.awayScore,
      kickoffAt: new Date(base + upcomingIndex * 45 * 60 * 1000).toISOString(),
    };
  });
};

function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [providerWarning, setProviderWarning] = useState("");
  const [providerSource, setProviderSource] = useState("loading");
  const [providerEvidence, setProviderEvidence] = useState<string[]>([]);
  const [providerRouteAudit, setProviderRouteAudit] = useState<ProviderRouteAuditItem[]>([]);
  const [providerResponseAudit, setProviderResponseAudit] = useState<ProviderResponseAudit | undefined>();
  const [providerEnrichmentAudit, setProviderEnrichmentAudit] = useState<ProviderEnrichmentAudit | undefined>();
  const [realtimeDataAudit, setRealtimeDataAudit] = useState<RealtimeDataAudit | undefined>();
  const [dataRefreshStatus, setDataRefreshStatus] = useState<"idle" | "refreshing" | "error">("idle");
  const [lastDataSyncAt, setLastDataSyncAt] = useState("");
  const [nextDataSyncAt, setNextDataSyncAt] = useState("");
  const [forceFallback, setForceFallback] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [matchFilter, setMatchFilter] = useState<"all" | "live" | "today" | "upcoming">("all");
  const [view, setView] = useState<AppView>(initialAppViewFromLocation);
  const [utilityPanel, setUtilityPanel] = useState<"settings" | "help" | null>(null);
  const [records, setRecords] = useState<MemoryRecord[]>(loadRecords);
  const [modeRuns, setModeRuns] = useState<GameModeRun[]>(loadModeRuns);
  const [bracketPath, setBracketPath] = useState<BracketPath>(loadBracketPath);
  const [profile, setProfile] = useState(loadProfile);
  const [cloudState, setCloudState] = useState<CloudSyncState>(getCloudState);
  const [leaderboardCache, setLeaderboardCache] = useState<Record<LeaderboardScope, LeaderboardEntry[]>>(emptyLeaderboardCache);
  const [leaderboardEvidence, setLeaderboardEvidence] = useState<Record<LeaderboardScope, LeaderboardScopeEvidence>>(
    () => emptyLeaderboardEvidence(loadProfile()),
  );
  const [leaderboardScope, setLeaderboardScope] = useState<LeaderboardScope>("global");
  const [accountEmail, setAccountEmail] = useState(loadProfile().email);
  const [draft, setDraft] = useState<PredictionDraft>(defaultDraft);
  const [now, setNow] = useState(Date.now());
  const [prompt, setPrompt] = useState("I expect a tense knockout match with one late goal.");
  const [actualHome, setActualHome] = useState(1);
  const [actualAway, setActualAway] = useState(0);
  const [actualKeyPlayers, setActualKeyPlayers] = useState("");
  const [proofJson, setProofJson] = useState("");
  const [shareImageUrl, setShareImageUrl] = useState("");
  const [publicShareImageUrl, setPublicShareImageUrl] = useState("");
  const [publicModeShareImageUrl, setPublicModeShareImageUrl] = useState("");
  const [shareEvidence, setShareEvidence] = useState<ShareArtifactEvidence[]>(loadShareEvidence);
  const [publicRecord, setPublicRecord] = useState<MemoryRecord | undefined>();
  const [publicProofStatus, setPublicProofStatus] = useState("");
  const [publicModeRun, setPublicModeRun] = useState<GameModeRun | undefined>();
  const [publicModeStatus, setPublicModeStatus] = useState("");
  const [publicShareArtifact, setPublicShareArtifact] = useState<ShareArtifactEvidence | undefined>();
  const [publicModeShareArtifact, setPublicModeShareArtifact] = useState<ShareArtifactEvidence | undefined>();
  const [cidLookupInput, setCidLookupInput] = useState("");
  const [cidLookupState, setCidLookupState] = useState<FilecoinLookupState>({
    status: "idle",
    message: "Enter a CID to query the configured Filecoin seal API.",
  });
  const [publicProfile, setPublicProfile] = useState<PublicProfile | undefined>();
  const [publicProfileStatus, setPublicProfileStatus] = useState("");
  const [acceptanceEvidence, setAcceptanceEvidence] = useState<AcceptanceEvidencePacket | undefined>();
  const [acceptanceEvidenceStatus, setAcceptanceEvidenceStatus] = useState("Acceptance run evidence not loaded.");
  const [productionEvidence, setProductionEvidence] = useState<ProductionEvidencePacket | undefined>();
  const [productionEvidenceStatus, setProductionEvidenceStatus] = useState("Production evidence not loaded.");
  const [publicDeploymentEvidence, setPublicDeploymentEvidence] = useState<PublicDeploymentEvidencePacket | undefined>();
  const [publicDeploymentEvidenceStatus, setPublicDeploymentEvidenceStatus] = useState("Public deployment evidence not loaded.");
  const [productionBootstrapRunbook, setProductionBootstrapRunbook] = useState<ProductionBootstrapRunbook | undefined>();
  const [productionBootstrapRunbookStatus, setProductionBootstrapRunbookStatus] = useState("Production bootstrap runbook not loaded.");
  const [productionAccessPreflight, setProductionAccessPreflight] = useState<
    (ProductionAccessPreflightPacket & { artifactVersion?: number; generatedAt?: string; source?: string }) | undefined
  >();
  const [productionAccessPreflightStatus, setProductionAccessPreflightStatus] = useState("Production access preflight not loaded.");
  const [productionEnvPlan, setProductionEnvPlan] = useState<ProductionEnvPlanPacket | undefined>();
  const [productionEnvPlanStatus, setProductionEnvPlanStatus] = useState("Production env plan not loaded.");
  const [supabaseBootstrapPlan, setSupabaseBootstrapPlan] = useState<SupabaseProductionBootstrapPlan | undefined>();
  const [supabaseBootstrapPlanStatus, setSupabaseBootstrapPlanStatus] = useState("Supabase bootstrap plan not loaded.");
  const [supabaseSchemaArtifact, setSupabaseSchemaArtifact] = useState<SupabaseSchemaApplyArtifact | undefined>();
  const [supabaseTargetSeedArtifact, setSupabaseTargetSeedArtifact] = useState<ProductionTargetSeedArtifact | undefined>();
  const [accountCloudSyncArtifact, setAccountCloudSyncArtifact] = useState<AccountCloudSyncEvidenceArtifact | undefined>();
  const [dataBootstrapPlan, setDataBootstrapPlan] = useState<DataProductionBootstrapPlan | undefined>();
  const [dataBootstrapPlanStatus, setDataBootstrapPlanStatus] = useState("Realtime data bootstrap plan not loaded.");
  const [dataProviderArtifact, setDataProviderArtifact] = useState<DataProviderReadinessArtifact | undefined>();
  const [dataScoutArtifact, setDataScoutArtifact] = useState<DataTargetScoutArtifact | undefined>();
  const [filecoinBootstrapPlan, setFilecoinBootstrapPlan] = useState<FilecoinProductionBootstrapPlan | undefined>();
  const [filecoinBootstrapPlanStatus, setFilecoinBootstrapPlanStatus] = useState("Filecoin bootstrap plan not loaded.");
  const [filecoinSealArtifact, setFilecoinSealArtifact] = useState<FilecoinTargetSealArtifact | undefined>();
  const [cloudflarePagesDeployPlan, setCloudflarePagesDeployPlan] = useState<CloudflarePagesDeployPlan | undefined>();
  const [leaderboardBackendArtifact, setLeaderboardBackendArtifact] = useState<LeaderboardProductionArtifact | undefined>();
  const [leaderboardBackendStatus, setLeaderboardBackendStatus] = useState("Leaderboard backend artifact not loaded.");
  const [publicRestoreArtifact, setPublicRestoreArtifact] = useState<PublicRestoreEvidenceArtifact | undefined>();
  const [shareChannelArtifact, setShareChannelArtifact] = useState<ShareChannelEvidenceArtifact | undefined>();
  const [shareChannelArtifactStatus, setShareChannelArtifactStatus] = useState("Share-channel artifact not loaded.");
  const [recordShareImageUploadArtifact, setRecordShareImageUploadArtifact] = useState<ShareImageUploadArtifact | undefined>();
  const [modeShareImageUploadArtifact, setModeShareImageUploadArtifact] = useState<ShareImageUploadArtifact | undefined>();
  const [notice, setNotice] = useState("");
  const autoResumeSealJobsRef = useRef(false);
  const cloudOutboxSyncTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    return () => {
      if (cloudOutboxSyncTimerRef.current !== undefined) window.clearTimeout(cloudOutboxSyncTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (autoResumeSealJobsRef.current || !filecoinSealConfigured()) return;
    if (buildFilecoinSealResumeQueue(records, modeRuns).length === 0) return;
    autoResumeSealJobsRef.current = true;
    void resumePendingFilecoinSealJobs();
  }, [records, modeRuns]);

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    saveModeRuns(modeRuns);
  }, [modeRuns]);

  useEffect(() => {
    saveBracketPath(bracketPath);
  }, [bracketPath]);

  useEffect(() => {
    saveShareEvidence(shareEvidence);
  }, [shareEvidence]);

  useEffect(() => {
    void fetch(ACCEPTANCE_EVIDENCE_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setAcceptanceEvidenceStatus("Run bun run verify:acceptance before final submission to publish acceptance-evidence.json.");
          return undefined;
        }
        return (await response.json()) as AcceptanceEvidencePacket;
      })
      .then((packet) => {
        if (!packet) return;
        setAcceptanceEvidence(packet);
        setAcceptanceEvidenceStatus(`Loaded ${packet.suites.length} suite run result${packet.suites.length === 1 ? "" : "s"} from ${packet.source}.`);
      })
      .catch(() => {
        setAcceptanceEvidenceStatus("Acceptance run evidence could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(PRODUCTION_EVIDENCE_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setProductionEvidenceStatus("Run bun run verify:production before final deployment to publish production-evidence.json.");
          return undefined;
        }
        return (await response.json()) as ProductionEvidencePacket;
      })
      .then((packet) => {
        if (!packet) return;
        setProductionEvidence(packet);
        setProductionEvidenceStatus(`Loaded ${packet.checks.length} production check${packet.checks.length === 1 ? "" : "s"} from ${packet.source}.`);
      })
      .catch(() => {
        setProductionEvidenceStatus("Production evidence could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(PUBLIC_DEPLOYMENT_EVIDENCE_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setPublicDeploymentEvidenceStatus("Run bun run deploy:evidence after deploy:pages to publish public-deployment-evidence.json.");
          return undefined;
        }
        return (await response.json()) as PublicDeploymentEvidencePacket;
      })
      .then((packet) => {
        if (!packet) return;
        setPublicDeploymentEvidence(packet);
        setPublicDeploymentEvidenceStatus(
          `Loaded public deployment evidence: ${packet.checks.filter((check) => check.passed).length}/${packet.checks.length} deployment checks passed.`,
        );
      })
      .catch(() => {
        setPublicDeploymentEvidenceStatus("Public deployment evidence could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(PRODUCTION_BOOTSTRAP_RUNBOOK_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setProductionBootstrapRunbookStatus("Run bun run production:bootstrap -- --json to publish production-bootstrap-runbook.json.");
          return undefined;
        }
        return (await response.json()) as ProductionBootstrapRunbook;
      })
      .then((packet) => {
        if (!packet) return;
        setProductionBootstrapRunbook(packet);
        setProductionBootstrapRunbookStatus(
          `Loaded production bootstrap runbook with ${packet.passedSteps}/${packet.totalSteps} step${packet.totalSteps === 1 ? "" : "s"} passed.`,
        );
      })
      .catch(() => {
        setProductionBootstrapRunbookStatus("Production bootstrap runbook could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(PRODUCTION_ACCESS_PREFLIGHT_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setProductionAccessPreflightStatus("Run bun run access:preflight to publish production-access-preflight.json.");
          return undefined;
        }
        return (await response.json()) as ProductionAccessPreflightPacket & {
          artifactVersion?: number;
          generatedAt?: string;
          source?: string;
        };
      })
      .then((packet) => {
        if (!packet) return;
        setProductionAccessPreflight(packet);
        setProductionAccessPreflightStatus(
          `Loaded production access preflight with ${packet.stageReadyCount}/${packet.totalStages} stage${packet.totalStages === 1 ? "" : "s"} ready.`,
        );
      })
      .catch(() => {
        setProductionAccessPreflightStatus("Production access preflight could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(PRODUCTION_ENV_PLAN_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setProductionEnvPlanStatus("Run bun run env:production:plan to publish production-env-plan.json.");
          return undefined;
        }
        return (await response.json()) as ProductionEnvPlanPacket;
      })
      .then((packet) => {
        if (!packet) return;
        setProductionEnvPlan(packet);
        setProductionEnvPlanStatus(
          `Loaded production env plan with ${packet.missingRequired.length} missing and ${packet.invalidRequired.length} invalid required value${packet.invalidRequired.length === 1 ? "" : "s"}.`,
        );
      })
      .catch(() => {
        setProductionEnvPlanStatus("Production env plan could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(SUPABASE_BOOTSTRAP_PLAN_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setSupabaseBootstrapPlanStatus("Run bun run supabase:bootstrap to publish supabase-bootstrap-plan.json.");
          return undefined;
        }
        return (await response.json()) as SupabaseProductionBootstrapPlan;
      })
      .then((packet) => {
        if (!packet) return;
        setSupabaseBootstrapPlan(packet);
        setSupabaseBootstrapPlanStatus(
          `Loaded Supabase bootstrap plan with ${packet.stageReadyCount}/${packet.totalStages} stage${packet.totalStages === 1 ? "" : "s"} ready or done.`,
        );
      })
      .catch(() => {
        setSupabaseBootstrapPlanStatus("Supabase bootstrap plan could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(DATA_BOOTSTRAP_PLAN_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setDataBootstrapPlanStatus("Run bun run data:bootstrap to publish data-bootstrap-plan.json.");
          return undefined;
        }
        return (await response.json()) as DataProductionBootstrapPlan;
      })
      .then((packet) => {
        if (!packet) return;
        setDataBootstrapPlan(packet);
        setDataBootstrapPlanStatus(
          `Loaded realtime data bootstrap plan with ${packet.stageReadyCount}/${packet.totalStages} stage${packet.totalStages === 1 ? "" : "s"} ready or done.`,
        );
      })
      .catch(() => {
        setDataBootstrapPlanStatus("Realtime data bootstrap plan could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(FILECOIN_BOOTSTRAP_PLAN_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setFilecoinBootstrapPlanStatus("Run bun run filecoin:bootstrap to publish filecoin-bootstrap-plan.json.");
          return undefined;
        }
        return (await response.json()) as FilecoinProductionBootstrapPlan;
      })
      .then((packet) => {
        if (!packet) return;
        setFilecoinBootstrapPlan(packet);
        setFilecoinBootstrapPlanStatus(
          `Loaded Filecoin bootstrap plan with ${packet.stageReadyCount}/${packet.totalStages} stage${packet.totalStages === 1 ? "" : "s"} ready or done.`,
        );
      })
      .catch(() => {
        setFilecoinBootstrapPlanStatus("Filecoin bootstrap plan could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(LEADERBOARD_BACKEND_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setLeaderboardBackendStatus("Run bun run leaderboard:bootstrap to publish leaderboard-backend.json.");
          return undefined;
        }
        return (await response.json()) as LeaderboardProductionArtifact;
      })
      .then((artifact) => {
        if (!artifact) return;
        setLeaderboardBackendArtifact(artifact);
        setLeaderboardBackendStatus(
          `Loaded leaderboard backend artifact with ${artifact.acceptance.passedScopeCount}/${artifact.acceptance.requiredScopeCount} scoped current-user read-back checks passed.`,
        );
      })
      .catch(() => {
        setLeaderboardBackendStatus("Leaderboard backend artifact could not be loaded.");
      });
  }, []);

  useEffect(() => {
    void fetch(SHARE_CHANNEL_EVIDENCE_URL, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setShareChannelArtifactStatus("Run bun run sharing:bootstrap to publish share-channel-evidence.json.");
          return undefined;
        }
        return (await response.json()) as ShareChannelEvidenceArtifact;
      })
      .then((artifact) => {
        if (!artifact) return;
        setShareChannelArtifact(artifact);
        setShareChannelArtifactStatus(
          `Loaded share-channel artifact with ${artifact.acceptance.passedTargetCount}/${artifact.acceptance.requiredTargetCount} production share targets opened.`,
        );
      })
      .catch(() => {
        setShareChannelArtifactStatus("Share-channel artifact could not be loaded.");
      });
  }, []);

  useEffect(() => {
    const loadOptionalArtifact = async <T,>(url: string): Promise<T | undefined> => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return undefined;
        return (await response.json()) as T;
      } catch {
        return undefined;
      }
    };

    void Promise.all([
      loadOptionalArtifact<SupabaseSchemaApplyArtifact>(SUPABASE_SCHEMA_APPLY_URL),
      loadOptionalArtifact<ProductionTargetSeedArtifact>(SUPABASE_TARGET_SEED_URL),
      loadOptionalArtifact<AccountCloudSyncEvidenceArtifact>(ACCOUNT_CLOUD_SYNC_EVIDENCE_URL),
      loadOptionalArtifact<DataProviderReadinessArtifact>(DATA_PROVIDER_READINESS_URL),
      loadOptionalArtifact<DataTargetScoutArtifact>(DATA_TARGET_SCOUT_URL),
      loadOptionalArtifact<FilecoinTargetSealArtifact>(FILECOIN_TARGET_SEAL_URL),
      loadOptionalArtifact<CloudflarePagesDeployPlan>(CLOUDFLARE_PAGES_DEPLOY_PLAN_URL),
      loadOptionalArtifact<PublicRestoreEvidenceArtifact>(PUBLIC_RESTORE_EVIDENCE_URL),
      loadOptionalArtifact<ShareImageUploadArtifact>(SHARE_IMAGE_UPLOAD_RECORD_URL),
      loadOptionalArtifact<ShareImageUploadArtifact>(SHARE_IMAGE_UPLOAD_MODE_URL),
    ]).then(
      ([
        nextSupabaseSchemaArtifact,
        nextSupabaseTargetSeedArtifact,
        nextAccountCloudSyncArtifact,
        nextDataProviderArtifact,
        nextDataScoutArtifact,
        nextFilecoinSealArtifact,
        nextCloudflarePagesDeployPlan,
        nextPublicRestoreArtifact,
        nextRecordShareImageUploadArtifact,
        nextModeShareImageUploadArtifact,
      ]) => {
        setSupabaseSchemaArtifact(nextSupabaseSchemaArtifact);
        setSupabaseTargetSeedArtifact(nextSupabaseTargetSeedArtifact);
        setAccountCloudSyncArtifact(nextAccountCloudSyncArtifact);
        setDataProviderArtifact(nextDataProviderArtifact);
        setDataScoutArtifact(nextDataScoutArtifact);
        setFilecoinSealArtifact(nextFilecoinSealArtifact);
        setCloudflarePagesDeployPlan(nextCloudflarePagesDeployPlan);
        setPublicRestoreArtifact(nextPublicRestoreArtifact);
        setRecordShareImageUploadArtifact(nextRecordShareImageUploadArtifact);
        setModeShareImageUploadArtifact(nextModeShareImageUploadArtifact);
      },
    );
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (forceFallback) {
      setNextDataSyncAt("");
      return undefined;
    }
    setNextDataSyncAt(new Date(Date.now() + AUTO_DATA_REFRESH_MS).toISOString());
    const timer = window.setInterval(() => {
      void refreshMatches(false);
    }, AUTO_DATA_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [forceFallback]);

  const refreshMatches = async (forced = forceFallback) => {
    setDataRefreshStatus("refreshing");
    if (providerSource === "loading") setProviderSource("loading");
    try {
      const result = await loadMatchesWithFallback(forced);
      const sorted = stabilizeE2eMatches(result.matches)
        .filter((match) => match.kickoffAt)
        .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
      const syncedAt = new Date().toISOString();
      setMatches(sorted);
      setProviderSource(sourceLabel(result.source));
      setProviderWarning(result.warning ?? "");
      setProviderEvidence(result.evidence ?? [`${sourceLabel(result.source)} feed loaded`, `${sorted.length} matches available`]);
      setProviderRouteAudit(result.routeAudit ?? []);
      setProviderResponseAudit(result.responseAudit);
      setProviderEnrichmentAudit(result.enrichmentAudit);
      setRealtimeDataAudit(
        buildRealtimeDataAudit({
          source: result.source,
          matches: sorted,
          routeAudit: result.routeAudit ?? [],
          evidence: result.evidence ?? [],
          responseAudit: result.responseAudit,
          enrichmentAudit: result.enrichmentAudit,
          warning: result.warning,
          checkedAt: syncedAt,
        }),
      );
      setSelectedMatchId((current) => current || sorted.find((match) => match.status === "upcoming")?.id || sorted[0]?.id || "");
      setBracketPath((current) => buildBracketPathFromMatches(sorted, current));
      setLastDataSyncAt(syncedAt);
      setNextDataSyncAt(forced ? "" : new Date(Date.now() + AUTO_DATA_REFRESH_MS).toISOString());
      setDataRefreshStatus("idle");
    } catch (error) {
      setDataRefreshStatus("error");
      setProviderWarning((error as Error).message);
    }
  };

  const refreshLeaderboard = async (scope = leaderboardScope, nextProfile = profile) => {
    setLeaderboardEvidence((current) => ({
      ...current,
      [scope]: buildLeaderboardScopeEvidence(scope, nextProfile, [], {
        status: "loading",
        rows: current[scope]?.rows ?? 0,
        checkedAt: new Date().toISOString(),
        sampleIds: current[scope]?.sampleIds ?? [],
      }),
    }));
    try {
      const remoteLeaderboard = await loadLeaderboard(scope, nextProfile);
      setLeaderboardCache((current) => ({ ...current, [scope]: remoteLeaderboard }));
      setLeaderboardEvidence((current) => ({
        ...current,
        [scope]: buildLeaderboardScopeEvidence(scope, nextProfile, remoteLeaderboard),
      }));
    } catch (error) {
      setLeaderboardEvidence((current) => ({
        ...current,
        [scope]: buildLeaderboardScopeEvidence(scope, nextProfile, [], {
          status: "error",
          rows: 0,
          checkedAt: new Date().toISOString(),
          sampleIds: [],
          error: (error as Error).message,
        }),
      }));
      setNotice((error as Error).message);
    }
  };

  const refreshAllLeaderboards = async (nextProfile = profile) => {
    setLeaderboardEvidence((current) =>
      Object.fromEntries(
        leaderboardScopes.map((scope) => [
          scope,
          buildLeaderboardScopeEvidence(scope, nextProfile, [], {
            status: "loading",
            rows: current[scope]?.rows ?? 0,
            checkedAt: new Date().toISOString(),
            sampleIds: current[scope]?.sampleIds ?? [],
          }),
        ]),
      ) as Record<LeaderboardScope, LeaderboardScopeEvidence>,
    );
    try {
      const results = await Promise.all(
        leaderboardScopes.map(async (scope) => [scope, await loadLeaderboard(scope, nextProfile)] as const),
      );
      setLeaderboardCache(Object.fromEntries(results) as Record<LeaderboardScope, LeaderboardEntry[]>);
      setLeaderboardEvidence(
        Object.fromEntries(
          results.map(([scope, rows]) => [scope, buildLeaderboardScopeEvidence(scope, nextProfile, rows)]),
        ) as Record<LeaderboardScope, LeaderboardScopeEvidence>,
      );
    } catch (error) {
      setLeaderboardEvidence(
        Object.fromEntries(
          leaderboardScopes.map((scope) => [
            scope,
            buildLeaderboardScopeEvidence(scope, nextProfile, [], {
              status: "error",
              rows: 0,
              checkedAt: new Date().toISOString(),
              sampleIds: [],
              error: (error as Error).message,
            }),
          ]),
        ) as Record<LeaderboardScope, LeaderboardScopeEvidence>,
      );
      setNotice((error as Error).message);
    }
  };

  const finishCloudSyncWithReadback = async (
    nextProfile: typeof profile,
    nextRecords: MemoryRecord[],
    nextModeRuns: GameModeRun[],
    prefix: string,
    nextShareEvidence = shareEvidence,
  ) => {
    await refreshAllLeaderboards(nextProfile);
    const verification = await verifyCloudSyncReadback(nextProfile, nextRecords, nextModeRuns, nextShareEvidence);
    const readbackPassed = isCloudReadbackComplete(
      verification,
      nextRecords.length,
      nextModeRuns.length,
      nextShareEvidence.length,
      {
        recordIds: nextRecords.map((record) => record.capsule.id),
        modeRunIds: nextModeRuns.map((run) => run.id),
        shareArtifactIds: nextShareEvidence.map(shareArtifactCloudId),
      },
    );
    setCloudState({
      ...getCloudState(),
      status: readbackPassed ? "synced" : "error",
      message: `${prefix} ${verification.message}`,
      lastSyncedAt: verification.checkedAt,
      verification,
    });
    setNotice(`${prefix} ${verification.message}`);
    return verification;
  };

  const prepareCloudProfileForSync = async (nextProfile: typeof profile) => {
    const cloudProfile = await resolveCloudProfileForSync(nextProfile);
    if (
      cloudProfile.id !== profile.id ||
      cloudProfile.email !== profile.email ||
      cloudProfile.avatarUrl !== profile.avatarUrl ||
      cloudProfile.cloudMode !== profile.cloudMode
    ) {
      setProfile(cloudProfile);
      setAccountEmail(cloudProfile.email);
    }
    return cloudProfile;
  };

  const fetchPublicProof = async (capsuleId: string) => {
    setPublicProofStatus("Loading public proof from cloud...");
    setPublicShareArtifact(undefined);
    try {
      const [cloudRecord, cloudArtifact] = await Promise.all([
        loadPublicRecord(capsuleId, true),
        loadPublicShareArtifact(capsuleId, "record", true).catch(() => undefined),
      ]);
      const fixtures = cloudRecord ? undefined : await loadProductionPublicFixtures(import.meta.env.BASE_URL).catch(() => undefined);
      const record = cloudRecord ?? fixturePublicRecord(fixtures, capsuleId);
      const artifact = cloudArtifact ?? fixturePublicShareArtifact(fixtures, capsuleId, "record");
      setPublicRecord(record);
      setPublicShareArtifact(artifact);
      setPublicProofStatus(
        cloudRecord
          ? artifact
            ? "Cloud proof and share manifest loaded."
            : "Cloud proof loaded. No share manifest has been synced yet."
          : record
            ? artifact
              ? "Public fixture proof and share manifest loaded."
              : "Public fixture proof loaded. No share manifest has been generated yet."
          : "No cloud proof found for this link.",
      );
    } catch (error) {
      setPublicProofStatus((error as Error).message);
    }
  };

  const fetchPublicProfile = async (profileId: string) => {
    setPublicProfileStatus("Loading public profile from cloud...");
    try {
      const cloudProfile = await loadPublicProfile(profileId, true);
      const fixtures = cloudProfile ? undefined : await loadProductionPublicFixtures(import.meta.env.BASE_URL).catch(() => undefined);
      const nextProfile = cloudProfile ?? fixturePublicProfile(fixtures, profileId);
      setPublicProfile(nextProfile);
      setPublicProfileStatus(
        cloudProfile
          ? "Cloud profile loaded."
          : nextProfile
            ? "Public fixture profile loaded."
            : "No cloud profile found for this link.",
      );
    } catch (error) {
      setPublicProfileStatus((error as Error).message);
    }
  };

  const fetchPublicModeRun = async (runId: string) => {
    setPublicModeStatus("Loading public mode proof from cloud...");
    setPublicModeShareArtifact(undefined);
    try {
      const [cloudRun, cloudArtifact] = await Promise.all([
        loadPublicModeRun(runId, true),
        loadPublicShareArtifact(runId, "mode", true).catch(() => undefined),
      ]);
      const fixtures = cloudRun ? undefined : await loadProductionPublicFixtures(import.meta.env.BASE_URL).catch(() => undefined);
      const run = cloudRun ?? fixturePublicModeRun(fixtures, runId);
      const artifact = cloudArtifact ?? fixturePublicShareArtifact(fixtures, runId, "mode");
      setPublicModeRun(run);
      setPublicModeShareArtifact(artifact);
      setPublicModeStatus(
        cloudRun
          ? artifact
            ? "Cloud mode proof and share manifest loaded."
            : "Cloud mode proof loaded. No share manifest has been synced yet."
          : run
            ? artifact
              ? "Public fixture mode proof and share manifest loaded."
              : "Public fixture mode proof loaded. No share manifest has been generated yet."
          : "No cloud mode proof found for this link.",
      );
    } catch (error) {
      setPublicModeStatus((error as Error).message);
    }
  };

  const reconcileCloudHistory = async (
    nextProfile: typeof profile,
    localRecords: MemoryRecord[],
    localModeRuns: GameModeRun[],
    reason: string,
    localShareEvidence = shareEvidence,
  ) => {
    const baseState = getCloudState();
    setCloudState({ ...baseState, status: "syncing", message: `${reason} Reconciling cloud history...` });
    const cloudProfile = await prepareCloudProfileForSync(nextProfile);
    const [remoteProfile, remoteRecords, remoteModeRuns, remoteShareEvidence] = await Promise.all([
      loadProfileFromCloud(cloudProfile).catch(() => undefined),
      loadRecordsFromCloud(cloudProfile),
      loadModeRunsFromCloud(cloudProfile),
      loadShareArtifactsFromCloud(cloudProfile),
    ]);
    const snapshot = buildCloudRecoverySnapshot({
      localProfile: cloudProfile,
      remoteProfile,
      localRecords,
      remoteRecords,
      localModeRuns,
      remoteModeRuns,
      localShareArtifacts: localShareEvidence,
      remoteShareArtifacts: remoteShareEvidence,
    });
    setProfile(snapshot.profile);
    setAccountEmail(snapshot.profile.email);
    setRecords(snapshot.records);
    setModeRuns(snapshot.modeRuns);
    setShareEvidence(snapshot.shareArtifacts);
    await syncCloudOutboxToCloud(snapshot.profile, snapshot.records, snapshot.modeRuns, snapshot.shareArtifacts);
    await finishCloudSyncWithReadback(
      snapshot.profile,
      snapshot.records,
      snapshot.modeRuns,
      cloudRecoveryMessage(reason, snapshot),
      snapshot.shareArtifacts,
    );
    return snapshot.records;
  };

  const bootstrapApp = async () => {
    await refreshMatches(false);
    const params = new URLSearchParams(window.location.search);
    const invitedFriendCode = normalizeFriendCode(params.get("friend") ?? "");
    let bootProfile = loadProfile();
    if (invitedFriendCode && invitedFriendCode !== friendCodeFor(bootProfile)) {
      bootProfile = { ...bootProfile, friendCode: invitedFriendCode };
      saveProfile(bootProfile);
      setProfile(bootProfile);
      setAccountEmail(bootProfile.email);
      setNotice(`Joined friend leaderboard ${invitedFriendCode}.`);
    }
    void refreshAllLeaderboards(bootProfile);
    const proofId = params.get("proof");
    const profileId = params.get("profile");
    const modeId = params.get("mode");
    if (proofId) {
      setView("verify");
      void fetchPublicProof(proofId);
    } else if (modeId) {
      setView("verify");
      void fetchPublicModeRun(modeId);
    } else if (profileId) {
      setView("profile");
      void fetchPublicProfile(profileId);
    }
    const hadAuthCallback = hasSupabaseAuthCallback();
    const session = await consumeSupabaseAuthCallback();
    const nextCloudState = getCloudState();
    setCloudState(nextCloudState);
    if (!session || !shouldAutoRecoverCloudSession(nextCloudState)) return;
    try {
      const nextProfile = await hydrateProfileFromAuth(bootProfile);
      setProfile(nextProfile);
      setAccountEmail(nextProfile.email);
      await reconcileCloudHistory(
        nextProfile,
        records,
        modeRuns,
        hadAuthCallback ? "Signed in." : "Session restored.",
        shareEvidence,
      );
    } catch (error) {
      setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
    }
  };

  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? matches[0];
  const selectedRecord = selectedMatch
    ? records.find((record) => record.capsule.matchId === selectedMatch.id)
    : undefined;
  const shownDraft = { ...defaultDraft, ...(selectedRecord?.capsule.prediction ?? draft) };
  const lockState = selectedMatch ? getLockState(selectedMatch, !!selectedRecord?.capsule.locked, now) : undefined;
  const filteredMatches = matches.filter((match) => {
    if (matchFilter === "all") return true;
    if (matchFilter === "live") return match.status === "live";
    if (matchFilter === "upcoming") return match.status === "upcoming";
    const kickoff = new Date(match.kickoffAt);
    const today = new Date(now);
    return kickoff.toDateString() === today.toDateString();
  });
  const revealedRecords = records.filter((record) => record.result);
  const averageScore =
    revealedRecords.length > 0
      ? Math.round(
          revealedRecords.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0) /
            revealedRecords.length,
        )
      : 0;
  const bestRecord = [...revealedRecords].sort(
    (a, b) => (b.result?.totalScore ?? 0) - (a.result?.totalScore ?? 0),
  )[0];
  const localLeaderboard = buildLocalLeaderboard(profile, records, modeRuns);
  const remoteLeaderboard = leaderboardCache[leaderboardScope];
  const allRemoteLeaderboard = leaderboardScopes.flatMap((scope) => leaderboardCache[scope]);
  const allLeaderboardEvidence = leaderboardScopes.map((scope) => leaderboardEvidence[scope]);
  const remoteLeaderboardIds = new Set(remoteLeaderboard.map((entry) => entry.id));
  const leaderboardEntries = [
    ...remoteLeaderboard,
    ...localLeaderboard.filter((entry) => !remoteLeaderboardIds.has(entry.id)),
  ].sort((a, b) => b.xp - a.xp);
  const leaderboardReadiness = buildLeaderboardReadiness(cloudState, allRemoteLeaderboard, profile, allLeaderboardEvidence);

  const localRankIndex = leaderboardEntries.findIndex((entry) => entry.id === profile.id);
  const currentRank =
    localRankIndex >= 0 ? localRankIndex + 1 : Math.min(99, 1 + Math.floor(records.length * 1.8 + averageScore / 8));
  const currentXp = localLeaderboard[0]?.xp ?? 0;
  const currentStreak = localLeaderboard[0]?.streak ?? 0;
  const routeProfileId = new URLSearchParams(window.location.search).get("profile");
  const localPublicProfile = buildPublicProfile(profile, records, modeRuns, shareEvidence);
  const shownPublicProfile =
    publicProfile ??
    (routeProfileId && routeProfileId !== profile.id
      ? {
          ...localPublicProfile,
          id: routeProfileId,
          email: undefined,
          displayName: "Profile unavailable",
          location: "Cloud profile",
          friendCode: "not-loaded",
          records: [],
          shareArtifacts: [],
          locks: 0,
          revealed: 0,
          averageScore: 0,
          bestScore: 0,
          xp: 0,
        }
      : localPublicProfile);
  const canLock = !!selectedMatch && !selectedRecord?.capsule.locked && lockState?.state !== "closed";
  const providerReadiness = buildProviderReadiness(matches);
  const providerHealth = buildProviderHealthSnapshot({
    providerSource,
    readiness: providerReadiness,
    routeAudit: providerRouteAudit,
    evidence: providerEvidence,
    lastSyncedAt: lastDataSyncAt,
    responseAudit: providerResponseAudit,
    enrichmentAudit: providerEnrichmentAudit,
    now,
  });
  const intelligenceEnrichmentEvidence = buildIntelligenceEnrichmentEvidencePacket({
    audit: providerEnrichmentAudit,
    health: providerHealth,
    matches,
  });
  const dataContinuityEvidence = buildDataContinuityEvidencePacket({
    matches,
    routeAudit: providerRouteAudit,
    health: providerHealth,
    evidence: providerEvidence,
    responseAudit: providerResponseAudit,
  });
  const browserRuntimeEnv = runtimeEnvTextValues();
  const runtimeConfigReadiness = buildRuntimeConfigReadiness(browserRuntimeEnv);
  const runtimeConfigSummary = summarizeRuntimeConfigReadiness(runtimeConfigReadiness);
  const productionReadiness = buildProductionReadiness({
    cloudState,
    profile,
    records,
    modeRuns,
    gameModes,
    providerReadiness,
    providerRouteAudit,
    providerHealth,
    leaderboardEntries: allRemoteLeaderboard,
    leaderboardScopeEvidence: allLeaderboardEvidence,
    sealEndpointConfigured: filecoinSealConfigured(),
    shareImageReady: Boolean(shareImageUrl || publicShareImageUrl || publicModeShareImageUrl),
    shareEvidence,
    acceptanceEvidence,
    productionEvidence,
  });
  const productionSummary = summarizeProductionReadiness(productionReadiness);
  const profileAutosync = buildProfileAutosyncStatus(cloudState);

  const syncProfileInBackground = (nextProfile: typeof profile, reason: string) => {
    syncCloudOutboxInBackground(nextProfile, records, modeRuns, shareEvidence, reason, "Saving profile and cloud history...");
  };

  const syncCloudOutboxInBackground = (
    nextProfile: typeof profile,
    nextRecords: MemoryRecord[],
    nextModeRuns: GameModeRun[],
    nextShareEvidence: ShareArtifactEvidence[],
    reason: string,
    syncingMessage = "Syncing cloud outbox...",
  ) => {
    const state = getCloudState();
    if (!canAutoSyncCloudWrites(state)) {
      setCloudState(state);
      return;
    }
    if (cloudOutboxSyncTimerRef.current !== undefined) window.clearTimeout(cloudOutboxSyncTimerRef.current);
    cloudOutboxSyncTimerRef.current = window.setTimeout(() => {
      setCloudState({ ...getCloudState(), status: "syncing", message: `${reason} ${syncingMessage}` });
      void prepareCloudProfileForSync(nextProfile)
        .then((cloudProfile) =>
          syncCloudOutboxToCloud(cloudProfile, nextRecords, nextModeRuns, nextShareEvidence).then((result) => result.profile),
        )
        .then(async (cloudProfile) => {
          await finishCloudSyncWithReadback(cloudProfile, nextRecords, nextModeRuns, reason, nextShareEvidence);
        })
        .catch((error) => {
          setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
          setNotice((error as Error).message);
        });
    }, 700);
  };

  const syncRecordsInBackground = (nextRecords: MemoryRecord[], reason: string) => {
    syncCloudOutboxInBackground(profile, nextRecords, modeRuns, shareEvidence, reason, "Syncing cloud history...");
  };

  const syncModeRunsInBackground = (nextModeRuns: GameModeRun[], reason: string) => {
    syncCloudOutboxInBackground(profile, records, nextModeRuns, shareEvidence, reason, "Syncing mode proofs...");
  };

  const commitRecords = (nextRecords: MemoryRecord[], message: string) => {
    setRecords(nextRecords);
    setNotice(message);
    syncRecordsInBackground(nextRecords, message);
  };

  const generatePrediction = () => {
    if (!selectedMatch) return;
    setDraft(buildAgentDraft(selectedMatch, prompt, draft));
    setNotice("Agent draft generated. Review it, edit if needed, then lock before kickoff.");
  };

  const lockPrediction = async () => {
    if (!selectedMatch || !canLock) return;
    const currentLockState = getLockState(selectedMatch, !!selectedRecord?.capsule.locked, Date.now());
    if (currentLockState.state === "closed") {
      setNotice("Lock window is closed. Predictions can only be sealed before kickoff.");
      return;
    }
    const capsule = await createCapsule(selectedMatch, {
      ...shownDraft,
      winner: deriveWinner(shownDraft.homeScore, shownDraft.awayScore, selectedMatch),
    });
    const next = records.filter((record) => record.capsule.matchId !== selectedMatch.id);
    commitRecords([{ capsule }, ...next], "Prediction locked before kickoff. Public proof link is ready in the proof panel.");
  };

  const revealPrediction = () => {
    if (!selectedMatch || !selectedRecord) return;
    const result = scorePrediction(
      selectedRecord.capsule,
      selectedMatch,
      actualHome,
      actualAway,
      actualKeyPlayers
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
    commitRecords(
      records.map((record) =>
        record.capsule.id === selectedRecord.capsule.id ? { ...record, result } : record,
      ),
      "Revealed and scored. Proof card and tournament memory are updated.",
    );
  };

  const importRealProof = () => {
    if (!selectedRecord) return;
    try {
      const updated = applyRealProof(selectedRecord.capsule, proofJson);
      commitRecords(
        records.map((record) =>
          record.capsule.id === updated.id ? { ...record, capsule: updated } : record,
        ),
        "Real proof imported and applied to this capsule.",
      );
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const copyShareText = async () => {
    if (!selectedRecord) return;
    const text = buildProofShareText(selectedRecord, proofUrl(selectedRecord.capsule.id));
    const copied = await copyToClipboard(text);
    setNotice(copied ? "Share text copied." : "Clipboard blocked. Share text is still visible in the proof payload.");
  };

  const syncToCloud = async () => {
    setCloudState({ ...getCloudState(), status: "syncing", message: "Syncing records to cloud..." });
    try {
      const cloudProfile = await prepareCloudProfileForSync(profile);
      await syncCloudOutboxToCloud(cloudProfile, records, modeRuns, shareEvidence);
      await finishCloudSyncWithReadback(cloudProfile, records, modeRuns, "Manual sync completed.", shareEvidence);
    } catch (error) {
      setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
      setNotice((error as Error).message);
    }
  };

  const pullCloudHistory = async () => {
    setCloudState({ ...getCloudState(), status: "syncing", message: "Pulling cloud history..." });
    try {
      const cloudProfile = await prepareCloudProfileForSync(profile);
      const [remoteProfile, remoteRecords, remoteModeRuns, remoteShareEvidence] = await Promise.all([
        loadProfileFromCloud(cloudProfile).catch(() => undefined),
        loadRecordsFromCloud(cloudProfile),
        loadModeRunsFromCloud(cloudProfile),
        loadShareArtifactsFromCloud(cloudProfile),
      ]);
      const snapshot = buildCloudRecoverySnapshot({
        localProfile: cloudProfile,
        remoteProfile,
        localRecords: records,
        remoteRecords,
        localModeRuns: modeRuns,
        remoteModeRuns,
        localShareArtifacts: shareEvidence,
        remoteShareArtifacts: remoteShareEvidence,
      });
      setProfile(snapshot.profile);
      setAccountEmail(snapshot.profile.email);
      setRecords(snapshot.records);
      setModeRuns(snapshot.modeRuns);
      setShareEvidence(snapshot.shareArtifacts);
      await syncCloudOutboxToCloud(snapshot.profile, snapshot.records, snapshot.modeRuns, snapshot.shareArtifacts);
      await finishCloudSyncWithReadback(
        snapshot.profile,
        snapshot.records,
        snapshot.modeRuns,
        `Pulled ${snapshot.remoteRecordCount} cloud records, ${snapshot.remoteModeRunCount} mode proof runs and ${snapshot.remoteShareArtifactCount} share manifests.`,
        snapshot.shareArtifacts,
      );
    } catch (error) {
      setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
      setNotice((error as Error).message);
    }
  };

  const requestMagicLink = async () => {
    try {
      const result = await sendMagicLink(accountEmail);
      setNotice(`Magic link sent to ${result.email}. Open it to enable cloud sync.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const requestGoogleSignIn = async () => {
    try {
      await startGoogleSignIn();
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const updateProfile = (patch: Partial<typeof profile>) => {
    const next = {
      ...profile,
      ...patch,
      friendCode: patch.friendCode !== undefined ? normalizeFriendCode(patch.friendCode) : profile.friendCode,
    };
    setProfile(next);
    if (patch.email !== undefined) setAccountEmail(next.email);
    saveProfile(next);
    syncProfileInBackground(next, "Profile updated.");
    setNotice(profileAutosync.enabled ? "Profile updated. Cloud save queued." : "Profile updated locally.");
  };

  const saveCloudProfile = async () => {
    const state = getCloudState();
    const nextProfile = {
      ...profile,
      friendCode: profile.friendCode !== undefined ? normalizeFriendCode(profile.friendCode) : profile.friendCode,
    };
    setProfile(nextProfile);
    saveProfile(nextProfile);
    if (!canAutoSyncCloudWrites(state)) {
      setCloudState(state);
      setNotice("Profile saved locally. Sign in with Supabase to sync it across devices.");
      return;
    }
    setCloudState({ ...state, status: "syncing", message: "Saving cloud profile..." });
    try {
      const cloudProfile = await prepareCloudProfileForSync(nextProfile);
      await syncProfileToCloud(cloudProfile);
      await finishCloudSyncWithReadback(cloudProfile, records, modeRuns, "Cloud profile saved.", shareEvidence);
    } catch (error) {
      setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
      setNotice((error as Error).message);
    }
  };

  const signOut = async () => {
    await signOutCloud();
    setCloudState(getCloudState());
    setNotice("Signed out of Supabase on this device.");
  };

  const changeLeaderboardScope = (scope: LeaderboardScope) => {
    setLeaderboardScope(scope);
    void refreshLeaderboard(scope, profile);
  };

  const createModeRun = async (mode: GameMode) => {
    try {
      const run = await createGameModeRun(mode, records);
      const nextModeRuns = [run, ...modeRuns.filter((item) => item.id !== run.id)];
      setModeRuns(nextModeRuns);
      syncModeRunsInBackground(nextModeRuns, `${mode.title} proof run created.`);
      setNotice(`${mode.title} proof run created.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const createReadyModeRuns = async () => {
    const playbook = buildModePlaybookPacket({ modes: gameModes, records, bracketPath, runs: modeRuns });
    const queue = playbook.queue.filter((item) => item.runnable);
    if (queue.length === 0) {
      setNotice(playbook.complete ? "All tournament mode proof runs already exist." : playbook.nextAction);
      return;
    }
    try {
      const created: GameModeRun[] = [];
      for (const item of queue) {
        if (item.modeId === "bracket") {
          created.push(await createBracketModeRun(bracketPath));
          continue;
        }
        const mode = gameModes.find((candidate) => candidate.id === item.modeId);
        if (!mode) continue;
        created.push(await createGameModeRun(mode, records));
      }
      const createdIds = new Set(created.map((run) => run.id));
      const nextModeRuns = [
        ...created,
        ...modeRuns.filter((run) => !createdIds.has(run.id) && !created.some((item) => item.modeId === run.modeId)),
      ];
      const bracketRun = created.find((run) => run.artifact?.kind === "bracket-path");
      if (bracketRun?.artifact?.kind === "bracket-path") setBracketPath(bracketRun.artifact.bracketPath);
      setModeRuns(nextModeRuns);
      syncModeRunsInBackground(nextModeRuns, `Created ${created.length} ready tournament mode proof${created.length === 1 ? "" : "s"}.`);
      setNotice(`Created ${created.length} ready tournament mode proof${created.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const updateBracketPick = (pickId: string, patch: Partial<BracketPath["picks"][number]>) => {
    setBracketPath((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      picks: current.picks.map((pick) => (pick.id === pickId ? { ...pick, ...patch } : pick)),
    }));
  };

  const sealBracketPath = async () => {
    try {
      const run = await createBracketModeRun(bracketPath);
      const nextModeRuns = [run, ...modeRuns.filter((item) => item.id !== run.id)];
      setModeRuns(nextModeRuns);
      setBracketPath(run.artifact?.kind === "bracket-path" ? run.artifact.bracketPath : bracketPath);
      syncModeRunsInBackground(nextModeRuns, "Bracket path sealed as a tournament mode proof.");
      setNotice("Bracket path sealed as a tournament mode proof.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const startFilecoinSeal = async () => {
    if (!selectedRecord) return;
    setNotice(filecoinSealConfigured() ? "Starting Filecoin seal workflow..." : "Seal backend is not configured yet.");
    try {
      const updated = await runSealJob(selectedRecord);
      const sealMessage =
        updated.sealJob?.status === "verified"
          ? "Real Filecoin proof attached and verification state saved."
          : updated.sealJob?.status === "failed"
            ? updated.sealJob.error ?? "Seal workflow failed."
            : "Seal workflow status saved. Configure the seal API for real uploads.";
      commitRecords(
        records.map((record) => (record.capsule.id === updated.capsule.id ? updated : record)),
        sealMessage,
      );
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const startModeFilecoinSeal = async (run: GameModeRun) => {
    setNotice(filecoinSealConfigured() ? "Starting mode proof Filecoin seal workflow..." : "Seal backend is not configured yet.");
    try {
      const updated = await runModeSealJob(run);
      const nextModeRuns = modeRuns.map((item) => (item.id === updated.id ? updated : item));
      setModeRuns(nextModeRuns);
      const sealMessage =
        updated.sealJob?.status === "verified"
          ? "Real Filecoin proof attached to mode proof."
          : updated.sealJob?.status === "failed"
            ? updated.sealJob.error ?? "Mode proof seal workflow failed."
            : "Mode proof seal workflow status saved. Configure the seal API for real uploads.";
      syncModeRunsInBackground(nextModeRuns, sealMessage);
      setNotice(sealMessage);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const sealMissingModeFilecoinLanes = async () => {
    const queue = buildFilecoinAutomationSealQueue(records, modeRuns).filter((item) => item.kind === "mode" && item.runnable);
    if (queue.length === 0) {
      setNotice("No runnable mode Filecoin seal lanes yet. Create the missing tournament mode proofs first.");
      return;
    }
    setNotice(filecoinSealConfigured() ? `Starting batch mode Filecoin seal for ${queue.length} lane${queue.length === 1 ? "" : "s"}...` : "Seal backend is not configured yet; saving needs-config mode seal jobs.");
    let nextModeRuns = modeRuns;
    let verified = 0;
    let failed = 0;

    for (const item of queue) {
      const target = nextModeRuns.find((run) => run.id === item.artifactId);
      if (!target) continue;
      const updated = await runModeSealJob(target);
      if (updated.sealJob?.status === "verified") verified += 1;
      if (updated.sealJob?.status === "failed") failed += 1;
      nextModeRuns = nextModeRuns.map((run) => (run.id === updated.id ? updated : run));
    }

    const message =
      verified > 0
        ? `Batch mode Filecoin seal finished: ${verified}/${queue.length} verified${failed ? `, ${failed} failed` : ""}.`
        : filecoinSealConfigured()
          ? `Batch mode Filecoin seal finished with ${failed} failed lane${failed === 1 ? "" : "s"}.`
          : `Batch mode Filecoin seal queued ${queue.length} needs-config lane${queue.length === 1 ? "" : "s"}.`;
    setModeRuns(nextModeRuns);
    syncModeRunsInBackground(nextModeRuns, message);
    setNotice(message);
  };

  const sealMissingFilecoinLanes = async () => {
    const queue = buildFilecoinAutomationSealQueue(records, modeRuns).filter((item) => item.runnable);
    if (queue.length === 0) {
      setNotice("No runnable Filecoin seal lanes yet. Create the missing prediction or mode proof artifacts first.");
      return;
    }
    setNotice(filecoinSealConfigured() ? `Starting batch Filecoin seal for ${queue.length} lane${queue.length === 1 ? "" : "s"}...` : "Seal backend is not configured yet; saving needs-config seal jobs.");
    let nextRecords = records;
    let nextModeRuns = modeRuns;
    let verified = 0;
    let failed = 0;

    for (const item of queue) {
      if (item.kind === "record") {
        const target = nextRecords.find((record) => record.capsule.id === item.artifactId);
        if (!target) continue;
        const updated = await runSealJob(target);
        if (updated.sealJob?.status === "verified") verified += 1;
        if (updated.sealJob?.status === "failed") failed += 1;
        nextRecords = nextRecords.map((record) => (record.capsule.id === updated.capsule.id ? updated : record));
        continue;
      }
      const target = nextModeRuns.find((run) => run.id === item.artifactId);
      if (!target) continue;
      const updated = await runModeSealJob(target);
      if (updated.sealJob?.status === "verified") verified += 1;
      if (updated.sealJob?.status === "failed") failed += 1;
      nextModeRuns = nextModeRuns.map((run) => (run.id === updated.id ? updated : run));
    }

    const message =
      verified > 0
        ? `Batch Filecoin seal finished: ${verified}/${queue.length} verified${failed ? `, ${failed} failed` : ""}.`
        : filecoinSealConfigured()
          ? `Batch Filecoin seal finished with ${failed} failed lane${failed === 1 ? "" : "s"}.`
          : `Batch Filecoin seal queued ${queue.length} needs-config lane${queue.length === 1 ? "" : "s"}.`;
    commitRecords(nextRecords, message);
    setModeRuns(nextModeRuns);
    syncModeRunsInBackground(nextModeRuns, message);
    setNotice(message);
  };

  const resumePendingFilecoinSealJobs = async () => {
    const queue = buildFilecoinSealResumeQueue(records, modeRuns);
    if (queue.length === 0) return;
    setNotice(`Resuming ${queue.length} pending Filecoin seal job${queue.length === 1 ? "" : "s"}...`);
    let nextRecords = records;
    let nextModeRuns = modeRuns;
    let verified = 0;
    let failed = 0;

    for (const item of queue) {
      if (item.kind === "record") {
        const target = nextRecords.find((record) => record.capsule.id === item.artifactId);
        if (!target) continue;
        const updated = await runSealJob(target);
        if (updated.sealJob?.status === "verified") verified += 1;
        if (updated.sealJob?.status === "failed") failed += 1;
        nextRecords = nextRecords.map((record) => (record.capsule.id === updated.capsule.id ? updated : record));
        continue;
      }
      const target = nextModeRuns.find((run) => run.id === item.artifactId);
      if (!target) continue;
      const updated = await runModeSealJob(target);
      if (updated.sealJob?.status === "verified") verified += 1;
      if (updated.sealJob?.status === "failed") failed += 1;
      nextModeRuns = nextModeRuns.map((run) => (run.id === updated.id ? updated : run));
    }

    const message =
      verified > 0
        ? `Resumed Filecoin seal jobs: ${verified}/${queue.length} verified${failed ? `, ${failed} failed` : ""}.`
        : failed > 0
          ? `Resumed Filecoin seal jobs with ${failed} failed job${failed === 1 ? "" : "s"} still pending.`
          : "Resumed Filecoin seal jobs; verification is still pending.";
    commitRecords(nextRecords, message);
    setModeRuns(nextModeRuns);
    syncModeRunsInBackground(nextModeRuns, message);
  };

  const writeShareEvidence = (next: ShareArtifactEvidence) => {
    setShareEvidence((current) => {
      const existing = current.find((item) => item.id === next.id && item.kind === next.kind);
      const merged = existing ? { ...existing, ...next } : next;
      const nextEvidence = [merged, ...current.filter((item) => item.id !== next.id || item.kind !== next.kind)];
      syncCloudOutboxInBackground(profile, records, modeRuns, nextEvidence, "Share card manifest synced.", "Syncing share card manifest...");
      return nextEvidence;
    });
  };

  const writeShareEvidenceBatch = (nextEvidence: ShareArtifactEvidence[], reason = "Share card manifests synced.") => {
    setShareEvidence(nextEvidence);
    syncCloudOutboxInBackground(profile, records, modeRuns, nextEvidence, reason, "Syncing share card manifests...");
  };

  const publishShareImageUrl = async (
    artifact: Pick<ShareArtifactEvidence, "id" | "kind" | "fileName" | "imageMime">,
    dataUrl: string,
  ) => {
    try {
      const upload = await uploadShareImageToCloud(profile, artifact, dataUrl);
      if (upload.status === "uploaded") return upload.imageUrl;
      return undefined;
    } catch (error) {
      setNotice((error as Error).message);
      return undefined;
    }
  };

  const generateShareImageForRecord = async (
    record: MemoryRecord,
    options: { download?: boolean; publicPreview?: boolean } = {},
  ) => {
    const publicUrl = proofUrl(record.capsule.id);
    const fileName = `${record.capsule.id}-share-card.png`;
    const dataUrl = await generateShareCard(record, { proofUrl: publicUrl });
    if (options.publicPreview) setPublicShareImageUrl(dataUrl);
    else setShareImageUrl(dataUrl);
    const imageUrl = await publishShareImageUrl({ id: record.capsule.id, kind: "record", fileName, imageMime: "image/png" }, dataUrl);
    writeShareEvidence(await buildShareArtifactEvidence({
      id: record.capsule.id,
      kind: "record",
      proofUrl: publicUrl,
      dataUrl,
      fileName,
      imageUrl,
    }));
    if (options.download) downloadDataUrl(dataUrl, fileName);
    setNotice("Share image generated.");
  };

  const generateShareImage = async () => {
    if (!selectedRecord) return;
    await generateShareImageForRecord(selectedRecord, { download: true });
  };

  const generateShareImageForModeRun = async (
    run: GameModeRun,
    options: { download?: boolean; publicPreview?: boolean } = {},
  ) => {
    const publicUrl = modeRunUrl(run.id);
    const fileName = `${run.id}-mode-share-card.png`;
    const dataUrl = await generateModeShareCard(run, { proofUrl: publicUrl });
    if (options.publicPreview) setPublicModeShareImageUrl(dataUrl);
    const imageUrl = await publishShareImageUrl({ id: run.id, kind: "mode", fileName, imageMime: "image/png" }, dataUrl);
    writeShareEvidence(await buildShareArtifactEvidence({
      id: run.id,
      kind: "mode",
      proofUrl: publicUrl,
      dataUrl,
      fileName,
      imageUrl,
    }));
    if (options.download) downloadDataUrl(dataUrl, fileName);
    setNotice("Mode proof share image generated.");
  };

  const publishMissingShareCards = async () => {
    const queue = buildSharePublishQueue(records, modeRuns, shareEvidence);
    const recordTargetIds = new Set(queue.items.filter((item) => item.kind === "record").map((item) => item.id));
    const modeTargetIds = new Set(queue.items.filter((item) => item.kind === "mode").map((item) => item.id));
    const recordTargets = records.filter((record) => recordTargetIds.has(record.capsule.id));
    const modeTargets = modeRuns.filter((run) => modeTargetIds.has(run.id));
    const total = queue.missingProduction;
    if (total === 0) {
      setNotice("All proof cards already have production share evidence.");
      return;
    }
    setNotice(`Publishing ${total} missing proof card${total === 1 ? "" : "s"}...`);
    for (const record of recordTargets) {
      await generateShareImageForRecord(record);
    }
    for (const run of modeTargets) {
      await generateShareImageForModeRun(run);
    }
    const cloud = getCloudState();
    setNotice(
      cloud.configured && cloud.authenticated
        ? `Generated and queued ${total} proof card${total === 1 ? "" : "s"} for Supabase upload/read-back.`
        : `Generated ${total} proof card${total === 1 ? "" : "s"} locally. Sign in with Supabase to publish public image URLs.`,
    );
  };

  const openNativeShareChannels = async (artifacts: ShareArtifactEvidence[]) => {
    if (!("share" in navigator)) return false;
    for (const artifact of artifacts) {
      await navigator.share({
        title: artifact.kind === "mode" ? "Kickoff Lock mode proof card" : "Kickoff Lock proof card",
        text: `Verify this Kickoff Lock ${artifact.kind === "mode" ? "mode proof" : "prediction proof"} card.\nImage: ${artifact.imageUrl ?? "not uploaded"}`,
        url: artifact.proofUrl,
      });
    }
    return true;
  };

  const openXIntentWindow = (url?: string) => {
    if (!url) return false;
    return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
  };

  const openMissingShareChannels = async () => {
    const queue = buildShareChannelQueue(records, modeRuns, shareEvidence);
    const timestamp = new Date().toISOString();
    const xBatch = buildOpenedShareChannelArtifacts(records, modeRuns, shareEvidence, timestamp);
    const xReady = xBatch.opened.filter((artifact) => artifact.xIntentUrl);
    if (xReady.length === 0) {
      setNotice(queue.nextAction);
      return;
    }
    const nativeBatch = buildOpenedShareChannelArtifacts(records, modeRuns, shareEvidence, timestamp, "native");
    try {
      if (await openNativeShareChannels(nativeBatch.opened)) {
        writeShareEvidenceBatch(nativeBatch.evidence, "Native share channel evidence synced.");
        setNotice(`Opened ${nativeBatch.opened.length} native share channel${nativeBatch.opened.length === 1 ? "" : "s"} and saved channel evidence.`);
        return;
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setNotice("Share cancelled.");
        return;
      }
    }
    const openedKeys = new Set<string>();
    for (const artifact of xReady) {
      if (openXIntentWindow(artifact.xIntentUrl)) openedKeys.add(`${artifact.kind}:${artifact.id}`);
    }
    if (openedKeys.size === 0) {
      setNotice("X share window was blocked. Allow popups for this site, then open the missing X channels again.");
      return;
    }
    const openedEvidence = xBatch.opened.filter((artifact) => openedKeys.has(`${artifact.kind}:${artifact.id}`));
    writeShareEvidenceBatch(
      [
        ...openedEvidence,
        ...shareEvidence.filter((artifact) => !openedKeys.has(`${artifact.kind}:${artifact.id}`)),
      ],
      "X share channel evidence synced.",
    );
    setNotice(`Opened ${openedEvidence.length} X share channel${openedEvidence.length === 1 ? "" : "s"} and saved channel evidence.`);
  };

  const shareRecordToTwitter = async (record: MemoryRecord) => {
    const publicUrl = proofUrl(record.capsule.id);
    const text = buildProofShareText(record, publicUrl);
    const xIntentUrl = buildXIntentUrl(record, publicUrl);
    const dataUrl = await generateShareCard(record, { proofUrl: publicUrl });
    const fileName = `${record.capsule.id}-proof-card.png`;
    const imageUrl = await publishShareImageUrl({ id: record.capsule.id, kind: "record", fileName, imageMime: "image/png" }, dataUrl);
    try {
      if ("share" in navigator && "File" in window) {
        const file = await dataUrlToFile(dataUrl, fileName);
        if (canNativeShareFiles([file])) {
          await navigator.share({
            title: "Kickoff Lock proof card",
            text,
            url: publicUrl,
            files: [file],
          });
          writeShareEvidence(await buildShareArtifactEvidence({
            id: record.capsule.id,
            kind: "record",
            proofUrl: publicUrl,
            dataUrl,
            fileName,
            imageUrl,
            xIntentUrl,
            nativeShareOpenedAt: new Date().toISOString(),
          }));
          setNotice("Share sheet opened with proof image.");
          return;
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setNotice("Share cancelled.");
        return;
      }
    }
    const opened = openXIntentWindow(xIntentUrl);
    writeShareEvidence(await buildShareArtifactEvidence({
      id: record.capsule.id,
      kind: "record",
      proofUrl: publicUrl,
      dataUrl,
      fileName,
      imageUrl,
      xIntentUrl,
      ...(opened ? { xIntentOpenedAt: new Date().toISOString() } : {}),
    }));
    setNotice(opened ? "X share window opened with the public proof URL." : "X share window was blocked. The card was generated, but channel evidence was not saved.");
  };

  const shareModeRunToTwitter = async (run: GameModeRun) => {
    const publicUrl = modeRunUrl(run.id);
    const text = buildModeProofShareText(run, publicUrl);
    const xIntentUrl = buildModeXIntentUrl(run, publicUrl);
    const dataUrl = await generateModeShareCard(run, { proofUrl: publicUrl });
    const fileName = `${run.id}-mode-proof-card.png`;
    const imageUrl = await publishShareImageUrl({ id: run.id, kind: "mode", fileName, imageMime: "image/png" }, dataUrl);
    try {
      if ("share" in navigator && "File" in window) {
        const file = await dataUrlToFile(dataUrl, fileName);
        if (canNativeShareFiles([file])) {
          await navigator.share({
            title: "Kickoff Lock mode proof card",
            text,
            url: publicUrl,
            files: [file],
          });
          writeShareEvidence(await buildShareArtifactEvidence({
            id: run.id,
            kind: "mode",
            proofUrl: publicUrl,
            dataUrl,
            fileName,
            imageUrl,
            xIntentUrl,
            nativeShareOpenedAt: new Date().toISOString(),
          }));
          setNotice("Share sheet opened with mode proof image.");
          return;
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setNotice("Share cancelled.");
        return;
      }
    }
    const opened = openXIntentWindow(xIntentUrl);
    writeShareEvidence(await buildShareArtifactEvidence({
      id: run.id,
      kind: "mode",
      proofUrl: publicUrl,
      dataUrl,
      fileName,
      imageUrl,
      xIntentUrl,
      ...(opened ? { xIntentOpenedAt: new Date().toISOString() } : {}),
    }));
    setNotice(opened ? "X share window opened with the public mode proof URL." : "X share window was blocked. The mode card was generated, but channel evidence was not saved.");
  };

  const shareToTwitter = () => {
    if (!selectedRecord) return;
    void shareRecordToTwitter(selectedRecord);
  };

  const queryFilecoinCid = async () => {
    setCidLookupState({ status: "checking", message: "Querying Filecoin seal API..." });
    const result = await lookupFilecoinProof(cidLookupInput);
    setCidLookupState(result);
    setNotice(result.message);
  };

  const attachQueriedProof = (record: MemoryRecord, proof: FilecoinProof) => {
    try {
      const expectedPayloadHashes = [record.capsule.payloadHash, record.sealJob?.uploadPayloadHash].filter(Boolean) as string[];
      const updated = applyVerifiedProof(record.capsule, proof, { expectedPayloadHashes });
      commitRecords(
        records.map((item) =>
          item.capsule.id === updated.id
            ? {
                ...item,
                capsule: updated,
              }
            : item,
        ),
        proof.payloadHash
          ? "CID proof attached after payload hash match."
          : "CID proof attached. Seal API did not return a payload hash, so keep the public proof page evidence visible.",
      );
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const copyProofLink = async () => {
    if (!selectedRecord) return;
    const copied = await copyToClipboard(proofUrl(selectedRecord.capsule.id));
    setNotice(copied ? "Public proof link copied." : "Clipboard blocked. Public proof link is visible in the proof panel.");
  };

  const openProofView = () => {
    if (!selectedRecord) return;
    window.history.replaceState({}, "", `?proof=${selectedRecord.capsule.id}`);
    setView("verify");
  };

  const openModeProofView = (runId: string) => {
    window.history.replaceState({}, "", `?mode=${runId}`);
    setView("verify");
  };

  const openPublicProfile = () => {
    setPublicProfile(undefined);
    setPublicProfileStatus("Local public profile preview. Sync cloud history to make this link resolvable from another device.");
    window.history.replaceState({}, "", `?profile=${profile.id}`);
    setView("profile");
  };

  const copyProfileLink = async (profileId = profile.id) => {
    const copied = await copyToClipboard(profileUrl(profileId));
    setNotice(copied ? "Public profile link copied." : "Clipboard blocked. Public profile link is visible on the profile page.");
  };

  const copyFriendInviteLink = async () => {
    const code = friendCodeFor(profile);
    const copied = await copyToClipboard(friendInviteUrl(code));
    setNotice(copied ? `Friend leaderboard invite copied for ${code}.` : "Clipboard blocked. Friend invite link is visible in Account.");
  };

  const updateMarket = (index: number, patch: Partial<PredictionDraft["markets"][number]>) => {
    const nextMarkets = shownDraft.markets.map((market, itemIndex) =>
      itemIndex === index ? { ...market, ...patch } : market,
    );
    setDraft({ ...shownDraft, markets: nextMarkets });
  };

  const enrichSelectedMatch = async () => {
    if (!selectedMatch) return;
    try {
      const enriched = await enrichMatchWithDataProviders(selectedMatch);
      setMatches(matches.map((match) => (match.id === enriched.id ? enriched : match)));
      setNotice("Match intelligence enriched from configured live data providers.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  return (
    <main className="shell">
      <aside className="side-rail" aria-label="Tournament controls">
        <div className="rail-mark">
          <img src={assetUrl("kickoff-lock-icon.png")} alt="" />
        </div>
        <button className={view === "matches" ? "active" : ""} onClick={() => setView("matches")} title="Match board">
          <TableProperties size={20} />
          <span>Match board</span>
        </button>
        <button className={view === "predict" ? "active" : ""} onClick={() => setView("predict")} title="Agent flow">
          <Bot size={20} />
          <span>Agent flow</span>
        </button>
        <button title="Proof capsule" onClick={() => setView("predict")}>
          <FileCheck2 size={20} />
          <span>Proof capsule</span>
        </button>
        <button className={view === "memory" ? "active" : ""} onClick={() => setView("memory")} title="Memory wall">
          <Database size={20} />
          <span>Memory wall</span>
        </button>
        <button className={view === "verify" ? "active" : ""} onClick={() => setView("verify")} title="Verify proof">
          <ShieldCheck size={20} />
          <span>Verify</span>
        </button>
        <button className={view === "modes" ? "active" : ""} onClick={() => setView("modes")} title="Game modes">
          <Flame size={20} />
          <span>Modes</span>
        </button>
        <button className={view === "profile" ? "active" : ""} onClick={openPublicProfile} title="Public profile">
          <Medal size={20} />
          <span>Profile</span>
        </button>
        <button className={view === "account" ? "active" : ""} onClick={() => setView("account")} title="Account">
          <UserCircle2 size={20} />
          <span>Account</span>
        </button>
        <div className="rail-spacer" />
        <button
          className={utilityPanel === "settings" ? "active" : ""}
          onClick={() => setUtilityPanel("settings")}
          title="Settings"
        >
          <SlidersHorizontal size={20} />
          <span>Settings</span>
        </button>
        <button className={utilityPanel === "help" ? "active" : ""} onClick={() => setUtilityPanel("help")} title="Help">
          <HelpCircle size={20} />
          <span>Help</span>
        </button>
      </aside>
      <section
        className="hero"
        style={imageLayer(
          "stadium-hero.jpg",
          "linear-gradient(90deg, rgba(3, 10, 11, 0.94) 0%, rgba(3, 10, 11, 0.72) 52%, rgba(3, 10, 11, 0.16) 100%)",
        )}
      >
        <div className="hero-copy-block">
          <div className="brand-lockup" aria-label="Kickoff Lock Agent brand">
            <img src={assetUrl("kickoff-lock-icon.png")} alt="" />
            <span>World Cup proof agent</span>
          </div>
          <h1><span>Kickoff</span><span>Lock</span><span>Agent</span></h1>
          <p className="hero-copy">
            Lock before kickoff <i /> reveal after final whistle
          </p>
          <div className="hero-signals" aria-label="Core workflow">
            <span><ShieldCheck size={18} /> Lock before kickoff</span>
            <span><Clock3 size={18} /> Reveal after final whistle</span>
            <span><FileCheck2 size={18} /> Keep the proof card</span>
          </div>
        </div>
        <div className="hero-panel">
          <div>
            <span className="label">Locks</span>
            <span className="metric">{records.length}</span>
          </div>
          <div>
            <span className="label">Accuracy</span>
            <span className="metric">{averageScore}%</span>
          </div>
          <div>
            <span className="label">Rank</span>
            <span className="metric">#{currentRank}</span>
          </div>
          <div>
            <span className="label">XP</span>
            <span className="metric source-metric">{currentXp}</span>
          </div>
        </div>
        <div className="cloud-strip">
          <Cloud size={16} />
          <span>{profile.displayName}</span>
          <b>{cloudState.mode.toUpperCase()} · {cloudState.status}</b>
        </div>
      </section>

      <nav className="tabs" aria-label="Main views">
        <button className={view === "matches" ? "active" : ""} onClick={() => setView("matches")}>
          <Trophy size={18} /> Match board
        </button>
        <button className={view === "predict" ? "active" : ""} onClick={() => setView("predict")}>
          <Bot size={18} /> Agent flow
        </button>
        <button className={view === "memory" ? "active" : ""} onClick={() => setView("memory")}>
          <Database size={18} /> Memory
        </button>
        <button className={view === "verify" ? "active" : ""} onClick={() => setView("verify")}>
          <ShieldCheck size={18} /> Verify
        </button>
        <button className={view === "modes" ? "active" : ""} onClick={() => setView("modes")}>
          <Flame size={18} /> Modes
        </button>
        <button className={view === "profile" ? "active" : ""} onClick={openPublicProfile}>
          <Medal size={18} /> Profile
        </button>
        <button className={view === "account" ? "active" : ""} onClick={() => setView("account")}>
          <UserCircle2 size={18} /> Account
        </button>
        <button className={utilityPanel === "settings" ? "active" : ""} onClick={() => setUtilityPanel("settings")}>
          <SlidersHorizontal size={18} /> Settings
        </button>
        <button className={utilityPanel === "help" ? "active" : ""} onClick={() => setUtilityPanel("help")}>
          <HelpCircle size={18} /> Help
        </button>
      </nav>

      {notice && <div className="notice">{notice}</div>}
      {providerWarning && <div className="warning">{providerWarning}</div>}

      {(view === "matches" || view === "predict") && (
      <section className="workspace">
        <aside className="panel match-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Data provider</p>
              <h2>Matches</h2>
            </div>
            <button
              className="icon-button"
              title="Refresh match data"
              disabled={dataRefreshStatus === "refreshing"}
              onClick={() => void refreshMatches()}
            >
              <RefreshCcw size={18} />
            </button>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={forceFallback}
              onChange={(event) => setForceFallback(event.target.checked)}
            />
            Force fallback test
          </label>
          <div className="provider-health">
            <div>
              <strong>{providerSource}</strong>
              <span>{matches.length} matches loaded · {dataRefreshStatus}</span>
            </div>
            <div className="provider-sync-meta" aria-label="Live data sync status">
              <span>Last sync {lastDataSyncAt ? formatDate(lastDataSyncAt) : "pending"}</span>
              <span>{nextDataSyncAt ? `Next auto ${formatDate(nextDataSyncAt)}` : "Auto refresh paused"}</span>
            </div>
            {providerEvidence.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
          <ProviderHealthPanel health={providerHealth} />
          <DataContinuityEvidencePanel packet={dataContinuityEvidence} />
          {realtimeDataAudit && <RealtimeDataAuditPanel audit={realtimeDataAudit} />}
          {dataProviderArtifact && <PublicFreeFeedProofPanel artifact={dataProviderArtifact} />}
          <IntelligenceEnrichmentEvidencePanel packet={intelligenceEnrichmentEvidence} />
          <ProviderRouteAudit items={providerRouteAudit} />
          <ProviderReadiness items={providerReadiness} />
          <div className="filter-row" aria-label="Match filters">
            {(["all", "live", "today", "upcoming"] as const).map((filter) => (
              <button
                key={filter}
                className={matchFilter === filter ? "active" : ""}
                onClick={() => setMatchFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          <div className="match-list">
            {filteredMatches.length === 0 && <p className="empty-inline">No matches in this filter.</p>}
            {filteredMatches.map((match) => {
              const record = records.find((item) => item.capsule.matchId === match.id);
              const state = statusText(match, record);
              const intelScore = buildMatchIntelligenceScore(match);
              return (
                <button
                  key={match.id}
                  className={`match-card ${selectedMatchId === match.id ? "selected" : ""}`}
                  style={imageLayer(
                    "match-pitch.jpg",
                    "linear-gradient(90deg, rgba(3, 14, 14, 0.9) 0%, rgba(3, 14, 14, 0.72) 56%, rgba(3, 14, 14, 0.38) 100%)",
                  )}
                  onClick={() => {
                    setSelectedMatchId(match.id);
                    setView("predict");
                    if (match.homeScore !== undefined) setActualHome(match.homeScore);
                    if (match.awayScore !== undefined) setActualAway(match.awayScore);
                  }}
                >
                  <span className={`status ${state}`}>{state}</span>
                  <strong>{matchLabel(match)}</strong>
                  <span>{match.stage} · {formatDate(match.kickoffAt)}</span>
                  <span className="source">{sourceLabel(match.dataSource)} · Intel {intelScore.score}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          className="panel flow-panel"
          style={imageLayer(
            "agent-desk.jpg",
            "linear-gradient(180deg, rgba(3, 8, 10, 0.9) 0%, rgba(3, 8, 10, 0.82) 45%, rgba(3, 8, 10, 0.94) 100%)",
          )}
        >
          {selectedMatch ? (
            <>
              <div
                className="match-spotlight"
                style={imageLayer(
                  "match-pitch.jpg",
                  "linear-gradient(90deg, rgba(3, 14, 14, 0.88) 0%, rgba(3, 14, 14, 0.56) 58%, rgba(3, 14, 14, 0.2) 100%)",
                )}
              >
                <div>
                  <span>{selectedMatch.stage}</span>
                  <strong>{matchLabel(selectedMatch)}</strong>
                </div>
                <b>{formatDate(selectedMatch.kickoffAt)}</b>
              </div>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Agent flow</p>
                  <h2>Lock window</h2>
                </div>
                <span className={`pill lock-${lockState?.state ?? "open"}`}>{lockState?.label}</span>
              </div>

              <LockWindow match={selectedMatch} lockState={lockState} />
              <MatchIntelligence match={selectedMatch} onEnrich={enrichSelectedMatch} />

              <div className="scoreboard-lock">
                <div className="team-tile home">{selectedMatch.homeTeam}</div>
                <div className="score-tile">
                  <strong>{shownDraft.homeScore} - {shownDraft.awayScore}</strong>
                  <span>{shownDraft.confidence}% confidence</span>
                </div>
                <div className="team-tile away">{selectedMatch.awayTeam}</div>
              </div>

              <div className="agent-tabs" aria-label="Prediction sections">
                <span className="active">Prediction</span>
                <span>Markets</span>
                <span>Notes</span>
              </div>

              <div className="agent-grid">
                <label>
                  <span>Intent for the agent</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    disabled={!!selectedRecord?.capsule.locked}
                  />
                </label>
                <div className="score-inputs">
                  <label>
                    <span>{selectedMatch.homeTeam}</span>
                  <input
                    type="number"
                    min="0"
                      value={shownDraft.homeScore}
                      disabled={!!selectedRecord?.capsule.locked}
                      onChange={(event) =>
                        setDraft({ ...shownDraft, homeScore: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>{selectedMatch.awayTeam}</span>
                  <input
                    type="number"
                    min="0"
                      value={shownDraft.awayScore}
                      disabled={!!selectedRecord?.capsule.locked}
                      onChange={(event) =>
                        setDraft({ ...shownDraft, awayScore: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>Confidence</span>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={shownDraft.confidence}
                      disabled={!!selectedRecord?.capsule.locked}
                      onChange={(event) =>
                        setDraft({ ...shownDraft, confidence: Number(event.target.value) })
                      }
                    />
                    <b>{shownDraft.confidence}%</b>
                  </label>
                </div>
              </div>

              <label>
                <span>Reasoning</span>
                <textarea
                  value={shownDraft.reasoning}
                  disabled={!!selectedRecord?.capsule.locked}
                  onChange={(event) => setDraft({ ...shownDraft, reasoning: event.target.value })}
                />
              </label>
              <label>
                <span>Key players or signals</span>
                <input
                  value={shownDraft.keyPlayers.join(", ")}
                  disabled={!!selectedRecord?.capsule.locked}
                  onChange={(event) =>
                    setDraft({
                      ...shownDraft,
                      keyPlayers: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                    })
                  }
                />
              </label>

              <MarketBuilder
                markets={shownDraft.markets}
                locked={!!selectedRecord?.capsule.locked}
                onUpdate={updateMarket}
              />

              <div className="actions">
                <button onClick={generatePrediction} disabled={!!selectedRecord?.capsule.locked}>
                  <Sparkles size={18} /> Generate prediction
                </button>
                <button className="primary" onClick={() => void lockPrediction()} disabled={!canLock}>
                  <LockKeyhole size={18} /> Lock prediction
                </button>
              </div>

              {selectedRecord && (
                <RevealPanel
                  match={selectedMatch}
                  record={selectedRecord}
                  actualHome={actualHome}
                  actualAway={actualAway}
                  actualKeyPlayers={actualKeyPlayers}
                  onHome={setActualHome}
                  onAway={setActualAway}
                  onKeys={setActualKeyPlayers}
                  onReveal={revealPrediction}
                />
              )}
            </>
          ) : (
            <div className="empty">No match selected.</div>
          )}
        </section>

        <aside
          className="panel proof-panel"
          style={imageLayer(
            "proof-ticket.jpg",
            "linear-gradient(180deg, rgba(3, 14, 14, 0.94) 0%, rgba(3, 14, 14, 0.88) 100%)",
          )}
        >
          {selectedRecord ? (
            <ProofPanel
              record={selectedRecord}
              match={selectedMatch}
              proofJson={proofJson}
              onProofJson={setProofJson}
              onImport={importRealProof}
              onCopy={copyShareText}
              onCopyProofLink={copyProofLink}
              onOpenProofView={openProofView}
              onSeal={startFilecoinSeal}
              onShareImage={generateShareImage}
              onTwitter={shareToTwitter}
              shareImageUrl={shareImageUrl}
            />
          ) : (
            <div className="empty">
              <FileCheck2 size={32} />
              <h2>No capsule yet</h2>
              <p>Generate a prediction and lock it to create a Filecoin-style proof capsule.</p>
            </div>
          )}
        </aside>
      </section>
      )}

      {view === "memory" && (
        <MemoryDashboard
          profile={profile}
          records={records}
          averageScore={averageScore}
          bestRecord={bestRecord}
          currentRank={currentRank}
          currentXp={currentXp}
          currentStreak={currentStreak}
          leaderboardEntries={leaderboardEntries}
          leaderboardSeasonEntries={allRemoteLeaderboard}
          leaderboardReadiness={leaderboardReadiness}
          leaderboardScopeEvidence={allLeaderboardEvidence}
          leaderboardScope={leaderboardScope}
          cloudState={cloudState}
          onLeaderboardScope={changeLeaderboardScope}
        />
      )}

      {view === "verify" && (
        <VerifyDashboard
          records={records}
          modeRuns={modeRuns}
          publicRecord={publicRecord}
          publicProofStatus={publicProofStatus}
          publicModeRun={publicModeRun}
          publicModeStatus={publicModeStatus}
          shareEvidence={shareEvidence}
          publicShareArtifact={publicShareArtifact}
          publicModeShareArtifact={publicModeShareArtifact}
          shareImageUrl={publicShareImageUrl}
          modeShareImageUrl={publicModeShareImageUrl}
          onShareImage={(record) => void generateShareImageForRecord(record, { publicPreview: true })}
          onTwitter={shareRecordToTwitter}
          onModeShareImage={(run) => void generateShareImageForModeRun(run, { publicPreview: true })}
          onModeTwitter={shareModeRunToTwitter}
          matches={matches}
          cidLookupInput={cidLookupInput}
          cidLookupState={cidLookupState}
          onCidLookupInput={setCidLookupInput}
          onCidLookup={queryFilecoinCid}
          onAttachCidProof={attachQueriedProof}
        />
      )}

      {view === "modes" && (
        <ModesDashboard
          modes={gameModes}
          records={records}
          bracketPath={bracketPath}
          modeRuns={modeRuns}
          shareEvidence={shareEvidence}
          cloudState={cloudState}
          onBracketPick={updateBracketPick}
          onSealBracket={sealBracketPath}
          onCreateModeRun={createModeRun}
          onCreateReadyModes={() => void createReadyModeRuns()}
          onSealReadyModeRuns={() => void sealMissingModeFilecoinLanes()}
          onSealModeRun={startModeFilecoinSeal}
        />
      )}

      {view === "profile" && (
        <PublicProfileDashboard
          profile={shownPublicProfile}
          status={publicProfileStatus}
          onCopyProfileLink={copyProfileLink}
          onOpenProof={(capsuleId) => {
            window.history.replaceState({}, "", `?proof=${capsuleId}`);
            setView("verify");
            void fetchPublicProof(capsuleId);
          }}
          onOpenModeProof={openModeProofView}
        />
      )}

      {view === "account" && (
        <AccountDashboard
          profile={profile}
          cloudState={cloudState}
          email={accountEmail}
          records={records}
          modeRuns={modeRuns}
          matches={matches}
          gameModes={gameModes}
          providerReadiness={providerReadiness}
          providerRouteAudit={providerRouteAudit}
          providerHealth={providerHealth}
          realtimeDataAudit={realtimeDataAudit}
          leaderboardEntries={allRemoteLeaderboard}
          leaderboardScopeEvidence={allLeaderboardEvidence}
          sealEndpointConfigured={filecoinSealConfigured()}
          shareImageReady={Boolean(shareImageUrl || publicShareImageUrl || publicModeShareImageUrl)}
          shareEvidence={shareEvidence}
          acceptanceEvidence={acceptanceEvidence}
          acceptanceEvidenceStatus={acceptanceEvidenceStatus}
          productionEvidence={productionEvidence}
          productionEvidenceStatus={productionEvidenceStatus}
          publicDeploymentEvidence={publicDeploymentEvidence}
          publicDeploymentEvidenceStatus={publicDeploymentEvidenceStatus}
          productionBootstrapRunbook={productionBootstrapRunbook}
          productionBootstrapRunbookStatus={productionBootstrapRunbookStatus}
          productionAccessPreflight={productionAccessPreflight}
          productionAccessPreflightStatus={productionAccessPreflightStatus}
          productionEnvPlan={productionEnvPlan}
          productionEnvPlanStatus={productionEnvPlanStatus}
          supabaseBootstrapPlan={supabaseBootstrapPlan}
          supabaseBootstrapPlanStatus={supabaseBootstrapPlanStatus}
          supabaseSchemaArtifact={supabaseSchemaArtifact}
          supabaseTargetSeedArtifact={supabaseTargetSeedArtifact}
          accountCloudSyncArtifact={accountCloudSyncArtifact}
          dataBootstrapPlan={dataBootstrapPlan}
          dataBootstrapPlanStatus={dataBootstrapPlanStatus}
          dataProviderArtifact={dataProviderArtifact}
          dataScoutArtifact={dataScoutArtifact}
          filecoinBootstrapPlan={filecoinBootstrapPlan}
          filecoinBootstrapPlanStatus={filecoinBootstrapPlanStatus}
          filecoinSealArtifact={filecoinSealArtifact}
          cloudflarePagesDeployPlan={cloudflarePagesDeployPlan}
          leaderboardBackendArtifact={leaderboardBackendArtifact}
          leaderboardBackendStatus={leaderboardBackendStatus}
          publicRestoreArtifact={publicRestoreArtifact}
          shareChannelArtifact={shareChannelArtifact}
          shareChannelArtifactStatus={shareChannelArtifactStatus}
          recordShareImageUploadArtifact={recordShareImageUploadArtifact}
          modeShareImageUploadArtifact={modeShareImageUploadArtifact}
          runtimeConfigReadiness={runtimeConfigReadiness}
          runtimeConfigSummary={runtimeConfigSummary}
          intelligenceEnrichmentEvidence={intelligenceEnrichmentEvidence}
          dataContinuityEvidence={dataContinuityEvidence}
          onEmail={setAccountEmail}
          onProfile={updateProfile}
          onMagicLink={requestMagicLink}
          onGoogleSignIn={requestGoogleSignIn}
          onSync={syncToCloud}
          onPull={pullCloudHistory}
          onSaveProfile={saveCloudProfile}
          onSignOut={signOut}
          onOpenProfile={openPublicProfile}
          onCopyProfileLink={() => copyProfileLink()}
          onCopyFriendInvite={copyFriendInviteLink}
          onPublishMissingShareCards={publishMissingShareCards}
          onOpenMissingShareChannels={openMissingShareChannels}
          onSealMissingFilecoinLanes={() => void sealMissingFilecoinLanes()}
        />
      )}
      {utilityPanel && (
        <UtilityDrawer
          mode={utilityPanel}
          cloudState={cloudState}
          profile={profile}
          providerHealth={providerHealth}
          forceFallback={forceFallback}
          leaderboardScope={leaderboardScope}
          productionReadiness={productionReadiness}
          productionSummary={productionSummary}
          onClose={() => setUtilityPanel(null)}
          onForceFallback={setForceFallback}
          onLeaderboardScope={changeLeaderboardScope}
          onRefreshMatches={() => void refreshMatches()}
          onSync={syncToCloud}
          onOpenAccount={() => {
            setView("account");
            setUtilityPanel(null);
          }}
        />
      )}
    </main>
  );
}

type RevealPanelProps = {
  match: Match;
  record: MemoryRecord;
  actualHome: number;
  actualAway: number;
  actualKeyPlayers: string;
  onHome: (value: number) => void;
  onAway: (value: number) => void;
  onKeys: (value: string) => void;
  onReveal: () => void;
};

function LockWindow({
  match,
  lockState,
}: {
  match: Match;
  lockState?: ReturnType<typeof getLockState>;
}) {
  const seconds = lockState?.secondsLeft ?? 0;
  return (
    <div className={`lock-window lock-${lockState?.state ?? "open"}`}>
      <div>
        <Timer size={18} />
        <span>Kickoff countdown</span>
        <strong>{seconds > 0 ? formatCountdown(seconds) : "Closed"}</strong>
      </div>
      <div>
        <ShieldCheck size={18} />
        <span>Server-time rule</span>
        <strong>{lockState?.state === "closed" ? "No late seals" : "Pre-kickoff only"}</strong>
      </div>
      <div>
        <Radar size={18} />
        <span>Venue</span>
        <strong>{match.venue ?? "TBD"}</strong>
      </div>
    </div>
  );
}

function ProviderReadiness({ items }: { items: ProviderReadinessItem[] }) {
  return (
    <div className="provider-readiness" aria-label="Live data readiness">
      <div>
        <strong>Live data readiness</strong>
        <span>{items.filter((item) => item.status === "live" || item.status === "configured").length}/{items.length}</span>
      </div>
      {items.map((item) => (
        <article key={item.key} className={`readiness-${item.status}`}>
          <CheckCircle2 size={15} />
          <span>{item.label}</span>
          <b>{item.status}</b>
          <small>{item.source} · {item.detail}</small>
        </article>
      ))}
    </div>
  );
}

function ProviderHealthPanel({ health }: { health: ProviderHealthSnapshot }) {
  return (
    <div className={`provider-health-audit health-${health.status}`} aria-label="Realtime data health">
      <div>
        <strong>Realtime data health</strong>
        <span>{health.status}</span>
      </div>
      <div className="provider-health-metrics">
        <span>{health.fresh ? "fresh" : "stale/pending"}</span>
        <span>{health.responseVerified ? "response verified" : "response unverified"}</span>
        <span>{health.liveOrConfigured}/{health.totalSignals} signals</span>
        <span>{health.activeRoute ?? "no route"}</span>
      </div>
      {health.responseAudit && (
        <small>
          Response: {health.responseAudit.endpoint} · {health.responseAudit.status} · {health.responseAudit.rowCount} rows
        </small>
      )}
      {health.enrichmentAudit && (
        <small>
          Enrichment: {health.enrichmentAudit.detail}
        </small>
      )}
      <div className="provider-enrichment-matrix" aria-label="Provider enrichment endpoint matrix">
        {(health.enrichmentMatrix ?? []).map((endpoint) => (
          <article key={endpoint.key} className={endpoint.ready ? "ready" : "pending"}>
            <span>{endpoint.label}</span>
            <b>{endpoint.ready ? "ready" : "pending"}</b>
            <small>
              {endpoint.live}/{endpoint.attempted} live · {endpoint.fulfilled}/{endpoint.attempted} fulfilled · {endpoint.errors} errors
            </small>
            <small>{endpoint.endpoint}</small>
          </article>
        ))}
      </div>
      <small>{health.detail}</small>
      {health.missingSignals.length > 0 && <p>Missing: {health.missingSignals.join(", ")}</p>}
      <p>{health.nextAction}</p>
    </div>
  );
}

function DataContinuityEvidencePanel({ packet }: { packet: DataContinuityEvidencePacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div
      className={`data-continuity-evidence ${packet.continuityReady ? "continuity-ready" : "continuity-partial"}`}
      aria-label="Free data continuity evidence"
    >
      <div className="panel-head">
        <div>
          <p className="eyebrow">Free data continuity</p>
          <h3>Schedule and score fallback chain</h3>
        </div>
        <button onClick={copyPacket}>
          <Database size={16} /> {copyStatus === "copied" ? "Copied continuity" : copyStatus === "manual" ? "Continuity text shown" : "Copy continuity"}
        </button>
      </div>
      <div className="data-continuity-summary">
        <div><span>External</span><strong>{packet.externalMatches}</strong></div>
        <div><span>Seed</span><strong>{packet.seedMatches}</strong></div>
        <div><span>Schedule</span><strong>{packet.scheduleReady}/{packet.totalMatches}</strong></div>
        <div><span>Scores</span><strong>{packet.scoreReady}/{packet.totalMatches}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Active route: {packet.activeRoute}</small>
      <small>Next action: {packet.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="data-continuity-copy">
          <span>Manual continuity copy</span>
          <textarea
            aria-label="Manual continuity copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="data-continuity-checks">
        {packet.checks.map((check) => (
          <article key={check.key} className={`continuity-${check.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{check.label}</strong>
              <span>{check.status}</span>
            </div>
            <small>{check.detail}</small>
            <p>{check.status === "passed" ? "Evidence available." : check.action}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function RealtimeDataAuditPanel({ audit }: { audit: RealtimeDataAudit }) {
  return (
    <div className={`realtime-data-audit ${audit.productionReady ? "audit-ready" : "audit-partial"}`} aria-label="Realtime data evidence">
      <div className="audit-head">
        <div>
          <strong>Realtime evidence packet</strong>
          <span>{audit.sourceLabel} · {audit.routeStatus}</span>
        </div>
        <b>{audit.productionReady ? "production-ready" : "evidence-only"}</b>
      </div>
      <div className="audit-metrics">
        <span>{audit.matchCount} matches</span>
        <span>{audit.liveMatches} live</span>
        <span>{audit.finishedMatches} final</span>
        <span>{audit.upcomingMatches} upcoming</span>
        <span>{audit.responseVerified ? "response verified" : "response unverified"}</span>
      </div>
      <small>Checked {formatDate(audit.checkedAt)}</small>
      {audit.responseAudit && (
        <small>
          Provider response: {audit.responseAudit.endpoint} · {audit.responseAudit.status} · {audit.responseAudit.rowCount} rows · samples {audit.responseAudit.sampleIds.join(", ") || "none"}
        </small>
      )}
      {audit.enrichmentAudit && (
        <div className="audit-enrichment">
          <small>Enrichment read-back: {audit.enrichmentAudit.detail}</small>
          {audit.enrichmentAudit.endpointAudits.map((endpoint) => (
            <small key={endpoint.key}>
              {endpoint.key}: {endpoint.live}/{endpoint.attempted} live · {endpoint.endpoint}
            </small>
          ))}
        </div>
      )}
      {audit.warning && <p>{audit.warning}</p>}
      {audit.missingSignals.length > 0 && <p>Weak signals: {audit.missingSignals.join(", ")}</p>}
      <div className="audit-signal-grid">
        {audit.signals.map((signal) => (
          <article key={signal.key} className={`readiness-${signal.bestStatus}`}>
            <span>{signal.label}</span>
            <b>{signal.bestStatus}</b>
            <small>
              {signal.bestSource} · live {signal.live} · configured {signal.configured} · fallback {signal.fallback} · missing {signal.missing + signal.manual}/{signal.total}
            </small>
          </article>
        ))}
      </div>
      <div className="audit-samples">
        {audit.samples.map((sample) => (
          <article key={sample.id}>
            <span>{sample.label}</span>
            <b>{sample.liveOrConfigured}/6</b>
            <small>{sample.status} · {sample.missing.length > 0 ? `missing ${sample.missing.join(", ")}` : "full signal coverage"}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function PublicFreeFeedProofPanel({ artifact }: { artifact: DataProviderReadinessArtifact }) {
  const proof = artifact.targets.publicFreeFeedReadBack;
  const feeds = [
    { label: "openfootball", item: proof?.openfootball },
    { label: "TheSportsDB events", item: proof?.theSportsDb },
    { label: "TheSportsDB table", item: proof?.theSportsDbTable },
  ];
  return (
    <div
      className={`realtime-data-audit ${artifact.acceptance.publicFreeFeedReadBack ? "audit-ready" : "audit-partial"}`}
      aria-label="Public free feed read-back"
    >
      <div className="audit-head">
        <div>
          <strong>Public feed read-back</strong>
          <span>{proof?.checkedAt ? `Checked ${formatDate(proof.checkedAt)}` : "not checked"}</span>
        </div>
        <b>{artifact.acceptance.publicFreeFeedReadBack ? "verified" : "pending"}</b>
      </div>
      <div className="audit-signal-grid">
        {feeds.map(({ label, item }) => (
          <article key={label} className={`readiness-${item?.ok ? "live" : "missing"}`}>
            <span>{label}</span>
            <b>{item?.ok ? "live" : "missing"}</b>
            <small>
              HTTP {item?.status ?? 0} · {item?.rowCount ?? 0} rows · {item?.detail ?? "not checked"}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProviderRouteAudit({ items }: { items: ProviderRouteAuditItem[] }) {
  if (items.length === 0) return null;
  const active = items.find((item) => item.status === "active" || item.status === "fallback");
  return (
    <div className="provider-route-audit" aria-label="Provider route audit">
      <div>
        <strong>Provider route audit</strong>
        <span>{active ? `${active.label} serving` : "no live route"}</span>
      </div>
      {items.map((item) => (
        <article key={item.key} className={`route-${item.status}`}>
          <div>
            <span>{item.label}</span>
            <b>{item.status}</b>
          </div>
          <small>{item.configured ? "configured" : "needs env"} · {item.detail}</small>
        </article>
      ))}
    </div>
  );
}

function MatchIntelligence({ match, onEnrich }: { match: Match; onEnrich: () => void }) {
  const insights = match.insights;
  const dataCoverage = insights?.dataCoverage ?? buildDataCoverage(match);
  const intelScore = buildMatchIntelligenceScore(match);
  const evidencePacket = buildMatchDataEvidencePacket(match);
  const provenancePacket = buildMatchIntelligenceProvenancePacket(match);
  return (
    <div className="intel-panel">
      <div className="intel-head">
        <div>
          <p className="eyebrow">Match intelligence</p>
          <h3>{insights ? "Data brief" : "Provider coverage"}</h3>
        </div>
        <div className="intel-actions">
          <span>{insights?.dataFreshness ?? `${sourceLabel(match.dataSource)} basic provider pack`}</span>
          <button onClick={onEnrich}>
            <Radar size={15} /> Enrich
          </button>
        </div>
      </div>
      <div className={`intel-score intel-${intelScore.level}`} aria-label="Match intelligence score">
        <div>
          <span>Intelligence score</span>
          <strong>{intelScore.score}/100</strong>
        </div>
        <div>
          <span>{intelScore.label}</span>
          <p>{intelScore.detail}</p>
        </div>
      </div>
      <div className="coverage-grid" aria-label="Data coverage">
        {dataCoverage.map((item) => (
          <article key={item.key} className={`coverage-${item.status}`}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <b>{item.source}</b>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>
      <MatchDataEvidenceCard packet={evidencePacket} />
      <MatchIntelligenceProvenanceCard packet={provenancePacket} />
      {insights ? (
        <>
          <div className="intel-grid">
            <div>
              <strong>{match.homeTeam}</strong>
              <span>{insights.home.tablePosition ? `Table #${insights.home.tablePosition}` : `Rank signal #${insights.home.fifaRank}`}</span>
              <b>{insights.home.form.join(" ")}</b>
              {insights.home.tablePoints !== undefined && <small>{insights.home.tablePoints} pts · {insights.home.tableRecord}</small>}
              <small>GF/GA last five: {insights.home.lastFiveGoalsFor}/{insights.home.lastFiveGoalsAgainst}</small>
              <small>{insights.home.unavailable.join(", ")}</small>
            </div>
            <div>
              <strong>{match.awayTeam}</strong>
              <span>{insights.away.tablePosition ? `Table #${insights.away.tablePosition}` : `Rank signal #${insights.away.fifaRank}`}</span>
              <b>{insights.away.form.join(" ")}</b>
              {insights.away.tablePoints !== undefined && <small>{insights.away.tablePoints} pts · {insights.away.tableRecord}</small>}
              <small>GF/GA last five: {insights.away.lastFiveGoalsFor}/{insights.away.lastFiveGoalsAgainst}</small>
              <small>{insights.away.unavailable.join(", ")}</small>
            </div>
          </div>
          <div className="intel-notes">
            <p><b>Ranking</b>{insights.rankingSource ?? "Ranking source not attached"}</p>
            {insights.standingsSource && <p><b>Standings</b>{insights.standingsSource}</p>}
            <p><b>H2H</b>{insights.headToHead}</p>
            <p><b>Market</b>{insights.marketLine}</p>
            <p><b>Odds</b>{insights.oddsSnapshot ?? "Waiting for odds source"}</p>
            <p><b>Lineup</b>{insights.lineupSource ?? "Fallback lineup pack"}</p>
            <p><b>Injury</b>{insights.injurySource ?? "Fallback injury pack"}</p>
          </div>
          <div className="intel-actions-needed" aria-label="Intelligence action plan">
            <strong>Action plan</strong>
            {intelScore.suggestions.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </>
      ) : (
        <p className="coverage-note">This provider gives enough metadata to lock a capsule, but lineup, injury and odds feeds need configured enrichment.</p>
      )}
    </div>
  );
}

function MatchIntelligenceProvenanceCard({ packet }: { packet: MatchIntelligenceProvenancePacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <section className={`match-provenance ${packet.productionReady ? "passed" : ""}`} aria-label="Match intelligence provenance">
      <div className="match-provenance-head">
        <div>
          <strong>Endpoint provenance</strong>
          <span>{packet.readySignals}/{packet.totalSignals} auditable signals</span>
        </div>
        <button onClick={copyPacket}>
          <Link2 size={15} /> {copyStatus === "copied" ? "Copied provenance" : copyStatus === "manual" ? "Provenance text shown" : "Copy provenance"}
        </button>
      </div>
      <p>{packet.summary}</p>
      <div className="match-provenance-facts">
        <span>{packet.provider}</span>
        <span>{packet.providerId}</span>
        <span>{packet.liveEndpoints} live endpoints</span>
      </div>
      <small>Next action: {packet.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="match-provenance-copy">
          <span>Manual provenance copy</span>
          <textarea
            aria-label="Manual provenance copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="match-provenance-grid">
        {packet.items.map((item) => (
          <article key={item.key} className={item.productionReady ? "ready" : "gap"}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <code>{item.endpoint}</code>
            <small>{item.source} · {item.detail}</small>
            <small>Sample: {item.sample}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function MatchDataEvidenceCard({ packet }: { packet: MatchDataEvidencePacket }) {
  const missingText = packet.missingSignals.length > 0 ? packet.missingSignals.join(", ") : "none";
  const fallbackText = packet.fallbackSignals.length > 0 ? packet.fallbackSignals.join(", ") : "none";

  return (
    <section className="match-data-evidence" aria-label="Match data evidence">
      <div className="match-data-evidence-head">
        <div>
          <strong>Match data evidence</strong>
          <span>{packet.readySignals}/{packet.totalSignals} production signals</span>
        </div>
        <b>{packet.score}/100</b>
      </div>
      <p>{packet.summary}</p>
      <div className="match-data-evidence-facts">
        <span>{packet.source}</span>
        <span>{packet.status}</span>
        <span>{packet.level}</span>
        <span>{formatDate(packet.kickoffAt)}</span>
      </div>
      <div className="match-data-evidence-gaps">
        <small>Missing: {missingText}</small>
        <small>Fallback: {fallbackText}</small>
        <small>Next action: {packet.nextAction}</small>
      </div>
      <div className="match-data-evidence-signals" aria-label="Fixture signal states">
        {packet.signals.map((signal) => (
          <span key={signal.key} className={`coverage-${signal.status}`}>
            {signal.label}: {signal.status}
          </span>
        ))}
      </div>
    </section>
  );
}

function MarketBuilder({
  markets,
  locked,
  onUpdate,
}: {
  markets: PredictionDraft["markets"];
  locked: boolean;
  onUpdate: (index: number, patch: Partial<PredictionDraft["markets"][number]>) => void;
}) {
  return (
    <div className="market-builder">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Multi-market lock</p>
          <h3>Prediction markets</h3>
        </div>
        <span className="pill">4 picks</span>
      </div>
      <div className="market-grid">
        {markets.map((market, index) => (
          <article key={market.id}>
            <label>
              <span>{market.label}</span>
              <input
                value={market.pick}
                disabled={locked}
                onChange={(event) => onUpdate(index, { pick: event.target.value })}
              />
            </label>
            <label>
              <span>Confidence</span>
              <input
                type="range"
                min="1"
                max="100"
                value={market.confidence}
                disabled={locked}
                onChange={(event) => onUpdate(index, { confidence: Number(event.target.value) })}
              />
              <b>{market.confidence}%</b>
            </label>
            <label>
              <span>Rationale</span>
              <textarea
                value={market.rationale}
                disabled={locked}
                onChange={(event) => onUpdate(index, { rationale: event.target.value })}
              />
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}

function RevealPanel({
  match,
  record,
  actualHome,
  actualAway,
  actualKeyPlayers,
  onHome,
  onAway,
  onKeys,
  onReveal,
}: RevealPanelProps) {
  const result = record.result;
  return (
    <div className="reveal-box">
      <div className="panel-head">
        <div>
          <p className="eyebrow">After the whistle</p>
          <h3>Reveal & score</h3>
        </div>
        {result && <span className="score-badge">{result.totalScore}/100</span>}
      </div>
      <div className="score-inputs">
        <label>
          <span>{match.homeTeam} actual</span>
          <input type="number" min="0" value={actualHome} onChange={(e) => onHome(Number(e.target.value))} />
        </label>
        <label>
          <span>{match.awayTeam} actual</span>
          <input type="number" min="0" value={actualAway} onChange={(e) => onAway(Number(e.target.value))} />
        </label>
      </div>
      <label>
        <span>Result notes / key players</span>
        <input value={actualKeyPlayers} onChange={(e) => onKeys(e.target.value)} placeholder="Comma-separated notes" />
      </label>
      <button className="primary" onClick={onReveal}>
        <Gauge size={18} /> Reveal & score
      </button>
      {result && (
        <div className="breakdown">
          {Object.entries(result.breakdown).map(([key, value]) => (
            <span key={key}>{key}: {value}</span>
          ))}
          {result.explanation.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <div className="agent-review">
            <strong>Agent review</strong>
            {(result.agentReview ?? ["Legacy result: re-run reveal to generate agent review."]).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ProofPanelProps = {
  record: MemoryRecord;
  match?: Match;
  proofJson: string;
  onProofJson: (value: string) => void;
  onImport: () => void;
  onCopy: () => void;
  onCopyProofLink: () => void;
  onOpenProofView: () => void;
  onSeal: () => void;
  onShareImage: () => void;
  onTwitter: () => void;
  shareImageUrl: string;
};

type SealAcceptanceCheck = {
  label: string;
  detail: string;
  passed: boolean;
};

const buildSealAcceptanceChecks = (sealJob: SealJob, fallbackCid: string): SealAcceptanceCheck[] => {
  const uploadStep = sealJob.steps.find((step) => step.id === "upload");
  const pollStep = sealJob.steps.find((step) => step.id === "poll");
  const backendHealth = sealJob.backendHealth;
  const latestPoll = sealJob.pollLog?.at(-1);
  const latestUploadStatus = sealJob.uploadStatusLog?.at(-1);
  return [
    {
      label: "Backend configured",
      detail: sealJob.endpoint ?? "missing VITE_FILECOIN_SEAL_API",
      passed: Boolean(sealJob.endpoint),
    },
    {
      label: "Health check",
      detail:
        sealJob.healthStatus === "ready"
          ? "seal API ready"
          : sealJob.endpoint
            ? sealJob.error ?? "unchecked"
            : "missing VITE_FILECOIN_SEAL_API",
      passed: sealJob.healthStatus === "ready",
    },
    {
      label: "Production backend",
      detail: backendHealth
        ? sealBackendProductionReady(backendHealth)
          ? "real Synapse + token + persistent registry"
          : backendHealth.blockers?.join(", ") || "health response did not declare production readiness"
        : "waiting for health response",
      passed: sealBackendProductionReady(backendHealth),
    },
    {
      label: "Upload accepted",
      detail: sealJob.backendJobId
        ? `${sealJob.backendJobId} · ${latestUploadStatus?.status ?? "submitted"}`
        : uploadStep?.status ?? "queued",
      passed: uploadStep?.status === "passed",
    },
    {
      label: "Upload status polled",
      detail: sealJob.uploadStatusPolls
        ? `${sealJob.uploadStatusPolls} job poll${sealJob.uploadStatusPolls > 1 ? "s" : ""} · ${latestUploadStatus?.detail ?? "checked"}`
        : sealJob.backendJobId
          ? "waiting for job status"
          : "sync seal response",
      passed: Boolean(sealJob.uploadStatusPolls || (!sealJob.backendJobId && sealJob.proof?.cid)),
    },
    {
      label: "CID returned",
      detail: sealJob.proof?.cid ?? fallbackCid,
      passed: sealJob.proof?.mode === "real",
    },
    {
      label: "Payload hash match",
      detail:
        sealJob.uploadPayloadHash && sealJob.proof?.payloadHash
          ? `${sealJob.proof.payloadHash.slice(0, 12)}... · ${sealJob.uploadByteLength ?? sealJob.proof.byteLength ?? 0} bytes`
          : "waiting for seal API payload hash",
      passed: Boolean(
        sealJob.uploadPayloadHash &&
          sealJob.proof?.payloadHash &&
          sealJob.uploadPayloadHash === sealJob.proof.payloadHash,
      ),
    },
    {
      label: "Verification polled",
      detail: sealJob.pollAttempts
        ? `${sealJob.pollAttempts} attempt${sealJob.pollAttempts > 1 ? "s" : ""} · ${
            latestPoll ? `${latestPoll.status}${latestPoll.proofStatus ? `/${latestPoll.proofStatus}` : ""}` : "checked"
          }`
        : pollStep?.status ?? "not started",
      passed: Boolean(sealJob.lastCheckedAt),
    },
    {
      label: "Verifier URL",
      detail: sealJob.verifyUrl ?? "waiting for CID",
      passed: Boolean(sealJob.verifyUrl),
    },
    {
      label: "Backend mode",
      detail: backendHealth
        ? backendHealth.mockMode
          ? "mock seal API for smoke tests"
          : backendHealth.hasPrivateKey
            ? "real Synapse backend"
            : "private key missing"
        : "waiting for health response",
      passed: Boolean(backendHealth && !backendHealth.mockMode && backendHealth.hasPrivateKey),
    },
    {
      label: "Proof registry",
      detail: backendHealth
        ? `${backendHealth.persistence ?? "unknown"} storage · ${backendHealth.proofCount ?? 0} registered`
        : "waiting for health response",
      passed: backendHealth?.persistence === "file",
    },
    {
      label: "Registry read-back",
      detail:
        sealJob.proofRegistryStatus === "verified"
          ? `${sealJob.proofRegistryHash?.slice(0, 12) ?? "hash"}... · ${sealJob.proofRegistryCheckedAt ? formatDate(sealJob.proofRegistryCheckedAt) : "checked"}`
          : sealJob.proofRegistryStatus === "failed"
            ? sealJob.error ?? "registry read-back failed"
            : "waiting for /proof/:cid read-back",
      passed:
        sealJob.proofRegistryStatus === "verified" &&
        sealJob.proofRegistryHash === sealJob.uploadPayloadHash,
    },
    {
      label: "Upload auth",
      detail: backendHealth ? (backendHealth.authRequired ? "bearer token required" : "token not required") : "waiting for health response",
      passed: backendHealth?.authRequired === true,
    },
    {
      label: "Upload limit",
      detail: backendHealth?.maxUploadBytes ? `${Math.round(backendHealth.maxUploadBytes / 1024)} KB max` : "waiting for health response",
      passed: Boolean(backendHealth?.maxUploadBytes),
    },
  ];
};

function SealWorkflowPanel({
  job,
  fallbackCid,
  title = "Auto seal status",
  eyebrow = "Synapse workflow",
  compact = false,
}: {
  job: SealJob;
  fallbackCid: string;
  title?: string;
  eyebrow?: string;
  compact?: boolean;
}) {
  const sealChecks = buildSealAcceptanceChecks(job, fallbackCid);
  const evidencePacket = buildSealEvidencePacket(job);
  return (
    <div className={`seal-steps ${compact ? "compact" : ""}`}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <span className={`pill seal-${job.status}`}>{job.status}</span>
      </div>
      <div className="seal-checklist" aria-label={`${title} acceptance checks`}>
        {sealChecks.map((check) => (
          <div key={check.label} className={check.passed ? "passed" : ""}>
            <CheckCircle2 size={16} />
            <span>{check.label}</span>
            <strong>{check.detail}</strong>
          </div>
        ))}
      </div>
      <SealEvidencePacketCard packet={evidencePacket} />
      {job.uploadStatusLog && job.uploadStatusLog.length > 0 && (
        <div className="seal-poll-log" aria-label={`${title} upload status poll log`}>
          {job.uploadStatusLog.slice(-5).map((attempt) => (
            <div key={`${attempt.attempt}-${attempt.checkedAt}`} className={attempt.status === "verified" ? "passed" : ""}>
              <Clock3 size={14} />
              <span>Job poll {attempt.attempt}</span>
              <strong>{attempt.status}</strong>
              <small>{attempt.httpStatus ? `HTTP ${attempt.httpStatus} · ` : ""}{attempt.detail}</small>
            </div>
          ))}
        </div>
      )}
      {job.pollLog && job.pollLog.length > 0 && (
        <div className="seal-poll-log" aria-label={`${title} verification poll log`}>
          {job.pollLog.slice(-5).map((attempt) => (
            <div key={`${attempt.attempt}-${attempt.checkedAt}`} className={attempt.status === "verified" || attempt.status === "retrievable" ? "passed" : ""}>
              <Clock3 size={14} />
              <span>Attempt {attempt.attempt}</span>
              <strong>{attempt.status}{attempt.proofStatus ? ` · ${attempt.proofStatus}` : ""}</strong>
              <small>{attempt.httpStatus ? `HTTP ${attempt.httpStatus} · ` : ""}{attempt.detail}</small>
            </div>
          ))}
        </div>
      )}
      {job.steps.map((step) => (
        <article key={step.id}>
          <CheckCircle2 size={16} />
          <div>
            <strong>{step.label}</strong>
            <span>{step.detail}</span>
          </div>
          <b>{step.status}</b>
        </article>
      ))}
      {(job.proofUrl || job.verifyUrl) && (
        <div className="seal-links">
          {job.proofUrl && <a href={job.proofUrl} target="_blank" rel="noreferrer">Proof metadata</a>}
          {job.verifyUrl && <a href={job.verifyUrl} target="_blank" rel="noreferrer">Verify CID</a>}
        </div>
      )}
    </div>
  );
}

function SealEvidencePacketCard({ packet }: { packet: SealEvidencePacket }) {
  const copyPacket = async () => {
    await navigator.clipboard?.writeText(packet.copyText);
  };
  return (
    <section className={`seal-evidence-packet ${packet.productionReady ? "ready" : ""}`} aria-label="Filecoin seal evidence packet">
      <div className="seal-evidence-head">
        <div>
          <strong>Filecoin seal evidence packet</strong>
          <span>{packet.summary}</span>
        </div>
        <button onClick={copyPacket}>
          <FileCheck2 size={15} /> Copy seal evidence
        </button>
      </div>
      <div className="seal-evidence-grid">
        <span>{packet.cid ?? "CID pending"}</span>
        <span>{packet.passedSteps}/{packet.totalSteps} steps</span>
        <span>{packet.uploadStatusPolls} upload job polls</span>
        <span>{packet.pollAttempts} poll attempts</span>
        <span>{packet.backendProductionReady ? "production backend" : "backend pending"}</span>
        <span>{packet.uploadStatusComplete ? "upload complete" : "upload pending"}</span>
        <span>{packet.verificationPollingComplete ? "verify complete" : "verify pending"}</span>
        <span>{packet.registryReadBackComplete ? "registry complete" : "registry pending"}</span>
      </div>
      <small>Next action: {packet.nextAction}</small>
      {packet.blockers.length > 0 && <small>Blockers: {packet.blockers.join(", ")}</small>}
    </section>
  );
}

function ProofPanel({
  record,
  match,
  proofJson,
  onProofJson,
  onImport,
  onCopy,
  onCopyProofLink,
  onOpenProofView,
  onSeal,
  onShareImage,
  onTwitter,
  shareImageUrl,
}: ProofPanelProps) {
  const { capsule, result } = record;
  return (
    <>
      <div className="panel-head">
        <div>
          <p className="eyebrow">Filecoin capsule</p>
          <h2>Proof panel</h2>
        </div>
        <span className={`pill ${capsule.filecoinProof.mode}`}>{capsule.filecoinProof.mode} proof</span>
      </div>
      <div className="proof-lines">
        <p><b>CID</b><span>{capsule.filecoinProof.cid}</span></p>
        <p><b>PieceCID</b><span>{capsule.filecoinProof.pieceCid}</span></p>
        <p><b>Hash</b><span>{capsule.payloadHash}</span></p>
        <p><b>Sealed</b><span>{capsule.sealedAt ? formatDate(capsule.sealedAt) : "Draft"}</span></p>
        <p><b>Status</b><span>{capsule.filecoinProof.proofStatus}</span></p>
        <p><b>Public URL</b><span>{proofUrl(capsule.id)}</span></p>
      </div>
      <div className="proof-card" id="proof-card">
        <div className="proof-card-top">
          <span>Kickoff Lock</span>
          {capsule.lateLock ? <span className="late">Late practice</span> : <span>Sealed before kickoff</span>}
        </div>
        <h3>{capsule.matchLabel}</h3>
        <div className="versus">
          <div>
            <small>Prediction</small>
            <strong>{capsule.prediction.homeScore}-{capsule.prediction.awayScore}</strong>
          </div>
          <div>
            <small>Actual</small>
            <strong>{result ? `${result.homeScore}-${result.awayScore}` : "Pending"}</strong>
          </div>
          <div>
            <small>Score</small>
            <strong>{result ? `${result.totalScore}/100` : "--"}</strong>
          </div>
        </div>
        <div className="proof-markets">
          {(capsule.prediction.markets ?? []).map((market) => (
            <span key={market.id}>{market.label}: {market.pick}</span>
          ))}
        </div>
        <p>{capsule.prediction.agentSummary}</p>
        <code>{capsule.filecoinProof.cid}</code>
      </div>
      <div className="proof-actions">
        <button onClick={onCopy}>
          <Activity size={18} /> Copy share text
        </button>
        <button onClick={onCopyProofLink}>
          <Link2 size={18} /> Copy proof link
        </button>
        <button onClick={onOpenProofView}>
          <ShieldCheck size={18} /> Open verifier
        </button>
        <button onClick={onSeal}>
          <UploadCloud size={18} /> Auto seal to Filecoin
        </button>
        <button onClick={onShareImage}>
          <ImageDown size={18} /> Generate share image
        </button>
        <button onClick={onTwitter}>
          <Users size={18} /> Share to X
        </button>
      </div>
      {record.sealJob && <SealWorkflowPanel job={record.sealJob} fallbackCid={capsule.filecoinProof.cid} />}
      {shareImageUrl && (
        <div className="share-preview">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Generated share card</p>
              <h3>Social image</h3>
            </div>
            <a href={shareImageUrl} download={`${capsule.id}-share-card.png`}>
              <Download size={16} /> Download
            </a>
          </div>
          <img src={shareImageUrl} alt="Generated share card preview" />
        </div>
      )}
      <details>
        <summary>Import real proof JSON</summary>
        <textarea value={proofJson} onChange={(event) => onProofJson(event.target.value)} placeholder='{"cid":"...","pieceCid":"...","provider":"...","dataSetId":"...","proofStatus":"verified"}' />
        <button onClick={onImport}>Apply real proof</button>
      </details>
      <details>
        <summary>Sealed JSON</summary>
        <pre>{stableJson({ capsule, match })}</pre>
      </details>
    </>
  );
}

function MemoryDashboard({
  profile,
  records,
  averageScore,
  bestRecord,
  currentRank,
  currentXp,
  currentStreak,
  leaderboardEntries,
  leaderboardSeasonEntries,
  leaderboardReadiness,
  leaderboardScopeEvidence,
  leaderboardScope,
  cloudState,
  onLeaderboardScope,
}: {
  profile: ReturnType<typeof loadProfile>;
  records: MemoryRecord[];
  averageScore: number;
  bestRecord?: MemoryRecord;
  currentRank: number;
  currentXp: number;
  currentStreak: number;
  leaderboardEntries: LeaderboardEntry[];
  leaderboardSeasonEntries: LeaderboardEntry[];
  leaderboardReadiness: LeaderboardReadinessItem[];
  leaderboardScopeEvidence: LeaderboardScopeEvidence[];
  leaderboardScope: LeaderboardScope;
  cloudState: CloudSyncState;
  onLeaderboardScope: (scope: LeaderboardScope) => void;
}) {
  const revealed = records.filter((record) => record.result);
  const leaderboard = leaderboardEntries.slice(0, 8);
  const leaderboardPacket = buildLeaderboardEvidencePacket(profile, leaderboardScopeEvidence);
  const leaderboardSeasonPacket = buildLeaderboardSeasonEvidencePacket({
    profile,
    entries: leaderboardSeasonEntries,
    evidence: leaderboardScopeEvidence,
  });
  return (
    <section className="memory panel">
      <div
        className="memory-hero"
        style={imageLayer(
          "memory-wall.jpg",
          "linear-gradient(90deg, rgba(3, 14, 14, 0.86) 0%, rgba(3, 14, 14, 0.62) 55%, rgba(3, 14, 14, 0.18) 100%)",
        )}
      >
        <div>
          <span>Tournament memory</span>
          <strong>Every locked call becomes part of the run.</strong>
        </div>
      </div>
      <div className="panel-head">
        <div>
          <p className="eyebrow">Tournament memory</p>
          <h2>Verifiable prediction archive</h2>
        </div>
        <span className="pill">{revealed.length} revealed</span>
      </div>
      <div className="memory-stats">
        <div><strong>{records.length}</strong><span>sealed</span></div>
        <div><strong>{averageScore}</strong><span>average</span></div>
        <div><strong>{bestRecord?.result?.totalScore ?? "--"}</strong><span>best</span></div>
        <div><strong>{currentStreak}</strong><span>winner streak</span></div>
        <div><strong>#{currentRank}</strong><span>agent rank</span></div>
        <div><strong>{currentXp}</strong><span>XP</span></div>
      </div>
      <div className="leaderboard">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Leaderboard</p>
            <h3>{leaderboardScope} proof cards</h3>
          </div>
          <span className={`pill cloud-${cloudState.status}`}>
            {cloudState.configured ? cloudState.status : "local preview"}
          </span>
        </div>
        <div className="scope-switch" aria-label="Leaderboard scope">
          {(["global", "friend", "season"] as const).map((scope) => (
            <button
              key={scope}
              className={leaderboardScope === scope ? "active" : ""}
              onClick={() => onLeaderboardScope(scope)}
            >
              {scope}
            </button>
          ))}
        </div>
        <div className="leaderboard-summary">
          <div>
            <span>Scope</span>
            <strong>{leaderboardScope}</strong>
          </div>
          <div>
            <span>Rows</span>
            <strong>{leaderboard.length}</strong>
          </div>
          <div>
            <span>Proof source</span>
            <strong>{cloudState.configured ? "Supabase" : "local"}</strong>
          </div>
        </div>
        <div className="leaderboard-readiness" aria-label="Leaderboard backend readiness">
          {leaderboardReadiness.map((item) => (
            <div key={item.key} className={item.passed ? "passed" : ""}>
              <CheckCircle2 size={15} />
              <span>{item.label}</span>
              <strong>{item.detail}</strong>
            </div>
          ))}
        </div>
        <LeaderboardEvidencePacketCard packet={leaderboardPacket} />
        <LeaderboardSeasonEvidencePanel packet={leaderboardSeasonPacket} />
        <LeaderboardEvidencePanel evidence={leaderboardScopeEvidence} profileId={profile.id} />
        {leaderboard.length === 0 && <p>No leaderboard rows yet. Sync a revealed proof to populate this scope.</p>}
        {leaderboard.map((entry, index) => (
          <article key={entry.id}>
            <b>#{entry.rank ?? index + 1}</b>
            <div>
              <strong>{entry.displayName}</strong>
              <span>{entry.location} · {entry.source}{entry.friendCode ? ` · ${entry.friendCode}` : ""}</span>
            </div>
            <div className="leaderboard-metrics">
              <span><strong>{entry.xp}</strong> XP</span>
              <span>{entry.locks} locks</span>
              <span>{entry.revealed} revealed</span>
              <span>{entry.averageScore} avg</span>
              <span>{entry.bestScore} best</span>
              <span>{entry.streak} streak</span>
              <span>{entry.exactHits} exact</span>
              <span>{entry.verifiedProofs} real proofs</span>
              <span>{entry.modeProofs} mode proofs</span>
            </div>
          </article>
        ))}
      </div>
      <div className="memory-list">
        {records.length === 0 && <p>No memory yet. Lock a prediction to start the archive.</p>}
        {records.map((record) => (
          <article key={record.capsule.id}>
            <CheckCircle2 size={18} />
            <div>
              <strong>{record.capsule.matchLabel}</strong>
              <span>
                Prediction {record.capsule.prediction.homeScore}-{record.capsule.prediction.awayScore}
                {record.result ? ` · Score ${record.result.totalScore}/100` : " · waiting for reveal"}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function VerifyDashboard({
  records,
  modeRuns,
  publicRecord,
  publicProofStatus,
  publicModeRun,
  publicModeStatus,
  shareEvidence,
  publicShareArtifact,
  publicModeShareArtifact,
  shareImageUrl,
  modeShareImageUrl,
  onShareImage,
  onTwitter,
  onModeShareImage,
  onModeTwitter,
  matches,
  cidLookupInput,
  cidLookupState,
  onCidLookupInput,
  onCidLookup,
  onAttachCidProof,
}: {
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  publicRecord?: MemoryRecord;
  publicProofStatus: string;
  publicModeRun?: GameModeRun;
  publicModeStatus: string;
  shareEvidence: ShareArtifactEvidence[];
  publicShareArtifact?: ShareArtifactEvidence;
  publicModeShareArtifact?: ShareArtifactEvidence;
  shareImageUrl: string;
  modeShareImageUrl: string;
  onShareImage: (record: MemoryRecord) => void;
  onTwitter: (record: MemoryRecord) => void;
  onModeShareImage: (run: GameModeRun) => void;
  onModeTwitter: (run: GameModeRun) => void;
  matches: Match[];
  cidLookupInput: string;
  cidLookupState: FilecoinLookupState;
  onCidLookupInput: (value: string) => void;
  onCidLookup: () => void;
  onAttachCidProof: (record: MemoryRecord, proof: FilecoinProof) => void;
}) {
  const proofId = new URLSearchParams(window.location.search).get("proof");
  const modeProofId = new URLSearchParams(window.location.search).get("mode");
  const localModeRun = modeProofId ? modeRuns.find((run) => run.id === modeProofId) : undefined;
  const modeRun = localModeRun ?? publicModeRun;
  const modeProofSource = localModeRun ? "local device" : publicModeRun ? "cloud public mode proof" : "unresolved";
  const modePublicSource = localModeRun ? "local" : publicModeRun && publicModeShareArtifact ? "cloud" : publicModeRun ? "cloud-missing-share" : "unresolved";
  const localModeShareArtifact = modeRun
    ? shareEvidence.find((item) => item.kind === "mode" && item.id === modeRun.id)
    : undefined;
  const modeShareArtifact = localModeShareArtifact ?? publicModeShareArtifact;
  const modeShareArtifactSource = localModeShareArtifact ? "local manifest" : publicModeShareArtifact ? "cloud manifest" : "missing";
  const localRecord = proofId
    ? records.find((item) => item.capsule.id === proofId)
    : modeProofId
      ? undefined
      : records[0];
  const record = localRecord ?? publicRecord;
  const proofSource = localRecord ? "local device" : publicRecord ? "cloud public record" : "unresolved";
  const proofPublicSource = localRecord ? "local" : publicRecord && publicShareArtifact ? "cloud" : publicRecord ? "cloud-missing-share" : "unresolved";
  const localShareArtifact = record
    ? shareEvidence.find((item) => item.kind === "record" && item.id === record.capsule.id)
    : undefined;
  const recordShareArtifact = localShareArtifact ?? publicShareArtifact;
  const recordShareArtifactSource = localShareArtifact ? "local manifest" : publicShareArtifact ? "cloud manifest" : "missing";
  const match = record ? matches.find((item) => item.id === record.capsule.matchId) : undefined;
  const localExpectedProofHashes = localRecord
    ? [localRecord.capsule.payloadHash, localRecord.sealJob?.uploadPayloadHash].filter(Boolean)
    : [];
  const queriedProofMatchesRecord = Boolean(
    localRecord &&
      cidLookupState.proof &&
      (!cidLookupState.proof.payloadHash || localExpectedProofHashes.includes(cidLookupState.proof.payloadHash)),
  );
  const queriedProofMismatch = Boolean(
    localRecord &&
      cidLookupState.proof?.payloadHash &&
      !localExpectedProofHashes.includes(cidLookupState.proof.payloadHash),
  );
  const proofLabel = record?.capsule.filecoinProof.mode === "real" ? "Real Filecoin proof" : "Demo proof";
  const sealLabel = record?.capsule.lateLock ? "Late practice lock" : "Sealed before kickoff";
  const proofHeroStatus =
    record?.capsule.filecoinProof.proofStatus === "retrievable"
      ? "ready"
      : record?.capsule.filecoinProof.proofStatus ?? "pending";
  const resultLabel = record?.result
    ? `Actual ${record.result.homeScore}-${record.result.awayScore} · Score ${record.result.totalScore}/100`
    : "Reveal pending";
  const publicUrl = record ? proofUrl(record.capsule.id) : "";
  const fallbackMetaImage = new URL(assetUrl("kickoff-lock-icon.png"), window.location.href).toString();
  const publicMeta = modeRun
    ? buildModeProofMeta(modeRun, modeRunUrl(modeRun.id), fallbackMetaImage, modeShareArtifact)
    : record
      ? buildRecordProofMeta(record, publicUrl, fallbackMetaImage, recordShareArtifact)
      : undefined;
  const modeScorecard = modeRun
    ? buildModePublicProofScorecard(
        modeRun,
        modeRunUrl(modeRun.id),
        modeShareArtifact,
        publicMeta?.kind === "mode" ? publicMeta : undefined,
      )
    : undefined;
  const modeJudgeSummary = modeRun
    ? buildModePublicProofJudgeSummary(modeRun, modeRunUrl(modeRun.id), modeShareArtifact)
    : undefined;
  const modeShareKit = modeRun
    ? buildModePublicProofShareKit(modeRun, modeRunUrl(modeRun.id), modeShareArtifact)
    : undefined;
  const recordScorecard = record
    ? buildRecordPublicProofScorecard(
        record,
        publicUrl,
        recordShareArtifact,
        publicMeta?.kind === "record" ? publicMeta : undefined,
      )
    : undefined;
  const recordJudgeSummary = record
    ? buildRecordPublicProofJudgeSummary(record, publicUrl, recordShareArtifact)
    : undefined;
  const recordShareKit = record
    ? buildRecordPublicProofShareKit(record, publicUrl, recordShareArtifact)
    : undefined;
  const recordHeroImage = recordShareArtifact?.imageUrl ?? shareImageUrl;
  const recordHeroImageLabel = recordShareArtifact?.imageUrl
    ? recordShareArtifact.imageUrl.startsWith("https://")
      ? "Cloud share card"
      : "Share card manifest"
    : shareImageUrl
      ? "Generated preview"
      : "Logo fallback";
  const modeHeroImage = modeShareArtifact?.imageUrl ?? modeShareImageUrl;
  const modeHeroImageLabel = modeShareArtifact?.imageUrl
    ? modeShareArtifact.imageUrl.startsWith("https://")
      ? "Cloud mode card"
      : "Mode card manifest"
    : modeShareImageUrl
      ? "Generated preview"
      : "Logo fallback";
  useEffect(() => {
    if (publicMeta) applyPublicProofMeta(publicMeta);
  }, [
    publicMeta?.canonicalUrl,
    publicMeta?.title,
    publicMeta?.description,
    publicMeta?.imageManifest?.imageHash,
    publicMeta?.imageManifest?.imageUrl,
  ]);
  const checks = record
    ? [
        { label: "Capsule exists", passed: true },
        { label: "Payload hash present", passed: record.capsule.payloadHash.length >= 32 },
        { label: "CID present", passed: record.capsule.filecoinProof.cid.length > 12 },
        { label: "Sealed before kickoff", passed: !record.capsule.lateLock },
        { label: "Public source resolved", passed: proofSource !== "unresolved" },
        { label: "Match data resolved", passed: !!match || proofSource === "cloud public record" },
        { label: "Share manifest resolved", passed: Boolean(recordShareArtifact) },
      ]
    : [];
  return (
    <section
      className="verify panel"
      data-kickoff-public-kind={modeProofId ? "mode" : proofId ? "proof" : "local"}
      data-kickoff-public-target={modeProofId ? modeRun?.id ?? modeProofId : proofId ? record?.capsule.id ?? proofId : record?.capsule.id ?? ""}
      data-kickoff-public-source={modeProofId ? modePublicSource : proofId ? proofPublicSource : "local"}
    >
      <div className="panel-head">
        <div>
          <p className="eyebrow">Public verifier</p>
          <h2>{modeProofId ? "Mode proof verification" : "Proof verification"}</h2>
        </div>
        <span className="pill">{modeProofId ? modeProofSource : record ? proofSource : "missing"}</span>
      </div>
      {publicProofStatus && <div className="warning">{publicProofStatus}</div>}
      {publicModeStatus && <div className="warning">{publicModeStatus}</div>}
      {modeRun && (
        <div
          className="public-proof-hero"
          style={imageLayer(
            "proof-ticket.jpg",
            "linear-gradient(90deg, rgba(3, 8, 10, 0.96) 0%, rgba(3, 8, 10, 0.82) 52%, rgba(3, 8, 10, 0.46) 100%)",
          )}
        >
          <div className="public-proof-title">
            <div className="proof-brand-mark">
              <img src={assetUrl("kickoff-lock-icon.png")} alt="" />
              <span>Kickoff Lock Agent</span>
            </div>
            <h3>{modeRun.title}</h3>
            <p>{modeRun.summary}</p>
          </div>
          <div className="public-proof-visual">
            <div className="public-scoreline" aria-label="Public mode proof scoreline">
              <div>
                <span>Mode</span>
                <strong>{modeRun.modeId}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{modeRun.status}</strong>
              </div>
              <div>
                <span>Score</span>
                <strong>{modeRun.score !== undefined ? `${modeRun.score}/100` : "--"}</strong>
              </div>
            </div>
            <div className="public-proof-media" aria-label="Public mode proof visual evidence">
              <div className="proof-preview-frame">
                <img src={modeHeroImage || assetUrl("kickoff-lock-icon.png")} alt="Mode proof share card preview" />
              </div>
              <div className="proof-stamp-stack">
                <span>{modeHeroImageLabel}</span>
                <strong>{modeRun.filecoinProof.mode} proof</strong>
                <small>{modeShareArtifact ? "share manifest resolved" : "share manifest pending"}</small>
              </div>
            </div>
          </div>
          <div className="public-proof-rail">
            <div>
              <span>Public URL</span>
              <code>{modeRunUrl(modeRun.id)}</code>
            </div>
            <div>
              <span>Source</span>
              <strong>{modeProofSource}</strong>
            </div>
            <div>
              <span>CID</span>
              <code>{modeRun.filecoinProof.cid}</code>
            </div>
            <div>
              <span>Hash</span>
              <code>{modeRun.payloadHash}</code>
            </div>
          </div>
          <div className="proof-hero-actions">
            <button onClick={() => onModeShareImage(modeRun)}>
              <ImageDown size={16} /> Generate mode share image
            </button>
            <button onClick={() => onModeTwitter(modeRun)}>
              <Users size={16} /> Share mode proof to X
            </button>
          </div>
        </div>
      )}
      {modeJudgeSummary && <PublicProofJudgeSummaryCard summary={modeJudgeSummary} />}
      {modeRun && modeShareKit && <PublicProofShareKitCard kit={modeShareKit} onOpenXIntent={() => onModeTwitter(modeRun)} />}
      {modeRun && (
        <div className="verify-grid">
          <div className="verify-card proof-facts">
            <h3>Mode proof facts</h3>
            <p>{modeRun.requirements.join(" · ")}</p>
            <ModeRunArtifact artifact={modeRun.artifact} />
            <code>{modeRun.payloadHash}</code>
            <code>{modeRun.filecoinProof.cid}</code>
          </div>
          <div className="verify-checks">
            {[
              { label: "Mode proof exists", passed: true },
              { label: "Payload hash present", passed: modeRun.payloadHash.length >= 32 },
              { label: "CID present", passed: modeRun.filecoinProof.cid.length > 12 },
              { label: "Linked capsules present", passed: modeRun.capsuleIds.length > 0 },
              { label: "Public source resolved", passed: modeProofSource !== "unresolved" },
              { label: "Share manifest resolved", passed: Boolean(modeShareArtifact) },
            ].map((check) => (
              <article key={check.label}>
                <CheckCircle2 size={18} />
                <span>{check.label}</span>
                <strong>{check.passed ? "Pass" : "Fail"}</strong>
              </article>
            ))}
          </div>
          <ProofTimelineCard items={buildModeProofTimeline(modeRun, modeShareArtifact)} />
          {modeScorecard && <PublicProofScorecardCard scorecard={modeScorecard} />}
          <VerifierPacketCard packet={buildModeVerifierPacket(modeRun, modeRunUrl(modeRun.id), modeShareArtifact)} />
          <div className="verify-card locked-payload">
            <h3>Mode payload</h3>
            <pre>{stableJson({ modeRun })}</pre>
          </div>
          {publicMeta && <SocialMetadataCard meta={publicMeta} />}
          <ShareManifestCard artifact={modeShareArtifact} source={modeShareArtifactSource} expectedUrl={modeRunUrl(modeRun.id)} />
          {modeShareImageUrl && (
            <div className="verify-card public-share-card">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Public mode proof card</p>
                  <h3>Mode share image</h3>
                </div>
                <a href={modeShareImageUrl} download={`${modeRun.id}-public-mode-proof.png`}>
                  <Download size={16} /> Download
                </a>
              </div>
              <img src={modeShareImageUrl} alt="Generated public mode proof share card" />
            </div>
          )}
        </div>
      )}
      {record && (
        <div
          className="public-proof-hero"
          style={imageLayer(
            "proof-ticket.jpg",
            "linear-gradient(90deg, rgba(3, 8, 10, 0.96) 0%, rgba(3, 8, 10, 0.82) 52%, rgba(3, 8, 10, 0.46) 100%)",
          )}
        >
          <div className="public-proof-title">
            <div className="proof-brand-mark">
              <img src={assetUrl("kickoff-lock-icon.png")} alt="" />
              <span>Kickoff Lock Agent</span>
            </div>
            <h3>{record.capsule.matchLabel}</h3>
            <p>{sealLabel} · {proofLabel} · {resultLabel}</p>
          </div>
          <div className="public-proof-visual">
            <div className="public-scoreline" aria-label="Public proof scoreline">
              <div>
                <span>Prediction</span>
                <strong>{record.capsule.prediction.homeScore}-{record.capsule.prediction.awayScore}</strong>
              </div>
              <div>
                <span>Actual</span>
                <strong>{record.result ? `${record.result.homeScore}-${record.result.awayScore}` : "--"}</strong>
              </div>
              <div>
                <span>Proof</span>
                <strong>{proofHeroStatus}</strong>
              </div>
            </div>
            <div className="public-proof-media" aria-label="Public proof visual evidence">
              <div className="proof-preview-frame">
                <img src={recordHeroImage || assetUrl("kickoff-lock-icon.png")} alt="Public proof share card preview" />
              </div>
              <div className="proof-stamp-stack">
                <span>{recordHeroImageLabel}</span>
                <strong>{record.capsule.filecoinProof.mode} proof</strong>
                <small>{recordShareArtifact ? "share manifest resolved" : "share manifest pending"}</small>
              </div>
            </div>
          </div>
          <div className="public-proof-rail">
            <div>
              <span>Public URL</span>
              <code>{publicUrl}</code>
            </div>
            <div>
              <span>Source</span>
              <strong>{proofSource}</strong>
            </div>
            <div>
              <span>CID</span>
              <code>{record.capsule.filecoinProof.cid}</code>
            </div>
            <div>
              <span>Hash</span>
              <code>{record.capsule.payloadHash}</code>
            </div>
          </div>
          <div className="proof-hero-actions">
            <button onClick={() => onShareImage(record)}>
              <ImageDown size={16} /> Generate public share image
            </button>
            <button onClick={() => onTwitter(record)}>
              <Users size={16} /> Share proof to X
            </button>
          </div>
        </div>
      )}
      {recordJudgeSummary && <PublicProofJudgeSummaryCard summary={recordJudgeSummary} />}
      {record && recordShareKit && <PublicProofShareKitCard kit={recordShareKit} onOpenXIntent={() => onTwitter(record)} />}
      <div className="cid-lookup">
        <div>
          <p className="eyebrow">Filecoin CID lookup</p>
          <h3>Query proof status</h3>
          <span>{cidLookupState.message}</span>
        </div>
        <label>
          <span>CID</span>
          <input
            value={cidLookupInput}
            onChange={(event) => onCidLookupInput(event.target.value)}
            aria-label="Filecoin CID"
            placeholder="bafy..."
          />
        </label>
        <button onClick={onCidLookup} disabled={cidLookupState.status === "checking"}>
          <ShieldCheck size={16} /> Query CID
        </button>
        {cidLookupState.proof && (
          <div className="cid-result">
            <p><b>Status</b><span>{cidLookupState.proof.proofStatus}</span></p>
            <p><b>CID</b><span>{cidLookupState.proof.cid}</span></p>
            <p><b>PieceCID</b><span>{cidLookupState.proof.pieceCid}</span></p>
            <p><b>Provider</b><span>{cidLookupState.proof.provider}</span></p>
            <p><b>Dataset</b><span>{cidLookupState.proof.dataSetId}</span></p>
            <p>
              <b>Payload</b>
              <span>
                {cidLookupState.proof.payloadHash
                  ? queriedProofMismatch
                    ? "hash mismatch"
                    : "hash match"
                  : "hash not returned"}
              </span>
            </p>
            {cidLookupState.proof.retrievalUrl && (
              <a href={cidLookupState.proof.retrievalUrl} target="_blank" rel="noreferrer">
                Open retrieval
              </a>
            )}
            {localRecord && (
              <button
                className="cid-attach"
                onClick={() => cidLookupState.proof && onAttachCidProof(localRecord, cidLookupState.proof)}
                disabled={!queriedProofMatchesRecord}
              >
                <UploadCloud size={16} /> Attach to this capsule
              </button>
            )}
            {queriedProofMismatch && (
              <small>Returned payload hash does not match this capsule, so attach is blocked.</small>
            )}
          </div>
        )}
      </div>
      {!record && !modeRun ? (
        <div className="empty">
          <ShieldCheck size={32} />
          <h2>No proof found</h2>
          <p>Open a proof or mode proof link from a locked capsule, or lock a prediction first.</p>
        </div>
      ) : record ? (
        <div className="verify-grid">
          <div className="verify-card proof-facts">
            <h3>Proof facts</h3>
            <p>{sealLabel}</p>
            <p>{proofLabel}</p>
            <p>{resultLabel}</p>
            <code>{record.capsule.payloadHash}</code>
            <code>{record.capsule.filecoinProof.cid}</code>
          </div>
          <div className="verify-checks">
            {checks.map((check) => (
              <article key={check.label}>
                <CheckCircle2 size={18} />
                <span>{check.label}</span>
                <strong>{check.passed ? "Pass" : "Fail"}</strong>
              </article>
            ))}
          </div>
          <ProofTimelineCard items={buildRecordProofTimeline(record, recordShareArtifact)} />
          {recordScorecard && <PublicProofScorecardCard scorecard={recordScorecard} />}
          <VerifierPacketCard packet={buildRecordVerifierPacket(record, publicUrl, recordShareArtifact)} />
          <div className="verify-card locked-payload">
            <h3>Locked payload</h3>
            <pre>{stableJson({ capsule: record.capsule, result: record.result, match })}</pre>
          </div>
          {publicMeta && <SocialMetadataCard meta={publicMeta} />}
          <ShareManifestCard artifact={recordShareArtifact} source={recordShareArtifactSource} expectedUrl={publicUrl} />
          {shareImageUrl && (
            <div className="verify-card public-share-card">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Public proof card</p>
                  <h3>Share image</h3>
                </div>
                <a href={shareImageUrl} download={`${record.capsule.id}-public-proof.png`}>
                  <Download size={16} /> Download
                </a>
              </div>
              <img src={shareImageUrl} alt="Generated public proof share card" />
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function PublicProofShareKitCard({
  kit,
  onOpenXIntent,
}: {
  kit: PublicProofShareKit;
  onOpenXIntent?: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const [packageCopyStatus, setPackageCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyShareText = async () => {
    const copied = await copyToClipboard(kit.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  const copyPublicationPackage = async () => {
    const copied = await copyToClipboard(kit.publicationPackage.copyText);
    setPackageCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <section className={`public-proof-share-kit ${kit.status}`} aria-label="Public proof share kit">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Share kit</p>
          <h3>{kit.headline}</h3>
        </div>
        <span className="pill">{kit.artifactLabel}</span>
      </div>
      <div className="share-kit-main">
        <div>
          <span>Proof</span>
          <strong>{kit.kind}</strong>
          <code>{kit.proofUrl}</code>
        </div>
        <div>
          <span>Image</span>
          <strong>{kit.imageUrl ? "attached" : "not hosted"}</strong>
          <code>{kit.imageUrl || "Generate and sync a public PNG share card."}</code>
        </div>
        <div>
          <span>Copy</span>
          <strong>{copyStatus === "copied" ? "copied" : copyStatus === "manual" ? "manual" : "ready"}</strong>
          <button onClick={copyShareText}>
            <Link2 size={16} /> Copy share text
          </button>
        </div>
      </div>
      <div className="share-kit-actions">
        {kit.actions.map((action) => (
          <article key={action.key} className={action.status}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{action.label}</strong>
              <span>{action.status}</span>
            </div>
            <small>{action.detail}</small>
          </article>
        ))}
      </div>
      <div className={`share-intent-audit ${kit.intentAudit.ready ? "ready" : kit.intentAudit.publishReady ? "ready-to-open" : ""}`} aria-label="Share intent audit">
        <div>
          <span>Intent audit</span>
          <strong>{kit.intentAudit.ready ? "published" : kit.intentAudit.publishReady ? "ready to open" : "needs publishing"}</strong>
        </div>
        <small>{kit.intentAudit.summary}</small>
        <div className="share-intent-checks">
          {kit.intentAudit.checks.map((check) => (
            <article key={check.key} className={check.status}>
              <strong>{check.label}</strong>
              <span>{check.status}</span>
              <small>{check.detail}</small>
            </article>
          ))}
        </div>
      </div>
      <div className={`publication-package ${kit.publicationPackage.status}`} aria-label="Proof publication package">
        <div>
          <span>Publication package</span>
          <strong>{kit.publicationPackage.status}</strong>
          <small>{kit.publicationPackage.summary}</small>
        </div>
        <div className="publication-package-grid">
          <article className={kit.publicationPackage.publishReady ? "ready" : "pending"}>
            <strong>Publish</strong>
            <span>{kit.publicationPackage.publishReady ? "ready" : "blocked"}</span>
          </article>
          <article className={kit.publicationPackage.channelReady ? "ready" : "pending"}>
            <strong>Channel</strong>
            <span>{kit.publicationPackage.channelReady ? "opened" : "pending"}</span>
          </article>
          <article className={kit.publicationPackage.ready ? "ready" : "pending"}>
            <strong>Read-back</strong>
            <span>{kit.publicationPackage.ready ? "ready" : "pending"}</span>
          </article>
        </div>
        <small>{kit.publicationPackage.nextAction}</small>
        <div className="publication-acceptance-checklist" aria-label="Proof publication acceptance checklist">
          {kit.publicationPackage.acceptanceChecklist.map((check) => (
            <article key={check.key} className={check.passed ? "passed" : "pending"}>
              <div>
                <CheckCircle2 size={14} />
                <strong>{check.label}</strong>
                <span>{check.passed ? "passed" : "pending"}</span>
              </div>
              <small>{check.actual}</small>
            </article>
          ))}
        </div>
        {kit.publicationPackage.blockers.length > 0 && (
          <ul>
            {kit.publicationPackage.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
        <pre>{JSON.stringify(kit.publicationPackage.payload, null, 2)}</pre>
        <button onClick={copyPublicationPackage}>
          <Link2 size={16} /> {packageCopyStatus === "copied" ? "Copied package" : packageCopyStatus === "manual" ? "Show package" : "Copy publication package"}
        </button>
      </div>
      {kit.xIntentUrl && (
        onOpenXIntent ? (
          <button className="share-kit-x" onClick={onOpenXIntent}>
            <Users size={16} /> Open X intent
          </button>
        ) : (
          <a className="share-kit-x" href={kit.xIntentUrl} target="_blank" rel="noreferrer">
            <Users size={16} /> Open X intent
          </a>
        )
      )}
      {copyStatus === "manual" && (
        <label className="share-kit-copy">
          <span>Manual share text</span>
          <textarea
            aria-label="Manual share text"
            readOnly
            value={kit.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      {packageCopyStatus === "manual" && (
        <label className="share-kit-copy">
          <span>Manual publication package</span>
          <textarea
            aria-label="Manual publication package"
            readOnly
            value={kit.publicationPackage.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <small>{kit.summary}</small>
    </section>
  );
}

function ShareManifestCard({
  artifact,
  source,
  expectedUrl,
}: {
  artifact?: ShareArtifactEvidence;
  source: string;
  expectedUrl: string;
}) {
  const channel = artifact?.nativeShareOpenedAt
    ? `native share · ${formatDate(artifact.nativeShareOpenedAt)}`
    : artifact?.xIntentOpenedAt
      ? `X intent · ${formatDate(artifact.xIntentOpenedAt)}`
      : "not opened";
  const sizeKb = artifact?.imageByteLength ? Math.round(artifact.imageByteLength / 1024) : 0;
  return (
    <div className={`verify-card share-manifest-card ${artifact ? "passed" : ""}`} aria-label="Share card manifest">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Share evidence</p>
          <h3>Share card manifest</h3>
        </div>
        <span className={`pill ${artifact ? "real" : "demo"}`}>{source}</span>
      </div>
      {artifact ? (
        <div className="manifest-grid">
          <p><b>Card</b><span>{artifact.fileName ?? "generated PNG"}</span></p>
          <p><b>Image URL</b><code>{artifact.imageUrl ?? "not publicly hosted yet"}</code></p>
          <p><b>Size</b><span>{sizeKb} KB · {artifact.imageMime ?? "image/png"}</span></p>
          <p><b>Hash</b><code>{artifact.imageHash ?? "missing"}</code></p>
          <p><b>URL</b><code>{artifact.proofUrl}</code></p>
          <p><b>Channel</b><span>{channel}</span></p>
        </div>
      ) : (
        <div className="manifest-empty">
          <ImageDown size={22} />
          <strong>No share manifest yet</strong>
          <span>Generate a proof card and sync it so this public page can prove the social image metadata.</span>
          <code>{expectedUrl}</code>
        </div>
      )}
    </div>
  );
}

function ProofTimelineCard({ items }: { items: ProofTimelineItem[] }) {
  return (
    <div className="verify-card proof-timeline" aria-label="Proof timeline">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Evidence chain</p>
          <h3>Proof timeline</h3>
        </div>
        <span className="pill">{items.filter((item) => item.status === "passed").length}/{items.length}</span>
      </div>
      <ol>
        {items.map((item) => (
          <li key={item.id} className={item.status}>
            <span className="timeline-dot" />
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
              <small>{item.timestamp ? formatDate(item.timestamp) : "not timestamped"}</small>
            </div>
            <b>{item.status}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PublicProofScorecardCard({ scorecard }: { scorecard: PublicProofScorecard }) {
  return (
    <div className={`verify-card public-proof-scorecard ${scorecard.productionReady ? "ready" : ""}`} aria-label="Public proof scorecard">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Judging view</p>
          <h3>Public proof scorecard</h3>
        </div>
        <span className="pill">{scorecard.passed}/{scorecard.total}</span>
      </div>
      <p>{scorecard.summary}</p>
      <div className="scorecard-grid">
        {scorecard.items.map((item) => (
          <article key={item.key} className={`scorecard-${item.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>
      <small>Next action: {scorecard.nextAction}</small>
    </div>
  );
}

function PublicProofJudgeSummaryCard({ summary }: { summary: PublicProofJudgeSummary }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copySummary = async () => {
    const copied = await copyToClipboard(summary.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <section className={`public-proof-judge ${summary.ready ? "ready" : ""}`} aria-label="Public proof judge summary">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Judge summary</p>
          <h3>{summary.title}</h3>
        </div>
        <button onClick={copySummary}>
          <Link2 size={16} /> {copyStatus === "copied" ? "Copied summary" : copyStatus === "manual" ? "Summary text shown" : "Copy judge summary"}
        </button>
      </div>
      <div className="judge-summary-main">
        <div>
          <span>Status</span>
          <strong>{summary.ready ? "Ready" : "Needs evidence"}</strong>
        </div>
        <div>
          <span>Checks</span>
          <strong>{summary.passed}/{summary.total}</strong>
        </div>
        <div>
          <span>Score</span>
          <strong>{summary.primaryScore}</strong>
        </div>
      </div>
      <p>{summary.summary}</p>
      <small>{summary.subtitle}</small>
      <small>Next action: {summary.nextAction}</small>
      <div className="judge-summary-facts">
        <span>CID <code>{summary.cid}</code></span>
        <span>Hash <code>{summary.payloadHash}</code></span>
        <span>Share <code>{summary.shareImage}</code></span>
        <span>URL <code>{summary.publicUrl}</code></span>
      </div>
      {copyStatus === "manual" && (
        <label className="judge-summary-copy">
          <span>Manual judge summary copy</span>
          <textarea
            aria-label="Manual judge summary copy"
            readOnly
            value={summary.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="judge-summary-grid">
        {summary.items.map((item) => (
          <article key={item.key} className={item.status}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <small>{item.value}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function VerifierPacketCard({ packet }: { packet: VerifierPacket }) {
  const copyPacket = async () => {
    await copyToClipboard(packet.text);
  };
  return (
    <div className="verify-card verifier-packet" aria-label="Verifier packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Copyable proof</p>
          <h3>Verifier packet</h3>
        </div>
        <button onClick={copyPacket}>
          <Link2 size={16} /> Copy packet
        </button>
      </div>
      <div className="manifest-grid">
        <p><b>Kind</b><span>{packet.kind}</span></p>
        <p><b>Status</b><span>{packet.status}</span></p>
        <p><b>URL</b><code>{packet.publicUrl}</code></p>
        {packet.cid && <p><b>CID</b><code>{packet.cid}</code></p>}
        {packet.payloadHash && <p><b>Hash</b><code>{packet.payloadHash}</code></p>}
      </div>
      <pre>{packet.text}</pre>
    </div>
  );
}

function SocialMetadataCard({ meta }: { meta: PublicProofMeta }) {
  return (
    <div className="verify-card social-meta-card" aria-label="Social metadata">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Public sharing</p>
          <h3>Social metadata</h3>
        </div>
        <span className="pill">{meta.twitterCard}</span>
      </div>
      <div className="manifest-grid">
        <p><b>Title</b><span>{meta.title}</span></p>
        <p><b>Canonical</b><code>{meta.canonicalUrl}</code></p>
        <p><b>Image</b><code>{meta.imageUrl}</code></p>
        <p><b>Image alt</b><span>{meta.imageAlt}</span></p>
        <p><b>Structured data</b><span>{String(meta.jsonLd["@type"])} · {meta.kind}</span></p>
        <p>
          <b>Manifest</b>
          <span>
            {meta.imageManifest?.imageHash
              ? `${meta.imageManifest.fileName ?? "share card"} · ${meta.imageManifest.imageHash.slice(0, 12)}...`
              : "default image until share card manifest syncs"}
          </span>
        </p>
        {meta.imageManifest?.imageUrl && <p><b>Share image URL</b><code>{meta.imageManifest.imageUrl}</code></p>}
        {meta.imageManifest?.imageMime && <p><b>Image MIME</b><span>{meta.imageManifest.imageMime}</span></p>}
        {meta.imageManifest?.imageByteLength && (
          <p><b>Image bytes</b><span>{meta.imageManifest.imageByteLength.toLocaleString()}</span></p>
        )}
      </div>
    </div>
  );
}

function LeaderboardEvidencePacketCard({ packet }: { packet: LeaderboardEvidencePacket }) {
  const copyPacket = async () => {
    await copyToClipboard(packet.copyText);
  };
  return (
    <div className={`leaderboard-packet ${packet.complete ? "passed" : ""}`} aria-label="Leaderboard evidence packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Rank proof</p>
          <h3>Leaderboard evidence packet</h3>
        </div>
        <button onClick={copyPacket}>
          <Link2 size={16} /> Copy leaderboard packet
        </button>
      </div>
      <div className="leaderboard-packet-summary">
        <div><span>Scopes</span><strong>{packet.passedScopes}/{packet.totalScopes}</strong></div>
        <div><span>Remote rows</span><strong>{packet.remoteRows}</strong></div>
        <div><span>Current user</span><strong>{packet.currentUserScopes.join(", ") || "missing"}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      <small>Missing scopes: {packet.missingScopes.join(", ") || "none"}</small>
      <code>{packet.sampleIds.join(", ") || "no remote samples"}</code>
    </div>
  );
}

function LeaderboardSeasonEvidencePanel({ packet }: { packet: LeaderboardSeasonEvidencePacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`leaderboard-season-packet ${packet.ready ? "passed" : ""}`} aria-label="Leaderboard season evidence packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Season claim</p>
          <h3>Leaderboard season evidence</h3>
        </div>
        <button onClick={copyPacket}>
          <Link2 size={16} /> {copyStatus === "copied" ? "Copied season packet" : copyStatus === "manual" ? "Packet text shown" : "Copy season packet"}
        </button>
      </div>
      <div className="leaderboard-packet-summary">
        <div><span>Scopes</span><strong>{packet.passedScopes}/{packet.totalScopes}</strong></div>
        <div><span>Best rank</span><strong>{packet.bestRank ? `#${packet.bestRank}` : "--"}</strong></div>
        <div><span>Season XP</span><strong>{packet.seasonXp}</strong></div>
      </div>
      <div className="leaderboard-packet-summary">
        <div><span>Real proofs</span><strong>{packet.verifiedProofs}</strong></div>
        <div><span>Mode proofs</span><strong>{packet.modeProofs}</strong></div>
        <div><span>Exact hits</span><strong>{packet.exactHits}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Friend code: {packet.friendCode}</small>
      <small>Season key: {packet.seasonKey}</small>
      <small>Next action: {packet.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="leaderboard-copy-fallback">
          <span>Manual packet copy</span>
          <textarea
            aria-label="Manual packet copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="leaderboard-season-checks">
        {packet.checks.map((check) => (
          <div key={check.key} className={check.passed ? "passed" : ""}>
            <CheckCircle2 size={15} />
            <span>{check.label}</span>
            <strong>{check.detail}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaderboardBackendPanel({
  artifact,
  status,
}: {
  artifact?: LeaderboardProductionArtifact;
  status: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(artifact?.copyText ?? status);
    setCopyStatus(copied ? "copied" : "manual");
  };
  const scopes = artifact
    ? [
        {
          key: "global",
          label: "Global",
          currentUser: artifact.acceptance.globalCurrentUser,
          boardRows: artifact.acceptance.globalBoardRows,
          targetQuery: artifact.targetQueries.global,
          boardQuery: artifact.boardQueries.global,
        },
        {
          key: "friend",
          label: "Friend",
          currentUser: artifact.acceptance.friendCurrentUser,
          boardRows: artifact.acceptance.friendBoardRows,
          targetQuery: artifact.targetQueries.friend,
          boardQuery: artifact.boardQueries.friend,
        },
        {
          key: "season",
          label: "Season",
          currentUser: artifact.acceptance.seasonCurrentUser,
          boardRows: artifact.acceptance.seasonBoardRows,
          targetQuery: artifact.targetQueries.season,
          boardQuery: artifact.boardQueries.season,
        },
      ]
    : [];
  return (
    <section className={`leaderboard-backend-plan ${artifact?.ready ? "ready" : ""}`} aria-label="Leaderboard backend artifact">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Leaderboard backend</p>
          <h3>Backend setup stages</h3>
        </div>
        <button onClick={copyPacket}>
          <TableProperties size={16} /> {copyStatus === "copied" ? "Copied backend" : "Copy backend"}
        </button>
      </div>
      <div className="leaderboard-backend-summary" aria-label="Leaderboard backend summary">
        <div><span>Stages</span><strong>{artifact ? `${artifact.stageReadyCount}/${artifact.totalStages}` : "0/3"}</strong></div>
        <div><span>Scopes</span><strong>{artifact ? `${artifact.acceptance.passedScopeCount}/${artifact.acceptance.requiredScopeCount}` : "0/3"}</strong></div>
        <div><span>Boards</span><strong>{artifact ? `${artifact.acceptance.passedBoardCount}/${artifact.acceptance.requiredBoardCount}` : "0/3"}</strong></div>
        <div><span>Targets</span><strong>{artifact?.acceptance.targetEnvReady ? "ready" : "missing"}</strong></div>
      </div>
      <small>{artifact ? artifact.nextAction : status}</small>
      <div className="leaderboard-backend-stages">
        {artifact ? (
          artifact.stages.map((stage) => (
            <article key={stage.id} className={`stage-${stage.status}`}>
              <div>
                <CheckCircle2 size={16} />
                <strong>{stage.label}</strong>
                <span>{stage.status}</span>
              </div>
              <code>{stage.command}</code>
              <small>Missing: {stage.missingEnv.join(", ") || "none"}</small>
              <p>{stage.detail}</p>
            </article>
          ))
        ) : (
          <article className="stage-blocked">
            <div>
              <CheckCircle2 size={16} />
              <strong>Backend artifact</strong>
              <span>missing</span>
            </div>
            <code>bun run leaderboard:bootstrap</code>
            <small>Missing: public/leaderboard-backend.json</small>
            <p>{status}</p>
          </article>
        )}
      </div>
      {artifact ? (
        <div className="leaderboard-backend-scopes" aria-label="Leaderboard backend scope queries">
          {scopes.map((scope) => (
            <article key={scope.key} className={scope.currentUser && scope.boardRows ? "stage-done" : "stage-blocked"}>
              <div>
                <TableProperties size={16} />
                <strong>{scope.label} scope</strong>
                <span>
                  user {scope.currentUser ? "listed" : "missing"} · board {scope.boardRows ? "loaded" : "missing"}
                </span>
              </div>
              <small>current-user target</small>
              <code>{scope.targetQuery}</code>
              <small>public board rows</small>
              <code>{scope.boardQuery}</code>
            </article>
          ))}
        </div>
      ) : null}
      {artifact?.queryContracts?.length ? (
        <div className="leaderboard-backend-scopes" aria-label="Leaderboard backend query contracts">
          {artifact.queryContracts.map((contract) => (
            <article key={`${contract.scope}-contract`} className={contract.passed ? "stage-done" : "stage-blocked"}>
              <div>
                <TableProperties size={16} />
                <strong>{contract.scope} contract</strong>
                <span>{contract.passed ? "ready" : "blocked"}</span>
              </div>
              <small>target {contract.targetQueryReady ? "ok" : "missing"} · board {contract.boardQueryReady ? "ok" : "missing"}</small>
              <code>{contract.boardQuery}</code>
              <p>{contract.detail}</p>
            </article>
          ))}
        </div>
      ) : null}
      {artifact?.readBackCommands?.length ? (
        <div className="leaderboard-backend-scopes" aria-label="Leaderboard read-back commands">
          {artifact.readBackCommands.map((item) => (
            <article key={`${item.scope}-${item.kind}`} className={item.ready ? "stage-done" : "stage-blocked"}>
              <div>
                <TerminalSquare size={16} />
                <strong>{item.label}</strong>
                <span>{item.ready ? "curl ready" : "needs Supabase"}</span>
              </div>
              <code>{item.command}</code>
            </article>
          ))}
        </div>
      ) : null}
      {copyStatus === "manual" && (
        <label className="production-account-copy">
          <span>Manual leaderboard backend copy</span>
          <textarea
            aria-label="Manual leaderboard backend copy"
            readOnly
            value={artifact?.copyText ?? status}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}

function LeaderboardQueryContractPanel({ packet }: { packet: LeaderboardQueryContractPacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`leaderboard-query-contract ${packet.ready ? "passed" : ""}`} aria-label="Leaderboard query contract">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Leaderboard contract</p>
          <h3>Current-user scope queries</h3>
        </div>
        <button onClick={copyPacket}>
          <TableProperties size={16} /> {copyStatus === "copied" ? "Copied contract" : "Copy contract"}
        </button>
      </div>
      <div className="leaderboard-contract-summary">
        <div><span>Scopes</span><strong>{packet.passedScopes}/{packet.totalScopes}</strong></div>
        <div><span>Status</span><strong>{packet.ready ? "ready" : "pending"}</strong></div>
        <div><span>Profile</span><strong>{packet.profileId}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="leaderboard-copy-fallback">
          <span>Manual query contract copy</span>
          <textarea
            aria-label="Manual query contract copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="leaderboard-contract-scopes">
        {packet.scopes.map((scope) => (
          <article key={scope.scope} className={scope.passed ? "passed" : ""}>
            <div>
              <TableProperties size={16} />
              <strong>{scope.scope}</strong>
              <span>{scope.passed ? "verified" : "pending"}</span>
            </div>
            <small>{scope.detail}</small>
            <code>{packet.targetQueries[scope.scope]}</code>
            <small>
              filter {scope.filterReady ? "ok" : "missing"} · target {scope.targetQueryReady ? "ok" : "missing"} · user{" "}
              {scope.currentUserReady ? "ok" : "missing"} · rank {scope.scopedRankReady ? "ok" : "missing"} · stats{" "}
              {scope.statsReady ? "ok" : "missing"}
            </small>
            <p>{scope.action}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function LeaderboardEvidencePanel({ evidence, profileId }: { evidence: LeaderboardScopeEvidence[]; profileId: string }) {
  return (
    <div className="leaderboard-evidence" aria-label="Leaderboard query evidence">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Backend query evidence</p>
          <h3>Leaderboard scope read-back</h3>
        </div>
        <span className="pill">{evidence.filter((item) => hasLeaderboardScopeEvidence(item, profileId)).length}/3</span>
      </div>
      {evidence.map((item) => {
        const passed = hasLeaderboardScopeEvidence(item, profileId);
        return (
          <article key={item.scope} className={passed ? "passed" : ""}>
            <div>
              <TableProperties size={16} />
              <strong>{item.scope}</strong>
              <span>{passed ? "verified" : item.status}</span>
            </div>
            <small>Rows: {item.rows} · Filter: {item.filter}</small>
            <small>Target: {item.targetQuery ?? "not checked"}</small>
            <small>
              Current user:{" "}
              {item.currentUserPresent
                ? `listed${item.currentUserRank ? ` · rank ${item.currentUserRank}` : ""} · XP ${item.currentUserXp ?? "missing"}`
                : "missing"}
            </small>
            <small>Activity: locks {item.currentUserLocks ?? "missing"} · modes {item.currentUserModeProofs ?? "missing"} · exact {item.currentUserExactHits ?? "missing"}</small>
            {!passed && <small>Problem: {leaderboardScopeStatsProblem(item)}</small>}
            <small>Checked: {item.checkedAt ? formatDate(item.checkedAt) : "not checked"}</small>
            <small>Samples: {item.sampleIds?.join(", ") || "none"}</small>
            {item.error && <small>Error: {item.error}</small>}
          </article>
        );
      })}
    </div>
  );
}

function ModesDashboard({
  modes,
  records,
  bracketPath,
  modeRuns,
  shareEvidence,
  cloudState,
  onBracketPick,
  onSealBracket,
  onCreateModeRun,
  onCreateReadyModes,
  onSealReadyModeRuns,
  onSealModeRun,
}: {
  modes: GameMode[];
  records: MemoryRecord[];
  bracketPath: BracketPath;
  modeRuns: GameModeRun[];
  shareEvidence: ShareArtifactEvidence[];
  cloudState: CloudSyncState;
  onBracketPick: (pickId: string, patch: Partial<BracketPath["picks"][number]>) => void;
  onSealBracket: () => void;
  onCreateModeRun: (mode: GameMode) => void;
  onCreateReadyModes: () => void;
  onSealReadyModeRuns: () => void;
  onSealModeRun: (run: GameModeRun) => void;
}) {
  const lockedCount = records.length;
  const bracketReady = isBracketPathReady(bracketPath);
  const bracketRuns = modeRuns.filter((run) => run.modeId === "bracket" && run.artifact?.kind === "bracket-path");
  const modeEvidence = buildModeEvidencePacket(modes, modeRuns, shareEvidence, cloudState.verification);
  const modePlaybook = buildModePlaybookPacket({ modes, records, bracketPath, runs: modeRuns, productionEvidence: modeEvidence });
  const modeSealQueue = buildFilecoinAutomationSealQueue(records, modeRuns).filter((item) => item.kind === "mode");
  const modeSettlement = buildModeSettlementPacket(modeRuns, modeEvidence);
  const agentCalibrationEvidence = buildAgentCalibrationEvidencePacket(modeRuns);
  return (
    <section className="modes panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Tournament modes</p>
          <h2>Beyond single-match locks</h2>
        </div>
        <span className="pill">{lockedCount} active locks</span>
      </div>
      <ModePlaybookPanel
        packet={modePlaybook}
        modeSealQueue={modeSealQueue}
        onCreateReadyModes={onCreateReadyModes}
        onSealReadyModeRuns={onSealReadyModeRuns}
      />
      <ModeEvidencePacketCard packet={modeEvidence} />
      <ModeSettlementPacketCard packet={modeSettlement} />
      <AgentCalibrationEvidencePanel packet={agentCalibrationEvidence} />
      <div className="bracket-builder">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Knockout path builder</p>
            <h3>Seal a bracket path</h3>
          </div>
          <span className={`pill ${bracketReady ? "real" : "demo"}`}>{bracketReady ? "ready" : "needs 4 picks"}</span>
        </div>
        <div className="bracket-grid">
          {bracketPath.picks.length === 0 && <p>No upcoming knockout matches are available from the active provider yet.</p>}
          {bracketPath.picks.map((pick) => {
            const teams = pick.matchLabel.split(" vs ");
            const winnerOptions = [...teams, pick.winner].filter((value, index, list) => value && list.indexOf(value) === index);
            return (
              <article key={pick.id}>
                <div>
                  <strong>{pick.matchLabel}</strong>
                  <span>{pick.stage}</span>
                </div>
                <label>
                  <span>Advance</span>
                  <select
                    value={pick.winner}
                    onChange={(event) => onBracketPick(pick.id, { winner: event.target.value })}
                  >
                    {winnerOptions.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Confidence</span>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={pick.confidence}
                    onChange={(event) => onBracketPick(pick.id, { confidence: Number(event.target.value) })}
                  />
                  <b>{pick.confidence}%</b>
                </label>
                <label>
                  <span>Path note</span>
                  <textarea value={pick.note} onChange={(event) => onBracketPick(pick.id, { note: event.target.value })} />
                </label>
              </article>
            );
          })}
        </div>
        <div className="bracket-footer">
          <div>
            <strong>{bracketPath.picks.length}/4 path picks</strong>
            <span>{bracketPath.payloadHash ? `Last sealed ${bracketPath.payloadHash.slice(0, 12)}...` : "Draft updates are saved locally until sealed."}</span>
          </div>
          <button className="mode-create" disabled={!bracketReady} onClick={onSealBracket}>
            <FileCheck2 size={16} /> Seal bracket proof
          </button>
        </div>
        {bracketRuns.length > 0 && (
          <div className="bracket-runs">
            {bracketRuns.slice(0, 3).map((run) => (
              <article key={run.id}>
                <strong>{run.summary}</strong>
                <code>{run.filecoinProof.cid}</code>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="mode-grid">
        {modes.map((mode) => {
          const readiness = getModeReadiness(mode.id, records);
          const runs = modeRuns.filter((run) => run.modeId === mode.id);
          const productized = readiness.ready ? Math.max(mode.progress, 88) : mode.progress;
          const statusLabel = readiness.ready ? "ready" : mode.status === "playable" ? "needs input" : mode.status;
          return (
            <article key={mode.id}>
              <div className="mode-top">
                <Flame size={20} />
                <span className={`pill mode-${readiness.ready ? "playable" : mode.status}`}>
                  {statusLabel}
                </span>
              </div>
              <h3>{mode.title}</h3>
              <p>{mode.description}</p>
              <div className="mode-requirements">
                {readiness.requirements.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div className="progress-track">
                <span style={{ width: `${productized}%` }} />
              </div>
              <b>{readiness.eligibleRecords.length} eligible capsule{readiness.eligibleRecords.length === 1 ? "" : "s"}</b>
              <small>{readiness.nextAction}</small>
              <button className="mode-create" disabled={!readiness.ready} onClick={() => onCreateModeRun(mode)}>
                <FileCheck2 size={16} /> Create mode proof
              </button>
              {runs.length > 0 && (
                <div className="mode-runs">
                  {runs.slice(0, 2).map((run) => (
                    <div key={run.id}>
                      <strong>{run.status}{run.score !== undefined ? ` · ${run.score}/100` : ""}</strong>
                      <ModeRunArtifact artifact={run.artifact} />
                      <code>{run.filecoinProof.cid}</code>
                      <button className="mode-create" onClick={() => onSealModeRun(run)}>
                        <UploadCloud size={16} /> Auto seal mode proof
                      </button>
                      {run.sealJob && (
                        <SealWorkflowPanel
                          job={run.sealJob}
                          fallbackCid={run.filecoinProof.cid}
                          title="Mode seal status"
                          eyebrow="Mode Filecoin workflow"
                          compact
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div className="mode-rules">
        <h3>Acceptance rule</h3>
        <p>Each mode creates a proof run with hash, CID and linked capsules; production acceptance also requires cloud content read-back, anonymous mode proof links and generated public share cards for all six required mode types.</p>
      </div>
    </section>
  );
}

function ModePlaybookPanel({
  packet,
  modeSealQueue,
  onCreateReadyModes,
  onSealReadyModeRuns,
}: {
  packet: ModePlaybookPacket;
  modeSealQueue: FilecoinAutomationQueueItem[];
  onCreateReadyModes: () => void;
  onSealReadyModeRuns: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const runnableModeSealLanes = modeSealQueue.filter((item) => item.runnable);
  const missingModeSealArtifacts = modeSealQueue.filter((item) => !item.runnable);
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div
      className={`mode-playbook-packet ${packet.productionComplete ? "passed" : packet.complete ? "partial" : ""}`}
      aria-label="Mode playbook packet"
    >
      <div className="panel-head">
        <div>
          <p className="eyebrow">Mode playbook</p>
          <h3>Tournament mode lanes</h3>
        </div>
        <div className="button-row">
          <button onClick={onCreateReadyModes} disabled={packet.runnableQueue === 0}>
            <FileCheck2 size={16} /> Create ready modes
          </button>
          <button onClick={onSealReadyModeRuns} disabled={runnableModeSealLanes.length === 0}>
            <UploadCloud size={16} /> Seal mode lanes
          </button>
          <button onClick={copyPacket}>
            <TableProperties size={16} /> {copyStatus === "copied" ? "Copied playbook" : copyStatus === "manual" ? "Manual copy" : "Copy playbook"}
          </button>
        </div>
      </div>
      <div className="mode-playbook-summary">
        <div><span>Sealed</span><strong>{packet.sealedModes}/{packet.totalModes}</strong></div>
        <div><span>Production</span><strong>{packet.productionReadyModes}/{packet.totalModes}</strong></div>
        <div><span>Ready</span><strong>{packet.readyToSealModes}/{packet.totalModes}</strong></div>
        <div><span>Queue</span><strong>{packet.runnableQueue}/{packet.queue.length}</strong></div>
        <div><span>Seal lanes</span><strong>{runnableModeSealLanes.length}/{modeSealQueue.length}</strong></div>
        <div><span>Runs</span><strong>{packet.totalRuns}</strong></div>
        <div><span>Status</span><strong>{packet.productionComplete ? "production" : packet.complete ? "proof-ready" : "active"}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Production gaps: {packet.productionMissingModes.join(", ") || "none"}</small>
      <small>Next action: {packet.nextAction}</small>
      <small>Mode seal queue: {runnableModeSealLanes.length} runnable · {missingModeSealArtifacts.length} missing proof artifact{missingModeSealArtifacts.length === 1 ? "" : "s"}</small>
      {copyStatus === "manual" && (
        <label className="mode-playbook-copy">
          <span>Manual playbook copy</span>
          <textarea
            aria-label="Manual playbook copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="mode-creation-queue" aria-label="Mode creation queue">
        {packet.queue.map((item) => (
          <article key={item.modeId} className={item.runnable ? "runnable" : "missing"}>
            <div>
              <FileCheck2 size={16} />
              <strong>{item.title}</strong>
              <span>{item.runnable ? "queued" : item.status}</span>
            </div>
            <small>{item.nextAction}</small>
          </article>
        ))}
      </div>
      <div className="mode-playbook-list">
        {packet.items.map((item) => (
          <article key={item.modeId} className={`mode-playbook-${item.status}`}>
            <div>
              <Flame size={16} />
              <strong>{item.title}</strong>
              <span>{item.status}</span>
            </div>
            <small>Eligible: {item.eligibleCount}/{item.requiredCount} · Runs: {item.runCount}</small>
            <small>Latest: {item.latestRunId ?? "missing"}</small>
            <p>{item.nextAction}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ModeEvidencePacketCard({ packet }: { packet: ModeEvidencePacket }) {
  const copyPacket = async () => {
    await copyToClipboard(packet.copyText);
  };
  return (
    <div className={`mode-evidence-packet ${packet.complete ? "passed" : ""}`} aria-label="Mode evidence packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Tournament acceptance</p>
          <h3>Mode evidence packet</h3>
        </div>
        <button onClick={copyPacket}>
          <Link2 size={16} /> Copy mode packet
        </button>
      </div>
      <div className="mode-evidence-summary">
        <div><span>Modes</span><strong>{packet.passedModes}/{packet.totalModes}</strong></div>
        <div><span>Filecoin</span><strong>{packet.realFilecoinModes}/{packet.totalModes}</strong></div>
        <div><span>Cloud</span><strong>{packet.cloudModes}/{packet.totalModes}</strong></div>
        <div><span>Share cards</span><strong>{packet.shareCardModes}/{packet.totalModes}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      <div className="mode-evidence-list">
        {packet.items.map((item) => (
          <article key={item.modeId} className={item.status === "ready" ? "passed" : ""}>
            <div>
              <Trophy size={16} />
              <strong>{item.title}</strong>
              <span>{item.status}</span>
            </div>
            <small>Run: {item.runId ?? "missing"}</small>
            <small>Missing: {item.missing.join(", ") || "none"}</small>
          </article>
        ))}
      </div>
      <div className="mode-evidence-list" aria-label="Mode acceptance claims">
        {packet.acceptanceClaims.map((claim) => (
          <article key={claim.modeId} className={claim.accepted ? "passed" : ""}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{claim.modeId}</strong>
              <span>{claim.accepted ? "accepted" : "blocked"}</span>
            </div>
            <small>Artifact: {claim.artifactKind ?? "missing"} / {claim.expectedArtifactKind}</small>
            <small>Hash: {claim.payloadHashReady ? "ok" : "missing"} · CID: {claim.cid ?? "missing"}</small>
            <small>Missing: {claim.missing.join(", ") || "none"}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function ModeSettlementPacketCard({ packet }: { packet: ModeSettlementPacket }) {
  const copyPacket = async () => {
    await copyToClipboard(packet.copyText);
  };
  return (
    <div className={`mode-settlement-packet ${packet.productionComplete ? "passed" : packet.pendingRuns === 0 && packet.runs > 0 ? "partial" : ""}`} aria-label="Mode settlement packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Mode settlement</p>
          <h3>Mode settlement packet</h3>
        </div>
        <button onClick={copyPacket}>
          <Trophy size={16} /> Copy settlement
        </button>
      </div>
      <div className="mode-settlement-summary">
        <div><span>Runs</span><strong>{packet.runs}</strong></div>
        <div><span>Settled</span><strong>{packet.settledRuns}</strong></div>
        <div><span>Accepted</span><strong>{packet.acceptedModes}/{packet.requiredModes || "-"}</strong></div>
        <div><span>Ready modes</span><strong>{packet.settlementReadyModes}/{packet.requiredModes || "-"}</strong></div>
        <div><span>Avg score</span><strong>{packet.averageScore}</strong></div>
        <div><span>Bonus XP</span><strong>{packet.bonusXp}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      {packet.acceptanceItems.length > 0 && (
        <div className="mode-settlement-list" aria-label="Mode settlement acceptance matrix">
          {packet.acceptanceItems.map((item) => (
            <article key={item.modeId} className={item.productionReady && item.settlementReady ? "passed" : item.settlementReady ? "partial" : ""}>
              <div>
                <CheckCircle2 size={16} />
                <strong>{item.title}</strong>
                <span>{item.productionReady ? "accepted" : "blocked"}</span>
              </div>
              <small>Run: {item.runId ?? "missing"} · Settlement: {item.settlementStatus ?? "missing"}{item.score !== undefined ? ` · ${item.score}/100` : ""}</small>
              <small>Missing: {item.missing.join(", ") || "none"}</small>
            </article>
          ))}
        </div>
      )}
      <div className="mode-settlement-list">
        {packet.items.length === 0 ? (
          <article>
            <div>
              <Trophy size={16} />
              <strong>No mode proof runs yet</strong>
              <span>pending</span>
            </div>
            <small>Create a bracket, parlay, Agent vs Human, group path, upset or penalty pressure proof to start settlement tracking.</small>
          </article>
        ) : (
          packet.items.slice(0, 6).map((item) => (
            <article key={item.runId} className={item.status === "settled" ? "passed" : item.status === "scorable" ? "partial" : ""}>
              <div>
                <Trophy size={16} />
                <strong>{item.title}</strong>
                <span>{item.status}</span>
              </div>
              <small>{item.settled}/{item.total} settled · {item.reward}{item.score !== undefined ? ` · ${item.score}/100` : ""}</small>
              <small>{item.summary}</small>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function AgentCalibrationEvidencePanel({ packet }: { packet: AgentCalibrationEvidencePacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`agent-calibration-packet ${packet.ready ? "ready" : ""}`} aria-label="Agent calibration evidence">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Agent vs Human</p>
          <h3>Calibration evidence packet</h3>
        </div>
        <button onClick={copyPacket}>
          <Gauge size={16} /> {copyStatus === "copied" ? "Copied calibration" : "Copy calibration"}
        </button>
      </div>
      <div className="agent-calibration-summary">
        <div><span>Samples</span><strong>{packet.samples}</strong></div>
        <div><span>Avg error</span><strong>{packet.averageCalibrationError}</strong></div>
        <div><span>Human edge</span><strong>{packet.humanEdgeSamples}</strong></div>
        <div><span>Checks</span><strong>{packet.passedChecks}/{packet.totalChecks}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Run: {packet.runId ?? "missing"}</small>
      <small>Next action: {packet.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="agent-calibration-copy">
          <span>Manual calibration copy</span>
          <textarea
            aria-label="Manual calibration copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="agent-calibration-checks">
        {packet.checks.map((check) => (
          <article key={check.key} className={check.passed ? "passed" : "pending"}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{check.label}</strong>
              <span>{check.passed ? "passed" : "pending"}</span>
            </div>
            <small>{check.detail}</small>
          </article>
        ))}
      </div>
      <div className="agent-calibration-samples">
        {packet.items.length === 0 && (
          <article>
            <div>
              <Bot size={16} />
              <strong>No calibration samples yet</strong>
              <span>pending</span>
            </div>
            <small>Reveal a locked prediction, then create an Agent vs Human proof run.</small>
          </article>
        )}
        {packet.items.map((item) => (
          <article key={item.capsuleId} className={`sample-${item.status}`}>
            <div>
              <Bot size={16} />
              <strong>{item.matchLabel}</strong>
              <span>{item.status}</span>
            </div>
            <small>Confidence {item.confidence} · Score {item.totalScore} · Error {item.calibrationError}</small>
            <p>{item.insight}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ModeRunArtifact({ artifact }: { artifact?: GameModeRun["artifact"] }) {
  if (!artifact) return <div className="mode-artifact"><span>Generic mode proof</span></div>;
  if (artifact.kind === "parlay-ticket") {
    const chainHitLegs = artifact.chainHitLegs ?? artifact.hitLegs;
    const chainLabel =
      artifact.chainBustedAt !== undefined
        ? `busted at leg ${artifact.chainBustedAt}`
        : artifact.chainStatus === "complete"
          ? "completed"
          : "live";
    return (
      <div className="mode-artifact" aria-label="Parlay ticket artifact">
        <div className="mode-artifact-head">
          <span>Parlay chain</span>
          <strong>{chainHitLegs}/{artifact.legs.length} · {chainLabel}</strong>
        </div>
        <div className="mode-artifact-grid">
          {artifact.legs.map((leg) => (
            <article key={leg.capsuleId}>
              <b>{leg.chainStep ?? `Leg ${leg.sequenceIndex ?? ""}`.trim()}</b>
              <small>{leg.matchLabel}</small>
              <small>{leg.pick} · {leg.confidence}%</small>
              <span>{leg.chainStatus ?? (leg.resultScore !== undefined ? `${leg.resultScore}/100` : "pending")}</span>
            </article>
          ))}
        </div>
      </div>
    );
  }
  if (artifact.kind === "agent-calibration") {
    return (
      <div className="mode-artifact" aria-label="Agent calibration artifact">
        <div className="mode-artifact-head">
          <span>Calibration</span>
          <strong>Avg error {artifact.averageCalibrationError}</strong>
        </div>
        <div className="mode-artifact-grid">
          {artifact.samples.map((sample) => (
            <article key={sample.capsuleId}>
              <b>{sample.matchLabel}</b>
              <small>Confidence {sample.confidence} · score {sample.totalScore}</small>
              <span>{sample.winnerHit ? "winner hit" : "miss"}</span>
            </article>
          ))}
        </div>
      </div>
    );
  }
  if (artifact.kind === "upset-ticket") {
    return (
      <div className="mode-artifact" aria-label="Upset ticket artifact">
        <div className="mode-artifact-head">
          <span>Upset ticket</span>
          <strong>{artifact.bonusXp} bonus XP</strong>
        </div>
        <div className="mode-artifact-grid">
          {artifact.picks.map((pick) => (
            <article key={pick.capsuleId}>
              <b>{pick.matchLabel}</b>
              <small>{pick.predictedWinner} · {pick.confidence}% · x{pick.multiplier}</small>
              <span>{pick.resultScore !== undefined ? `${pick.resultScore}/100` : "pending"}</span>
            </article>
          ))}
        </div>
      </div>
    );
  }
  if (artifact.kind === "group-table-path") {
    const actualRows = artifact.table.filter(
      (row) => row.actualPoints !== undefined || row.actualGoalDifference !== undefined,
    ).length;
    return (
      <div className="mode-artifact group-table-artifact" aria-label="Group table path artifact">
        <div className="mode-artifact-head">
          <span>Group path</span>
          <strong>
            {artifact.topTwo.join(" / ") || "top two pending"} · {artifact.winnerHits}/{artifact.resolvedMatches} hits
          </strong>
        </div>
        <div className="group-table-summary" aria-label="Group path settlement summary">
          <span>{artifact.picks.length} locks</span>
          <span>{artifact.resolvedMatches} resolved matches</span>
          <span>{actualRows} teams with actual table data</span>
        </div>
        <div className="mode-artifact-grid group-table-grid">
          {artifact.table.slice(0, 6).map((row) => (
            <article key={row.team}>
              <b>{row.projectedRank}. {row.team}</b>
              <small>
                Pred {row.predictedPoints} pts · GD {row.predictedGoalDifference >= 0 ? "+" : ""}{row.predictedGoalDifference}
              </small>
              <small>
                Actual {row.actualPoints ?? "--"} pts · GD{" "}
                {row.actualGoalDifference === undefined
                  ? "--"
                  : `${row.actualGoalDifference >= 0 ? "+" : ""}${row.actualGoalDifference}`}
              </small>
              <span>{row.locks} lock{row.locks === 1 ? "" : "s"}</span>
            </article>
          ))}
        </div>
        <div className="group-pick-grid" aria-label="Group path pick audit">
          {artifact.picks.slice(0, 6).map((pick) => (
            <article key={pick.capsuleId} className={pick.winnerHit ? "hit" : pick.winnerHit === false ? "miss" : ""}>
              <b>{pick.matchLabel}</b>
              <small>{pick.predictedWinner} · {pick.predictedScore}</small>
              <span>{pick.actualScore ? `${pick.actualScore} · ${pick.winnerHit ? "hit" : "miss"}` : "pending"}</span>
            </article>
          ))}
        </div>
      </div>
    );
  }
  if (artifact.kind === "penalty-pressure-ticket") {
    return (
      <div className="mode-artifact" aria-label="Penalty pressure artifact">
        <div className="mode-artifact-head">
          <span>Penalty pressure</span>
          <strong>
            {artifact.resolvedPicks > 0
              ? `${artifact.hitPicks}/${artifact.resolvedPicks} pressure hits`
              : `avg pressure ${artifact.averagePressure}`}
          </strong>
        </div>
        <div className="mode-artifact-grid">
          {artifact.takers.map((taker) => (
            <article key={taker.capsuleId} className={taker.pressureHit ? "hit" : taker.pressureHit === false ? "miss" : ""}>
              <b>{taker.matchLabel}</b>
              <small>{taker.pressurePick} · {taker.pickType} · {taker.confidence}%</small>
              <span>
                {taker.resultScore !== undefined
                  ? `${taker.resultScore}/100 · ${taker.pressureHit ? "hit" : "miss"}`
                  : `pressure ${taker.pressureRating}`}
              </span>
            </article>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mode-artifact" aria-label="Bracket path artifact">
      <div className="mode-artifact-head">
        <span>Bracket path</span>
        <strong>
          {artifact.resolvedPicks !== undefined && artifact.resolvedPicks > 0
            ? `${artifact.hitPicks ?? 0}/${artifact.resolvedPicks} hits`
            : `${artifact.bracketPath.picks.length} picks`}
        </strong>
      </div>
      <div className="mode-artifact-grid">
        {artifact.bracketPath.picks.map((pick) => (
          <article key={pick.id}>
            <b>{pick.matchLabel}</b>
            <small>{pick.stage} · {pick.confidence}%</small>
            <span>
              {pick.winner}
              {artifact.settlements?.find((item) => item.matchLabel === pick.matchLabel)?.winnerHit !== undefined
                ? ` · ${artifact.settlements.find((item) => item.matchLabel === pick.matchLabel)?.winnerHit ? "hit" : "miss"}`
                : ""}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}

function PublicProfileDashboard({
  profile,
  status,
  onCopyProfileLink,
  onOpenProof,
  onOpenModeProof,
}: {
  profile: PublicProfile;
  status: string;
  onCopyProfileLink: (profileId: string) => void;
  onOpenProof: (capsuleId: string) => void;
  onOpenModeProof: (runId: string) => void;
}) {
  const latestRecords = profile.records.slice(0, 12);
  const latestModeRuns = profile.modeRuns.slice(0, 6);
  const shareArtifactFor = (id: string, kind: ShareArtifactEvidence["kind"]) =>
    profile.shareArtifacts.find((item) => item.id === id && item.kind === kind);
  const shareManifestCount = profile.shareArtifacts.filter(isPublishableShareArtifact).length;
  const fallbackMetaImage = new URL(assetUrl("kickoff-lock-icon.png"), window.location.href).toString();
  const profileMeta = buildProfileMeta(profile, profileUrl(profile.id), fallbackMetaImage);
  const publicSource = status.includes("Cloud profile loaded") ? "cloud" : status.includes("Public fixture") ? "fixture" : "local";
  const profileArchiveEvidence = buildProfileArchiveEvidencePacket({
    profile,
    profileUrl: profileUrl(profile.id),
    source: publicSource === "cloud" ? "public-page" : "local-preview",
  });
  useEffect(() => {
    applyPublicProofMeta(profileMeta);
  }, [profileMeta.canonicalUrl, profileMeta.title, profileMeta.description]);
  return (
    <section
      className="public-profile panel"
      data-kickoff-public-kind="profile"
      data-kickoff-public-target={profile.id}
      data-kickoff-public-source={publicSource}
    >
      <div
        className="public-profile-hero"
        style={imageLayer(
          "stadium-hero.jpg",
          "linear-gradient(90deg, rgba(3, 14, 14, 0.9) 0%, rgba(3, 14, 14, 0.62) 58%, rgba(210, 55, 46, 0.24) 100%)",
        )}
      >
        <div className="public-profile-identity">
          {profile.avatarUrl ? <img className="avatar large" src={profile.avatarUrl} alt="" /> : <UserCircle2 size={54} />}
          <div>
            <p className="eyebrow">Public prediction profile</p>
            <h2>{profile.displayName}</h2>
            <span>{profile.location} · {profile.friendCode ?? "global"}</span>
          </div>
        </div>
        <div className="profile-actions">
          <button onClick={() => onCopyProfileLink(profile.id)}>
            <Link2 size={16} /> Copy profile link
          </button>
        </div>
      </div>
      {status && <div className="warning">{status}</div>}
      <div className="public-profile-stats">
        <div><strong>{profile.locks}</strong><span>locked predictions</span></div>
        <div><strong>{profile.revealed}</strong><span>revealed</span></div>
        <div><strong>{profile.modeProofs}</strong><span>mode proofs</span></div>
        <div><strong>{profile.averageScore}</strong><span>average score</span></div>
        <div><strong>{profile.bestScore}</strong><span>best score</span></div>
        <div><strong>{profile.xp}</strong><span>XP</span></div>
        <div><strong>{shareManifestCount}</strong><span>share cards</span></div>
      </div>
      <div className="profile-proof-url">
        <b>Profile URL</b>
        <code>{profileUrl(profile.id)}</code>
      </div>
      <SocialMetadataCard meta={profileMeta} />
      <VerifierPacketCard packet={buildProfileVerifierPacket(profile, profileUrl(profile.id))} />
      <ProfileArchiveEvidencePanel packet={profileArchiveEvidence} />
      <div className="profile-records">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Public archive</p>
            <h3>Latest proof capsules</h3>
          </div>
          <span className="pill">{latestRecords.length} shown</span>
        </div>
        {latestRecords.length === 0 && <p>No public records yet. Lock a prediction, then sync cloud history.</p>}
        {latestRecords.map((record) => (
          <article key={record.capsule.id}>
            <div>
              <strong>{record.capsule.matchLabel}</strong>
              <span>
                Prediction {record.capsule.prediction.homeScore}-{record.capsule.prediction.awayScore}
                {record.result ? ` · Score ${record.result.totalScore}/100` : " · reveal pending"}
              </span>
              <code>{record.capsule.filecoinProof.cid}</code>
              <ProfileShareBadge artifact={shareArtifactFor(record.capsule.id, "record")} />
            </div>
            <button onClick={() => onOpenProof(record.capsule.id)}>
              <ShieldCheck size={16} /> Verify
            </button>
          </article>
        ))}
      </div>
      <div className="profile-records">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Mode proof archive</p>
            <h3>Tournament mode runs</h3>
          </div>
          <span className="pill">{latestModeRuns.length} shown</span>
        </div>
          {latestModeRuns.length === 0 && <p>No public mode proofs yet. Create a bracket, parlay, calibration, group path, upset or penalty pressure proof, then sync cloud history.</p>}
        {latestModeRuns.map((run) => (
          <article key={run.id}>
            <div>
              <strong>{run.title}</strong>
              <span>{run.summary}{run.score !== undefined ? ` · Score ${run.score}/100` : ""}</span>
              <code>{run.filecoinProof.cid}</code>
              <ProfileShareBadge artifact={shareArtifactFor(run.id, "mode")} />
            </div>
            <button onClick={() => onOpenModeProof(run.id)}>
              <ShieldCheck size={16} /> Verify
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProfileArchiveEvidencePanel({ packet }: { packet: ProfileArchiveEvidencePacket }) {
  const copyPacket = async () => {
    await navigator.clipboard?.writeText(packet.copyText);
  };
  const copyManifest = async () => {
    await navigator.clipboard?.writeText(packet.manifestJson);
  };
  return (
    <section className={`profile-archive-evidence ${packet.ready ? "ready" : ""}`} aria-label="Profile archive evidence packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Profile archive</p>
          <h3>Profile archive packet</h3>
        </div>
        <div className="panel-actions">
          <button onClick={copyPacket}>
            <FileCheck2 size={16} /> Copy archive packet
          </button>
          <button onClick={copyManifest}>
            <FileCheck2 size={16} /> Copy manifest JSON
          </button>
        </div>
      </div>
      <div className="profile-archive-summary">
        <div><span>Locks</span><strong>{packet.records}</strong></div>
        <div><span>Modes</span><strong>{packet.modeRuns}</strong></div>
        <div><span>Archives</span><strong>{packet.verifiedArchives}/{packet.expectedArchives}</strong></div>
        <div><span>Cards</span><strong>{packet.publishableShareCards}/{packet.shareCards}</strong></div>
        <div><span>Images</span><strong>{packet.publicImageCards}/{packet.shareCards}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      <div className="profile-archive-checks">
        {packet.checks.map((check) => (
          <article key={check.key} className={`archive-${check.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{check.label}</strong>
              <span>{check.status}</span>
            </div>
            <small>{check.detail}</small>
          </article>
        ))}
      </div>
      <div className="profile-archive-manifest" aria-label="Profile archive manifest">
        <strong>Archive manifest</strong>
        <span>
          {packet.manifest.records.length} records · {packet.manifest.modeRuns.length} modes · {packet.manifest.shareCards.length} share cards
        </span>
        <code>{packet.manifest.records[0]?.proofUrl ?? packet.profileUrl}</code>
      </div>
      {packet.missingIds.length > 0 && <small>Missing: {packet.missingIds.slice(0, 6).join(", ")}</small>}
    </section>
  );
}

function ProfileShareBadge({ artifact }: { artifact?: ShareArtifactEvidence }) {
  const ready = isPublishableShareArtifact(artifact);
  const channel = artifact?.nativeShareOpenedAt ? "native share" : artifact?.xIntentOpenedAt ? "X intent" : "card only";
  return (
    <div className={`profile-share-badge ${ready ? "ready" : ""}`} aria-label="Profile share card evidence">
      <ImageDown size={14} />
      <span>{ready ? "share card synced" : "needs share card"}</span>
      {ready && <code>{artifact?.imageHash?.slice(0, 12)}... · {channel}</code>}
    </div>
  );
}

function AccountDashboard({
  profile,
  cloudState,
  email,
  records,
  modeRuns,
  matches,
  gameModes,
  providerReadiness,
  providerRouteAudit,
  providerHealth,
  realtimeDataAudit,
  leaderboardEntries,
  leaderboardScopeEvidence,
  sealEndpointConfigured,
  shareImageReady,
  shareEvidence,
  acceptanceEvidence,
  acceptanceEvidenceStatus,
  productionEvidence,
  productionEvidenceStatus,
  publicDeploymentEvidence,
  publicDeploymentEvidenceStatus,
  productionBootstrapRunbook,
  productionBootstrapRunbookStatus,
  productionAccessPreflight,
  productionAccessPreflightStatus,
  productionEnvPlan,
  productionEnvPlanStatus,
  supabaseBootstrapPlan,
  supabaseBootstrapPlanStatus,
  supabaseSchemaArtifact,
  supabaseTargetSeedArtifact,
  accountCloudSyncArtifact,
  dataBootstrapPlan,
  dataBootstrapPlanStatus,
  dataProviderArtifact,
  dataScoutArtifact,
  filecoinBootstrapPlan,
  filecoinBootstrapPlanStatus,
  filecoinSealArtifact,
  cloudflarePagesDeployPlan,
  leaderboardBackendArtifact,
  leaderboardBackendStatus,
  publicRestoreArtifact,
  shareChannelArtifact,
  shareChannelArtifactStatus,
  recordShareImageUploadArtifact,
  modeShareImageUploadArtifact,
  runtimeConfigReadiness,
  runtimeConfigSummary,
  intelligenceEnrichmentEvidence,
  dataContinuityEvidence,
  onEmail,
  onProfile,
  onMagicLink,
  onGoogleSignIn,
  onSync,
  onPull,
  onSaveProfile,
  onSignOut,
  onOpenProfile,
  onCopyProfileLink,
  onCopyFriendInvite,
  onPublishMissingShareCards,
  onOpenMissingShareChannels,
  onSealMissingFilecoinLanes,
}: {
  profile: ReturnType<typeof loadProfile>;
  cloudState: CloudSyncState;
  email: string;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  matches: Match[];
  gameModes: GameMode[];
  providerReadiness: ProviderReadinessItem[];
  providerRouteAudit: ProviderRouteAuditItem[];
  providerHealth: ProviderHealthSnapshot;
  realtimeDataAudit?: RealtimeDataAudit;
  leaderboardEntries: LeaderboardEntry[];
  leaderboardScopeEvidence: LeaderboardScopeEvidence[];
  sealEndpointConfigured: boolean;
  shareImageReady: boolean;
  shareEvidence: ShareArtifactEvidence[];
  acceptanceEvidence?: AcceptanceEvidencePacket;
  acceptanceEvidenceStatus: string;
  productionEvidence?: ProductionEvidencePacket;
  productionEvidenceStatus: string;
  publicDeploymentEvidence?: PublicDeploymentEvidencePacket;
  publicDeploymentEvidenceStatus: string;
  productionBootstrapRunbook?: ProductionBootstrapRunbook;
  productionBootstrapRunbookStatus: string;
  productionAccessPreflight?: ProductionAccessPreflightPacket & { artifactVersion?: number; generatedAt?: string; source?: string };
  productionAccessPreflightStatus: string;
  productionEnvPlan?: ProductionEnvPlanPacket;
  productionEnvPlanStatus: string;
  supabaseBootstrapPlan?: SupabaseProductionBootstrapPlan;
  supabaseBootstrapPlanStatus: string;
  supabaseSchemaArtifact?: SupabaseSchemaApplyArtifact;
  supabaseTargetSeedArtifact?: ProductionTargetSeedArtifact;
  accountCloudSyncArtifact?: AccountCloudSyncEvidenceArtifact;
  dataBootstrapPlan?: DataProductionBootstrapPlan;
  dataBootstrapPlanStatus: string;
  dataProviderArtifact?: DataProviderReadinessArtifact;
  dataScoutArtifact?: DataTargetScoutArtifact;
  filecoinBootstrapPlan?: FilecoinProductionBootstrapPlan;
  filecoinBootstrapPlanStatus: string;
  filecoinSealArtifact?: FilecoinTargetSealArtifact;
  cloudflarePagesDeployPlan?: CloudflarePagesDeployPlan;
  leaderboardBackendArtifact?: LeaderboardProductionArtifact;
  leaderboardBackendStatus: string;
  publicRestoreArtifact?: PublicRestoreEvidenceArtifact;
  shareChannelArtifact?: ShareChannelEvidenceArtifact;
  shareChannelArtifactStatus: string;
  recordShareImageUploadArtifact?: ShareImageUploadArtifact;
  modeShareImageUploadArtifact?: ShareImageUploadArtifact;
  runtimeConfigReadiness: RuntimeConfigItem[];
  runtimeConfigSummary: RuntimeConfigSummary;
  intelligenceEnrichmentEvidence: IntelligenceEnrichmentEvidencePacket;
  dataContinuityEvidence: DataContinuityEvidencePacket;
  onEmail: (value: string) => void;
  onProfile: (patch: Partial<ReturnType<typeof loadProfile>>) => void;
  onMagicLink: () => void;
  onGoogleSignIn: () => void;
  onSync: () => void;
  onPull: () => void;
  onSaveProfile: () => void;
  onSignOut: () => void;
  onOpenProfile: () => void;
  onCopyProfileLink: () => void;
  onCopyFriendInvite: () => void;
  onPublishMissingShareCards: () => void;
  onOpenMissingShareChannels: () => void;
  onSealMissingFilecoinLanes: () => void;
}) {
  const browserRuntimeEnv = runtimeEnvTextValues();
  const syncCoverage = buildCloudSyncCoverage(cloudState, records, modeRuns, shareEvidence);
  const syncAudit = buildCloudSyncAudit(cloudState, profile, records, modeRuns, leaderboardEntries, shareEvidence);
  const syncOutbox = buildCloudSyncOutbox(cloudState, profile, records, modeRuns, shareEvidence);
  const auditPassed = syncAudit.filter((item) => item.status === "passed").length;
  const outboxVerified = syncOutbox.filter((item) => item.status === "verified").length;
  const outboxQueued = syncOutbox.reduce((total, item) => total + item.queued, 0);
  const verification = cloudState.verification;
  const profileAutosync = buildProfileAutosyncStatus(cloudState);
  const cloudWriteAutosync = canAutoSyncCloudWrites(cloudState);
  const productionReadiness = buildProductionReadiness({
    cloudState,
    profile,
    records,
    modeRuns,
    gameModes,
    providerReadiness,
    providerRouteAudit,
    providerHealth,
    leaderboardEntries,
    leaderboardScopeEvidence,
    sealEndpointConfigured,
    shareImageReady,
    shareEvidence,
    acceptanceEvidence,
    productionEvidence,
  });
  const productionSummary = summarizeProductionReadiness(productionReadiness);
  const realtimeDataEvidence = buildRealtimeDataEvidencePacket({
    matches,
    readiness: providerReadiness,
    routeAudit: providerRouteAudit,
    health: providerHealth,
    audit: realtimeDataAudit,
  });
  const freeDataSourceEvidence = buildFreeDataSourceEvidencePacket({
    matches,
    routeAudit: providerRouteAudit,
  });
  const shareImageEvidence = shareEvidence.filter((item) => item.imageGenerated).length;
  const shareChannelEvidencePacket = buildShareChannelEvidencePacket(records, modeRuns, shareEvidence);
  const publicProofPublicationLedger = buildPublicProofPublicationLedger([
    ...records.map((record) =>
      buildRecordPublicProofShareKit(
        record,
        proofUrl(record.capsule.id),
        shareEvidence.find((item) => item.kind === "record" && item.id === record.capsule.id),
      ),
    ),
    ...modeRuns.map((run) =>
      buildModePublicProofShareKit(
        run,
        modeRunUrl(run.id),
        shareEvidence.find((item) => item.kind === "mode" && item.id === run.id),
      ),
    ),
  ]);
  const productionShareChannelEvidence = shareEvidence.filter(
    (item) => isProductionShareArtifact(item) && hasShareChannelEvidence(item),
  );
  const recordShareChannelEvidence = productionShareChannelEvidence.filter((item) => item.kind === "record").length;
  const modeShareChannelEvidence = productionShareChannelEvidence.filter((item) => item.kind === "mode").length;
  const activeFriendCode = friendCodeFor(profile);
  const productionVerifyEnv = buildProductionVerifyEnvFromArtifacts({
    profile,
    records,
    modeRuns,
    shareEvidence,
    publicProfileUrl: profileUrl(profile.id),
  });
  const productionDoctor = buildProductionDoctorReport(
    { ...browserRuntimeEnv, ...parseEnvText(productionVerifyEnv) },
    productionEvidence,
  );
  const productionAccountBootstrap = buildProductionAccountBootstrapPacket({
    envText: productionVerifyEnv,
    runtimeEnv: browserRuntimeEnv,
    publicAppUrl: configuredPublicAppUrl() || fallbackPublicAppUrl(),
  });
  const productionEnvLedger = buildProductionEnvLedger(productionVerifyEnv);
  const productionAcceptanceCollector = buildProductionAcceptanceCollector({
    runtimeEnv: { ...browserRuntimeEnv, ...parseEnvText(productionVerifyEnv) },
    verifyEnvText: productionVerifyEnv,
    ledger: productionEnvLedger,
    accessPreflightArtifact: productionAccessPreflight,
    supabaseBootstrapPlan,
    supabaseSchemaArtifact,
    supabaseTargetSeedArtifact,
    accountCloudSyncEvidence: accountCloudSyncArtifact,
    dataBootstrapPlan,
    dataProviderArtifact,
    dataScoutArtifact,
    filecoinBootstrapPlan,
    filecoinSealArtifact,
    cloudflarePagesDeployPlan,
    leaderboardArtifact: leaderboardBackendArtifact,
    publicRestoreArtifact,
    shareChannelArtifact,
    shareImageUploadArtifacts: {
      record: recordShareImageUploadArtifact,
      mode: modeShareImageUploadArtifact,
    },
  });
  const productionGoalAudit = buildProductionGoalAudit({
    productionEvidence,
    acceptanceEvidence,
    envPlan: productionEnvPlan,
    productionCollector: productionAcceptanceCollector,
  });
  const productionLaunchPacket = buildProductionLaunchPacket(productionDoctor);
  const brandAssetPacket = buildBrandAssetPacket(configuredPublicAppUrl() || fallbackPublicAppUrl());
  const filecoinAutomationEvidence = buildFilecoinAutomationEvidencePacket(records, modeRuns);
  const filecoinSealLifecycle = buildFilecoinSealLifecyclePacket(records, modeRuns);
  const accountHandoff = buildAccountHandoffPacket({
    profile,
    cloudState,
    records,
    modeRuns,
    shareEvidence,
    leaderboardScopeEvidence,
    productionVerifyEnv,
    publicProfileUrl: profileUrl(profile.id),
    missingRuntimeEnv: productionDoctor.runtime.missingEnvKeys,
  });
  const accountRecovery = buildAccountRecoveryEvidencePacket({
    profile,
    cloudState,
    records,
    modeRuns,
    shareEvidence,
    leaderboardScopeEvidence,
    publicProfileUrl: profileUrl(profile.id),
    productionEvidence,
  });
  const accountCloudSyncEvidence = buildAccountCloudSyncEvidenceArtifact({
    profile,
    cloudState,
    records,
    modeRuns,
    shareArtifacts: shareEvidence,
    leaderboardEntries,
  });
  const profileArchiveEvidence = buildProfileArchiveEvidencePacket({
    profile: buildPublicProfile(profile, records, modeRuns, shareEvidence),
    profileUrl: profileUrl(profile.id),
    verification,
    source: profile.cloudMode === "supabase" ? "cloud-readback" : "local-preview",
  });
  const leaderboardSeasonPacket = buildLeaderboardSeasonEvidencePacket({
    profile,
    entries: leaderboardEntries,
    evidence: leaderboardScopeEvidence,
  });
  const leaderboardQueryContract = buildLeaderboardQueryContractPacket(profile, leaderboardScopeEvidence);
  const publicProfileArchiveCount =
    (verification?.publicProfileRecordIds?.length ?? 0) +
    (verification?.publicProfileModeRunIds?.length ?? 0) +
    (verification?.publicProfileShareArtifactIds?.length ?? 0);
  const expectedPublicProfileArchives = records.length + modeRuns.length + shareEvidence.length;
  const cloudChecks = [
    {
      label: "Backend schema",
      passed: Boolean(verification?.backendHealth?.ready),
      detail: verification?.backendHealth
        ? verification.backendHealth.schemaVersion ?? verification.backendHealth.detail
        : "not checked",
    },
    {
      label: "Supabase env",
      passed: cloudState.configured,
      detail: cloudState.configured ? "configured" : "missing env vars",
    },
    {
      label: "Auth session",
      passed: cloudState.authenticated,
      detail: cloudState.sessionExpired ? "expired" : cloudState.authenticated ? "active" : "not signed in",
    },
    {
      label: "Refresh token",
      passed: Boolean(cloudState.refreshable),
      detail: cloudState.refreshable ? "auto refresh ready" : "OAuth or magic link required",
    },
    {
      label: "Cloud records",
      passed: cloudState.authenticated && records.length > 0 && (verification?.records ?? 0) >= records.length,
      detail: records.length > 0
        ? `${verification?.records ?? 0}/${records.length} record${records.length === 1 ? "" : "s"} read back`
        : "lock a prediction first",
    },
    {
      label: "Mode proofs",
      passed: cloudState.authenticated && modeRuns.length > 0 && (verification?.modeRuns ?? 0) >= modeRuns.length,
      detail: modeRuns.length > 0
        ? `${verification?.modeRuns ?? 0}/${modeRuns.length} mode proof${modeRuns.length === 1 ? "" : "s"} read back`
        : "create a mode proof first",
    },
    {
      label: "Share manifests",
      passed: cloudState.authenticated && shareEvidence.length > 0 && (verification?.shareArtifacts ?? 0) >= shareEvidence.length,
      detail: shareEvidence.length > 0
        ? `${verification?.shareArtifacts ?? 0}/${shareEvidence.length} card manifest${shareEvidence.length === 1 ? "" : "s"} read back`
        : "generate share cards first",
    },
    {
      label: "Public share images",
      passed: cloudState.authenticated && shareEvidence.length > 0 && (verification?.publicShareImages ?? 0) >= shareEvidence.length,
      detail: shareEvidence.length > 0
        ? `${verification?.publicShareImages ?? 0}/${shareEvidence.length} public PNG URL${shareEvidence.length === 1 ? "" : "s"} read back`
        : "upload share images first",
    },
    {
      label: "Sync coverage",
      passed: syncCoverage.passed,
      detail: syncCoverage.detail,
    },
    {
      label: "Public profile",
      passed:
        Boolean(verification?.publicProfile) &&
        (expectedPublicProfileArchives === 0 || publicProfileArchiveCount >= expectedPublicProfileArchives),
      detail: verification?.publicProfile
        ? `anonymous ${profile.id} · archives ${publicProfileArchiveCount}/${expectedPublicProfileArchives}`
        : profile.cloudMode === "supabase" ? profile.id : "local preview only",
    },
  ];
  return (
    <section className="account panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Account & cloud</p>
          <h2>Profile sync center</h2>
        </div>
        <span className={`pill cloud-${cloudState.status}`}>{cloudState.status}</span>
      </div>
      <div className="account-grid">
        <div className="profile-card">
          {profile.avatarUrl ? <img className="avatar" src={profile.avatarUrl} alt="" /> : <UserCircle2 size={42} />}
          <label>
            <span>Display name</span>
            <input value={profile.displayName} onChange={(event) => onProfile({ displayName: event.target.value })} />
          </label>
          <label>
            <span>Email</span>
            <input value={profile.email} onChange={(event) => onProfile({ email: event.target.value })} />
          </label>
          <label>
            <span>Location</span>
            <input value={profile.location} onChange={(event) => onProfile({ location: event.target.value })} />
          </label>
          <label>
            <span>Friend leaderboard code</span>
            <input
              value={activeFriendCode}
              onChange={(event) => onProfile({ friendCode: event.target.value })}
              aria-label="Friend leaderboard code"
            />
          </label>
          <div className="profile-meta">
            <code>{profile.id}</code>
            <span>{profile.cloudMode} profile</span>
            <span aria-label="Profile autosync status">{profileAutosync.label}</span>
            <small>{profileAutosync.detail}</small>
          </div>
          <div className="friend-code-panel" aria-label="Friend leaderboard invite">
            <div>
              <Users size={16} />
              <strong>{activeFriendCode}</strong>
              <span>Shared friend scope for the leaderboard</span>
            </div>
            <code>{friendInviteUrl(activeFriendCode)}</code>
            <button onClick={onCopyFriendInvite}>
              <Link2 size={16} /> Copy friend invite
            </button>
          </div>
        </div>
        <div className="cloud-card">
          <Cloud size={34} />
          <h3>{cloudState.mode === "supabase" ? "Supabase cloud sync" : "Local mode"}</h3>
          <p>{cloudState.message}</p>
          <div className="cloud-status-grid" aria-label="Cloud sync status">
            <div>
              <span>Auth</span>
              <strong>{cloudState.authenticated ? "signed in" : cloudState.refreshable ? "refreshable" : "local"}</strong>
            </div>
            <div>
              <span>Auto reconcile</span>
              <strong>{cloudWriteAutosync ? "enabled" : "waiting"}</strong>
            </div>
            <div>
              <span>Records</span>
              <strong>{records.length}</strong>
            </div>
            <div>
              <span>Mode proofs</span>
              <strong>{modeRuns.length}</strong>
            </div>
            <div>
              <span>Pending sync</span>
              <strong>{outboxQueued || syncCoverage.pendingItems}</strong>
            </div>
            <div>
              <span>Read-back</span>
              <strong>
                {verification
                  ? `${verification.records + verification.modeRuns + (verification.shareArtifacts ?? 0) + (verification.publicShareImages ?? 0)}/${records.length + modeRuns.length + shareEvidence.length * 2}`
                  : "not checked"}
              </strong>
            </div>
            <div>
              <span>Share cards</span>
              <strong>{shareImageEvidence}/{records.length + modeRuns.length}</strong>
            </div>
            <div>
              <span>Share channel</span>
              <strong>
                {productionShareChannelEvidence.length > 0
                  ? `record ${recordShareChannelEvidence}/${records.length} · mode ${modeShareChannelEvidence}/${modeRuns.length}`
                  : "not exercised"}
              </strong>
            </div>
            <div>
              <span>Last synced</span>
              <strong>{cloudState.lastSyncedAt ? formatDate(cloudState.lastSyncedAt) : "not yet"}</strong>
            </div>
            <div>
              <span>Session expires</span>
              <strong>{cloudState.sessionExpiresAt ? formatDate(cloudState.sessionExpiresAt) : "not set"}</strong>
            </div>
          </div>
          <div className="cloud-checklist" aria-label="Cloud acceptance checks">
            {cloudChecks.map((check) => (
              <div key={check.label} className={check.passed ? "passed" : ""}>
                <CheckCircle2 size={16} />
                <span>{check.label}</span>
                <strong>{check.detail}</strong>
              </div>
            ))}
          </div>
          <CloudSyncOutboxPanel items={syncOutbox} verified={outboxVerified} />
          <div className="cloud-audit" aria-label="Cloud sync audit">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Cross-device audit</p>
                <h3>Cloud sync coverage</h3>
              </div>
              <span className="pill">{auditPassed}/{syncAudit.length}</span>
            </div>
            {syncAudit.map((item) => (
              <article key={item.key} className={`audit-${item.status}`}>
                <div>
                  <CheckCircle2 size={16} />
                  <strong>{item.label}</strong>
                  <span>{item.status}</span>
                </div>
                <progress value={item.synced} max={Math.max(1, item.total)} />
                <small>{item.synced}/{item.total} · {item.detail}</small>
                <p>{item.action}</p>
              </article>
            ))}
          </div>
          <RuntimeConfigPanel items={runtimeConfigReadiness} summary={runtimeConfigSummary} />
          <ProductionBootstrapRunbookPanel runbook={productionBootstrapRunbook} status={productionBootstrapRunbookStatus} />
          <ProductionAccessPreflightPanel packet={productionAccessPreflight} status={productionAccessPreflightStatus} />
          <ProductionEnvPlanPanel packet={productionEnvPlan} status={productionEnvPlanStatus} />
          <ProductionVerifyTargetsPanel envText={productionVerifyEnv} ledger={productionEnvLedger} />
          <ProductionAcceptanceCollectorPanel packet={productionAcceptanceCollector} />
          <ProductionGoalAuditPanel packet={productionGoalAudit} />
          <ProductionAccountBootstrapPanel
            packet={productionAccountBootstrap}
            bootstrapPlan={supabaseBootstrapPlan}
            bootstrapPlanStatus={supabaseBootstrapPlanStatus}
          />
          <AccountHandoffPanel packet={accountHandoff} />
          <AccountCloudSyncEvidencePanel packet={accountCloudSyncEvidence} />
          <AccountRecoveryEvidencePanel packet={accountRecovery} />
          <ProfileArchiveEvidencePanel packet={profileArchiveEvidence} />
          <BrandAssetPacketPanel packet={brandAssetPacket} />
          <ProductionDoctorPanel report={productionDoctor} />
          <FilecoinAutomationEvidencePanel packet={filecoinAutomationEvidence} onSealMissing={onSealMissingFilecoinLanes} />
          <FilecoinSealLifecyclePanel packet={filecoinSealLifecycle} />
          <FilecoinBootstrapPanel plan={filecoinBootstrapPlan} status={filecoinBootstrapPlanStatus} />
          <RealtimeDataBootstrapPanel plan={dataBootstrapPlan} status={dataBootstrapPlanStatus} />
          <FreeDataSourceEvidencePanel packet={freeDataSourceEvidence} />
          <RealtimeDataEvidencePacketPanel packet={realtimeDataEvidence} />
          <DataContinuityEvidencePanel packet={dataContinuityEvidence} />
          <IntelligenceEnrichmentEvidencePanel packet={intelligenceEnrichmentEvidence} />
          <ProductionLaunchPacketPanel packet={productionLaunchPacket} />
          <PublicDeploymentEvidencePanel packet={publicDeploymentEvidence} status={publicDeploymentEvidenceStatus} />
          <ProductionEvidencePanel evidence={productionEvidence} status={productionEvidenceStatus} />
          <CloudReadbackLedger verification={verification} records={records} modeRuns={modeRuns} shareEvidence={shareEvidence} />
          <LeaderboardSeasonEvidencePanel packet={leaderboardSeasonPacket} />
          <LeaderboardBackendPanel artifact={leaderboardBackendArtifact} status={leaderboardBackendStatus} />
          <LeaderboardQueryContractPanel packet={leaderboardQueryContract} />
          <LeaderboardEvidencePanel evidence={leaderboardScopeEvidence} profileId={profile.id} />
          <ShareChannelBootstrapPanel artifact={shareChannelArtifact} status={shareChannelArtifactStatus} />
          <PublicProofPublicationLedgerPanel ledger={publicProofPublicationLedger} />
          <ShareChannelEvidencePanel packet={shareChannelEvidencePacket} />
          <ShareArtifactLedger
            records={records}
            modeRuns={modeRuns}
            evidence={shareEvidence}
            onPublishMissing={onPublishMissingShareCards}
            onOpenMissingChannels={onOpenMissingShareChannels}
          />
          <label>
            <span>Magic link email</span>
            <input value={email} onChange={(event) => onEmail(event.target.value)} />
          </label>
          <div className="actions">
            <button onClick={onGoogleSignIn}>
              <UserCircle2 size={18} /> Continue with Google
            </button>
            <button onClick={onMagicLink}>
              <Link2 size={18} /> Send magic link
            </button>
            <button className="primary" onClick={onSync}>
              <UploadCloud size={18} /> Sync {records.length} records / {modeRuns.length} modes / {shareEvidence.length} cards
            </button>
            <button onClick={onPull}>
              <Download size={18} /> Pull cloud history
            </button>
            <button onClick={onSaveProfile}>
              <UserCircle2 size={18} /> Save profile
            </button>
            <button onClick={onSignOut}>
              <ShieldCheck size={18} /> Sign out
            </button>
            <button onClick={onOpenProfile}>
              <Medal size={18} /> Open public profile
            </button>
            <button onClick={onCopyProfileLink}>
              <Link2 size={18} /> Copy profile link
            </button>
            <button onClick={onCopyFriendInvite}>
              <Users size={18} /> Copy friend invite
            </button>
          </div>
          <div className="schema-note">
            <strong>Required backend tables</strong>
            <code>kickoff_profiles</code>
            <code>kickoff_records</code>
            <code>kickoff_mode_runs</code>
            <code>kickoff_share_artifacts</code>
            <code>kickoff_leaderboard</code>
          </div>
        </div>
      </div>
      <ProductionReadinessPanel items={productionReadiness} summary={productionSummary} />
      <AcceptanceTestPanel evidence={acceptanceEvidence} status={acceptanceEvidenceStatus} />
    </section>
  );
}

function RuntimeConfigPanel({
  items,
  summary,
}: {
  items: RuntimeConfigItem[];
  summary: RuntimeConfigSummary;
}) {
  const categoryLabels: Record<RuntimeConfigItem["category"], string> = {
    account: "Account",
    data: "Realtime data",
    filecoin: "Filecoin",
    sharing: "Sharing",
  };
  return (
    <div className="runtime-config" aria-label="Production runtime config">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Runtime config</p>
          <h3>Production environment gates</h3>
        </div>
        <span className={`pill ${summary.ready ? "real" : "demo"}`}>
          {summary.requiredPassed}/{summary.requiredTotal} required
        </span>
      </div>
      <div className="runtime-config-summary">
        <div>
          <span>Required</span>
          <strong>{summary.requiredPassed}/{summary.requiredTotal}</strong>
        </div>
        <div>
          <span>Recommended</span>
          <strong>{summary.recommendedPassed}/{summary.recommendedTotal}</strong>
        </div>
      </div>
      <div className="runtime-config-grid">
        {items.map((item) => (
          <article key={item.key} className={item.passed ? "passed" : ""}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{item.label}</strong>
              <span>{categoryLabels[item.category]}</span>
            </div>
            <small>{item.required ? "Required" : "Recommended"} · {item.detail}</small>
            <p>{item.passed ? "Configured." : item.action}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProductionBootstrapRunbookPanel({
  runbook,
  status,
}: {
  runbook?: ProductionBootstrapRunbook;
  status: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const summary = summarizeProductionBootstrapRunbook(runbook, status);
  const copyRunbook = async () => {
    const copied = await copyToClipboard(summary.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  const visibleBlockedSteps = summary.blockedSteps;
  return (
    <div className={`production-bootstrap-runbook ${summary.ready ? "ready" : ""}`} aria-label="Production bootstrap runbook">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Bootstrap runbook</p>
          <h3>Production completion pipeline</h3>
        </div>
        <button onClick={copyRunbook}>
          <FileCheck2 size={16} /> {copyStatus === "copied" ? "Copied runbook" : "Copy runbook"}
        </button>
      </div>
      <div className="production-bootstrap-summary">
        <div>
          <span>Steps</span>
          <strong>{summary.passedSteps}/{summary.totalSteps}</strong>
        </div>
        <div>
          <span>Failed</span>
          <strong>{summary.failedSteps}</strong>
        </div>
        <div>
          <span>Mode</span>
          <strong>{summary.mode}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{summary.ready ? "ready" : "blocked"}</strong>
        </div>
      </div>
      <p>{summary.nextAction}</p>
      <div className="production-bootstrap-commands" aria-label="Production bootstrap commands">
        {summary.commands.slice(0, 6).map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>
      {copyStatus === "manual" && (
        <label className="production-bootstrap-copy">
          <span>Manual runbook copy</span>
          <textarea
            aria-label="Manual production bootstrap runbook copy"
            readOnly
            value={summary.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="production-bootstrap-acceptance" aria-label="Production bootstrap acceptance checklist">
        {summary.acceptanceChecklist.map((item) => (
          <article key={item.id} className={`acceptance-${item.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{item.label}</strong>
              <span>{item.passedSteps}/{item.totalSteps}</span>
            </div>
            <code>{item.command}</code>
            {item.missingEnv.length > 0 && (
              <div className="production-bootstrap-missing" aria-label={`${item.label} missing values`}>
                {item.missingEnv.slice(0, 5).map((missing) => (
                  <span key={missing}>{missing}</span>
                ))}
              </div>
            )}
            <p>{item.evidence}</p>
          </article>
        ))}
      </div>
      <div className="production-bootstrap-steps" aria-label="Production bootstrap blocked steps">
        {runbook ? (
          visibleBlockedSteps.length > 0 ? (
            visibleBlockedSteps.map((step) => (
              <article key={step.id} className={`bootstrap-${step.status}`}>
                <div>
                  <CheckCircle2 size={16} />
                  <strong>{step.label}</strong>
                  <span>{step.status}</span>
                </div>
                <code>{step.command}</code>
                <small>{productionBootstrapStepProgress(step)}</small>
                {step.parsedMissingEnv && step.parsedMissingEnv.length > 0 && (
                  <div className="production-bootstrap-missing" aria-label={`${step.label} missing values`}>
                    {step.parsedMissingEnv.slice(0, 8).map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                )}
                <p>{productionBootstrapStepDetail(step)}</p>
              </article>
            ))
          ) : (
            <article className="bootstrap-passed">
              <div>
                <CheckCircle2 size={16} />
                <strong>All bootstrap stages</strong>
                <span>passed</span>
              </div>
              <code>bun run verify:production && bun run goal:audit</code>
              <p>Every production bootstrap stage completed in this artifact.</p>
            </article>
          )
        ) : (
          <article className="bootstrap-failed">
            <div>
              <CheckCircle2 size={16} />
              <strong>Runbook artifact</strong>
              <span>missing</span>
            </div>
            <code>bun run production:bootstrap -- --json</code>
            <p>{status}</p>
          </article>
        )}
      </div>
    </div>
  );
}

function ProductionEnvPlanPanel({
  packet,
  status,
}: {
  packet?: ProductionEnvPlanPacket;
  status: string;
}) {
  const copyPlan = async () => {
    await navigator.clipboard?.writeText(packet?.copyText ?? status);
  };
  const missingRows = packet?.rows.filter((row) => row.required && row.status !== "filled").slice(0, 8) ?? [];
  return (
    <div className={`production-env-plan ${packet?.ready ? "ready" : ""}`} aria-label="Production env plan">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Env plan</p>
          <h3>Production setup map</h3>
        </div>
        <button onClick={copyPlan}>
          <FileCheck2 size={16} /> Copy plan
        </button>
      </div>
      <div className="production-env-summary" aria-label="Production env plan summary">
        <div>
          <span>Missing</span>
          <strong>{packet?.missingRequired.length ?? 0}</strong>
        </div>
        <div>
          <span>Invalid</span>
          <strong>{packet?.invalidRequired.length ?? 0}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{packet?.ready ? "ready" : "collecting"}</strong>
        </div>
      </div>
      <small>{packet ? packet.nextAction : status}</small>
      {packet ? (
        <>
          <div className="production-env-groups" aria-label="Production env plan groups">
            {packet.groups.map((group) => (
              <article key={group.group} className={group.ready ? "env-ready" : "env-missing"}>
                <span>{group.label}</span>
                <strong>{group.filled}/{group.total}</strong>
              </article>
            ))}
          </div>
          <div className="production-env-ledger compact" aria-label="Production env plan missing rows">
            {missingRows.map((row) => (
              <article key={row.key} className={`env-${row.status}`}>
                <div>
                  <CheckCircle2 size={16} />
                  <strong>{row.label}</strong>
                  <span>{row.status}</span>
                </div>
                <code>{row.key}</code>
                <small>{row.command}</small>
                <p>{row.action}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="production-env-ledger">
          <article className="env-missing">
            <div>
              <CheckCircle2 size={16} />
              <strong>Plan artifact</strong>
              <span>missing</span>
            </div>
            <code>public/production-env-plan.json</code>
            <small>bun run env:production:plan</small>
            <p>{status}</p>
          </article>
        </div>
      )}
    </div>
  );
}

function ProductionAccessPreflightPanel({
  packet,
  status,
}: {
  packet?: ProductionAccessPreflightPacket;
  status: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPreflight = async () => {
    const copied = await copyToClipboard(packet?.copyText ?? status);
    setCopyStatus(copied ? "copied" : "manual");
  };
  const stages = packet?.stages ?? [];
  return (
    <div className={`production-access-preflight ${packet?.ready ? "ready" : ""}`} aria-label="Production access preflight">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Access preflight</p>
          <h3>Production account access</h3>
        </div>
        <button onClick={copyPreflight}>
          <FileCheck2 size={16} /> {copyStatus === "copied" ? "Copied preflight" : "Copy preflight"}
        </button>
      </div>
      <div className="production-env-summary" aria-label="Production access preflight summary">
        <div>
          <span>Stages</span>
          <strong>{packet ? `${packet.stageReadyCount}/${packet.totalStages}` : "0/5"}</strong>
        </div>
        <div>
          <span>Cloudflare</span>
          <strong>{packet?.cliAuthenticated.cloudflare ? "auth" : "missing"}</strong>
        </div>
        <div>
          <span>Supabase</span>
          <strong>{packet?.cliAuthenticated.supabase ? "auth" : "missing"}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{packet?.ready ? "ready" : "blocked"}</strong>
        </div>
      </div>
      <small>{packet ? packet.nextAction : status}</small>
      <div className="production-env-ledger compact" aria-label="Production access preflight stages">
        {packet ? (
          stages.map((stage) => (
            <article key={stage.id} className={`env-${stage.status === "ready" ? "filled" : "missing"}`}>
              <div>
                <CheckCircle2 size={16} />
                <strong>{stage.label}</strong>
                <span>{stage.status}</span>
              </div>
              <code>{stage.command}</code>
              <small>{stage.missingEnv.join(", ") || "none missing"}</small>
              <p>{stage.status === "ready" ? stage.detail : stage.nextAction}</p>
            </article>
          ))
        ) : (
          <article className="env-missing">
            <div>
              <CheckCircle2 size={16} />
              <strong>Preflight artifact</strong>
              <span>missing</span>
            </div>
            <code>public/production-access-preflight.json</code>
            <small>bun run access:preflight</small>
            <p>{status}</p>
          </article>
        )}
      </div>
      {copyStatus === "manual" && (
        <label className="production-bootstrap-copy">
          <span>Manual access preflight copy</span>
          <textarea
            aria-label="Manual production access preflight copy"
            readOnly
            value={packet?.copyText ?? status}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}

function ProductionVerifyTargetsPanel({
  envText,
  ledger,
}: {
  envText: string;
  ledger: ProductionEnvLedgerPacket;
}) {
  const copyTargets = async () => {
    await navigator.clipboard?.writeText(envText);
  };
  const copyLedger = async () => {
    await navigator.clipboard?.writeText(ledger.copyText);
  };
  const envRows = envText.split("\n").filter((line) => line.includes("="));
  const filled = envRows.filter((line) => line.split("=").slice(1).join("=").trim().length > 0).length;
  return (
    <div className="production-targets" aria-label="Production verification target env">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Verify targets</p>
          <h3>Production script env</h3>
        </div>
        <span className="pill">{filled}/{envRows.length} filled</span>
      </div>
      <div className="production-target-actions">
        <button onClick={copyTargets}>
          <Link2 size={16} /> Copy env
        </button>
        <button onClick={copyLedger}>
          <FileCheck2 size={16} /> Copy ledger
        </button>
        <span>Paste into <code>.env.production.local</code>, fill blanks, then run <code>bun run verify:production</code>.</span>
      </div>
      <div className="production-env-summary" aria-label="Production env ledger summary">
        <div>
          <span>Required keys</span>
          <strong>{ledger.requiredFilled}/{ledger.requiredTotal}</strong>
        </div>
        <div>
          <span>All keys</span>
          <strong>{ledger.filled}/{ledger.total}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{ledger.ready ? "ready" : "collecting"}</strong>
        </div>
      </div>
      <small>Next env action: {ledger.nextAction}</small>
      <div className="production-env-groups" aria-label="Production env groups">
        {ledger.groups.map((group) => (
          <article key={group.group} className={group.ready ? "env-ready" : "env-missing"}>
            <span>{group.label}</span>
            <strong>{group.filled}/{group.total}</strong>
          </article>
        ))}
      </div>
      <div className="production-env-ledger" aria-label="Production env ledger">
        {ledger.rows.map((row) => (
          <article key={row.key} className={`env-${row.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{row.label}</strong>
              <span>{row.status}</span>
            </div>
            <code>{row.key}={row.valuePreview}</code>
            <small>{row.command}</small>
            {row.status !== "filled" && <p>{row.action}</p>}
          </article>
        ))}
      </div>
      <pre>{envText}</pre>
    </div>
  );
}

function ProductionAcceptanceCollectorPanel({ packet }: { packet: ProductionAcceptanceCollectorPacket }) {
  const copyCollector = async () => {
    await navigator.clipboard?.writeText(packet.copyText);
  };
  return (
    <div className={`production-collector ${packet.ready ? "ready" : ""}`} aria-label="Production acceptance collector">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Collector</p>
          <h3>Production acceptance collector</h3>
        </div>
        <button onClick={copyCollector}>
          <FileCheck2 size={16} /> Copy collector
        </button>
      </div>
      <div className="production-collector-summary">
        <div>
          <span>Stages</span>
          <strong>{packet.stageReadyCount}/{packet.totalStages}</strong>
        </div>
        <div>
          <span>Blocked</span>
          <strong>{packet.blockedStages}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{packet.ready ? "ready" : "collecting"}</strong>
        </div>
      </div>
      <p>{packet.nextAction}</p>
      <div className="production-collector-commands">
        {packet.commands.map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>
      <div className="production-collector-stages" aria-label="Production collector stages">
        {packet.stages.map((stage) => (
          <article key={stage.id} className={`collector-${stage.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{stage.label}</strong>
              <span>{stage.status}</span>
            </div>
            <code>{stage.command}</code>
            <small>Requires: {stage.requiredEnv.join(", ") || "none"}</small>
            <small>Outputs: {stage.outputEnv.join(", ") || "none"}</small>
            <small>Missing: {stage.missingEnv.join(", ") || "none"}</small>
            <p>{stage.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProductionGoalAuditPanel({ packet }: { packet: ProductionGoalAuditPacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyAudit = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`production-goal-audit ${packet.ready ? "ready" : ""}`} aria-label="Production goal audit">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Goal audit</p>
          <h3>Original objective acceptance</h3>
        </div>
        <button onClick={copyAudit}>
          <FileCheck2 size={16} /> {copyStatus === "copied" ? "Copied audit" : "Copy audit"}
        </button>
      </div>
      <div className="production-goal-summary">
        <div><span>Goals</span><strong>{packet.passedRequirements}/{packet.totalRequirements}</strong></div>
        <div><span>Checks</span><strong>{packet.passedChecks}/{packet.totalChecks}</strong></div>
        <div><span>Queue</span><strong>{packet.openCommands}/{packet.commandQueue.length}</strong></div>
        <div><span>Blocked</span><strong>{packet.blockedCommands}</strong></div>
        <div><span>Production</span><strong>{packet.productionEvidenceLoaded ? "loaded" : "missing"}</strong></div>
        <div><span>Acceptance</span><strong>{packet.acceptanceEvidenceLoaded ? "loaded" : "missing"}</strong></div>
        <div><span>Env plan</span><strong>{packet.envPlanLoaded ? "loaded" : "missing"}</strong></div>
      </div>
      {packet.blankEnvDeclarations.length > 0 && (
        <p>Blank env: {packet.blankEnvDeclarations.slice(0, 8).map((item) => item.key).join(", ")}{packet.blankEnvDeclarations.length > 8 ? ` +${packet.blankEnvDeclarations.length - 8}` : ""}</p>
      )}
      <p>{packet.nextAction}</p>
      {copyStatus === "manual" && (
        <label className="production-goal-copy">
          <span>Manual goal audit copy</span>
          <textarea
            aria-label="Manual goal audit copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="production-goal-grid" aria-label="Production goal requirements">
        {packet.commandQueue.map((item) => (
          <article key={`queue-${item.id}`} className={`goal-${item.status === "done" ? "done" : "todo"}`}>
            <div>
              <FileCheck2 size={16} />
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <small>{item.command}</small>
            <small>Env: {item.envHints.join(", ") || "none"}</small>
            <p>{item.reason}</p>
          </article>
        ))}
        {packet.requirements.map((item) => (
          <article key={item.id} className={`goal-${item.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <small>{item.passed}/{item.total} · {item.command}</small>
            <small>Missing: {item.missing.join(", ") || "none"}</small>
            <small>Env: {item.envHints.join(", ") || "none"}</small>
            <p>{item.evidence}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProductionAccountBootstrapPanel({
  packet,
  bootstrapPlan,
  bootstrapPlanStatus,
}: {
  packet: ProductionAccountBootstrapPacket;
  bootstrapPlan?: SupabaseProductionBootstrapPlan;
  bootstrapPlanStatus: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`production-account-bootstrap ${packet.ready ? "ready" : ""}`} aria-label="Production account bootstrap">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Account bootstrap</p>
          <h3>Supabase acceptance packet</h3>
        </div>
        <button onClick={copyPacket}>
          <Cloud size={16} /> {copyStatus === "copied" ? "Copied packet" : copyStatus === "manual" ? "Manual copy" : "Copy packet"}
        </button>
      </div>
      <div className="production-account-summary">
        <div><span>Targets</span><strong>{packet.checks.filter((check) => check.passed).length}/{packet.checks.length}</strong></div>
        <div><span>Queries</span><strong>{packet.queries.filter((query) => query.ready).length}/{packet.queries.length}</strong></div>
        <div><span>Public links</span><strong>{packet.publicLinks.filter((link) => link.ready).length}/{packet.publicLinks.length}</strong></div>
        <div><span>Status</span><strong>{packet.ready ? "ready" : "pending"}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      <div className="production-account-commands">
        {packet.commands.map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>
      <SupabaseBootstrapStagesPanel plan={bootstrapPlan} status={bootstrapPlanStatus} />
      {copyStatus === "manual" && (
        <label className="production-account-copy">
          <span>Manual account packet copy</span>
          <textarea
            aria-label="Manual account packet copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="production-account-checks">
        {packet.checks.map((check) => (
          <article key={check.key} className={check.passed ? "passed" : ""}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{check.label}</strong>
              <span>{check.passed ? "filled" : "missing"}</span>
            </div>
            <small>{check.detail}</small>
          </article>
        ))}
      </div>
      <div className="production-account-queries">
        {packet.queries.map((query) => (
          <article key={`${query.scope}-${query.label}`} className={query.ready ? "passed" : ""}>
            <div>
              <Database size={16} />
              <strong>{query.label}</strong>
              <span>{query.ready ? "ready" : "needs target"}</span>
            </div>
            <code>{query.path}</code>
          </article>
        ))}
      </div>
      <div className="production-account-queries" aria-label="Supabase anonymous read-back commands">
        {packet.readBackCommands.map((item) => (
          <article key={item.label} className={item.ready ? "passed" : ""}>
            <div>
              <TerminalSquare size={16} />
              <strong>{item.label}</strong>
              <span>{item.ready ? "curl ready" : "needs env"}</span>
            </div>
            <code>{item.command}</code>
          </article>
        ))}
      </div>
      <div className="production-account-links">
        {packet.publicLinks.map((link) => (
          <article key={link.label} className={link.ready ? "passed" : ""}>
            <div>
              <Link2 size={16} />
              <strong>{link.label}</strong>
              <span>{link.ready ? "ready" : "missing"}</span>
            </div>
            <small>{link.url || "Set VITE_PUBLIC_APP_URL and target id"}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function SupabaseBootstrapStagesPanel({
  plan,
  status,
}: {
  plan?: SupabaseProductionBootstrapPlan;
  status: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPlan = async () => {
    const copied = await copyToClipboard(plan?.copyText ?? status);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <section className={`supabase-bootstrap-plan ${plan?.ready ? "ready" : ""}`} aria-label="Supabase bootstrap stages">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Supabase bootstrap</p>
          <h3>Account setup stages</h3>
        </div>
        <button onClick={copyPlan}>
          <TableProperties size={16} /> {copyStatus === "copied" ? "Copied stages" : "Copy stages"}
        </button>
      </div>
      <div className="supabase-bootstrap-summary" aria-label="Supabase bootstrap summary">
        <div><span>Stages</span><strong>{plan ? `${plan.stageReadyCount}/${plan.totalStages}` : "0/4"}</strong></div>
        <div><span>Blocked</span><strong>{plan?.blockedStages ?? 4}</strong></div>
        <div><span>Mode</span><strong>{plan?.execute ? "execute" : "plan"}</strong></div>
      </div>
      <small>{plan ? plan.nextAction : status}</small>
      <div className="supabase-bootstrap-stages">
        {plan ? (
          plan.stages.map((stage) => (
            <article key={stage.id} className={`stage-${stage.status}`}>
              <div>
                <CheckCircle2 size={16} />
                <strong>{stage.label}</strong>
                <span>{stage.status}</span>
              </div>
              <code>{stage.command}</code>
              <small>Missing: {stage.missingEnv.join(", ") || "none"}</small>
              <p>{stage.detail}</p>
            </article>
          ))
        ) : (
          <article className="stage-blocked">
            <div>
              <CheckCircle2 size={16} />
              <strong>Bootstrap artifact</strong>
              <span>missing</span>
            </div>
            <code>bun run supabase:bootstrap</code>
            <small>Missing: public/supabase-bootstrap-plan.json</small>
            <p>{status}</p>
          </article>
        )}
      </div>
      {plan?.setup && <SupabaseSetupPacketPanel packet={plan.setup} />}
      {copyStatus === "manual" && (
        <label className="production-account-copy">
          <span>Manual Supabase stages copy</span>
          <textarea
            aria-label="Manual Supabase stages copy"
            readOnly
            value={plan?.copyText ?? status}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}

function SupabaseSetupPacketPanel({ packet }: { packet: SupabaseProductionBootstrapPlan["setup"] }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copySetup = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <section className={`supabase-setup-packet ${packet.ready ? "ready" : ""}`} aria-label="Supabase setup packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Supabase setup</p>
          <h3>Hosted project handoff</h3>
        </div>
        <button onClick={copySetup}>
          <FileCheck2 size={16} /> {copyStatus === "copied" ? "Copied setup" : "Copy setup"}
        </button>
      </div>
      <div className="supabase-setup-summary">
        <div><span>Project</span><strong>{packet.projectRef || "missing"}</strong></div>
        <div><span>Steps</span><strong>{packet.checklist.filter((item) => item.status !== "blocked").length}/{packet.checklist.length}</strong></div>
        <div><span>Status</span><strong>{packet.ready ? "ready" : "blocked"}</strong></div>
      </div>
      <p>{packet.nextAction}</p>
      <div className="supabase-setup-links">
        <a href={packet.projectDashboardUrl} target="_blank" rel="noreferrer">Project</a>
        {packet.apiSettingsUrl && <a href={packet.apiSettingsUrl} target="_blank" rel="noreferrer">API keys</a>}
        {packet.authRedirectUrlConfigUrl && <a href={packet.authRedirectUrlConfigUrl} target="_blank" rel="noreferrer">Auth redirect</a>}
        {packet.storageUrl && <a href={packet.storageUrl} target="_blank" rel="noreferrer">Storage</a>}
      </div>
      <pre>{packet.envTemplateText}</pre>
      {copyStatus === "manual" && (
        <label className="production-account-copy">
          <span>Manual Supabase setup copy</span>
          <textarea
            aria-label="Manual Supabase setup copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="supabase-setup-checklist">
        {packet.checklist.map((item) => (
          <article key={item.id} className={`setup-${item.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            {item.command && <code>{item.command}</code>}
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.url}
              </a>
            )}
            <small>Missing: {item.missingEnv.join(", ") || "none"}</small>
            <p>{item.action}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function BrandAssetPacketPanel({ packet }: { packet: BrandAssetPacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`brand-asset-packet ${packet.ready ? "ready" : ""}`} aria-label="Brand asset packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Brand assets</p>
          <h3>Logo deployment packet</h3>
        </div>
        <button onClick={copyPacket}>
          <ImageDown size={16} /> {copyStatus === "copied" ? "Copied logo packet" : "Copy logo packet"}
        </button>
      </div>
      <div className="brand-asset-summary">
        <div>
          <img src={assetUrl("kickoff-lock-icon.png")} alt="Kickoff Lock Agent logo" />
          <span>Primary logo</span>
        </div>
        <div><span>Assets</span><strong>{packet.requiredAssets}/{packet.totalAssets}</strong></div>
        <div><span>Surfaces</span><strong>{packet.usages.length}</strong></div>
        <div><span>Status</span><strong>{packet.ready ? "ready" : "pending"}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Public logo: {packet.publicLogoUrl}</small>
      <small>Next action: {packet.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="brand-asset-copy">
          <span>Manual logo packet copy</span>
          <textarea
            aria-label="Manual logo packet copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="brand-asset-grid">
        {packet.assets.map((asset) => (
          <article key={asset.id}>
            <div>
              <img src={assetUrl(asset.fileName)} alt="" />
              <strong>{asset.size}</strong>
              <span>{asset.role}</span>
            </div>
            <small>{asset.fileName}</small>
          </article>
        ))}
      </div>
      <div className="brand-usage-grid">
        {packet.usages.map((usage) => (
          <article key={usage.id}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{usage.surface}</strong>
            </div>
            <small>{usage.evidence}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function FilecoinAutomationEvidencePanel({
  packet,
  onSealMissing,
}: {
  packet: FilecoinAutomationEvidencePacket;
  onSealMissing: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`filecoin-automation-evidence ${packet.ready ? "ready" : ""}`} aria-label="Filecoin automation evidence">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Filecoin automation</p>
          <h3>One-click seal evidence</h3>
        </div>
        <div className="button-row">
          <button onClick={onSealMissing} disabled={packet.runnableQueue === 0}>
            <UploadCloud size={16} /> Seal queued lanes
          </button>
          <button onClick={copyPacket}>
            <UploadCloud size={16} /> {copyStatus === "copied" ? "Copied automation" : "Copy automation"}
          </button>
        </div>
      </div>
      <div className="filecoin-automation-summary">
        <div><span>Lanes</span><strong>{packet.lanesReady}/{packet.totalLanes}</strong></div>
        <div><span>Registry</span><strong>{packet.registryMatches}/{packet.totalLanes}</strong></div>
        <div><span>Backend</span><strong>{packet.productionBackends}/{packet.totalLanes}</strong></div>
        <div><span>Queue</span><strong>{packet.runnableQueue}/{packet.queue.length}</strong></div>
        <div><span>Uploads</span><strong>{packet.uploadStatusPolls}</strong></div>
        <div><span>Polls</span><strong>{packet.pollAttempts}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="filecoin-automation-copy">
          <span>Manual automation copy</span>
          <textarea
            aria-label="Manual automation copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="filecoin-automation-checks">
        {packet.checks.map((check) => (
          <article key={check.key} className={check.passed ? "passed" : "pending"}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{check.label}</strong>
              <span>{check.passed ? "passed" : "pending"}</span>
            </div>
            <small>{check.detail}</small>
          </article>
        ))}
      </div>
      <div className="filecoin-automation-queue" aria-label="Filecoin batch seal queue">
        {packet.queue.map((item) => (
          <article key={`${item.kind}-${item.modeId ?? item.artifactId ?? "missing"}`} className={item.runnable ? "runnable" : "missing"}>
            <div>
              <UploadCloud size={16} />
              <strong>{item.kind === "record" ? "Prediction lane" : `${item.modeId} lane`}</strong>
              <span>{item.runnable ? "queued" : "missing"}</span>
            </div>
            <small>{item.artifactId ?? "no artifact yet"}</small>
            <small>{item.reason}</small>
          </article>
        ))}
      </div>
      <div className="filecoin-automation-lanes">
        {packet.lanes.map((lane) => (
          <article key={lane.laneId} className={`lane-${lane.status}`}>
            <div>
              <UploadCloud size={16} />
              <strong>{lane.kind === "record" ? "Prediction seal" : `${lane.modeId ?? "Mode"} proof seal`}</strong>
              <span>{lane.status}</span>
            </div>
            <small>Artifact: {lane.artifactId ?? "missing"}</small>
            <small>CID: {lane.cid ?? "missing"}</small>
            <small>Upload polls: {lane.uploadStatusPolls} · Verify polls: {lane.pollAttempts} · Registry: {lane.registryHashMatch ? "hash match" : "pending"}</small>
            <small>Blockers: {lane.blockers.join(", ") || "none"}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function FilecoinSealLifecyclePanel({ packet }: { packet: FilecoinSealLifecyclePacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`filecoin-lifecycle-evidence ${packet.ready ? "ready" : ""}`} aria-label="Filecoin seal lifecycle evidence">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Seal lifecycle</p>
          <h3>Production Filecoin runbook</h3>
        </div>
        <button onClick={copyPacket}>
          <FileCheck2 size={16} /> {copyStatus === "copied" ? "Copied lifecycle" : "Copy lifecycle"}
        </button>
      </div>
      <div className="filecoin-lifecycle-summary">
        <div><span>Complete</span><strong>{packet.completeArtifacts}/{packet.totalArtifacts}</strong></div>
        <div><span>Read-back</span><strong>{packet.registryProofs}/{packet.totalArtifacts}</strong></div>
        <div><span>Production</span><strong>{packet.productionBackends}/{packet.totalArtifacts}</strong></div>
        <div><span>Resumable</span><strong>{packet.resumableArtifacts}</strong></div>
        <div><span>Resume queue</span><strong>{packet.resumeQueueReady}/{packet.resumeQueue.length}</strong></div>
        <div><span>Upload polls</span><strong>{packet.uploadStatusPolls}</strong></div>
        <div><span>Verify polls</span><strong>{packet.verificationPolls}</strong></div>
        <div><span>Dossiers</span><strong>{packet.readBackDossierReady}/{packet.totalArtifacts}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      <div className="filecoin-lifecycle-dossiers" aria-label="Filecoin judge read-back dossiers">
        {packet.readBackDossiers.map((dossier) => (
          <article key={dossier.id} className={dossier.ready ? "passed" : "pending"}>
            <div className="filecoin-lifecycle-dossier-head">
              <div>
                <FileCheck2 size={16} />
                <strong>{dossier.label}</strong>
              </div>
              <span>{dossier.passedSteps}/{dossier.totalSteps}</span>
            </div>
            <small>{dossier.artifactId ?? "missing artifact"} · {dossier.modeId ?? dossier.kind}</small>
            <div className="filecoin-lifecycle-dossier-steps">
              {dossier.steps.map((step) => (
                <div key={step.route} className={step.passed ? "passed" : "pending"}>
                  <span>{step.label}</span>
                  <small>{step.verdict}</small>
                  <small>Fields: {step.requiredFields.join(", ")}</small>
                  {step.command && <code>{step.command}</code>}
                </div>
              ))}
            </div>
            {dossier.blockers.length > 0 && <small>Blockers: {dossier.blockers.slice(0, 3).join(" · ")}</small>}
          </article>
        ))}
      </div>
      {packet.readBackCommands.length > 0 && (
        <div className="filecoin-lifecycle-readbacks" aria-label="Filecoin CID read-back commands">
          {packet.readBackCommands.map((command) => (
            <article key={command.id} className={command.ready ? "passed" : "pending"}>
              <div>
                <FileCheck2 size={16} />
                <strong>{command.label}</strong>
                <span>{command.ready ? "ready" : "pending"}</span>
              </div>
              <small>{command.authMode}</small>
              <code>{command.command}</code>
            </article>
          ))}
        </div>
      )}
      {copyStatus === "manual" && (
        <label className="filecoin-lifecycle-copy">
          <span>Manual lifecycle copy</span>
          <textarea
            aria-label="Manual lifecycle copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="filecoin-lifecycle-checks">
        {packet.checks.map((check) => (
          <article key={check.key} className={check.passed ? "passed" : "pending"}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{check.label}</strong>
              <span>{check.passed ? "passed" : "pending"}</span>
            </div>
            <small>{check.detail}</small>
          </article>
        ))}
      </div>
      {packet.resumeQueue.length > 0 && (
        <div className="filecoin-lifecycle-resume-queue" aria-label="Filecoin resume queue">
          {packet.resumeQueue.map((item) => (
            <article key={item.id} className={item.canResume ? "resume-ready" : `resume-${item.risk}`}>
              <div>
                <UploadCloud size={16} />
                <strong>{item.label}</strong>
                <span>{item.canResume ? "ready" : item.risk}</span>
              </div>
              <small>{item.artifactId ?? "missing artifact"} · {item.backendJobId ?? "no backend job"}</small>
              <small>{item.nextActionDetail}</small>
              <small>Upload polls {item.uploadStatusPolls} · Verify polls {item.verificationPolls}</small>
              {item.uploadStatusUrl && <small>Status URL: {item.uploadStatusUrl}</small>}
              {item.blockers.length > 0 && <small>Blockers: {item.blockers.join(", ")}</small>}
            </article>
          ))}
        </div>
      )}
      <div className="filecoin-lifecycle-artifacts">
        {packet.artifacts.map((artifact) => (
          <article key={`${artifact.kind}-${artifact.modeId ?? artifact.artifactId ?? "missing"}`} className={`lifecycle-${artifact.status}`}>
            <div className="filecoin-lifecycle-artifact-head">
              <div>
                <strong>{artifact.kind === "record" ? "Prediction proof" : `${artifact.modeId} mode proof`}</strong>
                <span>{artifact.title}</span>
              </div>
              <b>{artifact.passedStages}/{artifact.totalStages}</b>
            </div>
            <div className="filecoin-lifecycle-meta">
              <span>{artifact.status}</span>
              <span>resume {artifact.resumeRisk}</span>
              <span>action {artifact.resumeNextAction}</span>
              <span>{artifact.artifactId ?? "missing artifact"}</span>
              <span>{artifact.cid ?? "CID pending"}</span>
              <span>{artifact.backendJobId ?? "job pending"}</span>
            </div>
            <div className="filecoin-lifecycle-stages">
              {artifact.stages.map((stage) => (
                <div key={stage.key} className={stage.passed ? "passed" : "pending"}>
                  <CheckCircle2 size={14} />
                  <span>{stage.label}</span>
                  <small>{stage.detail}</small>
                </div>
              ))}
            </div>
            <small>Resume evidence: {artifact.resumeEvidence.join(" · ")}</small>
            <small>Resume action: {artifact.resumeNextActionDetail}</small>
            <small>Next: {artifact.nextAction}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function AccountHandoffPanel({ packet }: { packet: AccountHandoffPacket }) {
  const copyHandoff = async () => {
    await navigator.clipboard?.writeText(packet.copyText);
  };
  return (
    <div className={`account-handoff ${packet.crossDeviceReady ? "ready" : ""}`} aria-label="Account handoff packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Cross-device handoff</p>
          <h3>Account handoff packet</h3>
        </div>
        <span className="pill">{packet.crossDeviceReady ? "ready" : "pending"}</span>
      </div>
      <div className="account-handoff-summary">
        <div>
          <span>Cloud read-back</span>
          <strong>{packet.cloudReadBackArtifacts}/{packet.localArtifacts}</strong>
        </div>
        <div>
          <span>Pending sync</span>
          <strong>{packet.pendingSyncItems}</strong>
        </div>
        <div>
          <span>Clean renders</span>
          <strong>{packet.cleanSessionArtifacts}</strong>
        </div>
        <div>
          <span>Leaderboard</span>
          <strong>{packet.leaderboardScopes.length}/3</strong>
        </div>
        <div>
          <span>Verify env</span>
          <strong>{packet.envFilled}/{packet.envTotal}</strong>
        </div>
      </div>
      <p>{packet.summary}</p>
      <div className="account-handoff-actions">
        <button onClick={copyHandoff}>
          <FileCheck2 size={16} /> Copy handoff
        </button>
        <code>{packet.publicProfileUrl}</code>
      </div>
      <div className="account-handoff-checks">
        {packet.checklist.map((item) => (
          <article key={item.key} className={`handoff-${item.status}`}>
            <div>
              <CheckCircle2 size={15} />
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>
      <small>Next action: {packet.nextAction}</small>
    </div>
  );
}

function AccountCloudSyncEvidencePanel({ packet }: { packet: AccountCloudSyncEvidenceArtifact }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "summary" | "json" | "manual">("idle");
  const copySummary = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "summary" : "manual");
  };
  const copyJson = async () => {
    const copied = await copyToClipboard(`${JSON.stringify(packet, null, 2)}\n`);
    setCopyStatus(copied ? "json" : "manual");
  };
  const copiedLabel =
    copyStatus === "summary" ? "Copied summary" : copyStatus === "json" ? "Copied JSON" : copyStatus === "manual" ? "Manual copy" : "Copy summary";
  return (
    <div className={`account-cloud-evidence ${packet.ready ? "ready" : ""}`} aria-label="Account cloud sync evidence">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Cloud account evidence</p>
          <h3>Browser runtime sync packet</h3>
        </div>
        <div className="packet-actions">
          <button onClick={copySummary}>
            <FileCheck2 size={16} /> {copiedLabel}
          </button>
          <button onClick={copyJson}>
            <Download size={16} /> Copy JSON
          </button>
        </div>
      </div>
      <div className="account-cloud-evidence-summary">
        <div>
          <span>Status</span>
          <strong>{packet.ready ? "ready" : "needs proof"}</strong>
        </div>
        <div>
          <span>History hash</span>
          <strong>{packet.verifiedTotals.contentFingerprints}/{packet.localTotals.historyArtifacts}</strong>
        </div>
        <div>
          <span>Public proofs</span>
          <strong>{packet.verifiedTotals.publicProofs}/{packet.localTotals.publicProofs}</strong>
        </div>
        <div>
          <span>Share images</span>
          <strong>{packet.verifiedTotals.publicShareImages}/{packet.localTotals.shareArtifacts}</strong>
        </div>
        <div>
          <span>Profile archive</span>
          <strong>{packet.verifiedTotals.publicProfileArchives}/{packet.localTotals.historyArtifacts}</strong>
        </div>
        <div>
          <span>Leaderboard</span>
          <strong>{packet.expectedIds.leaderboardScopes.length}/3</strong>
        </div>
      </div>
      <div className="account-cloud-acceptance" aria-label="Account cloud acceptance gates">
        {Object.entries(packet.acceptance).map(([key, passed]) => (
          <span key={key} className={passed ? "passed" : ""}>{key.replace(/([A-Z])/g, " $1")}</span>
        ))}
      </div>
      <p>{packet.ready ? "Current browser state proves Supabase account sync, public restore, share images and leaderboard read-back." : packet.missing[0] ?? "Cloud sync evidence is not ready yet."}</p>
      <small>Profile: {packet.profileId} · source {packet.source} · fingerprint {packet.evidenceFingerprint.slice(0, 16)}</small>
      <small>Next action: {packet.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="account-cloud-copy">
          <span>Manual account evidence copy</span>
          <textarea
            aria-label="Manual account evidence copy"
            readOnly
            value={JSON.stringify(packet, null, 2)}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}

function AccountRecoveryEvidencePanel({ packet }: { packet: AccountRecoveryEvidencePacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div
      className={`account-recovery-evidence ${packet.ready ? "ready" : ""}`}
      aria-label="Cross-device recovery evidence"
    >
      <div className="panel-head">
        <div>
          <p className="eyebrow">Recovery rehearsal</p>
          <h3>Cross-device recovery evidence</h3>
        </div>
        <button onClick={copyPacket}>
          <Download size={16} /> {copyStatus === "copied" ? "Copied recovery" : copyStatus === "manual" ? "Recovery text shown" : "Copy recovery"}
        </button>
      </div>
      <div className="account-recovery-summary">
        <div>
          <span>Checks</span>
          <strong>{packet.recoveryScore}</strong>
        </div>
        <div>
          <span>Cloud artifacts</span>
          <strong>{packet.recoveredArtifacts}/{packet.expectedArtifacts}</strong>
        </div>
        <div>
          <span>Anonymous</span>
          <strong>{packet.anonymousArtifacts}</strong>
        </div>
        <div>
          <span>Fingerprints</span>
          <strong>{packet.fingerprintMatches}/{packet.expectedArtifacts}</strong>
        </div>
      </div>
      <p>{packet.summary}</p>
      <small>Leaderboard scopes: {packet.leaderboardScopes.length > 0 ? packet.leaderboardScopes.join(", ") : "none yet"}</small>
      <small>Next action: {packet.nextAction}</small>
      <div className="account-recovery-proof-ledger" aria-label="Recovery proof ledger">
        {packet.recoveryProofs.map((proof) => (
          <article key={`${proof.kind}-${proof.id}`} className={`proof-${proof.status}`}>
            <div>
              <strong>{proof.label}</strong>
              <span>{proof.kind}</span>
            </div>
            <small>{proof.id}</small>
            <div className="proof-ledger-flags">
              <span className={proof.cloudRow ? "on" : ""}>cloud</span>
              <span className={proof.contentFingerprint ? "on" : ""}>hash</span>
              <span className={proof.publicArchive ? "on" : ""}>public</span>
              <span className={proof.cleanSession ? "on" : ""}>clean</span>
            </div>
            {proof.blockers.length > 0 ? <p>{proof.blockers[0]}</p> : null}
          </article>
        ))}
      </div>
      {copyStatus === "manual" && (
        <label className="account-recovery-copy">
          <span>Manual recovery copy</span>
          <textarea
            aria-label="Manual recovery copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="account-recovery-steps">
        {packet.steps.map((step) => (
          <article key={step.key} className={`recovery-${step.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{step.label}</strong>
              <span>{step.status}</span>
            </div>
            <small>{step.detail}</small>
            <p>{step.status === "passed" ? "Ready for recovery proof." : step.action}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProductionDoctorPanel({ report }: { report: ProductionDoctorReport }) {
  return (
    <div className="production-doctor" aria-label="Production operator checklist">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Operator doctor</p>
          <h3>Competition acceptance checklist</h3>
        </div>
        <span className={`pill ${report.ready ? "real" : "demo"}`}>
          {report.evidence.passed}/{report.evidence.total || 0} evidence
        </span>
      </div>
      <div className={`production-doctor-status ${report.ready ? "passed" : ""}`}>
        <Radar size={18} />
        <div>
          <strong>{report.ready ? "Ready for final submission" : "Next real-service gaps"}</strong>
          <span>{report.headline}</span>
        </div>
      </div>
      {report.runtime.missingEnvKeys.length > 0 ? (
        <div className="production-doctor-env">
          <strong>Missing runtime env</strong>
          <span>{report.runtime.missingEnvKeys.join(", ")}</span>
        </div>
      ) : null}
      <div className="production-doctor-grid">
        {report.items.map((item) => (
          <article key={item.id} className={`doctor-${item.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <small>{item.detail}</small>
            {item.envKeys.length > 0 ? <code>{item.envKeys.join(", ")}</code> : null}
            <p>{item.status === "done" ? "External evidence is already green." : item.action}</p>
          </article>
        ))}
      </div>
      {report.nextActions.length > 0 ? (
        <div className="production-doctor-next">
          <strong>Next actions</strong>
          {report.nextActions.slice(0, 4).map((item, index) => (
            <span key={item.id}>{index + 1}. {item.label}: {item.action}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilecoinBootstrapPanel({
  plan,
  status,
}: {
  plan?: FilecoinProductionBootstrapPlan;
  status: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPlan = async () => {
    const copied = await copyToClipboard(plan?.copyText ?? status);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <section className={`filecoin-bootstrap-plan ${plan?.ready ? "ready" : ""}`} aria-label="Filecoin bootstrap stages">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Filecoin bootstrap</p>
          <h3>Seal API setup stages</h3>
        </div>
        <button onClick={copyPlan}>
          <UploadCloud size={16} /> {copyStatus === "copied" ? "Copied stages" : "Copy stages"}
        </button>
      </div>
      <div className="filecoin-bootstrap-summary" aria-label="Filecoin bootstrap summary">
        <div><span>Stages</span><strong>{plan ? `${plan.stageReadyCount}/${plan.totalStages}` : "0/4"}</strong></div>
        <div><span>Blocked</span><strong>{plan?.blockedStages ?? 4}</strong></div>
        <div><span>Mode</span><strong>{plan?.execute ? "execute" : "plan"}</strong></div>
      </div>
      <small>{plan ? plan.nextAction : status}</small>
      <div className="filecoin-bootstrap-stages">
        {plan ? (
          plan.stages.map((stage) => (
            <article key={stage.id} className={`stage-${stage.status}`}>
              <div>
                <CheckCircle2 size={16} />
                <strong>{stage.label}</strong>
                <span>{stage.status}</span>
              </div>
              <code>{stage.command}</code>
              <small>Missing: {stage.missingEnv.join(", ") || "none"}</small>
              <p>{stage.detail}</p>
            </article>
          ))
        ) : (
          <article className="stage-blocked">
            <div>
              <CheckCircle2 size={16} />
              <strong>Bootstrap artifact</strong>
              <span>missing</span>
            </div>
            <code>bun run filecoin:bootstrap</code>
            <small>Missing: public/filecoin-bootstrap-plan.json</small>
            <p>{status}</p>
          </article>
        )}
      </div>
      {plan?.readBackCommands?.length ? (
        <div className="filecoin-bootstrap-stages" aria-label="Filecoin read-back commands">
          {plan.readBackCommands.map((item) => (
            <article key={item.label} className={item.ready ? "stage-done" : "stage-blocked"}>
              <div>
                <TerminalSquare size={16} />
                <strong>{item.label}</strong>
                <span>{item.ready ? "curl ready" : "needs target"}</span>
              </div>
              <code>{item.command}</code>
              {item.expectedPayloadHash ? <small>Expected payload hash: {item.expectedPayloadHash}</small> : null}
            </article>
          ))}
        </div>
      ) : null}
      {copyStatus === "manual" && (
        <label className="production-account-copy">
          <span>Manual Filecoin stages copy</span>
          <textarea
            aria-label="Manual Filecoin stages copy"
            readOnly
            value={plan?.copyText ?? status}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}

function RealtimeDataBootstrapPanel({
  plan,
  status,
}: {
  plan?: DataProductionBootstrapPlan;
  status: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPlan = async () => {
    const copied = await copyToClipboard(plan?.copyText ?? status);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <section className={`realtime-bootstrap-plan ${plan?.ready ? "ready" : ""}`} aria-label="Realtime data bootstrap stages">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Realtime bootstrap</p>
          <h3>Data provider setup stages</h3>
        </div>
        <button onClick={copyPlan}>
          <Database size={16} /> {copyStatus === "copied" ? "Copied stages" : "Copy stages"}
        </button>
      </div>
      <div className="realtime-bootstrap-summary" aria-label="Realtime data bootstrap summary">
        <div><span>Stages</span><strong>{plan ? `${plan.stageReadyCount}/${plan.totalStages}` : "0/4"}</strong></div>
        <div><span>Blocked</span><strong>{plan?.blockedStages ?? 4}</strong></div>
        <div><span>Mode</span><strong>{plan?.execute ? "execute" : "plan"}</strong></div>
      </div>
      <small>{plan ? plan.nextAction : status}</small>
      <div className="realtime-bootstrap-stages">
        {plan ? (
          plan.stages.map((stage) => (
            <article key={stage.id} className={`stage-${stage.status}`}>
              <div>
                <CheckCircle2 size={16} />
                <strong>{stage.label}</strong>
                <span>{stage.status}</span>
              </div>
              <code>{stage.command}</code>
              <small>Missing: {stage.missingEnv.join(", ") || "none"}</small>
              <p>{stage.detail}</p>
            </article>
          ))
        ) : (
          <article className="stage-blocked">
            <div>
              <CheckCircle2 size={16} />
              <strong>Bootstrap artifact</strong>
              <span>missing</span>
            </div>
            <code>bun run data:bootstrap</code>
            <small>Missing: public/data-bootstrap-plan.json</small>
            <p>{status}</p>
          </article>
        )}
      </div>
      {plan?.readBackCommands?.length ? (
        <div className="realtime-bootstrap-stages" aria-label="Realtime data read-back commands">
          {plan.readBackCommands.map((item) => (
            <article key={`${item.label}-${item.fixtureId ?? item.source}`} className={item.ready ? "stage-done" : "stage-blocked"}>
              <div>
                <TerminalSquare size={16} />
                <strong>{item.label}</strong>
                <span>{item.ready ? "curl ready" : "needs proxy"}</span>
              </div>
              <code>{item.command}</code>
              {item.fixtureId ? <small>Fixture target: {item.fixtureId}</small> : null}
            </article>
          ))}
        </div>
      ) : null}
      {copyStatus === "manual" && (
        <label className="production-account-copy">
          <span>Manual realtime stages copy</span>
          <textarea
            aria-label="Manual realtime stages copy"
            readOnly
            value={plan?.copyText ?? status}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}

function RealtimeDataEvidencePacketPanel({ packet }: { packet: RealtimeDataEvidencePacket }) {
  const copyPacket = async () => {
    await copyToClipboard(packet.copyText);
  };
  return (
    <div
      className={`realtime-data-evidence-packet ${packet.productionReady ? "passed" : ""}`}
      aria-label="Realtime production data packet"
    >
      <div className="panel-head">
        <div>
          <p className="eyebrow">Realtime data</p>
          <h3>Production data packet</h3>
        </div>
        <button onClick={copyPacket}>
          <Database size={16} /> Copy data packet
        </button>
      </div>
      <div className="realtime-data-evidence-summary">
        <div><span>Signals</span><strong>{packet.requiredReady}/{packet.requiredTotal}</strong></div>
        <div><span>Route</span><strong>{packet.routeStatus}</strong></div>
        <div><span>Response</span><strong>{packet.responseVerified ? "verified" : "unverified"}</strong></div>
        <div><span>Fresh</span><strong>{packet.fresh ? "yes" : "no"}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Matches: {packet.matchCount} total · {packet.liveMatches} live · {packet.finishedMatches} final · {packet.upcomingMatches} upcoming</small>
      <small>Target fixtures: {packet.fixtures.filter((fixture) => fixture.productionReady).length}/{packet.fixtures.length} ready</small>
      <small>Next action: {packet.nextAction}</small>
      <div className="realtime-data-evidence-grid">
        {packet.signals.map((signal) => (
          <article key={signal.key} className={signal.productionReady ? "data-ready" : "data-gap"}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{signal.label}</strong>
              <span>{signal.status}</span>
            </div>
            <small>{signal.provider} · {signal.sample}</small>
            <p>{signal.action}</p>
          </article>
        ))}
      </div>
      <div className="realtime-fixture-grid" aria-label="Realtime target fixture rows">
        {packet.fixtures.map((fixture) => (
          <article key={fixture.id} className={fixture.productionReady ? "data-ready" : "data-gap"}>
            <div>
              <Timer size={16} />
              <strong>{fixture.label}</strong>
              <span>{fixture.readySignals}/{fixture.totalSignals}</span>
            </div>
            <small>{fixture.source} · {fixture.status} · {formatDate(fixture.kickoffAt)}</small>
            <small>Live signals: {fixture.liveSignals} · Missing: {fixture.missingSignals.join(", ") || "none"}</small>
            <p>{fixture.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function FreeDataSourceEvidencePanel({ packet }: { packet: FreeDataSourceEvidencePacket }) {
  const copyPacket = async () => {
    await copyToClipboard(packet.copyText);
  };
  return (
    <div
      className={`free-data-source-packet ${packet.productionReady ? "passed" : packet.continuityReady ? "continuity" : ""}`}
      aria-label="Free data source evidence"
    >
      <div className="panel-head">
        <div>
          <p className="eyebrow">Free feeds</p>
          <h3>Realtime source boundary</h3>
        </div>
        <button onClick={copyPacket}>
          <Database size={16} /> Copy free-feed evidence
        </button>
      </div>
      <div className="free-data-summary">
        <div><span>Routes</span><strong>{packet.activeRoutes}/{packet.routes.length}</strong></div>
        <div><span>Matches</span><strong>{packet.freeMatchCount}</strong></div>
        <div><span>Continuity</span><strong>{packet.continuityReady ? "ready" : "pending"}</strong></div>
        <div><span>Cross-source</span><strong>{packet.scheduleSourceCount}/{packet.scoreSourceCount}</strong></div>
        <div><span>Production gaps</span><strong>{packet.productionGapSignals.length}</strong></div>
        <div><span>Production</span><strong>{packet.productionReady ? "ready" : "needs paid/API"}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Cross-source samples: {packet.crossSourceSamples.join(", ") || "none"}</small>
      <small>Production gaps: {packet.productionGapSignals.join(", ") || "none"}</small>
      <small>Next action: {packet.nextAction}</small>
      <div className="free-data-routes" aria-label="Free feed routes">
        {packet.routes.map((route) => (
          <article key={route.source} className={route.active ? "data-ready" : "data-gap"}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{route.label}</strong>
              <span>{route.routeStatus}</span>
            </div>
            <small>{route.matchCount} matches · samples {route.sampleIds.join(", ") || "none"}</small>
            <p>{route.capability}</p>
          </article>
        ))}
      </div>
      <div className="free-data-signals" aria-label="Free feed signal coverage">
        {packet.signals.map((signal) => (
          <article key={signal.key} className={signal.status === "covered" ? "data-ready" : "data-gap"}>
            <div>
              <Radar size={16} />
              <strong>{signal.label}</strong>
              <span>{signal.status}</span>
            </div>
            <small>{signal.sampleCount}/{signal.totalFreeMatches} · {signal.provider} · {signal.sample}</small>
            <p>{signal.action}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function IntelligenceEnrichmentEvidencePanel({ packet }: { packet: IntelligenceEnrichmentEvidencePacket }) {
  const copyPacket = async () => {
    await copyToClipboard(packet.copyText);
  };
  return (
    <div
      className={`intelligence-enrichment-packet ${packet.productionReady ? "passed" : ""}`}
      aria-label="Intelligence enrichment packet"
    >
      <div className="panel-head">
        <div>
          <p className="eyebrow">Intelligence layer</p>
          <h3>Enrichment evidence packet</h3>
        </div>
        <button onClick={copyPacket}>
          <Radar size={16} /> Copy enrichment
        </button>
      </div>
      <div className="intelligence-enrichment-summary">
        <div><span>Endpoints</span><strong>{packet.requiredReady}/{packet.requiredTotal}</strong></div>
        <div><span>Fixtures</span><strong>{packet.attemptedFixtures}/{packet.totalFixtures}</strong></div>
        <div><span>Live rows</span><strong>{packet.liveSignals}</strong></div>
        <div><span>Content</span><strong>{packet.contentSamples}</strong></div>
        <div><span>Quality gaps</span><strong>{packet.qualityIssueCount}</strong></div>
        <div><span>Source</span><strong>{packet.source}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      <div className="intelligence-enrichment-grid">
        {packet.items.map((item) => (
          <article key={item.key} className={item.productionReady ? "data-ready" : "data-gap"}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{item.label}</strong>
              <span>{item.productionReady ? "verified" : "pending"}</span>
            </div>
            <small>{item.detail}</small>
            <small>{item.endpoint}</small>
            {item.contentSampleLabels.length > 0 && <small>Content {item.contentSampleLabels.join(", ")}</small>}
            {item.qualityIssues.map((issue) => (
              <small key={issue}>{issue}</small>
            ))}
            <p>{item.sampleIds.length > 0 ? `Samples ${item.sampleIds.join(", ")}` : item.action}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProductionLaunchPacketPanel({ packet }: { packet: ProductionLaunchPacket }) {
  const copyPacket = async () => {
    await copyToClipboard(packet.copyText);
  };
  return (
    <div className={`production-launch-packet ${packet.ready ? "passed" : ""}`} aria-label="Production launch packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Launch packet</p>
          <h3>Production launch packet</h3>
        </div>
        <button onClick={copyPacket}>
          <Link2 size={16} /> Copy launch packet
        </button>
      </div>
      <div className="production-launch-summary">
        <div><span>Runtime</span><strong>{packet.runtime}</strong></div>
        <div><span>Evidence</span><strong>{packet.evidence}</strong></div>
        <div><span>Open</span><strong>{packet.openSteps}/{packet.totalSteps}</strong></div>
        <div><span>Commands</span><strong>{packet.openCommands} open</strong></div>
        <div><span>Blocked</span><strong>{packet.blockedCommands}</strong></div>
        <div><span>Target env</span><strong>{packet.targetEnvKeys.length}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      <div className="production-launch-env" aria-label="Production launch env queue">
        <div>
          <span>Missing runtime env</span>
          <p>{packet.missingRuntimeEnv.join(", ") || "none"}</p>
        </div>
        <div>
          <span>Target env keys</span>
          <p>{packet.targetEnvKeys.join(", ") || "none"}</p>
        </div>
      </div>
      <div className="production-launch-commands">
        {packet.commands.map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>
      <div className="production-launch-queue" aria-label="Production launch command queue">
        {packet.commandQueue.map((item) => (
          <article key={item.id} className={`queue-${item.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <code>{item.command}</code>
            <small>Runtime env: {item.runtimeEnv.join(", ") || "none"}</small>
            <small>Target env: {item.targetEnv.join(", ") || "none"}</small>
          </article>
        ))}
      </div>
      <div className="production-launch-grid">
        {packet.steps.map((step) => (
          <article key={step.id} className={`launch-${step.status}`}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{step.label}</strong>
              <span>{step.status}</span>
            </div>
            <small>Command: {step.command}</small>
            <small>Runtime env: {step.missingEnv.join(", ") || "none"}</small>
            <small>Target env: {step.targetEnv.join(", ") || "none"}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function PublicDeploymentEvidencePanel({
  packet,
  status,
}: {
  packet?: PublicDeploymentEvidencePacket;
  status: string;
}) {
  const copyPacket = async () => {
    await copyToClipboard(packet?.copyText ?? status);
  };
  return (
    <div className={`public-deployment-evidence ${packet?.ready ? "ready" : ""}`} aria-label="Public deployment evidence">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Deployment evidence</p>
          <h3>Live Pages release</h3>
        </div>
        <button onClick={copyPacket}>
          <FileCheck2 size={16} /> Copy deployment
        </button>
      </div>
      <div className="public-deployment-summary">
        <div><span>Checks</span><strong>{packet ? `${packet.checks.filter((check) => check.passed).length}/${packet.checks.length}` : "not loaded"}</strong></div>
        <div><span>Pages</span><strong>{packet?.pagesBuildStatus ?? "unknown"}</strong></div>
        <div><span>Commit</span><strong>{packet?.expectedCommit ?? packet?.pagesBuildCommit?.slice(0, 12) ?? "unknown"}</strong></div>
        <div><span>Bundle</span><strong>{packet?.liveBundle ?? "missing"}</strong></div>
      </div>
      <p>{packet?.summary ?? status}</p>
      <small>Next action: {packet?.nextAction ?? "Run bun run deploy:evidence after deploy:pages."}</small>
      <div className="public-deployment-assets">
        <div>
          <span>Expected bundle</span>
          <code>{packet?.expectedBundle ?? "missing"}</code>
        </div>
        <div>
          <span>Live bundle</span>
          <code>{packet?.liveBundle ?? "missing"}</code>
        </div>
        <div>
          <span>Expected stylesheet</span>
          <code>{packet?.expectedStylesheet ?? "missing"}</code>
        </div>
        <div>
          <span>Live stylesheet</span>
          <code>{packet?.liveStylesheet ?? "missing"}</code>
        </div>
      </div>
      <div className="public-deployment-checks">
        {(packet?.checks ?? []).map((check) => (
          <article key={check.key} className={check.passed ? "passed" : "failed"}>
            <div>
              <CheckCircle2 size={16} />
              <strong>{check.label}</strong>
              <span>{check.passed ? "passed" : "failed"}</span>
            </div>
            <small>{check.detail}</small>
            {check.url && <code>{check.url}</code>}
          </article>
        ))}
      </div>
    </div>
  );
}

function ProductionEvidencePanel({
  evidence,
  status,
}: {
  evidence?: ProductionEvidencePacket;
  status: string;
}) {
  const summary = summarizeProductionEvidence(evidence);
  const categoryLabels: Record<ProductionEvidencePacket["checks"][number]["category"], string> = {
    runtime: "Runtime",
    "public-app": "Public app",
    supabase: "Supabase",
    data: "Realtime data",
    filecoin: "Filecoin",
    sharing: "Sharing",
  };
  const visibleChecks = evidence?.checks ?? [];
  return (
    <div className="production-evidence" aria-label="External production evidence">
      <div className="panel-head">
        <div>
          <p className="eyebrow">External evidence</p>
          <h3>Production deployment checks</h3>
        </div>
        <span className={`pill ${summary.complete ? "real" : "demo"}`}>
          {summary.requiredPassed}/{summary.requiredTotal || 0} required
        </span>
      </div>
      <div className={`production-evidence-status ${summary.complete ? "passed" : ""}`}>
        <FileCheck2 size={18} />
        <div>
          <strong>{summary.complete ? "External evidence verified" : "External evidence pending"}</strong>
          <span>{summary.loaded ? `${status} · generated ${summary.generatedAt}` : status}</span>
        </div>
      </div>
      {visibleChecks.length > 0 ? (
        <div className="production-evidence-grid">
          {visibleChecks.map((check) => (
            <article key={check.id} className={`evidence-${check.status}`}>
              <div>
                <CheckCircle2 size={16} />
                <strong>{check.label}</strong>
                <span>{categoryLabels[check.category]}</span>
              </div>
              <small>{check.required ? "Required" : "Optional"} · {check.status} · {check.detail}</small>
              {check.url ? <code>{check.url}</code> : null}
              <p>{check.status === "passed" ? "Verified by production evidence." : check.action ?? "Run production verification again."}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="production-evidence-empty">
          <FileCheck2 size={18} />
          <strong>No production evidence packet loaded</strong>
          <span>Run <code>bun run verify:production</code> after configuring deployed services.</span>
        </div>
      )}
    </div>
  );
}

function CloudReadbackLedger({
  verification,
  records,
  modeRuns,
  shareEvidence,
}: {
  verification?: CloudSyncState["verification"];
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  shareEvidence: ShareArtifactEvidence[];
}) {
  const ledgerRows = [
    {
      label: "Backend schema",
      verified: verification?.backendHealth?.ready ? [verification.backendHealth.schemaVersion ?? "kickoff_backend_health"] : [],
      missing: verification?.backendHealth
        ? [
            ...verification.backendHealth.missingTables,
            ...verification.backendHealth.missingViews,
            ...verification.backendHealth.missingRlsTables,
            ...(verification.backendHealth.policyCount >= verification.backendHealth.requiredPolicyCount ? [] : ["policies"]),
          ]
        : ["not checked"],
    },
    {
      label: "Private profile row",
      verified: verification?.profile ? ["kickoff_profiles"] : [],
      missing: verification ? (verification.profile ? [] : ["kickoff_profiles"]) : ["not checked"],
    },
    {
      label: "Prediction rows",
      verified: verification?.recordIds ?? [],
      missing: verification?.missingRecordIds ?? records.map((record) => record.capsule.id),
    },
    {
      label: "Mode proof rows",
      verified: verification?.modeRunIds ?? [],
      missing: verification?.missingModeRunIds ?? modeRuns.map((run) => run.id),
    },
    {
      label: "Share manifest rows",
      verified: verification?.shareArtifactIds ?? [],
      missing: verification?.missingShareArtifactIds ?? shareEvidence.map((item) => `${item.kind}:${item.id}`),
    },
    {
      label: "Public share image URLs",
      verified: verification?.publicShareImageIds ?? [],
      missing: verification?.missingPublicShareImageIds ?? shareEvidence.map((item) => `${item.kind}:${item.id}`),
    },
    {
      label: "Content fingerprints",
      verified: [
        ...(verification?.recordContentIds ?? []),
        ...(verification?.modeRunContentIds ?? []),
        ...(verification?.shareArtifactContentIds ?? []),
      ],
      missing:
        verification
          ? [
              ...(verification.missingRecordContentIds ?? []),
              ...(verification.missingModeRunContentIds ?? []),
              ...(verification.missingShareArtifactContentIds ?? []),
            ]
          : [
              ...records.map((record) => record.capsule.id),
              ...modeRuns.map((run) => run.id),
              ...shareEvidence.map((item) => `${item.kind}:${item.id}`),
            ],
    },
    {
      label: "Anonymous proof links",
      verified: verification?.publicProofIds ?? [],
      missing:
        verification?.missingPublicProofIds ??
        [
          ...records.map((record) => `record:${record.capsule.id}`),
          ...modeRuns.map((run) => `mode:${run.id}`),
        ],
    },
    {
      label: "Anonymous profile page",
      verified: verification?.publicProfile ? ["?profile"] : [],
      missing: verification ? (verification.publicProfile ? [] : ["?profile"]) : ["not checked"],
    },
    {
      label: "Profile archive rows",
      verified: [
        ...(verification?.publicProfileRecordIds ?? []),
        ...(verification?.publicProfileModeRunIds ?? []),
        ...(verification?.publicProfileShareArtifactIds ?? []),
      ],
      missing:
        verification
          ? [
              ...(verification.missingPublicProfileRecordIds ?? []),
              ...(verification.missingPublicProfileModeRunIds ?? []),
              ...(verification.missingPublicProfileShareArtifactIds ?? []),
            ]
          : [
              ...records.map((record) => record.capsule.id),
              ...modeRuns.map((run) => run.id),
              ...shareEvidence.map((item) => `${item.kind}:${item.id}`),
            ],
    },
  ];
  return (
    <div className="readback-ledger" aria-label="Cloud read-back ledger">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Read-back ledger</p>
          <h3>Remote proof evidence</h3>
        </div>
        <span className="pill">{verification ? formatDate(verification.checkedAt) : "not checked"}</span>
      </div>
      {ledgerRows.map((row) => (
        <article key={row.label} className={row.missing.length === 0 ? "passed" : ""}>
          <div>
            <CheckCircle2 size={16} />
            <strong>{row.label}</strong>
            <span>{row.verified.length} verified</span>
          </div>
          <small>Verified: {row.verified.slice(0, 4).join(", ") || "none"}</small>
          <small>Missing: {row.missing.slice(0, 4).join(", ") || "none"}{row.missing.length > 4 ? ` +${row.missing.length - 4} more` : ""}</small>
        </article>
      ))}
    </div>
  );
}

function CloudSyncOutboxPanel({ items, verified }: { items: CloudSyncOutboxItem[]; verified: number }) {
  return (
    <div className="cloud-outbox" aria-label="Cloud sync outbox">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Sync outbox</p>
          <h3>Queued cloud writes</h3>
        </div>
        <span className="pill">{verified}/{items.length}</span>
      </div>
      {items.map((item) => (
        <article key={item.key} className={`outbox-${item.status}`}>
          <div>
            <UploadCloud size={16} />
            <strong>{item.label}</strong>
            <span>{item.status}</span>
          </div>
          <progress value={item.verified} max={Math.max(1, item.total)} />
          <small>{item.queued} queued · {item.detail}</small>
          <p>{item.action}</p>
        </article>
      ))}
    </div>
  );
}

function ShareChannelBootstrapPanel({
  artifact,
  status,
}: {
  artifact?: ShareChannelEvidenceArtifact;
  status: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyArtifact = async () => {
    const copied = await copyToClipboard(artifact?.copyText ?? status);
    setCopyStatus(copied ? "copied" : "manual");
  };
  const targetRows = artifact
    ? [
        {
          key: "record",
          label: "Record share channel",
          passed: artifact.acceptance.recordChannelOpened,
          detail: artifact.targets.proofId || "missing proof id",
        },
        ...artifact.targets.modeIds.map((modeId, index) => ({
          key: `mode-${modeId}`,
          label: `Mode share channel ${index + 1}`,
          passed: index < artifact.acceptance.modeChannelCount,
          detail: modeId,
        })),
      ]
    : [];
  return (
    <section className={`share-bootstrap-plan ${artifact?.ready ? "ready" : ""}`} aria-label="Public sharing bootstrap artifact">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Public sharing bootstrap</p>
          <h3>Share card setup stages</h3>
        </div>
        <button onClick={copyArtifact}>
          <FileCheck2 size={16} /> {copyStatus === "copied" ? "Copied sharing" : "Copy sharing"}
        </button>
      </div>
      <div className="share-bootstrap-summary" aria-label="Public sharing bootstrap summary">
        <div><span>Stages</span><strong>{artifact ? `${artifact.stageReadyCount}/${artifact.totalStages}` : "0/5"}</strong></div>
        <div><span>Targets</span><strong>{artifact ? `${artifact.acceptance.passedTargetCount}/${artifact.acceptance.requiredTargetCount}` : "0/5"}</strong></div>
        <div><span>Modes</span><strong>{artifact ? `${artifact.acceptance.modeChannelCount}/${artifact.acceptance.requiredModeChannelCount}` : "0/4"}</strong></div>
      </div>
      <small>{artifact ? artifact.nextAction : status}</small>
      <div className="share-bootstrap-stages">
        {artifact ? (
          artifact.stages.map((stage) => (
            <article key={stage.id} className={`stage-${stage.status}`}>
              <div>
                <CheckCircle2 size={16} />
                <strong>{stage.label}</strong>
                <span>{stage.status}</span>
              </div>
              <code>{stage.command}</code>
              <small>Missing: {stage.missingEnv.join(", ") || "none"}</small>
              <p>{stage.detail}</p>
            </article>
          ))
        ) : (
          <article className="stage-blocked">
            <div>
              <CheckCircle2 size={16} />
              <strong>Share-channel artifact</strong>
              <span>missing</span>
            </div>
            <code>bun run sharing:bootstrap</code>
            <small>Missing: public/share-channel-evidence.json</small>
            <p>{status}</p>
          </article>
        )}
      </div>
      {artifact ? (
        <div className="share-bootstrap-targets" aria-label="Public sharing target channels">
          {targetRows.map((row) => (
            <article key={row.key} className={row.passed ? "stage-done" : "stage-blocked"}>
              <div>
                <FileCheck2 size={16} />
                <strong>{row.label}</strong>
                <span>{row.passed ? "channel opened" : "channel missing"}</span>
              </div>
              <code>{row.detail}</code>
            </article>
          ))}
        </div>
      ) : null}
      {copyStatus === "manual" && (
        <label className="production-account-copy">
          <span>Manual public sharing copy</span>
          <textarea
            aria-label="Manual public sharing copy"
            readOnly
            value={artifact?.copyText ?? status}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}

function PublicProofPublicationLedgerPanel({ ledger }: { ledger: PublicProofPublicationLedger }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyLedger = async () => {
    const copied = await copyToClipboard(ledger.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`publication-ledger ${ledger.ready ? "ready" : ""}`} aria-label="Public proof publication ledger">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Public share cards</p>
          <h3>Publication ledger</h3>
        </div>
        <button onClick={copyLedger}>
          <FileCheck2 size={16} /> {copyStatus === "copied" ? "Copied publication ledger" : "Copy publication ledger"}
        </button>
      </div>
      <div className="publication-ledger-summary">
        <div><span>Targets</span><strong>{ledger.totalTargets}</strong></div>
        <div><span>Publish</span><strong>{ledger.publishReady}/{ledger.totalTargets}</strong></div>
        <div><span>Channel</span><strong>{ledger.channelReady}/{ledger.totalTargets}</strong></div>
        <div><span>Read-back</span><strong>{ledger.readBackReady}/{ledger.totalTargets}</strong></div>
        <div><span>Hosting gaps</span><strong>{ledger.missingProductionUrls}</strong></div>
      </div>
      <p>{ledger.summary}</p>
      <small>Next action: {ledger.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="share-channel-copy">
          <span>Manual publication ledger copy</span>
          <textarea
            aria-label="Manual publication ledger copy"
            readOnly
            value={ledger.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="publication-ledger-rows" aria-label="Public proof publication ledger rows">
        {ledger.rows.length === 0 ? (
          <article>
            <div>
              <FileCheck2 size={16} />
              <strong>No public share targets yet</strong>
              <span>missing-image</span>
            </div>
            <small>Create a lock or mode proof, then generate a public share card.</small>
          </article>
        ) : (
          ledger.rows.map((row) => (
            <article key={`${row.kind}-${row.id}`} className={row.status}>
              <div>
                <FileCheck2 size={16} />
                <strong>{row.title}</strong>
                <span>{row.status}</span>
              </div>
              <small>{row.kind}:{row.id} · checks {row.passedChecks}/{row.totalChecks}</small>
              <small>Proof: {row.proofUrl || "missing"}</small>
              <small>Image: {row.imageUrl || "not publicly hosted"}</small>
              <code>{row.readBackCommand}</code>
              <small>{row.action}</small>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function ShareChannelEvidencePanel({ packet }: { packet: ShareChannelEvidencePacket }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copyPacket = async () => {
    const copied = await copyToClipboard(packet.copyText);
    setCopyStatus(copied ? "copied" : "manual");
  };
  return (
    <div className={`share-channel-evidence ${packet.ready ? "ready" : ""}`} aria-label="Share channel evidence packet">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Share channels</p>
          <h3>X/native share evidence</h3>
        </div>
        <button onClick={copyPacket}>
          <FileCheck2 size={16} /> {copyStatus === "copied" ? "Copied evidence" : "Copy share evidence"}
        </button>
      </div>
      <div className="share-channel-summary">
        <div><span>Cards</span><strong>{packet.productionCards}/{packet.totalArtifacts}</strong></div>
        <div><span>Opened</span><strong>{packet.openedChannels}/{packet.totalArtifacts}</strong></div>
        <div><span>Ready</span><strong>{packet.readyToOpen}</strong></div>
        <div><span>Missing</span><strong>{packet.missingProductionCards}</strong></div>
      </div>
      <p>{packet.summary}</p>
      <small>Next action: {packet.nextAction}</small>
      {copyStatus === "manual" && (
        <label className="share-channel-copy">
          <span>Manual share-channel evidence copy</span>
          <textarea
            aria-label="Manual share-channel evidence copy"
            readOnly
            value={packet.copyText}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
      <div className="share-channel-rows" aria-label="Share channel evidence rows">
        {packet.rows.length === 0 ? (
          <article>
            <div>
              <Users size={16} />
              <strong>No share targets yet</strong>
              <span>missing-card</span>
            </div>
            <small>Create record locks or mode proofs, then generate public share cards.</small>
          </article>
        ) : (
          packet.rows.map((row) => (
            <article key={`${row.kind}-${row.id}`} className={row.status}>
              <div>
                <Users size={16} />
                <strong>{row.label}</strong>
                <span>{row.status}</span>
              </div>
              <small>Channel: {row.channel}</small>
              <small>Image: {row.imageUrl || "not publicly hosted"}</small>
              <div className="share-channel-row-actions">
                {row.xIntentUrl ? (
                  <a href={row.xIntentUrl} target="_blank" rel="noreferrer">
                    <Users size={14} /> Open X
                  </a>
                ) : (
                  <span>X intent not ready</span>
                )}
                <code>{row.openCommand || "Generate a valid X intent first."}</code>
              </div>
              <code>{row.readBackCommand}</code>
              <small>{row.action}</small>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function ShareArtifactLedger({
  records,
  modeRuns,
  evidence,
  onPublishMissing,
  onOpenMissingChannels,
}: {
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  evidence: ShareArtifactEvidence[];
  onPublishMissing: () => void;
  onOpenMissingChannels: () => void;
}) {
  const artifactFor = (id: string, kind: ShareArtifactEvidence["kind"]) =>
    evidence.find((item) => item.id === id && item.kind === kind);
  const rows = [
    ...records.map((record) => ({
      id: record.capsule.id,
      kind: "record" as const,
      label: record.capsule.matchLabel,
      proofUrl: proofUrl(record.capsule.id),
      evidence: artifactFor(record.capsule.id, "record"),
    })),
    ...modeRuns.map((run) => ({
      id: run.id,
      kind: "mode" as const,
      label: run.title,
      proofUrl: modeRunUrl(run.id),
      evidence: artifactFor(run.id, "mode"),
    })),
  ];
  const publishable = rows.filter((row) => isPublishableShareArtifact(row.evidence)).length;
  const queue = buildSharePublishQueue(records, modeRuns, evidence);
  const channelQueue = buildShareChannelQueue(records, modeRuns, evidence);
  return (
    <div className="share-artifact-ledger" aria-label="Share artifact ledger">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Share artifacts</p>
          <h3>Publishable proof cards</h3>
        </div>
        <span className="pill">{queue.productionReady}/{rows.length} production</span>
      </div>
      <div className="share-ledger-actions">
        <button disabled={rows.length === 0 || queue.missingProduction === 0} onClick={onPublishMissing}>
          <ImageDown size={16} /> Publish missing cards
        </button>
        <button disabled={channelQueue.runnable === 0} onClick={onOpenMissingChannels}>
          <Users size={16} /> Open missing X channels
        </button>
        <span>{publishable}/{rows.length} PNG manifests · {queue.missingProduction} need public image URL evidence</span>
        <span>{channelQueue.openedChannels}/{rows.length} share channels · {channelQueue.runnable} ready to open</span>
      </div>
      {rows.length === 0 ? (
        <article>
          <div>
            <ImageDown size={16} />
            <strong>No proof artifacts yet</strong>
            <span>Lock predictions and mode runs first.</span>
          </div>
        </article>
      ) : (
        rows.map((row) => {
          const ready = isPublishableShareArtifact(row.evidence);
          const production = isProductionShareCardEvidence(row.evidence);
          const channel = row.evidence?.nativeShareOpenedAt ? "native share" : row.evidence?.xIntentOpenedAt ? "X intent" : "not opened";
          return (
            <article key={`${row.kind}-${row.id}`} className={production ? "passed" : ready ? "partial" : ""}>
              <div>
                <ImageDown size={16} />
                <strong>{row.label}</strong>
                <span>{production ? "production" : ready ? "local manifest" : row.kind}</span>
              </div>
              <small>Card: {ready ? `${row.evidence?.fileName} · ${Math.round((row.evidence?.imageByteLength ?? 0) / 1024)} KB` : "missing publishable PNG manifest"}</small>
              <small>Hash: {row.evidence?.imageHash ? `${row.evidence.imageHash.slice(0, 16)}...` : "none"}</small>
              <small>Image URL: {row.evidence?.imageUrl ?? "not publicly hosted"}</small>
              <small>Channel: {channel}</small>
              <small>URL: {row.evidence?.proofUrl ?? row.proofUrl}</small>
            </article>
          );
        })
      )}
    </div>
  );
}

function UtilityDrawer({
  mode,
  cloudState,
  profile,
  providerHealth,
  forceFallback,
  leaderboardScope,
  productionReadiness,
  productionSummary,
  onClose,
  onForceFallback,
  onLeaderboardScope,
  onRefreshMatches,
  onSync,
  onOpenAccount,
}: {
  mode: "settings" | "help";
  cloudState: CloudSyncState;
  profile: ReturnType<typeof loadProfile>;
  providerHealth: ProviderHealthSnapshot;
  forceFallback: boolean;
  leaderboardScope: LeaderboardScope;
  productionReadiness: ReturnType<typeof buildProductionReadiness>;
  productionSummary: ReturnType<typeof summarizeProductionReadiness>;
  onClose: () => void;
  onForceFallback: (value: boolean) => void;
  onLeaderboardScope: (scope: LeaderboardScope) => void;
  onRefreshMatches: () => void;
  onSync: () => void;
  onOpenAccount: () => void;
}) {
  const blockedItems = productionReadiness.filter((item) => item.level === "blocked");
  const title = mode === "settings" ? "Control room" : "Launch checks";
  return (
    <section className="utility-drawer" aria-label={mode === "settings" ? "Settings panel" : "Help panel"}>
      <div className="utility-backdrop" onClick={onClose} />
      <aside className="utility-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{mode === "settings" ? "Settings" : "Help"}</p>
            <h3>{title}</h3>
          </div>
          <button className="icon-button" onClick={onClose} title="Close panel">
            <ShieldCheck size={18} />
          </button>
        </div>

        {mode === "settings" ? (
          <>
            <div className="utility-stats">
              <div>
                <span>Profile</span>
                <strong>{profile.cloudMode}</strong>
              </div>
              <div>
                <span>Cloud</span>
                <strong>{cloudState.status}</strong>
              </div>
              <div>
                <span>Data</span>
                <strong>{providerHealth.status}</strong>
              </div>
            </div>
            <label className="toggle-row utility-toggle">
              <input
                type="checkbox"
                checked={forceFallback}
                onChange={(event) => onForceFallback(event.target.checked)}
              />
              Force fallback test
            </label>
            <div className="utility-actions">
              <button onClick={onRefreshMatches}>
                <RefreshCcw size={16} /> Refresh data
              </button>
              <button onClick={onSync}>
                <UploadCloud size={16} /> Sync cloud
              </button>
              <button onClick={onOpenAccount}>
                <UserCircle2 size={16} /> Account
              </button>
            </div>
            <div className="utility-section">
              <strong>Leaderboard scope</strong>
              <div className="segmented-control">
                {leaderboardScopes.map((scope) => (
                  <button
                    key={scope}
                    className={leaderboardScope === scope ? "active" : ""}
                    onClick={() => onLeaderboardScope(scope)}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>
            <div className="utility-section">
              <strong>Realtime data</strong>
              <small>{providerHealth.detail}</small>
              <p>{providerHealth.nextAction}</p>
            </div>
          </>
        ) : (
          <>
            <div className="utility-stats">
              <div>
                <span>Ready</span>
                <strong>{productionSummary.score}%</strong>
              </div>
              <div>
                <span>Verified</span>
                <strong>{productionSummary.verified}</strong>
              </div>
              <div>
                <span>Blocked</span>
                <strong>{productionSummary.blocked}</strong>
              </div>
            </div>
            <div className="utility-section">
              <strong>Open acceptance items</strong>
              <div className="utility-list">
                {(blockedItems.length > 0 ? blockedItems : productionReadiness).slice(0, 4).map((item) => (
                  <article key={item.key}>
                    <span>{item.label}</span>
                    <b>{item.passed}/{item.total} · {item.level}</b>
                    <small>{item.nextAction}</small>
                  </article>
                ))}
              </div>
            </div>
            <div className="utility-section">
              <strong>Test suites</strong>
              <div className="utility-list compact">
                {ACCEPTANCE_TEST_SUITES.map((suite) => (
                  <article key={suite.id}>
                    <span>{suite.label}</span>
                    <code>{suite.command}</code>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>
    </section>
  );
}

function ProductionReadinessPanel({
  items,
  summary,
}: {
  items: ReturnType<typeof buildProductionReadiness>;
  summary: ReturnType<typeof summarizeProductionReadiness>;
}) {
  return (
    <section className="production-readiness" aria-label="Production acceptance">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Production acceptance</p>
          <h3>真实成品验收雷达</h3>
        </div>
        <span className="pill">{summary.score}% ready</span>
      </div>
      <div className="production-summary">
        <div>
          <span>Verified</span>
          <strong>{summary.verified}</strong>
        </div>
        <div>
          <span>Ready</span>
          <strong>{summary.ready}</strong>
        </div>
        <div>
          <span>Blocked</span>
          <strong>{summary.blocked}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{summary.total}</strong>
        </div>
      </div>
      <div className="production-grid">
        {items.map((item) => (
          <article key={item.key} className={`production-${item.level}`}>
            <div>
              <CheckCircle2 size={17} />
              <strong>{item.label}</strong>
              <span>{item.level}</span>
            </div>
            <progress value={item.passed} max={item.total} />
            <small>{item.passed}/{item.total} · {item.evidence}</small>
            <p>{item.nextAction}</p>
            {item.checks.some((check) => !check.passed) && (
              <div className="production-checks">
                {item.checks
                  .filter((check) => !check.passed)
                  .slice(0, 3)
                  .map((check) => (
                    <span key={check.id}>
                      <b>{check.label}</b>
                      <small>{check.command ?? check.evidence}</small>
                    </span>
                  ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function AcceptanceTestPanel({
  evidence,
  status,
}: {
  evidence?: AcceptanceEvidencePacket;
  status: string;
}) {
  const runEvidence = summarizeAcceptanceRunEvidence(evidence);
  const evidenceBySuite = new Map(evidence?.suites.map((suite) => [suite.suiteId, suite]));
  return (
    <section className="acceptance-tests" aria-label="Acceptance test cases">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Acceptance tests</p>
          <h3>验收用例与测试规则</h3>
        </div>
        <span className="pill">{runEvidence.passed}/{runEvidence.total} passed</span>
      </div>
      <div className={`acceptance-evidence ${runEvidence.complete ? "passed" : ""}`} aria-label="Acceptance run evidence">
        <div>
          <strong>{runEvidence.complete ? "Run evidence verified" : "Run evidence pending"}</strong>
          <span>
            {runEvidence.manifestHashMismatch
              ? "Acceptance suite manifest changed; regenerate evidence."
              : runEvidence.evidenceStale
                ? "Acceptance evidence is older than 7 days; regenerate before release."
                : status}
          </span>
        </div>
        <code>
          {evidence
            ? `${evidence.generatedAt} · ${
                runEvidence.manifestHashMismatch
                  ? "manifest stale"
                  : runEvidence.evidenceStale
                    ? "evidence stale"
                    : runEvidence.suiteManifestHash ?? "manifest missing"
              }`
            : "no acceptance-evidence.json loaded"}
        </code>
      </div>
      <div className="acceptance-test-grid">
        {ACCEPTANCE_TEST_SUITES.map((suite) => (
          <article key={suite.id} className={evidenceBySuite.get(suite.id)?.status === "passed" ? "passed" : ""}>
            <div>
              <CheckCircle2 size={17} />
              <strong>{suite.label}</strong>
              <span>{evidenceBySuite.get(suite.id)?.status ?? "not run"}</span>
            </div>
            <code>{suite.command}</code>
            <small>{suite.file}</small>
            <p>{evidenceBySuite.get(suite.id)?.summary ?? suite.proves}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default App;
