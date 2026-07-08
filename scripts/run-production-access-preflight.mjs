import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { productionEnvMergeFileList } from "../src/productionEnvMerge.ts";
import { buildProductionAccessPreflight } from "../src/productionAccessPreflight.ts";

const includeExample = process.argv.includes("--include-example");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const strict = process.argv.includes("--strict");
const skipCli = process.argv.includes("--skip-cli");
const argValue = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const outputPath = resolve(argValue("out") || "public/production-access-preflight.json");
const envFiles = productionEnvMergeFileList({ includeExample });

const readOptional = async (fileName) => {
  try {
    return { fileName, text: await readFile(resolve(fileName), "utf8") };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { fileName, text: "" };
  }
};

const runCliCheck = (provider, args) => {
  const command = `bun ${args.join(" ")}`;
  if (skipCli) {
    return {
      provider,
      command,
      exitCode: null,
      stdout: "",
      stderr: "Skipped by --skip-cli.",
    };
  }
  const result = spawnSync("bun", args, {
    encoding: "utf8",
    shell: false,
    env: process.env,
  });
  return {
    provider,
    command,
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const loaded = await Promise.all(envFiles.map(readOptional));
const env = {
  ...Object.assign({}, ...loaded.map((item) => parseEnvText(item.text))),
  ...process.env,
};
const cliChecks = [
  runCliCheck("cloudflare", ["x", "wrangler", "whoami"]),
  runCliCheck("supabase", ["x", "supabase", "projects", "list"]),
];
const packet = buildProductionAccessPreflight({ env, cliChecks });
const artifact = {
  artifactVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "local-script",
  envFiles: loaded.filter((item) => item.text).map((item) => item.fileName),
  outputPath,
  wrote: !noWrite,
  cliChecks,
  ...packet,
};

if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Production access preflight");
  console.log(`Env files: ${artifact.envFiles.join(", ") || "none"}`);
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  console.log(`Ready: ${artifact.ready ? "yes" : "no"}`);
  console.log(`Stages: ${artifact.stageReadyCount}/${artifact.totalStages}`);
  console.log(`Missing env: ${artifact.missingEnv.join(", ") || "none"}`);
  console.log(`Next action: ${artifact.nextAction}`);
  console.log("");
  for (const stage of artifact.stages) {
    console.log(`${stage.status === "ready" ? "READY" : "BLOCKED"} ${stage.label}`);
    console.log(`  command: ${stage.command}`);
    if (stage.missingEnv.length) console.log(`  missing: ${stage.missingEnv.join(", ")}`);
    console.log(`  ${stage.detail}`);
  }
}

if (strict && !artifact.ready) process.exitCode = 1;
