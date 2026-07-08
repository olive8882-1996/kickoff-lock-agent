import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildCloudflarePagesDeployPlan,
} from "../src/cloudflarePagesDeployment.ts";
import { REQUIRED_CLOUDFLARE_PAGES_FUNCTION_ENTRIES } from "../src/cloudflarePagesDeployPreflight.ts";
import { writeEvidenceOutput } from "../src/evidenceOutput.ts";

const includeExample = process.argv.includes("--include-example");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const skipFunctionsBuild = process.argv.includes("--skip-functions-build");
const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

const loadEnv = () => {
  const merged = {};
  const loaded = [];
  for (const fileName of envFiles) {
    try {
      Object.assign(merged, parseEnvText(readFileSync(resolve(fileName), "utf8")));
      loaded.push(fileName);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return { env: { ...merged, ...process.env }, loaded };
};

const runCapture = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    env: process.env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
};

const readPagesFunctionEntries = () =>
  Object.fromEntries(
    REQUIRED_CLOUDFLARE_PAGES_FUNCTION_ENTRIES.map((entry) => {
      try {
        return [entry.path, readFileSync(resolve(entry.path), "utf8")];
      } catch {
        return [entry.path, undefined];
      }
    }),
  );

const functionsBuild = skipFunctionsBuild
  ? { status: 0, stdout: "skipped (--skip-functions-build)", stderr: "" }
  : runCapture("bunx", ["wrangler", "pages", "functions", "build", "functions", "--outfile=.wrangler/pages-functions.js"]);

const whoami = runCapture("bunx", ["wrangler", "whoami"]);
const wranglerLoginReady = whoami.status === 0 && !/not authenticated/i.test(`${whoami.stdout}\n${whoami.stderr}`);
const { env, loaded } = loadEnv();
const outputPath = resolve(argValue("out") || "public/cloudflare-pages-deploy-plan.json");
const tokenAuthMissing = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => !env[key]?.trim());
const plan = buildCloudflarePagesDeployPlan(env, {
  projectName: argValue("project-name"),
  branch: argValue("branch"),
  outputDir: argValue("dir"),
  functionsBundleReady: functionsBuild.status === 0,
  functionsBundleDetail:
    functionsBuild.status === 0
      ? "Cloudflare Pages Functions bundle compiled with Wrangler."
      : functionsBuild.stderr || functionsBuild.stdout || "Cloudflare Pages Functions build failed.",
  tokenAuthReady: tokenAuthMissing.length === 0,
  wranglerLoginReady,
  tokenAuthMissing,
  functionEntries: readPagesFunctionEntries(),
});
const artifact = {
  artifactVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "local-script",
  envFiles: loaded,
  outputPath,
  wrote: !noWrite,
  functionsBuild: {
    command: "bunx wrangler pages functions build functions --outfile=.wrangler/pages-functions.js",
    status: functionsBuild.status,
    stdoutTail: functionsBuild.stdout.split("\n").slice(-6).join("\n"),
    stderrTail: functionsBuild.stderr.split("\n").slice(-6).join("\n"),
  },
  wranglerWhoami: {
    command: "bunx wrangler whoami",
    status: whoami.status,
    ready: wranglerLoginReady,
    outputTail: `${whoami.stdout}\n${whoami.stderr}`.trim().split("\n").slice(-8).join("\n"),
  },
  ...plan,
};

if (!noWrite) {
  await writeEvidenceOutput(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Cloudflare Pages production preflight");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  console.log(noWrite ? "Artifact: not written (--no-write)" : `Artifact: ${outputPath}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Ready: ${plan.ready ? "yes" : "no"}`);
  console.log(`Project: ${plan.projectName}`);
  console.log(`Branch: ${plan.branch}`);
  console.log(`Planned URL: ${plan.plannedPagesUrl}`);
  console.log(`Stages: ${plan.stageReadyCount}/${plan.totalStages}`);
  console.log(`Next action: ${plan.nextAction}`);
  console.log("");
  console.log("Read-back commands:");
  for (const item of plan.readBackCommands) {
    console.log(`${item.ready ? "READY" : "AFTER DEPLOY"} ${item.label}`);
    console.log(`  ${item.command}`);
  }
  console.log("");
  for (const stage of plan.stages) {
    console.log(`${stage.status === "done" || stage.status === "ready" ? "PASS" : "FAIL"} ${stage.label}`);
    console.log(`  ${stage.command}`);
    if (stage.missingEnv.length) console.log(`  Missing: ${stage.missingEnv.join(", ")}`);
    console.log(`  ${stage.detail}`);
  }
}

if (!plan.ready) process.exitCode = 1;
