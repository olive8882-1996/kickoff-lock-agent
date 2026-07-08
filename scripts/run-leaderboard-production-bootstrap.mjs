import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildLeaderboardProductionArtifact,
  buildLeaderboardProductionBootstrapPlan,
} from "../src/leaderboardProductionBootstrap.ts";
import { buildSupabaseProductionDoctorReport } from "../src/supabaseProductionDoctor.ts";

const includeExample = process.argv.includes("--include-example");
const execute = process.argv.includes("--execute");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = resolve(outArg ? outArg.slice("--out=".length) : "public/leaderboard-backend.json");
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

const { env, loaded } = await loadEnv();
const plan = buildLeaderboardProductionBootstrapPlan(env, { execute });
const doctor = await buildSupabaseProductionDoctorReport(env);
const artifact = buildLeaderboardProductionArtifact(plan, { env, envFiles: loaded, doctor });

if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (json) {
  console.log(JSON.stringify({ includeExample, ...artifact }, null, 2));
} else {
  console.log("Leaderboard production bootstrap");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Mode: ${execute ? "execute" : "plan"}`);
  console.log(`Stages: ${plan.stageReadyCount}/${plan.totalStages} ready or done`);
  console.log(`Blocked: ${plan.blockedStages}`);
  console.log(`Backend scopes: ${artifact.acceptance.passedScopeCount}/${artifact.acceptance.requiredScopeCount}`);
  if (artifact.doctor?.failedLeaderboardCheckIds.length) {
    console.log(`Failed leaderboard checks: ${artifact.doctor.failedLeaderboardCheckIds.join(", ")}`);
  }
  if (plan.missingEnv.length) console.log(`Missing env: ${plan.missingEnv.join(", ")}`);
  console.log(`Next action: ${plan.nextAction}`);
  console.log("");
  console.log("Target queries:");
  console.log(`  global: ${plan.targetQueries.global}`);
  console.log(`  friend: ${plan.targetQueries.friend}`);
  console.log(`  season: ${plan.targetQueries.season}`);
  console.log("");
  console.log("Board queries:");
  console.log(`  global: ${plan.boardQueries.global}`);
  console.log(`  friend: ${plan.boardQueries.friend}`);
  console.log(`  season: ${plan.boardQueries.season}`);
  console.log("");
  console.log("Read-back commands:");
  for (const item of plan.readBackCommands) {
    console.log(`  ${item.ready ? "READY" : "BLOCKED"} ${item.label}`);
    console.log(`    ${item.command}`);
  }
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
} else if (!artifact.ready) {
  process.exitCode = 1;
}
