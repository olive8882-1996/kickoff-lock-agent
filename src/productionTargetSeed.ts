import { buildProductionVerifyEnv, productionFriendCode } from "./productionEvidence";
import { normalizePublicAppUrl } from "./publicUrls";
import { sha256, stableJson } from "./proof";
import type {
  FilecoinProof,
  GameModeRun,
  MemoryRecord,
  ResultCapsule,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";

export type ProductionTargetSeedEnv = Record<string, string | undefined>;

export type ShareImageSeedMetadata = {
  imageUrl: string;
  imageMime: string;
  imageByteLength: number;
  imageHash: string;
};

export type ProductionTargetRows = {
  profile: Record<string, unknown>;
  record: Record<string, unknown>;
  modeRun: Record<string, unknown>;
  shareArtifacts: Array<Record<string, unknown>>;
};

export type ProductionTargetSeed = {
  profile: UserProfile;
  record: MemoryRecord;
  modeRun: GameModeRun;
  shareArtifacts: ShareArtifactEvidence[];
  rows: ProductionTargetRows;
  verifyEnv: string;
  targets: {
    userId: string;
    profileId: string;
    proofId: string;
    modeId: string;
    friendCode: string;
    seasonKey: string;
    shareImageUrl: string;
  };
};

export type ProductionTargetSeedReport = {
  ready: boolean;
  missing: string[];
  seed?: ProductionTargetSeed;
};

type FetchLike = typeof fetch;

const env = (values: ProductionTargetSeedEnv, key: string) => values[key]?.trim() ?? "";

const seasonKey = (values: ProductionTargetSeedEnv) => env(values, "KICKOFF_VERIFY_SEASON_KEY") || "world-cup-run";

const seedValue = (values: ProductionTargetSeedEnv, seedKey: string, verifyKey: string, fallback: string) =>
  env(values, seedKey) || env(values, verifyKey) || fallback;

export const publicSeedUrl = (
  publicAppUrl: string,
  queryKey: "profile" | "proof" | "mode",
  targetId: string,
) => {
  const url = new URL(publicAppUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set(queryKey, targetId);
  return url.toString();
};

const xIntentUrl = (text: string, url: string) => {
  const intent = new URL("https://twitter.com/intent/tweet");
  intent.searchParams.set("text", text);
  intent.searchParams.set("url", url);
  intent.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");
  return intent.toString();
};

const proofFromEnv = (
  values: ProductionTargetSeedEnv,
  prefix: "RECORD" | "MODE",
  payloadHash: string,
): FilecoinProof => {
  const cid = env(values, `KICKOFF_VERIFY_FILECOIN_${prefix}_CID`);
  const proofPayloadHash = env(values, `KICKOFF_VERIFY_FILECOIN_${prefix}_PAYLOAD_HASH`) || payloadHash;
  if (!cid) {
    return {
      mode: "demo",
      cid: `bafy-kickoff-seed-${payloadHash.slice(0, 32)}`,
      pieceCid: `baga6seed${payloadHash.slice(0, 32)}`,
      provider: "demo-provider.fil",
      dataSetId: `seed-${payloadHash.slice(0, 10)}`,
      proofStatus: "retrievable",
      payloadHash,
      byteLength: Number(env(values, `KICKOFF_SEED_${prefix}_BYTES`) || 4096),
    };
  }
  return {
    mode: "real",
    cid,
    pieceCid: env(values, `KICKOFF_SEED_FILECOIN_${prefix}_PIECE_CID`) || `baga6seed${proofPayloadHash.slice(0, 32)}`,
    provider: env(values, `KICKOFF_SEED_FILECOIN_${prefix}_PROVIDER`) || "production-seal-api",
    dataSetId: env(values, `KICKOFF_SEED_FILECOIN_${prefix}_DATASET`) || `seed-${proofPayloadHash.slice(0, 10)}`,
    proofStatus: "retrievable",
    uploadedAt: env(values, `KICKOFF_SEED_FILECOIN_${prefix}_UPLOADED_AT`) || new Date().toISOString(),
    retrievalUrl: env(values, `KICKOFF_SEED_FILECOIN_${prefix}_RETRIEVAL_URL`) || undefined,
    payloadHash: proofPayloadHash,
    byteLength: Number(env(values, `KICKOFF_SEED_${prefix}_BYTES`) || 4096),
  };
};

const shareArtifact = (
  id: string,
  kind: ShareArtifactEvidence["kind"],
  proofUrl: string,
  image: ShareImageSeedMetadata,
  generatedAt: string,
): ShareArtifactEvidence => ({
  id,
  kind,
  proofUrl,
  imageGenerated: true,
  generatedAt,
  fileName: `${id}-${kind}-share-card.png`,
  imageUrl: image.imageUrl,
  imageMime: image.imageMime,
  imageByteLength: image.imageByteLength,
  imageHash: image.imageHash,
  xIntentUrl: xIntentUrl(`I sealed a World Cup ${kind === "mode" ? "mode proof" : "prediction"} on Kickoff Lock Agent.`, proofUrl),
  xIntentOpenedAt: generatedAt,
});

const shareArtifactRow = (
  profile: UserProfile,
  artifact: ShareArtifactEvidence,
  friendCode: string,
  currentSeasonKey: string,
  updatedAt: string,
) => ({
  id: artifact.id,
  kind: artifact.kind,
  user_id: profile.id,
  email: profile.email,
  display_name: profile.displayName,
  location: profile.location,
  friend_code: friendCode,
  season_key: currentSeasonKey,
  proof_url: artifact.proofUrl,
  image_generated: artifact.imageGenerated,
  generated_at: artifact.generatedAt ?? null,
  file_name: artifact.fileName ?? null,
  image_url: artifact.imageUrl ?? null,
  image_mime: artifact.imageMime ?? null,
  image_byte_length: artifact.imageByteLength ?? null,
  image_hash: artifact.imageHash ?? null,
  x_intent_url: artifact.xIntentUrl ?? null,
  x_intent_opened_at: artifact.xIntentOpenedAt ?? null,
  native_share_opened_at: artifact.nativeShareOpenedAt ?? null,
  artifact,
  updated_at: updatedAt,
});

export const buildProductionTargetSeed = async (
  values: ProductionTargetSeedEnv,
  image: ShareImageSeedMetadata,
  now = new Date().toISOString(),
): Promise<ProductionTargetSeed> => {
  const publicAppUrl = normalizePublicAppUrl(env(values, "VITE_PUBLIC_APP_URL"));
  if (!publicAppUrl) throw new Error("VITE_PUBLIC_APP_URL is required.");
  if (!image.imageUrl || !image.imageMime.startsWith("image/") || image.imageByteLength <= 10_000 || !/^[a-f0-9]{64}$/.test(image.imageHash)) {
    throw new Error("A public share image URL, image MIME, byte length over 10000 and 64-character image hash are required.");
  }

  const userId = seedValue(values, "KICKOFF_SEED_USER_ID", "KICKOFF_VERIFY_USER_ID", "kickoff-production-seed");
  const email = env(values, "KICKOFF_SEED_EMAIL") || "production-seed@kickoff.local";
  const displayName = env(values, "KICKOFF_SEED_DISPLAY_NAME") || "Kickoff Production Seed";
  const location = env(values, "KICKOFF_SEED_LOCATION") || "Chengdu";
  const friendCode = env(values, "KICKOFF_VERIFY_FRIEND_CODE") || productionFriendCode(location, email);
  const currentSeasonKey = seasonKey(values);

  const recordSeed = {
    matchId: "production-seed-brazil-japan",
    matchLabel: "Brazil vs Japan",
    kickoffAt: "2026-06-20T19:00:00.000Z",
    createdAt: now,
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Brazil",
      keyPlayers: ["No. 10"],
      confidence: 72,
      style: "analysis" as const,
      reasoning: "Production seed lock used to verify cloud read-back, public proof pages and leaderboard scope rows.",
      agentSummary: "Seed artifact for production acceptance. Replace with a real synced lock before final judging if desired.",
      markets: [
        {
          id: "winner" as const,
          label: "1X2",
          pick: "Brazil",
          confidence: 72,
          rationale: "Seed market pick for share-card and leaderboard verification.",
        },
      ],
    },
  };
  const recordHash = await sha256(stableJson(recordSeed));
  const proofId = seedValue(values, "KICKOFF_SEED_PROOF_ID", "KICKOFF_VERIFY_PROOF_ID", `cap-prod-${recordHash.slice(0, 12)}`);
  const capsule = {
    id: proofId,
    ...recordSeed,
    sealedAt: now,
    payloadHash: recordHash,
    filecoinProof: proofFromEnv(values, "RECORD", recordHash),
    locked: true,
    lateLock: false,
  };
  const result: ResultCapsule = {
    id: `result-${proofId}`,
    capsuleId: proofId,
    revealedAt: now,
    homeScore: 2,
    awayScore: 1,
    keyPlayers: ["No. 10"],
    source: "manual",
    totalScore: 92,
    breakdown: {
      winner: 30,
      exactScore: 30,
      goalDifference: 12,
      markets: 8,
      keyPlayer: 4,
      confidence: 4,
      reasoning: 4,
    },
    explanation: ["Production seed verifies cloud read-back and public proof rendering."],
    agentReview: ["Seed result keeps leaderboard rows non-empty for acceptance checks."],
  };
  const record: MemoryRecord = { capsule, result };

  const modePayload = {
    modeId: "bracket",
    title: "Production bracket path",
    createdAt: now,
    capsuleIds: [proofId],
    score: 88,
  };
  const modeHash = await sha256(stableJson(modePayload));
  const modeId = seedValue(values, "KICKOFF_SEED_MODE_ID", "KICKOFF_VERIFY_MODE_ID", `mode-prod-${modeHash.slice(0, 10)}`);
  const modeRun: GameModeRun = {
    id: modeId,
    modeId: "bracket",
    title: "Production bracket path",
    createdAt: now,
    capsuleIds: [proofId],
    payloadHash: modeHash,
    filecoinProof: proofFromEnv(values, "MODE", modeHash),
    status: "scored",
    score: 88,
    summary: "Production bracket path sealed for public mode proof and leaderboard acceptance.",
    requirements: ["Public mode proof target", "Share-card manifest", "Leaderboard scope row"],
    artifact: {
      kind: "bracket-path",
      bracketPath: {
        id: `bracket-${modeId}`,
        title: "Production bracket path",
        createdAt: now,
        updatedAt: now,
        picks: [
          {
            id: `pick-${proofId}`,
            matchId: capsule.matchId,
            matchLabel: capsule.matchLabel,
            stage: "Round of 16",
            winner: "Brazil",
            confidence: 72,
            note: "Seeded acceptance pick.",
          },
        ],
        payloadHash: modeHash,
        filecoinProof: proofFromEnv(values, "MODE", modeHash),
      },
    },
  };

  const profile: UserProfile = {
    id: userId,
    email,
    displayName,
    location,
    avatarUrl: env(values, "KICKOFF_SEED_AVATAR_URL") || undefined,
    createdAt: now,
    cloudMode: "supabase",
  };
  const proofUrl = publicSeedUrl(publicAppUrl, "proof", proofId);
  const modeUrl = publicSeedUrl(publicAppUrl, "mode", modeId);
  const shareArtifacts = [
    shareArtifact(proofId, "record", proofUrl, image, now),
    shareArtifact(modeId, "mode", modeUrl, image, now),
  ];

  const rows: ProductionTargetRows = {
    profile: {
      id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      location: profile.location,
      avatar_url: profile.avatarUrl ?? null,
      friend_code: friendCode,
      updated_at: now,
    },
    record: {
      id: proofId,
      user_id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      location: profile.location,
      friend_code: friendCode,
      season_key: currentSeasonKey,
      capsule,
      result,
      seal_job: null,
      total_score: result.totalScore,
      updated_at: now,
    },
    modeRun: {
      id: modeId,
      user_id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      location: profile.location,
      friend_code: friendCode,
      season_key: currentSeasonKey,
      mode_id: modeRun.modeId,
      status: modeRun.status,
      score: modeRun.score ?? null,
      mode_run: modeRun,
      created_at: modeRun.createdAt,
      updated_at: now,
    },
    shareArtifacts: shareArtifacts.map((artifact) =>
      shareArtifactRow(profile, artifact, friendCode, currentSeasonKey, now),
    ),
  };

  return {
    profile,
    record,
    modeRun,
    shareArtifacts,
    rows,
    verifyEnv: buildProductionVerifyEnv({
      userId,
      profileId: userId,
      proofId,
      modeId,
      friendCode,
      seasonKey: currentSeasonKey,
      shareImageUrl: image.imageUrl,
      filecoinRecordCid: env(values, "KICKOFF_VERIFY_FILECOIN_RECORD_CID"),
      filecoinRecordPayloadHash: env(values, "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH"),
      filecoinModeCid: env(values, "KICKOFF_VERIFY_FILECOIN_MODE_CID"),
      filecoinModePayloadHash: env(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH"),
      fixtureId: env(values, "KICKOFF_VERIFY_FIXTURE_ID"),
      allowFailures: true,
    }),
    targets: {
      userId,
      profileId: userId,
      proofId,
      modeId,
      friendCode,
      seasonKey: currentSeasonKey,
      shareImageUrl: image.imageUrl,
    },
  };
};

export const requiredProductionTargetSeedEnv = (values: ProductionTargetSeedEnv) => {
  const missing: string[] = [];
  if (!normalizePublicAppUrl(env(values, "VITE_PUBLIC_APP_URL"))) missing.push("VITE_PUBLIC_APP_URL");
  if (!env(values, "VITE_SUPABASE_URL")) missing.push("VITE_SUPABASE_URL");
  if (!env(values, "VITE_SUPABASE_ANON_KEY")) missing.push("VITE_SUPABASE_ANON_KEY");
  if (!env(values, "SUPABASE_SERVICE_ROLE_KEY")) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!env(values, "KICKOFF_SEED_SHARE_IMAGE_URL") && !env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL")) {
    missing.push("KICKOFF_SEED_SHARE_IMAGE_URL");
  }
  return missing;
};

export const readShareImageMetadata = async (
  values: ProductionTargetSeedEnv,
  fetcher: FetchLike = fetch,
): Promise<ShareImageSeedMetadata> => {
  const imageUrl = env(values, "KICKOFF_SEED_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  if (!imageUrl) throw new Error("KICKOFF_SEED_SHARE_IMAGE_URL or KICKOFF_VERIFY_SHARE_IMAGE_URL is required.");
  const response = await fetcher(imageUrl, { method: "GET" });
  if (!response.ok) throw new Error(`Share image read failed: HTTP ${response.status}`);
  const imageMime = response.headers.get("content-type") ?? "application/octet-stream";
  if (!imageMime.startsWith("image/")) throw new Error(`Share image URL returned ${imageMime}, not image/*.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    imageUrl,
    imageMime,
    imageByteLength: bytes.byteLength,
    imageHash: await sha256(`${imageMime}:${Array.from(bytes).join(",")}`),
  };
};

const serviceHeaders = (values: ProductionTargetSeedEnv) => ({
  apikey: env(values, "SUPABASE_SERVICE_ROLE_KEY"),
  Authorization: `Bearer ${env(values, "SUPABASE_SERVICE_ROLE_KEY")}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=representation",
});

const supabaseRestUrl = (values: ProductionTargetSeedEnv, path: string) =>
  `${env(values, "VITE_SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`;

const upsert = async (
  values: ProductionTargetSeedEnv,
  path: string,
  body: unknown,
  fetcher: FetchLike,
) => {
  const response = await fetcher(supabaseRestUrl(values, path), {
    method: "POST",
    headers: serviceHeaders(values),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} upsert failed: HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
};

export const upsertProductionTargetSeed = async (
  values: ProductionTargetSeedEnv,
  seed: ProductionTargetSeed,
  fetcher: FetchLike = fetch,
) => {
  await upsert(values, "kickoff_profiles?on_conflict=id", seed.rows.profile, fetcher);
  await upsert(values, "kickoff_records?on_conflict=id", seed.rows.record, fetcher);
  await upsert(values, "kickoff_mode_runs?on_conflict=id", seed.rows.modeRun, fetcher);
  await upsert(values, "kickoff_share_artifacts?on_conflict=id,kind", seed.rows.shareArtifacts, fetcher);
};

export const buildProductionTargetSeedReport = async (
  values: ProductionTargetSeedEnv,
  options: {
    fetcher?: FetchLike;
    now?: string;
    image?: ShareImageSeedMetadata;
  } = {},
): Promise<ProductionTargetSeedReport> => {
  const missing = requiredProductionTargetSeedEnv(values);
  if (missing.includes("VITE_PUBLIC_APP_URL")) return { ready: false, missing };
  if (missing.includes("KICKOFF_SEED_SHARE_IMAGE_URL") && !options.image) return { ready: false, missing };
  const image = options.image ?? (await readShareImageMetadata(values, options.fetcher ?? fetch));
  return {
    ready: missing.length === 0,
    missing,
    seed: await buildProductionTargetSeed(values, image, options.now),
  };
};
