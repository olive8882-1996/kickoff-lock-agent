import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildSupabaseSchemaApplyArtifact,
  buildSupabaseSchemaApplyPlan,
} from "../src/supabaseSchemaApply.ts";

const includeExample = process.argv.includes("--include-example");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

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

const dryRun = process.argv.includes("--dry-run");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const schemaPath = argValue("schema") || "supabase.schema.sql";
const psqlPath = argValue("psql") || process.env.PSQL_PATH || "psql";
const outputPath = resolve(argValue("out") || "public/supabase-schema-apply.json");
const { env, loaded } = await loadEnv();

let schemaReadable = true;
let schemaSql;
try {
  const resolvedSchemaPath = resolve(schemaPath);
  await access(resolvedSchemaPath, constants.R_OK);
  schemaSql = await readFile(resolvedSchemaPath, "utf8");
} catch {
  schemaReadable = false;
}

const plan = buildSupabaseSchemaApplyPlan(env, { schemaPath, psqlPath, dryRun, schemaSql });

const result = {
  envFiles: loaded,
  schemaReadable,
  schemaContract: plan.schemaContract,
  psqlAvailable: undefined,
  ...plan,
  args: plan.args.map((arg) => (arg === plan.databaseUrl ? plan.maskedDatabaseUrl : arg)),
  databaseUrl: undefined,
};

const checkPsql = () => {
  const checked = spawnSync(plan.command, ["--version"], {
    encoding: "utf8",
    shell: false,
  });
  return {
    available: !checked.error && checked.status === 0,
    detail: checked.error?.code === "ENOENT" ? `Missing ${plan.command}` : checked.stderr || checked.stdout || "",
  };
};

let psql = schemaReadable && plan.ready && dryRun ? checkPsql() : undefined;
let applied = false;
let executeStatus;
let executeError;

if (schemaReadable && plan.ready && !dryRun) {
  const executed = spawnSync(plan.command, plan.args, {
    stdio: "inherit",
    shell: false,
  });
  executeStatus = executed.status ?? undefined;
  executeError = executed.error?.code === "ENOENT" ? `Missing ${plan.command}` : executed.error ? String(executed.error) : undefined;
  applied = !executed.error && executed.status === 0;
  psql = { available: !executed.error, detail: executeError || "" };
}

const artifact = buildSupabaseSchemaApplyArtifact(plan, {
  envFiles: loaded,
  schemaReadable,
  psqlAvailable: psql?.available,
  applied,
  executeStatus,
  executeError,
});

if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

result.psqlAvailable = psql?.available;

if (json) {
  console.log(JSON.stringify({
    ...result,
    evidence: noWrite ? undefined : outputPath,
    artifact,
  }, null, 2));
} else {
  console.log("Supabase schema apply");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  console.log(`Schema: ${resolve(schemaPath)} ${schemaReadable ? "readable" : "missing"}`);
  console.log(`Database: ${plan.maskedDatabaseUrl || "missing"}`);
  console.log(`Command: ${plan.command} ${plan.args.map((arg) => (arg === plan.databaseUrl ? plan.maskedDatabaseUrl : arg)).join(" ")}`);
  if (plan.schemaContract) {
    console.log(`Schema contract: ${plan.schemaContract.passed}/${plan.schemaContract.total}`);
    for (const check of plan.schemaContract.checks) {
      console.log(`- ${check.passed ? "pass" : "fail"} ${check.id}: ${check.detail}`);
    }
  }
  if (plan.missing.length) console.log(`Missing: ${plan.missing.join(", ")}`);
  if (psql) console.log(`psql: ${psql.available ? "available" : psql.detail}`);
  console.log(`Action: ${plan.action}`);
}

if (!schemaReadable || !plan.ready) {
  process.exitCode = 1;
} else if (!dryRun) {
  if (executeError) {
    console.error(`${executeError}. Install PostgreSQL client tools or set PSQL_PATH.`);
    process.exitCode = 1;
  } else if (!applied) {
    process.exitCode = executeStatus ?? 1;
  }
} else {
  if (!psql.available) {
    if (!json) console.error(`${psql.detail}. Install PostgreSQL client tools or set PSQL_PATH.`);
    process.exitCode = 1;
  }
}
