import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_TEST_SUITES,
  acceptanceManifestHash,
  type AcceptanceEvidencePacket,
  REQUIRED_ACCEPTANCE_COVERAGE,
  summarizeAcceptanceCoverage,
  summarizeAcceptanceRunEvidence,
} from "./acceptance";

describe("acceptance test manifest", () => {
  const passedEvidence = (): AcceptanceEvidencePacket => ({
    generatedAt: "2026-07-03T00:00:00.000Z",
    source: "local-script",
    suiteManifestHash: acceptanceManifestHash(),
    suites: ACCEPTANCE_TEST_SUITES.map((suite) => ({
      suiteId: suite.id,
      command: suite.command,
      status: "passed",
      startedAt: "2026-07-03T00:00:00.000Z",
      completedAt: "2026-07-03T00:01:00.000Z",
      durationMs: 60_000,
      exitCode: 0,
      summary: `${suite.label} passed.`,
    })),
  });

  it("covers every production acceptance test category with executable commands", () => {
    const summary = summarizeAcceptanceCoverage();

    expect(summary.complete).toBe(true);
    expect(summary.covered).toBe(REQUIRED_ACCEPTANCE_COVERAGE.length);
    expect(ACCEPTANCE_TEST_SUITES.length).toBeGreaterThanOrEqual(8);
    expect(ACCEPTANCE_TEST_SUITES.every((suite) => suite.command.startsWith("bun run "))).toBe(true);
    expect(
      ACCEPTANCE_TEST_SUITES.every(
        (suite) => suite.file.includes(".test.") || suite.file.includes("tests/e2e/") || suite.file.includes("functions/"),
      ),
    ).toBe(true);
    expect(ACCEPTANCE_TEST_SUITES.find((suite) => suite.id === "pages-functions")).toMatchObject({
      command: "bun run pages:functions:build",
      coverage: ["pages-functions"],
      file: expect.stringContaining("functions/data-proxy/[[path]].js"),
    });
    expect(ACCEPTANCE_TEST_SUITES.find((suite) => suite.id === "share-cards")).toMatchObject({
      file: expect.stringContaining("src/publicProofShareKit.test.ts"),
      proves: expect.stringContaining("public proof publication packages"),
    });
    expect(ACCEPTANCE_TEST_SUITES.find((suite) => suite.id === "cloud-account")).toMatchObject({
      file: expect.stringContaining("src/productionAccessPreflight.test.ts"),
      proves: expect.stringContaining("production account access preflight"),
    });
    expect(ACCEPTANCE_TEST_SUITES.find((suite) => suite.id === "browser-flow")).toMatchObject({
      file: expect.stringContaining("tests/e2e/app.spec.ts"),
      proves: expect.stringContaining("production account access preflight UI"),
    });
  });

  it("reports missing coverage explicitly", () => {
    const [firstSuite] = ACCEPTANCE_TEST_SUITES;
    const summary = summarizeAcceptanceCoverage([firstSuite]);

    expect(summary.complete).toBe(false);
    expect(summary.missing.length).toBeGreaterThan(0);
    expect(summary.covered).toBe(firstSuite.coverage.length);
  });

  it("requires run evidence before acceptance suites are complete", () => {
    const summary = summarizeAcceptanceRunEvidence(undefined);

    expect(summary.complete).toBe(false);
    expect(summary.passed).toBe(0);
    expect(summary.missingSuiteIds).toHaveLength(ACCEPTANCE_TEST_SUITES.length);
  });

  it("accepts matching passed run evidence for every suite", () => {
    const summary = summarizeAcceptanceRunEvidence(passedEvidence(), ACCEPTANCE_TEST_SUITES, {
      now: new Date("2026-07-03T00:05:00.000Z").getTime(),
    });

    expect(summary.complete).toBe(true);
    expect(summary.passed).toBe(ACCEPTANCE_TEST_SUITES.length);
    expect(summary.failedSuiteIds).toEqual([]);
    expect(summary.commandMismatches).toEqual([]);
    expect(summary.manifestHashMismatch).toBe(false);
    expect(summary.suiteManifestHash).toBe(acceptanceManifestHash());
  });

  it("rejects stale or failed run evidence", () => {
    const packet = passedEvidence();
    packet.suites[0] = { ...packet.suites[0], command: "bun run old-test" };
    packet.suites[1] = { ...packet.suites[1], status: "failed", exitCode: 1 };

    const summary = summarizeAcceptanceRunEvidence(packet);

    expect(summary.complete).toBe(false);
    expect(summary.commandMismatches).toContain(packet.suites[0].suiteId);
    expect(summary.failedSuiteIds).toContain(packet.suites[1].suiteId);
  });

  it("rejects run evidence older than the freshness window", () => {
    const summary = summarizeAcceptanceRunEvidence(passedEvidence(), ACCEPTANCE_TEST_SUITES, {
      now: new Date("2026-07-20T00:00:00.000Z").getTime(),
    });

    expect(summary.complete).toBe(false);
    expect(summary.evidenceStale).toBe(true);
    expect(summary.ageMs).toBeGreaterThan(summary.maxAgeMs);
  });

  it("rejects run evidence generated from an older acceptance manifest", () => {
    const missingHashPacket = passedEvidence();
    delete missingHashPacket.suiteManifestHash;
    const staleHashPacket = { ...passedEvidence(), suiteManifestHash: "acceptance-v1-old" };

    const missingHashSummary = summarizeAcceptanceRunEvidence(missingHashPacket);
    const staleHashSummary = summarizeAcceptanceRunEvidence(staleHashPacket);

    expect(missingHashSummary.complete).toBe(false);
    expect(missingHashSummary.manifestHashMismatch).toBe(true);
    expect(staleHashSummary.complete).toBe(false);
    expect(staleHashSummary.manifestHashMismatch).toBe(true);
    expect(staleHashSummary.expectedSuiteManifestHash).toBe(acceptanceManifestHash());
  });
});
