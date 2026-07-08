import { copyFileSync, existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = resolve(root, "public", "assets");
const defaultSource = resolve(assetsDir, "kickoff-lock-icon-source.png");

const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const sourcePath = sourceArg ? resolve(root, sourceArg.replace("--source=", "")) : defaultSource;

const variants = [
  ["kickoff-lock-icon.png", 512],
  ["kickoff-lock-icon-512.png", 512],
  ["kickoff-lock-icon-192.png", 192],
  ["kickoff-lock-apple-touch.png", 180],
  ["kickoff-lock-icon-32.png", 32],
];

if (!existsSync(sourcePath)) {
  console.error(`Logo source not found: ${sourcePath}`);
  process.exit(1);
}

const sipsCheck = spawnSync("sips", ["--version"], { encoding: "utf8" });
if (sipsCheck.status !== 0) {
  console.error("The macOS sips command is required to build logo variants.");
  process.exit(sipsCheck.status || 1);
}

if (relative(sourcePath, defaultSource) !== "") {
  copyFileSync(sourcePath, defaultSource);
}

for (const [fileName, size] of variants) {
  const outputPath = resolve(assetsDir, fileName);
  const result = spawnSync("sips", ["-z", String(size), String(size), defaultSource, "--out", outputPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `Failed to build ${fileName}`);
    process.exit(result.status || 1);
  }
  console.log(`built ${fileName} ${size}x${size}`);
}

console.log(`source ${defaultSource}`);
