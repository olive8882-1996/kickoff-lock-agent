import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeEvidenceOutput } from "../src/evidenceOutput.ts";
import { buildProductionBootstrapAcceptanceChecklist } from "../src/productionBootstrapRunbook.ts";

const execute = process.argv.includes("--execute");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const outputPath = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length) ?? "public/production-bootstrap-runbook.json";

const step = (id, label, args, executeArgs = args) => ({
  id,
  label,
  args: execute ? executeArgs : args,
  command: `bun ${(execute ? executeArgs : args).join(" ")}`,
});

const steps = [
  step("env-plan", "Build production env plan", ["scripts/run-production-env-plan.mjs", "--json"]),
  step("access-preflight", "Check production account access", ["scripts/run-production-access-preflight.mjs", "--json"]),
  step("secrets-handoff", "Build production secrets handoff", ["scripts/run-production-secrets-handoff.mjs", "--json"]),
  step("runtime-config", "Write runtime config", ["scripts/write-runtime-config.mjs", "--json"]),
  step("public-deployment", "Verify public deployment evidence", [
    "scripts/run-public-deployment-evidence.mjs",
    "--json",
    "--expected-index=dist/index.html",
  ]),
  step("cloudflare-pages", "Plan Cloudflare Pages same-origin backend deploy", ["scripts/run-cloudflare-pages-preflight.mjs", "--json"]),
  step(
    "supabase",
    "Plan or execute Supabase account bootstrap",
    ["scripts/run-supabase-production-bootstrap.mjs", "--json"],
    ["scripts/run-supabase-production-bootstrap.mjs", "--json", "--execute"],
  ),
  step(
    "data",
    "Plan or execute realtime data bootstrap",
    ["scripts/run-data-production-bootstrap.mjs", "--json"],
    ["scripts/run-data-production-bootstrap.mjs", "--json", "--execute"],
  ),
  step(
    "filecoin",
    "Plan or execute Filecoin seal bootstrap",
    ["scripts/run-filecoin-production-bootstrap.mjs", "--json"],
    ["scripts/run-filecoin-production-bootstrap.mjs", "--json", "--execute"],
  ),
  step(
    "sharing",
    "Plan or execute public sharing bootstrap",
    ["scripts/run-sharing-production-bootstrap.mjs", "--json"],
    ["scripts/run-sharing-production-bootstrap.mjs", "--json", "--execute"],
  ),
  step(
    "leaderboard",
    "Plan or execute leaderboard backend bootstrap",
    ["scripts/run-leaderboard-production-bootstrap.mjs", "--json"],
    ["scripts/run-leaderboard-production-bootstrap.mjs", "--json", "--execute"],
  ),
  step(
    "env-merge",
    "Merge generated production verify env",
    ["scripts/run-production-env-merge.mjs", "--json"],
    ["scripts/run-production-env-merge.mjs", "--json", "--out=.env.production.local"],
  ),
  step("collector", "Collect production acceptance state", ["scripts/run-production-acceptance-collector.mjs", "--json"]),
  step("production-evidence", "Run strict production evidence", ["scripts/run-production-evidence.mjs"]),
  step("goal-audit", "Run original goal audit", ["scripts/run-production-goal-audit.mjs", "--json"]),
];

const tail = (text, maxLines = 18) => {
  const lines = String(text ?? "").trim().split("\n").filter(Boolean);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
};

const parseJsonOutput = (text) => {
  const raw = String(text ?? "").trim();
  if (!raw) return undefined;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
};

const unique = (items) => Array.from(new Set(items.filter(Boolean)));
const stepSatisfied = (item) => item.status === "passed" && item.parsedReady !== false && !item.parsedBlockedStage;

const readJsonArtifact = (filePath) => {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
};

const summarizeProductionEvidenceArtifact = (parsed) => {
  const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
  if (checks.length === 0) return {};
  const required = checks.filter((check) => check?.required);
  const passed = required.filter((check) => check?.status === "passed");
  const failed = required.filter((check) => check?.status !== "passed");
  const firstFailed = failed[0];
  return {
    parsedReady: failed.length === 0,
    parsedNextAction: firstFailed?.action,
    parsedCommands: ["bun run verify:production"],
    parsedMissingEnv: failed.map((check) => `${check.label}: ${check.detail}`),
    parsedStageReadyCount: passed.length,
    parsedTotalStages: required.length,
    parsedProgressLabel: "required checks",
    parsedBlockedStage: firstFailed
      ? {
          id: firstFailed.id,
          label: firstFailed.label,
          status: firstFailed.status,
          command: "bun run verify:production",
          missingEnv: [firstFailed.detail].filter(Boolean),
          detail: firstFailed.action || firstFailed.detail,
        }
      : undefined,
  };
};

const summarizeGoalAuditArtifact = (parsed) => {
  const requirements = Array.isArray(parsed?.requirements) ? parsed.requirements : [];
  if (requirements.length === 0) return {};
  const todo = requirements.filter((item) => item?.status !== "done");
  const firstTodo = todo[0];
  return {
    parsedReady: Boolean(parsed?.ready),
    parsedNextAction: parsed?.nextAction || firstTodo?.nextAction,
    parsedCommands: unique(requirements.map((item) => item?.command)),
    parsedMissingEnv: unique(todo.flatMap((item) => (Array.isArray(item?.missing) ? item.missing : []))),
    parsedStageReadyCount: parsed?.passedRequirements,
    parsedTotalStages: parsed?.totalRequirements,
    parsedProgressLabel: "requirements",
    parsedBlockedStage: firstTodo
      ? {
          id: firstTodo.id,
          label: firstTodo.label,
          status: firstTodo.status,
          command: firstTodo.command,
          missingEnv: Array.isArray(firstTodo.missing) ? firstTodo.missing : [],
          detail: firstTodo.evidence || firstTodo.nextAction,
        }
      : undefined,
  };
};

const summarizeSecretsHandoffArtifact = (parsed) => {
  const missingManual = Array.isArray(parsed?.missingManualKeys) ? parsed.missingManualKeys : [];
  const missingGenerated = Array.isArray(parsed?.missingGeneratedKeys) ? parsed.missingGeneratedKeys : [];
  const staleEvidence = Array.isArray(parsed?.staleEvidenceKeys) ? parsed.staleEvidenceKeys : [];
  const missingEnv = unique([
    ...missingManual,
    ...missingGenerated.map((key) => `generated ${key}`),
    ...staleEvidence.map((key) => `stale ${key}`),
  ]);
  const setupCommands = Array.isArray(parsed?.setupCommands) ? parsed.setupCommands : [];
  const commands = unique([...(Array.isArray(parsed?.commands) ? parsed.commands : []), ...setupCommands]);
  return {
    parsedReady: Boolean(parsed?.ready),
    parsedNextAction: parsed?.nextAction,
    parsedCommands: commands,
    parsedMissingEnv: missingEnv,
    parsedStageReadyCount: parsed?.ready ? 1 : 0,
    parsedTotalStages: 1,
    parsedProgressLabel: "handoff",
    parsedBlockedStage: parsed?.ready
      ? undefined
      : {
          id: "production-secrets",
          label: "Production secrets handoff",
          status: "blocked",
          command: setupCommands[0] || commands[0] || "bun run secrets:handoff",
          missingEnv,
          detail: parsed?.nextAction,
        },
  };
};

const summarizePublicDeploymentArtifact = (parsed) => {
  const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
  const failed = checks.filter((check) => !check?.passed);
  const firstFailed = failed[0];
  return {
    parsedReady: Boolean(parsed?.ready),
    parsedNextAction: parsed?.nextAction,
    parsedCommands: ["bun run verify:acceptance", "bun run build", "bun run deploy:pages", "bun run deploy:evidence"],
    parsedMissingEnv: failed.map((check) => `${check.label}: ${check.detail}`),
    parsedStageReadyCount: checks.length - failed.length,
    parsedTotalStages: checks.length,
    parsedProgressLabel: "deployment checks",
    parsedBlockedStage: firstFailed
      ? {
          id: firstFailed.key,
          label: firstFailed.label,
          status: "blocked",
          command: "bun run deploy:pages && bun run deploy:evidence",
          missingEnv: [firstFailed.detail].filter(Boolean),
          detail: parsed?.nextAction || firstFailed.detail,
        }
      : undefined,
  };
};

const summarizeParsedOutput = (parsed) => {
  if (!parsed || typeof parsed !== "object") return {};
  const stages = Array.isArray(parsed.stages) ? parsed.stages : [];
  const missingEnv = unique([
    ...(Array.isArray(parsed.missingEnv) ? parsed.missingEnv : []),
    ...(Array.isArray(parsed.missingRuntimeEnv) ? parsed.missingRuntimeEnv : []),
    ...(Array.isArray(parsed.missingRequired) ? parsed.missingRequired : []),
    ...(Array.isArray(parsed.blankDeclarations)
      ? parsed.blankDeclarations.map((item) => `blank ${item?.key}${item?.fileName ? ` in ${item.fileName}` : ""}`)
      : []),
    ...stages.flatMap((stage) => (Array.isArray(stage?.missingEnv) ? stage.missingEnv : [])),
  ]);
  const stageReadyCount =
    typeof parsed.stageReadyCount === "number"
      ? parsed.stageReadyCount
      : stages.filter((stage) => stage?.status === "done" || stage?.status === "ready" || stage?.status === "passed").length;
  const totalStages = typeof parsed.totalStages === "number" ? parsed.totalStages : stages.length || undefined;
  const commands = unique([
    ...(Array.isArray(parsed.commands) ? parsed.commands : []),
    ...stages.map((stage) => stage?.command),
  ]);
  const nextBlockedStage = stages.find((stage) => stage?.status && stage.status !== "done" && stage.status !== "ready" && stage.status !== "passed");
  return {
    parsedReady: typeof parsed.ready === "boolean" ? parsed.ready : undefined,
    parsedNextAction: typeof parsed.nextAction === "string" ? parsed.nextAction : undefined,
    parsedCommands: commands,
    parsedMissingEnv: missingEnv,
    parsedStageReadyCount: totalStages ? stageReadyCount : undefined,
    parsedTotalStages: totalStages,
    parsedBlockedStage: nextBlockedStage
      ? {
          id: nextBlockedStage.id,
          label: nextBlockedStage.label,
          status: nextBlockedStage.status,
          command: nextBlockedStage.command,
          missingEnv: Array.isArray(nextBlockedStage.missingEnv) ? nextBlockedStage.missingEnv : [],
          detail: nextBlockedStage.detail,
        }
      : undefined,
  };
};

const parsedOutputForStep = (item, stdout) => {
  if (item.id === "production-evidence") {
    return readJsonArtifact("public/production-evidence.json");
  }
  return parseJsonOutput(stdout);
};

const summarizeStepOutput = (item, parsedOutput) => {
  if (item.id === "production-evidence") return summarizeProductionEvidenceArtifact(parsedOutput);
  if (item.id === "goal-audit") return summarizeGoalAuditArtifact(parsedOutput);
  if (item.id === "secrets-handoff") return summarizeSecretsHandoffArtifact(parsedOutput);
  if (item.id === "public-deployment") return summarizePublicDeploymentArtifact(parsedOutput);
  return summarizeParsedOutput(parsedOutput);
};

const runStep = (item) => {
  const result = spawnSync("bun", item.args, {
    encoding: "utf8",
    shell: false,
    env: process.env,
  });
  const parsedOutput = parsedOutputForStep(item, result.stdout);
  return {
    id: item.id,
    label: item.label,
    command: item.command,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    ...summarizeStepOutput(item, parsedOutput),
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
  };
};

const results = steps.map(runStep);
const failed = results.filter((item) => !stepSatisfied(item));
const artifact = {
  artifactVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "local-script",
  execute,
  ready: failed.length === 0,
  passedSteps: results.filter(stepSatisfied).length,
  totalSteps: results.length,
  failedSteps: failed.length,
  nextAction: failed[0]
    ? `${failed[0].label}: ${failed[0].parsedNextAction || `resolve the reported blockers, then rerun ${execute ? "bun run production:bootstrap -- --execute" : "bun run production:bootstrap"}.`}`
    : "Production bootstrap, evidence and goal audit all passed.",
  steps: results,
  outputPath,
  wrote: !noWrite,
};
artifact.acceptanceChecklist = buildProductionBootstrapAcceptanceChecklist(artifact);

if (!noWrite) {
  await writeEvidenceOutput(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Kickoff Lock Agent production bootstrap");
  console.log(`Mode: ${execute ? "execute" : "plan"}`);
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  console.log(`Steps: ${artifact.passedSteps}/${artifact.totalSteps}`);
  console.log(`Ready: ${artifact.ready ? "yes" : "no"}`);
  console.log(`Next action: ${artifact.nextAction}`);
  console.log("");
  for (const item of results) {
    console.log(`${stepSatisfied(item) ? "PASS" : "FAIL"} ${item.label}`);
    console.log(`  ${item.command}`);
    if (!stepSatisfied(item)) {
      if (item.parsedStageReadyCount !== undefined && item.parsedTotalStages !== undefined) {
        console.log(`  ${item.parsedProgressLabel || "Stages"}: ${item.parsedStageReadyCount}/${item.parsedTotalStages}`);
      }
      if (item.parsedMissingEnv?.length) {
        console.log(`  Missing: ${item.parsedMissingEnv.slice(0, 10).join(", ")}${item.parsedMissingEnv.length > 10 ? ` + ${item.parsedMissingEnv.length - 10} more` : ""}`);
      }
      if (item.parsedNextAction) {
        console.log(`  Next action: ${item.parsedNextAction}`);
      } else {
        const detail = item.stderrTail || item.stdoutTail;
        if (detail) console.log(detail.split("\n").slice(-8).map((line) => `  ${line}`).join("\n"));
      }
    }
  }
}

if (!artifact.ready) process.exitCode = 1;
