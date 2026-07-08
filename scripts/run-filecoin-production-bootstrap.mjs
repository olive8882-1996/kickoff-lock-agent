import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildFilecoinProductionBootstrapPlan } from "../src/filecoinProductionBootstrap.ts";

const includeExample = process.argv.includes("--include-example");
const execute = process.argv.includes("--execute");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = resolve(outArg ? outArg.slice("--out=".length) : "public/filecoin-bootstrap-plan.json");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

const loadEnv = async () => {
  const merged = {};
  const loaded = [];
  for (const fileName of envFiles) {
    try {
      Object.assign(merged, parseEnvText(await readFile(resolve(fileName), "utf8")));
      loaded.push(fileName);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return { env: { ...merged, ...process.env }, loaded };
};

const proofStoreWritable = async (path) => {
  if (!path) return undefined;
  const parent = resolve(dirname(path));
  try {
    await mkdir(parent, { recursive: true });
    await access(parent, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

const { env, loaded } = await loadEnv();
const writable = await proofStoreWritable(env.FILECOIN_PROOF_STORE_PATH?.trim());
const plan = buildFilecoinProductionBootstrapPlan(env, { execute, proofStoreWritable: writable });
const artifact = {
  generatedAt: new Date().toISOString(),
  source: "local-script",
  envFiles: loaded,
  includeExample,
  outputPath,
  wrote: !noWrite,
  ...plan,
};

if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Filecoin production bootstrap");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  console.log(`Artifact: ${noWrite ? "not written" : outputPath}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Mode: ${execute ? "execute" : "plan"}`);
  console.log(`Stages: ${plan.stageReadyCount}/${plan.totalStages} ready or done`);
  console.log(`Blocked: ${plan.blockedStages}`);
  if (plan.missingEnv.length) console.log(`Missing env: ${plan.missingEnv.join(", ")}`);
  console.log(`Next action: ${plan.nextAction}`);
  console.log("");
  for (const stage of plan.stages) {
    console.log(`${stage.status.toUpperCase()} ${stage.label}`);
    console.log(`  command: ${stage.command}`);
    console.log(`  execute: ${stage.executeCommand}`);
    console.log(`  requires: ${stage.requiredEnv.join(", ")}`);
    console.log(`  outputs: ${stage.outputEnv.join(", ")}`);
    if (stage.missingEnv.length) console.log(`  missing: ${stage.missingEnv.join(", ")}`);
    console.log(`  detail: ${stage.detail}`);
  }
  console.log("");
  console.log("Command queue:");
  for (const command of plan.commands) console.log(`- ${command}`);
  console.log("");
  console.log("Read-back commands:");
  for (const command of plan.readBackCommands) {
    console.log(`- ${command.ready ? "READY" : "BLOCKED"} ${command.label}`);
    console.log(`  ${command.command}`);
    if (command.expectedPayloadHash) console.log(`  expect payload hash: ${command.expectedPayloadHash}`);
  }
}

if (execute && plan.ready) {
  for (const stage of plan.stages.filter((item) => item.status !== "done")) {
    const [command, ...args] = stage.executeCommand.split(/\s+/);
    const result = spawnSync(command, args, { stdio: "inherit", shell: false });
    if (result.error || result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} else if (!plan.ready) {
  process.exitCode = 1;
}
