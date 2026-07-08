import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildDataTargetScoutArtifact, buildDataTargetScoutReport } from "../src/dataTargetScout.ts";

const includeExample = process.argv.includes("--include-example");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];
const noWrite = process.argv.includes("--no-write");
const json = process.argv.includes("--json");
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = resolve(outArg ? outArg.slice("--out=".length) : "public/data-target-scout.json");

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

try {
  const { env, loaded } = await loadEnv();
  const report = await buildDataTargetScoutReport(env);
  const artifact = buildDataTargetScoutArtifact(report, { envFiles: loaded });
  if (!noWrite) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  }
  if (json) {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    console.log("Realtime data target scout");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
    console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
    console.log(`Checked fixtures: ${report.checkedFixtures}`);
    console.log(`Recommended fixture: ${report.fixtureId || "none"}`);
    console.log(`Recommended fixture set: ${report.fixtureIds.length ? report.fixtureIds.join(", ") : "none"}`);
    console.log(`Signal matrix: ${report.signalMatrix || "none"}`);
    console.log(`Ready fixtures: ${artifact.acceptance.readyFixtureCount}/${artifact.acceptance.requiredFixtureCount}`);
    console.log(`Gaps: ${artifact.acceptance.gaps.length}`);
    console.log(`Ready: ${report.ready ? "yes" : "no"}`);
    console.log("");
    for (const candidate of report.candidates.slice(0, 5)) {
      console.log(`${candidate.ready ? "OK" : "TODO"} ${candidate.fixtureId} ${candidate.label} · score ${candidate.score}`);
      for (const endpoint of candidate.endpoints) {
        console.log(`  ${endpoint.status === "passed" ? "OK" : "TODO"} ${endpoint.key}: ${endpoint.rows} rows`);
        if (endpoint.sampleIds.length) console.log(`    samples: ${endpoint.sampleIds.join(", ")}`);
      }
      if (candidate.missingEndpoints.length) {
        console.log(`  missing: ${candidate.missingEndpoints.join(", ")}`);
      }
    }
    if (artifact.acceptance.gaps.length) {
      console.log("");
      console.log("Gaps:");
      for (const gap of artifact.acceptance.gaps.slice(0, 5)) {
        console.log(`- ${gap.fixtureId} ${gap.label}: ${gap.missingEndpoints.join(", ")} · ${gap.action}`);
      }
    }
    if (artifact.acceptance.endpointReadBackCommands.length) {
      console.log("");
      console.log("Endpoint read-back commands:");
      for (const command of artifact.acceptance.endpointReadBackCommands.slice(0, 12)) {
        console.log(`${command.ready ? "READY" : "TODO"} ${command.label}: ${command.command}`);
      }
    }
    console.log("");
    console.log(report.nextAction);
    console.log("");
    console.log("Add this to .env.production.local:");
    console.log(report.verifyEnv.trimEnd());
  }
  if (!report.ready) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
