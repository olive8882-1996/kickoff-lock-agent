import { describe, expect, it } from "vitest";
import {
  buildProductionBootstrapAcceptanceChecklist,
  productionBootstrapStepProgress,
  productionBootstrapStepDetail,
  summarizeProductionBootstrapRunbook,
  type ProductionBootstrapRunbook,
} from "./productionBootstrapRunbook";

describe("production bootstrap runbook", () => {
  it("builds an operator summary when the artifact has blocked steps", () => {
    const runbook: ProductionBootstrapRunbook = {
      ready: false,
      execute: false,
      passedSteps: 2,
      totalSteps: 4,
      failedSteps: 2,
      nextAction: "Resolve Supabase blockers.",
      steps: [
        {
          id: "env-plan",
          label: "Build production env plan",
          command: "bun scripts/run-production-env-plan.mjs --json",
          status: "passed",
          exitCode: 0,
          stdoutTail: "done",
        },
        {
          id: "secrets-handoff",
          label: "Build production secrets handoff",
          command: "bun scripts/run-production-secrets-handoff.mjs --json",
          status: "passed",
          exitCode: 0,
          parsedReady: false,
          parsedNextAction: "Fill manual production secrets first.",
          parsedCommands: ["printf '%s' \"$ODDS_API_KEY\" | bunx wrangler pages secret put ODDS_API_KEY --project-name 'kickoff-lock-agent'"],
          parsedMissingEnv: ["ODDS_API_KEY"],
          parsedStageReadyCount: 0,
          parsedTotalStages: 1,
          parsedProgressLabel: "handoff",
          parsedBlockedStage: {
            label: "Production secrets handoff",
            status: "blocked",
            command: "bun run secrets:handoff",
            missingEnv: ["ODDS_API_KEY"],
            detail: "Fill manual production secrets first.",
          },
        },
        {
          id: "supabase",
          label: "Plan Supabase account bootstrap",
          command: "bun run supabase:bootstrap",
          status: "failed",
          exitCode: 1,
          parsedNextAction: "Apply Supabase schema first.",
          parsedCommands: ["bun run supabase:schema:check"],
          parsedMissingEnv: ["SUPABASE_DB_URL", "VITE_SUPABASE_URL"],
          parsedStageReadyCount: 0,
          parsedTotalStages: 4,
          parsedProgressLabel: "stages",
          parsedBlockedStage: {
            label: "Apply Supabase schema",
            status: "blocked",
            command: "bun run supabase:schema:check",
            missingEnv: ["SUPABASE_DB_URL"],
            detail: "Set the Supabase Postgres connection string.",
          },
          stdoutTail: "Missing env: VITE_SUPABASE_URL\nNext action: set Supabase URL",
        },
        {
          id: "public-deployment",
          label: "Verify public deployment evidence",
          command: "bun scripts/run-public-deployment-evidence.mjs --json --expected-index=dist/index.html",
          status: "failed",
          exitCode: 1,
          parsedReady: false,
          parsedNextAction: "Redeploy gh-pages.",
          parsedCommands: ["bun run deploy:pages", "bun run deploy:evidence"],
          parsedMissingEnv: ["Bundle hash: expected assets/index-new.js · live assets/index-old.js"],
          parsedStageReadyCount: 7,
          parsedTotalStages: 8,
          parsedProgressLabel: "deployment checks",
          parsedBlockedStage: {
            label: "Bundle hash",
            status: "blocked",
            command: "bun run deploy:pages && bun run deploy:evidence",
            missingEnv: ["expected assets/index-new.js · live assets/index-old.js"],
            detail: "Redeploy gh-pages.",
          },
        },
        {
          id: "filecoin",
          label: "Plan Filecoin bootstrap",
          command: "bun run filecoin:bootstrap",
          status: "failed",
          exitCode: 1,
          stderrTail: "Missing env: VITE_FILECOIN_SEAL_TOKEN",
        },
        {
          id: "goal-audit",
          label: "Run goal audit",
          command: "bun run goal:audit",
          status: "passed",
          exitCode: 0,
        },
      ],
    };

    const summary = summarizeProductionBootstrapRunbook(runbook);

    expect(summary.ready).toBe(false);
    expect(summary.mode).toBe("plan");
    expect(summary.passedSteps).toBe(2);
    expect(summary.failedSteps).toBe(2);
    expect(summary.blockedSteps.map((step) => step.id)).toEqual(["secrets-handoff", "supabase", "public-deployment", "filecoin"]);
    expect(summary.firstBlockedStep?.command).toBe("bun scripts/run-production-secrets-handoff.mjs --json");
    expect(summary.acceptanceChecklist.find((item) => item.id === "secrets")).toMatchObject({
      status: "blocked",
      command: "bun run secrets:handoff",
      missingEnv: ["ODDS_API_KEY"],
    });
    expect(summary.acceptanceChecklist.find((item) => item.id === "account")).toMatchObject({
      status: "blocked",
      command: "bun run supabase:schema:check",
    });
    expect(summary.acceptanceChecklist.find((item) => item.id === "public-deployment")).toMatchObject({
      status: "blocked",
      command: "bun run deploy:pages && bun run deploy:evidence",
      passedSteps: 0,
      totalSteps: 1,
    });
    expect(summary.copyText).toContain("Acceptance checklist:");
    expect(summary.copyText).toContain("Real account and cloud history [blocked]");
    expect(summary.commands).toContain("bun run filecoin:bootstrap");
    expect(summary.commands).toContain("bun run supabase:schema:check");
    expect(summary.commands).toContain("bun run deploy:evidence");
    expect(summary.commands).toContain("printf '%s' \"$ODDS_API_KEY\" | bunx wrangler pages secret put ODDS_API_KEY --project-name 'kickoff-lock-agent'");
    expect(summary.nextAction).toBe("Fill manual production secrets first.");
    expect(summary.copyText).toContain("Missing env: VITE_FILECOIN_SEAL_TOKEN");
    expect(summary.copyText).toContain("SUPABASE_DB_URL");
    expect(productionBootstrapStepDetail(summary.firstBlockedStep!)).toContain("Fill manual production secrets first");
    expect(productionBootstrapStepProgress(summary.firstBlockedStep!)).toBe("0/1 handoff");
  });

  it("returns a runnable fallback when the artifact is missing", () => {
    const summary = summarizeProductionBootstrapRunbook(undefined, "Run the bootstrap command.");

    expect(summary.ready).toBe(false);
    expect(summary.totalSteps).toBe(0);
    expect(summary.commands).toEqual(["bun run production:bootstrap -- --json"]);
    expect(summary.copyText).toContain("Run the bootstrap command.");
  });

  it("prefers stderr detail and compacts noisy log tails", () => {
    expect(
      productionBootstrapStepDetail({
        id: "data",
        label: "Data",
        command: "bun run data:bootstrap",
        status: "failed",
        stdoutTail: "line 1\nline 2",
        stderrTail: "a\nb\nc\nd\ne",
      }),
    ).toBe("b · c · d · e");
  });

  it("truncates single-line JSON tails so the account panel stays readable", () => {
    const detail = productionBootstrapStepDetail({
      id: "supabase",
      label: "Supabase",
      command: "bun run supabase:bootstrap",
      status: "failed",
      stdoutTail: `"copyText": "${"missing env ".repeat(80)}"`,
    });

    expect(detail.length).toBeLessThanOrEqual(263);
    expect(detail.endsWith("...")).toBe(true);
  });

  it("uses a custom progress label for final evidence gates", () => {
    expect(
      productionBootstrapStepProgress({
        id: "production-evidence",
        label: "Run strict production evidence",
        command: "bun run verify:production",
        status: "failed",
        parsedStageReadyCount: 14,
        parsedTotalStages: 40,
        parsedProgressLabel: "required checks",
      }),
    ).toBe("14/40 required checks");
  });

  it("compresses the production bootstrap into clear acceptance gates", () => {
    const checklist = buildProductionBootstrapAcceptanceChecklist({
      steps: [
        {
          id: "env-plan",
          label: "Build production env plan",
          command: "bun scripts/run-production-env-plan.mjs --json",
          status: "passed",
        },
        {
          id: "runtime-config",
          label: "Write runtime config",
          command: "bun scripts/write-runtime-config.mjs --json",
          status: "passed",
        },
        {
          id: "cloudflare-pages",
          label: "Plan Cloudflare Pages same-origin backend deploy",
          command: "bun scripts/run-cloudflare-pages-preflight.mjs --json",
          status: "failed",
          parsedMissingEnv: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
          parsedBlockedStage: {
            label: "Authenticate Cloudflare deploy",
            status: "blocked",
            command: "bun run pages:cf:check",
            missingEnv: ["CLOUDFLARE_API_TOKEN"],
            detail: "Set Cloudflare deploy auth.",
          },
        },
        {
          id: "secrets-handoff",
          label: "Build production secrets handoff",
          command: "bun scripts/run-production-secrets-handoff.mjs --json",
          status: "failed",
          parsedMissingEnv: ["ODDS_API_KEY"],
          parsedBlockedStage: {
            label: "Production secrets handoff",
            status: "blocked",
            command: "bun run secrets:handoff",
            missingEnv: ["ODDS_API_KEY"],
            detail: "Fill manual production secrets.",
          },
        },
        {
          id: "public-deployment",
          label: "Verify public deployment evidence",
          command: "bun scripts/run-public-deployment-evidence.mjs --json --expected-index=dist/index.html",
          status: "failed",
          parsedMissingEnv: ["Bundle hash: expected assets/index-new.js · live assets/index-old.js"],
          parsedBlockedStage: {
            label: "Bundle hash",
            status: "blocked",
            command: "bun run deploy:pages && bun run deploy:evidence",
            missingEnv: ["expected assets/index-new.js · live assets/index-old.js"],
            detail: "Redeploy gh-pages.",
          },
        },
        {
          id: "goal-audit",
          label: "Run original goal audit",
          command: "bun scripts/run-production-goal-audit.mjs --json",
          status: "failed",
          parsedMissingEnv: ["Supabase auth + REST"],
          parsedNextAction: "Account: configure Supabase.",
        },
      ],
    });

    expect(checklist.find((item) => item.id === "env")).toMatchObject({
      status: "passed",
      passedSteps: 2,
      totalSteps: 2,
    });
    expect(checklist.find((item) => item.id === "same-origin-backend")).toMatchObject({
      status: "blocked",
      command: "bun run pages:cf:check",
      missingEnv: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
      evidence: "Set Cloudflare deploy auth.",
    });
    expect(checklist.find((item) => item.id === "secrets")).toMatchObject({
      status: "blocked",
      command: "bun run secrets:handoff",
      missingEnv: ["ODDS_API_KEY"],
      evidence: "Fill manual production secrets.",
    });
    expect(checklist.find((item) => item.id === "public-deployment")).toMatchObject({
      status: "blocked",
      command: "bun run deploy:pages && bun run deploy:evidence",
      missingEnv: ["Bundle hash: expected assets/index-new.js · live assets/index-old.js"],
      evidence: "Redeploy gh-pages.",
    });
    expect(checklist.find((item) => item.id === "final-evidence")).toMatchObject({
      status: "blocked",
      command: "bun scripts/run-production-goal-audit.mjs --json",
      missingEnv: ["Supabase auth + REST"],
    });
  });
});
