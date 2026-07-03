import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import { productionShareImageUploadTarget, uploadSupabaseShareImage } from "../src/shareImageUpload.ts";

const envFiles = [".env.example", ".env", ".env.local", ".env.production", ".env.production.local"];
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
const filePath = resolve(argValue("file") || defaultFile);
const bytes = await readFile(filePath);
const { env, loaded } = await loadEnv();
const target = productionShareImageUploadTarget(env, {
  profileId: argValue("profile-id"),
  artifactId: argValue("artifact-id"),
  kind: argValue("kind") === "mode" ? "mode" : "record",
  fileName: argValue("name") || basename(filePath),
});
const report = await uploadSupabaseShareImage(env, target, new Uint8Array(bytes));

if (json) {
  console.log(JSON.stringify({ envFiles: loaded, filePath, target, ...report }, null, 2));
} else {
  console.log("Supabase share image upload");
  console.log(`Env files: ${loaded.join(", ") || "none"}`);
  console.log(`PNG: ${filePath}`);
  console.log(`Target: ${target.profileId}/${target.kind}/${target.artifactId}/${target.fileName}`);
  if (!report.result) {
    console.log(`Missing: ${report.missing.join(", ") || "none"}`);
  } else {
    console.log(`Storage path: ${report.result.path}`);
    console.log(`Public URL: ${report.result.publicUrl}`);
    console.log(`Public read-back: ${report.result.publicReadBack ? "passed" : "failed"}`);
    console.log(`Bytes: ${report.result.imageByteLength}`);
    console.log(`Hash: ${report.result.imageHash}`);
    console.log("");
    console.log("Add this to .env.production.local:");
    console.log(`KICKOFF_SEED_SHARE_IMAGE_URL=${report.result.publicUrl}`);
    console.log(`KICKOFF_VERIFY_SHARE_IMAGE_URL=${report.result.publicUrl}`);
  }
}

if (!report.ready) process.exitCode = 1;
