import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildFilecoinSealApiReadinessReport,
  resolvedPublicSealHealthUrl,
} from "../src/filecoinSealApiReadiness.ts";

const includeExample = process.argv.includes("--include-example");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

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

const proofStoreWritable = async (path) => {
  if (!path) return undefined;
  const parent = resolve(dirname(path));
  try {
    await mkdir(parent, { recursive: true });
    await access(parent, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

const json = process.argv.includes("--json");
const { env, loaded } = await loadEnv();
const writable = await proofStoreWritable(env.FILECOIN_PROOF_STORE_PATH?.trim());
const healthUrl = resolvedPublicSealHealthUrl(env);
const fetchHealth = async () => {
  if (!healthUrl) return {};
  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: env.VITE_FILECOIN_SEAL_TOKEN?.trim()
        ? { Authorization: `Bearer ${env.VITE_FILECOIN_SEAL_TOKEN.trim()}` }
        : undefined,
    });
    const text = await response.text();
    return {
      healthStatus: response.status,
      health: text ? JSON.parse(text) : undefined,
    };
  } catch (error) {
    return {
      healthStatus: 0,
      health: {
        ok: false,
        error: "health_fetch_failed",
        detail: error?.message ?? "Failed to fetch Filecoin seal API health.",
      },
    };
  }
};
const healthEvidence = await fetchHealth();
const report = buildFilecoinSealApiReadinessReport(env, {
  proofStoreWritable: writable,
  ...healthEvidence,
});

if (json) {
  console.log(JSON.stringify({ envFiles: loaded, healthUrl, ...report }, null, 2));
} else {
  console.log("Filecoin seal API production preflight");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  if (healthUrl) console.log(`Health URL: ${healthUrl}`);
  console.log(`Checks: ${report.passed}/${report.total}`);
  for (const check of report.checks) {
    console.log(`${check.passed ? "OK" : "TODO"} ${check.label}: ${check.detail}`);
    if (!check.passed) console.log(`  action: ${check.action}`);
  }
}

if (!report.ready) process.exitCode = 1;
