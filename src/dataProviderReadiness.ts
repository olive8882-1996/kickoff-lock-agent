export type DataProviderReadinessEnv = Record<string, string | undefined>;

const SAME_ORIGIN_DATA_PROXY_PATH = "/data-proxy/proxy";

export type DataProviderReadinessCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  action: string;
};

export type DataProviderReadinessReport = {
  ready: boolean;
  passed: number;
  total: number;
  checks: DataProviderReadinessCheck[];
  blockers: DataProviderReadinessCheck[];
};

export type DataProviderProxyHealthProof = {
  ok: boolean;
  service: string;
  apiFootballServerKey: boolean;
  footballDataServerToken: boolean;
  oddsApiServerKey: boolean;
  allowedRoutes: string[];
  providerCapabilities: Array<{
    source: string;
    serverCredentialPresent?: boolean;
    routes?: string[];
  }>;
};

export type DataProviderPublicFeedProof = {
  checkedAt: string;
  openfootball: {
    url: string;
    ok: boolean;
    status: number;
    rowCount: number;
    detail: string;
  };
  theSportsDb: {
    url: string;
    ok: boolean;
    status: number;
    rowCount: number;
    detail: string;
  };
  theSportsDbTable: {
    url: string;
    ok: boolean;
    status: number;
    rowCount: number;
    detail: string;
  };
};

export type DataProviderFixtureSignalKey = (typeof requiredFixtureSignals)[number];

export type DataProviderFixtureSignalRow = {
  fixtureId: string;
  ready: boolean;
  rows: Record<DataProviderFixtureSignalKey, number>;
  requiredRows: Record<DataProviderFixtureSignalKey, number>;
  missingSignals: DataProviderFixtureSignalKey[];
  detail: string;
};

export type DataProviderReadinessArtifact = DataProviderReadinessReport & {
  generatedAt: string;
  envFiles: string[];
  artifactVersion: 1;
  targets: {
    fixtureIds: string[];
    requiredFixtureCount: number;
    fixtureSignalMatrix: string;
    dataProxyUrl: string;
    dataProxyHealthUrl: string;
    apiFootballConfigured: boolean;
    footballDataBackupConfigured: boolean;
    oddsProviderConfigured: boolean;
    dataProxyCredentials: {
      apiFootball: boolean;
      footballData: boolean;
      odds: boolean;
    };
    footballDataCredentialConfigured: boolean;
    freeFeedBackupConfigured: boolean;
    publicFreeFeedReadBack: DataProviderPublicFeedProof;
    dataProxyHealthProof: {
      checked: boolean;
      ok: boolean;
      service: string;
      apiFootballServerKey: boolean;
      footballDataServerToken: boolean;
      oddsApiServerKey: boolean;
    };
    fixtureSignalRows: DataProviderFixtureSignalRow[];
    apiFootballEnrichmentLimit: string;
    scoutLimit: string;
    scoutTargets: string;
  };
  acceptance: {
    apiFootballKey: boolean;
    footballDataBackup: boolean;
    publicFreeFeedReadBack: boolean;
    fixtureTargets: boolean;
    fixtureSignalMatrix: boolean;
    oddsProvider: boolean;
    dataProxyHttps: boolean;
    enrichmentLimitReady: boolean;
    scoutWindowReady: boolean;
    outputEnvKeys: string[];
  };
};

const env = (values: DataProviderReadinessEnv, key: string) => values[key]?.trim() ?? "";
const has = (values: DataProviderReadinessEnv, key: string) => env(values, key).length > 0;
const flagEnabled = (values: DataProviderReadinessEnv, key: string) =>
  ["1", "true", "yes", "on"].includes(env(values, key).toLowerCase());
const providerCapabilityReady = (health: DataProviderProxyHealthProof | undefined, source: string) =>
  health?.providerCapabilities.some((capability) => capability.source === source && capability.serverCredentialPresent === true) === true;

const currentSeason = () => String(new Date().getUTCFullYear());
export const openFootballWorldCupUrl = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
export const theSportsDbSeasonUrl = (values: DataProviderReadinessEnv) => {
  const key = env(values, "VITE_THESPORTSDB_KEY") || "123";
  const league = env(values, "VITE_THESPORTSDB_LEAGUE_ID") || "4429";
  const season = env(values, "VITE_THESPORTSDB_SEASON") || env(values, "KICKOFF_DATA_SEASON") || currentSeason();
  return `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsseason.php?id=${encodeURIComponent(league)}&s=${encodeURIComponent(season)}`;
};
export const theSportsDbTableUrl = (values: DataProviderReadinessEnv) => {
  const key = env(values, "VITE_THESPORTSDB_KEY") || "123";
  const league = env(values, "VITE_THESPORTSDB_LEAGUE_ID") || "4429";
  const season = env(values, "VITE_THESPORTSDB_SEASON") || env(values, "KICKOFF_DATA_SEASON") || currentSeason();
  return `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/lookuptable.php?l=${encodeURIComponent(league)}&s=${encodeURIComponent(season)}`;
};

export const emptyPublicFeedProof = (values: DataProviderReadinessEnv = {}): DataProviderPublicFeedProof => ({
  checkedAt: "",
  openfootball: {
    url: openFootballWorldCupUrl,
    ok: false,
    status: 0,
    rowCount: 0,
    detail: "not checked",
  },
  theSportsDb: {
    url: theSportsDbSeasonUrl(values),
    ok: false,
    status: 0,
    rowCount: 0,
    detail: "not checked",
  },
  theSportsDbTable: {
    url: theSportsDbTableUrl(values),
    ok: false,
    status: 0,
    rowCount: 0,
    detail: "not checked",
  },
});

export const normalizePublicFeedProof = (
  values: DataProviderReadinessEnv,
  proof?: Partial<DataProviderPublicFeedProof>,
): DataProviderPublicFeedProof => {
  const fallback = emptyPublicFeedProof(values);
  return {
    checkedAt: proof?.checkedAt ?? fallback.checkedAt,
    openfootball: {
      ...fallback.openfootball,
      ...proof?.openfootball,
    },
    theSportsDb: {
      ...fallback.theSportsDb,
      ...proof?.theSportsDb,
    },
    theSportsDbTable: {
      ...fallback.theSportsDbTable,
      ...proof?.theSportsDbTable,
    },
  };
};

export const publicFeedProofReady = (proof: DataProviderPublicFeedProof) =>
  Boolean(
    proof.checkedAt &&
      proof.openfootball.ok &&
      proof.openfootball.rowCount > 0 &&
      proof.theSportsDb.ok &&
      proof.theSportsDb.rowCount > 0 &&
      proof.theSportsDbTable.ok &&
      proof.theSportsDbTable.rowCount > 0,
  );

const normalizeProxyHealthProof = (health: unknown, status = 200): DataProviderProxyHealthProof | undefined => {
  const body = health && typeof health === "object" ? (health as Record<string, unknown>) : undefined;
  if (!body || status < 200 || status >= 300 || body.ok !== true || body.service !== "kickoff-data-proxy") return undefined;
  return {
    ok: true,
    service: "kickoff-data-proxy",
    apiFootballServerKey: body.apiFootballServerKey === true,
    footballDataServerToken: body.footballDataServerToken === true,
    oddsApiServerKey: body.oddsApiServerKey === true,
    allowedRoutes: Array.isArray(body.allowedRoutes) ? body.allowedRoutes.map(String) : [],
    providerCapabilities: Array.isArray(body.providerCapabilities)
      ? body.providerCapabilities.map((capability) => ({
          source: String((capability as Record<string, unknown>)?.source ?? ""),
          serverCredentialPresent: (capability as Record<string, unknown>)?.serverCredentialPresent === true,
          routes: Array.isArray((capability as Record<string, unknown>)?.routes)
            ? ((capability as Record<string, unknown>).routes as unknown[]).map(String)
            : [],
        }))
      : [],
  };
};
const serverOrHealthReady = (
  values: DataProviderReadinessEnv,
  keys: string[],
  healthFlag: string,
  health: DataProviderProxyHealthProof | undefined,
  healthKey: keyof Pick<DataProviderProxyHealthProof, "apiFootballServerKey" | "footballDataServerToken" | "oddsApiServerKey">,
  capabilitySource: string,
) =>
  keys.some((key) => has(values, key)) ||
  flagEnabled(values, healthFlag) ||
  health?.[healthKey] === true ||
  providerCapabilityReady(health, capabilitySource);
export const apiFootballProxyCredentialReady = (values: DataProviderReadinessEnv) =>
  serverOrHealthReady(
    values,
    ["APIFOOTBALL_KEY", "API_FOOTBALL_KEY"],
    "KICKOFF_DATA_PROXY_API_FOOTBALL_READY",
    undefined,
    "apiFootballServerKey",
    "api-football",
  );
export const footballDataProxyCredentialReady = (values: DataProviderReadinessEnv) =>
  serverOrHealthReady(
    values,
    ["FOOTBALL_DATA_TOKEN", "FOOTBALL_DATA_ORG_TOKEN"],
    "KICKOFF_DATA_PROXY_FOOTBALL_DATA_READY",
    undefined,
    "footballDataServerToken",
    "football-data",
  );
export const oddsProxyCredentialReady = (values: DataProviderReadinessEnv) =>
  serverOrHealthReady(
    values,
    ["ODDS_API_KEY", "THE_ODDS_API_KEY"],
    "KICKOFF_DATA_PROXY_ODDS_READY",
    undefined,
    "oddsApiServerKey",
    "odds-api",
  );
const isCloudflarePagesHost = (urlText: string) => {
  try {
    const url = new URL(urlText);
    return url.protocol === "https:" && (url.hostname === "pages.dev" || url.hostname.endsWith(".pages.dev"));
  } catch {
    return false;
  }
};
const isGitHubPagesHost = (urlText: string) => {
  try {
    return new URL(urlText).hostname.endsWith("github.io");
  } catch {
    return false;
  }
};
const cloudflarePagesFunctionsAvailable = (values: DataProviderReadinessEnv) =>
  flagEnabled(values, "CF_PAGES") || isCloudflarePagesHost(env(values, "CF_PAGES_URL") || env(values, "VITE_PUBLIC_APP_URL"));
const sameOriginPublicAppUrl = (values: DataProviderReadinessEnv) => {
  const publicAppUrl = env(values, "VITE_PUBLIC_APP_URL");
  const pagesUrl = env(values, "CF_PAGES_URL");
  if (pagesUrl && flagEnabled(values, "CF_PAGES") && (!publicAppUrl || isGitHubPagesHost(publicAppUrl))) return pagesUrl;
  return publicAppUrl || pagesUrl;
};
export const sameOriginDataProxySelected = (values: DataProviderReadinessEnv) => {
  if (has(values, "VITE_DATA_PROXY_URL")) return false;
  if (has(values, "VITE_DATA_PROXY_SAME_ORIGIN")) return flagEnabled(values, "VITE_DATA_PROXY_SAME_ORIGIN");
  return cloudflarePagesFunctionsAvailable(values);
};
const listEnv = (values: DataProviderReadinessEnv, key: string) =>
  env(values, key)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const positiveInteger = (value: string) => Number.isInteger(Number(value)) && Number(value) > 0;
const requiredFixtureSignals = ["lineups", "injuries", "odds", "standings"] as const;
const requiredSignalRows = (signal: (typeof requiredFixtureSignals)[number]) =>
  signal === "standings" || signal === "lineups" ? 2 : 1;
const requiredSignalRowMap = Object.fromEntries(
  requiredFixtureSignals.map((signal) => [signal, requiredSignalRows(signal)]),
) as Record<DataProviderFixtureSignalKey, number>;

export const dataProxyUrlProblem = (value: string, label = "VITE_DATA_PROXY_URL") => {
  const configured = value.trim();
  if (!configured) return label;
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.hostname.endsWith(".localhost")
    ) {
      return `${label} must be a deployed HTTPS /proxy endpoint`;
    }
    if (!/\/proxy\/?$/.test(url.pathname)) {
      return `${label} must end with /proxy`;
    }
    return "";
  } catch {
    return `${label} must be a valid deployed HTTPS /proxy endpoint`;
  }
};

const sameOriginDataProxyUrl = (values: DataProviderReadinessEnv) => {
  if (!sameOriginDataProxySelected(values)) return "";
  const publicAppUrl = sameOriginPublicAppUrl(values);
  if (!publicAppUrl) return "";
  try {
    const url = new URL(publicAppUrl);
    url.pathname = SAME_ORIGIN_DATA_PROXY_PATH;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};

export const resolvedDataProviderProxyUrl = (values: DataProviderReadinessEnv) =>
  env(values, "VITE_DATA_PROXY_URL") || sameOriginDataProxyUrl(values);

export const resolvedDataProviderProxyHealthUrl = (values: DataProviderReadinessEnv) => {
  const proxyUrl = resolvedDataProviderProxyUrl(values);
  if (!proxyUrl) return "";
  try {
    const url = new URL(proxyUrl, "http://localhost/");
    url.pathname =
      sameOriginDataProxySelected(values)
        ? url.pathname.replace(/\/proxy\/?$/, "/health")
        : `${url.pathname.replace(/\/$/, "")}/health`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};

export const dataProviderFixtureTargets = (values: DataProviderReadinessEnv) => {
  const targets = listEnv(values, "KICKOFF_VERIFY_FIXTURE_IDS");
  return [...new Set(targets)];
};

const requiredFixtureTargetCount = (values: DataProviderReadinessEnv) =>
  Math.max(1, Number(env(values, "KICKOFF_DATA_SCOUT_TARGETS") || 3) || 3);

const fixtureTargetProblem = (values: DataProviderReadinessEnv) => {
  const targets = dataProviderFixtureTargets(values);
  const requiredCount = requiredFixtureTargetCount(values);
  if (targets.length >= requiredCount) return "";
  if (targets.length > 0) return `KICKOFF_VERIFY_FIXTURE_IDS needs ${requiredCount} fixture targets; got ${targets.length}`;
  if (has(values, "KICKOFF_VERIFY_FIXTURE_ID")) {
    return `KICKOFF_VERIFY_FIXTURE_IDS needs ${requiredCount} fixture targets; legacy KICKOFF_VERIFY_FIXTURE_ID is not enough`;
  }
  return "missing";
};

const parseFixtureSignalMatrix = (matrix: string) =>
  matrix
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
      ) as Partial<Record<(typeof requiredFixtureSignals)[number], number>>;
      return { fixtureId: fixtureId.trim(), signals };
    });

export const buildDataProviderFixtureSignalRows = (
  values: DataProviderReadinessEnv,
): DataProviderFixtureSignalRow[] => {
  const fixtureIds = dataProviderFixtureTargets(values);
  const matrix = env(values, "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX");
  const rows = parseFixtureSignalMatrix(matrix);
  return fixtureIds.map((fixtureId) => {
    const row = rows.find((item) => item.fixtureId === fixtureId);
    const signalRows = Object.fromEntries(
      requiredFixtureSignals.map((signal) => [signal, Math.max(0, Number(row?.signals[signal]) || 0)]),
    ) as Record<DataProviderFixtureSignalKey, number>;
    const missingSignals = requiredFixtureSignals.filter((signal) => signalRows[signal] < requiredSignalRows(signal));
    const ready = Boolean(row) && missingSignals.length === 0;
    return {
      fixtureId,
      ready,
      rows: signalRows,
      requiredRows: requiredSignalRowMap,
      missingSignals,
      detail: row
        ? ready
          ? `${fixtureId} has lineups, injuries, odds and standings rows`
          : `${fixtureId} missing ${missingSignals.join(", ")} rows`
        : `KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing ${fixtureId}`,
    };
  });
};

const fixtureSignalMatrixProblems = (values: DataProviderReadinessEnv) => {
  const matrix = env(values, "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX");
  if (!matrix) return ["KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing"];
  return buildDataProviderFixtureSignalRows(values).flatMap((row) =>
    row.ready
      ? []
      : row.detail.startsWith("KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing")
        ? [`KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing ${row.fixtureId}`]
        : row.missingSignals.length > 0
        ? row.missingSignals.map((signal) => `${row.fixtureId} missing ${signal} rows in KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX`)
        : [`KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing ${row.fixtureId}`],
  );
};

const apiFootballProxyCredentialReadyWithHealth = (
  values: DataProviderReadinessEnv,
  health: DataProviderProxyHealthProof | undefined,
) =>
  serverOrHealthReady(
    values,
    ["APIFOOTBALL_KEY", "API_FOOTBALL_KEY"],
    "KICKOFF_DATA_PROXY_API_FOOTBALL_READY",
    health,
    "apiFootballServerKey",
    "api-football",
  );

const footballDataProxyCredentialReadyWithHealth = (
  values: DataProviderReadinessEnv,
  health: DataProviderProxyHealthProof | undefined,
) =>
  serverOrHealthReady(
    values,
    ["FOOTBALL_DATA_TOKEN", "FOOTBALL_DATA_ORG_TOKEN"],
    "KICKOFF_DATA_PROXY_FOOTBALL_DATA_READY",
    health,
    "footballDataServerToken",
    "football-data",
  );

const oddsProxyCredentialReadyWithHealth = (
  values: DataProviderReadinessEnv,
  health: DataProviderProxyHealthProof | undefined,
) =>
  serverOrHealthReady(
    values,
    ["ODDS_API_KEY", "THE_ODDS_API_KEY"],
    "KICKOFF_DATA_PROXY_ODDS_READY",
    health,
    "oddsApiServerKey",
    "odds-api",
  );

const publicFreeFeedBackupConfigured = (values: DataProviderReadinessEnv) =>
  !flagEnabled(values, "KICKOFF_DISABLE_PUBLIC_FREE_FEEDS");

export const buildDataProviderReadinessReport = (
  values: DataProviderReadinessEnv,
  options: { health?: unknown; healthStatus?: number; publicFeedProof?: DataProviderPublicFeedProof } = {},
): DataProviderReadinessReport => {
  const healthProof = normalizeProxyHealthProof(options.health, options.healthStatus ?? 200);
  const publicFeedProof = normalizePublicFeedProof(values, options.publicFeedProof);
  const fixtureTargets = dataProviderFixtureTargets(values);
  const targetProblem = fixtureTargetProblem(values);
  const signalMatrixProblems = targetProblem ? [] : fixtureSignalMatrixProblems(values);
  const dataProxyUrl = resolvedDataProviderProxyUrl(values);
  const sameOriginDataProxyProblem =
    sameOriginDataProxySelected(values) && isGitHubPagesHost(sameOriginPublicAppUrl(values))
      ? "VITE_DATA_PROXY_SAME_ORIGIN cannot use same-origin backend routes on GitHub Pages; deploy Cloudflare Pages Functions or set an external Worker URL."
      : "";
  const dataProxyProblem = sameOriginDataProxyProblem || dataProxyUrlProblem(dataProxyUrl);
  const apiFootballConfigured =
    has(values, "APIFOOTBALL_KEY") ||
    has(values, "API_FOOTBALL_KEY") ||
    has(values, "VITE_APIFOOTBALL_KEY") ||
    Boolean(dataProxyUrl && !dataProxyProblem && apiFootballProxyCredentialReadyWithHealth(values, healthProof));
  const footballDataBackupConfigured =
    has(values, "FOOTBALL_DATA_TOKEN") ||
    has(values, "FOOTBALL_DATA_ORG_TOKEN") ||
    has(values, "VITE_FOOTBALL_DATA_TOKEN") ||
    Boolean(dataProxyUrl && !dataProxyProblem && footballDataProxyCredentialReadyWithHealth(values, healthProof));
  const stableScheduleBackupConfigured = footballDataBackupConfigured || publicFreeFeedBackupConfigured(values);
  const publicFeedReadBackReady =
    !publicFreeFeedBackupConfigured(values) || !options.publicFeedProof ? true : publicFeedProofReady(publicFeedProof);
  const oddsApiConfigured =
    has(values, "VITE_ODDS_API_SPORT_KEY") &&
    (has(values, "ODDS_API_KEY") ||
      has(values, "THE_ODDS_API_KEY") ||
      has(values, "VITE_ODDS_API_KEY") ||
      Boolean(dataProxyUrl && !dataProxyProblem && oddsProxyCredentialReadyWithHealth(values, healthProof)));
  const apiFootballLimit = env(values, "VITE_APIFOOTBALL_ENRICHMENT_LIMIT") || "12";
  const scoutLimit = env(values, "KICKOFF_DATA_SCOUT_LIMIT") || "12";
  const scoutTargets = env(values, "KICKOFF_DATA_SCOUT_TARGETS") || "3";
  const scoutCandidateIds = listEnv(values, "KICKOFF_DATA_SCOUT_FIXTURE_IDS");
  const scoutWindowReady =
    (positiveInteger(scoutLimit) && positiveInteger(scoutTargets) && Number(scoutTargets) <= Number(scoutLimit)) ||
    (positiveInteger(scoutTargets) && scoutCandidateIds.length >= Number(scoutTargets));
  const checks: DataProviderReadinessCheck[] = [
    {
      id: "api-football-key",
      label: "API-Football key",
      passed: apiFootballConfigured,
      detail: has(values, "APIFOOTBALL_KEY") || has(values, "API_FOOTBALL_KEY")
        ? "server-side key configured"
        : has(values, "VITE_APIFOOTBALL_KEY")
        ? "browser key configured"
        : dataProxyUrl && !dataProxyProblem && apiFootballProxyCredentialReadyWithHealth(values, healthProof)
          ? healthProof?.apiFootballServerKey || providerCapabilityReady(healthProof, "api-football")
            ? "server-side key via data proxy health"
            : "server-side key via data proxy"
          : "missing",
      action: "Set VITE_APIFOOTBALL_KEY for direct browser calls, or deploy the data proxy with APIFOOTBALL_KEY so lineups, injuries, standings and API-Football odds can be read back without exposing the key.",
    },
    {
      id: "football-data-backup",
      label: "Stable schedule and score backup",
      passed: stableScheduleBackupConfigured,
      detail: has(values, "FOOTBALL_DATA_TOKEN") || has(values, "FOOTBALL_DATA_ORG_TOKEN")
        ? "server-side token configured"
        : has(values, "VITE_FOOTBALL_DATA_TOKEN")
        ? "browser diagnostics token configured"
        : dataProxyUrl && !dataProxyProblem && footballDataProxyCredentialReadyWithHealth(values, healthProof)
          ? healthProof?.footballDataServerToken || providerCapabilityReady(healthProof, "football-data")
            ? "server-side token via data proxy health"
            : "server-side token via data proxy"
          : publicFreeFeedBackupConfigured(values)
            ? options.publicFeedProof
              ? publicFeedReadBackReady
                ? `openfootball ${publicFeedProof.openfootball.rowCount} rows + TheSportsDB ${publicFeedProof.theSportsDb.rowCount} events + ${publicFeedProof.theSportsDbTable.rowCount} table rows`
                : `public feed read-back incomplete: ${publicFeedProof.openfootball.detail}; ${publicFeedProof.theSportsDb.detail}; ${publicFeedProof.theSportsDbTable.detail}`
              : "openfootball/TheSportsDB public feeds configured"
            : "missing",
      action:
        "Keep openfootball/TheSportsDB public feeds reachable for no-key schedule and score continuity; add FOOTBALL_DATA_TOKEN when you want a second server-side matches/standings backup.",
    },
    {
      id: "fixture-targets",
      label: "Production fixture targets",
      passed: !targetProblem,
      detail: targetProblem || `${fixtureTargets.length} target fixtures`,
      action: "Run bun run scout:data-targets or set KICKOFF_VERIFY_FIXTURE_IDS to fixtures that return lineups, injuries, odds and standings.",
    },
    {
      id: "fixture-signal-matrix",
      label: "Fixture signal matrix",
      passed: !targetProblem && signalMatrixProblems.length === 0,
      detail: targetProblem
        ? "waiting for production fixture targets"
        : signalMatrixProblems.length > 0
          ? signalMatrixProblems.join("; ")
          : `${fixtureTargets.length}/${fixtureTargets.length} fixtures have lineups, injuries, odds and standings rows`,
      action: "Run bun run scout:data-targets so KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX covers every target fixture with positive lineups, injuries, odds and standings rows.",
    },
    {
      id: "odds-provider",
      label: "Odds provider",
      passed: apiFootballConfigured || oddsApiConfigured,
      detail: oddsApiConfigured
        ? dataProxyUrl && !has(values, "VITE_ODDS_API_KEY")
          ? healthProof?.oddsApiServerKey || providerCapabilityReady(healthProof, "odds-api")
            ? "The Odds API routed through data proxy health"
            : "The Odds API routed through data proxy"
          : "The Odds API configured"
        : apiFootballConfigured
          ? "API-Football odds route configured"
          : "missing",
      action:
        "Configure API-Football odds through VITE_APIFOOTBALL_KEY or the data proxy APIFOOTBALL_KEY, or set VITE_ODDS_API_SPORT_KEY with server-side ODDS_API_KEY on the data proxy.",
    },
    {
      id: "data-proxy",
      label: "Static hosting data proxy",
      passed: !dataProxyProblem,
      detail: dataProxyProblem || `${dataProxyUrl}${has(values, "VITE_DATA_PROXY_URL") ? "" : " (same-origin)"}`,
      action:
        "Deploy server/data-proxy-worker.mjs as a Worker URL, or deploy the bundled Pages function and set VITE_DATA_PROXY_SAME_ORIGIN=1.",
    },
    {
      id: "api-football-enrichment-limit",
      label: "API-Football enrichment limit",
      passed: positiveInteger(apiFootballLimit) && Number(apiFootballLimit) <= 50,
      detail: apiFootballLimit,
      action: "Set VITE_APIFOOTBALL_ENRICHMENT_LIMIT to a positive value no larger than 50 to protect quota.",
    },
    {
      id: "scout-search-window",
      label: "Data scout search window",
      passed: scoutWindowReady,
      detail: scoutCandidateIds.length
        ? `explicit candidates ${scoutCandidateIds.length}, targets ${scoutTargets}`
        : `limit ${scoutLimit}, targets ${scoutTargets}`,
      action:
        "Set KICKOFF_DATA_SCOUT_LIMIT and KICKOFF_DATA_SCOUT_TARGETS, or provide KICKOFF_DATA_SCOUT_FIXTURE_IDS with enough candidate fixtures.",
    },
  ];
  const blockers = checks.filter((check) => !check.passed);
  return {
    ready: blockers.length === 0,
    passed: checks.length - blockers.length,
    total: checks.length,
    checks,
    blockers,
  };
};

const checkPassed = (report: DataProviderReadinessReport, id: string) =>
  report.checks.find((check) => check.id === id)?.passed === true;

export const buildDataProviderReadinessArtifact = (
  report: DataProviderReadinessReport,
  values: DataProviderReadinessEnv,
  options: {
    envFiles?: string[];
    generatedAt?: string;
    health?: unknown;
    healthStatus?: number;
    publicFeedProof?: DataProviderPublicFeedProof;
  } = {},
): DataProviderReadinessArtifact => {
  const healthProof = normalizeProxyHealthProof(options.health, options.healthStatus ?? 200);
  const publicFeedProof = normalizePublicFeedProof(values, options.publicFeedProof);
  const fixtureIds = dataProviderFixtureTargets(values);
  const dataProxyUrl = resolvedDataProviderProxyUrl(values);
  const dataProxyHealthUrl = resolvedDataProviderProxyHealthUrl(values);
  const dataProxyProblem =
    (sameOriginDataProxySelected(values) && isGitHubPagesHost(sameOriginPublicAppUrl(values))
      ? "GitHub Pages cannot serve same-origin data proxy Functions"
      : "") || dataProxyUrlProblem(dataProxyUrl);
  const fixtureSignalRows = buildDataProviderFixtureSignalRows(values);
  const apiFootballConfigured =
    has(values, "APIFOOTBALL_KEY") ||
    has(values, "API_FOOTBALL_KEY") ||
    has(values, "VITE_APIFOOTBALL_KEY") ||
    Boolean(dataProxyUrl && !dataProxyProblem && apiFootballProxyCredentialReadyWithHealth(values, healthProof));
  const footballDataBackupConfigured =
    has(values, "FOOTBALL_DATA_TOKEN") ||
    has(values, "FOOTBALL_DATA_ORG_TOKEN") ||
    has(values, "VITE_FOOTBALL_DATA_TOKEN") ||
    Boolean(dataProxyUrl && !dataProxyProblem && footballDataProxyCredentialReadyWithHealth(values, healthProof));
  const freeFeedBackupConfigured = publicFreeFeedBackupConfigured(values);
  const publicFeedReadBackReady = freeFeedBackupConfigured ? publicFeedProofReady(publicFeedProof) : true;
  const stableScheduleBackupConfigured = footballDataBackupConfigured || freeFeedBackupConfigured;
  const oddsProviderConfigured =
    has(values, "VITE_ODDS_API_SPORT_KEY") &&
    (has(values, "ODDS_API_KEY") ||
      has(values, "THE_ODDS_API_KEY") ||
      has(values, "VITE_ODDS_API_KEY") ||
      Boolean(dataProxyUrl && !dataProxyProblem && oddsProxyCredentialReadyWithHealth(values, healthProof)));
  const requiredCount = requiredFixtureTargetCount(values);

  return {
    ...report,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    envFiles: options.envFiles ?? [],
    artifactVersion: 1,
    targets: {
      fixtureIds,
      requiredFixtureCount: requiredCount,
      fixtureSignalMatrix: env(values, "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"),
      dataProxyUrl,
      dataProxyHealthUrl,
      apiFootballConfigured,
      footballDataBackupConfigured,
      oddsProviderConfigured,
      dataProxyCredentials: {
        apiFootball: apiFootballProxyCredentialReadyWithHealth(values, healthProof),
        footballData: footballDataProxyCredentialReadyWithHealth(values, healthProof),
        odds: oddsProxyCredentialReadyWithHealth(values, healthProof),
      },
      footballDataCredentialConfigured: footballDataBackupConfigured,
      freeFeedBackupConfigured,
      publicFreeFeedReadBack: publicFeedProof,
      dataProxyHealthProof: {
        checked: Boolean(options.health),
        ok: Boolean(healthProof),
        service: healthProof?.service ?? "",
        apiFootballServerKey: healthProof?.apiFootballServerKey ?? false,
        footballDataServerToken: healthProof?.footballDataServerToken ?? false,
        oddsApiServerKey: healthProof?.oddsApiServerKey ?? false,
      },
      fixtureSignalRows,
      apiFootballEnrichmentLimit: env(values, "VITE_APIFOOTBALL_ENRICHMENT_LIMIT") || "12",
      scoutLimit: env(values, "KICKOFF_DATA_SCOUT_LIMIT") || "12",
      scoutTargets: env(values, "KICKOFF_DATA_SCOUT_TARGETS") || "3",
    },
    acceptance: {
      apiFootballKey: checkPassed(report, "api-football-key"),
      footballDataBackup: stableScheduleBackupConfigured && checkPassed(report, "football-data-backup"),
      publicFreeFeedReadBack: publicFeedReadBackReady,
      fixtureTargets: checkPassed(report, "fixture-targets"),
      fixtureSignalMatrix: checkPassed(report, "fixture-signal-matrix"),
      oddsProvider: checkPassed(report, "odds-provider"),
      dataProxyHttps: checkPassed(report, "data-proxy"),
      enrichmentLimitReady: checkPassed(report, "api-football-enrichment-limit"),
      scoutWindowReady: checkPassed(report, "scout-search-window"),
      outputEnvKeys: [
        "APIFOOTBALL_KEY",
        "VITE_APIFOOTBALL_KEY",
        "FOOTBALL_DATA_TOKEN",
        "FOOTBALL_DATA_ORG_TOKEN",
        "VITE_FOOTBALL_DATA_TOKEN",
        "VITE_THESPORTSDB_KEY",
        "VITE_THESPORTSDB_LEAGUE_ID",
        "VITE_THESPORTSDB_SEASON",
        "KICKOFF_DISABLE_PUBLIC_FREE_FEEDS",
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
  };
};
