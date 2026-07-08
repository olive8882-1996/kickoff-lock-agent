import { describe, expect, it } from "vitest";
import { ACCEPTANCE_TEST_SUITES, acceptanceManifestHash, type AcceptanceEvidencePacket } from "./acceptance";
import { buildProductionGoalAudit } from "./productionGoalAudit";
import type { ProductionEvidenceCheck, ProductionEvidencePacket } from "./productionEvidence";
import type { ProductionAcceptanceCollectorPacket } from "./productionAcceptanceCollector";

const now = Date.parse("2099-01-01T00:00:00.000Z");

const shareImageUrls: Record<string, string> = {
  "public-share-image": "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
  "public-mode-share-image": "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
};

const check = (
  id: string,
  status: ProductionEvidenceCheck["status"] = "passed",
  urls: Record<string, string> = shareImageUrls,
): ProductionEvidenceCheck => ({
  id,
  category: id.startsWith("runtime-") ? "runtime" : id.startsWith("public-") ? "sharing" : "supabase",
  label: id,
  required: true,
  status,
  detail: status === "passed" ? "ok" : "missing",
  checkedAt: "2099-01-01T00:00:00.000Z",
  url: urls[id],
  action: `fix ${id}`,
});

const requiredCheckIds = [
  "runtime-supabase-core",
  "runtime-supabase-redirect",
  "supabase-auth-user-target",
  "supabase-auth-profile-identity",
  "supabase-backend-health",
  "supabase-profile-target",
  "supabase-record-target",
  "supabase-mode-target",
  "runtime-thesportsdb-free",
  "runtime-data-proxy",
  "data-proxy-health",
  "runtime-api-football-enrichment",
  "runtime-odds-enrichment",
  "public-football-feed-continuity",
  "api-football-enrichment-live",
  "runtime-filecoin-seal-api",
  "runtime-filecoin-seal-token",
  "filecoin-seal-health",
  "filecoin-seal-contract",
  "filecoin-record-proof-readback",
  "filecoin-mode-proof-readback",
  "runtime-share-storage-bucket",
  "supabase-share-artifact-target",
  "supabase-mode-share-artifact-target",
  "supabase-share-channel-target",
  "supabase-mode-share-channel-target",
  "leaderboard-global-current-user",
  "leaderboard-friend-current-user",
  "leaderboard-season-current-user",
  "leaderboard-global-board",
  "leaderboard-friend-board",
  "leaderboard-season-board",
  "public-mode-link",
  "public-mode-share-image",
  "public-acceptance-evidence",
  "runtime-public-app-url",
  "public-profile-link",
  "public-proof-link",
  "public-clean-session-restore",
  "public-share-image",
  "public-app-root",
  "public-runtime-config",
  "public-deployment-evidence",
  "public-logo-asset",
];

const productionPacket = (failedIds: string[] = [], urls: Record<string, string> = shareImageUrls): ProductionEvidencePacket => ({
  generatedAt: "2099-01-01T00:00:00.000Z",
  source: "local-script",
  strict: true,
  checks: requiredCheckIds.map((id) => check(id, failedIds.includes(id) ? "failed" : "passed", urls)),
});

const acceptancePacket = (): AcceptanceEvidencePacket => ({
  generatedAt: "2099-01-01T00:00:00.000Z",
  source: "local-script",
  suiteManifestHash: acceptanceManifestHash(),
  suites: ACCEPTANCE_TEST_SUITES.map((suite) => ({
    suiteId: suite.id,
    command: suite.command,
    status: "passed",
    startedAt: "2099-01-01T00:00:00.000Z",
    completedAt: "2099-01-01T00:00:01.000Z",
    durationMs: 1000,
    exitCode: 0,
    summary: "passed",
  })),
});

const productionCollectorPacket = (): ProductionAcceptanceCollectorPacket => ({
  ready: false,
  stageReadyCount: 1,
  totalStages: 9,
  blockedStages: 8,
  missingRuntimeEnv: [],
  missingVerifyEnv: [],
  commands: ["bun run pages:cf:preflight && bun run pages:cf:deploy"],
  nextAction: "Deploy Cloudflare same-origin backend routes.",
  copyText: "production acceptance collector",
  stages: [
    {
      id: "cloudflare-pages-backend",
      label: "Deploy Cloudflare same-origin backend routes",
      status: "blocked",
      command: "bun run pages:cf:preflight && bun run pages:cf:deploy",
      requiredEnv: ["APIFOOTBALL_KEY", "FILECOIN_SEAL_UPSTREAM_URL", "FILECOIN_SEAL_TOKEN", "CLOUDFLARE_API_TOKEN"],
      outputEnv: [],
      missingEnv: ["APIFOOTBALL_KEY", "FILECOIN_SEAL_UPSTREAM_URL", "FILECOIN_SEAL_TOKEN", "CLOUDFLARE_API_TOKEN"],
      producedEnv: [],
      detail: "Deploy same-origin backend routes.",
    },
    {
      id: "data-scout",
      label: "Scout realtime fixture targets",
      status: "blocked",
      command: "bun run data:providers:check && bun run scout:data-targets",
      requiredEnv: ["APIFOOTBALL_KEY", "VITE_DATA_PROXY_SAME_ORIGIN"],
      outputEnv: ["KICKOFF_VERIFY_FIXTURE_IDS", "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"],
      missingEnv: [
        "Cloudflare Pages Set Pages runtime secrets: APIFOOTBALL_KEY",
        "Cloudflare Pages Authenticate Cloudflare deploy: CLOUDFLARE_API_TOKEN",
        "KICKOFF_VERIFY_FIXTURE_IDS missing",
      ],
      producedEnv: [],
      detail: "Scout fixture targets.",
    },
    {
      id: "filecoin-seal",
      label: "Seal Filecoin proof targets",
      status: "blocked",
      command: "bun run filecoin:bootstrap",
      requiredEnv: ["VITE_FILECOIN_SEAL_SAME_ORIGIN"],
      outputEnv: ["KICKOFF_VERIFY_FILECOIN_RECORD_CID"],
      missingEnv: [
        "Cloudflare Pages Set Pages runtime secrets: FILECOIN_SEAL_UPSTREAM_URL",
        "Cloudflare Pages Set Pages runtime secrets: FILECOIN_SEAL_TOKEN",
      ],
      producedEnv: [],
      detail: "Seal proof targets.",
    },
  ],
});

describe("production goal audit", () => {
  it("maps failed production checks back to the original user goals", () => {
    const audit = buildProductionGoalAudit({
      productionEvidence: productionPacket(["runtime-supabase-core", "leaderboard-global-current-user"]),
      acceptanceEvidence: acceptancePacket(),
      now,
    });

    expect(audit.ready).toBe(false);
    expect(audit.requirements.find((item) => item.id === "account")).toMatchObject({
      status: "todo",
      command: "bun run supabase:bootstrap",
    });
    expect(audit.requirements.find((item) => item.id === "leaderboard")?.missing).toContain("leaderboard-global-current-user");
    expect(audit.requirements.find((item) => item.id === "realtime-data")).toMatchObject({
      command: "bun run data:providers:check && bun run scout:data-targets && bun run doctor:data",
    });
    expect(audit.requirements.find((item) => item.id === "share-cards")).toMatchObject({
      command:
        "bun run share:upload-image && bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png && bun run sharing:bootstrap",
    });
    expect(audit.requirements.find((item) => item.id === "share-images")).toMatchObject({
      command: "bun run share:upload-image && bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
    });
    expect(audit.nextAction).toContain("真实账号系统");
    expect(audit.copyText).toContain("Kickoff Lock Agent production goal audit");
  });

  it("passes only when production evidence and acceptance evidence both cover every goal", () => {
    const audit = buildProductionGoalAudit({
      productionEvidence: productionPacket(),
      acceptanceEvidence: acceptancePacket(),
      now,
    });

    expect(audit.ready).toBe(true);
    expect(audit.passedRequirements).toBe(audit.totalRequirements);
    expect(audit.requirements.map((item) => item.status)).toEqual(Array(audit.totalRequirements).fill("done"));
  });

  it("keeps tests pending when acceptance evidence is stale or missing", () => {
    const audit = buildProductionGoalAudit({
      productionEvidence: productionPacket(),
      acceptanceEvidence: undefined,
      now,
    });

    expect(audit.ready).toBe(false);
    expect(audit.requirements.find((item) => item.id === "tests")).toMatchObject({
      status: "todo",
      command: "bun run verify:acceptance",
    });
  });

  it("carries production env blank declarations into the final goal audit", () => {
    const audit = buildProductionGoalAudit({
      productionEvidence: productionPacket(["runtime-supabase-core"]),
      acceptanceEvidence: acceptancePacket(),
      envPlan: {
        ready: false,
        rows: [],
        missingRequired: ["VITE_SUPABASE_URL"],
        invalidRequired: [],
        blankDeclarations: [{ key: "VITE_SUPABASE_URL", fileName: ".env.production.local" }],
        groups: [],
        templateText: "VITE_SUPABASE_URL=\n",
        copyText: "Blank declarations: VITE_SUPABASE_URL (.env.production.local)",
        nextAction: "Fill VITE_SUPABASE_URL.",
      },
      now,
    });

    expect(audit.envPlanLoaded).toBe(true);
    expect(audit.openCommands).toBeGreaterThan(0);
    expect(audit.blockedCommands).toBeGreaterThan(0);
    expect(audit.blankEnvDeclarations).toEqual([{ key: "VITE_SUPABASE_URL", fileName: ".env.production.local" }]);
    expect(audit.commandQueue.find((item) => item.id === "account")).toMatchObject({
      status: "blocked",
      command: "bun run supabase:bootstrap",
      envHints: ["VITE_SUPABASE_URL (.env.production.local)"],
    });
    expect(audit.commandQueue.find((item) => item.id === "share-images")).toMatchObject({
      status: "done",
    });
    expect(audit.requirements.find((item) => item.id === "account")?.envHints).toEqual([
      "VITE_SUPABASE_URL (.env.production.local)",
    ]);
    expect(audit.requirements.find((item) => item.id === "filecoin")?.envHints).toEqual([]);
    expect(audit.copyText).toContain("Blank env declarations: VITE_SUPABASE_URL (.env.production.local)");
    expect(audit.copyText).toContain("env hints: VITE_SUPABASE_URL (.env.production.local)");
  });

  it("maps blank env declarations to the relevant goal lane", () => {
    const audit = buildProductionGoalAudit({
      productionEvidence: productionPacket(["runtime-api-football-enrichment", "runtime-filecoin-seal-api"]),
      acceptanceEvidence: acceptancePacket(),
      envPlan: {
        ready: false,
        rows: [],
        missingRequired: ["APIFOOTBALL_KEY_OR_VITE_APIFOOTBALL_KEY_OR_DATA_PROXY", "VITE_FILECOIN_SEAL_API_OR_SAME_ORIGIN"],
        invalidRequired: [],
        blankDeclarations: [
          { key: "APIFOOTBALL_KEY", fileName: ".env.production.local" },
          { key: "VITE_APIFOOTBALL_KEY", fileName: ".env.production.local" },
          { key: "VITE_FILECOIN_SEAL_API", fileName: ".env.production.local" },
        ],
        groups: [],
        templateText: "",
        copyText: "",
        nextAction: "Fill provider and seal env.",
      },
      now,
    });

    expect(audit.requirements.find((item) => item.id === "realtime-data")?.envHints).toEqual([
      "APIFOOTBALL_KEY (.env.production.local)",
      "VITE_APIFOOTBALL_KEY (.env.production.local)",
    ]);
    expect(audit.requirements.find((item) => item.id === "filecoin")?.envHints).toEqual([
      "VITE_FILECOIN_SEAL_API (.env.production.local)",
    ]);
  });

  it("uses production collector stage blockers to sharpen goal command hints", () => {
    const audit = buildProductionGoalAudit({
      productionEvidence: productionPacket([
        "runtime-api-football-enrichment",
        "runtime-filecoin-seal-api",
        "public-runtime-config",
      ]),
      acceptanceEvidence: acceptancePacket(),
      envPlan: {
        ready: false,
        rows: [],
        missingRequired: [],
        invalidRequired: [],
        blankDeclarations: [
          { key: "VITE_DATA_PROXY_URL", fileName: ".env.production.local" },
          { key: "VITE_FILECOIN_SEAL_API", fileName: ".env.production.local" },
          { key: "VITE_FILECOIN_SEAL_TOKEN", fileName: ".env.production.local" },
        ],
        groups: [],
        templateText: "",
        copyText: "",
        nextAction: "Fill production runtime env.",
      },
      productionCollector: productionCollectorPacket(),
      now,
    });

    expect(audit.productionCollectorLoaded).toBe(true);
    expect(audit.requirements.find((item) => item.id === "realtime-data")?.envHints).toEqual(
      expect.arrayContaining([
        "Cloudflare Pages Set Pages runtime secrets: APIFOOTBALL_KEY",
        "Cloudflare Pages Authenticate Cloudflare deploy: CLOUDFLARE_API_TOKEN",
        "KICKOFF_VERIFY_FIXTURE_IDS missing",
      ]),
    );
    expect(audit.requirements.find((item) => item.id === "filecoin")?.envHints).toEqual(
      expect.arrayContaining([
        "Cloudflare Pages Set Pages runtime secrets: FILECOIN_SEAL_UPSTREAM_URL",
        "Cloudflare Pages Set Pages runtime secrets: FILECOIN_SEAL_TOKEN",
      ]),
    );
    expect(audit.commandQueue.find((item) => item.id === "final-production")).toMatchObject({
      status: "blocked",
      envHints: expect.arrayContaining(["FILECOIN_SEAL_UPSTREAM_URL", "CLOUDFLARE_API_TOKEN"]),
    });
    expect(audit.requirements.find((item) => item.id === "realtime-data")?.envHints).not.toContain(
      "VITE_DATA_PROXY_URL (.env.production.local)",
    );
    expect(audit.requirements.find((item) => item.id === "filecoin")?.envHints).not.toEqual(
      expect.arrayContaining([
        "VITE_FILECOIN_SEAL_API (.env.production.local)",
        "VITE_FILECOIN_SEAL_TOKEN (.env.production.local)",
      ]),
    );
    expect(audit.commandQueue.find((item) => item.id === "final-production")?.envHints).not.toEqual(
      expect.arrayContaining([
        "VITE_DATA_PROXY_URL (.env.production.local)",
        "VITE_FILECOIN_SEAL_API (.env.production.local)",
        "VITE_FILECOIN_SEAL_TOKEN (.env.production.local)",
      ]),
    );
    expect(audit.copyText).toContain("Cloudflare Pages Set Pages runtime secrets: APIFOOTBALL_KEY");
    expect(audit.copyText).not.toContain("Cloudflare Pages Set Pages runtime secrets: FOOTBALL_DATA_TOKEN");
  });

  it("marks goal commands ready when evidence is missing but no blank env blocks the lane", () => {
    const audit = buildProductionGoalAudit({
      productionEvidence: productionPacket(["public-acceptance-evidence"]),
      acceptanceEvidence: acceptancePacket(),
      envPlan: {
        ready: true,
        rows: [],
        missingRequired: [],
        invalidRequired: [],
        blankDeclarations: [],
        groups: [],
        templateText: "",
        copyText: "",
        nextAction: "All production env rows are filled.",
      },
      now,
    });

    expect(audit.commandQueue.find((item) => item.id === "tests")).toMatchObject({
      status: "ready",
      command: "bun run verify:acceptance",
      envHints: [],
    });
    expect(audit.copyText).toContain("Command queue:");
    expect(audit.copyText).toContain("Command queue: ");
  });

  it("requires clean-session public rendering before account recovery is complete", () => {
    const audit = buildProductionGoalAudit({
      productionEvidence: productionPacket(["public-clean-session-restore"]),
      acceptanceEvidence: acceptancePacket(),
      now,
    });

    expect(audit.ready).toBe(false);
    expect(audit.requirements.find((item) => item.id === "account")).toMatchObject({
      status: "todo",
      missing: expect.arrayContaining(["public-clean-session-restore"]),
    });
    expect(audit.requirements.find((item) => item.id === "public-proof-pages")).toMatchObject({
      status: "todo",
      missing: expect.arrayContaining(["public-clean-session-restore"]),
    });
  });

  it("accepts deployed generated preview URLs as share-image generation evidence", () => {
    const audit = buildProductionGoalAudit({
      productionEvidence: productionPacket([], {
        "public-share-image": "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-share.png",
        "public-mode-share-image": "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-mode-share.png",
      }),
      acceptanceEvidence: acceptancePacket(),
      now,
    });

    expect(audit.requirements.find((item) => item.id === "share-images")).toMatchObject({
      status: "done",
      missing: [],
    });
  });
});
