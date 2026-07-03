import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildSharingProductionDoctorReport } from "../src/sharingProductionDoctor.ts";

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

const createRenderer = async () => {
  let browser;
  return {
    render: async (url) => {
      const { chromium } = await import("playwright");
      browser ??= await chromium.launch({ headless: true });
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
        }));
      } finally {
        await page.close();
      }
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

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ envFiles: loaded, ...report }, null, 2));
} else {
  console.log("Sharing production doctor");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  console.log(`Required checks: ${report.requiredPassed}/${report.requiredTotal}`);
  console.log("");
  for (const check of report.checks) {
    const mark = check.status === "passed" ? "OK" : check.status === "skipped" ? "SKIP" : "TODO";
    console.log(`${mark} ${check.label}: ${check.detail}`);
    if (check.sampleIds?.length) console.log(`  samples: ${check.sampleIds.join(", ")}`);
    if (check.url) console.log(`  url: ${check.url}`);
    if (check.status !== "passed") console.log(`  action: ${check.action}`);
  }
}

if (!report.ready) process.exitCode = 1;

