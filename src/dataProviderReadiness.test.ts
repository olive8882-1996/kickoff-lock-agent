import { describe, expect, it } from "vitest";
import {
  buildDataProviderFixtureSignalRows,
  buildDataProviderReadinessArtifact,
  buildDataProviderReadinessReport,
  dataProviderFixtureTargets,
  resolvedDataProviderProxyHealthUrl,
} from "./dataProviderReadiness";

const completeEnv = {
  VITE_APIFOOTBALL_KEY: "api-football",
  FOOTBALL_DATA_TOKEN: "football-data-token",
  KICKOFF_VERIFY_FIXTURE_IDS: "100,200,300",
  KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
    "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
  VITE_ODDS_API_KEY: "odds",
  VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
  VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
  VITE_APIFOOTBALL_ENRICHMENT_LIMIT: "12",
  KICKOFF_DATA_SCOUT_LIMIT: "12",
  KICKOFF_DATA_SCOUT_TARGETS: "3",
};

const publicFeedProof = {
  checkedAt: "2026-07-04T12:00:00.000Z",
  openfootball: {
    url: "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
    ok: true,
    status: 200,
    rowCount: 104,
    detail: "104 World Cup rows",
  },
  theSportsDb: {
    url: "https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026",
    ok: true,
    status: 200,
    rowCount: 15,
    detail: "15 season events",
  },
  theSportsDbTable: {
    url: "https://www.thesportsdb.com/api/v1/json/123/lookuptable.php?l=4429&s=2026",
    ok: true,
    status: 200,
    rowCount: 48,
    detail: "48 league table rows",
  },
};

describe("data provider readiness", () => {
  it("normalizes production fixture targets from plural env only", () => {
    expect(
      dataProviderFixtureTargets({
        KICKOFF_VERIFY_FIXTURE_IDS: "100, 200\n300",
        KICKOFF_VERIFY_FIXTURE_ID: "400",
      }),
    ).toEqual(["100", "200", "300"]);
  });

  it("passes when provider config is complete enough to run live endpoint doctors", () => {
    const report = buildDataProviderReadinessReport(completeEnv);

    expect(report.ready).toBe(true);
    expect(report.passed).toBe(report.total);
    expect(report.blockers).toEqual([]);
  });

  it("builds fixture-level signal rows for data scout handoff", () => {
    expect(buildDataProviderFixtureSignalRows(completeEnv)).toEqual([
      expect.objectContaining({
        fixtureId: "100",
        ready: true,
        rows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
        requiredRows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
        missingSignals: [],
      }),
      expect.objectContaining({ fixtureId: "200", ready: true }),
      expect.objectContaining({ fixtureId: "300", ready: true }),
    ]);
  });

  it("writes a reusable provider readiness artifact for production acceptance", () => {
    const report = buildDataProviderReadinessReport(completeEnv, { publicFeedProof });
    const artifact = buildDataProviderReadinessArtifact(report, completeEnv, {
      envFiles: [".env.production.local"],
      generatedAt: "2026-07-04T12:00:00.000Z",
      publicFeedProof,
    });

    expect(artifact.ready).toBe(true);
    expect(artifact.generatedAt).toBe("2026-07-04T12:00:00.000Z");
    expect(artifact.envFiles).toEqual([".env.production.local"]);
    expect(artifact.targets).toMatchObject({
      fixtureIds: ["100", "200", "300"],
      requiredFixtureCount: 3,
      fixtureSignalMatrix:
        "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
      dataProxyUrl: "https://data.example.workers.dev/proxy",
      dataProxyHealthUrl: "https://data.example.workers.dev/proxy/health",
      apiFootballConfigured: true,
      footballDataBackupConfigured: true,
      oddsProviderConfigured: true,
      dataProxyCredentials: {
        apiFootball: false,
        footballData: true,
        odds: false,
      },
      footballDataCredentialConfigured: true,
      freeFeedBackupConfigured: true,
      publicFreeFeedReadBack: {
        openfootball: expect.objectContaining({ ok: true, rowCount: 104 }),
        theSportsDb: expect.objectContaining({ ok: true, rowCount: 15 }),
        theSportsDbTable: expect.objectContaining({ ok: true, rowCount: 48 }),
      },
      fixtureSignalRows: expect.arrayContaining([
        expect.objectContaining({
          fixtureId: "100",
          ready: true,
          rows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
        }),
      ]),
    });
    expect(artifact.acceptance).toMatchObject({
      apiFootballKey: true,
      footballDataBackup: true,
      publicFreeFeedReadBack: true,
      fixtureTargets: true,
      fixtureSignalMatrix: true,
      oddsProvider: true,
      dataProxyHttps: true,
      enrichmentLimitReady: true,
      scoutWindowReady: true,
    });
    expect(artifact.acceptance.outputEnvKeys).toEqual(
      expect.arrayContaining([
        "VITE_APIFOOTBALL_KEY",
        "FOOTBALL_DATA_TOKEN",
        "FOOTBALL_DATA_ORG_TOKEN",
        "VITE_FOOTBALL_DATA_TOKEN",
        "VITE_DATA_PROXY_URL",
        "KICKOFF_DATA_PROXY_API_FOOTBALL_READY",
        "KICKOFF_DATA_PROXY_FOOTBALL_DATA_READY",
        "KICKOFF_DATA_PROXY_ODDS_READY",
        "KICKOFF_VERIFY_FIXTURE_IDS",
        "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
        "VITE_APIFOOTBALL_ENRICHMENT_LIMIT",
        "KICKOFF_DATA_SCOUT_LIMIT",
        "KICKOFF_DATA_SCOUT_TARGETS",
      ]),
    );
  });

  it("keeps provider artifact acceptance false when reusable targets are incomplete", () => {
    const env = {
      ...completeEnv,
      KICKOFF_VERIFY_FIXTURE_IDS: "100",
      VITE_DATA_PROXY_URL: "http://127.0.0.1:8787/proxy",
    };
    const report = buildDataProviderReadinessReport(env);
    const artifact = buildDataProviderReadinessArtifact(report, env, {
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.fixtureTargets).toBe(false);
    expect(artifact.acceptance.fixtureSignalMatrix).toBe(false);
    expect(artifact.acceptance.dataProxyHttps).toBe(false);
    expect(artifact.targets.fixtureIds).toEqual(["100"]);
    expect(artifact.targets.dataProxyUrl).toBe("http://127.0.0.1:8787/proxy");
  });

  it("records incomplete public free feed read-back separately from provider configuration", () => {
    const proof = {
      ...publicFeedProof,
      theSportsDb: {
        ...publicFeedProof.theSportsDb,
        ok: false,
        status: 500,
        rowCount: 0,
        detail: "HTTP 500",
      },
    };
    const freeFeedOnlyEnv = {
      ...completeEnv,
      FOOTBALL_DATA_TOKEN: "",
      FOOTBALL_DATA_ORG_TOKEN: "",
      VITE_FOOTBALL_DATA_TOKEN: "",
    };
    const report = buildDataProviderReadinessReport(freeFeedOnlyEnv, { publicFeedProof: proof });
    const artifact = buildDataProviderReadinessArtifact(report, freeFeedOnlyEnv, {
      generatedAt: "2026-07-04T12:00:00.000Z",
      publicFeedProof: proof,
    });

    expect(report.checks.find((check) => check.id === "football-data-backup")).toMatchObject({
      passed: true,
      detail: expect.stringContaining("public feed read-back incomplete"),
    });
    expect(artifact.acceptance.footballDataBackup).toBe(true);
    expect(artifact.acceptance.publicFreeFeedReadBack).toBe(false);
    expect(artifact.targets.publicFreeFeedReadBack.theSportsDb).toMatchObject({
      ok: false,
      rowCount: 0,
    });
    expect(artifact.targets.publicFreeFeedReadBack.theSportsDbTable).toMatchObject({
      ok: true,
      rowCount: 48,
    });
  });

  it("keeps realtime data incomplete when endpoint targets and odds config are absent", () => {
    const report = buildDataProviderReadinessReport({});

    expect(report.ready).toBe(false);
    expect(report.blockers.map((check) => check.id)).toEqual([
      "api-football-key",
      "fixture-targets",
      "fixture-signal-matrix",
      "odds-provider",
      "data-proxy",
    ]);
    expect(report.checks.find((check) => check.id === "football-data-backup")).toMatchObject({
      passed: true,
      detail: "openfootball/TheSportsDB public feeds configured",
    });
    expect(report.checks.find((check) => check.id === "api-football-enrichment-limit")?.passed).toBe(true);
  });

  it("requires Football-Data or another backup when public free feeds are explicitly disabled", () => {
    const report = buildDataProviderReadinessReport({
      KICKOFF_DISABLE_PUBLIC_FREE_FEEDS: "1",
    });

    expect(report.checks.find((check) => check.id === "football-data-backup")).toMatchObject({
      passed: false,
      detail: "missing",
    });
    expect(report.blockers.map((check) => check.id)).toContain("football-data-backup");
  });

  it("requires the configured target count instead of a partial fixture list", () => {
    const report = buildDataProviderReadinessReport({
      ...completeEnv,
      KICKOFF_VERIFY_FIXTURE_IDS: "100,200",
      KICKOFF_DATA_SCOUT_TARGETS: "3",
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "fixture-targets")).toMatchObject({
      passed: false,
      detail: "KICKOFF_VERIFY_FIXTURE_IDS needs 3 fixture targets; got 2",
    });
  });

  it("requires every target fixture to have lineups, injuries, odds and standings rows", () => {
    const report = buildDataProviderReadinessReport({
      ...completeEnv,
      KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
        "100:lineups=1|injuries=1|odds=1,200:lineups=1|injuries=0|odds=1|standings=2",
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "fixture-signal-matrix")).toMatchObject({
      passed: false,
      detail:
        "100 missing lineups rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX; 100 missing standings rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX; 200 missing lineups rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX; 200 missing injuries rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX; KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing 300",
    });
    expect(buildDataProviderFixtureSignalRows({
      ...completeEnv,
      KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX:
        "100:lineups=1|injuries=1|odds=1,200:lineups=1|injuries=0|odds=1|standings=2",
    })).toEqual([
      expect.objectContaining({ fixtureId: "100", ready: false, missingSignals: ["lineups", "standings"] }),
      expect.objectContaining({ fixtureId: "200", ready: false, missingSignals: ["lineups", "injuries"] }),
      expect.objectContaining({ fixtureId: "300", ready: false, missingSignals: ["lineups", "injuries", "odds", "standings"] }),
    ]);
  });

  it("does not accept legacy single fixture id for full realtime production readiness", () => {
    const report = buildDataProviderReadinessReport({
      ...completeEnv,
      KICKOFF_VERIFY_FIXTURE_IDS: "",
      KICKOFF_VERIFY_FIXTURE_ID: "100",
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "fixture-targets")).toMatchObject({
      passed: false,
      detail: "KICKOFF_VERIFY_FIXTURE_IDS needs 3 fixture targets; legacy KICKOFF_VERIFY_FIXTURE_ID is not enough",
    });
  });

  it("requires a deployed HTTPS data proxy for static hosting", () => {
    const report = buildDataProviderReadinessReport({
      ...completeEnv,
      VITE_DATA_PROXY_URL: "http://127.0.0.1:8787/proxy",
    });

    expect(report.ready).toBe(false);
    expect(report.blockers.map((check) => check.id)).toContain("data-proxy");
  });

  it("accepts a same-origin Pages data proxy when the public app URL is deployed HTTPS", () => {
    const env = {
      ...completeEnv,
      VITE_DATA_PROXY_URL: "",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
    };
    const report = buildDataProviderReadinessReport(env);
    const artifact = buildDataProviderReadinessArtifact(report, env, {
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "data-proxy")).toMatchObject({
      passed: true,
      detail: "https://example.com/data-proxy/proxy (same-origin)",
    });
    expect(artifact.targets.dataProxyUrl).toBe("https://example.com/data-proxy/proxy");
    expect(artifact.acceptance.dataProxyHttps).toBe(true);
  });

  it("auto-selects same-origin Pages data proxy in Cloudflare Pages builds", () => {
    const env = {
      ...completeEnv,
      VITE_DATA_PROXY_URL: "",
      VITE_DATA_PROXY_SAME_ORIGIN: "",
      VITE_APIFOOTBALL_KEY: "",
      FOOTBALL_DATA_TOKEN: "",
      ODDS_API_KEY: "",
      VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      CF_PAGES: "1",
      CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
      KICKOFF_DATA_PROXY_API_FOOTBALL_READY: "1",
      KICKOFF_DATA_PROXY_FOOTBALL_DATA_READY: "1",
      KICKOFF_DATA_PROXY_ODDS_READY: "1",
    };
    const report = buildDataProviderReadinessReport(env);

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "api-football-key")).toMatchObject({
      passed: true,
      detail: "server-side key via data proxy",
    });
    expect(report.checks.find((check) => check.id === "football-data-backup")).toMatchObject({
      passed: true,
      detail: "server-side token via data proxy",
    });
    expect(report.checks.find((check) => check.id === "data-proxy")).toMatchObject({
      passed: true,
      detail: "https://kickoff-lock-agent.pages.dev/data-proxy/proxy (same-origin)",
    });
    expect(resolvedDataProviderProxyHealthUrl(env)).toBe("https://kickoff-lock-agent.pages.dev/data-proxy/health");
  });

  it("rejects same-origin data proxy on GitHub Pages because it cannot host Functions", () => {
    const report = buildDataProviderReadinessReport({
      ...completeEnv,
      VITE_DATA_PROXY_URL: "",
      VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      VITE_DATA_PROXY_SAME_ORIGIN: "1",
      VITE_APIFOOTBALL_KEY: "",
      VITE_ODDS_API_KEY: "",
      FOOTBALL_DATA_TOKEN: "",
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-key")).toMatchObject({
      passed: false,
      detail: "missing",
    });
    expect(report.checks.find((check) => check.id === "football-data-backup")).toMatchObject({
      passed: true,
      detail: "openfootball/TheSportsDB public feeds configured",
    });
    expect(report.checks.find((check) => check.id === "data-proxy")).toMatchObject({
      passed: false,
      detail:
        "VITE_DATA_PROXY_SAME_ORIGIN cannot use same-origin backend routes on GitHub Pages; deploy Cloudflare Pages Functions or set an external Worker URL.",
    });
  });

  it("uses the Pages health route instead of /data-proxy/proxy/health for same-origin data proxy checks", () => {
    expect(
      resolvedDataProviderProxyHealthUrl({
        VITE_DATA_PROXY_URL: "",
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_DATA_PROXY_SAME_ORIGIN: "1",
      }),
    ).toBe("https://example.com/data-proxy/health");
  });

  it("keeps standalone data proxy health checks under the configured /proxy base path", () => {
    expect(
      resolvedDataProviderProxyHealthUrl({
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      }),
    ).toBe("https://data.example.workers.dev/proxy/health");
  });

  it("accepts The Odds API through the data proxy without a browser odds key", () => {
    const env = {
      ...completeEnv,
      VITE_ODDS_API_KEY: "",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      ODDS_API_KEY: "server-odds",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
    };
    const report = buildDataProviderReadinessReport(env);
    const artifact = buildDataProviderReadinessArtifact(report, env, {
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(report.checks.find((check) => check.id === "odds-provider")).toMatchObject({
      passed: true,
      detail: "The Odds API routed through data proxy",
    });
    expect(artifact.targets.oddsProviderConfigured).toBe(true);
    expect(artifact.acceptance.oddsProvider).toBe(true);
  });

  it("does not trust a data proxy URL as provider credential evidence without server keys or health proof", () => {
    const report = buildDataProviderReadinessReport({
      ...completeEnv,
      VITE_APIFOOTBALL_KEY: "",
      APIFOOTBALL_KEY: "",
      API_FOOTBALL_KEY: "",
      FOOTBALL_DATA_TOKEN: "",
      FOOTBALL_DATA_ORG_TOKEN: "",
      VITE_FOOTBALL_DATA_TOKEN: "",
      VITE_ODDS_API_KEY: "",
      ODDS_API_KEY: "",
      THE_ODDS_API_KEY: "",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-key")).toMatchObject({
      passed: false,
      detail: "missing",
    });
    expect(report.checks.find((check) => check.id === "football-data-backup")).toMatchObject({
      passed: true,
      detail: "openfootball/TheSportsDB public feeds configured",
    });
    expect(report.checks.find((check) => check.id === "odds-provider")).toMatchObject({
      passed: false,
      detail: "missing",
    });
  });

  it("accepts provider credentials proven by data proxy health flags", () => {
    const report = buildDataProviderReadinessReport({
      ...completeEnv,
      VITE_APIFOOTBALL_KEY: "",
      FOOTBALL_DATA_TOKEN: "",
      VITE_ODDS_API_KEY: "",
      ODDS_API_KEY: "",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      KICKOFF_DATA_PROXY_API_FOOTBALL_READY: "1",
      KICKOFF_DATA_PROXY_FOOTBALL_DATA_READY: "1",
      KICKOFF_DATA_PROXY_ODDS_READY: "1",
    });

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "api-football-key")?.detail).toBe("server-side key via data proxy");
    expect(report.checks.find((check) => check.id === "football-data-backup")?.detail).toBe("server-side token via data proxy");
    expect(report.checks.find((check) => check.id === "odds-provider")?.detail).toBe("The Odds API routed through data proxy");
  });

  it("accepts provider credentials proven by the deployed data proxy health response", () => {
    const env = {
      ...completeEnv,
      VITE_APIFOOTBALL_KEY: "",
      APIFOOTBALL_KEY: "",
      API_FOOTBALL_KEY: "",
      FOOTBALL_DATA_TOKEN: "",
      FOOTBALL_DATA_ORG_TOKEN: "",
      VITE_FOOTBALL_DATA_TOKEN: "",
      VITE_ODDS_API_KEY: "",
      ODDS_API_KEY: "",
      THE_ODDS_API_KEY: "",
      VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
    };
    const health = {
      ok: true,
      service: "kickoff-data-proxy",
      apiFootballServerKey: true,
      footballDataServerToken: true,
      oddsApiServerKey: true,
      providerCapabilities: [
        { source: "api-football", serverCredentialPresent: true },
        { source: "football-data", serverCredentialPresent: true },
        { source: "odds-api", serverCredentialPresent: true },
      ],
    };

    const report = buildDataProviderReadinessReport(env, { health, healthStatus: 200 });
    const artifact = buildDataProviderReadinessArtifact(report, env, {
      generatedAt: "2026-07-04T12:00:00.000Z",
      health,
      healthStatus: 200,
    });

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "api-football-key")?.detail).toBe(
      "server-side key via data proxy health",
    );
    expect(report.checks.find((check) => check.id === "football-data-backup")?.detail).toBe(
      "server-side token via data proxy health",
    );
    expect(report.checks.find((check) => check.id === "odds-provider")?.detail).toBe(
      "The Odds API routed through data proxy health",
    );
    expect(artifact.targets.dataProxyCredentials).toEqual({
      apiFootball: true,
      footballData: true,
      odds: true,
    });
    expect(artifact.targets.dataProxyHealthProof).toMatchObject({
      checked: true,
      ok: true,
      service: "kickoff-data-proxy",
      apiFootballServerKey: true,
      footballDataServerToken: true,
      oddsApiServerKey: true,
    });
  });

  it("does not accept an unrelated health response as provider credential proof", () => {
    const report = buildDataProviderReadinessReport(
      {
        ...completeEnv,
        VITE_APIFOOTBALL_KEY: "",
        APIFOOTBALL_KEY: "",
        API_FOOTBALL_KEY: "",
        FOOTBALL_DATA_TOKEN: "",
        FOOTBALL_DATA_ORG_TOKEN: "",
        VITE_FOOTBALL_DATA_TOKEN: "",
        VITE_ODDS_API_KEY: "",
        ODDS_API_KEY: "",
        THE_ODDS_API_KEY: "",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      },
      {
        health: {
          ok: true,
          service: "other-service",
          apiFootballServerKey: true,
          footballDataServerToken: true,
          oddsApiServerKey: true,
        },
        healthStatus: 200,
      },
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-key")?.detail).toBe("missing");
    expect(report.checks.find((check) => check.id === "football-data-backup")?.detail).toBe(
      "openfootball/TheSportsDB public feeds configured",
    );
    expect(report.checks.find((check) => check.id === "odds-provider")?.detail).toBe("missing");
  });

  it("requires the data proxy to be a deployed /proxy endpoint, not a local or status URL", () => {
    const localReport = buildDataProviderReadinessReport({
      ...completeEnv,
      VITE_DATA_PROXY_URL: "https://localhost:8787/proxy",
    });
    const wrongPathReport = buildDataProviderReadinessReport({
      ...completeEnv,
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/status",
    });

    expect(localReport.ready).toBe(false);
    expect(localReport.blockers.map((check) => check.id)).toContain("data-proxy");
    expect(wrongPathReport.ready).toBe(false);
    expect(wrongPathReport.blockers.map((check) => check.id)).toContain("data-proxy");
  });

  it("blocks scout settings that cannot produce the required number of targets", () => {
    const report = buildDataProviderReadinessReport({
      ...completeEnv,
      KICKOFF_DATA_SCOUT_LIMIT: "2",
      KICKOFF_DATA_SCOUT_TARGETS: "3",
    });

    expect(report.ready).toBe(false);
    expect(report.blockers.map((check) => check.id)).toContain("scout-search-window");
  });

  it("allows a narrow scout window when enough explicit candidate fixtures are configured", () => {
    const report = buildDataProviderReadinessReport({
      ...completeEnv,
      KICKOFF_DATA_SCOUT_LIMIT: "1",
      KICKOFF_DATA_SCOUT_TARGETS: "3",
      KICKOFF_DATA_SCOUT_FIXTURE_IDS: "700,800,900",
    });

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "scout-search-window")).toMatchObject({
      passed: true,
      detail: "explicit candidates 3, targets 3",
    });
  });
});
