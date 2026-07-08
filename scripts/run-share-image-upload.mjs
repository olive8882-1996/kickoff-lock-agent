import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { buildShareImageUploadArtifact, productionShareImageUploadTarget, uploadSupabaseShareImage } from "../src/shareImageUpload.ts";

const includeExample = process.argv.includes("--include-example");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];
const defaultFile = "public/generated/kickoff-production-share.png";

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

const json = process.argv.includes("--json");
const noWrite = process.argv.includes("--no-write");
const filePath = resolve(argValue("file") || defaultFile);
const bytes = await readFile(filePath);
const { env, loaded } = await loadEnv();
const kind = argValue("kind") === "mode" ? "mode" : "record";
const outputPath = resolve(argValue("out") || `public/share-image-upload-${kind}.json`);
const envList = (key) => (env[key]?.trim() || "").split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
const target = productionShareImageUploadTarget(env, {
  profileId: argValue("profile-id"),
  artifactId: argValue("artifact-id"),
  kind,
  fileName: argValue("name") || basename(filePath),
});
const report = await uploadSupabaseShareImage(env, target, new Uint8Array(bytes));
const artifact = buildShareImageUploadArtifact(report, {
  envFiles: loaded,
  filePath,
  target,
});
if (!noWrite) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

if (json) {
  console.log(JSON.stringify(artifact, null, 2));
} else {
  console.log("Supabase share image upload");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
  console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
  console.log(`PNG: ${filePath}`);
  console.log(`Target: ${target.profileId}/${target.kind}/${target.artifactId}/${target.fileName}`);
  if (!report.result) {
    console.log(`Missing: ${report.missing.join(", ") || "none"}`);
  } else {
    console.log(`Storage path: ${report.result.path}`);
    console.log(`Public URL: ${report.result.publicUrl}`);
    console.log(`Public read-back: ${report.result.publicReadBack ? "passed" : "failed"}`);
    if (kind === "mode" && envList("KICKOFF_VERIFY_MODE_IDS").length > 1) {
      console.log(`Mode target set: ${envList("KICKOFF_VERIFY_MODE_IDS").join(", ")}`);
      console.log("Seed will attach this mode image URL to every listed mode share artifact.");
    }
    console.log(`Bytes: ${report.result.imageByteLength}`);
    console.log(`Hash: ${report.result.imageHash}`);
    console.log("");
    console.log("Add this to .env.production.local:");
    if (kind === "mode") {
      console.log(`KICKOFF_SEED_MODE_SHARE_IMAGE_URL=${report.result.publicUrl}`);
      console.log(`KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL=${report.result.publicUrl}`);
    } else {
      console.log(`KICKOFF_SEED_SHARE_IMAGE_URL=${report.result.publicUrl}`);
      console.log(`KICKOFF_VERIFY_SHARE_IMAGE_URL=${report.result.publicUrl}`);
    }
  }
}

if (!report.ready) process.exitCode = 1;
