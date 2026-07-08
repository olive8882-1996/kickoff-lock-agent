import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAccountCloudSyncProductionEvidence } from "../src/accountCloudSyncProductionEvidence.ts";
import { writeEvidenceOutput } from "../src/evidenceOutput.ts";

const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const argValue = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const loadJson = async (fileName) => {
  try {
    return JSON.parse(await readFile(resolve(fileName), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
};

const outputPath = resolve(argValue("out") || "public/account-cloud-sync-evidence.json");
const artifact = buildAccountCloudSyncProductionEvidence({
  seedArtifact: await loadJson("public/supabase-target-seed.json"),
  schemaArtifact: await loadJson("public/supabase-schema-apply.json"),
  publicRestoreArtifact: await loadJson("public/public-restore-evidence.json"),
  shareChannelArtifact: await loadJson("public/share-channel-evidence.json"),
  leaderboardArtifact: await loadJson("public/leaderboard-backend.json"),
  source: "local-script",
});

if (!noWrite) {
  await writeEvidenceOutput(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Account cloud sync production evidence");
  console.log(noWrite ? "Artifact: not written (--no-write)" : `Artifact: ${outputPath}`);
  console.log(`Ready: ${artifact.ready ? "yes" : "no"}`);
  console.log(`Profile: ${artifact.profileId}`);
  console.log(`History: ${artifact.verifiedTotals.contentFingerprints}/${artifact.localTotals.historyArtifacts} content fingerprints`);
  console.log(`Public profile: ${artifact.verifiedTotals.publicProfileArchives}/${artifact.localTotals.historyArtifacts} archives`);
  console.log(`Outbox queued: ${artifact.outbox.reduce((sum, item) => sum + item.queued, 0)}`);
  if (artifact.missing.length) console.log(`Missing: ${artifact.missing.join(", ")}`);
  console.log(`Next action: ${artifact.nextAction}`);
}

if (!artifact.ready) process.exitCode = 1;
