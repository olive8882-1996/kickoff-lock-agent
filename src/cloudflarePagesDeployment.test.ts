import { describe, expect, it } from "vitest";
import { buildCloudflarePagesDeployPlan } from "./cloudflarePagesDeployment";
import { REQUIRED_CLOUDFLARE_PAGES_FUNCTION_ENTRIES } from "./cloudflarePagesDeployPreflight";

const validFunctionEntries = () =>
  Object.fromEntries(
    REQUIRED_CLOUDFLARE_PAGES_FUNCTION_ENTRIES.map((entry) => [
      entry.path,
      `import worker from "${entry.workerImport}";\nexport const onRequest = ({ request, env, ctx }) => worker.fetch(request, env, ctx);\n`,
    ]),
  );

describe("Cloudflare Pages deploy plan", () => {
  it("turns missing Cloudflare auth and same-origin secrets into a runnable handoff", () => {
    const plan = buildCloudflarePagesDeployPlan(
      {},
      {
        functionsBundleReady: true,
        functionEntries: validFunctionEntries(),
      },
    );

    expect(plan.ready).toBe(false);
    expect(plan.sameOriginData).toBe(true);
    expect(plan.sameOriginSeal).toBe(true);
    expect(plan.plannedPagesUrl).toBe("https://kickoff-lock-agent.pages.dev/");
    expect(plan.missingEnv).toEqual(
      expect.arrayContaining([
        "APIFOOTBALL_KEY",
        "FOOTBALL_DATA_TOKEN",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "FILECOIN_SEAL_TOKEN",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
      ]),
    );
    expect(plan.stages.find((stage) => stage.id === "functions")).toMatchObject({
      status: "done",
      command: "bun run pages:functions:build",
    });
    expect(plan.stages.find((stage) => stage.id === "auth")).toMatchObject({
      status: "blocked",
      command: "bun run pages:cf:check",
    });
    expect(plan.readBackCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "runtime-config",
          url: "https://kickoff-lock-agent.pages.dev/runtime-config.js",
          command: "curl -sS 'https://kickoff-lock-agent.pages.dev/runtime-config.js'",
          ready: false,
          responseExpectation: expect.objectContaining({
            responseType: "runtime-config-js",
            requiredFields: expect.arrayContaining(["window.__KICKOFF_RUNTIME_CONFIG__", "VITE_PUBLIC_APP_URL"]),
            forbiddenFields: expect.arrayContaining(["FILECOIN_SEAL_TOKEN", "SUPABASE_SERVICE_ROLE_KEY"]),
          }),
        }),
        expect.objectContaining({
          id: "data-proxy-health",
          url: "https://kickoff-lock-agent.pages.dev/data-proxy/health",
          ready: false,
          responseExpectation: expect.objectContaining({
            responseType: "json",
            expectedService: "kickoff-data-proxy",
            requiredFields: expect.arrayContaining(["allowedRoutes", "providerCapabilities"]),
          }),
        }),
        expect.objectContaining({
          id: "seal-health",
          url: "https://kickoff-lock-agent.pages.dev/seal/health",
          ready: false,
          responseExpectation: expect.objectContaining({
            responseType: "json",
            expectedService: "kickoff-lock-filecoin-seal-proxy",
            requiredFields: expect.arrayContaining(["proxyCapabilities", "verificationPolling"]),
          }),
        }),
      ]),
    );
    expect(plan.secretExposureChecks.every((check) => check.passed)).toBe(true);
    expect(plan.proxyCapabilityChecks.map((check) => `${check.id}:${check.passed}`)).toEqual([
      "data-free-feeds:true",
      "data-football-data-backup:false",
      "data-api-football-enrichment:false",
      "data-odds-enrichment:false",
      "filecoin-async-upload:false",
      "filecoin-job-polling:false",
      "filecoin-cid-readback:false",
    ]);
    expect(plan.nextAction).toContain("Set Pages runtime secrets");
    expect(plan.copyText).toContain("Kickoff Lock Agent Cloudflare Pages deploy plan");
    expect(plan.copyText).toContain("Read-back commands:");
    expect(plan.copyText).toContain("Secret exposure checks:");
    expect(plan.copyText).toContain("Proxy capability checks:");
  });

  it("blocks deployment when a Pages Function entry is not wired to the shared worker", () => {
    const entries = validFunctionEntries();
    entries["functions/data-proxy/[[path]].js"] = "export const onRequest = () => new Response('ok');";
    const plan = buildCloudflarePagesDeployPlan(
      {
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_ACCOUNT_ID: "account",
        APIFOOTBALL_KEY: "api-football",
        FILECOIN_SEAL_UPSTREAM_URL: "https://seal.example.com/seal",
        FILECOIN_SEAL_TOKEN: "seal-token",
        ALLOW_ORIGIN: "https://kickoff-lock-agent.pages.dev",
      },
      { functionEntries: entries },
    );

    expect(plan.ready).toBe(false);
    expect(plan.functionsReady).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "functions")?.missingEnv).toEqual(
      expect.arrayContaining([
        "functions/data-proxy/[[path]].js must import ../../server/data-proxy-worker.mjs.",
        "functions/data-proxy/[[path]].js must forward request, env and ctx to the shared worker.",
      ]),
    );
  });

  it("plans same-origin runtime checks even when the current static-host env disables same-origin flags", () => {
    const plan = buildCloudflarePagesDeployPlan(
      {
        VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
        VITE_DATA_PROXY_SAME_ORIGIN: "0",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "0",
        VITE_DATA_PROXY_URL: "",
        VITE_FILECOIN_SEAL_API: "",
        ALLOW_ORIGIN: "https://olive8882-1996.github.io",
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_ACCOUNT_ID: "account",
      },
      {
        functionsBundleReady: true,
        functionEntries: validFunctionEntries(),
      },
    );

    expect(plan.ready).toBe(false);
    expect(plan.sameOriginData).toBe(true);
    expect(plan.sameOriginSeal).toBe(true);
    expect(plan.runtimePreflight.problems).toEqual(
      expect.arrayContaining([
        "APIFOOTBALL_KEY is missing for same-origin /data-proxy enrichment.",
        "FOOTBALL_DATA_TOKEN is missing for same-origin /data-proxy standings backup.",
        "FILECOIN_SEAL_UPSTREAM_URL is missing.",
        "FILECOIN_SEAL_TOKEN is missing for same-origin /seal token injection.",
      ]),
    );
    expect(plan.stages.find((stage) => stage.id === "runtime-secrets")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["APIFOOTBALL_KEY", "FOOTBALL_DATA_TOKEN", "FILECOIN_SEAL_UPSTREAM_URL", "FILECOIN_SEAL_TOKEN"]),
    });
  });

  it("marks the Cloudflare deploy command ready with complete auth and runtime secrets", () => {
    const plan = buildCloudflarePagesDeployPlan(
      {
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_ACCOUNT_ID: "account",
        APIFOOTBALL_KEY: "api-football",
        FOOTBALL_DATA_TOKEN: "football-data",
        VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
        ODDS_API_KEY: "odds",
        FILECOIN_SEAL_UPSTREAM_URL: "https://seal.example.com/seal",
        FILECOIN_SEAL_TOKEN: "seal-token",
        ALLOW_ORIGIN: "https://kickoff-lock-agent.pages.dev",
      },
      {
        functionsBundleReady: true,
        functionEntries: validFunctionEntries(),
      },
    );

    expect(plan.ready).toBe(true);
    expect(plan.blockedStages).toBe(0);
    expect(plan.stages.find((stage) => stage.id === "deploy")).toMatchObject({
      status: "ready",
      command: "bun run pages:cf:deploy",
    });
    expect(plan.readBackCommands).toHaveLength(4);
    expect(plan.readBackCommands.every((item) => item.ready)).toBe(true);
    expect(plan.readBackCommands.map((item) => item.id)).toEqual([
      "app-root",
      "runtime-config",
      "data-proxy-health",
      "seal-health",
    ]);
    expect(plan.readBackCommands.map((item) => item.command).join("\n")).not.toContain("seal-token");
    expect(plan.readBackCommands.find((item) => item.id === "app-root")?.responseExpectation).toMatchObject({
      responseType: "html",
      requiredFields: expect.arrayContaining(["Kickoff Lock Agent", "assets/kickoff-lock-icon"]),
    });
    expect(plan.secretExposureChecks.every((check) => check.passed)).toBe(true);
    expect(plan.proxyCapabilityChecks.every((check) => check.passed)).toBe(true);
    expect(plan.proxyCapabilityChecks.find((check) => check.id === "data-api-football-enrichment")).toMatchObject({
      readBackCommand: "curl -sS 'https://kickoff-lock-agent.pages.dev/data-proxy/health'",
      detail: "APIFOOTBALL_KEY is injected server-side",
    });
    expect(plan.proxyCapabilityChecks.find((check) => check.id === "data-football-data-backup")).toMatchObject({
      readBackCommand: "curl -sS 'https://kickoff-lock-agent.pages.dev/data-proxy/health'",
      detail: "FOOTBALL_DATA_TOKEN is injected server-side for matches/standings read-back",
    });
    expect(plan.proxyCapabilityChecks.find((check) => check.id === "filecoin-cid-readback")).toMatchObject({
      readBackCommand: "curl -sS 'https://kickoff-lock-agent.pages.dev/seal/health'",
    });
    expect(plan.nextAction).toBe("Deploy app and same-origin backend routes: run bun run pages:cf:deploy.");
  });

  it("flags browser-exposed provider keys while keeping secret values out of handoff text", () => {
    const plan = buildCloudflarePagesDeployPlan(
      {
        CLOUDFLARE_API_TOKEN: "cf-token-production-secret",
        CLOUDFLARE_ACCOUNT_ID: "account",
        APIFOOTBALL_KEY: "server-api-football-secret",
        FOOTBALL_DATA_TOKEN: "server-football-data-secret",
        VITE_APIFOOTBALL_KEY: "browser-api-football-secret",
        VITE_ODDS_API_KEY: "browser-odds-secret",
        ODDS_API_KEY: "server-odds-secret",
        FILECOIN_SEAL_UPSTREAM_URL: "https://seal.example.com/seal",
        FILECOIN_SEAL_TOKEN: "server-seal-token-secret",
        VITE_FILECOIN_SEAL_TOKEN: "browser-seal-token-secret",
        ALLOW_ORIGIN: "https://kickoff-lock-agent.pages.dev",
      },
      {
        functionsBundleReady: true,
        functionEntries: validFunctionEntries(),
      },
    );

    expect(plan.ready).toBe(true);
    expect(plan.secretExposureChecks.find((check) => check.id === "browser-api-keys-not-required")).toMatchObject({
      passed: false,
      detail: "move VITE_APIFOOTBALL_KEY, VITE_ODDS_API_KEY to Pages runtime secrets",
    });
    expect(plan.secretExposureChecks.find((check) => check.id === "browser-seal-token-not-required")).toMatchObject({
      passed: false,
      detail: "remove VITE_FILECOIN_SEAL_TOKEN when same-origin /seal is enabled",
    });
    expect(plan.copyText).not.toContain("server-api-football-secret");
    expect(plan.copyText).not.toContain("server-football-data-secret");
    expect(plan.copyText).not.toContain("server-odds-secret");
    expect(plan.copyText).not.toContain("server-seal-token-secret");
    expect(plan.readBackCommands.map((item) => item.command).join("\n")).not.toContain("browser-seal-token-secret");
  });
});
