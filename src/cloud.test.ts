import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildLeaderboardScopeEvidence,
  buildLeaderboardReadiness,
  buildCloudSyncAudit,
  buildCloudSyncCoverage,
  buildCloudSyncOutbox,
  buildCloudRecoverySnapshot,
  buildLocalLeaderboard,
  buildPublicProfile,
  buildSupabaseOAuthUrl,
  buildSupabasePkceOAuthUrl,
  consumeSupabaseHash,
  cloudRecoveryMessage,
  friendCodeFor,
  isCloudReadbackComplete,
  isSupabaseSessionExpired,
  leaderboardScopeFilter,
  leaderboardTargetQuery,
  loadPublicProfile,
  loadSupabaseSession,
  mergeCloudProfile,
  mergeMemoryRecords,
  mergeModeRuns,
  mergeShareArtifacts,
  normalizeFriendCode,
  modeRunContentFingerprint,
  recordContentFingerprint,
  shareImageStoragePath,
  shareArtifactContentFingerprint,
  shouldAutoRecoverCloudSession,
} from "./cloud";
import type { CloudBackendHealth, CloudSyncState, GameModeRun, LeaderboardEntry, MemoryRecord, ShareArtifactEvidence, UserProfile } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

const stubBrowserStorage = (hash = "", search = "") => {
  const store = new Map<string, string>();
  let fakeWindow: {
    location: { hash: string; pathname: string; search: string };
    history: { replaceState: ReturnType<typeof vi.fn> };
  };
  fakeWindow = {
    location: {
      hash,
      pathname: "/kickoff-lock-agent/",
      search,
    },
    history: {
      replaceState: vi.fn((_state: unknown, _title: string, url?: string) => {
        fakeWindow.location.hash = "";
        if (url !== undefined) {
          const parsed = new URL(url, "https://example.com");
          fakeWindow.location.search = parsed.search;
        }
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

const productionPngBytes = () => {
  const bytes = new Uint8Array(10_050);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1200);
  view.setUint32(20, 675);
  return bytes;
};

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

  it("only auto-recovers cloud history when the saved session is usable or refreshable", () => {
    expect(
      shouldAutoRecoverCloudSession({
        configured: true,
        authenticated: true,
        mode: "supabase",
        status: "ready",
        message: "ready",
      }),
    ).toBe(true);
    expect(
      shouldAutoRecoverCloudSession({
        configured: true,
        authenticated: false,
        refreshable: true,
        sessionExpired: true,
        mode: "supabase",
        status: "offline",
        message: "refreshable",
      }),
    ).toBe(true);
    expect(
      shouldAutoRecoverCloudSession({
        configured: true,
        authenticated: false,
        refreshable: false,
        sessionExpired: true,
        mode: "supabase",
        status: "offline",
        message: "expired",
      }),
    ).toBe(false);
    expect(
      shouldAutoRecoverCloudSession({
        configured: false,
        authenticated: false,
        mode: "local",
        status: "offline",
        message: "local",
      }),
    ).toBe(false);
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

  it("clears corrupted Supabase session storage instead of keeping a broken account state", () => {
    stubBrowserStorage();
    localStorage.setItem("kickoff-lock-agent-supabase-session-v1", "{not-json");

    expect(loadSupabaseSession()).toBeUndefined();
    expect(localStorage.removeItem).toHaveBeenCalledWith("kickoff-lock-agent-supabase-session-v1");
  });

  it("clears rejected refresh tokens so the user can sign in again cleanly", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage();
    localStorage.setItem(
      "kickoff-lock-agent-supabase-session-v1",
      JSON.stringify({
        access_token: "expired-token",
        refresh_token: "bad-refresh",
        expires_at: Math.floor(Date.now() / 1000) - 10,
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 })),
    );
    const {
      getCloudState: getConfiguredCloudState,
      loadSupabaseSession: loadConfiguredSupabaseSession,
      refreshSupabaseSession: refreshConfiguredSupabaseSession,
    } = await import("./cloud");

    await expect(refreshConfiguredSupabaseSession()).rejects.toThrow("Session refresh failed: 401");

    expect(loadConfiguredSupabaseSession()).toBeUndefined();
    expect(getConfiguredCloudState()).toMatchObject({
      configured: true,
      authenticated: false,
      refreshable: false,
      sessionExpired: false,
    });
  });

  it("normalizes explicit friend leaderboard codes before falling back to location", () => {
    expect(normalizeFriendCode("  Chengdu Ultra League!! ")).toBe("chengdu-ultra-league");
    expect(friendCodeFor({ ...profile, friendCode: "World Cup Crew 26" })).toBe("world-cup-crew-26");
    expect(friendCodeFor({ ...profile, friendCode: "" })).toBe("chengdu");
  });

  it("merges a cloud profile back onto the local profile after cross-device recovery", () => {
    stubBrowserStorage();

    const merged = mergeCloudProfile(
      {
        ...profile,
        id: "user-123",
        email: "local@example.com",
        displayName: "Local Device Name",
        location: "Chengdu",
        friendCode: "chengdu",
        avatarUrl: "https://example.com/local.png",
        cloudMode: "supabase",
      },
      {
        ...profile,
        id: "user-123",
        email: "cloud@example.com",
        displayName: "Cloud Analyst",
        location: "成都",
        friendCode: "World Cup Crew 26",
        avatarUrl: undefined,
        cloudMode: "supabase",
      },
    );

    expect(merged.email).toBe("cloud@example.com");
    expect(merged.displayName).toBe("Cloud Analyst");
    expect(merged.location).toBe("成都");
    expect(merged.friendCode).toBe("world-cup-crew-26");
    expect(merged.avatarUrl).toBe("https://example.com/local.png");
    expect(merged.cloudMode).toBe("supabase");
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "kickoff-lock-agent-profile-v1",
      expect.stringContaining("Cloud Analyst"),
    );
  });

  it("builds a cross-device recovery snapshot before writing merged history back to cloud", () => {
    stubBrowserStorage();
    const localProfile = {
      ...profile,
      id: "user-123",
      email: "local@example.com",
      displayName: "Local Device",
      friendCode: "chengdu",
      cloudMode: "supabase" as const,
    };
    const remoteProfile = {
      ...profile,
      id: "user-123",
      email: "cloud@example.com",
      displayName: "Cloud Analyst",
      location: "成都",
      friendCode: "world-cup-crew",
      cloudMode: "supabase" as const,
    };
    const localRecord = record("cap-local");
    const staleLocalRecord = record("cap-shared");
    const richerCloudRecord = record("cap-shared", {
      result: {
        id: "result-cap-shared",
        capsuleId: "cap-shared",
        revealedAt: "2099-01-02T00:00:00.000Z",
        homeScore: 2,
        awayScore: 1,
        keyPlayers: [],
        source: "manual",
        totalScore: 81,
        breakdown: { winner: 30, exactScore: 25, goalDifference: 10, markets: 0, keyPlayer: 8, confidence: 8, reasoning: 0 },
        explanation: ["Cloud scored"],
        agentReview: ["Cloud review"],
      },
    });
    const localMode = modeRun("mode-local");
    const scoredCloudMode = modeRun("mode-shared", { status: "scored", score: 88 });
    const localShare = shareArtifact("cap-local", "record");
    const cloudShare = shareArtifact("cap-shared", "record", {
      xIntentUrl: "https://twitter.com/intent/tweet?text=Cloud",
      xIntentOpenedAt: "2099-01-01T00:01:00.000Z",
    });

    const snapshot = buildCloudRecoverySnapshot({
      localProfile,
      remoteProfile,
      localRecords: [localRecord, staleLocalRecord],
      remoteRecords: [richerCloudRecord],
      localModeRuns: [localMode],
      remoteModeRuns: [scoredCloudMode],
      localShareArtifacts: [localShare],
      remoteShareArtifacts: [cloudShare],
    });

    expect(snapshot.profile).toMatchObject({
      email: "cloud@example.com",
      displayName: "Cloud Analyst",
      location: "成都",
      friendCode: "world-cup-crew",
      cloudMode: "supabase",
    });
    expect(snapshot.records.map((item) => item.capsule.id).sort()).toEqual(["cap-local", "cap-shared"]);
    expect(snapshot.records.find((item) => item.capsule.id === "cap-shared")?.result?.totalScore).toBe(81);
    expect(snapshot.modeRuns.map((item) => item.id).sort()).toEqual(["mode-local", "mode-shared"]);
    expect(snapshot.modeRuns.find((item) => item.id === "mode-shared")).toMatchObject({ status: "scored", score: 88 });
    expect(snapshot.shareArtifacts.map((item) => `${item.kind}:${item.id}`).sort()).toEqual([
      "record:cap-local",
      "record:cap-shared",
    ]);
    expect(snapshot).toMatchObject({
      remoteRecordCount: 1,
      remoteModeRunCount: 1,
      remoteShareArtifactCount: 1,
      hasRemoteHistory: true,
    });
    expect(cloudRecoveryMessage("Session restored.", snapshot)).toBe(
      "Session restored. merged 1 cloud records, 1 mode proof runs and 1 share manifests.",
    );
  });

  it("keeps local history ready to sync when a signed-in account has no remote rows yet", () => {
    const snapshot = buildCloudRecoverySnapshot({
      localProfile: profile,
      remoteProfile: undefined,
      localRecords: [record("cap-local")],
      remoteRecords: [],
      localModeRuns: [modeRun("mode-local")],
      remoteModeRuns: [],
      localShareArtifacts: [shareArtifact("cap-local", "record")],
      remoteShareArtifacts: [],
    });

    expect(snapshot.hasRemoteHistory).toBe(false);
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.modeRuns).toHaveLength(1);
    expect(snapshot.shareArtifacts).toHaveLength(1);
    expect(cloudRecoveryMessage("Signed in.", snapshot)).toBe(
      "Signed in. no cloud history found; local records, mode runs and share manifests are ready to sync.",
    );
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

  it("builds and stores a Supabase Google PKCE OAuth request", async () => {
    stubBrowserStorage();

    const request = await buildSupabasePkceOAuthUrl(
      "google",
      "https://example.com/kickoff-lock-agent/",
      "https://project.supabase.co",
    );
    const url = new URL(request.url);
    const savedPkce = JSON.parse(
      String(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.find(
          ([key]) => key === "kickoff-lock-agent-supabase-pkce-v1",
        )?.[1],
      ),
    );

    expect(url.pathname).toBe("/auth/v1/authorize");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe("https://example.com/kickoff-lock-agent/");
    expect(url.searchParams.get("code_challenge")).toBe(request.codeChallenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    expect(url.searchParams.get("state")).toBe(request.state);
    expect(savedPkce).toMatchObject({
      codeVerifier: request.codeVerifier,
      state: request.state,
      redirectTo: "https://example.com/kickoff-lock-agent/",
    });
  });

  it("coalesces concurrent Supabase session refreshes into one token request", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage();
    localStorage.setItem(
      "kickoff-lock-agent-supabase-session-v1",
      JSON.stringify({
        access_token: "expired-token",
        refresh_token: "refresh-token",
        expires_at: Math.floor(Date.now() / 1000) - 30,
      }),
    );
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify({
                  access_token: "fresh-token",
                  refresh_token: "rotated-refresh-token",
                  expires_in: 3600,
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }, 5);
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const { refreshSupabaseSession: refreshConfiguredSupabaseSession } = await import("./cloud");

    const [first, second] = await Promise.all([
      refreshConfiguredSupabaseSession(),
      refreshConfiguredSupabaseSession(),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first?.access_token).toBe("fresh-token");
    expect(second?.access_token).toBe("fresh-token");
    expect(loadSupabaseSession()?.refresh_token).toBe("rotated-refresh-token");
  });

  it("exchanges a Supabase PKCE callback code, stores the session and clears auth params", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    const fakeWindow = stubBrowserStorage("", "?code=auth-code&state=state-123&proof=cap-1");
    localStorage.setItem(
      "kickoff-lock-agent-supabase-pkce-v1",
      JSON.stringify({
        codeVerifier: "verifier-123",
        state: "state-123",
        redirectTo: "https://example.com/kickoff-lock-agent/",
        createdAt: Date.now(),
      }),
    );
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          access_token: "session-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const {
      consumeSupabaseAuthCallback: consumeConfiguredAuthCallback,
      loadSupabaseSession: loadConfiguredSupabaseSession,
    } = await import("./cloud");

    const session = await consumeConfiguredAuthCallback();
    const [, init] = fetcher.mock.calls[0] as [RequestInfo | URL, RequestInit];

    expect(String(fetcher.mock.calls[0][0])).toBe("https://project.supabase.co/auth/v1/token?grant_type=pkce");
    expect(JSON.parse(String(init.body))).toEqual({
      auth_code: "auth-code",
      code_verifier: "verifier-123",
    });
    expect(session?.access_token).toBe("session-token");
    expect(loadConfiguredSupabaseSession()?.refresh_token).toBe("refresh-token");
    expect(fakeWindow.location.search).toBe("?proof=cap-1");
    expect(localStorage.removeItem).toHaveBeenCalledWith("kickoff-lock-agent-supabase-pkce-v1");
  });

  it("rejects Supabase PKCE callbacks with a mismatched OAuth state", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("", "?code=auth-code&state=attacker-state");
    localStorage.setItem(
      "kickoff-lock-agent-supabase-pkce-v1",
      JSON.stringify({
        codeVerifier: "verifier-123",
        state: "state-123",
        redirectTo: "https://example.com/kickoff-lock-agent/",
        createdAt: Date.now(),
      }),
    );
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const { consumeSupabaseAuthCallback: consumeConfiguredAuthCallback } = await import("./cloud");

    await expect(consumeConfiguredAuthCallback()).rejects.toThrow("Supabase OAuth state mismatch");
    expect(fetcher).not.toHaveBeenCalled();
    expect(localStorage.removeItem).toHaveBeenCalledWith("kickoff-lock-agent-supabase-pkce-v1");
  });

  it("rejects Supabase PKCE callbacks that omit the OAuth state", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("", "?code=auth-code");
    localStorage.setItem(
      "kickoff-lock-agent-supabase-pkce-v1",
      JSON.stringify({
        codeVerifier: "verifier-123",
        state: "state-123",
        redirectTo: "https://example.com/kickoff-lock-agent/",
        createdAt: Date.now(),
      }),
    );
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const {
      consumeSupabaseAuthCallback: consumeConfiguredAuthCallback,
      loadSupabaseSession: loadConfiguredSupabaseSession,
    } = await import("./cloud");

    await expect(consumeConfiguredAuthCallback()).rejects.toThrow("Supabase OAuth state mismatch");
    expect(fetcher).not.toHaveBeenCalled();
    expect(loadConfiguredSupabaseSession()).toBeUndefined();
    expect(localStorage.removeItem).toHaveBeenCalledWith("kickoff-lock-agent-supabase-pkce-v1");
  });

  it("rejects expired Supabase PKCE callbacks before token exchange", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("", "?code=auth-code&state=state-123");
    localStorage.setItem(
      "kickoff-lock-agent-supabase-pkce-v1",
      JSON.stringify({
        codeVerifier: "verifier-123",
        state: "state-123",
        redirectTo: "https://example.com/kickoff-lock-agent/",
        createdAt: Date.now() - 16 * 60 * 1000,
      }),
    );
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const {
      consumeSupabaseAuthCallback: consumeConfiguredAuthCallback,
      loadSupabaseSession: loadConfiguredSupabaseSession,
    } = await import("./cloud");

    await expect(consumeConfiguredAuthCallback()).rejects.toThrow("Supabase PKCE verifier missing");
    expect(fetcher).not.toHaveBeenCalled();
    expect(loadConfiguredSupabaseSession()).toBeUndefined();
    expect(localStorage.removeItem).toHaveBeenCalledWith("kickoff-lock-agent-supabase-pkce-v1");
  });

  it("clears pending PKCE requests when signing out", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage();
    localStorage.setItem(
      "kickoff-lock-agent-supabase-session-v1",
      JSON.stringify({ access_token: "session-token", refresh_token: "refresh-token" }),
    );
    localStorage.setItem(
      "kickoff-lock-agent-supabase-pkce-v1",
      JSON.stringify({
        codeVerifier: "verifier-123",
        state: "state-123",
        redirectTo: "https://example.com/kickoff-lock-agent/",
        createdAt: Date.now(),
      }),
    );
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const { signOutCloud: signOutConfiguredCloud } = await import("./cloud");

    await signOutConfiguredCloud();

    expect(String(fetcher.mock.calls[0][0])).toBe("https://project.supabase.co/auth/v1/logout");
    expect(localStorage.removeItem).toHaveBeenCalledWith("kickoff-lock-agent-supabase-session-v1");
    expect(localStorage.removeItem).toHaveBeenCalledWith("kickoff-lock-agent-supabase-pkce-v1");
  });

  it("sends Supabase magic links with a trimmed email and explicit redirect target", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("VITE_SUPABASE_REDIRECT_URL", "https://app.example.com/kickoff-lock-agent/");
    vi.resetModules();
    stubBrowserStorage();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const { sendMagicLink: sendConfiguredMagicLink } = await import("./cloud");

    const result = await sendConfiguredMagicLink("  fan@example.com  ");
    const [, init] = fetcher.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(result).toEqual({
      email: "fan@example.com",
      redirectTo: "https://app.example.com/kickoff-lock-agent/",
    });
    expect(String(fetcher.mock.calls[0][0])).toBe("https://project.supabase.co/auth/v1/otp");
    expect(init.method).toBe("POST");
    expect(body).toMatchObject({
      email: "fan@example.com",
      create_user: true,
      options: { email_redirect_to: "https://app.example.com/kickoff-lock-agent/" },
    });
  });

  it("loads public proof rows from runtime Supabase config without rebuild-time env", async () => {
    vi.resetModules();
    const fakeWindow = stubBrowserStorage();
    (fakeWindow as any).__KICKOFF_RUNTIME_CONFIG__ = {
      VITE_SUPABASE_URL: "https://runtime-project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "runtime-anon",
      VITE_SUPABASE_SHARE_BUCKET: "runtime-share-cards",
    };
    localStorage.setItem(
      "kickoff-lock-agent-supabase-session-v1",
      JSON.stringify({ access_token: "private-user-token", refresh_token: "refresh-token" }),
    );
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("https://runtime-project.supabase.co/rest/v1/kickoff_records");
      expect((init?.headers as Record<string, string>).apikey).toBe("runtime-anon");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer runtime-anon");
      return new Response(
        JSON.stringify([
          {
            capsule: record("cap-runtime").capsule,
            result: record("cap-runtime").result,
            seal_job: null,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const {
      loadPublicRecord: loadRuntimePublicRecord,
      publicShareImageUrl: runtimePublicShareImageUrl,
    } = await import("./cloud");

    const runtimeRecord = await loadRuntimePublicRecord("cap-runtime");

    expect(runtimeRecord?.capsule.id).toBe("cap-runtime");
    expect(runtimePublicShareImageUrl("user-1/record/card.png")).toBe(
      "https://runtime-project.supabase.co/storage/v1/object/public/runtime-share-cards/user-1/record/card.png",
    );
  });

  it("rejects invalid magic link emails before calling Supabase", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const { sendMagicLink: sendConfiguredMagicLink } = await import("./cloud");

    await expect(sendConfiguredMagicLink("not-an-email")).rejects.toThrow("Enter a valid email address");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads private cloud history by auth user id when local profile id differs", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("#access_token=session-token&refresh_token=refresh-token&expires_in=120");
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({
              id: "auth-user-123",
              email: "signed-in@example.com",
              user_metadata: { name: "Signed In" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_profiles")) {
          if (url.includes("id=eq.auth-user-123")) {
            return new Response(
              JSON.stringify([
                {
                  id: "auth-user-123",
                  email: "signed-in@example.com",
                  display_name: "Cloud Analyst",
                  location: "Chengdu",
                  friend_code: "chengdu",
                  updated_at: "2099-01-01T00:00:00.000Z",
                },
              ]),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify([
              {
                id: "stale-email-profile",
                email: "signed-in@example.com",
                display_name: "Stale Email Match",
                location: "Old Device",
                friend_code: "old-device",
                updated_at: "2100-01-01T00:00:00.000Z",
              },
              {
                id: "auth-user-123",
                email: "signed-in@example.com",
                display_name: "Cloud Analyst",
                location: "Chengdu",
                friend_code: "chengdu",
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_records")) {
          return new Response(
            JSON.stringify([
              {
                capsule: record("cap-auth").capsule,
                result: record("cap-auth").result,
                seal_job: null,
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_mode_runs") || url.includes("kickoff_share_artifacts")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const {
      consumeSupabaseHash: consumeHash,
      loadProfileFromCloud: loadConfiguredProfileFromCloud,
      loadRecordsFromCloud: loadConfiguredRecordsFromCloud,
      loadModeRunsFromCloud: loadConfiguredModeRunsFromCloud,
      loadShareArtifactsFromCloud: loadConfiguredShareArtifactsFromCloud,
    } = await import("./cloud");
    consumeHash();
    const cleanSessionProfile = {
      ...profile,
      id: "local-device-profile",
      email: "signed-in@example.com",
      cloudMode: "supabase" as const,
    };

    const [remoteProfile, remoteRecords] = await Promise.all([
      loadConfiguredProfileFromCloud(cleanSessionProfile),
      loadConfiguredRecordsFromCloud(cleanSessionProfile),
      loadConfiguredModeRunsFromCloud(cleanSessionProfile),
      loadConfiguredShareArtifactsFromCloud(cleanSessionProfile),
    ]);
    const profileQuery = decodeURIComponent(requests.find((url) => url.includes("kickoff_profiles")) ?? "");
    const recordQuery = decodeURIComponent(requests.find((url) => url.includes("kickoff_records")) ?? "");
    const modeQuery = decodeURIComponent(requests.find((url) => url.includes("kickoff_mode_runs")) ?? "");
    const shareQuery = decodeURIComponent(requests.find((url) => url.includes("kickoff_share_artifacts")) ?? "");

    expect(remoteProfile?.id).toBe("auth-user-123");
    expect(remoteProfile?.displayName).toBe("Cloud Analyst");
    expect(remoteRecords[0]?.capsule.id).toBe("cap-auth");
    expect(profileQuery).toContain("id=eq.auth-user-123");
    expect(profileQuery).not.toContain("stale-email-profile");
    expect(profileQuery).not.toContain("email.eq.signed-in@example.com");
    expect(recordQuery).toContain("or=(user_id.eq.auth-user-123)");
    expect(recordQuery).not.toContain("user_id.eq.local-device-profile");
    expect(recordQuery).not.toContain("email.eq.signed-in@example.com");
    expect(modeQuery).toContain("or=(user_id.eq.auth-user-123)");
    expect(modeQuery).not.toContain("user_id.eq.local-device-profile");
    expect(modeQuery).not.toContain("email.eq.signed-in@example.com");
    expect(shareQuery).toContain("or=(user_id.eq.auth-user-123)");
    expect(shareQuery).not.toContain("user_id.eq.local-device-profile");
    expect(shareQuery).not.toContain("email.eq.signed-in@example.com");
  });

  it("falls back to local profile id without using email when the Auth user cannot be read", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("#access_token=session-token&refresh_token=refresh-token&expires_in=120");
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.includes("/auth/v1/user")) {
          return new Response(JSON.stringify({ error: "expired" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("kickoff_records")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    const {
      consumeSupabaseHash: consumeHash,
      loadRecordsFromCloud: loadConfiguredRecordsFromCloud,
    } = await import("./cloud");
    consumeHash();

    await loadConfiguredRecordsFromCloud({
      ...profile,
      id: "local-device-profile",
      email: "signed-in@example.com",
      cloudMode: "supabase",
    });

    const recordQuery = decodeURIComponent(requests.find((url) => url.includes("kickoff_records")) ?? "");
    expect(recordQuery).toContain("or=(user_id.eq.local-device-profile)");
    expect(recordQuery).not.toContain("email.eq.signed-in@example.com");
  });

  it("upserts cloud profiles with auth identity and normalized friend code", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("#access_token=session-token&refresh_token=refresh-token&expires_in=120");
    const profileRows: any[] = [];
    const calls: Array<{ url: string; method?: string; authorization?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({
          url,
          method: init?.method,
          authorization: (init?.headers as Record<string, string> | undefined)?.Authorization,
        });
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({
              id: "auth-user-123",
              email: "signed-in@example.com",
              user_metadata: { name: "Signed In" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_profiles")) {
          profileRows.push(JSON.parse(String(init?.body)));
          return new Response("{}", {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const {
      consumeSupabaseHash: consumeHash,
      syncProfileToCloud: syncConfiguredProfileToCloud,
    } = await import("./cloud");

    consumeHash();
    await syncConfiguredProfileToCloud({
      ...profile,
      id: "local-device-profile",
      email: "local@example.com",
      displayName: "Cloud Analyst",
      location: "Chengdu",
      friendCode: "World Cup Crew 26",
      avatarUrl: "https://example.com/avatar.png",
      cloudMode: "supabase",
    });

    expect(profileRows).toHaveLength(1);
    expect(profileRows[0]).toMatchObject({
      id: "auth-user-123",
      email: "signed-in@example.com",
      display_name: "Cloud Analyst",
      location: "Chengdu",
      avatar_url: "https://example.com/avatar.png",
      friend_code: "world-cup-crew-26",
    });
    expect(calls.find((call) => call.url.includes("kickoff_profiles"))).toMatchObject({
      method: "POST",
      authorization: "Bearer session-token",
    });
  });

  it("flushes the cloud outbox profile row even when local history is empty", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("#access_token=session-token&refresh_token=refresh-token&expires_in=120");
    const profileRows: any[] = [];
    const tableCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({
              id: "auth-user-profile-only",
              email: "signed-in@example.com",
              user_metadata: { name: "Signed In" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/rest/v1/")) {
          tableCalls.push(url);
        }
        if (url.includes("kickoff_profiles")) {
          profileRows.push(JSON.parse(String(init?.body)));
          return new Response("{}", {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const {
      consumeSupabaseHash: consumeHash,
      syncCloudOutboxToCloud: syncConfiguredCloudOutboxToCloud,
    } = await import("./cloud");

    consumeHash();
    const result = await syncConfiguredCloudOutboxToCloud(
      {
        ...profile,
        id: "local-profile-only",
        email: "local@example.com",
        displayName: "Profile Only Analyst",
        location: "Chengdu",
        friendCode: "Cross Device Crew",
        cloudMode: "supabase",
      },
      [],
      [],
      [],
    );

    expect(result).toMatchObject({
      status: "synced",
      profile: {
        id: "auth-user-profile-only",
        email: "signed-in@example.com",
        displayName: "Profile Only Analyst",
        location: "Chengdu",
        friendCode: "Cross Device Crew",
      },
    });
    expect(profileRows).toHaveLength(1);
    expect(profileRows[0]).toMatchObject({
      id: "auth-user-profile-only",
      email: "signed-in@example.com",
      display_name: "Profile Only Analyst",
      location: "Chengdu",
      friend_code: "cross-device-crew",
    });
    expect(tableCalls.filter((url) => url.includes("kickoff_records"))).toHaveLength(0);
    expect(tableCalls.filter((url) => url.includes("kickoff_mode_runs"))).toHaveLength(0);
    expect(tableCalls.filter((url) => url.includes("kickoff_share_artifacts"))).toHaveLength(0);
  });

  it("flushes a full cloud outbox with one profile upsert shared by history tables", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("#access_token=session-token&refresh_token=refresh-token&expires_in=120");
    const rows: Record<string, any[]> = {
      kickoff_profiles: [],
      kickoff_records: [],
      kickoff_mode_runs: [],
      kickoff_share_artifacts: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({
              id: "auth-user-full-outbox",
              email: "signed-in@example.com",
              user_metadata: { name: "Signed In" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        for (const table of Object.keys(rows)) {
          if (url.includes(table)) {
            const parsed = JSON.parse(String(init?.body));
            rows[table]!.push(...(Array.isArray(parsed) ? parsed : [parsed]));
            return new Response("{}", {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const {
      consumeSupabaseHash: consumeHash,
      syncCloudOutboxToCloud: syncConfiguredCloudOutboxToCloud,
    } = await import("./cloud");

    consumeHash();
    const result = await syncConfiguredCloudOutboxToCloud(
      {
        ...profile,
        id: "local-full-outbox",
        email: "local@example.com",
        displayName: "Full Outbox Analyst",
        friendCode: "Full Crew",
        cloudMode: "supabase",
      },
      [record("cap-full-outbox")],
      [modeRun("mode-full-outbox")],
      [shareArtifact("cap-full-outbox", "record")],
    );

    expect(result.status).toBe("synced");
    expect(rows.kickoff_profiles).toHaveLength(1);
    expect(rows.kickoff_profiles[0]).toMatchObject({
      id: "auth-user-full-outbox",
      email: "signed-in@example.com",
      display_name: "Full Outbox Analyst",
      friend_code: "full-crew",
    });
    expect(rows.kickoff_records).toHaveLength(1);
    expect(rows.kickoff_mode_runs).toHaveLength(1);
    expect(rows.kickoff_share_artifacts).toHaveLength(1);
    expect(rows.kickoff_records[0]).toMatchObject({
      id: "cap-full-outbox",
      user_id: "auth-user-full-outbox",
      email: "signed-in@example.com",
      friend_code: "full-crew",
    });
    expect(rows.kickoff_mode_runs[0]).toMatchObject({
      id: "mode-full-outbox",
      user_id: "auth-user-full-outbox",
      email: "signed-in@example.com",
      friend_code: "full-crew",
    });
    expect(rows.kickoff_share_artifacts[0]).toMatchObject({
      id: "cap-full-outbox",
      kind: "record",
      user_id: "auth-user-full-outbox",
      email: "signed-in@example.com",
      friend_code: "full-crew",
    });
  });

  it("resolves the authenticated cloud profile before syncing without overwriting local profile edits", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("#access_token=session-token&refresh_token=refresh-token&expires_in=120");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({
              id: "auth-user-123",
              email: "signed-in@example.com",
              user_metadata: { name: "Provider Name", avatar_url: "https://example.com/avatar.png" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    const {
      consumeSupabaseHash: consumeHash,
      resolveCloudProfileForSync: resolveConfiguredCloudProfileForSync,
    } = await import("./cloud");

    consumeHash();
    const cloudProfile = await resolveConfiguredCloudProfileForSync({
      ...profile,
      id: "local-device-profile",
      email: "local@example.com",
      displayName: "Edited Analyst",
      location: "Chengdu",
      friendCode: "World Cup Crew 26",
      cloudMode: "supabase",
    });

    expect(cloudProfile).toMatchObject({
      id: "auth-user-123",
      email: "signed-in@example.com",
      displayName: "Edited Analyst",
      location: "Chengdu",
      friendCode: "World Cup Crew 26",
      avatarUrl: "https://example.com/avatar.png",
      cloudMode: "supabase",
    });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "kickoff-lock-agent-profile-v1",
      expect.stringContaining("auth-user-123"),
    );
  });

  it("writes prediction records under the authenticated cloud profile id", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage("#access_token=session-token&refresh_token=refresh-token&expires_in=120");
    const recordRows: any[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({
              id: "auth-user-123",
              email: "signed-in@example.com",
              user_metadata: { name: "Provider Name" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_profiles")) {
          return new Response("{}", { status: 201, headers: { "Content-Type": "application/json" } });
        }
        if (url.includes("kickoff_records")) {
          recordRows.push(...JSON.parse(String(init?.body)));
          return new Response("{}", { status: 201, headers: { "Content-Type": "application/json" } });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const {
      consumeSupabaseHash: consumeHash,
      syncRecordsToCloud: syncConfiguredRecordsToCloud,
    } = await import("./cloud");

    consumeHash();
    const result = await syncConfiguredRecordsToCloud(
      {
        ...profile,
        id: "local-device-profile",
        email: "local@example.com",
        displayName: "Edited Analyst",
        friendCode: "World Cup Crew 26",
        cloudMode: "supabase",
      },
      [record("cap-cloud-id")],
    );

    expect(result.status).toBe("synced");
    expect(recordRows).toHaveLength(1);
    expect(recordRows[0]).toMatchObject({
      id: "cap-cloud-id",
      user_id: "auth-user-123",
      email: "signed-in@example.com",
      display_name: "Edited Analyst",
      friend_code: "world-cup-crew-26",
    });
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

  it("keeps every local account artifact in the sync outbox until Supabase is configured", () => {
    const cloudState: CloudSyncState = {
      configured: false,
      authenticated: false,
      mode: "local",
      status: "offline",
      message: "local",
    };

    const outbox = buildCloudSyncOutbox(
      cloudState,
      profile,
      [record("cap-outbox")],
      [modeRun("mode-outbox")],
      [shareArtifact("cap-outbox", "record")],
    );

    expect(outbox.find((item) => item.key === "profile")).toMatchObject({
      status: "blocked",
      queued: 1,
      total: 1,
    });
    expect(outbox.find((item) => item.key === "records")).toMatchObject({
      status: "blocked",
      queued: 1,
      total: 1,
    });
    expect(outbox.find((item) => item.key === "modeRuns")).toMatchObject({
      status: "blocked",
      queued: 1,
      total: 1,
    });
    expect(outbox.find((item) => item.key === "shareArtifacts")).toMatchObject({
      status: "blocked",
      queued: 1,
      total: 1,
    });
    expect(outbox.find((item) => item.key === "publicProofs")).toMatchObject({
      status: "blocked",
      queued: 2,
      total: 2,
    });
    expect(outbox.find((item) => item.key === "records")?.detail).toContain("cap-outbox");
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
        profileIdentity: {
          id: profile.id,
          email: profile.email,
          displayName: profile.displayName,
          location: profile.location,
          friendCode: "chengdu",
        },
        profileIdentityProblems: [],
        records: 1,
        modeRuns: 1,
        publicProofs: 2,
        shareArtifacts: 1,
        publicShareImages: 1,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        expectedShareArtifacts: 1,
      recordIds: ["cap-synced"],
      modeRunIds: ["mode-synced"],
      publicProofIds: ["record:cap-synced", "mode:mode-synced"],
      publicProofContentIds: ["record:cap-synced", "mode:mode-synced"],
      shareArtifactIds: ["record:cap-synced"],
        publicShareImageIds: ["record:cap-synced"],
        recordContentIds: ["cap-synced"],
        modeRunContentIds: ["mode-synced"],
        shareArtifactContentIds: ["record:cap-synced"],
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

  it("clears the sync outbox only after profile, fingerprints and public proof links read back", () => {
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
        profileIdentity: {
          id: profile.id,
          email: profile.email,
          displayName: profile.displayName,
          location: profile.location,
          friendCode: "chengdu",
        },
        profileIdentityProblems: [],
        records: 1,
        modeRuns: 1,
        publicProofs: 2,
        shareArtifacts: 1,
        publicShareImages: 1,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        expectedShareArtifacts: 1,
        recordIds: ["cap-outbox-synced"],
        modeRunIds: ["mode-outbox-synced"],
        publicProofIds: ["record:cap-outbox-synced", "mode:mode-outbox-synced"],
        publicProofContentIds: ["record:cap-outbox-synced", "mode:mode-outbox-synced"],
        shareArtifactIds: ["record:cap-outbox-synced"],
        publicShareImageIds: ["record:cap-outbox-synced"],
        recordContentIds: ["cap-outbox-synced"],
        modeRunContentIds: ["mode-outbox-synced"],
        shareArtifactContentIds: ["record:cap-outbox-synced"],
        publicProfileRecordIds: ["cap-outbox-synced"],
        publicProfileModeRunIds: ["mode-outbox-synced"],
        publicProfileShareArtifactIds: ["record:cap-outbox-synced"],
        message: "Cloud read-back verified.",
      },
    };

    const outbox = buildCloudSyncOutbox(
      cloudState,
      profile,
      [record("cap-outbox-synced")],
      [modeRun("mode-outbox-synced")],
      [shareArtifact("cap-outbox-synced", "record")],
    );

    expect(outbox.every((item) => item.status === "verified")).toBe(true);
    expect(outbox.reduce((queued, item) => queued + item.queued, 0)).toBe(0);
  });

  it("uses the strict cloud read-back helper for account sync completion", () => {
    const completeVerification = {
      checkedAt: "2099-01-01T00:00:00.000Z",
      backendHealth: backendHealth(),
      profile: true,
      profileIdentity: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        location: profile.location,
        friendCode: "chengdu",
      },
      profileIdentityProblems: [],
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
      publicProfileRecordContentIds: ["cap-synced"],
      publicProfileModeRunContentIds: ["mode-synced"],
      publicProfileShareArtifactContentIds: ["record:cap-synced"],
      message: "Cloud read-back verified.",
    };

    expect(isCloudReadbackComplete(completeVerification, 1, 1, 1)).toBe(true);
    expect(isCloudReadbackComplete({ ...completeVerification, publicShareImages: 0 }, 1, 1, 1)).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, recordContentIds: [] }, 1, 1, 1)).toBe(false);
    expect(
      isCloudReadbackComplete({ ...completeVerification, publicProofContentIds: [] }, 1, 1, 1, {
        recordIds: ["cap-synced"],
        modeRunIds: ["mode-synced"],
        shareArtifactIds: ["record:cap-synced"],
      }),
    ).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, publicProfileRecordIds: [] }, 1, 1, 1)).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, publicProfileRecordContentIds: [] }, 1, 1, 1)).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, publicProfileModeRunContentIds: [] }, 1, 1, 1)).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, publicProfileShareArtifactContentIds: [] }, 1, 1, 1)).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, backendHealth: backendHealth({ ready: false }) }, 1, 1, 1)).toBe(false);
    expect(isCloudReadbackComplete({ ...completeVerification, profileIdentity: undefined }, 1, 1, 1)).toBe(false);
    expect(
      isCloudReadbackComplete(
        {
          ...completeVerification,
          profileIdentityProblems: ["email mismatch"],
        },
        1,
        1,
        1,
      ),
    ).toBe(false);
  });

  it("does not pass account sync coverage when read-back counts match stale target ids", () => {
    const staleVerification = {
      checkedAt: "2099-01-01T00:00:00.000Z",
      backendHealth: backendHealth(),
      profile: true,
      profileIdentity: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        location: profile.location,
        friendCode: "chengdu",
      },
      profileIdentityProblems: [],
      records: 1,
      modeRuns: 1,
      publicProofs: 2,
      shareArtifacts: 1,
      publicShareImages: 1,
      publicProfile: true,
      expectedRecords: 1,
      expectedModeRuns: 1,
      expectedShareArtifacts: 1,
      recordIds: ["cap-old"],
      modeRunIds: ["mode-old"],
      publicProofIds: ["record:cap-old", "mode:mode-old"],
      publicProofContentIds: ["record:cap-old", "mode:mode-old"],
      shareArtifactIds: ["record:cap-old"],
      publicShareImageIds: ["record:cap-old"],
      recordContentIds: ["cap-old"],
      modeRunContentIds: ["mode-old"],
      shareArtifactContentIds: ["record:cap-old"],
      publicProfileRecordIds: ["cap-old"],
      publicProfileModeRunIds: ["mode-old"],
      publicProfileShareArtifactIds: ["record:cap-old"],
      message: "Counts match stale targets.",
    };
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: staleVerification,
    };

    expect(isCloudReadbackComplete(staleVerification, 1, 1, 1)).toBe(true);
    expect(
      isCloudReadbackComplete(staleVerification, 1, 1, 1, {
        recordIds: ["cap-current"],
        modeRunIds: ["mode-current"],
        shareArtifactIds: ["record:cap-current"],
      }),
    ).toBe(false);

    const coverage = buildCloudSyncCoverage(
      cloudState,
      [record("cap-current")],
      [modeRun("mode-current")],
      [shareArtifact("cap-current", "record")],
    );
    expect(coverage.passed).toBe(false);
    expect(coverage.pendingItems).toBe(3);
    expect(coverage.detail).toContain("pending cloud acknowledgement");
  });

  it("fingerprints full record proof content, not just the row id", () => {
    const base = record("cap-proof");
    const sameContentWithDifferentKeyOrder = record("cap-proof", {
      capsule: {
        ...base.capsule,
        prediction: {
          markets: base.capsule.prediction.markets,
          agentSummary: base.capsule.prediction.agentSummary,
          reasoning: base.capsule.prediction.reasoning,
          style: base.capsule.prediction.style,
          confidence: base.capsule.prediction.confidence,
          keyPlayers: base.capsule.prediction.keyPlayers,
          winner: base.capsule.prediction.winner,
          awayScore: base.capsule.prediction.awayScore,
          homeScore: base.capsule.prediction.homeScore,
        },
      },
    });
    const changedPrediction = record("cap-proof", {
      capsule: {
        ...base.capsule,
        prediction: {
          ...base.capsule.prediction,
          reasoning: "Tampered reasoning after lock",
        },
      },
    });
    const changedScore = record("cap-proof", {
      result: {
        id: "result-cap-proof",
        capsuleId: "cap-proof",
        revealedAt: "2099-01-02T00:00:00.000Z",
        homeScore: 1,
        awayScore: 0,
        keyPlayers: [],
        source: "manual",
        totalScore: 91,
        breakdown: {
          winner: 20,
          exactScore: 25,
          goalDifference: 15,
          markets: 10,
          keyPlayer: 5,
          confidence: 8,
          reasoning: 8,
        },
        explanation: ["Scored"],
        agentReview: ["Review"],
      },
    });

    expect(recordContentFingerprint(sameContentWithDifferentKeyOrder)).toBe(recordContentFingerprint(base));
    expect(recordContentFingerprint(changedPrediction)).not.toBe(recordContentFingerprint(base));
    expect(recordContentFingerprint(changedScore)).not.toBe(recordContentFingerprint(base));
  });

  it("fingerprints mode proof status, score and artifact content", () => {
    const base = modeRun("mode-proof", {
      status: "scored",
      score: 77,
      artifact: {
        kind: "parlay-ticket",
        legs: [
          {
            capsuleId: "cap-1",
            matchLabel: "A vs B",
            pick: "A wins",
            confidence: 62,
            markets: [],
            resultScore: 30,
            winnerHit: true,
          },
        ],
        settledLegs: 1,
        hitLegs: 1,
      },
    });
    const changedScore = modeRun("mode-proof", { ...base, score: 76 });
    const changedArtifact = modeRun("mode-proof", {
      ...base,
      artifact: {
        kind: "parlay-ticket",
        legs: [
          {
            capsuleId: "cap-1",
            matchLabel: "A vs B",
            pick: "B wins",
            confidence: 62,
            markets: [],
            resultScore: 0,
            winnerHit: false,
          },
        ],
        settledLegs: 1,
        hitLegs: 0,
      },
    });

    expect(modeRunContentFingerprint(changedScore)).not.toBe(modeRunContentFingerprint(base));
    expect(modeRunContentFingerprint(changedArtifact)).not.toBe(modeRunContentFingerprint(base));
  });

  it("fingerprints share image metadata and exact share-channel evidence", () => {
    const base = shareArtifact("cap-share", "record", {
      xIntentUrl: "https://twitter.com/intent/tweet?text=Kickoff",
      xIntentOpenedAt: "2099-01-01T00:01:00.000Z",
    });
    const changedMime = shareArtifact("cap-share", "record", {
      ...base,
      imageMime: "image/webp",
    });
    const changedXOpenedAt = shareArtifact("cap-share", "record", {
      ...base,
      xIntentOpenedAt: "2099-01-01T00:02:00.000Z",
    });
    const changedNativeOpenedAt = shareArtifact("cap-share", "record", {
      ...base,
      nativeShareOpenedAt: "2099-01-01T00:03:00.000Z",
    });

    expect(shareArtifactContentFingerprint(changedMime)).not.toBe(shareArtifactContentFingerprint(base));
    expect(shareArtifactContentFingerprint(changedXOpenedAt)).not.toBe(shareArtifactContentFingerprint(base));
    expect(shareArtifactContentFingerprint(changedNativeOpenedAt)).not.toBe(shareArtifactContentFingerprint(base));
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

  it("does not accept backend health rows that omit schema columns or storage readiness", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              schema_version: "2026-07-04-cloud-v3",
              checked_at: "2099-01-01T00:00:00.000Z",
              ready: true,
              missing_tables: [],
              missing_views: [],
              missing_rls_tables: [],
              missing_columns: ["kickoff_share_artifacts.image_url"],
              missing_view_columns: [],
              policy_count: 8,
              required_policy_count: 8,
              storage_bucket_public: false,
              storage_policy_count: 2,
              required_storage_policy_count: 3,
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { loadCloudBackendHealth: loadConfiguredBackendHealth } = await import("./cloud");

    const health = await loadConfiguredBackendHealth();

    expect(health.ready).toBe(false);
    expect(health.missingColumns).toEqual(["kickoff_share_artifacts.image_url"]);
    expect(health.storageBucketPublic).toBe(false);
    expect(health.storagePolicyCount).toBe(2);
    expect(health.requiredStoragePolicyCount).toBe(3);
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
        publicProofContentIds: ["record:cap-synced", "mode:mode-synced"],
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
      rank: 1,
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

  it("keeps public profile pending until archive payload fingerprints match the synced content", () => {
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
        publicProofContentIds: ["record:cap-profile-stale", "mode:mode-profile-stale"],
        shareArtifacts: 1,
        publicShareImages: 1,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        expectedShareArtifacts: 1,
        recordContentIds: ["cap-profile-stale"],
        modeRunContentIds: ["mode-profile-stale"],
        shareArtifactContentIds: ["record:cap-profile-stale"],
        publicProfileRecordIds: ["cap-profile-stale"],
        publicProfileModeRunIds: ["mode-profile-stale"],
        publicProfileShareArtifactIds: ["record:cap-profile-stale"],
        publicProfileRecordContentIds: [],
        publicProfileModeRunContentIds: [],
        publicProfileShareArtifactContentIds: [],
        missingPublicProfileRecordContentIds: ["cap-profile-stale"],
        missingPublicProfileModeRunContentIds: ["mode-profile-stale"],
        missingPublicProfileShareArtifactContentIds: ["record:cap-profile-stale"],
        message: "Profile page archive IDs exist but payload fingerprints are stale.",
      },
    };
    const cloudProfile = { ...profile, id: "user-123", cloudMode: "supabase" as const };

    const coverage = buildCloudSyncCoverage(
      cloudState,
      [record("cap-profile-stale")],
      [modeRun("mode-profile-stale")],
      [shareArtifact("cap-profile-stale", "record")],
    );
    const audit = buildCloudSyncAudit(
      cloudState,
      cloudProfile,
      [record("cap-profile-stale")],
      [modeRun("mode-profile-stale")],
      [],
      [shareArtifact("cap-profile-stale", "record")],
    );

    expect(coverage.passed).toBe(false);
    expect(audit.find((item) => item.key === "publicProfile")?.status).toBe("pending");
    expect(audit.find((item) => item.key === "publicProfile")?.detail).toContain("fingerprints 0/3");
    expect(audit.find((item) => item.key === "publicProfile")?.detail).toContain("cap-profile-stale");
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

  it("requires public share image read-back to be a production-sized bitmap", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
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
    const cloudProfile = {
      ...profile,
      id: "auth-user-123",
      email: "signed-in@example.com",
      displayName: "Signed Analyst",
      friendCode: "chengdu",
      cloudMode: "supabase" as const,
    };
    const cloudRecord = record("cap-cloud");
    const cloudModeRun = modeRun("mode-cloud");
    const cloudArtifact = shareArtifact("cap-cloud", "record", {
      imageUrl: "https://cdn.example.com/cards/cap-cloud.png",
    });
    let imageResponse: "html" | "png" = "html";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === cloudArtifact.imageUrl) {
          if (imageResponse === "png") {
            return new Response(productionPngBytes(), {
              status: 200,
              headers: { "Content-Type": "image/png" },
            });
          }
          return new Response("<html>not an image</html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({
              id: cloudProfile.id,
              email: cloudProfile.email,
              user_metadata: { name: cloudProfile.displayName },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_backend_health")) {
          return new Response(
            JSON.stringify([
              {
                ready: true,
                schema_version: "2099-test",
                required_tables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
                missing_tables: [],
                required_views: ["kickoff_leaderboard", "kickoff_backend_health"],
                missing_views: [],
                rls_tables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
                missing_rls_tables: [],
                policy_count: 8,
                required_policy_count: 8,
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_profiles")) {
          return new Response(
            JSON.stringify([
              {
                id: cloudProfile.id,
                email: cloudProfile.email,
                display_name: cloudProfile.displayName,
                location: cloudProfile.location,
                friend_code: "chengdu",
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_records")) {
          return new Response(
            JSON.stringify([
              {
                capsule: cloudRecord.capsule,
                result: cloudRecord.result ?? null,
                seal_job: cloudRecord.sealJob ?? null,
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_mode_runs")) {
          return new Response(
            JSON.stringify([
              {
                mode_run: cloudModeRun,
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_share_artifacts")) {
          return new Response(
            JSON.stringify([
              {
                id: cloudArtifact.id,
                kind: cloudArtifact.kind,
                artifact: cloudArtifact,
                proof_url: cloudArtifact.proofUrl,
                image_generated: true,
                image_url: cloudArtifact.imageUrl,
                image_mime: cloudArtifact.imageMime,
                image_byte_length: cloudArtifact.imageByteLength,
                image_hash: cloudArtifact.imageHash,
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const { verifyCloudSyncReadback: verifyConfiguredCloudSyncReadback } = await import("./cloud");

    const htmlVerification = await verifyConfiguredCloudSyncReadback(cloudProfile, [cloudRecord], [cloudModeRun], [cloudArtifact]);
    imageResponse = "png";
    const pngVerification = await verifyConfiguredCloudSyncReadback(cloudProfile, [cloudRecord], [cloudModeRun], [cloudArtifact]);

    expect(htmlVerification.publicShareImages).toBe(0);
    expect(htmlVerification.missingPublicShareImageIds).toEqual(["record:cap-cloud"]);
    expect(pngVerification.publicShareImages).toBe(1);
    expect(pngVerification.authUserIdentity).toMatchObject({
      id: "auth-user-123",
      email: "signed-in@example.com",
    });
    expect(pngVerification.authUserProblems).toEqual([]);
    expect(pngVerification.missingPublicShareImageIds).toEqual([]);
    expect(pngVerification.publicProofContentIds).toEqual(["record:cap-cloud", "mode:mode-cloud"]);
    expect(pngVerification.missingPublicProofContentIds).toEqual([]);
  });

  it("does not pass cloud read-back when anonymous public proof content is stale", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
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
    const cloudProfile = {
      ...profile,
      id: "auth-user-123",
      email: "signed-in@example.com",
      displayName: "Signed Analyst",
      friendCode: "chengdu",
      cloudMode: "supabase" as const,
    };
    const cloudRecord = record("cap-public-stale");
    const stalePublicRecord = record("cap-public-stale", {
      capsule: {
        ...cloudRecord.capsule,
        prediction: {
          ...cloudRecord.capsule.prediction,
          confidence: cloudRecord.capsule.prediction.confidence + 1,
        },
      },
    });
    const cloudModeRun = modeRun("mode-public-stale");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({
              id: cloudProfile.id,
              email: cloudProfile.email,
              user_metadata: { name: cloudProfile.displayName },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_backend_health")) {
          return new Response(
            JSON.stringify([
              {
                ready: true,
                schema_version: "2099-test",
                required_tables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
                missing_tables: [],
                required_views: ["kickoff_leaderboard", "kickoff_backend_health"],
                missing_views: [],
                rls_tables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
                missing_rls_tables: [],
                missing_columns: [],
                missing_view_columns: [],
                policy_count: 8,
                required_policy_count: 8,
                unsafe_write_policies: [],
                storage_bucket_public: true,
                storage_policy_count: 3,
                required_storage_policy_count: 3,
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_profiles")) {
          return new Response(
            JSON.stringify([
              {
                id: cloudProfile.id,
                email: cloudProfile.email,
                display_name: cloudProfile.displayName,
                location: cloudProfile.location,
                friend_code: "chengdu",
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_records")) {
          const publicProofById = url.includes("id=eq.cap-public-stale");
          const publicProfileRows = url.includes("user_id=eq.auth-user-123");
          const selected = publicProofById ? stalePublicRecord : cloudRecord;
          return new Response(
            JSON.stringify(
              publicProfileRows || !publicProofById
                ? [{ capsule: cloudRecord.capsule, result: cloudRecord.result ?? null, seal_job: cloudRecord.sealJob ?? null, updated_at: "2099-01-01T00:00:00.000Z" }]
                : [{ capsule: selected.capsule, result: selected.result ?? null, seal_job: selected.sealJob ?? null }],
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_mode_runs")) {
          return new Response(
            JSON.stringify([{ mode_run: cloudModeRun, updated_at: "2099-01-01T00:00:00.000Z" }]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_share_artifacts")) {
          return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const {
      verifyCloudSyncReadback: verifyConfiguredCloudSyncReadback,
      isCloudReadbackComplete: isConfiguredCloudReadbackComplete,
    } = await import("./cloud");

    const verification = await verifyConfiguredCloudSyncReadback(cloudProfile, [cloudRecord], [cloudModeRun], []);

    expect(verification.publicProofIds).toEqual(["record:cap-public-stale", "mode:mode-public-stale"]);
    expect(verification.publicProofContentIds).toEqual(["mode:mode-public-stale"]);
    expect(verification.missingPublicProofContentIds).toEqual(["record:cap-public-stale"]);
    expect(verification.message).toContain("1/2 public proof fingerprints");
    expect(
      isConfiguredCloudReadbackComplete(verification, 1, 1, 0, {
        recordIds: ["cap-public-stale"],
        modeRunIds: ["mode-public-stale"],
      }),
    ).toBe(false);
  });

  it("does not pass cloud read-back when the Auth user does not own the profile row", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
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
    const cloudProfile = {
      ...profile,
      id: "profile-owner-123",
      email: "owner@example.com",
      displayName: "Owner Analyst",
      friendCode: "chengdu",
      cloudMode: "supabase" as const,
    };
    const cloudRecord = record("cap-owner");
    const cloudModeRun = modeRun("mode-owner");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/v1/user")) {
          return new Response(
            JSON.stringify({
              id: "other-auth-user",
              email: "other@example.com",
              user_metadata: { name: "Other User" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_backend_health")) {
          return new Response(
            JSON.stringify([
              {
                ready: true,
                schema_version: "2099-test",
                required_tables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
                missing_tables: [],
                required_views: ["kickoff_leaderboard", "kickoff_backend_health"],
                missing_views: [],
                rls_tables: ["kickoff_profiles", "kickoff_records", "kickoff_mode_runs", "kickoff_share_artifacts"],
                missing_rls_tables: [],
                missing_columns: [],
                missing_view_columns: [],
                policy_count: 8,
                required_policy_count: 8,
                storage_bucket_public: true,
                storage_policy_count: 3,
                required_storage_policy_count: 3,
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_profiles")) {
          return new Response(
            JSON.stringify([
              {
                id: cloudProfile.id,
                email: cloudProfile.email,
                display_name: cloudProfile.displayName,
                location: cloudProfile.location,
                friend_code: "chengdu",
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_records")) {
          return new Response(
            JSON.stringify([
              {
                capsule: cloudRecord.capsule,
                result: cloudRecord.result ?? null,
                seal_job: cloudRecord.sealJob ?? null,
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_mode_runs")) {
          return new Response(
            JSON.stringify([{ mode_run: cloudModeRun, updated_at: "2099-01-01T00:00:00.000Z" }]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_share_artifacts")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const {
      verifyCloudSyncReadback: verifyConfiguredCloudSyncReadback,
      isCloudReadbackComplete: isConfiguredCloudReadbackComplete,
    } = await import("./cloud");

    const verification = await verifyConfiguredCloudSyncReadback(cloudProfile, [cloudRecord], [cloudModeRun], []);

    expect(verification.authUserIdentity).toMatchObject({
      id: "other-auth-user",
      email: "other@example.com",
    });
    expect(verification.authUserProblems).toContain("auth id other-auth-user != profile profile-owner-123");
    expect(verification.profile).toBe(false);
    expect(isConfiguredCloudReadbackComplete(verification, 1, 1, 0)).toBe(false);
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
      rank: 1,
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
      rank: 1,
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
    const crewProfile = { ...profile, friendCode: "World Cup Crew 26" };
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

    const friendEvidence = buildLeaderboardScopeEvidence("friend", crewProfile, [entry]);
    const seasonEvidence = buildLeaderboardScopeEvidence("season", crewProfile, []);

    expect(leaderboardScopeFilter("global", crewProfile)).toBe("global xp desc");
    expect(leaderboardTargetQuery("global", crewProfile)).toContain("id=eq.local-test");
    expect(leaderboardTargetQuery("friend", crewProfile)).toContain("friend_code=eq.world-cup-crew-26");
    expect(leaderboardTargetQuery("season", crewProfile)).toContain("season_key=eq.world-cup-run");
    expect(friendEvidence.status).toBe("loaded");
    expect(friendEvidence.rows).toBe(1);
    expect(friendEvidence.filter).toBe("friend_code=eq.world-cup-crew-26");
    expect(friendEvidence.currentUserPresent).toBe(false);
    expect(friendEvidence.targetQuery).toContain("id=eq.local-test");
    expect(friendEvidence.sampleIds).toEqual(["scope-row"]);
    expect(seasonEvidence.status).toBe("empty");
    expect(seasonEvidence.currentUserPresent).toBe(false);
    expect(seasonEvidence.filter).toBe("season_key=eq.world-cup-run");
  });

  it("loads public leaderboard rows and appends the current user target row when outside the top page", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.resetModules();
    stubBrowserStorage();
    const calls: Array<{ url: string; authorization?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, authorization: (init?.headers as Record<string, string> | undefined)?.Authorization });
        const rows = url.includes("id=eq.local-test")
          ? [
              {
                id: "local-test",
                display_name: "Tester",
                location: "Chengdu",
                rank: 48,
                global_rank: 48,
                friend_rank: 3,
                season_rank: 7,
                locks: 3,
                revealed: 2,
                average_score: 76,
                best_score: 88,
                xp: 452,
                streak: 1,
                exact_hits: 1,
                verified_proofs: 1,
                mode_proofs: 2,
                season_key: "world-cup-run",
                friend_code: "chengdu",
              },
            ]
          : [
              {
                id: "top-user",
                display_name: "Top User",
                location: "Global",
                rank: 1,
                global_rank: 1,
                friend_rank: 1,
                season_rank: 1,
                locks: 10,
                revealed: 10,
                average_score: 90,
                best_score: 100,
                xp: 2000,
                streak: 5,
                exact_hits: 3,
                verified_proofs: 4,
                mode_proofs: 1,
              },
            ];
        return new Response(JSON.stringify(rows), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const { loadLeaderboard: loadConfiguredLeaderboard, buildLeaderboardScopeEvidence: buildConfiguredEvidence } = await import("./cloud");
    const crewProfile = { ...profile, friendCode: "World Cup Crew 26" };

    const rows = await loadConfiguredLeaderboard("friend", crewProfile);
    const evidence = buildConfiguredEvidence("friend", crewProfile, rows);

    expect(rows.map((row) => row.id)).toEqual(["top-user", "local-test"]);
    expect(rows.find((row) => row.id === "local-test")).toMatchObject({
      source: "friend",
      rank: 3,
      globalRank: 48,
      friendRank: 3,
      seasonRank: 7,
      xp: 452,
      friendCode: "chengdu",
    });
    expect(evidence.currentUserPresent).toBe(true);
    expect(evidence.currentUserRank).toBe(3);
    expect(evidence.rows).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("limit=20");
    expect(calls[1].url).toContain("id=eq.local-test");
    expect(calls[0].url).toContain("friend_code=eq.world-cup-crew-26");
    expect(calls[1].url).toContain("friend_code=eq.world-cup-crew-26");
    expect(calls[0].url).toContain("select=id%2Cdisplay_name");
    expect(calls[0].url).toContain("global_rank");
    expect(calls[0].url).not.toContain("select=*");
    expect(calls.every((call) => call.authorization === "Bearer anon-key")).toBe(true);
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
        rank: 1,
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

  it("does not pass leaderboard readiness when the current user row has no scoped rank", () => {
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
    const evidence = buildLeaderboardScopeEvidence("global", profile, remoteRows);
    const readiness = buildLeaderboardReadiness(cloudState, remoteRows, profile, [evidence]);

    expect(evidence.currentUserPresent).toBe(true);
    expect(evidence.currentUserRank).toBeUndefined();
    expect(readiness.find((item) => item.key === "global")?.passed).toBe(false);
    expect(readiness.find((item) => item.key === "global")?.detail).toContain("missing scoped rank");
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

  it("filters stale share artifacts out of anonymous public profile recovery", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("kickoff_profiles")) {
          return new Response(
            JSON.stringify([
              {
                id: "user-public",
                email: "fan@example.com",
                display_name: "Public Fan",
                location: "Chengdu",
                friend_code: "chengdu",
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_records")) {
          return new Response(
            JSON.stringify([
              {
                capsule: record("cap-current").capsule,
                result: record("cap-current").result,
                seal_job: null,
                updated_at: "2099-01-01T00:00:00.000Z",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_mode_runs")) {
          return new Response(
            JSON.stringify([{ mode_run: modeRun("mode-current"), updated_at: "2099-01-01T00:00:00.000Z" }]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("kickoff_share_artifacts")) {
          return new Response(
            JSON.stringify([
              {
                id: "cap-current",
                kind: "record",
                artifact: shareArtifact("cap-current", "record"),
                proof_url: "https://example.com/?proof=cap-current",
                image_generated: true,
                generated_at: "2099-01-01T00:00:00.000Z",
                file_name: "cap-current.png",
                image_url: "https://cdn.example.com/cap-current.png",
                image_mime: "image/png",
                image_byte_length: 1000,
                image_hash: "a".repeat(64),
              },
              {
                id: "cap-old",
                kind: "record",
                artifact: shareArtifact("cap-old", "record"),
                proof_url: "https://example.com/?proof=cap-old",
                image_generated: true,
                generated_at: "2099-01-01T00:00:00.000Z",
                file_name: "cap-old.png",
                image_url: "https://cdn.example.com/cap-old.png",
                image_mime: "image/png",
                image_byte_length: 1000,
                image_hash: "b".repeat(64),
              },
              {
                id: "mode-current",
                kind: "mode",
                artifact: shareArtifact("mode-current", "mode"),
                proof_url: "https://example.com/?mode=mode-current",
                image_generated: true,
                generated_at: "2099-01-01T00:00:00.000Z",
                file_name: "mode-current.png",
                image_url: "https://cdn.example.com/mode-current.png",
                image_mime: "image/png",
                image_byte_length: 1000,
                image_hash: "c".repeat(64),
              },
              {
                id: "mode-old",
                kind: "mode",
                artifact: shareArtifact("mode-old", "mode"),
                proof_url: "https://example.com/?mode=mode-old",
                image_generated: true,
                generated_at: "2099-01-01T00:00:00.000Z",
                file_name: "mode-old.png",
                image_url: "https://cdn.example.com/mode-old.png",
                image_mime: "image/png",
                image_byte_length: 1000,
                image_hash: "d".repeat(64),
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );

    const publicProfile = await loadPublicProfile("user-public", true);

    expect(publicProfile?.records.map((item) => item.capsule.id)).toEqual(["cap-current"]);
    expect(publicProfile?.modeRuns.map((item) => item.id)).toEqual(["mode-current"]);
    expect(publicProfile?.shareArtifacts.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "record:cap-current",
      "mode:mode-current",
    ]);
  });

  it("documents mode proof aggregation in the Supabase leaderboard view", () => {
    const schema = readFileSync(join(process.cwd(), "supabase.schema.sql"), "utf8");

    expect(schema).toContain("mode_rows as");
    expect(schema).toContain("from public.kickoff_mode_runs");
    expect(schema).toContain("mode_proofs");
    expect(schema).toContain("count(*) * 90");
    expect(schema).toContain("full outer join mode_rows");
    expect(schema).toContain("global_rank");
    expect(schema).toContain("friend_rank");
    expect(schema).toContain("season_rank");
    expect(schema).toContain("partition by aggregate_rows.friend_code");
    expect(schema).toContain("partition by aggregate_rows.season_key");
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
    expect(schema).toContain("'2026-07-06-cloud-v4'");
    expect(schema).toContain("missing_rls_tables");
    expect(schema).toContain("missing_columns");
    expect(schema).toContain("missing_view_columns");
    expect(schema).toContain("unsafe_write_policies");
    expect(schema).toContain("storage_bucket_public");
    expect(schema).toContain("storage_policy_count >= required_storage_policy_count");
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
