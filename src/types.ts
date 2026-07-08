export type DataSource =
  | "espn"
  | "worldcup26"
  | "openfootball"
  | "api-football"
  | "football-data"
  | "thesportsdb"
  | "odds-api"
  | "seed"
  | "manual";

export type MatchStatus = "upcoming" | "live" | "finished";

export type AppView = "matches" | "predict" | "memory" | "verify" | "account" | "modes" | "profile";

export type TeamInsight = {
  fifaRank: number;
  tablePosition?: number;
  tablePoints?: number;
  tableRecord?: string;
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

export type ProviderEnrichmentMatrixItem = {
  key: "lineups" | "injuries" | "odds" | "standings";
  label: string;
  endpoint: string;
  attempted: number;
  fulfilled: number;
  live: number;
  errors: number;
  ready: boolean;
  sampleIds: string[];
  detail: string;
};

export type ProviderHealthSnapshot = {
  source: string;
  status: "verified" | "ready" | "partial" | "blocked";
  lastSyncedAt?: string;
  ageSeconds?: number;
  fresh: boolean;
  responseVerified: boolean;
  responseAudit?: ProviderResponseAudit;
  enrichmentAudit?: ProviderEnrichmentAudit;
  enrichmentMatrix?: ProviderEnrichmentMatrixItem[];
  liveOrConfigured: number;
  totalSignals: number;
  activeRoute?: string;
  missingSignals: DataCoverageItem["key"][];
  evidence: string[];
  detail: string;
  nextAction: string;
};

export type RealtimeDataAuditSignal = {
  key: DataCoverageItem["key"];
  label: string;
  bestStatus: DataCoverageStatus;
  bestSource: string;
  live: number;
  configured: number;
  fallback: number;
  manual: number;
  missing: number;
  total: number;
};

export type RealtimeDataAuditSample = {
  id: string;
  label: string;
  status: MatchStatus;
  kickoffAt: string;
  liveOrConfigured: number;
  missing: DataCoverageItem["key"][];
};

export type RealtimeDataAudit = {
  checkedAt: string;
  source: DataSource;
  sourceLabel: string;
  routeStatus: ProviderRouteAuditItem["status"] | "unknown";
  responseVerified: boolean;
  responseAudit?: ProviderResponseAudit;
  enrichmentAudit?: ProviderEnrichmentAudit;
  matchCount: number;
  liveMatches: number;
  finishedMatches: number;
  upcomingMatches: number;
  productionReady: boolean;
  warning?: string;
  evidence: string[];
  missingSignals: DataCoverageItem["key"][];
  signals: RealtimeDataAuditSignal[];
  samples: RealtimeDataAuditSample[];
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
    standingsSource?: string;
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
  id: "payload" | "health" | "upload" | "deal" | "poll" | "registry" | "verify";
  label: string;
  status: SealStepStatus;
  detail: string;
};

export type SealPollAttempt = {
  attempt: number;
  checkedAt: string;
  status: "verified" | "retrievable" | "pending" | "error";
  proofStatus?: FilecoinProof["proofStatus"] | "missing";
  httpStatus?: number;
  detail: string;
  retrievalUrl?: string;
  cid?: string;
  payloadHash?: string;
  byteLength?: number;
};

export type SealUploadStatusAttempt = {
  attempt: number;
  checkedAt: string;
  status: "queued" | "running" | "verified" | "failed" | "error";
  httpStatus?: number;
  detail: string;
  jobId?: string;
  cid?: string;
  payloadHash?: string;
  byteLength?: number;
};

export type SealBackendHealth = {
  ok: boolean;
  service?: string;
  mockMode?: boolean;
  hasPrivateKey?: boolean;
  authRequired?: boolean;
  productionReady?: boolean;
  blockers?: string[];
  proofCount?: number;
  persistence?: "file" | "memory" | string;
  maxUploadBytes?: number;
  allowOrigin?: string;
  corsRestricted?: boolean;
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
  backendJobId?: string;
  uploadStatusUrl?: string;
  uploadStatusPolls?: number;
  uploadStatusLog?: SealUploadStatusAttempt[];
  uploadPayloadHash?: string;
  uploadByteLength?: number;
  pollAttempts?: number;
  pollLog?: SealPollAttempt[];
  lastCheckedAt?: string;
  proofRegistryStatus?: "unchecked" | "verified" | "failed";
  proofRegistryCheckedAt?: string;
  proofRegistryHash?: string;
  proofRegistryByteLength?: number;
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
  friendCode?: string;
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
  backendHealth?: CloudBackendHealth;
  profile: boolean;
  profileIdentity?: {
    id: string;
    email: string;
    displayName: string;
    location: string;
    friendCode: string;
  };
  authUserIdentity?: {
    id: string;
    email: string;
    provider?: string;
    displayName?: string;
  };
  profileIdentityProblems?: string[];
  authUserProblems?: string[];
  records: number;
  modeRuns: number;
  publicProofs: number;
  shareArtifacts?: number;
  publicShareImages?: number;
  publicProfile: boolean;
  expectedRecords: number;
  expectedModeRuns: number;
  expectedShareArtifacts?: number;
  recordIds?: string[];
  modeRunIds?: string[];
  publicProofIds?: string[];
  publicProofContentIds?: string[];
  shareArtifactIds?: string[];
  recordOwnerIds?: Record<string, string>;
  modeRunOwnerIds?: Record<string, string>;
  shareArtifactOwnerIds?: Record<string, string>;
  publicShareImageIds?: string[];
  publicProfileRecordIds?: string[];
  publicProfileModeRunIds?: string[];
  publicProfileShareArtifactIds?: string[];
  publicProfileRecordContentIds?: string[];
  publicProfileModeRunContentIds?: string[];
  publicProfileShareArtifactContentIds?: string[];
  recordContentIds?: string[];
  modeRunContentIds?: string[];
  shareArtifactContentIds?: string[];
  missingRecordIds?: string[];
  missingModeRunIds?: string[];
  missingPublicProofIds?: string[];
  missingPublicProofContentIds?: string[];
  missingShareArtifactIds?: string[];
  missingPublicShareImageIds?: string[];
  missingPublicProfileRecordIds?: string[];
  missingPublicProfileModeRunIds?: string[];
  missingPublicProfileShareArtifactIds?: string[];
  missingPublicProfileRecordContentIds?: string[];
  missingPublicProfileModeRunContentIds?: string[];
  missingPublicProfileShareArtifactContentIds?: string[];
  missingRecordContentIds?: string[];
  missingModeRunContentIds?: string[];
  missingShareArtifactContentIds?: string[];
  cleanSessionPublicRenders?: CloudCleanSessionPublicRender[];
  message: string;
};

export type CloudCleanSessionPublicRender = {
  kind: "profile" | "proof" | "mode";
  targetId?: string;
  url?: string;
  passed: boolean;
  cloudLoaded: boolean;
  canonicalOk?: boolean;
  publicTargetOk?: boolean;
  socialOk?: boolean;
  shareImageMatched?: boolean;
  structuredImageMatched?: boolean;
  detail: string;
  checkedAt?: string;
};

export type CloudBackendHealth = {
  checkedAt: string;
  schemaVersion?: string;
  ready: boolean;
  requiredTables: string[];
  missingTables: string[];
  requiredViews: string[];
  missingViews: string[];
  rlsTables: string[];
  missingRlsTables: string[];
  missingColumns?: string[];
  missingViewColumns?: string[];
  policyCount: number;
  requiredPolicyCount: number;
  unsafeWritePolicies?: string[];
  storageBucketPublic?: boolean;
  storagePolicyCount?: number;
  requiredStoragePolicyCount?: number;
  detail: string;
};

export type LeaderboardScope = "global" | "friend" | "season";

export type LeaderboardEntry = {
  id: string;
  displayName: string;
  location: string;
  rank?: number;
  globalRank?: number;
  friendRank?: number;
  seasonRank?: number;
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

export type LeaderboardScopeEvidence = {
  scope: LeaderboardScope;
  status: "unchecked" | "loading" | "loaded" | "empty" | "error";
  rows: number;
  filter: string;
  targetQuery?: string;
  currentUserPresent: boolean;
  currentUserRank?: number;
  currentUserXp?: number;
  currentUserLocks?: number;
  currentUserRevealed?: number;
  currentUserVerifiedProofs?: number;
  currentUserModeProofs?: number;
  currentUserExactHits?: number;
  currentUserFriendCode?: string;
  currentUserSeasonKey?: string;
  expectedFriendCode?: string;
  expectedSeasonKey?: string;
  checkedAt?: string;
  sampleIds?: string[];
  error?: string;
};

export type CloudSyncAuditItem = {
  key: "backend" | "profile" | "records" | "modeRuns" | "shareArtifacts" | "contentFingerprints" | "publicProofs" | "publicProfile" | "leaderboard";
  label: string;
  status: "passed" | "pending" | "blocked";
  synced: number;
  total: number;
  detail: string;
  action: string;
};

export type CloudSyncOutboxItem = {
  key: "profile" | "records" | "modeRuns" | "shareArtifacts" | "publicProofs";
  label: string;
  status: "verified" | "syncing" | "queued" | "blocked";
  queued: number;
  verified: number;
  total: number;
  detail: string;
  action: string;
};

export type ShareArtifactEvidence = {
  id: string;
  kind: "record" | "mode";
  proofUrl: string;
  imageGenerated: boolean;
  generatedAt?: string;
  fileName?: string;
  imageUrl?: string;
  imageMime?: string;
  imageByteLength?: number;
  imageHash?: string;
  xIntentUrl?: string;
  xIntentOpenedAt?: string;
  nativeShareOpenedAt?: string;
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
  shareArtifacts: ShareArtifactEvidence[];
  locks: number;
  revealed: number;
  modeProofs: number;
  averageScore: number;
  bestScore: number;
  xp: number;
};

export type GameMode = {
  id: "bracket" | "parlay" | "agent-vs-human" | "upset" | "group-path" | "penalty-pressure";
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
  sealJob?: SealJob;
};

export type ModeArtifact =
  | {
      kind: "bracket-path";
      bracketPath: BracketPath;
      settlements?: Array<{
        capsuleId: string;
        matchLabel: string;
        stage: string;
        predictedWinner: string;
        confidence: number;
        resultScore?: number;
        winnerHit?: boolean;
      }>;
      resolvedPicks?: number;
      hitPicks?: number;
    }
  | {
      kind: "parlay-ticket";
      legs: Array<{
        capsuleId: string;
        matchLabel: string;
        sequenceIndex?: number;
        chainStep?: string;
        pick: string;
        confidence: number;
        markets: MarketPick[];
        resultScore?: number;
        winnerHit?: boolean;
        survivesChain?: boolean;
        chainStatus?: "hit" | "miss" | "pending" | "inactive";
      }>;
      settledLegs: number;
      hitLegs: number;
      chainResolvedLegs?: number;
      chainHitLegs?: number;
      chainBustedAt?: number;
      chainStatus?: "live" | "complete" | "busted";
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
    }
  | {
      kind: "group-table-path";
      table: Array<{
        team: string;
        projectedRank: number;
        predictedPoints: number;
        predictedGoalDifference: number;
        actualPoints?: number;
        actualGoalDifference?: number;
        locks: number;
      }>;
      picks: Array<{
        capsuleId: string;
        matchLabel: string;
        predictedWinner: string;
        predictedScore: string;
        actualScore?: string;
        winnerHit?: boolean;
      }>;
      resolvedMatches: number;
      winnerHits: number;
      topTwo: string[];
    }
  | {
      kind: "penalty-pressure-ticket";
      takers: Array<{
        capsuleId: string;
        matchLabel: string;
        pressurePick: string;
        pickType: "key-player" | "market" | "winner";
        confidence: number;
        pressureRating: number;
        resultScore?: number;
        pressureHit?: boolean;
      }>;
      resolvedPicks: number;
      hitPicks: number;
      averagePressure: number;
    };

export type ProviderResult = {
  source: DataSource;
  matches: Match[];
  warning?: string;
  evidence?: string[];
  responseAudit?: ProviderResponseAudit;
  enrichmentAudit?: ProviderEnrichmentAudit;
  routeAudit?: ProviderRouteAuditItem[];
};

export type ProviderEnrichmentEndpointAudit = {
  key: "lineups" | "injuries" | "odds" | "standings";
  endpoint: string;
  attempted: number;
  fulfilled: number;
  live: number;
  errors: number;
  sampleIds: string[];
};

export type ProviderEnrichmentAudit = {
  source: DataSource;
  checkedAt: string;
  totalFixtures: number;
  attemptedFixtures: number;
  endpointAudits: ProviderEnrichmentEndpointAudit[];
  detail: string;
};

export type ProviderResponseAudit = {
  source: DataSource;
  endpoint: string;
  status: "ok" | "empty" | "error" | "fallback";
  httpStatus?: number;
  checkedAt: string;
  rowCount: number;
  sampleIds: string[];
  durationMs?: number;
  detail: string;
};
