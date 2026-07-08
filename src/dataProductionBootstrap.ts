import {
  buildDataProviderReadinessReport,
  dataProxyUrlProblem,
  resolvedDataProviderProxyHealthUrl,
  resolvedDataProviderProxyUrl,
} from "./dataProviderReadiness";
import { parseEnvText } from "./productionEvidence";

export type DataProductionBootstrapStatus = "done" | "ready" | "blocked";

export type DataProductionBootstrapStage = {
  id: "proxy" | "providers" | "scout" | "doctor";
  label: string;
  status: DataProductionBootstrapStatus;
  command: string;
  executeCommand: string;
  requiredEnv: string[];
  missingEnv: string[];
  outputEnv: string[];
  detail: string;
};

export type DataProductionReadBackCommand = {
  id: string;
  label: string;
  command: string;
  url: string;
  targetUrl: string;
  proxyMode: "data-proxy" | "direct-public" | "blocked";
  signal:
    | "health"
    | "worldcup-json"
    | "season-feed"
    | "standings"
    | "matches"
    | "lineups"
    | "injuries"
    | "odds";
  ready: boolean;
  fixtureId?: string;
  source: "data-proxy" | "api-football" | "football-data" | "odds-api" | "openfootball" | "thesportsdb";
  responseExpectation: {
    responseType:
      | "data-proxy-health"
      | "openfootball-worldcup"
      | "thesportsdb-season"
      | "api-football-response"
      | "football-data-response"
      | "odds-api-response";
    rowPath: string;
    minRows?: number;
    requiredFields: string[];
    expectedSource: DataProductionReadBackCommand["source"];
    expectedSignal: DataProductionReadBackCommand["signal"];
    expectedFixtureId?: string;
    expectedSeason?: string;
    expectedCompetition?: string;
    expectedService?: string;
    requiredCredentialFlags?: string[];
  };
};

export type DataProductionBootstrapPlan = {
  ready: boolean;
  execute: boolean;
  stageReadyCount: number;
  totalStages: number;
  blockedStages: number;
  missingEnv: string[];
  stages: DataProductionBootstrapStage[];
  readBackCommands: DataProductionReadBackCommand[];
  commands: string[];
  nextAction: string;
  copyText: string;
};

export type DataProductionBootstrapEnv = Record<string, string | undefined>;

const targetKeys = ["KICKOFF_VERIFY_FIXTURE_IDS", "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"];

const runtimeKeys = ["APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY", "VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1"];

const value = (env: DataProductionBootstrapEnv, key: string) => env[key]?.trim() ?? "";

const present = (env: DataProductionBootstrapEnv, key: string) => Boolean(value(env, key));

const flagEnabled = (env: DataProductionBootstrapEnv, key: string) =>
  ["1", "true", "yes", "on"].includes(value(env, key).toLowerCase());

const listValue = (env: DataProductionBootstrapEnv, key: string) =>
  value(env, key).split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const requiredFixtureTargetCount = (env: DataProductionBootstrapEnv) =>
  Math.max(1, Number(value(env, "KICKOFF_DATA_SCOUT_TARGETS") || 3) || 3);

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const requiredSignals = ["lineups", "injuries", "odds", "standings"];
const requiredSignalRows = (signal: string) => (signal === "standings" || signal === "lineups" ? 2 : 1);

const parseFixtureSignalMatrix = (value: string) =>
  value
    .split(/[,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [fixtureId = "", signalText = ""] = entry.split(":");
      const signals = Object.fromEntries(
        signalText
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => {
            const [key = "", rows = "0"] = item.split("=");
            return [key.trim(), Number(rows)];
          }),
      );
      return { fixtureId: fixtureId.trim(), signals };
    });

const fixtureSignalProblems = (env: DataProductionBootstrapEnv, fixtureIds: string[]) => {
  const matrixValue = value(env, "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX");
  if (!matrixValue) return ["KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"];
  const rows = parseFixtureSignalMatrix(matrixValue);
  return fixtureIds.flatMap((fixtureId) => {
    const row = rows.find((item) => item.fixtureId === fixtureId);
    if (!row) return [`KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing ${fixtureId}`];
    return requiredSignals
      .filter((signal) => !Number.isFinite(row.signals[signal]) || row.signals[signal] < requiredSignalRows(signal))
      .map((signal) => `${fixtureId} missing ${signal} rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX`);
  });
};

const parsedEnv = (env: DataProductionBootstrapEnv) =>
  parseEnvText(
    Object.entries(env)
      .map(([key, item]) => `${key}=${item ?? ""}`)
      .join("\n"),
  );

const dataProxyReady = (env: DataProductionBootstrapEnv) => !proxyProblemFor(env);

const missingOddsProvider = (env: DataProductionBootstrapEnv, oddsProviderReady: boolean) => {
  if (oddsProviderReady) return [];
  return [
    "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY/ODDS_API_KEY or VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY",
  ];
};

const providerMissingEnv = (id: string) => {
  if (id === "api-football-key") return ["APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY"];
  if (id === "football-data-backup") {
    return ["FOOTBALL_DATA_TOKEN or FOOTBALL_DATA_ORG_TOKEN or VITE_FOOTBALL_DATA_TOKEN or deployed data proxy with FOOTBALL_DATA_TOKEN"];
  }
  if (id === "odds-provider") {
    return [
      "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY/ODDS_API_KEY or VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY",
    ];
  }
  if (id === "data-proxy") return ["VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1"];
  if (id === "api-football-enrichment-limit") return ["VITE_APIFOOTBALL_ENRICHMENT_LIMIT"];
  if (id === "scout-search-window") return ["KICKOFF_DATA_SCOUT_LIMIT or KICKOFF_DATA_SCOUT_FIXTURE_IDS", "KICKOFF_DATA_SCOUT_TARGETS"];
  return [id];
};

const proxyProblemFor = (env: DataProductionBootstrapEnv) => {
  const proxyUrl = resolvedDataProviderProxyUrl(env);
  if (!proxyUrl) return "VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1 with VITE_PUBLIC_APP_URL";
  return dataProxyUrlProblem(
    proxyUrl,
    !present(env, "VITE_DATA_PROXY_URL") && flagEnabled(env, "VITE_DATA_PROXY_SAME_ORIGIN")
      ? "same-origin data proxy URL"
      : "VITE_DATA_PROXY_URL",
  );
};

const proxyDetailFor = (env: DataProductionBootstrapEnv) => {
  const proxyUrl = resolvedDataProviderProxyUrl(env);
  if (!proxyUrl || proxyProblemFor(env)) {
    return "Deploy server/data-proxy-worker.mjs to Cloudflare Workers, or deploy the bundled Pages function and set VITE_DATA_PROXY_SAME_ORIGIN=1.";
  }
  return present(env, "VITE_DATA_PROXY_URL")
    ? "Static hosting data proxy URL is a deployed HTTPS /proxy endpoint."
    : "Same-origin Pages data proxy is enabled at the deployed app origin.";
};

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
const currentSeason = () => String(new Date().getUTCFullYear());
const footballDataCompetition = (env: DataProductionBootstrapEnv) => value(env, "VITE_FOOTBALL_DATA_COMPETITION") || "WC";
const oddsSportKey = (env: DataProductionBootstrapEnv) => value(env, "VITE_ODDS_API_SPORT_KEY") || "soccer_fifa_world_cup";
const openFootballWorldCupUrl = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const theSportsDbSeasonUrl = (env: DataProductionBootstrapEnv) => {
  const key = value(env, "VITE_THESPORTSDB_KEY") || "123";
  const league = value(env, "VITE_THESPORTSDB_LEAGUE_ID") || "4429";
  const season = value(env, "VITE_THESPORTSDB_SEASON") || value(env, "KICKOFF_DATA_SEASON") || currentSeason();
  return `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsseason.php?id=${encodeURIComponent(league)}&s=${encodeURIComponent(season)}`;
};

const proxiedDataUrl = (env: DataProductionBootstrapEnv, targetUrl: string, source: string) => {
  const proxyUrl = resolvedDataProviderProxyUrl(env);
  if (!proxyUrl || proxyProblemFor(env)) return "";
  const url = new URL(proxyUrl);
  url.search = "";
  url.searchParams.set("url", targetUrl);
  url.searchParams.set("source", source);
  return url.toString();
};

const curlCommand = (url: string) => `curl -sS ${shellSingleQuote(url)}`;

const expectationFor = ({
  source,
  signal,
  fixtureId,
  season,
  competition,
}: {
  source: DataProductionReadBackCommand["source"];
  signal: DataProductionReadBackCommand["signal"];
  fixtureId?: string;
  season?: string;
  competition?: string;
}): DataProductionReadBackCommand["responseExpectation"] => {
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
      expectedSeason: season,
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
      expectedSeason: season,
      expectedCompetition: competition,
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
  const apiFootballRequiredFields: Record<string, string[]> = {
    standings: ["league", "standings", "team", "rank", "points"],
    lineups: ["team", "formation", "startXI"],
    injuries: ["player", "team", "fixture"],
    odds: ["league", "fixture", "bookmakers", "bets"],
  };
  return {
    responseType: "api-football-response",
    rowPath: signal === "standings" ? "response[0].league.standings" : "response",
    minRows: requiredSignalRows(signal),
    requiredFields: apiFootballRequiredFields[signal] ?? ["response"],
    expectedSource: source,
    expectedSignal: signal,
    expectedFixtureId: fixtureId,
    expectedSeason: season,
  };
};

const publicDataCommand = (
  id: string,
  label: string,
  targetUrl: string,
  source: Extract<DataProductionReadBackCommand["source"], "openfootball" | "thesportsdb">,
  signal: Extract<DataProductionReadBackCommand["signal"], "worldcup-json" | "season-feed">,
  season?: string,
): DataProductionReadBackCommand => ({
  id,
  label,
  source,
  signal,
  targetUrl,
  proxyMode: "direct-public",
  ready: true,
  url: targetUrl,
  command: curlCommand(targetUrl),
  responseExpectation: expectationFor({ source, signal, season: signal === "worldcup-json" ? "2026" : season }),
});

const dataCommand = (
  env: DataProductionBootstrapEnv,
  id: string,
  label: string,
  targetUrl: string,
  source: DataProductionReadBackCommand["source"],
  signal: DataProductionReadBackCommand["signal"],
  fixtureId?: string,
  season?: string,
): DataProductionReadBackCommand => {
  const commandUrl = source === "data-proxy" ? targetUrl : proxiedDataUrl(env, targetUrl, source);
  return {
    id,
    label,
    source,
    signal,
    targetUrl,
    proxyMode: commandUrl ? "data-proxy" : "blocked",
    fixtureId,
    ready: Boolean(commandUrl),
    url: commandUrl,
    responseExpectation: expectationFor({
      source,
      signal,
      fixtureId,
      season,
      competition: source === "football-data" ? footballDataCompetition(env) : undefined,
    }),
    command: commandUrl
      ? curlCommand(commandUrl)
      : `Set VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1 before reading ${label}.`,
  };
};

const buildReadBackCommands = (env: DataProductionBootstrapEnv): DataProductionReadBackCommand[] => {
  const season = value(env, "KICKOFF_DATA_SEASON") || currentSeason();
  const fixtureIds = listValue(env, "KICKOFF_VERIFY_FIXTURE_IDS");
  const healthUrl = resolvedDataProviderProxyHealthUrl(env);
  const healthCommand: DataProductionReadBackCommand = {
    id: "data-proxy-health",
    label: "Data proxy health",
    source: "data-proxy",
    signal: "health",
    targetUrl: healthUrl && !proxyProblemFor(env) ? healthUrl : "",
    proxyMode: healthUrl && !proxyProblemFor(env) ? "data-proxy" : "blocked",
    ready: Boolean(healthUrl && !proxyProblemFor(env)),
    url: healthUrl && !proxyProblemFor(env) ? healthUrl : "",
    command:
      healthUrl && !proxyProblemFor(env)
        ? curlCommand(healthUrl)
        : "Set VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1 before reading data proxy health.",
    responseExpectation: expectationFor({ source: "data-proxy", signal: "health" }),
  };
  const fixtureCommands = fixtureIds.flatMap((fixtureId) => [
    dataCommand(
      env,
      `fixture:${fixtureId}:lineups`,
      `Fixture ${fixtureId} lineups`,
      `https://v3.football.api-sports.io/fixtures/lineups?fixture=${encodeURIComponent(fixtureId)}`,
      "api-football",
      "lineups",
      fixtureId,
      season,
    ),
    dataCommand(
      env,
      `fixture:${fixtureId}:injuries`,
      `Fixture ${fixtureId} injuries`,
      `https://v3.football.api-sports.io/injuries?fixture=${encodeURIComponent(fixtureId)}`,
      "api-football",
      "injuries",
      fixtureId,
      season,
    ),
    dataCommand(
      env,
      `fixture:${fixtureId}:odds`,
      `Fixture ${fixtureId} odds`,
      `https://v3.football.api-sports.io/odds?fixture=${encodeURIComponent(fixtureId)}`,
      "api-football",
      "odds",
      fixtureId,
      season,
    ),
  ]);
  return [
    healthCommand,
    publicDataCommand("openfootball-worldcup-2026", "openfootball World Cup 2026 JSON", openFootballWorldCupUrl, "openfootball", "worldcup-json"),
    publicDataCommand(
      "thesportsdb-worldcup-season",
      "TheSportsDB World Cup season feed",
      theSportsDbSeasonUrl(env),
      "thesportsdb",
      "season-feed",
      season,
    ),
    dataCommand(
      env,
      "api-football-standings",
      "API-Football standings",
      `https://v3.football.api-sports.io/standings?league=1&season=${encodeURIComponent(season)}`,
      "api-football",
      "standings",
      undefined,
      season,
    ),
    dataCommand(
      env,
      "football-data-matches",
      "Football-Data matches",
      `https://api.football-data.org/v4/competitions/${encodeURIComponent(footballDataCompetition(env))}/matches?season=${encodeURIComponent(season)}`,
      "football-data",
      "matches",
      undefined,
      season,
    ),
    dataCommand(
      env,
      "football-data-standings",
      "Football-Data standings",
      `https://api.football-data.org/v4/competitions/${encodeURIComponent(footballDataCompetition(env))}/standings?season=${encodeURIComponent(season)}`,
      "football-data",
      "standings",
      undefined,
      season,
    ),
    dataCommand(
      env,
      "odds-api-h2h",
      "The Odds API H2H",
      `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(oddsSportKey(env))}/odds?regions=us&markets=h2h&oddsFormat=decimal`,
      "odds-api",
      "odds",
    ),
    ...fixtureCommands,
  ];
};

export const buildDataProductionBootstrapPlan = (
  env: DataProductionBootstrapEnv,
  options: { execute?: boolean; health?: unknown; healthStatus?: number } = {},
): DataProductionBootstrapPlan => {
  const execute = Boolean(options.execute);
  const parsed = parsedEnv(env);
  const providerReport = buildDataProviderReadinessReport(env, {
    health: options.health,
    healthStatus: options.healthStatus,
  });
  const providerCheckPassed = (id: string) => providerReport.checks.find((check) => check.id === id)?.passed === true;
  const apiFootballProviderReady = providerCheckPassed("api-football-key");
  const oddsProviderReady = providerCheckPassed("odds-provider");
  const providerBlockers = providerReport.blockers.filter(
    (check) => check.id !== "fixture-targets" && check.id !== "fixture-signal-matrix",
  );
  const providerMissing = unique(providerBlockers.flatMap((check) => providerMissingEnv(check.id)));
  const proxyProblem = proxyProblemFor(env);
  const targetCount = requiredFixtureTargetCount(env);
  const fixtureTargetIds = listValue(env, "KICKOFF_VERIFY_FIXTURE_IDS");
  const signalProblems = fixtureSignalProblems(env, fixtureTargetIds);
  const fixtureTargetsCollected =
    Boolean(parsed.KICKOFF_VERIFY_FIXTURE_IDS) &&
    fixtureTargetIds.length >= targetCount &&
    signalProblems.length === 0;
  const fixtureTargetProblems = parsed.KICKOFF_VERIFY_FIXTURE_IDS && fixtureTargetIds.length < targetCount
    ? [`KICKOFF_VERIFY_FIXTURE_IDS needs ${targetCount} fixture targets`]
    : [];
  const scoutMissing = apiFootballProviderReady
    ? []
    : ["APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY"];
  const doctorMissing = unique([
    ...providerMissing,
    ...missingOddsProvider(env, oddsProviderReady),
    ...(fixtureTargetsCollected ? [] : targetKeys.filter((key) => !parsed[key])),
    ...fixtureTargetProblems,
    ...signalProblems,
  ]);

  const stages: DataProductionBootstrapStage[] = [
    {
      id: "proxy",
      label: "Deploy free feed CORS proxy",
      status: proxyProblem ? "ready" : "done",
      command: "bun run data:proxy:deploy",
      executeCommand: "bun run data:proxy:deploy",
      requiredEnv: ["wrangler login or CLOUDFLARE_API_TOKEN"],
      missingEnv: proxyProblem ? [proxyProblem] : [],
      outputEnv: ["VITE_DATA_PROXY_URL", "VITE_DATA_PROXY_SAME_ORIGIN"],
      detail: proxyDetailFor(env),
    },
    {
      id: "providers",
      label: "Preflight realtime data providers",
      status: providerBlockers.length === 0 ? "ready" : "blocked",
      command: "bun run data:providers:check",
      executeCommand: "bun run data:providers:check",
      requiredEnv: [
        "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY",
        "VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1",
        "VITE_APIFOOTBALL_ENRICHMENT_LIMIT",
        "KICKOFF_DATA_SCOUT_LIMIT",
        "KICKOFF_DATA_SCOUT_FIXTURE_IDS",
        "KICKOFF_DATA_SCOUT_TARGETS",
        "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY/ODDS_API_KEY or VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY",
      ],
      missingEnv: providerMissing,
      outputEnv: ["provider readiness evidence"],
      detail:
        providerBlockers.length === 0
          ? `${providerReport.total - providerReport.blockers.length}/${providerReport.total - 1} provider checks passed; fixture targets are handled by scout.`
          : providerBlockers.map((check) => `${check.label}: ${check.action}`).join(" "),
    },
    {
      id: "scout",
      label: "Scout realtime fixture targets",
      status: fixtureTargetsCollected ? "done" : scoutMissing.length === 0 ? "ready" : "blocked",
      command: "bun run scout:data-targets",
      executeCommand: "bun run scout:data-targets",
      requiredEnv: [
        "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY",
        "optional KICKOFF_DATA_SCOUT_FIXTURE_IDS",
      ],
      missingEnv: fixtureTargetsCollected ? [] : scoutMissing,
      outputEnv: targetKeys,
      detail: fixtureTargetsCollected
        ? `${fixtureTargetIds.length}/${targetCount} realtime fixture targets collected with lineups, injuries, odds and standings signal rows.`
        : `Find ${targetCount} World Cup fixtures where lineups, injuries, odds and standings all return live rows; set KICKOFF_DATA_SCOUT_FIXTURE_IDS to validate known candidates directly.`,
    },
    {
      id: "doctor",
      label: "Verify realtime production data",
      status: doctorMissing.length === 0 ? "ready" : "blocked",
      command: "bun run doctor:data",
      executeCommand: "bun run doctor:data",
      requiredEnv: [
        ...runtimeKeys,
        "APIFOOTBALL_KEY or VITE_APIFOOTBALL_KEY or deployed data proxy with APIFOOTBALL_KEY/ODDS_API_KEY or VITE_ODDS_API_KEY plus VITE_ODDS_API_SPORT_KEY",
        ...targetKeys,
      ],
      missingEnv: doctorMissing,
      outputEnv: ["realtime production evidence"],
      detail: "Verify free feed continuity, API-Football lineups/injuries/odds/standings read-back and optional The Odds API H2H read-back.",
    },
  ];

  const blockedStages = stages.filter((stage) => stage.status === "blocked").length;
  const stageReadyCount = stages.filter((stage) => stage.status === "ready" || stage.status === "done").length;
  const missingEnv = unique(stages.flatMap((stage) => stage.missingEnv));
  const readBackCommands = buildReadBackCommands(env);
  const commands = stages.filter((stage) => stage.status !== "done").map((stage) => (execute ? stage.executeCommand : stage.command));
  const next = stages.find((stage) => stage.status !== "done");
  const nextAction = next
    ? next.status === "ready"
      ? `${next.label}: run ${execute ? next.executeCommand : next.command}.`
      : `${next.label}: set ${next.missingEnv.join(", ")} first.`
    : "Realtime data bootstrap targets are ready. Run bun run doctor:data.";
  const copyText = [
    "Kickoff Lock Agent realtime data production bootstrap",
    `Mode: ${execute ? "execute" : "plan"}`,
    `Stages: ${stageReadyCount}/${stages.length} ready or done`,
    `Missing env: ${missingEnv.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Realtime data read-back commands:",
    ...readBackCommands.map((item) => `- ${item.label}: ${item.command}`),
    "Stages:",
    ...stages.map((stage) =>
      [
        `- ${stage.label} [${stage.status}]`,
        `  command: ${stage.command}`,
        `  execute: ${stage.executeCommand}`,
        `  requires: ${stage.requiredEnv.join(", ")}`,
        `  missing: ${stage.missingEnv.join(", ") || "none"}`,
        `  outputs: ${stage.outputEnv.join(", ")}`,
        `  detail: ${stage.detail}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready: blockedStages === 0,
    execute,
    stageReadyCount,
    totalStages: stages.length,
    blockedStages,
    missingEnv,
    stages,
    readBackCommands,
    commands,
    nextAction,
    copyText,
  };
};
