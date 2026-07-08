import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const publicDir = resolve("public");
const videoDir = resolve(".tmp/submission-video");
const appUrl = process.argv[2] ?? "http://127.0.0.1:4173/kickoff-lock-agent/";
const screenshotPath = resolve(publicDir, "kickoff-lock-screenshot.png");
const videoPath = resolve(publicDir, "kickoff-lock-demo.webm");

await mkdir(publicDir, { recursive: true });
await mkdir(videoDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

const settle = async (ms = 650) => {
  await page.waitForTimeout(ms);
};

await page.goto(appUrl, { waitUntil: "load" });
await settle(1200);
await page.screenshot({ path: screenshotPath, fullPage: false });

const clickTab = async (title, pause = 950) => {
  await page.locator(`button[title="${title}"]`).first().click();
  await settle(pause);
};

await clickTab("Match board", 800);
await page.mouse.wheel(0, 460);
await settle(700);
await clickTab("Game modes", 1000);
await page.mouse.wheel(0, 520);
await settle(800);
await clickTab("Verify proof", 900);
await clickTab("Memory wall", 900);
await clickTab("Account", 1200);
await page.mouse.wheel(0, 680);
await settle(1000);
await clickTab("Match board", 900);
await page.mouse.wheel(0, -1200);
await settle(900);

const recordedPath = await page.video()?.path();
await context.close();
await browser.close();

if (!recordedPath) {
  throw new Error("Playwright did not produce a video path.");
}

await mkdir(dirname(videoPath), { recursive: true });
await copyFile(recordedPath, videoPath);

console.log(`Screenshot: ${screenshotPath}`);
console.log(`Demo video: ${videoPath}`);
