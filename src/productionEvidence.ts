import { summarizeAcceptanceRunEvidence } from "./acceptance";

export type ProductionEvidenceCategory =
  | "runtime"
  | "public-app"
  | "supabase"
  | "data"
  | "filecoin"
  | "sharing";

export type ProductionEvidenceStatus = "passed" | "failed" | "warning" | "skipped";

export type ProductionEvidenceCheck = {
  id: string;
  category: ProductionEvidenceCategory;
  label: string;
  required: boolean;
  status: ProductionEvidenceStatus;
  detail: string;
  checkedAt: string;
  url?: string;
  action?: string;
  sampleIds?: string[];
};

export type ProductionEvidencePacket = {
  generatedAt: string;
  source: "local-script" | "ci" | "manual";
  strict: boolean;
  envFiles?: string[];
  checks: ProductionEvidenceCheck[];
};

export type PublicAppRootReadinessInput = {
  responseOk?: boolean;
  status?: number;
  textOk?: boolean;
  error?: string;
  deploymentEvidencePassed?: boolean;
  deploymentEvidenceDetail?: string;
};

export type PublicAppRootReadiness = {
  passed: boolean;
  detail: string;
};

export type PublicAcceptanceEvidenceDiagnosis = {
  passed: boolean;
  detail: string;
  action: string;
  expectedSuiteManifestHash?: string;
  suiteManifestHash?: string;
  missingSuiteIds: string[];
  failedSuiteIds: string[];
  commandMismatches: string[];
  evidenceStale: boolean;
  manifestHashMismatch: boolean;
};

export type ProductionVerifyTargets = {
  userId?: string;
  profileId?: string;
  publicProfileUrl?: string;
  proofId?: string;
  modeId?: string;
  modeIds?: string[];
  shareArtifactIds?: string[];
  filecoinRecordCid?: string;
  filecoinRecordJobId?: string;
  filecoinRecordPayloadHash?: string;
  filecoinModeCid?: string;
  filecoinModeJobIds?: string[];
  filecoinModePayloadHash?: string;
  filecoinModeCids?: string[];
  filecoinModePayloadHashes?: string[];
  friendCode?: string;
  seasonKey?: string;
  leaderboardScopes?: string[];
  fixtureId?: string;
  fixtureIds?: string[];
  fixtureSignalMatrix?: string;
  shareImageUrl?: string;
  modeShareImageUrl?: string;
  allowFailures?: boolean;
};

export const PRODUCTION_VERIFY_ENV_KEYS = [
  "KICKOFF_VERIFY_USER_ID",
  "KICKOFF_VERIFY_PROFILE_ID",
  "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
  "KICKOFF_VERIFY_PROOF_ID",
  "KICKOFF_VERIFY_MODE_ID",
  "KICKOFF_VERIFY_MODE_IDS",
  "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
  "KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID",
  "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
  "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
  "KICKOFF_VERIFY_FILECOIN_MODE_CID",
  "KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS",
  "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH",
  "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
  "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
  "KICKOFF_VERIFY_FRIEND_CODE",
  "KICKOFF_VERIFY_SEASON_KEY",
  "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
  "KICKOFF_VERIFY_FIXTURE_ID",
  "KICKOFF_VERIFY_FIXTURE_IDS",
  "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
  "KICKOFF_VERIFY_SHARE_IMAGE_URL",
  "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
  "KICKOFF_VERIFY_ALLOW_FAILURES",
] as const;

export type ProductionVerifyEnvKey = (typeof PRODUCTION_VERIFY_ENV_KEYS)[number];

export type ProductionVerifyEnvMergeResult = {
  values: Record<ProductionVerifyEnvKey, string>;
  text: string;
  presentKeys: ProductionVerifyEnvKey[];
  missingKeys: ProductionVerifyEnvKey[];
};

export type ProductionTargetEnvContract = {
  passed: boolean;
  detail: string;
  action: string;
  problems: string[];
  sampleIds: string[];
};

const envListValue = (value?: string) =>
  String(value ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const deployedHttpsUrlProblem = (value?: string) => {
  if (!value) return "KICKOFF_VERIFY_PUBLIC_PROFILE_URL missing";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "KICKOFF_VERIFY_PUBLIC_PROFILE_URL must be HTTPS";
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname) || url.hostname.endsWith(".localhost")) {
      return "KICKOFF_VERIFY_PUBLIC_PROFILE_URL must be deployed, not localhost";
    }
    return "";
  } catch {
    return "KICKOFF_VERIFY_PUBLIC_PROFILE_URL must be a valid URL";
  }
};

const profileUrlMatches = (urlText: string | undefined, profileId: string | undefined) => {
  if (!urlText || !profileId) return false;
  try {
    const url = new URL(urlText);
    return url.searchParams.get("profile") === profileId || decodeURIComponent(url.pathname).includes(profileId);
  } catch {
    return false;
  }
};

export const evaluateProductionTargetEnvContract = (
  values: Partial<Record<ProductionVerifyEnvKey, string>>,
): ProductionTargetEnvContract => {
  const profileId = values.KICKOFF_VERIFY_PROFILE_ID?.trim();
  const proofId = values.KICKOFF_VERIFY_PROOF_ID?.trim();
  const publicProfileUrl = values.KICKOFF_VERIFY_PUBLIC_PROFILE_URL?.trim();
  const modeIds = envListValue(values.KICKOFF_VERIFY_MODE_IDS);
  const shareArtifactIds = envListValue(values.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS);
  const leaderboardScopes = envListValue(values.KICKOFF_VERIFY_LEADERBOARD_SCOPES).map((scope) => scope.toLowerCase());
  const requiredScopes = ["global", "friend", "season"];
  const requiredShareArtifactIds = [
    proofId ? `record:${proofId}` : "",
    ...modeIds.map((modeId) => `mode:${modeId}`),
  ].filter(Boolean);
  const problems = [
    profileId ? "" : "KICKOFF_VERIFY_PROFILE_ID missing",
    deployedHttpsUrlProblem(publicProfileUrl),
    publicProfileUrl && profileId && !profileUrlMatches(publicProfileUrl, profileId)
      ? "KICKOFF_VERIFY_PUBLIC_PROFILE_URL does not point at KICKOFF_VERIFY_PROFILE_ID"
      : "",
    proofId ? "" : "KICKOFF_VERIFY_PROOF_ID missing",
    modeIds.length > 0 ? "" : "KICKOFF_VERIFY_MODE_IDS missing",
    shareArtifactIds.length > 0 ? "" : "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS missing",
    ...requiredShareArtifactIds
      .filter((id) => shareArtifactIds.length > 0 && !shareArtifactIds.includes(id))
      .map((id) => `KICKOFF_VERIFY_SHARE_ARTIFACT_IDS missing ${id}`),
    ...shareArtifactIds
      .filter((id) => !/^(record|mode):[^,\s]+$/.test(id))
      .map((id) => `KICKOFF_VERIFY_SHARE_ARTIFACT_IDS invalid ${id}`),
    ...requiredScopes
      .filter((scope) => !leaderboardScopes.includes(scope))
      .map((scope) => `KICKOFF_VERIFY_LEADERBOARD_SCOPES missing ${scope}`),
  ].filter(Boolean);

  return {
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `Target env binds profile ${profileId}, ${requiredShareArtifactIds.length} share artifact ids and global/friend/season leaderboard scopes.`
        : problems.join("; "),
    action:
      "Copy the Account view production env block after cloud sync/share card generation, then keep public profile URL, share artifact ids and leaderboard scopes aligned with the target profile.",
    problems,
    sampleIds: [profileId, proofId, ...modeIds, ...shareArtifactIds].filter((item): item is string => Boolean(item)),
  };
};

export const buildCacheBustedPublicEvidenceUrl = (
  publicAppUrl: string,
  artifactPath: string,
  cacheToken: string | number = Date.now(),
) => {
  const url = new URL(artifactPath, publicAppUrl);
  url.searchParams.set("_kickoff_evidence", String(cacheToken));
  return url.toString();
};

export const publicEvidenceNoStoreFetchOptions = (): RequestInit => ({
  cache: "no-store",
  headers: {
    "cache-control": "no-cache",
    pragma: "no-cache",
  },
});

export const evaluatePublicAppRootReadiness = ({
  responseOk,
  status,
  textOk = true,
  error,
  deploymentEvidencePassed,
  deploymentEvidenceDetail,
}: PublicAppRootReadinessInput): PublicAppRootReadiness => {
  if (responseOk && textOk) return { passed: true, detail: `HTTP ${status ?? 200}` };
  if (responseOk && !textOk) return { passed: false, detail: `HTTP ${status ?? 200}, expected text missing` };
  if (status) return { passed: false, detail: `HTTP ${status}` };
  if (deploymentEvidencePassed) {
    return {
      passed: true,
      detail: [
        "published deployment evidence confirms live index and hashed assets",
        error ? `direct root fetch failed: ${error}` : status ? `direct root HTTP ${status}` : "",
        deploymentEvidenceDetail ? `deployment: ${deploymentEvidenceDetail}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    };
  }
  return { passed: false, detail: error || "public app root could not be fetched" };
};

export const diagnosePublicAcceptanceEvidence = (
  body: unknown,
  responseOk = true,
  status = 200,
): PublicAcceptanceEvidenceDiagnosis => {
  if (!responseOk) {
    return {
      passed: false,
      detail: `HTTP ${status}`,
      action: "Deploy acceptance-evidence.json with the latest dist build.",
      missingSuiteIds: [],
      failedSuiteIds: [],
      commandMismatches: [],
      evidenceStale: false,
      manifestHashMismatch: false,
    };
  }

  const summary = summarizeAcceptanceRunEvidence(body as any);
  const base = `${summary.passed}/${summary.total} suites`;
  const redeployAction = "Run bun run verify:acceptance, then build and deploy the updated dist/acceptance-evidence.json.";
  const rerunAction = "Run bun run verify:acceptance again before deploying.";

  if (summary.complete) {
    return {
      passed: true,
      detail: `${base}, ${summary.suiteManifestHash}`,
      action: "Published acceptance evidence matches the current suite manifest.",
      expectedSuiteManifestHash: summary.expectedSuiteManifestHash,
      suiteManifestHash: summary.suiteManifestHash,
      missingSuiteIds: summary.missingSuiteIds,
      failedSuiteIds: summary.failedSuiteIds,
      commandMismatches: summary.commandMismatches,
      evidenceStale: summary.evidenceStale,
      manifestHashMismatch: summary.manifestHashMismatch,
    };
  }

  const problem = summary.manifestHashMismatch
    ? `manifest mismatch: expected ${summary.expectedSuiteManifestHash}, published ${summary.suiteManifestHash ?? "missing"}`
    : summary.evidenceStale
      ? "evidence older than 7 days"
      : summary.failedSuiteIds.length > 0
        ? `failed ${summary.failedSuiteIds.join(", ")}`
        : summary.commandMismatches.length > 0
          ? `command mismatch ${summary.commandMismatches.join(", ")}`
          : summary.missingSuiteIds.length > 0
            ? `missing ${summary.missingSuiteIds.join(", ")}`
            : "not complete";

  return {
    passed: false,
    detail: `${base}, ${problem}`,
    action: summary.manifestHashMismatch ? redeployAction : rerunAction,
    expectedSuiteManifestHash: summary.expectedSuiteManifestHash,
    suiteManifestHash: summary.suiteManifestHash,
    missingSuiteIds: summary.missingSuiteIds,
    failedSuiteIds: summary.failedSuiteIds,
    commandMismatches: summary.commandMismatches,
    evidenceStale: summary.evidenceStale,
    manifestHashMismatch: summary.manifestHashMismatch,
  };
};

export type PublicRenderKind = "profile" | "proof" | "mode";

export type PublicRenderExpectation = {
  kind: PublicRenderKind;
  queryKey: PublicRenderKind;
  targetId: string;
  requiredText: string[];
  forbiddenText: string[];
};

export type PublicRenderSnapshot = {
  text: string;
  canonical: string;
  ogTitle: string;
  jsonLd: string;
  ogImage?: string;
  twitterCard?: string;
  publicKind?: string;
  publicTarget?: string;
  publicSource?: string;
};

type PublicRenderSnapshotNode = {
  getAttribute(name: string): string | null;
  textContent?: string | null;
};

type PublicRenderSnapshotDocument = {
  body?: { innerText?: string } | null;
  querySelector(selector: string): PublicRenderSnapshotNode | null;
};

export const extractPublicRenderSnapshot = (
  doc: PublicRenderSnapshotDocument = document,
): PublicRenderSnapshot => {
  const attr = (selector: string, name: string) => doc.querySelector(selector)?.getAttribute(name) ?? "";
  const publicNode = doc.querySelector("[data-kickoff-public-kind]");
  return {
    text: doc.body?.innerText ?? "",
    canonical: attr('link[rel="canonical"]', "href"),
    ogTitle: attr('meta[property="og:title"]', "content"),
    ogImage: attr('meta[property="og:image"]', "content"),
    twitterCard: attr('meta[name="twitter:card"]', "content"),
    jsonLd: doc.querySelector('script[data-kickoff-public-proof="jsonld"]')?.textContent ?? "",
    publicKind: publicNode?.getAttribute("data-kickoff-public-kind") ?? "",
    publicTarget: publicNode?.getAttribute("data-kickoff-public-target") ?? "",
    publicSource: publicNode?.getAttribute("data-kickoff-public-source") ?? "",
  };
};

export type PublicRenderEvaluation = {
  passed: boolean;
  detail: string;
  missing: string[];
  forbidden: string[];
  canonicalOk: boolean;
  publicTargetOk?: boolean;
  socialOk?: boolean;
  cloudLoaded?: boolean;
};

export type CleanSessionPublicRenderResult = Pick<PublicRenderEvaluation, "passed" | "detail"> & {
  kind: PublicRenderKind;
  targetId?: string;
  url?: string;
  cloudLoaded: boolean;
  canonicalOk?: boolean;
  publicTargetOk?: boolean;
  socialOk?: boolean;
  shareImageMatched?: boolean;
  structuredImageMatched?: boolean;
};

export type CleanSessionRestoreEvaluation = {
  passed: boolean;
  detail: string;
  missingKinds: PublicRenderKind[];
  missingTargets: Array<{ kind: PublicRenderKind; targetId: string; detail: string }>;
};

export type CleanSessionRestoreExpectation = Partial<Record<PublicRenderKind, string[]>>;

export type LeaderboardEvidenceScope = "global" | "friend" | "season";

export type LeaderboardScopeRowsEvaluation = {
  passed: boolean;
  detail: string;
  sampleIds: string[];
  rankKey: "global_rank" | "friend_rank" | "season_rank";
  rankValue?: number;
};

export const leaderboardRankKeyForScope = (scope: LeaderboardEvidenceScope) => {
  if (scope === "friend") return "friend_rank";
  if (scope === "season") return "season_rank";
  return "global_rank";
};

const idsFromLeaderboardRows = (rows: any[]) =>
  rows.map((row) => String(row?.id ?? "")).filter(Boolean).slice(0, 5);

export const evaluateLeaderboardScopeRows = (
  rows: any[],
  options: {
    userId: string;
    scope: LeaderboardEvidenceScope;
    scopeTarget?: { key: "friend_code" | "season_key"; value: string };
  },
): LeaderboardScopeRowsEvaluation => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const rankKey = leaderboardRankKeyForScope(options.scope);
  const currentUserRows = options.userId ? safeRows.filter((row) => row.id === options.userId) : [];
  const scopedRow = options.scopeTarget
    ? currentUserRows.find((row) => String(row?.[options.scopeTarget?.key ?? ""] ?? "") === options.scopeTarget?.value)
    : currentUserRows[0];
  const currentUserPresent = Boolean(scopedRow);
  const rankValue = Number(scopedRow?.[rankKey]);
  const rankReady = currentUserPresent && Number.isInteger(rankValue) && rankValue > 0;
  const scopeDetail = options.scopeTarget
    ? `; ${options.scopeTarget.key} ${currentUserPresent ? "matched" : "missing"}`
    : "";
  const rankDetail = currentUserPresent ? `; ${rankKey} ${rankReady ? `#${rankValue}` : "missing"}` : "";
  const missingEnv = options.scopeTarget
    ? `KICKOFF_VERIFY_USER_ID or ${options.scopeTarget.key === "friend_code" ? "KICKOFF_VERIFY_FRIEND_CODE" : "KICKOFF_VERIFY_SEASON_KEY"} missing`
    : "KICKOFF_VERIFY_USER_ID missing";
  return {
    passed: currentUserPresent && rankReady,
    detail: options.userId
      ? `${safeRows.length} ${options.scope} row${safeRows.length === 1 ? "" : "s"}; current user ${
          currentUserPresent ? "present" : "missing"
        }${scopeDetail}${rankDetail}`
      : missingEnv,
    sampleIds: idsFromLeaderboardRows(safeRows),
    rankKey,
    rankValue: rankReady ? rankValue : undefined,
  };
};

export const publicRenderExpectation = (
  kind: PublicRenderKind,
  targetId: string,
): PublicRenderExpectation => {
  if (kind === "profile") {
    return {
      kind,
      queryKey: "profile",
      targetId,
      requiredText: ["Latest proof capsules", "Tournament mode runs", "Verifier packet", "Social metadata", "share cards"],
      forbiddenText: ["Profile unavailable", "needs share card"],
    };
  }
  if (kind === "mode") {
    return {
      kind,
      queryKey: "mode",
      targetId,
      requiredText: ["Mode proof verification", "Mode proof facts", "Proof timeline", "Verifier packet", "Social metadata", targetId],
      forbiddenText: ["No share manifest yet", "Cloud mode proof loaded. No share manifest"],
    };
  }
  return {
    kind,
    queryKey: "proof",
    targetId,
    requiredText: ["Proof verification", "Proof facts", "Proof timeline", "Verifier packet", "Social metadata", "Prediction", targetId],
    forbiddenText: ["No share manifest yet", "Cloud proof loaded. No share manifest"],
  };
};

export const publicRenderCloudLoaded = (
  kind: PublicRenderKind,
  snapshot: Pick<PublicRenderSnapshot, "text" | "publicKind" | "publicSource">,
) => {
  if (snapshot.publicSource) {
    return snapshot.publicKind === kind && snapshot.publicSource === "cloud";
  }
  const text = snapshot.text.toLocaleLowerCase();
  if (/fixture fallback|local-only|local only|seed fallback|preview fixture/.test(text)) return false;
  if (kind === "profile") return text.includes("cloud profile loaded");
  if (kind === "mode") return text.includes("cloud mode proof and share manifest loaded");
  return text.includes("cloud proof and share manifest loaded");
};

const publicHttpsUrl = (value?: string) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname) &&
      !url.hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
};

const socialImageReady = (kind: PublicRenderKind, imageUrl?: string) => {
  if (!publicHttpsUrl(imageUrl)) return false;
  if (kind === "profile") return true;
  return !/\/assets\/kickoff-lock-icon(?:-[0-9]+)?\.png(?:$|\?)/.test(new URL(imageUrl!).pathname);
};

const parseJsonLd = (jsonLd: string) => {
  try {
    return JSON.parse(jsonLd);
  } catch {
    return undefined;
  }
};

const jsonLdIncludesTarget = (jsonLd: string, targetId: string) =>
  JSON.stringify(parseJsonLd(jsonLd) ?? {}).toLocaleLowerCase().includes(targetId.toLocaleLowerCase());

const jsonLdShareImageEvidenceReady = (kind: PublicRenderKind, jsonLd: string, imageUrl?: string) => {
  if (kind === "profile") return true;
  if (!imageUrl) return false;
  const parsed = parseJsonLd(jsonLd);
  const media = parsed?.associatedMedia;
  if (!media || typeof media !== "object") return false;
  const mediaUrl = String(media.contentUrl ?? media.url ?? "");
  const sameImage = mediaUrl === imageUrl;
  const hashReady = /^[a-f0-9]{64}$/i.test(String(media.sha256 ?? ""));
  const sizeReady = Number(media.contentSize) > 0;
  const mimeReady = String(media.encodingFormat ?? "").toLowerCase().startsWith("image/");
  return sameImage && hashReady && sizeReady && mimeReady;
};

export const evaluatePublicRenderSnapshot = (
  kind: PublicRenderKind,
  targetId: string,
  snapshot: PublicRenderSnapshot,
  fallbackUrl: string,
  options: { requireSocial?: boolean; requireCloudLoaded?: boolean } = {},
): PublicRenderEvaluation => {
  const expectation = publicRenderExpectation(kind, targetId);
  const pageText = [
    snapshot.text,
    snapshot.canonical,
    snapshot.ogTitle,
    snapshot.ogImage ?? "",
    snapshot.twitterCard ?? "",
    snapshot.jsonLd,
  ].join("\n");
  const searchable = pageText.toLocaleLowerCase();
  const missing = expectation.requiredText.filter((text) => !searchable.includes(text.toLocaleLowerCase()));
  const forbidden = expectation.forbiddenText.filter((text) => searchable.includes(text.toLocaleLowerCase()));
  const canonical = new URL(snapshot.canonical || fallbackUrl);
  const canonicalTarget = canonical.searchParams.get(expectation.queryKey);
  const canonicalOk = canonicalTarget === expectation.targetId;
  const publicTargetOk = !snapshot.publicTarget || snapshot.publicTarget === targetId;
  const socialOk = Boolean(
      snapshot.ogTitle &&
      socialImageReady(kind, snapshot.ogImage) &&
      snapshot.twitterCard === "summary_large_image" &&
      jsonLdIncludesTarget(snapshot.jsonLd, targetId) &&
      jsonLdShareImageEvidenceReady(kind, snapshot.jsonLd, snapshot.ogImage),
  );
  const cloudLoaded = publicRenderCloudLoaded(kind, snapshot);
  const passed =
    missing.length === 0 &&
    forbidden.length === 0 &&
    canonicalOk &&
    publicTargetOk &&
    (!options.requireSocial || socialOk) &&
    (!options.requireCloudLoaded || cloudLoaded);
  return {
    passed,
    missing,
    forbidden,
    canonicalOk,
    publicTargetOk,
    socialOk,
    cloudLoaded,
    detail: passed
      ? `rendered ${kind} proof page for ${targetId}`
      : [
          missing.length > 0 ? `missing ${missing.join(", ")}` : "",
          forbidden.length > 0 ? `forbidden ${forbidden.join(", ")}` : "",
          canonicalOk ? "" : `canonical ${expectation.queryKey} mismatch`,
          publicTargetOk ? "" : `public target ${snapshot.publicTarget} mismatch`,
          !options.requireSocial || socialOk ? "" : "social metadata incomplete",
          !options.requireCloudLoaded || cloudLoaded ? "" : "cloud content not loaded",
        ]
          .filter(Boolean)
          .join("; "),
  };
};

export const evaluateCleanSessionRestoreResults = (
  results: CleanSessionPublicRenderResult[],
  expectedTargets: CleanSessionRestoreExpectation = {},
): CleanSessionRestoreEvaluation => {
  const requiredKinds: PublicRenderKind[] = ["profile", "proof", "mode"];
  const expectedIdsFor = (kind: PublicRenderKind) => [
    ...new Set((expectedTargets[kind] ?? []).map((targetId) => targetId.trim()).filter(Boolean)),
  ];
  const resultMetadataReady = (result: CleanSessionPublicRenderResult) =>
    result.canonicalOk !== false &&
    result.publicTargetOk !== false &&
    result.socialOk !== false &&
    result.shareImageMatched !== false &&
    result.structuredImageMatched !== false;
  const resultReady = (result: CleanSessionPublicRenderResult) =>
    result.passed && result.cloudLoaded && publicHttpsUrl(result.url) && resultMetadataReady(result);
  const targetProblemDetail = (result?: CleanSessionPublicRenderResult) => {
    if (!result) return "not rendered";
    if (!result.cloudLoaded) return "fixture fallback or local-only page rendered";
    if (!publicHttpsUrl(result.url)) return "non-production public URL";
    if (result.canonicalOk === false) return "canonical URL mismatch";
    if (result.publicTargetOk === false) return "public target mismatch";
    if (result.shareImageMatched === false) {
      return result.detail.includes("expected share image") ? result.detail : "share image mismatch";
    }
    if (result.structuredImageMatched === false) {
      return result.detail.includes("JSON-LD") ? result.detail : "structured image metadata mismatch";
    }
    if (result.socialOk === false) return "social metadata incomplete";
    return result.detail;
  };
  const targetProblems = requiredKinds.flatMap((kind) => {
    const expectedIds = expectedIdsFor(kind);
    if (expectedIds.length === 0) return [];
    const kindResults = results.filter((result) => result.kind === kind);
    return expectedIds
      .map((targetId) => {
        const targetResults = kindResults.filter((result) => result.targetId === targetId);
        const failedTarget = targetResults.find((result) => !resultReady(result));
        if (failedTarget) return { kind, targetId, detail: targetProblemDetail(failedTarget) };
        if (!targetResults.some(resultReady)) return { kind, targetId, detail: "not rendered" };
        return undefined;
      })
      .filter((problem): problem is { kind: PublicRenderKind; targetId: string; detail: string } => Boolean(problem));
  });
  const cleanSessionReady = (kind: PublicRenderKind) => {
    const kindResults = results.filter((result) => result.kind === kind);
    const expectedIds = expectedIdsFor(kind);
    if (expectedIds.length === 0) return kindResults.length > 0 && kindResults.every(resultReady);
    return (
      expectedIds.every((targetId) =>
        kindResults.some((result) => result.targetId === targetId && resultReady(result)),
      ) &&
      kindResults
        .filter((result) => result.targetId && expectedIds.includes(result.targetId))
        .every(resultReady)
    );
  };
  const missingKinds = requiredKinds.filter((kind) => !cleanSessionReady(kind));
  const expectedSummary = requiredKinds
    .map((kind) => {
      const expectedIds = expectedIdsFor(kind);
      if (expectedIds.length === 0) return "";
      const readyCount = expectedIds.filter((targetId) =>
        results.some((result) => result.kind === kind && result.targetId === targetId && resultReady(result)),
      ).length;
      return `${kind} ${readyCount}/${expectedIds.length}`;
    })
    .filter(Boolean)
    .join(" · ");
  return {
    passed: missingKinds.length === 0,
    missingKinds,
    missingTargets: targetProblems,
    detail:
      missingKinds.length === 0
        ? [
            "cloud profile, prediction proof and mode proof pages rendered in a clean browser context without localStorage",
            expectedSummary ? `(${expectedSummary})` : "",
          ]
            .filter(Boolean)
            .join(" ")
        : targetProblems.length > 0
          ? `clean-session cloud restore missing ${targetProblems
              .map((problem) => `${problem.kind}:${problem.targetId} (${problem.detail})`)
              .join("; ")}`
        : `clean-session cloud restore missing ${missingKinds
            .map((kind) => {
              const result =
                results.find((item) => item.kind === kind && !resultReady(item)) ??
                results.find((item) => item.kind === kind);
              return result
                ? `${kind} (${targetProblemDetail(result)})`
                : kind;
            })
            .join("; ")}`,
  };
};

export const productionFriendCode = (location?: string, email?: string) =>
  (location || email?.split("@")[1] || "global")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "global";

const envValue = (value?: string | boolean) => {
  if (typeof value === "boolean") return value ? "1" : "0";
  const text = value ?? "";
  return /^[A-Za-z0-9_./:@-]*$/.test(text) ? text : JSON.stringify(text);
};

export const buildProductionVerifyEnv = (targets: ProductionVerifyTargets) => {
  const values: Array<[ProductionVerifyEnvKey, string | boolean | undefined]> = [
    ["KICKOFF_VERIFY_USER_ID", targets.userId],
    ["KICKOFF_VERIFY_PROFILE_ID", targets.profileId],
    ["KICKOFF_VERIFY_PUBLIC_PROFILE_URL", targets.publicProfileUrl],
    ["KICKOFF_VERIFY_PROOF_ID", targets.proofId],
    ["KICKOFF_VERIFY_MODE_ID", targets.modeId],
    ["KICKOFF_VERIFY_MODE_IDS", targets.modeIds?.join(",")],
    ["KICKOFF_VERIFY_SHARE_ARTIFACT_IDS", targets.shareArtifactIds?.join(",")],
    ["KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID", targets.filecoinRecordJobId],
    ["KICKOFF_VERIFY_FILECOIN_RECORD_CID", targets.filecoinRecordCid],
    ["KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH", targets.filecoinRecordPayloadHash],
    ["KICKOFF_VERIFY_FILECOIN_MODE_CID", targets.filecoinModeCid],
    ["KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS", targets.filecoinModeJobIds?.join(",")],
    ["KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH", targets.filecoinModePayloadHash],
    ["KICKOFF_VERIFY_FILECOIN_MODE_CIDS", targets.filecoinModeCids?.join(",")],
    ["KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES", targets.filecoinModePayloadHashes?.join(",")],
    ["KICKOFF_VERIFY_FRIEND_CODE", targets.friendCode],
    ["KICKOFF_VERIFY_SEASON_KEY", targets.seasonKey ?? "world-cup-run"],
    ["KICKOFF_VERIFY_LEADERBOARD_SCOPES", targets.leaderboardScopes?.join(",") ?? "global,friend,season"],
    ["KICKOFF_VERIFY_FIXTURE_ID", targets.fixtureId],
    ["KICKOFF_VERIFY_FIXTURE_IDS", targets.fixtureIds?.join(",")],
    ["KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX", targets.fixtureSignalMatrix],
    ["KICKOFF_VERIFY_SHARE_IMAGE_URL", targets.shareImageUrl],
    ["KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL", targets.modeShareImageUrl],
    ["KICKOFF_VERIFY_ALLOW_FAILURES", targets.allowFailures ?? true],
  ];
  return `${values.map(([key, value]) => `${key}=${envValue(value)}`).join("\n")}\n`;
};

export const parseEnvText = (text: string) => {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    const rawValue = normalized.slice(separator + 1).trim();
    const quoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));
    const value = quoted ? rawValue.slice(1, -1) : rawValue.replace(/\s+#.*$/, "").trim();
    values[key] = value;
  }
  return values;
};

export const mergeProductionVerifyEnv = (
  envBlocks: string[],
  baseValues: Record<string, string | undefined> = {},
): ProductionVerifyEnvMergeResult => {
  const values = PRODUCTION_VERIFY_ENV_KEYS.reduce(
    (acc, key) => {
      acc[key] = baseValues[key]?.trim() ?? "";
      return acc;
    },
    {} as Record<ProductionVerifyEnvKey, string>,
  );

  for (const block of envBlocks) {
    const parsed = parseEnvText(block);
    for (const key of PRODUCTION_VERIFY_ENV_KEYS) {
      const value = parsed[key]?.trim();
      if (value) values[key] = value;
      else if (!(key in values)) values[key] = "";
    }
  }

  if (!values.KICKOFF_VERIFY_SEASON_KEY) values.KICKOFF_VERIFY_SEASON_KEY = "world-cup-run";
  if (!values.KICKOFF_VERIFY_PUBLIC_PROFILE_URL && values.KICKOFF_VERIFY_PROFILE_ID && baseValues.VITE_PUBLIC_APP_URL?.trim()) {
    try {
      const url = new URL(baseValues.VITE_PUBLIC_APP_URL.trim());
      if (url.protocol === "https:") {
        url.search = "";
        url.hash = "";
        url.searchParams.set("profile", values.KICKOFF_VERIFY_PROFILE_ID);
        values.KICKOFF_VERIFY_PUBLIC_PROFILE_URL = url.toString();
      }
    } catch {
      // Leave the target empty; the env ledger will report the public URL as missing.
    }
  }
  if (!values.KICKOFF_VERIFY_ALLOW_FAILURES) values.KICKOFF_VERIFY_ALLOW_FAILURES = "1";

  const presentKeys = PRODUCTION_VERIFY_ENV_KEYS.filter((key) => values[key]);
  const missingKeys = PRODUCTION_VERIFY_ENV_KEYS.filter((key) => !values[key]);
  const text = `${PRODUCTION_VERIFY_ENV_KEYS.map((key) => `${key}=${envValue(values[key])}`).join("\n")}\n`;
  return { values, text, presentKeys, missingKeys };
};

export const productionCheckPassed = (check: ProductionEvidenceCheck) => check.status === "passed";

export const summarizeProductionEvidence = (packet?: ProductionEvidencePacket) => {
  const checks = packet?.checks ?? [];
  const required = checks.filter((check) => check.required);
  const optional = checks.filter((check) => !check.required);
  const requiredPassed = required.filter(productionCheckPassed).length;
  const optionalPassed = optional.filter(productionCheckPassed).length;
  const failedRequired = required.filter((check) => check.status === "failed");
  const openRequired = required.filter((check) => check.status !== "passed");
  return {
    generatedAt: packet?.generatedAt,
    loaded: Boolean(packet),
    requiredPassed,
    requiredTotal: required.length,
    optionalPassed,
    optionalTotal: optional.length,
    failedRequired,
    openRequired,
    complete: required.length > 0 && requiredPassed === required.length,
  };
};
