import { buildProductionVerifyEnv } from "./productionEvidence";

export type DataTargetScoutEnv = Record<string, string | undefined>;

export type DataTargetEndpointEvidence = {
  key: "lineups" | "injuries" | "odds";
  rows: number;
  status: "passed" | "failed";
  sampleIds: string[];
  url: string;
};

export type DataTargetCandidate = {
  fixtureId: string;
  label: string;
  kickoffAt?: string;
  status?: string;
  score: number;
  endpoints: DataTargetEndpointEvidence[];
  ready: boolean;
};

export type DataTargetScoutReport = {
  ready: boolean;
  fixtureId?: string;
  requiredSignals: number;
  checkedFixtures: number;
  candidates: DataTargetCandidate[];
  verifyEnv: string;
  nextAction: string;
};

type FetchLike = typeof fetch;

const env = (values: DataTargetScoutEnv, key: string) => values[key]?.trim() ?? "";
const apiFootballUrl = (path: string) => `https://v3.football.api-sports.io${path}`;
const headers = (values: DataTargetScoutEnv) => ({ "x-apisports-key": env(values, "VITE_APIFOOTBALL_KEY") });

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

const sampleValue = (row: any) => {
  if (!row || typeof row !== "object") return row;
  if (row.team?.id) return row.team.id;
  if (row.player?.id) return row.player.id;
  if (row.fixture?.id) return row.fixture.id;
  if (row.league?.id) return row.league.id;
  if (Array.isArray(row.bookmakers) && row.bookmakers[0]?.id) return row.bookmakers[0].id;
  return row.id ?? row.name ?? JSON.stringify(row).slice(0, 64);
};

const sampleIds = (rows: any[]) => rows.map(sampleValue).map(String).filter(Boolean).slice(0, 5);

const fixtureLabel = (row: any) => {
  const home = row.teams?.home?.name ?? "Home";
  const away = row.teams?.away?.name ?? "Away";
  return `${home} vs ${away}`;
};

const fixtureRows = async (values: DataTargetScoutEnv, fetcher: FetchLike) => {
  const season = env(values, "KICKOFF_DATA_SCOUT_SEASON") || String(new Date().getUTCFullYear());
  const league = env(values, "KICKOFF_DATA_SCOUT_LEAGUE_ID") || "1";
  const params = new URLSearchParams({ league, season });
  const next = env(values, "KICKOFF_DATA_SCOUT_NEXT");
  if (next) params.set("next", next);
  const url = apiFootballUrl(`/fixtures?${params.toString()}`);
  const { response, body } = await readJson(fetcher, url, { headers: headers(values) });
  if (!response.ok) throw new Error(`API-Football fixtures returned HTTP ${response.status}`);
  return Array.isArray(body?.response) ? body.response : [];
};

const endpointEvidence = async (
  values: DataTargetScoutEnv,
  fetcher: FetchLike,
  fixtureId: string,
  key: DataTargetEndpointEvidence["key"],
): Promise<DataTargetEndpointEvidence> => {
  const path =
    key === "lineups"
      ? `/fixtures/lineups?fixture=${encodeURIComponent(fixtureId)}`
      : key === "injuries"
        ? `/injuries?fixture=${encodeURIComponent(fixtureId)}`
        : `/odds?fixture=${encodeURIComponent(fixtureId)}`;
  const url = apiFootballUrl(path);
  try {
    const { response, body } = await readJson(fetcher, url, { headers: headers(values) });
    const rows = Array.isArray(body?.response) ? body.response : [];
    return {
      key,
      rows: response.ok ? rows.length : 0,
      status: response.ok && rows.length > 0 ? "passed" : "failed",
      sampleIds: response.ok ? sampleIds(rows) : [],
      url,
    };
  } catch {
    return { key, rows: 0, status: "failed", sampleIds: [], url };
  }
};

const candidateScore = (endpoints: DataTargetEndpointEvidence[]) =>
  endpoints.reduce((score, item) => score + (item.rows > 0 ? 10 : 0) + Math.min(item.rows, 10), 0);

export const buildDataTargetScoutReport = async (
  values: DataTargetScoutEnv,
  fetcher: FetchLike = fetch,
): Promise<DataTargetScoutReport> => {
  if (!env(values, "VITE_APIFOOTBALL_KEY")) {
    return {
      ready: false,
      requiredSignals: 3,
      checkedFixtures: 0,
      candidates: [],
      verifyEnv: buildProductionVerifyEnv({ fixtureId: env(values, "KICKOFF_VERIFY_FIXTURE_ID"), allowFailures: true }),
      nextAction: "Set VITE_APIFOOTBALL_KEY before scouting production fixture targets.",
    };
  }
  const rows = await fixtureRows(values, fetcher);
  const limit = Math.max(1, Number(env(values, "KICKOFF_DATA_SCOUT_LIMIT") || 12) || 12);
  const candidates = await Promise.all(
    rows.slice(0, limit).map(async (row: any): Promise<DataTargetCandidate> => {
      const fixtureId = String(row.fixture?.id ?? row.id ?? "");
      const endpoints = fixtureId
        ? await Promise.all([
            endpointEvidence(values, fetcher, fixtureId, "lineups"),
            endpointEvidence(values, fetcher, fixtureId, "injuries"),
            endpointEvidence(values, fetcher, fixtureId, "odds"),
          ])
        : [];
      return {
        fixtureId,
        label: fixtureLabel(row),
        kickoffAt: row.fixture?.date,
        status: row.fixture?.status?.long,
        score: candidateScore(endpoints),
        endpoints,
        ready: endpoints.length === 3 && endpoints.every((endpoint) => endpoint.status === "passed"),
      };
    }),
  );
  const ranked = candidates
    .filter((candidate) => candidate.fixtureId)
    .sort((a, b) => Number(b.ready) - Number(a.ready) || b.score - a.score || a.fixtureId.localeCompare(b.fixtureId));
  const best = ranked[0];
  return {
    ready: Boolean(best?.ready),
    fixtureId: best?.fixtureId,
    requiredSignals: 3,
    checkedFixtures: ranked.length,
    candidates: ranked,
    verifyEnv: buildProductionVerifyEnv({ fixtureId: best?.fixtureId, allowFailures: true }),
    nextAction: best?.ready
      ? `Set KICKOFF_VERIFY_FIXTURE_ID=${best.fixtureId} and run bun run doctor:data.`
      : best
        ? `Best fixture ${best.fixtureId} is still missing ${best.endpoints
            .filter((endpoint: DataTargetEndpointEvidence) => endpoint.status !== "passed")
            .map((endpoint: DataTargetEndpointEvidence) => endpoint.key)
            .join(", ")}. Try a finished/live fixture or raise KICKOFF_DATA_SCOUT_LIMIT.`
        : "No API-Football fixtures returned for this league/season.",
  };
};
