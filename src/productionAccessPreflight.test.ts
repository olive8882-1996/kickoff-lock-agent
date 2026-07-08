import { describe, expect, it } from "vitest";
import { buildProductionAccessPreflight, productionCliAuthenticated } from "./productionAccessPreflight";

const completeEnv = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
  SUPABASE_DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  APIFOOTBALL_KEY: "api-football",
  ODDS_API_KEY: "odds",
  VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
  FILECOIN_SEAL_UPSTREAM_URL: "https://seal.example/seal",
  FILECOIN_SEAL_TOKEN: "seal-token",
  SYNAPSE_PRIVATE_KEY: `0x${"a".repeat(64)}`,
  FILECOIN_PROOF_STORE_PATH: "./proofs/filecoin-proof-store.json",
  KICKOFF_VERIFY_MODE_IDS:
    "mode-prod-bracket,mode-prod-parlay,mode-prod-agent,mode-prod-upset,mode-prod-group,mode-prod-penalty",
  KICKOFF_VERIFY_SHARE_ARTIFACT_IDS:
    "record:cap-prod,mode:mode-prod-bracket,mode:mode-prod-parlay,mode:mode-prod-agent,mode:mode-prod-upset,mode:mode-prod-group,mode:mode-prod-penalty",
  KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://example.com/generated/record.png",
  KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://example.com/generated/mode.png",
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
  KICKOFF_VERIFY_USER_ID: "user-prod-1",
  KICKOFF_VERIFY_PROFILE_ID: "user-prod-1",
  KICKOFF_VERIFY_PUBLIC_PROFILE_URL: "https://example.com/kickoff-lock-agent/?profile=user-prod-1",
  KICKOFF_VERIFY_PROOF_ID: "cap-prod",
  KICKOFF_VERIFY_FRIEND_CODE: "chengdu",
  KICKOFF_VERIFY_SEASON_KEY: "world-cup-run",
  KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
  KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-1,bafy-2,bafy-3,bafy-4,bafy-5,bafy-6",
  KICKOFF_VERIFY_FIXTURE_IDS: "100,200,300",
  KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
    "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
};

describe("production access preflight", () => {
  it("recognizes unauthenticated Cloudflare and Supabase CLI output", () => {
    expect(
      productionCliAuthenticated({
        provider: "cloudflare",
        command: "bunx wrangler whoami",
        exitCode: 0,
        stdout: "You are not authenticated. Please run `wrangler login`.",
      }),
    ).toBe(false);
    expect(
      productionCliAuthenticated({
        provider: "supabase",
        command: "bunx supabase projects list",
        exitCode: 1,
        stderr: "Access token not provided. Supply an access token by running `supabase login`.",
      }),
    ).toBe(false);
  });

  it("turns current shell access problems into concise next actions", () => {
    const packet = buildProductionAccessPreflight({
      env: {
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_ANON_KEY: "",
        APIFOOTBALL_KEY: "",
      },
      cliChecks: [
        {
          provider: "cloudflare",
          command: "bunx wrangler whoami",
          exitCode: 0,
          stdout: "You are not authenticated. Please run `wrangler login`.",
        },
        {
          provider: "supabase",
          command: "bunx supabase projects list",
          exitCode: 1,
          stderr: "Access token not provided. Supply an access token by running `supabase login`.",
        },
      ],
    });

    expect(packet.ready).toBe(false);
    expect(packet.stageReadyCount).toBe(0);
    expect(packet.cliAuthenticated).toEqual({ cloudflare: false, supabase: false });
    expect(packet.stages.find((stage) => stage.id === "cloudflare-cli")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["CLOUDFLARE_API_TOKEN or wrangler login"]),
    });
    expect(packet.stages.find((stage) => stage.id === "supabase-cli")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["SUPABASE_ACCESS_TOKEN or supabase login"]),
    });
    expect(packet.stages.find((stage) => stage.id === "account-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["VITE_PUBLIC_APP_URL", "KICKOFF_VERIFY_PUBLIC_PROFILE_URL"]),
    });
    expect(packet.missingEnv).toEqual(expect.arrayContaining(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]));
    expect(packet.copyText).toContain("Cloudflare CLI: not authenticated");
  });

  it("blocks account cloud sync when redirect, profile identity or public profile URL are not production-safe", () => {
    const packet = buildProductionAccessPreflight({
      env: {
        ...completeEnv,
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/other/",
        KICKOFF_VERIFY_PROFILE_ID: "different-user",
        KICKOFF_VERIFY_PUBLIC_PROFILE_URL: "https://wrong.example/?proof=cap-prod",
        CLOUDFLARE_API_TOKEN: "cf-token",
        CLOUDFLARE_ACCOUNT_ID: "cf-account",
        SUPABASE_ACCESS_TOKEN: "sbp-token",
      },
    });

    const accountStage = packet.stages.find((stage) => stage.id === "account-cloud");
    expect(accountStage).toMatchObject({ status: "blocked" });
    expect(accountStage?.missingEnv).toEqual(
      expect.arrayContaining([
        "VITE_SUPABASE_REDIRECT_URL must match VITE_PUBLIC_APP_URL",
        "KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID",
        "KICKOFF_VERIFY_PUBLIC_PROFILE_URL must be a deployed profile URL for VITE_PUBLIC_APP_URL",
      ]),
    );
    expect(packet.nextAction).toContain("sharing:bootstrap");
  });

  it("accepts token auth or CLI login and generated target evidence as production-access ready", () => {
    const packet = buildProductionAccessPreflight({
      env: {
        ...completeEnv,
        CLOUDFLARE_API_TOKEN: "cf-token",
        CLOUDFLARE_ACCOUNT_ID: "cf-account",
        SUPABASE_ACCESS_TOKEN: "sbp-token",
      },
      cliChecks: [
        {
          provider: "cloudflare",
          command: "bunx wrangler whoami",
          exitCode: 0,
          stdout: "Getting User settings...\nYou are logged in with an API Token.",
        },
        {
          provider: "supabase",
          command: "bunx supabase projects list",
          exitCode: 0,
          stdout: "LINKED | ORG ID | PROJECT REF | NAME",
        },
      ],
    });

    expect(packet.ready).toBe(true);
    expect(packet.blockedStages).toBe(0);
    expect(packet.missingEnv).toEqual([]);
    expect(packet.nextAction).toContain("production:bootstrap -- --execute");
  });
});
