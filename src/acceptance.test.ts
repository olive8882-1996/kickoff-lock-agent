import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_TEST_SUITES,
  REQUIRED_ACCEPTANCE_COVERAGE,
  summarizeAcceptanceCoverage,
} from "./acceptance";

describe("acceptance test manifest", () => {
  it("covers every production acceptance test category with executable commands", () => {
    const summary = summarizeAcceptanceCoverage();

    expect(summary.complete).toBe(true);
    expect(summary.covered).toBe(REQUIRED_ACCEPTANCE_COVERAGE.length);
    expect(ACCEPTANCE_TEST_SUITES.length).toBeGreaterThanOrEqual(8);
    expect(ACCEPTANCE_TEST_SUITES.every((suite) => suite.command.startsWith("bun run "))).toBe(true);
    expect(ACCEPTANCE_TEST_SUITES.every((suite) => suite.file.includes(".test.") || suite.file.includes("tests/e2e/"))).toBe(true);
  });

  it("reports missing coverage explicitly", () => {
    const [firstSuite] = ACCEPTANCE_TEST_SUITES;
    const summary = summarizeAcceptanceCoverage([firstSuite]);

    expect(summary.complete).toBe(false);
    expect(summary.missing.length).toBeGreaterThan(0);
    expect(summary.covered).toBe(firstSuite.coverage.length);
  });
});
