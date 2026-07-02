import { describe, expect, it } from "vitest";
import { lookupFifaRanking } from "./data/fifaRankings";
import {
  buildDataCoverage,
  buildMatchIntelligenceScore,
  buildProviderReadiness,
  loadSeedMatches,
  mergeTheSportsDbEventDetails,
  mergeApiFootballEnrichment,
  mergeOddsIntoMatch,
  normalizeFootballDataMatch,
  normalizeTheSportsDbEvent,
  sourceLabel,
} from "./providers";
import type { Match } from "./types";

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
