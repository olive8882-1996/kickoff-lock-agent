import { describe, expect, it } from "vitest";
import { lookupFifaRanking } from "./data/fifaRankings";
import {
  buildDataCoverage,
  buildMatchIntelligenceScore,
  buildApiFootballEnrichmentAudit,
  buildProviderHealthSnapshot,
  buildProviderReadiness,
  buildProviderRouteAudit,
  buildRealtimeDataAudit,
  buildTheSportsDbEnrichmentAudit,
  loadSeedMatches,
  mergeTheSportsDbEventDetails,
  mergeApiFootballEnrichment,
  mergeOddsIntoMatch,
  normalizeApiFootballFixture,
  normalizeFootballDataMatch,
  normalizeTheSportsDbEvent,
  sourceLabel,
} from "./providers";
import type { Match } from "./types";

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
    expect(sourceLabel("thesportsdb")).toBe("TheSportsDB");
    expect(sourceLabel("seed")).toBe("Seed");
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

  it("records TheSportsDB enrichment read-back without hiding missing injury and odds feeds", () => {
    const enriched = mergeTheSportsDbEventDetails(
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
    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "injuries")?.attempted).toBe(0);
    expect(audit.enrichmentAudit?.source).toBe("thesportsdb");
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
    const enrichmentAudit = buildApiFootballEnrichmentAudit({
      totalFixtures: 1,
      attemptedFixtureIds: ["200"],
      enrichedMatches: [enriched],
      failures: [],
      checkedAt: "2026-07-03T00:00:00.000Z",
    });
    const audit = buildRealtimeDataAudit({
      source: "api-football",
      matches: [enriched],
      routeAudit: buildProviderRouteAudit("api-football", []),
      evidence: ["API-Football fixtures plus enrichment"],
      responseAudit: responseAudit("api-football"),
      enrichmentAudit,
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "lineups")?.live).toBe(1);
    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "injuries")?.live).toBe(1);
    expect(enrichmentAudit.endpointAudits.find((item) => item.key === "odds")?.live).toBe(1);
    expect(audit.enrichmentAudit?.attemptedFixtures).toBe(1);
    expect(audit.productionReady).toBe(true);
    expect(
      buildRealtimeDataAudit({
        source: "api-football",
        matches: [enriched],
        routeAudit: buildProviderRouteAudit("api-football", []),
        evidence: ["API-Football fixtures without enrichment audit"],
        responseAudit: responseAudit("api-football"),
        checkedAt: "2026-07-03T00:00:00.000Z",
      }).productionReady,
    ).toBe(false);
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
    expect(health.missingSignals).toEqual(["lineups", "injuries", "odds"]);
    expect(health.detail).toContain("3/6 production read-back");
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
