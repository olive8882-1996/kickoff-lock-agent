export type DataSource = "espn" | "worldcup26" | "api-football" | "football-data" | "thesportsdb" | "seed" | "manual";

export type MatchStatus = "upcoming" | "live" | "finished";

export type AppView = "matches" | "predict" | "memory" | "verify" | "account" | "modes" | "profile";

export type TeamInsight = {
  fifaRank: number;
  form: string[];
  lastFiveGoalsFor: number;
  lastFiveGoalsAgainst: number;
  unavailable: string[];
  probableLineup: string[];
};

export type DataCoverageStatus = "live" | "configured" | "fallback" | "manual" | "missing";

export type DataCoverageItem = {
  key: "schedule" | "score" | "rankings" | "lineups" | "injuries" | "odds";
  label: string;
  status: DataCoverageStatus;
  source: string;
  detail: string;
};

export type ProviderReadinessItem = {
  key: DataCoverageItem["key"];
  label: string;
  status: DataCoverageStatus;
  source: string;
  detail: string;
};

export type ProviderRouteAuditItem = {
  key: DataSource;
  label: string;
  status: "active" | "fallback" | "failed" | "needs-config" | "skipped";
  configured: boolean;
  detail: string;
};

export type MatchIntelligenceScore = {
  score: number;
  level: "live-ready" | "configured" | "thin" | "manual-risk";
  label: string;
  detail: string;
  missing: DataCoverageItem["key"][];
  suggestions: string[];
};

export type MarketPick = {
  id: "winner" | "total-goals" | "both-score" | "first-goal";
  label: string;
  pick: string;
  confidence: number;
  rationale: string;
};

export type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  stage: string;
  status: MatchStatus;
  dataSource: DataSource;
  homeScore?: number;
  awayScore?: number;
  venue?: string;
  insights?: {
    home: TeamInsight;
    away: TeamInsight;
    headToHead: string;
    marketLine: string;
    oddsSnapshot?: string;
    rankingSource?: string;
    lineupSource?: string;
    injurySource?: string;
    dataCoverage?: DataCoverageItem[];
    dataFreshness: string;
  };
};

export type PredictionDraft = {
  homeScore: number;
  awayScore: number;
  winner: string;
  keyPlayers: string[];
  confidence: number;
  style: "analysis" | "fan-instinct" | "bold-call";
  reasoning: string;
  agentSummary: string;
  markets: MarketPick[];
};

export type ProofStatus = "draft" | "sealed" | "retrievable" | "verified";

export type FilecoinProof = {
  mode: "demo" | "real";
  cid: string;
  pieceCid: string;
  provider: string;
  dataSetId: string;
  proofStatus: ProofStatus;
  uploadedAt?: string;
  retrievalUrl?: string;
  payloadHash?: string;
  byteLength?: number;
};

export type FilecoinLookupState = {
  status: "idle" | "checking" | "found" | "missing" | "needs-config" | "error";
  message: string;
  proof?: FilecoinProof;
  checkedAt?: string;
};

export type SealStepStatus = "queued" | "running" | "passed" | "failed" | "needs-config";

export type SealStep = {
  id: "payload" | "health" | "upload" | "deal" | "poll" | "verify";
  label: string;
  status: SealStepStatus;
  detail: string;
};

export type SealBackendHealth = {
  ok: boolean;
  service?: string;
  mockMode?: boolean;
  hasPrivateKey?: boolean;
  authRequired?: boolean;
  proofCount?: number;
  persistence?: "file" | "memory" | string;
  maxUploadBytes?: number;
  endpoints?: string[];
};

export type SealJob = {
  id: string;
  capsuleId: string;
  status: "idle" | "queued" | "running" | "verified" | "failed" | "needs-config";
  startedAt: string;
  updatedAt: string;
  endpoint?: string;
  healthStatus?: "unchecked" | "ready" | "failed";
  backendHealth?: SealBackendHealth;
  proofUrl?: string;
  verifyUrl?: string;
  uploadPayloadHash?: string;
  uploadByteLength?: number;
  pollAttempts?: number;
  lastCheckedAt?: string;
  steps: SealStep[];
  proof?: FilecoinProof;
  error?: string;
};

export type PredictionCapsule = {
  id: string;
  matchId: string;
  matchLabel: string;
  kickoffAt: string;
  createdAt: string;
  sealedAt: string | null;
  prediction: PredictionDraft;
  payloadHash: string;
  filecoinProof: FilecoinProof;
  locked: boolean;
  lateLock: boolean;
};

export type ScoreBreakdown = {
  winner: number;
  exactScore: number;
  goalDifference: number;
  markets: number;
  keyPlayer: number;
  confidence: number;
  reasoning: number;
};

export type ResultCapsule = {
  id: string;
  capsuleId: string;
  revealedAt: string;
  homeScore: number;
  awayScore: number;
  keyPlayers: string[];
  source: DataSource;
  totalScore: number;
  breakdown: ScoreBreakdown;
  explanation: string[];
  agentReview: string[];
};

export type MemoryRecord = {
  capsule: PredictionCapsule;
  result?: ResultCapsule;
  sealJob?: SealJob;
};

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  location: string;
  avatarUrl?: string;
  createdAt: string;
  cloudMode: "local" | "supabase";
};

export type CloudSyncState = {
  configured: boolean;
  authenticated: boolean;
  mode: "local" | "supabase";
  status: "offline" | "ready" | "syncing" | "synced" | "error";
  message: string;
  lastSyncedAt?: string;
  sessionExpiresAt?: string;
  sessionExpired?: boolean;
  refreshable?: boolean;
  verification?: CloudSyncVerification;
};

export type CloudSyncVerification = {
  checkedAt: string;
  profile: boolean;
  records: number;
  modeRuns: number;
  publicProofs: number;
  publicProfile: boolean;
  expectedRecords: number;
  expectedModeRuns: number;
  message: string;
};

export type LeaderboardScope = "global" | "friend" | "season";

export type LeaderboardEntry = {
  id: string;
  displayName: string;
  location: string;
  rank?: number;
  locks: number;
  revealed: number;
  averageScore: number;
  bestScore: number;
  xp: number;
  streak: number;
  exactHits: number;
  verifiedProofs: number;
  modeProofs: number;
  seasonKey?: string;
  friendCode?: string;
  updatedAt?: string;
  source: "local" | LeaderboardScope;
};

export type LeaderboardReadinessItem = {
  key: "view" | "global" | "friend" | "season" | "remoteRows";
  label: string;
  passed: boolean;
  detail: string;
};

export type CloudSyncAuditItem = {
  key: "profile" | "records" | "modeRuns" | "publicProofs" | "publicProfile" | "leaderboard";
  label: string;
  status: "passed" | "pending" | "blocked";
  synced: number;
  total: number;
  detail: string;
  action: string;
};

export type BracketPick = {
  id: string;
  matchId: string;
  matchLabel: string;
  stage: string;
  winner: string;
  confidence: number;
  note: string;
};

export type BracketPath = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  picks: BracketPick[];
  payloadHash?: string;
  filecoinProof?: FilecoinProof;
};

export type PublicProfile = {
  id: string;
  email?: string;
  displayName: string;
  location: string;
  avatarUrl?: string;
  friendCode?: string;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  locks: number;
  revealed: number;
  modeProofs: number;
  averageScore: number;
  bestScore: number;
  xp: number;
};

export type GameMode = {
  id: "bracket" | "parlay" | "agent-vs-human" | "upset";
  title: string;
  status: "playable" | "planned" | "locked";
  description: string;
  progress: number;
  reward: string;
};

export type GameModeRun = {
  id: string;
  modeId: GameMode["id"];
  title: string;
  createdAt: string;
  capsuleIds: string[];
  payloadHash: string;
  filecoinProof: FilecoinProof;
  status: "sealed" | "scored";
  score?: number;
  summary: string;
  requirements: string[];
  artifact?: ModeArtifact;
};

export type ModeArtifact =
  | {
      kind: "bracket-path";
      bracketPath: BracketPath;
    }
  | {
      kind: "parlay-ticket";
      legs: Array<{
        capsuleId: string;
        matchLabel: string;
        pick: string;
        confidence: number;
        markets: MarketPick[];
        resultScore?: number;
        winnerHit?: boolean;
      }>;
      settledLegs: number;
      hitLegs: number;
    }
  | {
      kind: "agent-calibration";
      samples: Array<{
        capsuleId: string;
        matchLabel: string;
        confidence: number;
        totalScore: number;
        winnerHit: boolean;
        calibrationError: number;
        review: string[];
      }>;
      averageCalibrationError: number;
    }
  | {
      kind: "upset-ticket";
      picks: Array<{
        capsuleId: string;
        matchLabel: string;
        predictedWinner: string;
        confidence: number;
        resultScore?: number;
        winnerHit?: boolean;
        multiplier: number;
      }>;
      resolvedPicks: number;
      hitPicks: number;
      bonusXp: number;
    };

export type ProviderResult = {
  source: DataSource;
  matches: Match[];
  warning?: string;
  evidence?: string[];
  routeAudit?: ProviderRouteAuditItem[];
};
