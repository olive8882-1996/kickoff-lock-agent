import { describe, expect, it } from "vitest";
import { buildIntelligenceEnrichmentEvidencePacket } from "./intelligenceEnrichmentEvidence";
import type { ProviderEnrichmentAudit, ProviderHealthSnapshot } from "./types";

const audit = (patch: Partial<ProviderEnrichmentAudit> = {}): ProviderEnrichmentAudit => ({
  source: "api-football",
  checkedAt: "2099-01-01T00:00:00.000Z",
  totalFixtures: 2,
  attemptedFixtures: 2,
  detail: "2/2 fixtures attempted · 3 live enrichment signals · 0 failed fixtures",
  endpointAudits: [
    { key: "lineups", endpoint: "fixtures/lineups", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
    { key: "injuries", endpoint: "injuries", attempted: 2, fulfilled: 2, live: 1, errors: 0, sampleIds: ["101"] },
    { key: "odds", endpoint: "odds", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101", "102"] },
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

describe("intelligence enrichment evidence packet", () => {
  it("marks lineup, injury and odds endpoint groups ready after live read-back", () => {
    const packet = buildIntelligenceEnrichmentEvidencePacket({ audit: audit(), health: health() });

    expect(packet.productionReady).toBe(true);
    expect(packet.requiredReady).toBe(3);
    expect(packet.liveSignals).toBe(5);
    expect(packet.missingSignals).toEqual([]);
    expect(packet.copyText).toContain("Lineups: 2/2 fulfilled");
    expect(packet.copyText).toContain("Missing: none");
  });

  it("does not treat missing enrichment audit as production data", () => {
    const packet = buildIntelligenceEnrichmentEvidencePacket({ health: health() });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(0);
    expect(packet.missingSignals).toEqual(["lineups", "injuries", "odds"]);
    expect(packet.items.find((item) => item.key === "odds")?.endpoint).toContain("The Odds API");
  });

  it("keeps endpoint groups incomplete when rows are empty or errors occurred", () => {
    const packet = buildIntelligenceEnrichmentEvidencePacket({
      audit: audit({
        endpointAudits: [
          { key: "lineups", endpoint: "fixtures/lineups", attempted: 2, fulfilled: 1, live: 1, errors: 1, sampleIds: ["101"] },
          { key: "injuries", endpoint: "injuries", attempted: 2, fulfilled: 2, live: 0, errors: 0, sampleIds: [] },
          { key: "odds", endpoint: "odds", attempted: 2, fulfilled: 2, live: 2, errors: 0, sampleIds: ["101"] },
        ],
      }),
      health: health(),
    });

    expect(packet.productionReady).toBe(false);
    expect(packet.requiredReady).toBe(1);
    expect(packet.missingSignals).toEqual(["lineups", "injuries"]);
    expect(packet.items.find((item) => item.key === "lineups")?.detail).toContain("1 errors");
  });
});
