import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildFilecoinTargetSealArtifact, buildFilecoinTargetSealReport } from "../src/filecoinTargetSeal.ts";

const includeExample = process.argv.includes("--include-example");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];
const noWrite = process.argv.includes("--no-write");
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = resolve(outArg ? outArg.slice("--out=".length) : "public/filecoin-target-seal.json");

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
  const artifact = buildFilecoinTargetSealArtifact(report, { envFiles: loaded });
  if (!noWrite) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  }
  if (json) {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    console.log("Filecoin production target seal");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
    console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
    console.log(`Mode: ${dryRun ? "dry-run" : "POST /seal?async=1 + GET /jobs/:id"}`);
    console.log(`Endpoint: ${report.endpoint || "missing"}`);
    console.log(`Production ready: ${report.productionReady ? "yes" : "no"}`);
    console.log(`Sealed modes: ${artifact.acceptance.modeSealedCount}/${artifact.acceptance.requiredModeSealCount}`);
    console.log(`Upload polling: ${artifact.acceptance.uploadStatusComplete ? "complete" : "incomplete"}`);
    console.log(`Verify polling: ${artifact.acceptance.verifyPollingComplete ? "complete" : "incomplete"}`);
    console.log(`CID query: ${artifact.acceptance.cidQueryComplete ? "complete" : "incomplete"}`);
    if (report.blockers.length) console.log(`Blockers: ${report.blockers.join(", ")}`);
    console.log("");
    for (const target of report.targets) {
      console.log(`${target.kind}: ${target.id}`);
      console.log(`  payload hash: ${target.payloadHash}`);
      console.log(`  bytes: ${target.byteLength}`);
      if (target.backendJobId) console.log(`  backend job: ${target.backendJobId}`);
      if (target.uploadStatusUrl) console.log(`  job status: ${target.uploadStatusUrl}`);
      if (target.uploadStatusPolls !== undefined) console.log(`  job polls: ${target.uploadStatusPolls}`);
      if (target.verifyPolls !== undefined) console.log(`  verify polls: ${target.verifyPolls}`);
      if (target.cid) console.log(`  cid: ${target.cid}`);
      if (target.cidQueryUrl) console.log(`  cid query: ${target.cidQueryUrl}`);
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
