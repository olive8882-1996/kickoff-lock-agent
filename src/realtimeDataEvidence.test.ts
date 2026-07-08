import { describe, expect, it } from "vitest";
import { buildRealtimeDataEvidencePacket } from "./realtimeDataEvidence";
import type {
  Match,
  ProviderHealthSnapshot,
  ProviderReadinessItem,
  ProviderRouteAuditItem,
  RealtimeDataAudit,
} from "./types";

const readiness = (patch: Partial<ProviderReadinessItem> & Pick<ProviderReadinessItem, "key" | "status">): ProviderReadinessItem => ({
  label: patch.key,
  source: "API-Football",
  detail: "read back",
  ...patch,
});

const liveMatch: Match = {
  id: "api-football-1",
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
    away: { fifaRank: 24, form: ["D"], lastFiveGoalsFor: 5, lastFiveGoalsAgainst: 4, unavailable: ["Player B"], probableLineup: ["GK"] },
    headToHead: "Spain edge",
    marketLine: "Bookmaker h2h",
    oddsSnapshot: "Spain 1.8 · Austria 4.2",
    rankingSource: "FIFA snapshot",
    lineupSource: "API-Football lineups endpoint",
    injurySource: "API-Football injuries endpoint",
    dataFreshness: "API-Football live",
  },
};

const routeAudit: ProviderRouteAuditItem[] = [
  { key: "api-football", label: "API-Football", status: "active", configured: true, detail: "fixtures route active" },
];

const health: ProviderHealthSnapshot = {
  source: "API-Football",
  status: "verified",
  fresh: true,
  responseVerified: true,
  liveOrConfigured: 6,
  totalSignals: 6,
  activeRoute: "API-Football",
  missingSignals: [],
  evidence: ["fixture response verified"],
  detail: "verified",
  nextAction: "ready",
};

const audit: RealtimeDataAudit = {
  checkedAt: "2026-07-03T00:00:00.000Z",
  source: "api-football",
  sourceLabel: "API-Football",
  routeStatus: "active",
  responseVerified: true,
  matchCount: 1,
  liveMatches: 1,
  finishedMatches: 0,
  upcomingMatches: 0,
  productionReady: true,
  evidence: ["live fixture"],
  missingSignals: [],
  signals: [],
  samples: [],
  enrichmentAudit: {
    source: "api-football",
    checkedAt: "2026-07-03T00:00:00.000Z",
    totalFixtures: 1,
    attemptedFixtures: 1,
    detail: "all enrichment endpoints read back",
    endpointAudits: [
      { key: "lineups", endpoint: "fixtures/lineups", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["1"] },
      { key: "injuries", endpoint: "injuries", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["1"] },
      { key: "odds", endpoint: "odds", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["1"] },
      { key: "standings", endpoint: "standings", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["1"] },
    ],
  },
};

describe("realtime data evidence packet", () => {
  it("passes only when route, response and all required endpoint-backed signals are verified", () => {
    const packet = buildRealtimeDataEvidencePacket({
      matches: [liveMatch],
      readiness: [
        readiness({ key: "schedule", label: "Schedule", status: "live" }),
        readiness({ key: "score", label: "Score", status: "live" }),
        readiness({ key: "rankings", label: "Rankings", status: "configured", source: "FIFA snapshot" }),
        readiness({ key: "lineups", label: "Lineups", status: "live" }),
        readiness({ key: "injuries", label: "Injuries", status: "live" }),
        readiness({ key: "odds", label: "Odds", status: "live" }),
      ],
      routeAudit,
      health,
      audit,
    });

    expect(packet.productionReady).toBe(true);
    expect(packet.requiredReady).toBe(6);
    expect(packet.fixtures).toHaveLength(1);
    expect(packet.fixtures[0]).toMatchObject({
      id: "api-football-1",
      readySignals: 6,
      totalSignals: 6,
      productionReady: true,
    });
    expect(packet.missingSignals).toEqual([]);
    expect(packet.summary).toContain("1/1 target fixtures ready");
    expect(packet.copyText).toContain("Kickoff Lock Agent realtime data evidence");
    expect(packet.copyText).toContain("Target fixtures");
  });

  it("keeps seed and unverified enrichment out of production-ready evidence", () => {
    const packet = buildRealtimeDataEvidencePacket({
      matches: [
        {
          ...liveMatch,
          id: "seed-1",
          dataSource: "seed",
          status: "upcoming",
          homeScore: undefined,
          awayScore: undefined,
        },
      ],
      readiness: [
        readiness({ key: "schedule", status: "fallback", source: "Seed" }),
        readiness({ key: "score", status: "manual", source: "Manual reveal" }),
        readiness({ key: "rankings", status: "configured", source: "FIFA snapshot" }),
        readiness({ key: "lineups", status: "live", source: "TheSportsDB" }),
        readiness({ key: "injuries", status: "missing", source: "Not available" }),
        readiness({ key: "odds", status: "live", source: "Odds feed" }),
      ],
      routeAudit: [{ key: "seed", label: "Seed", status: "fallback", configured: true, detail: "offline continuity" }],
      health: { ...health, status: "partial", fresh: false, responseVerified: false },
      audit: {
        ...audit,
        source: "seed",
        sourceLabel: "Seed",
        routeStatus: "fallback",
        responseVerified: false,
        productionReady: false,
        enrichmentAudit: undefined,
      },
    });

    expect(packet.productionReady).toBe(false);
    expect(packet.fixtures[0]?.productionReady).toBe(false);
    expect(packet.fixtures[0]?.missingSignals).toEqual(expect.arrayContaining(["schedule", "score", "rankings", "lineups", "injuries", "odds"]));
    expect(packet.missingSignals).toEqual(expect.arrayContaining(["schedule", "score", "rankings", "lineups", "injuries", "odds"]));
    expect(packet.signals.find((item) => item.key === "rankings")?.status).toBe("unverified");
    expect(packet.signals.find((item) => item.key === "odds")?.status).toBe("unverified");
    expect(packet.nextAction).toContain("Fill");
  });

  it("fails production readiness when any target fixture lacks row-level evidence", () => {
    const thinMatch: Match = {
      ...liveMatch,
      id: "api-football-2",
      homeTeam: "Brazil",
      awayTeam: "Japan",
      homeScore: undefined,
      awayScore: undefined,
      status: "upcoming",
      insights: {
        ...liveMatch.insights!,
        oddsSnapshot: undefined,
        marketLine: "Odds enrichment not loaded.",
        dataCoverage: undefined,
      },
    };
    const packet = buildRealtimeDataEvidencePacket({
      matches: [liveMatch, thinMatch],
      readiness: [
        readiness({ key: "schedule", label: "Schedule", status: "live" }),
        readiness({ key: "score", label: "Score", status: "live" }),
        readiness({ key: "rankings", label: "Rankings", status: "configured", source: "FIFA snapshot" }),
        readiness({ key: "lineups", label: "Lineups", status: "live" }),
        readiness({ key: "injuries", label: "Injuries", status: "live" }),
        readiness({ key: "odds", label: "Odds", status: "live" }),
      ],
      routeAudit,
      health,
      audit,
    });

    expect(packet.requiredReady).toBe(6);
    expect(packet.productionReady).toBe(false);
    expect(packet.summary).toContain("1/2 target fixtures ready");
    expect(packet.fixtures.find((fixture) => fixture.id === "api-football-2")).toMatchObject({
      readySignals: 4,
      totalSignals: 6,
      productionReady: false,
    });
    expect(packet.fixtures.find((fixture) => fixture.id === "api-football-2")?.missingSignals).toEqual(["score", "odds"]);
    expect(packet.nextAction).toContain("fixture row gaps");
  });

  it("requires endpoint read-back to cover every attempted target fixture before marking a signal production-ready", () => {
    const packet = buildRealtimeDataEvidencePacket({
      matches: [liveMatch],
      readiness: [
        readiness({ key: "schedule", label: "Schedule", status: "live" }),
        readiness({ key: "score", label: "Score", status: "live" }),
        readiness({ key: "rankings", label: "Rankings", status: "configured", source: "FIFA snapshot" }),
        readiness({ key: "lineups", label: "Lineups", status: "live" }),
        readiness({ key: "injuries", label: "Injuries", status: "live" }),
        readiness({ key: "odds", label: "Odds", status: "live" }),
      ],
      routeAudit,
      health,
      audit: {
        ...audit,
        enrichmentAudit: {
          ...audit.enrichmentAudit!,
          totalFixtures: 2,
          attemptedFixtures: 2,
          endpointAudits: [
            { key: "lineups", endpoint: "fixtures/lineups", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["1", "2"] },
            { key: "injuries", endpoint: "injuries", attempted: 2, fulfilled: 2, live: 1, errors: 0, sampleIds: ["1"] },
            { key: "odds", endpoint: "odds", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["1", "2"] },
            { key: "standings", endpoint: "standings", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["1", "2"] },
          ],
        },
      },
    });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(5);
    expect(packet.missingSignals).toEqual(["injuries"]);
    expect(packet.signals.find((item) => item.key === "injuries")).toMatchObject({
      status: "unverified",
      productionReady: false,
    });
    expect(packet.fixtures[0]?.missingSignals).toContain("injuries");
  });

  it("requires standings endpoint read-back before static rankings count as production-ready", () => {
    const packet = buildRealtimeDataEvidencePacket({
      matches: [liveMatch],
      readiness: [
        readiness({ key: "schedule", label: "Schedule", status: "live" }),
        readiness({ key: "score", label: "Score", status: "live" }),
        readiness({ key: "rankings", label: "Rankings", status: "configured", source: "FIFA snapshot" }),
        readiness({ key: "lineups", label: "Lineups", status: "live" }),
        readiness({ key: "injuries", label: "Injuries", status: "live" }),
        readiness({ key: "odds", label: "Odds", status: "live" }),
      ],
      routeAudit,
      health,
      audit: {
        ...audit,
        enrichmentAudit: {
          ...audit.enrichmentAudit!,
          endpointAudits: audit.enrichmentAudit!.endpointAudits.filter((endpoint) => endpoint.key !== "standings"),
        },
      },
    });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(5);
    expect(packet.missingSignals).toEqual(["rankings"]);
    expect(packet.signals.find((item) => item.key === "rankings")).toMatchObject({
      status: "unverified",
      productionReady: false,
      provider: "FIFA snapshot",
    });
    expect(packet.fixtures[0]).toMatchObject({
      readySignals: 5,
      productionReady: false,
      missingSignals: ["rankings"],
    });
  });

  it("does not trust forged live coverage when the match intelligence is placeholder text", () => {
    const packet = buildRealtimeDataEvidencePacket({
      matches: [
        {
          ...liveMatch,
          id: "api-football-placeholder",
          insights: {
            home: {
              ...liveMatch.insights!.home,
              unavailable: ["Configure injury provider"],
              probableLineup: ["Lineup not published by this provider"],
            },
            away: {
              ...liveMatch.insights!.away,
              unavailable: ["Configure injury provider"],
              probableLineup: ["Lineup not published by this provider"],
            },
            headToHead: "Spain edge",
            marketLine: "TheSportsDB does not publish betting odds; enrich with The Odds API for markets.",
            oddsSnapshot: "Odds enrichment not loaded.",
            rankingSource: "FIFA snapshot",
            lineupSource: "API-Football lineups endpoint",
            injurySource: "No injury feed configured for this source",
            dataFreshness: "API-Football live",
            dataCoverage: [
              { key: "schedule", label: "Schedule", status: "live", source: "API-Football", detail: "fixture row" },
              { key: "score", label: "Score", status: "live", source: "API-Football", detail: "2-1" },
              { key: "rankings", label: "Rankings", status: "configured", source: "FIFA snapshot", detail: "ranked" },
              { key: "lineups", label: "Lineups", status: "live", source: "API-Football", detail: "claimed live" },
              { key: "injuries", label: "Injuries", status: "live", source: "API-Football", detail: "claimed live" },
              { key: "odds", label: "Odds", status: "live", source: "API-Football", detail: "claimed live" },
            ],
          },
        },
      ],
      readiness: [
        readiness({ key: "schedule", label: "Schedule", status: "live" }),
        readiness({ key: "score", label: "Score", status: "live" }),
        readiness({ key: "rankings", label: "Rankings", status: "configured", source: "FIFA snapshot" }),
        readiness({ key: "lineups", label: "Lineups", status: "live" }),
        readiness({ key: "injuries", label: "Injuries", status: "live" }),
        readiness({ key: "odds", label: "Odds", status: "live" }),
      ],
      routeAudit,
      health,
      audit,
    });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(3);
    expect(packet.missingSignals).toEqual(["lineups", "injuries", "odds"]);
    expect(packet.signals.find((item) => item.key === "lineups")).toMatchObject({
      status: "unverified",
      productionReady: false,
      sample: "no production sample",
    });
    expect(packet.fixtures[0]).toMatchObject({
      productionReady: false,
      missingSignals: ["lineups", "injuries", "odds"],
    });
  });
});
