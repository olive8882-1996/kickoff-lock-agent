import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mergeProductionVerifyEnv, parseEnvText } from "../src/productionEvidence.ts";

const envFiles = [".env.example", ".env", ".env.local", ".env.production", ".env.production.local"];

const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const positionalFiles = process.argv.slice(2).filter((arg) => arg !== "--" && !arg.startsWith("--"));
const json = process.argv.includes("--json");
const includeCurrentEnv = !process.argv.includes("--no-current-env");
const outputPath = argValue("out");

const readOptional = async (fileName) => {
  try {
    return await readFile(resolve(fileName), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return "";
  }
};

const currentEnvTexts = includeCurrentEnv ? await Promise.all(envFiles.map(readOptional)) : [];
const extraTexts = await Promise.all(positionalFiles.map(async (fileName) => readFile(resolve(fileName), "utf8")));
const baseValues = includeCurrentEnv ? Object.assign({}, ...currentEnvTexts.map(parseEnvText), process.env) : {};
const result = mergeProductionVerifyEnv(extraTexts, baseValues);

if (outputPath) {
  await writeFile(resolve(outputPath), result.text);
}

if (json) {
  console.log(
    JSON.stringify(
      {
        envFiles: includeCurrentEnv ? envFiles : [],
        inputFiles: positionalFiles,
        outputPath,
        presentKeys: result.presentKeys,
        missingKeys: result.missingKeys,
        values: result.values,
        text: result.text,
      },
      null,
      2,
    ),
  );
} else {
  console.log("Production verify env");
  console.log(`Current env files: ${includeCurrentEnv ? envFiles.join(", ") : "disabled"}`);
  console.log(`Input env blocks: ${positionalFiles.join(", ") || "none"}`);
  console.log(`Present keys: ${result.presentKeys.length}`);
  console.log(`Missing keys: ${result.missingKeys.join(", ") || "none"}`);
  if (outputPath) console.log(`Wrote: ${resolve(outputPath)}`);
  console.log("");
  console.log(result.text.trimEnd());
}
