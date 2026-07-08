import { describe, expect, it } from "vitest";
import { buildDataContinuityEvidencePacket } from "./dataContinuityEvidence";
import type { Match, ProviderHealthSnapshot, ProviderResponseAudit, ProviderRouteAuditItem } from "./types";

const externalMatch: Match = {
  id: "thesportsdb-1",
  homeTeam: "Mexico",
  awayTeam: "South Africa",
  kickoffAt: "2026-06-11T19:00:00.000Z",
  stage: "Group matchday 1",
  status: "finished",
  dataSource: "thesportsdb",
  homeScore: 2,
  awayScore: 0,
  venue: "Estadio Azteca",
};

const seedMatch: Match = {
  id: "seed-1",
  homeTeam: "Brazil",
  awayTeam: "Japan",
  kickoffAt: "2026-07-02T19:00:00.000Z",
  stage: "Round of 16",
  status: "upcoming",
  dataSource: "seed",
};

const responseAudit: ProviderResponseAudit = {
  source: "thesportsdb",
  endpoint: "eventsseason 4429/2026",
  status: "ok",
  httpStatus: 200,
  checkedAt: "2026-07-03T00:00:00.000Z",
  rowCount: 12,
  sampleIds: ["2391728"],
  durationMs: 180,
  detail: "12 rows returned",
};

const health: ProviderHealthSnapshot = {
  source: "TheSportsDB",
  status: "ready",
  fresh: true,
  responseVerified: true,
  liveOrConfigured: 4,
  totalSignals: 6,
  activeRoute: "TheSportsDB",
  missingSignals: ["injuries", "odds"],
  evidence: ["12 rows returned"],
  detail: "ready",
  nextAction: "Fill enrichment.",
};

const routes: ProviderRouteAuditItem[] = [
  { key: "api-football", label: "API-Football", configured: false, status: "needs-config", detail: "missing key" },
  { key: "football-data", label: "Football-Data.org", configured: false, status: "needs-config", detail: "missing token" },
  { key: "thesportsdb", label: "TheSportsDB", configured: true, status: "active", detail: "eventsseason route active" },
  { key: "openfootball", label: "openfootball", configured: true, status: "skipped", detail: "Not needed after TheSportsDB returned matches." },
  { key: "espn", label: "ESPN", configured: true, status: "skipped", detail: "Not needed after TheSportsDB returned matches." },
  { key: "worldcup26", label: "worldcup26", configured: true, status: "skipped", detail: "Not needed after TheSportsDB returned matches." },
  { key: "seed", label: "Seed continuity", configured: true, status: "skipped", detail: "Seed upcoming rows merged." },
];

describe("data continuity evidence", () => {
  it("marks free-feed continuity ready when an external free provider is verified and seed rows only supplement schedule", () => {
    const packet = buildDataContinuityEvidencePacket({
      matches: [externalMatch, seedMatch],
      routeAudit: routes,
      health,
      responseAudit,
      evidence: ["12 TheSportsDB World Cup events normalized", "1 seed upcoming matches merged for schedule continuity"],
    });

    expect(packet.continuityReady).toBe(true);
    expect(packet.externalMatches).toBe(1);
    expect(packet.seedMatches).toBe(1);
    expect(packet.scoreReady).toBe(1);
    expect(packet.checks.find((check) => check.key === "score-coverage")?.status).toBe("passed");
    expect(packet.copyText).toContain("free data continuity evidence");
  });

  it("does not pass continuity when the board is served only by seed fallback", () => {
    const packet = buildDataContinuityEvidencePacket({
      matches: [seedMatch],
      routeAudit: [
        { key: "thesportsdb", label: "TheSportsDB", configured: true, status: "failed", detail: "network error" },
        { key: "openfootball", label: "openfootball", configured: true, status: "failed", detail: "network error" },
        { key: "espn", label: "ESPN", configured: true, status: "failed", detail: "network error" },
        { key: "seed", label: "Seed continuity", configured: true, status: "fallback", detail: "Offline seed data is serving the board." },
      ],
      health: { ...health, source: "Seed", status: "partial", fresh: false, responseVerified: false, activeRoute: "Seed" },
      responseAudit: { ...responseAudit, source: "seed", status: "fallback", rowCount: 1 },
      evidence: ["Bundled offline seed schedule", "1 seed matches loaded"],
    });

    expect(packet.continuityReady).toBe(false);
    expect(packet.externalMatches).toBe(0);
    expect(packet.checks.find((check) => check.key === "primary-free-feed")?.status).toBe("failed");
    expect(packet.nextAction).toContain("TheSportsDB, openfootball or ESPN");
  });
});
