export type ApiFootballEndpointKey = "lineups" | "injuries" | "odds" | "standings";

export type ApiFootballEndpointRowsEvaluation = {
  rows: any[];
  validRows: any[];
  passed: boolean;
  detail: string;
  sampleIds: string[];
  fixtureMismatchCount?: number;
  missingFixtureIdentityCount?: number;
  teamMismatchCount?: number;
  missingTeamTargets?: string[];
  missingStandingTargets?: string[];
};

export type ApiFootballEndpointRowsOptions = {
  fixtureId?: string;
  requireFixtureIdentity?: boolean;
  teamIds?: string[];
  teamNames?: string[];
  standingTeamIds?: string[];
  standingTeamNames?: string[];
};

const hasValue = (value: unknown) => value !== undefined && value !== null && String(value).trim().length > 0;
const objectHasIdentity = (value: any) => Boolean(value && typeof value === "object" && (hasValue(value.id) || hasValue(value.name)));
const lineupListHasPlayer = (rows: any) =>
  Array.isArray(rows) && rows.some((item: any) => objectHasIdentity(item?.player ?? item));

const rowFixtureId = (row: any) => {
  const value = row?.fixture?.id ?? row?.fixture_id ?? row?.fixtureId ?? (typeof row?.fixture !== "object" ? row?.fixture : undefined);
  return hasValue(value) ? String(value).trim() : "";
};

const normalizeTeamName = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const rowStandingTeamId = (row: any) => (hasValue(row?.team?.id) ? String(row.team.id).trim() : "");
const rowStandingTeamName = (row: any) => normalizeTeamName(row?.team?.name);
const rowTeamIds = (row: any) =>
  [
    row?.team?.id,
    row?.teams?.home?.id,
    row?.teams?.away?.id,
    row?.home?.id,
    row?.away?.id,
  ].map((id) => String(id ?? "").trim()).filter(Boolean);
const rowTeamNames = (row: any) =>
  [
    row?.team?.name,
    row?.teams?.home?.name,
    row?.teams?.away?.name,
    row?.home?.name,
    row?.away?.name,
  ].map(normalizeTeamName).filter(Boolean);

const sampleValue = (value: any) => {
  if (value && typeof value === "object") {
    if (objectHasIdentity(value.team)) return value.team.id ?? value.team.name;
    if (objectHasIdentity(value.player)) return value.player.id ?? value.player.name;
    if (objectHasIdentity(value.fixture)) return value.fixture.id ?? value.fixture.name;
    if (objectHasIdentity(value.league)) return value.league.id ?? value.league.name;
    if (Array.isArray(value.bookmakers) && objectHasIdentity(value.bookmakers[0])) {
      return value.bookmakers[0].id ?? value.bookmakers[0].name;
    }
    return value.id ?? value.name ?? JSON.stringify(value).slice(0, 64);
  }
  return value;
};

const rowHasLineupShape = (row: any) =>
  Boolean(
    objectHasIdentity(row?.team) &&
      (
        lineupListHasPlayer(row?.startXI) ||
        lineupListHasPlayer(row?.substitutes) ||
        objectHasIdentity(row?.coach) ||
        hasValue(row?.formation)
      ),
  );

const rowHasInjuryShape = (row: any) =>
  Boolean(objectHasIdentity(row?.player) && (objectHasIdentity(row?.team) || objectHasIdentity(row?.fixture)));

const marketHasOddsValue = (market: any) => {
  const values = Array.isArray(market?.values)
    ? market.values
    : Array.isArray(market?.outcomes)
      ? market.outcomes
      : [];
  return values.some((value: any) => hasValue(value?.odd ?? value?.price) && hasValue(value?.value ?? value?.name));
};

const bookmakerHasOddsMarket = (bookmaker: any) => {
  const markets = Array.isArray(bookmaker?.bets)
    ? bookmaker.bets
    : Array.isArray(bookmaker?.markets)
      ? bookmaker.markets
      : [];
  return objectHasIdentity(bookmaker) && markets.some((market: any) => objectHasIdentity(market) && marketHasOddsValue(market));
};

const rowHasOddsShape = (row: any) =>
  Boolean(Array.isArray(row?.bookmakers) && row.bookmakers.some(bookmakerHasOddsMarket));

const rowHasStandingShape = (row: any) => {
  const rank = Number(row?.rank ?? row?.position);
  const points = Number(row?.points);
  return objectHasIdentity(row?.team) && Number.isInteger(rank) && rank > 0 && Number.isFinite(points);
};

export const apiFootballEndpointRowIsValid = (key: ApiFootballEndpointKey, row: any) => {
  if (key === "lineups") return rowHasLineupShape(row);
  if (key === "injuries") return rowHasInjuryShape(row);
  if (key === "standings") return rowHasStandingShape(row);
  return rowHasOddsShape(row);
};

export const evaluateApiFootballEndpointRows = (
  key: ApiFootballEndpointKey,
  rows: any[],
  options: ApiFootballEndpointRowsOptions = {},
): ApiFootballEndpointRowsEvaluation => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const validRows = safeRows.filter((row) => apiFootballEndpointRowIsValid(key, row));
  const targetFixtureId = options.fixtureId?.trim() ?? "";
  const requireFixtureIdentity = Boolean(options.requireFixtureIdentity && targetFixtureId);
  const targetTeamIds = [...new Set((options.teamIds ?? []).map((id) => id.trim()).filter(Boolean))];
  const targetTeamNames = [...new Set((options.teamNames ?? []).map(normalizeTeamName).filter(Boolean))];
  const targetStandingIds = [...new Set((options.standingTeamIds ?? []).map((id) => id.trim()).filter(Boolean))];
  const targetStandingNames = [...new Set((options.standingTeamNames ?? []).map(normalizeTeamName).filter(Boolean))];
  const fixtureRows = targetFixtureId ? validRows.filter((row) => rowFixtureId(row)) : [];
  const fixtureMismatchCount = targetFixtureId
    ? fixtureRows.filter((row) => rowFixtureId(row) !== targetFixtureId).length
    : 0;
  const missingFixtureIdentityCount = requireFixtureIdentity
    ? validRows.filter((row) => !rowFixtureId(row)).length
    : 0;
  const fixtureScopedRows = targetFixtureId
    ? validRows.filter((row) => {
        const fixtureId = rowFixtureId(row);
        if (!fixtureId) return !requireFixtureIdentity;
        return fixtureId === targetFixtureId;
      })
    : validRows;
  const hasTeamTargets = targetTeamIds.length > 0 || targetTeamNames.length > 0;
  const rowMatchesTargetTeam = (row: any) =>
    !hasTeamTargets ||
    rowTeamIds(row).some((id) => targetTeamIds.includes(id)) ||
    rowTeamNames(row).some((name) => targetTeamNames.includes(name));
  const teamIdentityRows = hasTeamTargets
    ? fixtureScopedRows.filter((row) => rowTeamIds(row).length > 0 || rowTeamNames(row).length > 0)
    : [];
  const teamMismatchCount = hasTeamTargets
    ? teamIdentityRows.filter((row) => !rowMatchesTargetTeam(row)).length
    : 0;
  const teamScopedRows = hasTeamTargets
    ? fixtureScopedRows.filter((row) => {
        const hasIdentity = rowTeamIds(row).length > 0 || rowTeamNames(row).length > 0;
        return !hasIdentity || rowMatchesTargetTeam(row);
      })
    : fixtureScopedRows;
  const lineupCoverageByIds = targetTeamIds.length > 0 && teamScopedRows.some((row) => rowTeamIds(row).length > 0);
  const missingTeamTargets = key === "lineups" && lineupCoverageByIds
    ? targetTeamIds.filter((id) => !teamScopedRows.some((row) => rowTeamIds(row).includes(id)))
    : key === "lineups" && targetTeamNames.length > 0
      ? targetTeamNames.filter((name) => !teamScopedRows.some((row) => rowTeamNames(row).includes(name)))
      : [];
  const standingScopedRows = key === "standings" && targetStandingIds.length > 0
    ? teamScopedRows.filter((row) => targetStandingIds.includes(rowStandingTeamId(row)))
    : key === "standings" && targetStandingNames.length > 0
      ? teamScopedRows.filter((row) => targetStandingNames.includes(rowStandingTeamName(row)))
      : teamScopedRows;
  const missingStandingTargets = key === "standings" && targetStandingIds.length > 0
    ? targetStandingIds.filter((id) => !standingScopedRows.some((row) => rowStandingTeamId(row) === id))
    : key === "standings" && targetStandingNames.length > 0
      ? targetStandingNames.filter((name) => !standingScopedRows.some((row) => rowStandingTeamName(row) === name))
      : [];
  const scopedValidRows = standingScopedRows;
  const sampleIds = scopedValidRows.map(sampleValue).map(String).filter(Boolean).slice(0, 5);
  const detail = [
    `${scopedValidRows.length}/${safeRows.length} valid ${key} row${safeRows.length === 1 ? "" : "s"}`,
    fixtureMismatchCount > 0 ? `${fixtureMismatchCount} fixture id mismatch for ${targetFixtureId}` : "",
    missingFixtureIdentityCount > 0 ? `${missingFixtureIdentityCount} missing fixture identity for ${targetFixtureId}` : "",
    teamMismatchCount > 0 ? `${teamMismatchCount} team mismatch` : "",
    missingTeamTargets.length > 0 ? `missing lineup teams ${missingTeamTargets.join(", ")}` : "",
    missingStandingTargets.length > 0 ? `missing standings teams ${missingStandingTargets.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  return {
    rows: safeRows,
    validRows: scopedValidRows,
    passed: scopedValidRows.length > 0 &&
      fixtureMismatchCount === 0 &&
      missingFixtureIdentityCount === 0 &&
      teamMismatchCount === 0 &&
      missingTeamTargets.length === 0 &&
      missingStandingTargets.length === 0,
    detail,
    sampleIds,
    fixtureMismatchCount,
    missingFixtureIdentityCount,
    teamMismatchCount,
    missingTeamTargets,
    missingStandingTargets,
  };
};
