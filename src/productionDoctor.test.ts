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
          : id.includes("api-football") || id.includes("football-data") || id.startsWith("data-proxy")
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
  "runtime-data-proxy",
  "data-proxy-health",
  "runtime-api-football-enrichment",
  "runtime-odds-enrichment",
  "runtime-filecoin-seal-api",
  "runtime-filecoin-seal-token",
  "runtime-public-app-url",
  "runtime-share-storage-bucket",
  "public-app-root",
  "public-runtime-config",
  "public-deployment-evidence",
  "public-acceptance-evidence",
  "public-logo-asset",
  "supabase-auth-user-target",
  "supabase-auth-profile-identity",
  "supabase-backend-health",
  "leaderboard-global-current-user",
  "leaderboard-friend-current-user",
  "leaderboard-season-current-user",
  "leaderboard-global-board",
  "leaderboard-friend-board",
  "leaderboard-season-board",
  "supabase-profile-target",
  "supabase-record-target",
  "supabase-mode-target",
  "supabase-share-artifact-target",
  "supabase-mode-share-artifact-target",
  "supabase-share-channel-target",
  "supabase-mode-share-channel-target",
  "public-football-feed-continuity",
  "football-data-readback",
  "api-football-enrichment-live",
  "filecoin-seal-health",
  "filecoin-seal-contract",
  "filecoin-record-proof-readback",
  "filecoin-mode-proof-readback",
  "public-profile-link",
  "public-proof-link",
  "public-mode-link",
  "public-clean-session-restore",
  "public-share-image",
  "public-mode-share-image",
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
      expect.arrayContaining(["VITE_SUPABASE_URL", "APIFOOTBALL_KEY", "VITE_DATA_PROXY_URL", "VITE_FILECOIN_SEAL_API"]),
    );
    expect(report.nextActions.map((item) => item.id)).toEqual(
      expect.arrayContaining(["account-cloud", "realtime-data", "filecoin-auto-seal", "public-sharing"]),
    );
    expect(report.items.find((item) => item.id === "filecoin-auto-seal")?.envKeys).toEqual(
      expect.arrayContaining(["KICKOFF_VERIFY_FILECOIN_RECORD_CID", "KICKOFF_VERIFY_FILECOIN_MODE_CIDS"]),
    );
    expect(report.items.find((item) => item.id === "realtime-data")?.envKeys).not.toContain("KICKOFF_VERIFY_FIXTURE_ID");
    expect(report.items.find((item) => item.id === "realtime-data")?.envKeys).toEqual(
      expect.arrayContaining(["FOOTBALL_DATA_TOKEN", "FOOTBALL_DATA_ORG_TOKEN"]),
    );
    expect(report.items.find((item) => item.id === "account-cloud")?.envKeys).not.toContain("KICKOFF_VERIFY_MODE_ID");
    expect(report.items.find((item) => item.id === "account-cloud")?.envKeys).toEqual(
      expect.arrayContaining(["KICKOFF_VERIFY_USER_ID", "SUPABASE_SERVICE_ROLE_KEY"]),
    );
    expect(report.items.find((item) => item.id === "public-sharing")?.envKeys).not.toContain("KICKOFF_VERIFY_MODE_ID");
    expect(report.items.find((item) => item.id === "public-sharing")?.envKeys).toContain(
      "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
    );
  });

  it("marks the checklist ready only when runtime gates and grouped production checks are all proven", () => {
    const env = {
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
      VITE_APIFOOTBALL_KEY: "football",
      VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
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

    expect(report.runtime.total).toBe(10);
    expect(report.runtime.passed).toBe(9);
    expect(report.headline).toContain("9/10 runtime gates");
    expect(report.runtime.missingEnvKeys).toEqual(["VITE_FILECOIN_SEAL_API", "VITE_FILECOIN_SEAL_SAME_ORIGIN"]);
  });
});
