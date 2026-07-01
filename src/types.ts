export type DataSource = "espn" | "worldcup26" | "seed" | "manual";

export type MatchStatus = "upcoming" | "live" | "finished";

export type AppView = "matches" | "predict" | "memory";

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
};

export type ProofStatus = "draft" | "sealed" | "retrievable" | "verified";

export type FilecoinProof = {
  mode: "demo" | "real";
  cid: string;
  pieceCid: string;
  provider: string;
  dataSetId: string;
  proofStatus: ProofStatus;
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
};

export type MemoryRecord = {
  capsule: PredictionCapsule;
  result?: ResultCapsule;
};

export type ProviderResult = {
  source: DataSource;
  matches: Match[];
  warning?: string;
};
