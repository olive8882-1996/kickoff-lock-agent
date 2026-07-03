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

export type AcceptanceSuiteRunEvidence = {
  suiteId: string;
  command: string;
  status: "passed" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  exitCode: number;
  logFile?: string;
  summary: string;
};

export type AcceptanceEvidencePacket = {
  generatedAt: string;
  source: "local-script" | "ci" | "manual";
  appVersion?: string;
  suiteManifestHash?: string;
  suites: AcceptanceSuiteRunEvidence[];
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
    file: "src/cloud.test.ts, src/accountHandoff.test.ts, src/profileArchiveEvidence.test.ts, src/leaderboardEvidence.test.ts, src/leaderboardSeasonEvidence.test.ts, src/productionLaunchPacket.test.ts, src/readiness.test.ts, src/productionDoctor.test.ts, src/supabaseProductionDoctor.test.ts, src/productionTargetSeed.test.ts",
    coverage: ["cloud-readback"],
    proves: "Supabase session handling, history merge, current-user leaderboard scope checks, leaderboard evidence packets, season leaderboard claim packets, account handoff packet readiness, public profile archive evidence packets, production launch packets, public mode proof gates, public share image URL read-back, strict cloud read-back readiness, acceptance evidence freshness rejection, external production evidence summaries, production verification target env generation, explicit Supabase target-row checks, Supabase production target seed row generation, Supabase production doctor REST/Storage/leaderboard checks, production operator doctor grouping and production radar external-evidence gating",
  },
  {
    id: "live-data",
    label: "Live data providers",
    command: "bun run test",
    file: "src/providers.test.ts, src/matchDataEvidence.test.ts, src/realtimeDataEvidence.test.ts, src/intelligenceEnrichmentEvidence.test.ts, src/dataProductionDoctor.test.ts, src/dataTargetScout.test.ts",
    coverage: ["providers"],
    proves: "provider routing, fallback behavior, structured realtime evidence packets, match-level and account-level production signal packets, intelligence enrichment endpoint packets for lineups/injuries/odds, API-Football enrichment read-back, API-Football fixture target scouting, live-data readiness, odds enrichment merging and production data doctor free/API-Football/odds endpoint checks",
  },
  {
    id: "share-cards",
    label: "Public share cards",
    command: "bun run test",
    file: "src/shareCard.test.ts, src/sharePublishing.test.ts, src/publicProofScorecard.test.ts, src/shareImageTarget.test.ts, src/shareImageUpload.test.ts, src/sharingProductionDoctor.test.ts",
    coverage: ["share-cards"],
    proves: "proof text, X intent URLs, generated social card payloads, public proof scorecards, branded production share-image generation, batch share-card publish queues, Supabase Storage image upload/read-back, publishable PNG manifests, public image URL read-back, image hashes, native-share capability detection, deployed public profile/proof/mode render gates, canonical URLs, Open Graph/Twitter metadata, JSON-LD and public share image read-back checks",
  },
  {
    id: "filecoin-api",
    label: "Filecoin API contract",
    command: "bun run test",
    file: "src/filecoinSeal.test.ts, src/filecoinSealEvidence.test.ts, src/filecoinSealApi.test.ts, src/filecoinProductionDoctor.test.ts, src/filecoinTargetSeal.test.ts",
    coverage: ["filecoin-api"],
    proves: "seal API health, prediction and mode proof upload payload hash matching, seal evidence packets, CID lookup, proof registry behavior, production Filecoin doctor health/CID/hash/read-back checks, optional POST /seal smoke testing and production record/mode target sealing env export",
  },
  {
    id: "game-modes",
    label: "Tournament game modes",
    command: "bun run test",
    file: "src/modes.test.ts, src/bracket.test.ts, src/modeEvidence.test.ts, src/modeSettlement.test.ts",
    coverage: ["modes"],
    proves: "bracket, parlay, Agent vs Human and upset proof readiness rules plus four-mode production evidence packets, settlement packets, scoring/calibration/bonus XP summaries, Filecoin, cloud read-back, public proof links and share cards",
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

export const ACCEPTANCE_EVIDENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const hashString = (input: string) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < input.length; index += 1) {
    const ch = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0")).slice(0, 16);
};

export const acceptanceManifestHash = (suites = ACCEPTANCE_TEST_SUITES) => {
  const payload = JSON.stringify({
    version: 1,
    required: REQUIRED_ACCEPTANCE_COVERAGE,
    suites: suites.map((suite) => ({
      id: suite.id,
      label: suite.label,
      command: suite.command,
      file: suite.file,
      coverage: [...suite.coverage].sort(),
      proves: suite.proves,
    })),
  });
  return `acceptance-v1-${hashString(payload)}`;
};

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

export const summarizeAcceptanceRunEvidence = (
  packet: AcceptanceEvidencePacket | undefined,
  suites = ACCEPTANCE_TEST_SUITES,
  {
    now = Date.now(),
    maxAgeMs = ACCEPTANCE_EVIDENCE_MAX_AGE_MS,
  }: {
    now?: number;
    maxAgeMs?: number;
  } = {},
) => {
  const expectedSuiteManifestHash = acceptanceManifestHash(suites);
  const manifestHashMismatch = Boolean(packet && packet.suiteManifestHash !== expectedSuiteManifestHash);
  const generatedAtMs = packet?.generatedAt ? new Date(packet.generatedAt).getTime() : Number.NaN;
  const ageMs = Number.isFinite(generatedAtMs) ? Math.max(0, now - generatedAtMs) : undefined;
  const evidenceStale = Boolean(packet && (ageMs === undefined || ageMs > maxAgeMs));
  const evidenceBySuite = new Map(packet?.suites.map((suite) => [suite.suiteId, suite]));
  const passedSuiteIds = suites
    .filter((suite) => {
      const evidence = evidenceBySuite.get(suite.id);
      return evidence?.status === "passed" && evidence.command === suite.command && evidence.exitCode === 0;
    })
    .map((suite) => suite.id);
  const failedSuiteIds = suites
    .filter((suite) => {
      const evidence = evidenceBySuite.get(suite.id);
      return evidence?.status === "failed" || (evidence && evidence.exitCode !== 0);
    })
    .map((suite) => suite.id);
  const missingSuiteIds = suites
    .filter((suite) => !evidenceBySuite.has(suite.id))
    .map((suite) => suite.id);
  const commandMismatches = suites
    .filter((suite) => {
      const evidence = evidenceBySuite.get(suite.id);
      return evidence && evidence.command !== suite.command;
    })
    .map((suite) => suite.id);

  return {
    generatedAt: packet?.generatedAt,
    source: packet?.source,
    suiteManifestHash: packet?.suiteManifestHash,
    expectedSuiteManifestHash,
    manifestHashMismatch,
    ageMs,
    maxAgeMs,
    evidenceStale,
    passed: passedSuiteIds.length,
    total: suites.length,
    passedSuiteIds,
    failedSuiteIds,
    missingSuiteIds,
    commandMismatches,
    complete:
      Boolean(packet) &&
      passedSuiteIds.length === suites.length &&
      failedSuiteIds.length === 0 &&
      missingSuiteIds.length === 0 &&
      commandMismatches.length === 0 &&
      !manifestHashMismatch &&
      !evidenceStale,
  };
};
