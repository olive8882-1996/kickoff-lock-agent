import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildProductionTargetSeed,
  readShareImageMetadata,
} from "../src/productionTargetSeed.ts";
import { parseEnvText } from "../src/productionEvidence.ts";

const includeExample = process.argv.includes("--include-example");
const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = resolve(outputArg ? outputArg.replace("--out=", "") : "public/production-public-fixtures.json");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

const loadEnvFiles = async () => {
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
  return { merged, loaded };
};

const { merged, loaded } = await loadEnvFiles();
const values = { ...merged, ...process.env };
const recordImage = await readShareImageMetadata(values, fetch, "record");
const modeImage = await readShareImageMetadata(values, fetch, "mode");
const seed = await buildProductionTargetSeed(values, { record: recordImage, mode: modeImage });
const fixtures = {
  generatedAt: new Date().toISOString(),
  source: "production-target-seed",
  profile: {
    ...seed.profile,
    records: [seed.record],
    modeRuns: seed.modeRuns,
    shareArtifacts: seed.shareArtifacts,
    locks: 1,
    revealed: seed.record.result ? 1 : 0,
    modeProofs: seed.modeRuns.length,
    averageScore: seed.record.result?.totalScore ?? 0,
    bestScore: seed.record.result?.totalScore ?? 0,
    xp: 120 + (seed.record.result?.totalScore ?? 0) + seed.modeRuns.length * 90 + seed.modeRuns.reduce((sum, run) => sum + (run.score ?? 0), 0),
  },
  record: seed.record,
  modeRun: seed.modeRun,
  modeRuns: seed.modeRuns,
  shareArtifacts: seed.shareArtifacts,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`);

console.log(`Production public fixtures written to ${outputPath}`);
console.log(`Env files: ${loaded.join(", ") || "none"}`);
console.log(seed.verifyEnv.trim());
