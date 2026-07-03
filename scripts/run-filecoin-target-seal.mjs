import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildFilecoinTargetSealReport } from "../src/filecoinTargetSeal.ts";

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

const dryRun = process.argv.includes("--dry-run");
const json = process.argv.includes("--json");
const { env, loaded } = await loadEnv();

try {
  const report = await buildFilecoinTargetSealReport(env, { dryRun });
  if (json) {
    console.log(JSON.stringify({ envFiles: loaded, ...report }, null, 2));
  } else {
    console.log("Filecoin production target seal");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    console.log(`Mode: ${dryRun ? "dry-run" : "POST /seal"}`);
    console.log(`Endpoint: ${report.endpoint || "missing"}`);
    console.log(`Production ready: ${report.productionReady ? "yes" : "no"}`);
    if (report.blockers.length) console.log(`Blockers: ${report.blockers.join(", ")}`);
    console.log("");
    for (const target of report.targets) {
      console.log(`${target.kind}: ${target.id}`);
      console.log(`  payload hash: ${target.payloadHash}`);
      console.log(`  bytes: ${target.byteLength}`);
      if (target.cid) console.log(`  cid: ${target.cid}`);
      if (target.proofUrl) console.log(`  proof: ${target.proofUrl}`);
      if (target.verifyUrl) console.log(`  verify: ${target.verifyUrl}`);
    }
    console.log("");
    console.log("Add this to .env.production.local:");
    console.log(report.verifyEnv.trimEnd());
  }
  if (!dryRun && !report.ready) process.exitCode = 1;
} catch (error) {
  console.error((error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
