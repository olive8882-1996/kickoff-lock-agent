import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { summarizeAcceptanceRunEvidence } from "../src/acceptance.ts";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildRuntimeConfigReadiness } from "../src/runtimeConfig.ts";
import { normalizePublicAppUrl } from "../src/publicUrls.ts";

const loadEnvFiles = async () => {
  const merged = {};
  const loaded = [];
  for (const fileName of [".env.example", ".env", ".env.local", ".env.production", ".env.production.local"]) {
    try {
      Object.assign(merged, parseEnvText(await readFile(resolve(fileName), "utf8")));
      loaded.push(fileName);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] ??= value;
  }
  return loaded;
};

const loadedEnvFiles = await loadEnvFiles();

const outputPath = resolve(process.env.PRODUCTION_EVIDENCE_PATH ?? "public/production-evidence.json");
const strict = process.env.KICKOFF_VERIFY_ALLOW_FAILURES !== "1";
const checkedAt = () => new Date().toISOString();
const checks = [];

const env = (key) => process.env[key]?.trim() || "";
const has = (key) => env(key).length > 0;

const push = (check) => {
  checks.push({
    checkedAt: checkedAt(),
    ...check,
  });
};

const statusFrom = (passed, failedDetail) => (passed ? "passed" : failedDetail ? "failed" : "skipped");

const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const readJson = async (url, options = {}) => {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { response, body, text };
};

const checkUrl = async ({ id, category, label, required, url, action, expectText }) => {
  if (!url) {
    push({ id, category, label, required, status: required ? "failed" : "skipped", detail: "URL not configured", action });
    return;
  }
  try {
    const response = await fetchWithTimeout(url, { method: "GET" });
    const text = await response.text().catch(() => "");
    const textOk = expectText ? text.includes(expectText) : true;
    push({
      id,
      category,
      label,
      required,
      status: response.ok && textOk ? "passed" : "failed",
      url,
      detail: response.ok
        ? textOk
          ? `HTTP ${response.status}`
          : `HTTP ${response.status}, expected text missing`
        : `HTTP ${response.status}`,
      action,
    });
  } catch (error) {
    push({ id, category, label, required, status: "failed", url, detail: String(error), action });
  }
};

const checkPublicAcceptanceEvidence = async (publicAppUrl) => {
  const url = publicAppUrl ? new URL("acceptance-evidence.json", publicAppUrl).toString() : "";
  if (!url) {
    push({
      id: "public-acceptance-evidence",
      category: "public-app",
      label: "Published acceptance evidence",
      required: true,
      status: "failed",
      detail: "URL not configured",
      action: "Run bun run verify:acceptance before bun run build and deploy dist.",
    });
    return;
  }
  try {
    const { response, body } = await readJson(url);
    const summary = summarizeAcceptanceRunEvidence(body);
    const detail = response.ok
      ? summary.complete
        ? `${summary.passed}/${summary.total} suites, ${summary.suiteManifestHash}`
        : `${summary.passed}/${summary.total} suites, ${
            summary.manifestHashMismatch
              ? "manifest mismatch"
              : summary.evidenceStale
                ? "evidence older than 7 days"
                : summary.missingSuiteIds.length > 0
                  ? `missing ${summary.missingSuiteIds.join(", ")}`
                  : "not complete"
          }`
      : `HTTP ${response.status}`;
    push({
      id: "public-acceptance-evidence",
      category: "public-app",
      label: "Published acceptance evidence",
      required: true,
      status: response.ok && summary.complete ? "passed" : "failed",
      url,
      detail,
      action: "Run bun run verify:acceptance before bun run build and deploy dist.",
    });
  } catch (error) {
    push({
      id: "public-acceptance-evidence",
      category: "public-app",
      label: "Published acceptance evidence",
      required: true,
      status: "failed",
      url,
      detail: String(error),
      action: "Run bun run verify:acceptance before bun run build and deploy dist.",
    });
  }
};

const supabaseHeaders = () => ({
  apikey: env("VITE_SUPABASE_ANON_KEY"),
  Authorization: `Bearer ${env("VITE_SUPABASE_ANON_KEY")}`,
});

const supabaseRestUrl = (path) => `${env("VITE_SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`;

const checkSupabaseJson = async ({ id, label, required, path, validate, action }) => {
  if (!has("VITE_SUPABASE_URL") || !has("VITE_SUPABASE_ANON_KEY")) {
    push({
      id,
      category: "supabase",
      label,
      required,
      status: required ? "failed" : "skipped",
      detail: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY",
      action,
    });
    return undefined;
  }
  const url = supabaseRestUrl(path);
  try {
    const { response, body } = await readJson(url, { headers: supabaseHeaders() });
    const result = response.ok ? validate(body) : { passed: false, detail: `HTTP ${response.status}` };
    push({
      id,
      category: "supabase",
      label,
      required,
      status: result.passed ? "passed" : "failed",
      url,
      detail: result.detail,
      action,
      sampleIds: result.sampleIds,
    });
    return body;
  } catch (error) {
    push({ id, category: "supabase", label, required, status: "failed", url, detail: String(error), action });
    return undefined;
  }
};

const singleRowResult = (rows, targetId, label, sampleId = "id") => {
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return {
    passed: Boolean(targetId && row),
    detail: targetId
      ? row
        ? `${label} ${targetId} read back`
        : `${label} ${targetId} missing`
      : `${label} id missing`,
    sampleIds: Array.isArray(rows) ? rows.map((item) => String(item?.[sampleId] ?? item?.id ?? "")).filter(Boolean) : [],
  };
};

const sealHealthUrl = () => {
  const endpoint = env("VITE_FILECOIN_SEAL_API");
  if (!endpoint) return "";
  const url = new URL(endpoint, env("VITE_PUBLIC_APP_URL") || "http://127.0.0.1/");
  url.pathname = url.pathname
    .replace(/\/seal\/?$/, "/health")
    .replace(/\/verify\/?$/, "/health")
    .replace(/\/proof\/?.*$/, "/health");
  url.search = "";
  return url.toString();
};

const addRuntimeChecks = () => {
  const items = buildRuntimeConfigReadiness(process.env);
  for (const item of items) {
    push({
      id: `runtime-${item.key}`,
      category: "runtime",
      label: item.label,
      required: item.required,
      status: item.passed ? "passed" : item.required ? "failed" : "warning",
      detail: item.detail,
      action: item.passed ? "Configured." : item.action,
    });
  }
};

const checkPublicApp = async () => {
  const publicAppUrl = normalizePublicAppUrl(env("VITE_PUBLIC_APP_URL"));
  await checkUrl({
    id: "public-app-root",
    category: "public-app",
    label: "Public app root",
    required: true,
    url: publicAppUrl,
    action: "Deploy the final dist folder to the configured HTTPS URL.",
  });
  await checkPublicAcceptanceEvidence(publicAppUrl);
  await checkUrl({
    id: "public-logo-asset",
    category: "public-app",
    label: "Published logo asset",
    required: true,
    url: publicAppUrl ? new URL("assets/kickoff-lock-icon.png", publicAppUrl).toString() : "",
    action: "Deploy static assets from dist/assets.",
  });
};

const checkSupabase = async () => {
  await checkSupabaseJson({
    id: "supabase-backend-health",
    label: "Backend schema health",
    required: true,
    path: "kickoff_backend_health?select=*&limit=1",
    validate: (rows) => {
      const row = Array.isArray(rows) ? rows[0] : undefined;
      return {
        passed: Boolean(row?.ready),
        detail: row
          ? row.ready
            ? `schema ${row.schema_version ?? "unknown"} ready`
            : `not ready: ${row.detail ?? "backend health failed"}`
          : "no kickoff_backend_health rows returned",
      };
    },
    action: "Apply supabase.schema.sql and verify grants/RLS policies.",
  });

  const userId = env("KICKOFF_VERIFY_USER_ID");
  const friendCode = env("KICKOFF_VERIFY_FRIEND_CODE");
  const seasonKey = env("KICKOFF_VERIFY_SEASON_KEY");
  const leaderboardSelect = "select=id,friend_code,season_key,xp,verified_proofs,mode_proofs";
  await checkSupabaseJson({
    id: "leaderboard-global-current-user",
    label: "Global leaderboard current user",
    required: true,
    path: userId
      ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encodeURIComponent(userId)}&limit=1`
      : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
    validate: (rows) => ({
      passed: Boolean(userId && Array.isArray(rows) && rows.some((row) => row.id === userId)),
      detail: userId
        ? `${Array.isArray(rows) ? rows.length : 0} rows for ${userId}`
        : "KICKOFF_VERIFY_USER_ID missing",
      sampleIds: Array.isArray(rows) ? rows.map((row) => String(row.id)).filter(Boolean) : [],
    }),
    action: "Set KICKOFF_VERIFY_USER_ID to a synced user that appears in kickoff_leaderboard.",
  });
  await checkSupabaseJson({
    id: "leaderboard-friend-current-user",
    label: "Friend leaderboard current user",
    required: true,
    path:
      userId && friendCode
        ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encodeURIComponent(userId)}&friend_code=eq.${encodeURIComponent(friendCode)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
    validate: (rows) => ({
      passed: Boolean(userId && friendCode && Array.isArray(rows) && rows.some((row) => row.id === userId)),
      detail: userId && friendCode
        ? `${Array.isArray(rows) ? rows.length : 0} rows for ${userId}/${friendCode}`
        : "KICKOFF_VERIFY_USER_ID or KICKOFF_VERIFY_FRIEND_CODE missing",
      sampleIds: Array.isArray(rows) ? rows.map((row) => String(row.id)).filter(Boolean) : [],
    }),
    action: "Set KICKOFF_VERIFY_USER_ID and KICKOFF_VERIFY_FRIEND_CODE for a synced leaderboard row.",
  });
  await checkSupabaseJson({
    id: "leaderboard-season-current-user",
    label: "Season leaderboard current user",
    required: true,
    path:
      userId && seasonKey
        ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encodeURIComponent(userId)}&season_key=eq.${encodeURIComponent(seasonKey)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
    validate: (rows) => ({
      passed: Boolean(userId && seasonKey && Array.isArray(rows) && rows.some((row) => row.id === userId)),
      detail: userId && seasonKey
        ? `${Array.isArray(rows) ? rows.length : 0} rows for ${userId}/${seasonKey}`
        : "KICKOFF_VERIFY_USER_ID or KICKOFF_VERIFY_SEASON_KEY missing",
      sampleIds: Array.isArray(rows) ? rows.map((row) => String(row.id)).filter(Boolean) : [],
    }),
    action: "Set KICKOFF_VERIFY_USER_ID and KICKOFF_VERIFY_SEASON_KEY for a synced leaderboard row.",
  });

  const profileId = env("KICKOFF_VERIFY_PROFILE_ID");
  const proofId = env("KICKOFF_VERIFY_PROOF_ID");
  const modeId = env("KICKOFF_VERIFY_MODE_ID");
  await checkSupabaseJson({
    id: "supabase-profile-target",
    label: "Public profile target row",
    required: true,
    path: profileId
      ? `kickoff_profiles?select=id,friend_code,updated_at&id=eq.${encodeURIComponent(profileId)}&limit=1`
      : "kickoff_profiles?select=id&limit=1",
    validate: (rows) => singleRowResult(rows, profileId, "profile"),
    action: "Set KICKOFF_VERIFY_PROFILE_ID to a synced public profile id.",
  });
  await checkSupabaseJson({
    id: "supabase-record-target",
    label: "Public prediction target row",
    required: true,
    path: proofId
      ? `kickoff_records?select=id,user_id,season_key,friend_code,total_score&id=eq.${encodeURIComponent(proofId)}&limit=1`
      : "kickoff_records?select=id&limit=1",
    validate: (rows) => singleRowResult(rows, proofId, "prediction"),
    action: "Set KICKOFF_VERIFY_PROOF_ID to a synced prediction capsule id.",
  });
  await checkSupabaseJson({
    id: "supabase-mode-target",
    label: "Public mode proof target row",
    required: true,
    path: modeId
      ? `kickoff_mode_runs?select=id,user_id,mode_id,status,score&id=eq.${encodeURIComponent(modeId)}&limit=1`
      : "kickoff_mode_runs?select=id&limit=1",
    validate: (rows) => singleRowResult(rows, modeId, "mode proof"),
    action: "Set KICKOFF_VERIFY_MODE_ID to a synced mode proof run id.",
  });
  await checkSupabaseJson({
    id: "supabase-share-artifact-target",
    label: "Public share artifact target row",
    required: true,
    path: proofId
      ? `kickoff_share_artifacts?select=id,kind,image_url,image_hash,proof_url&id=eq.${encodeURIComponent(proofId)}&kind=eq.record&limit=1`
      : "kickoff_share_artifacts?select=id,kind&limit=1",
    validate: (rows) => {
      const row = Array.isArray(rows) ? rows[0] : undefined;
      return {
        passed: Boolean(proofId && row?.image_url && row?.image_hash),
        detail: proofId
          ? row?.image_url && row?.image_hash
            ? `record:${proofId} share artifact with public image read back`
            : `record:${proofId} share artifact missing image_url or image_hash`
          : "record proof id missing",
        sampleIds: Array.isArray(rows) ? rows.map((item) => `${item.kind}:${item.id}`).filter(Boolean) : [],
      };
    },
    action: "Generate a record share card, upload it to Supabase Storage, and sync kickoff_share_artifacts.",
  });
};

const checkPublicProofLinks = async () => {
  const publicAppUrl = normalizePublicAppUrl(env("VITE_PUBLIC_APP_URL"));
  await checkUrl({
    id: "public-profile-link",
    category: "sharing",
    label: "Public profile link",
    required: true,
    url: publicAppUrl && has("KICKOFF_VERIFY_PROFILE_ID")
      ? `${publicAppUrl}?profile=${encodeURIComponent(env("KICKOFF_VERIFY_PROFILE_ID"))}`
      : "",
    action: "Set KICKOFF_VERIFY_PROFILE_ID to a synced Supabase profile id.",
  });
  await checkUrl({
    id: "public-proof-link",
    category: "sharing",
    label: "Public prediction proof link",
    required: true,
    url: publicAppUrl && has("KICKOFF_VERIFY_PROOF_ID")
      ? `${publicAppUrl}?proof=${encodeURIComponent(env("KICKOFF_VERIFY_PROOF_ID"))}`
      : "",
    action: "Set KICKOFF_VERIFY_PROOF_ID to a synced capsule id.",
  });
  await checkUrl({
    id: "public-mode-link",
    category: "sharing",
    label: "Public mode proof link",
    required: true,
    url: publicAppUrl && has("KICKOFF_VERIFY_MODE_ID")
      ? `${publicAppUrl}?mode=${encodeURIComponent(env("KICKOFF_VERIFY_MODE_ID"))}`
      : "",
    action: "Set KICKOFF_VERIFY_MODE_ID to a synced mode proof run id.",
  });
  await checkUrl({
    id: "public-share-image",
    category: "sharing",
    label: "Public share image URL",
    required: true,
    url: env("KICKOFF_VERIFY_SHARE_IMAGE_URL"),
    action: "Set KICKOFF_VERIFY_SHARE_IMAGE_URL to a Supabase Storage public PNG URL.",
  });
};

const checkSealApi = async () => {
  const url = sealHealthUrl();
  if (!url) {
    push({
      id: "filecoin-seal-health",
      category: "filecoin",
      label: "Seal API production health",
      required: true,
      status: "failed",
      detail: "Missing VITE_FILECOIN_SEAL_API",
      action: "Deploy the seal API and configure VITE_FILECOIN_SEAL_API.",
    });
    return;
  }
  try {
    const { response, body } = await readJson(url);
    const productionReady = Boolean(
      response.ok &&
        body?.ok &&
        body?.productionReady &&
        !body?.mockMode &&
        body?.hasPrivateKey &&
        body?.authRequired &&
        body?.persistence === "file",
    );
    push({
      id: "filecoin-seal-health",
      category: "filecoin",
      label: "Seal API production health",
      required: true,
      status: productionReady ? "passed" : "failed",
      url,
      detail: response.ok
        ? productionReady
          ? "production-ready Synapse backend"
          : `not production-ready: ${(body?.blockers ?? ["health contract incomplete"]).join(", ")}`
        : `HTTP ${response.status}`,
      action: "Run a non-mock seal API with SYNAPSE_PRIVATE_KEY, FILECOIN_SEAL_TOKEN and FILECOIN_PROOF_STORE_PATH.",
    });
  } catch (error) {
    push({ id: "filecoin-seal-health", category: "filecoin", label: "Seal API production health", required: true, status: "failed", url, detail: String(error) });
  }
};

const checkDataProviders = async () => {
  const key = env("VITE_THESPORTSDB_KEY") || "123";
  const league = env("VITE_THESPORTSDB_LEAGUE_ID") || "4429";
  const season = env("VITE_THESPORTSDB_SEASON") || String(new Date().getUTCFullYear());
  const publicFeeds = [
    {
      id: "thesportsdb-season",
      label: "TheSportsDB season feed",
      url: `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsseason.php?id=${encodeURIComponent(league)}&s=${encodeURIComponent(season)}`,
      validate: (body, text) => Array.isArray(body?.events) || text.includes("\"events\""),
    },
    {
      id: "espn-world-cup-scoreboard",
      label: "ESPN World Cup scoreboard",
      url: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40",
      validate: (body) => Array.isArray(body?.leagues) && body.leagues.some((leagueItem) => String(leagueItem?.slug ?? "").includes("fifa.world")),
    },
  ];
  const feedResults = [];
  for (const feed of publicFeeds) {
    try {
      const { response, body, text } = await readJson(feed.url);
      const passed = response.ok && feed.validate(body, text);
      feedResults.push({ ...feed, passed, detail: passed ? `HTTP ${response.status}` : `HTTP ${response.status}, World Cup payload missing` });
      push({
        id: feed.id,
        category: "data",
        label: feed.label,
        required: false,
        status: passed ? "passed" : "warning",
        url: feed.url,
        detail: passed ? `HTTP ${response.status}` : `HTTP ${response.status}, World Cup payload missing`,
        action: "Keep at least one free public schedule source healthy for continuity.",
      });
    } catch (error) {
      feedResults.push({ ...feed, passed: false, detail: String(error) });
      push({
        id: feed.id,
        category: "data",
        label: feed.label,
        required: false,
        status: "warning",
        url: feed.url,
        detail: String(error),
        action: "Keep at least one free public schedule source healthy for continuity.",
      });
    }
  }
  const continuityPassed = feedResults.some((result) => result.passed);
  push({
    id: "public-football-feed-continuity",
    category: "data",
    label: "Free public football feed continuity",
    required: true,
    status: continuityPassed ? "passed" : "failed",
    detail: feedResults.map((result) => `${result.label}:${result.passed ? "ok" : result.detail}`).join(" · "),
    action: "Keep TheSportsDB or ESPN reachable so schedule/score continuity does not depend on seed data.",
  });
  if (!has("VITE_APIFOOTBALL_KEY")) {
    push({
      id: "api-football-enrichment-live",
      category: "data",
      label: "API-Football enrichment read-back",
      required: true,
      status: "failed",
      detail: "Missing VITE_APIFOOTBALL_KEY",
      action: "Configure API-Football and set KICKOFF_VERIFY_FIXTURE_ID to verify lineups, injuries and odds.",
    });
    return;
  }
  if (!has("KICKOFF_VERIFY_FIXTURE_ID")) {
    push({
      id: "api-football-enrichment-live",
      category: "data",
      label: "API-Football enrichment read-back",
      required: true,
      status: "failed",
      detail: "KICKOFF_VERIFY_FIXTURE_ID missing",
      action: "Set KICKOFF_VERIFY_FIXTURE_ID to a World Cup fixture with lineups, injuries and odds available.",
    });
    return;
  }
  const fixtureId = encodeURIComponent(env("KICKOFF_VERIFY_FIXTURE_ID"));
  const headers = { "x-apisports-key": env("VITE_APIFOOTBALL_KEY") };
  const endpoints = [
    ["lineups", `https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`],
    ["injuries", `https://v3.football.api-sports.io/injuries?fixture=${fixtureId}`],
    ["odds", `https://v3.football.api-sports.io/odds?fixture=${fixtureId}`],
  ];
  const results = [];
  for (const [name, url] of endpoints) {
    try {
      const { response, body } = await readJson(url, { headers });
      const rows = Array.isArray(body?.response) ? body.response.length : 0;
      results.push({ name, ok: response.ok && rows > 0, rows, status: response.status });
    } catch (error) {
      results.push({ name, ok: false, rows: 0, status: String(error) });
    }
  }
  const live = results.filter((result) => result.ok).length;
  push({
    id: "api-football-enrichment-live",
    category: "data",
    label: "API-Football enrichment read-back",
    required: true,
    status: live === endpoints.length ? "passed" : "failed",
    detail: results.map((result) => `${result.name}:${result.rows}`).join(" · "),
    action: "Use a fixture where lineups, injuries and odds endpoints return live rows.",
  });
};

addRuntimeChecks();
await checkPublicApp();
await checkSupabase();
await checkDataProviders();
await checkSealApi();
await checkPublicProofLinks();

const packet = {
  generatedAt: new Date().toISOString(),
  source: process.env.CI ? "ci" : "local-script",
  strict,
  envFiles: loadedEnvFiles,
  checks,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`);

const required = checks.filter((check) => check.required);
const requiredPassed = required.filter((check) => check.status === "passed").length;
const failed = required.filter((check) => check.status !== "passed");
console.log(`Production evidence written to ${outputPath}`);
console.log(`Required checks: ${requiredPassed}/${required.length}`);
for (const check of failed.slice(0, 12)) {
  console.log(`- ${check.id}: ${check.detail}`);
}

if (strict && failed.length > 0) {
  process.exitCode = 1;
}
