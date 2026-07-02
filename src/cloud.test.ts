import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLeaderboardReadiness,
  buildLocalLeaderboard,
  buildPublicProfile,
  consumeSupabaseHash,
  isSupabaseSessionExpired,
  loadSupabaseSession,
  mergeMemoryRecords,
  mergeModeRuns,
} from "./cloud";
import type { CloudSyncState, GameModeRun, LeaderboardEntry, MemoryRecord, UserProfile } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
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
    expect(entry.friendCode).toBe("chengdu");
    expect(entry.source).toBe("local");
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
      id: "remote-user",
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
      source: "global",
    };

    const readiness = buildLeaderboardReadiness(cloudState, [remoteEntry], profile);

    expect(readiness.find((item) => item.key === "view")?.passed).toBe(true);
    expect(readiness.find((item) => item.key === "global")?.detail).toContain("global xp ranking");
    expect(readiness.find((item) => item.key === "friend")?.detail).toContain("chengdu");
    expect(readiness.find((item) => item.key === "season")?.detail).toContain("world-cup-run");
    expect(readiness.find((item) => item.key === "remoteRows")?.detail).toContain("1 Supabase");
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

    const publicProfile = buildPublicProfile(profile, records, [modeRun("mode-public")]);
    expect(publicProfile.displayName).toBe("Tester");
    expect(publicProfile.friendCode).toBe("chengdu");
    expect(publicProfile.locks).toBe(1);
    expect(publicProfile.revealed).toBe(1);
    expect(publicProfile.modeProofs).toBe(1);
    expect(publicProfile.modeRuns[0].id).toBe("mode-public");
    expect(publicProfile.averageScore).toBe(92);
    expect(publicProfile.bestScore).toBe(92);
    expect(publicProfile.xp).toBe(302);
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
