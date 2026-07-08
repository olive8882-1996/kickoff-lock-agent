import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildProductionAcceptanceCollector,
  buildProductionAcceptanceCollectorArtifact,
} from "../src/productionAcceptanceCollector.ts";

const includeExample = process.argv.includes("--include-example");
const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = resolve(outArg ? outArg.slice("--out=".length) : "public/production-acceptance-collector.json");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

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

const loadJson = async (fileName) => {
  try {
    return JSON.parse(await readFile(resolve(fileName), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
};

const { env, loaded } = await loadEnv();
const supabaseBootstrapPlan = await loadJson("public/supabase-bootstrap-plan.json");
const supabaseSchemaArtifact = await loadJson("public/supabase-schema-apply.json");
const supabaseTargetSeedArtifact = await loadJson("public/supabase-target-seed.json");
const accountCloudSyncEvidence = await loadJson("public/account-cloud-sync-evidence.json");
const accessPreflightArtifact = await loadJson("public/production-access-preflight.json");
const dataBootstrapPlan = await loadJson("public/data-bootstrap-plan.json");
const dataProviderArtifact = await loadJson("public/data-provider-readiness.json");
const dataScoutArtifact = await loadJson("public/data-target-scout.json");
const filecoinBootstrapPlan = await loadJson("public/filecoin-bootstrap-plan.json");
const filecoinSealArtifact = await loadJson("public/filecoin-target-seal.json");
const cloudflarePagesDeployPlan = await loadJson("public/cloudflare-pages-deploy-plan.json");
const leaderboardArtifact = await loadJson("public/leaderboard-backend.json");
const publicRestoreArtifact = await loadJson("public/public-restore-evidence.json");
const shareChannelArtifact = await loadJson("public/share-channel-evidence.json");
const recordShareImageUploadArtifact = await loadJson("public/share-image-upload-record.json");
const modeShareImageUploadArtifact = await loadJson("public/share-image-upload-mode.json");
const verifyEnvText = Object.entries(env)
  .filter(([key]) => key.startsWith("KICKOFF_VERIFY_"))
  .map(([key, value]) => `${key}=${value ?? ""}`)
  .join("\n");
const packet = buildProductionAcceptanceCollector({
  runtimeEnv: env,
  verifyEnvText: `${verifyEnvText}\n`,
  dataBootstrapPlan,
  dataProviderArtifact,
  supabaseBootstrapPlan,
  supabaseSchemaArtifact,
  supabaseTargetSeedArtifact,
  accountCloudSyncEvidence,
  accessPreflightArtifact,
  dataScoutArtifact,
  filecoinBootstrapPlan,
  filecoinSealArtifact,
  cloudflarePagesDeployPlan,
  leaderboardArtifact,
  publicRestoreArtifact,
  shareChannelArtifact,
  shareImageUploadArtifacts: {
    record: recordShareImageUploadArtifact,
    mode: modeShareImageUploadArtifact,
  },
});
const artifact = buildProductionAcceptanceCollectorArtifact(packet, {
  generatedAt: new Date().toISOString(),
  envFiles: loaded,
  outputPath,
  wrote: !noWrite,
});

if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Production acceptance collector");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  console.log(noWrite ? "Artifact: not written (--no-write)" : `Artifact: ${outputPath}`);
  console.log(`Supabase schema evidence: ${supabaseSchemaArtifact ? "public/supabase-schema-apply.json" : "missing"}`);
  console.log(`Supabase bootstrap evidence: ${supabaseBootstrapPlan ? "public/supabase-bootstrap-plan.json" : "missing"}`);
  console.log(`Supabase seed evidence: ${supabaseTargetSeedArtifact ? "public/supabase-target-seed.json" : "missing"}`);
  console.log(`Account cloud sync evidence: ${accountCloudSyncEvidence ? "public/account-cloud-sync-evidence.json" : "missing"}`);
  console.log(`Access preflight evidence: ${accessPreflightArtifact ? "public/production-access-preflight.json" : "missing"}`);
  console.log(`Data bootstrap evidence: ${dataBootstrapPlan ? "public/data-bootstrap-plan.json" : "missing"}`);
  console.log(`Record share upload evidence: ${recordShareImageUploadArtifact ? "public/share-image-upload-record.json" : "missing"}`);
  console.log(`Mode share upload evidence: ${modeShareImageUploadArtifact ? "public/share-image-upload-mode.json" : "missing"}`);
  console.log(`Share channel evidence: ${shareChannelArtifact ? "public/share-channel-evidence.json" : "missing"}`);
  console.log(`Public restore evidence: ${publicRestoreArtifact ? "public/public-restore-evidence.json" : "missing"}`);
  console.log(`Leaderboard backend evidence: ${leaderboardArtifact ? "public/leaderboard-backend.json" : "missing"}`);
  console.log(`Data provider evidence: ${dataProviderArtifact ? "public/data-provider-readiness.json" : "missing"}`);
  console.log(`Data scout evidence: ${dataScoutArtifact ? "public/data-target-scout.json" : "missing"}`);
  console.log(`Filecoin bootstrap evidence: ${filecoinBootstrapPlan ? "public/filecoin-bootstrap-plan.json" : "missing"}`);
  console.log(`Filecoin seal evidence: ${filecoinSealArtifact ? "public/filecoin-target-seal.json" : "missing"}`);
  console.log(`Cloudflare Pages deploy evidence: ${cloudflarePagesDeployPlan ? "public/cloudflare-pages-deploy-plan.json" : "missing"}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Stages: ${packet.stageReadyCount}/${packet.totalStages} ready or done`);
  console.log(`Blocked: ${packet.blockedStages}`);
  if (packet.missingRuntimeEnv.length) console.log(`Missing runtime env: ${packet.missingRuntimeEnv.join(", ")}`);
  if (packet.missingVerifyEnv.length) console.log(`Missing verify env: ${packet.missingVerifyEnv.join(", ")}`);
  console.log(`Next action: ${packet.nextAction}`);
  console.log("");
  for (const stage of packet.stages) {
    console.log(`${stage.status.toUpperCase()} ${stage.label}`);
    console.log(`  command: ${stage.command}`);
    console.log(`  requires: ${stage.requiredEnv.join(", ") || "none"}`);
    console.log(`  outputs: ${stage.outputEnv.join(", ") || "none"}`);
    if (stage.missingEnv.length) console.log(`  missing: ${stage.missingEnv.join(", ")}`);
    console.log(`  detail: ${stage.detail}`);
  }
  console.log("");
  console.log("Runnable command queue:");
  for (const command of packet.commands) console.log(`- ${command}`);
}

if (!packet.ready) process.exitCode = 1;
