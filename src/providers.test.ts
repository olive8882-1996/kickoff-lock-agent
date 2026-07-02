import { describe, expect, it } from "vitest";
import { lookupFifaRanking } from "./data/fifaRankings";
import { buildDataCoverage, loadSeedMatches, mergeOddsIntoMatch, normalizeFootballDataMatch, sourceLabel } from "./providers";
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
    const coverage = buildDataCoverage({
      id: "espn-2",
      homeTeam: "Brazil",
      awayTeam: "Japan",
      kickoffAt: "2099-07-02T20:00:00Z",
      stage: "Round of 16",
      status: "upcoming",
      dataSource: "espn",
    });
    expect(coverage.find((item) => item.key === "schedule")?.status).toBe("live");
    expect(coverage.find((item) => item.key === "score")?.status).toBe("manual");
    expect(coverage.find((item) => item.key === "lineups")?.status).toBe("missing");
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
});
