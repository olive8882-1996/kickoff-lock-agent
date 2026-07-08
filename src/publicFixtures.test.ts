import { describe, expect, it } from "vitest";
import {
  fixturePublicModeRun,
  fixturePublicProfile,
  fixturePublicRecord,
  fixturePublicShareArtifact,
  isProductionPublicFixtures,
  loadProductionPublicFixtures,
  productionPublicFixturesUrl,
  type ProductionPublicFixtures,
} from "./publicFixtures";

const fixtures: ProductionPublicFixtures = {
  generatedAt: "2026-07-04T00:00:00.000Z",
  source: "production-target-seed",
  profile: {
    id: "profile-1",
    email: "seed@example.com",
    displayName: "Seed Analyst",
    location: "Chengdu",
    friendCode: "chengdu",
    records: [],
    modeRuns: [],
    shareArtifacts: [],
    locks: 1,
    revealed: 1,
    modeProofs: 1,
    averageScore: 92,
    bestScore: 92,
    xp: 302,
  },
  record: {
    capsule: {
      id: "cap-1",
      matchId: "match-1",
      matchLabel: "Brazil vs Japan",
      kickoffAt: "2026-06-20T19:00:00.000Z",
      createdAt: "2026-07-04T00:00:00.000Z",
      sealedAt: "2026-07-04T00:00:00.000Z",
      prediction: {
        homeScore: 2,
        awayScore: 1,
        winner: "Brazil",
        keyPlayers: [],
        confidence: 72,
        style: "analysis",
        reasoning: "Seed",
        agentSummary: "Seed",
        markets: [],
      },
      payloadHash: "a".repeat(64),
      filecoinProof: {
        mode: "demo",
        cid: "bafy-seed-proof",
        pieceCid: "piece",
        provider: "seed",
        dataSetId: "seed",
        proofStatus: "retrievable",
      },
      locked: true,
      lateLock: false,
    },
  },
  modeRun: {
    id: "mode-1",
    modeId: "bracket",
    title: "Production bracket",
    createdAt: "2026-07-04T00:00:00.000Z",
    capsuleIds: ["cap-1"],
    payloadHash: "b".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: "bafy-mode-proof",
      pieceCid: "piece",
      provider: "seed",
      dataSetId: "seed",
      proofStatus: "retrievable",
    },
    status: "scored",
    score: 88,
    summary: "Seed mode",
    requirements: [],
  },
  modeRuns: [],
  shareArtifacts: [
    {
      id: "cap-1",
      kind: "record",
      proofUrl: "https://example.com/?proof=cap-1",
      imageGenerated: true,
      imageUrl: "https://example.com/card.png",
      imageMime: "image/png",
      imageByteLength: 100000,
      imageHash: "c".repeat(64),
    },
  ],
};
fixtures.profile.records = [fixtures.record];
fixtures.profile.modeRuns = [fixtures.modeRun];
fixtures.profile.shareArtifacts = fixtures.shareArtifacts;
fixtures.modeRuns = [fixtures.modeRun];

describe("production public fixtures", () => {
  it("builds a public fixture URL from the app base path", () => {
    expect(productionPublicFixturesUrl("/kickoff-lock-agent/", "https://example.com/kickoff-lock-agent/")).toBe(
      "https://example.com/kickoff-lock-agent/production-public-fixtures.json",
    );
  });

  it("validates and finds fixture records, modes, profiles and share artifacts", () => {
    expect(isProductionPublicFixtures(fixtures)).toBe(true);
    expect(fixturePublicRecord(fixtures, "cap-1")?.capsule.matchLabel).toBe("Brazil vs Japan");
    expect(fixturePublicModeRun(fixtures, "mode-1")?.title).toBe("Production bracket");
    expect(fixturePublicProfile(fixtures, "profile-1")?.displayName).toBe("Seed Analyst");
    expect(fixturePublicShareArtifact(fixtures, "cap-1", "record")?.imageUrl).toContain("card.png");
    expect(fixturePublicShareArtifact(fixtures, "cap-1", "mode")).toBeUndefined();
  });

  it("loads fixtures through fetch without accepting malformed packets", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify(fixtures), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const malformedFetcher = async () =>
      new Response(JSON.stringify({ source: "production-target-seed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await expect(loadProductionPublicFixtures("/", fetcher as typeof fetch)).resolves.toMatchObject({
      profile: { id: "profile-1" },
    });
    await expect(loadProductionPublicFixtures("/", malformedFetcher as typeof fetch)).resolves.toBeUndefined();
  });
});
