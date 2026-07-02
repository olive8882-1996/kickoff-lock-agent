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
    lineupSource?: string;
    injurySource?: string;
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
};

export type SealStepStatus = "queued" | "running" | "passed" | "failed" | "needs-config";

export type SealStep = {
  id: "payload" | "upload" | "deal" | "poll" | "verify";
  label: string;
  status: SealStepStatus;
  detail: string;
};

export type SealJob = {
  id: string;
  capsuleId: string;
  status: "idle" | "queued" | "running" | "verified" | "failed" | "needs-config";
  startedAt: string;
  updatedAt: string;
  endpoint?: string;
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
};

export type LeaderboardScope = "global" | "friend" | "season";

export type LeaderboardEntry = {
  id: string;
  displayName: string;
  location: string;
  locks: number;
  averageScore: number;
  bestScore: number;
  xp: number;
  streak: number;
  seasonKey?: string;
  friendCode?: string;
  source: "local" | LeaderboardScope;
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
  locks: number;
  revealed: number;
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
  artifact?: {
    kind: "bracket-path";
    bracketPath: BracketPath;
  };
};

export type ProviderResult = {
  source: DataSource;
  matches: Match[];
  warning?: string;
  evidence?: string[];
};
