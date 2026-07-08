import { sha256, stableJson } from "./proof";
import {
  buildFilecoinSealResumeReadiness,
  type FilecoinSealResumeNextAction,
  type FilecoinSealResumeRisk,
} from "./filecoinSealJobChecks";
import { filecoinProofMetadataProblems } from "./filecoinProofValidation";
import { resolvedFilecoinSealApiUrl, runtimeConfigValue } from "./runtimeConfig";
import type {
  FilecoinLookupState,
  FilecoinProof,
  GameModeRun,
  MemoryRecord,
  PredictionCapsule,
  SealBackendHealth,
  SealJob,
  SealPollAttempt,
  SealStep,
  SealUploadStatusAttempt,
} from "./types";

export type FilecoinSealResumeQueueItem = {
  kind: "record" | "mode";
  artifactId: string;
  backendJobId: string;
  status: SealJob["status"];
  uploadStatusUrl?: string;
  canResume: boolean;
  risk: FilecoinSealResumeRisk;
  nextAction: FilecoinSealResumeNextAction;
  nextActionDetail: string;
  blockers: string[];
  evidence: string[];
  uploadStatusPolls: number;
  verificationPolls: number;
  lastCheckedAt?: string;
};

const runtimeEnv = import.meta.env as Record<string, string | boolean | undefined>;
const sealEndpoint = () => resolvedFilecoinSealApiUrl(runtimeEnv);
const sealToken = () => runtimeConfigValue(runtimeEnv, "VITE_FILECOIN_SEAL_TOKEN");

const baseSteps = (): SealStep[] => [
  {
    id: "payload",
    label: "Build immutable payload",
    status: "queued",
    detail: "Stable JSON and SHA-256 hash are ready in the capsule.",
  },
  {
    id: "health",
    label: "Check seal API health",
    status: "queued",
    detail: "Confirms the trusted sealing backend is reachable before uploading.",
  },
  {
    id: "upload",
    label: "Upload through Synapse",
    status: "queued",
    detail: "Requires a server endpoint with SYNAPSE_PRIVATE_KEY.",
  },
  {
    id: "deal",
    label: "Storage deal accepted",
    status: "queued",
    detail: "Provider and dataset identifiers will be returned by the seal API.",
  },
  {
    id: "poll",
    label: "Poll retrievability",
    status: "queued",
    detail: "Verifier polls until CID is retrievable.",
  },
  {
    id: "registry",
    label: "Read proof registry",
    status: "queued",
    detail: "Reads /proof/:cid back from the seal API and checks the uploaded payload hash.",
  },
  {
    id: "verify",
    label: "Attach proof",
    status: "queued",
    detail: "Real proof replaces the demo proof after verification.",
  },
];

const mark = (steps: SealStep[], ids: SealStep["id"][], status: SealStep["status"], detail?: string) =>
  steps.map((step) =>
    ids.includes(step.id)
      ? {
          ...step,
          status,
          detail: detail ?? step.detail,
        }
      : step,
  );

const wait = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const proofMetadataProblemMessage = (
  proof: FilecoinProof,
  options: {
    cid?: string;
    expectedPayloadHash?: string;
    expectedByteLength?: number;
    label: string;
  },
) => {
  const problems = filecoinProofMetadataProblems(proof, options);
  return problems.length > 0 ? problems.join("; ") : "";
};

export const sealApiHeaders = (base: Record<string, string> = {}, token = sealToken()) => ({
  ...base,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export const sealApiUrl = (path: "health" | "seal" | "verify" | "proof", value?: string, endpoint = sealEndpoint()) => {
  if (!endpoint) return "";
  const baseUrl = typeof window === "undefined" ? "http://127.0.0.1/" : window.location.href;
  const url = new URL(endpoint, baseUrl);
  if (path === "health") {
    url.pathname = url.pathname
      .replace(/\/seal\/?$/, "/health")
      .replace(/\/verify\/?$/, "/health")
      .replace(/\/proof\/?.*$/, "/health");
    url.search = "";
    return url.toString();
  }
  if (path === "seal") {
    url.pathname = url.pathname.replace(/\/verify\/?$/, "/seal").replace(/\/proof\/?.*$/, "/seal");
    url.search = "";
    return url.toString();
  }
  if (path === "verify") {
    url.pathname = url.pathname.replace(/\/seal\/?$/, "/verify").replace(/\/proof\/?.*$/, "/verify");
    url.search = "";
    url.searchParams.set("cid", value ?? "");
    return url.toString();
  }
  url.pathname = url.pathname.replace(/\/seal\/?$/, `/proof/${encodeURIComponent(value ?? "")}`).replace(/\/verify\/?$/, `/proof/${encodeURIComponent(value ?? "")}`);
  url.search = "";
  return url.toString();
};

const verifyEndpoint = (cid: string) => {
  const url = sealApiUrl("verify", cid);
  if (!url) return "";
  return url;
};

const sealUploadUrl = () => {
  const url = sealApiUrl("seal");
  if (!url) return "";
  const asyncUrl = new URL(url);
  asyncUrl.searchParams.set("async", "1");
  return asyncUrl.toString();
};

const sealJobStatusUrl = (statusUrl: string | undefined, jobId: string | undefined) => {
  const sealUrl = sealApiUrl("seal");
  if (!sealUrl) return "";
  if (statusUrl) return new URL(statusUrl, sealUrl).toString();
  if (!jobId) return "";
  const url = new URL(sealUrl);
  url.pathname = url.pathname.replace(/\/seal\/?$/, `/jobs/${encodeURIComponent(jobId)}`);
  url.search = "";
  return url.toString();
};

export const sealBackendProductionReady = (health?: SealBackendHealth) =>
  Boolean(
    health?.ok &&
      health.productionReady === true &&
      !health.mockMode &&
      health.hasPrivateKey &&
      health.authRequired &&
      health.persistence === "file" &&
      health.maxUploadBytes,
  );

const failJob = (
  record: MemoryRecord,
  job: SealJob,
  failedStep: SealStep["id"],
  message: string,
): MemoryRecord => ({
  ...record,
  sealJob: {
    ...job,
    status: "failed",
    healthStatus: failedStep === "health" ? "failed" : job.healthStatus,
    updatedAt: new Date().toISOString(),
    steps: mark(job.steps, [failedStep], "failed", message),
    error: message,
  },
});

const failModeJob = (
  run: GameModeRun,
  job: SealJob,
  failedStep: SealStep["id"],
  message: string,
): GameModeRun => ({
  ...run,
  sealJob: {
    ...job,
    status: "failed",
    healthStatus: failedStep === "health" ? "failed" : job.healthStatus,
    updatedAt: new Date().toISOString(),
    steps: mark(job.steps, [failedStep], "failed", message),
    error: message,
  },
});

const normalizeLookupProof = (cid: string, payload: Partial<FilecoinProof> & { checkedAt?: string }): FilecoinProof => ({
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

const lookupPayloadProblem = (
  requestedCid: string,
  proofPayload: Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string },
  verifyPayload: Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string },
) => {
  const proofCid = proofPayload.cid ? String(proofPayload.cid) : "";
  const verifyCid = verifyPayload.cid ? String(verifyPayload.cid) : "";
  if (proofCid && proofCid !== requestedCid) return `/proof/:cid returned ${proofCid}, expected ${requestedCid}.`;
  if (verifyCid && verifyCid !== requestedCid) return `/verify returned ${verifyCid}, expected ${requestedCid}.`;
  if (proofPayload.payloadHash && verifyPayload.payloadHash && proofPayload.payloadHash !== verifyPayload.payloadHash) {
    return "/proof/:cid and /verify payload hashes do not match.";
  }
  if (proofPayload.byteLength && verifyPayload.byteLength && proofPayload.byteLength !== verifyPayload.byteLength) {
    return "/proof/:cid and /verify byte lengths do not match.";
  }
  return "";
};

export const lookupFilecoinProof = async (cid: string): Promise<FilecoinLookupState> => {
  const cleanCid = cid.trim();
  if (!cleanCid) {
    return { status: "missing", message: "Enter a CID to query the seal API." };
  }
  if (!sealEndpoint()) {
    return {
      status: "needs-config",
      message: "Set VITE_FILECOIN_SEAL_API to enable CID proof lookup.",
    };
  }
  const proofUrl = sealApiUrl("proof", cleanCid);
  const verifyUrl = sealApiUrl("verify", cleanCid);
  try {
    const proofRes = await fetch(proofUrl, { headers: sealApiHeaders() });
    if (proofRes.status === 404) {
      return {
        status: "missing",
        message: "No proof metadata found for this CID.",
        checkedAt: new Date().toISOString(),
      };
    }
    if (!proofRes.ok) {
      return { status: "error", message: `Proof lookup returned ${proofRes.status}.` };
    }
    const proofPayload = (await proofRes.json()) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string };
    const verifyRes = await fetch(verifyUrl, { headers: sealApiHeaders() }).catch(() => undefined);
    if (!verifyRes) {
      return {
        status: "error",
        message: "Verify lookup failed. The seal API must read back /verify?cid= before a CID can be attached.",
        checkedAt: proofPayload.checkedAt ?? new Date().toISOString(),
      };
    }
    if (!verifyRes.ok) {
      return {
        status: "error",
        message: `Verify lookup returned ${verifyRes.status}. The CID was not attached.`,
        checkedAt: proofPayload.checkedAt ?? new Date().toISOString(),
      };
    }
    const verifyPayload = (await verifyRes.json()) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string };
    const payloadProblem = lookupPayloadProblem(cleanCid, proofPayload, verifyPayload);
    if (payloadProblem) {
      return {
        status: "error",
        message: `CID proof metadata mismatch: ${payloadProblem}`,
        checkedAt: verifyPayload.checkedAt ?? proofPayload.checkedAt ?? new Date().toISOString(),
      };
    }
    const proof = normalizeLookupProof(cleanCid, { ...proofPayload, ...verifyPayload });
    const metadataProblem = proofMetadataProblemMessage(proof, {
      cid: cleanCid,
      label: "CID proof metadata",
    });
    if (metadataProblem) {
      return {
        status: "error",
        message: `CID proof metadata is not production-ready: ${metadataProblem}`,
        checkedAt: verifyPayload.checkedAt ?? proofPayload.checkedAt ?? new Date().toISOString(),
      };
    }
    return {
      status: proof.proofStatus === "draft" ? "missing" : "found",
      message: proof.proofStatus === "verified" ? "CID verified by the seal API." : "CID proof metadata loaded.",
      proof,
      checkedAt: verifyPayload.checkedAt ?? proofPayload.checkedAt ?? new Date().toISOString(),
    };
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }
};

const pollProofStatus = async (
  proof: FilecoinProof,
  expectedPayloadHash: string,
  expectedByteLength: number,
): Promise<{ proof: FilecoinProof; attempts: number; checkedAt?: string; pollLog: SealPollAttempt[]; error?: string }> => {
  const endpoint = verifyEndpoint(proof.cid);
  if (!endpoint) return { proof, attempts: 0, pollLog: [] };
  let checkedAt: string | undefined;
  const pollLog: SealPollAttempt[] = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const attemptedAt = new Date().toISOString();
    const res = await fetch(endpoint, { headers: sealApiHeaders() }).catch((error) => {
      pollLog.push({
        attempt,
        checkedAt: attemptedAt,
        status: "error",
        detail: (error as Error).message,
      });
      return undefined;
    });
    if (res?.ok) {
      const status = (await res.json()) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string };
      checkedAt = status.checkedAt ?? new Date().toISOString();
      const cidProblem = status.cid && status.cid !== proof.cid ? `Seal API verification returned CID ${status.cid}, expected ${proof.cid}.` : "";
      const hashProblem =
        status.payloadHash && status.payloadHash !== expectedPayloadHash
          ? "Seal API verification payload hash did not match the uploaded payload."
          : "";
      const byteLengthProblem =
        status.byteLength && Number(status.byteLength) !== Number(expectedByteLength)
          ? "Seal API verification byte length did not match the uploaded payload."
          : "";
      const terminalProblem = cidProblem || hashProblem || byteLengthProblem;
      if (terminalProblem) {
        pollLog.push({
          attempt,
          checkedAt,
          status: "error",
          proofStatus: status.proofStatus ?? "draft",
          httpStatus: res.status,
          detail: terminalProblem,
          retrievalUrl: status.retrievalUrl ?? proof.retrievalUrl,
        });
        return { proof, attempts: attempt, checkedAt, pollLog, error: terminalProblem };
      }
      if (status.proofStatus === "verified" || status.proofStatus === "retrievable") {
        pollLog.push({
          attempt,
          checkedAt,
          status: status.proofStatus,
          proofStatus: status.proofStatus,
          httpStatus: res.status,
          detail:
            status.proofStatus === "verified"
              ? "Seal API verified the CID."
              : "Seal API reports the CID as retrievable.",
          retrievalUrl: status.retrievalUrl ?? proof.retrievalUrl,
        });
        return {
          proof: {
            ...proof,
            ...status,
            mode: "real",
            proofStatus: status.proofStatus,
            retrievalUrl: status.retrievalUrl ?? proof.retrievalUrl,
          },
          attempts: attempt,
          checkedAt,
          pollLog,
        };
      }
      pollLog.push({
        attempt,
        checkedAt,
        status: "pending",
        proofStatus: status.proofStatus ?? "draft",
        httpStatus: res.status,
        detail: `Seal API returned ${status.proofStatus ?? "draft"} proof status.`,
        retrievalUrl: status.retrievalUrl ?? proof.retrievalUrl,
      });
    } else if (res) {
      checkedAt = new Date().toISOString();
      pollLog.push({
        attempt,
        checkedAt,
        status: "pending",
        proofStatus: res.status === 404 ? "missing" : "draft",
        httpStatus: res.status,
        detail: `Seal API verification returned ${res.status}.`,
      });
    }
    await wait(450);
  }
  return { proof, attempts: 5, checkedAt, pollLog };
};

type SealUploadResponse = Partial<FilecoinProof> & {
  ok?: boolean;
  jobId?: string;
  status?: string;
  statusUrl?: string;
  proof?: Partial<FilecoinProof>;
  error?: string;
};

type SealUploadJobFields = Pick<SealJob, "backendJobId" | "uploadStatusUrl" | "uploadStatusPolls" | "uploadStatusLog">;

class SealUploadJobError extends Error {
  fields?: SealUploadJobFields;

  constructor(message: string, fields?: SealUploadJobFields) {
    super(message);
    this.name = "SealUploadJobError";
    this.fields = fields;
  }
}

const proofFromSealUpload = (
  payload: SealUploadResponse,
  payloadHash: string,
  byteLength: number,
): Partial<FilecoinProof> => ({
  ...(payload.proof ?? payload),
  payloadHash: payload.proof?.payloadHash ?? payload.payloadHash ?? payloadHash,
  byteLength: payload.proof?.byteLength ?? payload.byteLength ?? byteLength,
});

const pollSealUploadJob = async (
  initial: SealUploadResponse,
  payloadHash: string,
  byteLength: number,
): Promise<{
  proof: Partial<FilecoinProof>;
  backendJobId?: string;
  uploadStatusUrl?: string;
  uploadStatusPolls: number;
  uploadStatusLog: SealUploadStatusAttempt[];
}> => {
  if (!initial.jobId) {
    throw new Error("Async seal upload must return a jobId before CID verification.");
  }

  const uploadStatusUrl = sealJobStatusUrl(initial.statusUrl, initial.jobId);
  const uploadStatusLog: SealUploadStatusAttempt[] = [];
  const fields = (): SealUploadJobFields => ({
    backendJobId: initial.jobId,
    uploadStatusUrl,
    uploadStatusPolls: uploadStatusLog.length,
    uploadStatusLog,
  });
  const terminalFailureStatuses = new Set(["failed", "error", "cancelled", "canceled", "rejected"]);
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const checkedAt = new Date().toISOString();
    const res = await fetch(uploadStatusUrl, { headers: sealApiHeaders() }).catch((error) => {
      uploadStatusLog.push({
        attempt,
        checkedAt,
        status: "error",
        detail: (error as Error).message,
        jobId: initial.jobId,
      });
      return undefined;
    });
    if (res?.ok) {
      const payload = (await res.json()) as SealUploadResponse;
      const status = String(payload.status ?? "running");
      const proof = proofFromSealUpload(payload, payloadHash, byteLength);
      if (!proof.cid && terminalFailureStatuses.has(status.toLowerCase())) {
        const detail = payload.error ?? `Seal job ${status}.`;
        uploadStatusLog.push({
          attempt,
          checkedAt,
          status: "failed",
          httpStatus: res.status,
          detail,
          jobId: initial.jobId,
          payloadHash: proof.payloadHash,
          byteLength: proof.byteLength,
        });
        throw new SealUploadJobError(detail, fields());
      }
      uploadStatusLog.push({
        attempt,
        checkedAt: payload.proof?.uploadedAt ?? checkedAt,
        status: proof.cid ? "verified" : status === "queued" ? "queued" : "running",
        httpStatus: res.status,
        detail: proof.cid ? `Seal job returned CID ${proof.cid}.` : `Seal job ${status}.`,
        jobId: initial.jobId,
        cid: proof.cid,
        payloadHash: proof.payloadHash,
        byteLength: proof.byteLength,
      });
      if (proof.cid) {
        return {
          proof,
          backendJobId: initial.jobId,
          uploadStatusUrl,
          uploadStatusPolls: attempt,
          uploadStatusLog,
        };
      }
    } else if (res) {
      const payload = (await res.json().catch(() => ({}))) as SealUploadResponse;
      const detail = payload.error ?? `Seal job status returned ${res.status}.`;
      uploadStatusLog.push({
        attempt,
        checkedAt,
        status: res.status >= 500 ? "failed" : "error",
        httpStatus: res.status,
        detail,
        jobId: initial.jobId,
      });
      if (res.status >= 400) {
        throw new SealUploadJobError(detail, fields());
      }
    }
    await wait(450);
  }
  throw new SealUploadJobError(`Seal job ${initial.jobId} did not return a CID before polling timed out.`, fields());
};

const uploadJobFields = (
  result: Awaited<ReturnType<typeof pollSealUploadJob>>,
): Pick<SealJob, "backendJobId" | "uploadStatusUrl" | "uploadStatusPolls" | "uploadStatusLog"> => ({
  backendJobId: result.backendJobId,
  uploadStatusUrl: result.uploadStatusUrl,
  uploadStatusPolls: result.uploadStatusPolls,
  uploadStatusLog: result.uploadStatusLog,
});

const mergeUploadJobFields = (
  job: SealJob | undefined,
  result: Awaited<ReturnType<typeof pollSealUploadJob>>,
): SealUploadJobFields => {
  const next = uploadJobFields(result);
  return {
    ...next,
    uploadStatusPolls: (job?.uploadStatusPolls ?? 0) + (next.uploadStatusPolls ?? 0),
    uploadStatusLog: [...(job?.uploadStatusLog ?? []), ...(next.uploadStatusLog ?? [])],
  };
};

const uploadJobFieldsFromResumedJob = (job: SealJob): SealUploadJobFields => ({
  backendJobId: job.backendJobId,
  uploadStatusUrl: job.uploadStatusUrl,
  uploadStatusPolls: job.uploadStatusPolls ?? 0,
  uploadStatusLog: job.uploadStatusLog ?? [],
});

const resumeCanSkipUploadStatus = (job: SealJob) => {
  const nextAction = buildFilecoinSealResumeReadiness(job, sealEndpoint()).nextAction;
  return nextAction === "poll-verification-status" || nextAction === "read-proof-registry";
};

export const canResumeFilecoinSealJob = (job: SealJob | undefined, endpoint = sealEndpoint()) =>
  buildFilecoinSealResumeReadiness(job, endpoint).canResume;

export const buildFilecoinSealResumeQueue = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
): FilecoinSealResumeQueueItem[] => {
  const recordItems = records
    .filter((record) => canResumeFilecoinSealJob(record.sealJob))
    .map((record) => {
      const readiness = buildFilecoinSealResumeReadiness(record.sealJob, sealEndpoint());
      return {
        kind: "record" as const,
        artifactId: record.capsule.id,
        backendJobId: record.sealJob!.backendJobId!,
        status: record.sealJob!.status,
        uploadStatusUrl: record.sealJob!.uploadStatusUrl,
        canResume: readiness.canResume,
        risk: readiness.risk,
        nextAction: readiness.nextAction,
        nextActionDetail: readiness.nextActionDetail,
        blockers: readiness.blockers,
        evidence: readiness.evidence,
        uploadStatusPolls: record.sealJob!.uploadStatusPolls ?? 0,
        verificationPolls: record.sealJob!.pollAttempts ?? 0,
        lastCheckedAt: record.sealJob!.lastCheckedAt ?? record.sealJob!.uploadStatusLog?.at(-1)?.checkedAt,
      };
    });
  const modeItems = modeRuns
    .filter((run) => canResumeFilecoinSealJob(run.sealJob))
    .map((run) => {
      const readiness = buildFilecoinSealResumeReadiness(run.sealJob, sealEndpoint());
      return {
        kind: "mode" as const,
        artifactId: run.id,
        backendJobId: run.sealJob!.backendJobId!,
        status: run.sealJob!.status,
        uploadStatusUrl: run.sealJob!.uploadStatusUrl,
        canResume: readiness.canResume,
        risk: readiness.risk,
        nextAction: readiness.nextAction,
        nextActionDetail: readiness.nextActionDetail,
        blockers: readiness.blockers,
        evidence: readiness.evidence,
        uploadStatusPolls: run.sealJob!.uploadStatusPolls ?? 0,
        verificationPolls: run.sealJob!.pollAttempts ?? 0,
        lastCheckedAt: run.sealJob!.lastCheckedAt ?? run.sealJob!.uploadStatusLog?.at(-1)?.checkedAt,
      };
    });
  return [...recordItems, ...modeItems];
};

const readProofRegistry = async (
  proof: FilecoinProof,
  expectedPayloadHash: string,
  expectedByteLength: number,
): Promise<{ proof: FilecoinProof; checkedAt: string; hash: string; byteLength: number }> => {
  const proofUrl = sealApiUrl("proof", proof.cid);
  if (!proofUrl) throw new Error("Proof registry URL is unavailable.");
  const res = await fetch(proofUrl, { headers: sealApiHeaders() }).catch(() => undefined);
  if (!res?.ok) {
    throw new Error(`Proof registry returned ${res?.status ?? "no response"}.`);
  }
  const payload = (await res.json()) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string; storedAt?: string };
  if (payload.cid && payload.cid !== proof.cid) {
    throw new Error("Proof registry CID did not match the sealed proof.");
  }
  if (payload.payloadHash && payload.payloadHash !== expectedPayloadHash) {
    throw new Error("Proof registry payload hash did not match the uploaded capsule payload.");
  }
  if (payload.byteLength && payload.byteLength !== expectedByteLength) {
    throw new Error("Proof registry byte length did not match the uploaded capsule payload.");
  }
  const registryProof = normalizeLookupProof(proof.cid, { ...proof, ...payload });
  const metadataProblem = proofMetadataProblemMessage(registryProof, {
    cid: proof.cid,
    expectedPayloadHash,
    expectedByteLength,
    label: "Proof registry metadata",
  });
  if (metadataProblem) {
    throw new Error(`Proof registry metadata is not production-ready: ${metadataProblem}`);
  }
  return {
    proof: registryProof,
    checkedAt: payload.checkedAt ?? new Date().toISOString(),
    hash: payload.payloadHash ?? expectedPayloadHash,
    byteLength: Number(payload.byteLength ?? expectedByteLength),
  };
};

export const createSealJob = (artifact: Pick<PredictionCapsule, "id">): SealJob => ({
  id: `seal-${artifact.id}-${Date.now()}`,
  capsuleId: artifact.id,
  status: sealEndpoint() ? "queued" : "needs-config",
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  endpoint: sealEndpoint(),
  healthStatus: sealEndpoint() ? "unchecked" : "failed",
  steps: sealEndpoint()
    ? mark(baseSteps(), ["payload"], "passed", "Capsule payload is deterministic and ready to upload.")
    : mark(
        mark(baseSteps(), ["payload"], "passed", "Capsule payload is deterministic and ready to upload."),
        ["health", "upload", "deal", "poll", "registry", "verify"],
        "needs-config",
        "Set VITE_FILECOIN_SEAL_API to a trusted backend endpoint.",
      ),
});

const proofFromUploadResult = (
  proof: Partial<FilecoinProof>,
  fallback: FilecoinProof,
  uploadPayloadHash: string,
  uploadByteLength: number,
): FilecoinProof => ({
  mode: "real",
  cid: String(proof.cid ?? fallback.cid),
  pieceCid: String(proof.pieceCid ?? proof.cid ?? fallback.pieceCid),
  provider: String(proof.provider ?? "seal-api-provider"),
  dataSetId: String(proof.dataSetId ?? "seal-api-dataset"),
  proofStatus: (proof.proofStatus as FilecoinProof["proofStatus"]) ?? "verified",
  uploadedAt: new Date().toISOString(),
  retrievalUrl: proof.retrievalUrl,
  payloadHash: proof.payloadHash ?? uploadPayloadHash,
  byteLength: proof.byteLength ?? uploadByteLength,
});

const completeSealJobVerification = async (
  job: SealJob,
  realProof: FilecoinProof,
  uploadPayloadHash: string,
  uploadByteLength: number,
  uploadFields: SealUploadJobFields,
  verifiedDetail: string,
): Promise<{ proof?: FilecoinProof; sealJob: SealJob }> => {
  const pollResult = await pollProofStatus(realProof, uploadPayloadHash, uploadByteLength);
  const verifyUrl = sealApiUrl("verify", pollResult.proof.cid);
  const proofUrl = sealApiUrl("proof", pollResult.proof.cid);
  if (pollResult.error) {
    return {
      sealJob: {
        ...job,
        proof: pollResult.proof,
        proofUrl,
        verifyUrl,
        uploadPayloadHash,
        uploadByteLength,
        ...uploadFields,
        status: "failed",
        pollAttempts: pollResult.attempts,
        pollLog: pollResult.pollLog,
        lastCheckedAt: pollResult.checkedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: pollResult.error,
        steps: mark(job.steps, ["poll"], "failed", pollResult.error),
      },
    };
  }
  let registryResult: Awaited<ReturnType<typeof readProofRegistry>>;
  try {
    registryResult = await readProofRegistry(pollResult.proof, uploadPayloadHash, uploadByteLength);
  } catch (error) {
    return {
      sealJob: {
        ...job,
        proof: pollResult.proof,
        proofUrl,
        verifyUrl,
        uploadPayloadHash,
        uploadByteLength,
        ...uploadFields,
        status: "failed",
        pollAttempts: pollResult.attempts,
        pollLog: pollResult.pollLog,
        lastCheckedAt: pollResult.checkedAt ?? new Date().toISOString(),
        proofRegistryStatus: "failed",
        proofRegistryCheckedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: (error as Error).message,
        steps: mark(
          mark(job.steps, ["poll"], "passed", `CID ${pollResult.proof.cid} is retrievable.`),
          ["registry"],
          "failed",
          (error as Error).message,
        ),
      },
    };
  }
  const verifiedProof = registryResult.proof;
  const verified = verifiedProof.proofStatus === "verified";
  return {
    proof: verifiedProof,
    sealJob: {
      ...job,
      status: verified ? "verified" : "running",
      proof: verifiedProof,
      proofUrl,
      verifyUrl,
      uploadPayloadHash,
      uploadByteLength,
      ...uploadFields,
      pollAttempts: pollResult.attempts,
      pollLog: pollResult.pollLog,
      lastCheckedAt: pollResult.checkedAt ?? registryResult.checkedAt,
      proofRegistryStatus: "verified",
      proofRegistryCheckedAt: registryResult.checkedAt,
      proofRegistryHash: registryResult.hash,
      proofRegistryByteLength: registryResult.byteLength,
      updatedAt: new Date().toISOString(),
      error: undefined,
      steps: verified
        ? mark(
            mark(
              mark(job.steps, ["poll"], "passed", `CID ${verifiedProof.cid} is retrievable.`),
              ["registry"],
              "passed",
              `Proof registry read back ${registryResult.hash.slice(0, 12)}... for ${verifiedProof.cid}.`,
            ),
            ["verify"],
            "passed",
            verifiedDetail,
          )
        : mark(
            mark(
              mark(job.steps, ["poll"], "passed", "CID is retrievable but final verification is still pending."),
              ["registry"],
              "passed",
              `Proof registry read back ${registryResult.hash.slice(0, 12)}... for ${verifiedProof.cid}.`,
            ),
            ["verify"],
            "running",
            "Run Auto seal again to re-check final verification.",
          ),
    },
  };
};

export const runSealJob = async (record: MemoryRecord): Promise<MemoryRecord> => {
  const capsule = record.capsule;
  let job = createSealJob(capsule);
  if (!sealEndpoint()) return { ...record, sealJob: job };

  if (canResumeFilecoinSealJob(record.sealJob)) {
    const resumedJob = record.sealJob as SealJob;
    job = {
      ...resumedJob,
      endpoint: resumedJob.endpoint ?? sealEndpoint(),
      status: "running",
      updatedAt: new Date().toISOString(),
      error: undefined,
      steps: mark(
        mark(resumedJob.steps.length > 0 ? resumedJob.steps : baseSteps(), ["payload", "health"], "passed"),
        ["upload"],
        "running",
        `Resuming backend seal job ${resumedJob.backendJobId}.`,
      ),
    };
    if (resumeCanSkipUploadStatus(resumedJob)) {
      const uploadFields = uploadJobFieldsFromResumedJob(resumedJob);
      const proof = resumedJob.proof;
      if (!proof?.cid) {
        return failJob(record, { ...job, ...uploadFields }, "deal", "Saved seal job is missing its CID.");
      }
      const completion = await completeSealJobVerification(
        {
          ...job,
          ...uploadFields,
          steps: mark(
            mark(
              job.steps,
              ["upload", "deal"],
              "passed",
              `Saved seal job ${resumedJob.backendJobId} already returned provider proof metadata.`,
            ),
            ["poll"],
            "running",
            `Resuming CID ${proof.cid} verification polling.`,
          ),
        },
        proofFromUploadResult(proof, capsule.filecoinProof, resumedJob.uploadPayloadHash as string, resumedJob.uploadByteLength as number),
        resumedJob.uploadPayloadHash as string,
        resumedJob.uploadByteLength as number,
        uploadFields,
        "CID is verified by the configured seal API.",
      );
      return {
        ...record,
        capsule: completion.proof ? { ...capsule, filecoinProof: completion.proof } : capsule,
        sealJob: completion.sealJob,
      };
    }
    let uploadResult: Awaited<ReturnType<typeof pollSealUploadJob>>;
    try {
      uploadResult = await pollSealUploadJob(
        { jobId: resumedJob.backendJobId, statusUrl: resumedJob.uploadStatusUrl },
        resumedJob.uploadPayloadHash as string,
        resumedJob.uploadByteLength as number,
      );
    } catch (error) {
      return failJob(
        record,
        {
          ...job,
          uploadPayloadHash: resumedJob.uploadPayloadHash,
          uploadByteLength: resumedJob.uploadByteLength,
          ...(error as SealUploadJobError).fields,
        },
        "upload",
        (error as Error).message,
      );
    }
    const uploadFields = mergeUploadJobFields(resumedJob, uploadResult);
    const proof = uploadResult.proof;
    if (!proof.cid) {
      return failJob(record, { ...job, ...uploadFields }, "deal", "Seal API did not return a CID.");
    }
    if (proof.payloadHash && proof.payloadHash !== resumedJob.uploadPayloadHash) {
      return failJob(record, { ...job, ...uploadFields }, "deal", "Seal API payload hash did not match the uploaded capsule payload.");
    }
    const completion = await completeSealJobVerification(
      {
        ...job,
        ...uploadFields,
        steps: mark(
          mark(job.steps, ["upload", "deal"], "passed", `Resumed seal job ${uploadResult.backendJobId} and received provider proof metadata.`),
          ["poll"],
          "running",
          `Polling CID ${proof.cid} for retrievability.`,
        ),
      },
      proofFromUploadResult(proof, capsule.filecoinProof, resumedJob.uploadPayloadHash as string, resumedJob.uploadByteLength as number),
      resumedJob.uploadPayloadHash as string,
      resumedJob.uploadByteLength as number,
      uploadFields,
      "CID is verified by the configured seal API.",
    );
    return {
      ...record,
      capsule: completion.proof ? { ...capsule, filecoinProof: completion.proof } : capsule,
      sealJob: completion.sealJob,
    };
  }

  job = {
    ...job,
    status: "running",
    updatedAt: new Date().toISOString(),
    steps: mark(job.steps, ["health"], "running", "Checking the configured seal API before upload."),
  };

  const healthUrl = sealApiUrl("health");
  const sealUrl = sealUploadUrl();
  const healthRes = await fetch(healthUrl).catch(() => undefined);
  if (!healthRes?.ok) {
    return failJob(record, job, "health", `Seal API health check failed${healthRes ? ` with ${healthRes.status}` : ""}.`);
  }
  const backendHealth = (await healthRes.json().catch(() => ({ ok: true }))) as SealBackendHealth;
  const backendMode = backendHealth.mockMode
    ? "mock seal API"
    : backendHealth.hasPrivateKey
      ? "real Synapse seal API"
      : "seal API missing SYNAPSE_PRIVATE_KEY";
  const productionDetail = sealBackendProductionReady(backendHealth)
    ? "production-ready"
    : `production blockers: ${backendHealth.blockers?.join(", ") || "health response did not declare production readiness"}`;
  const healthDetail = `${backendMode}; ${backendHealth.persistence ?? "unknown"} proof registry; ${
    backendHealth.authRequired ? "token required" : "token not required"
  }; ${productionDetail}.`;

  job = {
    ...job,
    healthStatus: "ready",
    backendHealth,
    updatedAt: new Date().toISOString(),
    steps: mark(
      mark(job.steps, ["health"], "passed", healthDetail),
      ["upload"],
      "running",
      "Uploading capsule payload to the configured seal API.",
    ),
  };

  const uploadPayload = stableJson({ capsule, result: record.result ?? null });
  const uploadPayloadHash = await sha256(uploadPayload);
  const uploadByteLength = new TextEncoder().encode(uploadPayload).byteLength;

  const res = await fetch(sealUrl, {
    method: "POST",
    headers: sealApiHeaders({ "Content-Type": "application/json" }),
    body: uploadPayload,
  }).catch(() => undefined);
  if (!res?.ok) {
    return failJob(record, job, "upload", `Seal API returned ${res?.status ?? "no response"}.`);
  }

  let uploadResult: Awaited<ReturnType<typeof pollSealUploadJob>>;
  try {
    uploadResult = await pollSealUploadJob((await res.json()) as SealUploadResponse, uploadPayloadHash, uploadByteLength);
  } catch (error) {
    return failJob(
      record,
      { ...job, uploadPayloadHash, uploadByteLength, ...(error as SealUploadJobError).fields },
      "upload",
      (error as Error).message,
    );
  }
  const uploadFields = mergeUploadJobFields(undefined, uploadResult);
  const proof = uploadResult.proof;
  if (!proof.cid) {
    return failJob(record, { ...job, ...uploadFields }, "deal", "Seal API did not return a CID.");
  }
  if (proof.payloadHash && proof.payloadHash !== uploadPayloadHash) {
    return failJob(record, { ...job, ...uploadFields }, "deal", "Seal API payload hash did not match the uploaded capsule payload.");
  }
  const realProof = proofFromUploadResult(proof, capsule.filecoinProof, uploadPayloadHash, uploadByteLength);
  job = {
    ...job,
    ...uploadFields,
    steps: mark(
      mark(job.steps, ["upload", "deal"], "passed", uploadResult.backendJobId ? `Seal job ${uploadResult.backendJobId} returned provider proof metadata.` : "Seal API accepted the upload and returned provider proof metadata."),
      ["poll"],
      "running",
      `Polling CID ${realProof.cid} for retrievability.`,
    ),
  };
  const completion = await completeSealJobVerification(
    job,
    realProof,
    uploadPayloadHash,
    uploadByteLength,
    uploadFields,
    "CID is verified by the configured seal API.",
  );

  return {
    ...record,
    capsule: completion.proof ? { ...capsule, filecoinProof: completion.proof } : capsule,
    sealJob: completion.sealJob,
  };
};

export const runModeSealJob = async (run: GameModeRun): Promise<GameModeRun> => {
  let job = createSealJob(run);
  if (!sealEndpoint()) return { ...run, sealJob: job };

  if (canResumeFilecoinSealJob(run.sealJob)) {
    const resumedJob = run.sealJob as SealJob;
    job = {
      ...resumedJob,
      endpoint: resumedJob.endpoint ?? sealEndpoint(),
      status: "running",
      updatedAt: new Date().toISOString(),
      error: undefined,
      steps: mark(
        mark(resumedJob.steps.length > 0 ? resumedJob.steps : baseSteps(), ["payload", "health"], "passed"),
        ["upload"],
        "running",
        `Resuming backend seal job ${resumedJob.backendJobId}.`,
      ),
    };
    if (resumeCanSkipUploadStatus(resumedJob)) {
      const uploadFields = uploadJobFieldsFromResumedJob(resumedJob);
      const proof = resumedJob.proof;
      if (!proof?.cid) {
        return failModeJob(run, { ...job, ...uploadFields }, "deal", "Saved mode seal job is missing its CID.");
      }
      const completion = await completeSealJobVerification(
        {
          ...job,
          ...uploadFields,
          steps: mark(
            mark(
              job.steps,
              ["upload", "deal"],
              "passed",
              `Saved seal job ${resumedJob.backendJobId} already returned mode proof metadata.`,
            ),
            ["poll"],
            "running",
            `Resuming mode CID ${proof.cid} verification polling.`,
          ),
        },
        proofFromUploadResult(proof, run.filecoinProof, resumedJob.uploadPayloadHash as string, resumedJob.uploadByteLength as number),
        resumedJob.uploadPayloadHash as string,
        resumedJob.uploadByteLength as number,
        uploadFields,
        "Mode proof CID is verified by the configured seal API.",
      );
      return {
        ...run,
        filecoinProof: completion.proof ?? run.filecoinProof,
        sealJob: completion.sealJob,
      };
    }
    let uploadResult: Awaited<ReturnType<typeof pollSealUploadJob>>;
    try {
      uploadResult = await pollSealUploadJob(
        { jobId: resumedJob.backendJobId, statusUrl: resumedJob.uploadStatusUrl },
        resumedJob.uploadPayloadHash as string,
        resumedJob.uploadByteLength as number,
      );
    } catch (error) {
      return failModeJob(
        run,
        {
          ...job,
          uploadPayloadHash: resumedJob.uploadPayloadHash,
          uploadByteLength: resumedJob.uploadByteLength,
          ...(error as SealUploadJobError).fields,
        },
        "upload",
        (error as Error).message,
      );
    }
    const uploadFields = mergeUploadJobFields(resumedJob, uploadResult);
    const proof = uploadResult.proof;
    if (!proof.cid) {
      return failModeJob(run, { ...job, ...uploadFields }, "deal", "Seal API did not return a CID.");
    }
    if (proof.payloadHash && proof.payloadHash !== resumedJob.uploadPayloadHash) {
      return failModeJob(run, { ...job, ...uploadFields }, "deal", "Seal API payload hash did not match the uploaded mode proof payload.");
    }
    const completion = await completeSealJobVerification(
      {
        ...job,
        ...uploadFields,
        steps: mark(
          mark(job.steps, ["upload", "deal"], "passed", `Resumed seal job ${uploadResult.backendJobId} and received mode proof metadata.`),
          ["poll"],
          "running",
          `Polling CID ${proof.cid} for retrievability.`,
        ),
      },
      proofFromUploadResult(proof, run.filecoinProof, resumedJob.uploadPayloadHash as string, resumedJob.uploadByteLength as number),
      resumedJob.uploadPayloadHash as string,
      resumedJob.uploadByteLength as number,
      uploadFields,
      "Mode proof CID is verified by the configured seal API.",
    );
    return {
      ...run,
      filecoinProof: completion.proof ?? run.filecoinProof,
      sealJob: completion.sealJob,
    };
  }

  job = {
    ...job,
    status: "running",
    updatedAt: new Date().toISOString(),
    steps: mark(job.steps, ["health"], "running", "Checking the configured seal API before uploading the mode proof."),
  };

  const healthUrl = sealApiUrl("health");
  const sealUrl = sealUploadUrl();
  const healthRes = await fetch(healthUrl).catch(() => undefined);
  if (!healthRes?.ok) {
    return failModeJob(run, job, "health", `Seal API health check failed${healthRes ? ` with ${healthRes.status}` : ""}.`);
  }
  const backendHealth = (await healthRes.json().catch(() => ({ ok: true }))) as SealBackendHealth;
  const backendMode = backendHealth.mockMode
    ? "mock seal API"
    : backendHealth.hasPrivateKey
      ? "real Synapse seal API"
      : "seal API missing SYNAPSE_PRIVATE_KEY";
  const productionDetail = sealBackendProductionReady(backendHealth)
    ? "production-ready"
    : `production blockers: ${backendHealth.blockers?.join(", ") || "health response did not declare production readiness"}`;
  const healthDetail = `${backendMode}; ${backendHealth.persistence ?? "unknown"} proof registry; ${
    backendHealth.authRequired ? "token required" : "token not required"
  }; ${productionDetail}.`;

  job = {
    ...job,
    healthStatus: "ready",
    backendHealth,
    updatedAt: new Date().toISOString(),
    steps: mark(
      mark(job.steps, ["health"], "passed", healthDetail),
      ["upload"],
      "running",
      "Uploading mode proof payload to the configured seal API.",
    ),
  };

  const { sealJob: _previousSealJob, ...modeRunPayload } = run;
  const uploadPayload = stableJson({ modeRun: modeRunPayload });
  const uploadPayloadHash = await sha256(uploadPayload);
  const uploadByteLength = new TextEncoder().encode(uploadPayload).byteLength;

  const res = await fetch(sealUrl, {
    method: "POST",
    headers: sealApiHeaders({ "Content-Type": "application/json" }),
    body: uploadPayload,
  }).catch(() => undefined);
  if (!res?.ok) {
    return failModeJob(run, job, "upload", `Seal API returned ${res?.status ?? "no response"}.`);
  }

  let uploadResult: Awaited<ReturnType<typeof pollSealUploadJob>>;
  try {
    uploadResult = await pollSealUploadJob((await res.json()) as SealUploadResponse, uploadPayloadHash, uploadByteLength);
  } catch (error) {
    return failModeJob(
      run,
      { ...job, uploadPayloadHash, uploadByteLength, ...(error as SealUploadJobError).fields },
      "upload",
      (error as Error).message,
    );
  }
  const uploadFields = mergeUploadJobFields(undefined, uploadResult);
  const proof = uploadResult.proof;
  if (!proof.cid) {
    return failModeJob(run, { ...job, ...uploadFields }, "deal", "Seal API did not return a CID.");
  }
  if (proof.payloadHash && proof.payloadHash !== uploadPayloadHash) {
    return failModeJob(run, { ...job, ...uploadFields }, "deal", "Seal API payload hash did not match the uploaded mode proof payload.");
  }
  const realProof = proofFromUploadResult(proof, run.filecoinProof, uploadPayloadHash, uploadByteLength);
  job = {
    ...job,
    ...uploadFields,
    steps: mark(
      mark(job.steps, ["upload", "deal"], "passed", uploadResult.backendJobId ? `Seal job ${uploadResult.backendJobId} returned mode proof metadata.` : "Seal API accepted the mode proof and returned provider proof metadata."),
      ["poll"],
      "running",
      `Polling CID ${realProof.cid} for retrievability.`,
    ),
  };
  const completion = await completeSealJobVerification(
    job,
    realProof,
    uploadPayloadHash,
    uploadByteLength,
    uploadFields,
    "Mode proof CID is verified by the configured seal API.",
  );

  return {
    ...run,
    filecoinProof: completion.proof ?? run.filecoinProof,
    sealJob: completion.sealJob,
  };
};

export const filecoinSealConfigured = () => Boolean(sealEndpoint());
