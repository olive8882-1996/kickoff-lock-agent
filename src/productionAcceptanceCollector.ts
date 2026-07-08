import {
  evaluateProductionTargetEnvContract,
  parseEnvText,
  type ProductionVerifyEnvKey,
  type PublicRenderKind,
} from "./productionEvidence";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { buildProductionEnvLedger, type ProductionEnvLedgerPacket } from "./productionEnvLedger";
import { buildPublicUrl, normalizePublicAppUrl } from "./publicUrls";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { buildRuntimeConfigJs } from "./runtimeConfigExport";
import { resolvedDataProviderProxyUrl, type DataProviderReadinessArtifact } from "./dataProviderReadiness";
import type { DataProductionBootstrapPlan } from "./dataProductionBootstrap";
import type { FilecoinProductionBootstrapPlan } from "./filecoinProductionBootstrap";
import { filecoinProofMetadataProblems } from "./filecoinProofValidation";
import type { DataTargetScoutArtifact } from "./dataTargetScout";
import type { FilecoinSealTarget, FilecoinTargetSealArtifact } from "./filecoinTargetSeal";
import type { LeaderboardProductionArtifact } from "./leaderboardProductionBootstrap";
import type { ProductionTargetSeedArtifact } from "./productionTargetSeed";
import type { ShareImageUploadArtifact } from "./shareImageUpload";
import { publicShareUrl, type PublicRestoreEvidenceArtifact } from "./sharingProductionDoctor";
import type { ShareChannelEvidenceArtifact } from "./sharingProductionBootstrap";
import { xIntentProblemForProof } from "./shareChannelValidation";
import type { SupabaseSchemaApplyArtifact } from "./supabaseSchemaApply";
import type { CloudflarePagesDeployPlan } from "./cloudflarePagesDeployment";
import type { SupabaseProductionBootstrapPlan } from "./supabaseProductionBootstrap";
import type { AccountCloudSyncEvidenceArtifact } from "./accountCloudSyncEvidence";
import type { ProductionAccessPreflightPacket } from "./productionAccessPreflight";

export type ProductionAcceptanceCollectorStatus = "done" | "ready" | "blocked";

export type ProductionAcceptanceCollectorStage = {
  id: string;
  label: string;
  status: ProductionAcceptanceCollectorStatus;
  command: string;
  requiredEnv: string[];
  outputEnv: ProductionVerifyEnvKey[];
  missingEnv: string[];
  producedEnv: ProductionVerifyEnvKey[];
  detail: string;
};

export type ProductionAcceptanceCollectorPacket = {
  ready: boolean;
  stageReadyCount: number;
  totalStages: number;
  blockedStages: number;
  missingRuntimeEnv: string[];
  missingVerifyEnv: ProductionVerifyEnvKey[];
  stages: ProductionAcceptanceCollectorStage[];
  commands: string[];
  nextAction: string;
  copyText: string;
};

export type ProductionAcceptanceCollectorArtifact = ProductionAcceptanceCollectorPacket & {
  artifactVersion: 1;
  generatedAt: string;
  source: "local-script";
  envFiles: string[];
  outputPath?: string;
  wrote: boolean;
};

export type ProductionAcceptanceCollectorInput = {
  runtimeEnv: Record<string, string | undefined>;
  verifyEnvText: string;
  ledger?: ProductionEnvLedgerPacket;
  dataBootstrapPlan?: DataProductionBootstrapPlan;
  dataProviderArtifact?: DataProviderReadinessArtifact;
  filecoinBootstrapPlan?: FilecoinProductionBootstrapPlan;
  supabaseTargetSeedArtifact?: ProductionTargetSeedArtifact;
  accountCloudSyncEvidence?: AccountCloudSyncEvidenceArtifact;
  supabaseBootstrapPlan?: SupabaseProductionBootstrapPlan;
  dataScoutArtifact?: DataTargetScoutArtifact;
  filecoinSealArtifact?: FilecoinTargetSealArtifact;
  leaderboardArtifact?: LeaderboardProductionArtifact;
  publicRestoreArtifact?: PublicRestoreEvidenceArtifact;
  supabaseSchemaArtifact?: SupabaseSchemaApplyArtifact;
  shareChannelArtifact?: ShareChannelEvidenceArtifact;
  cloudflarePagesDeployPlan?: CloudflarePagesDeployPlan;
  accessPreflightArtifact?: ProductionAccessPreflightPacket & {
    artifactVersion?: number;
    generatedAt?: string;
    source?: string;
  };
  shareImageUploadArtifacts?: {
    record?: ShareImageUploadArtifact;
    mode?: ShareImageUploadArtifact;
  };
};

const runtimeValue = (values: Record<string, string | undefined>, key: string) => values[key]?.trim() ?? "";

const hasRuntime = (values: Record<string, string | undefined>, key: string) => Boolean(runtimeValue(values, key));

const hasAnyRuntime = (values: Record<string, string | undefined>, keys: string[]) =>
  keys.some((key) => hasRuntime(values, key));

const hasRuntimeOrVerify = (
  runtimeEnv: Record<string, string | undefined>,
  verifyValues: Record<string, string>,
  key: string,
) => hasRuntime(runtimeEnv, key) || Boolean(verifyValues[key]?.trim());

const hasAnyRuntimeOrVerify = (
  runtimeEnv: Record<string, string | undefined>,
  verifyValues: Record<string, string>,
  keys: string[],
) => keys.some((key) => hasRuntimeOrVerify(runtimeEnv, verifyValues, key));

const unique = <T,>(values: T[]) => [...new Set(values.filter(Boolean))];

const shortList = (values: string[], limit = 5) => {
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")} + ${values.length - limit} more`;
};

const invalidRuntimePrerequisites = (
  runtimeEnv: Record<string, string | undefined>,
  requiredKeys: string[],
) => {
  const invalid = new Set(buildRuntimeConfigJs(runtimeEnv).invalidRecommendedKeys);
  return requiredKeys
    .filter((key) => key.startsWith("VITE_") && invalid.has(key))
    .map((key) => `${key} must be a deployed production runtime value`);
};

const listVerifyValue = (values: Record<string, string>, key: string) =>
  (values[key] ?? "").split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const expectedPublicProofUrl = (
  runtimeEnv: Record<string, string | undefined>,
  kind: "proof" | "mode",
  targetId: string,
) => {
  const publicAppUrl = normalizePublicAppUrl(runtimeValue(runtimeEnv, "VITE_PUBLIC_APP_URL"));
  if (!publicAppUrl || !targetId) return "";
  return buildPublicUrl(kind, targetId, publicAppUrl, publicAppUrl);
};

const validSha256 = (value: string) => /^[a-f0-9]{64}$/i.test(value);

const validateFilecoinOutputs = (verifyValues: Record<string, string>) => {
  const problems: string[] = [];
  const recordHash = verifyValues.KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH ?? "";
  const modeCids = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  const modeHashes = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  const requiredModeTargetCount = requiredProductionModeIds.length;

  if (recordHash && !validSha256(recordHash)) {
    problems.push("KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH must be a 64-character SHA-256 hex digest");
  }
  if (modeCids.length > 0 && modeCids.length < requiredModeTargetCount) {
    problems.push(`KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs ${requiredModeTargetCount} mode CIDs`);
  }
  if (modeHashes.length > 0 && modeHashes.length < requiredModeTargetCount) {
    problems.push(`KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs ${requiredModeTargetCount} mode payload hashes`);
  }
  if (modeCids.length > 0 && modeHashes.length > 0 && modeCids.length !== modeHashes.length) {
    problems.push("KICKOFF_VERIFY_FILECOIN_MODE_CIDS and KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES counts must match");
  }
  if (modeHashes.some((hash) => !validSha256(hash))) {
    problems.push("KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES must contain only 64-character SHA-256 hex digests");
  }
  return unique(problems);
};

const validateFilecoinRuntime = (_verifyValues: Record<string, string>, runtimeEnv: Record<string, string | undefined>) => {
  const sameOriginSeal = runtimeValue(runtimeEnv, "VITE_FILECOIN_SEAL_SAME_ORIGIN") === "1";
  if (sameOriginSeal) return [];
  return hasRuntime(runtimeEnv, "VITE_FILECOIN_SEAL_TOKEN") ? [] : ["VITE_FILECOIN_SEAL_TOKEN"];
};

const sameOriginDataRuntimeProblems = (runtimeEnv: Record<string, string | undefined>) => {
  if (runtimeValue(runtimeEnv, "VITE_DATA_PROXY_SAME_ORIGIN") !== "1") return [];
  return [
    hasAnyRuntime(runtimeEnv, ["APIFOOTBALL_KEY", "API_FOOTBALL_KEY", "VITE_APIFOOTBALL_KEY"])
      ? ""
      : "Cloudflare Pages Set Pages runtime secrets: APIFOOTBALL_KEY",
    hasAnyRuntime(runtimeEnv, ["ODDS_API_KEY", "THE_ODDS_API_KEY", "VITE_ODDS_API_KEY"])
      ? ""
      : "Cloudflare Pages Set Pages runtime secrets: ODDS_API_KEY",
  ].filter(Boolean);
};

const cloudflarePlanProblems = (plan: CloudflarePagesDeployPlan | undefined, ids?: string[], keys?: string[]) => {
  if (!plan) return [];
  if (plan.ready) return [];
  const keySet = keys ? new Set(keys) : undefined;
  const stages = ids ? plan.stages.filter((stage) => ids.includes(stage.id)) : plan.stages;
  return unique(
    stages
      .filter((stage) => stage.status === "blocked")
      .flatMap((stage) =>
        stage.missingEnv.length > 0
          ? stage.missingEnv
              .filter((item) => !keySet || keySet.has(item))
              .map((item) => `Cloudflare Pages ${stage.label}: ${item}`)
          : [`Cloudflare Pages ${stage.label}: ${stage.detail}`],
      ),
  );
};

const CLOUDFLARE_DATA_ENV_KEYS = [
  "APIFOOTBALL_KEY",
  "API_FOOTBALL_KEY",
  "ODDS_API_KEY",
  "THE_ODDS_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
];

const CLOUDFLARE_FILECOIN_ENV_KEYS = [
  "FILECOIN_SEAL_UPSTREAM_URL",
  "FILECOIN_SEAL_TOKEN",
  "ALLOW_ORIGIN",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
];

const cloudflareRuntimeEnv = (
  runtimeEnv: Record<string, string | undefined>,
  plan: CloudflarePagesDeployPlan | undefined,
) => {
  if (!plan) return runtimeEnv;
  return {
    ...runtimeEnv,
    VITE_PUBLIC_APP_URL: plan.plannedPagesUrl || runtimeValue(runtimeEnv, "VITE_PUBLIC_APP_URL"),
    VITE_DATA_PROXY_SAME_ORIGIN: plan.sameOriginData ? "1" : runtimeValue(runtimeEnv, "VITE_DATA_PROXY_SAME_ORIGIN"),
    VITE_FILECOIN_SEAL_SAME_ORIGIN: plan.sameOriginSeal ? "1" : runtimeValue(runtimeEnv, "VITE_FILECOIN_SEAL_SAME_ORIGIN"),
  };
};

const validateProductionAccessPreflight = (
  artifact: ProductionAcceptanceCollectorInput["accessPreflightArtifact"],
) => {
  if (!artifact) return ["public/production-access-preflight.json missing; run bun run access:preflight"];
  const problems: string[] = [];
  if (artifact.artifactVersion !== 1) problems.push("public/production-access-preflight.json artifactVersion must be 1");
  if (!artifact.generatedAt || !Date.parse(artifact.generatedAt)) {
    problems.push("public/production-access-preflight.json generatedAt is invalid");
  }
  if (!artifact.ready) problems.push("public/production-access-preflight.json not ready");
  for (const stage of artifact.stages ?? []) {
    if (stage.status !== "ready") {
      problems.push(`public/production-access-preflight.json ${stage.label} blocked: ${stage.detail}`);
    }
  }
  return unique([
    ...problems,
    ...((artifact.ready ? [] : artifact.missingEnv) ?? []).map((item) => `access preflight missing ${item}`),
  ]);
};

const cloudflareReadBackUrl = (baseUrl: string, path: string) => new URL(path, baseUrl).toString();

const expectedCloudflareResponse = (
  id: CloudflarePagesDeployPlan["readBackCommands"][number]["id"],
): NonNullable<CloudflarePagesDeployPlan["readBackCommands"][number]["responseExpectation"]> => {
  if (id === "app-root") {
    return {
      responseType: "html",
      requiredFields: ["Kickoff Lock Agent", "runtime-config.js", "site.webmanifest", "assets/kickoff-lock-icon"],
    };
  }
  if (id === "runtime-config") {
    return {
      responseType: "runtime-config-js",
      requiredFields: [
        "window.__KICKOFF_RUNTIME_CONFIG__",
        "VITE_PUBLIC_APP_URL",
        "VITE_SUPABASE_URL",
        "VITE_DATA_PROXY_SAME_ORIGIN",
        "VITE_FILECOIN_SEAL_SAME_ORIGIN",
      ],
      forbiddenFields: [
        "APIFOOTBALL_KEY",
        "API_FOOTBALL_KEY",
        "ODDS_API_KEY",
        "THE_ODDS_API_KEY",
        "FILECOIN_SEAL_TOKEN",
        "SEAL_PROXY_TOKEN",
        "CLOUDFLARE_API_TOKEN",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SYNAPSE_PRIVATE_KEY",
      ],
    };
  }
  if (id === "data-proxy-health") {
    return {
      responseType: "json",
      expectedService: "kickoff-data-proxy",
      expectedSameOrigin: true,
      requiredFields: [
        "ok",
        "service",
        "allowedHosts",
        "allowedRoutes",
        "providerCapabilities",
        "apiFootballServerKey",
        "oddsApiServerKey",
        "footballDataServerToken",
      ],
    };
  }
  return {
    responseType: "json",
    expectedService: "kickoff-lock-filecoin-seal-proxy",
    expectedSameOrigin: true,
    requiredFields: [
      "ok",
      "service",
      "tokenInjected",
      "proxyCapabilities",
      "asyncUpload",
      "uploadStatus",
      "cidQuery",
      "verificationPolling",
    ],
  };
};

const cloudflareResponseExpectationProblems = (
  command: CloudflarePagesDeployPlan["readBackCommands"][number],
  expected: NonNullable<CloudflarePagesDeployPlan["readBackCommands"][number]["responseExpectation"]>,
) => {
  const expectation = command.responseExpectation;
  if (!expectation) return [`public/cloudflare-pages-deploy-plan.json response expectation missing ${command.id}`];
  const problems: string[] = [];
  if (expectation.responseType !== expected.responseType) {
    problems.push(`public/cloudflare-pages-deploy-plan.json response type mismatch ${command.id}`);
  }
  if (expected.expectedService && expectation.expectedService !== expected.expectedService) {
    problems.push(`public/cloudflare-pages-deploy-plan.json response service mismatch ${command.id}`);
  }
  if (expected.expectedSameOrigin !== undefined && expectation.expectedSameOrigin !== expected.expectedSameOrigin) {
    problems.push(`public/cloudflare-pages-deploy-plan.json response same-origin mismatch ${command.id}`);
  }
  const requiredFields = expectation.requiredFields ?? [];
  const missingRequiredFields = expected.requiredFields.filter((field) => !requiredFields.includes(field));
  if (missingRequiredFields.length > 0) {
    problems.push(`public/cloudflare-pages-deploy-plan.json response fields incomplete ${command.id}`);
  }
  const expectedForbidden = expected.forbiddenFields ?? [];
  if (expectedForbidden.length > 0) {
    const forbiddenFields = expectation.forbiddenFields ?? [];
    const missingForbiddenFields = expectedForbidden.filter((field) => !forbiddenFields.includes(field));
    if (missingForbiddenFields.length > 0) {
      problems.push(`public/cloudflare-pages-deploy-plan.json forbidden field checks incomplete ${command.id}`);
    }
  }
  return problems;
};

const validateCloudflarePagesPlan = (plan: CloudflarePagesDeployPlan | undefined) => {
  if (!plan) return [];
  const problems = [...cloudflarePlanProblems(plan)];
  const requiredReadBacks: Array<{
    id: CloudflarePagesDeployPlan["readBackCommands"][number]["id"];
    url: string;
  }> = [
    {
      id: "app-root",
      url: plan.plannedPagesUrl,
    },
    {
      id: "runtime-config",
      url: cloudflareReadBackUrl(plan.plannedPagesUrl, "runtime-config.js"),
    },
    ...(plan.sameOriginData
      ? [
          {
            id: "data-proxy-health" as const,
            url: cloudflareReadBackUrl(plan.plannedPagesUrl, "data-proxy/health"),
          },
        ]
      : []),
    ...(plan.sameOriginSeal
      ? [
          {
            id: "seal-health" as const,
            url: cloudflareReadBackUrl(plan.plannedPagesUrl, "seal/health"),
          },
        ]
      : []),
  ];
  const readBacks = plan.readBackCommands ?? [];
  for (const expected of requiredReadBacks) {
    const command = readBacks.find((item) => item.id === expected.id);
    if (!command) {
      problems.push(`public/cloudflare-pages-deploy-plan.json read-back command missing ${expected.id}`);
      continue;
    }
    if (command.url !== expected.url) {
      problems.push(`public/cloudflare-pages-deploy-plan.json read-back URL mismatch ${expected.id}`);
    }
    if (!command.command.includes("curl -sS")) {
      problems.push(`public/cloudflare-pages-deploy-plan.json read-back command must use curl ${expected.id}`);
    }
    if (plan.ready && !command.ready) {
      problems.push(`public/cloudflare-pages-deploy-plan.json read-back command not ready ${expected.id}`);
    }
    problems.push(...cloudflareResponseExpectationProblems(command, expectedCloudflareResponse(expected.id)));
  }
  for (const check of plan.secretExposureChecks ?? []) {
    if (!check.passed) {
      problems.push(`public/cloudflare-pages-deploy-plan.json secret exposure check failed: ${check.label} (${check.detail})`);
    }
  }
  for (const check of plan.proxyCapabilityChecks ?? []) {
    if (!check.passed) {
      problems.push(`public/cloudflare-pages-deploy-plan.json proxy capability pending: ${check.label} (${check.detail})`);
    }
  }
  return unique(problems);
};

const isAbsoluteHttpsUrl = (value: string | undefined) => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const validateFilecoinSealTargetEvidence = (target: FilecoinSealTarget) => {
  const label = `${target.kind} ${target.id}`;
  const problems: string[] = [];
  if (!target.id) problems.push("public/filecoin-target-seal.json target id missing");
  if (!target.cid) problems.push(`${label} CID missing`);
  if (!validSha256(target.payloadHash)) problems.push(`${label} payloadHash must be a 64-character SHA-256 hex digest`);
  if (!Number.isFinite(target.byteLength) || target.byteLength <= 0) problems.push(`${label} byteLength missing`);
  if (!isAbsoluteHttpsUrl(target.proofUrl)) problems.push(`${label} proofUrl must be an absolute HTTPS URL`);
  if (!isAbsoluteHttpsUrl(target.verifyUrl)) problems.push(`${label} verifyUrl must be an absolute HTTPS URL`);
  if (!target.proofUrl?.includes(encodeURIComponent(target.cid ?? ""))) {
    problems.push(`${label} proofUrl must reference its CID`);
  }
  if (!target.verifyUrl?.includes(encodeURIComponent(target.cid ?? ""))) {
    problems.push(`${label} verifyUrl must reference its CID`);
  }
  if (!target.backendJobId) problems.push(`${label} backend job id missing`);
  if (!isAbsoluteHttpsUrl(target.uploadStatusUrl)) problems.push(`${label} upload status URL must be an absolute HTTPS URL`);
  if ((target.uploadStatusPolls ?? 0) <= 0) problems.push(`${label} upload status polling missing`);
  const uploadLog = target.uploadStatusLog ?? [];
  const lastUpload = uploadLog.at(-1);
  if (uploadLog.length === 0) {
    problems.push(`${label} upload status log missing`);
  } else if (
    lastUpload?.status !== "verified" ||
    lastUpload.cid !== target.cid ||
    lastUpload.payloadHash !== target.payloadHash ||
    lastUpload.byteLength !== target.byteLength ||
    (lastUpload.jobId && lastUpload.jobId !== target.backendJobId)
  ) {
    problems.push(`${label} upload status log must end with verified CID/hash/byteLength evidence`);
  }
  const staleUploadLog = uploadLog.filter(
    (entry) =>
      (entry.jobId && entry.jobId !== target.backendJobId) ||
      (entry.cid && entry.cid !== target.cid) ||
      (entry.payloadHash && entry.payloadHash !== target.payloadHash) ||
      (entry.byteLength && entry.byteLength !== target.byteLength),
  );
  if (staleUploadLog.length > 0) {
    problems.push(`${label} upload status log contains stale job/CID/hash/byteLength evidence`);
  }
  if ((target.verifyPolls ?? 0) <= 0) problems.push(`${label} verify polling missing`);
  const verifyLog = target.verifyPollLog ?? [];
  const lastVerify = verifyLog.at(-1);
  if (verifyLog.length === 0) {
    problems.push(`${label} verify poll log missing`);
  } else if (
    !["retrievable", "verified"].includes(String(lastVerify?.status ?? "")) ||
    !["retrievable", "verified"].includes(String(lastVerify?.proofStatus ?? "")) ||
    lastVerify?.cid !== target.cid
  ) {
    problems.push(`${label} verify poll log must end with retrievable/verified CID evidence`);
  }
  if (verifyLog.some((entry) => entry.cid && entry.cid !== target.cid)) {
    problems.push(`${label} verify poll log contains stale CID evidence`);
  }
  problems.push(
    ...filecoinProofMetadataProblems(target.proof, {
      cid: target.cid,
      expectedPayloadHash: target.payloadHash,
      expectedByteLength: target.byteLength,
      label: `${label} proof`,
    }),
  );
  return problems;
};

const validateFilecoinTargetReadBackCommands = (
  artifact: FilecoinTargetSealArtifact,
  target: FilecoinSealTarget,
) => {
  const label = `${target.kind} ${target.id}`;
  const commands = artifact.readBackCommands ?? [];
  const expected = [
    {
      suffix: "upload-status",
      name: "upload status",
      url: target.uploadStatusUrl,
      requiredPath: "/jobs/",
    },
    {
      suffix: "verify",
      name: "verify status",
      url: target.verifyUrl,
      requiredPath: "/verify?cid=",
    },
    {
      suffix: "proof",
      name: "proof read-back",
      url: target.proofUrl ?? target.cidQueryUrl,
      requiredPath: "/proof/",
    },
  ];
  return expected.flatMap((expectedCommand) => {
    const id = `${target.kind}-${target.id}-${expectedCommand.suffix}`;
    const command = commands.find((item) => item.id === id);
    if (!command) return [`public/filecoin-target-seal.json read-back command missing ${label} ${expectedCommand.name}`];
    const problems: string[] = [];
    if (command.kind !== target.kind || command.targetId !== target.id) {
      problems.push(`public/filecoin-target-seal.json read-back command target mismatch ${label} ${expectedCommand.name}`);
    }
    if (command.url !== expectedCommand.url) {
      problems.push(`public/filecoin-target-seal.json read-back URL mismatch ${label} ${expectedCommand.name}`);
    }
    if (!command.command.includes("curl -sS")) {
      problems.push(`public/filecoin-target-seal.json read-back command must use curl ${label} ${expectedCommand.name}`);
    }
    if (artifact.sameOriginSeal && command.command.includes("$VITE_FILECOIN_SEAL_TOKEN")) {
      problems.push(`public/filecoin-target-seal.json same-origin read-back must not expose browser token ${label} ${expectedCommand.name}`);
    }
    if (!artifact.sameOriginSeal && !command.command.includes("$VITE_FILECOIN_SEAL_TOKEN")) {
      problems.push(`public/filecoin-target-seal.json direct read-back must use VITE_FILECOIN_SEAL_TOKEN ${label} ${expectedCommand.name}`);
    }
    if (!command.command.includes(expectedCommand.requiredPath)) {
      problems.push(`public/filecoin-target-seal.json read-back path mismatch ${label} ${expectedCommand.name}`);
    }
    if (artifact.sameOriginSeal && command.authMode !== "same-origin-proxy") {
      problems.push(`public/filecoin-target-seal.json read-back auth mode mismatch ${label} ${expectedCommand.name}`);
    }
    if (!artifact.sameOriginSeal && command.authMode !== "browser-token") {
      problems.push(`public/filecoin-target-seal.json read-back auth mode mismatch ${label} ${expectedCommand.name}`);
    }
    if (target.cid && command.expectedCid !== target.cid) {
      problems.push(`public/filecoin-target-seal.json read-back expected CID mismatch ${label} ${expectedCommand.name}`);
    }
    if (command.expectedPayloadHash !== target.payloadHash) {
      problems.push(`public/filecoin-target-seal.json read-back expected payload hash mismatch ${label} ${expectedCommand.name}`);
    }
    if (artifact.ready && !command.ready) {
      problems.push(`public/filecoin-target-seal.json read-back command not ready ${label} ${expectedCommand.name}`);
    }
    return problems;
  });
};

const validateFilecoinSealArtifact = (
  verifyValues: Record<string, string>,
  artifact?: FilecoinTargetSealArtifact,
  runtimeEnv: Record<string, string | undefined> = {},
) => {
  if (!artifact) return ["public/filecoin-target-seal.json missing; run bun run seal:production-targets"];
  const problems: string[] = [];
  const runtimeSameOrigin =
    runtimeValue(runtimeEnv, "VITE_FILECOIN_SEAL_SAME_ORIGIN") === "1" &&
    !runtimeValue(runtimeEnv, "VITE_FILECOIN_SEAL_API");
  const recordCid = verifyValues.KICKOFF_VERIFY_FILECOIN_RECORD_CID ?? "";
  const recordHash = verifyValues.KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH ?? "";
  const modeCids = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  const modeHashes = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  const requiredModeTargetCount = requiredProductionModeIds.length;
  const artifactRecord = artifact.targets.find((target) => target.kind === "record");
  const artifactModes = artifact.targets.filter((target) => target.kind === "mode");
  if (artifact.artifactVersion !== 1) problems.push("public/filecoin-target-seal.json artifactVersion must be 1");
  if (!Date.parse(artifact.generatedAt)) problems.push("public/filecoin-target-seal.json generatedAt is invalid");
  if (!artifact.ready) problems.push("public/filecoin-target-seal.json not ready");
  if (!artifact.productionReady) problems.push("public/filecoin-target-seal.json backend was not production ready");
  if (artifact.dryRun) problems.push("public/filecoin-target-seal.json was generated in dry-run mode");
  if (!isAbsoluteHttpsUrl(artifact.endpoint)) problems.push("public/filecoin-target-seal.json endpoint must be an absolute HTTPS URL");
  if (runtimeSameOrigin && artifact.sameOriginSeal !== true) {
    problems.push("public/filecoin-target-seal.json must be generated with same-origin seal read-back commands");
  }
  if (!runtimeSameOrigin && artifact.sameOriginSeal === true) {
    problems.push("public/filecoin-target-seal.json same-origin seal evidence does not match direct seal runtime");
  }
  if (!artifactRecord) problems.push("public/filecoin-target-seal.json record target missing");
  if (artifactModes.length < requiredModeTargetCount) {
    problems.push(`public/filecoin-target-seal.json needs ${requiredModeTargetCount} mode targets`);
  }
  if (!artifact.acceptance.recordSealed) problems.push("public/filecoin-target-seal.json record seal incomplete");
  if (artifact.acceptance.modeSealedCount < artifact.acceptance.requiredModeSealCount) {
    problems.push(
      `public/filecoin-target-seal.json mode seals incomplete (${artifact.acceptance.modeSealedCount}/${artifact.acceptance.requiredModeSealCount})`,
    );
  }
  if (!artifact.acceptance.uploadStatusComplete) problems.push("public/filecoin-target-seal.json upload status polling incomplete");
  if (!artifact.acceptance.uploadStatusProgressionComplete) {
    problems.push("public/filecoin-target-seal.json upload status progression incomplete");
  }
  if (!artifact.acceptance.verifyPollingComplete) problems.push("public/filecoin-target-seal.json verify polling incomplete");
  if (!artifact.acceptance.verifyPollingProgressionComplete) {
    problems.push("public/filecoin-target-seal.json verify polling progression incomplete");
  }
  if (!artifact.acceptance.cidQueryComplete) problems.push("public/filecoin-target-seal.json CID query read-back incomplete");
  if (!artifact.acceptance.proofReadbackComplete) problems.push("public/filecoin-target-seal.json proof read-back incomplete");
  for (const key of [
    "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
    "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
    "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
    "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
  ]) {
    if (!artifact.acceptance.outputEnvKeys.includes(key)) {
      problems.push(`public/filecoin-target-seal.json missing ${key} output key`);
    }
  }
  if (recordCid && artifactRecord?.cid !== recordCid) {
    problems.push("KICKOFF_VERIFY_FILECOIN_RECORD_CID does not match public/filecoin-target-seal.json record cid");
  }
  if (recordHash && artifactRecord?.payloadHash !== recordHash) {
    problems.push("KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH does not match public/filecoin-target-seal.json record payload hash");
  }
  const artifactModeCids = artifactModes.map((target) => target.cid ?? "");
  const artifactModeHashes = artifactModes.map((target) => target.payloadHash);
  if (modeCids.length > 0 && modeCids.join(",") !== artifactModeCids.join(",")) {
    problems.push("KICKOFF_VERIFY_FILECOIN_MODE_CIDS do not match public/filecoin-target-seal.json mode cids");
  }
  if (modeHashes.length > 0 && modeHashes.join(",") !== artifactModeHashes.join(",")) {
    problems.push("KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES do not match public/filecoin-target-seal.json mode payload hashes");
  }
  problems.push(...artifact.targets.flatMap(validateFilecoinSealTargetEvidence));
  problems.push(...artifact.targets.flatMap((target) => validateFilecoinTargetReadBackCommands(artifact, target)));
  return unique(problems);
};

const validateModeTargetOutputs = (verifyValues: Record<string, string>) => {
  const modeIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_MODE_IDS");
  const requiredModeTargetCount = requiredProductionModeIds.length;
  if (modeIds.length >= requiredModeTargetCount) return [];
  if (modeIds.length > 0) return [`KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids`];
  if (verifyValues.KICKOFF_VERIFY_MODE_ID?.trim()) {
    return [
      `KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough for full mode acceptance`,
    ];
  }
  return [];
};

const validateSupabaseTargetSeedArtifact = (
  verifyValues: Record<string, string>,
  artifact?: ProductionTargetSeedArtifact,
) => {
  if (!artifact) return ["public/supabase-target-seed.json missing; run bun run seed:production-targets"];
  const problems: string[] = [];
  const modeIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_MODE_IDS");
  if (artifact.artifactVersion !== 1) problems.push("public/supabase-target-seed.json artifactVersion must be 1");
  if (!Date.parse(artifact.generatedAt)) problems.push("public/supabase-target-seed.json generatedAt is invalid");
  if (!artifact.ready) problems.push("public/supabase-target-seed.json not ready");
  if (artifact.dryRun) problems.push("public/supabase-target-seed.json was generated in dry-run mode");
  if (!artifact.acceptance.upserted) problems.push("public/supabase-target-seed.json target rows were not upserted");
  if (!artifact.acceptance.authUserReady) problems.push("public/supabase-target-seed.json Auth user preflight incomplete");
  if (artifact.authUser && !artifact.authUser.ready) {
    problems.push(`public/supabase-target-seed.json Auth user preflight failed: ${artifact.authUser.detail}`);
  }
  if (!artifact.acceptance.doctorReady) problems.push("public/supabase-target-seed.json Supabase doctor read-back incomplete");
  if (!artifact.doctor?.passedCheckIds?.includes("target-auth-user")) {
    problems.push("public/supabase-target-seed.json missing target-auth-user doctor read-back");
  }
  if (!artifact.doctor?.passedCheckIds?.includes("target-auth-profile-identity")) {
    problems.push("public/supabase-target-seed.json missing target-auth-profile-identity doctor read-back");
  }
  if (!artifact.acceptance.profileTarget) problems.push("public/supabase-target-seed.json profile target missing");
  if (!artifact.acceptance.recordTarget) problems.push("public/supabase-target-seed.json record target missing");
  const shareArtifactIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS");
  if (
    verifyValues.KICKOFF_VERIFY_USER_ID &&
    verifyValues.KICKOFF_VERIFY_PROFILE_ID &&
    verifyValues.KICKOFF_VERIFY_USER_ID !== verifyValues.KICKOFF_VERIFY_PROFILE_ID
  ) {
    problems.push("KICKOFF_VERIFY_USER_ID must match KICKOFF_VERIFY_PROFILE_ID");
  }
  if (artifact.seed?.targets.userId && artifact.seed.targets.profileId && artifact.seed.targets.userId !== artifact.seed.targets.profileId) {
    problems.push("public/supabase-target-seed.json userId must match profileId");
  }
  if (artifact.acceptance.modeTargetCount < artifact.acceptance.requiredModeTargetCount) {
    problems.push(
      `public/supabase-target-seed.json mode targets incomplete (${artifact.acceptance.modeTargetCount}/${artifact.acceptance.requiredModeTargetCount})`,
    );
  }
  if (artifact.acceptance.shareArtifactCount < artifact.acceptance.requiredShareArtifactCount) {
    problems.push(
      `public/supabase-target-seed.json share artifacts incomplete (${artifact.acceptance.shareArtifactCount}/${artifact.acceptance.requiredShareArtifactCount})`,
    );
  }
  if (!artifact.acceptance.recordShareChannelOpened) {
    problems.push("public/supabase-target-seed.json record share channel missing");
  }
  if (artifact.acceptance.modeShareChannelCount < artifact.acceptance.requiredModeShareChannelCount) {
    problems.push(
      `public/supabase-target-seed.json mode share channels incomplete (${artifact.acceptance.modeShareChannelCount}/${artifact.acceptance.requiredModeShareChannelCount})`,
    );
  }
  if (artifact.acceptance.shareChannelCount < artifact.acceptance.requiredShareChannelCount) {
    problems.push(
      `public/supabase-target-seed.json share channels incomplete (${artifact.acceptance.shareChannelCount}/${artifact.acceptance.requiredShareChannelCount})`,
    );
  }
  for (const key of [
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
  ]) {
    if (!artifact.acceptance.outputEnvKeys.includes(key)) {
      problems.push(`public/supabase-target-seed.json missing ${key} output key`);
    }
  }
  if (verifyValues.KICKOFF_VERIFY_USER_ID && artifact.seed?.targets.userId !== verifyValues.KICKOFF_VERIFY_USER_ID) {
    problems.push("KICKOFF_VERIFY_USER_ID does not match public/supabase-target-seed.json userId");
  }
  if (verifyValues.KICKOFF_VERIFY_PROFILE_ID && artifact.seed?.targets.profileId !== verifyValues.KICKOFF_VERIFY_PROFILE_ID) {
    problems.push("KICKOFF_VERIFY_PROFILE_ID does not match public/supabase-target-seed.json profileId");
  }
  if (
    verifyValues.KICKOFF_VERIFY_PUBLIC_PROFILE_URL &&
    artifact.seed?.targets.publicProfileUrl !== verifyValues.KICKOFF_VERIFY_PUBLIC_PROFILE_URL
  ) {
    problems.push("KICKOFF_VERIFY_PUBLIC_PROFILE_URL does not match public/supabase-target-seed.json publicProfileUrl");
  }
  if (verifyValues.KICKOFF_VERIFY_PROOF_ID && artifact.seed?.targets.proofId !== verifyValues.KICKOFF_VERIFY_PROOF_ID) {
    problems.push("KICKOFF_VERIFY_PROOF_ID does not match public/supabase-target-seed.json proofId");
  }
  if (modeIds.length > 0 && artifact.seed?.targets.modeIds.join(",") !== modeIds.join(",")) {
    problems.push("KICKOFF_VERIFY_MODE_IDS do not match public/supabase-target-seed.json modeIds");
  }
  if (shareArtifactIds.length > 0 && artifact.seed?.targets.shareArtifactIds?.join(",") !== shareArtifactIds.join(",")) {
    problems.push("KICKOFF_VERIFY_SHARE_ARTIFACT_IDS do not match public/supabase-target-seed.json shareArtifactIds");
  }
  if (verifyValues.KICKOFF_VERIFY_FRIEND_CODE && artifact.seed?.targets.friendCode !== verifyValues.KICKOFF_VERIFY_FRIEND_CODE) {
    problems.push("KICKOFF_VERIFY_FRIEND_CODE does not match public/supabase-target-seed.json friendCode");
  }
  if (verifyValues.KICKOFF_VERIFY_SEASON_KEY && artifact.seed?.targets.seasonKey !== verifyValues.KICKOFF_VERIFY_SEASON_KEY) {
    problems.push("KICKOFF_VERIFY_SEASON_KEY does not match public/supabase-target-seed.json seasonKey");
  }
  const leaderboardScopes = listVerifyValue(verifyValues, "KICKOFF_VERIFY_LEADERBOARD_SCOPES").map((scope) => scope.toLowerCase());
  if (leaderboardScopes.length > 0 && artifact.seed?.targets.leaderboardScopes?.join(",") !== leaderboardScopes.join(",")) {
    problems.push("KICKOFF_VERIFY_LEADERBOARD_SCOPES do not match public/supabase-target-seed.json leaderboardScopes");
  }
  return unique(problems);
};

const validateSupabaseSchemaArtifact = (artifact?: SupabaseSchemaApplyArtifact) => {
  if (!artifact) return ["public/supabase-schema-apply.json missing; run bun run supabase:schema:apply"];
  const problems: string[] = [];
  if (artifact.artifactVersion !== 1) problems.push("public/supabase-schema-apply.json artifactVersion must be 1");
  if (!Date.parse(artifact.generatedAt)) problems.push("public/supabase-schema-apply.json generatedAt is invalid");
  if (!artifact.ready) problems.push("public/supabase-schema-apply.json not ready");
  if (!artifact.acceptance.schemaReadable) problems.push("public/supabase-schema-apply.json schema was not readable");
  if (!artifact.acceptance.contractReady) problems.push("public/supabase-schema-apply.json schema contract incomplete");
  if (artifact.acceptance.psqlAvailable === false) problems.push("public/supabase-schema-apply.json psql unavailable");
  if (artifact.acceptance.dryRun) problems.push("public/supabase-schema-apply.json was generated in dry-run mode");
  if (!artifact.acceptance.applied) problems.push("public/supabase-schema-apply.json schema apply not executed");
  for (const key of [
    "kickoff_profiles",
    "kickoff_records",
    "kickoff_mode_runs",
    "kickoff_share_artifacts",
    "kickoff_leaderboard",
    "kickoff_backend_health",
  ]) {
    if (!artifact.acceptance.outputEnvKeys.includes(key)) {
      problems.push(`public/supabase-schema-apply.json missing ${key} output key`);
    }
  }
  return unique(problems);
};

const validateAccountCloudSyncEvidence = (
  verifyValues: Record<string, string>,
  artifact?: AccountCloudSyncEvidenceArtifact,
  seedArtifact?: ProductionTargetSeedArtifact,
) => {
  if (!artifact) {
    if (seedArtifact?.ready) return ["public/account-cloud-sync-evidence.json missing; sync account and run account cloud read-back evidence"];
    return [];
  }
  const problems: string[] = [];
  const modeIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_MODE_IDS");
  const shareArtifactIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS");
  const leaderboardScopes = listVerifyValue(verifyValues, "KICKOFF_VERIFY_LEADERBOARD_SCOPES").map((scope) => scope.toLowerCase());
  if (artifact.artifactVersion !== 1) problems.push("public/account-cloud-sync-evidence.json artifactVersion must be 1");
  if (!Date.parse(artifact.generatedAt)) problems.push("public/account-cloud-sync-evidence.json generatedAt is invalid");
  if (!artifact.ready) problems.push("public/account-cloud-sync-evidence.json not ready");
  if (artifact.cloudMode !== "supabase") problems.push("public/account-cloud-sync-evidence.json profile is not in Supabase mode");
  if (!artifact.configured) problems.push("public/account-cloud-sync-evidence.json Supabase runtime not configured");
  if (!artifact.authenticated) problems.push("public/account-cloud-sync-evidence.json Supabase session not authenticated");
  if (verifyValues.KICKOFF_VERIFY_PROFILE_ID && artifact.profileId !== verifyValues.KICKOFF_VERIFY_PROFILE_ID) {
    problems.push("KICKOFF_VERIFY_PROFILE_ID does not match public/account-cloud-sync-evidence.json profileId");
  }
  if (verifyValues.KICKOFF_VERIFY_PROOF_ID && artifact.expectedIds.records.join(",") !== verifyValues.KICKOFF_VERIFY_PROOF_ID) {
    problems.push("KICKOFF_VERIFY_PROOF_ID does not match public/account-cloud-sync-evidence.json record ids");
  }
  if (modeIds.length > 0 && artifact.expectedIds.modeRuns.join(",") !== modeIds.join(",")) {
    problems.push("KICKOFF_VERIFY_MODE_IDS do not match public/account-cloud-sync-evidence.json mode ids");
  }
  if (shareArtifactIds.length > 0 && artifact.expectedIds.shareArtifacts.join(",") !== shareArtifactIds.join(",")) {
    problems.push("KICKOFF_VERIFY_SHARE_ARTIFACT_IDS do not match public/account-cloud-sync-evidence.json share artifact ids");
  }
  if (leaderboardScopes.length > 0 && artifact.expectedIds.leaderboardScopes.join(",") !== leaderboardScopes.join(",")) {
    problems.push("KICKOFF_VERIFY_LEADERBOARD_SCOPES do not match public/account-cloud-sync-evidence.json leaderboard scopes");
  }
  for (const [key, ready] of Object.entries(artifact.acceptance ?? {})) {
    if (ready !== true) problems.push(`public/account-cloud-sync-evidence.json acceptance ${key} incomplete`);
  }
  const outboxQueued = (artifact.outbox ?? []).reduce((sum, item) => sum + item.queued, 0);
  if (outboxQueued > 0 || (artifact.outbox ?? []).some((item) => item.status !== "verified")) {
    problems.push("public/account-cloud-sync-evidence.json outbox still queued");
  }
  if ((artifact.audit ?? []).some((item) => item.status !== "passed")) {
    problems.push("public/account-cloud-sync-evidence.json audit has pending checks");
  }
  if (artifact.coverage?.passed !== true || (artifact.coverage?.pendingItems ?? 0) !== 0) {
    problems.push("public/account-cloud-sync-evidence.json strict cloud coverage incomplete");
  }
  if (artifact.localTotals.historyArtifacts <= 0) {
    problems.push("public/account-cloud-sync-evidence.json has no synced account history artifacts");
  }
  if (artifact.verifiedTotals.contentFingerprints < artifact.localTotals.historyArtifacts) {
    problems.push("public/account-cloud-sync-evidence.json content fingerprints incomplete");
  }
  if (artifact.verifiedTotals.publicProfileArchives < artifact.localTotals.historyArtifacts) {
    problems.push("public/account-cloud-sync-evidence.json public profile archive incomplete");
  }
  return unique(problems);
};

const validateSupabaseBootstrapPlan = (
  plan: SupabaseProductionBootstrapPlan | undefined,
  runtimeEnv: Record<string, string | undefined>,
  verifyValues: Record<string, string>,
) => {
  if (!plan) return [];
  const problems: string[] = [];
  const readBacks = plan.readBackCommands ?? [];
  const modeIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_MODE_IDS");
  const expectedByLabel = [
    {
      label: "Profile row",
      scope: "profile",
      targetIds: [verifyValues.KICKOFF_VERIFY_PROFILE_ID],
      expectedUserId: verifyValues.KICKOFF_VERIFY_USER_ID,
      minRows: 1,
      requiredFields: ["id", "email", "display_name", "location", "friend_code", "season_key", "updated_at"],
    },
    {
      label: "Prediction row",
      scope: "record",
      targetIds: [verifyValues.KICKOFF_VERIFY_PROOF_ID],
      expectedUserId: verifyValues.KICKOFF_VERIFY_USER_ID,
      expectedFriendCode: verifyValues.KICKOFF_VERIFY_FRIEND_CODE,
      expectedSeasonKey: verifyValues.KICKOFF_VERIFY_SEASON_KEY,
      minRows: 1,
      requiredFields: ["id", "user_id", "season_key", "friend_code", "total_score"],
    },
    {
      label: "Mode proof rows",
      scope: "mode",
      targetIds: modeIds,
      expectedUserId: verifyValues.KICKOFF_VERIFY_USER_ID,
      expectedFriendCode: verifyValues.KICKOFF_VERIFY_FRIEND_CODE,
      expectedSeasonKey: verifyValues.KICKOFF_VERIFY_SEASON_KEY,
      minRows: modeIds.length,
      requiredFields: ["id", "user_id", "mode_id", "status", "score", "season_key", "friend_code"],
    },
    {
      label: "Record share artifact row",
      scope: "shareArtifact",
      targetIds: [verifyValues.KICKOFF_VERIFY_PROOF_ID],
      expectedUserId: verifyValues.KICKOFF_VERIFY_USER_ID,
      expectedFriendCode: verifyValues.KICKOFF_VERIFY_FRIEND_CODE,
      expectedSeasonKey: verifyValues.KICKOFF_VERIFY_SEASON_KEY,
      minRows: 1,
      requiredFields: ["id", "user_id", "season_key", "friend_code", "kind", "image_url", "image_hash", "proof_url"],
    },
    {
      label: "Mode share artifact rows",
      scope: "shareArtifact",
      targetIds: modeIds,
      expectedUserId: verifyValues.KICKOFF_VERIFY_USER_ID,
      expectedFriendCode: verifyValues.KICKOFF_VERIFY_FRIEND_CODE,
      expectedSeasonKey: verifyValues.KICKOFF_VERIFY_SEASON_KEY,
      minRows: modeIds.length,
      requiredFields: ["id", "user_id", "season_key", "friend_code", "kind", "image_url", "image_hash", "proof_url"],
    },
    {
      label: "Global leaderboard",
      scope: "global",
      targetIds: [verifyValues.KICKOFF_VERIFY_USER_ID],
      expectedUserId: verifyValues.KICKOFF_VERIFY_USER_ID,
      minRows: 1,
      requiredFields: ["id", "display_name", "location", "friend_code", "season_key", "locks", "revealed", "average_score", "best_score", "xp", "streak", "exact_hits", "verified_proofs", "mode_proofs", "global_rank", "friend_rank", "season_rank", "rank", "updated_at"],
    },
    {
      label: "Friend leaderboard",
      scope: "friend",
      targetIds: [verifyValues.KICKOFF_VERIFY_USER_ID],
      expectedUserId: verifyValues.KICKOFF_VERIFY_USER_ID,
      expectedFriendCode: verifyValues.KICKOFF_VERIFY_FRIEND_CODE,
      minRows: 1,
      requiredFields: ["id", "display_name", "location", "friend_code", "season_key", "locks", "revealed", "average_score", "best_score", "xp", "streak", "exact_hits", "verified_proofs", "mode_proofs", "global_rank", "friend_rank", "season_rank", "rank", "updated_at"],
    },
    {
      label: "Season leaderboard",
      scope: "season",
      targetIds: [verifyValues.KICKOFF_VERIFY_USER_ID],
      expectedUserId: verifyValues.KICKOFF_VERIFY_USER_ID,
      expectedSeasonKey: verifyValues.KICKOFF_VERIFY_SEASON_KEY,
      minRows: 1,
      requiredFields: ["id", "display_name", "location", "friend_code", "season_key", "locks", "revealed", "average_score", "best_score", "xp", "streak", "exact_hits", "verified_proofs", "mode_proofs", "global_rank", "friend_rank", "season_rank", "rank", "updated_at"],
    },
  ];
  const anonKey = runtimeValue(runtimeEnv, "VITE_SUPABASE_ANON_KEY");
  const selectedFields = (path: string) => {
    const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    const select = new URLSearchParams(query).get("select") ?? "";
    return select.split(",").map((field) => field.trim()).filter(Boolean);
  };
  const missingExpectedFields = (actual: string[] | undefined, expected: string[]) =>
    expected.filter((field) => !(actual ?? []).includes(field));
  const validateResponseExpectation = (
    label: string,
    command: SupabaseProductionBootstrapPlan["readBackCommands"][number],
    expected: (typeof expectedByLabel)[number],
  ) => {
    const expectation = command.responseExpectation;
    if (!expectation) {
      problems.push(`public/supabase-bootstrap-plan.json response expectation missing ${label}`);
      return;
    }
    if (expectation.responseType !== "supabase-array") {
      problems.push(`public/supabase-bootstrap-plan.json response expectation type mismatch ${label}`);
    }
    if (expectation.expectedSource !== "cloud") {
      problems.push(`public/supabase-bootstrap-plan.json response expectation source mismatch ${label}`);
    }
    if ((expectation.minRows ?? 0) < expected.minRows) {
      problems.push(`public/supabase-bootstrap-plan.json response expectation min rows mismatch ${label}`);
    }
    const expectedTargets = (expected.targetIds ?? []).filter(Boolean);
    if (expectedTargets.length > 0 && (expectation.targetIds ?? []).join(",") !== expectedTargets.join(",")) {
      problems.push(`public/supabase-bootstrap-plan.json response expectation target ids mismatch ${label}`);
    }
    if (expected.expectedUserId && expectation.expectedUserId !== expected.expectedUserId) {
      problems.push(`public/supabase-bootstrap-plan.json response expectation user id mismatch ${label}`);
    }
    if (expected.expectedFriendCode && expectation.expectedFriendCode !== expected.expectedFriendCode) {
      problems.push(`public/supabase-bootstrap-plan.json response expectation friend code mismatch ${label}`);
    }
    if (expected.expectedSeasonKey && expectation.expectedSeasonKey !== expected.expectedSeasonKey) {
      problems.push(`public/supabase-bootstrap-plan.json response expectation season key mismatch ${label}`);
    }
    const missingResponseFields = missingExpectedFields(expectation.requiredFields, expected.requiredFields);
    if (missingResponseFields.length > 0) {
      problems.push(`public/supabase-bootstrap-plan.json response expectation fields incomplete ${label}`);
    }
    const missingSelectFields = missingExpectedFields(selectedFields(command.path), expected.requiredFields);
    if (missingSelectFields.length > 0) {
      problems.push(`public/supabase-bootstrap-plan.json read-back select fields incomplete ${label}`);
    }
  };
  for (const expected of expectedByLabel) {
    const label = expected.label;
    const command = readBacks.find((item) => item.label === label);
    if (!command) {
      problems.push(`public/supabase-bootstrap-plan.json read-back command missing ${label}`);
      continue;
    }
    if (!command.ready) {
      if (plan.ready) {
        problems.push(`public/supabase-bootstrap-plan.json read-back command not ready ${label}`);
      }
      continue;
    }
    if (!command.command.includes("curl -sS")) {
      problems.push(`public/supabase-bootstrap-plan.json read-back command must use curl ${label}`);
    }
    if (!command.command.includes("/rest/v1/")) {
      problems.push(`public/supabase-bootstrap-plan.json read-back URL mismatch ${label}`);
    }
    if (!command.command.includes("$VITE_SUPABASE_ANON_KEY")) {
      problems.push(`public/supabase-bootstrap-plan.json read-back command must use VITE_SUPABASE_ANON_KEY ${label}`);
    }
    if (anonKey && command.command.includes(`apikey: ${anonKey}`)) {
      problems.push(`public/supabase-bootstrap-plan.json read-back command must not inline anon key ${label}`);
    }
    if (anonKey && command.command.includes(`Bearer ${anonKey}`)) {
      problems.push(`public/supabase-bootstrap-plan.json read-back authorization must not inline anon key ${label}`);
    }
    if (command.scope !== expected.scope) {
      problems.push(`public/supabase-bootstrap-plan.json structured read-back scope mismatch ${label}`);
    }
    if (command.authMode !== "anon") {
      problems.push(`public/supabase-bootstrap-plan.json structured read-back auth mode mismatch ${label}`);
    }
    if (!command.path) {
      problems.push(`public/supabase-bootstrap-plan.json structured read-back path missing ${label}`);
    }
    if (!command.url) {
      problems.push(`public/supabase-bootstrap-plan.json structured read-back URL missing ${label}`);
    } else {
      try {
        const url = new URL(command.url);
        if (url.protocol !== "https:" || !url.pathname.startsWith("/rest/v1/")) {
          problems.push(`public/supabase-bootstrap-plan.json structured read-back URL mismatch ${label}`);
        }
        const urlPath = `${url.pathname.replace(/^\/rest\/v1\//, "")}${url.search}`;
        if (command.path && urlPath !== command.path) {
          problems.push(`public/supabase-bootstrap-plan.json structured read-back path mismatch ${label}`);
        }
        if (!command.command.includes(command.url)) {
          problems.push(`public/supabase-bootstrap-plan.json structured read-back URL not used by command ${label}`);
        }
      } catch {
        problems.push(`public/supabase-bootstrap-plan.json structured read-back URL malformed ${label}`);
      }
    }
    const actualTargets = command.targetIds ?? [];
    const expectedTargets = (expected.targetIds ?? []).filter(Boolean);
    if (expectedTargets.length > 0 && actualTargets.join(",") !== expectedTargets.join(",")) {
      problems.push(`public/supabase-bootstrap-plan.json target ids mismatch ${label}`);
    }
    if (expected.expectedUserId && command.expectedUserId !== expected.expectedUserId) {
      problems.push(`public/supabase-bootstrap-plan.json user id mismatch ${label}`);
    }
    if (expected.expectedFriendCode && command.expectedFriendCode !== expected.expectedFriendCode) {
      problems.push(`public/supabase-bootstrap-plan.json friend code mismatch ${label}`);
    }
    if (expected.expectedSeasonKey && command.expectedSeasonKey !== expected.expectedSeasonKey) {
      problems.push(`public/supabase-bootstrap-plan.json season key mismatch ${label}`);
    }
    validateResponseExpectation(label, command, expected);
  }
  const authReadBack = plan.authReadBackCommand;
  if (!authReadBack) {
    problems.push("public/supabase-bootstrap-plan.json auth read-back command missing");
  } else if (authReadBack.ready || plan.ready) {
    const authExpectation = authReadBack.responseExpectation;
    if (authReadBack.scope !== "auth-user") problems.push("public/supabase-bootstrap-plan.json auth read-back scope mismatch");
    if (authReadBack.authMode !== "service-role") problems.push("public/supabase-bootstrap-plan.json auth read-back auth mode mismatch");
    if (!authReadBack.command.includes("curl -sS")) problems.push("public/supabase-bootstrap-plan.json auth read-back command must use curl");
    if (!authReadBack.command.includes("$SUPABASE_SERVICE_ROLE_KEY")) {
      problems.push("public/supabase-bootstrap-plan.json auth read-back must use SUPABASE_SERVICE_ROLE_KEY");
    }
    if (authExpectation?.responseType !== "supabase-auth-user") {
      problems.push("public/supabase-bootstrap-plan.json auth response expectation type mismatch");
    }
    if (authExpectation?.expectedSource !== "cloud") {
      problems.push("public/supabase-bootstrap-plan.json auth response expectation source mismatch");
    }
    if (verifyValues.KICKOFF_VERIFY_USER_ID && authExpectation?.expectedUserId !== verifyValues.KICKOFF_VERIFY_USER_ID) {
      problems.push("public/supabase-bootstrap-plan.json auth response expectation user id mismatch");
    }
    if (verifyValues.KICKOFF_VERIFY_USER_ID && (authExpectation?.targetIds ?? []).join(",") !== verifyValues.KICKOFF_VERIFY_USER_ID) {
      problems.push("public/supabase-bootstrap-plan.json auth response expectation target ids mismatch");
    }
    if (missingExpectedFields(authExpectation?.requiredFields, ["id", "email"]).length > 0) {
      problems.push("public/supabase-bootstrap-plan.json auth response expectation fields incomplete");
    }
  }
  const cleanCommands = plan.cleanSessionReadBackCommands ?? [];
  const cleanExpected = [
    ...(verifyValues.KICKOFF_VERIFY_PROFILE_ID
      ? [{ scope: "public-profile", pageKind: "profile", queryParam: "profile", targetId: verifyValues.KICKOFF_VERIFY_PROFILE_ID }]
      : []),
    ...(verifyValues.KICKOFF_VERIFY_PROOF_ID
      ? [{ scope: "public-proof", pageKind: "proof", queryParam: "proof", targetId: verifyValues.KICKOFF_VERIFY_PROOF_ID }]
      : []),
    ...modeIds.map((targetId) => ({ scope: "public-mode", pageKind: "mode", queryParam: "mode", targetId })),
  ];
  for (const expected of cleanExpected) {
    const command = cleanCommands.find((item) => item.scope === expected.scope && item.targetIds?.includes(expected.targetId));
    const label = `${expected.pageKind}:${expected.targetId}`;
    if (!command) {
      problems.push(`public/supabase-bootstrap-plan.json clean-session read-back command missing ${label}`);
      continue;
    }
    if (command.ready || plan.ready) {
      const expectation = command.responseExpectation;
      if (command.authMode !== "public-page") {
        problems.push(`public/supabase-bootstrap-plan.json clean-session auth mode mismatch ${label}`);
      }
      if (!command.command.includes("curl -sS")) {
        problems.push(`public/supabase-bootstrap-plan.json clean-session command must use curl ${label}`);
      }
      if (expectation?.responseType !== "public-html") {
        problems.push(`public/supabase-bootstrap-plan.json clean-session response expectation type mismatch ${label}`);
      }
      if (expectation?.expectedSource !== "cloud") {
        problems.push(`public/supabase-bootstrap-plan.json clean-session source mismatch ${label}`);
      }
      if (expectation?.requiresCleanSession !== true) {
        problems.push(`public/supabase-bootstrap-plan.json clean-session expectation missing clean-session flag ${label}`);
      }
      if (expectation?.pageKind !== expected.pageKind || expectation?.queryParam !== expected.queryParam) {
        problems.push(`public/supabase-bootstrap-plan.json clean-session page target mismatch ${label}`);
      }
      if ((expectation?.targetIds ?? []).join(",") !== expected.targetId) {
        problems.push(`public/supabase-bootstrap-plan.json clean-session target ids mismatch ${label}`);
      }
      if (missingExpectedFields(expectation?.requiredFields, ["canonical-url", "social-metadata", "share-image", "cloud-record"]).length > 0) {
        problems.push(`public/supabase-bootstrap-plan.json clean-session response expectation fields incomplete ${label}`);
      }
    }
  }
  if (plan.ready && plan.blockedStages > 0) {
    problems.push("public/supabase-bootstrap-plan.json ready plan still has blocked stages");
  }
  return unique(problems);
};

const validateFixtureTargetOutputs = (verifyValues: Record<string, string>) => {
  const fixtureIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FIXTURE_IDS");
  const matrix = verifyValues.KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX?.trim() ?? "";
  if (fixtureIds.length >= 3 && matrix) return [];
  if (fixtureIds.length >= 3) return ["KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing"];
  if (fixtureIds.length > 0) {
    return [
      "KICKOFF_VERIFY_FIXTURE_IDS needs 3 fixture targets",
      ...(matrix ? [] : ["KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing"]),
    ];
  }
  if (verifyValues.KICKOFF_VERIFY_FIXTURE_ID?.trim()) {
    return ["KICKOFF_VERIFY_FIXTURE_IDS needs 3 fixture targets; legacy KICKOFF_VERIFY_FIXTURE_ID is not enough for full realtime acceptance"];
  }
  return ["KICKOFF_VERIFY_FIXTURE_IDS missing", "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX missing"];
};

const requiredFixtureSignals = ["lineups", "injuries", "odds", "standings"] as const;
const requiredFixtureSignalRows = (signal: (typeof requiredFixtureSignals)[number]) =>
  signal === "standings" || signal === "lineups" ? 2 : 1;

const parseFixtureSignalMatrix = (matrix: string) =>
  matrix
    .split(/[,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [fixtureId = "", signalText = ""] = entry.split(":");
      const signals = Object.fromEntries(
        signalText
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => {
            const [key = "", rows = "0"] = item.split("=");
            return [key.trim(), Number(rows)];
          }),
      ) as Record<string, number>;
      return { fixtureId: fixtureId.trim(), signals };
    });

const fixtureSignalMatrixProblems = (fixtureIds: string[], matrix: string, label: string) => {
  if (!matrix.trim()) return [`${label} missing`];
  const rows = parseFixtureSignalMatrix(matrix);
  return fixtureIds.flatMap((fixtureId) => {
    const row = rows.find((item) => item.fixtureId === fixtureId);
    if (!row) return [`${label} missing ${fixtureId}`];
    return requiredFixtureSignals
      .filter((signal) => !Number.isFinite(row.signals[signal]) || row.signals[signal] < requiredFixtureSignalRows(signal))
      .map((signal) => `${fixtureId} missing ${signal} rows in ${label}`);
  });
};

const fixtureSignalRowsProblems = (
  fixtureIds: string[],
  matrix: string,
  rows: DataProviderReadinessArtifact["targets"]["fixtureSignalRows"] | undefined,
) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return ["public/data-provider-readiness.json fixtureSignalRows missing"];
  }
  const matrixRows = parseFixtureSignalMatrix(matrix);
  return fixtureIds.flatMap((fixtureId) => {
    const row = rows.find((item) => item.fixtureId === fixtureId);
    const matrixRow = matrixRows.find((item) => item.fixtureId === fixtureId);
    if (!row) return [`public/data-provider-readiness.json fixtureSignalRows missing ${fixtureId}`];
    if (!row.ready) return [`public/data-provider-readiness.json fixtureSignalRows ${fixtureId} not ready`];
    return requiredFixtureSignals.flatMap((signal) => {
      const expected = requiredFixtureSignalRows(signal);
      const actual = Number(row.rows?.[signal] ?? 0);
      const matrixActual = Number(matrixRow?.signals?.[signal] ?? 0);
      return [
        actual < expected ? `${fixtureId} fixtureSignalRows ${signal} rows below ${expected}` : "",
        matrixRow && actual !== matrixActual
          ? `${fixtureId} fixtureSignalRows ${signal}=${actual} does not match matrix ${matrixActual}`
          : "",
      ].filter(Boolean);
    });
  });
};

const dataScoutFixtureSignalProblems = (
  fixtureIds: string[],
  matrix: string,
  rows: DataTargetScoutArtifact["acceptance"]["fixtureSignals"] | undefined,
) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return ["public/data-target-scout.json fixtureSignals missing"];
  }
  const matrixRows = parseFixtureSignalMatrix(matrix);
  return fixtureIds.flatMap((fixtureId) => {
    const row = rows.find((item) => item.fixtureId === fixtureId);
    const matrixRow = matrixRows.find((item) => item.fixtureId === fixtureId);
    if (!row) return [`public/data-target-scout.json fixtureSignals missing ${fixtureId}`];
    if (!row.ready) return [`public/data-target-scout.json fixtureSignals ${fixtureId} not ready`];
    return requiredFixtureSignals.flatMap((signal) => {
      const expected = requiredFixtureSignalRows(signal);
      const actual = Number(row.rows?.[signal] ?? 0);
      const matrixActual = Number(matrixRow?.signals?.[signal] ?? 0);
      return [
        actual < expected ? `${fixtureId} fixtureSignals ${signal} rows below ${expected}` : "",
        matrixRow && actual !== matrixActual
          ? `${fixtureId} fixtureSignals ${signal}=${actual} does not match matrix ${matrixActual}`
          : "",
      ].filter(Boolean);
    });
  });
};

const dataScoutEndpointReadBackProblems = (
  fixtureIds: string[],
  rows: DataTargetScoutArtifact["acceptance"]["endpointReadBackCommands"] | undefined,
  artifactReady: boolean,
) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return artifactReady ? ["public/data-target-scout.json endpoint read-back commands missing"] : [];
  }
  return fixtureIds.flatMap((fixtureId) =>
    requiredFixtureSignals.flatMap((signal) => {
      const command = rows.find((item) => item.fixtureId === fixtureId && item.key === signal);
      if (!command) {
        return artifactReady ? [`public/data-target-scout.json endpoint read-back command missing ${fixtureId}:${signal}`] : [];
      }
      if (!command.ready && !artifactReady) return [];
      return [
        !command.ready ? `public/data-target-scout.json endpoint read-back command not ready ${fixtureId}:${signal}` : "",
        !command.url ? `public/data-target-scout.json endpoint read-back URL missing ${fixtureId}:${signal}` : "",
        !command.command.includes("curl -sS")
          ? `public/data-target-scout.json endpoint read-back command must use curl ${fixtureId}:${signal}`
          : "",
        command.url.includes("v3.football.api-sports.io") && !command.command.includes("$APIFOOTBALL_KEY_OR_VITE_APIFOOTBALL_KEY")
          ? `public/data-target-scout.json direct API-Football command must use env header ${fixtureId}:${signal}`
          : "",
      ].filter(Boolean);
    }),
  );
};

const validateDataScoutArtifact = (
  verifyValues: Record<string, string>,
  artifact?: DataTargetScoutArtifact,
) => {
  if (!artifact) return ["public/data-target-scout.json missing; run bun run scout:data-targets"];
  const fixtureIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FIXTURE_IDS");
  const matrix = verifyValues.KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX?.trim() ?? "";
  const problems: string[] = [];
  if (artifact.artifactVersion !== 1) problems.push("public/data-target-scout.json artifactVersion must be 1");
  if (!Date.parse(artifact.generatedAt)) problems.push("public/data-target-scout.json generatedAt is invalid");
  if (!artifact.ready) {
    problems.push(
      `public/data-target-scout.json not ready (${artifact.acceptance.readyFixtureCount}/${artifact.acceptance.requiredFixtureCount} ready fixtures)`,
    );
    problems.push(
      ...(artifact.acceptance.gaps ?? [])
        .slice(0, 5)
        .map(
          (gap) =>
            `public/data-target-scout.json ${gap.fixtureId} missing ${gap.missingEndpoints.join(", ") || "endpoint rows"}`,
        ),
    );
  }
  if (!artifact.acceptance.completeSignalMatrix) problems.push("public/data-target-scout.json signal matrix incomplete");
  if (!artifact.acceptance.outputEnvKeys.includes("KICKOFF_VERIFY_FIXTURE_IDS")) {
    problems.push("public/data-target-scout.json missing KICKOFF_VERIFY_FIXTURE_IDS output key");
  }
  if (!artifact.acceptance.outputEnvKeys.includes("KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX")) {
    problems.push("public/data-target-scout.json missing KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX output key");
  }
  if (fixtureIds.length > 0 && fixtureIds.join(",") !== artifact.fixtureIds.join(",")) {
    problems.push("KICKOFF_VERIFY_FIXTURE_IDS do not match public/data-target-scout.json fixtureIds");
  }
  if (matrix && matrix !== artifact.signalMatrix) {
    problems.push("KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX does not match public/data-target-scout.json signalMatrix");
  }
  problems.push(...fixtureSignalMatrixProblems(fixtureIds, matrix || artifact.signalMatrix, "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"));
  problems.push(...fixtureSignalMatrixProblems(artifact.fixtureIds, artifact.signalMatrix, "public/data-target-scout.json signalMatrix"));
  if (artifact.requiredSignals < requiredFixtureSignals.length) {
    problems.push(`public/data-target-scout.json requiredSignals must be ${requiredFixtureSignals.length}`);
  }
  const candidateProblems = artifact.fixtureIds.flatMap((fixtureId) => {
    const candidate = artifact.candidates.find((item) => item.fixtureId === fixtureId);
    if (!candidate) return [`public/data-target-scout.json candidate missing ${fixtureId}`];
    const endpointSignals = new Set(
      candidate.endpoints
        .filter((endpoint) => endpoint.status === "passed" && endpoint.rows >= requiredFixtureSignalRows(endpoint.key))
        .map((endpoint) => endpoint.key),
    );
    return requiredFixtureSignals
      .filter((signal) => !endpointSignals.has(signal))
      .map((signal) => `${fixtureId} missing ${signal} endpoint evidence in public/data-target-scout.json`);
  });
  problems.push(...candidateProblems);
  problems.push(...dataScoutFixtureSignalProblems(artifact.fixtureIds, artifact.signalMatrix, artifact.acceptance.fixtureSignals));
  problems.push(...dataScoutEndpointReadBackProblems(artifact.fixtureIds, artifact.acceptance.endpointReadBackCommands, artifact.ready));
  return unique(problems);
};

const validateDataProviderArtifact = (
  verifyValues: Record<string, string>,
  runtimeEnv: Record<string, string | undefined>,
  artifact?: DataProviderReadinessArtifact,
) => {
  if (!artifact) return ["public/data-provider-readiness.json missing; run bun run data:providers:check"];
  const problems: string[] = [];
  const fixtureIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FIXTURE_IDS");
  if (artifact.artifactVersion !== 1) problems.push("public/data-provider-readiness.json artifactVersion must be 1");
  if (!Date.parse(artifact.generatedAt)) problems.push("public/data-provider-readiness.json generatedAt is invalid");
  if (!artifact.ready) problems.push("public/data-provider-readiness.json not ready");
  if (!artifact.acceptance.apiFootballKey) problems.push("public/data-provider-readiness.json API-Football key missing");
  if (!artifact.acceptance.footballDataBackup) {
    problems.push("public/data-provider-readiness.json stable schedule/score backup missing");
  }
  if (!artifact.acceptance.publicFreeFeedReadBack) {
    problems.push("public/data-provider-readiness.json public free feed read-back missing");
  }
  const publicFeedProof = artifact.targets.publicFreeFeedReadBack;
  if (artifact.targets.freeFeedBackupConfigured && !publicFeedProof?.openfootball?.ok) {
    problems.push("public/data-provider-readiness.json openfootball read-back missing");
  }
  if (artifact.targets.freeFeedBackupConfigured && !publicFeedProof?.theSportsDb?.ok) {
    problems.push("public/data-provider-readiness.json TheSportsDB read-back missing");
  }
  if (!artifact.acceptance.fixtureTargets) problems.push("public/data-provider-readiness.json fixture targets incomplete");
  if (!artifact.acceptance.fixtureSignalMatrix) problems.push("public/data-provider-readiness.json fixture signal matrix incomplete");
  if (!artifact.acceptance.oddsProvider) problems.push("public/data-provider-readiness.json odds provider missing");
  if (!artifact.acceptance.dataProxyHttps) problems.push("public/data-provider-readiness.json HTTPS data proxy missing");
  if (!artifact.acceptance.enrichmentLimitReady) problems.push("public/data-provider-readiness.json enrichment limit invalid");
  if (!artifact.acceptance.scoutWindowReady) problems.push("public/data-provider-readiness.json scout search window invalid");
  const healthProof = artifact.targets.dataProxyHealthProof;
  const usesDataProxy = Boolean(artifact.targets.dataProxyUrl);
  if (usesDataProxy && !healthProof?.ok) {
    problems.push("public/data-provider-readiness.json data proxy health proof missing");
  }
  if (usesDataProxy && !runtimeEnv.VITE_APIFOOTBALL_KEY?.trim() && artifact.acceptance.apiFootballKey && !healthProof?.apiFootballServerKey) {
    problems.push("public/data-provider-readiness.json API-Football proxy key not proven by /health");
  }
  if (
    usesDataProxy &&
    !runtimeEnv.VITE_FOOTBALL_DATA_TOKEN?.trim() &&
    artifact.targets.dataProxyCredentials?.footballData &&
    !healthProof?.footballDataServerToken
  ) {
    problems.push("public/data-provider-readiness.json Football-Data proxy token not proven by /health");
  }
  if (
    usesDataProxy &&
    runtimeEnv.VITE_ODDS_API_SPORT_KEY?.trim() &&
    !runtimeEnv.VITE_ODDS_API_KEY?.trim() &&
    artifact.acceptance.oddsProvider &&
    !healthProof?.oddsApiServerKey
  ) {
    problems.push("public/data-provider-readiness.json Odds proxy key not proven by /health");
  }
  for (const key of [
    "VITE_DATA_PROXY_URL",
    "VITE_DATA_PROXY_SAME_ORIGIN",
    "KICKOFF_VERIFY_FIXTURE_IDS",
    "VITE_APIFOOTBALL_ENRICHMENT_LIMIT",
    "KICKOFF_DATA_SCOUT_LIMIT",
    "KICKOFF_DATA_SCOUT_TARGETS",
  ]) {
    if (!artifact.acceptance.outputEnvKeys.includes(key)) {
      problems.push(`public/data-provider-readiness.json missing ${key} output key`);
    }
  }
  if (!["APIFOOTBALL_KEY", "API_FOOTBALL_KEY", "VITE_APIFOOTBALL_KEY"].some((key) => artifact.acceptance.outputEnvKeys.includes(key))) {
    problems.push("public/data-provider-readiness.json missing APIFOOTBALL_KEY/API_FOOTBALL_KEY/VITE_APIFOOTBALL_KEY output key");
  }
  if (
    ![
      "FOOTBALL_DATA_TOKEN",
      "FOOTBALL_DATA_ORG_TOKEN",
      "VITE_FOOTBALL_DATA_TOKEN",
      "VITE_THESPORTSDB_KEY",
      "VITE_THESPORTSDB_LEAGUE_ID",
      "VITE_THESPORTSDB_SEASON",
    ].some((key) => artifact.acceptance.outputEnvKeys.includes(key))
  ) {
    problems.push("public/data-provider-readiness.json missing stable backup output key");
  }
  const proxyUrl = resolvedDataProviderProxyUrl(runtimeEnv);
  if (proxyUrl && artifact.targets.dataProxyUrl !== proxyUrl) {
    problems.push("runtime data proxy does not match public/data-provider-readiness.json dataProxyUrl");
  }
  if (fixtureIds.length > 0 && artifact.targets.fixtureIds.join(",") !== fixtureIds.join(",")) {
    problems.push("KICKOFF_VERIFY_FIXTURE_IDS do not match public/data-provider-readiness.json fixtureIds");
  }
  const matrix = verifyValues.KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX?.trim() ?? "";
  if (matrix && artifact.targets.fixtureSignalMatrix !== matrix) {
    problems.push("KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX does not match public/data-provider-readiness.json fixtureSignalMatrix");
  }
  problems.push(
    ...fixtureSignalMatrixProblems(
      artifact.targets.fixtureIds,
      artifact.targets.fixtureSignalMatrix,
      "public/data-provider-readiness.json fixtureSignalMatrix",
    ),
  );
  problems.push(...fixtureSignalRowsProblems(artifact.targets.fixtureIds, artifact.targets.fixtureSignalMatrix, artifact.targets.fixtureSignalRows));
  return unique(problems);
};

const validateDataBootstrapPlan = (plan?: DataProductionBootstrapPlan) => {
  if (!plan) return [];
  const problems: string[] = [];
  const readBacks = plan.readBackCommands ?? [];
  const readBackUrlProblems = (
    command: DataProductionBootstrapPlan["readBackCommands"][number],
    expected: { label: string; source: string; targetUrl: string; signal: string; proxied: boolean },
  ) => {
    const issues: string[] = [];
    if (command.targetUrl !== expected.targetUrl) {
      issues.push(`public/data-bootstrap-plan.json target URL mismatch ${expected.label}`);
    }
    if (command.signal !== expected.signal) {
      issues.push(`public/data-bootstrap-plan.json signal mismatch ${expected.label}`);
    }
    if ((expected.proxied || expected.signal === "health") && command.proxyMode !== "data-proxy") {
      issues.push(`public/data-bootstrap-plan.json proxy mode mismatch ${expected.label}`);
    }
    if (!expected.proxied && expected.signal !== "health" && command.proxyMode !== "direct-public") {
      issues.push(`public/data-bootstrap-plan.json proxy mode mismatch ${expected.label}`);
    }
    if (command.url && !command.command.includes(command.url)) {
      issues.push(`public/data-bootstrap-plan.json structured read-back URL not used by command ${expected.label}`);
    }
    if (!command.url) {
      issues.push(`public/data-bootstrap-plan.json structured read-back URL missing ${expected.label}`);
      return issues;
    }
    try {
      const url = new URL(command.url);
      if (url.protocol !== "https:") {
        issues.push(`public/data-bootstrap-plan.json structured read-back URL must use HTTPS ${expected.label}`);
      }
      if (expected.signal === "health") {
        if (command.url !== expected.targetUrl) {
          issues.push(`public/data-bootstrap-plan.json structured health URL mismatch ${expected.label}`);
        }
      } else if (expected.proxied) {
        if (url.searchParams.get("source") !== expected.source) {
          issues.push(`public/data-bootstrap-plan.json structured read-back source mismatch ${expected.label}`);
        }
        if (url.searchParams.get("url") !== expected.targetUrl) {
          issues.push(`public/data-bootstrap-plan.json structured proxied target URL mismatch ${expected.label}`);
        }
      } else if (command.url !== expected.targetUrl) {
        issues.push(`public/data-bootstrap-plan.json structured direct URL mismatch ${expected.label}`);
      }
    } catch {
      issues.push(`public/data-bootstrap-plan.json structured read-back URL malformed ${expected.label}`);
    }
    return issues;
  };
  const validateResponseExpectation = (
    command: DataProductionBootstrapPlan["readBackCommands"][number],
    expected: {
      label: string;
      source: DataProductionBootstrapPlan["readBackCommands"][number]["source"];
      signal: DataProductionBootstrapPlan["readBackCommands"][number]["signal"];
      responseType: NonNullable<DataProductionBootstrapPlan["readBackCommands"][number]["responseExpectation"]>["responseType"];
      rowPath: string;
      minRows?: number;
      requiredFields: string[];
      fixtureId?: string;
      expectedService?: string;
      requiredCredentialFlags?: string[];
    },
  ) => {
    const expectation = command.responseExpectation;
    const issues: string[] = [];
    if (!expectation) {
      return [`public/data-bootstrap-plan.json response expectation missing ${expected.label}`];
    }
    if (expectation.responseType !== expected.responseType) {
      issues.push(`public/data-bootstrap-plan.json response expectation type mismatch ${expected.label}`);
    }
    if (expectation.rowPath !== expected.rowPath) {
      issues.push(`public/data-bootstrap-plan.json response expectation row path mismatch ${expected.label}`);
    }
    if ((expectation.minRows ?? 0) < (expected.minRows ?? 0)) {
      issues.push(`public/data-bootstrap-plan.json response expectation min rows mismatch ${expected.label}`);
    }
    if (expectation.expectedSource !== expected.source) {
      issues.push(`public/data-bootstrap-plan.json response expectation source mismatch ${expected.label}`);
    }
    if (expectation.expectedSignal !== expected.signal) {
      issues.push(`public/data-bootstrap-plan.json response expectation signal mismatch ${expected.label}`);
    }
    if (expected.fixtureId && expectation.expectedFixtureId !== expected.fixtureId) {
      issues.push(`public/data-bootstrap-plan.json response expectation fixture mismatch ${expected.label}`);
    }
    if (expected.expectedService && expectation.expectedService !== expected.expectedService) {
      issues.push(`public/data-bootstrap-plan.json response expectation service mismatch ${expected.label}`);
    }
    const missingFields = expected.requiredFields.filter((field) => !expectation.requiredFields.includes(field));
    if (missingFields.length > 0) {
      issues.push(`public/data-bootstrap-plan.json response expectation fields incomplete ${expected.label}`);
    }
    const missingCredentialFlags = (expected.requiredCredentialFlags ?? []).filter(
      (field) => !(expectation.requiredCredentialFlags ?? []).includes(field),
    );
    if (missingCredentialFlags.length > 0) {
      issues.push(`public/data-bootstrap-plan.json response expectation credentials incomplete ${expected.label}`);
    }
    return issues;
  };
  const expectedProviderResponse = (
    expected: { id: string; source: string; signal: string; label: string },
  ): Parameters<typeof validateResponseExpectation>[1] => {
    if (expected.id === "data-proxy-health") {
      return {
        label: expected.label,
        source: "data-proxy",
        signal: "health",
        responseType: "data-proxy-health",
        rowPath: "$",
        requiredFields: ["ok", "service", "apiFootballServerKey", "footballDataServerToken", "oddsApiServerKey"],
        expectedService: "kickoff-data-proxy",
        requiredCredentialFlags: ["apiFootballServerKey", "footballDataServerToken", "oddsApiServerKey"],
      };
    }
    if (expected.source === "openfootball") {
      return {
        label: expected.label,
        source: "openfootball",
        signal: "worldcup-json",
        responseType: "openfootball-worldcup",
        rowPath: "matches",
        minRows: 1,
        requiredFields: ["name", "matches"],
      };
    }
    if (expected.source === "thesportsdb") {
      return {
        label: expected.label,
        source: "thesportsdb",
        signal: "season-feed",
        responseType: "thesportsdb-season",
        rowPath: "events",
        minRows: 1,
        requiredFields: ["idEvent", "strEvent", "dateEvent", "strHomeTeam", "strAwayTeam"],
      };
    }
    if (expected.source === "football-data") {
      return {
        label: expected.label,
        source: "football-data",
        signal: expected.signal as "matches" | "standings",
        responseType: "football-data-response",
        rowPath: expected.signal === "standings" ? "standings" : "matches",
        minRows: 1,
        requiredFields:
          expected.signal === "standings"
            ? ["stage", "table", "team", "points"]
            : ["id", "utcDate", "status", "homeTeam", "awayTeam", "score"],
      };
    }
    if (expected.source === "odds-api") {
      return {
        label: expected.label,
        source: "odds-api",
        signal: "odds",
        responseType: "odds-api-response",
        rowPath: "$",
        minRows: 1,
        requiredFields: ["id", "home_team", "away_team", "bookmakers"],
      };
    }
    return {
      label: expected.label,
      source: "api-football",
      signal: "standings",
      responseType: "api-football-response",
      rowPath: "response[0].league.standings",
      minRows: 2,
      requiredFields: ["league", "standings", "team", "rank", "points"],
    };
  };
  const expectedFixtureResponse = (
    fixtureId: string,
    signal: "lineups" | "injuries" | "odds",
  ): Parameters<typeof validateResponseExpectation>[1] => ({
    label: `Fixture ${fixtureId} ${signal}`,
    source: "api-football",
    signal,
    responseType: "api-football-response",
    rowPath: "response",
    minRows: requiredFixtureSignalRows(signal),
    requiredFields:
      signal === "lineups"
        ? ["team", "formation", "startXI"]
        : signal === "injuries"
          ? ["player", "team", "fixture"]
          : ["league", "fixture", "bookmakers", "bets"],
    fixtureId,
  });
  const requiredReadBacks = [
    {
      id: "data-proxy-health",
      source: "data-proxy",
      label: "Data proxy health",
      url: "/health",
      targetUrl: "",
      signal: "health",
      proxied: false,
    },
    {
      id: "openfootball-worldcup-2026",
      source: "openfootball",
      label: "openfootball World Cup 2026 JSON",
      url: "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
      targetUrl: "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json",
      signal: "worldcup-json",
      proxied: false,
    },
    {
      id: "thesportsdb-worldcup-season",
      source: "thesportsdb",
      label: "TheSportsDB World Cup season feed",
      url: "https://www.thesportsdb.com/api/v1/json/",
      targetUrl: "https://www.thesportsdb.com/api/v1/json/",
      signal: "season-feed",
      proxied: false,
    },
    {
      id: "api-football-standings",
      source: "api-football",
      label: "API-Football standings",
      url: "v3.football.api-sports.io%2Fstandings",
      targetUrl: "https://v3.football.api-sports.io/standings",
      signal: "standings",
      proxied: true,
    },
    {
      id: "odds-api-h2h",
      source: "odds-api",
      label: "The Odds API H2H",
      url: "api.the-odds-api.com%2Fv4%2Fsports",
      targetUrl: "https://api.the-odds-api.com/v4/sports",
      signal: "odds",
      proxied: true,
    },
  ];
  for (const expected of requiredReadBacks) {
    const command = readBacks.find((item) => item.id === expected.id);
    if (!command) {
      if (plan.ready) {
        problems.push(`public/data-bootstrap-plan.json read-back command missing ${expected.label}`);
      }
      continue;
    }
    if (command.source !== expected.source || command.label !== expected.label) {
      problems.push(`public/data-bootstrap-plan.json read-back command target mismatch ${expected.label}`);
    }
    if (!command.ready) {
      if (plan.ready) {
        problems.push(`public/data-bootstrap-plan.json read-back command not ready ${expected.label}`);
      } else {
        continue;
      }
    }
    if (!command.command.includes("curl -sS")) {
      problems.push(`public/data-bootstrap-plan.json read-back command must use curl ${expected.label}`);
    }
    if (!command.command.includes(expected.url) && !command.url?.includes(expected.url)) {
      problems.push(`public/data-bootstrap-plan.json read-back URL mismatch ${expected.label}`);
    }
    if (["api-football", "football-data", "odds-api"].includes(expected.source) && !command.command.includes(`source=${expected.source}`)) {
      problems.push(`public/data-bootstrap-plan.json read-back source mismatch ${expected.label}`);
    }
    const targetUrlMatchesPrefix = expected.targetUrl ? command.targetUrl?.startsWith(expected.targetUrl) : true;
    const expectedTargetUrl = expected.id === "data-proxy-health"
      ? command.targetUrl
      : expected.targetUrl && targetUrlMatchesPrefix
        ? command.targetUrl
        : expected.targetUrl;
    problems.push(
      ...readBackUrlProblems(command, {
        label: expected.label,
        source: expected.source,
        targetUrl: expectedTargetUrl,
        signal: expected.signal,
        proxied: expected.proxied,
      }),
      ...validateResponseExpectation(command, expectedProviderResponse(expected)),
    );
  }
  const fixtureIds = [...new Set(readBacks.map((item) => item.fixtureId).filter((item): item is string => Boolean(item)))];
  for (const fixtureId of fixtureIds) {
    for (const signal of ["lineups", "injuries", "odds"] as const) {
      const id = `fixture:${fixtureId}:${signal}`;
      const command = readBacks.find((item) => item.id === id);
      if (!command) {
        if (plan.ready) {
          problems.push(`public/data-bootstrap-plan.json read-back command missing Fixture ${fixtureId} ${signal}`);
        }
        continue;
      }
      if (command.source !== "api-football" || command.fixtureId !== fixtureId) {
        problems.push(`public/data-bootstrap-plan.json fixture read-back target mismatch Fixture ${fixtureId} ${signal}`);
      }
      if (!command.ready) {
        if (plan.ready) {
          problems.push(`public/data-bootstrap-plan.json read-back command not ready Fixture ${fixtureId} ${signal}`);
        } else {
          continue;
        }
      }
      if (!command.command.includes("curl -sS")) {
        problems.push(`public/data-bootstrap-plan.json read-back command must use curl Fixture ${fixtureId} ${signal}`);
      }
      const expectedPath = signal === "lineups" ? "fixtures%2Flineups" : signal;
      if (!command.command.includes(expectedPath) || !command.command.includes(`fixture%3D${fixtureId}`)) {
        problems.push(`public/data-bootstrap-plan.json read-back URL mismatch Fixture ${fixtureId} ${signal}`);
      }
      const targetPath = signal === "lineups" ? "fixtures/lineups" : signal;
      problems.push(
        ...readBackUrlProblems(command, {
          label: `Fixture ${fixtureId} ${signal}`,
          source: "api-football",
          targetUrl: `https://v3.football.api-sports.io/${targetPath}?fixture=${fixtureId}`,
          signal,
          proxied: true,
        }),
        ...validateResponseExpectation(command, expectedFixtureResponse(fixtureId, signal)),
      );
    }
  }
  return unique(problems);
};

const filecoinBootstrapReadBackUrlProblem = (
  label: string,
  kind: "health" | "job" | "verify" | "proof",
  urlText: string | undefined,
  expectedId?: string,
) => {
  if (!urlText) return `public/filecoin-bootstrap-plan.json structured read-back URL missing ${label}`;
  try {
    const url = new URL(urlText);
    if (url.protocol !== "https:") return `public/filecoin-bootstrap-plan.json structured read-back URL must use HTTPS ${label}`;
    if (kind === "health" && !url.pathname.endsWith("/health")) {
      return `public/filecoin-bootstrap-plan.json structured health URL mismatch ${label}`;
    }
    if (kind === "job") {
      const parts = url.pathname.split("/").filter(Boolean);
      const jobId = parts.at(-1) ? decodeURIComponent(parts.at(-1)!) : "";
      if (!parts.includes("jobs") || jobId !== expectedId) {
        return `public/filecoin-bootstrap-plan.json structured job URL mismatch ${label}`;
      }
    }
    if (kind === "verify") {
      if (!url.pathname.endsWith("/verify")) return `public/filecoin-bootstrap-plan.json structured verify URL mismatch ${label}`;
      if (url.searchParams.get("cid") !== expectedId) {
        return `public/filecoin-bootstrap-plan.json structured verify CID mismatch ${label}`;
      }
    }
    if (kind === "proof") {
      const parts = url.pathname.split("/").filter(Boolean);
      const cid = parts.at(-1) ? decodeURIComponent(parts.at(-1)!) : "";
      if (!parts.includes("proof") || cid !== expectedId) {
        return `public/filecoin-bootstrap-plan.json structured proof CID mismatch ${label}`;
      }
    }
    return "";
  } catch {
    return `public/filecoin-bootstrap-plan.json structured read-back URL malformed ${label}`;
  }
};

const validateFilecoinBootstrapPlan = (
  plan: FilecoinProductionBootstrapPlan | undefined,
  verifyValues: Record<string, string>,
  runtimeEnv: Record<string, string | undefined>,
) => {
  if (!plan) return [];
  const problems: string[] = [];
  const readBacks = plan.readBackCommands ?? [];
  const modeCids = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  const modeHashes = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  const modeJobIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS");
  const readBackAuthMode = runtimeValue(runtimeEnv, "VITE_FILECOIN_SEAL_SAME_ORIGIN") === "1" && !runtimeValue(runtimeEnv, "VITE_FILECOIN_SEAL_API")
    ? "same-origin"
    : "bearer-token";
  const recordJobId = verifyValues.KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID;
  const expectedReadBacks = [
    { label: "Seal API health", kind: "health" as const, authMode: "none" as const },
    ...(recordJobId
      ? [
          {
            label: "Record upload status",
            kind: "job" as const,
            authMode: readBackAuthMode,
            expectedJobId: recordJobId,
          },
        ]
      : []),
    {
      label: "Record verify status",
      kind: "verify" as const,
      authMode: readBackAuthMode,
      expectedCid: verifyValues.KICKOFF_VERIFY_FILECOIN_RECORD_CID,
      expectedPayloadHash: verifyValues.KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH,
    },
    {
      label: "Record proof read-back",
      kind: "proof" as const,
      authMode: readBackAuthMode,
      expectedCid: verifyValues.KICKOFF_VERIFY_FILECOIN_RECORD_CID,
      expectedPayloadHash: verifyValues.KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH,
    },
    ...modeCids.flatMap((cid, index) => [
      ...(modeJobIds[index]
        ? [
            {
              label: `Mode ${index + 1} upload status`,
              kind: "job" as const,
              authMode: readBackAuthMode,
              expectedJobId: modeJobIds[index],
            },
          ]
        : []),
      {
        label: `Mode ${index + 1} verify status`,
        kind: "verify" as const,
        authMode: readBackAuthMode,
        expectedCid: cid,
        expectedPayloadHash: modeHashes[index],
      },
      {
        label: `Mode ${index + 1} proof read-back`,
        kind: "proof" as const,
        authMode: readBackAuthMode,
        expectedCid: cid,
        expectedPayloadHash: modeHashes[index],
      },
    ]),
  ];
  for (const expected of expectedReadBacks) {
    const label = expected.label;
    const command = readBacks.find((item) => item.label === label);
    if (!command) {
      if (plan.ready) {
        problems.push(`public/filecoin-bootstrap-plan.json read-back command missing ${label}`);
      }
      continue;
    }
    if (!command.ready) {
      if (plan.ready) {
        problems.push(`public/filecoin-bootstrap-plan.json read-back command not ready ${label}`);
      } else {
        continue;
      }
    }
    if (!command.command.includes("curl -sS")) {
      problems.push(`public/filecoin-bootstrap-plan.json read-back command must use curl ${label}`);
    }
    if (command.kind !== expected.kind) {
      problems.push(`public/filecoin-bootstrap-plan.json structured read-back kind mismatch ${label}`);
    }
    if (command.authMode !== expected.authMode) {
      problems.push(`public/filecoin-bootstrap-plan.json structured read-back auth mode mismatch ${label}`);
    }
    if (expected.authMode === "same-origin" && command.command.includes("VITE_FILECOIN_SEAL_TOKEN")) {
      problems.push(`public/filecoin-bootstrap-plan.json same-origin read-back must not expose browser token ${label}`);
    }
    if (expected.authMode === "bearer-token" && !command.command.includes("VITE_FILECOIN_SEAL_TOKEN")) {
      problems.push(`public/filecoin-bootstrap-plan.json direct read-back must use VITE_FILECOIN_SEAL_TOKEN ${label}`);
    }
    if (command.url && !command.command.includes(command.url)) {
      problems.push(`public/filecoin-bootstrap-plan.json structured read-back URL not used by command ${label}`);
    }
    problems.push(filecoinBootstrapReadBackUrlProblem(label, expected.kind, command.url, expected.expectedCid ?? expected.expectedJobId));
    if (expected.expectedCid && command.expectedCid !== expected.expectedCid) {
      problems.push(`public/filecoin-bootstrap-plan.json expected CID mismatch ${label}`);
    }
    if (expected.expectedJobId && command.expectedJobId !== expected.expectedJobId) {
      problems.push(`public/filecoin-bootstrap-plan.json expected job id mismatch ${label}`);
    }
    if (expected.expectedPayloadHash && command.expectedPayloadHash !== expected.expectedPayloadHash) {
      problems.push(`public/filecoin-bootstrap-plan.json expected payload hash mismatch ${label}`);
    }
    const responseExpectation = command.responseExpectation;
    if (!responseExpectation) {
      problems.push(`public/filecoin-bootstrap-plan.json response expectation missing ${label}`);
    } else {
      if (expected.kind === "health") {
        if (
          responseExpectation.ok !== true ||
          responseExpectation.productionReady !== true ||
          responseExpectation.mockMode !== false ||
          responseExpectation.authRequired !== true ||
          responseExpectation.persistence !== "file"
        ) {
          problems.push(`public/filecoin-bootstrap-plan.json health response expectation mismatch ${label}`);
        }
      }
      if (expected.kind === "job") {
        if (responseExpectation.ok !== true || responseExpectation.status !== "verified") {
          problems.push(`public/filecoin-bootstrap-plan.json job response expectation mismatch ${label}`);
        }
        if (expected.expectedJobId && responseExpectation.jobId !== expected.expectedJobId) {
          problems.push(`public/filecoin-bootstrap-plan.json job response expectation id mismatch ${label}`);
        }
      }
      if (expected.kind === "verify" || expected.kind === "proof") {
        const expectedProofStatus = expected.kind === "verify" ? "verified" : "retrievable";
        if (responseExpectation.ok !== true || responseExpectation.proofStatus !== expectedProofStatus) {
          problems.push(`public/filecoin-bootstrap-plan.json proof response expectation status mismatch ${label}`);
        }
        if (expected.expectedCid && responseExpectation.cid !== expected.expectedCid) {
          problems.push(`public/filecoin-bootstrap-plan.json proof response expectation CID mismatch ${label}`);
        }
        if (expected.expectedPayloadHash && responseExpectation.payloadHash !== expected.expectedPayloadHash) {
          problems.push(`public/filecoin-bootstrap-plan.json proof response expectation payload hash mismatch ${label}`);
        }
      }
    }
    if (label === "Seal API health" && !command.command.includes("/health")) {
      problems.push(`public/filecoin-bootstrap-plan.json health read-back URL mismatch ${label}`);
    }
    if (label === "Record verify status" && !command.command.includes("/verify?cid=")) {
      problems.push(`public/filecoin-bootstrap-plan.json verify read-back URL mismatch ${label}`);
    }
    if (label === "Record proof read-back" && !command.command.includes("/proof/")) {
      problems.push(`public/filecoin-bootstrap-plan.json proof read-back URL mismatch ${label}`);
    }
    if (label === "Record upload status" && !command.command.includes("/jobs/")) {
      problems.push(`public/filecoin-bootstrap-plan.json job read-back URL mismatch ${label}`);
    }
  }
  return unique(problems);
};

const validateSupabaseShareImageOutputs = (
  verifyValues: Record<string, string>,
  runtimeEnv: Record<string, string | undefined>,
) =>
  unique([
    publicShareImageUrlProblem(verifyValues.KICKOFF_VERIFY_SHARE_IMAGE_URL ?? "", "KICKOFF_VERIFY_SHARE_IMAGE_URL"),
    publicShareImageUrlProblem(
      verifyValues.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL ?? "",
      "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
    ),
  ]);

const validateShareImageUploadArtifact = (
  verifyValues: Record<string, string>,
  kind: "record" | "mode",
  artifact?: ShareImageUploadArtifact,
  seedArtifact?: ProductionTargetSeedArtifact,
) => {
  const label = kind === "mode" ? "mode" : "record";
  const envKey = kind === "mode" ? "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL" : "KICKOFF_VERIFY_SHARE_IMAGE_URL";
  if (!artifact) {
    const seedUrl = kind === "mode" ? seedArtifact?.seed?.targets.modeShareImageUrl : seedArtifact?.seed?.targets.shareImageUrl;
    if (verifyValues[envKey]?.trim() && seedUrl === verifyValues[envKey] && !publicShareImageUrlProblem(seedUrl, envKey)) {
      return [];
    }
    return [
      `public/share-image-upload-${label}.json missing; run bun run share:upload-image${kind === "mode" ? " -- --kind=mode --file=public/generated/kickoff-production-mode-share.png" : ""}`,
    ];
  }
  const problems: string[] = [];
  const readBackCommand = artifact.readBackCommands?.find((command) => command.id === "public-image");
  if (artifact.artifactVersion !== 1) problems.push(`public/share-image-upload-${label}.json artifactVersion must be 1`);
  if (!Date.parse(artifact.generatedAt)) problems.push(`public/share-image-upload-${label}.json generatedAt is invalid`);
  if (!artifact.ready) problems.push(`public/share-image-upload-${label}.json not ready`);
  if (artifact.target.kind !== kind) problems.push(`public/share-image-upload-${label}.json target kind must be ${kind}`);
  if (!artifact.acceptance.uploaded) problems.push(`public/share-image-upload-${label}.json upload missing`);
  if (!artifact.acceptance.publicReadBack) problems.push(`public/share-image-upload-${label}.json public read-back incomplete`);
  if (!artifact.acceptance.supabasePublicUrl) problems.push(`public/share-image-upload-${label}.json public URL is not Supabase Storage`);
  if (!artifact.acceptance.imageHashReady) problems.push(`public/share-image-upload-${label}.json image hash missing`);
  if (!artifact.acceptance.outputEnvKeys.includes(envKey)) {
    problems.push(`public/share-image-upload-${label}.json missing ${envKey} output key`);
  }
  if (verifyValues[envKey]?.trim() && artifact.result?.publicUrl !== verifyValues[envKey]) {
    problems.push(`${envKey} does not match public/share-image-upload-${label}.json publicUrl`);
  }
  if (artifact.result?.publicUrl) {
    if (!readBackCommand) {
      problems.push(`public/share-image-upload-${label}.json read-back command missing public-image`);
    } else {
      if (readBackCommand.url !== artifact.result.publicUrl) {
        problems.push(`public/share-image-upload-${label}.json read-back URL mismatch public-image`);
      }
      if (readBackCommand.path !== artifact.result.path) {
        problems.push(`public/share-image-upload-${label}.json read-back storage path mismatch public-image`);
      }
      if (!readBackCommand.command.includes("curl -sS")) {
        problems.push(`public/share-image-upload-${label}.json read-back command must use curl public-image`);
      }
      if (!readBackCommand.command.includes(artifact.result.publicUrl)) {
        problems.push(`public/share-image-upload-${label}.json read-back command URL mismatch public-image`);
      }
      if (artifact.ready && !readBackCommand.ready) {
        problems.push(`public/share-image-upload-${label}.json read-back command not ready public-image`);
      }
      const expectation = readBackCommand.responseExpectation;
      if (!expectation) {
        problems.push(`public/share-image-upload-${label}.json response expectation missing public-image`);
      } else {
        if (expectation.responseType !== "image") {
          problems.push(`public/share-image-upload-${label}.json response type mismatch public-image`);
        }
        if (expectation.contentType !== artifact.result.imageMime) {
          problems.push(`public/share-image-upload-${label}.json content type mismatch public-image`);
        }
        if (expectation.expectedImageHash !== artifact.result.imageHash) {
          problems.push(`public/share-image-upload-${label}.json image hash expectation mismatch public-image`);
        }
        if (expectation.expectedByteLength !== artifact.result.imageByteLength) {
          problems.push(`public/share-image-upload-${label}.json byte length expectation mismatch public-image`);
        }
        if ((expectation.minByteLength ?? 0) < 10_000) {
          problems.push(`public/share-image-upload-${label}.json minimum byte length expectation too low public-image`);
        }
        if (expectation.expectedPublicUrl !== artifact.result.publicUrl) {
          problems.push(`public/share-image-upload-${label}.json public URL expectation mismatch public-image`);
        }
        if (expectation.expectedStoragePath !== artifact.result.path) {
          problems.push(`public/share-image-upload-${label}.json storage path expectation mismatch public-image`);
        }
      }
    }
  }
  return unique(problems);
};

const leaderboardTargetQueryRequiredFields = [
  "id",
  "display_name",
  "location",
  "friend_code",
  "season_key",
  "locks",
  "revealed",
  "average_score",
  "best_score",
  "xp",
  "streak",
  "exact_hits",
  "verified_proofs",
  "mode_proofs",
  "global_rank",
  "friend_rank",
  "season_rank",
  "rank",
  "updated_at",
];

const leaderboardTargetQueryProblems = (artifact: LeaderboardProductionArtifact) => {
  const scopes = ["global", "friend", "season"] as const;
  return scopes.flatMap((scope) => {
    const query = artifact.targetQueries[scope] ?? "";
    const params = new URLSearchParams(query.includes("?") ? query.slice(query.indexOf("?") + 1) : "");
    const selectFields = new Set((params.get("select") ?? "").split(",").map((field) => field.trim()).filter(Boolean));
    const missingFields = leaderboardTargetQueryRequiredFields.filter((field) => !selectFields.has(field));
    const missing = [
      query.startsWith("kickoff_leaderboard?") ? "" : "kickoff_leaderboard path",
      params.get("id") === `eq.${artifact.targets.userId}` ? "" : "current-user id filter",
      params.get("order") === "xp.desc" ? "" : "xp desc order",
      params.get("limit") === "1" ? "" : "limit=1",
      scope === "friend" && params.get("friend_code") !== `eq.${artifact.targets.friendCode}` ? "friend_code filter" : "",
      scope === "season" && params.get("season_key") !== `eq.${artifact.targets.seasonKey}` ? "season_key filter" : "",
      missingFields.length > 0 ? `select fields ${missingFields.slice(0, 4).join(", ")}${missingFields.length > 4 ? ` +${missingFields.length - 4}` : ""}` : "",
    ].filter(Boolean);
    return missing.length > 0
      ? [`public/leaderboard-backend.json ${scope} target query incomplete (${missing.join("; ")})`]
      : [];
  });
};

const leaderboardBoardQueryProblems = (artifact: LeaderboardProductionArtifact) => {
  const scopes = ["global", "friend", "season"] as const;
  const expectedOrder = { global: "global_rank.asc", friend: "friend_rank.asc", season: "season_rank.asc" };
  return scopes.flatMap((scope) => {
    const query = artifact.boardQueries?.[scope] ?? "";
    const params = new URLSearchParams(query.includes("?") ? query.slice(query.indexOf("?") + 1) : "");
    const selectFields = new Set((params.get("select") ?? "").split(",").map((field) => field.trim()).filter(Boolean));
    const missingFields = leaderboardTargetQueryRequiredFields.filter((field) => !selectFields.has(field));
    const limit = Number(params.get("limit"));
    const missing = [
      query.startsWith("kickoff_leaderboard?") ? "" : "kickoff_leaderboard path",
      params.get("order") === expectedOrder[scope] ? "" : `${expectedOrder[scope]} order`,
      Number.isInteger(limit) && limit >= 10 ? "" : "limit>=10",
      scope === "friend" && params.get("friend_code") !== `eq.${artifact.targets.friendCode}` ? "friend_code filter" : "",
      scope === "season" && params.get("season_key") !== `eq.${artifact.targets.seasonKey}` ? "season_key filter" : "",
      missingFields.length > 0 ? `select fields ${missingFields.slice(0, 4).join(", ")}${missingFields.length > 4 ? ` +${missingFields.length - 4}` : ""}` : "",
    ].filter(Boolean);
    return missing.length > 0
      ? [`public/leaderboard-backend.json ${scope} board query incomplete (${missing.join("; ")})`]
      : [];
  });
};

const leaderboardQueryContractProblems = (artifact: LeaderboardProductionArtifact) => {
  const scopes = ["global", "friend", "season"] as const;
  if (!Array.isArray(artifact.queryContracts) || artifact.queryContracts.length === 0) {
    return ["public/leaderboard-backend.json queryContracts missing"];
  }
  return scopes.flatMap((scope) => {
    const contract = artifact.queryContracts.find((item) => item.scope === scope);
    if (!contract) return [`public/leaderboard-backend.json ${scope} query contract missing`];
    const problems = [
      contract.passed ? "" : "contract not passed",
      contract.targetQueryReady ? "" : "target query not ready",
      contract.boardQueryReady ? "" : "board query not ready",
      contract.targetQuery === artifact.targetQueries[scope] ? "" : "target query mismatch",
      contract.boardQuery === artifact.boardQueries?.[scope] ? "" : "board query mismatch",
    ].filter(Boolean);
    return problems.length > 0
      ? [`public/leaderboard-backend.json ${scope} query contract incomplete (${problems.join("; ")})`]
      : [];
  });
};

const leaderboardScopeClaimProblems = (artifact: LeaderboardProductionArtifact) => {
  const scopes = ["global", "friend", "season"] as const;
  const expectedCheckId = {
    global: "leaderboard-global-user",
    friend: "leaderboard-friend-user",
    season: "leaderboard-season-user",
  } as const;
  const expectedBoardCheckId = {
    global: "leaderboard-global-board",
    friend: "leaderboard-friend-board",
    season: "leaderboard-season-board",
  } as const;
  if (!Array.isArray(artifact.acceptance.scopeClaims) || artifact.acceptance.scopeClaims.length === 0) {
    return ["public/leaderboard-backend.json scopeClaims missing"];
  }
  return scopes.flatMap((scope) => {
    const claim = artifact.acceptance.scopeClaims.find((item) => item.scope === scope);
    if (!claim) return [`public/leaderboard-backend.json ${scope} scope claim missing`];
    const expectedCurrentUser = {
      global: artifact.acceptance.globalCurrentUser,
      friend: artifact.acceptance.friendCurrentUser,
      season: artifact.acceptance.seasonCurrentUser,
    }[scope];
    const expectedBoardRows = {
      global: artifact.acceptance.globalBoardRows,
      friend: artifact.acceptance.friendBoardRows,
      season: artifact.acceptance.seasonBoardRows,
    }[scope];
    const doctorPassed = artifact.doctor?.passedLeaderboardCheckIds.includes(expectedCheckId[scope]) === true;
    const boardPassed = artifact.doctor?.passedLeaderboardCheckIds.includes(expectedBoardCheckId[scope]) === true;
    const contract = artifact.queryContracts.find((item) => item.scope === scope);
    const problems = [
      claim.currentUser === expectedCurrentUser ? "" : "current-user claim mismatch",
      claim.boardRows === expectedBoardRows ? "" : "board-row claim mismatch",
      claim.doctorCheckId === expectedCheckId[scope] ? "" : "doctor check id mismatch",
      claim.boardCheckId === expectedBoardCheckId[scope] ? "" : "board check id mismatch",
      claim.doctorPassed === doctorPassed ? "" : "doctor status mismatch",
      claim.boardPassed === boardPassed ? "" : "board status mismatch",
      claim.targetQueryReady === contract?.targetQueryReady ? "" : "target query readiness mismatch",
      claim.boardQueryReady === contract?.boardQueryReady ? "" : "board query readiness mismatch",
      claim.targetQuery === artifact.targetQueries[scope] ? "" : "target query mismatch",
      claim.boardQuery === artifact.boardQueries?.[scope] ? "" : "board query mismatch",
      claim.currentUser && claim.boardRows && claim.doctorPassed && claim.boardPassed && claim.targetQueryReady && claim.boardQueryReady
        ? ""
        : `claim blockers ${claim.blockers?.join(", ") || "missing"}`,
    ].filter(Boolean);
    return problems.length > 0
      ? [`public/leaderboard-backend.json ${scope} scope claim incomplete (${problems.join("; ")})`]
      : [];
  });
};

const leaderboardReadBackCommandProblems = (artifact: LeaderboardProductionArtifact) => {
  const scopes = ["global", "friend", "season"] as const;
  const commands = artifact.readBackCommands ?? [];
  const byId = new Map(commands.map((command) => [command.id, command]));
  const expectedOrder = { global: "global_rank.asc", friend: "friend_rank.asc", season: "season_rank.asc" } as const;
  const requiredRankFields = ["global_rank", "friend_rank", "season_rank", "rank"];
  const responseExpectationProblems = (
    command: LeaderboardProductionArtifact["readBackCommands"][number],
    scope: (typeof scopes)[number],
    kind: "current-user" | "board",
    minRows: number,
  ) => {
    const expectation = command.responseExpectation;
    if (!expectation) return ["response expectation missing"];
    const missingFields = leaderboardTargetQueryRequiredFields.filter((field) => !expectation.requiredFields.includes(field));
    const missingRankFields = requiredRankFields.filter((field) => !expectation.requiredRankFields.includes(field));
    return [
      expectation.responseType === "supabase-array" ? "" : "response expectation type mismatch",
      expectation.table === "kickoff_leaderboard" ? "" : "response expectation table mismatch",
      expectation.scope === scope ? "" : "response expectation scope mismatch",
      expectation.kind === kind ? "" : "response expectation kind mismatch",
      expectation.minRows >= minRows ? "" : "response expectation min rows mismatch",
      missingFields.length === 0 ? "" : "response expectation fields incomplete",
      missingRankFields.length === 0 ? "" : "response expectation rank fields incomplete",
      expectation.expectedOrder === (kind === "current-user" ? "xp.desc" : expectedOrder[scope])
        ? ""
        : "response expectation order mismatch",
      kind === "current-user" && expectation.expectedUserId !== artifact.targets.userId ? "response expectation user mismatch" : "",
      scope === "friend" && expectation.expectedFriendCode !== artifact.targets.friendCode
        ? "response expectation friend code mismatch"
        : "",
      scope === "season" && expectation.expectedSeasonKey !== artifact.targets.seasonKey
        ? "response expectation season key mismatch"
        : "",
    ].filter(Boolean);
  };
  return scopes.flatMap((scope) =>
    (["current-user", "board"] as const).flatMap((kind) => {
      const id = `leaderboard:${scope}:${kind}`;
      const command = byId.get(id);
      const expectedPath = kind === "current-user" ? artifact.targetQueries[scope] : artifact.boardQueries?.[scope];
      if (!command) {
        return artifact.ready ? [`public/leaderboard-backend.json read-back command missing ${id}`] : [];
      }
      if (!command.ready) {
        if (!artifact.ready) return [];
      }
      const params = new URLSearchParams((command.queryPath ?? "").includes("?") ? command.queryPath.slice(command.queryPath.indexOf("?") + 1) : "");
      const minRows = kind === "current-user" ? 1 : 10;
      const problems = [
        command.scope === scope ? "" : "scope mismatch",
        command.kind === kind ? "" : "kind mismatch",
        command.authMode === "anon" ? "" : "auth mode mismatch",
        command.queryPath === expectedPath ? "" : "query path mismatch",
        expectedPath && command.url.endsWith(`/rest/v1/${expectedPath}`) ? "" : "URL mismatch",
        command.url && command.command.includes(command.url) ? "" : "structured URL not used by command",
        command.command.includes("curl -sS") ? "" : "must use curl",
        command.command.includes("$VITE_SUPABASE_ANON_KEY") ? "" : "must use VITE_SUPABASE_ANON_KEY",
        command.command.includes(expectedPath ?? "") ? "" : "query path missing",
        command.expectedOrder === (kind === "current-user" ? "xp.desc" : expectedOrder[scope]) ? "" : "expected order mismatch",
        params.get("order") === command.expectedOrder ? "" : "query order mismatch",
        Number(params.get("limit")) >= minRows && command.minRows === minRows ? "" : "row limit mismatch",
        kind === "current-user" && command.expectedUserId !== artifact.targets.userId ? "expected user mismatch" : "",
        kind === "current-user" && params.get("id") !== `eq.${artifact.targets.userId}` ? "user id filter mismatch" : "",
        scope === "friend" && command.expectedFriendCode !== artifact.targets.friendCode ? "expected friend code mismatch" : "",
        scope === "friend" && params.get("friend_code") !== `eq.${artifact.targets.friendCode}` ? "friend code filter mismatch" : "",
        scope === "season" && command.expectedSeasonKey !== artifact.targets.seasonKey ? "expected season key mismatch" : "",
        scope === "season" && params.get("season_key") !== `eq.${artifact.targets.seasonKey}` ? "season key filter mismatch" : "",
        artifact.ready && !command.ready ? "not ready" : "",
        ...responseExpectationProblems(command, scope, kind, minRows),
      ].filter(Boolean);
      return problems.length > 0
        ? problems.map((problem) => `public/leaderboard-backend.json read-back command ${problem} ${id}`)
        : [];
    }),
  );
};

const validateLeaderboardArtifact = (
  verifyValues: Record<string, string>,
  artifact?: LeaderboardProductionArtifact,
) => {
  if (!artifact) return ["public/leaderboard-backend.json missing; run bun run leaderboard:bootstrap"];
  const problems: string[] = [];
  if (artifact.artifactVersion !== 1) problems.push("public/leaderboard-backend.json artifactVersion must be 1");
  if (!Date.parse(artifact.generatedAt)) problems.push("public/leaderboard-backend.json generatedAt is invalid");
  if (!artifact.ready) problems.push("public/leaderboard-backend.json not ready");
  if (!artifact.acceptance.targetEnvReady) problems.push("public/leaderboard-backend.json target env incomplete");
  if (!artifact.acceptance.queryContractsReady) problems.push("public/leaderboard-backend.json query contracts incomplete");
  if (!artifact.acceptance.globalCurrentUser) problems.push("public/leaderboard-backend.json global current-user scope missing");
  if (!artifact.acceptance.friendCurrentUser) problems.push("public/leaderboard-backend.json friend current-user scope missing");
  if (!artifact.acceptance.seasonCurrentUser) problems.push("public/leaderboard-backend.json season current-user scope missing");
  if (!artifact.acceptance.globalBoardRows) problems.push("public/leaderboard-backend.json global board rows missing");
  if (!artifact.acceptance.friendBoardRows) problems.push("public/leaderboard-backend.json friend board rows missing");
  if (!artifact.acceptance.seasonBoardRows) problems.push("public/leaderboard-backend.json season board rows missing");
  if (artifact.acceptance.passedScopeCount < artifact.acceptance.requiredScopeCount) {
    problems.push(
      `public/leaderboard-backend.json scopes incomplete (${artifact.acceptance.passedScopeCount}/${artifact.acceptance.requiredScopeCount})`,
    );
  }
  if ((artifact.acceptance.passedBoardCount ?? 0) < (artifact.acceptance.requiredBoardCount ?? 3)) {
    problems.push(
      `public/leaderboard-backend.json board rows incomplete (${artifact.acceptance.passedBoardCount ?? 0}/${artifact.acceptance.requiredBoardCount ?? 3})`,
    );
  }
  for (const key of [
    "KICKOFF_VERIFY_USER_ID",
    "KICKOFF_VERIFY_FRIEND_CODE",
    "KICKOFF_VERIFY_SEASON_KEY",
    "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
  ]) {
    if (!artifact.acceptance.outputEnvKeys.includes(key)) {
      problems.push(`public/leaderboard-backend.json missing ${key} output key`);
    }
  }
  if (!artifact.doctor) problems.push("public/leaderboard-backend.json Supabase doctor read-back missing");
  if (artifact.doctor && artifact.doctor.failedLeaderboardCheckIds.length > 0) {
    problems.push(
      `public/leaderboard-backend.json failed leaderboard checks: ${artifact.doctor.failedLeaderboardCheckIds.join(", ")}`,
    );
  }
  problems.push(...leaderboardTargetQueryProblems(artifact));
  problems.push(...leaderboardBoardQueryProblems(artifact));
  problems.push(...leaderboardQueryContractProblems(artifact));
  problems.push(...leaderboardScopeClaimProblems(artifact));
  problems.push(...leaderboardReadBackCommandProblems(artifact));
  if (verifyValues.KICKOFF_VERIFY_USER_ID && artifact.targets.userId !== verifyValues.KICKOFF_VERIFY_USER_ID) {
    problems.push("KICKOFF_VERIFY_USER_ID does not match public/leaderboard-backend.json userId");
  }
  if (verifyValues.KICKOFF_VERIFY_FRIEND_CODE && artifact.targets.friendCode !== verifyValues.KICKOFF_VERIFY_FRIEND_CODE) {
    problems.push("KICKOFF_VERIFY_FRIEND_CODE does not match public/leaderboard-backend.json friendCode");
  }
  if (verifyValues.KICKOFF_VERIFY_SEASON_KEY && artifact.targets.seasonKey !== verifyValues.KICKOFF_VERIFY_SEASON_KEY) {
    problems.push("KICKOFF_VERIFY_SEASON_KEY does not match public/leaderboard-backend.json seasonKey");
  }
  const leaderboardScopes = listVerifyValue(verifyValues, "KICKOFF_VERIFY_LEADERBOARD_SCOPES").map((scope) => scope.toLowerCase());
  const artifactLeaderboardScopes =
    artifact.targets.leaderboardScopes?.length
      ? artifact.targets.leaderboardScopes
      : (artifact.queryContracts ?? []).map((contract) => contract.scope);
  if (leaderboardScopes.length > 0 && artifactLeaderboardScopes.join(",") !== leaderboardScopes.join(",")) {
    problems.push("KICKOFF_VERIFY_LEADERBOARD_SCOPES do not match public/leaderboard-backend.json leaderboardScopes");
  }
  return unique(problems);
};

const validateShareChannelArtifact = (
  verifyValues: Record<string, string>,
  runtimeEnv: Record<string, string | undefined>,
  artifact?: ShareChannelEvidenceArtifact,
) => {
  if (!artifact) return ["public/share-channel-evidence.json missing; run bun run sharing:bootstrap"];
  const problems: string[] = [];
  const modeIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_MODE_IDS");
  const shareArtifactIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS");
  const publicAppUrl = normalizePublicAppUrl(runtimeValue(runtimeEnv, "VITE_PUBLIC_APP_URL")) ?? "";
  const proofUrl = expectedPublicProofUrl(runtimeEnv, "proof", verifyValues.KICKOFF_VERIFY_PROOF_ID ?? "");
  const modeProofUrls = modeIds.map((id) => expectedPublicProofUrl(runtimeEnv, "mode", id));
  if (artifact.artifactVersion !== 1) problems.push("public/share-channel-evidence.json artifactVersion must be 1");
  if (!Date.parse(artifact.generatedAt)) problems.push("public/share-channel-evidence.json generatedAt is invalid");
  if (!artifact.ready) problems.push("public/share-channel-evidence.json not ready");
  if (!artifact.acceptance.targetEnvReady) problems.push("public/share-channel-evidence.json target env incomplete");
  if (!artifact.acceptance.publicTargetUrlsReady) {
    problems.push("public/share-channel-evidence.json public target URLs incomplete");
  }
  if (!artifact.acceptance.recordChannelOpened) problems.push("public/share-channel-evidence.json record share channel missing");
  if (artifact.acceptance.modeChannelCount < artifact.acceptance.requiredModeChannelCount) {
    problems.push(
      `public/share-channel-evidence.json mode share channels incomplete (${artifact.acceptance.modeChannelCount}/${artifact.acceptance.requiredModeChannelCount})`,
    );
  }
  if (artifact.acceptance.passedTargetCount < artifact.acceptance.requiredTargetCount) {
    problems.push(
      `public/share-channel-evidence.json share channels incomplete (${artifact.acceptance.passedTargetCount}/${artifact.acceptance.requiredTargetCount})`,
    );
  }
  for (const key of [
    "VITE_PUBLIC_APP_URL",
    "KICKOFF_VERIFY_PROOF_ID",
    "KICKOFF_VERIFY_MODE_IDS",
    "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
    "KICKOFF_VERIFY_SHARE_IMAGE_URL",
    "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
  ]) {
    if (!artifact.acceptance.outputEnvKeys.includes(key)) {
      problems.push(`public/share-channel-evidence.json missing ${key} output key`);
    }
  }
  if (!artifact.doctor) problems.push("public/share-channel-evidence.json Supabase doctor read-back missing");
  if (artifact.doctor && artifact.doctor.failedShareChannelCheckIds.length > 0) {
    problems.push(
      `public/share-channel-evidence.json failed share-channel checks: ${artifact.doctor.failedShareChannelCheckIds.join(", ")}`,
    );
  }
  if (verifyValues.KICKOFF_VERIFY_PROOF_ID && artifact.targets.proofId !== verifyValues.KICKOFF_VERIFY_PROOF_ID) {
    problems.push("KICKOFF_VERIFY_PROOF_ID does not match public/share-channel-evidence.json proofId");
  }
  if (modeIds.length > 0 && artifact.targets.modeIds.join(",") !== modeIds.join(",")) {
    problems.push("KICKOFF_VERIFY_MODE_IDS do not match public/share-channel-evidence.json modeIds");
  }
  const artifactShareArtifactIds =
    artifact.targets.shareArtifactIds?.length
      ? artifact.targets.shareArtifactIds
      : [
          artifact.targets.proofId ? `record:${artifact.targets.proofId}` : "",
          ...artifact.targets.modeIds.map((id) => `mode:${id}`),
        ].filter(Boolean);
  if (shareArtifactIds.length > 0 && artifactShareArtifactIds.join(",") !== shareArtifactIds.join(",")) {
    problems.push("KICKOFF_VERIFY_SHARE_ARTIFACT_IDS do not match public/share-channel-evidence.json shareArtifactIds");
  }
  if (publicAppUrl && artifact.targets.publicAppUrl !== publicAppUrl) {
    problems.push("VITE_PUBLIC_APP_URL does not match public/share-channel-evidence.json publicAppUrl");
  }
  if (proofUrl && artifact.targets.proofUrl !== proofUrl) {
    problems.push("public/share-channel-evidence.json proofUrl does not match deployed proof target");
  }
  const proofXIntentUrl = artifact.targets.proofXIntentUrl ?? "";
  if (proofUrl && !proofXIntentUrl) {
    problems.push("public/share-channel-evidence.json proofXIntentUrl missing; rerun bun run sharing:bootstrap");
  } else if (proofUrl) {
    const intentProblem = xIntentProblemForProof({ proof_url: proofUrl, x_intent_url: proofXIntentUrl });
    if (intentProblem) problems.push(`public/share-channel-evidence.json proofXIntentUrl invalid: ${intentProblem}`);
  }
  const artifactModeProofUrls = artifact.targets.modeProofUrls ?? [];
  if (modeProofUrls.length > 0 && artifactModeProofUrls.length === 0) {
    problems.push("public/share-channel-evidence.json modeProofUrls missing; rerun bun run sharing:bootstrap");
  } else if (modeProofUrls.length > 0 && artifactModeProofUrls.join(",") !== modeProofUrls.join(",")) {
    problems.push("public/share-channel-evidence.json modeProofUrls do not match deployed mode targets");
  }
  const artifactModeXIntentUrls = artifact.targets.modeXIntentUrls ?? [];
  if (modeProofUrls.length > 0 && artifactModeXIntentUrls.length === 0) {
    problems.push("public/share-channel-evidence.json modeXIntentUrls missing; rerun bun run sharing:bootstrap");
  } else if (modeProofUrls.length > 0 && artifactModeXIntentUrls.length !== modeProofUrls.length) {
    problems.push("public/share-channel-evidence.json modeXIntentUrls count does not match deployed mode targets");
  } else {
    modeProofUrls.forEach((url, index) => {
      const intentProblem = xIntentProblemForProof({ proof_url: url, x_intent_url: artifactModeXIntentUrls[index] ?? "" });
      if (intentProblem) {
        problems.push(`public/share-channel-evidence.json modeXIntentUrl invalid ${artifact.targets.modeIds[index]}: ${intentProblem}`);
      }
    });
  }
  if (verifyValues.KICKOFF_VERIFY_SHARE_IMAGE_URL && artifact.targets.shareImageUrl !== verifyValues.KICKOFF_VERIFY_SHARE_IMAGE_URL) {
    problems.push("KICKOFF_VERIFY_SHARE_IMAGE_URL does not match public/share-channel-evidence.json shareImageUrl");
  }
  if (
    verifyValues.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL &&
    artifact.targets.modeShareImageUrl !== verifyValues.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL
  ) {
    problems.push("KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL does not match public/share-channel-evidence.json modeShareImageUrl");
  }

  const readBackCommands = artifact.readBackCommands ?? [];
  const readBackById = new Map(readBackCommands.map((command) => [command.id, command]));
  const modeProofUrlById = new Map(artifact.targets.modeIds.map((id, index) => [id, artifactModeProofUrls[index] ?? ""]));
  const shareReadBackTargetFor = (id: string) => {
    if (id === "record-share-artifact-row") {
      return {
        id: artifact.targets.proofId,
        kind: "record",
        proofUrl: artifact.targets.proofUrl,
        imageUrl: artifact.targets.shareImageUrl,
      };
    }
    const modeId = id.replace(/^mode-share-artifact-row:/, "");
    return {
      id: modeId,
      kind: "mode",
      proofUrl: modeProofUrlById.get(modeId) ?? "",
      imageUrl: artifact.targets.modeShareImageUrl,
    };
  };
  const shareReadBackParams = (urlText: string | undefined) => {
    if (!urlText) return undefined;
    try {
      return new URL(urlText).searchParams;
    } catch {
      return undefined;
    }
  };
  const shareReadBackResponseExpectationProblems = (
    command: ShareChannelEvidenceArtifact["readBackCommands"][number],
    expected: {
      id: string;
      kind: string;
      targetId?: string;
      targetKind?: "record" | "mode";
      proofUrl?: string;
      imageUrl?: string;
    },
  ) => {
    const expectation = command.responseExpectation;
    if (!expectation) return [`public/share-channel-evidence.json response expectation missing ${expected.id}`];
    const expectedType =
      expected.kind === "proof-page"
        ? "public-html"
        : expected.kind === "share-image"
          ? "public-image"
          : expected.kind === "share-channel-open"
            ? "x-intent"
            : "supabase-array";
    const requiredFields =
      expected.kind === "proof-page"
        ? ["canonical-url", "og:title", "og:image", "twitter:card", "json-ld", "public-source-cloud"]
        : expected.kind === "share-image"
          ? ["content-type:image", "content-length", "sha256"]
          : expected.kind === "share-channel-open"
            ? ["url", "text", "hashtags"]
            : [
                "id",
                "kind",
                "proof_url",
                "image_url",
                "image_hash",
                "generated_at",
                "x_intent_url",
                "x_intent_opened_at",
                "native_share_opened_at",
              ];
    const missingFields = requiredFields.filter((field) => !expectation.requiredFields.includes(field));
    const missingHashtags = expected.kind === "share-channel-open"
      ? ["KickoffLock", "Filecoin", "WorldCup"].filter((tag) => !(expectation.expectedHashtags ?? []).includes(tag))
      : [];
    return [
      expectation.responseType === expectedType ? "" : `public/share-channel-evidence.json response expectation type mismatch ${expected.id}`,
      expected.targetId && expectation.targetId !== expected.targetId
        ? `public/share-channel-evidence.json response expectation target mismatch ${expected.id}`
        : "",
      expected.targetKind && expectation.targetKind !== expected.targetKind
        ? `public/share-channel-evidence.json response expectation kind mismatch ${expected.id}`
        : "",
      expected.kind === "share-artifact-row" && (expectation.minRows ?? 0) < 1
        ? `public/share-channel-evidence.json response expectation min rows mismatch ${expected.id}`
        : "",
      missingFields.length > 0
        ? `public/share-channel-evidence.json response expectation fields incomplete ${expected.id}`
        : "",
      expected.proofUrl && expectation.expectedProofUrl !== expected.proofUrl
        ? `public/share-channel-evidence.json response expectation proof URL mismatch ${expected.id}`
        : "",
      expected.imageUrl && expectation.expectedImageUrl !== expected.imageUrl
        ? `public/share-channel-evidence.json response expectation image URL mismatch ${expected.id}`
        : "",
      expected.kind === "share-channel-open" && expectation.expectedHost !== "twitter.com"
        ? `public/share-channel-evidence.json response expectation host mismatch ${expected.id}`
        : "",
      missingHashtags.length > 0
        ? `public/share-channel-evidence.json response expectation hashtags incomplete ${expected.id}`
        : "",
    ].filter(Boolean);
  };
  const requiredReadBacks = [
    {
      id: "public-proof-page",
      url: artifact.targets.proofUrl,
      kind: "proof-page",
      targetId: artifact.targets.proofId,
      targetKind: "record" as const,
      proofUrl: artifact.targets.proofUrl,
    },
    {
      id: "record-share-channel-open",
      url: proofXIntentUrl,
      proofUrl: artifact.targets.proofUrl,
      kind: "share-channel-open",
      targetId: artifact.targets.proofId,
      targetKind: "record" as const,
    },
    ...artifactModeProofUrls.map((url, index) => ({
      id: `public-mode-page:${artifact.targets.modeIds[index]}`,
      url,
      kind: "proof-page",
      targetId: artifact.targets.modeIds[index],
      targetKind: "mode" as const,
      proofUrl: url,
    })),
    ...artifactModeXIntentUrls.map((url, index) => ({
      id: `mode-share-channel-open:${artifact.targets.modeIds[index]}`,
      url,
      proofUrl: artifactModeProofUrls[index] ?? "",
      kind: "share-channel-open",
      targetId: artifact.targets.modeIds[index],
      targetKind: "mode" as const,
    })),
    {
      id: "record-share-image",
      url: artifact.targets.shareImageUrl,
      kind: "share-image",
      targetId: artifact.targets.proofId,
      targetKind: "record" as const,
      imageUrl: artifact.targets.shareImageUrl,
    },
    {
      id: "mode-share-image",
      url: artifact.targets.modeShareImageUrl,
      kind: "share-image",
      targetId: artifact.targets.modeIds[0],
      targetKind: "mode" as const,
      imageUrl: artifact.targets.modeShareImageUrl,
    },
    ...(runtimeValue(runtimeEnv, "VITE_SUPABASE_URL")
      ? [
          {
            id: "record-share-artifact-row",
            url: "",
            kind: "share-artifact-row",
            targetId: artifact.targets.proofId,
            targetKind: "record" as const,
            proofUrl: artifact.targets.proofUrl,
            imageUrl: artifact.targets.shareImageUrl,
          },
          ...artifact.targets.modeIds.map((id) => ({
            id: `mode-share-artifact-row:${id}`,
            url: "",
            kind: "share-artifact-row",
            targetId: id,
            targetKind: "mode" as const,
            proofUrl: modeProofUrlById.get(id) ?? "",
            imageUrl: artifact.targets.modeShareImageUrl,
          })),
        ]
      : []),
  ];
  for (const expected of requiredReadBacks) {
    if (!expected.id) continue;
    const command = readBackById.get(expected.id);
    if (!command) {
      if (artifact.ready) {
        problems.push(`public/share-channel-evidence.json read-back command missing ${expected.id}`);
      }
      continue;
    }
    if (!command.ready && !artifact.ready) {
      continue;
    }
    if (command.kind !== expected.kind) {
      problems.push(`public/share-channel-evidence.json read-back command kind mismatch ${expected.id}`);
    }
    if (expected.url && command.url !== expected.url) {
      problems.push(`public/share-channel-evidence.json read-back URL mismatch ${expected.id}`);
    }
    if (command.kind === "share-channel-open") {
      const intentProblem = xIntentProblemForProof({
        proof_url: "proofUrl" in expected ? expected.proofUrl : "",
        x_intent_url: command.url,
      });
      if (intentProblem) {
        problems.push(`public/share-channel-evidence.json share-channel open URL invalid ${expected.id}: ${intentProblem}`);
      }
      if (!command.command.includes("open ")) {
        problems.push(`public/share-channel-evidence.json share-channel open command must use open ${expected.id}`);
      }
      if (command.url && !command.command.includes(command.url)) {
        problems.push(`public/share-channel-evidence.json share-channel open command URL mismatch ${expected.id}`);
      }
    } else if (!command.command.includes("curl -sS")) {
      problems.push(`public/share-channel-evidence.json read-back command must use curl ${expected.id}`);
    }
    if (command.kind === "share-artifact-row" && !command.command.includes("$VITE_SUPABASE_ANON_KEY")) {
      problems.push(`public/share-channel-evidence.json share row read-back must use VITE_SUPABASE_ANON_KEY ${expected.id}`);
    }
    if (command.kind === "share-artifact-row") {
      const target = shareReadBackTargetFor(expected.id);
      const params = shareReadBackParams(command.url);
      if (!params) {
        problems.push(`public/share-channel-evidence.json share row read-back URL malformed ${expected.id}`);
      } else {
        if (params.get("id") !== `eq.${target.id}`) {
          problems.push(`public/share-channel-evidence.json share row read-back id filter mismatch ${expected.id}`);
        }
        if (params.get("kind") !== `eq.${target.kind}`) {
          problems.push(`public/share-channel-evidence.json share row read-back kind filter mismatch ${expected.id}`);
        }
        if (target.proofUrl && params.get("proof_url") !== `eq.${target.proofUrl}`) {
          problems.push(`public/share-channel-evidence.json share row read-back proof_url filter missing ${expected.id}`);
        }
        if (target.imageUrl && params.get("image_url") !== `eq.${target.imageUrl}`) {
          problems.push(`public/share-channel-evidence.json share row read-back image_url filter missing ${expected.id}`);
        }
      }
    }
    problems.push(...shareReadBackResponseExpectationProblems(command, expected));
    if (artifact.ready && !command.ready) {
      problems.push(`public/share-channel-evidence.json read-back command not ready ${expected.id}`);
    }
  }
  return unique(problems);
};

const validateTargetEnvContract = (verifyValues: Record<string, string>) => {
  const contract = evaluateProductionTargetEnvContract(verifyValues as Partial<Record<ProductionVerifyEnvKey, string>>);
  return contract.passed ? [] : contract.problems;
};

const validatePublicRestoreArtifact = (
  verifyValues: Record<string, string>,
  runtimeEnv: Record<string, string | undefined>,
  artifact?: PublicRestoreEvidenceArtifact,
) => {
  if (!artifact) return ["public/public-restore-evidence.json missing; run bun run doctor:sharing"];
  const problems: string[] = [];
  const modeIds = listVerifyValue(verifyValues, "KICKOFF_VERIFY_MODE_IDS");
  const publicAppUrl = runtimeValue(runtimeEnv, "VITE_PUBLIC_APP_URL");
  if (artifact.artifactVersion !== 1) problems.push("public/public-restore-evidence.json artifactVersion must be 1");
  if (!Date.parse(artifact.generatedAt)) problems.push("public/public-restore-evidence.json generatedAt is invalid");
  if (!artifact.ready) problems.push("public/public-restore-evidence.json not ready");
  if (!artifact.acceptance.publicAppUrlReady) problems.push("public/public-restore-evidence.json public app URL missing");
  if (!artifact.acceptance.cleanSessionRestore) problems.push("public/public-restore-evidence.json clean-session restore incomplete");
  if (
    verifyValues.KICKOFF_VERIFY_PROFILE_ID &&
    !artifact.acceptance.cleanSessionProfileIds?.includes(verifyValues.KICKOFF_VERIFY_PROFILE_ID)
  ) {
    problems.push("public/public-restore-evidence.json clean-session profile target mismatch");
  }
  if (
    verifyValues.KICKOFF_VERIFY_PROOF_ID &&
    !artifact.acceptance.cleanSessionProofIds?.includes(verifyValues.KICKOFF_VERIFY_PROOF_ID)
  ) {
    problems.push("public/public-restore-evidence.json clean-session proof target mismatch");
  }
  const cleanModeIds = artifact.acceptance.cleanSessionModeIds ?? [];
  if (modeIds.length > 0 && modeIds.some((id) => !cleanModeIds.includes(id))) {
    problems.push("public/public-restore-evidence.json clean-session mode target mismatch");
  }
  const checkById = (id: string) => artifact.checks?.find((check) => check.id === id);
  const passedCheck = (id: string) => checkById(id)?.status === "passed";
  const checkSampleIds = (id: string) => checkById(id)?.sampleIds ?? [];
  if (!passedCheck("clean-session-restore")) {
    problems.push("public/public-restore-evidence.json clean-session restore check missing or failed");
  }
  if (
    verifyValues.KICKOFF_VERIFY_PROFILE_ID &&
    !checkSampleIds("clean-session-restore").includes(verifyValues.KICKOFF_VERIFY_PROFILE_ID)
  ) {
    problems.push("public/public-restore-evidence.json clean-session restore check missing profile sample");
  }
  if (
    verifyValues.KICKOFF_VERIFY_PROOF_ID &&
    !checkSampleIds("clean-session-restore").includes(verifyValues.KICKOFF_VERIFY_PROOF_ID)
  ) {
    problems.push("public/public-restore-evidence.json clean-session restore check missing proof sample");
  }
  const missingModeSamples = modeIds.filter((id) => !checkSampleIds("clean-session-restore").includes(id));
  if (missingModeSamples.length > 0) {
    problems.push("public/public-restore-evidence.json clean-session restore check missing mode samples");
  }
  const renderChecks: Array<[string, string[]]> = [
    ["profile-render", verifyValues.KICKOFF_VERIFY_PROFILE_ID ? [verifyValues.KICKOFF_VERIFY_PROFILE_ID] : []],
    ["proof-render", verifyValues.KICKOFF_VERIFY_PROOF_ID ? [verifyValues.KICKOFF_VERIFY_PROOF_ID] : []],
    ["mode-render", modeIds],
  ];
  for (const [checkId, expectedIds] of renderChecks) {
    if (!passedCheck(checkId)) {
      problems.push(`public/public-restore-evidence.json ${checkId} check missing or failed`);
    }
    const sampleIds = checkSampleIds(checkId);
    if (expectedIds.length > 0 && expectedIds.some((id) => !sampleIds.includes(id))) {
      problems.push(`public/public-restore-evidence.json ${checkId} samples do not match target ids`);
    }
  }
  if (!artifact.acceptance.profileRender) problems.push("public/public-restore-evidence.json profile render incomplete");
  if (!artifact.acceptance.proofRender) problems.push("public/public-restore-evidence.json proof render incomplete");
  if (artifact.acceptance.modeRenderCount < artifact.acceptance.requiredModeRenderCount) {
    problems.push(
      `public/public-restore-evidence.json mode renders incomplete (${artifact.acceptance.modeRenderCount}/${artifact.acceptance.requiredModeRenderCount})`,
    );
  }
  if (!artifact.acceptance.shareImageReadBack) problems.push("public/public-restore-evidence.json record share image read-back incomplete");
  if (!artifact.acceptance.modeShareImageReadBack) problems.push("public/public-restore-evidence.json mode share image read-back incomplete");
  for (const key of [
    "VITE_PUBLIC_APP_URL",
    "KICKOFF_VERIFY_PROFILE_ID",
    "KICKOFF_VERIFY_PROOF_ID",
    "KICKOFF_VERIFY_MODE_IDS",
    "KICKOFF_VERIFY_SHARE_IMAGE_URL",
    "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
  ]) {
    if (!artifact.acceptance.outputEnvKeys.includes(key)) {
      problems.push(`public/public-restore-evidence.json missing ${key} output key`);
    }
  }
  if (publicAppUrl && artifact.targets.publicAppUrl !== publicAppUrl) {
    problems.push("VITE_PUBLIC_APP_URL does not match public/public-restore-evidence.json publicAppUrl");
  }
  if (verifyValues.KICKOFF_VERIFY_PROFILE_ID && artifact.targets.profileId !== verifyValues.KICKOFF_VERIFY_PROFILE_ID) {
    problems.push("KICKOFF_VERIFY_PROFILE_ID does not match public/public-restore-evidence.json profileId");
  }
  if (verifyValues.KICKOFF_VERIFY_PROOF_ID && artifact.targets.proofId !== verifyValues.KICKOFF_VERIFY_PROOF_ID) {
    problems.push("KICKOFF_VERIFY_PROOF_ID does not match public/public-restore-evidence.json proofId");
  }
  if (modeIds.length > 0 && artifact.targets.modeIds.join(",") !== modeIds.join(",")) {
    problems.push("KICKOFF_VERIFY_MODE_IDS do not match public/public-restore-evidence.json modeIds");
  }
  const pageTargets = artifact.pageTargets ?? [];
  if (pageTargets.length === 0) {
    problems.push("public/public-restore-evidence.json pageTargets missing");
  }
  const expectedPageTargets = [
    ...(verifyValues.KICKOFF_VERIFY_PROFILE_ID
      ? [{ kind: "profile" as const, targetId: verifyValues.KICKOFF_VERIFY_PROFILE_ID }]
      : []),
    ...(verifyValues.KICKOFF_VERIFY_PROOF_ID
      ? [{ kind: "proof" as const, targetId: verifyValues.KICKOFF_VERIFY_PROOF_ID }]
      : []),
    ...modeIds.map((targetId) => ({ kind: "mode" as const, targetId })),
  ];
  for (const expected of expectedPageTargets) {
    const target = pageTargets.find((item) => item.kind === expected.kind && item.targetId === expected.targetId);
    if (!target) {
      problems.push(`public/public-restore-evidence.json page target missing ${expected.kind}:${expected.targetId}`);
      continue;
    }
    if (!target.ready) problems.push(`public/public-restore-evidence.json page target not ready ${expected.kind}:${expected.targetId}`);
    if (target.expectedSource !== "cloud") {
      problems.push(`public/public-restore-evidence.json page target source is not cloud ${expected.kind}:${expected.targetId}`);
    }
    const expectedUrl = publicAppUrl ? publicShareUrl(publicAppUrl, expected.kind, expected.targetId) : "";
    if (expectedUrl && target.url !== expectedUrl) {
      problems.push(`public/public-restore-evidence.json page target URL mismatch ${expected.kind}:${expected.targetId}`);
    }
  }
  const readBackCommands = artifact.readBackCommands ?? [];
  const readBackById = new Map(readBackCommands.map((command) => [command.id, command]));
  const restoreExpectationProblems = (
    command: PublicRestoreEvidenceArtifact["readBackCommands"][number],
    expected: { kind: PublicRenderKind; targetId: string; table?: string; requiredFields?: string[] },
  ) => {
    const expectation = command.responseExpectation;
    if (!expectation) return [`public/public-restore-evidence.json response expectation missing ${command.id}`];
    const responseType = command.kind === "public-page" ? "public-html" : "supabase-array";
    const requiredFields =
      expected.requiredFields ??
      (command.kind === "public-page"
        ? [
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
          ]
        : []);
    const missingFields = requiredFields.filter((field) => !expectation.requiredFields.includes(field));
    return [
      expectation.responseType === responseType
        ? ""
        : `public/public-restore-evidence.json response expectation type mismatch ${command.id}`,
      expectation.targetKind === expected.kind
        ? ""
        : `public/public-restore-evidence.json response expectation kind mismatch ${command.id}`,
      expectation.targetId === expected.targetId
        ? ""
        : `public/public-restore-evidence.json response expectation target mismatch ${command.id}`,
      expectation.expectedSource === "cloud"
        ? ""
        : `public/public-restore-evidence.json response expectation source mismatch ${command.id}`,
      command.kind === "public-page" && expectation.requiresCleanSession !== true
        ? `public/public-restore-evidence.json response expectation missing clean-session flag ${command.id}`
        : "",
      command.kind === "public-page" && expectation.pageKind !== expected.kind
        ? `public/public-restore-evidence.json response expectation page kind mismatch ${command.id}`
        : "",
      command.kind === "public-page" && expectation.queryParam !== expected.kind
        ? `public/public-restore-evidence.json response expectation query param mismatch ${command.id}`
        : "",
      command.kind === "public-page" && (expectation.targetIds ?? []).join(",") !== expected.targetId
        ? `public/public-restore-evidence.json response expectation target ids mismatch ${command.id}`
        : "",
      command.kind === "supabase-row" && (expectation.minRows ?? 0) < 1
        ? `public/public-restore-evidence.json response expectation min rows mismatch ${command.id}`
        : "",
      expected.table && expectation.table !== expected.table
        ? `public/public-restore-evidence.json response expectation table mismatch ${command.id}`
        : "",
      missingFields.length > 0
        ? `public/public-restore-evidence.json response expectation fields incomplete ${command.id}`
        : "",
    ].filter(Boolean);
  };
  for (const expected of expectedPageTargets) {
    const target = pageTargets.find((item) => item.kind === expected.kind && item.targetId === expected.targetId);
    const expectedPageUrl = publicAppUrl ? publicShareUrl(publicAppUrl, expected.kind, expected.targetId) : target?.url ?? "";
    const pageCommandId = `public-page:${expected.kind}:${expected.targetId}`;
    const pageCommand = readBackById.get(pageCommandId);
    if (!pageCommand) {
      if (artifact.ready) {
        problems.push(`public/public-restore-evidence.json read-back command missing ${pageCommandId}`);
      }
    } else {
      if (pageCommand.ready || artifact.ready) {
        if (pageCommand.kind !== "public-page") {
          problems.push(`public/public-restore-evidence.json read-back command kind mismatch ${pageCommandId}`);
        }
        if (pageCommand.targetKind !== expected.kind || pageCommand.targetId !== expected.targetId) {
          problems.push(`public/public-restore-evidence.json read-back command target mismatch ${pageCommandId}`);
        }
        if (pageCommand.expectedSource !== "cloud") {
          problems.push(`public/public-restore-evidence.json read-back expected source mismatch ${pageCommandId}`);
        }
        if (pageCommand.authMode !== "public-page") {
          problems.push(`public/public-restore-evidence.json read-back auth mode mismatch ${pageCommandId}`);
        }
        if (expectedPageUrl && pageCommand.url !== expectedPageUrl) {
          problems.push(`public/public-restore-evidence.json read-back URL mismatch ${pageCommandId}`);
        }
        if (pageCommand.url && !pageCommand.command.includes(pageCommand.url)) {
          problems.push(`public/public-restore-evidence.json structured URL not used by command ${pageCommandId}`);
        }
        if (!pageCommand.command.includes("curl -sS")) {
          problems.push(`public/public-restore-evidence.json read-back command must use curl ${pageCommandId}`);
        }
        if (artifact.ready && !pageCommand.ready) {
          problems.push(`public/public-restore-evidence.json read-back command not ready ${pageCommandId}`);
        }
        problems.push(...restoreExpectationProblems(pageCommand, expected));
      }
    }

    const rowCommandId = `supabase-row:${expected.kind}:${expected.targetId}`;
    const rowCommand = readBackById.get(rowCommandId);
    const expectedTable =
      expected.kind === "profile"
        ? "kickoff_profiles"
        : expected.kind === "mode"
          ? "kickoff_mode_runs"
          : "kickoff_records";
    if (!rowCommand) {
      if (artifact.ready) {
        problems.push(`public/public-restore-evidence.json read-back command missing ${rowCommandId}`);
      }
    } else {
      if (rowCommand.ready || artifact.ready) {
        if (rowCommand.kind !== "supabase-row") {
          problems.push(`public/public-restore-evidence.json read-back command kind mismatch ${rowCommandId}`);
        }
        if (rowCommand.targetKind !== expected.kind || rowCommand.targetId !== expected.targetId) {
          problems.push(`public/public-restore-evidence.json read-back command target mismatch ${rowCommandId}`);
        }
        if (rowCommand.expectedSource !== "cloud") {
          problems.push(`public/public-restore-evidence.json read-back expected source mismatch ${rowCommandId}`);
        }
        if (rowCommand.authMode !== "anon") {
          problems.push(`public/public-restore-evidence.json Supabase row auth mode mismatch ${rowCommandId}`);
        }
        if (rowCommand.table !== expectedTable || !rowCommand.url.includes(`/rest/v1/${expectedTable}`)) {
          problems.push(`public/public-restore-evidence.json Supabase row table mismatch ${rowCommandId}`);
        }
        const expectedQueryPath = `${expectedTable}?${new URLSearchParams({
          select:
            expected.kind === "profile"
              ? "id,email,display_name,location,friend_code,season_key,updated_at"
              : expected.kind === "mode"
                ? "id,user_id,mode_id,status,score,mode_run,updated_at"
                : "id,user_id,capsule,result,seal_job,updated_at",
          id: `eq.${expected.targetId}`,
          limit: "1",
        }).toString()}`;
        if (rowCommand.queryPath !== expectedQueryPath) {
          problems.push(`public/public-restore-evidence.json Supabase row query path mismatch ${rowCommandId}`);
        }
        if (rowCommand.url && !rowCommand.url.endsWith(`/rest/v1/${expectedQueryPath}`)) {
          problems.push(`public/public-restore-evidence.json Supabase row URL query mismatch ${rowCommandId}`);
        }
        if (rowCommand.url && !rowCommand.command.includes(rowCommand.url)) {
          problems.push(`public/public-restore-evidence.json structured URL not used by command ${rowCommandId}`);
        }
        if (!rowCommand.url.includes(`id=eq.${encodeURIComponent(expected.targetId)}`)) {
          problems.push(`public/public-restore-evidence.json Supabase row target mismatch ${rowCommandId}`);
        }
        if (!rowCommand.command.includes("curl -sS")) {
          problems.push(`public/public-restore-evidence.json read-back command must use curl ${rowCommandId}`);
        }
        if (!rowCommand.command.includes("$VITE_SUPABASE_ANON_KEY")) {
          problems.push(`public/public-restore-evidence.json Supabase row read-back must use VITE_SUPABASE_ANON_KEY ${rowCommandId}`);
        }
        if (artifact.ready && !rowCommand.ready) {
          problems.push(`public/public-restore-evidence.json read-back command not ready ${rowCommandId}`);
        }
        problems.push(
          ...restoreExpectationProblems(rowCommand, {
            ...expected,
            table: expectedTable,
            requiredFields:
              expected.kind === "profile"
                ? ["id", "email", "display_name", "location", "friend_code", "season_key", "updated_at"]
                : expected.kind === "mode"
                  ? ["id", "user_id", "mode_id", "status", "score", "mode_run", "updated_at"]
                  : ["id", "user_id", "capsule", "result", "seal_job", "updated_at"],
          }),
        );
      }
    }
  }
  if (verifyValues.KICKOFF_VERIFY_SHARE_IMAGE_URL && artifact.targets.shareImageUrl !== verifyValues.KICKOFF_VERIFY_SHARE_IMAGE_URL) {
    problems.push("KICKOFF_VERIFY_SHARE_IMAGE_URL does not match public/public-restore-evidence.json shareImageUrl");
  }
  if (
    verifyValues.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL &&
    artifact.targets.modeShareImageUrl !== verifyValues.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL
  ) {
    problems.push("KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL does not match public/public-restore-evidence.json modeShareImageUrl");
  }
  return unique(problems);
};

const stage = (
  input: {
    id: string;
    label: string;
    command: string;
    requiredEnv?: string[];
    optionalAnyEnv?: string[];
    optionalAnyEnvGroups?: string[][];
    outputEnv: ProductionVerifyEnvKey[];
    completionMode?: "external-readback" | "output-only";
    validateWhenIncomplete?: boolean;
    validateEnv?: (
      verifyValues: Record<string, string>,
      runtimeEnv: Record<string, string | undefined>,
    ) => string[];
    validateOutput?: (
      verifyValues: Record<string, string>,
      runtimeEnv: Record<string, string | undefined>,
    ) => string[];
    detail: string;
  },
  runtimeEnv: Record<string, string | undefined>,
  verifyValues: Record<string, string>,
): ProductionAcceptanceCollectorStage => {
  const missingRequired = (input.requiredEnv ?? []).filter((key) => !hasRuntimeOrVerify(runtimeEnv, verifyValues, key));
  const missingAny =
    input.optionalAnyEnv &&
    input.optionalAnyEnv.length > 0 &&
    !hasAnyRuntimeOrVerify(runtimeEnv, verifyValues, input.optionalAnyEnv)
      ? [input.optionalAnyEnv.join(" or ")]
      : [];
  const missingAnyGroups = (input.optionalAnyEnvGroups ?? [])
    .filter((group) => group.length > 0 && !hasAnyRuntimeOrVerify(runtimeEnv, verifyValues, group))
    .map((group) => group.join(" or "));
  const invalidRuntime = invalidRuntimePrerequisites(runtimeEnv, [
    ...(input.requiredEnv ?? []),
    ...(input.optionalAnyEnv ?? []),
    ...(input.optionalAnyEnvGroups ?? []).flat(),
  ]);
  const envProblems = input.validateEnv?.(verifyValues, runtimeEnv) ?? [];
  const missingPrerequisites = [...missingRequired, ...missingAny, ...missingAnyGroups, ...invalidRuntime, ...envProblems];
  const producedEnv = input.outputEnv.filter((key) => Boolean(verifyValues[key]?.trim()));
  const complete = input.outputEnv.length > 0 && producedEnv.length === input.outputEnv.length;
  const outputProblems = complete || input.validateWhenIncomplete ? input.validateOutput?.(verifyValues, runtimeEnv) ?? [] : [];
  const outputValid = outputProblems.length === 0;
  const outputOnlyComplete = input.completionMode === "output-only" && complete && outputValid;
  const externalComplete = input.completionMode !== "output-only" && complete && outputValid && missingPrerequisites.length === 0;
  const missingEnv = outputOnlyComplete || externalComplete ? [] : unique([...missingPrerequisites, ...outputProblems]);
  const status: ProductionAcceptanceCollectorStatus =
    outputOnlyComplete || externalComplete ? "done" : missingEnv.length === 0 ? "ready" : "blocked";
  return {
    id: input.id,
    label: input.label,
    status,
    command: input.command,
    requiredEnv: [
      ...(input.requiredEnv ?? []),
      ...(input.optionalAnyEnv ?? []),
      ...(input.optionalAnyEnvGroups ?? []).flat(),
    ],
    outputEnv: input.outputEnv,
    missingEnv,
    producedEnv,
    detail: outputOnlyComplete || externalComplete
      ? `${producedEnv.length}/${input.outputEnv.length} target env keys collected.`
      : complete && outputProblems.length > 0
        ? `${producedEnv.length}/${input.outputEnv.length} target env keys collected; waiting for ${shortList(missingEnv)}.`
      : complete
        ? `${producedEnv.length}/${input.outputEnv.length} target env keys collected; waiting for ${shortList(missingEnv)} before external read-back can be marked done.`
      : input.detail,
  };
};

export const buildProductionAcceptanceCollector = ({
  runtimeEnv,
  verifyEnvText,
  ledger,
  dataBootstrapPlan,
  dataProviderArtifact,
  supabaseTargetSeedArtifact,
  accountCloudSyncEvidence,
  supabaseBootstrapPlan,
  dataScoutArtifact,
  filecoinBootstrapPlan,
  filecoinSealArtifact,
  leaderboardArtifact,
  publicRestoreArtifact,
  supabaseSchemaArtifact,
  shareChannelArtifact,
  cloudflarePagesDeployPlan,
  accessPreflightArtifact,
  shareImageUploadArtifacts,
}: ProductionAcceptanceCollectorInput): ProductionAcceptanceCollectorPacket => {
  const verifyValues = parseEnvText(verifyEnvText);
  const envLedger = ledger ?? buildProductionEnvLedger(verifyEnvText);
  const plannedCloudflareRuntimeEnv = cloudflareRuntimeEnv(runtimeEnv, cloudflarePagesDeployPlan);
  const stages = [
    stage(
      {
        id: "access-preflight",
        label: "Verify production account access",
        command: "bun run access:preflight",
        outputEnv: [],
        validateEnv: () => validateProductionAccessPreflight(accessPreflightArtifact),
        detail:
          "Confirm Cloudflare deploy access, Supabase management access, manual production env values and generated verification targets before running production setup.",
      },
      runtimeEnv,
      verifyValues,
    ),
    stage(
      {
        id: "share-images",
        label: "Generate and upload public share images",
        command: "bun run share:upload-image && bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png",
        requiredEnv: ["VITE_PUBLIC_APP_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
        outputEnv: ["KICKOFF_VERIFY_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
        validateOutput: (values, env) =>
          unique([
            ...validateSupabaseShareImageOutputs(values, env),
            ...validateShareImageUploadArtifact(values, "record", shareImageUploadArtifacts?.record, supabaseTargetSeedArtifact),
            ...validateShareImageUploadArtifact(values, "mode", shareImageUploadArtifacts?.mode, supabaseTargetSeedArtifact),
          ]),
        detail:
          "Generate record/mode proof PNGs, publish them as public HTTPS images and copy the returned public URLs.",
      },
      runtimeEnv,
      verifyValues,
    ),
    stage(
      {
        id: "seed-cloud",
        label: "Seed Supabase proof targets",
        command: "bun run supabase:bootstrap",
        requiredEnv: [
          "VITE_PUBLIC_APP_URL",
          "VITE_SUPABASE_URL",
          "VITE_SUPABASE_ANON_KEY",
          "VITE_SUPABASE_REDIRECT_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
        ],
        optionalAnyEnvGroups: [
          ["KICKOFF_SEED_SHARE_IMAGE_URL", "KICKOFF_VERIFY_SHARE_IMAGE_URL"],
          ["KICKOFF_SEED_MODE_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
        ],
        outputEnv: [
          "KICKOFF_VERIFY_USER_ID",
          "KICKOFF_VERIFY_PROFILE_ID",
          "KICKOFF_VERIFY_PROOF_ID",
          "KICKOFF_VERIFY_MODE_IDS",
          "KICKOFF_VERIFY_FRIEND_CODE",
          "KICKOFF_VERIFY_SEASON_KEY",
        ],
        validateOutput: (values) =>
          unique([
            ...validateModeTargetOutputs(values),
            ...validateSupabaseBootstrapPlan(supabaseBootstrapPlan, runtimeEnv, values),
            ...validateSupabaseSchemaArtifact(supabaseSchemaArtifact),
            ...validateSupabaseTargetSeedArtifact(values, supabaseTargetSeedArtifact),
            ...validateAccountCloudSyncEvidence(values, accountCloudSyncEvidence, supabaseTargetSeedArtifact),
          ]),
        validateWhenIncomplete: true,
        detail: "Apply schema, upsert profile/proof/mode/share/leaderboard rows, then run Supabase read-back doctor.",
      },
      runtimeEnv,
      verifyValues,
    ),
    stage(
      {
        id: "sharing-doctor",
        label: "Verify public proof pages and share images",
        command: "bun run sharing:bootstrap",
        requiredEnv: [
          "VITE_PUBLIC_APP_URL",
          "KICKOFF_VERIFY_PROFILE_ID",
          "KICKOFF_VERIFY_PROOF_ID",
          "KICKOFF_VERIFY_MODE_IDS",
          "KICKOFF_VERIFY_SHARE_IMAGE_URL",
          "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
        ],
        outputEnv: [],
        validateEnv: (verifyValues, runtimeEnv) => [
          ...validateModeTargetOutputs(verifyValues),
          ...validateSupabaseShareImageOutputs(verifyValues, runtimeEnv),
          ...validateShareChannelArtifact(verifyValues, runtimeEnv, shareChannelArtifact),
          ...validatePublicRestoreArtifact(verifyValues, runtimeEnv, publicRestoreArtifact),
        ],
        detail: "Render deployed profile/proof/mode pages and verify canonical URLs, social metadata, JSON-LD and image read-back.",
      },
      runtimeEnv,
      verifyValues,
    ),
    stage(
      {
        id: "leaderboard-backend",
        label: "Verify leaderboard backend scopes",
        command: "bun run leaderboard:bootstrap",
        requiredEnv: [
          "VITE_SUPABASE_URL",
          "VITE_SUPABASE_ANON_KEY",
          "KICKOFF_VERIFY_USER_ID",
          "KICKOFF_VERIFY_FRIEND_CODE",
          "KICKOFF_VERIFY_SEASON_KEY",
          "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
        ],
        outputEnv: [],
        validateEnv: (verifyValues) => validateLeaderboardArtifact(verifyValues, leaderboardArtifact),
        detail: "Verify the current user appears in kickoff_leaderboard global, friend and season REST queries.",
      },
      runtimeEnv,
      verifyValues,
    ),
    ...(cloudflarePagesDeployPlan
      ? [
          stage(
            {
              id: "cloudflare-pages-backend",
              label: "Deploy Cloudflare same-origin backend routes",
              command: "bun run pages:cf:preflight && bun run pages:cf:deploy",
              requiredEnv: cloudflarePagesDeployPlan.sameOriginData || cloudflarePagesDeployPlan.sameOriginSeal
                ? [
                    ...(cloudflarePagesDeployPlan.sameOriginData ? ["APIFOOTBALL_KEY", "FOOTBALL_DATA_TOKEN", "ODDS_API_KEY"] : []),
                    ...(cloudflarePagesDeployPlan.sameOriginSeal
                      ? ["FILECOIN_SEAL_UPSTREAM_URL", "FILECOIN_SEAL_TOKEN", "ALLOW_ORIGIN"]
                      : []),
                    "CLOUDFLARE_API_TOKEN",
                    "CLOUDFLARE_ACCOUNT_ID",
                  ]
                : ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
              outputEnv: [],
              validateEnv: () => validateCloudflarePagesPlan(cloudflarePagesDeployPlan),
              detail:
                "Deploy the Pages Functions that provide same-origin /data-proxy and /seal routes for production data/Filecoin acceptance.",
            },
            plannedCloudflareRuntimeEnv,
            verifyValues,
          ),
        ]
      : []),
    stage(
      {
        id: "data-scout",
        label: "Scout realtime fixture targets",
        command: "bun run data:providers:check && bun run scout:data-targets",
        optionalAnyEnv: ["APIFOOTBALL_KEY", "API_FOOTBALL_KEY", "VITE_APIFOOTBALL_KEY", "VITE_DATA_PROXY_URL", "VITE_DATA_PROXY_SAME_ORIGIN"],
        outputEnv: ["KICKOFF_VERIFY_FIXTURE_IDS", "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"],
        validateEnv: () =>
          unique([
            ...sameOriginDataRuntimeProblems(plannedCloudflareRuntimeEnv),
            ...(cloudflarePagesDeployPlan?.sameOriginData
              ? cloudflarePlanProblems(cloudflarePagesDeployPlan, ["runtime-secrets", "auth"], CLOUDFLARE_DATA_ENV_KEYS)
              : []),
            ...validateDataBootstrapPlan(dataBootstrapPlan),
          ]),
        validateOutput: (values) =>
          unique([
            ...validateFixtureTargetOutputs(values),
            ...validateDataProviderArtifact(values, plannedCloudflareRuntimeEnv, dataProviderArtifact),
            ...validateDataScoutArtifact(values, dataScoutArtifact),
          ]),
        validateWhenIncomplete: true,
        detail: "Preflight realtime providers, find World Cup fixtures where lineups/injuries/odds all return rows, then run doctor:data.",
      },
      plannedCloudflareRuntimeEnv,
      verifyValues,
    ),
    stage(
      {
        id: "filecoin-seal",
        label: "Seal Filecoin proof targets",
        command: "bun run filecoin:bootstrap",
        optionalAnyEnvGroups: [["VITE_FILECOIN_SEAL_API", "VITE_FILECOIN_SEAL_SAME_ORIGIN"]],
        outputEnv: [
          "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
          "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
          "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
          "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
        ],
        validateEnv: (values, env) =>
          unique([
            ...validateFilecoinRuntime(values, env),
            ...(cloudflarePagesDeployPlan?.sameOriginSeal
              ? cloudflarePlanProblems(cloudflarePagesDeployPlan, ["runtime-secrets", "auth"], CLOUDFLARE_FILECOIN_ENV_KEYS)
              : []),
            ...validateFilecoinBootstrapPlan(filecoinBootstrapPlan, values, env),
          ]),
        validateOutput: (values) =>
          unique([...validateFilecoinOutputs(values), ...validateFilecoinSealArtifact(values, filecoinSealArtifact, plannedCloudflareRuntimeEnv)]),
        detail: "Preflight the seal API, build deterministic target payloads, seal record/mode proofs and run Filecoin read-back doctor.",
      },
      plannedCloudflareRuntimeEnv,
      verifyValues,
    ),
    stage(
      {
        id: "env-merge",
        label: "Merge collected env blocks",
        command: "bun run env:production -- --out=.env.production.local",
        outputEnv: [],
        detail: "Merge verify env from current env files and generated seed, data scout, share upload and Filecoin artifacts.",
      },
      runtimeEnv,
      verifyValues,
    ),
    stage(
      {
        id: "target-env-contract",
        label: "Validate production target env contract",
        command: "bun run env:production -- --out=.env.production.local && bun run verify:production",
        requiredEnv: [
          "KICKOFF_VERIFY_PROFILE_ID",
          "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
          "KICKOFF_VERIFY_PROOF_ID",
          "KICKOFF_VERIFY_MODE_IDS",
          "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
          "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
        ],
        outputEnv: [],
        validateEnv: validateTargetEnvContract,
        detail:
          "Confirm the final env block binds the deployed profile URL, proof/mode share artifacts and global/friend/season leaderboard scopes.",
      },
      runtimeEnv,
      verifyValues,
    ),
    stage(
      {
        id: "final-verify",
        label: "Run final production verification",
        command: "bun run verify:production && bun run doctor:production && bun run goal:audit",
        outputEnv: [],
        detail: "Run strict production evidence, operator doctor and original goal audit once every required target env key is filled.",
      },
      runtimeEnv,
      verifyValues,
    ),
  ];
  const missingRuntimeEnv = unique(stages.flatMap((item) => item.missingEnv));
  const missingVerifyEnv = envLedger.missingRequiredKeys;
  const preflightBlocked = stages.some(
    (item) =>
      item.id !== "env-merge" &&
      item.id !== "target-env-contract" &&
      item.id !== "final-verify" &&
      item.status === "blocked",
  );
  const targetContractBlocked =
    !envLedger.ready ||
    preflightBlocked ||
    stages.find((candidate) => candidate.id === "target-env-contract")?.missingEnv.length !== 0;
  const actionableStages = stages.map((item) => {
    if (item.id === "env-merge") {
      const ready = stages.some((candidate) => candidate.id !== "env-merge" && candidate.producedEnv.length > 0);
      return { ...item, status: ready ? "ready" : "blocked" } satisfies ProductionAcceptanceCollectorStage;
    }
    if (item.id === "target-env-contract") {
      return { ...item, status: targetContractBlocked ? "blocked" : "ready" } satisfies ProductionAcceptanceCollectorStage;
    }
    if (item.id === "final-verify") {
      return { ...item, status: targetContractBlocked ? "blocked" : "ready" } satisfies ProductionAcceptanceCollectorStage;
    }
    return item;
  });
  const stageReadyCount = actionableStages.filter((item) => item.status === "done" || item.status === "ready").length;
  const blockedStages = actionableStages.filter((item) => item.status === "blocked").length;
  const next = actionableStages.find((item) => item.status !== "done");
  const commands = unique(actionableStages.filter((item) => item.status !== "done").map((item) => item.command));
  const nextAction = next
    ? next.status === "ready"
      ? `${next.label}: run ${next.command}.`
      : `${next.label}: set ${shortList(next.missingEnv) || missingVerifyEnv[0] || "required target env"} first.`
    : "Production acceptance collector is complete.";
  const copyText = [
    "Kickoff Lock Agent production acceptance collector",
    `Ready: ${envLedger.ready && blockedStages === 0 ? "yes" : "no"}`,
    `Stages: ${stageReadyCount}/${actionableStages.length} ready or done`,
    `Missing runtime env: ${missingRuntimeEnv.join(", ") || "none"}`,
    `Missing verify env: ${missingVerifyEnv.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Stages:",
    ...actionableStages.map((item) =>
      [
        `- ${item.label} [${item.status}]`,
        `  command: ${item.command}`,
        `  requires: ${item.requiredEnv.join(", ") || "none"}`,
        `  outputs: ${item.outputEnv.join(", ") || "none"}`,
        `  missing: ${item.missingEnv.join(", ") || "none"}`,
        `  detail: ${item.detail}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready: envLedger.ready && blockedStages === 0,
    stageReadyCount,
    totalStages: actionableStages.length,
    blockedStages,
    missingRuntimeEnv,
    missingVerifyEnv,
    stages: actionableStages,
    commands,
    nextAction,
    copyText,
  };
};

export const buildProductionAcceptanceCollectorArtifact = (
  packet: ProductionAcceptanceCollectorPacket,
  metadata: {
    generatedAt?: string;
    envFiles?: string[];
    outputPath?: string;
    wrote?: boolean;
  } = {},
): ProductionAcceptanceCollectorArtifact => ({
  artifactVersion: 1,
  generatedAt: metadata.generatedAt ?? new Date().toISOString(),
  source: "local-script",
  envFiles: metadata.envFiles ?? [],
  outputPath: metadata.outputPath,
  wrote: metadata.wrote ?? true,
  ...packet,
});
