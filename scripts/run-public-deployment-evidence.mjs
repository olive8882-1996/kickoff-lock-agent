import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildPublicDeploymentEvidencePacket,
  extractBuiltAssetsFromIndex,
} from "../src/publicDeploymentEvidence.ts";
import { writeEvidenceOutput } from "../src/evidenceOutput.ts";

const includeExample = process.argv.includes("--include-example");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

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

const output = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false });
  if (result.status !== 0) return "";
  return result.stdout.trim();
};

const readTextFile = async (fileName) => {
  try {
    return await readFile(resolve(fileName), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
};

const gitShow = (refPath) => output("git", ["show", refPath]);

const fetchText = async (url) => {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return { status: response.status, text: await response.text().catch(() => "") };
  } catch (error) {
    return { status: 0, text: "", error: error instanceof Error ? error.message : String(error) };
  }
};

const headStatus = async (url) => {
  if (!url) return 0;
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    return response.status;
  } catch {
    return 0;
  }
};

const githubRepoFromRemote = () => {
  const remoteUrl = process.env.PAGES_REPO ?? output("git", ["remote", "get-url", "origin"]);
  const match = remoteUrl.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/);
  return match?.groups ? `${match.groups.owner}/${match.groups.repo}` : "";
};

const latestPagesBuild = () => {
  const repo = githubRepoFromRemote();
  if (!repo) return {};
  const text = output("gh", ["api", `repos/${repo}/pages/builds/latest`]);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return {
      status: parsed.status,
      commit: parsed.commit,
      error: parsed.error?.message,
    };
  } catch {
    return {};
  }
};

const { env, loaded } = await loadEnv();
const flagEnabled = (key) => /^(1|true|yes|on)$/i.test(String(env[key] ?? "").trim());
const isCloudflarePagesHost = (urlText) => {
  try {
    const url = new URL(urlText);
    return url.protocol === "https:" && (url.hostname === "pages.dev" || url.hostname.endsWith(".pages.dev"));
  } catch {
    return false;
  }
};
const isGitHubPagesHost = (urlText) => {
  try {
    return new URL(urlText).hostname.endsWith("github.io");
  } catch {
    return false;
  }
};
const cloudflarePagesFunctionsAvailable = () =>
  flagEnabled("CF_PAGES") || isCloudflarePagesHost(env.CF_PAGES_URL || env.VITE_PUBLIC_APP_URL || "");
const selectedPublicAppUrl = () => {
  const explicitUrl = argValue("url");
  if (explicitUrl) return explicitUrl;
  const publicAppUrl = env.VITE_PUBLIC_APP_URL || "";
  const pagesUrl = env.CF_PAGES_URL || "";
  if (pagesUrl && flagEnabled("CF_PAGES") && (!publicAppUrl || isGitHubPagesHost(publicAppUrl))) return pagesUrl;
  return publicAppUrl || pagesUrl || "https://olive8882-1996.github.io/kickoff-lock-agent/";
};
const sameOriginSelected = (flagKey, directUrlKey) => {
  if (String(env[flagKey] ?? "").trim()) return flagEnabled(flagKey);
  if (String(env[directUrlKey] ?? "").trim()) return false;
  return cloudflarePagesFunctionsAvailable();
};
const publicAppUrl = selectedPublicAppUrl();
const outputPath = resolve(argValue("out") || "public/public-deployment-evidence.json");
const expectedIndexPath = argValue("expected-index");
const expectedIndexText = expectedIndexPath
  ? await readTextFile(expectedIndexPath)
  : gitShow("gh-pages:index.html") || (await readTextFile("dist/index.html"));
const expectedCommit =
  argValue("commit");
const cacheBustUrl = new URL(publicAppUrl);
cacheBustUrl.searchParams.set("deploymentEvidence", expectedCommit || output("git", ["rev-parse", "--short=12", "gh-pages"]) || String(Date.now()));
const liveIndex = await fetchText(cacheBustUrl.toString());
const liveAssets = extractBuiltAssetsFromIndex(liveIndex.text);
const assetUrl = (asset) => (asset ? new URL(asset, publicAppUrl).toString() : "");
const rootUrl = (path) => new URL(path, publicAppUrl).toString();
const pagesBuild = latestPagesBuild();
const sameOriginDataProxy = sameOriginSelected("VITE_DATA_PROXY_SAME_ORIGIN", "VITE_DATA_PROXY_URL");
const sameOriginSealProxy = sameOriginSelected("VITE_FILECOIN_SEAL_SAME_ORIGIN", "VITE_FILECOIN_SEAL_API");
const dataProxyHealth = sameOriginDataProxy ? await fetchText(rootUrl("/data-proxy/health")) : undefined;
const sealProxyHealth = sameOriginSealProxy ? await fetchText(rootUrl("/health")) : undefined;
const packet = buildPublicDeploymentEvidencePacket({
  generatedAt: new Date().toISOString(),
  source: "local-script",
  publicAppUrl,
  expectedCommit,
  pagesBuildStatus: pagesBuild.status,
  pagesBuildCommit: pagesBuild.commit,
  pagesBuildError: pagesBuild.error,
  liveIndexStatus: liveIndex.status,
  liveIndexText: liveIndex.text,
  expectedIndexText,
  liveBundleStatus: await headStatus(assetUrl(liveAssets.bundle)),
  liveStylesheetStatus: await headStatus(assetUrl(liveAssets.stylesheet)),
  sameOriginDataProxy,
  dataProxyHealthStatus: dataProxyHealth?.status,
  dataProxyHealthText: dataProxyHealth?.text,
  requireOddsProxyKey: Boolean(String(env.VITE_ODDS_API_SPORT_KEY ?? "").trim()),
  sameOriginSealProxy,
  sealProxyHealthStatus: sealProxyHealth?.status,
  sealProxyHealthText: sealProxyHealth?.text,
});
const artifact = {
  envFiles: loaded,
  expectedIndexPath,
  outputPath,
  wrote: !noWrite,
  ...packet,
};

if (!noWrite) {
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeEvidenceOutput(outputPath, artifactText);
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Public deployment evidence");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  console.log(noWrite ? "Artifact: not written (--no-write)" : `Artifact: ${outputPath}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Ready: ${packet.ready ? "yes" : "no"}`);
  console.log(`Public app: ${packet.publicAppUrl || publicAppUrl}`);
  console.log(`Expected commit: ${packet.expectedCommit ?? "unknown"}`);
  console.log(`Pages build: ${packet.pagesBuildStatus ?? "unknown"} ${packet.pagesBuildCommit ?? ""}`.trim());
  console.log(`Live bundle: ${packet.liveBundle ?? "missing"}`);
  console.log(`Expected bundle: ${packet.expectedBundle ?? "missing"}`);
  console.log(`Next action: ${packet.nextAction}`);
  console.log("");
  for (const check of packet.checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}`);
    console.log(`  ${check.detail}`);
    if (check.url) console.log(`  ${check.url}`);
  }
}

if (!packet.ready) process.exitCode = 1;
