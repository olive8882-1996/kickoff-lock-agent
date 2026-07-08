import { describe, expect, it } from "vitest";
import { buildDataProductionBootstrapPlan } from "./dataProductionBootstrap";

const readyEnv = {
  VITE_APIFOOTBALL_KEY: "api-football",
  FOOTBALL_DATA_TOKEN: "football-data-token",
  VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
  ODDS_API_KEY: "server-odds",
  VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
  VITE_APIFOOTBALL_ENRICHMENT_LIMIT: "12",
  KICKOFF_DATA_SCOUT_LIMIT: "12",
  KICKOFF_DATA_SCOUT_TARGETS: "3",
  KICKOFF_DATA_SEASON: "2026",
};

describe("Realtime data production bootstrap plan", () => {
  it("blocks until realtime provider prerequisites are configured", () => {
    const plan = buildDataProductionBootstrapPlan({});

    expect(plan.ready).toBe(false);
    expect(plan.blockedStages).toBeGreaterThan(0);
    expect(plan.missingEnv).toEqual(
      expect.arrayContaining([
        "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY",
        "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY/ODDS_API_KEY or VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY",
        "VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1",
        "KICKOFF_VERIFY_FIXTURE_IDS",
        "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
      ]),
    );
    expect(plan.stages.find((stage) => stage.id === "providers")).toMatchObject({
      status: "blocked",
      command: "bun run data:providers:check",
    });
    expect(plan.stages.find((stage) => stage.id === "proxy")).toMatchObject({
      status: "ready",
      command: "bun run data:proxy:deploy",
      outputEnv: ["VITE_DATA_PROXY_URL", "VITE_DATA_PROXY_SAME_ORIGIN"],
    });
    expect(plan.nextAction).toBe("Deploy free feed CORS proxy: run bun run data:proxy:deploy.");
    expect(plan.readBackCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "openfootball World Cup 2026 JSON",
          source: "openfootball",
          ready: true,
          command: "curl -sS 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'",
        }),
        expect.objectContaining({
          label: "TheSportsDB World Cup season feed",
          source: "thesportsdb",
          ready: true,
          command: expect.stringContaining("https://www.thesportsdb.com/api/v1/json/123/eventsseason.php"),
        }),
      ]),
    );
  });

  it("opens fixture scouting once provider runtime env is ready", () => {
    const plan = buildDataProductionBootstrapPlan(readyEnv);

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "proxy")).toMatchObject({ status: "done" });
    expect(plan.stages.find((stage) => stage.id === "providers")).toMatchObject({ status: "ready" });
    expect(plan.stages.find((stage) => stage.id === "scout")).toMatchObject({
      status: "ready",
      command: "bun run scout:data-targets",
    });
    expect(plan.commands).toEqual(
      expect.arrayContaining(["bun run data:providers:check", "bun run scout:data-targets", "bun run doctor:data"]),
    );
    expect(plan.readBackCommands.find((item) => item.label === "Data proxy health")).toMatchObject({
      ready: true,
      signal: "health",
      proxyMode: "data-proxy",
      targetUrl: "https://data.example.workers.dev/proxy/health",
      responseExpectation: {
        responseType: "data-proxy-health",
        rowPath: "$",
        requiredFields: ["ok", "service", "apiFootballServerKey", "footballDataServerToken", "oddsApiServerKey"],
        expectedSource: "data-proxy",
        expectedSignal: "health",
        expectedService: "kickoff-data-proxy",
        requiredCredentialFlags: ["apiFootballServerKey", "footballDataServerToken", "oddsApiServerKey"],
      },
      command: "curl -sS 'https://data.example.workers.dev/proxy/health'",
    });
    expect(plan.readBackCommands.find((item) => item.label === "API-Football standings")?.command).toContain(
      "https%3A%2F%2Fv3.football.api-sports.io%2Fstandings%3Fleague%3D1",
    );
    expect(plan.readBackCommands.find((item) => item.label === "openfootball World Cup 2026 JSON")).toMatchObject({
      ready: true,
      source: "openfootball",
      command: "curl -sS 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'",
    });
    expect(plan.readBackCommands.find((item) => item.label === "TheSportsDB World Cup season feed")).toMatchObject({
      ready: true,
      source: "thesportsdb",
      command: "curl -sS 'https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026'",
    });
    expect(plan.readBackCommands.find((item) => item.label === "The Odds API H2H")?.command).toContain("source=odds-api");
    expect(plan.readBackCommands.find((item) => item.label === "The Odds API H2H")).toMatchObject({
      source: "odds-api",
      signal: "odds",
      proxyMode: "data-proxy",
      targetUrl: "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?regions=us&markets=h2h&oddsFormat=decimal",
      responseExpectation: {
        responseType: "odds-api-response",
        rowPath: "$",
        minRows: 1,
        requiredFields: ["id", "home_team", "away_team", "bookmakers"],
        expectedSource: "odds-api",
        expectedSignal: "odds",
      },
    });
    expect(plan.readBackCommands.map((item) => item.command).join("\n")).not.toContain("server-odds");
    expect(plan.readBackCommands.map((item) => item.command).join("\n")).not.toContain("football-data-token");
    expect(plan.readBackCommands.map((item) => item.command).join("\n")).not.toContain("apiKey=");
  });

  it("accepts a server-side API-Football key for data proxy production setup", () => {
    const plan = buildDataProductionBootstrapPlan({
      ...readyEnv,
      APIFOOTBALL_KEY: "server-api-football",
      VITE_APIFOOTBALL_KEY: "",
    });

    expect(plan.stages.find((stage) => stage.id === "providers")).toMatchObject({ status: "ready" });
    expect(plan.stages.find((stage) => stage.id === "scout")).toMatchObject({ status: "ready" });
    expect(plan.missingEnv).not.toContain("VITE_APIFOOTBALL_KEY");
  });

  it("does not mark the data proxy stage done for local or wrong-path endpoints", () => {
    const localProxy = buildDataProductionBootstrapPlan({
      ...readyEnv,
      VITE_DATA_PROXY_URL: "https://localhost:8787/proxy",
    });
    expect(localProxy.ready).toBe(false);
    expect(localProxy.stages.find((stage) => stage.id === "proxy")).toMatchObject({
      status: "ready",
      missingEnv: ["VITE_DATA_PROXY_URL must be a deployed HTTPS /proxy endpoint"],
    });

    const wrongPath = buildDataProductionBootstrapPlan({
      ...readyEnv,
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/status",
    });
    expect(wrongPath.ready).toBe(false);
    expect(wrongPath.stages.find((stage) => stage.id === "proxy")).toMatchObject({
      status: "ready",
      missingEnv: ["VITE_DATA_PROXY_URL must end with /proxy"],
    });
  });

  it("accepts the same-origin Pages data proxy as production proxy bootstrap evidence", () => {
    const plan = buildDataProductionBootstrapPlan({
      ...readyEnv,
      VITE_DATA_PROXY_URL: "",
      VITE_PUBLIC_APP_URL: "https://app.example/kickoff-lock-agent/",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
    });

    expect(plan.stages.find((stage) => stage.id === "proxy")).toMatchObject({
      status: "done",
      missingEnv: [],
      detail: "Same-origin Pages data proxy is enabled at the deployed app origin.",
    });
    expect(plan.stages.find((stage) => stage.id === "providers")).toMatchObject({ status: "ready" });
    expect(plan.missingEnv).not.toContain("VITE_DATA_PROXY_URL");
  });

  it("opens fixture scouting with a deployed data proxy even when no API-Football key is local", () => {
    const plan = buildDataProductionBootstrapPlan({
      VITE_APIFOOTBALL_KEY: "",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      KICKOFF_DATA_PROXY_API_FOOTBALL_READY: "1",
      KICKOFF_DATA_PROXY_FOOTBALL_DATA_READY: "1",
      KICKOFF_DATA_PROXY_ODDS_READY: "1",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      VITE_APIFOOTBALL_ENRICHMENT_LIMIT: "12",
      KICKOFF_DATA_SCOUT_LIMIT: "12",
      KICKOFF_DATA_SCOUT_TARGETS: "3",
    });

    expect(plan.stages.find((stage) => stage.id === "providers")).toMatchObject({ status: "ready" });
    expect(plan.stages.find((stage) => stage.id === "scout")).toMatchObject({
      status: "ready",
      missingEnv: [],
    });
    expect(plan.missingEnv).not.toContain("APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY");
  });

  it("opens fixture scouting when deployed data proxy health proves server-side provider credentials", () => {
    const plan = buildDataProductionBootstrapPlan(
      {
        VITE_APIFOOTBALL_KEY: "",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
        VITE_APIFOOTBALL_ENRICHMENT_LIMIT: "12",
        KICKOFF_DATA_SCOUT_LIMIT: "12",
        KICKOFF_DATA_SCOUT_TARGETS: "3",
      },
      {
        health: {
          ok: true,
          service: "kickoff-data-proxy",
          apiFootballServerKey: true,
          footballDataServerToken: true,
          oddsApiServerKey: true,
        },
        healthStatus: 200,
      },
    );

    expect(plan.stages.find((stage) => stage.id === "providers")).toMatchObject({
      status: "ready",
      missingEnv: [],
    });
    expect(plan.stages.find((stage) => stage.id === "scout")).toMatchObject({
      status: "ready",
      missingEnv: [],
    });
    expect(plan.missingEnv).not.toContain("APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY");
  });

  it("does not open fixture scouting from a proxy URL alone without proxy credential health", () => {
    const plan = buildDataProductionBootstrapPlan({
      VITE_APIFOOTBALL_KEY: "",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      VITE_APIFOOTBALL_ENRICHMENT_LIMIT: "12",
      KICKOFF_DATA_SCOUT_LIMIT: "12",
      KICKOFF_DATA_SCOUT_TARGETS: "3",
    });

    expect(plan.stages.find((stage) => stage.id === "providers")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY",
      ]),
    });
    expect(plan.stages.find((stage) => stage.id === "scout")).toMatchObject({
      status: "blocked",
    });
  });

  it("accepts server-side Odds API through the deployed data proxy without exposing the odds key", () => {
    const plan = buildDataProductionBootstrapPlan({
      VITE_APIFOOTBALL_KEY: "",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      VITE_ODDS_API_KEY: "",
      KICKOFF_DATA_PROXY_API_FOOTBALL_READY: "1",
      KICKOFF_DATA_PROXY_FOOTBALL_DATA_READY: "1",
      KICKOFF_DATA_PROXY_ODDS_READY: "1",
      VITE_APIFOOTBALL_ENRICHMENT_LIMIT: "12",
      KICKOFF_DATA_SCOUT_LIMIT: "12",
      KICKOFF_DATA_SCOUT_TARGETS: "3",
    });

    expect(plan.stages.find((stage) => stage.id === "providers")).toMatchObject({ status: "ready" });
    expect(plan.missingEnv).not.toContain("VITE_ODDS_API_KEY");
    expect(plan.copyText).toContain("ODDS_API_KEY");
  });

  it("switches to realtime doctor once fixture targets are collected", () => {
    const plan = buildDataProductionBootstrapPlan({
      ...readyEnv,
      KICKOFF_VERIFY_FIXTURE_IDS: "100,200,300",
      KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
        "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
    });

    expect(plan.ready).toBe(true);
    expect(plan.stages.find((stage) => stage.id === "proxy")).toMatchObject({ status: "done" });
    expect(plan.stages.find((stage) => stage.id === "scout")).toMatchObject({ status: "done" });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "ready",
      command: "bun run doctor:data",
    });
    expect(plan.missingEnv).toEqual([]);
    expect(plan.readBackCommands).toHaveLength(16);
    expect(plan.readBackCommands.every((item) => item.ready)).toBe(true);
    expect(plan.readBackCommands.find((item) => item.label === "Fixture 100 lineups")).toMatchObject({
      fixtureId: "100",
      source: "api-football",
      signal: "lineups",
      proxyMode: "data-proxy",
      targetUrl: "https://v3.football.api-sports.io/fixtures/lineups?fixture=100",
      responseExpectation: {
        responseType: "api-football-response",
        rowPath: "response",
        minRows: 2,
        requiredFields: ["team", "formation", "startXI"],
        expectedSource: "api-football",
        expectedSignal: "lineups",
        expectedFixtureId: "100",
        expectedSeason: "2026",
      },
      command: expect.stringContaining("fixtures%2Flineups%3Ffixture%3D100"),
    });
    expect(plan.readBackCommands.find((item) => item.label === "Fixture 300 odds")?.command).toContain(
      "odds%3Ffixture%3D300",
    );
    expect(plan.copyText).toContain("Realtime data read-back commands");
    expect(plan.copyText).toContain("Fixture 200 injuries");
    expect(plan.copyText).toContain("realtime data production bootstrap");
  });

  it("keeps realtime doctor blocked until the configured fixture target count is collected", () => {
    const plan = buildDataProductionBootstrapPlan({
      ...readyEnv,
      KICKOFF_VERIFY_FIXTURE_IDS: "100",
      KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX: "100:lineups=2|injuries=1|odds=1|standings=2",
    });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "scout")).toMatchObject({
      status: "ready",
    });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_VERIFY_FIXTURE_IDS needs 3 fixture targets"]),
    });
  });

  it("keeps realtime doctor blocked when fixture signal matrix is missing or incomplete", () => {
    const missingMatrix = buildDataProductionBootstrapPlan({
      ...readyEnv,
      KICKOFF_VERIFY_FIXTURE_IDS: "100,200,300",
    });
    expect(missingMatrix.ready).toBe(false);
    expect(missingMatrix.missingEnv).toEqual(expect.arrayContaining(["KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"]));

    const incompleteMatrix = buildDataProductionBootstrapPlan({
      ...readyEnv,
      KICKOFF_VERIFY_FIXTURE_IDS: "100,200,300",
      KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
        "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=1|injuries=0|odds=1,300:lineups=2|injuries=1|odds=1|standings=2",
    });
    expect(incompleteMatrix.ready).toBe(false);
    const doctorStage = incompleteMatrix.stages.find((stage) => stage.id === "doctor");
    expect(doctorStage?.status).toBe("blocked");
    const doctorMissingEnv = doctorStage?.missingEnv;
    expect(Array.isArray(doctorMissingEnv)).toBe(true);
    expect(doctorMissingEnv?.includes("200 missing lineups rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX")).toBe(true);
    expect(doctorMissingEnv?.includes("200 missing injuries rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX")).toBe(true);
    expect(doctorMissingEnv?.includes("200 missing standings rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX")).toBe(true);
  });
});
