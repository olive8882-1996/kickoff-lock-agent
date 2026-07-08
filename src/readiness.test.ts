import { describe, expect, it } from "vitest";
import { ACCEPTANCE_TEST_SUITES, acceptanceManifestHash, type AcceptanceEvidencePacket, REQUIRED_ACCEPTANCE_COVERAGE } from "./acceptance";
import type { ProductionEvidencePacket } from "./productionEvidence";
import { buildProductionReadiness, summarizeProductionReadiness } from "./readiness";
import type {
  CloudSyncState,
  GameMode,
  GameModeRun,
  LeaderboardEntry,
  LeaderboardScopeEvidence,
  MemoryRecord,
  ProviderHealthSnapshot,
  ProviderReadinessItem,
  ProviderRouteAuditItem,
  SealJob,
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
  { id: "group-path", title: "Group path", status: "playable", description: "Group path", progress: 1, reward: "XP" },
  { id: "penalty-pressure", title: "Penalty pressure", status: "playable", description: "Pressure", progress: 1, reward: "XP" },
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
  responseVerified: true,
  responseAudit: {
    source: "api-football",
    endpoint: "fixtures league=1 season=2026 next=40",
    status: "ok",
    httpStatus: 200,
    checkedAt: "2026-06-01T00:01:00.000Z",
    rowCount: 40,
    sampleIds: ["fixture-1"],
    detail: "40 fixtures returned",
  },
  enrichmentAudit: {
    source: "api-football",
    checkedAt: "2026-06-01T00:01:00.000Z",
    totalFixtures: 1,
    attemptedFixtures: 1,
    endpointAudits: [
      {
        key: "lineups",
        endpoint: "fixtures/lineups?fixture=<fixture-id>",
        attempted: 1,
        fulfilled: 1,
        live: 1,
        errors: 0,
        sampleIds: ["fixture-1"],
      },
      {
        key: "injuries",
        endpoint: "injuries?fixture=<fixture-id>",
        attempted: 1,
        fulfilled: 1,
        live: 1,
        errors: 0,
        sampleIds: ["fixture-1"],
      },
      {
        key: "odds",
        endpoint: "odds?fixture=<fixture-id>",
        attempted: 1,
        fulfilled: 1,
        live: 1,
        errors: 0,
        sampleIds: ["fixture-1"],
      },
    ],
    detail: "1/1 fixtures attempted · 3 live enrichment signals · 0 failed fixtures",
  },
  liveOrConfigured: 6,
  totalSignals: 6,
  activeRoute: "API-Football",
  missingSignals: [],
  evidence: ["API-Football fixtures endpoint"],
  detail: "API-Football · 6/6 live/configured · fresh",
  nextAction: "Realtime schedule, score and enrichment signals are fresh.",
};

const shareArtifact = (
  id: string,
  kind: ShareArtifactEvidence["kind"],
  proofUrl: string,
  extras: Partial<ShareArtifactEvidence> = {},
): ShareArtifactEvidence => ({
  id,
  kind,
  proofUrl,
  imageGenerated: true,
  generatedAt: "2026-06-01T00:02:00.000Z",
  fileName: `${id}-share-card.png`,
  imageUrl: proofUrl.startsWith("https://")
    ? `https://example.com/cards/${id}-share-card.png`
    : proofUrl.replace("/kickoff-lock-agent/", "/cards/"),
  imageMime: "image/png",
  imageByteLength: 128_000,
  imageHash: "f".repeat(64),
  ...extras,
});

const leaderboardEvidence = (
  scope: LeaderboardScopeEvidence["scope"],
  status: LeaderboardScopeEvidence["status"],
  rows: number,
  currentUserPresent = rows > 0,
): LeaderboardScopeEvidence => ({
  scope,
  status,
  rows,
  filter: scope === "friend" ? "friend_code=eq.chengdu" : scope === "season" ? "season_key=eq.world-cup-run" : "global xp desc",
  currentUserPresent,
  currentUserRank: currentUserPresent ? 1 : undefined,
  currentUserXp: currentUserPresent ? 1200 : undefined,
  currentUserLocks: currentUserPresent ? 4 : undefined,
  currentUserRevealed: currentUserPresent ? 3 : undefined,
  currentUserVerifiedProofs: currentUserPresent ? 2 : undefined,
  currentUserModeProofs: currentUserPresent ? 1 : undefined,
  currentUserExactHits: currentUserPresent ? 1 : undefined,
  currentUserFriendCode: currentUserPresent && scope === "friend" ? "chengdu" : undefined,
  currentUserSeasonKey: currentUserPresent && scope === "season" ? "world-cup-run" : undefined,
  expectedFriendCode: "chengdu",
  expectedSeasonKey: "world-cup-run",
  checkedAt: "2026-06-01T00:05:00.000Z",
  sampleIds: rows > 0 ? [`${scope}-row`] : [],
});

const backendHealth = (ready = true) => ({
  checkedAt: "2026-06-01T00:05:00.000Z",
  schemaVersion: "2026-07-03-cloud-v2",
  ready,
  requiredTables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
  missingTables: ready ? [] : ["kickoff_share_artifacts"],
  requiredViews: ["kickoff_leaderboard", "kickoff_backend_health"],
  missingViews: [],
  rlsTables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
  missingRlsTables: [],
  policyCount: ready ? 8 : 6,
  requiredPolicyCount: 8,
  detail: ready ? "tables missing 0, views missing 0, RLS missing 0, policies 8/8" : "missing share artifacts table",
});

const acceptanceEvidence = (): AcceptanceEvidencePacket => ({
  generatedAt: "2026-07-03T00:10:00.000Z",
  source: "local-script",
  suiteManifestHash: acceptanceManifestHash(),
  suites: ACCEPTANCE_TEST_SUITES.map((suite) => ({
    suiteId: suite.id,
    command: suite.command,
    status: "passed",
    startedAt: "2026-07-03T00:00:00.000Z",
    completedAt: "2026-07-03T00:10:00.000Z",
    durationMs: 600_000,
    exitCode: 0,
    summary: `${suite.label} passed.`,
  })),
});

const productionEvidence = (): ProductionEvidencePacket => ({
  generatedAt: "2026-07-03T00:20:00.000Z",
  source: "local-script",
  strict: true,
  checks: [
    "public-app-root",
    "public-acceptance-evidence",
    "supabase-backend-health",
    "supabase-profile-target",
    "supabase-record-target",
    "supabase-mode-target",
    "supabase-share-artifact-target",
    "supabase-share-channel-target",
    "supabase-mode-share-channel-target",
    "leaderboard-global-current-user",
    "leaderboard-friend-current-user",
    "leaderboard-season-current-user",
    "api-football-enrichment-live",
    "filecoin-seal-health",
    "public-profile-link",
    "public-proof-link",
    "public-mode-link",
    "public-clean-session-restore",
    "public-share-image",
  ].map((id) => ({
    id,
    category: id.startsWith("public-")
      ? ("public-app" as const)
      : id.startsWith("supabase") || id.startsWith("leaderboard")
        ? ("supabase" as const)
        : id.startsWith("api")
          ? ("data" as const)
          : id.startsWith("filecoin")
            ? ("filecoin" as const)
            : ("sharing" as const),
    label: id,
    required: true,
    status: "passed" as const,
    detail: "verified",
    checkedAt: "2026-07-03T00:20:00.000Z",
  })),
});

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
    mode: "real",
    cid: `bafy-${modeId}`,
    pieceCid: `baga-${modeId}`,
    provider: "synapse",
    dataSetId: "mode",
    proofStatus: "verified",
    payloadHash: "b".repeat(64),
  },
  status: "sealed",
  summary: "Mode run",
  requirements: ["fixture"],
});

const productionSealJob = (
  capsuleId: string,
  payloadHash: string,
  proof: GameModeRun["filecoinProof"],
): SealJob => ({
  id: `seal-${capsuleId}`,
  capsuleId,
  status: "verified",
  startedAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:01:00.000Z",
  endpoint: "https://seal.example/seal",
  healthStatus: "ready",
  backendHealth: {
    ok: true,
    mockMode: false,
    hasPrivateKey: true,
    authRequired: true,
    productionReady: true,
    blockers: [],
    persistence: "file",
    maxUploadBytes: 262144,
  },
  proofUrl: `https://seal.example/proof/${proof.cid}`,
  verifyUrl: `https://seal.example/verify?cid=${proof.cid}`,
  uploadPayloadHash: payloadHash,
  proofRegistryStatus: "verified",
  proofRegistryHash: payloadHash,
  proofRegistryCheckedAt: "2026-06-01T00:01:30.000Z",
  steps: [],
  proof,
});

const modeRunWithProductionSeal = (modeId: GameModeRun["modeId"]) => {
  const run = modeRun(modeId);
  return {
    ...run,
    sealJob: productionSealJob(run.id, run.payloadHash, run.filecoinProof),
  };
};

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
    expect(items.find((item) => item.key === "tests")?.evidence).toContain(
      `coverage ${REQUIRED_ACCEPTANCE_COVERAGE.length}/${REQUIRED_ACCEPTANCE_COVERAGE.length}`,
    );
    expect(items.find((item) => item.key === "account")?.checks.find((check) => check.id === "supabase-env")?.passed).toBe(false);
    expect(items.find((item) => item.key === "data")?.checks.find((check) => check.id === "lineups-readback")?.command).toBe("bun run doctor:data");
    expect(items.find((item) => item.key === "filecoin")?.checks.find((check) => check.id === "seal-endpoint")?.evidence).toContain("Missing");
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
      backendHealth: {
        ok: true,
        mockMode: false,
        hasPrivateKey: true,
        authRequired: true,
        productionReady: true,
        blockers: [],
        persistence: "file",
        maxUploadBytes: 262144,
      },
      proofUrl: "https://seal.example/proof/bafy-real",
      verifyUrl: "https://seal.example/verify?cid=bafy-real",
      uploadPayloadHash: "c".repeat(64),
      proofRegistryStatus: "verified",
      proofRegistryHash: "c".repeat(64),
      proofRegistryCheckedAt: "2026-06-01T00:01:30.000Z",
      steps: [],
      proof: realRecord.capsule.filecoinProof,
    };

    const remoteRows: LeaderboardEntry[] = [
      { id: "user-1", displayName: "G", location: "Global", locks: 1, revealed: 1, averageScore: 90, bestScore: 90, xp: 500, streak: 1, exactHits: 1, verifiedProofs: 1, modeProofs: 4, source: "global" },
      { id: "user-1", displayName: "F", location: "Chengdu", locks: 1, revealed: 1, averageScore: 80, bestScore: 80, xp: 400, streak: 1, exactHits: 0, verifiedProofs: 1, modeProofs: 4, source: "friend" },
      { id: "user-1", displayName: "S", location: "Season", locks: 1, revealed: 1, averageScore: 70, bestScore: 70, xp: 300, streak: 1, exactHits: 0, verifiedProofs: 1, modeProofs: 4, source: "season" },
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
          backendHealth: backendHealth(),
          profile: true,
          profileIdentity: {
            id: "user-1",
            email: profile.email,
            displayName: profile.displayName,
            location: profile.location,
            friendCode: "chengdu",
          },
          profileIdentityProblems: [],
          records: 1,
          modeRuns: 6,
          publicProofs: 7,
          shareArtifacts: 7,
          publicShareImages: 7,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 6,
          expectedShareArtifacts: 7,
          recordIds: ["cap-real"],
          modeRunIds: ["mode-bracket", "mode-parlay", "mode-agent-vs-human", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
          shareArtifactIds: [
            "record:cap-real",
            "mode:mode-bracket",
            "mode:mode-parlay",
            "mode:mode-agent-vs-human",
            "mode:mode-upset",
            "mode:mode-group-path",
            "mode:mode-penalty-pressure",
          ],
          publicShareImageIds: [
            "record:cap-real",
            "mode:mode-bracket",
            "mode:mode-parlay",
            "mode:mode-agent-vs-human",
            "mode:mode-upset",
            "mode:mode-group-path",
            "mode:mode-penalty-pressure",
          ],
          recordContentIds: ["cap-real"],
          modeRunContentIds: ["mode-bracket", "mode-parlay", "mode-agent-vs-human", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
          shareArtifactContentIds: [
            "record:cap-real",
            "mode:mode-bracket",
            "mode:mode-parlay",
            "mode:mode-agent-vs-human",
            "mode:mode-upset",
            "mode:mode-group-path",
            "mode:mode-penalty-pressure",
          ],
          publicProofIds: [
            "record:cap-real",
            "mode:mode-bracket",
            "mode:mode-parlay",
            "mode:mode-agent-vs-human",
            "mode:mode-upset",
            "mode:mode-group-path",
            "mode:mode-penalty-pressure",
          ],
          publicProofContentIds: [
            "record:cap-real",
            "mode:mode-bracket",
            "mode:mode-parlay",
            "mode:mode-agent-vs-human",
            "mode:mode-upset",
            "mode:mode-group-path",
            "mode:mode-penalty-pressure",
          ],
          publicProfileRecordIds: ["cap-real"],
          publicProfileModeRunIds: ["mode-bracket", "mode-parlay", "mode-agent-vs-human", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
          publicProfileShareArtifactIds: [
            "record:cap-real",
            "mode:mode-bracket",
            "mode:mode-parlay",
            "mode:mode-agent-vs-human",
            "mode:mode-upset",
            "mode:mode-group-path",
            "mode:mode-penalty-pressure",
          ],
          message: "Cloud read-back verified.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [realRecord],
      modeRuns: [
        modeRunWithProductionSeal("bracket"),
        modeRun("parlay"),
        modeRun("agent-vs-human"),
        modeRun("upset"),
        modeRun("group-path"),
        modeRun("penalty-pressure"),
      ],
      gameModes,
      providerReadiness: providerReadiness.map((item) => ({ ...item, status: "live" })),
      providerRouteAudit: [
        { key: "api-football", label: "API-Football", status: "active", configured: true, detail: "Live" },
      ],
      providerHealth: liveProviderHealth,
      leaderboardEntries: remoteRows,
      leaderboardScopeEvidence: [
        leaderboardEvidence("global", "loaded", 1),
        leaderboardEvidence("friend", "loaded", 1),
        leaderboardEvidence("season", "loaded", 1),
      ],
      sealEndpointConfigured: true,
      shareImageReady: true,
      acceptanceEvidence: acceptanceEvidence(),
      productionEvidence: productionEvidence(),
      shareEvidence: [
        shareArtifact("cap-real", "record", "https://example.com/kickoff-lock-agent/?proof=cap-real", {
          xIntentOpenedAt: "2026-06-01T00:03:00.000Z",
          xIntentUrl: "https://twitter.com/intent/tweet",
        }),
        shareArtifact("mode-bracket", "mode", "https://example.com/kickoff-lock-agent/?mode=mode-bracket", {
          xIntentOpenedAt: "2026-06-01T00:04:00.000Z",
          xIntentUrl: "https://twitter.com/intent/tweet",
        }),
        shareArtifact("mode-parlay", "mode", "https://example.com/kickoff-lock-agent/?mode=mode-parlay", {
          xIntentOpenedAt: "2026-06-01T00:05:00.000Z",
          xIntentUrl: "https://twitter.com/intent/tweet",
        }),
        shareArtifact("mode-agent-vs-human", "mode", "https://example.com/kickoff-lock-agent/?mode=mode-agent-vs-human", {
          xIntentOpenedAt: "2026-06-01T00:06:00.000Z",
          xIntentUrl: "https://twitter.com/intent/tweet",
        }),
        shareArtifact("mode-upset", "mode", "https://example.com/kickoff-lock-agent/?mode=mode-upset", {
          xIntentOpenedAt: "2026-06-01T00:07:00.000Z",
          xIntentUrl: "https://twitter.com/intent/tweet",
        }),
        shareArtifact("mode-group-path", "mode", "https://example.com/kickoff-lock-agent/?mode=mode-group-path", {
          xIntentOpenedAt: "2026-06-01T00:08:00.000Z",
          xIntentUrl: "https://twitter.com/intent/tweet",
        }),
        shareArtifact("mode-penalty-pressure", "mode", "https://example.com/kickoff-lock-agent/?mode=mode-penalty-pressure", {
          xIntentOpenedAt: "2026-06-01T00:09:00.000Z",
          xIntentUrl: "https://twitter.com/intent/tweet",
        }),
      ] satisfies ShareArtifactEvidence[],
    });

    expect(items.find((item) => item.key === "account")?.level).toBe("verified");
    expect(items.find((item) => item.key === "filecoin")?.level).toBe("verified");
    expect(items.find((item) => item.key === "sharing")?.level).toBe("verified");
    expect(items.find((item) => item.key === "leaderboard")?.level).toBe("verified");
    expect(items.find((item) => item.key === "tests")?.level).toBe("verified");
    expect(items.find((item) => item.key === "external")?.level).toBe("verified");
    expect(items.find((item) => item.key === "modes")?.passed).toBe(6);
    expect(items.every((item) => item.checks.length === item.total)).toBe(true);
    expect(items.every((item) => item.checks.filter((check) => check.passed).length === item.passed)).toBe(true);
    expect(summarizeProductionReadiness(items).score).toBeGreaterThan(90);
  });

  it("does not verify public sharing until record and mode cards all exercise a share channel", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(),
          profile: true,
          records: 1,
          modeRuns: 1,
          publicProofs: 2,
          shareArtifacts: 2,
          publicShareImages: 2,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 2,
          recordContentIds: ["cap-share-channel"],
          modeRunContentIds: ["mode-bracket"],
          shareArtifactContentIds: ["record:cap-share-channel", "mode:mode-bracket"],
          message: "Cloud read-back verified.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-share-channel")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: true,
      shareEvidence: [
        shareArtifact("cap-share-channel", "record", "https://example.com/kickoff-lock-agent/?proof=cap-share-channel", {
          xIntentOpenedAt: "2026-06-01T00:03:00.000Z",
          xIntentUrl: "https://twitter.com/intent/tweet",
        }),
        shareArtifact("mode-bracket", "mode", "https://example.com/kickoff-lock-agent/?mode=mode-bracket"),
      ],
    });

    const sharing = items.find((item) => item.key === "sharing");
    expect(sharing?.level).not.toBe("verified");
    expect(sharing?.evidence).toContain("share channel record 1/1, mode 0/1");
    expect(sharing?.checks.find((check) => check.id === "share-channel")?.evidence).toContain("mode 0/1");
  });

  it("does not verify public sharing from a share timestamp without a saved X intent URL", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(),
          profile: true,
          records: 1,
          modeRuns: 1,
          publicProofs: 2,
          shareArtifacts: 2,
          publicShareImages: 2,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 2,
          recordContentIds: ["cap-share-channel"],
          modeRunContentIds: ["mode-bracket"],
          shareArtifactContentIds: ["record:cap-share-channel", "mode:mode-bracket"],
          message: "Cloud read-back verified.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-share-channel")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: true,
      shareEvidence: [
        shareArtifact("cap-share-channel", "record", "https://example.com/kickoff-lock-agent/?proof=cap-share-channel", {
          xIntentOpenedAt: "2026-06-01T00:03:00.000Z",
        }),
        shareArtifact("mode-bracket", "mode", "https://example.com/kickoff-lock-agent/?mode=mode-bracket", {
          nativeShareOpenedAt: "2026-06-01T00:04:00.000Z",
        }),
      ],
    });

    const sharing = items.find((item) => item.key === "sharing");
    expect(sharing?.level).not.toBe("verified");
    expect(sharing?.checks.find((check) => check.id === "share-channel")?.evidence).toContain("record 0/1, mode 0/1");
  });

  it("does not verify complete game modes from local-only mode runs", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(),
          profile: true,
          records: 0,
          modeRuns: 4,
          publicProofs: 0,
          shareArtifacts: 0,
          publicProfile: true,
          expectedRecords: 0,
          expectedModeRuns: 4,
          expectedShareArtifacts: 0,
          modeRunIds: ["mode-bracket", "mode-parlay", "mode-agent-vs-human", "mode-upset"],
          modeRunContentIds: [],
          publicProofIds: [],
          shareArtifactContentIds: [],
          missingModeRunContentIds: ["mode-bracket", "mode-parlay", "mode-agent-vs-human", "mode-upset"],
          message: "Rows exist but mode content and public proof read-back are missing.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [],
      modeRuns: [
        modeRun("bracket"),
        modeRun("parlay"),
        modeRun("agent-vs-human"),
        modeRun("upset"),
        modeRun("group-path"),
        modeRun("penalty-pressure"),
      ],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: false,
      shareEvidence: [],
    });

    const modes = items.find((item) => item.key === "modes");
    expect(modes?.level).not.toBe("verified");
    expect(modes?.evidence).toContain("cloud pending");
    expect(modes?.evidence).toContain("public pending");
    expect(modes?.evidence).toContain("cards pending");
    expect(modes?.nextAction).toContain("anonymous mode proof links");
  });

  it("does not verify real account readiness when remote content fingerprints are missing", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(),
          profile: true,
          records: 1,
          modeRuns: 1,
          publicProofs: 2,
          shareArtifacts: 1,
          publicShareImages: 1,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordIds: ["cap-stale"],
          modeRunIds: ["mode-bracket"],
          shareArtifactIds: ["record:cap-stale"],
          recordContentIds: [],
          modeRunContentIds: [],
          shareArtifactContentIds: [],
          missingRecordContentIds: ["cap-stale"],
          missingModeRunContentIds: ["mode-bracket"],
          missingShareArtifactContentIds: ["record:cap-stale"],
          message: "Rows exist but remote fingerprints are stale.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-stale")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: false,
      shareEvidence: [shareArtifact("cap-stale", "record", "https://example.com/kickoff-lock-agent/?proof=cap-stale")],
    });

    const account = items.find((item) => item.key === "account");
    expect(account?.level).not.toBe("verified");
    expect(account?.passed).toBe(5);
    expect(account?.evidence).toContain("fingerprints record 0/1");
    expect(account?.evidence).toContain("share 0/1");
  });

  it("does not verify real account readiness until public share images read back", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(),
          profile: true,
          records: 1,
          modeRuns: 1,
          publicProofs: 2,
          shareArtifacts: 1,
          publicShareImages: 0,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 1,
          recordContentIds: ["cap-image"],
          modeRunContentIds: ["mode-bracket"],
          shareArtifactContentIds: ["record:cap-image"],
          missingPublicShareImageIds: ["record:cap-image"],
          message: "Rows and fingerprints exist, but public share image URL is missing.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-image")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: false,
      shareEvidence: [shareArtifact("cap-image", "record", "https://example.com/kickoff-lock-agent/?proof=cap-image")],
    });

    const account = items.find((item) => item.key === "account");
    expect(account?.level).not.toBe("verified");
    expect(account?.passed).toBe(5);
    expect(account?.evidence).toContain("share images pending");
  });

  it("does not verify automated tests from coverage metadata without run evidence", () => {
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

    const tests = items.find((item) => item.key === "tests");
    expect(tests?.level).not.toBe("verified");
    expect(tests?.evidence).toContain("run evidence 0/");
    expect(tests?.nextAction).toContain("verify:acceptance");
  });

  it("does not verify external production evidence until production evidence is loaded", () => {
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

    const external = items.find((item) => item.key === "external");
    expect(external?.level).toBe("blocked");
    expect(external?.evidence).toContain("not loaded");
    expect(external?.nextAction).toContain("verify:production");
  });

  it("does not verify automated tests from stale acceptance manifest evidence", () => {
    const staleEvidence = { ...acceptanceEvidence(), suiteManifestHash: "acceptance-v1-old" };
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
      acceptanceEvidence: staleEvidence,
    });

    const tests = items.find((item) => item.key === "tests");
    expect(tests?.level).not.toBe("verified");
    expect(tests?.evidence).toContain("manifest stale");
    expect(tests?.nextAction).toContain("verify:acceptance again");
  });

  it("does not verify automated tests from expired run evidence", () => {
    const expiredEvidence = { ...acceptanceEvidence(), generatedAt: "2026-06-01T00:10:00.000Z" };
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
      acceptanceEvidence: expiredEvidence,
    });

    const tests = items.find((item) => item.key === "tests");
    expect(tests?.level).not.toBe("verified");
    expect(tests?.evidence).toContain("evidence too old");
    expect(tests?.nextAction).toContain("older than 7 days");
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
    expect(sharing?.nextAction).toContain("Generate publishable proof and mode cards");
  });

  it("does not verify production sharing from localhost proof URLs", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(),
          profile: true,
          records: 1,
          modeRuns: 1,
          publicProofs: 2,
          shareArtifacts: 2,
          publicShareImages: 2,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 2,
          recordContentIds: ["cap-local"],
          modeRunContentIds: ["mode-bracket"],
          shareArtifactContentIds: ["record:cap-local", "mode:mode-bracket"],
          message: "Cloud read-back verified.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-local")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: true,
      shareEvidence: [
        shareArtifact("cap-local", "record", "http://localhost:5173/kickoff-lock-agent/?proof=cap-local", {
          xIntentOpenedAt: "2026-06-01T00:03:00.000Z",
        }),
        shareArtifact("mode-bracket", "mode", "http://localhost:5173/kickoff-lock-agent/?mode=mode-bracket"),
      ],
    });

    const sharing = items.find((item) => item.key === "sharing");
    expect(sharing?.level).not.toBe("verified");
    expect(sharing?.evidence).toContain("0/1 production HTTPS record card");
    expect(sharing?.evidence).toContain("0/1 production HTTPS mode card");
    expect(sharing?.nextAction).toContain("deployed HTTPS proof/image URLs");
  });

  it("does not verify production sharing until public image URLs read back", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(),
          profile: true,
          records: 1,
          modeRuns: 1,
          publicProofs: 2,
          shareArtifacts: 2,
          publicShareImages: 0,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          expectedShareArtifacts: 2,
          recordContentIds: ["cap-public-image"],
          modeRunContentIds: ["mode-bracket"],
          shareArtifactContentIds: ["record:cap-public-image", "mode:mode-bracket"],
          missingPublicShareImageIds: ["record:cap-public-image", "mode:mode-bracket"],
          message: "Share image URLs did not read back.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-public-image")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: true,
      shareEvidence: [
        shareArtifact("cap-public-image", "record", "https://example.com/kickoff-lock-agent/?proof=cap-public-image", {
          xIntentOpenedAt: "2026-06-01T00:03:00.000Z",
        }),
        shareArtifact("mode-bracket", "mode", "https://example.com/kickoff-lock-agent/?mode=mode-bracket"),
      ],
    });

    const sharing = items.find((item) => item.key === "sharing");
    expect(sharing?.level).not.toBe("verified");
    expect(sharing?.evidence).toContain("images unverified");
    expect(sharing?.nextAction).toContain("public image URLs by cloud read-back");
  });

  it("does not verify realtime data without a provider response audit", () => {
    const items = buildProductionReadiness({
      cloudState,
      profile,
      records: [],
      modeRuns: [],
      gameModes,
      providerReadiness: providerReadiness.map((item) => ({ ...item, status: "live" })),
      providerRouteAudit: [
        { key: "api-football", label: "API-Football", status: "active", configured: true, detail: "Live" },
      ],
      providerHealth: {
        ...liveProviderHealth,
        responseVerified: false,
        responseAudit: undefined,
        detail: "API-Football · 6/6 live/configured · fresh · response unverified",
      },
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    const data = items.find((item) => item.key === "data");
    expect(data?.level).not.toBe("verified");
    expect(data?.passed).toBe(data ? data.total - 1 : 0);
    expect(data?.evidence).toContain("response unverified");
  });

  it("does not verify realtime enrichment from configured keys without endpoint read-back", () => {
    const configuredReadiness: ProviderReadinessItem[] = [
      { key: "schedule", label: "Schedule", status: "live", source: "API-Football", detail: "Fixture endpoint" },
      { key: "score", label: "Score", status: "live", source: "API-Football", detail: "Score endpoint" },
      { key: "rankings", label: "Rankings", status: "configured", source: "FIFA snapshot", detail: "Ranking snapshot" },
      { key: "lineups", label: "Lineups", status: "configured", source: "API-Football", detail: "Key configured" },
      { key: "injuries", label: "Injuries", status: "configured", source: "API-Football", detail: "Key configured" },
      { key: "odds", label: "Odds", status: "configured", source: "API-Football", detail: "Key configured" },
    ];
    const items = buildProductionReadiness({
      cloudState,
      profile,
      records: [],
      modeRuns: [],
      gameModes,
      providerReadiness: configuredReadiness,
      providerRouteAudit: [
        { key: "api-football", label: "API-Football", status: "active", configured: true, detail: "Live" },
      ],
      providerHealth: {
        ...liveProviderHealth,
        enrichmentAudit: undefined,
        missingSignals: ["lineups", "injuries", "odds"],
        detail: "API-Football · 6/6 live/configured · fresh · response verified · 3/6 production read-back",
      },
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    const data = items.find((item) => item.key === "data");
    expect(data?.level).not.toBe("verified");
    expect(data?.passed).toBe(6);
    expect(data?.evidence).toContain("missing lineups, injuries, odds");
  });

  it("does not verify realtime enrichment when endpoint rows cover only part of the target set", () => {
    const liveReadiness: ProviderReadinessItem[] = [
      { key: "schedule", label: "Schedule", status: "live", source: "API-Football", detail: "Fixture endpoint" },
      { key: "score", label: "Score", status: "live", source: "API-Football", detail: "Score endpoint" },
      { key: "rankings", label: "Rankings", status: "configured", source: "FIFA snapshot", detail: "Ranking snapshot" },
      { key: "lineups", label: "Lineups", status: "live", source: "API-Football", detail: "2/2 fixtures" },
      { key: "injuries", label: "Injuries", status: "live", source: "API-Football", detail: "1/2 fixtures" },
      { key: "odds", label: "Odds", status: "live", source: "API-Football", detail: "2/2 fixtures" },
    ];
    const items = buildProductionReadiness({
      cloudState,
      profile,
      records: [],
      modeRuns: [],
      gameModes,
      providerReadiness: liveReadiness,
      providerRouteAudit: [
        { key: "api-football", label: "API-Football", status: "active", configured: true, detail: "Live" },
      ],
      providerHealth: {
        ...liveProviderHealth,
        enrichmentAudit: {
          ...liveProviderHealth.enrichmentAudit!,
          totalFixtures: 2,
          attemptedFixtures: 2,
          detail: "partial target read-back",
          endpointAudits: [
            { key: "lineups", endpoint: "fixtures/lineups?fixture=<fixture-id>", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["1", "2"] },
            { key: "injuries", endpoint: "injuries?fixture=<fixture-id>", attempted: 2, fulfilled: 2, live: 1, errors: 0, sampleIds: ["1"] },
            { key: "odds", endpoint: "odds?fixture=<fixture-id>", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["1", "2"] },
          ],
        },
        missingSignals: ["injuries"],
        detail: "API-Football · 6/6 live/configured · fresh · response verified · 5/6 production read-back",
      },
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    const data = items.find((item) => item.key === "data");
    expect(data?.level).not.toBe("verified");
    expect(data?.checks.find((check) => check.id === "injuries-readback")).toMatchObject({
      passed: false,
      evidence: "API-Football · live",
    });
    expect(data?.checks.find((check) => check.id === "lineups-readback")?.passed).toBe(true);
    expect(data?.checks.find((check) => check.id === "odds-readback")?.passed).toBe(true);
    expect(data?.evidence).toContain("missing injuries");
  });

  it("does not verify sharing from image flags that are missing manifest hashes", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(),
          profile: true,
          records: 1,
          modeRuns: 1,
          publicProofs: 2,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          message: "Cloud read-back verified.",
        },
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
      shareEvidence: [
        {
          id: "cap-1",
          kind: "record",
          proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-1",
          imageGenerated: true,
          generatedAt: "2026-06-01T00:02:00.000Z",
          xIntentOpenedAt: "2026-06-01T00:03:00.000Z",
        },
      ],
    });

    const sharing = items.find((item) => item.key === "sharing");
    expect(sharing?.level).not.toBe("verified");
    expect(sharing?.evidence).toContain("0/1 production HTTPS record card");
  });

  it("does not verify real account readiness from public profile read-back alone", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(),
          profile: false,
          records: 1,
          modeRuns: 1,
          publicProofs: 2,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          message: "Public profile read back, private profile row missing.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-1")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    const account = items.find((item) => item.key === "account");
    expect(account?.level).not.toBe("verified");
    expect(account?.passed).toBe(5);
    expect(account?.nextAction).toContain("verify Supabase read-back");
  });

  it("does not verify real account readiness without backend schema health", () => {
    const items = buildProductionReadiness({
      cloudState: {
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "synced",
        message: "synced",
        verification: {
          checkedAt: "2026-06-01T00:05:00.000Z",
          backendHealth: backendHealth(false),
          profile: true,
          records: 1,
          modeRuns: 1,
          publicProofs: 2,
          publicProfile: true,
          expectedRecords: 1,
          expectedModeRuns: 1,
          message: "Cloud read-back rows exist but backend schema health failed.",
        },
      },
      profile: { ...profile, id: "user-1", cloudMode: "supabase" },
      records: [record("cap-1")],
      modeRuns: [modeRun("bracket")],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    const account = items.find((item) => item.key === "account");
    expect(account?.level).not.toBe("verified");
    expect(account?.passed).toBe(4);
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
    expect(leaderboard?.passed).toBe(2);
    expect(leaderboard?.evidence).toContain("scopes global");
  });

  it("does not infer leaderboard scope verification from remote rows without query evidence", () => {
    const baseEntry: Omit<LeaderboardEntry, "source"> = {
      id: "user-1",
      displayName: "Remote",
      location: "Chengdu",
      locks: 2,
      revealed: 1,
      averageScore: 80,
      bestScore: 80,
      xp: 320,
      streak: 1,
      exactHits: 0,
      verifiedProofs: 1,
      modeProofs: 2,
    };
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
        { ...baseEntry, source: "global" },
        { ...baseEntry, source: "friend" },
        { ...baseEntry, source: "season" },
      ],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    const leaderboard = items.find((item) => item.key === "leaderboard");
    expect(leaderboard?.level).not.toBe("verified");
    expect(leaderboard?.passed).toBe(2);
    expect(leaderboard?.checks.find((check) => check.id === "global-current-user")).toMatchObject({
      passed: false,
      evidence: "global xp desc",
    });
    expect(leaderboard?.checks.find((check) => check.id === "friend-current-user")?.passed).toBe(false);
    expect(leaderboard?.checks.find((check) => check.id === "season-current-user")?.passed).toBe(false);
  });

  it("does not mark leaderboard production-ready when scope query evidence fails", () => {
    const baseEntry: Omit<LeaderboardEntry, "id" | "source"> = {
      displayName: "Remote",
      location: "Chengdu",
      locks: 2,
      revealed: 1,
      averageScore: 80,
      bestScore: 80,
      xp: 320,
      streak: 1,
      exactHits: 0,
      verifiedProofs: 1,
      modeProofs: 2,
    };
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
        { ...baseEntry, id: "global-row", source: "global" },
        { ...baseEntry, id: "friend-row", source: "friend" },
        { ...baseEntry, id: "season-row", source: "season" },
      ],
      leaderboardScopeEvidence: [
        leaderboardEvidence("global", "loaded", 1),
        { ...leaderboardEvidence("friend", "error", 0), error: "401" },
        leaderboardEvidence("season", "loaded", 1),
      ],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    const leaderboard = items.find((item) => item.key === "leaderboard");
    expect(leaderboard?.level).not.toBe("verified");
    expect(leaderboard?.evidence).toContain("friend:error/0/missing-user");
  });

  it("does not mark leaderboard production-ready when the current user has no scoped rank", () => {
    const baseEntry: Omit<LeaderboardEntry, "source"> = {
      id: "user-1",
      displayName: "Remote",
      location: "Chengdu",
      locks: 2,
      revealed: 1,
      averageScore: 80,
      bestScore: 80,
      xp: 320,
      streak: 1,
      exactHits: 0,
      verifiedProofs: 1,
      modeProofs: 2,
      rank: 1,
    };
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
        { ...baseEntry, source: "global" },
        { ...baseEntry, source: "friend" },
        { ...baseEntry, source: "season" },
      ],
      leaderboardScopeEvidence: [
        leaderboardEvidence("global", "loaded", 1),
        { ...leaderboardEvidence("friend", "loaded", 1), currentUserRank: undefined },
        leaderboardEvidence("season", "loaded", 1),
      ],
      sealEndpointConfigured: false,
      shareImageReady: false,
    });

    const leaderboard = items.find((item) => item.key === "leaderboard");
    expect(leaderboard?.level).not.toBe("verified");
    expect(leaderboard?.passed).toBe(4);
    expect(leaderboard?.evidence).toContain("friend:loaded/1/missing-rank-or-stats");
    expect(leaderboard?.checks.find((check) => check.id === "friend-current-user")).toMatchObject({
      passed: false,
      label: "Friend scope contains ranked current user",
    });
    expect(leaderboard?.nextAction).toContain("positive rank");
  });

  it("does not mark Filecoin production-ready without proof registry read-back", () => {
    const realRecord = record("cap-real-no-registry");
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
      capsuleId: "cap-real-no-registry",
      status: "verified",
      startedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:01:00.000Z",
      endpoint: "https://seal.example/seal",
      healthStatus: "ready",
      backendHealth: {
        ok: true,
        mockMode: false,
        hasPrivateKey: true,
        authRequired: true,
        productionReady: true,
        blockers: [],
        persistence: "file",
        maxUploadBytes: 262144,
      },
      proofUrl: "https://seal.example/proof/bafy-real",
      verifyUrl: "https://seal.example/verify?cid=bafy-real",
      uploadPayloadHash: "c".repeat(64),
      steps: [],
      proof: realRecord.capsule.filecoinProof,
    };

    const items = buildProductionReadiness({
      cloudState,
      profile,
      records: [realRecord],
      modeRuns: [],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: true,
      shareImageReady: false,
    });

    const filecoin = items.find((item) => item.key === "filecoin");
    expect(filecoin?.level).not.toBe("verified");
    expect(filecoin?.passed).toBe(6);
    expect(filecoin?.total).toBe(11);
  });

  it("does not mark Filecoin production-ready until a mode proof is also sealed and read back", () => {
    const realRecord = record("cap-real-record-only");
    realRecord.capsule.filecoinProof = {
      mode: "real",
      cid: "bafy-real-record",
      pieceCid: "baga-real-record",
      provider: "synapse",
      dataSetId: "dataset",
      proofStatus: "verified",
      payloadHash: "c".repeat(64),
    };
    realRecord.sealJob = productionSealJob("cap-real-record-only", "c".repeat(64), realRecord.capsule.filecoinProof);

    const modeOnlyProof = modeRun("bracket");
    const items = buildProductionReadiness({
      cloudState,
      profile,
      records: [realRecord],
      modeRuns: [modeOnlyProof],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: true,
      shareImageReady: false,
    });

    const filecoin = items.find((item) => item.key === "filecoin");
    expect(filecoin?.level).not.toBe("verified");
    expect(filecoin?.evidence).toContain("1 real proof record");
    expect(filecoin?.evidence).toContain("1 real proof mode");
    expect(filecoin?.passed).toBe(8);
    expect(filecoin?.total).toBe(11);
  });

  it("does not mark Filecoin production-ready when the seal API reports production blockers", () => {
    const demoBackendRecord = record("cap-real-blocked-backend");
    demoBackendRecord.capsule.filecoinProof = {
      mode: "real",
      cid: "bafy-real",
      pieceCid: "baga-real",
      provider: "synapse",
      dataSetId: "dataset",
      proofStatus: "verified",
      payloadHash: "c".repeat(64),
    };
    demoBackendRecord.sealJob = {
      id: "seal-1",
      capsuleId: "cap-real-blocked-backend",
      status: "verified",
      startedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:01:00.000Z",
      endpoint: "https://seal.example/seal",
      healthStatus: "ready",
      backendHealth: {
        ok: true,
        mockMode: true,
        hasPrivateKey: false,
        authRequired: false,
        productionReady: false,
        blockers: ["FILECOIN_SEAL_MOCK is enabled", "SYNAPSE_PRIVATE_KEY is missing"],
        persistence: "memory",
        maxUploadBytes: 262144,
      },
      proofUrl: "https://seal.example/proof/bafy-real",
      verifyUrl: "https://seal.example/verify?cid=bafy-real",
      uploadPayloadHash: "c".repeat(64),
      proofRegistryStatus: "verified",
      proofRegistryHash: "c".repeat(64),
      proofRegistryCheckedAt: "2026-06-01T00:01:30.000Z",
      steps: [],
      proof: demoBackendRecord.capsule.filecoinProof,
    };

    const items = buildProductionReadiness({
      cloudState,
      profile,
      records: [demoBackendRecord],
      modeRuns: [],
      gameModes,
      providerReadiness,
      providerRouteAudit: routeAudit,
      leaderboardEntries: [],
      sealEndpointConfigured: true,
      shareImageReady: false,
    });

    const filecoin = items.find((item) => item.key === "filecoin");
    expect(filecoin?.level).not.toBe("verified");
    expect(filecoin?.passed).toBe(6);
    expect(filecoin?.evidence).toContain("production backend missing");
  });
});
