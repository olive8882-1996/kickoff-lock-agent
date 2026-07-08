import { describe, expect, it } from "vitest";
import { buildFreeDataSourceEvidencePacket } from "./freeDataSourceEvidence";
import { mergeTheSportsDbEventDetails, normalizeOpenFootballMatch, normalizeTheSportsDbEvent } from "./providers";
import type { Match, ProviderRouteAuditItem } from "./types";

const routeAudit: ProviderRouteAuditItem[] = [
  {
    key: "football-data",
    label: "Football-Data.org",
    status: "active",
    configured: true,
    detail: "free-tier token route active",
  },
  {
    key: "thesportsdb",
    label: "TheSportsDB",
    status: "active",
    configured: true,
    detail: "free route active",
  },
  {
    key: "openfootball",
    label: "openfootball",
    status: "active",
    configured: true,
    detail: "public-domain JSON active",
  },
  {
    key: "espn",
    label: "ESPN",
    status: "fallback",
    configured: true,
    detail: "public scoreboard fallback",
  },
];

describe("free data source evidence", () => {
  it("separates free-source schedule, score and lineup continuity from paid injury and odds gaps", () => {
    const base = normalizeTheSportsDbEvent({
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
      base,
      [
        { strHome: "Yes", strSubstitute: "No", strPlayer: "Raul Jimenez" },
        { strHome: "No", strSubstitute: "No", strPlayer: "Aubrey Modiba" },
      ],
      [{ strStat: "Total Shots", intHome: "16", intAway: "3" }],
    );
    const openMatch = normalizeOpenFootballMatch({
      round: "Matchday 1",
      date: "2026-06-11",
      time: "13:00 UTC-6",
      team1: "Mexico",
      team2: "South Africa",
      score: { ft: [2, 0] },
      group: "Group A",
      ground: "Mexico City",
    });

    const packet = buildFreeDataSourceEvidencePacket({
      matches: [enriched, openMatch],
      routeAudit,
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(packet.continuityReady).toBe(true);
    expect(packet.crossSourceReady).toBe(true);
    expect(packet.scheduleSourceCount).toBe(2);
    expect(packet.scoreSourceCount).toBe(2);
    expect(packet.crossSourceSamples).toEqual(expect.arrayContaining([
      "TheSportsDB:thesportsdb-2391728",
      expect.stringMatching(/^openfootball:/),
    ]));
    expect(packet.productionReady).toBe(false);
    expect(packet.signals.find((item) => item.key === "schedule")).toMatchObject({
      status: "covered",
      sampleCount: 2,
    });
    expect(packet.signals.find((item) => item.key === "score")).toMatchObject({
      status: "covered",
      sampleCount: 2,
    });
    expect(packet.signals.find((item) => item.key === "lineups")).toMatchObject({
      status: "partial",
      provider: "TheSportsDB event lineup endpoint",
    });
    expect(packet.signals.find((item) => item.key === "injuries")).toMatchObject({
      status: "not-published",
      provider: "API-Football required",
    });
    expect(packet.signals.find((item) => item.key === "odds")).toMatchObject({
      status: "not-published",
      provider: "API-Football / The Odds API required",
    });
    expect(packet.missingSignals).toEqual(expect.arrayContaining(["injuries", "odds"]));
    expect(packet.continuitySignals).toEqual(expect.arrayContaining(["schedule", "score", "rankings"]));
    expect(packet.productionGapSignals).toEqual(["lineups", "injuries", "odds"]);
    expect(packet.summary).toContain("cross-source ready");
    expect(packet.summary).toContain("production gaps lineups, injuries, odds");
    expect(packet.copyText).toContain("Cross-source continuity: yes");
    expect(packet.copyText).toContain("Production gaps: lineups, injuries, odds");
    expect(packet.nextAction).toContain("Use free routes for continuity");
    expect(packet.nextAction).toContain("lineups, injuries, odds");
  });

  it("does not treat seed/manual fixtures as free provider evidence", () => {
    const seedMatch: Match = {
      id: "seed-1",
      homeTeam: "Spain",
      awayTeam: "Austria",
      kickoffAt: "2026-07-01T20:00:00.000Z",
      stage: "Round of 16",
      status: "upcoming",
      dataSource: "seed",
    };

    const packet = buildFreeDataSourceEvidencePacket({ matches: [seedMatch], routeAudit: [] });

    expect(packet.continuityReady).toBe(false);
    expect(packet.crossSourceReady).toBe(false);
    expect(packet.freeMatchCount).toBe(0);
    expect(packet.signals.find((item) => item.key === "schedule")?.status).toBe("gap");
    expect(packet.continuitySignals).toEqual([]);
    expect(packet.productionGapSignals).toEqual(["lineups", "injuries", "odds"]);
    expect(packet.nextAction).toContain("at least two independent free schedule sources");
  });

  it("counts openfootball World Cup JSON as free schedule and score continuity", () => {
    const openMatch = normalizeOpenFootballMatch({
      round: "Matchday 1",
      date: "2026-06-11",
      time: "13:00 UTC-6",
      team1: "Mexico",
      team2: "South Africa",
      score: { ft: [2, 0] },
      group: "Group A",
      ground: "Mexico City",
    });

    const packet = buildFreeDataSourceEvidencePacket({
      matches: [openMatch],
      routeAudit,
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(packet.continuityReady).toBe(true);
    expect(packet.crossSourceReady).toBe(false);
    expect(packet.scheduleSourceCount).toBe(1);
    expect(packet.scoreSourceCount).toBe(1);
    expect(packet.routes.find((route) => route.source === "openfootball")).toMatchObject({
      active: true,
      matchCount: 1,
      capability: expect.stringContaining("no API key"),
    });
    expect(packet.signals.find((item) => item.key === "schedule")).toMatchObject({
      status: "covered",
      provider: "openfootball",
    });
    expect(packet.signals.find((item) => item.key === "score")).toMatchObject({
      status: "covered",
      provider: "openfootball",
    });
    expect(packet.continuitySignals).toEqual(expect.arrayContaining(["schedule", "score", "rankings"]));
    expect(packet.productionGapSignals).toEqual(["lineups", "injuries", "odds"]);
    expect(packet.nextAction).toContain("at least two independent free schedule sources");
  });

  it("counts Football-Data.org free-tier routes as schedule, score and standings continuity", () => {
    const match: Match = {
      id: "football-data-100",
      homeTeam: "Spain",
      awayTeam: "Austria",
      kickoffAt: "2026-07-01T20:00:00.000Z",
      stage: "Round of 16",
      status: "finished",
      dataSource: "football-data",
      homeScore: 2,
      awayScore: 1,
      venue: "MetLife Stadium",
      insights: {
        rankingSource: "Football-Data.org standings 2026",
        standingsSource: "Football-Data.org standings 2026",
        home: {
          fifaRank: 8,
          tablePosition: 1,
          tablePoints: 7,
          tableRecord: "2-1-0",
          form: ["W", "W", "D"],
          lastFiveGoalsFor: 6,
          lastFiveGoalsAgainst: 2,
          unavailable: [],
          probableLineup: [],
        },
        away: {
          fifaRank: 24,
          tablePosition: 2,
          tablePoints: 5,
          tableRecord: "1-2-0",
          form: ["W", "D", "D"],
          lastFiveGoalsFor: 4,
          lastFiveGoalsAgainst: 2,
          unavailable: [],
          probableLineup: [],
        },
        headToHead: "Football-Data.org standings read-back",
        marketLine: "Odds enrichment not loaded.",
        oddsSnapshot: "Odds enrichment not loaded.",
        dataFreshness: "Football-Data.org matches and standings read-back",
      },
    };

    const packet = buildFreeDataSourceEvidencePacket({
      matches: [match],
      routeAudit,
      checkedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(packet.continuityReady).toBe(true);
    expect(packet.freeMatchCount).toBe(1);
    expect(packet.routes.find((route) => route.source === "football-data")).toMatchObject({
      active: true,
      matchCount: 1,
      capability: expect.stringContaining("Free-tier token route"),
    });
    expect(packet.signals.find((item) => item.key === "schedule")).toMatchObject({
      status: "covered",
      provider: "Football-Data.org",
    });
    expect(packet.signals.find((item) => item.key === "score")).toMatchObject({
      status: "covered",
      provider: "Football-Data.org",
    });
    expect(packet.signals.find((item) => item.key === "rankings")).toMatchObject({
      status: "covered",
      provider: "Football-Data.org standings 2026",
    });
    expect(packet.productionReady).toBe(false);
    expect(packet.productionGapSignals).toEqual(["lineups", "injuries", "odds"]);
    expect(packet.copyText).toContain("Football-Data.org: active");
  });
});
