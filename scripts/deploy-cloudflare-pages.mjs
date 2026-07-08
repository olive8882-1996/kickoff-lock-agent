import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  REQUIRED_CLOUDFLARE_PAGES_FUNCTION_ENTRIES,
  buildCloudflarePagesRuntimePreflight,
} from "../src/cloudflarePagesDeployPreflight.ts";
import { buildPlannedCloudflarePagesRuntimeEnv } from "../src/cloudflarePagesDeployment.ts";

const env = process.env;

const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const hasFlag = (name) => process.argv.includes(`--${name}`);

const projectName = argValue("project-name") || env.CLOUDFLARE_PAGES_PROJECT_NAME || "kickoff-lock-agent";
const branch = argValue("branch") || env.CLOUDFLARE_PAGES_BRANCH || "main";
const outputDir = argValue("dir") || "dist";
const plannedPagesUrl = env.CF_PAGES_URL || `https://${projectName}.pages.dev/`;
const skipBuild = hasFlag("skip-build");
const checkOnly = hasFlag("check");

const authMode = argValue("auth") || env.CLOUDFLARE_AUTH_MODE || "";
const useWranglerLogin = hasFlag("use-wrangler-login") || authMode === "wrangler-login";
const tokenAuthReady = Boolean(env.CLOUDFLARE_API_TOKEN?.trim() && env.CLOUDFLARE_ACCOUNT_ID?.trim());
const tokenAuthMissing = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => !env[key]?.trim());
const strictRuntimeSecrets =
  hasFlag("strict-runtime-secrets") || /^(1|true|yes|on)$/i.test(env.CLOUDFLARE_STRICT_RUNTIME_SECRETS?.trim() ?? "");
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });

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

const checkWranglerLogin = () =>
  new Promise((resolve) => {
    const child = spawn("bunx", ["wrangler", "whoami"], {
      stdio: "pipe",
      shell: process.platform === "win32",
      env,
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve({ ok: false, detail: "wrangler whoami failed to start" }));
    child.on("exit", (code) => {
      resolve({
        ok: code === 0 && !/not authenticated/i.test(output),
        detail: output.trim(),
      });
    });
  });

console.log("Cloudflare Pages deploy");
console.log(`Project: ${projectName}`);
console.log(`Branch: ${branch}`);
console.log(`Output: ${outputDir}`);
console.log(`Mode: ${checkOnly ? "check" : "deploy"}`);
console.log(`Auth: ${tokenAuthReady ? "api-token" : useWranglerLogin ? "wrangler-login" : "auto"}`);

const secretProblems = buildCloudflarePagesRuntimePreflight(buildPlannedCloudflarePagesRuntimeEnv(env, projectName, plannedPagesUrl), {
  functionEntries: readPagesFunctionEntries(),
}).problems;
if (secretProblems.length > 0) {
  const message = [
    "Cloudflare Pages Functions runtime secrets are incomplete:",
    ...secretProblems.map((problem) => `- ${problem}`),
    "Set them as Cloudflare Pages environment variables/secrets, or pass them to CI with CLOUDFLARE_STRICT_RUNTIME_SECRETS=1 for preflight.",
  ].join("\n");
  if (strictRuntimeSecrets) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
}

if (!tokenAuthReady) {
  const login = await checkWranglerLogin();
  if (!login.ok) {
    console.error(`Missing API token env: ${tokenAuthMissing.join(", ")}`);
    console.error("Wrangler login is not available for this shell.");
    if (login.detail) console.error(login.detail);
    console.error(
      "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID for CI, or run `bunx wrangler login` and rerun with --use-wrangler-login.",
    );
    process.exit(1);
  }
  console.log("Wrangler OAuth login detected.");
}

try {
  await run("bun", ["run", "pages:functions:build"]);
  if (!skipBuild) await run("bun", ["run", "build"]);
  if (checkOnly) {
    console.log("Cloudflare credentials and Pages Functions bundle are ready.");
  } else {
    await run("bunx", ["wrangler", "pages", "deploy", outputDir, "--project-name", projectName, "--branch", branch]);
  }
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}
