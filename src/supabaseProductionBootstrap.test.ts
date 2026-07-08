import { describe, expect, it } from "vitest";
import { buildSupabaseProductionBootstrapPlan } from "./supabaseProductionBootstrap";

const fullEnv = {
  SUPABASE_DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
  VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  KICKOFF_SEED_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
  KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
  KICKOFF_VERIFY_USER_ID: "user-1",
  KICKOFF_VERIFY_PROFILE_ID: "user-1",
  KICKOFF_VERIFY_PROOF_ID: "cap-1",
  KICKOFF_VERIFY_MODE_IDS: "mode-bracket,mode-parlay,mode-agent,mode-upset,mode-group-path,mode-penalty-pressure",
  KICKOFF_VERIFY_FRIEND_CODE: "chengdu",
  KICKOFF_VERIFY_SEASON_KEY: "world-cup-run",
};

describe("Supabase production bootstrap plan", () => {
  it("blocks schema and target seeding until real Supabase env is present", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    });

    expect(plan.ready).toBe(false);
    expect(plan.blockedStages).toBe(4);
    expect(plan.missingEnv).toEqual(
      expect.arrayContaining([
        "SUPABASE_DB_URL",
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "VITE_SUPABASE_REDIRECT_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]),
    );
    expect(plan.stages.find((stage) => stage.id === "schema")).toMatchObject({
      status: "blocked",
      command: "bun run supabase:schema:check",
    });
    expect(plan.stages.find((stage) => stage.id === "auth")?.detail).toContain("Supabase auth is blocked by");
    expect(plan.nextAction).toContain("Apply Supabase schema");
  });

  it("prints a safe plan command queue when all target rows are already collected", () => {
    const plan = buildSupabaseProductionBootstrapPlan(fullEnv);

    expect(plan.ready).toBe(true);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "done",
    });
    expect(plan.stages.find((stage) => stage.id === "auth")).toMatchObject({
      status: "ready",
      command: "bun run runtime:config:check",
      outputEnv: ["Google OAuth authorize URL", "magic-link redirect URL"],
    });
    expect(plan.commands).toEqual(["bun run supabase:schema:check", "bun run runtime:config:check", "bun run doctor:supabase"]);
    expect(plan.readBackCommands).toHaveLength(8);
    expect(plan.readBackCommands.every((item) => item.ready)).toBe(true);
    expect(plan.readBackCommands.find((item) => item.label === "Prediction row")).toMatchObject({
      scope: "record",
      path: expect.stringContaining("id=eq.cap-1"),
      url: expect.stringContaining("https://project.supabase.co/rest/v1/kickoff_records"),
      authMode: "anon",
      targetIds: ["cap-1"],
      expectedUserId: "user-1",
      expectedFriendCode: "chengdu",
      expectedSeasonKey: "world-cup-run",
    });
    expect(plan.readBackCommands.find((item) => item.label === "Mode proof rows")).toMatchObject({
      scope: "mode",
      targetIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
      expectedUserId: "user-1",
      expectedFriendCode: "chengdu",
      expectedSeasonKey: "world-cup-run",
      responseExpectation: {
        responseType: "supabase-array",
        minRows: 6,
        targetIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        requiredFields: ["id", "user_id", "mode_id", "status", "score", "season_key", "friend_code"],
        expectedUserId: "user-1",
        expectedFriendCode: "chengdu",
        expectedSeasonKey: "world-cup-run",
        expectedSource: "cloud",
      },
    });
    expect(plan.readBackCommands.find((item) => item.label === "Profile row")?.command).toBe(
      "curl -sS 'https://project.supabase.co/rest/v1/kickoff_profiles?select=id,email,display_name,location,friend_code,season_key,updated_at&id=eq.user-1&limit=1' -H 'apikey: $VITE_SUPABASE_ANON_KEY' -H 'Authorization: Bearer $VITE_SUPABASE_ANON_KEY'",
    );
    expect(plan.authReadBackCommand.responseExpectation).toMatchObject({
      responseType: "supabase-auth-user",
      targetIds: ["user-1"],
      expectedUserId: "user-1",
      expectedSource: "cloud",
    });
    expect(plan.cleanSessionReadBackCommands).toHaveLength(8);
    expect(plan.cleanSessionReadBackCommands[0].responseExpectation).toMatchObject({
      responseType: "public-html",
      targetIds: ["user-1"],
      expectedSource: "cloud",
      requiresCleanSession: true,
      pageKind: "profile",
      queryParam: "profile",
    });
    expect(plan.copyText).not.toContain("Bearer anon");
    expect(plan.copyText).toContain("Kickoff Lock Agent Supabase production bootstrap");
    expect(plan.copyText).toContain("Verify account auth redirect");
    expect(plan.copyText).toContain("Supabase Auth admin read-back command");
    expect(plan.copyText).toContain(
      "curl -sS 'https://project.supabase.co/auth/v1/admin/users/user-1' -H 'apikey: $SUPABASE_SERVICE_ROLE_KEY'",
    );
    expect(plan.copyText).not.toContain("Authorization: Bearer service");
    expect(plan.copyText).toContain("Anonymous Supabase read-back commands");
    expect(plan.copyText).toContain("Clean-session public page read-back commands");
    expect(plan.copyText).toContain("curl -sS 'https://example.com/kickoff-lock-agent/?profile=user-1'");
    expect(plan.copyText).toContain("curl -sS 'https://project.supabase.co/rest/v1/kickoff_records");
    expect(plan.copyText).toContain("postgresql://postgres:***@db.project.supabase.co:5432/postgres");
    expect(plan.setup.projectRef).toBe("project");
    expect(plan.setup.apiSettingsUrl).toBe("https://supabase.com/dashboard/project/project/settings/api");
    expect(plan.setup.authRedirectUrlConfigUrl).toBe(
      "https://supabase.com/dashboard/project/project/auth/url-configuration",
    );
    expect(plan.setup.envTemplateText).toContain("VITE_SUPABASE_SHARE_BUCKET=kickoff-share-cards");
    expect(plan.setup.copyText).toContain("Kickoff Lock Agent Supabase setup packet");
    expect(plan.setup.checklist.map((item) => item.id)).toEqual([
      "create-project",
      "env-keys",
      "auth-redirect",
      "schema",
      "runtime-config",
      "share-storage",
      "seed-targets",
      "doctor",
    ]);
  });

  it("builds a setup packet for a blank project handoff", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    });

    expect(plan.setup.ready).toBe(false);
    expect(plan.setup.projectDashboardUrl).toBe("https://supabase.com/dashboard/projects");
    expect(plan.setup.redirectUrl).toBe("https://example.com/kickoff-lock-agent/");
    expect(plan.setup.nextAction).toContain("Open Supabase dashboard");
    expect(plan.setup.checklist.find((item) => item.id === "env-keys")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_DB_URL"]),
    });
    expect(plan.setup.copyText).toContain("VITE_SUPABASE_REDIRECT_URL=https://example.com/kickoff-lock-agent/");
    expect(plan.setup.copyText).toContain("bun run supabase:schema:apply");
    expect(plan.readBackCommands.every((item) => !item.ready)).toBe(true);
    expect(plan.readBackCommands[0]?.command).toContain("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  });

  it("switches command queue to write operations in execute mode", () => {
    const plan = buildSupabaseProductionBootstrapPlan(
      {
        ...fullEnv,
        KICKOFF_SEED_USER_ID: "user-1",
        KICKOFF_VERIFY_USER_ID: "",
        KICKOFF_VERIFY_PROFILE_ID: "",
        KICKOFF_VERIFY_PROOF_ID: "",
        KICKOFF_VERIFY_MODE_IDS: "",
      },
      { execute: true },
    );

    expect(plan.ready).toBe(true);
    expect(plan.commands).toEqual([
      "bun run supabase:schema:apply",
      "bun run runtime:config:check",
      "bun run seed:production-targets --upload-share-image --upload-mode-share-image",
      "bun run doctor:supabase",
    ]);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "ready",
    });
  });

  it("does not mark Supabase targets collected from a single mode proof id", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      KICKOFF_VERIFY_MODE_IDS: "mode-bracket",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "ready",
    });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids"]),
    });
  });

  it("blocks collected account targets when user id and profile id are from different accounts", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      KICKOFF_VERIFY_PROFILE_ID: "profile-2",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID"]),
    });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID"]),
    });
    expect(plan.copyText).toContain("KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID");
  });

  it("blocks account bootstrap when Google OAuth redirect does not match the deployed app", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      VITE_SUPABASE_REDIRECT_URL: "https://other.example.com/kickoff-lock-agent/",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "auth")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "VITE_SUPABASE_REDIRECT_URL (https://other.example.com/kickoff-lock-agent/) must match VITE_PUBLIC_APP_URL (https://example.com/kickoff-lock-agent/)",
      ]),
    });
    expect(plan.commands).toEqual(
      expect.arrayContaining(["bun run runtime:config:check", "bun run doctor:supabase"]),
    );
    expect(plan.setup.checklist.find((item) => item.id === "runtime-config")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "VITE_SUPABASE_REDIRECT_URL (https://other.example.com/kickoff-lock-agent/) must match VITE_PUBLIC_APP_URL (https://example.com/kickoff-lock-agent/)",
      ]),
    });
  });

  it("blocks account bootstrap when Supabase URL points to a local project", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "auth")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"]),
    });
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"]),
    });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"]),
    });
  });

  it("blocks account bootstrap when Supabase URL is HTTPS but not a Supabase project host", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      VITE_SUPABASE_URL: "https://example.com",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "auth")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"]),
    });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"]),
    });
  });

  it("requires a mode share image before seeding production account targets", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "",
      KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "",
      KICKOFF_SEED_USER_ID: "user-1",
      KICKOFF_VERIFY_USER_ID: "",
      KICKOFF_VERIFY_PROFILE_ID: "",
      KICKOFF_VERIFY_PROOF_ID: "",
      KICKOFF_VERIFY_MODE_IDS: "",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL missing",
      ]),
    });
    expect(plan.setup.checklist.find((item) => item.id === "share-storage")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL missing",
      ]),
    });
  });

  it("does not mark share-card upload ready without the Supabase service-role key", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      SUPABASE_SERVICE_ROLE_KEY: "",
    });

    expect(plan.setup.checklist.find((item) => item.id === "share-storage")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["SUPABASE_SERVICE_ROLE_KEY"]),
    });
    expect(plan.setup.copyText).toContain("Set the deployed Supabase URL, service-role key and share image targets");
  });

  it("allows public CDN share image URLs when seeding account targets", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      KICKOFF_SEED_SHARE_IMAGE_URL: "https://cdn.example.com/share.png",
      KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/mode-share.png",
      KICKOFF_SEED_USER_ID: "user-1",
      KICKOFF_VERIFY_USER_ID: "",
      KICKOFF_VERIFY_PROFILE_ID: "",
      KICKOFF_VERIFY_PROOF_ID: "",
      KICKOFF_VERIFY_MODE_IDS: "",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "ready",
      missingEnv: [],
    });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_VERIFY_USER_ID", "KICKOFF_VERIFY_MODE_IDS"]),
    });
  });

  it("blocks production seed writes until an explicit Auth user id is available", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      KICKOFF_SEED_SHARE_IMAGE_URL: "https://cdn.example.com/share.png",
      KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/mode-share.png",
      KICKOFF_VERIFY_USER_ID: "",
      KICKOFF_VERIFY_PROFILE_ID: "",
      KICKOFF_VERIFY_PROOF_ID: "",
      KICKOFF_VERIFY_MODE_IDS: "",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "seed")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_SEED_USER_ID or KICKOFF_VERIFY_USER_ID"]),
    });
    expect(plan.copyText).toContain("KICKOFF_SEED_USER_ID or KICKOFF_VERIFY_USER_ID");
  });

  it("does not seed account targets from local or non-image share URLs", () => {
    const plan = buildSupabaseProductionBootstrapPlan({
      ...fullEnv,
      KICKOFF_SEED_SHARE_IMAGE_URL: "http://localhost/share.png",
      KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/mode-share.svg",
      KICKOFF_VERIFY_USER_ID: "",
      KICKOFF_VERIFY_PROFILE_ID: "",
      KICKOFF_VERIFY_PROOF_ID: "",
      KICKOFF_VERIFY_MODE_IDS: "",
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
});
