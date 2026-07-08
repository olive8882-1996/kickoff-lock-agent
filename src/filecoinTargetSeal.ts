import { buildProductionVerifyEnv } from "./productionEvidence";
import { resolvedPublicSealApi, sameOriginSealSelected } from "./filecoinSealApiReadiness";
import { filecoinProofMetadataProblems } from "./filecoinProofValidation";
import { buildProductionTargetSeed, type ShareImageSeedMetadata } from "./productionTargetSeed";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { sha256, stableJson } from "./proof";
import type { FilecoinProof, GameModeRun, MemoryRecord, SealBackendHealth, SealPollAttempt, SealUploadStatusAttempt } from "./types";

export type FilecoinTargetSealEnv = Record<string, string | undefined>;

export type FilecoinSealTargetKind = "record" | "mode";

export type FilecoinSealTarget = {
  kind: FilecoinSealTargetKind;
  id: string;
  payload: string;
  payloadHash: string;
  byteLength: number;
  cid?: string;
  proof?: FilecoinProof;
  verifyUrl?: string;
  proofUrl?: string;
  cidQueryUrl?: string;
  backendJobId?: string;
  uploadStatusUrl?: string;
  uploadStatusPolls?: number;
  uploadStatusLog?: SealUploadStatusAttempt[];
  verifyPolls?: number;
  verifyPollLog?: SealPollAttempt[];
};

export type FilecoinTargetSealReport = {
  ready: boolean;
  dryRun: boolean;
  endpoint: string;
  sameOriginSeal?: boolean;
  health?: SealBackendHealth;
  productionReady: boolean;
  targets: FilecoinSealTarget[];
  verifyEnv: string;
  blockers: string[];
};

export type FilecoinTargetSealAcceptanceTarget = {
  kind: FilecoinSealTargetKind;
  id: string;
  cid?: string;
  backendJobId?: string;
  uploadStatusUrl?: string;
  cidQueryUrl?: string;
  sealed: boolean;
  uploadStatus: boolean;
  uploadStatusProgression: boolean;
  verifyPolling: boolean;
  verifyPollingProgression: boolean;
  cidQuery: boolean;
  proofReadback: boolean;
  blockers: string[];
};

export type FilecoinTargetSealReadBackCommand = {
  id: string;
  kind: FilecoinSealTargetKind;
  targetId: string;
  label: string;
  command: string;
  url: string;
  ready: boolean;
  authMode: "browser-token" | "same-origin-proxy";
  expectedCid?: string;
  expectedPayloadHash?: string;
};

export type FilecoinTargetSealArtifact = FilecoinTargetSealReport & {
  generatedAt: string;
  envFiles: string[];
  artifactVersion: 1;
  readBackCommands: FilecoinTargetSealReadBackCommand[];
  acceptance: {
    recordSealed: boolean;
    modeSealedCount: number;
    requiredModeSealCount: number;
    uploadStatusComplete: boolean;
    uploadStatusProgressionComplete: boolean;
    verifyPollingComplete: boolean;
    verifyPollingProgressionComplete: boolean;
    cidQueryComplete: boolean;
    proofReadbackComplete: boolean;
    targets: FilecoinTargetSealAcceptanceTarget[];
    outputEnvKeys: string[];
  };
};

type FetchLike = typeof fetch;

type SealUploadResponse = Partial<FilecoinProof> & {
  ok?: boolean;
  jobId?: string;
  status?: string;
  statusUrl?: string;
  proof?: Partial<FilecoinProof>;
  error?: string;
};

const env = (values: FilecoinTargetSealEnv, key: string) => values[key]?.trim() ?? "";

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

const curlReadBackCommand = (url: string, includeBearerToken: boolean) =>
  [
    "curl -sS",
    shellSingleQuote(url),
    ...(includeBearerToken ? ["-H", '"Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"'] : []),
  ].join(" ");

const isAbsoluteHttpsUrl = (value: string | undefined) => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const sameUrl = (left: string | undefined, right: string | undefined) => {
  if (!left || !right) return false;
  try {
    return new URL(left).toString() === new URL(right).toString();
  } catch {
    return false;
  }
};

const proofUrlTargetsCid = (proofUrl: string | undefined, cid: string | undefined) => {
  if (!proofUrl || !cid || !isAbsoluteHttpsUrl(proofUrl)) return false;
  try {
    const url = new URL(proofUrl);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "") === cid;
  } catch {
    return false;
  }
};

const validPayloadHash = (hash: string | undefined) => /^[a-f0-9]{64}$/i.test(hash ?? "");

const targetImage: ShareImageSeedMetadata = {
  imageUrl: "https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png",
  imageMime: "image/png",
  imageByteLength: 120_000,
  imageHash: "0".repeat(64),
};

const targetImageFromEnv = (
  values: FilecoinTargetSealEnv,
  kind: "record" | "mode",
): ShareImageSeedMetadata => ({
  ...targetImage,
  imageUrl:
    kind === "mode"
      ? env(values, "KICKOFF_SEED_MODE_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL") || targetImage.imageUrl
      : env(values, "KICKOFF_SEED_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL") || targetImage.imageUrl,
  imageHash: kind === "mode" ? "1".repeat(64) : targetImage.imageHash,
});

export const filecoinTargetUrl = (
  values: FilecoinTargetSealEnv,
  path: "health" | "seal" | "verify" | "proof",
  cid?: string,
) => {
  const endpoint = resolvedPublicSealApi(values);
  if (!endpoint) return "";
  const url = new URL(endpoint, env(values, "VITE_PUBLIC_APP_URL") || "http://127.0.0.1/");
  if (path === "health") {
    url.pathname = url.pathname
      .replace(/\/seal\/?$/, "/health")
      .replace(/\/verify\/?$/, "/health")
      .replace(/\/proof\/?.*$/, "/health");
    url.search = "";
    return url.toString();
  }
  if (path === "seal") {
    url.pathname = url.pathname
      .replace(/\/verify\/?$/, "/seal")
      .replace(/\/proof\/?.*$/, "/seal")
      .replace(/\/health\/?$/, "/seal");
    url.search = "";
    return url.toString();
  }
  if (path === "verify") {
    url.pathname = url.pathname
      .replace(/\/seal\/?$/, "/verify")
      .replace(/\/proof\/?.*$/, "/verify")
      .replace(/\/health\/?$/, "/verify");
    url.search = "";
    url.searchParams.set("cid", cid ?? "");
    return url.toString();
  }
  url.pathname = url.pathname
    .replace(/\/seal\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`)
    .replace(/\/verify\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`)
    .replace(/\/health\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`);
  url.search = "";
  return url.toString();
};

export const filecoinTargetSealUploadUrl = (values: FilecoinTargetSealEnv) => {
  const sealUrl = filecoinTargetUrl(values, "seal");
  if (!sealUrl) return "";
  const url = new URL(sealUrl);
  url.searchParams.set("async", "1");
  return url.toString();
};

export const filecoinTargetJobStatusUrl = (
  values: FilecoinTargetSealEnv,
  statusUrl: string | undefined,
  jobId: string | undefined,
) => {
  const sealUrl = filecoinTargetUrl(values, "seal");
  if (!sealUrl) return "";
  if (statusUrl) return new URL(statusUrl, sealUrl).toString();
  if (!jobId) return "";
  const url = new URL(sealUrl);
  url.pathname = url.pathname.replace(/\/seal\/?$/, `/jobs/${encodeURIComponent(jobId)}`);
  url.search = "";
  return url.toString();
};

const headers = (values: FilecoinTargetSealEnv, base: Record<string, string> = {}) => ({
  ...base,
  ...(env(values, "VITE_FILECOIN_SEAL_TOKEN")
    ? { Authorization: `Bearer ${env(values, "VITE_FILECOIN_SEAL_TOKEN")}` }
    : {}),
});

const shareImageBlockers = (values: FilecoinTargetSealEnv) =>
  [...new Set([
    publicShareImageUrlProblem(
      env(values, "KICKOFF_SEED_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL"),
      "Record share image URL",
    ),
    publicShareImageUrlProblem(
      env(values, "KICKOFF_SEED_MODE_SHARE_IMAGE_URL") || env(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"),
      "Mode share image URL",
    ),
  ].filter(Boolean))];

const readJson = async (fetcher: FetchLike, url: string, init?: RequestInit) => {
  const response = await fetcher(url, init);
  const text = await response.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { response, body, text };
};

export const buildFilecoinTargetPayloads = async (
  values: FilecoinTargetSealEnv,
  now = new Date().toISOString(),
) => {
  const seed = await buildProductionTargetSeed(
    {
      ...values,
      VITE_PUBLIC_APP_URL: env(values, "VITE_PUBLIC_APP_URL") || "https://example.com/kickoff-lock-agent/",
    },
    {
      record: targetImageFromEnv(values, "record"),
      mode: targetImageFromEnv(values, "mode"),
    },
    now,
  );
  const recordPayload = stableJson({ capsule: seed.record.capsule, result: seed.record.result ?? null });
  const modes = await Promise.all(
    seed.modeRuns.map(async (run) => {
      const { sealJob: _sealJob, ...modeRunPayload } = run;
      const modePayload = stableJson({ modeRun: modeRunPayload });
      return {
        kind: "mode" as const,
        id: run.id,
        payload: modePayload,
        payloadHash: await sha256(modePayload),
        byteLength: new TextEncoder().encode(modePayload).byteLength,
      };
    }),
  );
  return {
    seed,
    record: {
      kind: "record" as const,
      id: seed.record.capsule.id,
      payload: recordPayload,
      payloadHash: await sha256(recordPayload),
      byteLength: new TextEncoder().encode(recordPayload).byteLength,
    },
    mode: modes[0]!,
    modes,
  };
};

const normalizeProof = (cid: string, payload: Partial<FilecoinProof>): FilecoinProof => ({
  mode: "real",
  cid: String(payload.cid ?? cid),
  pieceCid: String(payload.pieceCid ?? payload.cid ?? cid),
  provider: String(payload.provider ?? "seal-api-provider"),
  dataSetId: String(payload.dataSetId ?? "seal-api-dataset"),
  proofStatus: (payload.proofStatus as FilecoinProof["proofStatus"]) ?? "retrievable",
  uploadedAt: payload.uploadedAt,
  retrievalUrl: payload.retrievalUrl,
  payloadHash: payload.payloadHash,
  byteLength: payload.byteLength,
});

const backendProductionReady = (health: SealBackendHealth) =>
  Boolean(
    health.ok &&
      health.productionReady === true &&
      !health.mockMode &&
      health.hasPrivateKey &&
      health.authRequired &&
      health.persistence === "file" &&
      health.maxUploadBytes,
  );

const wait = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const proofFromSealUpload = (
  payload: SealUploadResponse,
  payloadHash: string,
  byteLength: number,
): Partial<FilecoinProof> => ({
  ...(payload.proof ?? payload),
  payloadHash: payload.proof?.payloadHash ?? payload.payloadHash ?? payloadHash,
  byteLength: payload.proof?.byteLength ?? payload.byteLength ?? byteLength,
});

const pollTargetSealJob = async (
  values: FilecoinTargetSealEnv,
  fetcher: FetchLike,
  initial: SealUploadResponse,
  target: Omit<FilecoinSealTarget, "cid" | "proof" | "verifyUrl" | "proofUrl">,
  options: { maxJobPolls?: number; pollDelayMs?: number } = {},
): Promise<{
  proofPayload: Partial<FilecoinProof>;
  backendJobId?: string;
  uploadStatusUrl?: string;
  uploadStatusPolls: number;
  uploadStatusLog: SealUploadStatusAttempt[];
}> => {
  if (!initial.jobId) {
    return {
      proofPayload: proofFromSealUpload(initial, target.payloadHash, target.byteLength),
      uploadStatusPolls: 0,
      uploadStatusLog: [],
    };
  }

  const uploadStatusUrl = filecoinTargetJobStatusUrl(values, initial.statusUrl, initial.jobId);
  const uploadStatusLog: SealUploadStatusAttempt[] = [];
  const maxJobPolls = options.maxJobPolls ?? 10;
  const pollDelayMs = options.pollDelayMs ?? 450;
  for (let attempt = 1; attempt <= maxJobPolls; attempt += 1) {
    const checkedAt = new Date().toISOString();
    const job = await readJson(fetcher, uploadStatusUrl, { headers: headers(values) }).catch((error) => {
      uploadStatusLog.push({
        attempt,
        checkedAt,
        status: "error",
        detail: (error as Error).message,
        jobId: initial.jobId,
      });
      return undefined;
    });
    if (job?.response.ok) {
      const payload = job.body as SealUploadResponse;
      const status = String(payload.status ?? "running");
      const proofPayload = proofFromSealUpload(payload, target.payloadHash, target.byteLength);
      uploadStatusLog.push({
        attempt,
        checkedAt: proofPayload.uploadedAt ?? checkedAt,
        status: proofPayload.cid ? "verified" : status === "queued" ? "queued" : status === "failed" ? "failed" : "running",
        httpStatus: job.response.status,
        detail: proofPayload.cid ? `Seal job returned CID ${proofPayload.cid}.` : `Seal job ${status}.`,
        jobId: initial.jobId,
        cid: proofPayload.cid,
        payloadHash: proofPayload.payloadHash,
        byteLength: proofPayload.byteLength,
      });
      if (proofPayload.cid) {
        return {
          proofPayload,
          backendJobId: initial.jobId,
          uploadStatusUrl,
          uploadStatusPolls: attempt,
          uploadStatusLog,
        };
      }
      if (status === "failed") throw new Error(`${target.kind} seal job failed: ${payload.error ?? "unknown error"}`);
    } else if (job) {
      const payload = (job.body ?? {}) as SealUploadResponse;
      uploadStatusLog.push({
        attempt,
        checkedAt,
        status: job.response.status >= 500 ? "failed" : "error",
        httpStatus: job.response.status,
        detail: payload.error ?? `Seal job status returned ${job.response.status}.`,
        jobId: initial.jobId,
      });
      if (job.response.status >= 500) {
        throw new Error(`${target.kind} seal job failed: ${payload.error ?? `HTTP ${job.response.status}`}`);
      }
    }
    if (attempt < maxJobPolls) await wait(pollDelayMs);
  }
  throw new Error(`${target.kind} seal job ${initial.jobId} did not return a CID before polling timed out.`);
};

const pollTargetVerification = async (
  values: FilecoinTargetSealEnv,
  fetcher: FetchLike,
  target: Omit<FilecoinSealTarget, "cid" | "proof" | "verifyUrl" | "proofUrl">,
  cid: string,
  options: { maxVerifyPolls?: number; pollDelayMs?: number } = {},
): Promise<{
  verifyPayload: Partial<FilecoinProof>;
  verifyPolls: number;
  verifyPollLog: SealPollAttempt[];
}> => {
  const verifyUrl = filecoinTargetUrl(values, "verify", cid);
  const maxVerifyPolls = options.maxVerifyPolls ?? 10;
  const pollDelayMs = options.pollDelayMs ?? 450;
  const verifyPollLog: SealPollAttempt[] = [];
  for (let attempt = 1; attempt <= maxVerifyPolls; attempt += 1) {
    const checkedAt = new Date().toISOString();
    const result = await readJson(fetcher, verifyUrl, { headers: headers(values) }).catch((error) => {
      verifyPollLog.push({
        attempt,
        checkedAt,
        status: "error",
        proofStatus: "missing",
        detail: (error as Error).message,
      });
      return undefined;
    });
    if (result?.response.ok) {
      const payload = (result.body ?? {}) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string };
      const proofStatus = (payload.proofStatus as FilecoinProof["proofStatus"] | undefined) ?? "draft";
      const returnedCid = String(payload.cid ?? "");
      const cidMatches = returnedCid === cid;
      const payloadHash = String(payload.payloadHash ?? "");
      const byteLength = Number(payload.byteLength);
      const payloadMetadataMatches =
        (!payloadHash || payloadHash === target.payloadHash) &&
        (!Number.isFinite(byteLength) || byteLength === target.byteLength);
      const verified = cidMatches && ["retrievable", "verified"].includes(proofStatus) && payloadMetadataMatches;
      verifyPollLog.push({
        attempt,
        checkedAt: payload.checkedAt ?? checkedAt,
        status: proofStatus === "verified" ? "verified" : proofStatus === "retrievable" ? "retrievable" : "pending",
        proofStatus,
        httpStatus: result.response.status,
        detail: verified
          ? `${target.kind} ${cid} ${proofStatus}.`
          : `${target.kind} verify pending: cid ${returnedCid || "missing"}, status ${proofStatus}.`,
        retrievalUrl: payload.retrievalUrl,
        cid: returnedCid || undefined,
        payloadHash: payloadHash || undefined,
        byteLength: Number.isFinite(byteLength) ? byteLength : undefined,
      });
      if (cidMatches && ["retrievable", "verified"].includes(proofStatus) && !payloadMetadataMatches) {
        throw new Error(`${target.kind} verify payload metadata mismatch.`);
      }
      if (verified) return { verifyPayload: payload, verifyPolls: attempt, verifyPollLog };
    } else if (result) {
      verifyPollLog.push({
        attempt,
        checkedAt,
        status: "error",
        proofStatus: "missing",
        httpStatus: result.response.status,
        detail: `${target.kind} verify returned HTTP ${result.response.status}.`,
      });
    }
    if (attempt < maxVerifyPolls) await wait(pollDelayMs);
  }
  throw new Error(`${target.kind} verify did not return a retrievable CID before polling timed out.`);
};

const sealOneTarget = async (
  values: FilecoinTargetSealEnv,
  fetcher: FetchLike,
  target: Omit<FilecoinSealTarget, "cid" | "proof" | "verifyUrl" | "proofUrl">,
  options: { maxJobPolls?: number; maxVerifyPolls?: number; pollDelayMs?: number } = {},
): Promise<FilecoinSealTarget> => {
  const sealUrl = filecoinTargetSealUploadUrl(values);
  const seal = await readJson(fetcher, sealUrl, {
    method: "POST",
    headers: headers(values, { "Content-Type": "application/json" }),
    body: target.payload,
  });
  if (!seal.response.ok) throw new Error(`${target.kind} seal failed: HTTP ${seal.response.status} ${seal.text}`);
  const upload = await pollTargetSealJob(values, fetcher, seal.body as SealUploadResponse, target, options);
  const uploadedProof = upload.proofPayload;
  const cid = String(uploadedProof.cid ?? "");
  if (!cid) throw new Error(`${target.kind} seal did not return a CID.`);
  if (uploadedProof.payloadHash && uploadedProof.payloadHash !== target.payloadHash) {
    throw new Error(`${target.kind} seal payload hash mismatch.`);
  }

  const verifyUrl = filecoinTargetUrl(values, "verify", cid);
  const proofUrl = filecoinTargetUrl(values, "proof", cid);
  const verify = await pollTargetVerification(values, fetcher, target, cid, options);
  const proof = await readJson(fetcher, proofUrl, { headers: headers(values) });
  if (!proof.response.ok) throw new Error(`${target.kind} proof registry failed: HTTP ${proof.response.status}`);
  const proofPayload = { ...uploadedProof, ...verify.verifyPayload, ...proof.body };
  if (proofPayload.cid && proofPayload.cid !== cid) throw new Error(`${target.kind} proof registry CID mismatch.`);
  if (proofPayload.payloadHash && proofPayload.payloadHash !== target.payloadHash) {
    throw new Error(`${target.kind} proof registry payload hash mismatch.`);
  }
  if (proofPayload.byteLength && proofPayload.byteLength !== target.byteLength) {
    throw new Error(`${target.kind} proof registry byte length mismatch.`);
  }
  const normalized = normalizeProof(cid, {
    ...proofPayload,
    payloadHash: proofPayload.payloadHash ?? target.payloadHash,
    byteLength: proofPayload.byteLength ?? target.byteLength,
  });
  return {
    ...target,
    cid,
    proof: normalized,
    verifyUrl,
    proofUrl,
    cidQueryUrl: proofUrl,
    backendJobId: upload.backendJobId,
    uploadStatusUrl: upload.uploadStatusUrl,
    uploadStatusPolls: upload.uploadStatusPolls,
    uploadStatusLog: upload.uploadStatusLog,
    verifyPolls: verify.verifyPolls,
    verifyPollLog: verify.verifyPollLog,
  };
};

const baseVerifyTargetsFromPayloads = (payloads: Awaited<ReturnType<typeof buildFilecoinTargetPayloads>>) => ({
  userId: payloads.seed.targets.userId,
  profileId: payloads.seed.targets.profileId,
  publicProfileUrl: payloads.seed.targets.publicProfileUrl,
  proofId: payloads.seed.targets.proofId,
  modeId: payloads.seed.targets.modeId,
  modeIds: payloads.seed.targets.modeIds,
  shareArtifactIds: payloads.seed.targets.shareArtifactIds,
  friendCode: payloads.seed.targets.friendCode,
  seasonKey: payloads.seed.targets.seasonKey,
  leaderboardScopes: payloads.seed.targets.leaderboardScopes,
  shareImageUrl: payloads.seed.targets.shareImageUrl,
  modeShareImageUrl: payloads.seed.targets.modeShareImageUrl,
});

export const buildFilecoinTargetSealReport = async (
  values: FilecoinTargetSealEnv,
  options: {
    dryRun?: boolean;
    fetcher?: FetchLike;
    now?: string;
    maxJobPolls?: number;
    maxVerifyPolls?: number;
    pollDelayMs?: number;
  } = {},
): Promise<FilecoinTargetSealReport> => {
  const dryRun = options.dryRun ?? false;
  const fetcher = options.fetcher ?? fetch;
  const endpoint = resolvedPublicSealApi(values);
  const sameOriginSeal = sameOriginSealSelected(values);
  const blockers: string[] = [];
  const payloads = await buildFilecoinTargetPayloads(values, options.now);
  const targets = [payloads.record, ...payloads.modes];
  if (!endpoint) blockers.push("VITE_FILECOIN_SEAL_API missing or VITE_FILECOIN_SEAL_SAME_ORIGIN not enabled");
  if (!env(values, "VITE_FILECOIN_SEAL_TOKEN") && !sameOriginSeal) {
    blockers.push("VITE_FILECOIN_SEAL_TOKEN missing");
  }
  blockers.push(...shareImageBlockers(values));
  if (dryRun || blockers.length > 0) {
    return {
      ready: false,
      dryRun,
      endpoint,
      sameOriginSeal,
      productionReady: false,
      targets,
      blockers,
      verifyEnv: buildProductionVerifyEnv({
        ...baseVerifyTargetsFromPayloads(payloads),
        filecoinRecordPayloadHash: payloads.record.payloadHash,
        filecoinModePayloadHash: payloads.mode.payloadHash,
        filecoinModePayloadHashes: payloads.modes.map((target) => target.payloadHash),
      }),
    };
  }

  const health = await readJson(fetcher, filecoinTargetUrl(values, "health"), { headers: headers(values) });
  if (!health.response.ok) throw new Error(`Seal API health failed: HTTP ${health.response.status}`);
  const backendHealth = health.body as SealBackendHealth;
  const productionReady = backendProductionReady(backendHealth);
  if (!productionReady) {
    blockers.push(...(backendHealth.blockers ?? ["Seal API health did not declare production readiness."]));
    return {
      ready: false,
      dryRun,
      endpoint,
      sameOriginSeal,
      health: backendHealth,
      productionReady,
      targets,
      blockers,
      verifyEnv: buildProductionVerifyEnv({
        ...baseVerifyTargetsFromPayloads(payloads),
        filecoinRecordPayloadHash: payloads.record.payloadHash,
        filecoinModePayloadHash: payloads.mode.payloadHash,
        filecoinModePayloadHashes: payloads.modes.map((target) => target.payloadHash),
      }),
    };
  }

  const [record, ...modes] = await Promise.all([
    sealOneTarget(values, fetcher, payloads.record, options),
    ...payloads.modes.map((target) => sealOneTarget(values, fetcher, target, options)),
  ]);
  const mode = modes[0]!;
  const sealedTargets = [record, ...modes];
  const proofBlockers = sealedTargets.flatMap((target) =>
    filecoinProofMetadataProblems(target.proof, {
      cid: target.cid,
      expectedPayloadHash: target.payloadHash,
      expectedByteLength: target.byteLength,
      label: `${target.kind} ${target.id} proof`,
    }),
  );
  const ready = productionReady && proofBlockers.length === 0;
  return {
    ready,
    dryRun,
    endpoint,
    sameOriginSeal,
    health: backendHealth,
    productionReady,
    targets: sealedTargets,
    blockers: [...blockers, ...proofBlockers],
    verifyEnv: buildProductionVerifyEnv({
      ...baseVerifyTargetsFromPayloads(payloads),
      filecoinRecordCid: record.cid,
      filecoinRecordPayloadHash: record.payloadHash,
      filecoinModeCid: mode.cid,
      filecoinModePayloadHash: mode.payloadHash,
      filecoinModeCids: modes.map((target) => target.cid).filter(Boolean) as string[],
      filecoinModePayloadHashes: modes.map((target) => target.payloadHash),
      allowFailures: true,
    }),
  };
};

const targetProofReadBack = (target: FilecoinSealTarget) =>
  Boolean(
    target.cid &&
      target.proofUrl &&
      target.cidQueryUrl &&
      sameUrl(target.cidQueryUrl, target.proofUrl) &&
      proofUrlTargetsCid(target.proofUrl, target.cid) &&
      target.proof?.cid === target.cid &&
      target.proof.payloadHash === target.payloadHash &&
      target.proof.byteLength === target.byteLength &&
      ["retrievable", "verified"].includes(target.proof.proofStatus) &&
      filecoinProofMetadataProblems(target.proof, {
        cid: target.cid,
        expectedPayloadHash: target.payloadHash,
        expectedByteLength: target.byteLength,
        label: `${target.kind} ${target.id} proof`,
      }).length === 0,
  );

const targetUploadLogConsistent = (target: FilecoinSealTarget) =>
  (target.uploadStatusLog ?? []).every(
    (entry) =>
      (!entry.jobId || entry.jobId === target.backendJobId) &&
      (!entry.cid || entry.cid === target.cid) &&
      (!entry.payloadHash || entry.payloadHash === target.payloadHash) &&
      (!entry.byteLength || entry.byteLength === target.byteLength),
  );

const targetUploadComplete = (target: FilecoinSealTarget) =>
  {
    const latest = target.uploadStatusLog?.at(-1);
    const progressed = Boolean(
      (target.uploadStatusLog?.length ?? 0) >= 2 &&
        target.uploadStatusLog?.slice(0, -1).some((entry) => entry.status === "queued" || entry.status === "running"),
    );
    return Boolean(
      target.cid &&
        target.backendJobId &&
        target.uploadStatusUrl &&
        (target.uploadStatusPolls ?? 0) > 0 &&
        progressed &&
        latest?.status === "verified" &&
        latest.cid === target.cid &&
        latest.payloadHash === target.payloadHash &&
        latest.byteLength === target.byteLength &&
        (!latest.jobId || latest.jobId === target.backendJobId) &&
        targetUploadLogConsistent(target),
    );
  };

const targetVerifyLogConsistent = (target: FilecoinSealTarget) =>
  (target.verifyPollLog ?? []).every(
    (entry) =>
      (!entry.cid || entry.cid === target.cid) &&
      (!entry.payloadHash || entry.payloadHash === target.payloadHash) &&
      (!entry.byteLength || entry.byteLength === target.byteLength),
  );

const targetVerifyComplete = (target: FilecoinSealTarget) =>
  {
    const latest = target.verifyPollLog?.at(-1);
    const progressed = Boolean(
      (target.verifyPollLog?.length ?? 0) >= 2 &&
        target.verifyPollLog?.slice(0, -1).some((entry) => entry.status === "pending" || entry.status === "retrievable"),
    );
    return Boolean(
      target.cid &&
        target.verifyUrl &&
        (target.verifyPolls ?? 0) > 0 &&
        progressed &&
        latest &&
        ["retrievable", "verified"].includes(latest.status) &&
        ["retrievable", "verified"].includes(String(latest.proofStatus)) &&
        latest.cid === target.cid &&
        (!latest.payloadHash || latest.payloadHash === target.payloadHash) &&
        (!latest.byteLength || latest.byteLength === target.byteLength) &&
        targetVerifyLogConsistent(target),
    );
  };

const targetAcceptance = (target: FilecoinSealTarget): FilecoinTargetSealAcceptanceTarget => {
  const uploadStatus = targetUploadComplete(target);
  const verifyPolling = targetVerifyComplete(target);
  const uploadStatusProgression = Boolean(
    target.uploadStatusLog?.length &&
      target.uploadStatusLog.length >= 2 &&
      target.uploadStatusLog.slice(0, -1).some((entry) => entry.status === "queued" || entry.status === "running") &&
      target.uploadStatusLog.at(-1)?.status === "verified",
  );
  const verifyPollingProgression = Boolean(
    target.verifyPollLog?.length &&
      target.verifyPollLog.length >= 2 &&
      target.verifyPollLog.slice(0, -1).some((entry) => entry.status === "pending" || entry.status === "retrievable") &&
      ["retrievable", "verified"].includes(target.verifyPollLog.at(-1)?.status ?? ""),
  );
  const proofReadback = targetProofReadBack(target);
  const cidQuery = Boolean(
    target.cid &&
      target.cidQueryUrl &&
      sameUrl(target.cidQueryUrl, target.proofUrl) &&
      proofUrlTargetsCid(target.cidQueryUrl, target.cid) &&
      target.proof?.cid === target.cid,
  );
  const sealed = uploadStatus && verifyPolling && cidQuery && proofReadback;
  const latestUpload = target.uploadStatusLog?.at(-1);
  const latestVerify = target.verifyPollLog?.at(-1);
  const blockers = [
    target.backendJobId ? "" : "backend job id missing",
    target.uploadStatusUrl ? "" : "upload status URL missing",
    target.cid ? "" : "CID missing",
    uploadStatus
      ? ""
      : !uploadStatusProgression
        ? "upload status did not progress from queued/running to verified"
        : latestUpload
          ? `upload status incomplete: ${latestUpload.detail}`
          : "upload status polling missing",
    verifyPolling
      ? ""
      : !verifyPollingProgression
        ? "verification polling did not progress from pending/retrievable to retrievable/verified"
        : latestVerify
          ? `verification polling incomplete: ${latestVerify.detail}`
          : "verification polling missing",
    cidQuery ? "" : "CID query read-back missing or targets a different CID",
    proofReadback ? "" : "proof registry read-back missing or metadata mismatch",
    ...filecoinProofMetadataProblems(target.proof, {
      cid: target.cid,
      expectedPayloadHash: target.payloadHash,
      expectedByteLength: target.byteLength,
      label: `${target.kind} ${target.id} proof`,
    }),
  ].filter(Boolean);
  return {
    kind: target.kind,
    id: target.id,
    cid: target.cid,
    backendJobId: target.backendJobId,
    uploadStatusUrl: target.uploadStatusUrl,
    cidQueryUrl: target.cidQueryUrl,
    sealed,
    uploadStatus,
    uploadStatusProgression,
    verifyPolling,
    verifyPollingProgression,
    cidQuery,
    proofReadback,
    blockers: [...new Set(blockers)],
  };
};

const targetReadBackCommands = (
  target: FilecoinSealTarget,
  includeBearerToken: boolean,
): FilecoinTargetSealReadBackCommand[] => {
  const targetKey = `${target.kind}-${target.id}`;
  const commands = [
    {
      id: `${targetKey}-upload-status`,
      label: `${target.kind} ${target.id} upload status`,
      url: target.uploadStatusUrl ?? "",
    },
    {
      id: `${targetKey}-verify`,
      label: `${target.kind} ${target.id} verify status`,
      url: target.verifyUrl ?? "",
    },
    {
      id: `${targetKey}-proof`,
      label: `${target.kind} ${target.id} proof read-back`,
      url: target.proofUrl ?? target.cidQueryUrl ?? "",
    },
  ];
  return commands.map((item) => ({
    ...item,
    kind: target.kind,
    targetId: target.id,
    ready: isAbsoluteHttpsUrl(item.url) && Boolean(target.cid) && validPayloadHash(target.payloadHash),
    authMode: includeBearerToken ? "browser-token" : "same-origin-proxy",
    command: item.url
      ? curlReadBackCommand(item.url, includeBearerToken)
      : `Seal ${target.kind} ${target.id} before reading ${item.label}.`,
    expectedCid: target.cid,
    expectedPayloadHash: target.payloadHash,
  }));
};

export const buildFilecoinTargetSealArtifact = (
  report: FilecoinTargetSealReport,
  options: { envFiles?: string[]; generatedAt?: string } = {},
): FilecoinTargetSealArtifact => {
  const record = report.targets.find((target) => target.kind === "record");
  const modes = report.targets.filter((target) => target.kind === "mode");
  const includeBearerToken = !report.sameOriginSeal;
  const targetStatuses = report.targets.map(targetAcceptance);
  const recordStatus = targetStatuses.find((target) => target.kind === "record");
  const modeStatuses = targetStatuses.filter((target) => target.kind === "mode");
  const acceptance = {
    recordSealed: Boolean(record && recordStatus?.sealed),
    modeSealedCount: modeStatuses.filter((target) => target.sealed).length,
    requiredModeSealCount: modes.length,
    uploadStatusComplete: targetStatuses.length > 0 && targetStatuses.every((target) => target.uploadStatus),
    uploadStatusProgressionComplete:
      targetStatuses.length > 0 && targetStatuses.every((target) => target.uploadStatusProgression),
    verifyPollingComplete: targetStatuses.length > 0 && targetStatuses.every((target) => target.verifyPolling),
    verifyPollingProgressionComplete:
      targetStatuses.length > 0 && targetStatuses.every((target) => target.verifyPollingProgression),
    cidQueryComplete: targetStatuses.length > 0 && targetStatuses.every((target) => target.cidQuery),
    proofReadbackComplete: targetStatuses.length > 0 && targetStatuses.every((target) => target.proofReadback),
    targets: targetStatuses,
    outputEnvKeys: [
      "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
      "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
      "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
      "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
    ],
  };
  return {
    ...report,
    ready:
      report.ready &&
      acceptance.recordSealed &&
      acceptance.modeSealedCount >= acceptance.requiredModeSealCount &&
      acceptance.uploadStatusComplete &&
      acceptance.verifyPollingComplete &&
      acceptance.cidQueryComplete &&
      acceptance.proofReadbackComplete,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    envFiles: options.envFiles ?? [],
    artifactVersion: 1,
    readBackCommands: report.targets.flatMap((target) => targetReadBackCommands(target, includeBearerToken)),
    acceptance,
  };
};
