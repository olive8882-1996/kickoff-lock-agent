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
          : id.includes("api-football") || id.includes("football-data") || id.startsWith("data-proxy")
            ? "data"
            : "sharing",
  label: id,
  required: true,
  status,
    detail:
      id === "runtime-supabase-core" && status !== "passed"
        ? "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
      : id === "runtime-api-football-enrichment" && status !== "passed"
        ? "Missing VITE_APIFOOTBALL_KEY or deployed data proxy with server-side APIFOOTBALL_KEY"
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
      expect.arrayContaining(["VITE_SUPABASE_URL", "APIFOOTBALL_KEY", "VITE_DATA_PROXY_URL", "VITE_FILECOIN_SEAL_API"]),
    );
    expect(launch.targetEnvKeys).toEqual(
      expect.arrayContaining(["FOOTBALL_DATA_TOKEN", "FOOTBALL_DATA_ORG_TOKEN"]),
    );
    expect(launch.commands).toEqual(
      expect.arrayContaining([
        "bun run doctor:supabase",
        "bun run data:providers:check",
        "bun run doctor:data",
        "bun run filecoin:api:check",
        "bun run doctor:filecoin",
      ]),
    );
    expect(launch.openCommands).toBeGreaterThan(launch.openSteps);
    expect(launch.blockedCommands).toBeGreaterThan(0);
    expect(launch.targetEnvKeys).toEqual(
      expect.arrayContaining(["KICKOFF_VERIFY_PROFILE_ID", "KICKOFF_VERIFY_MODE_IDS"]),
    );
    expect(launch.commandQueue.find((item) => item.id === "realtime-data-providers")).toMatchObject({
      label: "Check live provider credentials",
      command: "bun run data:providers:check",
      status: "ready",
    });
    expect(launch.commandQueue.find((item) => item.id === "filecoin-seal-targets")).toMatchObject({
      label: "Seal production proof targets",
      command: "bun run seal:production-targets",
      status: "blocked",
    });
    expect(launch.commandQueue.find((item) => item.id === "public-deployment-runtime-config")).toMatchObject({
      label: "Generate runtime config",
      command: "bun run runtime:config",
      status: "done",
    });
    expect(launch.commandQueue.find((item) => item.id === "automation-deploy-before-verify")).toMatchObject({
      label: "Deploy release before production verification",
      command: "bun run deploy:pages",
      status: "done",
    });
    expect(launch.commandQueue.find((item) => item.id === "automation-deploy-evidence-before-verify")).toMatchObject({
      label: "Verify live bundle before production verification",
      command: "bun run deploy:evidence",
      status: "done",
    });
    expect(launch.commandQueue.find((item) => item.id === "public-deployment-evidence")).toMatchObject({
      label: "Verify live Pages bundle",
      command: "bun run deploy:evidence",
      status: "done",
    });
    expect(launch.commandQueue.find((item) => item.id === "automation-production-doctor")).toMatchObject({
      command: "bun run doctor:production && bun run goal:audit",
      status: "done",
    });
    expect(launch.commandQueue.find((item) => item.id === "public-sharing-mode-card")).toMatchObject({
      label: "Generate mode share image",
      command: "bun run share:production-image -- --kind=mode --out=public/generated/kickoff-production-mode-share.png",
      status: "ready",
    });
    expect(launch.commandQueue.find((item) => item.id === "public-sharing-mode-upload")).toMatchObject({
      label: "Upload mode share image to storage",
      command: "bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
      status: "ready",
    });
    expect(launch.commandQueue.find((item) => item.id === "public-sharing-channel")).toMatchObject({
      label: "Sync share-channel evidence",
      command: "bun run sharing:bootstrap",
      status: "ready",
    });
    expect(launch.steps.find((step) => step.id === "account-cloud")?.targetEnv).toEqual(
      expect.arrayContaining([
        "KICKOFF_VERIFY_USER_ID",
        "SUPABASE_SERVICE_ROLE_KEY",
        "KICKOFF_VERIFY_PROFILE_ID",
        "KICKOFF_VERIFY_PROOF_ID",
      ]),
    );
    expect(launch.copyText).toContain("Kickoff Lock Agent production launch packet");
    expect(launch.copyText).toContain("Missing runtime env:");
    expect(launch.copyText).toContain("Command queue:");
    expect(launch.copyText).toContain("Target env keys:");
  });

  it("collapses to a complete launch packet after every doctor group passes", () => {
    const report = buildProductionDoctorReport(
      {
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_SUPABASE_REDIRECT_URL: "https://example.com/kickoff-lock-agent/",
        VITE_APIFOOTBALL_KEY: "football",
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
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
    expect(launch.openCommands).toBe(0);
    expect(launch.blockedCommands).toBe(0);
    expect(launch.commandQueue.every((item) => item.status === "done")).toBe(true);
    expect(launch.nextAction).toBe("Run final production verification and submit.");
    expect(launch.copyText).toContain("Ready: yes");
  });
});
