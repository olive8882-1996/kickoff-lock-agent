import type { SealJob } from "./types";

export type FilecoinSealResumeRisk = "ready" | "needs-config" | "metadata-missing" | "already-complete";
export type FilecoinSealResumeNextAction =
  | "configure-seal-endpoint"
  | "restore-upload-metadata"
  | "poll-upload-status"
  | "poll-verification-status"
  | "read-proof-registry"
  | "complete";

export type FilecoinSealResumeReadiness = {
  canResume: boolean;
  risk: FilecoinSealResumeRisk;
  nextAction: FilecoinSealResumeNextAction;
  nextActionDetail: string;
  blockers: string[];
  evidence: string[];
};

export const latestUploadStatusVerified = (job?: SealJob) => {
  const latest = job?.uploadStatusLog?.at(-1);
  return Boolean(
    latest &&
      latest.status === "verified" &&
      latest.cid &&
      job?.proof?.cid &&
      latest.cid === job.proof.cid &&
      (!job.uploadPayloadHash || latest.payloadHash === job.uploadPayloadHash) &&
      (!job.uploadByteLength || latest.byteLength === job.uploadByteLength),
  );
};

export const hasUploadStatusProgression = (job?: SealJob) => {
  const log = job?.uploadStatusLog ?? [];
  const latest = log.at(-1);
  return Boolean(
    log.length >= 2 &&
      latestUploadStatusVerified(job) &&
      log.slice(0, -1).some((attempt) => attempt.status === "queued" || attempt.status === "running"),
  );
};

export const latestVerificationPollVerified = (job?: SealJob) => {
  const latest = job?.pollLog?.at(-1);
  return Boolean(
    latest &&
      latest.status === "verified" &&
      latest.proofStatus === "verified" &&
      (!job?.proof?.cid || latest.cid === job.proof.cid) &&
      (!job?.uploadPayloadHash || latest.payloadHash === job.uploadPayloadHash) &&
      (!job?.uploadByteLength || Number(latest.byteLength) === Number(job.uploadByteLength)),
  );
};

export const hasVerificationPollProgression = (job?: SealJob) => {
  const log = job?.pollLog ?? [];
  const latest = log.at(-1);
  return Boolean(
    log.length >= 2 &&
      latest &&
      latestVerificationPollVerified(job) &&
      log.slice(0, -1).some((attempt) => attempt.status === "pending" || attempt.status === "retrievable"),
  );
};

const uniqueProblems = (problems: string[]) => [...new Set(problems.filter(Boolean))];

const deployedHttpsUrlProblem = (urlText: string | undefined, label: string) => {
  if (!urlText) return `${label} is missing`;
  try {
    const url = new URL(urlText);
    const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
    if (url.protocol !== "https:") return `${label} must use deployed HTTPS`;
    if (localHosts.has(url.hostname) || url.hostname.endsWith(".localhost")) return `${label} must not target localhost`;
    return "";
  } catch {
    return `${label} is not a valid URL`;
  }
};

export const filecoinSealStatusUrlProblem = (job?: SealJob) => {
  if (!job) return "seal job is missing";
  if (!job.uploadStatusUrl) return "upload status URL is missing";
  if (!job.backendJobId) return "backend job id is missing";
  const httpsProblem = deployedHttpsUrlProblem(job.uploadStatusUrl, "upload status URL");
  if (httpsProblem) return httpsProblem;
  try {
    const statusUrl = new URL(job.uploadStatusUrl);
    if (job.endpoint) {
      const endpointUrl = new URL(job.endpoint);
      if (statusUrl.origin !== endpointUrl.origin) return "upload status URL must use the same seal API origin";
    }
    const parts = statusUrl.pathname.split("/").filter(Boolean);
    const last = parts.at(-1) ? decodeURIComponent(parts.at(-1)!) : "";
    if (!parts.includes("jobs") || last !== job.backendJobId) {
      return "upload status URL must target /jobs/:backendJobId";
    }
    return "";
  } catch {
    return "upload status URL is not a valid URL";
  }
};

const cidUrlProblem = (
  job: SealJob | undefined,
  urlText: string | undefined,
  label: string,
  pathSegment: "proof" | "verify",
) => {
  if (!job) return "seal job is missing";
  const cid = job.proof?.cid;
  if (!cid) return "proof CID is missing";
  if (!urlText) return `${label} is missing`;
  const httpsProblem = deployedHttpsUrlProblem(urlText, label);
  if (httpsProblem) return httpsProblem;
  try {
    const url = new URL(urlText);
    if (job.endpoint) {
      const endpointUrl = new URL(job.endpoint);
      if (url.origin !== endpointUrl.origin) return `${label} must use the same seal API origin`;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts.includes(pathSegment)) return `${label} must target /${pathSegment}${pathSegment === "proof" ? "/:cid" : "?cid=:cid"}`;
    if (pathSegment === "proof") {
      const last = parts.at(-1) ? decodeURIComponent(parts.at(-1)!) : "";
      return last === cid ? "" : "proof registry URL must reference the attached CID";
    }
    return url.searchParams.get("cid") === cid ? "" : "verification URL must reference the attached CID";
  } catch {
    return `${label} is not a valid URL`;
  }
};

export const filecoinSealProofUrlProblem = (job?: SealJob) =>
  cidUrlProblem(job, job?.proofUrl, "proof registry URL", "proof");

export const filecoinSealVerifyUrlProblem = (job?: SealJob) =>
  cidUrlProblem(job, job?.verifyUrl, "verification URL", "verify");

const staleUploadEvidenceProblems = (job?: SealJob) => {
  if (!job) return [];
  const proofCid = job.proof?.cid;
  return (job.uploadStatusLog ?? []).flatMap((entry) => [
    entry.jobId && job.backendJobId && entry.jobId !== job.backendJobId
      ? "upload status log contains a stale backend job id"
      : "",
    entry.cid && proofCid && entry.cid !== proofCid
      ? "upload status log contains a stale CID"
      : "",
    entry.payloadHash && job.uploadPayloadHash && entry.payloadHash !== job.uploadPayloadHash
      ? "upload status log contains a stale payload hash"
      : "",
    entry.byteLength && job.uploadByteLength && entry.byteLength !== job.uploadByteLength
      ? "upload status log contains a stale byte length"
      : "",
  ]).filter(Boolean);
};

const staleVerificationEvidenceProblems = (job?: SealJob) => {
  if (!job?.proof?.cid) return [];
  return (job.pollLog ?? []).flatMap((entry) => [
    entry.cid && entry.cid !== job.proof?.cid ? "verification poll log contains a stale CID" : "",
    entry.payloadHash && job.uploadPayloadHash && entry.payloadHash !== job.uploadPayloadHash
      ? "verification poll log contains a stale payload hash"
      : "",
    entry.byteLength && job.uploadByteLength && Number(entry.byteLength) !== Number(job.uploadByteLength)
      ? "verification poll log contains a stale byte length"
      : "",
  ]).filter(Boolean);
};

export const filecoinSealPollEvidenceProblems = (job?: SealJob) => {
  if (!job) return ["seal job is missing"];
  const latestPoll = job.pollLog?.at(-1);
  const latestPollVerified = latestPoll?.status === "verified" && latestPoll.proofStatus === "verified";
  const statusUrlProblem = filecoinSealStatusUrlProblem(job);
  const requireReadBackUrls = job.status === "verified" || job.proofRegistryStatus === "verified";
  const problems = [
    statusUrlProblem,
    ...staleUploadEvidenceProblems(job),
    ...staleVerificationEvidenceProblems(job),
    ...(requireReadBackUrls ? [filecoinSealProofUrlProblem(job), filecoinSealVerifyUrlProblem(job)] : []),
    ...(latestPollVerified && job.proof?.cid && latestPoll?.cid !== job.proof.cid
      ? ["latest verification poll CID is missing or does not match attached proof CID"]
      : []),
    ...(latestPollVerified && job.uploadPayloadHash && latestPoll?.payloadHash !== job.uploadPayloadHash
      ? ["latest verification poll payload hash is missing or does not match uploaded payload hash"]
      : []),
    ...(latestPollVerified && job.uploadByteLength && Number(latestPoll?.byteLength) !== Number(job.uploadByteLength)
      ? ["latest verification poll byte length is missing or does not match uploaded byte length"]
      : []),
    ...(job.backendJobId && latestUploadStatusVerified(job) && !hasUploadStatusProgression(job)
      ? ["seal upload status log must include queued or running progress before verified"]
      : []),
    ...(job.proof?.cid && latestVerificationPollVerified(job) && !hasVerificationPollProgression(job)
      ? ["verification polling must include pending or retrievable progress before verified"]
      : []),
  ];

  return uniqueProblems(problems);
};

const proofRegistryMatches = (job?: SealJob) =>
  Boolean(
    job?.proofRegistryStatus === "verified" &&
      !filecoinSealProofUrlProblem(job) &&
      !filecoinSealVerifyUrlProblem(job) &&
      job.proofRegistryHash &&
      job.uploadPayloadHash &&
      job.proofRegistryHash === job.uploadPayloadHash &&
      job.proofRegistryByteLength &&
      job.uploadByteLength &&
      Number(job.proofRegistryByteLength) === Number(job.uploadByteLength),
  );

const resumeNextAction = (
  job: SealJob | undefined,
  endpoint: string | undefined,
  blockers: string[],
): Pick<FilecoinSealResumeReadiness, "nextAction" | "nextActionDetail"> => {
  if (job?.status === "verified") {
    return {
      nextAction: "complete",
      nextActionDetail: "Seal job is already verified; no resume work is required.",
    };
  }
  if (!endpoint) {
    return {
      nextAction: "configure-seal-endpoint",
      nextActionDetail: "Configure VITE_FILECOIN_SEAL_API or the same-origin /seal proxy before resuming.",
    };
  }
  if (blockers.length > 0) {
    return {
      nextAction: "restore-upload-metadata",
      nextActionDetail: blockers[0] ?? "Restore backend job id, payload hash and byte length before resuming.",
    };
  }
  if (!latestUploadStatusVerified(job)) {
    return {
      nextAction: "poll-upload-status",
      nextActionDetail: `Poll the async upload status for backend job ${job?.backendJobId}.`,
    };
  }
  if (!latestVerificationPollVerified(job)) {
    return {
      nextAction: "poll-verification-status",
      nextActionDetail: `Poll CID ${job?.proof?.cid ?? "pending"} until the seal API reports verified retrievability.`,
    };
  }
  if (!proofRegistryMatches(job)) {
    return {
      nextAction: "read-proof-registry",
      nextActionDetail: `Read proof registry metadata for CID ${job?.proof?.cid ?? "pending"} and match payload hash plus byte length.`,
    };
  }
  return {
    nextAction: "complete",
    nextActionDetail: "Upload status, CID verification and proof registry evidence all match.",
  };
};

export const buildFilecoinSealResumeReadiness = (
  job: SealJob | undefined,
  endpoint: string | undefined,
): FilecoinSealResumeReadiness => {
  const latestUpload = job?.uploadStatusLog?.at(-1);
  const blockers = [
    ...(!endpoint ? ["Filecoin seal endpoint is not configured"] : []),
    ...(!job ? ["seal job is missing"] : []),
    ...(job?.status === "verified" ? ["seal job is already verified"] : []),
    ...(job?.backendJobId ? [] : ["backend job id is missing"]),
    ...(() => {
      const problem = filecoinSealStatusUrlProblem(job);
      return problem && problem !== "backend job id is missing" ? [problem] : [];
    })(),
    ...(job?.uploadPayloadHash ? [] : ["uploaded payload hash is missing"]),
    ...(job?.uploadByteLength && Number(job.uploadByteLength) > 0 ? [] : ["uploaded byte length is missing"]),
    ...(latestUpload?.cid && job?.proof?.cid && latestUpload.cid !== job.proof.cid
      ? ["latest upload status CID does not match attached proof CID"]
      : []),
    ...(job?.proof?.payloadHash && job.uploadPayloadHash && job.proof.payloadHash !== job.uploadPayloadHash
      ? ["attached proof payload hash does not match uploaded payload hash"]
      : []),
    ...filecoinSealPollEvidenceProblems(job),
  ];
  const evidence = [
    job?.backendJobId ? `backend job ${job.backendJobId}` : "backend job missing",
    job?.uploadStatusUrl && !filecoinSealStatusUrlProblem(job)
      ? "status URL targets backend job"
      : job?.uploadStatusUrl
        ? filecoinSealStatusUrlProblem(job)
        : job?.backendJobId
          ? "status URL derivable from /seal"
          : "status URL missing",
    job?.uploadPayloadHash ? "payload hash captured" : "payload hash missing",
    job?.uploadByteLength ? `${job.uploadByteLength} uploaded bytes` : "byte length missing",
    `${job?.uploadStatusPolls ?? 0} upload status poll${(job?.uploadStatusPolls ?? 0) === 1 ? "" : "s"}`,
    `${job?.pollAttempts ?? 0} verification poll${(job?.pollAttempts ?? 0) === 1 ? "" : "s"}`,
    job?.proofUrl && !filecoinSealProofUrlProblem(job)
      ? "proof URL targets CID"
      : job?.proofUrl
        ? filecoinSealProofUrlProblem(job)
        : "proof URL pending",
    job?.verifyUrl && !filecoinSealVerifyUrlProblem(job)
      ? "verification URL targets CID"
      : job?.verifyUrl
        ? filecoinSealVerifyUrlProblem(job)
        : "verification URL pending",
  ];
  const risk: FilecoinSealResumeRisk = blockers.length === 0
    ? "ready"
    : job?.status === "verified"
      ? "already-complete"
      : !endpoint
        ? "needs-config"
        : "metadata-missing";

  return {
    canResume: blockers.length === 0,
    risk,
    ...resumeNextAction(job, endpoint, blockers),
    blockers,
    evidence,
  };
};
