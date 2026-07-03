import { normalizePublicAppUrl } from "./publicUrls";
import { publicRenderExpectation, type PublicRenderKind } from "./productionEvidence";

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

export type RenderedPublicPage = {
  text: string;
  canonical: string;
  ogTitle: string;
  ogImage: string;
  twitterCard: string;
  jsonLd: string;
};

export type PublicPageRenderer = (url: string) => Promise<RenderedPublicPage>;

type FetchLike = typeof fetch;

const env = (values: SharingDoctorEnv, key: string) => values[key]?.trim() ?? "";
const has = (values: SharingDoctorEnv, key: string) => env(values, key).length > 0;

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
  if (kind === "mode") return "Set KICKOFF_VERIFY_MODE_ID to a synced mode proof run id with a share manifest.";
  return "Set KICKOFF_VERIFY_PROOF_ID to a synced prediction capsule id with a share manifest.";
};

const checkRenderedPage = async (
  values: SharingDoctorEnv,
  renderer: PublicPageRenderer | undefined,
  checks: SharingDoctorCheck[],
  kind: PublicRenderKind,
) => {
  const publicAppUrl = normalizePublicAppUrl(env(values, "VITE_PUBLIC_APP_URL"));
  const targetKey = targetKeyFor(kind);
  const targetId = env(values, targetKey);
  const url = publicShareUrl(publicAppUrl, kind, targetId);

  addCheck(checks, {
    id: `${kind}-target-id`,
    label: targetLabelFor(kind),
    required: true,
    passed: Boolean(targetId),
    detail: targetId || `${targetKey} missing`,
    action: actionFor(kind),
  });

  if (!url) {
    addCheck(checks, {
      id: `${kind}-render`,
      label: renderLabelFor(kind),
      required: true,
      detail: "URL not configured",
      action: publicAppUrl ? actionFor(kind) : "Set VITE_PUBLIC_APP_URL to the deployed HTTPS app URL.",
    });
    return;
  }
  if (!renderer) {
    addCheck(checks, {
      id: `${kind}-render`,
      label: renderLabelFor(kind),
      required: true,
      detail: "Renderer not configured",
      action: "Install Playwright Chromium or run in an environment where the sharing doctor can render public pages.",
      url,
      sampleIds: [targetId],
    });
    return;
  }
  try {
    const snapshot = await renderer(url);
    const expectation = publicRenderExpectation(kind, targetId);
    const pageText = [
      snapshot.text,
      snapshot.canonical,
      snapshot.ogTitle,
      snapshot.ogImage,
      snapshot.twitterCard,
      snapshot.jsonLd,
    ].join("\n");
    const missing = expectation.requiredText.filter((text) => !pageText.includes(text));
    const forbidden = expectation.forbiddenText.filter((text) => pageText.includes(text));
    const canonical = new URL(snapshot.canonical || url);
    const canonicalTarget = canonical.searchParams.get(expectation.queryKey);
    const canonicalOk = canonicalTarget === expectation.targetId;
    const socialOk = Boolean(snapshot.ogTitle && snapshot.ogImage && snapshot.twitterCard === "summary_large_image" && snapshot.jsonLd);
    const passed = missing.length === 0 && forbidden.length === 0 && canonicalOk && socialOk;
    addCheck(checks, {
      id: `${kind}-render`,
      label: renderLabelFor(kind),
      required: true,
      passed,
      detail: passed
        ? `rendered ${kind} page with canonical URL, social metadata and JSON-LD`
        : [
            missing.length > 0 ? `missing ${missing.join(", ")}` : "",
            forbidden.length > 0 ? `forbidden ${forbidden.join(", ")}` : "",
            canonicalOk ? "" : `canonical ${expectation.queryKey} mismatch`,
            socialOk ? "" : "social metadata incomplete",
          ]
            .filter(Boolean)
            .join("; "),
      action: actionFor(kind),
      url,
      sampleIds: [targetId],
    });
  } catch (error) {
    addCheck(checks, {
      id: `${kind}-render`,
      label: renderLabelFor(kind),
      required: true,
      detail: String(error),
      action: actionFor(kind),
      url,
      sampleIds: [targetId],
    });
  }
};

const checkShareImage = async (
  values: SharingDoctorEnv,
  fetcher: FetchLike,
  checks: SharingDoctorCheck[],
) => {
  const imageUrl = env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  if (!imageUrl) {
    addCheck(checks, {
      id: "share-image-public-read",
      label: "Public share image read",
      required: true,
      detail: "KICKOFF_VERIFY_SHARE_IMAGE_URL missing",
      action: "Generate a share card PNG, upload it to Supabase Storage and set KICKOFF_VERIFY_SHARE_IMAGE_URL.",
    });
    return;
  }
  try {
    const response = await fetcher(imageUrl, { method: "GET" });
    const contentType = response.headers.get("content-type") ?? "";
    const length = Number(response.headers.get("content-length") ?? 0);
    addCheck(checks, {
      id: "share-image-public-read",
      label: "Public share image read",
      required: true,
      passed: response.ok && contentType.startsWith("image/"),
      detail: response.ok ? `${contentType || "unknown content-type"}${length > 0 ? ` · ${length} bytes` : ""}` : `HTTP ${response.status}`,
      action: "Ensure the URL points to a public Supabase Storage image object.",
      url: imageUrl,
    });
  } catch (error) {
    addCheck(checks, {
      id: "share-image-public-read",
      label: "Public share image read",
      required: true,
      detail: String(error),
      action: "Ensure the URL points to a public Supabase Storage image object.",
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

  await Promise.all(
    (["profile", "proof", "mode"] as const).map((kind) =>
      checkRenderedPage(values, options.renderer, checks, kind),
    ),
  );
  await checkShareImage(values, options.fetcher ?? fetch, checks);

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

