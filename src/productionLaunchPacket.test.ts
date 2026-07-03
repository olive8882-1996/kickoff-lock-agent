import { describe, expect, it } from "vitest";
import { buildProductionDoctorReport } from "./productionDoctor";
import { buildProductionLaunchPacket } from "./productionLaunchPacket";
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
  detail:
    id === "runtime-supabase-core" && status !== "passed"
      ? "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
      : id === "runtime-api-football-enrichment" && status !== "passed"
        ? "Missing VITE_APIFOOTBALL_KEY"
        : id === "runtime-filecoin-seal-api" && status !== "passed"
          ? "Missing VITE_FILECOIN_SEAL_API"
          : status === "passed"
            ? "ok"
            : "missing",
  checkedAt,
  action: `fix ${id}`,
});

const requiredIds = [
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

describe("production launch packet", () => {
  it("turns failed production doctor groups into copyable operator commands", () => {
    const report = buildProductionDoctorReport(
      {},
      packet(requiredIds.map((id) => check(id, id.startsWith("public-") || id === "runtime-public-app-url" || id === "runtime-share-storage-bucket" || id === "runtime-thesportsdb-free" ? "passed" : "failed"))),
    );
    const launch = buildProductionLaunchPacket(report);

    expect(launch.ready).toBe(false);
    expect(launch.openSteps).toBeGreaterThan(0);
    expect(launch.missingRuntimeEnv).toEqual(
      expect.arrayContaining(["VITE_SUPABASE_URL", "VITE_APIFOOTBALL_KEY", "VITE_FILECOIN_SEAL_API"]),
    );
    expect(launch.commands).toEqual(
      expect.arrayContaining(["bun run doctor:supabase", "bun run doctor:data", "bun run doctor:filecoin"]),
    );
    expect(launch.steps.find((step) => step.id === "account-cloud")?.targetEnv).toEqual(
      expect.arrayContaining(["KICKOFF_VERIFY_PROFILE_ID", "KICKOFF_VERIFY_PROOF_ID"]),
    );
    expect(launch.copyText).toContain("Kickoff Lock Agent production launch packet");
    expect(launch.copyText).toContain("Missing runtime env:");
  });

  it("collapses to a complete launch packet after every doctor group passes", () => {
    const report = buildProductionDoctorReport(
      {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        VITE_APIFOOTBALL_KEY: "football",
        VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "token",
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
      },
      packet(requiredIds.map((id) => check(id))),
    );
    const launch = buildProductionLaunchPacket(report);

    expect(launch.ready).toBe(true);
    expect(launch.openSteps).toBe(0);
    expect(launch.nextAction).toBe("Run final production verification and submit.");
    expect(launch.copyText).toContain("Ready: yes");
  });
});
