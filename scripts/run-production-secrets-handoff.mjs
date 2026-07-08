import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { productionEnvMergeFileList } from "../src/productionEnvMerge.ts";
import { buildProductionSecretsHandoff } from "../src/productionSecretsHandoff.ts";

const includeExample = process.argv.includes("--include-example");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const strict = process.argv.includes("--strict");
const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const outputPath = resolve(argValue("out") || "public/production-secrets-handoff.json");
const envPlanPath = argValue("env-plan") || "public/production-env-plan.json";
const collectorPath = argValue("collector") || "public/production-acceptance-collector.json";
const envFiles = productionEnvMergeFileList({ includeExample });

const readOptionalText = async (fileName) => {
  try {
    return { fileName, text: await readFile(resolve(fileName), "utf8") };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { fileName, text: "" };
  }
};

const readOptionalJson = async (fileName) => {
  try {
    return JSON.parse(await readFile(resolve(fileName), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
};

const loaded = await Promise.all(envFiles.map(readOptionalText));
const env = {
  ...Object.assign({}, ...loaded.map((item) => parseEnvText(item.text))),
  ...process.env,
};
const envPlan = await readOptionalJson(envPlanPath);
const collector = await readOptionalJson(collectorPath);
const handoff = buildProductionSecretsHandoff({ env, envPlan, collector });
const artifact = {
  artifactVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "local-script",
  envFiles: loaded.filter((item) => item.text).map((item) => item.fileName),
  envPlanPath,
  collectorPath,
  outputPath,
  wrote: !noWrite,
  ...handoff,
};

if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Production secrets handoff");
  console.log(`Env files: ${artifact.envFiles.join(", ") || "none"}`);
  console.log(`Env plan: ${envPlan ? envPlanPath : "missing"}`);
  console.log(`Production collector: ${collector ? collectorPath : "missing"}`);
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  console.log(`Ready: ${handoff.ready ? "yes" : "no"}`);
  console.log(`Manual missing: ${handoff.missingManualKeys.join(", ") || "none"}`);
  console.log(`Generated missing: ${handoff.missingGeneratedKeys.join(", ") || "none"}`);
  console.log(`Stale evidence: ${handoff.staleEvidenceKeys.join(", ") || "none"}`);
  console.log(`Next action: ${handoff.nextAction}`);
  console.log("");
  console.log("Setup commands:");
  for (const command of handoff.setupCommands.length ? handoff.setupCommands : ["none"]) {
    console.log(`  ${command}`);
  }
  console.log("");
  for (const group of handoff.groups) {
    console.log(`${group.ready ? "READY" : "BLOCKED"} ${group.label}`);
    console.log(`  destination: ${group.destination}`);
    if (group.manualMissing.length) console.log(`  manual missing: ${group.manualMissing.join(", ")}`);
    if (group.generatedMissing.length) console.log(`  generated missing: ${group.generatedMissing.join(", ")}`);
    if (group.staleEvidence.length) console.log(`  stale evidence: ${group.staleEvidence.join(", ")}`);
    for (const item of group.items.filter((entry) => entry.status !== "ready")) {
      console.log(`  - ${item.key}: ${item.status}; ${item.command}`);
    }
  }
}

if (strict && !handoff.ready) process.exitCode = 1;
