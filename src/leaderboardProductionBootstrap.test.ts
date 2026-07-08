import { describe, expect, it } from "vitest";
import {
  buildLeaderboardProductionArtifact,
  buildLeaderboardProductionBootstrapPlan,
} from "./leaderboardProductionBootstrap";
import type { SupabaseDoctorReport } from "./supabaseProductionDoctor";

const seedReadyEnv = {
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
  KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
};

const completeEnv = {
  ...seedReadyEnv,
  KICKOFF_VERIFY_USER_ID: "user-1",
  KICKOFF_VERIFY_FRIEND_CODE: "chengdu",
  KICKOFF_VERIFY_SEASON_KEY: "world-cup-run",
  KICKOFF_VERIFY_LEADERBOARD_SCOPES: "global,friend,season",
};

const doctorReport = (failedCheckIds: string[] = []): SupabaseDoctorReport => {
  const ids = [
    "leaderboard-global-user",
    "leaderboard-friend-user",
    "leaderboard-season-user",
    "leaderboard-global-board",
    "leaderboard-friend-board",
    "leaderboard-season-board",
  ];
  return {
    ready: failedCheckIds.length === 0,
    requiredPassed: ids.length - failedCheckIds.length,
    requiredTotal: ids.length,
    checks: ids.map((id) => ({
      id,
      label: id,
      required: true,
      status: failedCheckIds.includes(id) ? "failed" : "passed",
      detail: failedCheckIds.includes(id) ? "missing current user" : "current user ranked",
      action: "Run doctor:supabase",
    })),
    nextActions: [],
  };
};

describe("leaderboard production bootstrap plan", () => {
  it("blocks until Supabase write env and share image target can seed leaderboard rows", () => {
    const plan = buildLeaderboardProductionBootstrapPlan({});

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "blocked",
      command: "bun run seed:production-targets --dry-run",
    });
    expect(plan.missingEnv).toEqual(
      expect.arrayContaining([
        "VITE_PUBLIC_APP_URL",
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "KICKOFF_SEED_SHARE_IMAGE_URL or KICKOFF_VERIFY_SHARE_IMAGE_URL missing",
        "KICKOFF_VERIFY_USER_ID",
        "KICKOFF_VERIFY_FRIEND_CODE",
        "KICKOFF_VERIFY_SEASON_KEY",
      ]),
    );
  });

  it("opens the seed command once write prerequisites are available", () => {
    const plan = buildLeaderboardProductionBootstrapPlan(seedReadyEnv);

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "ready",
      command: "bun run seed:production-targets --dry-run",
    });
    expect(plan.commands).toContain("bun run seed:production-targets --dry-run");
  });

  it("keeps leaderboard seeding blocked until the mode share image target is available", () => {
    const plan = buildLeaderboardProductionBootstrapPlan({
      ...seedReadyEnv,
      KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "",
      KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL missing",
      ]),
    });
  });

  it("allows public CDN share image URLs when seeding leaderboard targets", () => {
    const plan = buildLeaderboardProductionBootstrapPlan({
      ...seedReadyEnv,
      KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://cdn.example.com/share.png",
      KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/mode-share.png",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "ready",
      missingEnv: [],
    });
  });

  it("does not seed leaderboard targets from local or non-image share URLs", () => {
    const plan = buildLeaderboardProductionBootstrapPlan({
      ...seedReadyEnv,
      KICKOFF_VERIFY_SHARE_IMAGE_URL: "http://localhost/share.png",
      KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/mode-share.svg",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "Record share image URL must be a public HTTPS URL",
        "Mode share image URL must point to a PNG, JPEG or WebP image path",
      ]),
    });
  });

  it("blocks leaderboard doctor and verification when Supabase URL is local or not deployed", () => {
    const plan = buildLeaderboardProductionBootstrapPlan({
      ...completeEnv,
      VITE_SUPABASE_URL: "http://localhost:54321",
      KICKOFF_VERIFY_SHARE_IMAGE_URL: "http://localhost:54321/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "http://localhost:54321/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
    });

    expect(plan.ready).toBe(false);
    expect(plan.missingEnv).toContain("VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL");
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"]),
    });
    expect(plan.stages.find((stage) => stage.id === "verify")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"]),
    });
  });

  it("switches to doctor and strict production evidence once leaderboard targets are collected", () => {
    const plan = buildLeaderboardProductionBootstrapPlan(completeEnv);

    expect(plan.ready).toBe(true);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({ status: "done" });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "ready",
      command: "bun run doctor:supabase",
    });
    expect(plan.stages.find((stage) => stage.id === "verify")).toMatchObject({
      status: "ready",
      command: "bun run verify:production",
    });
    expect(plan.targetQueries.friend).toContain("friend_code=eq.chengdu");
    expect(plan.targetQueries.season).toContain("season_key=eq.world-cup-run");
    expect(plan.targetQueries.global).toContain("order=xp.desc");
    expect(plan.targetQueries.global).toContain("locks");
    expect(plan.targetQueries.global).toContain("revealed");
    expect(plan.targetQueries.global).toContain("exact_hits");
    expect(plan.boardQueries.global).toContain("order=global_rank.asc");
    expect(plan.boardQueries.global).toContain("limit=20");
    expect(plan.boardQueries.friend).toContain("order=friend_rank.asc");
    expect(plan.boardQueries.friend).toContain("friend_code=eq.chengdu");
    expect(plan.boardQueries.season).toContain("order=season_rank.asc");
    expect(plan.boardQueries.season).toContain("season_key=eq.world-cup-run");
    expect(plan.queryContracts).toEqual([
      expect.objectContaining({ scope: "global", passed: true, targetQueryReady: true, boardQueryReady: true }),
      expect.objectContaining({ scope: "friend", passed: true, targetQueryReady: true, boardQueryReady: true }),
      expect.objectContaining({ scope: "season", passed: true, targetQueryReady: true, boardQueryReady: true }),
    ]);
    expect(plan.readBackCommands).toHaveLength(6);
    expect(plan.readBackCommands.every((item) => item.ready)).toBe(true);
    expect(plan.readBackCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "leaderboard:global:current-user",
          scope: "global",
          kind: "current-user",
          label: "global current-user row",
          queryPath: expect.stringContaining("id=eq.user-1"),
          authMode: "anon",
          expectedUserId: "user-1",
          expectedOrder: "xp.desc",
          minRows: 1,
          responseExpectation: {
            responseType: "supabase-array",
            table: "kickoff_leaderboard",
            scope: "global",
            kind: "current-user",
            minRows: 1,
            requiredFields: [
              "id",
              "display_name",
              "location",
              "friend_code",
              "season_key",
              "locks",
              "revealed",
              "average_score",
              "best_score",
              "xp",
              "streak",
              "exact_hits",
              "verified_proofs",
              "mode_proofs",
              "global_rank",
              "friend_rank",
              "season_rank",
              "rank",
              "updated_at",
            ],
            expectedOrder: "xp.desc",
            expectedUserId: "user-1",
            requiredRankFields: ["global_rank", "friend_rank", "season_rank", "rank"],
          },
          url: expect.stringContaining("/rest/v1/kickoff_leaderboard?"),
          command: expect.stringContaining("/rest/v1/kickoff_leaderboard?"),
        }),
        expect.objectContaining({
          id: "leaderboard:friend:board",
          scope: "friend",
          kind: "board",
          label: "friend leaderboard board",
          queryPath: expect.stringContaining("friend_code=eq.chengdu"),
          authMode: "anon",
          expectedFriendCode: "chengdu",
          expectedOrder: "friend_rank.asc",
          minRows: 10,
          responseExpectation: expect.objectContaining({
            responseType: "supabase-array",
            table: "kickoff_leaderboard",
            scope: "friend",
            kind: "board",
            minRows: 10,
            expectedFriendCode: "chengdu",
            expectedOrder: "friend_rank.asc",
            requiredRankFields: ["global_rank", "friend_rank", "season_rank", "rank"],
          }),
          url: expect.stringContaining("friend_code=eq.chengdu"),
          command: expect.stringContaining("friend_code=eq.chengdu"),
        }),
        expect.objectContaining({
          id: "leaderboard:season:board",
          scope: "season",
          kind: "board",
          label: "season leaderboard board",
          queryPath: expect.stringContaining("season_key=eq.world-cup-run"),
          authMode: "anon",
          expectedSeasonKey: "world-cup-run",
          expectedOrder: "season_rank.asc",
          minRows: 10,
          url: expect.stringContaining("season_key=eq.world-cup-run"),
          command: expect.stringContaining("season_key=eq.world-cup-run"),
        }),
      ]),
    );
    const readBackDump = plan.readBackCommands.map((item) => item.command).join("\n");
    expect(readBackDump).toContain("Authorization: Bearer $VITE_SUPABASE_ANON_KEY");
    expect(readBackDump).not.toContain("service");
    expect(plan.copyText).toContain("Board queries:");
    expect(plan.copyText).toContain("Leaderboard read-back commands:");
    expect(plan.copyText).toContain("Query contracts:");
    expect(plan.copyText).toContain("leaderboard production bootstrap");
    expect(plan.copyText).toContain("global_rank, friend_rank and season_rank must be positive scoped ranks");
  });

  it("keeps leaderboard read-back commands blocked until anonymous REST env is configured", () => {
    const plan = buildLeaderboardProductionBootstrapPlan({});

    expect(plan.readBackCommands).toHaveLength(6);
    expect(plan.readBackCommands.every((item) => !item.ready)).toBe(true);
    expect(plan.readBackCommands[0].command).toBe(
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before reading leaderboard REST rows.",
    );
    expect(plan.copyText).toContain("global current-user row: Set VITE_SUPABASE_URL");
  });

  it("builds a reusable backend artifact only after all leaderboard doctor scopes pass", () => {
    const plan = buildLeaderboardProductionBootstrapPlan(completeEnv);
    const artifact = buildLeaderboardProductionArtifact(plan, {
      env: completeEnv,
      envFiles: [".env.production.local"],
      doctor: doctorReport(),
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(true);
    expect(artifact.targets).toEqual({
      userId: "user-1",
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      leaderboardScopes: ["global", "friend", "season"],
    });
    expect(artifact.acceptance).toMatchObject({
      globalCurrentUser: true,
      friendCurrentUser: true,
      seasonCurrentUser: true,
      globalBoardRows: true,
      friendBoardRows: true,
      seasonBoardRows: true,
      passedScopeCount: 3,
      passedBoardCount: 3,
      targetEnvReady: true,
      queryContractsReady: true,
      scopeClaims: [
        expect.objectContaining({
          scope: "global",
          doctorCheckId: "leaderboard-global-user",
          boardCheckId: "leaderboard-global-board",
          currentUser: true,
          boardRows: true,
          doctorPassed: true,
          boardPassed: true,
          targetQueryReady: true,
          boardQueryReady: true,
          blockers: [],
        }),
        expect.objectContaining({
          scope: "friend",
          doctorCheckId: "leaderboard-friend-user",
          boardCheckId: "leaderboard-friend-board",
          currentUser: true,
          boardRows: true,
          doctorPassed: true,
          boardPassed: true,
          targetQueryReady: true,
          boardQueryReady: true,
          blockers: [],
        }),
        expect.objectContaining({
          scope: "season",
          doctorCheckId: "leaderboard-season-user",
          boardCheckId: "leaderboard-season-board",
          currentUser: true,
          boardRows: true,
          doctorPassed: true,
          boardPassed: true,
          targetQueryReady: true,
          boardQueryReady: true,
          blockers: [],
        }),
      ],
    });
    expect(artifact.queryContracts.every((contract) => contract.passed)).toBe(true);
  });

  it("keeps the backend artifact not ready when a scoped leaderboard read-back fails", () => {
    const plan = buildLeaderboardProductionBootstrapPlan(completeEnv);
    const artifact = buildLeaderboardProductionArtifact(plan, {
      env: completeEnv,
      doctor: doctorReport(["leaderboard-friend-user"]),
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.friendCurrentUser).toBe(false);
    expect(artifact.doctor?.failedLeaderboardCheckIds).toEqual(["leaderboard-friend-user"]);
  });

  it("keeps the backend artifact not ready when a scoped board read-back fails", () => {
    const plan = buildLeaderboardProductionBootstrapPlan(completeEnv);
    const artifact = buildLeaderboardProductionArtifact(plan, {
      env: completeEnv,
      doctor: doctorReport(["leaderboard-season-board"]),
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.seasonBoardRows).toBe(false);
    expect(artifact.acceptance.passedScopeCount).toBe(3);
    expect(artifact.acceptance.passedBoardCount).toBe(2);
    expect(artifact.acceptance.scopeClaims.find((claim) => claim.scope === "season")).toMatchObject({
      boardPassed: false,
      blockers: expect.arrayContaining(["leaderboard-season-board did not pass"]),
    });
  });

  it("keeps the backend artifact not ready when generated query contracts are incomplete", () => {
    const plan = {
      ...buildLeaderboardProductionBootstrapPlan(completeEnv),
      boardQueries: {
        ...buildLeaderboardProductionBootstrapPlan(completeEnv).boardQueries,
        friend: `kickoff_leaderboard?select=id&order=xp.desc&limit=5`,
      },
    };
    const artifact = buildLeaderboardProductionArtifact(plan, {
      env: completeEnv,
      doctor: doctorReport(),
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.queryContractsReady).toBe(false);
    expect(artifact.queryContracts.find((contract) => contract.scope === "friend")).toMatchObject({
      passed: false,
      boardQueryReady: false,
    });
  });
});
