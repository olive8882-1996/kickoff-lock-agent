import { describe, expect, it } from "vitest";
import { buildRuntimeConfigReadiness, summarizeRuntimeConfigReadiness } from "./runtimeConfig";

describe("runtime config readiness", () => {
  it("keeps production gates incomplete when required env vars are missing", () => {
    const items = buildRuntimeConfigReadiness({ BASE_URL: "/kickoff-lock-agent/" });
    const summary = summarizeRuntimeConfigReadiness(items);

    expect(summary.ready).toBe(false);
    expect(items.find((item) => item.key === "supabase-core")?.passed).toBe(false);
    expect(items.find((item) => item.key === "public-app-url")?.passed).toBe(false);
    expect(items.find((item) => item.key === "public-base-path")?.required).toBe(false);
    expect(items.find((item) => item.key === "api-football-enrichment")?.action).toContain("API-Football");
    expect(items.find((item) => item.key === "filecoin-seal-api")?.detail).toContain("Missing");
  });

  it("passes required gates when account, data, Filecoin and public URL env vars are present", () => {
    const items = buildRuntimeConfigReadiness({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
      VITE_APIFOOTBALL_KEY: "api-football",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      BASE_URL: "/kickoff-lock-agent/",
    });
    const summary = summarizeRuntimeConfigReadiness(items);

    expect(summary.ready).toBe(true);
    expect(summary.requiredPassed).toBe(summary.requiredTotal);
    expect(items.find((item) => item.key === "odds-enrichment")?.passed).toBe(true);
    expect(items.find((item) => item.key === "public-app-url")?.detail).toBe("https://example.com/kickoff-lock-agent/");
    expect(items.find((item) => item.key === "share-storage-bucket")?.passed).toBe(true);
    expect(items.find((item) => item.key === "football-data-backup")?.required).toBe(false);
  });

  it("accepts The Odds API as an odds provider when API-Football is absent", () => {
    const items = buildRuntimeConfigReadiness({
      VITE_ODDS_API_KEY: "odds",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
    });

    expect(items.find((item) => item.key === "odds-enrichment")?.passed).toBe(true);
  });

  it("does not accept localhost or path-only URLs as public sharing evidence", () => {
    const localhostItems = buildRuntimeConfigReadiness({
      VITE_PUBLIC_APP_URL: "http://localhost:5173/kickoff-lock-agent/",
    });
    const pathOnlyItems = buildRuntimeConfigReadiness({
      VITE_PUBLIC_APP_URL: "/kickoff-lock-agent/",
    });

    expect(localhostItems.find((item) => item.key === "public-app-url")?.passed).toBe(false);
    expect(pathOnlyItems.find((item) => item.key === "public-app-url")?.passed).toBe(false);
  });
});
