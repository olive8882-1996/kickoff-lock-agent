import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildPublicRestoreEvidenceArtifact,
  buildSharingProductionDoctorReport,
} from "../src/sharingProductionDoctor.ts";

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
const outputPath = resolve(outArg ? outArg.slice("--out=".length) : "public/public-restore-evidence.json");

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

const createRenderer = async () => {
  let browser;
  const renderOnce = async (url) => {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
      return await page.evaluate(() => ({
        text: document.body?.innerText ?? "",
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
        ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "",
        ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "",
        twitterCard: document.querySelector('meta[name="twitter:card"]')?.getAttribute("content") ?? "",
        jsonLd: document.querySelector('script[data-kickoff-public-proof="jsonld"]')?.textContent ?? "",
        publicKind: document.querySelector("[data-kickoff-public-kind]")?.getAttribute("data-kickoff-public-kind") ?? "",
        publicTarget: document.querySelector("[data-kickoff-public-target]")?.getAttribute("data-kickoff-public-target") ?? "",
        publicSource: document.querySelector("[data-kickoff-public-source]")?.getAttribute("data-kickoff-public-source") ?? "",
      }));
    } finally {
      await page.close();
    }
  };
  return {
    render: async (url) => {
      const { chromium } = await import("playwright");
      browser ??= await chromium.launch({ headless: true });
      let lastError;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          return await renderOnce(url);
        } catch (error) {
          lastError = error;
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      throw lastError;
    },
    close: async () => {
      if (browser) await browser.close();
    },
  };
};

const { env, loaded } = await loadEnv();
const renderer = await createRenderer();
const report = await buildSharingProductionDoctorReport(env, { renderer: renderer.render });
await renderer.close();
const artifact = buildPublicRestoreEvidenceArtifact(report, { env, envFiles: loaded });

if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Sharing production doctor");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  console.log(`Required checks: ${report.requiredPassed}/${report.requiredTotal}`);
  console.log(`Clean-session restore: ${artifact.acceptance.cleanSessionRestore ? "passed" : "failed"}`);
  console.log(`Mode renders: ${artifact.acceptance.modeRenderCount}/${artifact.acceptance.requiredModeRenderCount}`);
  console.log("Public page targets:");
  for (const target of artifact.pageTargets) {
    console.log(`  ${target.ready ? "READY" : "BLOCKED"} ${target.kind}:${target.targetId}`);
    console.log(`    ${target.url || "missing public app URL or target id"}`);
  }
  console.log("");
  for (const check of report.checks) {
    const mark = check.status === "passed" ? "OK" : check.status === "skipped" ? "SKIP" : "TODO";
    console.log(`${mark} ${check.label}: ${check.detail}`);
    if (check.sampleIds?.length) console.log(`  samples: ${check.sampleIds.join(", ")}`);
    if (check.url) console.log(`  url: ${check.url}`);
    if (check.status !== "passed") console.log(`  action: ${check.action}`);
  }
}

process.exit(artifact.ready ? 0 : 1);
