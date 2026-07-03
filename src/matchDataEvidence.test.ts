import { describe, expect, it } from "vitest";
import { buildMatchDataEvidencePacket } from "./matchDataEvidence";
import type { Match } from "./types";

describe("match data evidence packet", () => {
  it("summarizes production-ready match intelligence signals", () => {
    const match: Match = {
      id: "match-1",
      homeTeam: "Spain",
      awayTeam: "Austria",
      kickoffAt: "2026-07-01T19:00:00.000Z",
      stage: "Round of 16",
      status: "live",
      dataSource: "api-football",
      homeScore: 2,
      awayScore: 1,
      insights: {
        home: { fifaRank: 2, form: ["W"], lastFiveGoalsFor: 9, lastFiveGoalsAgainst: 3, unavailable: ["Player A"], probableLineup: ["GK"] },
        away: { fifaRank: 24, form: ["D"], lastFiveGoalsFor: 5, lastFiveGoalsAgainst: 4, unavailable: [], probableLineup: ["GK"] },
        headToHead: "Spain edge",
        marketLine: "Spain 1.8",
        oddsSnapshot: "Spain 1.8",
        rankingSource: "FIFA snapshot",
        lineupSource: "API-Football endpoint",
        injurySource: "API-Football endpoint",
        dataFreshness: "API-Football live",
        dataCoverage: [
          { key: "schedule", label: "Schedule", status: "live", source: "API-Football", detail: "fixture" },
          { key: "score", label: "Score", status: "live", source: "API-Football", detail: "score" },
          { key: "rankings", label: "Ranking", status: "configured", source: "FIFA", detail: "rank" },
          { key: "lineups", label: "Lineups", status: "live", source: "API-Football", detail: "lineups" },
          { key: "injuries", label: "Injuries", status: "live", source: "API-Football", detail: "injuries" },
          { key: "odds", label: "Odds", status: "live", source: "API-Football", detail: "odds" },
        ],
      },
    };

    const packet = buildMatchDataEvidencePacket(match);

    expect(packet.readySignals).toBe(6);
    expect(packet.missingSignals).toEqual([]);
    expect(packet.liveSignals).toEqual(["schedule", "score", "lineups", "injuries", "odds"]);
    expect(packet.summary).toContain("6/6 production signals");
  });

  it("keeps manual and missing coverage out of production-ready counts", () => {
    const packet = buildMatchDataEvidencePacket({
      id: "match-2",
      homeTeam: "Brazil",
      awayTeam: "Japan",
      kickoffAt: "2026-07-02T19:00:00.000Z",
      stage: "Quarterfinal",
      status: "upcoming",
      dataSource: "seed",
      insights: {
        home: { fifaRank: 5, form: ["W"], lastFiveGoalsFor: 7, lastFiveGoalsAgainst: 3, unavailable: [], probableLineup: ["GK"] },
        away: { fifaRank: 16, form: ["L"], lastFiveGoalsFor: 4, lastFiveGoalsAgainst: 5, unavailable: [], probableLineup: ["GK"] },
        headToHead: "No live read-back",
        marketLine: "Waiting for odds",
        dataFreshness: "Seed fixture evidence",
        dataCoverage: [
          { key: "schedule", label: "Schedule", status: "configured", source: "Seed", detail: "fixture" },
          { key: "score", label: "Score", status: "missing", source: "Manual reveal", detail: "no final score" },
          { key: "rankings", label: "Ranking", status: "manual", source: "Bundled ranking", detail: "snapshot" },
          { key: "lineups", label: "Lineups", status: "fallback", source: "Seed pack", detail: "probable lineups" },
          { key: "injuries", label: "Injuries", status: "missing", source: "Provider required", detail: "no endpoint rows" },
          { key: "odds", label: "Odds", status: "missing", source: "Provider required", detail: "no endpoint rows" },
        ],
      },
    });

    expect(packet.readySignals).toBe(1);
    expect(packet.fallbackSignals).toEqual(["lineups"]);
    expect(packet.missingSignals).toEqual(expect.arrayContaining(["score", "rankings", "injuries", "odds"]));
    expect(packet.nextAction).toContain("Fill");
  });
});
