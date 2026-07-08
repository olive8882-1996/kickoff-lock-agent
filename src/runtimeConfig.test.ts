import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRuntimeConfigReadiness,
  resolvedFilecoinSealApiUrl,
  resolvedDataProxyUrl,
  runtimeConfigValue,
  sameOriginBackendHostProblem,
  summarizeRuntimeConfigReadiness,
} from "./runtimeConfig";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runtime config readiness", () => {
  it("keeps production gates incomplete when required env vars are missing", () => {
    const items = buildRuntimeConfigReadiness({ BASE_URL: "/kickoff-lock-agent/" });
    const summary = summarizeRuntimeConfigReadiness(items);

    expect(summary.ready).toBe(false);
    expect(items.find((item) => item.key === "supabase-core")?.passed).toBe(false);
    expect(items.find((item) => item.key === "public-app-url")?.passed).toBe(false);
    expect(items.find((item) => item.key === "public-base-path")?.required).toBe(false);
    expect(items.find((item) => item.key === "data-proxy")?.required).toBe(false);
    expect(items.find((item) => item.key === "data-proxy")?.action).toContain("data-proxy-worker");
    expect(items.find((item) => item.key === "api-football-enrichment")?.action).toContain("API-Football");
    expect(items.find((item) => item.key === "filecoin-seal-api")?.detail.toLowerCase()).toContain("missing");
    expect(items.find((item) => item.key === "share-storage-bucket")).toMatchObject({
      passed: true,
      detail: "kickoff-share-cards",
    });
  });

  it("passes required gates when account, data, Filecoin and public URL env vars are present", () => {
    const items = buildRuntimeConfigReadiness({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
      VITE_APIFOOTBALL_KEY: "api-football",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      BASE_URL: "/kickoff-lock-agent/",
    });
    const summary = summarizeRuntimeConfigReadiness(items);

    expect(summary.ready).toBe(true);
    expect(summary.requiredPassed).toBe(summary.requiredTotal);
    expect(items.find((item) => item.key === "odds-enrichment")?.passed).toBe(true);
    expect(items.find((item) => item.key === "public-app-url")?.detail).toBe("https://example.com/kickoff-lock-agent/");
    expect(items.find((item) => item.key === "share-storage-bucket")?.passed).toBe(true);
    expect(items.find((item) => item.key === "football-data-backup")?.required).toBe(false);
    expect(items.find((item) => item.key === "data-proxy")?.passed).toBe(true);
  });

  it("accepts The Odds API as an odds provider when API-Football is absent", () => {
    const items = buildRuntimeConfigReadiness({
      VITE_ODDS_API_KEY: "odds",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
    });

    expect(items.find((item) => item.key === "odds-enrichment")?.passed).toBe(true);
  });

  it("accepts The Odds API through a deployed data proxy without exposing a browser odds key", () => {
    const items = buildRuntimeConfigReadiness({
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_ODDS_API_KEY: "",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
    });

    expect(items.find((item) => item.key === "odds-enrichment")).toMatchObject({
      passed: true,
      detail: "The Odds API routed through data proxy",
    });
  });

  it("accepts a same-origin deployed data proxy when no separate worker URL is configured", () => {
    const env = {
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
    };
    const items = buildRuntimeConfigReadiness(env);

    expect(resolvedDataProxyUrl(env)).toBe("https://example.com/data-proxy/proxy");
    expect(items.find((item) => item.key === "data-proxy")).toMatchObject({
      passed: true,
      detail: "https://example.com/data-proxy/proxy (same-origin)",
    });
    expect(items.find((item) => item.key === "api-football-enrichment")).toMatchObject({
      passed: true,
      detail: "API-Football routed through data proxy",
    });
    expect(items.find((item) => item.key === "football-data-backup")).toMatchObject({
      passed: true,
      detail: "Football-Data.org routed through data proxy",
    });
    expect(items.find((item) => item.key === "odds-enrichment")).toMatchObject({
      passed: true,
      detail: "API-Football odds routed through data proxy",
    });
  });

  it("does not accept GitHub Pages as a same-origin backend host", () => {
    const env = {
      VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
    };
    const items = buildRuntimeConfigReadiness(env);

    expect(sameOriginBackendHostProblem(env.VITE_PUBLIC_APP_URL, "VITE_DATA_PROXY_SAME_ORIGIN")).toContain(
      "GitHub Pages",
    );
    expect(resolvedDataProxyUrl(env)).toBe("https://olive8882-1996.github.io/data-proxy/proxy");
    expect(resolvedFilecoinSealApiUrl(env)).toBe("https://olive8882-1996.github.io/seal");
    expect(items.find((item) => item.key === "data-proxy")).toMatchObject({
      passed: false,
      detail:
        "VITE_DATA_PROXY_SAME_ORIGIN cannot use same-origin backend routes on GitHub Pages; deploy Cloudflare Pages Functions or set an external Worker URL.",
    });
    expect(items.find((item) => item.key === "filecoin-seal-api")).toMatchObject({
      passed: false,
      detail:
        "VITE_FILECOIN_SEAL_SAME_ORIGIN cannot use same-origin backend routes on GitHub Pages; deploy Cloudflare Pages Functions or set an external Worker URL.",
    });
    expect(items.find((item) => item.key === "api-football-enrichment")).toMatchObject({
      passed: false,
      detail: "Missing VITE_APIFOOTBALL_KEY or deployed data proxy with server-side APIFOOTBALL_KEY",
    });
  });

  it("accepts a same-origin Filecoin seal API when no separate seal URL is configured", () => {
    const env = {
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
    };
    const items = buildRuntimeConfigReadiness(env);

    expect(resolvedFilecoinSealApiUrl(env)).toBe("https://example.com/seal");
    expect(items.find((item) => item.key === "filecoin-seal-api")).toMatchObject({
      passed: true,
      detail: "https://example.com/seal (same-origin)",
    });
  });

  it("lets deployed runtime config override missing build-time env", () => {
    vi.stubGlobal("window", {
      __KICKOFF_RUNTIME_CONFIG__: {
        VITE_SUPABASE_URL: "https://runtime.supabase.co",
        VITE_SUPABASE_ANON_KEY: "runtime-anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        VITE_APIFOOTBALL_KEY: "runtime-football",
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "runtime-token",
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      },
    });

    const items = buildRuntimeConfigReadiness({});
    const summary = summarizeRuntimeConfigReadiness(items);

    expect(summary.ready).toBe(true);
    expect(runtimeConfigValue({}, "VITE_SUPABASE_URL")).toBe("https://runtime.supabase.co");
    expect(items.find((item) => item.key === "supabase-core")?.passed).toBe(true);
    expect(items.find((item) => item.key === "filecoin-seal-api")?.detail).toBe("https://seal.example/seal");
  });

  it("does not accept localhost or path-only URLs as public sharing evidence", () => {
    const localhostItems = buildRuntimeConfigReadiness({
      VITE_PUBLIC_APP_URL: "http://localhost:5173/kickoff-lock-agent/",
      VITE_SUPABASE_REDIRECT_URL: "http://localhost:5173/kickoff-lock-agent/",
    });
    const pathOnlyItems = buildRuntimeConfigReadiness({
      VITE_PUBLIC_APP_URL: "/kickoff-lock-agent/",
      VITE_SUPABASE_REDIRECT_URL: "/kickoff-lock-agent/",
    });

    expect(localhostItems.find((item) => item.key === "public-app-url")?.passed).toBe(false);
    expect(localhostItems.find((item) => item.key === "supabase-redirect")?.passed).toBe(false);
    expect(pathOnlyItems.find((item) => item.key === "public-app-url")?.passed).toBe(false);
    expect(pathOnlyItems.find((item) => item.key === "supabase-redirect")?.passed).toBe(false);
  });

  it("requires the OAuth redirect URL to match the deployed public app URL", () => {
    const items = buildRuntimeConfigReadiness({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://other.example.com/kickoff-lock-agent/",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_APIFOOTBALL_KEY: "api-football",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
    });

    expect(summarizeRuntimeConfigReadiness(items).ready).toBe(false);
    expect(items.find((item) => item.key === "supabase-redirect")).toMatchObject({
      passed: false,
      detail:
        "VITE_SUPABASE_REDIRECT_URL (https://other.example.com/kickoff-lock-agent/) must match VITE_PUBLIC_APP_URL (https://example.com/kickoff-lock-agent/)",
    });
  });

  it("rejects non-production runtime service URLs even when they are non-empty", () => {
    const items = buildRuntimeConfigReadiness({
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
      VITE_APIFOOTBALL_KEY: "api-football",
      VITE_DATA_PROXY_URL: "http://localhost:8787/proxy",
      VITE_FILECOIN_SEAL_API: "https://seal.example/status",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
    });

    expect(summarizeRuntimeConfigReadiness(items).ready).toBe(false);
    expect(items.find((item) => item.key === "supabase-core")).toMatchObject({
      passed: false,
      detail: "VITE_SUPABASE_URL http://127.0.0.1:54321 is not a deployed HTTPS URL",
    });
    expect(items.find((item) => item.key === "data-proxy")).toMatchObject({
      passed: false,
      detail: "VITE_DATA_PROXY_URL http://localhost:8787/proxy is not a deployed HTTPS URL",
    });
    expect(items.find((item) => item.key === "filecoin-seal-api")).toMatchObject({
      passed: false,
      detail: "VITE_FILECOIN_SEAL_API https://seal.example/status must point to the deployed /seal endpoint",
    });
  });
});
