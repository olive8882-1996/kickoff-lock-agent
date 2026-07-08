import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildProductionShareImageTargetSvg,
  buildShareImageMetadata,
  DEFAULT_PRODUCTION_MODE_SHARE_IMAGE_TARGET,
  DEFAULT_PRODUCTION_SHARE_IMAGE_TARGET,
  productionShareImagePublicUrl,
} from "../src/shareImageTarget.ts";

const includeExample = process.argv.includes("--include-example");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];
const defaultRecordOutputPath = "public/generated/kickoff-production-share.png";
const defaultModeOutputPath = "public/generated/kickoff-production-mode-share.png";
const logoPath = "public/assets/kickoff-lock-icon.png";

const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

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

const dataUrlForFile = async (filePath) => {
  try {
    const bytes = await readFile(resolve(filePath));
    return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return undefined;
  }
};

const launchBrowser = async () => {
  try {
    return await chromium.launch({ headless: true });
  } catch {
    return await chromium.launch({ headless: true, channel: "chrome" });
  }
};

const json = process.argv.includes("--json");
const kind = argValue("kind") === "mode" ? "mode" : "record";
const defaultOutputPath = kind === "mode" ? defaultModeOutputPath : defaultRecordOutputPath;
const outputPath = resolve(argValue("out") || defaultOutputPath);
const svgOutputPath = process.argv.includes("--svg")
  ? resolve(argValue("svg-out") || outputPath.replace(/\.png$/i, ".svg"))
  : undefined;
const { env, loaded } = await loadEnv();
const logoHref = await dataUrlForFile(argValue("logo") || logoPath);
const target = {
  ...(kind === "mode" ? DEFAULT_PRODUCTION_MODE_SHARE_IMAGE_TARGET : DEFAULT_PRODUCTION_SHARE_IMAGE_TARGET),
  generatedAt: new Date().toISOString(),
  logoHref,
};
const svg = buildProductionShareImageTargetSvg(target);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1200px;height:675px;overflow:hidden;background:#050b0e}svg{display:block}</style></head><body>${svg}</body></html>`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
try {
  await page.setContent(html, { waitUntil: "load" });
  const screenshot = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: 1200, height: 675 },
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, screenshot);
  if (svgOutputPath) {
    await mkdir(dirname(svgOutputPath), { recursive: true });
    await writeFile(svgOutputPath, svg);
  }

  const metadata = await buildShareImageMetadata(new Uint8Array(screenshot), "image/png");
  const publicRoot = env.VITE_PUBLIC_APP_URL;
  const publicDir = resolve("public");
  const relativeToPublic = relative(publicDir, outputPath);
  const publicPath = relativeToPublic.startsWith("..") ? basename(outputPath) : relativeToPublic;
  const publicUrl = productionShareImagePublicUrl(publicRoot, publicPath);
  const result = {
    envFiles: loaded,
    outputPath,
    outputUrl: pathToFileURL(outputPath).toString(),
    svgOutputPath,
    publicUrl,
    kind,
    logoPath: resolve(argValue("logo") || logoPath),
    ...metadata,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(kind === "mode" ? "Production mode share image" : "Production share image");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
    console.log(`PNG: ${outputPath}`);
    if (svgOutputPath) console.log(`SVG: ${svgOutputPath}`);
    console.log(`Logo: ${result.logoPath}`);
    console.log(`MIME: ${metadata.imageMime}`);
    console.log(`Bytes: ${metadata.imageByteLength}`);
    console.log(`Hash: ${metadata.imageHash}`);
    if (publicUrl) {
      console.log("");
      console.log("After deploying public/, use:");
      if (kind === "mode") {
        console.log(`KICKOFF_SEED_MODE_SHARE_IMAGE_URL=${publicUrl}`);
        console.log(`KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL=${publicUrl}`);
      } else {
        console.log(`KICKOFF_SEED_SHARE_IMAGE_URL=${publicUrl}`);
        console.log(`KICKOFF_VERIFY_SHARE_IMAGE_URL=${publicUrl}`);
      }
    } else {
      console.log("");
      console.log("Set VITE_PUBLIC_APP_URL to print deployable KICKOFF_* share image URLs.");
    }
  }
} finally {
  await browser.close();
}
