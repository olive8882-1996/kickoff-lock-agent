import { describe, expect, it } from "vitest";
import {
  REQUIRED_CLOUDFLARE_PAGES_FUNCTION_ENTRIES,
  buildCloudflarePagesRuntimePreflight,
} from "./cloudflarePagesDeployPreflight";

const validFunctionEntries = () =>
  Object.fromEntries(
    REQUIRED_CLOUDFLARE_PAGES_FUNCTION_ENTRIES.map((entry) => [
      entry.path,
      `import worker from "${entry.workerImport}";\n\nexport const onRequest = ({ request, env, ctx }) => worker.fetch(request, env, ctx);\n`,
    ]),
  );

describe("Cloudflare Pages deploy preflight", () => {
  it("does not require function secrets when same-origin routes are disabled", () => {
    const preflight = buildCloudflarePagesRuntimePreflight({});

    expect(preflight).toMatchObject({
      sameOriginData: false,
      sameOriginSeal: false,
      functionsReady: true,
      problems: [],
    });
  });

  it("auto-selects same-origin Functions on Cloudflare Pages when no external service URLs are configured", () => {
    const preflight = buildCloudflarePagesRuntimePreflight(
      {
        CF_PAGES: "1",
        CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
      },
      { functionEntries: validFunctionEntries() },
    );

    expect(preflight).toMatchObject({
      sameOriginData: true,
      sameOriginSeal: true,
      functionsReady: true,
    });
    expect(preflight.problems).toEqual([
      "APIFOOTBALL_KEY is missing for same-origin /data-proxy enrichment.",
      "FOOTBALL_DATA_TOKEN is missing for same-origin /data-proxy standings backup.",
      "FILECOIN_SEAL_UPSTREAM_URL is missing.",
      "FILECOIN_SEAL_TOKEN is missing for same-origin /seal token injection.",
    ]);
  });

  it("fails same-origin preflight when a required Pages Function entry is missing or not wired to the shared worker", () => {
    const entries = validFunctionEntries();
    delete entries["functions/jobs/[[path]].js"];
    entries["functions/data-proxy/[[path]].js"] = "export const onRequest = () => new Response('ok');";

    const preflight = buildCloudflarePagesRuntimePreflight(
      {
        CF_PAGES: "1",
        CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
        APIFOOTBALL_KEY: "server-api-football",
        FOOTBALL_DATA_TOKEN: "server-football-data",
        FILECOIN_SEAL_UPSTREAM_URL: "https://seal.example.com/seal",
        FILECOIN_SEAL_TOKEN: "server-token",
      },
      { functionEntries: entries },
    );

    expect(preflight.functionsReady).toBe(false);
    expect(preflight.functionEntryProblems).toEqual([
      "functions/data-proxy/[[path]].js must import ../../server/data-proxy-worker.mjs.",
      "functions/data-proxy/[[path]].js must forward request, env and ctx to the shared worker.",
      "functions/jobs/[[path]].js is missing from the Pages Functions bundle.",
    ]);
    expect(preflight.problems).toEqual(preflight.functionEntryProblems);
  });

  it("does not select same-origin Functions when external worker URLs are configured", () => {
    const preflight = buildCloudflarePagesRuntimePreflight({
      CF_PAGES: "1",
      CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_FILECOIN_SEAL_API: "https://seal.example.com/seal",
    });

    expect(preflight).toMatchObject({
      sameOriginData: false,
      sameOriginSeal: false,
      functionsReady: true,
      problems: [],
    });
  });

  it("requires data-provider secrets when same-origin data proxy enrichment is enabled", () => {
    const preflight = buildCloudflarePagesRuntimePreflight(
      {
        VITE_DATA_PROXY_SAME_ORIGIN: "1",
        VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      },
      { functionEntries: validFunctionEntries() },
    );

    expect(preflight.sameOriginData).toBe(true);
    expect(preflight.problems).toEqual([
      "APIFOOTBALL_KEY is missing for same-origin /data-proxy enrichment.",
      "FOOTBALL_DATA_TOKEN is missing for same-origin /data-proxy standings backup.",
      "ODDS_API_KEY is missing for proxied The Odds API reads.",
    ]);
  });

  it("requires a production seal upstream, server token and locked CORS origin for same-origin sealing", () => {
    const preflight = buildCloudflarePagesRuntimePreflight(
      {
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
        FILECOIN_SEAL_UPSTREAM_URL: "http://127.0.0.1:8788/seal",
        FILECOIN_SEAL_TOKEN: "",
        ALLOW_ORIGIN: "http://localhost:5173",
      },
      { functionEntries: validFunctionEntries() },
    );

    expect(preflight.sameOriginSeal).toBe(true);
    expect(preflight.problems).toEqual([
      "FILECOIN_SEAL_UPSTREAM_URL must be a deployed HTTPS URL.",
      "FILECOIN_SEAL_TOKEN is missing for same-origin /seal token injection.",
      "ALLOW_ORIGIN must be a deployed HTTPS URL.",
    ]);
  });

  it("accepts complete same-origin Pages runtime secrets", () => {
    const preflight = buildCloudflarePagesRuntimePreflight(
      {
        VITE_DATA_PROXY_SAME_ORIGIN: "true",
        APIFOOTBALL_KEY: "server-api-football",
        FOOTBALL_DATA_TOKEN: "server-football-data",
        VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
        ODDS_API_KEY: "server-odds",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "true",
        FILECOIN_SEAL_UPSTREAM_URL: "https://seal.example.com/seal",
        FILECOIN_SEAL_TOKEN: "server-token",
        ALLOW_ORIGIN: "https://app.example.com",
      },
      { functionEntries: validFunctionEntries() },
    );

    expect(preflight).toMatchObject({
      sameOriginData: true,
      sameOriginSeal: true,
      functionsReady: true,
      problems: [],
    });
  });
});
