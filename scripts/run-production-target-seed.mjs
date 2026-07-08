import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseEnvText } from "../src/productionEvidence.ts";
import {
  buildProductionTargetSeedArtifact,
  buildProductionTargetSeedReport,
  upsertProductionTargetSeed,
  verifyProductionTargetSeedAuthUser,
} from "../src/productionTargetSeed.ts";
import { productionShareImageUploadTarget, uploadSupabaseShareImage } from "../src/shareImageUpload.ts";
import { buildSupabaseProductionDoctorReport } from "../src/supabaseProductionDoctor.ts";

const includeExample = process.argv.includes("--include-example");
const envFiles = [
  ...(includeExample ? [".env.example"] : []),
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];
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
const noWrite = process.argv.includes("--no-write");
const outArg = argValue("out");
const outputPath = resolve(outArg || "public/supabase-target-seed.json");
const uploadShareImage = process.argv.includes("--upload-share-image");
const uploadModeShareImage = process.argv.includes("--upload-mode-share-image") || Boolean(argValue("mode-share-image"));
const { env, loaded } = await loadEnv();
let uploadedShareImage;
let uploadedModeShareImage;

const uploadImage = async (kind, imagePath) => {
  const bytes = await readFile(imagePath);
  const upload = await uploadSupabaseShareImage(
    env,
    productionShareImageUploadTarget(env, {
      fileName: basename(imagePath),
      kind,
    }),
    new Uint8Array(bytes),
  );
  return upload;
};

if (uploadShareImage) {
  const imagePath = resolve(argValue("share-image") || defaultShareImageFile);
  const upload = await uploadImage("record", imagePath);
  uploadedShareImage = upload.result;
  if (!upload.ready || !uploadedShareImage) {
    if (json) {
      console.log(JSON.stringify({ envFiles: loaded, dryRun, uploadShareImage, uploadModeShareImage, shareImageUpload: upload }, null, 2));
    } else {
      console.log("Production target seed");
      console.log(`Env files: ${loaded.join(", ") || "none"}`);
      if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
      console.log(`Record share image upload failed: ${upload.missing.join(", ") || "unknown"}`);
      console.log("");
      console.log("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run without --upload-share-image using an existing KICKOFF_SEED_SHARE_IMAGE_URL.");
    }
    process.exitCode = 1;
    process.exit();
  }
  env.KICKOFF_SEED_SHARE_IMAGE_URL = uploadedShareImage.publicUrl;
  env.KICKOFF_VERIFY_SHARE_IMAGE_URL = uploadedShareImage.publicUrl;
}
if (uploadModeShareImage) {
  const imagePath = resolve(argValue("mode-share-image") || argValue("share-image") || defaultShareImageFile);
  const upload = await uploadImage("mode", imagePath);
  uploadedModeShareImage = upload.result;
  if (!upload.ready || !uploadedModeShareImage) {
    if (json) {
      console.log(JSON.stringify({ envFiles: loaded, dryRun, uploadShareImage, uploadModeShareImage, shareImageUpload: uploadedShareImage, modeShareImageUpload: upload }, null, 2));
    } else {
      console.log("Production target seed");
      console.log(`Env files: ${loaded.join(", ") || "none"}`);
      if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
      console.log(`Mode share image upload failed: ${upload.missing.join(", ") || "unknown"}`);
      console.log("");
      console.log("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run without --upload-mode-share-image to reuse the record share image for the mode artifact.");
    }
    process.exitCode = 1;
    process.exit();
  }
  env.KICKOFF_SEED_MODE_SHARE_IMAGE_URL = uploadedModeShareImage.publicUrl;
  env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL = uploadedModeShareImage.publicUrl;
}
const report = await buildProductionTargetSeedReport(env);

if (!report.seed) {
  const artifact = buildProductionTargetSeedArtifact(report, { envFiles: loaded, dryRun, upserted: false });
  if (!noWrite) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  }
  if (json) {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    console.log("Production target seed");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
    console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
    console.log(`Missing required env: ${report.missing.join(", ") || "none"}`);
    console.log("");
    console.log(
      "Set Supabase URL, anon key, service role key, a real Auth user id, a public record share image URL and a public mode share image URL before writing target rows.",
    );
  }
  process.exitCode = 1;
} else {
  let upserted = false;
  let authUser;
  let doctor;
  if (!dryRun && !report.ready) {
    console.log("Production target seed");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
    console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
    console.log(`Missing required env for Supabase write: ${report.missing.join(", ") || "none"}`);
    console.log("");
    console.log("Run with --dry-run to preview target rows without writing to Supabase.");
    process.exitCode = 1;
  } else if (!dryRun) {
    authUser = await verifyProductionTargetSeedAuthUser(env, report.seed.targets.userId);
    if (!authUser.ready) {
      const artifact = buildProductionTargetSeedArtifact(report, {
        envFiles: loaded,
        dryRun,
        upserted: false,
        authUser,
      });
      if (!noWrite) {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
      }
      if (json) {
        console.log(JSON.stringify(artifact, null, 2));
      } else {
        console.log("Production target seed");
        console.log(`Env files: ${loaded.join(", ") || "none"}`);
        if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
        console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
        console.log(`Auth user read-back failed: ${authUser.detail}`);
        if (authUser.url) console.log(`Auth URL: ${authUser.url}`);
        console.log("");
        console.log("Create/sign in the Supabase user first, then rerun seed:production-targets with KICKOFF_SEED_USER_ID set to that Auth user id.");
      }
      process.exitCode = 1;
      process.exit();
    }
    await upsertProductionTargetSeed(env, report.seed);
    upserted = true;
  }
  doctor = dryRun || !report.ready ? undefined : await buildSupabaseProductionDoctorReport({ ...env, ...parseEnvText(report.seed.verifyEnv) });
  const artifact = buildProductionTargetSeedArtifact(report, {
    envFiles: loaded,
    dryRun,
    upserted,
    authUser,
    doctor,
  });
  if (!noWrite) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  }
  if (json) {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    console.log("Production target seed");
    console.log(`Env files: ${loaded.join(", ") || "none"}`);
    if (!includeExample) console.log("Example env: ignored by default; pass --include-example to audit placeholders.");
    console.log(`Evidence: ${noWrite ? "not written (--no-write)" : outputPath}`);
    console.log(`Mode: ${dryRun ? "dry-run" : "upserted to Supabase"}`);
    if (uploadedShareImage) {
      console.log(`Record share image upload: ${uploadedShareImage.publicUrl}`);
    }
    if (uploadedModeShareImage) {
      console.log(`Mode share image upload: ${uploadedModeShareImage.publicUrl}`);
    }
    console.log("");
    console.log("Targets:");
    console.log(`  user/profile: ${report.seed.targets.userId}`);
    console.log(`  prediction proof: ${report.seed.targets.proofId}`);
    console.log(`  mode proof: ${report.seed.targets.modeId}`);
    console.log(`  mode proof set: ${report.seed.targets.modeIds.join(", ")}`);
    console.log(`  friend scope: ${report.seed.targets.friendCode}`);
    console.log(`  season scope: ${report.seed.targets.seasonKey}`);
    console.log(`  share image: ${report.seed.targets.shareImageUrl}`);
    console.log(`  mode share image: ${report.seed.targets.modeShareImageUrl}`);
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
