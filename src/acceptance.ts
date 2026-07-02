export type AcceptanceCoverageKey =
  | "scoring"
  | "proof-hash"
  | "cloud-readback"
  | "providers"
  | "share-cards"
  | "filecoin-api"
  | "modes"
  | "browser-e2e"
  | "seal-e2e";

export type AcceptanceTestSuite = {
  id: string;
  label: string;
  command: string;
  file: string;
  coverage: AcceptanceCoverageKey[];
  proves: string;
};

export const ACCEPTANCE_TEST_SUITES: AcceptanceTestSuite[] = [
  {
    id: "scoring-proof",
    label: "Prediction scoring and proof hash",
    command: "bun run test",
    file: "src/scoring.test.ts, src/proof.test.ts",
    coverage: ["scoring", "proof-hash"],
    proves: "score breakdown rules, exact-score bonuses, market scoring and stable capsule payload hashes",
  },
  {
    id: "cloud-account",
    label: "Cloud account and read-back",
    command: "bun run test",
    file: "src/cloud.test.ts, src/readiness.test.ts",
    coverage: ["cloud-readback"],
    proves: "Supabase session handling, history merge, leaderboard scope checks and strict cloud read-back readiness",
  },
  {
    id: "live-data",
    label: "Live data providers",
    command: "bun run test",
    file: "src/providers.test.ts",
    coverage: ["providers"],
    proves: "provider routing, fallback behavior, live-data readiness and odds enrichment merging",
  },
  {
    id: "share-cards",
    label: "Public share cards",
    command: "bun run test",
    file: "src/shareCard.test.ts",
    coverage: ["share-cards"],
    proves: "proof text, X intent URLs, generated social card payloads and native-share capability detection",
  },
  {
    id: "filecoin-api",
    label: "Filecoin API contract",
    command: "bun run test",
    file: "src/filecoinSeal.test.ts, src/filecoinSealApi.test.ts",
    coverage: ["filecoin-api"],
    proves: "seal API health, upload payload hash matching, CID lookup and proof registry behavior",
  },
  {
    id: "game-modes",
    label: "Tournament game modes",
    command: "bun run test",
    file: "src/modes.test.ts, src/bracket.test.ts",
    coverage: ["modes"],
    proves: "bracket, parlay, Agent vs Human and upset proof readiness rules",
  },
  {
    id: "browser-flow",
    label: "Full browser workflow",
    command: "bun run test:e2e",
    file: "tests/e2e/app.spec.ts",
    coverage: ["browser-e2e"],
    proves: "match selection, prediction lock, memory, account, profile, public proof, share image and verifier flow",
  },
  {
    id: "seal-flow",
    label: "One-click seal workflow",
    command: "bun run test:e2e:seal",
    file: "tests/e2e/seal.spec.ts",
    coverage: ["seal-e2e"],
    proves: "browser one-click seal, mock seal API upload, CID verification and missing-CID handling",
  },
];

export const REQUIRED_ACCEPTANCE_COVERAGE: AcceptanceCoverageKey[] = [
  "scoring",
  "proof-hash",
  "cloud-readback",
  "providers",
  "share-cards",
  "filecoin-api",
  "modes",
  "browser-e2e",
  "seal-e2e",
];

export const summarizeAcceptanceCoverage = (suites = ACCEPTANCE_TEST_SUITES) => {
  const covered = new Set<AcceptanceCoverageKey>(suites.flatMap((suite) => suite.coverage));
  const missing = REQUIRED_ACCEPTANCE_COVERAGE.filter((key) => !covered.has(key));
  return {
    covered: REQUIRED_ACCEPTANCE_COVERAGE.length - missing.length,
    total: REQUIRED_ACCEPTANCE_COVERAGE.length,
    missing,
    complete: missing.length === 0,
  };
};
