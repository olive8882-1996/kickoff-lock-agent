import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildProductionEnvPlan, detectBlankEnvDeclarations } from "../src/productionEnvPlan.ts";
import { productionEnvMergeFileList } from "../src/productionEnvMerge.ts";

const includeExample = process.argv.includes("--include-example");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const strict = process.argv.includes("--strict");
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = resolve(outArg ? outArg.slice("--out=".length) : "public/production-env-plan.json");
const envFiles = productionEnvMergeFileList({ includeExample });

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

const loaded = await Promise.all(envFiles.map(readOptional));
const values = {
  ...Object.assign({}, ...loaded.map((item) => parseEnvText(item.text))),
  ...process.env,
};
const blankDeclarations = loaded.flatMap((item) => detectBlankEnvDeclarations(item.text, item.fileName));
const plan = buildProductionEnvPlan(values, { blankDeclarations });

if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
}

if (json) {
  console.log(
    JSON.stringify(
      {
        envFiles: loaded.filter((item) => item.text).map((item) => item.fileName),
        outputPath: noWrite ? undefined : outputPath,
        wrote: !noWrite,
        ...plan,
      },
      null,
      2,
    ),
  );
} else {
  console.log("Production env plan");
  console.log(`Env files: ${loaded.filter((item) => item.text).map((item) => item.fileName).join(", ") || "none"}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  console.log(`Ready: ${plan.ready ? "yes" : "no"}`);
  console.log(`Missing required: ${plan.missingRequired.join(", ") || "none"}`);
  console.log(`Invalid required: ${plan.invalidRequired.join(", ") || "none"}`);
  console.log(
    `Blank declarations: ${
      plan.blankDeclarations.length
        ? plan.blankDeclarations.map((item) => `${item.key}${item.fileName ? ` (${item.fileName})` : ""}`).join(", ")
        : "none"
    }`,
  );
  console.log(`Next action: ${plan.nextAction}`);
  console.log("");
  console.log(plan.templateText.trimEnd());
}

if (strict && !plan.ready) process.exitCode = 1;
