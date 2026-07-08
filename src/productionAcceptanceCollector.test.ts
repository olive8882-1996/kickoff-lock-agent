import { describe, expect, it } from "vitest";
import {
  buildProductionAcceptanceCollector,
  buildProductionAcceptanceCollectorArtifact,
} from "./productionAcceptanceCollector";
import { buildProductionVerifyEnv } from "./productionEvidence";
import type { DataProductionBootstrapPlan } from "./dataProductionBootstrap";
import type { DataProviderReadinessArtifact } from "./dataProviderReadiness";
import type { DataTargetScoutArtifact } from "./dataTargetScout";
import type { FilecoinProductionBootstrapPlan } from "./filecoinProductionBootstrap";
import type { FilecoinTargetSealArtifact } from "./filecoinTargetSeal";
import type { LeaderboardProductionArtifact } from "./leaderboardProductionBootstrap";
import type { ProductionTargetSeedArtifact } from "./productionTargetSeed";
import type { ShareImageUploadArtifact } from "./shareImageUpload";
import type { PublicRestoreEvidenceArtifact } from "./sharingProductionDoctor";
import type { ShareChannelEvidenceArtifact } from "./sharingProductionBootstrap";
import type { SupabaseSchemaApplyArtifact } from "./supabaseSchemaApply";
import type { CloudflarePagesDeployPlan } from "./cloudflarePagesDeployment";
import { buildSupabaseProductionBootstrapPlan } from "./supabaseProductionBootstrap";
import type { AccountCloudSyncEvidenceArtifact } from "./accountCloudSyncEvidence";
import type { ProductionAccessPreflightPacket } from "./productionAccessPreflight";

const cloudflareReadBackExpectation = (
  id: CloudflarePagesDeployPlan["readBackCommands"][number]["id"],
): CloudflarePagesDeployPlan["readBackCommands"][number]["responseExpectation"] => {
  if (id === "app-root") {
    return {
      responseType: "html",
      requiredFields: ["Kickoff Lock Agent", "runtime-config.js", "site.webmanifest", "assets/kickoff-lock-icon"],
    };
  }
  if (id === "runtime-config") {
    return {
      responseType: "runtime-config-js",
      requiredFields: [
        "window.__KICKOFF_RUNTIME_CONFIG__",
        "VITE_PUBLIC_APP_URL",
        "VITE_SUPABASE_URL",
        "VITE_DATA_PROXY_SAME_ORIGIN",
        "VITE_FILECOIN_SEAL_SAME_ORIGIN",
      ],
      forbiddenFields: [
        "APIFOOTBALL_KEY",
        "API_FOOTBALL_KEY",
        "ODDS_API_KEY",
        "THE_ODDS_API_KEY",
        "FILECOIN_SEAL_TOKEN",
        "SEAL_PROXY_TOKEN",
        "CLOUDFLARE_API_TOKEN",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SYNAPSE_PRIVATE_KEY",
      ],
    };
  }
  if (id === "data-proxy-health") {
    return {
      responseType: "json",
      expectedService: "kickoff-data-proxy",
      expectedSameOrigin: true,
      requiredFields: [
        "ok",
        "service",
        "allowedHosts",
        "allowedRoutes",
        "providerCapabilities",
        "apiFootballServerKey",
        "oddsApiServerKey",
        "footballDataServerToken",
      ],
    };
  }
  return {
    responseType: "json",
    expectedService: "kickoff-lock-filecoin-seal-proxy",
    expectedSameOrigin: true,
    requiredFields: [
      "ok",
      "service",
      "tokenInjected",
      "proxyCapabilities",
      "asyncUpload",
      "uploadStatus",
      "cidQuery",
      "verificationPolling",
    ],
  };
};

const accessPreflightArtifact = (
  patch: Partial<ProductionAccessPreflightPacket & { artifactVersion: 1; generatedAt: string; source: "local-script" }> = {},
): ProductionAccessPreflightPacket & { artifactVersion: 1; generatedAt: string; source: "local-script" } => ({
  artifactVersion: 1,
  generatedAt: "2026-07-04T12:00:00.000Z",
  source: "local-script",
  ready: true,
  stageReadyCount: 4,
  totalStages: 4,
  blockedStages: 0,
  missingEnv: [],
  cliAuthenticated: {
    cloudflare: true,
    supabase: true,
  },
  stages: [
    {
      id: "cloudflare-cli",
      label: "Cloudflare deploy access",
      status: "ready",
      command: "bunx wrangler whoami",
      missingEnv: [],
      detail: "Cloudflare Wrangler login is available for local deploy.",
      nextAction: "Cloudflare access is ready.",
    },
    {
      id: "supabase-cli",
      label: "Supabase management access",
      status: "ready",
      command: "bunx supabase projects list",
      missingEnv: [],
      detail: "Supabase CLI management access is available.",
      nextAction: "Supabase access is ready.",
    },
    {
      id: "manual-env",
      label: "Manual production env values",
      status: "ready",
      command: "bun run env:production:plan",
      missingEnv: [],
      detail: "Supabase, realtime data and Filecoin production values are present.",
      nextAction: "Manual env is ready.",
    },
    {
      id: "runtime-targets",
      label: "Generated verification targets",
      status: "ready",
      command: "bun run env:production",
      missingEnv: [],
      detail: "Generated verification targets are present.",
      nextAction: "Verification targets are ready.",
    },
  ],
  commands: ["bun run access:preflight"],
  nextAction: "Production access is ready.",
  copyText: "Kickoff Lock Agent production access preflight",
  ...patch,
});

const dataScoutEndpoints = (fixtureId: string) =>
  (["lineups", "injuries", "odds", "standings"] as const).map((key) => ({
    key,
    rows: key === "standings" || key === "lineups" ? 2 : 1,
    requiredRows: key === "standings" || key === "lineups" ? 2 : 1,
    status: "passed" as const,
    detail: `${fixtureId}:${key} scoped read-back passed`,
    fixtureScoped: true,
    teamScoped: true,
    sampleIds: [`${fixtureId}-${key}`],
    url:
      key === "standings"
        ? "https://v3.football.api-sports.io/standings?league=1&season=2026"
        : `https://v3.football.api-sports.io/${key === "lineups" ? "fixtures/lineups" : key}?fixture=${fixtureId}`,
  }));

const dataScoutFixtureSignals = (fixtureIds: string[]) =>
  fixtureIds.map((fixtureId) => ({
    fixtureId,
    ready: true,
    rows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
    requiredRows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
    missingEndpoints: [],
    detail: `${fixtureId} has live lineups, injuries, odds and standings rows`,
  }));

const dataScoutEndpointReadBackCommands = (fixtureIds: string[]) =>
  fixtureIds.flatMap((fixtureId) =>
    (["lineups", "injuries", "odds", "standings"] as const).map((key) => {
      const url =
        key === "standings"
          ? "https://v3.football.api-sports.io/standings?league=1&season=2026"
          : `https://v3.football.api-sports.io/${key === "lineups" ? "fixtures/lineups" : key}?fixture=${fixtureId}`;
      return {
        id: `${fixtureId}:${key}`,
        fixtureId,
        key,
        label: `${fixtureId} ${key} read-back`,
        url,
        command: `curl -sS '${url}' -H 'x-apisports-key: $APIFOOTBALL_KEY_OR_VITE_APIFOOTBALL_KEY'`,
        ready: true,
        rows: key === "standings" || key === "lineups" ? 2 : 1,
        sampleIds: [`${fixtureId}-${key}`],
        responseExpectation: {
          responseType: "json" as const,
          endpoint: key,
          expectedFixtureId: fixtureId,
          expectedTeamIds: [`${fixtureId}-home`, `${fixtureId}-away`],
          expectedTeamNames: ["Home", "Away"],
          minRows: key === "standings" || key === "lineups" ? 2 : 1,
          fixtureScoped: true,
          teamScoped: true,
        },
      };
    }),
  );

const scoutArtifact = (patch: Partial<DataTargetScoutArtifact> = {}): DataTargetScoutArtifact => ({
  ready: true,
  fixtureId: "100",
  fixtureIds: ["100", "200", "300"],
  requiredSignals: 4,
  requiredFixtureCount: 3,
  checkedFixtures: 3,
  candidates: [
    {
      fixtureId: "100",
      label: "A vs B",
      teamIds: ["100-home", "100-away"],
      teamNames: ["A", "B"],
      score: 33,
      endpoints: dataScoutEndpoints("100"),
      missingEndpoints: [],
      signalMatrix: "100:lineups=2|injuries=1|odds=1|standings=2",
      ready: true,
    },
    {
      fixtureId: "200",
      label: "C vs D",
      teamIds: ["200-home", "200-away"],
      teamNames: ["C", "D"],
      score: 33,
      endpoints: dataScoutEndpoints("200"),
      missingEndpoints: [],
      signalMatrix: "200:lineups=2|injuries=1|odds=1|standings=2",
      ready: true,
    },
    {
      fixtureId: "300",
      label: "E vs F",
      teamIds: ["300-home", "300-away"],
      teamNames: ["E", "F"],
      score: 33,
      endpoints: dataScoutEndpoints("300"),
      missingEndpoints: [],
      signalMatrix: "300:lineups=2|injuries=1|odds=1|standings=2",
      ready: true,
    },
  ],
  signalMatrix: "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
  verifyEnv: "",
  nextAction: "Set KICKOFF_VERIFY_FIXTURE_IDS=100,200,300 and run bun run doctor:data.",
  generatedAt: "2026-07-04T12:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  acceptance: {
    readyFixtureCount: 3,
    requiredFixtureCount: 3,
    completeSignalMatrix: true,
    fixtureSignals: dataScoutFixtureSignals(["100", "200", "300"]),
    endpointReadBackCommands: dataScoutEndpointReadBackCommands(["100", "200", "300"]),
    gaps: [],
    outputEnvKeys: ["KICKOFF_VERIFY_FIXTURE_IDS", "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"],
  },
  ...patch,
  gaps: patch.gaps ?? [],
});

const dataProviderArtifact = (
  patch: Partial<DataProviderReadinessArtifact> = {},
): DataProviderReadinessArtifact => ({
  ready: true,
  passed: 8,
  total: 8,
  checks: [],
  blockers: [],
  generatedAt: "2026-07-04T12:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  targets: {
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
      apiFootball: true,
      footballData: true,
      odds: true,
    },
    footballDataCredentialConfigured: true,
    freeFeedBackupConfigured: true,
    publicFreeFeedReadBack: {
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
    },
    dataProxyHealthProof: {
      checked: true,
      ok: true,
      service: "kickoff-data-proxy",
      apiFootballServerKey: true,
      footballDataServerToken: true,
      oddsApiServerKey: true,
    },
    fixtureSignalRows: ["100", "200", "300"].map((fixtureId) => ({
      fixtureId,
      ready: true,
      rows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
      requiredRows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
      missingSignals: [],
      detail: `${fixtureId} has lineups, injuries, odds and standings rows`,
    })),
    apiFootballEnrichmentLimit: "12",
    scoutLimit: "12",
    scoutTargets: "3",
  },
  acceptance: {
    apiFootballKey: true,
    footballDataBackup: true,
    publicFreeFeedReadBack: true,
    fixtureTargets: true,
    fixtureSignalMatrix: true,
    oddsProvider: true,
    dataProxyHttps: true,
    enrichmentLimitReady: true,
    scoutWindowReady: true,
    outputEnvKeys: [
      "VITE_APIFOOTBALL_KEY",
      "FOOTBALL_DATA_TOKEN",
      "FOOTBALL_DATA_ORG_TOKEN",
      "VITE_FOOTBALL_DATA_TOKEN",
      "VITE_DATA_PROXY_URL",
      "VITE_DATA_PROXY_SAME_ORIGIN",
      "KICKOFF_DATA_PROXY_API_FOOTBALL_READY",
      "KICKOFF_DATA_PROXY_FOOTBALL_DATA_READY",
      "KICKOFF_DATA_PROXY_ODDS_READY",
      "KICKOFF_VERIFY_FIXTURE_IDS",
      "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
      "VITE_APIFOOTBALL_ENRICHMENT_LIMIT",
      "KICKOFF_DATA_SCOUT_LIMIT",
      "KICKOFF_DATA_SCOUT_TARGETS",
    ],
  },
  ...patch,
});

const dataProxyReadBack = (targetUrl: string, source: string) => {
  const url = new URL("https://data.example.workers.dev/proxy");
  url.searchParams.set("url", targetUrl);
  url.searchParams.set("source", source);
  return url.toString();
};

const dataBootstrapExpectation = (
  source: DataProductionBootstrapPlan["readBackCommands"][number]["source"],
  signal: DataProductionBootstrapPlan["readBackCommands"][number]["signal"],
  fixtureId?: string,
): DataProductionBootstrapPlan["readBackCommands"][number]["responseExpectation"] => {
  if (signal === "health") {
    return {
      responseType: "data-proxy-health",
      rowPath: "$",
      requiredFields: ["ok", "service", "apiFootballServerKey", "footballDataServerToken", "oddsApiServerKey"],
      expectedSource: source,
      expectedSignal: signal,
      expectedService: "kickoff-data-proxy",
      requiredCredentialFlags: ["apiFootballServerKey", "footballDataServerToken", "oddsApiServerKey"],
    };
  }
  if (source === "openfootball") {
    return {
      responseType: "openfootball-worldcup",
      rowPath: "matches",
      minRows: 1,
      requiredFields: ["name", "matches"],
      expectedSource: source,
      expectedSignal: signal,
      expectedSeason: "2026",
      expectedCompetition: "worldcup",
    };
  }
  if (source === "thesportsdb") {
    return {
      responseType: "thesportsdb-season",
      rowPath: "events",
      minRows: 1,
      requiredFields: ["idEvent", "strEvent", "dateEvent", "strHomeTeam", "strAwayTeam"],
      expectedSource: source,
      expectedSignal: signal,
      expectedSeason: "2026",
    };
  }
  if (source === "football-data") {
    return {
      responseType: "football-data-response",
      rowPath: signal === "standings" ? "standings" : "matches",
      minRows: 1,
      requiredFields:
        signal === "standings"
          ? ["stage", "table", "team", "points"]
          : ["id", "utcDate", "status", "homeTeam", "awayTeam", "score"],
      expectedSource: source,
      expectedSignal: signal,
      expectedSeason: "2026",
      expectedCompetition: "WC",
    };
  }
  if (source === "odds-api") {
    return {
      responseType: "odds-api-response",
      rowPath: "$",
      minRows: 1,
      requiredFields: ["id", "home_team", "away_team", "bookmakers"],
      expectedSource: source,
      expectedSignal: signal,
    };
  }
  return {
    responseType: "api-football-response",
    rowPath: signal === "standings" ? "response[0].league.standings" : "response",
    minRows: signal === "standings" || signal === "lineups" ? 2 : 1,
    requiredFields:
      signal === "standings"
        ? ["league", "standings", "team", "rank", "points"]
        : signal === "lineups"
          ? ["team", "formation", "startXI"]
          : signal === "injuries"
            ? ["player", "team", "fixture"]
            : ["league", "fixture", "bookmakers", "bets"],
    expectedSource: source,
    expectedSignal: signal,
    expectedFixtureId: fixtureId,
    expectedSeason: "2026",
  };
};

const dataBootstrapFixtureCommands = ["100", "200", "300"].flatMap((fixtureId) => [
  {
    id: `fixture:${fixtureId}:lineups`,
    label: `Fixture ${fixtureId} lineups`,
    source: "api-football" as const,
    signal: "lineups" as const,
    targetUrl: `https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`,
    proxyMode: "data-proxy" as const,
    fixtureId,
    ready: true,
    url: dataProxyReadBack(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`, "api-football"),
    responseExpectation: dataBootstrapExpectation("api-football", "lineups", fixtureId),
    command: `curl -sS '${dataProxyReadBack(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`, "api-football")}'`,
  },
  {
    id: `fixture:${fixtureId}:injuries`,
    label: `Fixture ${fixtureId} injuries`,
    source: "api-football" as const,
    signal: "injuries" as const,
    targetUrl: `https://v3.football.api-sports.io/injuries?fixture=${fixtureId}`,
    proxyMode: "data-proxy" as const,
    fixtureId,
    ready: true,
    url: dataProxyReadBack(`https://v3.football.api-sports.io/injuries?fixture=${fixtureId}`, "api-football"),
    responseExpectation: dataBootstrapExpectation("api-football", "injuries", fixtureId),
    command: `curl -sS '${dataProxyReadBack(`https://v3.football.api-sports.io/injuries?fixture=${fixtureId}`, "api-football")}'`,
  },
  {
    id: `fixture:${fixtureId}:odds`,
    label: `Fixture ${fixtureId} odds`,
    source: "api-football" as const,
    signal: "odds" as const,
    targetUrl: `https://v3.football.api-sports.io/odds?fixture=${fixtureId}`,
    proxyMode: "data-proxy" as const,
    fixtureId,
    ready: true,
    url: dataProxyReadBack(`https://v3.football.api-sports.io/odds?fixture=${fixtureId}`, "api-football"),
    responseExpectation: dataBootstrapExpectation("api-football", "odds", fixtureId),
    command: `curl -sS '${dataProxyReadBack(`https://v3.football.api-sports.io/odds?fixture=${fixtureId}`, "api-football")}'`,
  },
]);

const dataBootstrapPlan = (patch: Partial<DataProductionBootstrapPlan> = {}): DataProductionBootstrapPlan => ({
  ready: false,
  execute: false,
  stageReadyCount: 1,
  totalStages: 4,
  blockedStages: 3,
  missingEnv: [],
  stages: [],
  commands: ["bun run data:providers:check", "bun run scout:data-targets", "bun run doctor:data"],
  readBackCommands: [
    {
      id: "data-proxy-health",
      label: "Data proxy health",
      source: "data-proxy",
      signal: "health",
      targetUrl: "https://data.example.workers.dev/proxy/health",
      proxyMode: "data-proxy",
      ready: true,
      url: "https://data.example.workers.dev/proxy/health",
      responseExpectation: dataBootstrapExpectation("data-proxy", "health"),
      command: "curl -sS 'https://data.example.workers.dev/proxy/health'",
    },
    {
      id: "openfootball-worldcup-2026",
      label: "openfootball World Cup 2026 JSON",
      source: "openfootball",
      signal: "worldcup-json",
      targetUrl: "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
      proxyMode: "direct-public",
      ready: true,
      url: "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
      responseExpectation: dataBootstrapExpectation("openfootball", "worldcup-json"),
      command: "curl -sS 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'",
    },
    {
      id: "thesportsdb-worldcup-season",
      label: "TheSportsDB World Cup season feed",
      source: "thesportsdb",
      signal: "season-feed",
      targetUrl: "https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026",
      proxyMode: "direct-public",
      ready: true,
      url: "https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026",
      responseExpectation: dataBootstrapExpectation("thesportsdb", "season-feed"),
      command: "curl -sS 'https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026'",
    },
    {
      id: "api-football-standings",
      label: "API-Football standings",
      source: "api-football",
      signal: "standings",
      targetUrl: "https://v3.football.api-sports.io/standings?league=1&season=2026",
      proxyMode: "data-proxy",
      ready: true,
      url: dataProxyReadBack("https://v3.football.api-sports.io/standings?league=1&season=2026", "api-football"),
      responseExpectation: dataBootstrapExpectation("api-football", "standings"),
      command: `curl -sS '${dataProxyReadBack("https://v3.football.api-sports.io/standings?league=1&season=2026", "api-football")}'`,
    },
    {
      id: "football-data-matches",
      label: "Football-Data matches",
      source: "football-data",
      signal: "matches",
      targetUrl: "https://api.football-data.org/v4/competitions/WC/matches?season=2026",
      proxyMode: "data-proxy",
      ready: true,
      url: dataProxyReadBack("https://api.football-data.org/v4/competitions/WC/matches?season=2026", "football-data"),
      responseExpectation: dataBootstrapExpectation("football-data", "matches"),
      command: `curl -sS '${dataProxyReadBack("https://api.football-data.org/v4/competitions/WC/matches?season=2026", "football-data")}'`,
    },
    {
      id: "football-data-standings",
      label: "Football-Data standings",
      source: "football-data",
      signal: "standings",
      targetUrl: "https://api.football-data.org/v4/competitions/WC/standings?season=2026",
      proxyMode: "data-proxy",
      ready: true,
      url: dataProxyReadBack("https://api.football-data.org/v4/competitions/WC/standings?season=2026", "football-data"),
      responseExpectation: dataBootstrapExpectation("football-data", "standings"),
      command: `curl -sS '${dataProxyReadBack("https://api.football-data.org/v4/competitions/WC/standings?season=2026", "football-data")}'`,
    },
    {
      id: "odds-api-h2h",
      label: "The Odds API H2H",
      source: "odds-api",
      signal: "odds",
      targetUrl: "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?regions=us&markets=h2h&oddsFormat=decimal",
      proxyMode: "data-proxy",
      ready: true,
      url: dataProxyReadBack("https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?regions=us&markets=h2h&oddsFormat=decimal", "odds-api"),
      responseExpectation: dataBootstrapExpectation("odds-api", "odds"),
      command: `curl -sS '${dataProxyReadBack("https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?regions=us&markets=h2h&oddsFormat=decimal", "odds-api")}'`,
    },
    ...dataBootstrapFixtureCommands,
  ],
  nextAction: "Deploy free feed CORS proxy: run bun run data:proxy:deploy.",
  copyText: "Kickoff Lock Agent realtime data production bootstrap",
  ...patch,
});

const filecoinBootstrapReadBack = (
  label: string,
  kind: "health" | "job" | "verify" | "proof",
  cidOrJobId?: string,
  expectedPayloadHash?: string,
) => {
  const url =
    kind === "health"
      ? "https://seal.example/health"
      : kind === "job"
        ? `https://seal.example/jobs/${cidOrJobId}`
      : kind === "verify"
        ? `https://seal.example/verify?cid=${cidOrJobId}`
        : `https://seal.example/proof/${cidOrJobId}`;
  return {
    label,
    kind,
    url,
    authMode: kind === "health" ? "none" as const : "bearer-token" as const,
    ready: true,
    responseExpectation:
      kind === "health"
        ? {
            ok: true,
            productionReady: true,
            mockMode: false,
            authRequired: true,
            persistence: "file",
          }
        : kind === "job"
          ? {
              ok: true,
              status: "verified",
              jobId: cidOrJobId,
            }
          : {
              ok: true,
              proofStatus: kind === "verify" ? "verified" : "retrievable",
              cid: cidOrJobId,
              payloadHash: expectedPayloadHash,
            },
    expectedCid: kind === "verify" || kind === "proof" ? cidOrJobId : undefined,
    expectedJobId: kind === "job" ? cidOrJobId : undefined,
    expectedPayloadHash,
    command:
      kind === "health"
        ? `curl -sS '${url}'`
        : `curl -sS '${url}' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
  };
};

const filecoinBootstrapPlan = (
  patch: Partial<FilecoinProductionBootstrapPlan> = {},
): FilecoinProductionBootstrapPlan => ({
  ready: true,
  execute: false,
  stageReadyCount: 4,
  totalStages: 4,
  blockedStages: 0,
  missingEnv: [],
  stages: [],
  commands: ["bun run filecoin:api:check", "bun run seal:production-targets", "bun run doctor:filecoin"],
  readBackCommands: [
    filecoinBootstrapReadBack("Seal API health", "health"),
    filecoinBootstrapReadBack("Record upload status", "job", "job-record"),
    filecoinBootstrapReadBack("Record verify status", "verify", "bafy-record", "a".repeat(64)),
    filecoinBootstrapReadBack("Record proof read-back", "proof", "bafy-record", "a".repeat(64)),
    ...["b", "c", "d", "e", "f", "1"].flatMap((hash, index) => [
      filecoinBootstrapReadBack(`Mode ${index + 1} upload status`, "job", `job-mode-${index + 1}`),
      filecoinBootstrapReadBack(`Mode ${index + 1} verify status`, "verify", `bafy-${index + 1}`, hash.repeat(64)),
      filecoinBootstrapReadBack(`Mode ${index + 1} proof read-back`, "proof", `bafy-${index + 1}`, hash.repeat(64)),
    ]),
  ],
  nextAction: "Filecoin production bootstrap targets are ready. Run bun run doctor:filecoin.",
  copyText: "Kickoff Lock Agent Filecoin production bootstrap",
  ...patch,
});

const cloudflarePlan = (patch: Partial<CloudflarePagesDeployPlan> = {}): CloudflarePagesDeployPlan => ({
  ready: false,
  projectName: "kickoff-lock-agent",
  branch: "main",
  outputDir: "dist",
  plannedPagesUrl: "https://kickoff-lock-agent.pages.dev/",
  tokenAuthReady: false,
  wranglerLoginReady: false,
  sameOriginData: true,
  sameOriginSeal: true,
  functionsReady: true,
  runtimePreflight: {
    sameOriginData: true,
    sameOriginSeal: true,
    functionsReady: true,
    functionEntryProblems: [],
    problems: [
      "APIFOOTBALL_KEY is missing for same-origin /data-proxy enrichment.",
      "ODDS_API_KEY is missing for proxied The Odds API reads.",
      "FILECOIN_SEAL_UPSTREAM_URL is missing.",
      "FILECOIN_SEAL_TOKEN is missing for same-origin /seal token injection.",
    ],
  },
  stageReadyCount: 1,
  totalStages: 4,
  blockedStages: 3,
  missingEnv: [
    "APIFOOTBALL_KEY",
    "ODDS_API_KEY",
    "FILECOIN_SEAL_UPSTREAM_URL",
    "FILECOIN_SEAL_TOKEN",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
  ],
  stages: [
    {
      id: "functions",
      label: "Build Cloudflare Pages Functions bundle",
      status: "done",
      command: "bun run pages:functions:build",
      requiredEnv: [],
      missingEnv: [],
      outputEnv: [".wrangler/pages-functions.js"],
      detail: "Cloudflare Pages Functions bundle compiled with Wrangler.",
    },
    {
      id: "runtime-secrets",
      label: "Set Pages runtime secrets",
      status: "blocked",
      command: "Set Cloudflare Pages environment variables",
      requiredEnv: [
        "APIFOOTBALL_KEY",
        "ODDS_API_KEY",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "FILECOIN_SEAL_TOKEN",
        "ALLOW_ORIGIN",
      ],
      missingEnv: ["APIFOOTBALL_KEY", "ODDS_API_KEY", "FILECOIN_SEAL_UPSTREAM_URL", "FILECOIN_SEAL_TOKEN"],
      outputEnv: ["same-origin /data-proxy/health", "same-origin /seal health"],
      detail: "Runtime secrets are incomplete.",
    },
    {
      id: "auth",
      label: "Authenticate Cloudflare deploy",
      status: "blocked",
      command: "bun run pages:cf:check",
      requiredEnv: ["CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID or wrangler login"],
      missingEnv: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
      outputEnv: ["Cloudflare Pages deploy authorization"],
      detail: "Cloudflare auth missing.",
    },
    {
      id: "deploy",
      label: "Deploy app and same-origin backend routes",
      status: "blocked",
      command: "bun run pages:cf:deploy",
      requiredEnv: ["Cloudflare Pages project", "dist build", "functions bundle", "deploy auth"],
      missingEnv: [
        "APIFOOTBALL_KEY",
        "ODDS_API_KEY",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "FILECOIN_SEAL_TOKEN",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
      ],
      outputEnv: ["https://kickoff-lock-agent.pages.dev/", "VITE_DATA_PROXY_SAME_ORIGIN=1", "VITE_FILECOIN_SEAL_SAME_ORIGIN=1"],
      detail: "Complete Functions, runtime secrets and Cloudflare auth.",
    },
  ],
  commands: ["bun run pages:functions:build", "bun run pages:cf:check", "bun run pages:cf:deploy"],
  readBackCommands: [
    {
      id: "app-root",
      label: "Published app root",
      url: "https://kickoff-lock-agent.pages.dev/",
      command: "curl -sS 'https://kickoff-lock-agent.pages.dev/'",
      ready: false,
      responseExpectation: cloudflareReadBackExpectation("app-root"),
    },
    {
      id: "runtime-config",
      label: "Published runtime config",
      url: "https://kickoff-lock-agent.pages.dev/runtime-config.js",
      command: "curl -sS 'https://kickoff-lock-agent.pages.dev/runtime-config.js'",
      ready: false,
      responseExpectation: cloudflareReadBackExpectation("runtime-config"),
    },
    {
      id: "data-proxy-health",
      label: "Same-origin data proxy health",
      url: "https://kickoff-lock-agent.pages.dev/data-proxy/health",
      command: "curl -sS 'https://kickoff-lock-agent.pages.dev/data-proxy/health'",
      ready: false,
      responseExpectation: cloudflareReadBackExpectation("data-proxy-health"),
    },
    {
      id: "seal-health",
      label: "Same-origin Filecoin seal health",
      url: "https://kickoff-lock-agent.pages.dev/seal/health",
      command: "curl -sS 'https://kickoff-lock-agent.pages.dev/seal/health'",
      ready: false,
      responseExpectation: cloudflareReadBackExpectation("seal-health"),
    },
  ],
  secretExposureChecks: [
    {
      id: "runtime-config-public-safe",
      label: "Published runtime config excludes server secrets",
      passed: true,
      detail: "runtime-config.js only needs public VITE values",
    },
    {
      id: "readback-commands-public-safe",
      label: "Read-back commands exclude secret values",
      passed: true,
      detail: "curl commands use public health/read-back URLs only",
    },
    {
      id: "browser-api-keys-not-required",
      label: "Browser API keys are not required for enrichment",
      passed: true,
      detail: "same-origin /data-proxy injects API-Football/Odds credentials server-side",
    },
    {
      id: "browser-seal-token-not-required",
      label: "Browser seal token is not required",
      passed: true,
      detail: "same-origin /seal injects FILECOIN_SEAL_TOKEN server-side",
    },
  ],
  proxyCapabilityChecks: [
    {
      id: "data-free-feeds",
      service: "data-proxy",
      label: "Free schedule/score feeds",
      passed: true,
      detail: "same-origin proxy exposes ESPN, openfootball, TheSportsDB and worldcup26 allowlisted reads",
      readBackCommand: "curl -sS 'https://kickoff-lock-agent.pages.dev/data-proxy/health'",
    },
    {
      id: "data-api-football-enrichment",
      service: "data-proxy",
      label: "API-Football lineups/injuries/rankings",
      passed: false,
      detail: "set APIFOOTBALL_KEY as a Pages runtime secret",
      readBackCommand: "curl -sS 'https://kickoff-lock-agent.pages.dev/data-proxy/health'",
    },
    {
      id: "data-odds-enrichment",
      service: "data-proxy",
      label: "Odds/handicap enrichment",
      passed: false,
      detail: "set ODDS_API_KEY as a Pages runtime secret",
      readBackCommand: "curl -sS 'https://kickoff-lock-agent.pages.dev/data-proxy/health'",
    },
    {
      id: "filecoin-async-upload",
      service: "filecoin-seal",
      label: "Async Filecoin upload",
      passed: false,
      detail: "set FILECOIN_SEAL_UPSTREAM_URL and FILECOIN_SEAL_TOKEN",
      readBackCommand: "curl -sS 'https://kickoff-lock-agent.pages.dev/seal/health'",
    },
    {
      id: "filecoin-job-polling",
      service: "filecoin-seal",
      label: "Upload status polling",
      passed: false,
      detail: "deploy /jobs/:id Pages Function and upstream seal API",
      readBackCommand: "curl -sS 'https://kickoff-lock-agent.pages.dev/seal/health'",
    },
    {
      id: "filecoin-cid-readback",
      service: "filecoin-seal",
      label: "CID proof read-back",
      passed: false,
      detail: "deploy /proof/:cid and /verify routes",
      readBackCommand: "curl -sS 'https://kickoff-lock-agent.pages.dev/seal/health'",
    },
  ],
  nextAction: "Set Pages runtime secrets.",
  copyText: "Kickoff Lock Agent Cloudflare Pages deploy plan",
  ...patch,
});

const supabaseArtifact = (patch: Partial<ProductionTargetSeedArtifact> = {}): ProductionTargetSeedArtifact => ({
  ready: true,
  missing: [],
  seed: {
    targets: {
      userId: "user-1",
      profileId: "user-1",
      publicProfileUrl: "https://example.com/?profile=user-1",
      proofId: "cap-1",
      modeId: "mode-bracket",
      modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
      shareArtifactIds: [
        "record:cap-1",
        "mode:mode-bracket",
        "mode:mode-parlay",
        "mode:mode-agent",
        "mode:mode-upset",
        "mode:mode-group-path",
        "mode:mode-penalty-pressure",
      ],
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      leaderboardScopes: ["global", "friend", "season"],
      shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
    },
  },
  generatedAt: "2026-07-04T12:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  dryRun: false,
  upserted: true,
  authUser: {
    ready: true,
    userId: "user-1",
    url: "https://project.supabase.co/auth/v1/admin/users/user-1",
    detail: "Auth user user-1 read back with email and google",
    missing: [],
    sampleIds: ["user-1"],
  },
  doctor: {
    ready: true,
    requiredPassed: 21,
    requiredTotal: 21,
    passedCheckIds: ["target-auth-user", "target-auth-profile-identity"],
    failedCheckIds: [],
  },
  acceptance: {
    authUserReady: true,
    upserted: true,
    doctorReady: true,
    profileTarget: true,
    recordTarget: true,
    modeTargetCount: 6,
    requiredModeTargetCount: 6,
    shareArtifactCount: 7,
    requiredShareArtifactCount: 7,
    recordShareChannelOpened: true,
    modeShareChannelCount: 6,
    requiredModeShareChannelCount: 6,
    shareChannelCount: 7,
    requiredShareChannelCount: 7,
    outputEnvKeys: [
      "KICKOFF_VERIFY_USER_ID",
      "KICKOFF_VERIFY_PROFILE_ID",
      "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
      "KICKOFF_VERIFY_PROOF_ID",
      "KICKOFF_VERIFY_MODE_IDS",
      "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
      "KICKOFF_VERIFY_FRIEND_CODE",
      "KICKOFF_VERIFY_SEASON_KEY",
      "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
      "KICKOFF_VERIFY_SHARE_IMAGE_URL",
      "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
    ],
  },
  ...patch,
} as unknown as ProductionTargetSeedArtifact);

const supabaseSchemaArtifact = (patch: Partial<SupabaseSchemaApplyArtifact> = {}): SupabaseSchemaApplyArtifact => ({
  ready: true,
  dryRun: false,
  schemaPath: "supabase.schema.sql",
  databaseUrl: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
  maskedDatabaseUrl: "postgresql://postgres:***@db.project.supabase.co:5432/postgres",
  command: "psql",
  args: ["--set", "ON_ERROR_STOP=1", "--file", "supabase.schema.sql", "postgresql://postgres:secret@db.project.supabase.co:5432/postgres"],
  missing: [],
  action: "Run doctor:supabase.",
  schemaContract: {
    ready: true,
    passed: 6,
    total: 6,
    missing: [],
    checks: [],
  },
  generatedAt: "2026-07-04T12:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  schemaReadable: true,
  psqlAvailable: true,
  applied: true,
  executeStatus: 0,
  acceptance: {
    schemaReadable: true,
    contractReady: true,
    psqlAvailable: true,
    applied: true,
    dryRun: false,
    outputEnvKeys: [
      "kickoff_profiles",
      "kickoff_records",
      "kickoff_mode_runs",
      "kickoff_share_artifacts",
      "kickoff_leaderboard",
      "kickoff_backend_health",
    ],
  },
  ...patch,
});

const supabaseBootstrapPlan = () =>
  buildSupabaseProductionBootstrapPlan({
    SUPABASE_DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
    VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    VITE_SUPABASE_URL: "https://project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon",
    VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    KICKOFF_SEED_SHARE_IMAGE_URL:
      "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
    KICKOFF_SEED_MODE_SHARE_IMAGE_URL:
      "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
    KICKOFF_VERIFY_USER_ID: "user-1",
    KICKOFF_VERIFY_PROFILE_ID: "user-1",
    KICKOFF_VERIFY_PROOF_ID: "cap-1",
    KICKOFF_VERIFY_MODE_IDS: "mode-bracket,mode-parlay,mode-agent,mode-upset,mode-group-path,mode-penalty-pressure",
    KICKOFF_VERIFY_FRIEND_CODE: "chengdu",
    KICKOFF_VERIFY_SEASON_KEY: "world-cup-run",
  });

const shareUploadArtifact = (
  kind: "record" | "mode",
  publicUrl: string,
  patch: Partial<ShareImageUploadArtifact> = {},
): ShareImageUploadArtifact => {
  const result = {
    path: kind === "mode" ? "user-1/mode/mode-bracket/card.png" : "user-1/record/cap-1/card.png",
    uploadUrl: `https://project.supabase.co/storage/v1/object/kickoff-share-cards/user-1/${kind}/card.png`,
    publicUrl,
    imageMime: "image/png",
    imageByteLength: 120_000,
    imageHash: kind === "mode" ? "b".repeat(64) : "a".repeat(64),
    publicReadBack: true,
  } as const;
  return {
    ready: true,
    missing: [],
    result,
  generatedAt: "2026-07-04T12:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  filePath: kind === "mode" ? "public/generated/kickoff-production-mode-share.png" : "public/generated/kickoff-production-share.png",
  target: {
    profileId: "user-1",
    kind,
    artifactId: kind === "mode" ? "mode-bracket" : "cap-1",
    fileName: "card.png",
    imageMime: "image/png",
  },
  readBackCommands: [
    {
      id: "public-image",
      label: "Public Supabase Storage share image",
      url: publicUrl,
      command: `curl -sS '${publicUrl}' -o /tmp/kickoff-share-image-readback.png`,
      ready: true,
      path: result.path,
      responseExpectation: {
        responseType: "image",
        contentType: "image/png",
        expectedImageHash: result.imageHash,
        expectedByteLength: result.imageByteLength,
        minByteLength: 10_000,
        expectedPublicUrl: publicUrl,
        expectedStoragePath: result.path,
      },
    },
  ],
  acceptance: {
    uploaded: true,
    publicReadBack: true,
    supabasePublicUrl: true,
    imageHashReady: true,
    localImageHashReady: true,
    localImageSizeReady: true,
    outputEnvKeys:
      kind === "mode"
        ? ["KICKOFF_SEED_MODE_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"]
        : ["KICKOFF_SEED_SHARE_IMAGE_URL", "KICKOFF_VERIFY_SHARE_IMAGE_URL"],
  },
  ...patch,
  };
};

const accountCloudSyncArtifact = (
  patch: Partial<AccountCloudSyncEvidenceArtifact> = {},
): AccountCloudSyncEvidenceArtifact => ({
  artifactVersion: 1,
  generatedAt: "2026-07-04T12:00:00.000Z",
  source: "test",
  ready: true,
  profileId: "user-1",
  cloudMode: "supabase",
  configured: true,
  authenticated: true,
  localTotals: {
    profile: 1,
    records: 1,
    modeRuns: 5,
    shareArtifacts: 6,
    publicProofs: 6,
    historyArtifacts: 12,
  },
  verifiedTotals: {
    records: 1,
    modeRuns: 5,
    shareArtifacts: 6,
    publicProofs: 6,
    publicShareImages: 6,
    publicProfileArchives: 12,
    contentFingerprints: 12,
  },
  expectedIds: {
    records: ["cap-1"],
    modeRuns: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
    shareArtifacts: [
      "record:cap-1",
      "mode:mode-bracket",
      "mode:mode-parlay",
      "mode:mode-agent",
      "mode:mode-upset",
      "mode:mode-group-path",
      "mode:mode-penalty-pressure",
    ],
    publicProofs: [
      "record:cap-1",
      "mode:mode-bracket",
      "mode:mode-parlay",
      "mode:mode-agent",
      "mode:mode-upset",
      "mode:mode-group-path",
      "mode:mode-penalty-pressure",
    ],
    leaderboardScopes: ["global", "friend", "season"],
  },
  acceptance: {
    backendReady: true,
    profileIdentityReady: true,
    historyReady: true,
    publicProofsReady: true,
    shareArtifactsReady: true,
    publicProfileReady: true,
    outboxEmpty: true,
    auditPassed: true,
    leaderboardScopesReady: true,
    cloudReadBackReady: true,
  },
  outbox: [
    { key: "profile", label: "Profile row", status: "verified", queued: 0, verified: 1, total: 1, detail: "ok", action: "ok" },
    { key: "records", label: "Prediction history", status: "verified", queued: 0, verified: 1, total: 1, detail: "ok", action: "ok" },
    { key: "modeRuns", label: "Mode proofs", status: "verified", queued: 0, verified: 5, total: 5, detail: "ok", action: "ok" },
    { key: "shareArtifacts", label: "Share manifests", status: "verified", queued: 0, verified: 6, total: 6, detail: "ok", action: "ok" },
    { key: "publicProofs", label: "Public proof links", status: "verified", queued: 0, verified: 6, total: 6, detail: "ok", action: "ok" },
  ],
  audit: [
    "backend",
    "profile",
    "records",
    "modeRuns",
    "publicProofs",
    "shareArtifacts",
    "contentFingerprints",
    "publicProfile",
    "leaderboard",
  ].map((key) => ({
    key: key as AccountCloudSyncEvidenceArtifact["audit"][number]["key"],
    label: key,
    status: "passed" as const,
    synced: 1,
    total: 1,
    detail: "ok",
    action: "ok",
  })),
  coverage: {
    passed: true,
    pendingItems: 0,
    detail: "12 items verified by cloud read-back",
  },
  leaderboardQueryContract: {
    profileId: "user-1",
    ready: true,
    passedScopes: 3,
    totalScopes: 3,
    targetQueries: {
      global: "kickoff_leaderboard?select=*&order=xp.desc&limit=1&id=eq.user-1",
      friend: "kickoff_leaderboard?select=*&order=xp.desc&limit=1&id=eq.user-1&friend_code=eq.chengdu",
      season: "kickoff_leaderboard?select=*&order=xp.desc&limit=1&id=eq.user-1&season_key=eq.world-cup-run",
    },
    filters: {
      global: "global xp desc",
      friend: "friend_code=eq.chengdu",
      season: "season_key=eq.world-cup-run",
    },
    scopes: (["global", "friend", "season"] as const).map((scope, index) => ({
      scope,
      passed: true,
      filterReady: true,
      targetQueryReady: true,
      currentUserReady: true,
      scopeBindingReady: true,
      scopedRankReady: true,
      statsReady: true,
      detail: `2 rows · current user rank ${index + 1}`,
      action: "Leaderboard query contract is ready for this scope.",
    })),
    summary: "Fan One · 3/3 leaderboard query contracts",
    nextAction: "Global, friend and season leaderboard queries have current-user read-back contracts.",
    copyText: "Kickoff Lock Agent leaderboard query contract\nReady: yes",
  },
  missing: [],
  evidenceFingerprint: "account-cloud-sync-fixture",
  nextAction: "Cloud account evidence is ready.",
  copyText: "Kickoff Lock Agent account cloud sync evidence\nReady: yes",
  ...patch,
});

const leaderboardSelect = [
  "id",
  "display_name",
  "location",
  "friend_code",
  "season_key",
  "locks",
  "revealed",
  "average_score",
  "best_score",
  "xp",
  "streak",
  "exact_hits",
  "verified_proofs",
  "mode_proofs",
  "global_rank",
  "friend_rank",
  "season_rank",
  "rank",
  "updated_at",
].join(",");

const leaderboardTargetQueries = {
  global: `kickoff_leaderboard?select=${leaderboardSelect}&order=xp.desc&id=eq.user-1&limit=1`,
  friend: `kickoff_leaderboard?select=${leaderboardSelect}&order=xp.desc&id=eq.user-1&friend_code=eq.chengdu&limit=1`,
  season: `kickoff_leaderboard?select=${leaderboardSelect}&order=xp.desc&id=eq.user-1&season_key=eq.world-cup-run&limit=1`,
};

const leaderboardBoardQueries = {
  global: `kickoff_leaderboard?select=${leaderboardSelect}&order=global_rank.asc&limit=20`,
  friend: `kickoff_leaderboard?select=${leaderboardSelect}&order=friend_rank.asc&friend_code=eq.chengdu&limit=20`,
  season: `kickoff_leaderboard?select=${leaderboardSelect}&order=season_rank.asc&season_key=eq.world-cup-run&limit=20`,
};

const leaderboardQueryContracts = (["global", "friend", "season"] as const).map((scope) => ({
  scope,
  passed: true,
  targetQueryReady: true,
  boardQueryReady: true,
  targetQuery: leaderboardTargetQueries[scope],
  boardQuery: leaderboardBoardQueries[scope],
  detail: `${scope} target and board queries are complete`,
}));

const leaderboardResponseExpectation = (
  scope: "global" | "friend" | "season",
  kind: "current-user" | "board",
) => ({
  responseType: "supabase-array" as const,
  table: "kickoff_leaderboard" as const,
  scope,
  kind,
  minRows: kind === "current-user" ? 1 : 10,
  requiredFields: leaderboardSelect.split(","),
  expectedOrder:
    kind === "current-user"
      ? "xp.desc"
      : { global: "global_rank.asc", friend: "friend_rank.asc", season: "season_rank.asc" }[scope],
  expectedUserId: kind === "current-user" ? "user-1" : undefined,
  expectedFriendCode: scope === "friend" ? "chengdu" : undefined,
  expectedSeasonKey: scope === "season" ? "world-cup-run" : undefined,
  requiredRankFields: ["global_rank", "friend_rank", "season_rank", "rank"],
});

const leaderboardReadBackCommands = (["global", "friend", "season"] as const).flatMap((scope) => [
  {
    id: `leaderboard:${scope}:current-user`,
    scope,
    kind: "current-user" as const,
    label: `${scope} current-user row`,
    queryPath: leaderboardTargetQueries[scope],
    authMode: "anon" as const,
    expectedUserId: "user-1",
    expectedFriendCode: scope === "friend" ? "chengdu" : undefined,
    expectedSeasonKey: scope === "season" ? "world-cup-run" : undefined,
    expectedOrder: "xp.desc",
    minRows: 1,
    url: `https://project.supabase.co/rest/v1/${leaderboardTargetQueries[scope]}`,
    command: `curl -sS 'https://project.supabase.co/rest/v1/${leaderboardTargetQueries[scope]}' -H 'apikey: $VITE_SUPABASE_ANON_KEY' -H 'Authorization: Bearer $VITE_SUPABASE_ANON_KEY'`,
    ready: true,
    responseExpectation: leaderboardResponseExpectation(scope, "current-user"),
  },
  {
    id: `leaderboard:${scope}:board`,
    scope,
    kind: "board" as const,
    label: `${scope} leaderboard board`,
    queryPath: leaderboardBoardQueries[scope],
    authMode: "anon" as const,
    expectedUserId: undefined,
    expectedFriendCode: scope === "friend" ? "chengdu" : undefined,
    expectedSeasonKey: scope === "season" ? "world-cup-run" : undefined,
    expectedOrder: { global: "global_rank.asc", friend: "friend_rank.asc", season: "season_rank.asc" }[scope],
    minRows: 10,
    url: `https://project.supabase.co/rest/v1/${leaderboardBoardQueries[scope]}`,
    command: `curl -sS 'https://project.supabase.co/rest/v1/${leaderboardBoardQueries[scope]}' -H 'apikey: $VITE_SUPABASE_ANON_KEY' -H 'Authorization: Bearer $VITE_SUPABASE_ANON_KEY'`,
    ready: true,
    responseExpectation: leaderboardResponseExpectation(scope, "board"),
  },
]);

const leaderboardScopeClaims = (["global", "friend", "season"] as const).map((scope) => ({
  scope,
  doctorCheckId: {
    global: "leaderboard-global-user",
    friend: "leaderboard-friend-user",
    season: "leaderboard-season-user",
  }[scope],
  boardCheckId: {
    global: "leaderboard-global-board",
    friend: "leaderboard-friend-board",
    season: "leaderboard-season-board",
  }[scope],
  currentUser: true,
  boardRows: true,
  doctorPassed: true,
  boardPassed: true,
  targetQueryReady: true,
  boardQueryReady: true,
  targetQuery: leaderboardTargetQueries[scope],
  boardQuery: leaderboardBoardQueries[scope],
  blockers: [],
}));

const leaderboardArtifact = (patch: Partial<LeaderboardProductionArtifact> = {}): LeaderboardProductionArtifact => ({
  ready: true,
  execute: false,
  stageReadyCount: 3,
  totalStages: 3,
  blockedStages: 0,
  missingEnv: [],
  stages: [],
  commands: [],
  targetQueries: leaderboardTargetQueries,
  boardQueries: leaderboardBoardQueries,
  queryContracts: leaderboardQueryContracts,
  readBackCommands: leaderboardReadBackCommands,
  nextAction: "Leaderboard backend bootstrap targets are ready. Run bun run doctor:supabase.",
  copyText: "Kickoff Lock Agent leaderboard production bootstrap",
  generatedAt: "2026-07-04T12:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  targets: {
    userId: "user-1",
    friendCode: "chengdu",
    seasonKey: "world-cup-run",
    leaderboardScopes: ["global", "friend", "season"],
  },
  doctor: {
    ready: true,
    requiredPassed: 20,
    requiredTotal: 20,
    leaderboardCheckIds: [
      "leaderboard-global-user",
      "leaderboard-friend-user",
      "leaderboard-season-user",
      "leaderboard-global-board",
      "leaderboard-friend-board",
      "leaderboard-season-board",
    ],
    passedLeaderboardCheckIds: [
      "leaderboard-global-user",
      "leaderboard-friend-user",
      "leaderboard-season-user",
      "leaderboard-global-board",
      "leaderboard-friend-board",
      "leaderboard-season-board",
    ],
    failedLeaderboardCheckIds: [],
  },
  acceptance: {
    globalCurrentUser: true,
    friendCurrentUser: true,
    seasonCurrentUser: true,
    globalBoardRows: true,
    friendBoardRows: true,
    seasonBoardRows: true,
    passedScopeCount: 3,
    requiredScopeCount: 3,
    passedBoardCount: 3,
    requiredBoardCount: 3,
    targetEnvReady: true,
    queryContractsReady: true,
    scopeClaims: leaderboardScopeClaims,
    outputEnvKeys: [
      "KICKOFF_VERIFY_USER_ID",
      "KICKOFF_VERIFY_FRIEND_CODE",
      "KICKOFF_VERIFY_SEASON_KEY",
      "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
    ],
  },
  ...patch,
});

const recordShareImageUrl =
  "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png";
const modeShareImageUrl =
  "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png";
const recordProofUrl = "https://example.com/kickoff-lock-agent/?proof=cap-1";
const modeIds = ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"];

const shareArtifactReadBackUrl = (id: string, kind: "record" | "mode", proofUrl: string, imageUrl: string) => {
  const query = new URLSearchParams({
    select: "id,kind,proof_url,image_url,image_hash,generated_at,x_intent_url,x_intent_opened_at,native_share_opened_at",
    id: `eq.${id}`,
    kind: `eq.${kind}`,
    proof_url: `eq.${proofUrl}`,
    image_url: `eq.${imageUrl}`,
    limit: "1",
  });
  return `https://project.supabase.co/rest/v1/kickoff_share_artifacts?${query.toString()}`;
};

const shareArtifactReadBackCommand = (url: string) =>
  `curl -sS '${url}' -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"`;

const shareIntentUrl = (proofUrl: string, kind: "record" | "mode") => {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set(
    "text",
    kind === "mode"
      ? `Kickoff Lock mode proof sealed.\nVerify: ${proofUrl}`
      : `Kickoff Lock prediction proof locked.\nVerify: ${proofUrl}`,
  );
  url.searchParams.set("url", proofUrl);
  url.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");
  return url.toString();
};

const recordShareArtifactReadBackUrl = shareArtifactReadBackUrl(
  "cap-1",
  "record",
  recordProofUrl,
  recordShareImageUrl,
);

const modeProofUrlFor = (id: string) => `https://example.com/kickoff-lock-agent/?mode=${id}`;
const modeShareArtifactReadBackUrl = (id: string) =>
  shareArtifactReadBackUrl(id, "mode", modeProofUrlFor(id), modeShareImageUrl);
const recordShareIntentUrl = shareIntentUrl(recordProofUrl, "record");
const modeShareIntentUrls = modeIds.map((id) => shareIntentUrl(modeProofUrlFor(id), "mode"));

const shareResponseExpectation = (
  responseType: "public-html" | "public-image" | "x-intent" | "supabase-array",
  targetKind: "record" | "mode",
  targetId: string | undefined,
  proofUrl?: string,
  imageUrl?: string,
): ShareChannelEvidenceArtifact["readBackCommands"][number]["responseExpectation"] => ({
  responseType,
  targetId,
  targetKind,
  minRows: responseType === "supabase-array" ? 1 : undefined,
  requiredFields:
    responseType === "public-html"
      ? ["canonical-url", "og:title", "og:image", "twitter:card", "json-ld", "public-source-cloud"]
      : responseType === "public-image"
        ? ["content-type:image", "content-length", "sha256"]
        : responseType === "x-intent"
          ? ["url", "text", "hashtags"]
          : [
              "id",
              "kind",
              "proof_url",
              "image_url",
              "image_hash",
              "generated_at",
              "x_intent_url",
              "x_intent_opened_at",
              "native_share_opened_at",
            ],
  expectedProofUrl: proofUrl,
  expectedImageUrl: imageUrl,
  expectedHost: responseType === "x-intent" ? "twitter.com" : undefined,
  expectedHashtags: responseType === "x-intent" ? ["KickoffLock", "Filecoin", "WorldCup"] : undefined,
});

const shareReadBackCommands: ShareChannelEvidenceArtifact["readBackCommands"] = [
  {
    id: "public-proof-page",
    label: "Read deployed record proof page",
    kind: "proof-page",
    targetId: "cap-1",
    url: recordProofUrl,
    command: `curl -sS '${recordProofUrl}'`,
    ready: true,
    responseExpectation: shareResponseExpectation("public-html", "record", "cap-1", recordProofUrl),
  },
  {
    id: "record-share-channel-open",
    label: "Open record X intent",
    kind: "share-channel-open",
    targetId: "cap-1",
    url: recordShareIntentUrl,
    command: `open '${recordShareIntentUrl}'`,
    ready: true,
    responseExpectation: shareResponseExpectation("x-intent", "record", "cap-1", recordProofUrl),
  },
  ...modeIds.map((id) => ({
    id: `public-mode-page:${id}`,
    label: `Read deployed mode proof page ${id}`,
    kind: "proof-page" as const,
    targetId: id,
    url: `https://example.com/kickoff-lock-agent/?mode=${id}`,
    command: `curl -sS 'https://example.com/kickoff-lock-agent/?mode=${id}'`,
    ready: true,
    responseExpectation: shareResponseExpectation("public-html", "mode", id, modeProofUrlFor(id)),
  })),
  ...modeIds.map((id, index) => ({
    id: `mode-share-channel-open:${id}`,
    label: `Open mode X intent ${id}`,
    kind: "share-channel-open" as const,
    targetId: id,
    url: modeShareIntentUrls[index],
    command: `open '${modeShareIntentUrls[index]}'`,
    ready: true,
    responseExpectation: shareResponseExpectation("x-intent", "mode", id, modeProofUrlFor(id)),
  })),
  {
    id: "record-share-image",
    label: "Read public record share image",
    kind: "share-image",
    targetId: "cap-1",
    url: recordShareImageUrl,
    command: `curl -sS '${recordShareImageUrl}' -o /tmp/kickoff-record-share-card.png`,
    ready: true,
    responseExpectation: shareResponseExpectation("public-image", "record", "cap-1", undefined, recordShareImageUrl),
  },
  {
    id: "mode-share-image",
    label: "Read public mode share image",
    kind: "share-image",
    targetId: "mode-bracket",
    url: modeShareImageUrl,
    command: `curl -sS '${modeShareImageUrl}' -o /tmp/kickoff-mode-share-card.png`,
    ready: true,
    responseExpectation: shareResponseExpectation("public-image", "mode", "mode-bracket", undefined, modeShareImageUrl),
  },
  {
    id: "record-share-artifact-row",
    label: "Read record share artifact row",
    kind: "share-artifact-row",
    targetId: "cap-1",
    url: recordShareArtifactReadBackUrl,
    command: shareArtifactReadBackCommand(recordShareArtifactReadBackUrl),
    ready: true,
    responseExpectation: shareResponseExpectation("supabase-array", "record", "cap-1", recordProofUrl, recordShareImageUrl),
  },
  ...modeIds.map((id) => ({
    id: `mode-share-artifact-row:${id}`,
    label: `Read mode share artifact row ${id}`,
    kind: "share-artifact-row" as const,
    targetId: id,
    url: modeShareArtifactReadBackUrl(id),
    command: shareArtifactReadBackCommand(modeShareArtifactReadBackUrl(id)),
    ready: true,
    responseExpectation: shareResponseExpectation("supabase-array", "mode", id, modeProofUrlFor(id), modeShareImageUrl),
  })),
];

const shareChannelArtifact = (patch: Partial<ShareChannelEvidenceArtifact> = {}): ShareChannelEvidenceArtifact => ({
  ready: true,
  execute: false,
  stageReadyCount: 5,
  totalStages: 5,
  blockedStages: 0,
  missingEnv: [],
  stages: [],
  commands: [],
  readBackCommands: shareReadBackCommands,
  nextAction: "Public sharing bootstrap targets are ready. Run bun run doctor:sharing.",
  copyText: "Kickoff Lock Agent public sharing production bootstrap",
  generatedAt: "2026-07-04T12:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  targets: {
    publicAppUrl: "https://example.com/kickoff-lock-agent/",
    proofId: "cap-1",
    proofUrl: recordProofUrl,
    proofXIntentUrl: recordShareIntentUrl,
    modeIds,
    modeProofUrls: modeIds.map(modeProofUrlFor),
    modeXIntentUrls: modeShareIntentUrls,
    shareArtifactIds: [
      "record:cap-1",
      "mode:mode-bracket",
      "mode:mode-parlay",
      "mode:mode-agent",
      "mode:mode-upset",
      "mode:mode-group-path",
      "mode:mode-penalty-pressure",
    ],
    shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
    modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
  },
  doctor: {
    ready: true,
    requiredPassed: 20,
    requiredTotal: 20,
    shareChannelCheckIds: ["target-share-channel-row", "target-mode-share-channel-row"],
    passedShareChannelCheckIds: ["target-share-channel-row", "target-mode-share-channel-row"],
    failedShareChannelCheckIds: [],
  },
  acceptance: {
    recordChannelOpened: true,
    modeChannelCount: 6,
    requiredModeChannelCount: 6,
    passedTargetCount: 7,
    requiredTargetCount: 7,
    targetEnvReady: true,
    publicTargetUrlsReady: true,
    outputEnvKeys: [
      "VITE_PUBLIC_APP_URL",
      "KICKOFF_VERIFY_PROOF_ID",
      "KICKOFF_VERIFY_MODE_IDS",
      "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
      "KICKOFF_VERIFY_SHARE_IMAGE_URL",
      "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
    ],
  },
  ...patch,
});

const publicRestorePageExpectation = (
  targetKind: "profile" | "proof" | "mode",
  targetId: string,
): PublicRestoreEvidenceArtifact["readBackCommands"][number]["responseExpectation"] => ({
  responseType: "public-html",
  targetKind,
  targetId,
  expectedSource: "cloud",
  requiresCleanSession: true,
  pageKind: targetKind,
  queryParam: targetKind,
  targetIds: [targetId],
  requiredFields: [
    "canonical-url",
    "og:title",
    "og:image",
    "twitter:card",
    "json-ld",
    "public-kind",
    "public-target",
    "public-source-cloud",
    "social-metadata",
    "share-image",
    "cloud-record",
  ],
});

const publicRestoreRowExpectation = (
  targetKind: "profile" | "proof" | "mode",
  targetId: string,
): PublicRestoreEvidenceArtifact["readBackCommands"][number]["responseExpectation"] => {
  const fields =
    targetKind === "profile"
      ? ["id", "email", "display_name", "location", "friend_code", "season_key", "updated_at"]
      : targetKind === "mode"
        ? ["id", "user_id", "mode_id", "status", "score", "mode_run", "updated_at"]
        : ["id", "user_id", "capsule", "result", "seal_job", "updated_at"];
  return {
    responseType: "supabase-array",
    targetKind,
    targetId,
    expectedSource: "cloud",
    minRows: 1,
    requiredFields: fields,
    table:
      targetKind === "profile"
        ? "kickoff_profiles"
        : targetKind === "mode"
          ? "kickoff_mode_runs"
          : "kickoff_records",
  };
};

const publicRestoreArtifact = (patch: Partial<PublicRestoreEvidenceArtifact> = {}): PublicRestoreEvidenceArtifact => ({
  ready: true,
  requiredPassed: 12,
  requiredTotal: 12,
  checks: [
    {
      id: "profile-render",
      label: "Profile render",
      required: true,
      status: "passed",
      detail: "rendered 1/1 profile page with canonical URL, social metadata and JSON-LD",
      action: "Render profile",
      sampleIds: ["user-1"],
    },
    {
      id: "proof-render",
      label: "Proof render",
      required: true,
      status: "passed",
      detail: "rendered 1/1 proof page with canonical URL, social metadata and JSON-LD",
      action: "Render proof",
      sampleIds: ["cap-1"],
    },
    {
      id: "mode-render",
      label: "Mode render",
      required: true,
      status: "passed",
      detail: "rendered 6/6 mode pages with canonical URL, social metadata and JSON-LD",
      action: "Render modes",
      sampleIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
    },
    {
      id: "clean-session-restore",
      label: "Clean-session account restore",
      required: true,
      status: "passed",
      detail: "cloud profile, prediction proof and mode proof pages rendered in a clean browser context without localStorage",
      action: "Render clean session",
      sampleIds: ["user-1", "cap-1", "mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
    },
  ],
  nextActions: [],
  generatedAt: "2026-07-04T12:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  readBackCommands: [
    {
      id: "public-page:profile:user-1",
      label: "profile user-1 public page",
      kind: "public-page",
      targetKind: "profile",
      targetId: "user-1",
      expectedSource: "cloud",
      authMode: "public-page",
      url: "https://example.com/kickoff-lock-agent/?profile=user-1",
      command: "curl -sS 'https://example.com/kickoff-lock-agent/?profile=user-1'",
      ready: true,
      responseExpectation: publicRestorePageExpectation("profile", "user-1"),
    },
    {
      id: "public-page:proof:cap-1",
      label: "proof cap-1 public page",
      kind: "public-page",
      targetKind: "proof",
      targetId: "cap-1",
      expectedSource: "cloud",
      authMode: "public-page",
      url: "https://example.com/kickoff-lock-agent/?proof=cap-1",
      command: "curl -sS 'https://example.com/kickoff-lock-agent/?proof=cap-1'",
      ready: true,
      responseExpectation: publicRestorePageExpectation("proof", "cap-1"),
    },
    ...["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"].map((targetId) => ({
      id: `public-page:mode:${targetId}`,
      label: `mode ${targetId} public page`,
      kind: "public-page" as const,
      targetKind: "mode" as const,
      targetId,
      expectedSource: "cloud" as const,
      authMode: "public-page" as const,
      url: `https://example.com/kickoff-lock-agent/?mode=${targetId}`,
      command: `curl -sS 'https://example.com/kickoff-lock-agent/?mode=${targetId}'`,
      ready: true,
      responseExpectation: publicRestorePageExpectation("mode", targetId),
    })),
    {
      id: "supabase-row:profile:user-1",
      label: "profile user-1 Supabase row",
      kind: "supabase-row",
      targetKind: "profile",
      targetId: "user-1",
      table: "kickoff_profiles",
      expectedSource: "cloud",
      queryPath: "kickoff_profiles?select=id%2Cemail%2Cdisplay_name%2Clocation%2Cfriend_code%2Cseason_key%2Cupdated_at&id=eq.user-1&limit=1",
      authMode: "anon",
      url: "https://project.supabase.co/rest/v1/kickoff_profiles?select=id%2Cemail%2Cdisplay_name%2Clocation%2Cfriend_code%2Cseason_key%2Cupdated_at&id=eq.user-1&limit=1",
      command: `curl -sS 'https://project.supabase.co/rest/v1/kickoff_profiles?select=id%2Cemail%2Cdisplay_name%2Clocation%2Cfriend_code%2Cseason_key%2Cupdated_at&id=eq.user-1&limit=1' -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"`,
      ready: true,
      responseExpectation: publicRestoreRowExpectation("profile", "user-1"),
    },
    {
      id: "supabase-row:proof:cap-1",
      label: "proof cap-1 Supabase row",
      kind: "supabase-row",
      targetKind: "proof",
      targetId: "cap-1",
      table: "kickoff_records",
      expectedSource: "cloud",
      queryPath: "kickoff_records?select=id%2Cuser_id%2Ccapsule%2Cresult%2Cseal_job%2Cupdated_at&id=eq.cap-1&limit=1",
      authMode: "anon",
      url: "https://project.supabase.co/rest/v1/kickoff_records?select=id%2Cuser_id%2Ccapsule%2Cresult%2Cseal_job%2Cupdated_at&id=eq.cap-1&limit=1",
      command: `curl -sS 'https://project.supabase.co/rest/v1/kickoff_records?select=id%2Cuser_id%2Ccapsule%2Cresult%2Cseal_job%2Cupdated_at&id=eq.cap-1&limit=1' -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"`,
      ready: true,
      responseExpectation: publicRestoreRowExpectation("proof", "cap-1"),
    },
    ...["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"].map((targetId) => ({
      id: `supabase-row:mode:${targetId}`,
      label: `mode ${targetId} Supabase row`,
      kind: "supabase-row" as const,
      targetKind: "mode" as const,
      targetId,
      table: "kickoff_mode_runs" as const,
      expectedSource: "cloud" as const,
      queryPath: `kickoff_mode_runs?select=id%2Cuser_id%2Cmode_id%2Cstatus%2Cscore%2Cmode_run%2Cupdated_at&id=eq.${targetId}&limit=1`,
      authMode: "anon" as const,
      url: `https://project.supabase.co/rest/v1/kickoff_mode_runs?select=id%2Cuser_id%2Cmode_id%2Cstatus%2Cscore%2Cmode_run%2Cupdated_at&id=eq.${targetId}&limit=1`,
      command: `curl -sS 'https://project.supabase.co/rest/v1/kickoff_mode_runs?select=id%2Cuser_id%2Cmode_id%2Cstatus%2Cscore%2Cmode_run%2Cupdated_at&id=eq.${targetId}&limit=1' -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"`,
      ready: true,
      responseExpectation: publicRestoreRowExpectation("mode", targetId),
    })),
  ],
  pageTargets: [
    {
      kind: "profile",
      targetId: "user-1",
      url: "https://example.com/kickoff-lock-agent/?profile=user-1",
      ready: true,
      expectedSource: "cloud",
    },
    {
      kind: "proof",
      targetId: "cap-1",
      url: "https://example.com/kickoff-lock-agent/?proof=cap-1",
      ready: true,
      expectedSource: "cloud",
    },
    ...["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"].map((targetId) => ({
      kind: "mode" as const,
      targetId,
      url: `https://example.com/kickoff-lock-agent/?mode=${targetId}`,
      ready: true,
      expectedSource: "cloud" as const,
    })),
  ],
  targets: {
    publicAppUrl: "https://example.com/kickoff-lock-agent/",
    profileId: "user-1",
    proofId: "cap-1",
    modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
    shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
    modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
  },
  acceptance: {
    publicAppUrlReady: true,
    cleanSessionRestore: true,
    profileRender: true,
    proofRender: true,
    modeRenderCount: 6,
    requiredModeRenderCount: 6,
    cleanSessionProfileIds: ["user-1"],
    cleanSessionProofIds: ["cap-1"],
    cleanSessionModeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
    shareImageReadBack: true,
    modeShareImageReadBack: true,
    outputEnvKeys: [
      "VITE_PUBLIC_APP_URL",
      "KICKOFF_VERIFY_PROFILE_ID",
      "KICKOFF_VERIFY_PROOF_ID",
      "KICKOFF_VERIFY_MODE_IDS",
      "KICKOFF_VERIFY_SHARE_IMAGE_URL",
      "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
    ],
  },
  ...patch,
});

const filecoinArtifact = (patch: Partial<FilecoinTargetSealArtifact> = {}): FilecoinTargetSealArtifact => ({
  ready: true,
  dryRun: false,
  endpoint: "https://seal.example/seal",
  productionReady: true,
  targets: [
    {
      kind: "record",
      id: "cap-1",
      payload: "{}",
      payloadHash: "a".repeat(64),
      byteLength: 2,
      cid: "bafy-record",
      proofUrl: "https://seal.example/proof/bafy-record",
      verifyUrl: "https://seal.example/verify?cid=bafy-record",
      backendJobId: "job-record",
      uploadStatusUrl: "https://seal.example/jobs/job-record",
      uploadStatusPolls: 2,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2026-07-04T12:00:00.000Z",
          status: "running",
          detail: "running",
          jobId: "job-record",
          payloadHash: "a".repeat(64),
          byteLength: 2,
        },
        {
          attempt: 2,
          checkedAt: "2026-07-04T12:01:00.000Z",
          status: "verified",
          detail: "ok",
          jobId: "job-record",
          cid: "bafy-record",
          payloadHash: "a".repeat(64),
          byteLength: 2,
        },
      ],
      verifyPolls: 2,
      verifyPollLog: [
        {
          attempt: 1,
          checkedAt: "2026-07-04T12:00:00.000Z",
          status: "pending",
          proofStatus: "draft",
          detail: "pending",
        },
        {
          attempt: 2,
          checkedAt: "2026-07-04T12:01:00.000Z",
          status: "verified",
          proofStatus: "verified",
          detail: "ok",
          cid: "bafy-record",
        },
      ],
      proof: { mode: "real", cid: "bafy-record", pieceCid: "bafy-record", provider: "synapse", dataSetId: "set", proofStatus: "verified", payloadHash: "a".repeat(64), byteLength: 2 },
    },
    ...["b", "c", "d", "e", "f", "1"].map((hashPrefix, index) => {
      const cid = `bafy-${index + 1}`;
      const hash = hashPrefix.repeat(64);
      return {
        kind: "mode" as const,
        id: `mode-${index + 1}`,
        payload: "{}",
        payloadHash: hash,
        byteLength: 2,
        cid,
        proofUrl: `https://seal.example/proof/${cid}`,
        cidQueryUrl: `https://seal.example/proof/${cid}`,
        verifyUrl: `https://seal.example/verify?cid=${cid}`,
        backendJobId: `job-mode-${index + 1}`,
        uploadStatusUrl: `https://seal.example/jobs/job-mode-${index + 1}`,
        uploadStatusPolls: 2,
        uploadStatusLog: [
          {
            attempt: 1,
            checkedAt: "2026-07-04T12:00:00.000Z",
            status: "running" as const,
            detail: "running",
            jobId: `job-mode-${index + 1}`,
            payloadHash: hash,
            byteLength: 2,
          },
          {
            attempt: 2,
            checkedAt: "2026-07-04T12:01:00.000Z",
            status: "verified" as const,
            detail: "ok",
            jobId: `job-mode-${index + 1}`,
            cid,
            payloadHash: hash,
            byteLength: 2,
          },
        ],
        verifyPolls: 2,
        verifyPollLog: [
          {
            attempt: 1,
            checkedAt: "2026-07-04T12:00:00.000Z",
            status: "pending" as const,
            proofStatus: "draft" as const,
            detail: "pending",
          },
          {
            attempt: 2,
            checkedAt: "2026-07-04T12:01:00.000Z",
            status: "verified" as const,
            proofStatus: "verified" as const,
            detail: "ok",
            cid,
          },
        ],
        proof: { mode: "real" as const, cid, pieceCid: cid, provider: "synapse", dataSetId: "set", proofStatus: "verified" as const, payloadHash: hash, byteLength: 2 },
      };
    }),
  ],
  verifyEnv: "",
  blockers: [],
  generatedAt: "2026-07-04T12:00:00.000Z",
  envFiles: [".env.production.local"],
  artifactVersion: 1,
  readBackCommands: [
    {
      id: "record-cap-1-upload-status",
      kind: "record" as const,
      targetId: "cap-1",
      label: "record cap-1 upload status",
      url: "https://seal.example/jobs/job-record",
      command: `curl -sS 'https://seal.example/jobs/job-record' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
      ready: true,
      expectedCid: "bafy-record",
      expectedPayloadHash: "a".repeat(64),
    },
    {
      id: "record-cap-1-verify",
      kind: "record" as const,
      targetId: "cap-1",
      label: "record cap-1 verify status",
      url: "https://seal.example/verify?cid=bafy-record",
      command: `curl -sS 'https://seal.example/verify?cid=bafy-record' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
      ready: true,
      expectedCid: "bafy-record",
      expectedPayloadHash: "a".repeat(64),
    },
    {
      id: "record-cap-1-proof",
      kind: "record" as const,
      targetId: "cap-1",
      label: "record cap-1 proof read-back",
      url: "https://seal.example/proof/bafy-record",
      command: `curl -sS 'https://seal.example/proof/bafy-record' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
      ready: true,
      expectedCid: "bafy-record",
      expectedPayloadHash: "a".repeat(64),
    },
    ...[1, 2, 3, 4, 5, 6].flatMap((index) => {
      const cid = `bafy-${index}`;
      const hash = ["b", "c", "d", "e", "f", "1"][index - 1]!.repeat(64);
      return [
        {
          id: `mode-mode-${index}-upload-status`,
          kind: "mode" as const,
          targetId: `mode-${index}`,
          label: `mode mode-${index} upload status`,
          url: `https://seal.example/jobs/job-mode-${index}`,
          command: `curl -sS 'https://seal.example/jobs/job-mode-${index}' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
          ready: true,
          expectedCid: cid,
          expectedPayloadHash: hash,
        },
        {
          id: `mode-mode-${index}-verify`,
          kind: "mode" as const,
          targetId: `mode-${index}`,
          label: `mode mode-${index} verify status`,
          url: `https://seal.example/verify?cid=${cid}`,
          command: `curl -sS 'https://seal.example/verify?cid=${cid}' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
          ready: true,
          expectedCid: cid,
          expectedPayloadHash: hash,
        },
        {
          id: `mode-mode-${index}-proof`,
          kind: "mode" as const,
          targetId: `mode-${index}`,
          label: `mode mode-${index} proof read-back`,
          url: `https://seal.example/proof/${cid}`,
          command: `curl -sS 'https://seal.example/proof/${cid}' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
          ready: true,
          expectedCid: cid,
          expectedPayloadHash: hash,
        },
      ];
    }),
  ].map((command) => ({ ...command, authMode: "browser-token" as const })),
  acceptance: {
    recordSealed: true,
    modeSealedCount: 6,
    requiredModeSealCount: 6,
    uploadStatusComplete: true,
    uploadStatusProgressionComplete: true,
    verifyPollingComplete: true,
    verifyPollingProgressionComplete: true,
    cidQueryComplete: true,
    proofReadbackComplete: true,
    targets: [
      {
        kind: "record",
        id: "cap-1",
        cid: "bafy-record",
        backendJobId: "job-record",
        uploadStatusUrl: "https://seal.example/jobs/job-record",
        cidQueryUrl: "https://seal.example/proof/bafy-record",
        sealed: true,
        uploadStatus: true,
        uploadStatusProgression: true,
        verifyPolling: true,
        verifyPollingProgression: true,
        cidQuery: true,
        proofReadback: true,
        blockers: [],
      },
      ...[1, 2, 3, 4, 5].map((index) => ({
        kind: "mode" as const,
        id: `mode-${index}`,
        cid: `bafy-${index}`,
        backendJobId: `job-mode-${index}`,
        uploadStatusUrl: `https://seal.example/jobs/job-mode-${index}`,
        cidQueryUrl: `https://seal.example/proof/bafy-${index}`,
        sealed: true,
        uploadStatus: true,
        uploadStatusProgression: true,
        verifyPolling: true,
        verifyPollingProgression: true,
        cidQuery: true,
        proofReadback: true,
        blockers: [],
      })),
    ],
    outputEnvKeys: [
      "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
      "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
      "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
      "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
    ],
  },
  ...patch,
});

describe("production acceptance collector", () => {
  it("groups production target collection scripts by missing runtime prerequisites", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      },
      verifyEnvText: buildProductionVerifyEnv({
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      accessPreflightArtifact: accessPreflightArtifact(),
      supabaseBootstrapPlan: supabaseBootstrapPlan(),
      supabaseTargetSeedArtifact: supabaseArtifact(),
      accountCloudSyncEvidence: accountCloudSyncArtifact(),
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
      filecoinSealArtifact: filecoinArtifact(),
      leaderboardArtifact: leaderboardArtifact(),
      publicRestoreArtifact: publicRestoreArtifact(),
      shareChannelArtifact: shareChannelArtifact(),
      shareImageUploadArtifacts: {
        record: shareUploadArtifact(
          "record",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        ),
        mode: shareUploadArtifact(
          "mode",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        ),
      },
    });

    expect(packet.ready).toBe(false);
    expect(packet.blockedStages).toBeGreaterThan(0);
    expect(packet.missingRuntimeEnv).toEqual(
      expect.arrayContaining([
        "VITE_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "APIFOOTBALL_KEY or API_FOOTBALL_KEY or VITE_APIFOOTBALL_KEY or VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN",
        "VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN",
      ]),
    );
    expect(packet.stages.find((stage) => stage.id === "share-images")).toMatchObject({
      status: "blocked",
      command: "bun run share:upload-image && bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
    });
    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      command: "bun run data:providers:check && bun run scout:data-targets",
    });
    expect(packet.copyText).toContain("production acceptance collector");
  });

  it("uses the Cloudflare Pages deploy plan as the backend prerequisite for same-origin data and Filecoin stages", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
        VITE_DATA_PROXY_SAME_ORIGIN: "0",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "0",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        filecoinRecordCid: "bafy-record",
        filecoinRecordJobId: "job-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeJobIds: ["job-mode-1", "job-mode-2", "job-mode-3", "job-mode-4", "job-mode-5", "job-mode-6"],
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      cloudflarePagesDeployPlan: cloudflarePlan(),
      dataProviderArtifact: dataProviderArtifact({
        targets: {
          ...dataProviderArtifact().targets,
          dataProxyUrl: "https://kickoff-lock-agent.pages.dev/data-proxy/proxy",
        },
      }),
      dataScoutArtifact: scoutArtifact(),
      filecoinSealArtifact: filecoinArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "cloudflare-pages-backend")).toMatchObject({
      status: "blocked",
      command: "bun run pages:cf:preflight && bun run pages:cf:deploy",
      missingEnv: expect.arrayContaining([
        "APIFOOTBALL_KEY",
        "ODDS_API_KEY",
        "FILECOIN_SEAL_UPSTREAM_URL",
        "FILECOIN_SEAL_TOKEN",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
      ]),
    });
    expect(packet.stages.find((stage) => stage.id === "data-scout")?.missingEnv).toEqual(
      expect.arrayContaining([
        "Cloudflare Pages Set Pages runtime secrets: APIFOOTBALL_KEY",
        "Cloudflare Pages Set Pages runtime secrets: ODDS_API_KEY",
        "Cloudflare Pages Authenticate Cloudflare deploy: CLOUDFLARE_API_TOKEN",
      ]),
    );
    expect(packet.stages.find((stage) => stage.id === "data-scout")?.missingEnv).not.toContain(
      "APIFOOTBALL_KEY or API_FOOTBALL_KEY or VITE_APIFOOTBALL_KEY or VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN",
    );
    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")?.missingEnv).toEqual(
      expect.arrayContaining([
        "Cloudflare Pages Set Pages runtime secrets: FILECOIN_SEAL_UPSTREAM_URL",
        "Cloudflare Pages Set Pages runtime secrets: FILECOIN_SEAL_TOKEN",
        "Cloudflare Pages Authenticate Cloudflare deploy: CLOUDFLARE_ACCOUNT_ID",
      ]),
    );
    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")?.missingEnv).not.toContain("VITE_FILECOIN_SEAL_TOKEN");
    expect(packet.commands).toContain("bun run pages:cf:preflight && bun run pages:cf:deploy");
  });

  it("rejects a Cloudflare Pages deploy plan whose read-back commands are stale", () => {
    const basePlan = cloudflarePlan();
    const readyPlan = cloudflarePlan({
      ready: true,
      tokenAuthReady: true,
      blockedStages: 0,
      missingEnv: [],
      stages: basePlan.stages.map((stage) => ({
        ...stage,
        status: stage.id === "deploy" ? ("ready" as const) : ("done" as const),
        missingEnv: [],
      })),
      readBackCommands: basePlan.readBackCommands.map((command) =>
        command.id === "runtime-config"
          ? {
              ...command,
              url: "https://kickoff-lock-agent.pages.dev/wrong-runtime-config.js",
              command: "open https://kickoff-lock-agent.pages.dev/wrong-runtime-config.js",
              ready: false,
              responseExpectation: {
                ...command.responseExpectation,
                responseType: "html",
                requiredFields: ["window.__KICKOFF_RUNTIME_CONFIG__"],
                forbiddenFields: ["SUPABASE_SERVICE_ROLE_KEY"],
              },
            }
          : command.id === "data-proxy-health"
            ? {
                ...command,
                ready: true,
                responseExpectation: {
                  ...command.responseExpectation,
                  expectedService: "wrong-proxy" as "kickoff-data-proxy",
                  requiredFields: ["ok"],
                },
              }
          : { ...command, ready: true },
      ),
    });
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://kickoff-lock-agent.pages.dev/",
        APIFOOTBALL_KEY: "api-football",
        FOOTBALL_DATA_TOKEN: "football-data",
        FILECOIN_SEAL_UPSTREAM_URL: "https://seal.example.com/seal",
        FILECOIN_SEAL_TOKEN: "seal-token",
        ALLOW_ORIGIN: "https://kickoff-lock-agent.pages.dev",
        CLOUDFLARE_API_TOKEN: "cloudflare-token",
        CLOUDFLARE_ACCOUNT_ID: "cloudflare-account",
      },
      verifyEnvText: "",
      cloudflarePagesDeployPlan: readyPlan,
    });

    expect(packet.stages.find((stage) => stage.id === "cloudflare-pages-backend")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/cloudflare-pages-deploy-plan.json read-back URL mismatch runtime-config",
        "public/cloudflare-pages-deploy-plan.json read-back command must use curl runtime-config",
        "public/cloudflare-pages-deploy-plan.json read-back command not ready runtime-config",
        "public/cloudflare-pages-deploy-plan.json response type mismatch runtime-config",
        "public/cloudflare-pages-deploy-plan.json response fields incomplete runtime-config",
        "public/cloudflare-pages-deploy-plan.json forbidden field checks incomplete runtime-config",
        "public/cloudflare-pages-deploy-plan.json response service mismatch data-proxy-health",
        "public/cloudflare-pages-deploy-plan.json response fields incomplete data-proxy-health",
      ]),
    });
  });

  it("opens final verification once runtime and target env blocks are collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        publicProfileUrl: "https://example.com/?profile=user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareArtifactIds: [
          "record:cap-1",
          "mode:mode-bracket",
          "mode:mode-parlay",
          "mode:mode-agent",
          "mode:mode-upset",
          "mode:mode-group-path",
          "mode:mode-penalty-pressure",
        ],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        leaderboardScopes: ["global", "friend", "season"],
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        filecoinRecordJobId: "job-record",
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeJobIds: ["job-mode-1", "job-mode-2", "job-mode-3", "job-mode-4", "job-mode-5", "job-mode-6"],
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      accessPreflightArtifact: accessPreflightArtifact(),
      supabaseBootstrapPlan: supabaseBootstrapPlan(),
      supabaseTargetSeedArtifact: supabaseArtifact(),
      accountCloudSyncEvidence: accountCloudSyncArtifact(),
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
      filecoinBootstrapPlan: filecoinBootstrapPlan(),
      filecoinSealArtifact: filecoinArtifact(),
      leaderboardArtifact: leaderboardArtifact(),
      publicRestoreArtifact: publicRestoreArtifact(),
      shareChannelArtifact: shareChannelArtifact(),
      shareImageUploadArtifacts: {
        record: shareUploadArtifact(
          "record",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        ),
        mode: shareUploadArtifact(
          "mode",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        ),
      },
    });

    expect(packet.ready).toBe(true);
    expect(packet.missingVerifyEnv).toEqual([]);
    expect(packet.stages.find((stage) => stage.id === "final-verify")).toMatchObject({
      status: "ready",
      command: "bun run verify:production && bun run doctor:production && bun run goal:audit",
    });
    expect(packet.commands).toContain("bun run verify:production && bun run doctor:production && bun run goal:audit");
  });

  it("keeps final verification blocked until production access preflight passes", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        publicProfileUrl: "https://example.com/?profile=user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareArtifactIds: [
          "record:cap-1",
          "mode:mode-bracket",
          "mode:mode-parlay",
          "mode:mode-agent",
          "mode:mode-upset",
          "mode:mode-group-path",
          "mode:mode-penalty-pressure",
        ],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        leaderboardScopes: ["global", "friend", "season"],
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        filecoinRecordJobId: "job-record",
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeJobIds: ["job-mode-1", "job-mode-2", "job-mode-3", "job-mode-4", "job-mode-5", "job-mode-6"],
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      accessPreflightArtifact: accessPreflightArtifact({
        ready: false,
        stageReadyCount: 3,
        blockedStages: 1,
        missingEnv: ["SUPABASE_ACCESS_TOKEN or supabase login"],
        stages: accessPreflightArtifact().stages.map((stage) =>
          stage.id === "supabase-cli"
            ? {
                ...stage,
                status: "blocked",
                missingEnv: ["SUPABASE_ACCESS_TOKEN or supabase login"],
                detail: "Supabase CLI is not logged in and SUPABASE_ACCESS_TOKEN is not set.",
              }
            : stage,
        ),
      }),
      supabaseBootstrapPlan: supabaseBootstrapPlan(),
      supabaseTargetSeedArtifact: supabaseArtifact(),
      accountCloudSyncEvidence: accountCloudSyncArtifact(),
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
      filecoinBootstrapPlan: filecoinBootstrapPlan(),
      filecoinSealArtifact: filecoinArtifact(),
      leaderboardArtifact: leaderboardArtifact(),
      publicRestoreArtifact: publicRestoreArtifact(),
      shareChannelArtifact: shareChannelArtifact(),
      shareImageUploadArtifacts: {
        record: shareUploadArtifact(
          "record",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        ),
        mode: shareUploadArtifact(
          "mode",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        ),
      },
    });

    expect(packet.ready).toBe(false);
    expect(packet.stages.find((stage) => stage.id === "access-preflight")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/production-access-preflight.json not ready",
        "access preflight missing SUPABASE_ACCESS_TOKEN or supabase login",
      ]),
    });
    expect(packet.stages.find((stage) => stage.id === "final-verify")).toMatchObject({ status: "blocked" });
  });

  it("blocks final verification when the target env contract is incomplete", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareArtifactIds: ["record:cap-1", "mode:mode-bracket"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        leaderboardScopes: ["global", "friend"],
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      supabaseTargetSeedArtifact: supabaseArtifact(),
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
      filecoinSealArtifact: filecoinArtifact(),
      leaderboardArtifact: leaderboardArtifact(),
      publicRestoreArtifact: publicRestoreArtifact(),
      shareChannelArtifact: shareChannelArtifact(),
      shareImageUploadArtifacts: {
        record: shareUploadArtifact(
          "record",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        ),
        mode: shareUploadArtifact(
          "mode",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "target-env-contract")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_PUBLIC_PROFILE_URL missing",
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS missing mode:mode-parlay",
        "KICKOFF_VERIFY_LEADERBOARD_SCOPES missing season",
      ]),
    });
    expect(packet.stages.find((stage) => stage.id === "final-verify")).toMatchObject({ status: "blocked" });
  });

  it("does not open final verification when runtime service URLs are local or point to the wrong endpoint", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://other.example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "http://localhost:8787/proxy",
        VITE_FILECOIN_SEAL_API: "https://seal.example/status",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      supabaseTargetSeedArtifact: supabaseArtifact(),
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
      filecoinSealArtifact: filecoinArtifact(),
      leaderboardArtifact: leaderboardArtifact(),
      publicRestoreArtifact: publicRestoreArtifact(),
      shareChannelArtifact: shareChannelArtifact(),
      shareImageUploadArtifacts: {
        record: shareUploadArtifact(
          "record",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        ),
        mode: shareUploadArtifact(
          "mode",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        ),
      },
    });

    expect(packet.ready).toBe(false);
    expect(packet.stages.find((stage) => stage.id === "share-images")?.missingEnv).toEqual(
      expect.arrayContaining(["VITE_SUPABASE_URL must be a deployed production runtime value"]),
    );
    expect(packet.stages.find((stage) => stage.id === "seed-cloud")?.missingEnv).toEqual(
      expect.arrayContaining([
        "VITE_SUPABASE_URL must be a deployed production runtime value",
        "VITE_SUPABASE_REDIRECT_URL must be a deployed production runtime value",
      ]),
    );
    expect(packet.stages.find((stage) => stage.id === "data-scout")?.missingEnv).toEqual(
      expect.arrayContaining(["VITE_DATA_PROXY_URL must be a deployed production runtime value"]),
    );
    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")?.missingEnv).toEqual(
      expect.arrayContaining(["VITE_FILECOIN_SEAL_API must be a deployed production runtime value"]),
    );
    expect(packet.stages.find((stage) => stage.id === "final-verify")).toMatchObject({ status: "blocked" });
  });

  it("accepts same-origin data proxy runtime for the realtime data-scout stage", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://app.example/kickoff-lock-agent/",
        VITE_APIFOOTBALL_KEY: "football",
        FOOTBALL_DATA_TOKEN: "football-data",
        ODDS_API_KEY: "odds",
        VITE_DATA_PROXY_URL: "",
        VITE_DATA_PROXY_SAME_ORIGIN: "1",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact({
        targets: {
          ...dataProviderArtifact().targets,
          dataProxyUrl: "https://app.example/data-proxy/proxy",
        },
      }),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "done",
      missingEnv: [],
      requiredEnv: expect.arrayContaining(["VITE_DATA_PROXY_URL", "VITE_DATA_PROXY_SAME_ORIGIN"]),
    });
  });

  it("accepts a deployed data proxy for realtime data-scout without a browser API-Football key", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        VITE_APIFOOTBALL_KEY: "",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "done",
      missingEnv: [],
      requiredEnv: expect.arrayContaining(["VITE_DATA_PROXY_URL", "VITE_DATA_PROXY_SAME_ORIGIN"]),
    });
    expect(packet.missingRuntimeEnv).not.toContain("VITE_APIFOOTBALL_KEY");
  });

  it("does not mark cloud seeding done from fixture target ids without Supabase runtime", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "kickoff-production-seed",
        profileId: "kickoff-production-seed",
        proofId: "cap-prod-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://example.com/generated/share.png",
        modeShareImageUrl: "https://example.com/generated/mode-share.png",
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "share-images")).toMatchObject({
      status: "blocked",
      producedEnv: ["KICKOFF_VERIFY_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]),
    });
    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      producedEnv: [
        "KICKOFF_VERIFY_USER_ID",
        "KICKOFF_VERIFY_PROFILE_ID",
        "KICKOFF_VERIFY_PROOF_ID",
        "KICKOFF_VERIFY_MODE_IDS",
        "KICKOFF_VERIFY_FRIEND_CODE",
        "KICKOFF_VERIFY_SEASON_KEY",
      ],
      missingEnv: expect.arrayContaining(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
    });
    expect(packet.nextAction).toContain("Verify production account access");
  });

  it("requires reusable Supabase seed evidence before marking account targets collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/supabase-schema-apply.json missing; run bun run supabase:schema:apply",
        "public/supabase-target-seed.json missing; run bun run seed:production-targets",
      ]),
    });
  });

  it("rejects Supabase bootstrap read-back commands that inline the anon key", () => {
    const plan = supabaseBootstrapPlan();
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      supabaseBootstrapPlan: {
        ...plan,
        readBackCommands: plan.readBackCommands.map((command) =>
          command.label === "Profile row"
            ? {
                ...command,
                command:
                  "curl -sS 'https://project.supabase.co/rest/v1/kickoff_profiles?select=id,friend_code,updated_at&id=eq.user-1&limit=1' -H 'apikey: anon' -H 'Authorization: Bearer anon'",
              }
            : command,
        ),
      },
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
      supabaseTargetSeedArtifact: supabaseArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/supabase-bootstrap-plan.json read-back command must use VITE_SUPABASE_ANON_KEY Profile row",
        "public/supabase-bootstrap-plan.json read-back command must not inline anon key Profile row",
        "public/supabase-bootstrap-plan.json read-back authorization must not inline anon key Profile row",
      ]),
    });
  });

  it("rejects Supabase bootstrap read-back commands bound to stale target rows", () => {
    const plan = supabaseBootstrapPlan();
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      supabaseBootstrapPlan: {
        ...plan,
        readBackCommands: plan.readBackCommands.map((command) =>
          command.label === "Prediction row"
            ? {
                ...command,
                path: command.path.replace("id=eq.cap-1", "id=eq.cap-old"),
                url: command.url.replace("id=eq.cap-1", "id=eq.cap-old"),
                targetIds: ["cap-old"],
                command: command.command.replace("id=eq.cap-1", "id=eq.cap-old"),
              }
            : command,
        ),
      },
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
      supabaseTargetSeedArtifact: supabaseArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/supabase-bootstrap-plan.json target ids mismatch Prediction row",
      ]),
    });
  });

  it("rejects stale account cloud sync evidence before marking account targets collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareArtifactIds: [
          "record:cap-1",
          "mode:mode-bracket",
          "mode:mode-parlay",
          "mode:mode-agent",
          "mode:mode-upset",
          "mode:mode-group-path",
          "mode:mode-penalty-pressure",
        ],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        leaderboardScopes: ["global", "friend", "season"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      supabaseBootstrapPlan: supabaseBootstrapPlan(),
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
      supabaseTargetSeedArtifact: supabaseArtifact(),
      accountCloudSyncEvidence: accountCloudSyncArtifact({
        ready: false,
        profileId: "user-old",
        expectedIds: {
          ...accountCloudSyncArtifact().expectedIds,
          records: ["cap-old"],
          leaderboardScopes: ["global"],
        },
        acceptance: {
          ...accountCloudSyncArtifact().acceptance,
          outboxEmpty: false,
          auditPassed: false,
          leaderboardScopesReady: false,
          cloudReadBackReady: false,
        },
        outbox: [
          {
            key: "records",
            label: "Prediction history",
            status: "queued",
            queued: 1,
            verified: 0,
            total: 1,
            detail: "queued",
            action: "sync",
          },
        ],
        audit: [
          {
            key: "records",
            label: "Prediction history",
            status: "pending",
            synced: 0,
            total: 1,
            detail: "pending",
            action: "sync",
          },
        ],
        coverage: {
          passed: false,
          pendingItems: 1,
          detail: "pending",
        },
        localTotals: {
          ...accountCloudSyncArtifact().localTotals,
          historyArtifacts: 12,
        },
        verifiedTotals: {
          ...accountCloudSyncArtifact().verifiedTotals,
          contentFingerprints: 1,
          publicProfileArchives: 1,
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/account-cloud-sync-evidence.json not ready",
        "KICKOFF_VERIFY_PROFILE_ID does not match public/account-cloud-sync-evidence.json profileId",
        "KICKOFF_VERIFY_PROOF_ID does not match public/account-cloud-sync-evidence.json record ids",
        "KICKOFF_VERIFY_LEADERBOARD_SCOPES do not match public/account-cloud-sync-evidence.json leaderboard scopes",
        "public/account-cloud-sync-evidence.json acceptance outboxEmpty incomplete",
        "public/account-cloud-sync-evidence.json outbox still queued",
        "public/account-cloud-sync-evidence.json audit has pending checks",
        "public/account-cloud-sync-evidence.json strict cloud coverage incomplete",
        "public/account-cloud-sync-evidence.json content fingerprints incomplete",
        "public/account-cloud-sync-evidence.json public profile archive incomplete",
      ]),
    });
  });

  it("requires a mode share image target before seeding Supabase account targets", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ]),
      requiredEnv: expect.arrayContaining([
        "KICKOFF_SEED_SHARE_IMAGE_URL",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "KICKOFF_SEED_MODE_SHARE_IMAGE_URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ]),
    });
  });

  it("requires reusable Supabase schema apply evidence before marking account targets collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      supabaseTargetSeedArtifact: supabaseArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["public/supabase-schema-apply.json missing; run bun run supabase:schema:apply"]),
    });
  });

  it("requires Supabase target seed evidence to prove the Auth user doctor check", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      supabaseTargetSeedArtifact: supabaseArtifact({
        doctor: {
          ready: true,
          requiredPassed: 21,
          requiredTotal: 21,
          passedCheckIds: [],
          failedCheckIds: [],
        },
      }),
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/supabase-target-seed.json missing target-auth-user doctor read-back",
        "public/supabase-target-seed.json missing target-auth-profile-identity doctor read-back",
      ]),
    });
  });

  it("requires Supabase target seed evidence to prove the Auth user preflight", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      supabaseTargetSeedArtifact: supabaseArtifact({
        authUser: {
          ready: false,
          userId: "user-1",
          url: "https://project.supabase.co/auth/v1/admin/users/user-1",
          detail: "auth id missing != user-1",
          missing: ["auth id missing != user-1"],
          sampleIds: [],
        },
        acceptance: {
          ...supabaseArtifact().acceptance,
          authUserReady: false,
        },
      }),
      supabaseSchemaArtifact: supabaseSchemaArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/supabase-target-seed.json Auth user preflight incomplete",
        "public/supabase-target-seed.json Auth user preflight failed: auth id missing != user-1",
      ]),
    });
  });

  it("rejects dry-run Supabase schema apply evidence for account targets", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      supabaseTargetSeedArtifact: supabaseArtifact(),
      supabaseSchemaArtifact: supabaseSchemaArtifact({
        ready: false,
        dryRun: true,
        applied: false,
        acceptance: {
          schemaReadable: true,
          contractReady: true,
          psqlAvailable: true,
          applied: false,
          dryRun: true,
          outputEnvKeys: [
            "kickoff_profiles",
            "kickoff_records",
            "kickoff_mode_runs",
            "kickoff_share_artifacts",
            "kickoff_leaderboard",
            "kickoff_backend_health",
          ],
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/supabase-schema-apply.json not ready",
        "public/supabase-schema-apply.json was generated in dry-run mode",
        "public/supabase-schema-apply.json schema apply not executed",
      ]),
    });
  });

  it("rejects Supabase seed evidence that does not match collected account target env", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      supabaseTargetSeedArtifact: supabaseArtifact({
        seed: {
          targets: {
            userId: "user-1",
            profileId: "user-1",
            proofId: "cap-wrong",
            modeId: "mode-bracket",
            modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
            friendCode: "chengdu",
            seasonKey: "world-cup-run",
            shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
            modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
          },
        } as ProductionTargetSeedArtifact["seed"],
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_PROOF_ID does not match public/supabase-target-seed.json proofId",
      ]),
    });
  });

  it("rejects collected account targets when user and profile ids do not describe one Supabase account", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "profile-2",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      supabaseTargetSeedArtifact: supabaseArtifact({
        seed: {
          targets: {
            userId: "user-1",
            profileId: "profile-2",
            proofId: "cap-1",
            modeId: "mode-bracket",
            modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
            friendCode: "chengdu",
            seasonKey: "world-cup-run",
            shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
            modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
          },
        } as ProductionTargetSeedArtifact["seed"],
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID",
        "public/supabase-target-seed.json userId must match profileId",
      ]),
    });
  });

  it("keeps Filecoin sealing incomplete until all six mode CID/hash pairs are collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-mode-1"],
        filecoinModePayloadHashes: ["b".repeat(64)],
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      producedEnv: [
        "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
        "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
        "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
        "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
      ],
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs 6 mode CIDs",
        "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs 6 mode payload hashes",
      ]),
      detail: expect.stringContaining("needs 6 mode CIDs"),
    });
    expect(packet.commands).toContain("bun run filecoin:bootstrap");
  });

  it("requires reusable Filecoin seal evidence before marking CID targets collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: ["public/filecoin-target-seal.json missing; run bun run seal:production-targets"],
    });
  });

  it("rejects Filecoin seal evidence without reusable per-target polling logs", () => {
    const [record, ...modes] = filecoinArtifact().targets;
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinSealArtifact: filecoinArtifact({
        targets: [
          {
            ...record!,
            uploadStatusLog: [],
            verifyPollLog: [],
          },
          ...modes,
        ],
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "record cap-1 upload status log missing",
        "record cap-1 verify poll log missing",
      ]),
    });
  });

  it("rejects Filecoin seal evidence with stale upload or verify poll rows even when the latest row matches", () => {
    const [record, ...modes] = filecoinArtifact().targets;
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinSealArtifact: filecoinArtifact({
        targets: [
          {
            ...record!,
            uploadStatusLog: [
              {
                attempt: 1,
                checkedAt: "2026-07-04T11:59:00.000Z",
                status: "running",
                detail: "stale",
                jobId: "job-record",
                cid: "bafy-old-record",
                payloadHash: "a".repeat(64),
                byteLength: 2,
              },
              ...(record?.uploadStatusLog ?? []),
            ],
            verifyPollLog: [
              {
                attempt: 1,
                checkedAt: "2026-07-04T11:59:00.000Z",
                status: "pending",
                proofStatus: "draft",
                detail: "stale",
                cid: "bafy-old-record",
              },
              ...(record?.verifyPollLog ?? []),
            ],
          },
          ...modes,
        ],
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "record cap-1 upload status log contains stale job/CID/hash/byteLength evidence",
        "record cap-1 verify poll log contains stale CID evidence",
      ]),
    });
  });

  it("accepts same-origin Filecoin seal runtime for collected CID targets", () => {
    const directArtifact = filecoinArtifact();
    const sameOriginArtifact = {
      ...directArtifact,
      endpoint: "https://app.example/seal",
      sameOriginSeal: true,
      targets: directArtifact.targets.map((target) => ({
        ...target,
        uploadStatusUrl: target.uploadStatusUrl?.replace("https://seal.example", "https://app.example"),
        verifyUrl: target.verifyUrl?.replace("https://seal.example", "https://app.example"),
        proofUrl: target.proofUrl?.replace("https://seal.example", "https://app.example"),
        cidQueryUrl: target.cidQueryUrl?.replace("https://seal.example", "https://app.example"),
      })),
      readBackCommands: directArtifact.readBackCommands.map((command) => ({
        ...command,
        url: command.url.replace("https://seal.example", "https://app.example"),
        command: command.command
          .replace("https://seal.example", "https://app.example")
          .replace(/ -H "Authorization: Bearer \$VITE_FILECOIN_SEAL_TOKEN"/g, ""),
        authMode: "same-origin-proxy" as const,
      })),
    };
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://app.example/kickoff-lock-agent/",
        VITE_FILECOIN_SEAL_API: "",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinSealArtifact: sameOriginArtifact,
    });

    const filecoinStage = packet.stages.find((stage) => stage.id === "filecoin-seal");
    const requiredEnv = [...(filecoinStage?.requiredEnv ?? [])];
    expect(filecoinStage).toMatchObject({
      status: "done",
      missingEnv: [],
      requiredEnv: expect.arrayContaining(["VITE_FILECOIN_SEAL_API", "VITE_FILECOIN_SEAL_SAME_ORIGIN"]),
    });
    expect(requiredEnv.includes("VITE_FILECOIN_SEAL_TOKEN")).toBe(false);
  });

  it("rejects same-origin Filecoin read-back commands that expose a browser seal token", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://app.example/kickoff-lock-agent/",
        VITE_FILECOIN_SEAL_API: "",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinSealArtifact: {
        ...filecoinArtifact(),
        sameOriginSeal: true,
      },
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/filecoin-target-seal.json same-origin read-back must not expose browser token record cap-1 upload status",
        "public/filecoin-target-seal.json read-back auth mode mismatch record cap-1 upload status",
      ]),
    });
  });

  it("rejects stale Filecoin bootstrap read-back commands", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinBootstrapPlan: filecoinBootstrapPlan({
        readBackCommands: filecoinBootstrapPlan().readBackCommands.map((command) =>
          command.label === "Seal API health"
            ? {
                ...command,
                ready: false,
                command: "open https://seal.example/status",
              }
            : command,
        ),
      }),
      filecoinSealArtifact: filecoinArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/filecoin-bootstrap-plan.json read-back command must use curl Seal API health",
        "public/filecoin-bootstrap-plan.json health read-back URL mismatch Seal API health",
        "public/filecoin-bootstrap-plan.json read-back command not ready Seal API health",
      ]),
    });
  });

  it("rejects Filecoin bootstrap upload-status read-backs bound to stale job ids", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordJobId: "job-record",
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeJobIds: ["job-mode-1", "job-mode-2", "job-mode-3", "job-mode-4", "job-mode-5", "job-mode-6"],
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinBootstrapPlan: filecoinBootstrapPlan({
        readBackCommands: filecoinBootstrapPlan().readBackCommands.map((command) =>
          command.label === "Record upload status"
            ? {
                ...command,
                url: "https://seal.example/jobs/job-old",
                expectedJobId: "job-old",
                command: "curl -sS 'https://seal.example/jobs/job-old' -H \"Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN\"",
              }
            : command,
        ),
      }),
      filecoinSealArtifact: filecoinArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/filecoin-bootstrap-plan.json structured job URL mismatch Record upload status",
        "public/filecoin-bootstrap-plan.json expected job id mismatch Record upload status",
      ]),
    });
  });

  it("rejects Filecoin bootstrap read-backs bound to stale CID and payload targets", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinBootstrapPlan: filecoinBootstrapPlan({
        readBackCommands: filecoinBootstrapPlan().readBackCommands.map((command) =>
          command.label === "Record verify status"
            ? {
                ...command,
                url: "https://seal.example/verify?cid=bafy-old",
                expectedCid: "bafy-old",
                expectedPayloadHash: "0".repeat(64),
                responseExpectation: {
                  ok: true,
                  proofStatus: "verified",
                  cid: "bafy-old",
                  payloadHash: "0".repeat(64),
                },
                command: "curl -sS 'https://seal.example/verify?cid=bafy-old' -H \"Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN\"",
              }
            : command,
        ),
      }),
      filecoinSealArtifact: filecoinArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/filecoin-bootstrap-plan.json structured verify CID mismatch Record verify status",
        "public/filecoin-bootstrap-plan.json expected CID mismatch Record verify status",
        "public/filecoin-bootstrap-plan.json expected payload hash mismatch Record verify status",
      ]),
    });
  });

  it("rejects Filecoin bootstrap read-backs whose JSON response expectations are stale", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordJobId: "job-record",
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeJobIds: ["job-mode-1", "job-mode-2", "job-mode-3", "job-mode-4", "job-mode-5", "job-mode-6"],
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinBootstrapPlan: filecoinBootstrapPlan({
        readBackCommands: filecoinBootstrapPlan().readBackCommands.map((command) => {
          if (command.label === "Seal API health") {
            return {
              ...command,
              responseExpectation: {
                ok: true,
                productionReady: true,
                mockMode: true,
                authRequired: false,
                persistence: "memory",
              },
            };
          }
          if (command.label === "Record upload status") {
            return {
              ...command,
              responseExpectation: {
                ok: true,
                status: "running",
                jobId: "job-old",
              },
            };
          }
          if (command.label === "Record proof read-back") {
            return {
              ...command,
              responseExpectation: {
                ok: true,
                proofStatus: "verified",
                cid: "bafy-old",
                payloadHash: "0".repeat(64),
              },
            };
          }
          return command;
        }),
      }),
      filecoinSealArtifact: filecoinArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/filecoin-bootstrap-plan.json health response expectation mismatch Seal API health",
        "public/filecoin-bootstrap-plan.json job response expectation mismatch Record upload status",
        "public/filecoin-bootstrap-plan.json job response expectation id mismatch Record upload status",
        "public/filecoin-bootstrap-plan.json proof response expectation status mismatch Record proof read-back",
        "public/filecoin-bootstrap-plan.json proof response expectation CID mismatch Record proof read-back",
        "public/filecoin-bootstrap-plan.json proof response expectation payload hash mismatch Record proof read-back",
      ]),
    });
  });

  it("rejects Filecoin bootstrap read-backs that expose a token in same-origin mode", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinBootstrapPlan: filecoinBootstrapPlan({
        readBackCommands: filecoinBootstrapPlan().readBackCommands.map((command) =>
          command.kind === "verify" || command.kind === "proof"
            ? {
                ...command,
                authMode: "bearer-token",
                command: `${command.command} -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
              }
            : command,
        ),
      }),
      filecoinSealArtifact: {
        ...filecoinArtifact(),
        sameOriginSeal: true,
      },
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/filecoin-bootstrap-plan.json structured read-back auth mode mismatch Record verify status",
        "public/filecoin-bootstrap-plan.json same-origin read-back must not expose browser token Record verify status",
      ]),
    });
  });

  it("keeps Filecoin bootstrap placeholder read-back commands quiet until the plan is ready", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {},
      verifyEnvText: buildProductionVerifyEnv({ allowFailures: true }),
      filecoinBootstrapPlan: filecoinBootstrapPlan({
        ready: false,
        blockedStages: 3,
        readBackCommands: filecoinBootstrapPlan().readBackCommands.map((command) => ({
          ...command,
          ready: false,
          command: `Set VITE_FILECOIN_SEAL_API before reading ${command.label}.`,
        })),
      }),
      filecoinSealArtifact: filecoinArtifact({ ready: false }),
    });

    const missingEnv = packet.stages.find((stage) => stage.id === "filecoin-seal")?.missingEnv ?? [];
    expect(missingEnv.some((item) => item.includes("public/filecoin-bootstrap-plan.json read-back command"))).toBe(false);
  });

  it("rejects Filecoin target seal evidence with stale per-target read-back commands", () => {
    const artifact = filecoinArtifact();
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinSealArtifact: {
        ...artifact,
        readBackCommands: artifact.readBackCommands
          .filter((command) => command.id !== "record-cap-1-upload-status")
          .map((command) =>
            command.id === "record-cap-1-verify"
              ? {
                  ...command,
                  ready: false,
                  url: "https://seal.example/status/bafy-record",
                  command: "open https://seal.example/status/bafy-record",
                  expectedPayloadHash: "0".repeat(64),
                }
              : command,
          ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/filecoin-target-seal.json read-back command missing record cap-1 upload status",
        "public/filecoin-target-seal.json read-back URL mismatch record cap-1 verify status",
        "public/filecoin-target-seal.json read-back command must use curl record cap-1 verify status",
        "public/filecoin-target-seal.json read-back path mismatch record cap-1 verify status",
        "public/filecoin-target-seal.json read-back expected payload hash mismatch record cap-1 verify status",
        "public/filecoin-target-seal.json read-back command not ready record cap-1 verify status",
      ]),
    });
  });

  it("still requires a browser upload token for direct Filecoin seal runtime", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "",
        VITE_FILECOIN_SEAL_TOKEN: "",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinSealArtifact: filecoinArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: ["VITE_FILECOIN_SEAL_TOKEN"],
    });
  });

  it("rejects Filecoin seal evidence that does not match collected CID env", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
      },
      verifyEnvText: buildProductionVerifyEnv({
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
        filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
        allowFailures: true,
      }),
      filecoinSealArtifact: filecoinArtifact({
        targets: filecoinArtifact().targets.map((target) =>
          target.kind === "mode" && target.id === "mode-4" ? { ...target, cid: "bafy-wrong" } : target,
        ),
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "filecoin-seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_FILECOIN_MODE_CIDS do not match public/filecoin-target-seal.json mode cids",
      ]),
    });
  });

  it("keeps Supabase and sharing stages incomplete until all six mode proof ids are collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket"],
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "seed-cloud")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids"]),
    });
    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids"]),
    });
  });

  it("keeps realtime data scouting incomplete until three fixture targets are collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100"],
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      producedEnv: ["KICKOFF_VERIFY_FIXTURE_IDS"],
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_FIXTURE_IDS needs 3 fixture targets",
        "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing",
      ]),
    });
  });

  it("keeps realtime data scouting incomplete until the fixture signal matrix is collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing"]),
    });
  });

  it("requires a reusable data target scout evidence file before marking realtime targets collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: ["public/data-target-scout.json missing; run bun run scout:data-targets"],
    });
  });

  it("surfaces data target scout endpoint gaps in production collection blockers", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact({
        ready: false,
        acceptance: {
          ...scoutArtifact().acceptance,
          readyFixtureCount: 2,
          gaps: [
            {
              fixtureId: "200",
              label: "C vs D",
              missingEndpoints: ["injuries", "odds"],
              signalMatrix: "200:lineups=2|injuries=0|odds=0|standings=2",
              action: "Try another fixture.",
            },
          ],
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/data-target-scout.json not ready (2/3 ready fixtures)",
        "public/data-target-scout.json 200 missing injuries, odds",
      ]),
    });
  });

  it("requires reusable data provider evidence before marking realtime targets collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: ["public/data-provider-readiness.json missing; run bun run data:providers:check"],
    });
  });

  it("rejects data provider evidence that does not match collected runtime or fixture env", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact({
        targets: {
          ...dataProviderArtifact().targets,
          fixtureIds: ["100", "200", "999"],
          dataProxyUrl: "https://other.example.workers.dev/proxy",
        },
      }),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "runtime data proxy does not match public/data-provider-readiness.json dataProxyUrl",
        "KICKOFF_VERIFY_FIXTURE_IDS do not match public/data-provider-readiness.json fixtureIds",
      ]),
    });
  });

  it("rejects proxied data provider evidence without deployed proxy health proof", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact({
        targets: {
          ...dataProviderArtifact().targets,
          dataProxyHealthProof: {
            checked: false,
            ok: false,
            service: "",
            apiFootballServerKey: false,
            footballDataServerToken: false,
            oddsApiServerKey: false,
          },
        },
      }),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/data-provider-readiness.json data proxy health proof missing",
        "public/data-provider-readiness.json API-Football proxy key not proven by /health",
        "public/data-provider-readiness.json Football-Data proxy token not proven by /health",
        "public/data-provider-readiness.json Odds proxy key not proven by /health",
      ]),
    });
  });

  it("rejects stale realtime bootstrap free-source read-back commands", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataBootstrapPlan: dataBootstrapPlan({
        ready: true,
        blockedStages: 0,
        readBackCommands: dataBootstrapPlan().readBackCommands.map((command) =>
          command.source === "openfootball"
            ? {
                ...command,
                ready: false,
                url: "https://example.com/stale-worldcup.json",
                command: "curl -sS 'https://example.com/stale-worldcup.json'",
              }
            : command,
        ),
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/data-bootstrap-plan.json read-back command not ready openfootball World Cup 2026 JSON",
        "public/data-bootstrap-plan.json read-back URL mismatch openfootball World Cup 2026 JSON",
      ]),
    });
  });

  it("rejects stale realtime bootstrap provider and fixture read-back commands", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataBootstrapPlan: dataBootstrapPlan({
        ready: true,
        blockedStages: 0,
        readBackCommands: dataBootstrapPlan().readBackCommands
          .filter((command) => command.id !== "odds-api-h2h")
          .map((command) =>
            command.id === "api-football-standings"
              ? {
                  ...command,
                  source: "football-data" as any,
                  url: "https://data.example.workers.dev/proxy?url=https%3A%2F%2Fexample.com%2Fstandings&source=football-data",
                  command: "open https://data.example.workers.dev/proxy?url=https%3A%2F%2Fexample.com%2Fstandings&source=football-data",
                }
              : command.id === "fixture:200:injuries"
                ? {
                    ...command,
                    ready: false,
                    url: "https://data.example.workers.dev/proxy?url=https%3A%2F%2Fv3.football.api-sports.io%2Ffixtures%2Flineups%3Ffixture%3D999&source=api-football",
                    command: "curl -sS 'https://data.example.workers.dev/proxy?url=https%3A%2F%2Fv3.football.api-sports.io%2Ffixtures%2Flineups%3Ffixture%3D999&source=api-football'",
                  }
                : command,
          ),
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/data-bootstrap-plan.json read-back command missing The Odds API H2H",
        "public/data-bootstrap-plan.json read-back command target mismatch API-Football standings",
        "public/data-bootstrap-plan.json read-back command must use curl API-Football standings",
        "public/data-bootstrap-plan.json read-back source mismatch API-Football standings",
        "public/data-bootstrap-plan.json read-back command not ready Fixture 200 injuries",
        "public/data-bootstrap-plan.json read-back URL mismatch Fixture 200 injuries",
      ]),
    });
  });

  it("rejects realtime bootstrap read-backs whose structured fixture target is stale", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataBootstrapPlan: dataBootstrapPlan({
        ready: true,
        blockedStages: 0,
        readBackCommands: dataBootstrapPlan().readBackCommands.map((command) =>
          command.id === "fixture:200:injuries"
            ? {
                ...command,
                targetUrl: "https://v3.football.api-sports.io/injuries?fixture=999",
                signal: "lineups",
                proxyMode: "direct-public",
              }
            : command,
        ),
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/data-bootstrap-plan.json target URL mismatch Fixture 200 injuries",
        "public/data-bootstrap-plan.json signal mismatch Fixture 200 injuries",
        "public/data-bootstrap-plan.json proxy mode mismatch Fixture 200 injuries",
      ]),
    });
  });

  it("rejects stale realtime bootstrap response expectations", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataBootstrapPlan: dataBootstrapPlan({
        ready: true,
        blockedStages: 0,
        readBackCommands: dataBootstrapPlan().readBackCommands.map((command) =>
          command.id === "data-proxy-health"
            ? {
                ...command,
                responseExpectation: {
                  ...command.responseExpectation,
                  expectedService: "wrong-service",
                  requiredCredentialFlags: ["apiFootballServerKey"],
                },
              }
            : command.id === "api-football-standings"
              ? {
                  ...command,
                  responseExpectation: {
                    ...command.responseExpectation,
                    minRows: 1,
                    requiredFields: ["league"],
                  },
                }
              : command.id === "fixture:200:lineups"
                ? {
                    ...command,
                    responseExpectation: {
                      ...command.responseExpectation,
                      expectedFixtureId: "999",
                    },
                  }
                : command,
        ),
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/data-bootstrap-plan.json response expectation service mismatch Data proxy health",
        "public/data-bootstrap-plan.json response expectation credentials incomplete Data proxy health",
        "public/data-bootstrap-plan.json response expectation min rows mismatch API-Football standings",
        "public/data-bootstrap-plan.json response expectation fields incomplete API-Football standings",
        "public/data-bootstrap-plan.json response expectation fixture mismatch Fixture 200 lineups",
      ]),
    });
  });

  it("keeps realtime bootstrap placeholder read-back commands quiet until the plan is ready", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {},
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix: "",
        allowFailures: true,
      }),
      dataBootstrapPlan: dataBootstrapPlan({
        ready: false,
        blockedStages: 3,
        readBackCommands: dataBootstrapPlan().readBackCommands.map((command) => ({
          ...command,
          ready: false,
          url: "",
          command: `Set VITE_DATA_PROXY_URL before reading ${command.label}.`,
        })),
      }),
      dataProviderArtifact: dataProviderArtifact({
        ready: false,
        acceptance: {
          ...dataProviderArtifact().acceptance,
          dataProxyHttps: false,
        },
      }),
      dataScoutArtifact: scoutArtifact({ ready: false }),
    });

    const missingEnv = packet.stages.find((stage) => stage.id === "data-scout")?.missingEnv ?? [];
    expect(missingEnv.some((item) => item.includes("public/data-bootstrap-plan.json read-back command"))).toBe(false);
    expect(missingEnv.some((item) => item.includes("public/data-target-scout.json endpoint read-back command"))).toBe(false);
  });

  it("rejects data provider evidence with an incomplete fixture signal matrix", () => {
    const incompleteMatrix =
      "100:lineups=1|injuries=1|odds=1,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2";
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact({
        targets: {
          ...dataProviderArtifact().targets,
          fixtureSignalMatrix: incompleteMatrix,
        },
        acceptance: {
          ...dataProviderArtifact().acceptance,
          fixtureSignalMatrix: false,
        },
      }),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/data-provider-readiness.json fixture signal matrix incomplete",
        "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX does not match public/data-provider-readiness.json fixtureSignalMatrix",
        "100 missing standings rows in public/data-provider-readiness.json fixtureSignalMatrix",
      ]),
    });
  });

  it("rejects data provider evidence without public free feed read-back proof", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact({
        targets: {
          ...dataProviderArtifact().targets,
          publicFreeFeedReadBack: {
            ...dataProviderArtifact().targets.publicFreeFeedReadBack,
            openfootball: {
              ...dataProviderArtifact().targets.publicFreeFeedReadBack.openfootball,
              ok: false,
              rowCount: 0,
              detail: "HTTP 404",
            },
          },
        },
        acceptance: {
          ...dataProviderArtifact().acceptance,
          publicFreeFeedReadBack: false,
        },
      }),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/data-provider-readiness.json public free feed read-back missing",
        "public/data-provider-readiness.json openfootball read-back missing",
      ]),
    });
  });

  it("rejects data provider evidence when structured fixture signal rows are missing or stale", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact({
        targets: {
          ...dataProviderArtifact().targets,
          fixtureSignalRows: [
            {
              fixtureId: "100",
              ready: true,
              rows: { lineups: 1, injuries: 1, odds: 1, standings: 1 },
              requiredRows: { lineups: 1, injuries: 1, odds: 1, standings: 2 },
              missingSignals: [],
              detail: "stale standings count",
            },
            {
              fixtureId: "200",
              ready: false,
              rows: { lineups: 1, injuries: 0, odds: 1, standings: 2 },
              requiredRows: { lineups: 1, injuries: 1, odds: 1, standings: 2 },
              missingSignals: ["injuries"],
              detail: "injuries missing",
            },
          ],
        },
      }),
      dataScoutArtifact: scoutArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "100 fixtureSignalRows standings rows below 2",
        "100 fixtureSignalRows standings=1 does not match matrix 2",
        "public/data-provider-readiness.json fixtureSignalRows 200 not ready",
        "public/data-provider-readiness.json fixtureSignalRows missing 300",
      ]),
    });
  });

  it("rejects data scout evidence when structured fixture signals are missing or stale", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact({
        acceptance: {
          ...scoutArtifact().acceptance,
          fixtureSignals: [
            {
              fixtureId: "100",
              ready: true,
              rows: { lineups: 1, injuries: 1, odds: 1, standings: 1 },
              requiredRows: { lineups: 1, injuries: 1, odds: 1, standings: 2 },
              missingEndpoints: [],
              detail: "stale standings count",
            },
            {
              fixtureId: "200",
              ready: false,
              rows: { lineups: 1, injuries: 0, odds: 1, standings: 2 },
              requiredRows: { lineups: 1, injuries: 1, odds: 1, standings: 2 },
              missingEndpoints: ["injuries"],
              detail: "injuries missing",
            },
          ],
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "100 fixtureSignals standings rows below 2",
        "100 fixtureSignals standings=1 does not match matrix 2",
        "public/data-target-scout.json fixtureSignals 200 not ready",
        "public/data-target-scout.json fixtureSignals missing 300",
      ]),
    });
  });

  it("rejects data scout evidence when endpoint read-back commands are missing or unsafe", () => {
    const endpointCommands = dataScoutEndpointReadBackCommands(["100", "200", "300"])
      .filter((item) => item.id !== "300:standings")
      .map((item) => {
        if (item.id === "100:lineups") return { ...item, command: `open ${item.url}` };
        if (item.id === "100:injuries") return { ...item, ready: false };
        if (item.id === "200:odds") return { ...item, command: `curl -sS '${item.url}'` };
        return item;
      });
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact({
        acceptance: {
          ...scoutArtifact().acceptance,
          endpointReadBackCommands: endpointCommands,
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/data-target-scout.json endpoint read-back command must use curl 100:lineups",
        "public/data-target-scout.json endpoint read-back command not ready 100:injuries",
        "public/data-target-scout.json direct API-Football command must use env header 200:odds",
        "public/data-target-scout.json endpoint read-back command missing 300:standings",
      ]),
    });
  });

  it("rejects data scout evidence that does not match collected fixture target env", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: scoutArtifact({
        fixtureIds: ["100", "200", "999"],
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_FIXTURE_IDS do not match public/data-target-scout.json fixtureIds",
      ]),
    });
  });

  it("rejects legacy three-signal data scout evidence that omits standings", () => {
    const legacySignalMatrix =
      "100:lineups=1|injuries=1|odds=1,200:lineups=1|injuries=1|odds=1,300:lineups=1|injuries=1|odds=1";
    const legacyScout = scoutArtifact({
      requiredSignals: 3,
      signalMatrix: legacySignalMatrix,
      candidates: scoutArtifact().candidates.map((candidate) => ({
        ...candidate,
        endpoints: candidate.endpoints.filter((endpoint) => endpoint.key !== "standings"),
        signalMatrix: candidate.signalMatrix.replace("|standings=2", ""),
      })),
    });
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
      verifyEnvText: buildProductionVerifyEnv({
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix: legacySignalMatrix,
        allowFailures: true,
      }),
      dataProviderArtifact: dataProviderArtifact(),
      dataScoutArtifact: legacyScout,
    });

    expect(packet.stages.find((stage) => stage.id === "data-scout")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "100 missing standings rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
        "public/data-target-scout.json requiredSignals must be 4",
        "100 missing standings endpoint evidence in public/data-target-scout.json",
      ]),
    });
  });

  it("does not accept local or non-image share image URLs as uploaded production card evidence", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        shareImageUrl: "http://localhost/generated/kickoff-production-share.png",
        modeShareImageUrl: "https://cdn.example.com/mode-card.svg",
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "share-images")).toMatchObject({
      status: "blocked",
      producedEnv: ["KICKOFF_VERIFY_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_SHARE_IMAGE_URL must be a public HTTPS URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must point to a PNG, JPEG or WebP image path",
      ]),
    });
  });

  it("does not accept committed app logo assets as uploaded production card evidence", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        shareImageUrl: "https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png",
        modeShareImageUrl: "https://example.com/kickoff-lock-agent/assets/kickoff-lock-apple-touch.png",
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "share-images")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_SHARE_IMAGE_URL must be a generated proof card, not the app logo asset",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must be a generated proof card, not the app logo asset",
      ]),
    });
  });

  it("accepts public CDN share image URLs when they match the production seed artifact", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        shareImageUrl: "https://cdn.example.com/kickoff-production-share.png",
        modeShareImageUrl: "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-mode-share.webp",
        allowFailures: true,
      }),
      supabaseTargetSeedArtifact: supabaseArtifact({
        seed: {
          targets: {
            userId: "user-1",
            profileId: "user-1",
            proofId: "cap-1",
            modeId: "mode-bracket",
            modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
            friendCode: "chengdu",
            seasonKey: "world-cup-run",
            shareImageUrl: "https://cdn.example.com/kickoff-production-share.png",
            modeShareImageUrl:
              "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-mode-share.webp",
          },
        },
      } as Partial<ProductionTargetSeedArtifact>),
    });

    expect(packet.stages.find((stage) => stage.id === "share-images")).toMatchObject({
      status: "done",
      missingEnv: [],
    });
  });

  it("requires reusable share upload evidence before marking public share image targets collected", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "share-images")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/share-image-upload-record.json missing; run bun run share:upload-image",
        "public/share-image-upload-mode.json missing; run bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
      ]),
    });
  });

  it("rejects share upload evidence that does not match collected public image env", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareImageUploadArtifacts: {
        record: shareUploadArtifact(
          "record",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/wrong/card.png",
        ),
        mode: shareUploadArtifact(
          "mode",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "share-images")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_SHARE_IMAGE_URL does not match public/share-image-upload-record.json publicUrl",
      ]),
    });
  });

  it("rejects share upload evidence with stale read-back expectations", () => {
    const record = shareUploadArtifact(
      "record",
      "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      {
        readBackCommands: [
          {
            id: "public-image",
            label: "Public Supabase Storage share image",
            url: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/stale/card.png",
            command: "open https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/stale/card.png",
            ready: false,
            path: "user-1/record/stale/card.png",
            responseExpectation: {
              responseType: "image",
              contentType: "image/png",
              expectedImageHash: "c".repeat(64),
              expectedByteLength: 1,
              minByteLength: 1,
              expectedPublicUrl:
                "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/stale/card.png",
              expectedStoragePath: "user-1/record/stale/card.png",
            },
          },
        ],
      },
    );
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service",
      },
      verifyEnvText: buildProductionVerifyEnv({
        shareImageUrl: record.result?.publicUrl,
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareImageUploadArtifacts: {
        record,
        mode: shareUploadArtifact(
          "mode",
          "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "share-images")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/share-image-upload-record.json read-back URL mismatch public-image",
        "public/share-image-upload-record.json read-back storage path mismatch public-image",
        "public/share-image-upload-record.json read-back command must use curl public-image",
        "public/share-image-upload-record.json read-back command URL mismatch public-image",
        "public/share-image-upload-record.json read-back command not ready public-image",
        "public/share-image-upload-record.json image hash expectation mismatch public-image",
        "public/share-image-upload-record.json byte length expectation mismatch public-image",
        "public/share-image-upload-record.json minimum byte length expectation too low public-image",
        "public/share-image-upload-record.json public URL expectation mismatch public-image",
        "public/share-image-upload-record.json storage path expectation mismatch public-image",
      ]),
    });
  });

  it("requires reusable share-channel evidence before marking public sharing doctor ready", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/share-channel-evidence.json missing; run bun run sharing:bootstrap",
      ]),
    });
  });

  it("derives share artifact ids from legacy share-channel evidence before comparing target env", () => {
    const legacyShareChannelArtifact = shareChannelArtifact() as any;
    delete legacyShareChannelArtifact.targets.shareArtifactIds;
    legacyShareChannelArtifact.acceptance.outputEnvKeys = legacyShareChannelArtifact.acceptance.outputEnvKeys.filter(
      (key: string) => key !== "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
    );
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareArtifactIds: [
          "record:cap-1",
          "mode:mode-bracket",
          "mode:mode-parlay",
          "mode:mode-agent",
          "mode:mode-upset",
          "mode:mode-group-path",
          "mode:mode-penalty-pressure",
        ],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: legacyShareChannelArtifact,
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")?.missingEnv).not.toContain(
      "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS do not match public/share-channel-evidence.json shareArtifactIds",
    );
  });

  it("rejects share-channel evidence that has not opened every mode channel", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact({
        ready: false,
        doctor: {
          ready: false,
          requiredPassed: 19,
          requiredTotal: 20,
          shareChannelCheckIds: ["target-share-channel-row", "target-mode-share-channel-row"],
          passedShareChannelCheckIds: ["target-share-channel-row"],
          failedShareChannelCheckIds: ["target-mode-share-channel-row"],
        },
        acceptance: {
          recordChannelOpened: true,
          modeChannelCount: 0,
          requiredModeChannelCount: 4,
          passedTargetCount: 1,
          requiredTargetCount: 5,
          targetEnvReady: true,
          publicTargetUrlsReady: true,
          outputEnvKeys: [
            "VITE_PUBLIC_APP_URL",
            "KICKOFF_VERIFY_PROOF_ID",
            "KICKOFF_VERIFY_MODE_IDS",
            "KICKOFF_VERIFY_SHARE_IMAGE_URL",
            "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
          ],
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/share-channel-evidence.json not ready",
        "public/share-channel-evidence.json mode share channels incomplete (0/4)",
        "public/share-channel-evidence.json failed share-channel checks: target-mode-share-channel-row",
      ]),
    });
  });

  it("keeps share-channel placeholder read-back commands quiet until the artifact is ready", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact({
        ready: false,
        blockedStages: 2,
        readBackCommands: shareReadBackCommands.map((command) => ({
          ...command,
          ready: false,
          url: "",
          command: `Set VITE_PUBLIC_APP_URL before reading ${command.label}.`,
        })),
      }),
    });

    const missingEnv = packet.stages.find((stage) => stage.id === "sharing-doctor")?.missingEnv ?? [];
    expect(missingEnv).toContain("public/share-channel-evidence.json not ready");
    expect(missingEnv.some((item) => item.includes("public/share-channel-evidence.json read-back command"))).toBe(false);
  });

  it("rejects share-channel artifact read-backs that do not bind proof and image targets", () => {
    const stripTargetFilters = (urlText: string | undefined) => {
      if (!urlText) return urlText;
      const url = new URL(urlText);
      url.searchParams.delete("proof_url");
      url.searchParams.delete("image_url");
      return url.toString();
    };
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: recordShareImageUrl,
        modeShareImageUrl,
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact({
        readBackCommands: shareReadBackCommands.map((command) =>
          command.kind === "share-artifact-row"
            ? {
                ...command,
                url: stripTargetFilters(command.url),
              }
            : command,
        ),
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/share-channel-evidence.json share row read-back proof_url filter missing record-share-artifact-row",
        "public/share-channel-evidence.json share row read-back image_url filter missing record-share-artifact-row",
      ]),
    });
  });

  it("rejects share-channel evidence whose response expectations are stale", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: recordShareImageUrl,
        modeShareImageUrl,
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact({
        readBackCommands: shareReadBackCommands.map((command) =>
          command.id === "public-proof-page"
            ? {
                ...command,
                responseExpectation: {
                  ...command.responseExpectation,
                  requiredFields: ["canonical-url"],
                },
              }
            : command.id === "record-share-channel-open"
              ? {
                  ...command,
                  responseExpectation: {
                    ...command.responseExpectation,
                    expectedHost: "x.com",
                    expectedHashtags: ["KickoffLock"],
                  },
                }
              : command.id === "record-share-image"
                ? {
                    ...command,
                    responseExpectation: {
                      ...command.responseExpectation,
                      expectedImageUrl: "https://cdn.example.com/wrong.png",
                    },
                  }
                : command.id === "record-share-artifact-row"
                  ? {
                      ...command,
                      responseExpectation: {
                        ...command.responseExpectation,
                        minRows: 0,
                        requiredFields: ["id"],
                        expectedProofUrl: "https://example.com/kickoff-lock-agent/?proof=old",
                      },
                    }
                  : command,
        ),
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/share-channel-evidence.json response expectation fields incomplete public-proof-page",
        "public/share-channel-evidence.json response expectation host mismatch record-share-channel-open",
        "public/share-channel-evidence.json response expectation hashtags incomplete record-share-channel-open",
        "public/share-channel-evidence.json response expectation image URL mismatch record-share-image",
        "public/share-channel-evidence.json response expectation min rows mismatch record-share-artifact-row",
        "public/share-channel-evidence.json response expectation fields incomplete record-share-artifact-row",
        "public/share-channel-evidence.json response expectation proof URL mismatch record-share-artifact-row",
      ]),
    });
  });

  it("rejects share-channel evidence whose public URLs do not match the current target env", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact({
        targets: {
          publicAppUrl: "https://example.com/kickoff-lock-agent/",
          proofId: "cap-1",
          proofUrl: "https://example.com/kickoff-lock-agent/?proof=old-cap",
          proofXIntentUrl: shareIntentUrl("https://example.com/kickoff-lock-agent/?proof=old-cap", "record"),
          modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
          modeProofUrls: [
            "https://example.com/kickoff-lock-agent/?mode=mode-bracket",
            "https://example.com/kickoff-lock-agent/?mode=old-mode",
            "https://example.com/kickoff-lock-agent/?mode=mode-agent",
            "https://example.com/kickoff-lock-agent/?mode=mode-upset",
          ],
          modeXIntentUrls: [
            shareIntentUrl("https://example.com/kickoff-lock-agent/?mode=mode-bracket", "mode"),
            shareIntentUrl("https://example.com/kickoff-lock-agent/?mode=old-mode", "mode"),
            shareIntentUrl("https://example.com/kickoff-lock-agent/?mode=mode-agent", "mode"),
            shareIntentUrl("https://example.com/kickoff-lock-agent/?mode=mode-upset", "mode"),
          ],
          shareArtifactIds: [
            "record:cap-1",
            "mode:mode-bracket",
            "mode:mode-parlay",
            "mode:mode-agent",
            "mode:mode-upset",
            "mode:mode-group-path",
          ],
          shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/old/card.png",
          modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/share-channel-evidence.json proofUrl does not match deployed proof target",
        "public/share-channel-evidence.json modeProofUrls do not match deployed mode targets",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL does not match public/share-channel-evidence.json shareImageUrl",
      ]),
    });
  });

  it("rejects legacy share-channel evidence without crashing when mode proof URLs are missing", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact({
        targets: {
          proofId: "cap-1",
          modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        } as ShareChannelEvidenceArtifact["targets"],
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/share-channel-evidence.json modeProofUrls missing; rerun bun run sharing:bootstrap",
      ]),
    });
  });

  it("requires reusable public restore evidence before marking clean-session sharing ready", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact(),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/public-restore-evidence.json missing; run bun run doctor:sharing",
      ]),
    });
  });

  it("rejects public restore evidence whose check rows do not back the acceptance summary", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact(),
      publicRestoreArtifact: publicRestoreArtifact({
        checks: [
          {
            id: "profile-render",
            label: "Profile render",
            required: true,
            status: "passed",
            detail: "rendered",
            action: "Render profile",
            sampleIds: ["wrong-user"],
          },
          {
            id: "clean-session-restore",
            label: "Clean-session account restore",
            required: true,
            status: "passed",
            detail: "rendered",
            action: "Render clean session",
            sampleIds: ["user-1", "cap-1"],
          },
        ],
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/public-restore-evidence.json clean-session restore check missing mode samples",
        "public/public-restore-evidence.json profile-render samples do not match target ids",
        "public/public-restore-evidence.json proof-render check missing or failed",
        "public/public-restore-evidence.json mode-render check missing or failed",
      ]),
    });
  });

  it("rejects public restore evidence that does not prove clean-session cloud rendering", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact(),
      publicRestoreArtifact: publicRestoreArtifact({
        ready: false,
        acceptance: {
          publicAppUrlReady: true,
          cleanSessionRestore: false,
          profileRender: true,
          proofRender: true,
          modeRenderCount: 6,
          requiredModeRenderCount: 6,
          cleanSessionProfileIds: [],
          cleanSessionProofIds: [],
          cleanSessionModeIds: [],
          shareImageReadBack: true,
          modeShareImageReadBack: true,
          outputEnvKeys: [
            "VITE_PUBLIC_APP_URL",
            "KICKOFF_VERIFY_PROFILE_ID",
            "KICKOFF_VERIFY_PROOF_ID",
            "KICKOFF_VERIFY_MODE_IDS",
            "KICKOFF_VERIFY_SHARE_IMAGE_URL",
            "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
          ],
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/public-restore-evidence.json not ready",
        "public/public-restore-evidence.json clean-session restore incomplete",
      ]),
    });
  });

  it("rejects public restore evidence whose clean-session targets do not match verify env", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact(),
      publicRestoreArtifact: publicRestoreArtifact({
        acceptance: {
          ...publicRestoreArtifact().acceptance,
          cleanSessionProfileIds: ["other-user"],
          cleanSessionProofIds: ["other-proof"],
          cleanSessionModeIds: ["mode-bracket", "mode-parlay"],
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/public-restore-evidence.json clean-session profile target mismatch",
        "public/public-restore-evidence.json clean-session proof target mismatch",
        "public/public-restore-evidence.json clean-session mode target mismatch",
      ]),
    });
  });

  it("keeps public restore placeholder read-back commands quiet until the artifact is ready", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact(),
      publicRestoreArtifact: publicRestoreArtifact({
        ready: false,
        readBackCommands: [],
        acceptance: {
          ...publicRestoreArtifact().acceptance,
          cleanSessionRestore: false,
        },
      }),
    });

    const missingEnv = packet.stages.find((stage) => stage.id === "sharing-doctor")?.missingEnv ?? [];
    expect(missingEnv).toContain("public/public-restore-evidence.json not ready");
    expect(missingEnv.some((item) => item.includes("public/public-restore-evidence.json read-back command"))).toBe(false);
  });

  it("rejects public restore evidence whose page target URLs or source markers are stale", () => {
    const staleArtifact = publicRestoreArtifact();
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact(),
      publicRestoreArtifact: {
        ...staleArtifact,
        pageTargets: staleArtifact.pageTargets.map((target) =>
          target.kind === "proof"
            ? { ...target, url: "https://example.com/kickoff-lock-agent/?proof=other-proof" }
            : target.kind === "mode" && target.targetId === "mode-upset"
              ? { ...target, expectedSource: "fixture" as any }
              : target,
        ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/public-restore-evidence.json page target URL mismatch proof:cap-1",
        "public/public-restore-evidence.json page target source is not cloud mode:mode-upset",
      ]),
    });
  });

  it("rejects public restore evidence whose page or Supabase row read-back commands are stale", () => {
    const artifact = publicRestoreArtifact();
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact(),
      publicRestoreArtifact: {
        ...artifact,
        readBackCommands: artifact.readBackCommands
          .filter((command) => command.id !== "public-page:proof:cap-1")
          .map((command) =>
            command.id === "supabase-row:mode:mode-upset"
              ? {
                  ...command,
                  ready: false,
                  expectedSource: "fixture" as any,
                  authMode: "service-role" as any,
                  table: "kickoff_records" as any,
                  queryPath: "kickoff_records?select=id&id=eq.mode-other&limit=1",
                  url: "https://project.supabase.co/rest/v1/kickoff_records?select=id&id=eq.mode-other&limit=1",
                  command: "open https://project.supabase.co/rest/v1/kickoff_records?select=id&id=eq.mode-different&limit=1",
                }
              : command,
          ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/public-restore-evidence.json read-back command missing public-page:proof:cap-1",
        "public/public-restore-evidence.json read-back expected source mismatch supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json Supabase row auth mode mismatch supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json Supabase row table mismatch supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json Supabase row query path mismatch supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json Supabase row URL query mismatch supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json structured URL not used by command supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json Supabase row target mismatch supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json read-back command must use curl supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json Supabase row read-back must use VITE_SUPABASE_ANON_KEY supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json read-back command not ready supabase-row:mode:mode-upset",
      ]),
    });
  });

  it("rejects public restore evidence whose response expectations are stale", () => {
    const artifact = publicRestoreArtifact();
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://project.supabase.co",
      },
      verifyEnvText: buildProductionVerifyEnv({
        profileId: "user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
        shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
        modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
        allowFailures: true,
      }),
      shareChannelArtifact: shareChannelArtifact(),
      publicRestoreArtifact: {
        ...artifact,
        readBackCommands: artifact.readBackCommands.map((command) =>
          command.id === "public-page:proof:cap-1"
            ? {
                ...command,
                responseExpectation: {
                  ...command.responseExpectation,
                  requiredFields: ["canonical-url"],
                  expectedSource: "fixture" as any,
                  requiresCleanSession: false,
                  pageKind: "profile" as any,
                  queryParam: "profile",
                  targetIds: ["cap-other"],
                },
              }
            : command.id === "supabase-row:mode:mode-upset"
              ? {
                  ...command,
                  responseExpectation: {
                    ...command.responseExpectation,
                    minRows: 0,
                    table: "kickoff_records" as any,
                    requiredFields: ["id"],
                  },
                }
              : command,
        ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "sharing-doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/public-restore-evidence.json response expectation source mismatch public-page:proof:cap-1",
        "public/public-restore-evidence.json response expectation missing clean-session flag public-page:proof:cap-1",
        "public/public-restore-evidence.json response expectation page kind mismatch public-page:proof:cap-1",
        "public/public-restore-evidence.json response expectation query param mismatch public-page:proof:cap-1",
        "public/public-restore-evidence.json response expectation target ids mismatch public-page:proof:cap-1",
        "public/public-restore-evidence.json response expectation fields incomplete public-page:proof:cap-1",
        "public/public-restore-evidence.json response expectation min rows mismatch supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json response expectation table mismatch supabase-row:mode:mode-upset",
        "public/public-restore-evidence.json response expectation fields incomplete supabase-row:mode:mode-upset",
      ]),
    });
  });

  it("requires reusable leaderboard backend evidence before opening final production verification", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")).toMatchObject({
      status: "blocked",
      missingEnv: ["public/leaderboard-backend.json missing; run bun run leaderboard:bootstrap"],
    });
  });

  it("derives leaderboard scopes from legacy query contracts before comparing target env", () => {
    const legacyLeaderboardArtifact = leaderboardArtifact() as any;
    delete legacyLeaderboardArtifact.targets.leaderboardScopes;
    legacyLeaderboardArtifact.acceptance.outputEnvKeys = legacyLeaderboardArtifact.acceptance.outputEnvKeys.filter(
      (key: string) => key !== "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
    );
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        leaderboardScopes: ["global", "friend", "season"],
        allowFailures: true,
      }),
      leaderboardArtifact: legacyLeaderboardArtifact,
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")?.missingEnv).not.toContain(
      "KICKOFF_VERIFY_LEADERBOARD_SCOPES do not match public/leaderboard-backend.json leaderboardScopes",
    );
  });

  it("rejects leaderboard backend evidence that does not match collected target env", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: leaderboardArtifact({
        targets: {
          userId: "user-1",
          friendCode: "wrong-code",
          seasonKey: "world-cup-run",
          leaderboardScopes: ["global", "friend", "season"],
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_FRIEND_CODE does not match public/leaderboard-backend.json friendCode",
      ]),
    });
  });

  it("rejects leaderboard backend evidence whose current-user target queries are incomplete", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: leaderboardArtifact({
        targetQueries: {
          global: "kickoff_leaderboard?select=id&id=eq.user-1&limit=1",
          friend: `kickoff_leaderboard?select=${leaderboardSelect}&order=xp.desc&id=eq.user-1&limit=1`,
          season: `kickoff_profiles?select=${leaderboardSelect}&order=xp.desc&id=eq.user-1&season_key=eq.world-cup-run&limit=1`,
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        expect.stringContaining("public/leaderboard-backend.json global target query incomplete"),
        expect.stringContaining("public/leaderboard-backend.json friend target query incomplete"),
        expect.stringContaining("public/leaderboard-backend.json season target query incomplete"),
      ]),
    });
  });

  it("rejects leaderboard backend evidence whose board list queries are incomplete", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: leaderboardArtifact({
        boardQueries: {
          global: `kickoff_leaderboard?select=id&order=xp.desc&limit=5`,
          friend: `kickoff_leaderboard?select=${leaderboardSelect}&order=friend_rank.asc&limit=20`,
          season: `kickoff_profiles?select=${leaderboardSelect}&order=season_rank.asc&season_key=eq.world-cup-run&limit=20`,
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        expect.stringContaining("public/leaderboard-backend.json global board query incomplete"),
        expect.stringContaining("public/leaderboard-backend.json friend board query incomplete"),
        expect.stringContaining("public/leaderboard-backend.json season board query incomplete"),
      ]),
    });
  });

  it("rejects leaderboard backend evidence whose board read-back checks are missing", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: leaderboardArtifact({
        ready: false,
        doctor: {
          ...leaderboardArtifact().doctor!,
          ready: false,
          passedLeaderboardCheckIds: ["leaderboard-global-user", "leaderboard-friend-user", "leaderboard-season-user"],
          failedLeaderboardCheckIds: ["leaderboard-global-board", "leaderboard-friend-board", "leaderboard-season-board"],
        },
        acceptance: {
          ...leaderboardArtifact().acceptance,
          globalBoardRows: false,
          friendBoardRows: false,
          seasonBoardRows: false,
          passedBoardCount: 0,
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/leaderboard-backend.json not ready",
        "public/leaderboard-backend.json global board rows missing",
        "public/leaderboard-backend.json friend board rows missing",
        "public/leaderboard-backend.json season board rows missing",
        "public/leaderboard-backend.json board rows incomplete (0/3)",
        expect.stringContaining("public/leaderboard-backend.json failed leaderboard checks"),
      ]),
    });
  });

  it("rejects leaderboard backend evidence whose structured query contracts are incomplete", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: leaderboardArtifact({
        queryContracts: leaderboardQueryContracts.map((contract) =>
          contract.scope === "friend"
            ? { ...contract, passed: false, boardQueryReady: false, detail: "friend missing ranked board query" }
            : contract,
        ),
        acceptance: {
          ...leaderboardArtifact().acceptance,
          queryContractsReady: false,
        },
      }),
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/leaderboard-backend.json query contracts incomplete",
        expect.stringContaining("public/leaderboard-backend.json friend query contract incomplete"),
      ]),
    });
  });

  it("rejects leaderboard backend evidence whose scope claims are stale", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: leaderboardArtifact({
        acceptance: {
          ...leaderboardArtifact().acceptance,
          scopeClaims: leaderboardScopeClaims.map((claim) =>
            claim.scope === "friend"
              ? {
                  ...claim,
                  currentUser: false,
                  doctorPassed: false,
                  targetQuery: "kickoff_leaderboard?select=id&limit=1",
                  blockers: [],
                }
              : claim,
          ),
        },
      }),
    });

    const leaderboardStage = packet.stages.find((stage) => stage.id === "leaderboard-backend");
    expect(leaderboardStage?.status).toBe("blocked");
    const leaderboardMissingEnv = leaderboardStage?.missingEnv;
    expect(Array.isArray(leaderboardMissingEnv)).toBe(true);
    expect(
      leaderboardMissingEnv?.some((item) => item.includes("public/leaderboard-backend.json friend scope claim incomplete")),
    ).toBe(true);
    expect(leaderboardMissingEnv?.some((item) => item.includes("current-user claim mismatch"))).toBe(true);
    expect(leaderboardMissingEnv?.some((item) => item.includes("target query mismatch"))).toBe(true);
  });

  it("rejects leaderboard backend evidence whose read-back commands are stale", () => {
    const artifact = leaderboardArtifact();
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: {
        ...artifact,
        readBackCommands: artifact.readBackCommands
          .filter((command) => command.id !== "leaderboard:global:current-user")
          .map((command) =>
            command.id === "leaderboard:friend:board"
              ? {
                  ...command,
                  ready: false,
                  url: "https://project.supabase.co/rest/v1/kickoff_profiles?select=id&limit=1",
                  command: "open https://project.supabase.co/rest/v1/kickoff_profiles?select=id&limit=1",
                }
              : command,
          ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/leaderboard-backend.json read-back command missing leaderboard:global:current-user",
        "public/leaderboard-backend.json read-back command URL mismatch leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command must use curl leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command must use VITE_SUPABASE_ANON_KEY leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command query path missing leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command not ready leaderboard:friend:board",
      ]),
    });
  });

  it("rejects leaderboard read-backs whose structured scope filters are stale", () => {
    const artifact = leaderboardArtifact();
    const staleFriendBoardQuery = `kickoff_leaderboard?select=${leaderboardSelect}&order=xp.desc&friend_code=eq.old-code&limit=5`;
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: {
        ...artifact,
        readBackCommands: artifact.readBackCommands.map((command) =>
          command.id === "leaderboard:friend:board"
            ? {
                ...command,
                queryPath: staleFriendBoardQuery,
                url: `https://project.supabase.co/rest/v1/${staleFriendBoardQuery}`,
                command: `curl -sS 'https://project.supabase.co/rest/v1/${staleFriendBoardQuery}' -H 'apikey: $VITE_SUPABASE_ANON_KEY' -H 'Authorization: Bearer $VITE_SUPABASE_ANON_KEY'`,
                expectedFriendCode: "old-code",
                expectedOrder: "xp.desc",
                minRows: 5,
              }
            : command,
        ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/leaderboard-backend.json read-back command query path mismatch leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command URL mismatch leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command expected order mismatch leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command row limit mismatch leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command expected friend code mismatch leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command friend code filter mismatch leaderboard:friend:board",
      ]),
    });
  });

  it("rejects leaderboard backend evidence whose response expectations are stale", () => {
    const artifact = leaderboardArtifact();
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      },
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: {
        ...artifact,
        readBackCommands: artifact.readBackCommands.map((command) =>
          command.id === "leaderboard:friend:board"
            ? {
                ...command,
                responseExpectation: {
                  ...command.responseExpectation,
                  scope: "global" as const,
                  minRows: 5,
                  requiredFields: ["id", "xp"],
                  expectedFriendCode: "old-code",
                  requiredRankFields: ["global_rank"],
                },
              }
            : command.id === "leaderboard:season:current-user"
              ? {
                  ...command,
                  responseExpectation: {
                    ...command.responseExpectation,
                    expectedSeasonKey: "old-season",
                    expectedOrder: "season_rank.asc",
                  },
                }
              : command,
        ),
      },
    });

    expect(packet.stages.find((stage) => stage.id === "leaderboard-backend")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "public/leaderboard-backend.json read-back command response expectation scope mismatch leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command response expectation min rows mismatch leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command response expectation fields incomplete leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command response expectation rank fields incomplete leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command response expectation friend code mismatch leaderboard:friend:board",
        "public/leaderboard-backend.json read-back command response expectation order mismatch leaderboard:season:current-user",
        "public/leaderboard-backend.json read-back command response expectation season key mismatch leaderboard:season:current-user",
      ]),
    });
  });

  it("keeps leaderboard placeholder read-back commands quiet until the artifact is ready", () => {
    const artifact = leaderboardArtifact({
      ready: false,
      blockedStages: 2,
      readBackCommands: leaderboardReadBackCommands.map((command) => ({
        ...command,
        ready: false,
        url: "",
        command: `Set VITE_SUPABASE_URL before reading ${command.label}.`,
      })),
    });
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {},
      verifyEnvText: buildProductionVerifyEnv({
        userId: "user-1",
        friendCode: "chengdu",
        seasonKey: "world-cup-run",
        allowFailures: true,
      }),
      leaderboardArtifact: artifact,
    });

    const missingEnv = packet.stages.find((stage) => stage.id === "leaderboard-backend")?.missingEnv ?? [];
    expect(missingEnv).toContain("public/leaderboard-backend.json not ready");
    expect(missingEnv.some((item) => item.includes("public/leaderboard-backend.json read-back command"))).toBe(false);
  });

  it("wraps the collector packet as a reusable production artifact", () => {
    const packet = buildProductionAcceptanceCollector({
      runtimeEnv: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      },
      verifyEnvText: buildProductionVerifyEnv({ allowFailures: true }),
    });
    const artifact = buildProductionAcceptanceCollectorArtifact(packet, {
      generatedAt: "2026-07-04T12:00:00.000Z",
      envFiles: [".env.production.local"],
      outputPath: "/tmp/production-acceptance-collector.json",
      wrote: false,
    });

    expect(artifact).toMatchObject({
      artifactVersion: 1,
      generatedAt: "2026-07-04T12:00:00.000Z",
      source: "local-script",
      envFiles: [".env.production.local"],
      outputPath: "/tmp/production-acceptance-collector.json",
      wrote: false,
      ready: packet.ready,
      totalStages: packet.totalStages,
      blockedStages: packet.blockedStages,
    });
    expect(artifact.copyText).toContain("production acceptance collector");
  });
});
