import { describe, expect, it } from "vitest";
import { buildProductionEnvPlan, detectBlankEnvDeclarations } from "./productionEnvPlan";

const completeEnv = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon",
  VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  APIFOOTBALL_KEY: "server-api-football",
  FOOTBALL_DATA_TOKEN: "server-football-data",
  VITE_APIFOOTBALL_KEY: "api-football",
  VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
  VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
  VITE_FILECOIN_SEAL_TOKEN: "seal-token-production-123",
  SUPABASE_DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SYNAPSE_PRIVATE_KEY: `0x${"a".repeat(64)}`,
  FILECOIN_SEAL_TOKEN: "seal-token-production-123",
  FILECOIN_PROOF_STORE_PATH: "./proofs/filecoin-proof-store.json",
  ALLOW_ORIGIN: "https://example.com",
  CLOUDFLARE_API_TOKEN: "cloudflare-token",
  CLOUDFLARE_ACCOUNT_ID: "cloudflare-account",
  CLOUDFLARE_PAGES_PROJECT_NAME: "kickoff-lock-agent",
  KICKOFF_VERIFY_USER_ID: "user-1",
  KICKOFF_VERIFY_PROFILE_ID: "user-1",
  KICKOFF_VERIFY_PUBLIC_PROFILE_URL: "https://example.com/?profile=user-1",
  KICKOFF_VERIFY_PROOF_ID: "cap-1",
  KICKOFF_VERIFY_MODE_IDS: "mode-bracket,mode-parlay,mode-agent,mode-upset,mode-group-path,mode-penalty-pressure",
  KICKOFF_VERIFY_SHARE_ARTIFACT_IDS: "record:cap-1,mode:mode-bracket",
  KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID: "job-record",
  KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
  KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: "a".repeat(64),
  KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS: "job-mode-1,job-mode-2,job-mode-3,job-mode-4,job-mode-5,job-mode-6",
  KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-1,bafy-2,bafy-3,bafy-4,bafy-5,bafy-6",
  KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)].join(","),
  KICKOFF_VERIFY_FRIEND_CODE: "chengdu",
  KICKOFF_VERIFY_SEASON_KEY: "world-cup-run",
  KICKOFF_VERIFY_LEADERBOARD_SCOPES: "global,friend,season",
  KICKOFF_VERIFY_FIXTURE_IDS: "100,200,300",
  KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
    "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
  KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
  KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
  KICKOFF_VERIFY_ALLOW_FAILURES: "1",
};

describe("production env plan", () => {
  it("detects blank env declarations without exposing secret values", () => {
    expect(
      detectBlankEnvDeclarations(
        [
          "VITE_SUPABASE_URL=",
          "SUPABASE_SERVICE_ROLE_KEY=\"\"",
          "APIFOOTBALL_KEY='' # fill in Cloudflare",
          "VITE_PUBLIC_APP_URL=https://example.com/kickoff-lock-agent/",
        ].join("\n"),
        ".env.production.local",
      ),
    ).toEqual([
      { key: "VITE_SUPABASE_URL", fileName: ".env.production.local" },
      { key: "SUPABASE_SERVICE_ROLE_KEY", fileName: ".env.production.local" },
      { key: "APIFOOTBALL_KEY", fileName: ".env.production.local" },
    ]);
  });

  it("reports blank declarations only when the final production plan still needs that key", () => {
    const plan = buildProductionEnvPlan(
      {
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_ANON_KEY: "",
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      },
      {
        blankDeclarations: [
          { key: "VITE_SUPABASE_URL", fileName: ".env.production.local" },
          { key: "VITE_PUBLIC_APP_URL", fileName: ".env.production.local" },
        ],
      },
    );

    expect(plan.blankDeclarations).toEqual([{ key: "VITE_SUPABASE_URL", fileName: ".env.production.local" }]);
    expect(plan.copyText).toContain("Blank declarations: VITE_SUPABASE_URL (.env.production.local)");
    expect(plan.copyText).not.toContain("VITE_PUBLIC_APP_URL (.env.production.local)");
  });

  it("builds a grouped template for missing runtime, server and verification values", () => {
    const plan = buildProductionEnvPlan({
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    });

    expect(plan.ready).toBe(false);
    expect(plan.missingRequired).toEqual(
      expect.arrayContaining([
        "VITE_SUPABASE_URL",
        "SUPABASE_DB_URL",
        "SYNAPSE_PRIVATE_KEY",
        "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
      ]),
    );
    expect(plan.groups.map((group) => group.group)).toEqual(["runtime", "server", "deployment", "verification"]);
    expect(plan.templateText).toContain("# Browser runtime");
    expect(plan.templateText).toContain("VITE_SUPABASE_URL=");
    expect(plan.templateText).toContain("APIFOOTBALL_KEY=");
    expect(plan.templateText).toContain("# Server/service");
    expect(plan.templateText).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(plan.templateText).toContain("# Production targets");
    expect(plan.templateText).toContain("KICKOFF_VERIFY_MODE_IDS=");
    expect(plan.nextAction).toContain("supabase:bootstrap");
  });

  it("uses same-origin data and Filecoin switches as valid runtime alternatives", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      VITE_DATA_PROXY_URL: "",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_TOKEN: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
    });

    expect(plan.ready).toBe(true);
    expect(plan.missingRequired).toEqual([]);
    expect(plan.missingRequired).not.toContain("VITE_DATA_PROXY_URL");
    expect(plan.missingRequired).not.toContain("VITE_FILECOIN_SEAL_TOKEN");
    expect(plan.rows.find((row) => row.key === "VITE_DATA_PROXY_URL_OR_SAME_ORIGIN")?.status).toBe("filled");
    expect(plan.rows.find((row) => row.key === "APIFOOTBALL_KEY")).toMatchObject({
      group: "server",
      required: false,
      status: "filled",
    });
    expect(plan.rows.find((row) => row.key === "VITE_FILECOIN_SEAL_API_OR_SAME_ORIGIN")?.status).toBe("filled");
    expect(plan.rows.find((row) => row.key === "VITE_FILECOIN_SEAL_TOKEN")).toMatchObject({
      status: "filled",
      detail: "Same-origin proxy injects FILECOIN_SEAL_TOKEN server-side",
    });
    expect(plan.templateText).not.toContain("VITE_FILECOIN_SEAL_TOKEN=");
  });

  it("does not treat GitHub Pages as a same-origin Functions deployment", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      VITE_SUPABASE_REDIRECT_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      VITE_DATA_PROXY_URL: "",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_TOKEN: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
    });

    expect(plan.ready).toBe(false);
    expect(plan.missingRequired).toEqual(
      expect.arrayContaining(["VITE_DATA_PROXY_URL_OR_SAME_ORIGIN", "VITE_FILECOIN_SEAL_API_OR_SAME_ORIGIN"]),
    );
    expect(plan.rows.find((row) => row.key === "VITE_DATA_PROXY_URL_OR_SAME_ORIGIN")).toMatchObject({
      status: "missing",
      detail:
        "VITE_DATA_PROXY_SAME_ORIGIN cannot use same-origin backend routes on GitHub Pages; deploy Cloudflare Pages Functions or set an external Worker URL.",
    });
    expect(plan.rows.find((row) => row.key === "VITE_FILECOIN_SEAL_API_OR_SAME_ORIGIN")).toMatchObject({
      status: "missing",
      detail:
        "VITE_FILECOIN_SEAL_SAME_ORIGIN cannot use same-origin backend routes on GitHub Pages; deploy Cloudflare Pages Functions or set an external Worker URL.",
    });
  });

  it("requires the server-side API-Football key when same-origin data proxy carries enrichment", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      APIFOOTBALL_KEY: "",
      API_FOOTBALL_KEY: "",
      VITE_APIFOOTBALL_KEY: "",
      VITE_DATA_PROXY_URL: "",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
    });

    expect(plan.ready).toBe(false);
    expect(plan.missingRequired).toContain("APIFOOTBALL_KEY");
    expect(plan.rows.find((row) => row.key === "APIFOOTBALL_KEY")).toMatchObject({
      group: "server",
      required: true,
      status: "missing",
      command: "bun run data:providers:check",
    });
    expect(plan.templateText).toContain("# Server/service");
    expect(plan.templateText).toContain("APIFOOTBALL_KEY=");
  });

  it("requires the server-side Odds API key when proxied The Odds API reads are selected", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      ODDS_API_KEY: "",
      THE_ODDS_API_KEY: "",
      VITE_ODDS_API_KEY: "",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      VITE_DATA_PROXY_URL: "",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
    });

    expect(plan.ready).toBe(false);
    expect(plan.missingRequired).toContain("ODDS_API_KEY");
    expect(plan.rows.find((row) => row.key === "ODDS_API_KEY")).toMatchObject({
      group: "server",
      required: true,
      status: "missing",
      command: "bun run data:providers:check",
    });
    expect(plan.templateText).toContain("ODDS_API_KEY=");
  });

  it("requires the server-side Football-Data.org token when proxied matches and standings are selected", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      FOOTBALL_DATA_TOKEN: "",
      FOOTBALL_DATA_ORG_TOKEN: "",
      VITE_FOOTBALL_DATA_TOKEN: "",
      VITE_DATA_PROXY_URL: "",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
    });

    expect(plan.ready).toBe(false);
    expect(plan.missingRequired).toContain("FOOTBALL_DATA_TOKEN");
    expect(plan.rows.find((row) => row.key === "FOOTBALL_DATA_TOKEN")).toMatchObject({
      group: "server",
      required: true,
      status: "missing",
      command: "bun run data:providers:check",
      detail: "missing server-side token for proxied matches and standings",
    });
    expect(plan.templateText).toContain("FOOTBALL_DATA_TOKEN=");
  });

  it("prints both real variables for same-origin data proxy alternatives", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      VITE_DATA_PROXY_URL: "",
      VITE_DATA_PROXY_SAME_ORIGIN: "",
    });

    expect(plan.ready).toBe(false);
    expect(plan.missingRequired).toContain("VITE_DATA_PROXY_URL_OR_SAME_ORIGIN");
    expect(plan.missingRequired).not.toContain("VITE_DATA_PROXY_URL");
    expect(plan.missingRequired).not.toContain("VITE_DATA_PROXY_SAME_ORIGIN");
    expect(plan.templateText).toContain("VITE_DATA_PROXY_URL=");
    expect(plan.templateText).toContain("VITE_DATA_PROXY_SAME_ORIGIN=0");
  });

  it("deduplicates repeated alternative env rows in the copyable template", () => {
    const plan = buildProductionEnvPlan({
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    });

    expect(plan.templateText.match(/^VITE_DATA_PROXY_URL=/gm)).toHaveLength(1);
    expect(plan.templateText.match(/^VITE_DATA_PROXY_SAME_ORIGIN=0$/gm)).toHaveLength(1);
    expect(plan.templateText.match(/^APIFOOTBALL_KEY=/gm)).toHaveLength(1);
  });

  it("does not ask for a browser API-Football key when the data proxy can carry the server key", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      VITE_APIFOOTBALL_KEY: "",
      APIFOOTBALL_KEY: "server-api-football",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
    });

    expect(plan.ready).toBe(true);
    expect(plan.missingRequired).not.toContain("VITE_APIFOOTBALL_KEY");
    expect(plan.rows.find((row) => row.key === "APIFOOTBALL_KEY_OR_VITE_APIFOOTBALL_KEY_OR_DATA_PROXY")).toMatchObject({
      status: "filled",
      detail: "API-Football routed through data proxy",
    });
    expect(plan.templateText).not.toContain("VITE_APIFOOTBALL_KEY=");
  });

  it("requires Cloudflare Pages deployment auth when same-origin functions are selected", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      VITE_DATA_PROXY_URL: "",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
      CLOUDFLARE_API_TOKEN: "",
      CLOUDFLARE_ACCOUNT_ID: "",
      CLOUDFLARE_PAGES_PROJECT_NAME: "",
    });

    expect(plan.ready).toBe(false);
    expect(plan.missingRequired).toEqual(expect.arrayContaining(["CLOUDFLARE_DEPLOY_AUTH"]));
    expect(plan.missingRequired).not.toContain("CLOUDFLARE_PAGES_PROJECT_NAME");
    expect(plan.templateText).toContain("# Deployment");
    expect(plan.templateText).toContain("CLOUDFLARE_API_TOKEN=");
    expect(plan.templateText).toContain("CLOUDFLARE_ACCOUNT_ID=");
    expect(plan.templateText).toContain("CLOUDFLARE_WRANGLER_LOGIN=0");
    expect(plan.rows.find((row) => row.key === "CLOUDFLARE_PAGES_PROJECT_NAME")).toMatchObject({
      group: "deployment",
      required: true,
      status: "filled",
    });
  });

  it("accepts Wrangler OAuth login as the local Cloudflare deployment auth path", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      VITE_DATA_PROXY_URL: "",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
      CLOUDFLARE_API_TOKEN: "",
      CLOUDFLARE_ACCOUNT_ID: "",
      CLOUDFLARE_WRANGLER_LOGIN: "1",
    });

    expect(plan.ready).toBe(true);
    expect(plan.missingRequired).not.toContain("CLOUDFLARE_DEPLOY_AUTH");
    expect(plan.rows.find((row) => row.key === "CLOUDFLARE_DEPLOY_AUTH")).toMatchObject({
      group: "deployment",
      required: true,
      status: "filled",
    });
  });

  it("adds the trusted upstream when the Filecoin seal API is mounted through same-origin Pages Functions", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      FILECOIN_SEAL_UPSTREAM_URL: "",
    });

    expect(plan.ready).toBe(false);
    expect(plan.missingRequired).toContain("FILECOIN_SEAL_UPSTREAM_URL");
    expect(plan.rows.find((row) => row.key === "FILECOIN_SEAL_UPSTREAM_URL")).toMatchObject({
      group: "server",
      required: true,
      status: "missing",
      command: "bun run filecoin:api:check",
    });
    expect(plan.templateText).toContain("FILECOIN_SEAL_UPSTREAM_URL=");
  });

  it("keeps malformed production targets in the invalid list", () => {
    const plan = buildProductionEnvPlan({
      ...completeEnv,
      KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: "not-a-hash",
      KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX: "100:lineups=1|injuries=1|odds=1",
    });

    expect(plan.ready).toBe(false);
    expect(plan.invalidRequired).toEqual(
      expect.arrayContaining(["KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH", "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"]),
    );
    expect(plan.copyText).toContain("Invalid required:");
    expect(plan.templateText).toContain("KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH=");
    expect(plan.templateText).not.toContain("not-a-hash");
  });
});
