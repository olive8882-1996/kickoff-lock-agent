import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildProductionTargetSeedReport,
  upsertProductionTargetSeed,
} from "../src/productionTargetSeed.ts";
import { productionShareImageUploadTarget, uploadSupabaseShareImage } from "../src/shareImageUpload.ts";
import { buildSupabaseProductionDoctorReport } from "../src/supabaseProductionDoctor.ts";

const envFiles = [".env.example", ".env", ".env.local", ".env.production", ".env.production.local"];
const defaultShareImageFile = "public/generated/kickoff-production-share.png";

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
const uploadShareImage = process.argv.includes("--upload-share-image");
const { env, loaded } = await loadEnv();
let uploadedShareImage;
if (uploadShareImage) {
  const imagePath = resolve(argValue("share-image") || defaultShareImageFile);
  const bytes = await readFile(imagePath);
  const upload = await uploadSupabaseShareImage(
    env,
    productionShareImageUploadTarget(env, {
      fileName: basename(imagePath),
      kind: "record",
    }),
    new Uint8Array(bytes),
  );
  uploadedShareImage = upload.result;
  if (!upload.ready || !uploadedShareImage) {
    if (json) {
      console.log(JSON.stringify({ envFiles: loaded, dryRun, uploadShareImage, shareImageUpload: upload }, null, 2));
    } else {
      console.log("Production target seed");
      console.log(`Env files: ${loaded.join(", ") || "none"}`);
      console.log(`Share image upload failed: ${upload.missing.join(", ") || "unknown"}`);
      console.log("");
      console.log("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run without --upload-share-image using an existing KICKOFF_SEED_SHARE_IMAGE_URL.");
    }
    process.exitCode = 1;
    process.exit();
  }
  env.KICKOFF_SEED_SHARE_IMAGE_URL = uploadedShareImage.publicUrl;
  env.KICKOFF_VERIFY_SHARE_IMAGE_URL = uploadedShareImage.publicUrl;
}
const report = await buildProductionTargetSeedReport(env);

if (!report.seed) {
  if (json) {
    console.log(JSON.stringify({ envFiles: loaded, dryRun, uploadShareImage, shareImageUpload: uploadedShareImage, ...report }, null, 2));
  } else {
    console.log("Production target seed");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    console.log(`Missing required env: ${report.missing.join(", ") || "none"}`);
    console.log("");
    console.log("Set Supabase URL, anon key, service role key and a public generated share image URL before writing target rows.");
  }
  process.exitCode = 1;
} else {
  if (!dryRun && !report.ready) {
    console.log("Production target seed");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    console.log(`Missing required env for Supabase write: ${report.missing.join(", ") || "none"}`);
    console.log("");
    console.log("Run with --dry-run to preview target rows without writing to Supabase.");
    process.exitCode = 1;
  } else if (!dryRun) {
    await upsertProductionTargetSeed(env, report.seed);
  }
  const doctor = dryRun || !report.ready ? undefined : await buildSupabaseProductionDoctorReport({ ...env, ...parseEnvText(report.seed.verifyEnv) });
  if (json) {
    console.log(JSON.stringify({ envFiles: loaded, dryRun, uploadShareImage, shareImageUpload: uploadedShareImage, ...report, doctor }, null, 2));
  } else {
    console.log("Production target seed");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    console.log(`Mode: ${dryRun ? "dry-run" : "upserted to Supabase"}`);
    if (uploadedShareImage) {
      console.log(`Share image upload: ${uploadedShareImage.publicUrl}`);
    }
    console.log("");
    console.log("Targets:");
    console.log(`  user/profile: ${report.seed.targets.userId}`);
    console.log(`  prediction proof: ${report.seed.targets.proofId}`);
    console.log(`  mode proof: ${report.seed.targets.modeId}`);
    console.log(`  friend scope: ${report.seed.targets.friendCode}`);
    console.log(`  season scope: ${report.seed.targets.seasonKey}`);
    console.log(`  share image: ${report.seed.targets.shareImageUrl}`);
    console.log("");
    console.log("Add this to .env.production.local:");
    console.log(report.seed.verifyEnv.trimEnd());
    if (doctor) {
      console.log("");
      console.log(`Supabase doctor after seed: ${doctor.requiredPassed}/${doctor.requiredTotal}`);
      for (const check of doctor.nextActions.slice(0, 8)) {
        console.log(`TODO ${check.label}: ${check.detail}`);
      }
    }
  }
  if (!dryRun && doctor && !doctor.ready) process.exitCode = 1;
}
