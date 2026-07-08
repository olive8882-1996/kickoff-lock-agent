import { parseEnvText } from "./productionEvidence";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { buildPublicUrl, normalizePublicAppUrl } from "./publicUrls";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { xIntentProblemForProof } from "./shareChannelValidation";
import type { SupabaseDoctorReport } from "./supabaseProductionDoctor";
import { deployedSupabaseProjectUrlProblem } from "./supabaseStorageUrl";

export type SharingProductionBootstrapStatus = "done" | "ready" | "blocked";

export type SharingProductionBootstrapStage = {
  id: "record-image" | "mode-image" | "record-upload" | "mode-upload" | "doctor";
  label: string;
  status: SharingProductionBootstrapStatus;
  command: string;
  executeCommand: string;
  requiredEnv: string[];
  missingEnv: string[];
  outputEnv: string[];
  detail: string;
};

export type SharingProductionReadBackCommand = {
  id: string;
  label: string;
  kind: "proof-page" | "share-image" | "share-artifact-row" | "share-channel-open";
  command: string;
  ready: boolean;
  url?: string;
  targetId?: string;
  responseExpectation: {
    responseType: "public-html" | "public-image" | "x-intent" | "supabase-array";
    targetId?: string;
    targetKind?: "record" | "mode";
    minRows?: number;
    requiredFields: string[];
    expectedProofUrl?: string;
    expectedImageUrl?: string;
    expectedHost?: string;
    expectedHashtags?: string[];
  };
};

export type SharingProductionBootstrapPlan = {
  ready: boolean;
  execute: boolean;
  stageReadyCount: number;
  totalStages: number;
  blockedStages: number;
  missingEnv: string[];
  stages: SharingProductionBootstrapStage[];
  commands: string[];
  readBackCommands: SharingProductionReadBackCommand[];
  nextAction: string;
  copyText: string;
};

export type SharingProductionBootstrapEnv = Record<string, string | undefined>;

export type SharingProductionBootstrapOptions = {
  execute?: boolean;
  recordImageExists?: boolean;
  modeImageExists?: boolean;
};

export type ShareChannelEvidenceArtifact = SharingProductionBootstrapPlan & {
  generatedAt: string;
  envFiles: string[];
  artifactVersion: 1;
  targets: {
    publicAppUrl: string;
    proofId: string;
    proofUrl: string;
    proofXIntentUrl: string;
    modeIds: string[];
    modeProofUrls: string[];
    modeXIntentUrls: string[];
    shareArtifactIds: string[];
    shareImageUrl: string;
    modeShareImageUrl: string;
  };
  doctor?: {
    ready: boolean;
    requiredPassed: number;
    requiredTotal: number;
    shareChannelCheckIds: string[];
    passedShareChannelCheckIds: string[];
    failedShareChannelCheckIds: string[];
  };
  acceptance: {
    recordChannelOpened: boolean;
    modeChannelCount: number;
    requiredModeChannelCount: number;
    passedTargetCount: number;
    requiredTargetCount: number;
    targetEnvReady: boolean;
    publicTargetUrlsReady: boolean;
    outputEnvKeys: string[];
  };
};

const value = (env: SharingProductionBootstrapEnv, key: string) => env[key]?.trim() ?? "";

const present = (env: SharingProductionBootstrapEnv, key: string) => Boolean(value(env, key));

const listEnv = (env: SharingProductionBootstrapEnv, key: string) =>
  value(env, key)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const hasAny = (env: SharingProductionBootstrapEnv, keys: string[]) => keys.some((key) => present(env, key));

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const parsedEnv = (env: SharingProductionBootstrapEnv) =>
  parseEnvText(
    Object.entries(env)
      .map(([key, item]) => `${key}=${item ?? ""}`)
      .join("\n"),
  );

const missing = (env: SharingProductionBootstrapEnv, keys: string[]) =>
  keys.filter((key) => {
    if (key.includes(" or ")) return !hasAny(env, key.split(/\s+or\s+/));
    return !present(env, key);
  });

const requiredModeTargetCount = requiredProductionModeIds.length;

const modeTargetProblems = (env: SharingProductionBootstrapEnv) => {
  const modeIds = listEnv(env, "KICKOFF_VERIFY_MODE_IDS");
  if (modeIds.length >= requiredModeTargetCount) return [];
  if (modeIds.length > 0) return [`KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids`];
  if (present(env, "KICKOFF_VERIFY_MODE_ID")) {
    return [`KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough for full mode acceptance`];
  }
  return ["KICKOFF_VERIFY_MODE_IDS"];
};

export const buildSharingProductionBootstrapPlan = (
  env: SharingProductionBootstrapEnv,
  options: SharingProductionBootstrapOptions = {},
): SharingProductionBootstrapPlan => {
  const execute = Boolean(options.execute);
  const parsed = parsedEnv(env);
  const recordImageExists = Boolean(options.recordImageExists);
  const modeImageExists = Boolean(options.modeImageExists);
  const uploadMissing = unique([
    deployedSupabaseProjectUrlProblem(value(env, "VITE_SUPABASE_URL")),
    ...missing(env, ["SUPABASE_SERVICE_ROLE_KEY"]),
  ]);
  const recordShareUrlCollected = Boolean(parsed.KICKOFF_VERIFY_SHARE_IMAGE_URL);
  const modeShareUrlCollected = Boolean(parsed.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL);
  const recordShareUrlProblems = recordShareUrlCollected
    ? [publicShareImageUrlProblem(parsed.KICKOFF_VERIFY_SHARE_IMAGE_URL, "KICKOFF_VERIFY_SHARE_IMAGE_URL")].filter(Boolean)
    : [];
  const modeShareUrlProblems = modeShareUrlCollected
    ? [
        publicShareImageUrlProblem(parsed.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"),
      ].filter(Boolean)
    : [];
  const recordUploadMissing = recordShareUrlCollected ? unique([...uploadMissing, ...recordShareUrlProblems]) : uploadMissing;
  const modeUploadMissing = modeShareUrlCollected ? unique([...uploadMissing, ...modeShareUrlProblems]) : uploadMissing;
  const doctorMissing = unique([
    ...missing(env, ["VITE_PUBLIC_APP_URL", "KICKOFF_VERIFY_PROFILE_ID", "KICKOFF_VERIFY_PROOF_ID"]),
    ...modeTargetProblems(env),
    ...(recordShareUrlCollected ? recordShareUrlProblems : ["KICKOFF_VERIFY_SHARE_IMAGE_URL"]),
    ...(modeShareUrlCollected ? modeShareUrlProblems : ["KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"]),
  ]);

  const stages: SharingProductionBootstrapStage[] = [
    {
      id: "record-image",
      label: "Generate record share image",
      status: recordImageExists ? "done" : "ready",
      command: "bun run share:production-image",
      executeCommand: "bun run share:production-image",
      requiredEnv: ["VITE_PUBLIC_APP_URL"],
      missingEnv: [],
      outputEnv: ["public/generated/kickoff-production-share.png", "KICKOFF_SEED_SHARE_IMAGE_URL", "KICKOFF_VERIFY_SHARE_IMAGE_URL"],
      detail: recordImageExists
        ? "Record proof PNG already exists in public/generated."
        : "Render the production record proof PNG with the committed logo and print deployable share-image env values.",
    },
    {
      id: "mode-image",
      label: "Generate mode share image",
      status: modeImageExists ? "done" : "ready",
      command: "bun run share:production-image -- --kind=mode --out=public/generated/kickoff-production-mode-share.png",
      executeCommand: "bun run share:production-image -- --kind=mode --out=public/generated/kickoff-production-mode-share.png",
      requiredEnv: ["VITE_PUBLIC_APP_URL"],
      missingEnv: [],
      outputEnv: [
        "public/generated/kickoff-production-mode-share.png",
        "KICKOFF_SEED_MODE_SHARE_IMAGE_URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ],
      detail: modeImageExists
        ? "Mode proof PNG already exists in public/generated."
        : "Render the production mode proof PNG with the committed logo and print deployable share-image env values.",
    },
    {
      id: "record-upload",
      label: "Upload record share image",
      status: recordShareUrlCollected && recordShareUrlProblems.length === 0 ? "done" : uploadMissing.length === 0 ? "ready" : "blocked",
      command: "bun run share:upload-image",
      executeCommand: "bun run share:upload-image",
      requiredEnv: ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "public/generated/kickoff-production-share.png"],
      missingEnv: recordUploadMissing,
      outputEnv: ["KICKOFF_SEED_SHARE_IMAGE_URL", "KICKOFF_VERIFY_SHARE_IMAGE_URL"],
      detail: recordShareUrlCollected
        ? recordShareUrlProblems.length === 0
          ? "Record share image URL target is a public HTTPS bitmap image."
          : "Record share image URL is present but is not valid public HTTPS bitmap evidence."
        : "Upload the record proof PNG to public storage and verify public image read-back.",
    },
    {
      id: "mode-upload",
      label: "Upload mode share image",
      status: modeShareUrlCollected && modeShareUrlProblems.length === 0 ? "done" : uploadMissing.length === 0 ? "ready" : "blocked",
      command: "bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
      executeCommand: "bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
      requiredEnv: ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "public/generated/kickoff-production-mode-share.png"],
      missingEnv: modeUploadMissing,
      outputEnv: ["KICKOFF_SEED_MODE_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
      detail: modeShareUrlCollected
        ? modeShareUrlProblems.length === 0
          ? "Mode share image URL target is a public HTTPS bitmap image."
          : "Mode share image URL is present but is not valid public HTTPS bitmap evidence."
        : "Upload the mode proof PNG to public storage and verify public image read-back.",
    },
    {
      id: "doctor",
      label: "Verify public sharing surfaces",
      status: doctorMissing.length === 0 ? "ready" : "blocked",
      command: "bun run doctor:sharing",
      executeCommand: "bun run doctor:sharing",
      requiredEnv: [
        "VITE_PUBLIC_APP_URL",
        "KICKOFF_VERIFY_PROFILE_ID",
        "KICKOFF_VERIFY_PROOF_ID",
        "KICKOFF_VERIFY_MODE_IDS",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ],
      missingEnv: doctorMissing,
      outputEnv: ["public proof/profile/mode render evidence", "public image read-back evidence"],
      detail: "Render deployed profile, proof and mode pages; verify canonical URLs, social metadata, JSON-LD and public share image reads.",
    },
  ];

  const blockedStages = stages.filter((stage) => stage.status === "blocked").length;
  const stageReadyCount = stages.filter((stage) => stage.status === "ready" || stage.status === "done").length;
  const missingEnv = unique(stages.flatMap((stage) => stage.missingEnv));
  const commands = stages.filter((stage) => stage.status !== "done").map((stage) => (execute ? stage.executeCommand : stage.command));
  const readBackCommands = buildSharingReadBackCommands(env);
  const next = stages.find((stage) => stage.status !== "done");
  const nextAction = next
    ? next.status === "ready"
      ? `${next.label}: run ${execute ? next.executeCommand : next.command}.`
      : `${next.label}: set ${next.missingEnv.join(", ")} first.`
    : "Public sharing bootstrap targets are ready. Run bun run doctor:sharing.";
  const copyText = [
    "Kickoff Lock Agent public sharing production bootstrap",
    `Mode: ${execute ? "execute" : "plan"}`,
    `Stages: ${stageReadyCount}/${stages.length} ready or done`,
    `Missing env: ${missingEnv.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Read-back commands:",
    ...readBackCommands.map((command) => `- [${command.ready ? "ready" : "blocked"}] ${command.label}: ${command.command}`),
    "Stages:",
    ...stages.map((stage) =>
      [
        `- ${stage.label} [${stage.status}]`,
        `  command: ${stage.command}`,
        `  execute: ${stage.executeCommand}`,
        `  requires: ${stage.requiredEnv.join(", ")}`,
        `  missing: ${stage.missingEnv.join(", ") || "none"}`,
        `  outputs: ${stage.outputEnv.join(", ")}`,
        `  detail: ${stage.detail}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready: blockedStages === 0,
    execute,
    stageReadyCount,
    totalStages: stages.length,
    blockedStages,
    missingEnv,
    stages,
    commands,
    readBackCommands,
    nextAction,
    copyText,
  };
};

const shareChannelCheckIds = ["target-share-channel-row", "target-mode-share-channel-row"];
const requiredShareChannelTargetCount = 1 + requiredModeTargetCount;

const publicProofUrl = (
  publicAppUrl: string,
  kind: "proof" | "mode",
  targetId: string,
) => (publicAppUrl && targetId ? buildPublicUrl(kind, targetId, publicAppUrl, publicAppUrl) : "");

const shareIntentUrl = (proofUrl: string, kind: "record" | "mode") => {
  if (!proofUrl) return "";
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set(
    "text",
    kind === "mode"
      ? `Kickoff Lock mode proof sealed.\nVerify: ${proofUrl}`
      : `Kickoff Lock prediction proof locked.\nVerify: ${proofUrl}`,
  );
  url.searchParams.set("url", proofUrl);
  url.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");
  return url.toString();
};

const shareIntentReady = (proofUrl: string, xIntentUrl: string) =>
  !xIntentProblemForProof({ proof_url: proofUrl, x_intent_url: xIntentUrl });

const proofPageExpectation = (
  targetId: string,
  targetKind: "record" | "mode",
  proofUrl: string,
): SharingProductionReadBackCommand["responseExpectation"] => ({
  responseType: "public-html",
  targetId,
  targetKind,
  requiredFields: ["canonical-url", "og:title", "og:image", "twitter:card", "json-ld", "public-source-cloud"],
  expectedProofUrl: proofUrl,
});

const shareImageExpectation = (
  targetId: string | undefined,
  targetKind: "record" | "mode",
  imageUrl: string,
): SharingProductionReadBackCommand["responseExpectation"] => ({
  responseType: "public-image",
  targetId,
  targetKind,
  requiredFields: ["content-type:image", "content-length", "sha256"],
  expectedImageUrl: imageUrl,
});

const shareChannelOpenExpectation = (
  targetId: string,
  targetKind: "record" | "mode",
  proofUrl: string,
): SharingProductionReadBackCommand["responseExpectation"] => ({
  responseType: "x-intent",
  targetId,
  targetKind,
  requiredFields: ["url", "text", "hashtags"],
  expectedProofUrl: proofUrl,
  expectedHost: "twitter.com",
  expectedHashtags: ["KickoffLock", "Filecoin", "WorldCup"],
});

const shareArtifactRowExpectation = (
  targetId: string,
  targetKind: "record" | "mode",
  proofUrl: string,
  imageUrl: string,
): SharingProductionReadBackCommand["responseExpectation"] => ({
  responseType: "supabase-array",
  targetId,
  targetKind,
  minRows: 1,
  requiredFields: [
    "id",
    "kind",
    "proof_url",
    "image_url",
    "image_hash",
    "generated_at",
    "x_intent_url",
    "x_intent_opened_at",
    "native_share_opened_at",
  ],
  expectedProofUrl: proofUrl,
  expectedImageUrl: imageUrl,
});

const shellSingleQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

const supabaseRestUrl = (supabaseUrl: string, path: string) =>
  `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${path.replace(/^\/+/, "")}`;

const shareArtifactQueryPath = (
  id: string,
  kind: "record" | "mode",
  target: { proofUrl?: string; imageUrl?: string } = {},
) => {
  const query = new URLSearchParams({
    select: "id,kind,proof_url,image_url,image_hash,generated_at,x_intent_url,x_intent_opened_at,native_share_opened_at",
    id: `eq.${id}`,
    kind: `eq.${kind}`,
    limit: "1",
  });
  if (target.proofUrl) query.set("proof_url", `eq.${target.proofUrl}`);
  if (target.imageUrl) query.set("image_url", `eq.${target.imageUrl}`);
  return `kickoff_share_artifacts?${query.toString()}`;
};

const supabaseAnonReadCommand = (url: string) =>
  [
    "curl -sS",
    shellSingleQuote(url),
    '-H "apikey: $VITE_SUPABASE_ANON_KEY"',
    '-H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"',
  ].join(" ");

const buildSharingReadBackCommands = (env: SharingProductionBootstrapEnv): SharingProductionReadBackCommand[] => {
  const publicAppUrl = normalizePublicAppUrl(value(env, "VITE_PUBLIC_APP_URL")) ?? "";
  const supabaseUrl = value(env, "VITE_SUPABASE_URL");
  const supabaseReady = Boolean(supabaseUrl && !deployedSupabaseProjectUrlProblem(supabaseUrl));
  const supabaseAnonReady = present(env, "VITE_SUPABASE_ANON_KEY");
  const proofId = value(env, "KICKOFF_VERIFY_PROOF_ID");
  const modeIds = listEnv(env, "KICKOFF_VERIFY_MODE_IDS");
  const shareImageUrl = value(env, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  const modeShareImageUrl = value(env, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL");
  const proofUrl = publicProofUrl(publicAppUrl, "proof", proofId);
  const modeProofUrls = modeIds.map((id) => ({ id, url: publicProofUrl(publicAppUrl, "mode", id) }));
  const commands: SharingProductionReadBackCommand[] = [];

  if (proofId && proofUrl) {
    const xIntentUrl = shareIntentUrl(proofUrl, "record");
    commands.push({
      id: "public-proof-page",
      label: "Read deployed record proof page",
      kind: "proof-page",
      targetId: proofId,
      url: proofUrl,
      command: `curl -sS ${shellSingleQuote(proofUrl)}`,
      ready: true,
      responseExpectation: proofPageExpectation(proofId, "record", proofUrl),
    });
    commands.push({
      id: "record-share-channel-open",
      label: "Open record X intent",
      kind: "share-channel-open",
      targetId: proofId,
      url: xIntentUrl,
      command: `open ${shellSingleQuote(xIntentUrl)}`,
      ready: shareIntentReady(proofUrl, xIntentUrl),
      responseExpectation: shareChannelOpenExpectation(proofId, "record", proofUrl),
    });
  }

  for (const item of modeProofUrls) {
    if (!item.url) continue;
    const xIntentUrl = shareIntentUrl(item.url, "mode");
    commands.push({
      id: `public-mode-page:${item.id}`,
      label: `Read deployed mode proof page ${item.id}`,
      kind: "proof-page",
      targetId: item.id,
      url: item.url,
      command: `curl -sS ${shellSingleQuote(item.url)}`,
      ready: true,
      responseExpectation: proofPageExpectation(item.id, "mode", item.url),
    });
    commands.push({
      id: `mode-share-channel-open:${item.id}`,
      label: `Open mode X intent ${item.id}`,
      kind: "share-channel-open",
      targetId: item.id,
      url: xIntentUrl,
      command: `open ${shellSingleQuote(xIntentUrl)}`,
      ready: shareIntentReady(item.url, xIntentUrl),
      responseExpectation: shareChannelOpenExpectation(item.id, "mode", item.url),
    });
  }

  if (shareImageUrl) {
    commands.push({
      id: "record-share-image",
      label: "Read public record share image",
      kind: "share-image",
      targetId: proofId || undefined,
      url: shareImageUrl,
      command: `curl -sS ${shellSingleQuote(shareImageUrl)} -o /tmp/kickoff-record-share-card.png`,
      ready: !publicShareImageUrlProblem(shareImageUrl, "KICKOFF_VERIFY_SHARE_IMAGE_URL"),
      responseExpectation: shareImageExpectation(proofId || undefined, "record", shareImageUrl),
    });
  }

  if (modeShareImageUrl) {
    commands.push({
      id: "mode-share-image",
      label: "Read public mode share image",
      kind: "share-image",
      targetId: modeIds[0],
      url: modeShareImageUrl,
      command: `curl -sS ${shellSingleQuote(modeShareImageUrl)} -o /tmp/kickoff-mode-share-card.png`,
      ready: !publicShareImageUrlProblem(modeShareImageUrl, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"),
      responseExpectation: shareImageExpectation(modeIds[0], "mode", modeShareImageUrl),
    });
  }

  if (proofId && supabaseUrl) {
    const url = supabaseRestUrl(supabaseUrl, shareArtifactQueryPath(proofId, "record", {
      proofUrl,
      imageUrl: shareImageUrl,
    }));
    commands.push({
      id: "record-share-artifact-row",
      label: "Read record share artifact row",
      kind: "share-artifact-row",
      targetId: proofId,
      url,
      command: supabaseAnonReadCommand(url),
      ready: supabaseReady && supabaseAnonReady,
      responseExpectation: shareArtifactRowExpectation(proofId, "record", proofUrl, shareImageUrl),
    });
  }

  for (const id of modeIds) {
    if (!supabaseUrl) continue;
    const modeProofUrl = modeProofUrls.find((item) => item.id === id)?.url ?? "";
    const url = supabaseRestUrl(supabaseUrl, shareArtifactQueryPath(id, "mode", {
      proofUrl: modeProofUrl,
      imageUrl: modeShareImageUrl,
    }));
    commands.push({
      id: `mode-share-artifact-row:${id}`,
      label: `Read mode share artifact row ${id}`,
      kind: "share-artifact-row",
      targetId: id,
      url,
      command: supabaseAnonReadCommand(url),
      ready: supabaseReady && supabaseAnonReady,
      responseExpectation: shareArtifactRowExpectation(id, "mode", modeProofUrl, modeShareImageUrl),
    });
  }

  return commands;
};

export const buildShareChannelEvidenceArtifact = (
  plan: SharingProductionBootstrapPlan,
  options: {
    env: SharingProductionBootstrapEnv;
    envFiles?: string[];
    doctor?: SupabaseDoctorReport;
    generatedAt?: string;
  },
): ShareChannelEvidenceArtifact => {
  const modeIds = listEnv(options.env, "KICKOFF_VERIFY_MODE_IDS");
  const passedShareChannelCheckIds =
    options.doctor?.checks
      .filter((check) => shareChannelCheckIds.includes(check.id) && check.status === "passed")
      .map((check) => check.id) ?? [];
  const failedShareChannelCheckIds =
    options.doctor?.checks
      .filter((check) => shareChannelCheckIds.includes(check.id) && check.status !== "passed")
      .map((check) => check.id) ?? shareChannelCheckIds;
  const recordChannelOpened = passedShareChannelCheckIds.includes("target-share-channel-row");
  const modeChannelOpened = passedShareChannelCheckIds.includes("target-mode-share-channel-row");
  const modeChannelCount = modeChannelOpened ? modeIds.length : 0;
  const publicAppUrl = normalizePublicAppUrl(value(options.env, "VITE_PUBLIC_APP_URL")) ?? "";
  const proofId = value(options.env, "KICKOFF_VERIFY_PROOF_ID");
  const proofUrl = publicProofUrl(publicAppUrl, "proof", proofId);
  const proofXIntentUrl = shareIntentUrl(proofUrl, "record");
  const modeProofUrls = modeIds.map((id) => publicProofUrl(publicAppUrl, "mode", id));
  const modeXIntentUrls = modeProofUrls.map((url) => shareIntentUrl(url, "mode"));
  const shareArtifactIds = [proofId ? `record:${proofId}` : "", ...modeIds.map((id) => `mode:${id}`)].filter(Boolean);
  const shareImageUrl = value(options.env, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  const modeShareImageUrl = value(options.env, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL");
  const targetEnvReady = Boolean(proofId) && modeIds.length >= requiredModeTargetCount;
  const publicTargetUrlsReady = Boolean(
    publicAppUrl &&
      proofUrl &&
      modeProofUrls.length >= requiredModeTargetCount &&
      modeProofUrls.every(Boolean) &&
      !publicShareImageUrlProblem(shareImageUrl, "KICKOFF_VERIFY_SHARE_IMAGE_URL") &&
      !publicShareImageUrlProblem(modeShareImageUrl, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"),
  );
  const passedTargetCount = (recordChannelOpened ? 1 : 0) + modeChannelCount;

  return {
    ...plan,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    envFiles: options.envFiles ?? [],
    artifactVersion: 1,
    targets: {
      publicAppUrl,
      proofId,
      proofUrl,
      proofXIntentUrl,
      modeIds,
      modeProofUrls,
      modeXIntentUrls,
      shareArtifactIds,
      shareImageUrl,
      modeShareImageUrl,
    },
    doctor: options.doctor
      ? {
          ready: options.doctor.ready,
          requiredPassed: options.doctor.requiredPassed,
          requiredTotal: options.doctor.requiredTotal,
          shareChannelCheckIds,
          passedShareChannelCheckIds,
          failedShareChannelCheckIds,
        }
      : undefined,
    acceptance: {
      recordChannelOpened,
      modeChannelCount,
      requiredModeChannelCount: requiredModeTargetCount,
      passedTargetCount,
      requiredTargetCount: requiredShareChannelTargetCount,
      targetEnvReady,
      publicTargetUrlsReady,
      outputEnvKeys: [
        "VITE_PUBLIC_APP_URL",
        "KICKOFF_VERIFY_PROOF_ID",
        "KICKOFF_VERIFY_MODE_IDS",
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ],
    },
    ready:
      plan.ready &&
      targetEnvReady &&
      publicTargetUrlsReady &&
      recordChannelOpened &&
      modeChannelCount >= requiredModeTargetCount,
  };
};
