import { describe, expect, it } from "vitest";
import { buildIntelligenceEnrichmentEvidencePacket } from "./intelligenceEnrichmentEvidence";
import type { Match, ProviderEnrichmentAudit, ProviderHealthSnapshot } from "./types";

const audit = (patch: Partial<ProviderEnrichmentAudit> = {}): ProviderEnrichmentAudit => ({
  source: "api-football",
  checkedAt: "2099-01-01T00:00:00.000Z",
  totalFixtures: 2,
  attemptedFixtures: 2,
  detail: "2/2 fixtures attempted · 3 live enrichment signals · 0 failed fixtures",
  endpointAudits: [
    { key: "lineups", endpoint: "fixtures/lineups", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
    { key: "injuries", endpoint: "injuries", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
    { key: "odds", endpoint: "odds", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
    { key: "standings", endpoint: "standings", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
  ],
  ...patch,
});

const health = (patch: Partial<ProviderHealthSnapshot> = {}): ProviderHealthSnapshot => ({
  source: "API-Football",
  status: "verified",
  lastSyncedAt: "2099-01-01T00:00:00.000Z",
  ageSeconds: 3,
  fresh: true,
  responseVerified: true,
  liveOrConfigured: 6,
  totalSignals: 6,
  activeRoute: "API-Football",
  missingSignals: [],
  evidence: [],
  detail: "API-Football · verified",
  nextAction: "ready",
  ...patch,
});

const liveMatch = (patch: Partial<Match> = {}): Match => ({
  id: "api-football-101",
  homeTeam: "Spain",
  awayTeam: "Austria",
  kickoffAt: "2099-01-01T20:00:00.000Z",
  stage: "Round of 16",
  status: "live",
  dataSource: "api-football",
  homeScore: 2,
  awayScore: 1,
  insights: {
    home: {
      fifaRank: 2,
      tablePosition: 1,
      tablePoints: 9,
      form: ["W"],
      lastFiveGoalsFor: 9,
      lastFiveGoalsAgainst: 3,
      unavailable: ["Player A"],
      probableLineup: ["Goalkeeper A"],
    },
    away: {
      fifaRank: 24,
      tablePosition: 2,
      tablePoints: 6,
      form: ["D"],
      lastFiveGoalsFor: 5,
      lastFiveGoalsAgainst: 4,
      unavailable: ["Player B"],
      probableLineup: ["Goalkeeper B"],
    },
    headToHead: "Spain edge",
    marketLine: "Bookmaker h2h",
    oddsSnapshot: "Spain 1.8 · Austria 4.2",
    rankingSource: "FIFA snapshot",
    standingsSource: "API-Football standings endpoint",
    lineupSource: "API-Football lineups endpoint",
    injurySource: "API-Football injuries endpoint",
    dataFreshness: "API-Football live",
  },
  ...patch,
});

describe("intelligence enrichment evidence packet", () => {
  it("marks lineup, injury, odds and standings endpoint groups ready after live read-back", () => {
    const packet = buildIntelligenceEnrichmentEvidencePacket({ audit: audit(), health: health() });

    expect(packet.productionReady).toBe(true);
    expect(packet.requiredReady).toBe(4);
    expect(packet.liveSignals).toBe(8);
    expect(packet.qualityIssueCount).toBe(0);
    expect(packet.missingSignals).toEqual([]);
    expect(packet.copyText).toContain("Lineups: 2/2 fulfilled");
    expect(packet.copyText).toContain("Standings: 2/2 fulfilled");
    expect(packet.copyText).toContain("Missing: none");
  });

  it("does not treat missing enrichment audit as production data", () => {
    const packet = buildIntelligenceEnrichmentEvidencePacket({ health: health() });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(0);
    expect(packet.missingSignals).toEqual(["lineups", "injuries", "odds", "rankings"]);
    expect(packet.items.find((item) => item.key === "odds")?.endpoint).toContain("The Odds API");
    expect(packet.items.find((item) => item.key === "standings")?.endpoint).toContain("standings");
  });

  it("keeps endpoint groups incomplete when rows are empty or errors occurred", () => {
    const packet = buildIntelligenceEnrichmentEvidencePacket({
      audit: audit({
        endpointAudits: [
          { key: "lineups", endpoint: "fixtures/lineups", attempted: 2, fulfilled: 1, live: 1, errors: 1, sampleIds: ["101"] },
          { key: "injuries", endpoint: "injuries", attempted: 2, fulfilled: 2, live: 0, errors: 0, sampleIds: [] },
          { key: "odds", endpoint: "odds", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101"] },
          { key: "standings", endpoint: "standings", attempted: 2, fulfilled: 2, live: 1, errors: 0, sampleIds: ["101"] },
        ],
      }),
      health: health(),
    });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(1);
    expect(packet.missingSignals).toEqual(["lineups", "injuries", "rankings"]);
    expect(packet.items.find((item) => item.key === "lineups")?.detail).toContain("1 errors");
  });

  it("requires live endpoint rows for every attempted target fixture", () => {
    const packet = buildIntelligenceEnrichmentEvidencePacket({
      audit: audit({
        endpointAudits: [
          { key: "lineups", endpoint: "fixtures/lineups", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
          { key: "injuries", endpoint: "injuries", attempted: 2, fulfilled: 2, live: 1, errors: 0, sampleIds: ["101"] },
          { key: "odds", endpoint: "odds", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
          { key: "standings", endpoint: "standings", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
        ],
      }),
      health: health(),
    });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(3);
    expect(packet.missingSignals).toEqual(["injuries"]);
    expect(packet.items.find((item) => item.key === "injuries")).toMatchObject({
      productionReady: false,
      detail: "2/2 fulfilled · 1 live · 1 content samples · 0 errors",
    });
  });

  it("does not trust live endpoint counts when match content still contains placeholders", () => {
    const packet = buildIntelligenceEnrichmentEvidencePacket({
      audit: audit({
        attemptedFixtures: 1,
        totalFixtures: 1,
        endpointAudits: [
          { key: "lineups", endpoint: "fixtures/lineups", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["101"] },
          { key: "injuries", endpoint: "injuries", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["101"] },
          { key: "odds", endpoint: "odds", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["101"] },
          { key: "standings", endpoint: "standings", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["101"] },
        ],
      }),
      health: health(),
      matches: [
        liveMatch({
          insights: {
            ...liveMatch().insights!,
            home: {
              ...liveMatch().insights!.home,
              probableLineup: ["Lineup enrichment not yet loaded"],
              unavailable: ["Configure injury provider"],
            },
            away: {
              ...liveMatch().insights!.away,
              probableLineup: ["Lineup enrichment not yet loaded"],
              unavailable: ["Configure injury provider"],
            },
            marketLine: "Market data waits for odds enrichment.",
            oddsSnapshot: "Odds enrichment not loaded.",
            lineupSource: "API-Football fixture feed only; lineups endpoint not yet loaded",
            injurySource: "No injury feed configured for this source",
          },
        }),
      ],
    });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(1);
    expect(packet.qualityIssueCount).toBe(3);
    expect(packet.missingSignals).toEqual(["lineups", "injuries", "odds"]);
    expect(packet.items.find((item) => item.key === "lineups")).toMatchObject({
      contentSamples: 0,
      productionReady: false,
    });
    expect(packet.items.find((item) => item.key === "standings")).toMatchObject({
      contentSamples: 1,
      productionReady: true,
    });
    expect(packet.copyText).toContain("Content quality issues: 3");
    expect(packet.copyText).toContain("Quality: Lineups audit reported 1 live row");
  });

  it("does not accept configured odds endpoint copy as production odds content", () => {
    const packet = buildIntelligenceEnrichmentEvidencePacket({
      audit: audit({
        attemptedFixtures: 1,
        totalFixtures: 1,
        endpointAudits: [
          { key: "lineups", endpoint: "fixtures/lineups", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["101"] },
          { key: "injuries", endpoint: "injuries", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["101"] },
          { key: "odds", endpoint: "odds", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["101"] },
          { key: "standings", endpoint: "standings", attempted: 1, fulfilled: 1, live: 1, errors: 0, sampleIds: ["101"] },
        ],
      }),
      health: health(),
      matches: [
        liveMatch({
          insights: {
            ...liveMatch().insights!,
            marketLine: "Odds endpoint configured",
            oddsSnapshot: undefined,
          },
        }),
      ],
    });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(3);
    expect(packet.missingSignals).toEqual(["odds"]);
    expect(packet.items.find((item) => item.key === "odds")).toMatchObject({
      contentSamples: 0,
      productionReady: false,
    });
    expect(packet.copyText).toContain("Quality: Odds audit reported 1 live row");
  });
});
