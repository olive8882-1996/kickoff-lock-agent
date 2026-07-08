import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mergeProductionVerifyEnv, parseEnvText } from "../src/productionEvidence.ts";
import {
  mergeVerifyEnvIntoEnvText,
  productionEnvArtifactFileList,
  productionEnvBlocksFromArtifacts,
  productionEnvMergeFileList,
} from "../src/productionEnvMerge.ts";

const includeExample = process.argv.includes("--include-example");
const envFiles = productionEnvMergeFileList({ includeExample });

const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const positionalFiles = process.argv.slice(2).filter((arg) => arg !== "--" && !arg.startsWith("--"));
const json = process.argv.includes("--json");
const includeCurrentEnv = !process.argv.includes("--no-current-env");
const includeArtifacts = !process.argv.includes("--no-artifacts");
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
const artifactSources = includeArtifacts
  ? await Promise.all(
      productionEnvArtifactFileList().map(async (fileName) => {
        const text = await readOptional(fileName);
        try {
          return { fileName, artifact: text ? JSON.parse(text) : undefined };
        } catch {
          return { fileName, artifact: undefined };
        }
      }),
    )
  : [];
const artifactEnvTexts = productionEnvBlocksFromArtifacts(artifactSources);
const baseValues = includeCurrentEnv ? Object.assign({}, ...currentEnvTexts.map(parseEnvText), process.env) : {};
const result = mergeProductionVerifyEnv([...artifactEnvTexts, ...extraTexts], baseValues);

if (outputPath) {
  const resolvedOutput = resolve(outputPath);
  const existingOutput = await readOptional(outputPath);
  await writeFile(resolvedOutput, mergeVerifyEnvIntoEnvText(existingOutput, result.text));
}

if (json) {
  console.log(
    JSON.stringify(
      {
        envFiles: includeCurrentEnv ? envFiles : [],
        artifactFiles: includeArtifacts
          ? artifactSources.filter((item) => item.artifact !== undefined).map((item) => item.fileName)
          : [],
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
  if (includeCurrentEnv && !includeExample) console.log("Example env: ignored by default; pass --include-example to merge placeholders intentionally.");
  console.log(
    `Artifact env blocks: ${
      includeArtifacts
        ? artifactSources.filter((item) => item.artifact !== undefined).map((item) => item.fileName).join(", ") || "none"
        : "disabled"
    }`,
  );
  console.log(`Input env blocks: ${positionalFiles.join(", ") || "none"}`);
  console.log(`Present keys: ${result.presentKeys.length}`);
  console.log(`Missing keys: ${result.missingKeys.join(", ") || "none"}`);
  if (outputPath) console.log(`Wrote: ${resolve(outputPath)}`);
  console.log("");
  console.log(result.text.trimEnd());
}
