import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildDataProviderReadinessArtifact,
  buildDataProviderReadinessReport,
  openFootballWorldCupUrl,
  resolvedDataProviderProxyHealthUrl,
  theSportsDbSeasonUrl,
  theSportsDbTableUrl,
} from "../src/dataProviderReadiness.ts";

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

const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = resolve(outArg ? outArg.slice("--out=".length) : "public/data-provider-readiness.json");
const { env, loaded } = await loadEnv();

const fetchProxyHealth = async () => {
  const healthUrl = resolvedDataProviderProxyHealthUrl(env);
  if (!healthUrl) return { health: undefined, healthStatus: undefined, healthUrl: "" };
  try {
    const response = await fetch(healthUrl, { method: "GET" });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = { parseError: "invalid JSON", text: text.slice(0, 240) };
    }
    return { health: body, healthStatus: response.status, healthUrl };
  } catch (error) {
    return { health: { error: String(error) }, healthStatus: 0, healthUrl };
  }
};

const healthResult = await fetchProxyHealth();

const fetchJson = async (url) => {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "kickoff-lock-agent-data-check",
        accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      return { ok: false, status: response.status, rowCount: 0, detail: `invalid JSON: ${text.slice(0, 120)}` };
    }
    return { ok: response.ok, status: response.status, body, detail: response.ok ? "HTTP ok" : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: 0, rowCount: 0, detail: String(error) };
  }
};

const fetchPublicFeedProof = async () => {
  const openfootballUrl = openFootballWorldCupUrl;
  const sportsDbUrl = theSportsDbSeasonUrl(env);
  const sportsDbTableUrl = theSportsDbTableUrl(env);
  const [openfootball, sportsDb, sportsDbTable] = await Promise.all([
    fetchJson(openfootballUrl),
    fetchJson(sportsDbUrl),
    fetchJson(sportsDbTableUrl),
  ]);
  const openfootballRows = Array.isArray(openfootball.body?.matches) ? openfootball.body.matches.length : 0;
  const sportsDbRows = Array.isArray(sportsDb.body?.events) ? sportsDb.body.events.length : 0;
  const sportsDbTableRows = Array.isArray(sportsDbTable.body?.table) ? sportsDbTable.body.table.length : 0;
  return {
    checkedAt: new Date().toISOString(),
    openfootball: {
      url: openfootballUrl,
      ok: Boolean(openfootball.ok && openfootballRows > 0),
      status: openfootball.status,
      rowCount: openfootballRows,
      detail: openfootball.ok
        ? openfootballRows > 0
          ? `${openfootballRows} World Cup rows`
          : "matches array empty"
        : openfootball.detail,
    },
    theSportsDb: {
      url: sportsDbUrl,
      ok: Boolean(sportsDb.ok && sportsDbRows > 0),
      status: sportsDb.status,
      rowCount: sportsDbRows,
      detail: sportsDb.ok
        ? sportsDbRows > 0
          ? `${sportsDbRows} season events`
          : "events array empty"
        : sportsDb.detail,
    },
    theSportsDbTable: {
      url: sportsDbTableUrl,
      ok: Boolean(sportsDbTable.ok && sportsDbTableRows > 0),
      status: sportsDbTable.status,
      rowCount: sportsDbTableRows,
      detail: sportsDbTable.ok
        ? sportsDbTableRows > 0
          ? `${sportsDbTableRows} league table rows`
          : "table array empty"
        : sportsDbTable.detail,
    },
  };
};

const publicFeedProof = await fetchPublicFeedProof();
const report = buildDataProviderReadinessReport(env, {
  health: healthResult.health,
  healthStatus: healthResult.healthStatus,
  publicFeedProof,
});
const artifact = buildDataProviderReadinessArtifact(report, env, {
  envFiles: loaded,
  health: healthResult.health,
  healthStatus: healthResult.healthStatus,
  publicFeedProof,
});

if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Realtime data provider preflight");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  if (healthResult.healthUrl) {
    console.log(`Health URL: ${healthResult.healthUrl} (${healthResult.healthStatus ?? "not checked"})`);
  }
  console.log(
    `Public feeds: openfootball ${publicFeedProof.openfootball.status}/${publicFeedProof.openfootball.rowCount}, TheSportsDB ${publicFeedProof.theSportsDb.status}/${publicFeedProof.theSportsDb.rowCount}, table ${publicFeedProof.theSportsDbTable.status}/${publicFeedProof.theSportsDbTable.rowCount}`,
  );
  console.log(`Checks: ${report.passed}/${report.total}`);
  for (const check of report.checks) {
    console.log(`${check.passed ? "OK" : "TODO"} ${check.label}: ${check.detail}`);
    if (!check.passed) console.log(`  action: ${check.action}`);
  }
}

if (!report.ready) process.exitCode = 1;
