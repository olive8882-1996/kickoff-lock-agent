import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildDataTargetScoutReport } from "../src/dataTargetScout.ts";

const envFiles = [".env.example", ".env", ".env.local", ".env.production", ".env.production.local"];

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
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ envFiles: loaded, ...report }, null, 2));
  } else {
    console.log("Realtime data target scout");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    console.log(`Checked fixtures: ${report.checkedFixtures}`);
    console.log(`Recommended fixture: ${report.fixtureId || "none"}`);
    console.log(`Ready: ${report.ready ? "yes" : "no"}`);
    console.log("");
    for (const candidate of report.candidates.slice(0, 5)) {
      console.log(`${candidate.ready ? "OK" : "TODO"} ${candidate.fixtureId} ${candidate.label} · score ${candidate.score}`);
      for (const endpoint of candidate.endpoints) {
        console.log(`  ${endpoint.status === "passed" ? "OK" : "TODO"} ${endpoint.key}: ${endpoint.rows} rows`);
        if (endpoint.sampleIds.length) console.log(`    samples: ${endpoint.sampleIds.join(", ")}`);
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
