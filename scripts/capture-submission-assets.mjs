import { spawnSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const publicDir = resolve("public");
const videoDir = resolve(".tmp/submission-video");
const appUrl = process.argv[2] ?? "http://127.0.0.1:4173/kickoff-lock-agent/";
const screenshotPath = resolve(publicDir, "kickoff-lock-screenshot.png");
const videoPath = resolve(publicDir, "kickoff-lock-demo.webm");
const movPath = resolve(publicDir, "kickoff-lock-demo.mov");

await mkdir(publicDir, { recursive: true });
await mkdir(videoDir, { recursive: true });

const browser = await chromium.launch();
const viewport = { width: 1440, height: 900 };

const screenshotContext = await browser.newContext({ viewport });
const screenshotPage = await screenshotContext.newPage();
await screenshotPage.goto(appUrl, { waitUntil: "load" });
await screenshotPage
  .waitForFunction(
    () => {
      const text = document.body.innerText;
      return /[1-9]\d*\s+matches loaded/i.test(text) && !/0\s+matches loaded\s+.\s+refreshing/i.test(text);
    },
    null,
    { timeout: 12000 },
  )
  .catch(() => undefined);
await screenshotPage.waitForTimeout(900);
await screenshotPage.screenshot({
  path: screenshotPath,
  clip: { x: 0, y: 0, width: viewport.width, height: 650 },
});
await screenshotContext.close();

const context = await browser.newContext({
  viewport,
  recordVideo: { dir: videoDir, size: viewport },
});
const page = await context.newPage();

const settle = async (ms = 650) => {
  await page.waitForTimeout(ms);
};

const scrollToTop = async () => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
  await settle(400);
};

const scrollBy = async (amount, pause = 700) => {
  await page.mouse.wheel(0, amount);
  await settle(pause);
};

await page.goto(appUrl, { waitUntil: "load" });
await settle(1600);
await scrollToTop();

const clickTab = async (title, pause = 950) => {
  await page.locator(`button[title="${title}"]`).first().click();
  await scrollToTop();
  await settle(pause);
};

await settle(1200);
await clickTab("Match board", 900);
await scrollBy(460, 850);
await scrollBy(520, 850);
await clickTab("Game modes", 1000);
await scrollBy(540, 900);
await scrollBy(480, 850);
await clickTab("Verify proof", 950);
await scrollBy(420, 850);
await clickTab("Memory wall", 950);
await scrollBy(500, 850);
await clickTab("Account", 1200);
await scrollBy(680, 950);
await scrollBy(520, 950);
await clickTab("Match board", 900);
await scrollToTop();
await settle(1100);

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

const ffmpeg = spawnSync("ffmpeg", [
  "-y",
  "-i",
  videoPath,
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  movPath,
], { stdio: "ignore" });

if (ffmpeg.status === 0) {
  console.log(`Demo video (mov): ${movPath}`);
} else {
  console.log("Skipped .mov export because ffmpeg is not available.");
}
