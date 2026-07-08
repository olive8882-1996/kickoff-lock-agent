import { evaluateApiFootballEndpointRows } from "./apiFootballEndpointEvidence";
import { resolvedDataProviderProxyUrl } from "./dataProviderReadiness";
import { buildProductionVerifyEnv } from "./productionEvidence";

export type DataTargetScoutEnv = Record<string, string | undefined>;

export type DataTargetEndpointEvidence = {
  key: "lineups" | "injuries" | "odds" | "standings";
  rows: number;
  requiredRows: number;
  status: "passed" | "failed";
  detail: string;
  fixtureScoped: boolean;
  teamScoped: boolean;
  sampleIds: string[];
  url: string;
};

export type DataTargetCandidate = {
  fixtureId: string;
  label: string;
  teamIds: string[];
  teamNames: string[];
  kickoffAt?: string;
  status?: string;
  score: number;
  endpoints: DataTargetEndpointEvidence[];
  missingEndpoints: Array<DataTargetEndpointEvidence["key"]>;
  signalMatrix: string;
  ready: boolean;
};

export type DataTargetScoutGap = {
  fixtureId: string;
  label: string;
  missingEndpoints: Array<DataTargetEndpointEvidence["key"]>;
  signalMatrix: string;
  action: string;
};

export type DataTargetScoutReport = {
  ready: boolean;
  fixtureId?: string;
  fixtureIds: string[];
  requiredSignals: number;
  requiredFixtureCount: number;
  checkedFixtures: number;
  candidates: DataTargetCandidate[];
  gaps: DataTargetScoutGap[];
  signalMatrix: string;
  verifyEnv: string;
  nextAction: string;
};

export type DataTargetScoutFixtureSignal = {
  fixtureId: string;
  ready: boolean;
  rows: Record<DataTargetEndpointEvidence["key"], number>;
  requiredRows: Record<DataTargetEndpointEvidence["key"], number>;
  missingEndpoints: Array<DataTargetEndpointEvidence["key"]>;
  detail: string;
};

export type DataTargetEndpointReadBackCommand = {
  id: string;
  fixtureId: string;
  key: DataTargetEndpointEvidence["key"];
  label: string;
  url: string;
  command: string;
  ready: boolean;
  rows: number;
  sampleIds: string[];
  responseExpectation: {
    responseType: "json";
    endpoint: DataTargetEndpointEvidence["key"];
    expectedFixtureId: string;
    expectedTeamIds: string[];
    expectedTeamNames: string[];
    minRows: number;
    fixtureScoped: boolean;
    teamScoped: boolean;
  };
};

export type DataTargetScoutArtifact = DataTargetScoutReport & {
  generatedAt: string;
  envFiles: string[];
  artifactVersion: 1;
  acceptance: {
    readyFixtureCount: number;
    requiredFixtureCount: number;
    completeSignalMatrix: boolean;
    fixtureSignals: DataTargetScoutFixtureSignal[];
    endpointReadBackCommands: DataTargetEndpointReadBackCommand[];
    gaps: DataTargetScoutGap[];
    outputEnvKeys: string[];
  };
};

type FetchLike = typeof fetch;

const env = (values: DataTargetScoutEnv, key: string) => values[key]?.trim() ?? "";
const apiFootballKey = (values: DataTargetScoutEnv) =>
  env(values, "APIFOOTBALL_KEY") || env(values, "API_FOOTBALL_KEY") || env(values, "VITE_APIFOOTBALL_KEY");
const listEnv = (values: DataTargetScoutEnv, key: string) =>
  env(values, key)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
const apiFootballUrl = (path: string) => `https://v3.football.api-sports.io${path}`;
const apiFootballProxyUrl = (values: DataTargetScoutEnv) => resolvedDataProviderProxyUrl(values);
const canReadApiFootball = (values: DataTargetScoutEnv) => Boolean(apiFootballKey(values) || apiFootballProxyUrl(values));
const requestFor = (values: DataTargetScoutEnv, path: string) => {
  const targetUrl = apiFootballUrl(path);
  const proxyUrl = apiFootballProxyUrl(values);
  if (proxyUrl) {
    const proxied = new URL(proxyUrl);
    proxied.searchParams.set("url", targetUrl);
    proxied.searchParams.set("source", "api-football");
    return { url: proxied.toString(), init: undefined };
  }
  return { url: targetUrl, init: { headers: { "x-apisports-key": apiFootballKey(values) } } };
};

const readJson = async (fetcher: FetchLike, url: string, init?: RequestInit) => {
  const response = await fetcher(url, init);
  const text = await response.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { response, body, text };
};

const fixtureLabel = (row: any) => {
  const home = row.teams?.home?.name ?? "Home";
  const away = row.teams?.away?.name ?? "Away";
  return `${home} vs ${away}`;
};

const fixtureTeamTargets = (row: any) => {
  const homeId = row.teams?.home?.id;
  const awayId = row.teams?.away?.id;
  const ids = [homeId, awayId].map((id) => String(id ?? "").trim()).filter(Boolean);
  const names = [row.teams?.home?.name, row.teams?.away?.name].map((name) => String(name ?? "").trim()).filter(Boolean);
  return { ids, names };
};

const fixtureRows = async (values: DataTargetScoutEnv, fetcher: FetchLike) => {
  const fixtureIds = [...new Set(listEnv(values, "KICKOFF_DATA_SCOUT_FIXTURE_IDS"))];
  if (fixtureIds.length > 0) {
    const params = new URLSearchParams({ ids: fixtureIds.join("-") });
    const request = requestFor(values, `/fixtures?${params.toString()}`);
    const { response, body } = await readJson(fetcher, request.url, request.init);
    if (!response.ok) throw new Error(`API-Football fixtures returned HTTP ${response.status}`);
    return Array.isArray(body?.response) ? body.response : [];
  }
  const season = env(values, "KICKOFF_DATA_SCOUT_SEASON") || String(new Date().getUTCFullYear());
  const league = env(values, "KICKOFF_DATA_SCOUT_LEAGUE_ID") || "1";
  const params = new URLSearchParams({ league, season });
  const next = env(values, "KICKOFF_DATA_SCOUT_NEXT");
  if (next) params.set("next", next);
  const request = requestFor(values, `/fixtures?${params.toString()}`);
  const { response, body } = await readJson(fetcher, request.url, request.init);
  if (!response.ok) throw new Error(`API-Football fixtures returned HTTP ${response.status}`);
  return Array.isArray(body?.response) ? body.response : [];
};

const standingsRows = (body: any) => {
  const leagues = Array.isArray(body?.response) ? body.response : [];
  return leagues.flatMap((item: any) => {
    const groups = Array.isArray(item?.league?.standings)
      ? item.league.standings
      : Array.isArray(item?.standings)
        ? item.standings
        : [];
    return groups.flatMap((groupRows: any) => (Array.isArray(groupRows) ? groupRows : [groupRows]));
  });
};

const endpointEvidence = async (
  values: DataTargetScoutEnv,
  fetcher: FetchLike,
  fixtureId: string,
  key: DataTargetEndpointEvidence["key"],
  teams: { ids: string[]; names: string[] } = { ids: [], names: [] },
): Promise<DataTargetEndpointEvidence> => {
  const path =
    key === "lineups"
      ? `/fixtures/lineups?fixture=${encodeURIComponent(fixtureId)}`
      : key === "injuries"
        ? `/injuries?fixture=${encodeURIComponent(fixtureId)}`
        : key === "standings"
          ? `/standings?league=${encodeURIComponent(env(values, "KICKOFF_DATA_SCOUT_LEAGUE_ID") || "1")}&season=${encodeURIComponent(env(values, "KICKOFF_DATA_SCOUT_SEASON") || String(new Date().getUTCFullYear()))}`
          : `/odds?fixture=${encodeURIComponent(fixtureId)}`;
  const request = requestFor(values, path);
  try {
    const { response, body } = await readJson(fetcher, request.url, request.init);
    const rows = key === "standings" ? standingsRows(body) : Array.isArray(body?.response) ? body.response : [];
    const standingsOptions = (teams?.ids.length ?? 0) >= 2
      ? { standingTeamIds: teams?.ids ?? [] }
      : { standingTeamNames: teams?.names ?? [] };
    const requireFixtureIdentity = key === "injuries" || key === "odds";
    const evaluation = evaluateApiFootballEndpointRows(
      key,
      rows,
      key === "standings"
        ? standingsOptions
        : { fixtureId, requireFixtureIdentity, teamIds: teams.ids, teamNames: teams.names },
    );
    const requiredRows = requiredSignalRows(key);
    return {
      key,
      requiredRows,
      rows: response.ok ? evaluation.validRows.length : 0,
      status: response.ok && evaluation.passed ? "passed" : "failed",
      detail: response.ok ? evaluation.detail : `HTTP ${response.status}`,
      fixtureScoped:
        key === "standings" ||
        !fixtureId ||
        ((evaluation.fixtureMismatchCount ?? 0) === 0 && (evaluation.missingFixtureIdentityCount ?? 0) === 0),
      teamScoped:
        key === "odds" ||
        (((evaluation.teamMismatchCount ?? 0) === 0) &&
          (evaluation.missingTeamTargets?.length ?? 0) === 0 &&
          (evaluation.missingStandingTargets?.length ?? 0) === 0),
      sampleIds: response.ok ? evaluation.sampleIds : [],
      url: request.url,
    };
  } catch {
    return {
      key,
      requiredRows: requiredSignalRows(key),
      rows: 0,
      status: "failed",
      detail: "request failed",
      fixtureScoped: false,
      teamScoped: false,
      sampleIds: [],
      url: request.url,
    };
  }
};

const candidateScore = (endpoints: DataTargetEndpointEvidence[]) =>
  endpoints.reduce((score, item) => score + (item.rows > 0 ? 10 : 0) + Math.min(item.rows, 10), 0);

const signalMatrixFor = (fixtureId: string, endpoints: DataTargetEndpointEvidence[]) =>
  `${fixtureId}:${endpoints.map((endpoint) => `${endpoint.key}=${endpoint.rows}`).join("|")}`;

const missingEndpointsFor = (endpoints: DataTargetEndpointEvidence[]) =>
  (["lineups", "injuries", "odds", "standings"] as const).filter(
    (key) => !endpoints.some((endpoint) => endpoint.key === key && endpoint.status === "passed"),
  );

const requiredSignalRows = (key: DataTargetEndpointEvidence["key"]) => (key === "standings" || key === "lineups" ? 2 : 1);
const requiredSignalRowMap = {
  lineups: requiredSignalRows("lineups"),
  injuries: requiredSignalRows("injuries"),
  odds: requiredSignalRows("odds"),
  standings: requiredSignalRows("standings"),
};

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

const endpointReadBackCommand = (url: string) => {
  const base = `curl -sS ${shellSingleQuote(url)}`;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "v3.football.api-sports.io") {
      return `${base} -H 'x-apisports-key: $APIFOOTBALL_KEY_OR_VITE_APIFOOTBALL_KEY'`;
    }
  } catch {
    // Keep the raw curl command below for malformed URLs; validation will catch readiness separately.
  }
  return base;
};

const existingProductionTargetContext = (values: DataTargetScoutEnv) => ({
  userId: env(values, "KICKOFF_VERIFY_USER_ID"),
  profileId: env(values, "KICKOFF_VERIFY_PROFILE_ID"),
  publicProfileUrl: env(values, "KICKOFF_VERIFY_PUBLIC_PROFILE_URL"),
  proofId: env(values, "KICKOFF_VERIFY_PROOF_ID"),
  modeId: env(values, "KICKOFF_VERIFY_MODE_ID"),
  modeIds: listEnv(values, "KICKOFF_VERIFY_MODE_IDS"),
  shareArtifactIds: listEnv(values, "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS"),
  friendCode: env(values, "KICKOFF_VERIFY_FRIEND_CODE"),
  seasonKey: env(values, "KICKOFF_VERIFY_SEASON_KEY"),
  leaderboardScopes: listEnv(values, "KICKOFF_VERIFY_LEADERBOARD_SCOPES"),
  filecoinRecordCid: env(values, "KICKOFF_VERIFY_FILECOIN_RECORD_CID"),
  filecoinRecordPayloadHash: env(values, "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH"),
  filecoinModeCid: env(values, "KICKOFF_VERIFY_FILECOIN_MODE_CID"),
  filecoinModePayloadHash: env(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH"),
  filecoinModeCids: listEnv(values, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS"),
  filecoinModePayloadHashes: listEnv(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES"),
  shareImageUrl: env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL"),
  modeShareImageUrl: env(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"),
});

const gapFor = (candidate: DataTargetCandidate): DataTargetScoutGap | undefined => {
  if (candidate.ready) return undefined;
  return {
    fixtureId: candidate.fixtureId,
    label: candidate.label,
    missingEndpoints: candidate.missingEndpoints,
    signalMatrix: candidate.signalMatrix,
    action:
      candidate.missingEndpoints.length > 0
        ? `Try a fixture where ${candidate.missingEndpoints.join(", ")} return live provider rows, or raise KICKOFF_DATA_SCOUT_LIMIT.`
        : "Try another fixture or raise KICKOFF_DATA_SCOUT_LIMIT.",
  };
};

export const buildDataTargetScoutReport = async (
  values: DataTargetScoutEnv,
  fetcher: FetchLike = fetch,
): Promise<DataTargetScoutReport> => {
  if (!canReadApiFootball(values)) {
    return {
      ready: false,
      fixtureIds: [],
      requiredSignals: 4,
      requiredFixtureCount: Math.max(1, Number(env(values, "KICKOFF_DATA_SCOUT_TARGETS") || 3) || 3),
      checkedFixtures: 0,
      candidates: [],
      gaps: [],
      signalMatrix: "",
      verifyEnv: buildProductionVerifyEnv({
        ...existingProductionTargetContext(values),
        fixtureId: env(values, "KICKOFF_VERIFY_FIXTURE_ID"),
        fixtureIds: env(values, "KICKOFF_VERIFY_FIXTURE_IDS").split(/[,\s]+/).filter(Boolean),
        fixtureSignalMatrix: env(values, "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"),
        allowFailures: true,
      }),
      nextAction: "Set APIFOOTBALL_KEY, VITE_APIFOOTBALL_KEY or a deployed VITE_DATA_PROXY_URL/VITE_DATA_PROXY_SAME_ORIGIN before scouting production fixture targets.",
    };
  }
  const rows = await fixtureRows(values, fetcher);
  const limit = Math.max(1, Number(env(values, "KICKOFF_DATA_SCOUT_LIMIT") || 12) || 12);
  const candidates = await Promise.all(
    rows.slice(0, limit).map(async (row: any): Promise<DataTargetCandidate> => {
      const fixtureId = String(row.fixture?.id ?? row.id ?? "");
      const teams = fixtureTeamTargets(row);
      const endpoints = fixtureId
        ? await Promise.all([
            endpointEvidence(values, fetcher, fixtureId, "lineups", teams),
            endpointEvidence(values, fetcher, fixtureId, "injuries", teams),
            endpointEvidence(values, fetcher, fixtureId, "odds", teams),
            endpointEvidence(values, fetcher, fixtureId, "standings", teams),
          ])
        : [];
      const missingEndpoints = missingEndpointsFor(endpoints);
      return {
        fixtureId,
        label: fixtureLabel(row),
        teamIds: teams.ids,
        teamNames: teams.names,
        kickoffAt: row.fixture?.date,
        status: row.fixture?.status?.long,
        score: candidateScore(endpoints),
        endpoints,
        missingEndpoints,
        signalMatrix: signalMatrixFor(fixtureId, endpoints),
        ready: endpoints.length === 4 && missingEndpoints.length === 0,
      };
    }),
  );
  const ranked = candidates
    .filter((candidate) => candidate.fixtureId)
    .sort((a, b) => Number(b.ready) - Number(a.ready) || b.score - a.score || a.fixtureId.localeCompare(b.fixtureId));
  const best = ranked[0];
  const targetCount = Math.max(1, Number(env(values, "KICKOFF_DATA_SCOUT_TARGETS") || 3) || 3);
  const readyFixtureIds = ranked
    .filter((candidate) => candidate.ready)
    .slice(0, targetCount)
    .map((candidate) => candidate.fixtureId);
  const fixtureIds = readyFixtureIds.length > 0 ? readyFixtureIds : best?.fixtureId ? [best.fixtureId] : [];
  const signalMatrix = ranked
    .filter((candidate) => fixtureIds.includes(candidate.fixtureId))
    .map((candidate) => candidate.signalMatrix)
    .join(",");
  const ready = readyFixtureIds.length >= targetCount;
  const gaps = ranked.map(gapFor).filter((gap): gap is DataTargetScoutGap => Boolean(gap));
  return {
    ready,
    fixtureId: best?.fixtureId,
    fixtureIds,
    requiredSignals: 4,
    requiredFixtureCount: targetCount,
    checkedFixtures: ranked.length,
    candidates: ranked,
    gaps,
    signalMatrix,
    verifyEnv: buildProductionVerifyEnv({
      ...existingProductionTargetContext(values),
      fixtureId: best?.fixtureId,
      fixtureIds,
      fixtureSignalMatrix: signalMatrix,
      allowFailures: true,
    }),
    nextAction: ready
      ? `Set KICKOFF_VERIFY_FIXTURE_IDS=${fixtureIds.join(",")} and run bun run doctor:data.`
      : readyFixtureIds.length > 0
        ? `Found ${readyFixtureIds.length}/${targetCount} complete fixture targets (${readyFixtureIds.join(",")}); raise KICKOFF_DATA_SCOUT_LIMIT or lower KICKOFF_DATA_SCOUT_TARGETS intentionally.`
      : best
        ? `Best fixture ${best.fixtureId} is still missing ${best.endpoints
            .filter((endpoint: DataTargetEndpointEvidence) => endpoint.status !== "passed")
            .map((endpoint: DataTargetEndpointEvidence) => endpoint.key)
            .join(", ")}. Try a finished/live fixture or raise KICKOFF_DATA_SCOUT_LIMIT.`
        : "No API-Football fixtures returned for this league/season.",
  };
};

export const buildDataTargetScoutArtifact = (
  report: DataTargetScoutReport,
  options: { envFiles?: string[]; generatedAt?: string } = {},
): DataTargetScoutArtifact => {
  const fixtureSignals = report.fixtureIds.map((fixtureId): DataTargetScoutFixtureSignal => {
    const candidate = report.candidates.find((item) => item.fixtureId === fixtureId);
    const rows = Object.fromEntries(
      (["lineups", "injuries", "odds", "standings"] as const).map((key) => {
        const endpoint = candidate?.endpoints.find((item) => item.key === key && item.status === "passed");
        return [key, endpoint?.rows ?? 0];
      }),
    ) as Record<DataTargetEndpointEvidence["key"], number>;
    const missingEndpoints = (["lineups", "injuries", "odds", "standings"] as const).filter(
      (key) => rows[key] < requiredSignalRows(key),
    );
    const ready = Boolean(candidate) && missingEndpoints.length === 0;
    return {
      fixtureId,
      ready,
      rows,
      requiredRows: requiredSignalRowMap,
      missingEndpoints,
      detail: candidate
        ? ready
          ? `${fixtureId} has live lineups, injuries, odds and standings rows`
          : `${fixtureId} missing ${missingEndpoints.join(", ")} rows`
        : `candidate missing ${fixtureId}`,
    };
  });
  const endpointReadBackCommands = report.fixtureIds.flatMap((fixtureId) => {
    const candidate = report.candidates.find((item) => item.fixtureId === fixtureId);
    return (["lineups", "injuries", "odds", "standings"] as const).map((key): DataTargetEndpointReadBackCommand => {
      const endpoint = candidate?.endpoints.find((item) => item.key === key);
      const rows = endpoint?.rows ?? 0;
      const ready = Boolean(
        endpoint?.status === "passed" &&
          rows >= requiredSignalRows(key) &&
          endpoint.fixtureScoped &&
          endpoint.teamScoped &&
          endpoint.url,
      );
      return {
        id: `${fixtureId}:${key}`,
        fixtureId,
        key,
        label: `${fixtureId} ${key} read-back`,
        url: endpoint?.url ?? "",
        command: endpoint?.url ? endpointReadBackCommand(endpoint.url) : `Run scout:data-targets again to collect ${fixtureId} ${key}.`,
        ready,
        rows,
        sampleIds: endpoint?.sampleIds ?? [],
        responseExpectation: {
          responseType: "json",
          endpoint: key,
          expectedFixtureId: fixtureId,
          expectedTeamIds: candidate?.teamIds ?? [],
          expectedTeamNames: candidate?.teamNames ?? [],
          minRows: requiredSignalRows(key),
          fixtureScoped: Boolean(endpoint?.fixtureScoped),
          teamScoped: Boolean(endpoint?.teamScoped),
        },
      };
    });
  });
  return {
    ...report,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    envFiles: options.envFiles ?? [],
    artifactVersion: 1,
    acceptance: {
      readyFixtureCount: report.candidates.filter((candidate) => candidate.ready).length,
      requiredFixtureCount: report.requiredFixtureCount,
      completeSignalMatrix: Boolean(
        report.ready &&
          report.signalMatrix &&
          report.fixtureIds.length >= report.requiredFixtureCount &&
          report.fixtureIds.every((fixtureId) => report.signalMatrix.includes(`${fixtureId}:`)),
      ),
      fixtureSignals,
      endpointReadBackCommands,
      gaps: report.gaps,
      outputEnvKeys: ["KICKOFF_VERIFY_FIXTURE_IDS", "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"],
    },
  };
};
