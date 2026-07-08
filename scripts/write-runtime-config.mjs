import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildRuntimeConfigJsFromEnvTexts, formatRuntimeConfigMissingKeys } from "../src/runtimeConfigExport.ts";

const envFiles = [".env", ".env.local", ".env.production", ".env.production.local"];

const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const noWrite = process.argv.includes("--no-write");
const outputPath = noWrite ? undefined : argValue("out") || "public/runtime-config.js";
const json = process.argv.includes("--json");
const strict = process.argv.includes("--strict");
const includeExample = process.argv.includes("--include-example");
const files = includeExample ? [".env.example", ...envFiles] : envFiles;

const readOptional = async (fileName) => {
  try {
    return {
      fileName,
      text: await readFile(resolve(fileName), "utf8"),
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { fileName, text: "" };
  }
};

const loaded = await Promise.all(files.map(readOptional));
const report = buildRuntimeConfigJsFromEnvTexts(
  loaded.map((item) => item.text),
  process.env,
);
if (outputPath) await writeFile(resolve(outputPath), report.text);

if (json) {
  console.log(
    JSON.stringify(
      {
        envFiles: loaded.filter((item) => item.text).map((item) => item.fileName),
        outputPath,
        wrote: Boolean(outputPath),
        ...report,
      },
      null,
      2,
    ),
  );
} else {
  console.log("Runtime config export");
  console.log(`Env files: ${loaded.filter((item) => item.text).map((item) => item.fileName).join(", ") || "none"}`);
  console.log(`Output: ${outputPath ? resolve(outputPath) : "disabled (--no-write)"}`);
  console.log(`Present keys: ${report.presentKeys.length}/${report.keys.length}`);
  console.log(`Missing recommended: ${formatRuntimeConfigMissingKeys(report.missingRecommendedKeys) || "none"}`);
  console.log(`Invalid recommended: ${report.invalidRecommendedKeys.join(", ") || "none"}`);
  console.log(`Detail: ${report.detail}`);
  console.log("Read-back commands:");
  for (const item of report.readBackCommands) {
    console.log(`  ${item.ready ? "READY" : "BLOCKED"} ${item.label}`);
    console.log(`    ${item.command}`);
  }
  console.log("Note: only browser-exposed VITE_* keys are written; service-role keys and private keys are never exported.");
}

if (strict && !report.ready) process.exitCode = 1;
