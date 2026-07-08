import { describe, expect, it } from "vitest";
import { buildProductionAccountBootstrapPacket } from "./productionAccountBootstrap";
import { buildProductionVerifyEnv } from "./productionEvidence";

describe("production account bootstrap packet", () => {
  const runtimeEnv = {
    VITE_SUPABASE_URL: "https://project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
  };

  it("builds a ready account and leaderboard acceptance packet from verify env", () => {
    const envText = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "user-1",
      proofId: "cap-1",
      modeId: "mode-1",
      modeIds: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
      allowFailures: true,
    });

    const packet = buildProductionAccountBootstrapPacket({
      envText,
      runtimeEnv,
      publicAppUrl: "https://example.com/kickoff-lock-agent/?old=1#hash",
    });

    expect(packet.ready).toBe(true);
    expect(packet.summary).toContain("19/19 account targets");
    expect(packet.summary).toContain("8/8 Supabase queries ready");
    expect(packet.checks.find((check) => check.key === "authRedirect")).toMatchObject({
      passed: true,
      detail: "https://example.com/kickoff-lock-agent/",
    });
    expect(packet.checks.find((check) => check.key === "googleOAuth")).toMatchObject({
      passed: true,
      detail:
        "https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fexample.com%2Fkickoff-lock-agent%2F",
    });
    expect(packet.checks.find((check) => check.key === "pkceOAuth")).toMatchObject({
      passed: true,
      detail: expect.stringContaining("code_challenge_method=s256"),
    });
    expect(packet.checks.find((check) => check.key === "magicLink")).toMatchObject({
      passed: true,
      detail: "https://project.supabase.co/auth/v1/otp redirects to https://example.com/kickoff-lock-agent/",
    });
    expect(packet.publicLinks.map((link) => link.url)).toEqual([
      "https://example.com/kickoff-lock-agent/?profile=user-1",
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      "https://example.com/kickoff-lock-agent/?mode=mode-1",
      "https://example.com/kickoff-lock-agent/?mode=mode-2",
      "https://example.com/kickoff-lock-agent/?mode=mode-3",
      "https://example.com/kickoff-lock-agent/?mode=mode-4",
      "https://example.com/kickoff-lock-agent/?mode=mode-5",
      "https://example.com/kickoff-lock-agent/?mode=mode-6",
    ]);
    expect(packet.checks.find((check) => check.key === "cleanSessionProfile")).toMatchObject({
      passed: true,
      detail: "https://example.com/kickoff-lock-agent/?profile=user-1",
    });
    expect(packet.checks.find((check) => check.key === "cleanSessionProof")).toMatchObject({
      passed: true,
      detail: "https://example.com/kickoff-lock-agent/?proof=cap-1",
    });
    expect(packet.checks.find((check) => check.key === "cleanSessionModes")).toMatchObject({
      passed: true,
      detail: expect.stringContaining("https://example.com/kickoff-lock-agent/?mode=mode-5"),
    });
    expect(packet.checks.find((check) => check.key === "mode")?.detail).toContain("mode-4");
    expect(packet.queries.find((query) => query.label === "Mode proof rows")?.path).toContain(
      "id=in.(mode-1,mode-2,mode-3,mode-4,mode-5,mode-6)",
    );
    expect(packet.queries.find((query) => query.label === "Prediction row")?.path).toContain("user_id=eq.user-1");
    expect(packet.queries.find((query) => query.label === "Prediction row")?.path).toContain("friend_code=eq.chengdu");
    expect(packet.queries.find((query) => query.label === "Prediction row")?.path).toContain("season_key=eq.world-cup-run");
    expect(packet.queries.find((query) => query.label === "Mode proof rows")?.path).toContain("user_id=eq.user-1");
    expect(packet.queries.find((query) => query.label === "Mode proof rows")?.path).toContain("friend_code=eq.chengdu");
    expect(packet.queries.find((query) => query.label === "Mode proof rows")?.path).toContain("season_key=eq.world-cup-run");
    expect(packet.queries.find((query) => query.label === "Mode share artifact rows")?.path).toContain("kind=eq.mode");
    expect(packet.queries.find((query) => query.label === "Mode share artifact rows")?.path).toContain("user_id=eq.user-1");
    expect(packet.queries.find((query) => query.scope === "friend")?.path).toContain("friend_code=eq.chengdu");
    expect(packet.queries.find((query) => query.scope === "season")?.path).toContain("season_key=eq.world-cup-run");
    const globalLeaderboardQuery = packet.queries.find((query) => query.label === "Global leaderboard")?.path ?? "";
    expect(globalLeaderboardQuery).toContain("order=xp.desc");
    expect(globalLeaderboardQuery).toContain("locks");
    expect(globalLeaderboardQuery).toContain("revealed");
    expect(globalLeaderboardQuery).toContain("exact_hits");
    expect(packet.readBackCommands).toHaveLength(8);
    expect(packet.readBackCommands.every((item) => item.ready)).toBe(true);
    expect(packet.authReadBackCommand).toMatchObject({
      label: "Auth admin user",
      scope: "auth-user",
      path: "auth/v1/admin/users/user-1",
      url: "https://project.supabase.co/auth/v1/admin/users/user-1",
      authMode: "service-role",
      targetIds: ["user-1"],
      expectedUserId: "user-1",
      ready: true,
      command:
        "curl -sS 'https://project.supabase.co/auth/v1/admin/users/user-1' -H 'apikey: $SUPABASE_SERVICE_ROLE_KEY' -H 'Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY'",
    });
    expect(packet.authReadBackCommand.command).not.toContain("service");
    expect(packet.cleanSessionReadBackCommands).toHaveLength(8);
    expect(packet.cleanSessionReadBackCommands.every((item) => item.ready)).toBe(true);
    expect(packet.cleanSessionReadBackCommands[0]).toMatchObject({
      label: "Clean-session Public profile",
      scope: "public-profile",
      url: "https://example.com/kickoff-lock-agent/?profile=user-1",
      authMode: "public-page",
      targetIds: ["user-1"],
      ready: true,
      command: "curl -sS 'https://example.com/kickoff-lock-agent/?profile=user-1'",
    });
    expect(packet.readBackCommands.find((item) => item.label === "Profile row")).toMatchObject({
      scope: "profile",
      path: "kickoff_profiles?select=id,email,display_name,location,friend_code,season_key,updated_at&id=eq.user-1&limit=1",
      url: "https://project.supabase.co/rest/v1/kickoff_profiles?select=id,email,display_name,location,friend_code,season_key,updated_at&id=eq.user-1&limit=1",
      authMode: "anon",
      targetIds: ["user-1"],
      expectedUserId: "user-1",
      responseExpectation: {
        responseType: "supabase-array",
        minRows: 1,
        targetIds: ["user-1"],
        requiredFields: ["id", "email", "display_name", "location", "friend_code", "season_key", "updated_at"],
        expectedUserId: "user-1",
        expectedSource: "cloud",
      },
    });
    expect(packet.readBackCommands.find((item) => item.label === "Profile row")?.command).toBe(
      "curl -sS 'https://project.supabase.co/rest/v1/kickoff_profiles?select=id,email,display_name,location,friend_code,season_key,updated_at&id=eq.user-1&limit=1' -H 'apikey: $VITE_SUPABASE_ANON_KEY' -H 'Authorization: Bearer $VITE_SUPABASE_ANON_KEY'",
    );
    expect(packet.authReadBackCommand.responseExpectation).toMatchObject({
      responseType: "supabase-auth-user",
      targetIds: ["user-1"],
      requiredFields: ["id", "email"],
      expectedUserId: "user-1",
      expectedSource: "cloud",
    });
    expect(packet.cleanSessionReadBackCommands[0].responseExpectation).toMatchObject({
      responseType: "public-html",
      targetIds: ["user-1"],
      requiredFields: ["canonical-url", "social-metadata", "share-image", "cloud-record"],
      expectedSource: "cloud",
      requiresCleanSession: true,
      pageKind: "profile",
      queryParam: "profile",
    });
    expect(packet.readBackCommands.map((item) => item.command).join("\n")).not.toContain("Bearer anon");
    expect(packet.readBackCommands.find((item) => item.label === "Mode proof rows")?.command).toContain(
      "kickoff_mode_runs?select=id,user_id,mode_id,status,score,season_key,friend_code&id=in.(mode-1,mode-2,mode-3,mode-4,mode-5,mode-6)",
    );
    expect(packet.readBackCommands.find((item) => item.label === "Mode share artifact rows")?.command).toContain(
      "kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,image_url,image_hash,proof_url&id=in.(mode-1,mode-2,mode-3,mode-4,mode-5,mode-6)&kind=eq.mode",
    );
    expect(packet.commands).toEqual(
      expect.arrayContaining([
        "bun run seed:production-targets --upload-share-image --upload-mode-share-image",
        "bun run runtime:config:check",
        "bun run verify:production",
      ]),
    );
    expect(packet.copyText).toContain("Supabase read-back queries");
    expect(packet.copyText).toContain("Supabase Auth admin read-back command");
    expect(packet.copyText).toContain("Supabase anonymous read-back commands");
    expect(packet.copyText).toContain("Clean-session public page read-back commands");
    expect(packet.copyText).toContain("curl -sS 'https://project.supabase.co/rest/v1/kickoff_leaderboard");
    expect(packet.copyText).not.toContain("Authorization: Bearer service");
  });

  it("keeps the packet pending when public targets and share image are missing", () => {
    const packet = buildProductionAccountBootstrapPacket({
      envText: "KICKOFF_VERIFY_USER_ID=user-1\nKICKOFF_VERIFY_SEASON_KEY=world-cup-run\n",
      publicAppUrl: "",
    });

    expect(packet.ready).toBe(false);
    expect(packet.missingTargets).toEqual(
      expect.arrayContaining([
        "Public profile row",
        "Prediction row",
        "Mode proof rows",
        "Clean-session profile URL",
        "Clean-session proof URL",
        "Clean-session mode URLs",
        "Friend leaderboard scope",
        "Auth redirect URL",
        "Google OAuth authorize URL",
        "Google OAuth PKCE contract",
        "Magic link auth endpoint",
        "Public share image",
        "Public mode share image",
        "VITE_PUBLIC_APP_URL",
      ]),
    );
    expect(packet.publicLinks.every((link) => !link.ready)).toBe(true);
    expect(packet.authReadBackCommand.ready).toBe(false);
    expect(packet.cleanSessionReadBackCommands.every((item) => !item.ready)).toBe(true);
    expect(packet.readBackCommands.every((item) => !item.ready)).toBe(true);
    expect(packet.readBackCommands[0]?.command).toContain("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
    expect(packet.nextAction).toContain(".env.production.local");
  });

  it("does not mark account bootstrap ready when profile and user targets belong to different accounts", () => {
    const envText = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "profile-2",
      proofId: "cap-1",
      modeIds: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
      allowFailures: true,
    });

    const packet = buildProductionAccountBootstrapPacket({
      envText,
      runtimeEnv,
      publicAppUrl: "https://example.com/kickoff-lock-agent/",
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "accountIdentity")).toMatchObject({
      passed: false,
      detail: "KICKOFF_VERIFY_USER_ID (user-1) must match KICKOFF_VERIFY_PROFILE_ID (profile-2)",
    });
    expect(packet.missingTargets).toContain("Account identity alignment");
  });

  it("does not mark account bootstrap ready from legacy mode id or invalid public share image URLs", () => {
    const envText = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "user-1",
      proofId: "cap-1",
      modeId: "mode-legacy",
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      shareImageUrl: "http://localhost/share.png",
      modeShareImageUrl: "https://cdn.example.com/mode-share.svg",
      allowFailures: true,
    });

    const packet = buildProductionAccountBootstrapPacket({
      envText,
      runtimeEnv,
      publicAppUrl: "https://example.com/kickoff-lock-agent/",
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "mode")).toMatchObject({
      passed: false,
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough",
    });
    expect(packet.checks.find((check) => check.key === "shareImage")).toMatchObject({
      passed: false,
      detail: "KICKOFF_VERIFY_SHARE_IMAGE_URL must be a public HTTPS URL",
    });
    expect(packet.checks.find((check) => check.key === "modeShareImage")).toMatchObject({
      passed: false,
      detail: "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must point to a PNG, JPEG or WebP image path",
    });
    expect(packet.queries.find((query) => query.label === "Mode proof rows")).toMatchObject({
      ready: false,
      path: "kickoff_mode_runs?select=id&limit=1",
    });
  });

  it("does not mark mode read-back queries ready with only four production mode rows", () => {
    const envText = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "user-1",
      proofId: "cap-1",
      modeIds: ["mode-1", "mode-2", "mode-3", "mode-4"],
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
      allowFailures: true,
    });

    const packet = buildProductionAccountBootstrapPacket({
      envText,
      runtimeEnv,
      publicAppUrl: "https://example.com/kickoff-lock-agent/",
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "mode")).toMatchObject({
      passed: false,
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids",
    });
    expect(packet.queries.find((query) => query.label === "Mode proof rows")).toMatchObject({
      ready: false,
      path: "kickoff_mode_runs?select=id&limit=1",
    });
    expect(packet.queries.find((query) => query.label === "Mode share artifact rows")).toMatchObject({
      ready: false,
      path: "kickoff_share_artifacts?select=id,kind&limit=1",
    });
  });

  it("does not mark account bootstrap ready when Google OAuth redirect does not match the public app", () => {
    const envText = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "user-1",
      proofId: "cap-1",
      modeIds: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
      allowFailures: true,
    });

    const packet = buildProductionAccountBootstrapPacket({
      envText,
      runtimeEnv: {
        ...runtimeEnv,
        VITE_SUPABASE_REDIRECT_URL: "https://other.example.com/kickoff-lock-agent/",
      },
      publicAppUrl: "https://example.com/kickoff-lock-agent/",
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "authRedirect")).toMatchObject({
      passed: false,
      detail:
        "VITE_SUPABASE_REDIRECT_URL (https://other.example.com/kickoff-lock-agent/) must match VITE_PUBLIC_APP_URL (https://example.com/kickoff-lock-agent/)",
    });
    expect(packet.checks.find((check) => check.key === "googleOAuth")).toMatchObject({
      passed: false,
      detail: "Supabase env or VITE_SUPABASE_REDIRECT_URL missing or not deployed",
    });
    expect(packet.checks.find((check) => check.key === "pkceOAuth")).toMatchObject({
      passed: false,
      detail: "Supabase env or VITE_SUPABASE_REDIRECT_URL missing or not deployed",
    });
    expect(packet.checks.find((check) => check.key === "magicLink")).toMatchObject({
      passed: false,
      detail: "Supabase env or VITE_SUPABASE_REDIRECT_URL missing or not deployed",
    });
    expect(packet.missingTargets).toContain("Auth redirect URL");
    expect(packet.missingTargets).toContain("Google OAuth authorize URL");
    expect(packet.missingTargets).toContain("Google OAuth PKCE contract");
    expect(packet.missingTargets).toContain("Magic link auth endpoint");
  });

  it("does not mark account bootstrap ready from a local Supabase project URL", () => {
    const envText = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "user-1",
      proofId: "cap-1",
      modeIds: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
      allowFailures: true,
    });

    const packet = buildProductionAccountBootstrapPacket({
      envText,
      runtimeEnv: {
        ...runtimeEnv,
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      },
      publicAppUrl: "https://example.com/kickoff-lock-agent/",
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "supabaseUrl")).toMatchObject({
      passed: false,
      detail: "VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL",
    });
    expect(packet.checks.find((check) => check.key === "googleOAuth")).toMatchObject({
      passed: false,
      detail: "Supabase env or VITE_SUPABASE_REDIRECT_URL missing or not deployed",
    });
    expect(packet.checks.find((check) => check.key === "pkceOAuth")).toMatchObject({
      passed: false,
      detail: "Supabase env or VITE_SUPABASE_REDIRECT_URL missing or not deployed",
    });
    expect(packet.checks.find((check) => check.key === "magicLink")).toMatchObject({
      passed: false,
      detail: "Supabase env or VITE_SUPABASE_REDIRECT_URL missing or not deployed",
    });
  });

  it("does not mark account bootstrap ready from a generic HTTPS URL", () => {
    const envText = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "user-1",
      proofId: "cap-1",
      modeIds: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
      allowFailures: true,
    });

    const packet = buildProductionAccountBootstrapPacket({
      envText,
      runtimeEnv: {
        ...runtimeEnv,
        VITE_SUPABASE_URL: "https://example.com",
      },
      publicAppUrl: "https://example.com/kickoff-lock-agent/",
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "supabaseUrl")).toMatchObject({
      passed: false,
      detail: "VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL",
    });
  });
});
