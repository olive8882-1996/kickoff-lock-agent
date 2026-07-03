import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildDataProductionDoctorReport } from "../src/dataProductionDoctor.ts";

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

const { env, loaded } = await loadEnv();
const report = await buildDataProductionDoctorReport(env);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ envFiles: loaded, ...report }, null, 2));
} else {
  console.log("Realtime data production doctor");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  console.log(`Required checks: ${report.requiredPassed}/${report.requiredTotal}`);
  console.log("");
  for (const check of report.checks) {
    const mark = check.status === "passed" ? "OK" : check.status === "skipped" ? "SKIP" : check.status === "warning" ? "WARN" : "TODO";
    console.log(`${mark} ${check.label}: ${check.detail}`);
    if (check.sampleIds?.length) console.log(`  samples: ${check.sampleIds.join(", ")}`);
    if (check.url) console.log(`  url: ${check.url}`);
    if (check.status !== "passed") console.log(`  action: ${check.action}`);
  }
}

if (!report.ready) process.exitCode = 1;

