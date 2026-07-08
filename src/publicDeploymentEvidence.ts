import { normalizePublicAppUrl } from "./publicUrls";

export type PublicDeploymentCheck = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  url?: string;
};

export type PublicDeploymentEvidencePacket = {
  generatedAt: string;
  source: "local-script" | "manual" | "ci";
  ready: boolean;
  publicAppUrl: string;
  expectedCommit?: string;
  pagesBuildStatus?: string;
  pagesBuildCommit?: string;
  pagesBuildError?: string;
  liveBundle?: string;
  expectedBundle?: string;
  liveStylesheet?: string;
  expectedStylesheet?: string;
  checks: PublicDeploymentCheck[];
  summary: string;
  nextAction: string;
  copyText: string;
};

export type PublicDeploymentArtifactEvaluation = {
  passed: boolean;
  detail: string;
  sampleIds: string[];
};

export type PublicDeploymentEvidenceInput = {
  generatedAt?: string;
  source?: PublicDeploymentEvidencePacket["source"];
  publicAppUrl?: string;
  expectedCommit?: string;
  pagesBuildStatus?: string;
  pagesBuildCommit?: string;
  pagesBuildError?: string;
  liveIndexStatus?: number;
  liveIndexText?: string;
  expectedIndexText?: string;
  liveBundleStatus?: number;
  liveStylesheetStatus?: number;
  sameOriginDataProxy?: boolean;
  dataProxyHealthStatus?: number;
  dataProxyHealthText?: string;
  requireOddsProxyKey?: boolean;
  sameOriginSealProxy?: boolean;
  sealProxyHealthStatus?: number;
  sealProxyHealthText?: string;
};

export const extractBuiltAssetsFromIndex = (html = "") => {
  const assets = [...html.matchAll(/(?:src|href)=["'](?:[^"']*\/)?(assets\/index-[A-Za-z0-9_-]+\.(?:js|css))["']/g)].map(
    (match) => match[1],
  );
  return {
    bundle: assets.find((asset) => asset.endsWith(".js")),
    stylesheet: assets.find((asset) => asset.endsWith(".css")),
    assets,
  };
};

const httpOk = (status?: number) => Boolean(status && status >= 200 && status < 300);

const publicAssetUrl = (publicAppUrl: string, asset?: string) =>
  asset ? new URL(asset.replace(/^\//, ""), publicAppUrl).toString() : undefined;

const publicRootUrl = (publicAppUrl: string, path: string) => {
  if (!publicAppUrl) return undefined;
  return new URL(path, publicAppUrl).toString();
};

const parseJson = (text?: string) => {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
};

export const buildPublicDeploymentEvidencePacket = (
  input: PublicDeploymentEvidenceInput,
): PublicDeploymentEvidencePacket => {
  const publicAppUrl = normalizePublicAppUrl(input.publicAppUrl) ?? "";
  const liveAssets = extractBuiltAssetsFromIndex(input.liveIndexText);
  const expectedAssets = extractBuiltAssetsFromIndex(input.expectedIndexText);
  const liveBundle = liveAssets.bundle;
  const expectedBundle = expectedAssets.bundle;
  const liveStylesheet = liveAssets.stylesheet;
  const expectedStylesheet = expectedAssets.stylesheet;
  const bundleMatches = Boolean(expectedBundle && liveBundle && expectedBundle === liveBundle);
  const stylesheetMatches = Boolean(expectedStylesheet && liveStylesheet && expectedStylesheet === liveStylesheet);
  const publishedAssetsReady = Boolean(
    httpOk(input.liveIndexStatus) &&
      liveBundle &&
      liveStylesheet &&
      bundleMatches &&
      stylesheetMatches &&
      httpOk(input.liveBundleStatus) &&
      httpOk(input.liveStylesheetStatus),
  );
  const commitMatches = Boolean(
    input.expectedCommit &&
      input.pagesBuildCommit &&
      input.pagesBuildCommit.slice(0, input.expectedCommit.length) === input.expectedCommit,
  );
  const dataProxyHealth = parseJson(input.dataProxyHealthText);
  const sealProxyHealth = parseJson(input.sealProxyHealthText);
  const dataProxyServiceReady = dataProxyHealth?.service === "kickoff-data-proxy";
  const dataProxyApiFootballReady = dataProxyHealth?.apiFootballServerKey === true;
  const dataProxyOddsReady = !input.requireOddsProxyKey || dataProxyHealth?.oddsApiServerKey === true;
  const checks: PublicDeploymentCheck[] = [
    {
      key: "public-url",
      label: "Public app URL",
      passed: Boolean(publicAppUrl),
      detail: publicAppUrl || "missing valid HTTPS VITE_PUBLIC_APP_URL",
      url: publicAppUrl || undefined,
    },
    {
      key: "pages-build",
      label: "GitHub Pages build",
      passed: input.pagesBuildStatus === "built" || (input.pagesBuildStatus === "building" && publishedAssetsReady),
      detail: input.pagesBuildStatus
        ? `${input.pagesBuildStatus}${input.pagesBuildError ? ` · ${input.pagesBuildError}` : ""}${
            input.pagesBuildStatus === "building" && publishedAssetsReady ? " · live assets already match" : ""
          }`
        : "Pages build status unavailable",
    },
    {
      key: "pages-commit",
      label: "Pages commit",
      passed: !input.expectedCommit || commitMatches,
      detail: input.expectedCommit
        ? `expected ${input.expectedCommit} · Pages ${input.pagesBuildCommit ?? "unknown"}`
        : `Pages ${input.pagesBuildCommit ?? "unknown"}`,
    },
    {
      key: "live-index",
      label: "Live index",
      passed: httpOk(input.liveIndexStatus) && Boolean(liveBundle && liveStylesheet),
      detail: `HTTP ${input.liveIndexStatus ?? "missing"} · bundle ${liveBundle ?? "missing"} · css ${
        liveStylesheet ?? "missing"
      }`,
      url: publicAppUrl || undefined,
    },
    {
      key: "bundle-match",
      label: "Bundle hash",
      passed: bundleMatches,
      detail: `expected ${expectedBundle ?? "missing"} · live ${liveBundle ?? "missing"}`,
      url: publicAssetUrl(publicAppUrl, liveBundle),
    },
    {
      key: "bundle-http",
      label: "Bundle asset",
      passed: Boolean(liveBundle) && httpOk(input.liveBundleStatus),
      detail: `HTTP ${input.liveBundleStatus ?? "missing"} · ${liveBundle ?? "bundle missing"}`,
      url: publicAssetUrl(publicAppUrl, liveBundle),
    },
    {
      key: "stylesheet-match",
      label: "Stylesheet hash",
      passed: stylesheetMatches,
      detail: `expected ${expectedStylesheet ?? "missing"} · live ${liveStylesheet ?? "missing"}`,
      url: publicAssetUrl(publicAppUrl, liveStylesheet),
    },
    {
      key: "stylesheet-http",
      label: "Stylesheet asset",
      passed: Boolean(liveStylesheet) && httpOk(input.liveStylesheetStatus),
      detail: `HTTP ${input.liveStylesheetStatus ?? "missing"} · ${liveStylesheet ?? "stylesheet missing"}`,
      url: publicAssetUrl(publicAppUrl, liveStylesheet),
    },
    ...(input.sameOriginDataProxy
      ? [
          {
            key: "same-origin-data-proxy-health",
            label: "Same-origin data proxy",
            passed:
              httpOk(input.dataProxyHealthStatus) &&
              dataProxyServiceReady &&
              dataProxyApiFootballReady &&
              dataProxyOddsReady,
            detail: `HTTP ${input.dataProxyHealthStatus ?? "missing"} · service ${
              dataProxyHealth?.service ?? "missing"
            } · apiFootballKey ${dataProxyApiFootballReady ? "yes" : "no"} · oddsKey ${
              input.requireOddsProxyKey ? (dataProxyHealth?.oddsApiServerKey === true ? "yes" : "no") : "not required"
            }`,
            url: publicRootUrl(publicAppUrl, "/data-proxy/health"),
          },
        ]
      : []),
    ...(input.sameOriginSealProxy
      ? [
          {
            key: "same-origin-seal-proxy-health",
            label: "Same-origin seal proxy",
            passed:
              httpOk(input.sealProxyHealthStatus) &&
              sealProxyHealth?.service === "kickoff-lock-filecoin-seal-proxy" &&
              sealProxyHealth?.tokenInjected === true,
            detail: `HTTP ${input.sealProxyHealthStatus ?? "missing"} · service ${
              sealProxyHealth?.service ?? "missing"
            } · tokenInjected ${sealProxyHealth?.tokenInjected === true ? "yes" : "no"}`,
            url: publicRootUrl(publicAppUrl, "/health"),
          },
        ]
      : []),
  ];
  const failed = checks.filter((check) => !check.passed);
  const ready = failed.length === 0;
  const nextAction = ready
    ? "Public deployment is live: Pages build status or published assets, commit and hashed assets all match."
    : failed[0]?.key === "pages-build"
      ? "Rerun the failed GitHub Pages deployment, then re-run bun run deploy:evidence."
      : failed[0]?.key === "bundle-match" || failed[0]?.key === "stylesheet-match"
        ? "Wait for GitHub Pages propagation or redeploy gh-pages, then re-run bun run deploy:evidence."
        : failed[0]?.detail ?? "Refresh public deployment evidence.";
  const summary = ready
    ? `Live deployment matches ${expectedBundle ?? "expected bundle"}.`
    : `${failed.length}/${checks.length} public deployment check${failed.length === 1 ? "" : "s"} still failing · live ${
        liveBundle ?? "no bundle"
      } · expected ${expectedBundle ?? "no expected bundle"}.`;
  const copyText = [
    "Kickoff Lock Agent public deployment evidence",
    `Ready: ${ready ? "yes" : "no"}`,
    `Public app: ${publicAppUrl || "missing"}`,
    `Expected commit: ${input.expectedCommit ?? "unknown"}`,
    `Pages build: ${input.pagesBuildStatus ?? "unknown"} ${input.pagesBuildCommit ?? ""}`.trim(),
    `Expected bundle: ${expectedBundle ?? "missing"}`,
    `Live bundle: ${liveBundle ?? "missing"}`,
    `Expected stylesheet: ${expectedStylesheet ?? "missing"}`,
    `Live stylesheet: ${liveStylesheet ?? "missing"}`,
    `Next action: ${nextAction}`,
    "Checks:",
    ...checks.map((check) => `- ${check.label}: ${check.passed ? "passed" : "failed"} · ${check.detail}`),
  ].join("\n");

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: input.source ?? "local-script",
    ready,
    publicAppUrl,
    expectedCommit: input.expectedCommit,
    pagesBuildStatus: input.pagesBuildStatus,
    pagesBuildCommit: input.pagesBuildCommit,
    pagesBuildError: input.pagesBuildError,
    liveBundle,
    expectedBundle,
    liveStylesheet,
    expectedStylesheet,
    checks,
    summary,
    nextAction,
    copyText,
  };
};

export const evaluatePublicDeploymentEvidenceArtifact = (
  artifact: Partial<PublicDeploymentEvidencePacket> | undefined,
): PublicDeploymentArtifactEvaluation => {
  if (!artifact) {
    return {
      passed: false,
      detail: "public-deployment-evidence.json missing",
      sampleIds: [],
    };
  }
  const checks = Array.isArray(artifact.checks) ? artifact.checks : [];
  const failed = checks.filter((check) => !check.passed);
  const bundleMatch = Boolean(artifact.liveBundle && artifact.expectedBundle && artifact.liveBundle === artifact.expectedBundle);
  const stylesheetMatch = Boolean(
    artifact.liveStylesheet && artifact.expectedStylesheet && artifact.liveStylesheet === artifact.expectedStylesheet,
  );
  const passed = Boolean(artifact.ready && checks.length > 0 && failed.length === 0 && bundleMatch && stylesheetMatch);
  return {
    passed,
    detail: passed
      ? `${checks.length}/${checks.length} public deployment checks passed · ${artifact.liveBundle}`
      : [
          artifact.ready ? "" : "artifact not ready",
          checks.length === 0 ? "checks missing" : `${failed.length}/${checks.length} checks failed`,
          bundleMatch ? "" : `bundle mismatch live ${artifact.liveBundle ?? "missing"} expected ${artifact.expectedBundle ?? "missing"}`,
          stylesheetMatch
            ? ""
            : `stylesheet mismatch live ${artifact.liveStylesheet ?? "missing"} expected ${
                artifact.expectedStylesheet ?? "missing"
              }`,
        ]
          .filter(Boolean)
          .join("; "),
    sampleIds: [artifact.liveBundle, artifact.expectedBundle, artifact.pagesBuildStatus, artifact.pagesBuildCommit]
      .map((item) => String(item ?? ""))
      .filter(Boolean)
      .slice(0, 5),
  };
};
