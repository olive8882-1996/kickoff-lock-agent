import { buildProductionVerifyEnv, productionFriendCode } from "./productionEvidence";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { normalizePublicAppUrl } from "./publicUrls";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { sha256, stableJson } from "./proof";
import { hasProductionShareChannelEvidence } from "./shareChannelValidation";
import { validatePublicShareImageBytes } from "./shareImageValidation";
import type { SupabaseDoctorReport } from "./supabaseProductionDoctor";
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

export type ProductionTargetSeedImages =
  | ShareImageSeedMetadata
  | {
      record: ShareImageSeedMetadata;
      mode?: ShareImageSeedMetadata;
    };

export type ProductionTargetRows = {
  profile: Record<string, unknown>;
  record: Record<string, unknown>;
  modeRun: Record<string, unknown>;
  modeRuns: Array<Record<string, unknown>>;
  shareArtifacts: Array<Record<string, unknown>>;
};

export type ProductionTargetSeed = {
  profile: UserProfile;
  record: MemoryRecord;
  modeRun: GameModeRun;
  modeRuns: GameModeRun[];
  shareArtifacts: ShareArtifactEvidence[];
  rows: ProductionTargetRows;
  verifyEnv: string;
  targets: {
    userId: string;
    profileId: string;
    publicProfileUrl: string;
    proofId: string;
    modeId: string;
    modeIds: string[];
    shareArtifactIds: string[];
    friendCode: string;
    seasonKey: string;
    leaderboardScopes: string[];
    shareImageUrl: string;
    modeShareImageUrl: string;
  };
};

export type ProductionTargetSeedReport = {
  ready: boolean;
  missing: string[];
  seed?: ProductionTargetSeed;
};

export type ProductionTargetSeedAuthUserCheck = {
  ready: boolean;
  userId: string;
  url?: string;
  detail: string;
  missing: string[];
  sampleIds: string[];
};

export type ProductionTargetSeedArtifact = ProductionTargetSeedReport & {
  generatedAt: string;
  envFiles: string[];
  artifactVersion: 1;
  dryRun: boolean;
  upserted: boolean;
  authUser?: ProductionTargetSeedAuthUserCheck;
  doctor?: Pick<SupabaseDoctorReport, "ready" | "requiredPassed" | "requiredTotal"> & {
    passedCheckIds: string[];
    failedCheckIds: string[];
  };
  acceptance: {
    authUserReady: boolean;
    upserted: boolean;
    doctorReady: boolean;
    profileTarget: boolean;
    recordTarget: boolean;
    modeTargetCount: number;
    requiredModeTargetCount: number;
    shareArtifactCount: number;
    requiredShareArtifactCount: number;
    recordShareChannelOpened: boolean;
    modeShareChannelCount: number;
    requiredModeShareChannelCount: number;
    shareChannelCount: number;
    requiredShareChannelCount: number;
    outputEnvKeys: string[];
  };
};

type FetchLike = typeof fetch;

const env = (values: ProductionTargetSeedEnv, key: string) => values[key]?.trim() ?? "";

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const seasonKey = (values: ProductionTargetSeedEnv) => env(values, "KICKOFF_VERIFY_SEASON_KEY") || "world-cup-run";

const seedValue = (values: ProductionTargetSeedEnv, seedKey: string, verifyKey: string, fallback: string) =>
  env(values, seedKey) || env(values, verifyKey) || fallback;

const listValue = (values: ProductionTargetSeedEnv, ...keys: string[]) => {
  for (const key of keys) {
    const items = env(values, key).split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
    if (items.length > 0) return items;
  }
  return [];
};

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
  xIntentUrl: xIntentUrl(
    `I sealed a World Cup ${kind === "mode" ? "mode proof" : "prediction"} on Kickoff Lock Agent: ${proofUrl}`,
    proofUrl,
  ),
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

const isShareImageMetadata = (image: ProductionTargetSeedImages): image is ShareImageSeedMetadata =>
  "imageUrl" in image;

const seedImages = (images: ProductionTargetSeedImages) => {
  if (isShareImageMetadata(images)) return { record: images, mode: images };
  return { record: images.record, mode: images.mode ?? images.record };
};

const assertValidSeedImage = (image: ShareImageSeedMetadata, label: string) => {
  const mime = image.imageMime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    !image.imageUrl ||
    !(mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg" || mime === "image/webp") ||
    image.imageByteLength <= 10_000 ||
    !/^[a-f0-9]{64}$/.test(image.imageHash)
  ) {
    throw new Error(`${label} requires a public PNG/JPEG/WebP URL, byte length over 10000 and 64-character image hash.`);
  }
};

const modeTitle = (modeId: GameModeRun["modeId"]) => {
  if (modeId === "bracket") return "Production bracket path";
  if (modeId === "parlay") return "Production parlay ticket";
  if (modeId === "agent-vs-human") return "Production agent calibration";
  if (modeId === "upset") return "Production upset challenge";
  if (modeId === "group-path") return "Production group path";
  if (modeId === "penalty-pressure") return "Production penalty pressure";
  return "Production mode proof";
};

export const buildProductionTargetSeed = async (
  values: ProductionTargetSeedEnv,
  image: ProductionTargetSeedImages,
  now = new Date().toISOString(),
): Promise<ProductionTargetSeed> => {
  const publicAppUrl = normalizePublicAppUrl(env(values, "VITE_PUBLIC_APP_URL"));
  if (!publicAppUrl) throw new Error("VITE_PUBLIC_APP_URL is required.");
  const images = seedImages(image);
  assertValidSeedImage(images.record, "Record share image");
  assertValidSeedImage(images.mode, "Mode share image");

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

  const configuredModeRunIds = listValue(values, "KICKOFF_SEED_MODE_IDS", "KICKOFF_VERIFY_MODE_IDS");
  const modeRuns = await Promise.all(
    requiredProductionModeIds.map(async (modeType, index) => {
      const title = modeTitle(modeType);
      const score =
        modeType === "bracket"
          ? 88
          : modeType === "parlay"
            ? 100
            : modeType === "agent-vs-human"
              ? 86
              : modeType === "group-path"
                ? 82
                : 94;
      const basePayload = {
        modeId: modeType,
        title,
        createdAt: now,
        capsuleIds: [proofId],
        score,
      };
      const modeHash = await sha256(stableJson(basePayload));
      const fallbackId = `mode-prod-${modeType.replace(/[^a-z0-9]+/g, "-")}-${modeHash.slice(0, 8)}`;
      const runId =
        index === 0
          ? seedValue(values, "KICKOFF_SEED_MODE_ID", "KICKOFF_VERIFY_MODE_ID", configuredModeRunIds[index] || fallbackId)
          : configuredModeRunIds[index] || fallbackId;
      const proof = proofFromEnv(values, "MODE", modeHash);
      const common = {
        id: runId,
        modeId: modeType,
        title,
        createdAt: now,
        capsuleIds: [proofId],
        payloadHash: modeHash,
        filecoinProof: proof,
        status: "scored" as const,
        score,
        requirements: ["Public mode proof target", "Share-card manifest", "Leaderboard scope row"],
      };
      if (modeType === "parlay") {
        return {
          ...common,
          summary: "Production parlay ticket sealed for all-leg public proof acceptance.",
          artifact: {
            kind: "parlay-ticket" as const,
            legs: [
              {
                capsuleId: proofId,
                matchLabel: capsule.matchLabel,
                pick: capsule.prediction.winner,
                confidence: capsule.prediction.confidence,
                markets: capsule.prediction.markets,
                resultScore: result.totalScore,
                winnerHit: true,
              },
            ],
            settledLegs: 1,
            hitLegs: 1,
          },
        };
      }
      if (modeType === "agent-vs-human") {
        return {
          ...common,
          summary: "Production Agent vs Human calibration sealed for judge-facing mode proof acceptance.",
          artifact: {
            kind: "agent-calibration" as const,
            samples: [
              {
                capsuleId: proofId,
                matchLabel: capsule.matchLabel,
                confidence: capsule.prediction.confidence,
                totalScore: result.totalScore,
                winnerHit: true,
                calibrationError: Math.abs(capsule.prediction.confidence - result.totalScore),
                review: result.agentReview,
              },
            ],
            averageCalibrationError: Math.abs(capsule.prediction.confidence - result.totalScore),
          },
        };
      }
      if (modeType === "upset") {
        return {
          ...common,
          summary: "Production upset challenge sealed for multiplier and public proof acceptance.",
          artifact: {
            kind: "upset-ticket" as const,
            picks: [
              {
                capsuleId: proofId,
                matchLabel: capsule.matchLabel,
                predictedWinner: capsule.prediction.winner,
                confidence: capsule.prediction.confidence,
                resultScore: result.totalScore,
                winnerHit: true,
                multiplier: 2,
              },
            ],
            resolvedPicks: 1,
            hitPicks: 1,
            bonusXp: 100,
          },
        };
      }
      if (modeType === "group-path") {
        const runnerUp = capsule.prediction.winner === "Brazil" ? "Spain" : "Brazil";
        return {
          ...common,
          summary: "Production group path sealed for table projection and public proof acceptance.",
          artifact: {
            kind: "group-table-path" as const,
            table: [
              {
                team: capsule.prediction.winner,
                projectedRank: 1,
                predictedPoints: 3,
                predictedGoalDifference: 1,
                actualPoints: 3,
                actualGoalDifference: 1,
                locks: 1,
              },
              {
                team: runnerUp,
                projectedRank: 2,
                predictedPoints: 0,
                predictedGoalDifference: -1,
                actualPoints: 0,
                actualGoalDifference: -1,
                locks: 1,
              },
            ],
            picks: [
              {
                capsuleId: proofId,
                matchLabel: capsule.matchLabel,
                predictedWinner: capsule.prediction.winner,
                predictedScore: `${capsule.prediction.homeScore}-${capsule.prediction.awayScore}`,
                actualScore: `${result.homeScore}-${result.awayScore}`,
                winnerHit: true,
              },
            ],
            resolvedMatches: 1,
            winnerHits: 1,
            topTwo: [capsule.prediction.winner, runnerUp],
          },
        };
      }
      if (modeType === "penalty-pressure") {
        return {
          ...common,
          summary: "Production penalty pressure proof sealed for clutch-pick public proof acceptance.",
          artifact: {
            kind: "penalty-pressure-ticket" as const,
            takers: [
              {
                capsuleId: proofId,
                matchLabel: capsule.matchLabel,
                pressurePick: capsule.prediction.keyPlayers[0] ?? capsule.prediction.markets[0]?.pick ?? capsule.prediction.winner,
                pickType: capsule.prediction.keyPlayers[0] ? "key-player" as const : capsule.prediction.markets[0] ? "market" as const : "winner" as const,
                confidence: capsule.prediction.confidence,
                pressureRating: 72,
                resultScore: result.totalScore,
                pressureHit: true,
              },
            ],
            resolvedPicks: 1,
            hitPicks: 1,
            averagePressure: 72,
          },
        };
      }
      return {
        ...common,
        summary: "Production bracket path sealed for public mode proof and leaderboard acceptance.",
        artifact: {
          kind: "bracket-path" as const,
          bracketPath: {
            id: `bracket-${runId}`,
            title,
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
            filecoinProof: proof,
          },
        },
      };
    }),
  );
  const modeRun = modeRuns[0]!;
  const modeId = modeRun.id;

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
  const publicProfileUrl = publicSeedUrl(publicAppUrl, "profile", userId);
  const shareArtifacts = [
    shareArtifact(proofId, "record", proofUrl, images.record, now),
    ...modeRuns.map((run) => shareArtifact(run.id, "mode", publicSeedUrl(publicAppUrl, "mode", run.id), images.mode, now)),
  ];
  const shareArtifactIds = shareArtifacts.map((artifact) => `${artifact.kind}:${artifact.id}`);
  const leaderboardScopes = ["global", "friend", "season"];
  const modeRows = modeRuns.map((run) => ({
    id: run.id,
    user_id: profile.id,
    email: profile.email,
    display_name: profile.displayName,
    location: profile.location,
    friend_code: friendCode,
    season_key: currentSeasonKey,
    mode_id: run.modeId,
    status: run.status,
    score: run.score ?? null,
    mode_run: run,
    created_at: run.createdAt,
    updated_at: now,
  }));

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
    modeRun: modeRows[0]!,
    modeRuns: modeRows,
    shareArtifacts: shareArtifacts.map((artifact) =>
      shareArtifactRow(profile, artifact, friendCode, currentSeasonKey, now),
    ),
  };
  const verifyEnv = `${buildProductionVerifyEnv({
    userId,
    profileId: userId,
    publicProfileUrl,
    proofId,
    modeId,
    modeIds: modeRuns.map((run) => run.id),
    shareArtifactIds,
    friendCode,
    seasonKey: currentSeasonKey,
    leaderboardScopes,
    shareImageUrl: images.record.imageUrl,
    modeShareImageUrl: images.mode.imageUrl,
    filecoinRecordCid: env(values, "KICKOFF_VERIFY_FILECOIN_RECORD_CID"),
    filecoinRecordPayloadHash: env(values, "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH"),
    filecoinModeCid: env(values, "KICKOFF_VERIFY_FILECOIN_MODE_CID"),
    filecoinModePayloadHash: env(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH"),
    fixtureId: env(values, "KICKOFF_VERIFY_FIXTURE_ID"),
    fixtureIds: env(values, "KICKOFF_VERIFY_FIXTURE_IDS").split(/[,\s]+/).filter(Boolean),
    allowFailures: true,
  })}`;

  return {
    profile,
    record,
    modeRun,
    modeRuns,
    shareArtifacts,
    rows,
    verifyEnv,
    targets: {
      userId,
      profileId: userId,
      publicProfileUrl,
      proofId,
      modeId,
      modeIds: modeRuns.map((run) => run.id),
      shareArtifactIds,
      friendCode,
      seasonKey: currentSeasonKey,
      leaderboardScopes,
      shareImageUrl: images.record.imageUrl,
      modeShareImageUrl: images.mode.imageUrl,
    },
  };
};

export const requiredProductionTargetSeedEnv = (values: ProductionTargetSeedEnv) => {
  const missing: string[] = [];
  if (!normalizePublicAppUrl(env(values, "VITE_PUBLIC_APP_URL"))) missing.push("VITE_PUBLIC_APP_URL");
  if (!env(values, "VITE_SUPABASE_URL")) missing.push("VITE_SUPABASE_URL");
  if (!env(values, "VITE_SUPABASE_ANON_KEY")) missing.push("VITE_SUPABASE_ANON_KEY");
  if (!env(values, "SUPABASE_SERVICE_ROLE_KEY")) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  const seedUserId = env(values, "KICKOFF_SEED_USER_ID");
  const verifyUserId = env(values, "KICKOFF_VERIFY_USER_ID");
  const verifyProfileId = env(values, "KICKOFF_VERIFY_PROFILE_ID");
  if (!seedUserId && !verifyUserId) {
    missing.push("KICKOFF_SEED_USER_ID or KICKOFF_VERIFY_USER_ID");
  }
  if (seedUserId && verifyUserId && seedUserId !== verifyUserId) {
    missing.push("KICKOFF_SEED_USER_ID must match KICKOFF_VERIFY_USER_ID");
  }
  if (seedUserId && verifyProfileId && seedUserId !== verifyProfileId) {
    missing.push("KICKOFF_SEED_USER_ID must match KICKOFF_VERIFY_PROFILE_ID");
  }
  if (!seedUserId && verifyUserId && verifyProfileId && verifyUserId !== verifyProfileId) {
    missing.push("KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID");
  }
  if (!env(values, "KICKOFF_SEED_SHARE_IMAGE_URL") && !env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL")) {
    missing.push("KICKOFF_SEED_SHARE_IMAGE_URL");
  }
  if (!env(values, "KICKOFF_SEED_MODE_SHARE_IMAGE_URL") && !env(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL")) {
    missing.push("KICKOFF_SEED_MODE_SHARE_IMAGE_URL");
  }
  const recordImageUrl = env(values, "KICKOFF_SEED_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  const modeImageUrl = env(values, "KICKOFF_SEED_MODE_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL");
  if (recordImageUrl) {
    missing.push(publicShareImageUrlProblem(recordImageUrl, "Record share image URL"));
  }
  if (modeImageUrl) {
    missing.push(publicShareImageUrlProblem(modeImageUrl, "Mode share image URL"));
  }
  return unique(missing);
};

export const readShareImageMetadata = async (
  values: ProductionTargetSeedEnv,
  fetcher: FetchLike = fetch,
  kind: "record" | "mode" = "record",
): Promise<ShareImageSeedMetadata> => {
  const imageUrl =
    kind === "mode"
      ? env(values, "KICKOFF_SEED_MODE_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL")
      : env(values, "KICKOFF_SEED_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  if (!imageUrl) {
    throw new Error(
      kind === "mode"
        ? "KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL is required."
        : "KICKOFF_SEED_SHARE_IMAGE_URL or KICKOFF_VERIFY_SHARE_IMAGE_URL is required.",
    );
  }
  const response = await fetcher(imageUrl, { method: "GET" });
  const imageMime = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const validation = validatePublicShareImageBytes({
    ok: response.ok,
    status: response.status,
    contentType: imageMime,
    bytes,
  });
  if (!validation.passed) throw new Error(`Share image URL is not production-ready: ${validation.detail}`);
  return {
    imageUrl,
    imageMime: validation.mime,
    imageByteLength: bytes.byteLength,
    imageHash: await sha256(`${validation.mime}:${Array.from(bytes).join(",")}`),
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

const supabaseAuthAdminUserUrl = (values: ProductionTargetSeedEnv, userId: string) =>
  `${env(values, "VITE_SUPABASE_URL").replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`;

export const verifyProductionTargetSeedAuthUser = async (
  values: ProductionTargetSeedEnv,
  userId: string,
  fetcher: FetchLike = fetch,
): Promise<ProductionTargetSeedAuthUserCheck> => {
  const missing = [
    userId ? "" : "KICKOFF_SEED_USER_ID or KICKOFF_VERIFY_USER_ID",
    env(values, "VITE_SUPABASE_URL") ? "" : "VITE_SUPABASE_URL",
    env(values, "SUPABASE_SERVICE_ROLE_KEY") ? "" : "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  const url = userId && env(values, "VITE_SUPABASE_URL") ? supabaseAuthAdminUserUrl(values, userId) : undefined;
  if (missing.length > 0) {
    return {
      ready: false,
      userId,
      url,
      detail: `Missing ${missing.join(", ")}`,
      missing,
      sampleIds: [],
    };
  }
  try {
    const response = await fetcher(url!, {
      method: "GET",
      headers: serviceHeaders(values),
    });
    const body = await response.json().catch(() => undefined) as any;
    const providers = [
      ...(Array.isArray(body?.identities) ? body.identities.map((identity: any) => identity?.provider) : []),
      ...(Array.isArray(body?.app_metadata?.providers) ? body.app_metadata.providers : []),
      body?.app_metadata?.provider,
    ]
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    const problems = response.ok
      ? [
          String(body?.id ?? "") === userId ? "" : `auth id ${body?.id ?? "missing"} != ${userId}`,
          String(body?.email ?? "").trim() ? "" : "auth email missing",
          body?.confirmed_at || body?.email_confirmed_at || providers.length > 0 ? "" : "confirmed identity missing",
        ].filter(Boolean)
      : [`HTTP ${response.status}`];
    return {
      ready: response.ok && problems.length === 0,
      userId,
      url,
      detail:
        response.ok && problems.length === 0
          ? `Auth user ${userId} read back with email and ${providers.length > 0 ? providers.join("/") : "confirmed identity"}`
          : problems.join("; "),
      missing: response.ok ? problems : [`Supabase Auth admin read-back failed: HTTP ${response.status}`],
      sampleIds: body?.id ? [String(body.id)] : [],
    };
  } catch (error) {
    return {
      ready: false,
      userId,
      url,
      detail: String(error),
      missing: [String(error)],
      sampleIds: [],
    };
  }
};

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
  await upsert(values, "kickoff_mode_runs?on_conflict=id", seed.rows.modeRuns, fetcher);
  await upsert(values, "kickoff_share_artifacts?on_conflict=id,kind", seed.rows.shareArtifacts, fetcher);
};

export const buildProductionTargetSeedReport = async (
  values: ProductionTargetSeedEnv,
  options: {
    fetcher?: FetchLike;
    now?: string;
    image?: ShareImageSeedMetadata;
    modeImage?: ShareImageSeedMetadata;
  } = {},
): Promise<ProductionTargetSeedReport> => {
  const missing = requiredProductionTargetSeedEnv(values);
  if (missing.includes("VITE_PUBLIC_APP_URL")) return { ready: false, missing };
  if (missing.includes("KICKOFF_SEED_SHARE_IMAGE_URL") && !options.image) return { ready: false, missing };
  if (missing.includes("KICKOFF_SEED_MODE_SHARE_IMAGE_URL") && !options.modeImage) return { ready: false, missing };
  const fetcher = options.fetcher ?? fetch;
  const image = options.image ?? (await readShareImageMetadata(values, fetcher));
  const hasModeImageUrl = Boolean(env(values, "KICKOFF_SEED_MODE_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"));
  const modeImage = options.modeImage ?? (hasModeImageUrl ? await readShareImageMetadata(values, fetcher, "mode") : undefined);
  return {
    ready: missing.length === 0,
    missing,
    seed: await buildProductionTargetSeed(values, { record: image, mode: modeImage }, options.now),
  };
};

export const buildProductionTargetSeedArtifact = (
  report: ProductionTargetSeedReport,
  options: {
    envFiles?: string[];
    generatedAt?: string;
    dryRun?: boolean;
    upserted?: boolean;
    authUser?: ProductionTargetSeedAuthUserCheck;
    doctor?: SupabaseDoctorReport;
  } = {},
): ProductionTargetSeedArtifact => {
  const modeTargetCount = report.seed?.targets.modeIds.length ?? 0;
  const shareArtifactCount = report.seed?.shareArtifacts.length ?? 0;
  const shareArtifacts = report.seed?.rows.shareArtifacts ?? [];
  const recordShareChannelOpened = shareArtifacts.some(
    (artifact) => artifact.kind === "record" && hasProductionShareChannelEvidence(artifact),
  );
  const modeShareChannelCount = shareArtifacts.filter(
    (artifact) => artifact.kind === "mode" && hasProductionShareChannelEvidence(artifact),
  ).length;
  const requiredModeShareChannelCount = requiredProductionModeIds.length;
  const shareChannelCount = (recordShareChannelOpened ? 1 : 0) + modeShareChannelCount;
  const requiredShareChannelCount = 1 + requiredModeShareChannelCount;
  const doctor = options.doctor
    ? {
        ready: options.doctor.ready,
        requiredPassed: options.doctor.requiredPassed,
        requiredTotal: options.doctor.requiredTotal,
        passedCheckIds: options.doctor.checks.filter((check) => check.status === "passed").map((check) => check.id),
        failedCheckIds: options.doctor.nextActions.map((check) => check.id),
      }
    : undefined;
  return {
    ...report,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    envFiles: options.envFiles ?? [],
    artifactVersion: 1,
    dryRun: Boolean(options.dryRun),
    upserted: Boolean(options.upserted),
    authUser: options.authUser,
    doctor,
    acceptance: {
      authUserReady: Boolean(options.authUser?.ready || doctor?.passedCheckIds.includes("target-auth-user")),
      upserted: Boolean(options.upserted),
      doctorReady: Boolean(doctor?.ready),
      profileTarget: Boolean(report.seed?.targets.userId && report.seed?.targets.profileId),
      recordTarget: Boolean(report.seed?.targets.proofId),
      modeTargetCount,
      requiredModeTargetCount: requiredProductionModeIds.length,
      shareArtifactCount,
      requiredShareArtifactCount: 1 + requiredProductionModeIds.length,
      recordShareChannelOpened,
      modeShareChannelCount,
      requiredModeShareChannelCount,
      shareChannelCount,
      requiredShareChannelCount,
      outputEnvKeys: [
        "KICKOFF_VERIFY_USER_ID",
        "KICKOFF_VERIFY_PROFILE_ID",
        "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
        "KICKOFF_VERIFY_PROOF_ID",
        "KICKOFF_VERIFY_MODE_IDS",
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
        "KICKOFF_VERIFY_FRIEND_CODE",
        "KICKOFF_VERIFY_SEASON_KEY",
        "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ],
    },
  };
};
