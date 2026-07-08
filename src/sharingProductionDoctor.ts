import { normalizePublicAppUrl } from "./publicUrls";
import {
  evaluateCleanSessionRestoreResults,
  evaluatePublicRenderSnapshot,
  type CleanSessionPublicRenderResult,
  type PublicRenderKind,
} from "./productionEvidence";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { validatePublicShareImageResponse } from "./shareImageValidation";

export type SharingDoctorStatus = "passed" | "failed" | "skipped";

export type SharingDoctorCheck = {
  id: string;
  label: string;
  required: boolean;
  status: SharingDoctorStatus;
  detail: string;
  action: string;
  url?: string;
  sampleIds?: string[];
};

export type SharingDoctorReport = {
  ready: boolean;
  requiredPassed: number;
  requiredTotal: number;
  checks: SharingDoctorCheck[];
  nextActions: SharingDoctorCheck[];
};

export type SharingDoctorEnv = Record<string, string | undefined>;

export type PublicRestoreEvidenceArtifact = SharingDoctorReport & {
  generatedAt: string;
  envFiles: string[];
  artifactVersion: 1;
  readBackCommands: PublicRestoreReadBackCommand[];
  pageTargets: PublicRestorePageTarget[];
  targets: {
    publicAppUrl: string;
    profileId: string;
    proofId: string;
    modeIds: string[];
    shareImageUrl: string;
    modeShareImageUrl: string;
  };
  acceptance: {
    publicAppUrlReady: boolean;
    cleanSessionRestore: boolean;
    profileRender: boolean;
    proofRender: boolean;
    modeRenderCount: number;
    requiredModeRenderCount: number;
    cleanSessionProfileIds: string[];
    cleanSessionProofIds: string[];
    cleanSessionModeIds: string[];
    shareImageReadBack: boolean;
    modeShareImageReadBack: boolean;
    outputEnvKeys: string[];
  };
};

export type PublicRestoreReadBackCommand = {
  id: string;
  label: string;
  kind: "public-page" | "supabase-row";
  targetKind: PublicRenderKind;
  targetId: string;
  expectedSource: "cloud";
  queryPath?: string;
  authMode: "public-page" | "anon";
  command: string;
  ready: boolean;
  url: string;
  table?: "kickoff_profiles" | "kickoff_records" | "kickoff_mode_runs";
  responseExpectation: {
    responseType: "public-html" | "supabase-array";
    targetKind: PublicRenderKind;
    targetId: string;
    expectedSource: "cloud";
    requiresCleanSession?: boolean;
    pageKind?: PublicRenderKind;
    queryParam?: "profile" | "proof" | "mode";
    targetIds?: string[];
    minRows?: number;
    requiredFields: string[];
    table?: "kickoff_profiles" | "kickoff_records" | "kickoff_mode_runs";
    expectedShareImageUrl?: string;
  };
};

export type PublicRestorePageTarget = {
  kind: PublicRenderKind;
  targetId: string;
  url: string;
  ready: boolean;
  expectedSource: "cloud";
};

export type RenderedPublicPage = {
  text: string;
  canonical: string;
  ogTitle: string;
  ogImage: string;
  twitterCard: string;
  jsonLd: string;
  publicKind?: string;
  publicTarget?: string;
  publicSource?: string;
};

export type PublicPageRenderer = (url: string) => Promise<RenderedPublicPage>;

type FetchLike = typeof fetch;

const env = (values: SharingDoctorEnv, key: string) => values[key]?.trim() ?? "";
const has = (values: SharingDoctorEnv, key: string) => env(values, key).length > 0;
const listEnv = (values: SharingDoctorEnv, key: string) =>
  env(values, key).split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const addCheck = (
  checks: SharingDoctorCheck[],
  check: Omit<SharingDoctorCheck, "status"> & { passed?: boolean; skipped?: boolean },
) => {
  const { passed, skipped, ...rest } = check;
  checks.push({
    ...rest,
    status: skipped ? "skipped" : passed ? "passed" : "failed",
  });
};

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

const publicPageResponseExpectation = (
  target: PublicRestorePageTarget,
): PublicRestoreReadBackCommand["responseExpectation"] => ({
  responseType: "public-html",
  targetKind: target.kind,
  targetId: target.targetId,
  expectedSource: "cloud",
  requiresCleanSession: true,
  pageKind: target.kind,
  queryParam: target.kind,
  targetIds: [target.targetId],
  requiredFields: [
    "canonical-url",
    "og:title",
    "og:image",
    "twitter:card",
    "json-ld",
    "public-kind",
    "public-target",
    "public-source-cloud",
    "social-metadata",
    "share-image",
    "cloud-record",
  ],
});

const publicPageReadBackCommand = (target: PublicRestorePageTarget): PublicRestoreReadBackCommand => ({
  id: `public-page:${target.kind}:${target.targetId}`,
  label: `${target.kind} ${target.targetId} public page`,
  kind: "public-page",
  targetKind: target.kind,
  targetId: target.targetId,
  expectedSource: "cloud",
  authMode: "public-page",
  url: target.url,
  ready: target.ready,
  command: target.url ? `curl -sS ${shellSingleQuote(target.url)}` : `Set public ${target.kind} URL before read-back.`,
  responseExpectation: publicPageResponseExpectation(target),
});

const supabaseRowTableFor = (kind: PublicRenderKind): PublicRestoreReadBackCommand["table"] => {
  if (kind === "profile") return "kickoff_profiles";
  if (kind === "mode") return "kickoff_mode_runs";
  return "kickoff_records";
};

const supabaseSelectFor = (kind: PublicRenderKind) => {
  if (kind === "profile") return "id,email,display_name,location,friend_code,season_key,updated_at";
  if (kind === "mode") return "id,user_id,mode_id,status,score,mode_run,updated_at";
  return "id,user_id,capsule,result,seal_job,updated_at";
};

const supabaseRowUrl = (values: SharingDoctorEnv, kind: PublicRenderKind, targetId: string) => {
  const supabaseUrl = env(values, "VITE_SUPABASE_URL");
  const table = supabaseRowTableFor(kind);
  if (!supabaseUrl || !targetId || !table) return "";
  try {
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    url.searchParams.set("select", supabaseSelectFor(kind));
    url.searchParams.set("id", `eq.${targetId}`);
    url.searchParams.set("limit", "1");
    return url.toString();
  } catch {
    return "";
  }
};

const supabaseRowQueryPath = (kind: PublicRenderKind, targetId: string) => {
  const table = supabaseRowTableFor(kind);
  if (!targetId || !table) return "";
  const query = new URLSearchParams({
    select: supabaseSelectFor(kind),
    id: `eq.${targetId}`,
    limit: "1",
  });
  return `${table}?${query.toString()}`;
};

const supabaseRowResponseExpectation = (
  kind: PublicRenderKind,
  targetId: string,
): PublicRestoreReadBackCommand["responseExpectation"] => ({
  responseType: "supabase-array",
  targetKind: kind,
  targetId,
  expectedSource: "cloud",
  minRows: 1,
  requiredFields: supabaseSelectFor(kind).split(","),
  table: supabaseRowTableFor(kind),
});

const supabaseRowReadBackCommand = (
  values: SharingDoctorEnv,
  kind: PublicRenderKind,
  targetId: string,
): PublicRestoreReadBackCommand => {
  const table = supabaseRowTableFor(kind);
  const url = supabaseRowUrl(values, kind, targetId);
  return {
    id: `supabase-row:${kind}:${targetId}`,
    label: `${kind} ${targetId} Supabase row`,
    kind: "supabase-row",
    targetKind: kind,
    targetId,
    expectedSource: "cloud",
    queryPath: supabaseRowQueryPath(kind, targetId),
    authMode: "anon",
    table,
    url,
    ready: Boolean(url),
    command: url
      ? `curl -sS ${shellSingleQuote(url)} -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"`
      : `Set VITE_SUPABASE_URL and ${targetKeyFor(kind)} before Supabase row read-back.`,
    responseExpectation: supabaseRowResponseExpectation(kind, targetId),
  };
};

export const publicShareUrl = (
  publicAppUrl: string | undefined,
  kind: PublicRenderKind,
  targetId: string,
) => {
  if (!publicAppUrl || !targetId) return "";
  const url = new URL(publicAppUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set(kind, targetId);
  return url.toString();
};

const targetKeyFor = (kind: PublicRenderKind) => {
  if (kind === "profile") return "KICKOFF_VERIFY_PROFILE_ID";
  if (kind === "mode") return "KICKOFF_VERIFY_MODE_ID";
  return "KICKOFF_VERIFY_PROOF_ID";
};

const targetIdsFor = (values: SharingDoctorEnv, kind: PublicRenderKind) => {
  if (kind === "mode") {
    return listEnv(values, "KICKOFF_VERIFY_MODE_IDS");
  }
  const targetId = env(values, targetKeyFor(kind));
  return targetId ? [targetId] : [];
};

const requiredModeTargetCount = requiredProductionModeIds.length;

const targetReady = (values: SharingDoctorEnv, kind: PublicRenderKind, targetIds: string[]) => {
  if (kind !== "mode") {
    return {
      passed: targetIds.length > 0,
      detail: targetIds.length > 0 ? targetIds.join(", ") : `${targetKeyFor(kind)} missing`,
    };
  }
  if (targetIds.length >= requiredModeTargetCount) {
    return {
      passed: true,
      detail: targetIds.join(", "),
    };
  }
  if (targetIds.length > 0) {
    return {
      passed: false,
      detail: `KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids; got ${targetIds.length}`,
    };
  }
  if (has(values, "KICKOFF_VERIFY_MODE_ID")) {
    return {
      passed: false,
      detail: `KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough`,
    };
  }
  return {
    passed: false,
    detail: "KICKOFF_VERIFY_MODE_IDS missing",
  };
};

const targetLabelFor = (kind: PublicRenderKind) => {
  if (kind === "profile") return "Public profile target";
  if (kind === "mode") return "Public mode proof target";
  return "Public prediction proof target";
};

const renderLabelFor = (kind: PublicRenderKind) => {
  if (kind === "profile") return "Public profile render";
  if (kind === "mode") return "Public mode proof render";
  return "Public prediction proof render";
};

const actionFor = (kind: PublicRenderKind) => {
  if (kind === "profile") return "Set KICKOFF_VERIFY_PROFILE_ID to a synced Supabase profile id.";
  if (kind === "mode") return "Set KICKOFF_VERIFY_MODE_IDS to synced mode proof run ids with share manifests.";
  return "Set KICKOFF_VERIFY_PROOF_ID to a synced prediction capsule id with a share manifest.";
};

const expectedOgImageFor = (values: SharingDoctorEnv, kind: PublicRenderKind) => {
  if (kind === "proof") return env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  if (kind === "mode") return env(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL");
  return "";
};

const ogImageProblem = (snapshot: RenderedPublicPage, expectedImageUrl: string) => {
  if (!expectedImageUrl) return "";
  const actual = snapshot.ogImage.trim();
  if (!actual) return `og:image missing; expected ${expectedImageUrl}`;
  try {
    if (new URL(actual).toString() === new URL(expectedImageUrl).toString()) return "";
  } catch {
    return `og:image is not a valid URL; expected ${expectedImageUrl}`;
  }
  return `og:image ${actual} does not match expected share image ${expectedImageUrl}`;
};

const jsonLdImageProblem = (snapshot: RenderedPublicPage, expectedImageUrl: string) => {
  if (!expectedImageUrl) return "";
  try {
    const parsed = JSON.parse(snapshot.jsonLd || "{}");
    const rawImage = Array.isArray(parsed.image) ? parsed.image[0] : parsed.image;
    const actual = typeof rawImage === "string" ? rawImage.trim() : "";
    if (!actual) return `JSON-LD image missing; expected ${expectedImageUrl}`;
    const expected = new URL(expectedImageUrl).toString();
    if (new URL(actual).toString() !== expected) {
      return `JSON-LD image ${actual} does not match expected share image ${expectedImageUrl}`;
    }
    const media = parsed.associatedMedia;
    if (!media || typeof media !== "object") {
      return `JSON-LD associatedMedia missing; expected share image ${expectedImageUrl}`;
    }
    const mediaUrl = String(media.contentUrl ?? media.url ?? "").trim();
    if (!mediaUrl) return `JSON-LD associatedMedia image missing; expected ${expectedImageUrl}`;
    if (new URL(mediaUrl).toString() !== expected) {
      return `JSON-LD associatedMedia ${mediaUrl} does not match expected share image ${expectedImageUrl}`;
    }
    if (!String(media.encodingFormat ?? "").toLowerCase().startsWith("image/")) {
      return "JSON-LD associatedMedia encodingFormat missing image MIME";
    }
    if (Number(media.contentSize ?? 0) <= 10_000) {
      return "JSON-LD associatedMedia contentSize missing production image bytes";
    }
    if (!/^[a-f0-9]{64}$/i.test(String(media.sha256 ?? ""))) {
      return "JSON-LD associatedMedia sha256 missing";
    }
    return "";
  } catch {
    return `JSON-LD image is not parseable; expected ${expectedImageUrl}`;
  }
};

const checkRenderedPage = async (
  values: SharingDoctorEnv,
  renderer: PublicPageRenderer | undefined,
  checks: SharingDoctorCheck[],
  kind: PublicRenderKind,
): Promise<CleanSessionPublicRenderResult[]> => {
  const publicAppUrl = normalizePublicAppUrl(env(values, "VITE_PUBLIC_APP_URL"));
  const targetKey = targetKeyFor(kind);
  const targetIds = targetIdsFor(values, kind);
  const targetDetailKey = kind === "mode" && listEnv(values, "KICKOFF_VERIFY_MODE_IDS").length > 0
    ? "KICKOFF_VERIFY_MODE_IDS"
    : targetKey;
  const target = targetReady(values, kind, targetIds);

  addCheck(checks, {
    id: `${kind}-target-id`,
    label: targetLabelFor(kind),
    required: true,
    passed: target.passed,
    detail: target.passed ? target.detail : target.detail || `${targetDetailKey} missing`,
    action: actionFor(kind),
    sampleIds: targetIds,
  });

  if (!publicAppUrl || !target.passed) {
    addCheck(checks, {
      id: `${kind}-render`,
      label: renderLabelFor(kind),
      required: true,
      detail: publicAppUrl ? target.detail : "URL not configured",
      action: publicAppUrl ? actionFor(kind) : "Set VITE_PUBLIC_APP_URL to the deployed HTTPS app URL.",
      sampleIds: targetIds,
    });
    return [];
  }
  if (!renderer) {
    addCheck(checks, {
      id: `${kind}-render`,
      label: renderLabelFor(kind),
      required: true,
      detail: "Renderer not configured",
      action: "Install Playwright Chromium or run in an environment where the sharing doctor can render public pages.",
      sampleIds: targetIds,
    });
    return [];
  }
  try {
    const failures: string[] = [];
    const cleanSessionResults: CleanSessionPublicRenderResult[] = [];
    const urls = targetIds.map((targetId) => publicShareUrl(publicAppUrl, kind, targetId));
    for (const [index, url] of urls.entries()) {
      const targetId = targetIds[index]!;
      const snapshot = await renderer(url);
      const evaluation = evaluatePublicRenderSnapshot(kind, targetId, snapshot, url, { requireSocial: true });
      const expectedImageUrl = expectedOgImageFor(values, kind);
      const imageProblem = ogImageProblem(snapshot, expectedImageUrl);
      const structuredImageProblem = jsonLdImageProblem(snapshot, expectedImageUrl);
      const cleanSessionEvaluation = evaluatePublicRenderSnapshot(kind, targetId, snapshot, url, {
        requireSocial: true,
        requireCloudLoaded: true,
      });
      cleanSessionResults.push({
        kind,
        targetId,
        url,
        passed: cleanSessionEvaluation.passed && !imageProblem && !structuredImageProblem,
        cloudLoaded: Boolean(cleanSessionEvaluation.cloudLoaded),
        canonicalOk: cleanSessionEvaluation.canonicalOk,
        publicTargetOk: cleanSessionEvaluation.publicTargetOk,
        socialOk: cleanSessionEvaluation.socialOk,
        shareImageMatched: !imageProblem,
        structuredImageMatched: !structuredImageProblem,
        detail: [cleanSessionEvaluation.detail, imageProblem, structuredImageProblem].filter(Boolean).join("; "),
      });
      if (!evaluation.passed) {
        failures.push(`${targetId}: ${evaluation.detail}`);
      }
      if (imageProblem) {
        failures.push(`${targetId}: ${imageProblem}`);
      }
      if (structuredImageProblem) {
        failures.push(`${targetId}: ${structuredImageProblem}`);
      }
    }
    const passed = failures.length === 0;
    addCheck(checks, {
      id: `${kind}-render`,
      label: renderLabelFor(kind),
      required: true,
      passed,
      detail: passed
        ? `rendered ${targetIds.length}/${targetIds.length} ${kind} page${targetIds.length === 1 ? "" : "s"} with canonical URL, social metadata and JSON-LD`
        : failures.join(" | "),
      action: actionFor(kind),
      url: urls[0],
      sampleIds: targetIds,
    });
    return cleanSessionResults;
  } catch (error) {
    addCheck(checks, {
      id: `${kind}-render`,
      label: renderLabelFor(kind),
      required: true,
      detail: String(error),
      action: actionFor(kind),
      sampleIds: targetIds,
    });
    return [];
  }
};

const checkShareImage = async (
  values: SharingDoctorEnv,
  fetcher: FetchLike,
  checks: SharingDoctorCheck[],
  {
    id,
    label,
    envKey,
    action,
  }: {
    id: string;
    label: string;
    envKey: string;
    action: string;
  },
) => {
  const imageUrl = env(values, envKey);
  if (!imageUrl) {
    addCheck(checks, {
      id,
      label,
      required: true,
      detail: `${envKey} missing`,
      action,
    });
    return;
  }
  const storageProblem = publicShareImageUrlProblem(imageUrl, envKey);
  if (storageProblem) {
    addCheck(checks, {
      id,
      label,
      required: true,
      detail: storageProblem,
      action,
      url: imageUrl,
    });
    return;
  }
  try {
    const response = await fetcher(imageUrl, { method: "GET" });
    const validation = await validatePublicShareImageResponse(response);
    addCheck(checks, {
      id,
      label,
      required: true,
      passed: validation.passed,
      detail: validation.detail,
      action,
      url: imageUrl,
    });
  } catch (error) {
    addCheck(checks, {
      id,
      label,
      required: true,
      detail: String(error),
      action,
      url: imageUrl,
    });
  }
};

export const buildSharingProductionDoctorReport = async (
  values: SharingDoctorEnv,
  options: {
    fetcher?: FetchLike;
    renderer?: PublicPageRenderer;
  } = {},
): Promise<SharingDoctorReport> => {
  const checks: SharingDoctorCheck[] = [];
  const publicAppUrl = normalizePublicAppUrl(env(values, "VITE_PUBLIC_APP_URL"));
  addCheck(checks, {
    id: "public-app-url",
    label: "Public HTTPS app URL",
    required: true,
    passed: Boolean(publicAppUrl),
    detail: publicAppUrl ?? "Missing valid VITE_PUBLIC_APP_URL",
    action: "Set VITE_PUBLIC_APP_URL to the deployed HTTPS app URL.",
  });

  const cleanSessionResults = (
    await Promise.all(
    (["profile", "proof", "mode"] as const).map((kind) =>
      checkRenderedPage(values, options.renderer, checks, kind),
    ),
    )
  ).flat();
  const cleanSession = evaluateCleanSessionRestoreResults(cleanSessionResults, {
    profile: targetIdsFor(values, "profile"),
    proof: targetIdsFor(values, "proof"),
    mode: targetIdsFor(values, "mode"),
  });
  const cleanSessionPassedIds = cleanSessionResults
    .filter((result) => result.passed && result.cloudLoaded && result.targetId)
    .map((result) => result.targetId as string);
  addCheck(checks, {
    id: "clean-session-restore",
    label: "Clean-session account restore",
    required: true,
    passed: cleanSession.passed,
    detail: cleanSession.detail,
    action:
      "Render profile, proof and every mode proof page from the deployed app with cloud-loaded Supabase content in a clean browser context.",
    sampleIds: cleanSessionPassedIds,
  });
  await Promise.all([
    checkShareImage(values, options.fetcher ?? fetch, checks, {
      id: "share-image-public-read",
      label: "Public share image read",
      envKey: "KICKOFF_VERIFY_SHARE_IMAGE_URL",
      action: "Generate a record share card PNG, publish it as a public HTTPS image and set KICKOFF_VERIFY_SHARE_IMAGE_URL.",
    }),
    checkShareImage(values, options.fetcher ?? fetch, checks, {
      id: "mode-share-image-public-read",
      label: "Public mode share image read",
      envKey: "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      action:
        "Generate a mode proof share card PNG, publish it as a public HTTPS image and set KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL.",
    }),
  ]);

  const required = checks.filter((check) => check.required);
  const requiredPassed = required.filter((check) => check.status === "passed").length;
  return {
    ready: required.length > 0 && requiredPassed === required.length,
    requiredPassed,
    requiredTotal: required.length,
    checks,
    nextActions: checks.filter((check) => check.required && check.status !== "passed"),
  };
};

const checkPassed = (report: SharingDoctorReport, id: string) =>
  report.checks.find((check) => check.id === id)?.status === "passed";

const publicRestorePageTargets = (values: SharingDoctorEnv, publicAppUrl: string): PublicRestorePageTarget[] =>
  (["profile", "proof", "mode"] as const).flatMap((kind) =>
    targetIdsFor(values, kind).map((targetId) => {
      const url = publicShareUrl(publicAppUrl, kind, targetId);
      return {
        kind,
        targetId,
        url,
        ready: Boolean(publicAppUrl && targetId && url),
        expectedSource: "cloud" as const,
      };
    }),
  );

const publicRestoreReadBackCommands = (
  values: SharingDoctorEnv,
  pageTargets: PublicRestorePageTarget[],
): PublicRestoreReadBackCommand[] => [
  ...pageTargets.map(publicPageReadBackCommand),
  ...(["profile", "proof", "mode"] as const).flatMap((kind) =>
    targetIdsFor(values, kind).map((targetId) => supabaseRowReadBackCommand(values, kind, targetId)),
  ),
];

export const buildPublicRestoreEvidenceArtifact = (
  report: SharingDoctorReport,
  options: {
    env: SharingDoctorEnv;
    envFiles?: string[];
    generatedAt?: string;
  },
): PublicRestoreEvidenceArtifact => {
  const modeIds = listEnv(options.env, "KICKOFF_VERIFY_MODE_IDS");
  const modeRender = checkPassed(report, "mode-render");
  const modeRenderCount = modeRender ? modeIds.length : 0;
  const publicAppUrl = normalizePublicAppUrl(env(options.env, "VITE_PUBLIC_APP_URL")) ?? "";
  const cleanSessionRestore = checkPassed(report, "clean-session-restore");
  const cleanSessionIds = report.checks.find((check) => check.id === "clean-session-restore")?.sampleIds ?? [];
  const profileRender = checkPassed(report, "profile-render");
  const proofRender = checkPassed(report, "proof-render");
  const shareImageReadBack = checkPassed(report, "share-image-public-read");
  const modeShareImageReadBack = checkPassed(report, "mode-share-image-public-read");
  const pageTargets = publicRestorePageTargets(options.env, publicAppUrl);
  const readBackCommands = publicRestoreReadBackCommands(options.env, pageTargets);

  return {
    ...report,
    ready:
      report.ready &&
      Boolean(publicAppUrl) &&
      cleanSessionRestore &&
      profileRender &&
      proofRender &&
      modeRenderCount >= requiredModeTargetCount &&
      shareImageReadBack &&
      modeShareImageReadBack,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    envFiles: options.envFiles ?? [],
    artifactVersion: 1,
    readBackCommands,
    pageTargets,
    targets: {
      publicAppUrl,
      profileId: env(options.env, "KICKOFF_VERIFY_PROFILE_ID"),
      proofId: env(options.env, "KICKOFF_VERIFY_PROOF_ID"),
      modeIds,
      shareImageUrl: env(options.env, "KICKOFF_VERIFY_SHARE_IMAGE_URL"),
      modeShareImageUrl: env(options.env, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"),
    },
    acceptance: {
      publicAppUrlReady: Boolean(publicAppUrl),
      cleanSessionRestore,
      profileRender,
      proofRender,
      modeRenderCount,
      requiredModeRenderCount: requiredModeTargetCount,
      cleanSessionProfileIds: cleanSessionIds.filter((id) => id === env(options.env, "KICKOFF_VERIFY_PROFILE_ID")),
      cleanSessionProofIds: cleanSessionIds.filter((id) => id === env(options.env, "KICKOFF_VERIFY_PROOF_ID")),
      cleanSessionModeIds: cleanSessionIds.filter((id) => modeIds.includes(id)),
      shareImageReadBack,
      modeShareImageReadBack,
      outputEnvKeys: [
        "VITE_PUBLIC_APP_URL",
        "KICKOFF_VERIFY_PROFILE_ID",
        "KICKOFF_VERIFY_PROOF_ID",
        "KICKOFF_VERIFY_MODE_IDS",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ],
    },
  };
};
