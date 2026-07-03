import { buildShareImageMetadata } from "./shareImageTarget";

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

export type ProductionShareImageUploadTargetOptions = {
  fileName: string;
  kind?: ShareImageUploadTarget["kind"];
  profileId?: string;
  artifactId?: string;
};

export type ShareImageUploadReport = {
  ready: boolean;
  missing: string[];
  result?: ShareImageUploadResult;
};

type FetchLike = typeof fetch;

const env = (values: ShareImageUploadEnv, key: string) => values[key]?.trim() ?? "";

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
      ? env(values, "KICKOFF_SEED_MODE_ID") || env(values, "KICKOFF_VERIFY_MODE_ID")
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
    env(values, "VITE_SUPABASE_URL") ? "" : "VITE_SUPABASE_URL",
    env(values, "SUPABASE_SERVICE_ROLE_KEY") ? "" : "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

const verifyPublicImageReadBack = async (fetcher: FetchLike, publicUrl: string) => {
  const response = await fetcher(publicUrl, { method: "GET" });
  const contentType = response.headers.get("content-type") ?? "";
  return response.ok && contentType.startsWith("image/");
};

export const uploadSupabaseShareImage = async (
  values: ShareImageUploadEnv,
  target: ShareImageUploadTarget,
  bytes: Uint8Array,
  fetcher: FetchLike = fetch,
): Promise<ShareImageUploadReport> => {
  const missing = missingShareImageUploadEnv(values);
  if (bytes.byteLength <= 10_000) missing.push("share image bytes > 10000");
  if (missing.length > 0) return { ready: false, missing };

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
    return { ready: false, missing: [`Supabase Storage upload HTTP ${upload.status}`] };
  }

  const metadata = await buildShareImageMetadata(bytes, imageMime);
  const publicReadBack = await verifyPublicImageReadBack(fetcher, publicUrl);
  return {
    ready: publicReadBack,
    missing: publicReadBack ? [] : ["public Supabase Storage image read-back"],
    result: {
      path,
      uploadUrl,
      publicUrl,
      publicReadBack,
      ...metadata,
    },
  };
};
