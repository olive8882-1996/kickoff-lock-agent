import { describe, expect, it } from "vitest";
import { buildProductionDoctorReport } from "./productionDoctor";
import type { ProductionEvidenceCheck, ProductionEvidencePacket } from "./productionEvidence";

const checkedAt = "2026-07-03T00:00:00.000Z";

const check = (id: string, status: ProductionEvidenceCheck["status"] = "passed"): ProductionEvidenceCheck => ({
  id,
  category: id.startsWith("runtime-")
    ? "runtime"
    : id.startsWith("public-")
      ? id === "public-football-feed-continuity"
        ? "data"
        : "public-app"
      : id.startsWith("filecoin-")
        ? "filecoin"
        : id.includes("leaderboard") || id.startsWith("supabase-")
          ? "supabase"
          : id.includes("api-football")
            ? "data"
            : "sharing",
  label: id,
  required: true,
  status,
  detail: status === "passed" ? "ok" : "missing",
  checkedAt,
  action: `fix ${id}`,
});

const allRequiredCheckIds = [
  "runtime-supabase-core",
  "runtime-supabase-redirect",
  "runtime-thesportsdb-free",
  "runtime-api-football-enrichment",
  "runtime-odds-enrichment",
  "runtime-filecoin-seal-api",
  "runtime-filecoin-seal-token",
  "runtime-public-app-url",
  "runtime-share-storage-bucket",
  "public-app-root",
  "public-acceptance-evidence",
  "public-logo-asset",
  "supabase-backend-health",
  "leaderboard-global-current-user",
  "leaderboard-friend-current-user",
  "leaderboard-season-current-user",
  "supabase-profile-target",
  "supabase-record-target",
  "supabase-mode-target",
  "supabase-share-artifact-target",
  "public-football-feed-continuity",
  "api-football-enrichment-live",
  "filecoin-seal-health",
  "filecoin-record-proof-readback",
  "filecoin-mode-proof-readback",
  "public-profile-link",
  "public-proof-link",
  "public-mode-link",
  "public-share-image",
];

const packet = (checks: ProductionEvidenceCheck[]): ProductionEvidencePacket => ({
  generatedAt: checkedAt,
  source: "local-script",
  strict: true,
  checks,
});

describe("production doctor", () => {
  it("keeps the operator checklist incomplete when real runtime env and evidence targets are missing", () => {
    const evidence = packet(allRequiredCheckIds.map((id) => check(id, id === "public-app-root" ? "passed" : "failed")));
    const report = buildProductionDoctorReport({ BASE_URL: "/kickoff-lock-agent/" }, evidence);

    expect(report.ready).toBe(false);
    expect(report.runtime.missingEnvKeys).toEqual(
      expect.arrayContaining(["VITE_SUPABASE_URL", "VITE_APIFOOTBALL_KEY", "VITE_FILECOIN_SEAL_API"]),
    );
    expect(report.nextActions.map((item) => item.id)).toEqual(
      expect.arrayContaining(["account-cloud", "realtime-data", "filecoin-auto-seal", "public-sharing"]),
    );
    expect(report.items.find((item) => item.id === "filecoin-auto-seal")?.envKeys).toEqual(
      expect.arrayContaining(["KICKOFF_VERIFY_FILECOIN_RECORD_CID", "KICKOFF_VERIFY_FILECOIN_MODE_CID"]),
    );
  });

  it("marks the checklist ready only when runtime gates and grouped production checks are all proven", () => {
    const env = {
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
      VITE_APIFOOTBALL_KEY: "football",
      VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
      VITE_FILECOIN_SEAL_TOKEN: "token",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
    };
    const report = buildProductionDoctorReport(env, packet(allRequiredCheckIds.map((id) => check(id))));

    expect(report.ready).toBe(true);
    expect(report.nextActions).toEqual([]);
    expect(report.headline).toContain("externally verified");
  });

  it("reports pending groups when production-evidence.json has not been generated yet", () => {
    const report = buildProductionDoctorReport({}, undefined);

    expect(report.ready).toBe(false);
    expect(report.evidence.loaded).toBe(false);
    expect(report.items.every((item) => item.status === "pending")).toBe(true);
  });

  it("uses published runtime evidence instead of browser build env when evidence is loaded", () => {
    const evidence = packet([
      ...allRequiredCheckIds.map((id) => check(id)),
      check("runtime-filecoin-seal-api", "failed"),
    ]);
    evidence.checks = evidence.checks.filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
    evidence.checks = evidence.checks.map((item) =>
      item.id === "runtime-filecoin-seal-api" ? { ...item, status: "failed", detail: "Missing VITE_FILECOIN_SEAL_API" } : item,
    );

    const report = buildProductionDoctorReport({}, evidence);

    expect(report.runtime.total).toBe(9);
    expect(report.runtime.passed).toBe(8);
    expect(report.headline).toContain("8/9 runtime gates");
    expect(report.runtime.missingEnvKeys).toEqual(["VITE_FILECOIN_SEAL_API"]);
  });
});
