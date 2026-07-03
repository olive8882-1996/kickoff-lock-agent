import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { ACCEPTANCE_TEST_SUITES, acceptanceManifestHash } from "../src/acceptance.ts";

const outputPath = resolve(process.env.ACCEPTANCE_EVIDENCE_PATH ?? "public/acceptance-evidence.json");
const uniqueCommands = [...new Set(ACCEPTANCE_TEST_SUITES.map((suite) => suite.command))];

const runCommand = (command) =>
  new Promise((resolveRun) => {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const child = spawn(command, {
      shell: true,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      const completedAt = new Date().toISOString();
      resolveRun({
        command,
        status: code === 0 ? "passed" : "failed",
        startedAt,
        completedAt,
        durationMs: Date.now() - started,
        exitCode: code ?? 1,
      });
    });
  });

const commandResults = new Map();
for (const command of uniqueCommands) {
  commandResults.set(command, await runCommand(command));
}

const suites = ACCEPTANCE_TEST_SUITES.map((suite) => {
  const result = commandResults.get(suite.command);
  return {
    suiteId: suite.id,
    command: suite.command,
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    summary:
      result.status === "passed"
        ? `${suite.label} passed via ${suite.command}.`
        : `${suite.label} failed via ${suite.command}.`,
  };
});

const packet = {
  generatedAt: new Date().toISOString(),
  source: process.env.CI ? "ci" : "local-script",
  appVersion: process.env.npm_package_version,
  suiteManifestHash: acceptanceManifestHash(ACCEPTANCE_TEST_SUITES),
  suites,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
console.log(`Acceptance evidence written to ${outputPath}`);

if (suites.some((suite) => suite.status !== "passed")) {
  process.exitCode = 1;
}
