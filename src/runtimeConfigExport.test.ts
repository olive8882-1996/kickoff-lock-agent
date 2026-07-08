import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildRuntimeConfigJs,
  buildRuntimeConfigJsFromEnvTexts,
  evaluatePublishedRuntimeConfig,
  parseRuntimeConfigJs,
} from "./runtimeConfigExport";

describe("runtime config export", () => {
  it("loads runtime-config.js before the app bundle", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const runtimeScript = '<script type="module" src="%BASE_URL%runtime-config.js" vite-ignore></script>';
    const appScript = '<script type="module" src="/src/main.tsx"></script>';

    expect(html).toContain(runtimeScript);
    expect(html.indexOf(runtimeScript)).toBeLessThan(html.indexOf(appScript));
  });

  it("exports only browser runtime config keys", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      SYNAPSE_PRIVATE_KEY: "0xprivate",
      ODDS_API_KEY: "server-odds-secret",
    });

    expect(report.text).toContain("window.__KICKOFF_RUNTIME_CONFIG__");
    expect(report.text).toContain("https://project.supabase.co");
    expect(report.text).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(report.text).not.toContain("service-role-secret");
    expect(report.text).not.toContain("SYNAPSE_PRIVATE_KEY");
    expect(report.text).not.toContain("server-odds-secret");
    expect(report.json.VITE_SUPABASE_SHARE_BUCKET).toBe("kickoff-share-cards");
  });

  it("merges env files with later text and explicit env taking precedence", () => {
    const report = buildRuntimeConfigJsFromEnvTexts(
      [
        "VITE_SUPABASE_URL=https://old.supabase.co\nVITE_PUBLIC_APP_URL=https://old.example/\n",
        "VITE_SUPABASE_URL=https://new.supabase.co\n",
      ],
      {
        VITE_PUBLIC_APP_URL: "https://runtime.example/kickoff-lock-agent/",
        VITE_DATA_PROXY_URL: "https://data.example/proxy",
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
    );

    expect(report.json.VITE_SUPABASE_URL).toBe("https://new.supabase.co");
    expect(report.json.VITE_PUBLIC_APP_URL).toBe("https://runtime.example/kickoff-lock-agent/");
    expect(report.json.VITE_DATA_PROXY_URL).toBe("https://data.example/proxy");
    expect(report.presentKeys).toContain("VITE_FILECOIN_SEAL_API");
  });

  it("reports recommended runtime keys that still need production values", () => {
    const report = buildRuntimeConfigJs({});

    expect(report.ready).toBe(false);
    expect(report.missingRecommendedKeys).toEqual(
      expect.arrayContaining(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_PUBLIC_APP_URL"]),
    );
    expect(report.detail).toContain("missing recommended");
    expect(report.detail).toContain("VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1");
    expect(report.detail).toContain("VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1");
  });

  it("rejects generated runtime config values that are present but not production deployable", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/status",
      VITE_FILECOIN_SEAL_API: "https://seal.example/status",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
    });

    expect(report.ready).toBe(false);
    expect(report.missingRecommendedKeys).toEqual([]);
    expect(report.invalidRecommendedKeys).toEqual([
      "VITE_SUPABASE_URL",
      "VITE_DATA_PROXY_URL",
      "VITE_FILECOIN_SEAL_API",
    ]);
    expect(report.detail).toContain("invalid recommended VITE_SUPABASE_URL");
  });

  it("requires the browser data proxy runtime config to be a deployed /proxy endpoint", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/status",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
    });

    expect(report.ready).toBe(false);
    expect(report.invalidRecommendedKeys).toEqual(["VITE_DATA_PROXY_URL"]);
    expect(evaluatePublishedRuntimeConfig(report.text).invalidRecommendedKeys).toEqual(["VITE_DATA_PROXY_URL"]);
  });

  it("accepts same-origin data proxy runtime config instead of a separate worker URL", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
    });
    const evaluation = evaluatePublishedRuntimeConfig(report.text);

    expect(report.ready).toBe(true);
    expect(report.json.VITE_DATA_PROXY_URL).toBe("");
    expect(report.json.VITE_DATA_PROXY_SAME_ORIGIN).toBe("1");
    expect(report.missingRecommendedKeys).not.toContain("VITE_DATA_PROXY_URL");
    expect(evaluation.ready).toBe(true);
    expect(evaluation.presentRecommendedKeys).toContain("VITE_DATA_PROXY_URL");
  });

  it("auto-enables same-origin Pages Functions when runtime config is generated on Cloudflare Pages", () => {
    const report = buildRuntimeConfigJs({
      CF_PAGES: "1",
      CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      VITE_FILECOIN_SEAL_TOKEN: "should-not-ship",
    });
    const evaluation = evaluatePublishedRuntimeConfig(report.text);

    expect(report.ready).toBe(true);
    expect(report.json.VITE_PUBLIC_APP_URL).toBe("https://kickoff-lock-agent.pages.dev/");
    expect(report.json.VITE_DATA_PROXY_SAME_ORIGIN).toBe("1");
    expect(report.json.VITE_FILECOIN_SEAL_SAME_ORIGIN).toBe("1");
    expect(report.json.VITE_DATA_PROXY_URL).toBe("");
    expect(report.json.VITE_FILECOIN_SEAL_API).toBe("");
    expect(report.json.VITE_FILECOIN_SEAL_TOKEN).toBe("");
    expect(report.text).not.toContain("should-not-ship");
    expect(report.missingRecommendedKeys).toEqual([]);
    expect(evaluation.ready).toBe(true);
  });

  it("treats blank workflow same-origin vars as unset so Cloudflare Pages can auto-enable Functions", () => {
    const report = buildRuntimeConfigJs({
      VITE_PUBLIC_APP_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_DATA_PROXY_SAME_ORIGIN: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "",
    });

    expect(report.ready).toBe(true);
    expect(report.json.VITE_DATA_PROXY_SAME_ORIGIN).toBe("1");
    expect(report.json.VITE_FILECOIN_SEAL_SAME_ORIGIN).toBe("1");
    expect(report.missingRecommendedKeys).toEqual([]);
  });

  it("prefers CF_PAGES_URL over a stale GitHub Pages public URL during Cloudflare migration", () => {
    const report = buildRuntimeConfigJs({
      CF_PAGES: "1",
      CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
    });

    expect(report.ready).toBe(true);
    expect(report.json.VITE_PUBLIC_APP_URL).toBe("https://kickoff-lock-agent.pages.dev/");
    expect(report.json.VITE_DATA_PROXY_SAME_ORIGIN).toBe("1");
    expect(report.json.VITE_FILECOIN_SEAL_SAME_ORIGIN).toBe("1");
  });

  it("keeps explicit service URLs ahead of Cloudflare Pages same-origin defaults", () => {
    const report = buildRuntimeConfigJs({
      CF_PAGES: "1",
      CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_PUBLIC_APP_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
    });

    expect(report.ready).toBe(true);
    expect(report.json.VITE_DATA_PROXY_SAME_ORIGIN).toBe("0");
    expect(report.json.VITE_FILECOIN_SEAL_SAME_ORIGIN).toBe("0");
    expect(report.json.VITE_DATA_PROXY_URL).toBe("https://data.example.workers.dev/proxy");
    expect(report.json.VITE_FILECOIN_SEAL_API).toBe("https://seal.example/seal");
  });

  it("rejects same-origin runtime config on GitHub Pages because it has no backend Functions", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
    });
    const evaluation = evaluatePublishedRuntimeConfig(report.text);

    expect(report.ready).toBe(false);
    expect(report.invalidRecommendedKeys).toEqual(["VITE_DATA_PROXY_URL", "VITE_FILECOIN_SEAL_API"]);
    expect(evaluation.ready).toBe(false);
    expect(evaluation.invalidRecommendedKeys).toEqual(["VITE_DATA_PROXY_URL", "VITE_FILECOIN_SEAL_API"]);
  });

  it("accepts same-origin Filecoin seal runtime config instead of a separate seal URL", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token-that-stays-server-side",
    });
    const evaluation = evaluatePublishedRuntimeConfig(report.text);

    expect(report.ready).toBe(true);
    expect(report.json.VITE_FILECOIN_SEAL_API).toBe("");
    expect(report.json.VITE_FILECOIN_SEAL_SAME_ORIGIN).toBe("1");
    expect(report.json.VITE_FILECOIN_SEAL_TOKEN).toBe("");
    expect(report.text).not.toContain("seal-token-that-stays-server-side");
    expect(report.missingRecommendedKeys).not.toContain("VITE_FILECOIN_SEAL_API");
    expect(report.missingRecommendedKeys).not.toContain("VITE_FILECOIN_SEAL_TOKEN");
    expect(evaluation.ready).toBe(true);
    expect(evaluation.presentRecommendedKeys).toContain("VITE_FILECOIN_SEAL_API");
    expect(evaluation.presentRecommendedKeys).toContain("VITE_FILECOIN_SEAL_TOKEN");
  });

  it("parses and evaluates the published runtime config asset", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
    });
    const evaluation = evaluatePublishedRuntimeConfig(report.text, {
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
    });

    expect(parseRuntimeConfigJs(report.text)?.VITE_SUPABASE_URL).toBe("https://project.supabase.co");
    expect(evaluation).toMatchObject({
      ready: true,
      parsed: true,
      missingRecommendedKeys: [],
      invalidRecommendedKeys: [],
      mismatchedKeys: [],
      forbiddenKeys: [],
    });
    expect(evaluation.detail).toContain("recommended runtime keys published");
    expect(report.readBackCommands).toEqual([
      expect.objectContaining({
        id: "local-strict-check",
        command: "bun run runtime:config:check",
        ready: true,
      }),
      expect.objectContaining({
        id: "published-runtime-config",
        url: "https://example.com/kickoff-lock-agent/runtime-config.js",
        command: "curl -sS 'https://example.com/kickoff-lock-agent/runtime-config.js'",
        ready: true,
      }),
    ]);
    expect(report.readBackCommands.map((item) => item.command).join("\n")).not.toContain("seal-token");
  });

  it("rejects published runtime config that is missing keys, mismatched or leaking server secrets", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_PUBLIC_APP_URL: "https://old.example/kickoff-lock-agent/",
    });
    const text = report.text.replace(
      /\n\}\n\);/,
      ',\n  "SUPABASE_SERVICE_ROLE_KEY": "service-role-secret"\n}\n);',
    );
    const evaluation = evaluatePublishedRuntimeConfig(text, {
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    });

    expect(evaluation.ready).toBe(false);
    expect(report.readBackCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-strict-check",
          ready: false,
        }),
        expect.objectContaining({
          id: "published-runtime-config",
          url: "https://old.example/kickoff-lock-agent/runtime-config.js",
          ready: false,
        }),
      ]),
    );
    expect(evaluation.missingRecommendedKeys).toEqual(
      expect.arrayContaining(["VITE_SUPABASE_ANON_KEY", "VITE_FILECOIN_SEAL_API"]),
    );
    expect(evaluation.detail).toContain("VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1");
    expect(evaluation.mismatchedKeys).toEqual(["VITE_PUBLIC_APP_URL"]);
    expect(evaluation.forbiddenKeys).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(evaluation.detail).toContain("forbidden SUPABASE_SERVICE_ROLE_KEY");
  });

  it("rejects published runtime config values that point to local or non-endpoint service URLs", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://other.example.com/kickoff-lock-agent/",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_DATA_PROXY_URL: "http://localhost:8787/proxy",
      VITE_FILECOIN_SEAL_API: "https://seal.example/status",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
    });
    const evaluation = evaluatePublishedRuntimeConfig(report.text);

    expect(evaluation.ready).toBe(false);
    expect(evaluation.invalidRecommendedKeys).toEqual([
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_REDIRECT_URL",
      "VITE_DATA_PROXY_URL",
      "VITE_FILECOIN_SEAL_API",
    ]);
    expect(evaluation.detail).toContain(
      "invalid VITE_SUPABASE_URL, VITE_SUPABASE_REDIRECT_URL, VITE_DATA_PROXY_URL, VITE_FILECOIN_SEAL_API",
    );
  });

  it("allows redirect URLs that normalize to the public app URL", () => {
    const report = buildRuntimeConfigJs({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
      VITE_FILECOIN_SEAL_TOKEN: "seal-token",
    });
    const evaluation = evaluatePublishedRuntimeConfig(report.text);

    expect(report.ready).toBe(true);
    expect(report.invalidRecommendedKeys).toEqual([]);
    expect(evaluation.ready).toBe(true);
  });
});
