import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildProductionDoctorReport } from "../src/productionDoctor.ts";

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

const loadEvidence = async () => {
  try {
    return JSON.parse(await readFile(resolve(process.env.PRODUCTION_EVIDENCE_PATH ?? "public/production-evidence.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
};

const { env, loaded } = await loadEnv();
const evidence = await loadEvidence();
const report = buildProductionDoctorReport(env, evidence);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ envFiles: loaded, ...report }, null, 2));
} else {
  console.log("Production doctor");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  console.log(report.headline);
  console.log(`Runtime: ${report.runtime.passed}/${report.runtime.total}`);
  console.log(`Evidence: ${report.evidence.passed}/${report.evidence.total}${report.evidence.generatedAt ? ` (${report.evidence.generatedAt})` : ""}`);
  if (report.runtime.missingEnvKeys.length > 0) {
    console.log(`Missing runtime env: ${report.runtime.missingEnvKeys.join(", ")}`);
  }
  console.log("");
  for (const item of report.items) {
    const mark = item.status === "done" ? "OK" : item.status === "pending" ? "PENDING" : "TODO";
    console.log(`${mark} ${item.label}: ${item.detail}`);
    if (item.status !== "done") {
      if (item.envKeys.length > 0) console.log(`  env: ${item.envKeys.join(", ")}`);
      console.log(`  action: ${item.action}`);
    }
  }
}

if (!report.ready) process.exitCode = 1;

