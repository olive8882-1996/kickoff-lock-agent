import { describe, expect, it } from "vitest";
import { loadSeedMatches, mergeOddsIntoMatch, normalizeFootballDataMatch, sourceLabel } from "./providers";
import type { Match } from "./types";

describe("provider metadata", () => {
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
    expect(match.insights?.lineupSource).toContain("Football-Data.org");
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
  });
});
