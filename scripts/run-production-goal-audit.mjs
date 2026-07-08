import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeEvidenceOutput } from "../src/evidenceOutput.ts";
import { buildProductionGoalAudit } from "../src/productionGoalAudit.ts";

const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const readJsonFile = async (filePath) => {
  try {
    return JSON.parse(await readFile(resolve(filePath), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
};

const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const productionEvidencePath = argValue("production") || "public/production-evidence.json";
const acceptanceEvidencePath = argValue("acceptance") || "public/acceptance-evidence.json";
const envPlanPath = argValue("env-plan") || "public/production-env-plan.json";
const productionCollectorPath = argValue("collector") || "public/production-acceptance-collector.json";
const outputPath = resolve(argValue("out") || "public/production-goal-audit.json");
const productionEvidence = await readJsonFile(productionEvidencePath);
const acceptanceEvidence = await readJsonFile(acceptanceEvidencePath);
const envPlan = await readJsonFile(envPlanPath);
const productionCollector = await readJsonFile(productionCollectorPath);
const audit = buildProductionGoalAudit({ productionEvidence, acceptanceEvidence, envPlan, productionCollector });
const artifact = {
  artifactVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "local-script",
  productionEvidencePath,
  acceptanceEvidencePath,
  envPlanPath,
  productionCollectorPath,
  outputPath,
  wrote: !noWrite,
  ...audit,
};

if (!noWrite) {
  await writeEvidenceOutput(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Production goal audit");
  console.log(`Production evidence: ${productionEvidence ? productionEvidencePath : "missing"}`);
  console.log(`Acceptance evidence: ${acceptanceEvidence ? acceptanceEvidencePath : "missing"}`);
  console.log(`Env plan: ${envPlan ? envPlanPath : "missing"}`);
  console.log(`Production collector: ${productionCollector ? productionCollectorPath : "missing"}`);
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  console.log(`Ready: ${audit.ready ? "yes" : "no"}`);
  console.log(`Requirements: ${audit.passedRequirements}/${audit.totalRequirements}`);
  console.log(`Checks: ${audit.passedChecks}/${audit.totalChecks}`);
  console.log(`Command queue: ${audit.openCommands} open, ${audit.blockedCommands} blocked`);
  if (audit.blankEnvDeclarations.length) {
    console.log(
      `Blank env declarations: ${audit.blankEnvDeclarations
        .map((item) => `${item.key}${item.fileName ? ` (${item.fileName})` : ""}`)
        .join(", ")}`,
    );
  }
  console.log(`Next action: ${audit.nextAction}`);
  console.log("");
  console.log("Command queue:");
  for (const item of audit.commandQueue) {
    console.log(`${item.status.toUpperCase()} ${item.label}`);
    console.log(`  command: ${item.command}`);
    if (item.envHints.length) console.log(`  env hints: ${item.envHints.join(", ")}`);
    console.log(`  reason: ${item.reason}`);
  }
  console.log("");
  for (const item of audit.requirements) {
    console.log(`${item.status.toUpperCase()} ${item.label}: ${item.passed}/${item.total}`);
    console.log(`  command: ${item.command}`);
    if (item.missing.length) console.log(`  missing: ${item.missing.join(", ")}`);
    if (item.envHints?.length) console.log(`  env hints: ${item.envHints.join(", ")}`);
    console.log(`  evidence: ${item.evidence}`);
  }
}

if (!audit.ready) process.exitCode = 1;
