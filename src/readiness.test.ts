import { describe, expect, it } from "vitest";
import { buildProductionReadiness, summarizeProductionReadiness } from "./readiness";
import type {
  CloudSyncState,
  GameMode,
  GameModeRun,
  LeaderboardEntry,
  MemoryRecord,
  ProviderHealthSnapshot,
  ProviderReadinessItem,
  ProviderRouteAuditItem,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";

const profile: UserProfile = {
  id: "local-user",
  email: "fan@example.com",
  displayName: "Fan",
  location: "Chengdu",
  createdAt: "2026-01-01T00:00:00.000Z",
  cloudMode: "local",
};

const cloudState: CloudSyncState = {
  configured: false,
  authenticated: false,
  mode: "local",
  status: "offline",
  message: "local",
};

const gameModes: GameMode[] = [
  { id: "bracket", title: "Bracket", status: "playable", description: "Bracket", progress: 1, reward: "XP" },
  { id: "parlay", title: "Parlay", status: "playable", description: "Parlay", progress: 1, reward: "XP" },
  { id: "agent-vs-human", title: "Agent", status: "playable", description: "Agent", progress: 1, reward: "XP" },
  { id: "upset", title: "Upset", status: "playable", description: "Upset", progress: 1, reward: "XP" },
];

const providerReadiness: ProviderReadinessItem[] = [
  { key: "schedule", label: "Schedule", status: "fallback", source: "Seed", detail: "Fallback" },
  { key: "score", label: "Score", status: "manual", source: "Manual", detail: "Manual" },
  { key: "rankings", label: "Rankings", status: "fallback", source: "Seed", detail: "Snapshot" },
  { key: "lineups", label: "Lineups", status: "missing", source: "None", detail: "Missing" },
  { key: "injuries", label: "Injuries", status: "missing", source: "None", detail: "Missing" },
  { key: "odds", label: "Odds", status: "missing", source: "None", detail: "Missing" },
];

const routeAudit: ProviderRouteAuditItem[] = [
  { key: "seed", label: "Seed", status: "fallback", configured: true, detail: "Seed continuity" },
];

const liveProviderHealth: ProviderHealthSnapshot = {
  source: "API-Football",
  status: "verified",
  lastSyncedAt: "2026-06-01T00:01:00.000Z",
  ageSeconds: 30,
  fresh: true,
  liveOrConfigured: 6,
  totalSignals: 6,
  activeRoute: "API-Football",
  missingSignals: [],
  evidence: ["API-Football fixtures endpoint"],
  detail: "API-Football · 6/6 live/configured · fresh",
  nextAction: "Realtime schedule, score and enrichment signals are fresh.",
};

const record = (id: string): MemoryRecord => ({
  capsule: {
    id,
    matchId: "match-1",
    matchLabel: "A vs B",
    kickoffAt: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-05-31T00:00:00.000Z",
    sealedAt: "2026-05-31T00:00:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: "bafy-demo",
      pieceCid: "baga-demo",
      provider: "demo",
      dataSetId: "demo",
      proofStatus: "sealed",
    },
    prediction: {
      homeScore: 1,
      awayScore: 0,
      winner: "A",
      keyPlayers: ["A striker"],
      confidence: 60,
      style: "analysis",
      reasoning: "A measured tactical call with enough reasoning text for the test fixture.",
      agentSummary: "Agent summary",
      markets: [],
    },
  },
});

const modeRun = (modeId: GameModeRun["modeId"]): GameModeRun => ({
  id: `mode-${modeId}`,
  modeId,
  title: modeId,
  createdAt: "2026-06-01T00:00:00.000Z",
  capsuleIds: ["cap-real"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: `bafy-${modeId}`,
    pieceCid: `baga-${modeId}`,
    provider: "demo",
    dataSetId: "mode",
    proofStatus: "sealed",
  },
  status: "sealed",
  summary: "Mode run",
  requirements: ["fixture"],
});

describe("production readiness", () => {
  it("keeps local demo state visibly incomplete", () => {
    const items = buildProductionReadiness({
      cloudState,
      profile,
      records: [],
      modeRuns: [],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    expect(items.find((item) => item.key === "account")?.level).toBe("blocked");
    expect(items.find((item) => item.key === "filecoin")?.level).toBe("blocked");
    expect(items.find((item) => item.key === "data")?.evidence).toContain("Seed");
    expect(items.find((item) => item.key === "tests")?.evidence).toContain("coverage 9/9");
    expect(summarizeProductionReadiness(items).blocked).toBeGreaterThan(0);
  });

  it("recognizes production evidence across cloud, data, Filecoin and modes", () => {
    const realRecord = record("cap-real");
    realRecord.capsule.filecoinProof = {
      mode: "real",
      cid: "bafy-real",
      pieceCid: "baga-real",
      provider: "synapse",
      dataSetId: "dataset",
      proofStatus: "verified",
      payloadHash: "c".repeat(64),
    };
    realRecord.sealJob = {
      id: "seal-1",
      capsuleId: "cap-real",
      status: "verified",
      startedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:01:00.000Z",
      endpoint: "https://seal.example/seal",
      healthStatus: "ready",
      backendHealth: { ok: true, mockMode: false, hasPrivateKey: true, persistence: "file" },
      proofUrl: "https://seal.example/proof/bafy-real",
      verifyUrl: "https://seal.example/verify?cid=bafy-real",
      uploadPayloadHash: "c".repeat(64),
      steps: [],
      proof: realRecord.capsule.filecoinProof,
    };

    const remoteRows: LeaderboardEntry[] = [
      { id: "g", displayName: "G", location: "Global", locks: 1, revealed: 1, averageScore: 90, bestScore: 90, xp: 500, streak: 1, exactHits: 1, verifiedProofs: 1, modeProofs: 4, source: "global" },
      { id: "f", displayName: "F", location: "Chengdu", locks: 1, revealed: 1, averageScore: 80, bestScore: 80, xp: 400, streak: 1, exactHits: 0, verifiedProofs: 1, modeProofs: 4, source: "friend" },
      { id: "s", displayName: "S", location: "Season", locks: 1, revealed: 1, averageScore: 70, bestScore: 70, xp: 300, streak: 1, exactHits: 0, verifiedProofs: 1, modeProofs: 4, source: "season" },
    ];

    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          profile: true,
          records: 1,
          modeRuns: 4,
          publicProofs: 5,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 4,
          message: "Cloud read-back verified.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [realRecord],
      modeRuns: [
        modeRun("bracket"),
        modeRun("parlay"),
        modeRun("agent-vs-human"),
        modeRun("upset"),
      ],
      gameModes,
      providerReadiness: providerReadiness.map((item) => ({ ...item, status: "live" })),
      providerRouteAudit: [
        { key: "api-football", label: "API-Football", status: "active", configured: true, detail: "Live" },
      ],
      providerHealth: liveProviderHealth,
      leaderboardEntries: remoteRows,
      sealEndpointConfigured: true,
      shareImageReady: true,
      shareEvidence: [
        {
          id: "cap-real",
          kind: "record",
          proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-real",
          imageGenerated: true,
          generatedAt: "2026-06-01T00:02:00.000Z",
          xIntentOpenedAt: "2026-06-01T00:03:00.000Z",
        },
        {
          id: "mode-bracket",
          kind: "mode",
          proofUrl: "https://example.com/kickoff-lock-agent/?mode=mode-bracket",
          imageGenerated: true,
          generatedAt: "2026-06-01T00:02:00.000Z",
        },
      ] satisfies ShareArtifactEvidence[],
    });

    expect(items.find((item) => item.key === "filecoin")?.level).toBe("verified");
    expect(items.find((item) => item.key === "sharing")?.level).toBe("verified");
    expect(items.find((item) => item.key === "leaderboard")?.level).toBe("verified");
    expect(items.find((item) => item.key === "modes")?.passed).toBe(6);
    expect(summarizeProductionReadiness(items).score).toBeGreaterThan(90);
  });

  it("does not verify sharing from a transient generated image without public read-back and share-channel evidence", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-1")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: true,
    });

    const sharing = items.find((item) => item.key === "sharing");
    expect(sharing?.level).toBe("partial");
    expect(sharing?.evidence).toContain("public links unverified");
    expect(sharing?.nextAction).toContain("Generate one proof card and one mode card");
  });

  it("does not mark leaderboard production-ready until all three scopes have remote rows", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-1")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [
        {
          id: "global-only",
          displayName: "Global",
          location: "Chengdu",
          locks: 1,
          revealed: 1,
          averageScore: 70,
          bestScore: 70,
          xp: 200,
          streak: 1,
          exactHits: 0,
          verifiedProofs: 0,
          modeProofs: 1,
          source: "global",
        },
      ],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    const leaderboard = items.find((item) => item.key === "leaderboard");
    expect(leaderboard?.level).toBe("partial");
    expect(leaderboard?.passed).toBe(3);
    expect(leaderboard?.evidence).toContain("scopes global");
  });
});
