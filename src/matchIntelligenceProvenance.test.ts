import { describe, expect, it } from "vitest";
import { buildMatchIntelligenceProvenancePacket } from "./matchIntelligenceProvenance";
import type { Match } from "./types";

const baseMatch = (patch: Partial<Match> = {}): Match => ({
  id: "api-football-12345",
  homeTeam: "Spain",
  awayTeam: "Austria",
  kickoffAt: "2026-07-01T19:00:00.000Z",
  stage: "Round of 16",
  status: "live",
  dataSource: "api-football",
  homeScore: 2,
  awayScore: 1,
  insights: {
    home: {
      fifaRank: 2,
      form: ["W"],
      lastFiveGoalsFor: 9,
      lastFiveGoalsAgainst: 3,
      unavailable: ["Player A"],
      probableLineup: ["GK", "CB", "ST"],
    },
    away: {
      fifaRank: 24,
      form: ["D"],
      lastFiveGoalsFor: 5,
      lastFiveGoalsAgainst: 4,
      unavailable: ["Player B"],
      probableLineup: ["GK", "LB", "FW"],
    },
    headToHead: "Spain edge",
    marketLine: "Bookmaker · odds · Spain 1.8",
    oddsSnapshot: "Spain 1.8 · Austria 4.2",
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
  ...patch,
});

describe("match intelligence provenance packet", () => {
  it("maps API-Football signals to fixture-specific enrichment endpoints", () => {
    const packet = buildMatchIntelligenceProvenancePacket(baseMatch());

    expect(packet.productionReady).toBe(true);
    expect(packet.readySignals).toBe(6);
    expect(packet.providerId).toBe("12345");
    expect(packet.items.find((item) => item.key === "lineups")?.endpoint).toBe("fixtures/lineups?fixture=12345");
    expect(packet.items.find((item) => item.key === "injuries")?.endpoint).toBe("injuries?fixture=12345");
    expect(packet.items.find((item) => item.key === "odds")?.endpoint).toBe("odds?fixture=12345");
    expect(packet.copyText).toContain("Live endpoints: 5");
  });

  it("keeps TheSportsDB injury and odds gaps visible instead of claiming full production coverage", () => {
    const packet = buildMatchIntelligenceProvenancePacket(
      baseMatch({
        id: "thesportsdb-2503636",
        dataSource: "thesportsdb",
        insights: {
          ...baseMatch().insights!,
          dataCoverage: [
            { key: "schedule", label: "Schedule", status: "live", source: "TheSportsDB", detail: "event" },
            { key: "score", label: "Score", status: "live", source: "TheSportsDB", detail: "score" },
            { key: "rankings", label: "Ranking", status: "configured", source: "FIFA", detail: "rank" },
            { key: "lineups", label: "Lineups", status: "live", source: "TheSportsDB", detail: "lineup" },
            { key: "injuries", label: "Injuries", status: "missing", source: "Not available", detail: "no injury feed" },
            { key: "odds", label: "Odds", status: "missing", source: "Not available", detail: "no odds feed" },
          ],
        },
      }),
    );

    expect(packet.productionReady).toBe(false);
    expect(packet.missingSignals).toEqual(["injuries", "odds"]);
    expect(packet.items.find((item) => item.key === "lineups")?.endpoint).toBe("lookuplineup.php?id=2503636");
    expect(packet.items.find((item) => item.key === "injuries")?.endpoint).toContain("not published");
  });

  it("marks seed continuity as auditable but not live production intelligence", () => {
    const packet = buildMatchIntelligenceProvenancePacket(
      baseMatch({
        id: "seed-brazil-japan",
        dataSource: "seed",
        status: "upcoming",
        homeScore: undefined,
        awayScore: undefined,
        insights: {
          ...baseMatch().insights!,
          marketLine: "Waiting for odds",
          oddsSnapshot: "Odds enrichment not loaded.",
          dataCoverage: [
            { key: "schedule", label: "Schedule", status: "configured", source: "Seed", detail: "fixture" },
            { key: "score", label: "Score", status: "manual", source: "Manual reveal", detail: "no final score" },
            { key: "rankings", label: "Ranking", status: "manual", source: "Bundled ranking", detail: "snapshot" },
            { key: "lineups", label: "Lineups", status: "fallback", source: "Seed pack", detail: "probable lineups" },
            { key: "injuries", label: "Injuries", status: "missing", source: "Provider required", detail: "no endpoint rows" },
            { key: "odds", label: "Odds", status: "missing", source: "Provider required", detail: "no endpoint rows" },
          ],
        },
      }),
    );

    expect(packet.productionReady).toBe(false);
    expect(packet.readySignals).toBe(1);
    expect(packet.missingSignals).toEqual(["score", "rankings", "lineups", "injuries", "odds"]);
    expect(packet.nextAction).toContain("live provider endpoint");
  });
});
