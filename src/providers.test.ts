import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupFifaRanking } from "./data/fifaRankings";
import {
  buildDataCoverage,
  buildMatchIntelligenceScore,
  buildApiFootballEnrichmentAudit,
  buildFootballDataStandingsEnrichmentAudit,
  buildOddsApiEnrichmentAudit,
  buildDataProxyUrl,
  buildProviderHealthSnapshot,
  buildProviderReadiness,
  buildProviderRouteAudit,
  buildRealtimeDataAudit,
  buildTheSportsDbEnrichmentAudit,
  enrichMatchFromApiFootball,
  loadFromFootballData,
  loadFromTheSportsDb,
  loadFromWorldcup26,
  loadSeedMatches,
  mergeTheSportsDbEventDetails,
  mergeTheSportsDbTable,
  mergeApiFootballEnrichment,
  mergeFootballDataStandings,
  mergeOddsIntoMatch,
  normalizeApiFootballStandings,
  normalizeApiFootballFixture,
  normalizeFootballDataMatch,
  normalizeOpenFootballMatch,
  normalizeTheSportsDbEvent,
  normalizeTheSportsDbTable,
  sourceLabel,
} from "./providers";
import type { Match } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

const responseAudit = (source: Match["dataSource"], rowCount = 1) => ({
  source,
  endpoint: `${source} test endpoint`,
  status: rowCount > 0 ? "ok" as const : "empty" as const,
  httpStatus: 200,
  checkedAt: "2026-07-03T00:00:30.000Z",
  rowCount,
  sampleIds: rowCount > 0 ? [`${source}-sample`] : [],
  detail: `${rowCount} rows returned`,
});

describe("provider metadata", () => {
  it("builds optional proxy URLs for public data feeds without changing direct mode", () => {
    const target = "https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026";
    const proxied = buildDataProxyUrl(target, "thesportsdb", "https://data.example.workers.dev/proxy");

    expect(buildDataProxyUrl(target, "thesportsdb", undefined)).toBe(target);
    expect(proxied).toContain("https://data.example.workers.dev/proxy");
    expect(proxied).toContain("source=thesportsdb");
    expect(new URL(proxied).searchParams.get("url")).toBe(target);
  });

  it("uses deployed runtime config for public data proxy URLs", () => {
    vi.stubGlobal("window", {
      location: { href: "https://example.com/kickoff-lock-agent/" },
      __KICKOFF_RUNTIME_CONFIG__: {
        VITE_DATA_PROXY_URL: "https://runtime-data.example/proxy",
      },
    });
    const target = "https://worldcup26.ir/get/games";
    const proxied = buildDataProxyUrl(target, "worldcup26");

    expect(proxied).toContain("https://runtime-data.example/proxy");
    expect(new URL(proxied).searchParams.get("url")).toBe(target);
    expect(new URL(proxied).searchParams.get("source")).toBe("worldcup26");
  });

  it("looks up official ranking snapshot aliases", () => {
    expect(lookupFifaRanking("USA")?.rank).toBe(17);
    expect(lookupFifaRanking("IR Iran")?.rank).toBe(20);
    expect(lookupFifaRanking("Côte d'Ivoire")?.rank).toBe(33);
  });

  it("labels every configured source for the match board", () => {
    expect(sourceLabel("espn")).toBe("ESPN");
    expect(sourceLabel("api-football")).toBe("API-Football");
    expect(sourceLabel("football-data")).toBe("Football-Data.org");
    expect(sourceLabel("worldcup26")).toBe("worldcup26");
    expect(sourceLabel("openfootball")).toBe("openfootball");
    expect(sourceLabel("thesportsdb")).toBe("TheSportsDB");
    expect(sourceLabel("odds-api")).toBe("The Odds API");
    expect(sourceLabel("seed")).toBe("Seed");
  });

  it("normalizes openfootball World Cup JSON fixtures as a no-key continuity feed", () => {
    const match = normalizeOpenFootballMatch({
      round: "Matchday 1",
      date: "2026-06-11",
      time: "13:00 UTC-6",
      team1: "Mexico",
      team2: "South Africa",
      score: { ft: [2, 0], ht: [1, 0] },
      group: "Group A",
      ground: "Mexico City",
    });

    expect(match).toMatchObject({
      id: "openfootball-2026-06-11-1",
      homeTeam: "Mexico",
      awayTeam: "South Africa",
      kickoffAt: "2026-06-11T19:00:00.000Z",
      stage: "Group A · Matchday 1",
      status: "finished",
      dataSource: "openfootball",
      homeScore: 2,
      awayScore: 0,
      venue: "Mexico City",
    });
    expect(match.insights?.lineupSource).toContain("openfootball");
  });

  it("exposes health evidence for the offline seed fallback", () => {
    const result = loadSeedMatches();
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.evidence?.join(" ")).toContain("seed matches loaded");
    expect(result.responseAudit?.status).toBe("fallback");
    expect(result.responseAudit?.source).toBe("seed");
    expect(result.warning).toMatch(/seed data/i);
  });

  it("normalizes Football-Data.org matches with score and insight shells", () => {
    const match = normalizeFootballDataMatch({
      id: 100,
      utcDate: "2099-07-01T20:00:00Z",
      status: "IN_PLAY",
      stage: "LAST_16",
      venue: "Arena",
      homeTeam: { name: "Spain", shortName: "Spain" },
      awayTeam: { name: "Austria", shortName: "Austria" },
      score: { fullTime: { home: 2, away: 1 } },
    });
    expect(match.id).toBe("football-data-100");
    expect(match.status).toBe("live");
    expect(match.dataSource).toBe("football-data");
    expect(match.homeScore).toBe(2);
    expect(match.insights?.home.fifaRank).toBe(2);
    expect(match.insights?.away.fifaRank).toBe(24);
    expect(match.insights?.rankingSource).toContain("2026-06-11");
    expect(match.insights?.lineupSource).toContain("Football-Data.org");
    expect(match.insights?.dataCoverage?.some((item) => item.key === "score" && item.status === "live")).toBe(true);
    expect(match.insights?.dataCoverage?.some((item) => item.key === "rankings" && item.status === "configured")).toBe(true);
    expect(match.insights?.dataCoverage?.some((item) => item.key === "lineups" && item.status === "missing")).toBe(true);
  });

  it("merges Football-Data.org standings into match ranking coverage", () => {
    const [match] = mergeFootballDataStandings(
      [
        normalizeFootballDataMatch({
          id: 100,
          utcDate: "2099-07-01T20:00:00Z",
          status: "SCHEDULED",
          stage: "GROUP_STAGE",
          homeTeam: { name: "Spain", shortName: "Spain" },
          awayTeam: { name: "Austria", shortName: "Austria" },
          score: { fullTime: { home: null, away: null } },
        }),
      ],
      [
        { teamKey: "spain", teamName: "Spain", position: 1, points: 9, record: "3-0-0", group: "GROUP_B" },
        { teamKey: "austria", teamName: "Austria", position: 3, points: 4, record: "1-1-1", group: "GROUP_B" },
      ],
      "Football-Data.org WC standings 2099",
    );
    const ranking = match.insights?.dataCoverage?.find((item) => item.key === "rankings");

    expect(match.insights?.home.tablePosition).toBe(1);
    expect(match.insights?.away.tablePoints).toBe(4);
    expect(match.insights?.standingsSource).toBe("Football-Data.org WC standings 2099");
    expect(match.insights?.home.form).toEqual(["TABLE", "#1", "9PTS", "GROUP_B"]);
    expect(ranking?.status).toBe("configured");
    expect(ranking?.source).toBe("Football-Data.org WC standings 2099");
    expect(ranking?.detail).toContain("Spain table #1");
    expect(ranking?.detail).toContain("Austria table #3");
  });

  it("records Football-Data.org standings read-back as structured rankings evidence", () => {
    const [match] = mergeFootballDataStandings(
      [
        normalizeFootballDataMatch({
          id: 100,
          utcDate: "2099-07-01T20:00:00Z",
          status: "IN_PLAY",
          stage: "GROUP_STAGE",
          homeTeam: { name: "Spain", shortName: "Spain" },
          awayTeam: { name: "Austria", shortName: "Austria" },
          score: { fullTime: { home: 2, away: 1 } },
        }),
      ],
      [
        { teamKey: "spain", teamName: "Spain", position: 1, points: 9, record: "3-0-0", group: "GROUP_B" },
        { teamKey: "austria", teamName: "Austria", position: 3, points: 4, record: "1-1-1", group: "GROUP_B" },
      ],
      "Football-Data.org WC standings 2099",
    );
    const enrichmentAudit = buildFootballDataStandingsEnrichmentAudit({
      totalFixtures: 1,
      attemptedMatchIds: [match.id],
      enrichedMatches: [match],
      standingsRows: 2,
      standingsOk: true,
      endpoint: "competitions/WC/standings?season=2099",
      checkedAt: "2099-07-01T20:01:00.000Z",
    });
    const audit = buildRealtimeDataAudit({
      source: "football-data",
      matches: [match],
      routeAudit: buildProviderRouteAudit("football-data", []),
      evidence: ["Football-Data.org matches plus standings"],
      responseAudit: responseAudit("football-data"),
      enrichmentAudit,
      checkedAt: "2099-07-01T20:01:00.000Z",
    });

    expect(enrichmentAudit.endpointAudits).toEqual([
      expect.objectContaining({
        key: "standings",
        attempted: 1,
        fulfilled: 1,
        live: 1,
        errors: 0,
        sampleIds: [match.id],
      }),
    ]);
    expect(audit.signals.find((signal) => signal.key === "rankings")?.configured).toBe(1);
    expect(audit.missingSignals).not.toContain("rankings");
    expect(audit.enrichmentAudit?.detail).toContain("standings read-back");
  });

  it("normalizes API-Football standings into provider ranking coverage", () => {
    const standings = normalizeApiFootballStandings({
      response: [
        {
          league: {
            standings: [
              [
                {
                  rank: 1,
                  team: { name: "Spain" },
                  points: 9,
                  group: "Group B",
                  all: { win: 3, draw: 0, lose: 0 },
                },
                {
                  rank: 3,
                  team: { name: "Austria" },
                  points: 4,
                  group: "Group B",
                  all: { win: 1, draw: 1, lose: 1 },
                },
              ],
            ],
          },
        },
      ],
    });
    const [match] = mergeFootballDataStandings(
      [
        normalizeApiFootballFixture({
          fixture: {
            id: 200,
            date: "2099-07-02T20:00:00Z",
            status: { long: "Not Started" },
            venue: { name: "Arena" },
          },
          league: { round: "Group B - 3" },
          teams: { home: { name: "Spain" }, away: { name: "Austria" } },
          goals: { home: null, away: null },
        }),
      ],
      standings,
      "API-Football standings league=1 season=2099",
    );
    const ranking = match.insights?.dataCoverage?.find((item) => item.key === "rankings");

    expect(standings).toHaveLength(2);
    expect(match.insights?.home.tablePosition).toBe(1);
    expect(match.insights?.away.tableRecord).toBe("1-1-1");
    expect(match.insights?.standingsSource).toBe("API-Football standings league=1 season=2099");
    expect(ranking?.status).toBe("configured");
    expect(ranking?.source).toBe("API-Football standings league=1 season=2099");
    expect(ranking?.detail).toContain("Spain table #1");
  });

  it("normalizes TheSportsDB World Cup events with live scores and rankings", () => {
    const match = normalizeTheSportsDbEvent({
      idEvent: "2503636",
      strHomeTeam: "Spain",
      strAwayTeam: "Austria",
      intRound: "32",
      intHomeScore: "2",
      intAwayScore: "1",
      strTimestamp: "2026-07-02T19:00:00",
      strStatus: "FT",
      strVenue: "SoFi Stadium",
      strCity: "Inglewood, CA",
      strCountry: "United States",
      strEvent: "Spain vs Austria",
    });

    expect(match.id).toBe("thesportsdb-2503636");
    expect(match.stage).toBe("Round of 32");
    expect(match.status).toBe("finished");
    expect(match.homeScore).toBe(2);
    expect(match.awayScore).toBe(1);
    expect(match.venue).toContain("SoFi Stadium");
    expect(match.insights?.home.fifaRank).toBe(2);
    expect(match.insights?.away.fifaRank).toBe(24);
    expect(match.insights?.dataCoverage?.find((item) => item.key === "score")?.status).toBe("live");
    expect(match.insights?.dataCoverage?.find((item) => item.key === "odds")?.status).toBe("missing");
  });

  it("merges TheSportsDB event lineups and stats into match coverage", () => {
    const match = normalizeTheSportsDbEvent({
      idEvent: "2391728",
      strHomeTeam: "Mexico",
      strAwayTeam: "South Africa",
      intRound: "1",
      intHomeScore: "2",
      intAwayScore: "0",
      strTimestamp: "2026-06-11T19:00:00",
      strStatus: "FT",
      strEvent: "Mexico vs South Africa",
    });
    const enriched = mergeTheSportsDbEventDetails(
      match,
      [
        { strHome: "Yes", strSubstitute: "No", strPlayer: "Raul Jimenez" },
        { strHome: "No", strSubstitute: "No", strPlayer: "Aubrey Modiba" },
        { strHome: "Yes", strSubstitute: "Yes", strPlayer: "Bench Player" },
      ],
      [{ strStat: "Total Shots", intHome: "16", intAway: "3" }],
    );

    expect(enriched.insights?.home.probableLineup).toContain("Raul Jimenez");
    expect(enriched.insights?.home.probableLineup).not.toContain("Bench Player");
    expect(enriched.insights?.away.probableLineup).toContain("Aubrey Modiba");
    expect(enriched.insights?.headToHead).toContain("Total Shots: 16-3");
    expect(enriched.insights?.dataCoverage?.find((item) => item.key === "lineups")?.status).toBe("live");
  });

  it("merges TheSportsDB league table read-back into ranking coverage", () => {
    const match = normalizeTheSportsDbEvent({
      idEvent: "2391728",
      strHomeTeam: "Mexico",
      strAwayTeam: "South Africa",
      intRound: "1",
      intHomeScore: "2",
      intAwayScore: "0",
      strTimestamp: "2026-06-11T19:00:00",
      strStatus: "FT",
      strEvent: "Mexico vs South Africa",
    });
    const table = normalizeTheSportsDbTable({
      table: [
        { strTeam: "Mexico", intRank: "1", intPoints: "6", intPlayed: "2", intWin: "2", intDraw: "0", intLoss: "0", intGoalDifference: "3" },
        { strTeam: "South Africa", intRank: "3", intPoints: "1", intPlayed: "2", intWin: "0", intDraw: "1", intLoss: "1", intGoalDifference: "-2" },
      ],
    });
    const [enriched] = mergeTheSportsDbTable([match], table, "TheSportsDB league table 4429/2026");
    const ranking = enriched.insights?.dataCoverage?.find((item) => item.key === "rankings");

    expect(table).toEqual([
      expect.objectContaining({ teamName: "Mexico", position: 1, points: 6, record: "2-0-0" }),
      expect.objectContaining({ teamName: "South Africa", position: 3, points: 1, record: "0-1-1" }),
    ]);
    expect(enriched.insights?.home.tablePosition).toBe(1);
    expect(enriched.insights?.away.tablePoints).toBe(1);
    expect(enriched.insights?.home.form).toEqual(["TABLE", "#1", "6PTS", "2P", "GD3"]);
    expect(enriched.insights?.standingsSource).toBe("TheSportsDB league table 4429/2026");
    expect(ranking).toMatchObject({
      status: "configured",
      source: "TheSportsDB league table 4429/2026",
      detail: "Mexico table #1 (6 pts) · South Africa table #3 (1 pts)",
    });
  });

  it("records TheSportsDB enrichment read-back without hiding missing injury and odds feeds", () => {
    const enriched = mergeTheSportsDbEventDetails(
      mergeTheSportsDbTable(
        [
          normalizeTheSportsDbEvent({
            idEvent: "2391728",
            strHomeTeam: "Mexico",
            strAwayTeam: "South Africa",
            intRound: "1",
            intHomeScore: "2",
            intAwayScore: "0",
            strTimestamp: "2026-06-11T19:00:00",
            strStatus: "FT",
            strEvent: "Mexico vs South Africa",
          }),
        ],
        [
          { teamKey: "mexico", teamName: "Mexico", position: 1, points: 6, played: 2, record: "2-0-0" },
          { teamKey: "southafrica", teamName: "South Africa", position: 3, points: 1, played: 2, record: "0-1-1" },
        ],
        "TheSportsDB league table 4429/2026",
      )[0],
      [
        { strHome: "Yes", strSubstitute: "No", strPlayer: "Raul Jimenez" },
        { strHome: "No", strSubstitute: "No", strPlayer: "Aubrey Modiba" },
      ],
      [{ strStat: "Total Shots", intHome: "16", intAway: "3" }],
    );
    const enrichmentAudit = buildTheSportsDbEnrichmentAudit({
      totalFixtures: 1,
      attemptedEventIds: ["2391728"],
      enrichedMatches: [enriched],
      failures: [],
      standingsRows: 2,
      standingsOk: true,
      standingsEndpoint: "lookuptable 4429/2026",
      checkedAt: "2026-07-03T00:00:00.000Z",
    });
    const audit = buildRealtimeDataAudit({
      source: "thesportsdb",
      matches: [enriched],
      routeAudit: buildProviderRouteAudit("thesportsdb", []),
      evidence: ["TheSportsDB event details plus lineup read-back"],
      responseAudit: responseAudit("thesportsdb"),
      enrichmentAudit,
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "lineups")?.live).toBe(1);
    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "standings")).toMatchObject({
      endpoint: "lookuptable 4429/2026",
      attempted: 1,
      fulfilled: 1,
      live: 1,
      errors: 0,
    });
    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "injuries")?.attempted).toBe(0);
    expect(audit.enrichmentAudit?.source).toBe("thesportsdb");
    expect(audit.missingSignals).not.toContain("rankings");
    expect(audit.missingSignals).toContain("injuries");
    expect(audit.missingSignals).toContain("odds");
    expect(audit.productionReady).toBe(false);
  });

  it("applies ranking snapshot to seed continuity matches", () => {
    const brazilJapan = loadSeedMatches().matches.find((match) => match.homeTeam === "Brazil");
    expect(brazilJapan?.insights?.home.fifaRank).toBe(6);
    expect(brazilJapan?.insights?.away.fifaRank).toBe(18);
    expect(brazilJapan?.insights?.dataCoverage?.find((item) => item.key === "rankings")?.source).toContain("2026-06-11");
  });

  it("merges external odds into a match intelligence pack", () => {
    const match: Match = {
      id: "espn-1",
      homeTeam: "Spain",
      awayTeam: "Austria",
      kickoffAt: "2099-07-01T20:00:00Z",
      stage: "Round of 16",
      status: "upcoming",
      dataSource: "espn",
    };
    const enriched = mergeOddsIntoMatch(match, [
      {
        home_team: "Spain",
        away_team: "Austria",
        bookmakers: [
          {
            title: "DemoBook",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Spain", price: 1.8 },
                  { name: "Austria", price: 4.2 },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(enriched?.insights?.oddsSnapshot).toContain("Spain 1.8");
    expect(enriched?.insights?.marketLine).toContain("DemoBook");
    expect(enriched?.insights?.dataCoverage?.some((item) => item.key === "odds" && item.status === "live")).toBe(true);
  });

  it("uses The Odds API audit to prove odds read-back without hiding lineup or injury gaps", () => {
    const baseMatch = normalizeTheSportsDbEvent({
      idEvent: "2503636",
      strHomeTeam: "Spain",
      strAwayTeam: "Austria",
      intRound: "32",
      intHomeScore: "2",
      intAwayScore: "1",
      strTimestamp: "2026-07-02T19:00:00",
      strStatus: "FT",
    });
    const enriched = mergeOddsIntoMatch(baseMatch, [
      {
        home_team: "Spain",
        away_team: "Austria",
        bookmakers: [
          {
            title: "LiveBook",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Spain", price: 1.75 },
                  { name: "Draw", price: 3.6 },
                  { name: "Austria", price: 4.8 },
                ],
              },
            ],
          },
        ],
      },
    ])!;
    const enrichmentAudit = buildOddsApiEnrichmentAudit({
      source: "thesportsdb",
      totalFixtures: 1,
      attemptedMatchIds: [baseMatch.id],
      enrichedMatches: [enriched],
      checkedAt: "2026-07-03T00:00:00.000Z",
    });
    const audit = buildRealtimeDataAudit({
      source: "thesportsdb",
      matches: [enriched],
      routeAudit: buildProviderRouteAudit("thesportsdb", []),
      evidence: ["TheSportsDB plus The Odds API"],
      responseAudit: responseAudit("thesportsdb"),
      enrichmentAudit,
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(enrichmentAudit.endpointAudits).toEqual([
      expect.objectContaining({
        key: "odds",
        attempted: 1,
        fulfilled: 1,
        live: 1,
        errors: 0,
        sampleIds: [baseMatch.id],
      }),
    ]);
    expect(audit.signals.find((signal) => signal.key === "odds")?.live).toBe(1);
    expect(audit.missingSignals).not.toContain("odds");
    expect(audit.missingSignals).toEqual(expect.arrayContaining(["lineups", "injuries"]));
    expect(audit.productionReady).toBe(false);
  });

  it("marks missing live scores as manual reveal coverage", () => {
    const match: Match = {
      id: "espn-2",
      homeTeam: "Brazil",
      awayTeam: "Japan",
      kickoffAt: "2099-07-02T20:00:00Z",
      stage: "Round of 16",
      status: "upcoming",
      dataSource: "espn",
    };
    const coverage = buildDataCoverage(match);
    const score = buildMatchIntelligenceScore(match);
    expect(coverage.find((item) => item.key === "schedule")?.status).toBe("live");
    expect(coverage.find((item) => item.key === "score")?.status).toBe("manual");
    expect(coverage.find((item) => item.key === "lineups")?.status).toBe("missing");
    expect(score.level).toBe("manual-risk");
    expect(score.suggestions.join(" ")).toContain("live score polling");
  });

  it("does not label placeholder odds text as live odds", () => {
    const coverage = buildDataCoverage({
      id: "espn-3",
      homeTeam: "Spain",
      awayTeam: "Austria",
      kickoffAt: "2099-07-02T20:00:00Z",
      stage: "Round of 16",
      status: "upcoming",
      dataSource: "espn",
      insights: {
        home: {
          fifaRank: 0,
          form: ["ESPN"],
          lastFiveGoalsFor: 0,
          lastFiveGoalsAgainst: 0,
          unavailable: ["Configure injury provider"],
          probableLineup: ["Lineup not published by this provider"],
        },
        away: {
          fifaRank: 0,
          form: ["ESPN"],
          lastFiveGoalsFor: 0,
          lastFiveGoalsAgainst: 0,
          unavailable: ["Configure injury provider"],
          probableLineup: ["Lineup not published by this provider"],
        },
        headToHead: "ESPN matchup",
        marketLine: "Market data waits for odds enrichment.",
        oddsSnapshot: "Odds enrichment not loaded.",
        dataFreshness: "now",
      },
    });
    expect(coverage.find((item) => item.key === "odds")?.status).toBe("missing");
  });

  it("does not treat configured odds endpoint copy as market content", () => {
    const coverage = buildDataCoverage({
      id: "api-football-configured-odds",
      homeTeam: "Spain",
      awayTeam: "Austria",
      kickoffAt: "2099-07-02T20:00:00Z",
      stage: "Round of 16",
      status: "upcoming",
      dataSource: "api-football",
      insights: {
        home: {
          fifaRank: 2,
          form: ["FIFA"],
          lastFiveGoalsFor: 0,
          lastFiveGoalsAgainst: 0,
          unavailable: [],
          probableLineup: [],
        },
        away: {
          fifaRank: 24,
          form: ["FIFA"],
          lastFiveGoalsFor: 0,
          lastFiveGoalsAgainst: 0,
          unavailable: [],
          probableLineup: [],
        },
        headToHead: "API matchup",
        marketLine: "Odds endpoint configured",
        dataFreshness: "now",
      },
    });

    expect(coverage.find((item) => item.key === "odds")).toMatchObject({
      status: "missing",
      source: "Not available",
      detail: "Odds endpoint configured",
    });
  });

  it("does not promote API-Football fixture rows into enrichment coverage before endpoint read-back", () => {
    const match = normalizeApiFootballFixture({
      fixture: {
        id: 200,
        date: "2099-07-02T20:00:00Z",
        status: { long: "Not Started" },
        venue: { name: "Arena" },
      },
      league: { round: "Round of 16" },
      teams: { home: { name: "Spain" }, away: { name: "Austria" } },
      goals: { home: null, away: null },
    });
    const coverage = buildDataCoverage(match);

    expect(coverage.find((item) => item.key === "schedule")?.status).toBe("live");
    expect(coverage.find((item) => item.key === "lineups")?.status).toBe("missing");
    expect(coverage.find((item) => item.key === "injuries")?.status).toBe("missing");
    expect(coverage.find((item) => item.key === "odds")?.status).toBe("missing");
  });

  it("attaches API-Football enrichment read-back audit to realtime evidence", () => {
    const enriched = mergeApiFootballEnrichment(
      normalizeApiFootballFixture({
        fixture: {
          id: 200,
          date: "2099-07-02T20:00:00Z",
          status: { long: "Match Finished" },
          venue: { name: "Arena" },
        },
        league: { round: "Round of 16" },
        teams: { home: { name: "Spain" }, away: { name: "Austria" } },
        goals: { home: 2, away: 1 },
      }),
      {
        lineupsOk: true,
        injuriesOk: true,
        oddsOk: true,
        lineupRows: [
          { team: { name: "Spain" }, startXI: [{ player: { name: "Unai Simon" } }] },
          { team: { name: "Austria" }, startXI: [{ player: { name: "Marcel Sabitzer" } }] },
        ],
        injuryRows: [
          { team: { name: "Spain" }, player: { name: "Player A" } },
          { team: { name: "Austria" }, player: { name: "Player B" } },
        ],
        oddsRows: [
          {
            bookmakers: [
              {
                name: "FixtureBook",
                bets: [
                  {
                    name: "Match Winner",
                    values: [{ value: "Spain", odd: "1.70" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    );
    const [enrichedWithStandings] = mergeFootballDataStandings(
      [enriched],
      [{ teamKey: "spain", teamName: "Spain", position: 1, points: 9, record: "3-0-0", group: "GROUP_B" }],
      "API-Football standings league=1 season=2099",
    );
    const enrichmentAudit = buildApiFootballEnrichmentAudit({
      totalFixtures: 1,
      attemptedFixtureIds: ["200"],
      enrichedMatches: [enrichedWithStandings],
      failures: [],
      checkedAt: "2026-07-03T00:00:00.000Z",
    });
    const audit = buildRealtimeDataAudit({
      source: "api-football",
      matches: [enrichedWithStandings],
      routeAudit: buildProviderRouteAudit("api-football", []),
      evidence: ["API-Football fixtures plus enrichment"],
      responseAudit: responseAudit("api-football"),
      enrichmentAudit,
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "lineups")?.live).toBe(1);
    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "injuries")?.live).toBe(1);
    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "odds")?.live).toBe(1);
    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "standings")?.live).toBe(1);
    expect(audit.enrichmentAudit?.attemptedFixtures).toBe(1);
    expect(audit.productionReady).toBe(true);
    expect(
      buildRealtimeDataAudit({
        source: "api-football",
        matches: [enrichedWithStandings],
        routeAudit: buildProviderRouteAudit("api-football", []),
        evidence: ["API-Football fixtures without enrichment audit"],
        responseAudit: responseAudit("api-football"),
        checkedAt: "2026-07-03T00:00:00.000Z",
      }).productionReady,
    ).toBe(false);
  });

  it("keeps realtime audit incomplete when enrichment endpoints do not cover every attempted fixture", () => {
    const enriched = mergeApiFootballEnrichment(
      normalizeApiFootballFixture({
        fixture: {
          id: 200,
          date: "2099-07-02T20:00:00Z",
          status: { long: "Match Finished" },
        },
        league: { round: "Round of 16" },
        teams: { home: { name: "Spain" }, away: { name: "Austria" } },
        goals: { home: 2, away: 1 },
      }),
      {
        lineupsOk: true,
        injuriesOk: true,
        oddsOk: true,
        lineupRows: [{ team: { name: "Spain" }, startXI: [{ player: { name: "Unai Simon" } }] }],
        injuryRows: [{ team: { name: "Spain" }, player: { name: "Player A" } }],
        oddsRows: [{ bookmakers: [{ name: "FixtureBook", bets: [{ name: "Winner", values: [{ value: "Spain", odd: "1.70" }] }] }] }],
      },
    );
    const secondEnriched = {
      ...enriched,
      id: "api-football-201",
      homeTeam: "Brazil",
      awayTeam: "Japan",
    };
    const audit = buildRealtimeDataAudit({
      source: "api-football",
      matches: [enriched, secondEnriched],
      routeAudit: buildProviderRouteAudit("api-football", []),
      evidence: ["API-Football fixtures plus partial enrichment"],
      responseAudit: responseAudit("api-football", 2),
      enrichmentAudit: {
        source: "api-football",
        checkedAt: "2026-07-03T00:00:00.000Z",
        totalFixtures: 2,
        attemptedFixtures: 2,
        detail: "partial endpoint coverage",
        endpointAudits: [
          { key: "lineups", endpoint: "fixtures/lineups", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["200", "201"] },
          { key: "injuries", endpoint: "injuries", attempted: 2, fulfilled: 2, live: 1, errors: 0, sampleIds: ["200"] },
          { key: "odds", endpoint: "odds", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["200", "201"] },
          { key: "standings", endpoint: "standings", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["200", "201"] },
        ],
      },
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(audit.productionReady).toBe(false);
    expect(audit.missingSignals).toEqual(["injuries"]);
  });

  it("summarizes live data readiness without hiding missing enrichment providers", () => {
    const readiness = buildProviderReadiness([
      {
        id: "espn-1",
        homeTeam: "Spain",
        awayTeam: "Austria",
        kickoffAt: "2099-07-02T20:00:00Z",
        stage: "Round of 16",
        status: "upcoming",
        dataSource: "espn",
        insights: {
          home: {
            fifaRank: 2,
            form: ["FIFA"],
            lastFiveGoalsFor: 0,
            lastFiveGoalsAgainst: 0,
            unavailable: ["Configure injury provider"],
            probableLineup: ["Lineup not published by this provider"],
          },
          away: {
            fifaRank: 24,
            form: ["FIFA"],
            lastFiveGoalsFor: 0,
            lastFiveGoalsAgainst: 0,
            unavailable: ["Configure injury provider"],
            probableLineup: ["Lineup not published by this provider"],
          },
          rankingSource: "FIFA/Coca-Cola Men's World Ranking snapshot, 2026-06-11",
          headToHead: "ESPN matchup",
          marketLine: "Market data waits for odds enrichment.",
          oddsSnapshot: "Odds enrichment not loaded.",
          dataFreshness: "now",
        },
      },
    ]);
    expect(readiness.find((item) => item.key === "schedule")?.status).toBe("live");
    expect(readiness.find((item) => item.key === "score")?.status).toBe("configured");
    expect(readiness.find((item) => item.key === "rankings")?.status).toBe("configured");
    expect(readiness.find((item) => item.key === "lineups")?.status).toBe("missing");
    expect(readiness.find((item) => item.key === "injuries")?.status).toBe("missing");
    expect(readiness.find((item) => item.key === "odds")?.detail).toContain("VITE_ODDS_API_KEY");
  });

  it("builds a realtime provider health snapshot from route, freshness and missing signals", () => {
    const readiness = buildProviderReadiness([
      normalizeTheSportsDbEvent({
        idEvent: "2503636",
        strHomeTeam: "Spain",
        strAwayTeam: "Austria",
        intRound: "32",
        intHomeScore: "2",
        intAwayScore: "1",
        strTimestamp: "2026-07-02T19:00:00",
        strStatus: "FT",
      }),
    ]);
    const health = buildProviderHealthSnapshot({
      providerSource: "TheSportsDB",
      readiness,
      routeAudit: buildProviderRouteAudit("thesportsdb", []),
      evidence: ["TheSportsDB events normalized"],
      responseAudit: responseAudit("thesportsdb"),
      lastSyncedAt: "2026-07-03T00:00:00.000Z",
      now: new Date("2026-07-03T00:01:00.000Z").getTime(),
    });

    expect(health.status).toBe("partial");
    expect(health.fresh).toBe(true);
    expect(health.responseVerified).toBe(true);
    expect(health.activeRoute).toBe("TheSportsDB");
    expect(health.missingSignals).toContain("odds");
    expect(health.detail).toContain("live/configured");
    expect(health.detail).toContain("response verified");
    expect(health.detail).toContain("production read-back");
  });

  it("keeps provider health partial when the active route has no verified response audit", () => {
    const readiness = buildProviderReadiness([
      normalizeTheSportsDbEvent({
        idEvent: "2503636",
        strHomeTeam: "Spain",
        strAwayTeam: "Austria",
        intRound: "32",
        intHomeScore: "2",
        intAwayScore: "1",
        strTimestamp: "2026-07-02T19:00:00",
        strStatus: "FT",
      }),
    ]);
    const health = buildProviderHealthSnapshot({
      providerSource: "TheSportsDB",
      readiness,
      routeAudit: buildProviderRouteAudit("thesportsdb", []),
      evidence: ["TheSportsDB events normalized"],
      lastSyncedAt: "2026-07-03T00:00:00.000Z",
      now: new Date("2026-07-03T00:01:00.000Z").getTime(),
    });

    expect(health.status).toBe("partial");
    expect(health.responseVerified).toBe(false);
    expect(health.detail).toContain("response unverified");
  });

  it("requires enrichment endpoint read-back before provider health is verified", () => {
    const readiness = [
      { key: "schedule" as const, label: "Schedule", status: "live" as const, source: "API-Football", detail: "Fixtures" },
      { key: "score" as const, label: "Scores", status: "live" as const, source: "API-Football", detail: "Scores" },
      { key: "rankings" as const, label: "Ranking", status: "configured" as const, source: "FIFA", detail: "Rankings" },
      { key: "lineups" as const, label: "Lineups", status: "configured" as const, source: "API-Football", detail: "Key configured" },
      { key: "injuries" as const, label: "Injuries", status: "configured" as const, source: "API-Football", detail: "Key configured" },
      { key: "odds" as const, label: "Odds", status: "configured" as const, source: "API-Football", detail: "Key configured" },
    ];
    const health = buildProviderHealthSnapshot({
      providerSource: "API-Football",
      readiness,
      routeAudit: buildProviderRouteAudit("api-football", []),
      evidence: ["API-Football fixtures endpoint"],
      responseAudit: responseAudit("api-football"),
      lastSyncedAt: "2026-07-03T00:00:00.000Z",
      now: new Date("2026-07-03T00:01:00.000Z").getTime(),
    });

    expect(health.status).not.toBe("verified");
    expect(health.missingSignals).toEqual(["rankings", "lineups", "injuries", "odds"]);
    expect(health.detail).toContain("2/6 production read-back");
    expect(health.enrichmentMatrix).toEqual([
      expect.objectContaining({ key: "lineups", ready: false, detail: "endpoint read-back not attempted" }),
      expect.objectContaining({ key: "injuries", ready: false, detail: "endpoint read-back not attempted" }),
      expect.objectContaining({ key: "odds", ready: false, detail: "endpoint read-back not attempted" }),
      expect.objectContaining({ key: "standings", ready: false, detail: "endpoint read-back not attempted" }),
    ]);
  });

  it("requires endpoint read-back to cover every attempted production fixture", () => {
    const readiness = [
      { key: "schedule" as const, label: "Schedule", status: "live" as const, source: "API-Football", detail: "Fixtures" },
      { key: "score" as const, label: "Scores", status: "live" as const, source: "API-Football", detail: "Scores" },
      { key: "rankings" as const, label: "Ranking", status: "configured" as const, source: "FIFA", detail: "Rankings" },
      { key: "lineups" as const, label: "Lineups", status: "live" as const, source: "API-Football", detail: "2/2 live" },
      { key: "injuries" as const, label: "Injuries", status: "live" as const, source: "API-Football", detail: "1/2 live" },
      { key: "odds" as const, label: "Odds", status: "live" as const, source: "API-Football", detail: "2/2 live" },
    ];
    const health = buildProviderHealthSnapshot({
      providerSource: "API-Football",
      readiness,
      routeAudit: buildProviderRouteAudit("api-football", []),
      evidence: ["API-Football fixtures endpoint"],
      responseAudit: responseAudit("api-football"),
      enrichmentAudit: {
        source: "api-football",
        checkedAt: "2026-07-03T00:00:30.000Z",
        totalFixtures: 2,
        attemptedFixtures: 2,
        detail: "partial endpoint read-back",
        endpointAudits: [
          { key: "lineups", endpoint: "fixtures/lineups", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
          { key: "injuries", endpoint: "injuries", attempted: 2, fulfilled: 2, live: 1, errors: 0, sampleIds: ["101"] },
          { key: "odds", endpoint: "odds", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
          { key: "standings", endpoint: "standings", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
        ],
      },
      lastSyncedAt: "2026-07-03T00:00:00.000Z",
      now: new Date("2026-07-03T00:01:00.000Z").getTime(),
    });

    expect(health.status).not.toBe("verified");
    expect(health.missingSignals).toEqual(["injuries"]);
    expect(health.detail).toContain("5/6 production read-back");
    const matrix = health.enrichmentMatrix ?? [];
    expect(matrix.find((item) => item.key === "injuries")).toMatchObject({
      attempted: 2,
      fulfilled: 2,
      live: 1,
      errors: 0,
      ready: false,
      detail: "1/2 live, 2/2 fulfilled, 0 errors",
      sampleIds: ["101"],
    });
    expect(matrix.find((item) => item.key === "lineups")).toMatchObject({
      ready: true,
      detail: "2/2 live read-back rows",
    });
  });

  it("creates a structured realtime evidence packet without promoting missing enrichment", () => {
    const matches = [
      normalizeTheSportsDbEvent({
        idEvent: "2503636",
        strHomeTeam: "Spain",
        strAwayTeam: "Austria",
        intRound: "32",
        intHomeScore: "2",
        intAwayScore: "1",
        strTimestamp: "2026-07-02T19:00:00",
        strStatus: "FT",
      }),
    ];
    const audit = buildRealtimeDataAudit({
      source: "thesportsdb",
      matches,
      routeAudit: buildProviderRouteAudit("thesportsdb", []),
      evidence: ["TheSportsDB events normalized"],
      responseAudit: responseAudit("thesportsdb"),
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(audit.sourceLabel).toBe("TheSportsDB");
    expect(audit.routeStatus).toBe("active");
    expect(audit.matchCount).toBe(1);
    expect(audit.finishedMatches).toBe(1);
    expect(audit.responseVerified).toBe(true);
    expect(audit.responseAudit?.rowCount).toBe(1);
    expect(audit.signals.find((signal) => signal.key === "schedule")?.live).toBe(1);
    expect(audit.signals.find((signal) => signal.key === "odds")?.missing).toBe(1);
    expect(audit.missingSignals).toContain("odds");
    expect(audit.productionReady).toBe(false);
    expect(audit.samples[0]?.liveOrConfigured).toBeGreaterThanOrEqual(3);
  });

  it("does not mark a live route production-ready when merged seed fallback supplies weak signals", () => {
    const liveMatch = normalizeTheSportsDbEvent({
      idEvent: "2503636",
      strHomeTeam: "Spain",
      strAwayTeam: "Austria",
      intRound: "32",
      intHomeScore: "2",
      intAwayScore: "1",
      strTimestamp: "2026-07-02T19:00:00",
      strStatus: "FT",
    });
    const seedMatch = loadSeedMatches().matches[0];
    const audit = buildRealtimeDataAudit({
      source: "thesportsdb",
      matches: [liveMatch, seedMatch],
      routeAudit: buildProviderRouteAudit("thesportsdb", []),
      evidence: ["TheSportsDB plus seed continuity"],
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(audit.routeStatus).toBe("active");
    expect(audit.productionReady).toBe(false);
    expect(audit.missingSignals).toContain("schedule");
    expect(audit.signals.find((signal) => signal.key === "schedule")?.fallback).toBe(1);
  });

  it("does not treat stale seed fallback as verified realtime data", () => {
    const health = buildProviderHealthSnapshot({
      providerSource: "Seed",
      readiness: buildProviderReadiness(loadSeedMatches().matches),
      routeAudit: buildProviderRouteAudit("seed", []),
      evidence: ["seed fallback"],
      lastSyncedAt: "2026-07-03T00:00:00.000Z",
      now: new Date("2026-07-03T00:10:00.000Z").getTime(),
    });

    expect(health.status).toBe("partial");
    expect(health.fresh).toBe(false);
    expect(health.nextAction).toContain("Connect a live provider");
  });

  it("keeps seed fallback audit evidence separate from production realtime readiness", () => {
    const result = loadSeedMatches();
    const audit = buildRealtimeDataAudit({
      source: result.source,
      matches: result.matches,
      routeAudit: buildProviderRouteAudit("seed", []),
      evidence: result.evidence,
      warning: result.warning,
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(audit.source).toBe("seed");
    expect(audit.routeStatus).toBe("fallback");
    expect(audit.productionReady).toBe(false);
    expect(audit.warning).toMatch(/seed data/i);
    expect(audit.signals.find((signal) => signal.key === "schedule")?.fallback).toBeGreaterThan(0);
    expect(audit.signals.find((signal) => signal.key === "score")?.manual).toBeGreaterThan(0);
  });

  it("audits provider fallback route with missing config and active free source", () => {
    const audit = buildProviderRouteAudit("thesportsdb", [
      "API-Football: VITE_APIFOOTBALL_KEY is not configured",
      "Football-Data.org: VITE_FOOTBALL_DATA_TOKEN is not configured",
    ]);

    expect(audit.find((item) => item.key === "api-football")?.status).toBe("needs-config");
    expect(audit.find((item) => item.key === "football-data")?.status).toBe("needs-config");
    expect(audit.find((item) => item.key === "thesportsdb")?.status).toBe("active");
    expect(audit.find((item) => item.key === "openfootball")?.status).toBe("skipped");
    expect(audit.find((item) => item.key === "espn")?.status).toBe("skipped");
  });

  it("audits forced fallback as offline seed route", () => {
    const audit = buildProviderRouteAudit("seed", ["Forced API failure enabled for fallback testing."], true);

    expect(audit.find((item) => item.key === "api-football")?.status).toBe("failed");
    expect(audit.find((item) => item.key === "espn")?.detail).toContain("Forced fallback");
    expect(audit.find((item) => item.key === "seed")?.status).toBe("fallback");
  });

  it("marks API-Football lineups, injuries and odds as live when enrichment payloads return", () => {
    const enriched = mergeApiFootballEnrichment(
      {
        id: "api-football-200",
        homeTeam: "Spain",
        awayTeam: "Austria",
        kickoffAt: "2099-07-02T20:00:00Z",
        stage: "Round of 16",
        status: "live",
        dataSource: "api-football",
        homeScore: 2,
        awayScore: 1,
        insights: {
          home: {
            fifaRank: 2,
            form: ["FIFA"],
            lastFiveGoalsFor: 0,
            lastFiveGoalsAgainst: 0,
            unavailable: [],
            probableLineup: [],
          },
          away: {
            fifaRank: 24,
            form: ["FIFA"],
            lastFiveGoalsFor: 0,
            lastFiveGoalsAgainst: 0,
            unavailable: [],
            probableLineup: [],
          },
          headToHead: "API matchup",
          marketLine: "Odds endpoint configured",
          dataFreshness: "now",
        },
      },
      {
        lineupsOk: true,
        injuriesOk: true,
        oddsOk: true,
        lineupRows: [
          { team: { name: "Spain" }, startXI: [{ player: { name: "Unai Simon" } }, { player: { name: "Pedri" } }] },
          { team: { name: "Austria" }, startXI: [{ player: { name: "Marcel Sabitzer" } }] },
        ],
        injuryRows: [
          { team: { name: "Spain" }, player: { name: "Player A" } },
          { team: { name: "Austria" }, player: { name: "Player B" } },
        ],
        oddsRows: [
          {
            bookmakers: [
              {
                name: "FixtureBook",
                bets: [
                  {
                    name: "Match Winner",
                    values: [
                      { value: "Spain", odd: "1.70" },
                      { value: "Draw", odd: "3.40" },
                      { value: "Austria", odd: "4.80" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    );

    expect(enriched.insights?.home.probableLineup).toContain("Pedri");
    expect(enriched.insights?.away.unavailable).toContain("Player B");
    expect(enriched.insights?.oddsSnapshot).toContain("Spain 1.70");
    expect(enriched.insights?.dataCoverage?.find((item) => item.key === "lineups")?.status).toBe("live");
    expect(enriched.insights?.dataCoverage?.find((item) => item.key === "injuries")?.status).toBe("live");
    expect(enriched.insights?.dataCoverage?.find((item) => item.key === "odds")?.status).toBe("live");
    expect(buildMatchIntelligenceScore(enriched).level).toBe("live-ready");
  });

  it("keeps empty API-Football enrichment payloads out of live production coverage", () => {
    const enriched = mergeApiFootballEnrichment(
      {
        id: "api-football-200",
        homeTeam: "Spain",
        awayTeam: "Austria",
        kickoffAt: "2099-07-02T20:00:00Z",
        stage: "Round of 16",
        status: "live",
        dataSource: "api-football",
        homeScore: 2,
        awayScore: 1,
        insights: {
          home: {
            fifaRank: 2,
            form: ["FIFA"],
            lastFiveGoalsFor: 0,
            lastFiveGoalsAgainst: 0,
            unavailable: [],
            probableLineup: [],
          },
          away: {
            fifaRank: 24,
            form: ["FIFA"],
            lastFiveGoalsFor: 0,
            lastFiveGoalsAgainst: 0,
            unavailable: [],
            probableLineup: [],
          },
          headToHead: "API matchup",
          marketLine: "Odds endpoint configured",
          dataFreshness: "now",
        },
      },
      {
        lineupsOk: true,
        injuriesOk: true,
        oddsOk: true,
        lineupRows: [],
        injuryRows: [],
        oddsRows: [],
      },
    );

    const coverage = enriched.insights?.dataCoverage ?? [];
    const audit = buildApiFootballEnrichmentAudit({
      totalFixtures: 1,
      attemptedFixtureIds: ["200"],
      enrichedMatches: [enriched],
      failures: [],
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(coverage.find((item) => item.key === "lineups")?.status).toBe("configured");
    expect(coverage.find((item) => item.key === "injuries")?.status).toBe("configured");
    expect(coverage.find((item) => item.key === "odds")?.status).toBe("missing");
    expect(audit.endpointAudits.find((item) => item.key === "lineups")?.live).toBe(0);
    expect(audit.endpointAudits.find((item) => item.key === "injuries")?.live).toBe(0);
    expect(audit.endpointAudits.find((item) => item.key === "odds")?.live).toBe(0);
  });

  it("routes API-Football enrichment through the data proxy when no browser key is exposed", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://example.com/kickoff-lock-agent/" },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      __KICKOFF_RUNTIME_CONFIG__: {
        VITE_APIFOOTBALL_KEY: "",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
    });
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toContain("https://data.example.workers.dev/proxy");
      expect(new URL(url).searchParams.get("source")).toBe("api-football");
      const target = new URL(url).searchParams.get("url") ?? "";
      if (target.includes("/fixtures/lineups")) {
        return new Response(JSON.stringify({ response: [{ team: { name: "Spain" }, startXI: [{ player: { name: "Pedri" } }] }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (target.includes("/injuries")) {
        return new Response(JSON.stringify({ response: [{ team: { name: "Austria" }, player: { name: "Player B" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ response: [{ bookmakers: [{ name: "ProxyBook", bets: [{ name: "Match Winner", values: [{ value: "Spain", odd: "1.70" }] }] }] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetcher);

    const enriched = await enrichMatchFromApiFootball({
      id: "api-football-200",
      homeTeam: "Spain",
      awayTeam: "Austria",
      kickoffAt: "2099-07-02T20:00:00Z",
      stage: "Round of 16",
      status: "live",
      dataSource: "api-football",
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(enriched.insights?.home.probableLineup).toContain("Pedri");
    expect(enriched.insights?.away.unavailable).toContain("Player B");
    expect(enriched.insights?.oddsSnapshot).toContain("Spain 1.70");
  });

  it("routes Football-Data.org matches and standings through the data proxy without a browser token", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://example.com/kickoff-lock-agent/" },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      __KICKOFF_RUNTIME_CONFIG__: {
        VITE_FOOTBALL_DATA_TOKEN: "",
        VITE_FOOTBALL_DATA_COMPETITION: "WC",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
      },
    });
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("https://data.example.workers.dev/proxy");
      expect(init?.headers).toBeUndefined();
      const proxy = new URL(url);
      expect(proxy.searchParams.get("source")).toBe("football-data");
      const target = proxy.searchParams.get("url") ?? "";
      if (target.includes("/standings")) {
        return new Response(
          JSON.stringify({
            standings: [
              {
                group: "GROUP_A",
                table: [
                  { position: 1, points: 6, won: 2, draw: 0, lost: 0, team: { name: "Spain", shortName: "Spain" } },
                  { position: 2, points: 3, won: 1, draw: 0, lost: 1, team: { name: "Austria", shortName: "Austria" } },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          matches: [
            {
              id: 100,
              utcDate: "2099-07-01T20:00:00Z",
              status: "FINISHED",
              stage: "GROUP_STAGE",
              venue: "Arena",
              homeTeam: { name: "Spain", shortName: "Spain" },
              awayTeam: { name: "Austria", shortName: "Austria" },
              score: { fullTime: { home: 2, away: 1 } },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await loadFromFootballData();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("football-data");
    expect(result.matches[0]).toMatchObject({
      id: "football-data-100",
      homeTeam: "Spain",
      awayTeam: "Austria",
      homeScore: 2,
      awayScore: 1,
    });
    expect(result.matches[0]?.insights?.home.tablePosition).toBe(1);
    expect(result.enrichmentAudit?.endpointAudits.find((item) => item.key === "standings")).toMatchObject({
      attempted: 1,
      fulfilled: 1,
      live: 1,
      errors: 0,
    });
  });

  it("loads TheSportsDB events, table, lineups and stats as no-key read-back evidence", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://example.com/kickoff-lock-agent/" },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      __KICKOFF_RUNTIME_CONFIG__: {
        VITE_THESPORTSDB_KEY: "123",
        VITE_THESPORTSDB_LEAGUE_ID: "4429",
        VITE_THESPORTSDB_SEASON: "2026",
        VITE_THESPORTSDB_ENRICHMENT_LIMIT: "1",
      },
    });
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("eventsseason.php")) {
        return new Response(
          JSON.stringify({
            events: [
              {
                idEvent: "2391728",
                strHomeTeam: "Mexico",
                strAwayTeam: "South Africa",
                intRound: "1",
                intHomeScore: "2",
                intAwayScore: "0",
                strTimestamp: "2026-06-11T19:00:00",
                strStatus: "FT",
                strEvent: "Mexico vs South Africa",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("lookuptable.php")) {
        return new Response(
          JSON.stringify({
            table: [
              { strTeam: "Mexico", intRank: "1", intPoints: "6", intPlayed: "2", intWin: "2", intDraw: "0", intLoss: "0" },
              { strTeam: "South Africa", intRank: "3", intPoints: "1", intPlayed: "2", intWin: "0", intDraw: "1", intLoss: "1" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("lookuplineup.php")) {
        return new Response(
          JSON.stringify({
            lineup: [
              { strHome: "Yes", strSubstitute: "No", strPlayer: "Raul Jimenez" },
              { strHome: "No", strSubstitute: "No", strPlayer: "Aubrey Modiba" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("lookupeventstats.php")) {
        return new Response(
          JSON.stringify({ eventstats: [{ strStat: "Total Shots", intHome: "16", intAway: "3" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected TheSportsDB URL ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await loadFromTheSportsDb();

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(result.matches[0]?.insights?.home.tablePosition).toBe(1);
    expect(result.matches[0]?.insights?.home.probableLineup).toContain("Raul Jimenez");
    expect(result.matches[0]?.insights?.headToHead).toContain("Total Shots: 16-3");
    expect(result.evidence?.join(" ")).toContain("2 TheSportsDB league table rows normalized");
    expect(result.enrichmentAudit?.endpointAudits.find((item) => item.key === "lineups")).toMatchObject({
      attempted: 1,
      fulfilled: 1,
      live: 1,
      errors: 0,
    });
    expect(result.enrichmentAudit?.endpointAudits.find((item) => item.key === "standings")).toMatchObject({
      endpoint: "lookuptable 4429/2026",
      attempted: 1,
      fulfilled: 1,
      live: 1,
      errors: 0,
    });
  });

  it("does not leak browser Odds API keys into proxied odds enrichment URLs", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://example.com/kickoff-lock-agent/" },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      __KICKOFF_RUNTIME_CONFIG__: {
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        VITE_ODDS_API_KEY: "browser-odds-secret",
        VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
      },
    });
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toContain("https://data.example.workers.dev/proxy");
      const proxied = new URL(url);
      const target = proxied.searchParams.get("url") ?? "";
      if (proxied.searchParams.get("source") === "worldcup26") {
        return new Response(
          JSON.stringify({
            games: [
              {
                id: "100",
                local_date: "2099-07-01 20:00:00",
                home_team_name_en: "Spain",
                away_team_name_en: "Austria",
                type: "Group",
                finished: "false",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      expect(proxied.searchParams.get("source")).toBe("odds-api");
      expect(target).toContain("api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds");
      expect(target).not.toContain("apiKey=");
      return new Response(
        JSON.stringify([
          {
            id: "odds-spain-austria",
            home_team: "Spain",
            away_team: "Austria",
            bookmakers: [{ key: "book", markets: [{ key: "h2h", outcomes: [{ name: "Spain", price: 1.7 }] }] }],
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await loadFromWorldcup26();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.enrichmentAudit?.endpointAudits.find((item) => item.key === "odds")).toMatchObject({
      attempted: 1,
      fulfilled: 1,
      live: 1,
      errors: 0,
    });
    expect(result.matches[0]?.insights?.oddsSnapshot).toContain("Spain 1.7");
  });

  it("scores configured but incomplete intelligence without hiding enrichment gaps", () => {
    const match = normalizeFootballDataMatch({
      id: 101,
      utcDate: "2099-07-01T20:00:00Z",
      status: "FINISHED",
      stage: "GROUP_STAGE",
      venue: "Arena",
      homeTeam: { name: "Spain", shortName: "Spain" },
      awayTeam: { name: "Austria", shortName: "Austria" },
      score: { fullTime: { home: 1, away: 1 } },
    });
    const score = buildMatchIntelligenceScore(match);

    expect(score.score).toBeGreaterThan(40);
    expect(score.score).toBeLessThan(80);
    expect(score.level).toBe("thin");
    expect(score.missing).toContain("lineups");
    expect(score.missing).toContain("odds");
    expect(score.suggestions.join(" ")).toContain("API-Football lineups");
  });
});
