import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildLeaderboardScopeEvidence,
  buildLeaderboardReadiness,
  buildCloudSyncAudit,
  buildCloudSyncCoverage,
  buildLocalLeaderboard,
  buildPublicProfile,
  buildSupabaseOAuthUrl,
  consumeSupabaseHash,
  isCloudReadbackComplete,
  isSupabaseSessionExpired,
  leaderboardScopeFilter,
  loadSupabaseSession,
  mergeMemoryRecords,
  mergeModeRuns,
  mergeShareArtifacts,
  shareImageStoragePath,
} from "./cloud";
import type { CloudBackendHealth, CloudSyncState, GameModeRun, LeaderboardEntry, MemoryRecord, ShareArtifactEvidence, UserProfile } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const stubBrowserStorage = (hash = "") => {
  const store = new Map<string, string>();
  let fakeWindow: {
    location: { hash: string; pathname: string; search: string };
    history: { replaceState: ReturnType<typeof vi.fn> };
  };
  fakeWindow = {
    location: {
      hash,
      pathname: "/kickoff-lock-agent/",
      search: "",
    },
    history: {
      replaceState: vi.fn(() => {
        fakeWindow.location.hash = "";
      }),
    },
  };
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
  });
  return fakeWindow;
};

const profile: UserProfile = {
  id: "local-test",
  email: "test@example.com",
  displayName: "Tester",
  location: "Chengdu",
  createdAt: "2099-01-01T00:00:00.000Z",
  cloudMode: "local",
};

const record = (id: string, patch: Partial<MemoryRecord> = {}): MemoryRecord => ({
  capsule: {
    id,
    matchId: "m1",
    matchLabel: "A vs B",
    kickoffAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2098-12-31T00:00:00.000Z",
    sealedAt: "2098-12-31T00:00:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: "bafy",
      pieceCid: "piece",
      provider: "demo",
      dataSetId: "set",
      proofStatus: "retrievable",
    },
    prediction: {
      homeScore: 1,
      awayScore: 0,
      winner: "A",
      keyPlayers: [],
      confidence: 55,
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
      markets: [],
    },
  },
  ...patch,
});

const modeRun = (id: string, patch: Partial<GameModeRun> = {}): GameModeRun => ({
  id,
  modeId: "parlay",
  title: "Multi-match parlay",
  createdAt: "2099-01-01T00:00:00.000Z",
  capsuleIds: ["cap-1", "cap-2", "cap-3"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: `bafy-mode-${id}`,
    pieceCid: `piece-${id}`,
    provider: "demo",
    dataSetId: "set",
    proofStatus: "retrievable",
  },
  status: "sealed",
  summary: "Parlay proof sealed.",
  requirements: ["3 sealed match capsules"],
  ...patch,
});

const shareArtifact = (
  id: string,
  kind: ShareArtifactEvidence["kind"],
  patch: Partial<ShareArtifactEvidence> = {},
): ShareArtifactEvidence => ({
  id,
  kind,
  proofUrl: `https://example.com/kickoff-lock-agent/?${kind === "record" ? "proof" : "mode"}=${id}`,
  imageGenerated: true,
  generatedAt: "2099-01-01T00:00:00.000Z",
  fileName: `${id}-share-card.png`,
  imageUrl: `https://example.com/cards/${id}-share-card.png`,
  imageMime: "image/png",
  imageByteLength: 240000,
  imageHash: "c".repeat(64),
  ...patch,
});

const backendHealth = (patch: Partial<CloudBackendHealth> = {}): CloudBackendHealth => ({
  checkedAt: "2099-01-01T00:00:00.000Z",
  schemaVersion: "2026-07-03-cloud-v2",
  ready: true,
  requiredTables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
  missingTables: [],
  requiredViews: ["kickoff_leaderboard", "kickoff_backend_health"],
  missingViews: [],
  rlsTables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
  missingRlsTables: [],
  policyCount: 8,
  requiredPolicyCount: 8,
  detail: "tables missing 0, views missing 0, RLS missing 0, policies 8/8",
  ...patch,
});

describe("local leaderboard", () => {
  it("detects expired Supabase sessions with a refresh skew", () => {
    expect(isSupabaseSessionExpired({ access_token: "token", expires_at: 100 }, 60, 50_000)).toBe(true);
    expect(isSupabaseSessionExpired({ access_token: "token", expires_at: 500 }, 60, 50_000)).toBe(false);
    expect(isSupabaseSessionExpired(undefined, 60, 50_000)).toBe(false);
  });

  it("stores Supabase callback hash sessions with expiry and refresh token", () => {
    const fakeWindow = stubBrowserStorage("#access_token=abc&refresh_token=refresh-abc&expires_in=120");

    const session = consumeSupabaseHash();
    const saved = loadSupabaseSession();

    expect(session?.access_token).toBe("abc");
    expect(saved?.refresh_token).toBe("refresh-abc");
    expect(saved?.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(fakeWindow.location.hash).toBe("");
  });

  it("builds a Supabase Google OAuth authorize URL with redirect target", () => {
    const url = new URL(
      buildSupabaseOAuthUrl(
        "google",
        "https://example.com/kickoff-lock-agent/",
        "https://project.supabase.co",
      ),
    );

    expect(url.origin).toBe("https://project.supabase.co");
    expect(url.pathname).toBe("/auth/v1/authorize");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe("https://example.com/kickoff-lock-agent/");
  });

  it("reports local proofs waiting for sign-in before cloud acknowledgement", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: false,
      mode: "supabase",
      status: "offline",
      message: "waiting",
    };

    const coverage = buildCloudSyncCoverage(cloudState, [record("cap-pending")], [modeRun("mode-pending")]);

    expect(coverage.passed).toBe(false);
    expect(coverage.pendingItems).toBe(2);
    expect(coverage.detail).toContain("waiting for sign-in");
  });

  it("marks local proofs acknowledged after a successful cloud sync", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-01-01T00:00:00.000Z",
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
        publicProfileRecordIds: ["cap-synced"],
        publicProfileModeRunIds: ["mode-synced"],
        publicProfileShareArtifactIds: ["record:cap-synced"],
        message: "Cloud read-back verified.",
      },
    };

    const coverage = buildCloudSyncCoverage(
      cloudState,
      [record("cap-synced")],
      [modeRun("mode-synced")],
      [shareArtifact("cap-synced", "record")],
    );

    expect(coverage.passed).toBe(true);
    expect(coverage.pendingItems).toBe(0);
    expect(coverage.detail).toContain("verified by cloud read-back");
  });

  it("uses the strict cloud read-back helper for account sync completion", () => {
    const completeVerification = {
      checkedAt: "2099-01-01T00:00:00.000Z",
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
      recordContentIds: ["cap-synced"],
      modeRunContentIds: ["mode-synced"],
      shareArtifactContentIds: ["record:cap-synced"],
      publicProfileRecordIds: ["cap-synced"],
      publicProfileModeRunIds: ["mode-synced"],
      publicProfileShareArtifactIds: ["record:cap-synced"],
      message: "Cloud read-back verified.",
    };

    expect(isCloudReadbackComplete(completeVerification, 1, 1, 1)).toBe(true);
    expect(isCloudReadbackComplete({ ...completeVerification, publicShareImages: 0 }, 1, 1, 1)).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, recordContentIds: [] }, 1, 1, 1)).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, publicProfileRecordIds: [] }, 1, 1, 1)).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, backendHealth: backendHealth({ ready: false }) }, 1, 1, 1)).toBe(false);
  });

  it("does not mark sync coverage passed when Supabase write is not read back", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
    };

    const coverage = buildCloudSyncCoverage(cloudState, [record("cap-unverified")], [modeRun("mode-unverified")]);

    expect(coverage.passed).toBe(false);
    expect(coverage.detail).toContain("pending cloud acknowledgement");
  });

  it("does not mark cloud sync passed when backend schema health is missing", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-01-01T00:00:00.000Z",
        backendHealth: backendHealth({
          ready: false,
          missingTables: ["kickoff_share_artifacts"],
          policyCount: 6,
          detail: "missing kickoff_share_artifacts and required policies",
        }),
        profile: true,
        records: 1,
        modeRuns: 1,
        publicProofs: 2,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        message: "Rows read back but schema health failed.",
      },
    };
    const cloudProfile = { ...profile, id: "user-123", cloudMode: "supabase" as const };

    const coverage = buildCloudSyncCoverage(cloudState, [record("cap-schema")], [modeRun("mode-schema")]);
    const audit = buildCloudSyncAudit(cloudState, cloudProfile, [record("cap-schema")], [modeRun("mode-schema")]);

    expect(coverage.passed).toBe(false);
    expect(audit.find((item) => item.key === "backend")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "backend")?.detail).toContain("kickoff_share_artifacts");
  });

  it("audits cloud account coverage before sign-in", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: false,
      mode: "supabase",
      status: "offline",
      message: "waiting",
    };

    const audit = buildCloudSyncAudit(cloudState, profile, [record("cap-audit")], [modeRun("mode-audit")]);

    expect(audit.find((item) => item.key === "profile")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "records")?.status).toBe("blocked");
    expect(audit.find((item) => item.key === "records")?.total).toBe(1);
    expect(audit.find((item) => item.key === "publicProofs")?.action).toContain("Sync history");
    expect(audit.find((item) => item.key === "leaderboard")?.detail).toContain("local fallback");
  });

  it("audits synced cloud history and leaderboard backend evidence", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-01-01T00:00:00.000Z",
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
        publicProfileRecordIds: ["cap-synced"],
        publicProfileModeRunIds: ["mode-synced"],
        publicProfileShareArtifactIds: ["record:cap-synced"],
        message: "Cloud read-back verified.",
      },
    };
    const cloudProfile = { ...profile, id: "user-123", cloudMode: "supabase" as const };
    const remoteEntry: LeaderboardEntry = {
      id: profile.id,
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
      source: "global",
    };

    const audit = buildCloudSyncAudit(
      cloudState,
      cloudProfile,
      [record("cap-synced")],
      [modeRun("mode-synced")],
      [remoteEntry],
      [shareArtifact("cap-synced", "record")],
    );

    expect(audit.every((item) => item.status === "passed")).toBe(true);
    expect(audit.find((item) => item.key === "records")?.synced).toBe(1);
    expect(audit.find((item) => item.key === "modeRuns")?.synced).toBe(1);
    expect(audit.find((item) => item.key === "shareArtifacts")?.synced).toBe(1);
    expect(audit.find((item) => item.key === "publicProfile")?.detail).toContain("?profile=user-123");
    expect(audit.find((item) => item.key === "leaderboard")?.detail).toContain("1 remote");
  });

  it("keeps public profile pending until synced archives appear on the profile page", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-01-01T00:00:00.000Z",
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
        recordContentIds: ["cap-profile-partial"],
        modeRunContentIds: ["mode-profile-partial"],
        shareArtifactContentIds: ["record:cap-profile-partial"],
        publicProfileRecordIds: ["cap-profile-partial"],
        publicProfileModeRunIds: [],
        publicProfileShareArtifactIds: [],
        missingPublicProfileModeRunIds: ["mode-profile-partial"],
        missingPublicProfileShareArtifactIds: ["record:cap-profile-partial"],
        message: "Profile page opened but archives are missing.",
      },
    };
    const cloudProfile = { ...profile, id: "user-123", cloudMode: "supabase" as const };

    const coverage = buildCloudSyncCoverage(
      cloudState,
      [record("cap-profile-partial")],
      [modeRun("mode-profile-partial")],
      [shareArtifact("cap-profile-partial", "record")],
    );
    const audit = buildCloudSyncAudit(
      cloudState,
      cloudProfile,
      [record("cap-profile-partial")],
      [modeRun("mode-profile-partial")],
      [],
      [shareArtifact("cap-profile-partial", "record")],
    );

    expect(coverage.passed).toBe(false);
    expect(audit.find((item) => item.key === "publicProfile")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "publicProfile")?.detail).toContain("archives 1/3");
    expect(audit.find((item) => item.key === "publicProfile")?.detail).toContain("mode-profile-partial");
  });

  it("keeps cloud sync incomplete until generated share manifests are read back", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-01-01T00:00:00.000Z",
        backendHealth: backendHealth(),
        profile: true,
        records: 1,
        modeRuns: 1,
        publicProofs: 2,
        shareArtifacts: 0,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        expectedShareArtifacts: 1,
        missingShareArtifactIds: ["record:cap-missing-card"],
        message: "Share manifest missing.",
      },
    };
    const cloudProfile = { ...profile, id: "user-123", cloudMode: "supabase" as const };

    const audit = buildCloudSyncAudit(
      cloudState,
      cloudProfile,
      [record("cap-missing-card")],
      [modeRun("mode-synced")],
      [],
      [shareArtifact("cap-missing-card", "record")],
    );

    expect(audit.find((item) => item.key === "shareArtifacts")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "shareArtifacts")?.detail).toContain("record:cap-missing-card");
  });

  it("keeps share card audit incomplete until public image URLs read back", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-01-01T00:00:00.000Z",
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
        shareArtifactIds: ["record:cap-image-missing"],
        missingPublicShareImageIds: ["record:cap-image-missing"],
        message: "Share image URL missing.",
      },
    };
    const cloudProfile = { ...profile, id: "user-123", cloudMode: "supabase" as const };

    const coverage = buildCloudSyncCoverage(
      cloudState,
      [record("cap-image-missing")],
      [modeRun("mode-synced")],
      [shareArtifact("cap-image-missing", "record")],
    );
    const audit = buildCloudSyncAudit(
      cloudState,
      cloudProfile,
      [record("cap-image-missing")],
      [modeRun("mode-synced")],
      [],
      [shareArtifact("cap-image-missing", "record")],
    );

    expect(coverage.passed).toBe(false);
    expect(audit.find((item) => item.key === "shareArtifacts")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "shareArtifacts")?.detail).toContain("0/1 public images");
    expect(audit.find((item) => item.key === "shareArtifacts")?.detail).toContain("record:cap-image-missing");
  });

  it("does not pass cloud coverage when ids read back but content fingerprints are missing", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-01-01T00:00:00.000Z",
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
        modeRunIds: ["mode-stale"],
        shareArtifactIds: ["record:cap-stale"],
        recordContentIds: [],
        modeRunContentIds: [],
        shareArtifactContentIds: [],
        missingRecordContentIds: ["cap-stale"],
        missingModeRunContentIds: ["mode-stale"],
        missingShareArtifactContentIds: ["record:cap-stale"],
        message: "IDs exist but content fingerprint mismatch.",
      },
    };

    const coverage = buildCloudSyncCoverage(
      cloudState,
      [record("cap-stale")],
      [modeRun("mode-stale")],
      [shareArtifact("cap-stale", "record")],
    );
    const audit = buildCloudSyncAudit(
      cloudState,
      { ...profile, id: "user-123", cloudMode: "supabase" as const },
      [record("cap-stale")],
      [modeRun("mode-stale")],
      [],
      [shareArtifact("cap-stale", "record")],
    );

    expect(coverage.passed).toBe(false);
    expect(coverage.detail).toContain("pending cloud acknowledgement");
    expect(audit.find((item) => item.key === "contentFingerprints")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "contentFingerprints")?.detail).toContain("cap-stale");
  });

  it("merges share artifact manifests without losing channel or image evidence", () => {
    const merged = mergeShareArtifacts(
      [
        shareArtifact("cap-merge", "record", {
          xIntentUrl: "https://twitter.com/intent/tweet",
          xIntentOpenedAt: "2099-01-01T00:01:00.000Z",
        }),
      ],
      [
        shareArtifact("cap-merge", "record", {
          imageHash: "d".repeat(64),
          imageUrl: "https://example.com/cards/cap-merge-v2.png",
          generatedAt: "2099-01-01T00:02:00.000Z",
          xIntentOpenedAt: undefined,
        }),
        shareArtifact("mode-cloud", "mode"),
      ],
    );

    const recordArtifact = merged.find((item) => item.id === "cap-merge" && item.kind === "record");
    expect(merged).toHaveLength(2);
    expect(recordArtifact?.imageHash).toBe("d".repeat(64));
    expect(recordArtifact?.imageUrl).toBe("https://example.com/cards/cap-merge-v2.png");
    expect(recordArtifact?.xIntentOpenedAt).toBe("2099-01-01T00:01:00.000Z");
    expect(merged.find((item) => item.id === "mode-cloud")?.kind).toBe("mode");
  });

  it("builds deterministic share image storage paths", () => {
    expect(
      shareImageStoragePath(
        { id: "User 123" },
        { id: "Cap Fancy", kind: "record", fileName: "Cap Fancy Share.PNG" },
      ),
    ).toBe("user-123/record/cap-fancy/cap-fancy-share.png");
  });

  it("uploads generated share images to a public Supabase Storage URL", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("VITE_SUPABASE_SHARE_BUCKET", "kickoff-share-cards");
    vi.resetModules();
    stubBrowserStorage();
    localStorage.setItem(
      "kickoff-lock-agent-supabase-session-v1",
      JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const fetchCalls: Array<{ url: string; method?: string; headers?: HeadersInit; body?: BodyInit | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        fetchCalls.push({ url: String(input), method: init?.method, headers: init?.headers, body: init?.body });
        if (String(input).startsWith("data:image/png")) {
          return new Response(new Blob(["png-bytes"], { type: "image/png" }), { status: 200 });
        }
        return new Response(JSON.stringify({ Key: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    const { uploadShareImageToCloud: uploadConfiguredShareImage } = await import("./cloud");

    const result = await uploadConfiguredShareImage(
      { ...profile, id: "user-123", cloudMode: "supabase" },
      { id: "cap-card", kind: "record", fileName: "cap-card.png", imageMime: "image/png" },
      "data:image/png;base64,cG5n",
    );

    expect(result.status).toBe("uploaded");
    expect(result.imageUrl).toBe(
      "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-123/record/cap-card/cap-card.png",
    );
    const uploadCall = fetchCalls.find((call) => call.url.includes("/storage/v1/object/kickoff-share-cards/"));
    expect(uploadCall?.method).toBe("POST");
    expect(uploadCall?.url).toContain("/user-123/record/cap-card/cap-card.png");
    expect((uploadCall?.headers as Record<string, string>)?.["x-upsert"]).toBe("true");
  });

  it("keeps cloud audit pending when synced state lacks read-back proof", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
    };
    const cloudProfile = { ...profile, id: "user-123", cloudMode: "supabase" as const };
    const audit = buildCloudSyncAudit(cloudState, cloudProfile, [record("cap-pending-readback")], [modeRun("mode-pending-readback")]);

    expect(audit.find((item) => item.key === "profile")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "records")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "modeRuns")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "publicProofs")?.detail).toContain("0/2 public links");
  });

  it("does not treat anonymous public profile read-back as private cloud profile proof", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-01-01T00:00:00.000Z",
        backendHealth: backendHealth(),
        profile: false,
        records: 1,
        modeRuns: 1,
        publicProofs: 2,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        recordIds: ["cap-public-only"],
        modeRunIds: ["mode-public-only"],
        publicProofIds: ["record:cap-public-only", "mode:mode-public-only"],
        publicProfileRecordIds: ["cap-public-only"],
        publicProfileModeRunIds: ["mode-public-only"],
        missingRecordIds: [],
        missingModeRunIds: [],
        missingPublicProofIds: [],
        message: "Public profile read back, private profile row missing.",
      },
    };
    const cloudProfile = { ...profile, id: "user-123", cloudMode: "supabase" as const };

    const coverage = buildCloudSyncCoverage(cloudState, [record("cap-public-only")], [modeRun("mode-public-only")]);
    const audit = buildCloudSyncAudit(cloudState, cloudProfile, [record("cap-public-only")], [modeRun("mode-public-only")]);

    expect(coverage.passed).toBe(false);
    expect(audit.find((item) => item.key === "profile")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "publicProfile")?.status).toBe("passed");
    expect(audit.find((item) => item.key === "records")?.status).toBe("passed");
    expect(audit.find((item) => item.key === "modeRuns")?.status).toBe("passed");
  });

  it("surfaces missing cloud read-back ids in the audit detail", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "partial sync",
      verification: {
        checkedAt: "2099-01-01T00:00:00.000Z",
        backendHealth: backendHealth(),
        profile: true,
        records: 1,
        modeRuns: 0,
        publicProofs: 1,
        publicProfile: true,
        expectedRecords: 2,
        expectedModeRuns: 1,
        recordIds: ["cap-ok"],
        modeRunIds: [],
        publicProofIds: ["record:cap-ok"],
        missingRecordIds: ["cap-missing"],
        missingModeRunIds: ["mode-missing"],
        missingPublicProofIds: ["record:cap-missing", "mode:mode-missing"],
        message: "partial",
      },
    };
    const cloudProfile = { ...profile, id: "user-123", cloudMode: "supabase" as const };

    const audit = buildCloudSyncAudit(
      cloudState,
      cloudProfile,
      [record("cap-ok"), record("cap-missing")],
      [modeRun("mode-missing")],
    );

    expect(audit.find((item) => item.key === "records")?.detail).toContain("missing cap-missing");
    expect(audit.find((item) => item.key === "modeRuns")?.detail).toContain("missing mode-missing");
    expect(audit.find((item) => item.key === "publicProofs")?.detail).toContain("record:cap-missing");
    expect(audit.find((item) => item.key === "records")?.status).toBe("pending");
  });

  it("builds an XP entry from local records", () => {
    const records: MemoryRecord[] = [
      {
        capsule: {
          id: "cap-1",
          matchId: "m1",
          matchLabel: "A vs B",
          kickoffAt: "2099-01-01T00:00:00.000Z",
          createdAt: "2098-12-31T00:00:00.000Z",
          sealedAt: "2098-12-31T00:00:00.000Z",
          locked: true,
          lateLock: false,
          payloadHash: "a".repeat(64),
          filecoinProof: {
            mode: "demo",
            cid: "bafy",
            pieceCid: "piece",
            provider: "demo",
            dataSetId: "set",
            proofStatus: "retrievable",
          },
          prediction: {
            homeScore: 1,
            awayScore: 0,
            winner: "A",
            keyPlayers: [],
            confidence: 55,
            style: "analysis",
            reasoning: "Reasoning",
            agentSummary: "Summary",
            markets: [],
          },
        },
        result: {
          id: "res-1",
          capsuleId: "cap-1",
          revealedAt: "2099-01-01T02:00:00.000Z",
          homeScore: 1,
          awayScore: 0,
          keyPlayers: [],
          source: "manual",
          totalScore: 88,
          breakdown: {
            winner: 24,
            exactScore: 24,
            goalDifference: 12,
            markets: 0,
            keyPlayer: 0,
            confidence: 10,
            reasoning: 5,
          },
          explanation: [],
          agentReview: [],
        },
      },
    ];
    const [entry] = buildLocalLeaderboard(profile, records);
    expect(entry.displayName).toBe("Tester");
    expect(entry.xp).toBe(208);
    expect(entry.bestScore).toBe(88);
    expect(entry.revealed).toBe(1);
    expect(entry.exactHits).toBe(1);
    expect(entry.verifiedProofs).toBe(0);
    expect(entry.modeProofs).toBe(0);
    expect(entry.friendCode).toBe("chengdu");
    expect(entry.source).toBe("local");
  });

  it("adds mode proof runs to local leaderboard XP", () => {
    const [entry] = buildLocalLeaderboard(profile, [record("cap-with-mode")], [
      modeRun("mode-scored", { status: "scored", score: 77 }),
    ]);

    expect(entry.modeProofs).toBe(1);
    expect(entry.xp).toBe(287);
  });

  it("shows leaderboard backend readiness separately from local fallback rows", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: false,
      mode: "supabase",
      status: "ready",
      message: "ready",
    };
    const remoteEntry: LeaderboardEntry = {
      id: profile.id,
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
      source: "global",
    };

    const readiness = buildLeaderboardReadiness(cloudState, [remoteEntry], profile);

    expect(readiness.find((item) => item.key === "view")?.passed).toBe(true);
    expect(readiness.find((item) => item.key === "global")?.passed).toBe(true);
    expect(readiness.find((item) => item.key === "friend")?.passed).toBe(false);
    expect(readiness.find((item) => item.key === "season")?.passed).toBe(false);
    expect(readiness.find((item) => item.key === "global")?.detail).toContain("global xp ranking");
    expect(readiness.find((item) => item.key === "friend")?.detail).toContain("chengdu");
    expect(readiness.find((item) => item.key === "season")?.detail).toContain("world-cup-run");
    expect(readiness.find((item) => item.key === "remoteRows")?.detail).toContain("1 Supabase");
  });

  it("requires remote leaderboard evidence for global, friend and season scopes", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
    };
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
    const readiness = buildLeaderboardReadiness(
      cloudState,
      [
        { ...baseEntry, id: profile.id, source: "global" },
        { ...baseEntry, id: profile.id, source: "friend" },
        { ...baseEntry, id: profile.id, source: "season" },
      ],
      profile,
    );

    expect(readiness.find((item) => item.key === "global")?.passed).toBe(true);
    expect(readiness.find((item) => item.key === "friend")?.passed).toBe(true);
    expect(readiness.find((item) => item.key === "season")?.passed).toBe(true);
    expect(readiness.find((item) => item.key === "remoteRows")?.detail).toContain("3 Supabase");
  });

  it("records backend query evidence for each leaderboard scope filter", () => {
    const entry: LeaderboardEntry = {
      id: "scope-row",
      displayName: "Remote",
      location: "Chengdu",
      locks: 1,
      revealed: 1,
      averageScore: 88,
      bestScore: 88,
      xp: 240,
      streak: 1,
      exactHits: 1,
      verifiedProofs: 1,
      modeProofs: 1,
      source: "friend",
    };

    const friendEvidence = buildLeaderboardScopeEvidence("friend", profile, [entry]);
    const seasonEvidence = buildLeaderboardScopeEvidence("season", profile, []);

    expect(leaderboardScopeFilter("global", profile)).toBe("global xp desc");
    expect(friendEvidence.status).toBe("loaded");
    expect(friendEvidence.rows).toBe(1);
    expect(friendEvidence.filter).toBe("friend_code=eq.chengdu");
    expect(friendEvidence.currentUserPresent).toBe(false);
    expect(friendEvidence.sampleIds).toEqual(["scope-row"]);
    expect(seasonEvidence.status).toBe("empty");
    expect(seasonEvidence.currentUserPresent).toBe(false);
    expect(seasonEvidence.filter).toBe("season_key=eq.world-cup-run");
  });

  it("uses leaderboard query evidence instead of trusting stale remote rows", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
    };
    const remoteRows: LeaderboardEntry[] = [
      {
        id: profile.id,
        displayName: "Remote",
        location: "Global",
        locks: 1,
        revealed: 1,
        averageScore: 70,
        bestScore: 70,
        xp: 200,
        streak: 1,
        exactHits: 0,
        verifiedProofs: 0,
        modeProofs: 0,
        source: "global",
      },
    ];
    const readiness = buildLeaderboardReadiness(cloudState, remoteRows, profile, [
      buildLeaderboardScopeEvidence("global", profile, remoteRows),
      buildLeaderboardScopeEvidence("friend", profile, [], {
        status: "error",
        rows: 0,
        error: "401",
      }),
      buildLeaderboardScopeEvidence("season", profile, [], {
        status: "empty",
        rows: 0,
      }),
    ]);

    expect(readiness.find((item) => item.key === "global")?.passed).toBe(true);
    expect(readiness.find((item) => item.key === "global")?.detail).toContain("current user rank");
    expect(readiness.find((item) => item.key === "friend")?.passed).toBe(false);
    expect(readiness.find((item) => item.key === "friend")?.detail).toContain("query failed");
    expect(readiness.find((item) => item.key === "season")?.detail).toContain("empty");
  });

  it("does not pass leaderboard scope evidence from rows that omit the current user", () => {
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
    };
    const remoteRows: LeaderboardEntry[] = [
      {
        id: "other-user",
        displayName: "Other",
        location: "Global",
        locks: 1,
        revealed: 1,
        averageScore: 70,
        bestScore: 70,
        xp: 200,
        streak: 1,
        exactHits: 0,
        verifiedProofs: 0,
        modeProofs: 0,
        source: "global",
      },
    ];
    const readiness = buildLeaderboardReadiness(cloudState, remoteRows, profile, [
      buildLeaderboardScopeEvidence("global", profile, remoteRows),
    ]);

    expect(readiness.find((item) => item.key === "global")?.passed).toBe(false);
    expect(readiness.find((item) => item.key === "global")?.detail).toContain("current user missing");
  });

  it("keeps leaderboard readiness honest when only local fallback is available", () => {
    const cloudState: CloudSyncState = {
      configured: false,
      authenticated: false,
      mode: "local",
      status: "offline",
      message: "local",
    };
    const localEntry = buildLocalLeaderboard(profile, [record("local-only")])[0];

    const readiness = buildLeaderboardReadiness(cloudState, [localEntry], profile);

    expect(readiness.find((item) => item.key === "view")?.passed).toBe(false);
    expect(readiness.find((item) => item.key === "global")?.detail).toContain("requires Supabase");
    expect(readiness.find((item) => item.key === "remoteRows")?.passed).toBe(false);
    expect(readiness.find((item) => item.key === "remoteRows")?.detail).toContain("local fallback");
  });

  it("counts winner streak from the latest revealed records", () => {
    const withResult = (id: string, revealedAt: string, winner: number) =>
      record(id, {
        result: {
          id: `res-${id}`,
          capsuleId: id,
          revealedAt,
          homeScore: 1,
          awayScore: 0,
          keyPlayers: [],
          source: "manual",
          totalScore: winner > 0 ? 80 : 30,
          breakdown: {
            winner,
            exactScore: 0,
            goalDifference: 0,
            markets: 0,
            keyPlayer: 0,
            confidence: 0,
            reasoning: 0,
          },
          explanation: [],
          agentReview: [],
        },
      });

    const [entry] = buildLocalLeaderboard(profile, [
      withResult("old-hit", "2099-01-01T00:00:00.000Z", 24),
      withResult("middle-miss", "2099-01-02T00:00:00.000Z", 0),
      withResult("latest-hit", "2099-01-03T00:00:00.000Z", 24),
    ]);

    expect(entry.streak).toBe(1);
    expect(entry.revealed).toBe(3);
  });

  it("builds a public profile from local records", () => {
    const records: MemoryRecord[] = [
      {
        capsule: {
          id: "cap-2",
          matchId: "m2",
          matchLabel: "C vs D",
          kickoffAt: "2099-01-02T00:00:00.000Z",
          createdAt: "2099-01-01T00:00:00.000Z",
          sealedAt: "2099-01-01T00:00:00.000Z",
          locked: true,
          lateLock: false,
          payloadHash: "c".repeat(64),
          filecoinProof: {
            mode: "demo",
            cid: "bafy-public",
            pieceCid: "piece-public",
            provider: "demo",
            dataSetId: "set-public",
            proofStatus: "verified",
          },
          prediction: {
            homeScore: 2,
            awayScore: 1,
            winner: "C",
            keyPlayers: [],
            confidence: 70,
            style: "analysis",
            reasoning: "Reasoning",
            agentSummary: "Summary",
            markets: [],
          },
        },
        result: {
          id: "res-2",
          capsuleId: "cap-2",
          revealedAt: "2099-01-02T02:00:00.000Z",
          homeScore: 2,
          awayScore: 1,
          keyPlayers: [],
          source: "manual",
          totalScore: 92,
          breakdown: {
            winner: 24,
            exactScore: 24,
            goalDifference: 12,
            markets: 0,
            keyPlayer: 0,
            confidence: 10,
            reasoning: 5,
          },
          explanation: [],
          agentReview: [],
        },
      },
    ];

    const publicProfile = buildPublicProfile(profile, records, [modeRun("mode-public")], [
      shareArtifact("cap-2", "record"),
      shareArtifact("mode-public", "mode"),
    ]);
    expect(publicProfile.displayName).toBe("Tester");
    expect(publicProfile.friendCode).toBe("chengdu");
    expect(publicProfile.locks).toBe(1);
    expect(publicProfile.revealed).toBe(1);
    expect(publicProfile.modeProofs).toBe(1);
    expect(publicProfile.modeRuns[0].id).toBe("mode-public");
    expect(publicProfile.shareArtifacts).toHaveLength(2);
    expect(publicProfile.shareArtifacts[0].kind).toBe("record");
    expect(publicProfile.averageScore).toBe(92);
    expect(publicProfile.bestScore).toBe(92);
    expect(publicProfile.xp).toBe(302);
  });

  it("documents mode proof aggregation in the Supabase leaderboard view", () => {
    const schema = readFileSync(join(process.cwd(), "supabase.schema.sql"), "utf8");

    expect(schema).toContain("mode_rows as");
    expect(schema).toContain("from public.kickoff_mode_runs");
    expect(schema).toContain("mode_proofs");
    expect(schema).toContain("count(*) * 90");
    expect(schema).toContain("full outer join mode_rows");
  });

  it("documents cloud share artifact storage and read policies", () => {
    const schema = readFileSync(join(process.cwd(), "supabase.schema.sql"), "utf8");

    expect(schema).toContain("create table if not exists public.kickoff_share_artifacts");
    expect(schema).toContain("primary key (id, kind)");
    expect(schema).toContain("artifact jsonb not null");
    expect(schema).toContain("image_url text");
    expect(schema).toContain("users can read public share artifacts");
    expect(schema).toContain("users can upsert their own share artifacts");
    expect(schema).toContain("kickoff_share_artifacts_hash_idx");
    expect(schema).toContain("kickoff_share_artifacts_image_url_idx");
    expect(schema).toContain("insert into storage.buckets");
    expect(schema).toContain("kickoff-share-cards");
    expect(schema).toContain("public can read kickoff share card images");
    expect(schema).toContain("authenticated users can upload kickoff share card images");
  });

  it("documents backend health view and Supabase REST grants", () => {
    const schema = readFileSync(join(process.cwd(), "supabase.schema.sql"), "utf8");

    expect(schema).toContain("create or replace view public.kickoff_backend_health");
    expect(schema).toContain("'2026-07-03-cloud-v2'");
    expect(schema).toContain("missing_rls_tables");
    expect(schema).toContain("policy_count >= required_policy_count");
    expect(schema).toContain("grant select on public.kickoff_backend_health to anon, authenticated");
    expect(schema).toContain("grant insert, update, delete on public.kickoff_records to authenticated");
  });

  it("merges cloud history by keeping the richer capsule version", () => {
    const local = record("cap-merge");
    const cloud = record("cap-merge", {
      result: {
        id: "res-merge",
        capsuleId: "cap-merge",
        revealedAt: "2099-01-01T02:00:00.000Z",
        homeScore: 1,
        awayScore: 0,
        keyPlayers: [],
        source: "manual",
        totalScore: 91,
        breakdown: {
          winner: 24,
          exactScore: 24,
          goalDifference: 12,
          markets: 0,
          keyPlayer: 0,
          confidence: 10,
          reasoning: 5,
        },
        explanation: [],
        agentReview: [],
      },
    });

    const [merged] = mergeMemoryRecords([local], [cloud]);
    expect(merged.result?.totalScore).toBe(91);
  });

  it("does not replace a real local proof with a weaker cloud demo record", () => {
    const local = record("cap-proof", {
      capsule: {
        ...record("cap-proof").capsule,
        filecoinProof: {
          mode: "real",
          cid: "bafy-real",
          pieceCid: "piece-real",
          provider: "synapse",
          dataSetId: "dataset",
          proofStatus: "verified",
        },
      },
    });
    const cloud = record("cap-proof");

    const [merged] = mergeMemoryRecords([local], [cloud]);
    expect(merged.capsule.filecoinProof.mode).toBe("real");
    expect(merged.capsule.filecoinProof.cid).toBe("bafy-real");
  });

  it("merges cloud mode proof runs by keeping the richer scored version", () => {
    const local = modeRun("mode-merge", { status: "sealed" });
    const cloud = modeRun("mode-merge", {
      status: "scored",
      score: 88,
      artifact: {
        kind: "parlay-ticket",
        legs: [],
        settledLegs: 3,
        hitLegs: 2,
      },
    });

    const [merged] = mergeModeRuns([local], [cloud]);
    expect(merged.status).toBe("scored");
    expect(merged.score).toBe(88);
    expect(merged.artifact?.kind).toBe("parlay-ticket");
  });
});
