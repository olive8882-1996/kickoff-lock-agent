import { buildShareImageMetadata, type ShareImageMetadata } from "./shareImageTarget";
import { validatePublicShareImageResponse } from "./shareImageValidation";
import { deployedSupabaseProjectUrlProblem } from "./supabaseStorageUrl";

export type ShareImageUploadEnv = Record<string, string | undefined>;

export type ShareImageUploadTarget = {
  profileId: string;
  kind: "record" | "mode";
  artifactId: string;
  fileName: string;
  imageMime?: "image/png";
};

export type ShareImageUploadResult = {
  path: string;
  uploadUrl: string;
  publicUrl: string;
  imageMime: "image/png";
  imageByteLength: number;
  imageHash: string;
  publicReadBack: boolean;
};

export type ShareImageUploadReadBackCommand = {
  id: "public-image";
  label: string;
  url: string;
  command: string;
  ready: boolean;
  path: string;
  responseExpectation: {
    responseType: "image";
    contentType: "image/png";
    expectedImageHash: string;
    expectedByteLength: number;
    minByteLength: number;
    expectedPublicUrl: string;
    expectedStoragePath: string;
  };
};

export type ProductionShareImageUploadTargetOptions = {
  fileName: string;
  kind?: ShareImageUploadTarget["kind"];
  profileId?: string;
  artifactId?: string;
};

export type ShareImageUploadReport = {
  ready: boolean;
  missing: string[];
  localImage?: ShareImageMetadata;
  result?: ShareImageUploadResult;
};

export type ShareImageUploadArtifact = ShareImageUploadReport & {
  generatedAt: string;
  envFiles: string[];
  artifactVersion: 1;
  filePath: string;
  target: ShareImageUploadTarget;
  readBackCommands: ShareImageUploadReadBackCommand[];
  acceptance: {
    uploaded: boolean;
    publicReadBack: boolean;
    supabasePublicUrl: boolean;
    imageHashReady: boolean;
    localImageHashReady: boolean;
    localImageSizeReady: boolean;
    outputEnvKeys: string[];
  };
};

type FetchLike = typeof fetch;

const env = (values: ShareImageUploadEnv, key: string) => values[key]?.trim() ?? "";

const listEnv = (values: ShareImageUploadEnv, key: string) =>
  env(values, key).split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const storagePathPart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";

const baseUrl = (values: ShareImageUploadEnv) => env(values, "VITE_SUPABASE_URL").replace(/\/$/, "");

const shareBucket = (values: ShareImageUploadEnv) => env(values, "VITE_SUPABASE_SHARE_BUCKET") || "kickoff-share-cards";

const serviceRoleHeaders = (values: ShareImageUploadEnv, imageMime: string) => ({
  apikey: env(values, "SUPABASE_SERVICE_ROLE_KEY"),
  Authorization: `Bearer ${env(values, "SUPABASE_SERVICE_ROLE_KEY")}`,
  "Content-Type": imageMime,
  "x-upsert": "true",
});

export const supabaseShareImageStoragePath = (target: ShareImageUploadTarget) =>
  [
    storagePathPart(target.profileId),
    target.kind,
    storagePathPart(target.artifactId),
    storagePathPart(target.fileName),
  ].join("/");

export const productionShareImageUploadTarget = (
  values: ShareImageUploadEnv,
  {
    fileName,
    kind = "record",
    profileId,
    artifactId,
  }: ProductionShareImageUploadTargetOptions,
): ShareImageUploadTarget => ({
  profileId:
    profileId ||
    env(values, "KICKOFF_SEED_USER_ID") ||
    env(values, "KICKOFF_VERIFY_USER_ID") ||
    "kickoff-production-seed",
  kind,
  artifactId:
    artifactId ||
    (kind === "mode"
      ? env(values, "KICKOFF_SEED_MODE_ID") ||
        listEnv(values, "KICKOFF_SEED_MODE_IDS")[0] ||
        env(values, "KICKOFF_VERIFY_MODE_ID") ||
        listEnv(values, "KICKOFF_VERIFY_MODE_IDS")[0]
      : env(values, "KICKOFF_SEED_PROOF_ID") || env(values, "KICKOFF_VERIFY_PROOF_ID")) ||
    "production-target",
  fileName,
  imageMime: "image/png",
});

export const supabaseStorageUploadUrl = (values: ShareImageUploadEnv, path: string) =>
  `${baseUrl(values)}/storage/v1/object/${encodeURIComponent(shareBucket(values))}/${path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;

export const supabasePublicShareImageUrl = (values: ShareImageUploadEnv, path: string) =>
  `${baseUrl(values)}/storage/v1/object/public/${encodeURIComponent(shareBucket(values))}/${path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;

export const missingShareImageUploadEnv = (values: ShareImageUploadEnv) =>
  [
    deployedSupabaseProjectUrlProblem(env(values, "VITE_SUPABASE_URL")),
    env(values, "SUPABASE_SERVICE_ROLE_KEY") ? "" : "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

const verifyPublicImageReadBack = async (fetcher: FetchLike, publicUrl: string) => {
  const response = await fetcher(publicUrl, { method: "GET" });
  const validation = await validatePublicShareImageResponse(response);
  return validation.passed;
};

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

const shareImageReadBackCommands = (result: ShareImageUploadResult | undefined): ShareImageUploadReadBackCommand[] => {
  if (!result?.publicUrl) return [];
  return [
    {
      id: "public-image",
      label: "Public Supabase Storage share image",
      url: result.publicUrl,
      command: `curl -sS ${shellSingleQuote(result.publicUrl)} -o /tmp/kickoff-share-image-readback.png`,
      ready: result.publicReadBack,
      path: result.path,
      responseExpectation: {
        responseType: "image",
        contentType: result.imageMime,
        expectedImageHash: result.imageHash,
        expectedByteLength: result.imageByteLength,
        minByteLength: 10_000,
        expectedPublicUrl: result.publicUrl,
        expectedStoragePath: result.path,
      },
    },
  ];
};

export const uploadSupabaseShareImage = async (
  values: ShareImageUploadEnv,
  target: ShareImageUploadTarget,
  bytes: Uint8Array,
  fetcher: FetchLike = fetch,
): Promise<ShareImageUploadReport> => {
  const missing = missingShareImageUploadEnv(values);
  const localImage = await buildShareImageMetadata(bytes, target.imageMime ?? "image/png");
  if (bytes.byteLength <= 10_000) missing.push("share image bytes > 10000");
  if (missing.length > 0) return { ready: false, missing, localImage };

  const imageMime = target.imageMime ?? "image/png";
  const path = supabaseShareImageStoragePath(target);
  const uploadUrl = supabaseStorageUploadUrl(values, path);
  const publicUrl = supabasePublicShareImageUrl(values, path);
  const uploadBody = Uint8Array.from(bytes).buffer;
  const upload = await fetcher(uploadUrl, {
    method: "POST",
    headers: serviceRoleHeaders(values, imageMime),
    body: uploadBody,
  });
  if (!upload.ok) {
    return { ready: false, missing: [`Supabase Storage upload HTTP ${upload.status}`], localImage };
  }

  const publicReadBack = await verifyPublicImageReadBack(fetcher, publicUrl);
  return {
    ready: publicReadBack,
    missing: publicReadBack ? [] : ["public Supabase Storage image read-back"],
    localImage,
    result: {
      path,
      uploadUrl,
      publicUrl,
      publicReadBack,
      ...localImage,
    },
  };
};

export const buildShareImageUploadArtifact = (
  report: ShareImageUploadReport,
  options: {
    envFiles?: string[];
    generatedAt?: string;
    filePath: string;
    target: ShareImageUploadTarget;
  },
): ShareImageUploadArtifact => {
  const outputEnvKeys =
    options.target.kind === "mode"
      ? ["KICKOFF_SEED_MODE_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"]
      : ["KICKOFF_SEED_SHARE_IMAGE_URL", "KICKOFF_VERIFY_SHARE_IMAGE_URL"];
  const imageHash = report.result?.imageHash ?? report.localImage?.imageHash;
  const imageByteLength = report.result?.imageByteLength ?? report.localImage?.imageByteLength ?? 0;
  const acceptance = {
    uploaded: Boolean(report.result?.uploadUrl),
    publicReadBack: Boolean(report.result?.publicReadBack),
    supabasePublicUrl: Boolean(report.result?.publicUrl.includes("/storage/v1/object/public/")),
    imageHashReady: Boolean(imageHash && /^[a-f0-9]{64}$/.test(imageHash)),
    localImageHashReady: Boolean(report.localImage?.imageHash && /^[a-f0-9]{64}$/.test(report.localImage.imageHash)),
    localImageSizeReady: imageByteLength > 10_000,
    outputEnvKeys,
  };
  const ready =
    report.ready &&
    acceptance.uploaded &&
    acceptance.publicReadBack &&
    acceptance.supabasePublicUrl &&
    acceptance.imageHashReady;
  return {
    ...report,
    ready,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    envFiles: options.envFiles ?? [],
    artifactVersion: 1,
    filePath: options.filePath,
    target: options.target,
    readBackCommands: shareImageReadBackCommands(report.result),
    acceptance,
  };
};
