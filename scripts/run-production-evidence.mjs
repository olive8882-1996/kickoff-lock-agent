import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateApiFootballEndpointRows } from "../src/apiFootballEndpointEvidence.ts";
import {
  resolvedDataProviderProxyHealthUrl,
  resolvedDataProviderProxyUrl,
  sameOriginDataProxySelected,
} from "../src/dataProviderReadiness.ts";
import { resolvedPublicSealApi, sameOriginSealSelected } from "../src/filecoinSealApiReadiness.ts";
import { evaluatePublicDeploymentEvidenceArtifact } from "../src/publicDeploymentEvidence.ts";
import {
  buildCacheBustedPublicEvidenceUrl,
  diagnosePublicAcceptanceEvidence,
  evaluatePublicAppRootReadiness,
  evaluateCleanSessionRestoreResults,
  evaluateLeaderboardScopeRows,
  evaluateProductionTargetEnvContract,
  leaderboardRankKeyForScope,
  publicEvidenceNoStoreFetchOptions,
  publicRenderCloudLoaded,
  evaluatePublicRenderSnapshot,
  extractPublicRenderSnapshot,
  parseEnvText,
} from "../src/productionEvidence.ts";
import {
  resolvedDataProxyUrl,
  resolvedFilecoinSealApiUrl,
  buildRuntimeConfigReadiness,
  sameOriginBackendHostProblem,
} from "../src/runtimeConfig.ts";
import { evaluatePublishedRuntimeConfig } from "../src/runtimeConfigExport.ts";
import { normalizePublicAppUrl } from "../src/publicUrls.ts";
import { productionModeCoverageProblem } from "../src/modeEvidence.ts";
import { requiredProductionModeIds } from "../src/productionVerifyTargets.ts";
import { publicShareImageUrlProblem } from "../src/publicShareImageUrl.ts";
import { hasProductionShareChannelEvidence, productionShareChannelProblem } from "../src/shareChannelValidation.ts";
import { validatePublicShareImageResponse } from "../src/shareImageValidation.ts";
import { supabasePublicStorageProblem } from "../src/supabaseStorageUrl.ts";
import { writeEvidenceOutput } from "../src/evidenceOutput.ts";

const includeExample = process.argv.includes("--include-example");
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
let renderBrowser;
let publishedDeploymentEvaluation;

const env = (key) => process.env[key]?.trim() || "";
const has = (key) => env(key).length > 0;
const truthyFlag = (value) => /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
const envList = (key) => env(key).split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
const githubPagesHost = (urlText) => {
  try {
    return new URL(urlText).hostname.endsWith("github.io");
  } catch {
    return false;
  }
};
const evidencePublicAppUrl = () => {
  const publicAppUrl = env("VITE_PUBLIC_APP_URL");
  const pagesUrl = env("CF_PAGES_URL");
  if (pagesUrl && truthyFlag(env("CF_PAGES")) && (!publicAppUrl || githubPagesHost(publicAppUrl))) return pagesUrl;
  return publicAppUrl || pagesUrl;
};
const requiredModeTargetCount = 5;
const requiredModeTypeCoverage = "bracket, parlay, agent-vs-human, upset, group-path, penalty-pressure";
const modeTargetIds = () => envList("KICKOFF_VERIFY_MODE_IDS");
const modeTargetProblem = () => {
  const ids = modeTargetIds();
  if (ids.length >= requiredModeTargetCount) return "";
  if (ids.length > 0) return `KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids; got ${ids.length}`;
  if (has("KICKOFF_VERIFY_MODE_ID")) {
    return `KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough`;
  }
  return "KICKOFF_VERIFY_MODE_IDS missing";
};
const requiredFixtureTargetCount = () => Math.max(1, Number(env("KICKOFF_DATA_SCOUT_TARGETS") || 3) || 3);
const fixtureTargetIds = () => envList("KICKOFF_VERIFY_FIXTURE_IDS");
const fixtureTargetProblem = () => {
  const ids = fixtureTargetIds();
  const requiredCount = requiredFixtureTargetCount();
  if (ids.length >= requiredCount) return "";
  if (ids.length > 0) return `KICKOFF_VERIFY_FIXTURE_IDS needs ${requiredCount} fixture targets; got ${ids.length}`;
  if (has("KICKOFF_VERIFY_FIXTURE_ID")) {
    return `KICKOFF_VERIFY_FIXTURE_IDS needs ${requiredCount} fixture targets; legacy KICKOFF_VERIFY_FIXTURE_ID is not enough`;
  }
  return "KICKOFF_VERIFY_FIXTURE_IDS missing";
};
const inFilter = (ids) => ids.map((id) => encodeURIComponent(id)).join(",");
const filterParam = (key, item) => (item ? `&${key}=eq.${encodeURIComponent(item)}` : "");
const accountScopeFilters = () =>
  [
    filterParam("user_id", env("KICKOFF_VERIFY_USER_ID")),
    filterParam("friend_code", env("KICKOFF_VERIFY_FRIEND_CODE")),
    filterParam("season_key", env("KICKOFF_VERIFY_SEASON_KEY")),
  ].join("");
const configuredDataProxyUrl = () => resolvedDataProviderProxyUrl(process.env) || resolvedDataProxyUrl(process.env);
const configuredSealApiUrl = () => resolvedPublicSealApi(process.env) || resolvedFilecoinSealApiUrl(process.env);
const usingSameOriginSealProxy = () => sameOriginSealSelected(process.env);
const sameOriginDataProxyProblem = () =>
  sameOriginDataProxySelected(process.env)
    ? sameOriginBackendHostProblem(evidencePublicAppUrl(), "VITE_DATA_PROXY_SAME_ORIGIN")
    : "";
const sameOriginSealProxyProblem = () =>
  usingSameOriginSealProxy()
    ? sameOriginBackendHostProblem(evidencePublicAppUrl(), "VITE_FILECOIN_SEAL_SAME_ORIGIN")
    : "";
const proxiedPublicUrl = (targetUrl, source) => {
  const proxyUrl = configuredDataProxyUrl();
  if (!proxyUrl) return targetUrl;
  const proxy = new URL(proxyUrl, "http://localhost/");
  proxy.searchParams.set("url", targetUrl);
  proxy.searchParams.set("source", source);
  return proxy.toString();
};

const dataProxyHealthUrl = () => {
  if (!configuredDataProxyUrl()) return "";
  return resolvedDataProviderProxyHealthUrl(process.env);
};

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

const sampleValue = (value) => {
  if (value && typeof value === "object") return value.id ?? value.name ?? value.title ?? JSON.stringify(value).slice(0, 80);
  return value;
};

const sampleIds = (rows, ...keys) =>
  rows
    .map((row) => sampleValue(keys.map((key) => row?.[key]).find((value) => value !== undefined && value !== null) ?? row?.id))
    .map(String)
    .filter(Boolean)
    .slice(0, 5);

const worldcup26Rows = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.games)) return body.games;
  if (Array.isArray(body?.data)) return body.data;
  return [];
};

const getRenderBrowser = async () => {
  if (renderBrowser) return renderBrowser;
  const { chromium } = await import("playwright");
  renderBrowser = await chromium.launch({ headless: true });
  return renderBrowser;
};

const checkUrl = async ({ id, category, label, required, url, action, expectText, deploymentEvidenceFallback = false }) => {
  if (!url) {
    push({ id, category, label, required, status: required ? "failed" : "skipped", detail: "URL not configured", action });
    return;
  }
  try {
    const response = await fetchWithTimeout(url, { method: "GET" });
    const text = await response.text().catch(() => "");
    const textOk = expectText ? text.includes(expectText) : true;
    const readiness = deploymentEvidenceFallback
      ? evaluatePublicAppRootReadiness({
          responseOk: response.ok,
          status: response.status,
          textOk,
          deploymentEvidencePassed: publishedDeploymentEvaluation?.passed,
          deploymentEvidenceDetail: publishedDeploymentEvaluation?.detail,
        })
      : undefined;
    push({
      id,
      category,
      label,
      required,
      status: readiness ? (readiness.passed ? "passed" : "failed") : response.ok && textOk ? "passed" : "failed",
      url,
      detail: readiness
        ? readiness.detail
        : response.ok
          ? textOk
            ? `HTTP ${response.status}`
            : `HTTP ${response.status}, expected text missing`
          : `HTTP ${response.status}`,
      action,
    });
  } catch (error) {
    const readiness = deploymentEvidenceFallback
      ? evaluatePublicAppRootReadiness({
          error: String(error),
          deploymentEvidencePassed: publishedDeploymentEvaluation?.passed,
          deploymentEvidenceDetail: publishedDeploymentEvaluation?.detail,
        })
      : undefined;
    push({
      id,
      category,
      label,
      required,
      status: readiness?.passed ? "passed" : "failed",
      url,
      detail: readiness?.detail ?? String(error),
      action,
    });
  }
};

const checkPublicImageUrl = async ({ id, label, url, action, requireSupabaseStorage = false }) => {
  if (!url) {
    push({
      id,
      category: "sharing",
      label,
      required: true,
      status: "failed",
      detail: "URL not configured",
      action,
    });
    return;
  }
  const urlProblem = publicShareImageUrlProblem(url, label);
  if (urlProblem) {
    push({ id, category: "sharing", label, required: true, status: "failed", url, detail: urlProblem, action });
    return;
  }
  if (requireSupabaseStorage) {
    const storageProblem = supabasePublicStorageProblem({
      supabaseUrl: env("VITE_SUPABASE_URL"),
      imageUrl: url,
      label,
      requireConfiguredProject: true,
    });
    if (storageProblem) {
      push({ id, category: "sharing", label, required: true, status: "failed", url, detail: storageProblem, action });
      return;
    }
  }
  try {
    const response = await fetchWithTimeout(url, { method: "GET" });
    const validation = await validatePublicShareImageResponse(response);
    push({
      id,
      category: "sharing",
      label,
      required: true,
      status: validation.passed ? "passed" : "failed",
      url,
      detail: validation.detail,
      action,
    });
  } catch (error) {
    push({ id, category: "sharing", label, required: true, status: "failed", url, detail: String(error), action });
  }
};

const checkPublicAcceptanceEvidence = async (publicAppUrl) => {
  const url = publicAppUrl ? buildCacheBustedPublicEvidenceUrl(publicAppUrl, "acceptance-evidence.json") : "";
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
    const { response, body } = await readJson(url, publicEvidenceNoStoreFetchOptions());
    const diagnosis = diagnosePublicAcceptanceEvidence(body, response.ok, response.status);
    push({
      id: "public-acceptance-evidence",
      category: "public-app",
      label: "Published acceptance evidence",
      required: true,
      status: diagnosis.passed ? "passed" : "failed",
      url,
      detail: diagnosis.detail,
      action: diagnosis.action,
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

const checkPublishedRuntimeConfig = async (publicAppUrl) => {
  const url = publicAppUrl ? buildCacheBustedPublicEvidenceUrl(publicAppUrl, "runtime-config.js") : "";
  if (!url) {
    push({
      id: "public-runtime-config",
      category: "public-app",
      label: "Published runtime config",
      required: true,
      status: "failed",
      detail: "URL not configured",
      action: "Run bun run runtime:config, build, deploy dist, then verify the deployed runtime-config.js.",
    });
    return;
  }
  try {
    const response = await fetchWithTimeout(url, { method: "GET", ...publicEvidenceNoStoreFetchOptions() });
    const text = await response.text();
    const evaluation = response.ok ? evaluatePublishedRuntimeConfig(text, process.env) : undefined;
    push({
      id: "public-runtime-config",
      category: "public-app",
      label: "Published runtime config",
      required: true,
      status: response.ok && evaluation?.ready ? "passed" : "failed",
      url,
      detail: response.ok ? (evaluation?.detail ?? "runtime-config.js invalid") : `HTTP ${response.status}`,
      action: "Run bun run runtime:config, bun run runtime:config:check, build and redeploy dist/runtime-config.js.",
      sampleIds: evaluation?.presentRecommendedKeys,
    });
  } catch (error) {
    push({
      id: "public-runtime-config",
      category: "public-app",
      label: "Published runtime config",
      required: true,
      status: "failed",
      url,
      detail: String(error),
      action: "Run bun run runtime:config, build, deploy dist, then verify the deployed runtime-config.js.",
    });
  }
};

const checkPublicDeploymentEvidence = async (publicAppUrl) => {
  const url = publicAppUrl ? buildCacheBustedPublicEvidenceUrl(publicAppUrl, "public-deployment-evidence.json") : "";
  if (!url) {
    push({
      id: "public-deployment-evidence",
      category: "public-app",
      label: "Published deployment evidence",
      required: true,
      status: "failed",
      detail: "URL not configured",
      action: "Run bun run deploy:pages && bun run deploy:evidence, then publish public-deployment-evidence.json.",
    });
    return;
  }
  try {
    const { response, body } = await readJson(url, publicEvidenceNoStoreFetchOptions());
    const evaluation = response.ok ? evaluatePublicDeploymentEvidenceArtifact(body) : undefined;
    publishedDeploymentEvaluation = evaluation;
    push({
      id: "public-deployment-evidence",
      category: "public-app",
      label: "Published deployment evidence",
      required: true,
      status: response.ok && evaluation?.passed ? "passed" : "failed",
      url,
      detail: response.ok ? (evaluation?.detail ?? "deployment evidence invalid") : `HTTP ${response.status}`,
      action: "Run bun run deploy:pages && bun run deploy:evidence, then publish public-deployment-evidence.json.",
      sampleIds: evaluation?.sampleIds,
    });
  } catch (error) {
    push({
      id: "public-deployment-evidence",
      category: "public-app",
      label: "Published deployment evidence",
      required: true,
      status: "failed",
      url,
      detail: String(error),
      action: "Run bun run deploy:pages && bun run deploy:evidence, then publish public-deployment-evidence.json.",
    });
  }
};

const supabaseHeaders = () => ({
  apikey: env("VITE_SUPABASE_ANON_KEY"),
  Authorization: `Bearer ${env("VITE_SUPABASE_ANON_KEY")}`,
});

const supabaseServiceHeaders = () => ({
  apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
  Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
});

const supabaseRestUrl = (path) => `${env("VITE_SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`;
const supabaseAuthUserUrl = (userId) =>
  `${env("VITE_SUPABASE_URL").replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`;

const authIdentityProviders = (body) =>
  Array.from(
    new Set(
      [
        ...(Array.isArray(body?.identities) ? body.identities.map((identity) => identity?.provider) : []),
        ...(Array.isArray(body?.app_metadata?.providers) ? body.app_metadata.providers : []),
        body?.app_metadata?.provider,
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );

const authUserProblems = (body, userId) => {
  const providers = authIdentityProviders(body);
  return [
    String(body?.id ?? "") === userId ? "" : `id ${body?.id ?? "missing"} != ${userId}`,
    String(body?.email ?? "").trim() ? "" : "email missing",
    body?.confirmed_at || body?.email_confirmed_at || providers.length > 0 ? "" : "confirmed identity missing",
  ].filter(Boolean);
};

const authProfileIdentityProblems = (authBody, profileRow, userId, profileId) => {
  const authEmail = String(authBody?.email ?? "").trim();
  const profileEmail = String(profileRow?.email ?? "").trim();
  return [
    String(authBody?.id ?? "") === userId ? "" : `auth id ${authBody?.id ?? "missing"} != ${userId}`,
    String(profileRow?.id ?? "") === profileId ? "" : `profile id ${profileRow?.id ?? "missing"} != ${profileId}`,
    authBody?.id && profileRow?.id && String(authBody.id) === String(profileRow.id)
      ? ""
      : `auth/profile id mismatch (${authBody?.id ?? "missing"} != ${profileRow?.id ?? "missing"})`,
    authEmail ? "" : "auth email missing",
    profileEmail ? "" : "profile email missing",
    authEmail && profileEmail && authEmail === profileEmail ? "" : `email mismatch (${authEmail || "missing"} != ${profileEmail || "missing"})`,
    String(profileRow?.display_name ?? "").trim() ? "" : "profile display_name missing",
  ].filter(Boolean);
};

const checkSupabaseAuthUser = async (userId) => {
  if (!has("VITE_SUPABASE_URL") || !has("SUPABASE_SERVICE_ROLE_KEY") || !userId) {
    push({
      id: "supabase-auth-user-target",
      category: "supabase",
      label: "Supabase Auth target user",
      required: true,
      status: "failed",
      detail: !userId
        ? "KICKOFF_VERIFY_USER_ID missing"
        : !has("VITE_SUPABASE_URL")
          ? "Missing VITE_SUPABASE_URL"
          : "SUPABASE_SERVICE_ROLE_KEY missing for Auth admin user read-back",
      action: "Set KICKOFF_VERIFY_USER_ID and local-only SUPABASE_SERVICE_ROLE_KEY, then rerun verify:production.",
    });
    return;
  }

  const url = supabaseAuthUserUrl(userId);
  try {
    const { response, body } = await readJson(url, { headers: supabaseServiceHeaders() });
    const problems = response.ok ? authUserProblems(body, userId) : [];
    const providers = authIdentityProviders(body);
    push({
      id: "supabase-auth-user-target",
      category: "supabase",
      label: "Supabase Auth target user",
      required: true,
      status: response.ok && problems.length === 0 ? "passed" : "failed",
      url,
      detail: response.ok
        ? problems.length === 0
          ? `Auth user ${userId} read back with email and ${providers.length > 0 ? providers.join("/") : "confirmed identity"}`
          : `Auth user ${userId} invalid: ${problems.join("; ")}`
        : `HTTP ${response.status}`,
      action: "Confirm the target user exists in Supabase Auth and rerun verify:production with SUPABASE_SERVICE_ROLE_KEY set locally.",
      sampleIds: body?.id ? [String(body.id)] : [],
    });
  } catch (error) {
    push({
      id: "supabase-auth-user-target",
      category: "supabase",
      label: "Supabase Auth target user",
      required: true,
      status: "failed",
      url,
      detail: String(error),
      action: "Confirm the target user exists in Supabase Auth and rerun verify:production with SUPABASE_SERVICE_ROLE_KEY set locally.",
    });
  }
};

const checkSupabaseAuthProfileIdentity = async (userId, profileId) => {
  if (!has("VITE_SUPABASE_URL") || !has("VITE_SUPABASE_ANON_KEY") || !has("SUPABASE_SERVICE_ROLE_KEY") || !userId || !profileId) {
    push({
      id: "supabase-auth-profile-identity",
      category: "supabase",
      label: "Supabase Auth/profile identity match",
      required: true,
      status: "failed",
      detail: !userId || !profileId
        ? "KICKOFF_VERIFY_USER_ID and KICKOFF_VERIFY_PROFILE_ID must both be set"
        : !has("VITE_SUPABASE_URL") || !has("VITE_SUPABASE_ANON_KEY")
          ? "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
          : "SUPABASE_SERVICE_ROLE_KEY missing for Auth/profile identity read-back",
      action: "Sync the signed-in Supabase profile, then rerun verify:production with SUPABASE_SERVICE_ROLE_KEY set locally.",
    });
    return;
  }
  if (userId !== profileId) {
    push({
      id: "supabase-auth-profile-identity",
      category: "supabase",
      label: "Supabase Auth/profile identity match",
      required: true,
      status: "failed",
      detail: `KICKOFF_VERIFY_USER_ID (${userId}) must match KICKOFF_VERIFY_PROFILE_ID (${profileId})`,
      action: "Use one signed-in Supabase user id for both target env values.",
    });
    return;
  }

  const authUrl = supabaseAuthUserUrl(userId);
  const profileUrl = supabaseRestUrl(
    `kickoff_profiles?select=id,email,display_name,updated_at&id=eq.${encodeURIComponent(profileId)}&limit=1`,
  );
  try {
    const [authResult, profileResult] = await Promise.all([
      readJson(authUrl, { headers: supabaseServiceHeaders() }),
      readJson(profileUrl, { headers: supabaseHeaders() }),
    ]);
    const [profileRow] = Array.isArray(profileResult.body) ? profileResult.body : [];
    const problems =
      authResult.response.ok && profileResult.response.ok
        ? authProfileIdentityProblems(authResult.body, profileRow, userId, profileId)
        : [
            authResult.response.ok ? "" : `auth HTTP ${authResult.response.status}`,
            profileResult.response.ok ? "" : `profile HTTP ${profileResult.response.status}`,
          ].filter(Boolean);
    push({
      id: "supabase-auth-profile-identity",
      category: "supabase",
      label: "Supabase Auth/profile identity match",
      required: true,
      status: authResult.response.ok && profileResult.response.ok && problems.length === 0 ? "passed" : "failed",
      url: profileUrl,
      detail:
        authResult.response.ok && profileResult.response.ok
          ? problems.length === 0
            ? `Auth user ${userId} and profile ${profileId} share email ${authResult.body.email}`
            : `Auth/profile identity mismatch: ${problems.join("; ")}`
          : problems.join("; "),
      action: "Sync the signed-in Supabase profile, then rerun verify:production with SUPABASE_SERVICE_ROLE_KEY set locally.",
      sampleIds: [String(authResult.body?.id ?? ""), String(profileRow?.id ?? "")].filter(Boolean),
    });
  } catch (error) {
    push({
      id: "supabase-auth-profile-identity",
      category: "supabase",
      label: "Supabase Auth/profile identity match",
      required: true,
      status: "failed",
      url: profileUrl,
      detail: String(error),
      action: "Sync the signed-in Supabase profile, then rerun verify:production with SUPABASE_SERVICE_ROLE_KEY set locally.",
    });
  }
};

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

const checkProductionTargetEnvContract = () => {
  const contract = evaluateProductionTargetEnvContract(process.env);
  push({
    id: "production-target-env-contract",
    category: "supabase",
    label: "Production target env contract",
    required: true,
    status: contract.passed ? "passed" : "failed",
    detail: contract.detail,
    action: contract.action,
    sampleIds: contract.sampleIds,
  });
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

const multiRowResult = (rows, targetIds, label, sampleId = "id") => {
  const foundIds = new Set(
    Array.isArray(rows)
      ? rows.map((item) => String(item?.[sampleId] ?? item?.id ?? "")).filter(Boolean)
      : [],
  );
  const missing = targetIds.filter((id) => !foundIds.has(id));
  return {
    passed: targetIds.length > 0 && missing.length === 0,
    detail:
      targetIds.length > 0
        ? missing.length === 0
          ? `${label} ${targetIds.length}/${targetIds.length} read back`
          : `${label} missing ${missing.join(", ")}`
        : `${label} ids missing`,
    sampleIds: Array.isArray(rows) ? rows.map((item) => String(item?.[sampleId] ?? item?.id ?? "")).filter(Boolean) : [],
  };
};

const supabaseScopeProblems = (row, scope) =>
  [
    scope.userId && String(row?.user_id ?? "") !== scope.userId ? `user_id ${row?.user_id ?? "missing"} != ${scope.userId}` : "",
    scope.friendCode && String(row?.friend_code ?? "") !== scope.friendCode
      ? `friend_code ${row?.friend_code ?? "missing"} != ${scope.friendCode}`
      : "",
    scope.seasonKey && String(row?.season_key ?? "") !== scope.seasonKey
      ? `season_key ${row?.season_key ?? "missing"} != ${scope.seasonKey}`
      : "",
    scope.profileFriendCode && String(row?.friend_code ?? "") !== scope.profileFriendCode
      ? `friend_code ${row?.friend_code ?? "missing"} != ${scope.profileFriendCode}`
      : "",
  ].filter(Boolean);

const scopedSingleRowResult = (rows, targetId, label, scope, sampleId = "id") => {
  const items = Array.isArray(rows) ? rows : [];
  const row = targetId ? items.find((item) => String(item?.[sampleId] ?? item?.id ?? "") === targetId) : undefined;
  const problems = row ? supabaseScopeProblems(row, scope) : [];
  return {
    passed: Boolean(row && problems.length === 0),
    detail: targetId
      ? row
        ? problems.length === 0
          ? `${label} ${targetId} read back with matching scope`
          : `${label} ${targetId} scope mismatch: ${problems.join("; ")}`
        : `${label} ${targetId} missing`
      : `${label} id missing`,
    sampleIds: items.map((item) => String(item?.[sampleId] ?? item?.id ?? "")).filter(Boolean),
  };
};

const leaderboardBoardResult = (rows, scope, scopeTarget) => {
  const items = Array.isArray(rows) ? rows : [];
  const rankKey = leaderboardRankKeyForScope(scope);
  const missingScopeTarget = scopeTarget && !scopeTarget.value;
  const rankProblems = items
    .map((row) => {
      const rank = Number(row?.[rankKey]);
      return Number.isInteger(rank) && rank > 0 ? "" : `${row?.id ?? "unknown"} ${rankKey} missing`;
    })
    .filter(Boolean);
  const scopeProblems = items
    .map((row) => {
      if (!scopeTarget) return "";
      const actual = String(row?.[scopeTarget.key] ?? "");
      return actual === scopeTarget.value ? "" : `${row?.id ?? "unknown"} ${scopeTarget.key} ${actual || "missing"} != ${scopeTarget.value}`;
    })
    .filter(Boolean);
  const ranks = items.map((row) => Number(row?.[rankKey])).filter((rank) => Number.isInteger(rank) && rank > 0);
  const ordered = ranks.every((rank, index) => index === 0 || rank >= ranks[index - 1]);
  const problems = [
    missingScopeTarget ? `${scopeTarget.key} target missing` : "",
    items.length === 0 ? "no board rows returned" : "",
    ...rankProblems,
    ...scopeProblems,
    ordered ? "" : `${rankKey} rows are not sorted ascending`,
  ].filter(Boolean);
  return {
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `${items.length} ${scope} board row${items.length === 1 ? "" : "s"} read back with ordered ${rankKey}`
        : `${scope} board invalid: ${problems.join("; ")}`,
    sampleIds: items.map((item) => String(item?.id ?? "")).filter(Boolean).slice(0, 5),
  };
};

const profileTargetResult = (rows, targetId, friendCode) => {
  const items = Array.isArray(rows) ? rows : [];
  const row = targetId ? items.find((item) => String(item?.id ?? "") === targetId) : undefined;
  const problems = row
    ? [
        String(row?.email ?? "").trim() ? "" : "email missing",
        String(row?.display_name ?? "").trim() ? "" : "display_name missing",
        String(row?.location ?? "").trim() ? "" : "location missing",
        String(row?.friend_code ?? "").trim() ? "" : "friend_code missing",
        friendCode && String(row?.friend_code ?? "") !== friendCode
          ? `friend_code ${row?.friend_code ?? "missing"} != ${friendCode}`
          : "",
        validTimestamp(row?.updated_at) ? "" : "updated_at is missing or invalid",
      ].filter(Boolean)
    : [];
  return {
    passed: Boolean(row && problems.length === 0),
    detail: targetId
      ? row
        ? problems.length === 0
          ? `profile ${targetId} read back with email, display name, location, updated_at and matching friend_code`
          : `profile ${targetId} invalid: ${problems.join("; ")}`
        : `profile ${targetId} missing`
      : "profile id missing",
    sampleIds: items.map((item) => String(item?.id ?? "")).filter(Boolean),
  };
};

const scopedMultiRowResult = (rows, targetIds, label, scope, sampleId = "id") => {
  const items = Array.isArray(rows) ? rows : [];
  const rowsById = new Map(items.map((item) => [String(item?.[sampleId] ?? item?.id ?? ""), item]));
  const missing = targetIds.filter((id) => !rowsById.has(id));
  const mismatched = targetIds
    .map((id) => {
      const row = rowsById.get(id);
      const problems = row ? supabaseScopeProblems(row, scope) : [];
      return problems.length > 0 ? `${id} ${problems.join("; ")}` : "";
    })
    .filter(Boolean);
  return {
    passed: targetIds.length > 0 && missing.length === 0 && mismatched.length === 0,
    detail:
      targetIds.length > 0
        ? missing.length > 0
          ? `${label} missing ${missing.join(", ")}`
          : mismatched.length > 0
            ? `${label} scope mismatch: ${mismatched.join(" | ")}`
            : `${label} ${targetIds.length}/${targetIds.length} read back with matching scope`
        : `${label} ids missing`,
    sampleIds: items.map((item) => String(item?.[sampleId] ?? item?.id ?? "")).filter(Boolean),
  };
};

const modeTargetRowsResult = (rows, targetIds, scope) => {
  const base = scopedMultiRowResult(rows, targetIds, "mode proofs", scope);
  if (!base.passed) return base;
  const modeProblem = productionModeCoverageProblem(Array.isArray(rows) ? rows : [], "mode proofs");
  return {
    ...base,
    passed: !modeProblem,
    detail: modeProblem || `${base.detail} and mode type coverage ${requiredModeTypeCoverage}`,
  };
};

const validSha256 = (value) => Boolean(value && /^[a-f0-9]{64}$/i.test(value));
const MIN_PRODUCTION_SHARE_IMAGE_BYTES = 10_000;

const validProductionShareMime = (value) => String(value ?? "").trim().toLowerCase() === "image/png";

const validProductionShareByteLength = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= MIN_PRODUCTION_SHARE_IMAGE_BYTES;
};

const validTimestamp = (value) => {
  if (!value) return false;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time);
};

const publicHttpsUrl = (value) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) &&
      !url.hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
};

const shareArtifactProblems = (row, targetId, kind, expectedImageUrl) =>
  [
    row?.id !== targetId ? `id ${row?.id ?? "missing"} != ${targetId}` : "",
    row?.kind !== kind ? `kind ${row?.kind ?? "missing"} != ${kind}` : "",
    publicHttpsUrl(row?.image_url) ? "" : "image_url is not a deployed HTTPS URL",
    expectedImageUrl && row?.image_url !== expectedImageUrl ? "image_url does not match configured public share image" : "",
    validSha256(row?.image_hash) ? "" : "image_hash is not a 64-character SHA-256 digest",
    publicHttpsUrl(row?.proof_url) ? "" : "proof_url is not a deployed HTTPS URL",
    validProductionShareMime(row?.image_mime) ? "" : `image_mime ${row?.image_mime ?? "missing"} is not image/png`,
    validProductionShareByteLength(row?.image_byte_length)
      ? ""
      : `image_byte_length ${row?.image_byte_length ?? "missing"} is below ${MIN_PRODUCTION_SHARE_IMAGE_BYTES}`,
    validTimestamp(row?.generated_at) ? "" : "generated_at is missing or invalid",
  ].filter(Boolean);

const shareArtifactResult = (rows, targetId, kind, label, expectedImageUrl) => {
  const items = Array.isArray(rows) ? rows : [];
  const row = targetId ? items.find((item) => String(item?.id ?? "") === targetId) : undefined;
  const problems = row ? shareArtifactProblems(row, targetId, kind, expectedImageUrl) : [];
  return {
    passed: Boolean(targetId && row && problems.length === 0),
    detail: targetId
        ? row
        ? problems.length === 0
          ? `${label}:${targetId} share artifact has deployed proof/image URLs, PNG manifest and image_hash`
          : `${label}:${targetId} share artifact invalid: ${problems.join("; ")}`
        : `${label}:${targetId} share artifact missing`
      : `${label} id missing`,
    sampleIds: items.map((item) => `${item.kind}:${item.id}`).filter(Boolean),
  };
};

const modeShareArtifactsResult = (rows, targetIds, expectedImageUrl) => {
  const items = Array.isArray(rows) ? rows : [];
  const rowsById = new Map(items.map((item) => [String(item?.id ?? ""), item]));
  const missing = targetIds.filter((id) => !rowsById.has(id));
  const invalid = targetIds
    .map((id) => {
      const row = rowsById.get(id);
      const problems = row ? shareArtifactProblems(row, id, "mode", expectedImageUrl) : [];
      return problems.length > 0 ? `${id} ${problems.join("; ")}` : "";
    })
    .filter(Boolean);
  return {
    passed: targetIds.length > 0 && missing.length === 0 && invalid.length === 0,
    detail:
      targetIds.length > 0
        ? missing.length > 0
          ? `mode share artifacts missing ${missing.join(", ")}`
          : invalid.length > 0
            ? `mode share artifacts invalid: ${invalid.join(" | ")}`
            : `mode ${targetIds.length}/${targetIds.length} share artifacts have deployed proof/image URLs, PNG manifests and image_hash`
        : "mode proof ids missing",
    sampleIds: items.map((item) => `${item.kind}:${item.id}`).filter(Boolean),
  };
};

const shareChannelResult = (rows, targetId, kind, label) => {
  const row = Array.isArray(rows) ? rows[0] : undefined;
  const problem = row?.kind === kind ? productionShareChannelProblem(row) : "";
  return {
    passed: Boolean(targetId && row?.kind === kind && !problem),
    detail: targetId
      ? row?.kind === kind && !problem
        ? `${label}:${targetId} share channel opened and synced`
        : `${label}:${targetId} share channel ${problem || "row missing"}`
      : `${label} id missing`,
    sampleIds: Array.isArray(rows) ? rows.map((item) => `${item.kind}:${item.id}`).filter(Boolean) : [],
  };
};

const shareChannelsResult = (rows, targetIds, kind, label) => {
  const readyIds = new Set(
    Array.isArray(rows)
      ? rows
          .filter((item) => item?.kind === kind && hasProductionShareChannelEvidence(item))
          .map((item) => String(item.id ?? ""))
          .filter(Boolean)
      : [],
  );
  const missing = targetIds.filter((id) => !readyIds.has(id));
  return {
    passed: targetIds.length > 0 && missing.length === 0,
    detail:
      targetIds.length > 0
        ? missing.length === 0
          ? `${label} ${targetIds.length}/${targetIds.length} share channels opened and synced`
          : `${label} share channels missing ${missing.join(", ")}`
        : `${label} ids missing`,
    sampleIds: Array.isArray(rows) ? rows.map((item) => `${item.kind}:${item.id}`).filter(Boolean) : [],
  };
};

const sealHealthUrl = () => {
  const endpoint = configuredSealApiUrl();
  if (!endpoint) return "";
  const url = new URL(endpoint, env("VITE_PUBLIC_APP_URL") || "http://127.0.0.1/");
  url.pathname = url.pathname
    .replace(/\/seal\/?$/, "/health")
    .replace(/\/verify\/?$/, "/health")
    .replace(/\/proof\/?.*$/, "/health");
  url.search = "";
  return url.toString();
};

const sealApiUrl = (path, cid) => {
  const endpoint = configuredSealApiUrl();
  if (!endpoint) return "";
  const url = new URL(endpoint, env("VITE_PUBLIC_APP_URL") || "http://127.0.0.1/");
  if (path === "verify") {
    url.pathname = url.pathname
      .replace(/\/seal\/?$/, "/verify")
      .replace(/\/proof\/?.*$/, "/verify")
      .replace(/\/health\/?$/, "/verify");
    url.search = "";
    url.searchParams.set("cid", cid ?? "");
    return url.toString();
  }
  url.pathname = url.pathname
    .replace(/\/seal\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`)
    .replace(/\/verify\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`)
    .replace(/\/health\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`);
  url.search = "";
  return url.toString();
};

const sealApiHeaders = (base = {}) => ({
  ...base,
  ...(has("VITE_FILECOIN_SEAL_TOKEN") ? { Authorization: `Bearer ${env("VITE_FILECOIN_SEAL_TOKEN")}` } : {}),
});

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
  await checkPublicAcceptanceEvidence(publicAppUrl);
  await checkPublishedRuntimeConfig(publicAppUrl);
  await checkPublicDeploymentEvidence(publicAppUrl);
  await checkUrl({
    id: "public-app-root",
    category: "public-app",
    label: "Public app root",
    required: true,
    url: publicAppUrl,
    action: "Deploy the final dist folder to the configured HTTPS URL.",
    deploymentEvidenceFallback: true,
  });
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
  checkProductionTargetEnvContract();

  const userId = env("KICKOFF_VERIFY_USER_ID");
  const profileId = env("KICKOFF_VERIFY_PROFILE_ID");
  const friendCode = env("KICKOFF_VERIFY_FRIEND_CODE");
  const seasonKey = env("KICKOFF_VERIFY_SEASON_KEY");
  await checkSupabaseAuthUser(userId);
  await checkSupabaseAuthProfileIdentity(userId, profileId);
  const leaderboardSelect =
    "select=id,friend_code,season_key,xp,verified_proofs,mode_proofs,global_rank,friend_rank,season_rank,rank";
  await checkSupabaseJson({
    id: "leaderboard-global-current-user",
    label: "Global leaderboard current user",
    required: true,
    path: userId
      ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encodeURIComponent(userId)}&limit=1`
      : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
    validate: (rows) => evaluateLeaderboardScopeRows(rows, { userId, scope: "global" }),
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
    validate: (rows) =>
      evaluateLeaderboardScopeRows(rows, {
        userId: userId && friendCode ? userId : "",
        scope: "friend",
        scopeTarget: { key: "friend_code", value: friendCode },
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
    validate: (rows) =>
      evaluateLeaderboardScopeRows(rows, {
        userId: userId && seasonKey ? userId : "",
        scope: "season",
        scopeTarget: { key: "season_key", value: seasonKey },
    }),
    action: "Set KICKOFF_VERIFY_USER_ID and KICKOFF_VERIFY_SEASON_KEY for a synced leaderboard row.",
  });
  await checkSupabaseJson({
    id: "leaderboard-global-board",
    label: "Global leaderboard board rows",
    required: true,
    path: `kickoff_leaderboard?${leaderboardSelect}&order=global_rank.asc&limit=20`,
    validate: (rows) => leaderboardBoardResult(rows, "global"),
    action: "Read back the public global leaderboard ordered by global_rank.",
  });
  await checkSupabaseJson({
    id: "leaderboard-friend-board",
    label: "Friend leaderboard board rows",
    required: true,
    path: friendCode
      ? `kickoff_leaderboard?${leaderboardSelect}&order=friend_rank.asc&friend_code=eq.${encodeURIComponent(friendCode)}&limit=20`
      : `kickoff_leaderboard?${leaderboardSelect}&order=friend_rank.asc&limit=20`,
    validate: (rows) => leaderboardBoardResult(rows, "friend", { key: "friend_code", value: friendCode }),
    action: "Read back the public friend leaderboard ordered by friend_rank with the configured friend_code.",
  });
  await checkSupabaseJson({
    id: "leaderboard-season-board",
    label: "Season leaderboard board rows",
    required: true,
    path: seasonKey
      ? `kickoff_leaderboard?${leaderboardSelect}&order=season_rank.asc&season_key=eq.${encodeURIComponent(seasonKey)}&limit=20`
      : `kickoff_leaderboard?${leaderboardSelect}&order=season_rank.asc&limit=20`,
    validate: (rows) => leaderboardBoardResult(rows, "season", { key: "season_key", value: seasonKey }),
    action: "Read back the public season leaderboard ordered by season_rank with the configured season_key.",
  });

  const proofId = env("KICKOFF_VERIFY_PROOF_ID");
  const targetModeIds = modeTargetIds();
  const modeProblem = modeTargetProblem();
  const recordShareImageUrl = env("KICKOFF_VERIFY_SHARE_IMAGE_URL");
  const modeShareImageUrl = env("KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL");
  const scopedTargetFilters = accountScopeFilters();
  await checkSupabaseJson({
    id: "supabase-profile-target",
    label: "Public profile target row",
    required: true,
    path: profileId
      ? `kickoff_profiles?select=id,email,display_name,location,friend_code,updated_at&id=eq.${encodeURIComponent(profileId)}&limit=1`
      : "kickoff_profiles?select=id&limit=1",
    validate: (rows) => profileTargetResult(rows, profileId, friendCode),
    action: "Set KICKOFF_VERIFY_PROFILE_ID to a synced public profile id.",
  });
  await checkSupabaseJson({
    id: "supabase-record-target",
    label: "Public prediction target row",
    required: true,
    path: proofId
      ? `kickoff_records?select=id,user_id,season_key,friend_code,total_score&id=eq.${encodeURIComponent(proofId)}${scopedTargetFilters}&limit=1`
      : "kickoff_records?select=id&limit=1",
    validate: (rows) => scopedSingleRowResult(rows, proofId, "prediction", { userId, friendCode, seasonKey }),
    action: "Set KICKOFF_VERIFY_PROOF_ID to a synced prediction capsule id.",
  });
  await checkSupabaseJson({
    id: "supabase-mode-target",
    label: "Public mode proof target rows",
    required: true,
    path: !modeProblem
      ? `kickoff_mode_runs?select=id,user_id,mode_id,status,score,season_key,friend_code&id=in.(${inFilter(targetModeIds)})${scopedTargetFilters}&limit=${targetModeIds.length}`
      : "kickoff_mode_runs?select=id&limit=1",
    validate: (rows) =>
      modeProblem
        ? { passed: false, detail: modeProblem, sampleIds: targetModeIds }
        : modeTargetRowsResult(rows, targetModeIds, { userId, friendCode, seasonKey }),
    action: "Set KICKOFF_VERIFY_MODE_IDS to synced mode proof run ids.",
  });
  await checkSupabaseJson({
    id: "supabase-share-artifact-target",
    label: "Public record share artifact target row",
    required: true,
    path: proofId
      ? `kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,image_url,image_hash,proof_url,image_mime,image_byte_length,generated_at&id=eq.${encodeURIComponent(proofId)}&kind=eq.record${scopedTargetFilters}&limit=1`
      : "kickoff_share_artifacts?select=id,kind,image_url,image_hash,image_mime,image_byte_length,generated_at&limit=1",
    validate: (rows) => shareArtifactResult(rows, proofId, "record", "record", recordShareImageUrl),
    action: "Generate a record share card, upload it to Supabase Storage, and sync kickoff_share_artifacts.",
  });
  await checkSupabaseJson({
    id: "supabase-mode-share-artifact-target",
    label: "Public mode share artifact target rows",
    required: true,
    path: !modeProblem
      ? `kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,image_url,image_hash,proof_url,image_mime,image_byte_length,generated_at&id=in.(${inFilter(targetModeIds)})&kind=eq.mode${scopedTargetFilters}&limit=${targetModeIds.length}`
      : "kickoff_share_artifacts?select=id,kind&limit=1",
    validate: (rows) => {
      if (modeProblem) return { passed: false, detail: modeProblem, sampleIds: targetModeIds };
      return modeShareArtifactsResult(rows, targetModeIds, modeShareImageUrl);
    },
    action: "Generate mode proof share cards, upload them to Supabase Storage, and sync kickoff_share_artifacts.",
  });
  await checkSupabaseJson({
    id: "supabase-share-channel-target",
    label: "Public record share channel target row",
    required: true,
    path: proofId
      ? `kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,proof_url,generated_at,x_intent_url,x_intent_opened_at,native_share_opened_at&id=eq.${encodeURIComponent(proofId)}&kind=eq.record${scopedTargetFilters}&limit=1`
      : "kickoff_share_artifacts?select=id,kind&limit=1",
    validate: (rows) => shareChannelResult(rows, proofId, "record", "record"),
    action: "Open the X intent or native share for the record proof card, then sync kickoff_share_artifacts.",
  });
  await checkSupabaseJson({
    id: "supabase-mode-share-channel-target",
    label: "Public mode share channel target rows",
    required: true,
    path: !modeProblem
      ? `kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,proof_url,generated_at,x_intent_url,x_intent_opened_at,native_share_opened_at&id=in.(${inFilter(targetModeIds)})&kind=eq.mode${scopedTargetFilters}&limit=${targetModeIds.length}`
      : "kickoff_share_artifacts?select=id,kind&limit=1",
    validate: (rows) =>
      modeProblem
        ? { passed: false, detail: modeProblem, sampleIds: targetModeIds }
        : shareChannelsResult(rows, targetModeIds, "mode", "mode"),
    action: "Open the X intent or native share for every mode proof card, then sync kickoff_share_artifacts.",
  });
};

const checkPublicProofLinks = async () => {
  const publicAppUrl = normalizePublicAppUrl(env("VITE_PUBLIC_APP_URL"));
  const targetModeIds = modeTargetIds();
  const modeProblem = modeTargetProblem();
  const renderedChecks = [
    {
      id: "public-profile-link",
      label: "Public profile link",
      kind: "profile",
      targetId: env("KICKOFF_VERIFY_PROFILE_ID"),
      action: "Set KICKOFF_VERIFY_PROFILE_ID to a synced Supabase profile id.",
    },
    {
      id: "public-proof-link",
      label: "Public prediction proof link",
      kind: "proof",
      targetId: env("KICKOFF_VERIFY_PROOF_ID"),
      action: "Set KICKOFF_VERIFY_PROOF_ID to a synced capsule id.",
    },
    {
      id: "public-mode-link",
      label: "Public mode proof links",
      kind: "mode",
      targetIds: targetModeIds,
      action: "Set KICKOFF_VERIFY_MODE_IDS to synced mode proof run ids.",
    },
  ];
  const renderResults = [];
  for (const check of renderedChecks) {
    if (check.targetIds) {
      const urls = publicAppUrl
        ? check.targetIds.map((targetId) => `${publicAppUrl}?${check.kind}=${encodeURIComponent(targetId)}`)
        : [];
      renderResults.push(...(await checkRenderedPublicLinks({ ...check, urls, targetProblem: check.kind === "mode" ? modeProblem : "" })));
    } else {
      const url =
        publicAppUrl && check.targetId
          ? `${publicAppUrl}?${check.kind}=${encodeURIComponent(check.targetId)}`
          : "";
      const result = await checkRenderedPublicLink({ ...check, url });
      if (result) renderResults.push(result);
    }
  }
  const cleanSession = evaluateCleanSessionRestoreResults(renderResults, {
    profile: [env("KICKOFF_VERIFY_PROFILE_ID")].filter(Boolean),
    proof: [env("KICKOFF_VERIFY_PROOF_ID")].filter(Boolean),
    mode: targetModeIds,
  });
  push({
    id: "public-clean-session-restore",
    category: "sharing",
    label: "Clean-session account restore",
    required: true,
    status: cleanSession.passed ? "passed" : "failed",
    url: publicAppUrl || undefined,
    detail: cleanSession.detail,
    action:
      "Set profile/proof/mode verification ids to real Supabase targets, deploy public pages, then render Cloud-loaded pages in a clean browser context without relying on localStorage.",
    sampleIds: [
      env("KICKOFF_VERIFY_PROFILE_ID"),
      env("KICKOFF_VERIFY_PROOF_ID"),
      ...targetModeIds,
    ].filter(Boolean),
  });
  await checkPublicImageUrl({
    id: "public-share-image",
    label: "Public share image URL",
    url: env("KICKOFF_VERIFY_SHARE_IMAGE_URL"),
    action: "Set KICKOFF_VERIFY_SHARE_IMAGE_URL to a deployed HTTPS PNG/JPEG/WebP share-card URL that reads back as a production-sized image.",
  });
  await checkPublicImageUrl({
    id: "public-mode-share-image",
    label: "Public mode share image URL",
    url: env("KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"),
    action: "Set KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL to a deployed HTTPS PNG/JPEG/WebP mode share-card URL that reads back as a production-sized image.",
  });
};

const renderPublicLinkResult = async ({ kind, targetId, url }) => {
  const browser = await getRenderBrowser();
  const renderOnce = async () => {
    const page = await browser.newPage();
    try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    const snapshot = await page.evaluate(extractPublicRenderSnapshot);
    const cloudLoaded = publicRenderCloudLoaded(kind, snapshot);
    return { kind, targetId, url, cloudLoaded, ...evaluatePublicRenderSnapshot(kind, targetId, snapshot, url) };
    } finally {
      await page.close();
    }
  };
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await renderOnce();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
};

const checkRenderedPublicLinks = async ({ id, label, kind, targetIds, urls, action, targetProblem = "" }) => {
  if (targetProblem || !urls.length || !targetIds.length) {
    push({
      id,
      category: "sharing",
      label,
      required: true,
      status: "failed",
      detail: targetProblem || "URL not configured",
      action,
      sampleIds: targetIds,
    });
    return [];
  }
  try {
    const results = [];
    for (const [index, url] of urls.entries()) {
      const targetId = targetIds[index];
      results.push({ targetId, url, ...(await renderPublicLinkResult({ kind, targetId, url })) });
    }
    const failures = results.filter((result) => !result.passed);
    push({
      id,
      category: "sharing",
      label,
      required: true,
      status: failures.length === 0 ? "passed" : "failed",
      url: urls[0],
      detail:
        failures.length === 0
          ? `rendered ${results.length}/${targetIds.length} ${kind} proof pages`
          : failures.map((result) => `${result.targetId}: ${result.detail}`).join(" | "),
      action,
      sampleIds: targetIds,
    });
    return results;
  } catch (error) {
    push({
      id,
      category: "sharing",
      label,
      required: true,
      status: "failed",
      url: urls[0],
      detail: `Rendered public page check failed: ${String(error)}`,
      action: `${action} Install Playwright Chromium in CI before running production verification.`,
      sampleIds: targetIds,
    });
    return [];
  }
};

const checkRenderedPublicLink = async ({ id, label, kind, targetId, url, action }) => {
  if (!url) {
    push({
      id,
      category: "sharing",
      label,
      required: true,
      status: "failed",
      detail: "URL not configured",
      action,
    });
    return;
  }
  try {
    const result = await renderPublicLinkResult({ kind, targetId, url });
    push({
      id,
      category: "sharing",
      label,
      required: true,
      status: result.passed ? "passed" : "failed",
      url,
      detail: result.detail,
      action,
      sampleIds: [targetId],
    });
    return result;
  } catch (error) {
    push({
      id,
      category: "sharing",
      label,
      required: true,
      status: "failed",
      url,
      detail: `Rendered public page check failed: ${String(error)}`,
      action: `${action} Install Playwright Chromium in CI before running production verification.`,
    });
    return undefined;
  }
};

const checkSealApi = async () => {
  const url = sealHealthUrl();
  const sameOriginProblem = sameOriginSealProxyProblem();
  if (!url || sameOriginProblem) {
    push({
      id: "filecoin-seal-health",
      category: "filecoin",
      label: "Seal API production health",
      required: true,
      status: "failed",
      detail: sameOriginProblem || "Missing VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1",
      action:
        "Deploy the seal API and configure VITE_FILECOIN_SEAL_API, or mount it on Cloudflare Pages Functions at /seal and set VITE_FILECOIN_SEAL_SAME_ORIGIN=1.",
    });
    push({
      id: "filecoin-seal-contract",
      category: "filecoin",
      label: "Seal API async endpoint contract",
      required: true,
      status: "failed",
      detail: sameOriginProblem || "Missing VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1",
      action:
        "Deploy the seal API with POST /seal?async=1, GET /jobs/:id, GET /verify?cid= and GET /proof/:cid.",
    });
    await checkFilecoinProofReadback({
      id: "filecoin-record-proof-readback",
      label: "Record CID proof read-back",
      cid: env("KICKOFF_VERIFY_FILECOIN_RECORD_CID"),
      expectedPayloadHash: env("KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH"),
      action: "Run a production one-click seal for one prediction capsule and set KICKOFF_VERIFY_FILECOIN_RECORD_CID plus KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH.",
    });
    await checkFilecoinProofReadback({
      id: "filecoin-mode-proof-readback",
      label: "Mode CID proof read-back",
      targets: filecoinModeProofTargets(),
      action: "Run production one-click seals for every required tournament mode proof and set KICKOFF_VERIFY_FILECOIN_MODE_CIDS plus KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES.",
    });
    return;
  }
  try {
    const { response, body } = await readJson(url);
    const requiredEndpoints = ["POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"];
    const backendReady = Boolean(
      response.ok &&
        body?.ok &&
        body?.productionReady &&
        !body?.mockMode &&
        body?.hasPrivateKey &&
        body?.authRequired &&
        body?.persistence === "file",
    );
    const sameOriginProxyReady =
      !usingSameOriginSealProxy() ||
      (body?.service === "kickoff-lock-filecoin-seal-proxy" && body?.tokenInjected === true);
    const productionReady = backendReady && sameOriginProxyReady;
    const healthProblems = [
      ...(Array.isArray(body?.blockers) ? body.blockers : []),
      backendReady ? "" : "health contract incomplete",
      !usingSameOriginSealProxy() || body?.service === "kickoff-lock-filecoin-seal-proxy"
        ? ""
        : "same-origin seal proxy service missing",
      !usingSameOriginSealProxy() || body?.tokenInjected === true ? "" : "same-origin FILECOIN_SEAL_TOKEN injection missing",
    ].filter(Boolean);
    push({
      id: "filecoin-seal-health",
      category: "filecoin",
      label: "Seal API production health",
      required: true,
      status: productionReady ? "passed" : "failed",
      url,
      detail: response.ok
        ? productionReady
          ? `production-ready Synapse backend${usingSameOriginSealProxy() ? " with proxy token injection" : ""}`
          : `not production-ready: ${healthProblems.join(", ")}`
        : `HTTP ${response.status}`,
      action: "Run a non-mock seal API with SYNAPSE_PRIVATE_KEY, FILECOIN_SEAL_TOKEN and FILECOIN_PROOF_STORE_PATH.",
    });
    const contractReady =
      response.ok &&
      Array.isArray(body?.endpoints) &&
      requiredEndpoints.every((endpoint) => body.endpoints.includes(endpoint));
    push({
      id: "filecoin-seal-contract",
      category: "filecoin",
      label: "Seal API async endpoint contract",
      required: true,
      status: contractReady ? "passed" : "failed",
      url,
      detail: response.ok
        ? Array.isArray(body?.endpoints)
          ? body.endpoints.join(", ")
          : "endpoints missing"
        : `HTTP ${response.status}`,
      action: "Expose POST /seal?async=1, GET /jobs/:id, GET /verify?cid= and GET /proof/:cid from the same seal API deployment.",
    });
  } catch (error) {
    push({ id: "filecoin-seal-health", category: "filecoin", label: "Seal API production health", required: true, status: "failed", url, detail: String(error) });
    push({
      id: "filecoin-seal-contract",
      category: "filecoin",
      label: "Seal API async endpoint contract",
      required: true,
      status: "failed",
      url,
      detail: String(error),
      action: "Expose POST /seal?async=1, GET /jobs/:id, GET /verify?cid= and GET /proof/:cid from the same seal API deployment.",
    });
  }
  await checkFilecoinProofReadback({
    id: "filecoin-record-proof-readback",
    label: "Record CID proof read-back",
    cid: env("KICKOFF_VERIFY_FILECOIN_RECORD_CID"),
    expectedPayloadHash: env("KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH"),
    action: "Run a production one-click seal for one prediction capsule and set KICKOFF_VERIFY_FILECOIN_RECORD_CID plus KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH.",
  });
  await checkFilecoinProofReadback({
    id: "filecoin-mode-proof-readback",
    label: "Mode CID proof read-back",
    targets: filecoinModeProofTargets(),
    action: "Run production one-click seals for every required tournament mode proof and set KICKOFF_VERIFY_FILECOIN_MODE_CIDS plus KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES.",
  });
};

const filecoinModeProofTargets = () => {
  const cids = envList("KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  const hashes = envList("KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  const count = Math.max(cids.length, hashes.length);
  return Array.from({ length: count }, (_, index) => ({ cid: cids[index] ?? "", expectedPayloadHash: hashes[index] ?? "" }));
};

const filecoinModeProofTargetProblem = () => {
  const cids = envList("KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  const hashes = envList("KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  const requiredCount = requiredProductionModeIds.length;
  const problems = [];
  if (cids.length < requiredCount) {
    problems.push(
      cids.length > 0
        ? `KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs ${requiredCount} mode CIDs; got ${cids.length}`
        : has("KICKOFF_VERIFY_FILECOIN_MODE_CID")
          ? `KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs ${requiredCount} mode CIDs; legacy KICKOFF_VERIFY_FILECOIN_MODE_CID is not enough`
          : "KICKOFF_VERIFY_FILECOIN_MODE_CIDS missing",
    );
  }
  if (hashes.length < requiredCount) {
    problems.push(
      hashes.length > 0
        ? `KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs ${requiredCount} mode payload hashes; got ${hashes.length}`
        : has("KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH")
          ? `KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs ${requiredCount} mode payload hashes; legacy KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH is not enough`
          : "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES missing",
    );
  }
  if (cids.length >= requiredCount && hashes.length >= requiredCount && cids.length !== hashes.length) {
    problems.push("KICKOFF_VERIFY_FILECOIN_MODE_CIDS and KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES counts must match");
  }
  return problems.join("; ");
};

const checkFilecoinProofReadback = async ({ id, label, cid, expectedPayloadHash, targets, action }) => {
  const targetList = targets ?? [{ cid, expectedPayloadHash }];
  if (!configuredSealApiUrl()) {
    push({
      id,
      category: "filecoin",
      label,
      required: true,
      status: "failed",
      detail: "Missing VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1",
      action,
    });
    return;
  }
  const modeTargetProblem = id === "filecoin-mode-proof-readback" ? filecoinModeProofTargetProblem() : "";
  if (modeTargetProblem) {
    push({
      id,
      category: "filecoin",
      label,
      required: true,
      status: "failed",
      detail: modeTargetProblem,
      action,
      sampleIds: targetList.map((target) => target.cid).filter(Boolean),
    });
    return;
  }
  if (targetList.length === 0 || targetList.some((target) => !target.cid)) {
    push({
      id,
      category: "filecoin",
      label,
      required: true,
      status: "failed",
      detail: "CID target missing",
      action,
    });
    return;
  }
  try {
    const results = await Promise.all(
      targetList.map(async (target) => {
        const verifyUrl = sealApiUrl("verify", target.cid);
        const proofUrl = sealApiUrl("proof", target.cid);
        const verify = await readJson(verifyUrl, { headers: sealApiHeaders() });
        const proof = await readJson(proofUrl, { headers: sealApiHeaders() });
        const verifyOk = verify.response.ok && ["verified", "retrievable"].includes(String(verify.body?.proofStatus ?? ""));
        const proofOk = proof.response.ok && proof.body?.cid === target.cid;
        const payloadHash = String(proof.body?.payloadHash ?? verify.body?.payloadHash ?? "");
        const byteLength = Number(proof.body?.byteLength ?? verify.body?.byteLength ?? 0);
        const expectedOk = target.expectedPayloadHash ? payloadHash === target.expectedPayloadHash : Boolean(payloadHash);
        const passed = verifyOk && proofOk && expectedOk && byteLength > 0;
        return {
          ...target,
          passed,
          proofUrl,
          payloadHash,
          byteLength,
          detail: passed
            ? `${target.cid} verified with payload ${payloadHash.slice(0, 12)}... and ${byteLength} bytes`
            : [
                verifyOk ? "" : `verify ${verify.response.status}/${verify.body?.proofStatus ?? "missing"}`,
                proofOk ? "" : `proof ${proof.response.status}/${proof.body?.cid ?? "missing"}`,
                expectedOk ? "" : "payload hash mismatch or missing",
                byteLength > 0 ? "" : "byte length missing",
              ]
                .filter(Boolean)
                .join("; "),
        };
      }),
    );
    const failed = results.filter((result) => !result.passed);
    const passed = failed.length === 0;
    push({
      id,
      category: "filecoin",
      label,
      required: true,
      status: passed ? "passed" : "failed",
      url: results[0]?.proofUrl,
      detail: passed
        ? targetList.length === 1
          ? results[0].detail
          : `${results.length}/${targetList.length} mode CIDs verified with matching payload hashes`
        : failed.map((result) => `${result.cid}: ${result.detail}`).join(" | "),
      action,
      sampleIds: targetList.map((target) => target.cid),
    });
  } catch (error) {
    push({
      id,
      category: "filecoin",
      label,
      required: true,
      status: "failed",
      detail: String(error),
      action,
    });
  }
};

const checkDataProviders = async () => {
  const healthUrl = dataProxyHealthUrl();
  const sameOriginProblem = sameOriginDataProxyProblem();
  if (!healthUrl || sameOriginProblem) {
    push({
      id: "data-proxy-health",
      category: "data",
      label: "Static hosting data proxy health",
      required: true,
      status: "failed",
      detail: sameOriginProblem || "Missing VITE_DATA_PROXY_URL or VITE_DATA_PROXY_SAME_ORIGIN=1",
      action:
        "Deploy server/data-proxy-worker.mjs as a Worker URL, or deploy the bundled Cloudflare Pages function and set VITE_DATA_PROXY_SAME_ORIGIN=1.",
    });
  } else {
    try {
      const { response, body } = await readJson(healthUrl);
      const allowedHosts = Array.isArray(body?.allowedHosts) ? body.allowedHosts : [];
      const allowedRoutes = Array.isArray(body?.allowedRoutes) ? body.allowedRoutes : [];
      const expectedHosts = [
        "api.football-data.org",
        "api.the-odds-api.com",
        "raw.githubusercontent.com",
        "site.api.espn.com",
        "v3.football.api-sports.io",
        "www.thesportsdb.com",
        "worldcup26.ir",
      ];
      const expectedRoutes = [
        "api.football-data.org/v4/competitions/:competition/matches",
        "api.football-data.org/v4/competitions/:competition/standings",
        "api.the-odds-api.com/v4/sports/:sport/odds",
        "raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
        "v3.football.api-sports.io/fixtures",
        "v3.football.api-sports.io/fixtures/lineups",
        "v3.football.api-sports.io/injuries",
        "v3.football.api-sports.io/odds",
        "v3.football.api-sports.io/standings",
        "site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
        "worldcup26.ir/get/games",
        "www.thesportsdb.com/api/v1/json/:key/eventsseason.php",
        "www.thesportsdb.com/api/v1/json/:key/eventsnextleague.php",
        "www.thesportsdb.com/api/v1/json/:key/lookuplineup.php",
        "www.thesportsdb.com/api/v1/json/:key/lookupeventstats.php",
      ];
      const hostCoverage = expectedHosts.every((host) => allowedHosts.includes(host));
      const routeCoverage = expectedRoutes.every((route) => allowedRoutes.includes(route));
      const cacheTtlSeconds = Number(body?.cacheTtlSeconds);
      const staleTtlSeconds = Number(body?.staleTtlSeconds);
      const maxResponseBytes = Number(body?.maxResponseBytes);
      const cacheReady = Number.isFinite(cacheTtlSeconds) && cacheTtlSeconds >= 30;
      const staleFallbackReady =
        body?.staleFallback === true && Number.isFinite(staleTtlSeconds) && staleTtlSeconds >= cacheTtlSeconds;
      const sizeGuardReady = Number.isFinite(maxResponseBytes) && maxResponseBytes >= 100_000;
      const corsReady = response.headers.get("access-control-allow-origin") === "*";
      const apiFootballServerKeyReady = has("VITE_APIFOOTBALL_KEY") || body?.apiFootballServerKey === true;
      const oddsApiServerKeyReady = !has("VITE_ODDS_API_SPORT_KEY") || has("VITE_ODDS_API_KEY") || body?.oddsApiServerKey === true;
      const footballDataServerTokenReady =
        has("FOOTBALL_DATA_TOKEN") ||
        has("FOOTBALL_DATA_ORG_TOKEN") ||
        has("VITE_FOOTBALL_DATA_TOKEN") ||
        body?.footballDataServerToken === true;
      const passed =
        response.ok &&
        body?.ok === true &&
        body?.service === "kickoff-data-proxy" &&
        hostCoverage &&
        routeCoverage &&
        cacheReady &&
        staleFallbackReady &&
        sizeGuardReady &&
        corsReady &&
        apiFootballServerKeyReady &&
        oddsApiServerKeyReady &&
        footballDataServerTokenReady;
      push({
        id: "data-proxy-health",
        category: "data",
        label: "Static hosting data proxy health",
        required: true,
        status: passed ? "passed" : "failed",
        url: healthUrl,
        detail: response.ok
          ? passed
            ? `healthy; allowed ${allowedHosts.join(", ")}; cache ${cacheTtlSeconds}s; stale ${staleTtlSeconds}s; max ${maxResponseBytes} bytes`
            : [
                body?.ok === true ? "" : "ok flag missing",
                body?.service === "kickoff-data-proxy" ? "" : "service mismatch",
                hostCoverage ? "" : "allowed host coverage incomplete",
                routeCoverage ? "" : "allowed route coverage incomplete",
                cacheReady ? "" : "cacheTtlSeconds missing or too low",
                staleFallbackReady ? "" : "stale fallback missing or too low",
                sizeGuardReady ? "" : "maxResponseBytes missing or too low",
                corsReady ? "" : "CORS wildcard header missing",
                apiFootballServerKeyReady ? "" : "server-side APIFOOTBALL_KEY missing from data proxy",
                oddsApiServerKeyReady ? "" : "server-side ODDS_API_KEY missing from data proxy",
                footballDataServerTokenReady ? "" : "server-side FOOTBALL_DATA_TOKEN missing from data proxy",
              ].filter(Boolean).join("; ")
          : `HTTP ${response.status}`,
        action:
          "Deploy server/data-proxy-worker.mjs and expose /health with allowed hosts/routes, cache TTL, stale fallback, response size guard, CORS headers and server-side APIFOOTBALL_KEY/ODDS_API_KEY/FOOTBALL_DATA_TOKEN when enrichment is proxied.",
        sampleIds: [...allowedHosts, ...allowedRoutes],
      });
    } catch (error) {
      push({
        id: "data-proxy-health",
        category: "data",
        label: "Static hosting data proxy health",
        required: true,
        status: "failed",
        url: healthUrl,
        detail: String(error),
        action: "Deploy server/data-proxy-worker.mjs and expose /health with allowed hosts, cache TTL, stale fallback, response size guard and CORS headers.",
      });
    }
  }
  const key = env("VITE_THESPORTSDB_KEY") || "123";
  const league = env("VITE_THESPORTSDB_LEAGUE_ID") || "4429";
  const season = env("VITE_THESPORTSDB_SEASON") || String(new Date().getUTCFullYear());
  const publicFeeds = [
    {
      id: "thesportsdb-season",
      label: "TheSportsDB season feed",
      source: "thesportsdb",
      url: `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsseason.php?id=${encodeURIComponent(league)}&s=${encodeURIComponent(season)}`,
      validate: (body) => Array.isArray(body?.events) && body.events.length > 0,
      ids: (body) => sampleIds(Array.isArray(body?.events) ? body.events : [], "idEvent"),
    },
    {
      id: "espn-world-cup-scoreboard",
      label: "ESPN World Cup scoreboard",
      source: "espn",
      url: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=40",
      validate: (body) =>
        Array.isArray(body?.events) &&
        body.events.length > 0 &&
        Array.isArray(body?.leagues) &&
        body.leagues.some((leagueItem) => String(leagueItem?.slug ?? "").includes("fifa.world")),
      ids: (body) => sampleIds(Array.isArray(body?.events) ? body.events : [], "id"),
    },
    {
      id: "worldcup26-games",
      label: "worldcup26 games feed",
      source: "worldcup26",
      url: "https://worldcup26.ir/get/games",
      validate: (body) => worldcup26Rows(body).length > 0,
      ids: (body) => sampleIds(worldcup26Rows(body), "id", "game_id"),
    },
  ];
  const feedResults = [];
  for (const feed of publicFeeds) {
    const url = proxiedPublicUrl(feed.url, feed.source);
    try {
      const { response, body, text } = await readJson(url);
      const passed = response.ok && feed.validate(body, text);
      const detail = passed
        ? `HTTP ${response.status}${configuredDataProxyUrl() ? " via data proxy" : ""}`
        : `HTTP ${response.status}, World Cup payload missing`;
      feedResults.push({ ...feed, passed, detail });
      push({
        id: feed.id,
        category: "data",
        label: feed.label,
        required: false,
        status: passed ? "passed" : "warning",
        url,
        detail,
        action: configuredDataProxyUrl()
          ? "Keep the data proxy healthy for static-hosting free feed continuity."
          : "Configure VITE_DATA_PROXY_URL or keep direct public feed access healthy for continuity.",
        sampleIds: passed ? feed.ids(body) : [],
      });
    } catch (error) {
      feedResults.push({ ...feed, passed: false, detail: String(error) });
      push({
        id: feed.id,
        category: "data",
        label: feed.label,
        required: false,
        status: "warning",
        url,
        detail: String(error),
        action: configuredDataProxyUrl()
          ? "Keep the data proxy healthy for static-hosting free feed continuity."
          : "Configure VITE_DATA_PROXY_URL or keep direct public feed access healthy for continuity.",
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
  const dataProxyUrl = configuredDataProxyUrl();
  const footballDataToken = env("FOOTBALL_DATA_TOKEN") || env("FOOTBALL_DATA_ORG_TOKEN") || env("VITE_FOOTBALL_DATA_TOKEN");
  if (!footballDataToken && !dataProxyUrl) {
    push({
      id: "football-data-readback",
      category: "data",
      label: "Football-Data.org matches/standings read-back",
      required: true,
      status: "failed",
      detail: "Missing FOOTBALL_DATA_TOKEN or deployed data proxy with server-side FOOTBALL_DATA_TOKEN",
      action:
        "Configure direct FOOTBALL_DATA_TOKEN for local diagnostics, or deploy the data proxy with server-side FOOTBALL_DATA_TOKEN and verify matches plus standings.",
    });
  } else {
    const competition = env("VITE_FOOTBALL_DATA_COMPETITION") || "WC";
    const seasonValue = env("KICKOFF_DATA_SCOUT_SEASON") || String(new Date().getUTCFullYear());
    const footballDataTargetUrl = (route) =>
      `https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/${route}?season=${encodeURIComponent(seasonValue)}`;
    const footballDataUrl = (route) =>
      footballDataToken
        ? footballDataTargetUrl(route)
        : proxiedPublicUrl(footballDataTargetUrl(route), "football-data");
    const footballDataHeaders = footballDataToken ? { headers: { "X-Auth-Token": footballDataToken } } : {};
    try {
      const [matchesResult, standingsResult] = await Promise.all([
        readJson(footballDataUrl("matches"), footballDataHeaders),
        readJson(footballDataUrl("standings"), footballDataHeaders),
      ]);
      const matches = (Array.isArray(matchesResult.body?.matches) ? matchesResult.body.matches : []).filter(
        (match) =>
          (match?.id || match?.utcDate) &&
          (match?.homeTeam?.name || match?.homeTeam?.shortName || match?.homeTeam?.id) &&
          (match?.awayTeam?.name || match?.awayTeam?.shortName || match?.awayTeam?.id),
      );
      const standings = (Array.isArray(standingsResult.body?.standings) ? standingsResult.body.standings : [])
        .flatMap((group) => (Array.isArray(group?.table) ? group.table : []))
        .filter(
          (row) =>
            (row?.team?.name || row?.team?.shortName || row?.team?.id) &&
            (Number.isFinite(Number(row?.position)) || Number.isFinite(Number(row?.rank))) &&
            Number.isFinite(Number(row?.points)),
        );
      const passed = matchesResult.response.ok && standingsResult.response.ok && matches.length > 0 && standings.length >= 2;
      push({
        id: "football-data-readback",
        category: "data",
        label: "Football-Data.org matches/standings read-back",
        required: true,
        status: passed ? "passed" : "failed",
        url: footballDataUrl("matches"),
        detail: matchesResult.response.ok && standingsResult.response.ok
          ? `${matches.length} valid match rows, ${standings.length} valid standing rows for ${competition}${footballDataToken ? "" : " via data proxy"}`
          : `matches HTTP ${matchesResult.response.status}, standings HTTP ${standingsResult.response.status}`,
        action:
          "Use a Football-Data.org competition/season where matches returns fixture rows and standings returns at least two ranked teams.",
        sampleIds: [
          ...matches.map((match) => String(match.id ?? match.utcDate)).filter(Boolean).slice(0, 3),
          ...standings.map((row) => String(row.position ?? row.rank ?? row.team?.id ?? row.team?.name)).filter(Boolean).slice(0, 2),
        ],
      });
    } catch (error) {
      push({
        id: "football-data-readback",
        category: "data",
        label: "Football-Data.org matches/standings read-back",
        required: true,
        status: "failed",
        url: footballDataUrl("matches"),
        detail: String(error),
        action:
          "Verify the Football-Data.org token, competition code and data proxy route for matches and standings.",
      });
    }
  }
  const directApiFootballKey = env("VITE_APIFOOTBALL_KEY");
  if (!directApiFootballKey && !dataProxyUrl) {
    push({
      id: "api-football-enrichment-live",
      category: "data",
      label: "API-Football enrichment read-back",
      required: true,
      status: "failed",
      detail: "Missing VITE_APIFOOTBALL_KEY or deployed data proxy with server-side APIFOOTBALL_KEY",
      action:
        "Configure direct VITE_APIFOOTBALL_KEY for diagnostics, or deploy the data proxy with server-side APIFOOTBALL_KEY and set KICKOFF_VERIFY_FIXTURE_IDS to verify lineups, injuries, odds and standings.",
    });
    return;
  }
  const fixtureIds = fixtureTargetIds();
  const fixtureProblem = fixtureTargetProblem();
  if (fixtureProblem) {
    push({
      id: "api-football-enrichment-live",
      category: "data",
      label: "API-Football enrichment read-back",
      required: true,
      status: "failed",
      detail: fixtureProblem,
      action: "Set KICKOFF_VERIFY_FIXTURE_IDS to World Cup fixtures with lineups, injuries, odds and standings available.",
      sampleIds: fixtureIds,
    });
    return;
  }
  const headers = directApiFootballKey && !dataProxyUrl ? { "x-apisports-key": directApiFootballKey } : undefined;
  const endpointFor = (name, fixtureId) =>
    name === "lineups"
      ? `https://v3.football.api-sports.io/fixtures/lineups?fixture=${encodeURIComponent(fixtureId)}`
      : name === "injuries"
        ? `https://v3.football.api-sports.io/injuries?fixture=${encodeURIComponent(fixtureId)}`
        : name === "standings"
          ? `https://v3.football.api-sports.io/standings?league=${encodeURIComponent(env("KICKOFF_DATA_SCOUT_LEAGUE_ID") || "1")}&season=${encodeURIComponent(env("KICKOFF_DATA_SCOUT_SEASON") || String(new Date().getUTCFullYear()))}`
          : `https://v3.football.api-sports.io/odds?fixture=${encodeURIComponent(fixtureId)}`;
  const enrichmentUrlFor = (name, fixtureId) => {
    const targetUrl = endpointFor(name, fixtureId);
    return dataProxyUrl ? proxiedPublicUrl(targetUrl, "api-football") : targetUrl;
  };
  const rowsForEndpoint = (name, body) => {
    if (name !== "standings") return Array.isArray(body?.response) ? body.response : [];
    const leagues = Array.isArray(body?.response) ? body.response : [];
    return leagues.flatMap((item) => {
      const groups = Array.isArray(item?.league?.standings)
        ? item.league.standings
        : Array.isArray(item?.standings)
          ? item.standings
          : [];
      return groups.flatMap((groupRows) => (Array.isArray(groupRows) ? groupRows : [groupRows]));
    });
  };
  const results = [];
  for (const fixtureId of fixtureIds) {
    for (const name of ["lineups", "injuries", "odds", "standings"]) {
      const url = enrichmentUrlFor(name, fixtureId);
      try {
        const { response, body } = await readJson(url, headers ? { headers } : {});
        const rows = rowsForEndpoint(name, body);
        const evaluation = evaluateApiFootballEndpointRows(
          name,
          rows,
          name === "standings"
            ? {}
            : { fixtureId, requireFixtureIdentity: name === "injuries" || name === "odds" },
        );
        results.push({
          fixtureId,
          name,
          ok: response.ok && evaluation.passed && (name !== "standings" || evaluation.validRows.length >= 2),
          rows: response.ok ? evaluation.validRows.length : 0,
          totalRows: rows.length,
          status: response.status,
        });
      } catch (error) {
        results.push({ fixtureId, name, ok: false, rows: 0, status: String(error) });
      }
    }
  }
  const live = results.filter((result) => result.ok).length;
  push({
    id: "api-football-enrichment-live",
    category: "data",
    label: "API-Football enrichment read-back",
    required: true,
    status: live === results.length ? "passed" : "failed",
    detail: results
      .map((result) =>
        typeof result.totalRows === "number"
          ? `${result.fixtureId}/${result.name}:${result.rows}/${result.totalRows} valid`
          : `${result.fixtureId}/${result.name}:${result.rows}`,
      )
      .join(" · ") + (dataProxyUrl ? " · via data proxy" : ""),
    action: dataProxyUrl
      ? "Keep the data proxy deployed with server-side APIFOOTBALL_KEY and use target fixtures where lineups, injuries, odds and standings endpoints all return live rows."
      : "Use target fixtures where lineups, injuries, odds and standings endpoints all return live rows.",
    sampleIds: fixtureIds,
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

const writtenPaths = await writeEvidenceOutput(outputPath, `${JSON.stringify(packet, null, 2)}\n`);
if (renderBrowser) await renderBrowser.close();

const required = checks.filter((check) => check.required);
const requiredPassed = required.filter((check) => check.status === "passed").length;
const failed = required.filter((check) => check.status !== "passed");
console.log(`Production evidence written to ${writtenPaths.join(", ")}`);
console.log(`Required checks: ${requiredPassed}/${required.length}`);
for (const check of failed.slice(0, 12)) {
  console.log(`- ${check.id}: ${check.detail}`);
}

if (strict && failed.length > 0) {
  process.exitCode = 1;
}
