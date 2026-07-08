import { describe, expect, it } from "vitest";
import { buildProductionSecretsHandoff } from "./productionSecretsHandoff";
import type { ProductionAcceptanceCollectorPacket } from "./productionAcceptanceCollector";
import type { ProductionEnvPlanPacket } from "./productionEnvPlan";

const collector = (): ProductionAcceptanceCollectorPacket => ({
  ready: false,
  stageReadyCount: 1,
  totalStages: 9,
  blockedStages: 8,
  missingRuntimeEnv: [],
  missingVerifyEnv: [],
  commands: ["bun run pages:cf:preflight && bun run pages:cf:deploy"],
  nextAction: "Deploy Cloudflare same-origin backend routes.",
  copyText: "production acceptance collector",
  stages: [
    {
      id: "cloudflare-pages-backend",
      label: "Deploy Cloudflare same-origin backend routes",
      status: "blocked",
      command: "bun run pages:cf:preflight && bun run pages:cf:deploy",
      requiredEnv: [
        "APIFOOTBALL_KEY",
        "FOOTBALL_DATA_TOKEN",
        "ODDS_API_KEY",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "FILECOIN_SEAL_TOKEN",
        "ALLOW_ORIGIN",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
      ],
      outputEnv: [],
      missingEnv: [
        "APIFOOTBALL_KEY",
        "FOOTBALL_DATA_TOKEN",
        "ODDS_API_KEY",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "FILECOIN_SEAL_TOKEN",
        "ALLOW_ORIGIN",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
      ],
      producedEnv: [],
      detail: "Deploy same-origin backend routes.",
    },
  ],
});

const envPlan = (missingRequired: string[] = []): ProductionEnvPlanPacket => ({
  ready: missingRequired.length === 0,
  rows: [],
  missingRequired,
  invalidRequired: [],
  blankDeclarations: missingRequired.map((key) => ({ key, fileName: ".env.production.local" })),
  groups: [],
  templateText: "",
  copyText: "",
  nextAction: "Fill production values.",
});

const completeEnv = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
  SUPABASE_DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  APIFOOTBALL_KEY: "api-football",
  FOOTBALL_DATA_TOKEN: "football-data",
  ODDS_API_KEY: "odds",
  FILECOIN_SEAL_UPSTREAM_URL: "https://seal.example/seal",
  FILECOIN_SEAL_TOKEN: "server-token",
  ALLOW_ORIGIN: "https://app.example.com",
  FILECOIN_PROOF_STORE_PATH: "./proofs/filecoin-proof-store.json",
  SYNAPSE_PRIVATE_KEY: `0x${"a".repeat(64)}`,
  CLOUDFLARE_API_TOKEN: "cf-token",
  CLOUDFLARE_ACCOUNT_ID: "cf-account",
  KICKOFF_VERIFY_PUBLIC_PROFILE_URL: "https://example.com/?profile=user-1",
  KICKOFF_VERIFY_SHARE_ARTIFACT_IDS: "record:cap-1,mode:mode-bracket",
  KICKOFF_VERIFY_LEADERBOARD_SCOPES: "global,friend,season",
  KICKOFF_VERIFY_FIXTURE_IDS: "100,200,300",
  KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
    "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
  KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
  KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-1,bafy-2,bafy-3,bafy-4,bafy-5,bafy-6",
  KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/record.png",
  KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/mode.png",
};

describe("production secrets handoff", () => {
  it("separates manual production secrets from generated verification targets", () => {
    const handoff = buildProductionSecretsHandoff({
      env: {
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_ANON_KEY: "",
        APIFOOTBALL_KEY: "",
        KICKOFF_VERIFY_FIXTURE_IDS: "",
      },
      envPlan: envPlan(["VITE_SUPABASE_URL", "KICKOFF_VERIFY_FIXTURE_IDS"]),
      collector: collector(),
    });

    expect(handoff.ready).toBe(false);
    expect(handoff.missingManualKeys).toEqual(
      expect.arrayContaining([
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "APIFOOTBALL_KEY",
        "ODDS_API_KEY",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "FILECOIN_SEAL_TOKEN",
        "ALLOW_ORIGIN",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
      ]),
    );
    expect(handoff.missingGeneratedKeys).toEqual(
      expect.arrayContaining([
        "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
        "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
        "KICKOFF_VERIFY_FIXTURE_IDS",
      ]),
    );
    expect(handoff.groups.find((group) => group.id === "verification-targets")).toMatchObject({
      destination: "generated-evidence",
      generatedMissing: expect.arrayContaining([
        "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
        "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
        "KICKOFF_VERIFY_FIXTURE_IDS",
      ]),
    });
    expect(handoff.copyText).toContain("Manual missing:");
    expect(handoff.copyText).toContain("Generated missing:");
  });

  it("points Cloudflare same-origin backend keys to Cloudflare Pages instead of browser runtime", () => {
    const handoff = buildProductionSecretsHandoff({
      env: {},
      collector: collector(),
    });

    expect(handoff.groups.find((group) => group.id === "cloudflare")).toMatchObject({
      destination: "cloudflare-pages",
      manualMissing: expect.arrayContaining([
        "APIFOOTBALL_KEY",
        "ODDS_API_KEY",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "FILECOIN_SEAL_TOKEN",
        "ALLOW_ORIGIN",
      ]),
    });
    expect(handoff.groups.find((group) => group.id === "cloudflare")?.generatedMissing).toContain("FOOTBALL_DATA_TOKEN");
    expect(handoff.groups.find((group) => group.id === "cloudflare-auth")).toMatchObject({
      destination: "cloudflare-deploy",
      manualMissing: expect.arrayContaining(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]),
    });
    expect(handoff.copyText).toContain("Cloudflare Pages same-origin backend");
    expect(handoff.setupCommands).toEqual(
      expect.arrayContaining([
        "printf '%s' \"$APIFOOTBALL_KEY\" | bunx wrangler pages secret put APIFOOTBALL_KEY --project-name 'kickoff-lock-agent'",
        "printf '%s' \"$ODDS_API_KEY\" | bunx wrangler pages secret put ODDS_API_KEY --project-name 'kickoff-lock-agent'",
        "printf '%s' \"$ALLOW_ORIGIN\" | bunx wrangler pages secret put ALLOW_ORIGIN --project-name 'kickoff-lock-agent'",
      ]),
    );
    expect(handoff.copyText).toContain("Setup commands:");
  });

  it("separates filled keys with stale collector evidence from genuinely missing secrets", () => {
    const handoff = buildProductionSecretsHandoff({
      env: completeEnv,
      collector: collector(),
    });

    expect(handoff.ready).toBe(false);
    expect(handoff.missingManualKeys).toEqual([]);
    expect(handoff.groups.find((group) => group.id === "cloudflare")).toMatchObject({
      manualMissing: [],
      staleEvidence: expect.arrayContaining([
        "APIFOOTBALL_KEY",
        "FOOTBALL_DATA_TOKEN",
        "ODDS_API_KEY",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "FILECOIN_SEAL_TOKEN",
        "ALLOW_ORIGIN",
      ]),
    });
    expect(handoff.groups.find((group) => group.id === "cloudflare-auth")).toMatchObject({
      manualMissing: [],
      staleEvidence: expect.arrayContaining(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]),
    });
    expect(handoff.staleEvidenceKeys).toEqual(
      expect.arrayContaining([
        "APIFOOTBALL_KEY",
        "FOOTBALL_DATA_TOKEN",
        "ODDS_API_KEY",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "ALLOW_ORIGIN",
        "CLOUDFLARE_API_TOKEN",
      ]),
    );
    expect(handoff.nextAction).toContain("Rerun production verification");
    expect(handoff.copyText).toContain("Stale evidence:");
  });

  it("marks the handoff ready when manual secrets and generated targets are all present", () => {
    const handoff = buildProductionSecretsHandoff({
      env: completeEnv,
      envPlan: envPlan(),
    });

    expect(handoff.ready).toBe(true);
    expect(handoff.missingManualKeys).toEqual([]);
    expect(handoff.missingGeneratedKeys).toEqual([]);
    expect(handoff.staleEvidenceKeys).toEqual([]);
    expect(handoff.nextAction).toBe("All production secrets and generated verification targets are ready.");
  });
});
