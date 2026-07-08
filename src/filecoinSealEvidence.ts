import type { SealJob, SealPollAttempt, SealStep, SealUploadStatusAttempt } from "./types";
import { sealBackendProductionReady } from "./filecoinSeal";
import { filecoinSealApiEndpointProblem } from "./filecoinSealApiReadiness";
import {
  filecoinSealPollEvidenceProblems,
  hasUploadStatusProgression,
  hasVerificationPollProgression,
  latestUploadStatusVerified,
  latestVerificationPollVerified,
} from "./filecoinSealJobChecks";

export type SealEvidencePacket = {
  jobId: string;
  capsuleId: string;
  status: SealJob["status"];
  productionReady: boolean;
  backendProductionReady: boolean;
  uploadStatusComplete: boolean;
  verificationPollingComplete: boolean;
  registryReadBackComplete: boolean;
  endpoint: string;
  cid?: string;
  payloadHash?: string;
  byteLength?: number;
  backendJobId?: string;
  uploadStatusPolls: number;
  uploadStatusLog: SealUploadStatusAttempt[];
  latestUploadStatus?: SealUploadStatusAttempt;
  pollAttempts: number;
  pollLog: SealPollAttempt[];
  latestPoll?: SealPollAttempt;
  registryStatus: SealJob["proofRegistryStatus"];
  registryHashMatch: boolean;
  registryByteLengthMatch: boolean;
  passedSteps: number;
  totalSteps: number;
  failedSteps: SealStep["id"][];
  pendingSteps: SealStep["id"][];
  blockers: string[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const openStepStatuses = new Set<SealStep["status"]>(["queued", "running", "needs-config"]);

export const buildSealEvidencePacket = (job: SealJob): SealEvidencePacket => {
  const passedSteps = job.steps.filter((step) => step.status === "passed").length;
  const failedSteps = job.steps.filter((step) => step.status === "failed").map((step) => step.id);
  const pendingSteps = job.steps.filter((step) => openStepStatuses.has(step.status)).map((step) => step.id);
  const backendProductionReady = sealBackendProductionReady(job.backendHealth);
  const uploadStatusLog = job.uploadStatusLog ?? [];
  const latestUploadStatus = uploadStatusLog.at(-1);
  const pollLog = job.pollLog ?? [];
  const latestPoll = pollLog.at(-1);
  const uploadStatusFinalVerified = latestUploadStatusVerified(job);
  const verificationPollingFinalVerified = latestVerificationPollVerified(job);
  const uploadStatusProgressionComplete = hasUploadStatusProgression(job);
  const verificationPollingProgressionComplete = hasVerificationPollProgression(job);
  const uploadStatusComplete = uploadStatusFinalVerified && uploadStatusProgressionComplete;
  const verificationPollingComplete = verificationPollingFinalVerified && verificationPollingProgressionComplete;
  const pollEvidenceProblems = filecoinSealPollEvidenceProblems(job);
  const endpointProblem = filecoinSealApiEndpointProblem(job.endpoint ?? "");
  const registryHashMatch =
    job.proofRegistryStatus === "verified" &&
    Boolean(job.proofRegistryHash && job.uploadPayloadHash && job.proofRegistryHash === job.uploadPayloadHash);
  const registryByteLengthMatch =
    job.proofRegistryStatus === "verified" &&
    Boolean(
      job.proofRegistryByteLength &&
        job.uploadByteLength &&
        Number(job.proofRegistryByteLength) === Number(job.uploadByteLength),
    );
  const registryReadBackComplete = registryHashMatch && registryByteLengthMatch;
  const blockers = [
    ...(endpointProblem ? [endpointProblem] : []),
    ...(job.healthStatus === "ready" ? [] : ["seal API health not ready"]),
    ...(backendProductionReady ? [] : job.backendHealth?.blockers?.length ? job.backendHealth.blockers : ["production seal backend not proven"]),
    ...(job.backendJobId && !job.uploadStatusPolls ? ["seal upload job status not polled"] : []),
    ...(job.backendJobId && !uploadStatusFinalVerified ? ["seal upload job did not finish with matching CID"] : []),
    ...pollEvidenceProblems,
    ...(job.proof?.cid ? [] : ["CID not returned"]),
    ...(job.uploadPayloadHash && job.proof?.payloadHash === job.uploadPayloadHash ? [] : ["payload hash not matched"]),
    ...(registryReadBackComplete ? [] : ["proof registry read-back not matched"]),
    ...(verificationPollingFinalVerified ? [] : ["verification polling did not reach verified"]),
    ...(job.status === "verified" ? [] : ["verification not complete"]),
  ];
  const productionReady = blockers.length === 0;
  const cid = job.proof?.cid;
  const summary = `${job.capsuleId} · ${job.status} · ${passedSteps}/${job.steps.length} steps · ${
    cid ?? "no CID"
  }`;
  const nextAction =
    blockers.length > 0
      ? blockers[0]
      : "Seal evidence is ready: CID, payload hash, polling and registry read-back all match.";
  const copyText = [
    "Kickoff Lock Agent Filecoin seal evidence",
    `Job: ${job.id}`,
    `Artifact: ${job.capsuleId}`,
    `Status: ${job.status}`,
    `Endpoint: ${job.endpoint ?? "missing"}`,
    job.backendJobId ? `Backend upload job: ${job.backendJobId}` : "",
    job.uploadStatusUrl ? `Upload status URL: ${job.uploadStatusUrl}` : "",
    `Upload status polls: ${job.uploadStatusPolls ?? 0}`,
    latestUploadStatus ? `Latest upload status: ${latestUploadStatus.status} ${latestUploadStatus.httpStatus ?? ""}`.trim() : "",
    `CID: ${cid ?? "missing"}`,
    `Payload hash: ${job.uploadPayloadHash ?? "missing"}`,
    `Byte length: ${job.uploadByteLength ?? job.proof?.byteLength ?? "missing"}`,
    `Poll attempts: ${job.pollAttempts ?? 0}`,
    latestPoll ? `Latest poll: ${latestPoll.status} ${latestPoll.proofStatus ?? "unknown"} ${latestPoll.httpStatus ?? ""}`.trim() : "",
    `Registry: ${job.proofRegistryStatus ?? "unchecked"} ${registryHashMatch ? "hash-match" : "hash-pending"} ${registryByteLengthMatch ? "bytes-match" : "bytes-pending"}`,
    `Production backend: ${backendProductionReady ? "ready" : "not proven"}`,
    `Upload status polling: ${uploadStatusComplete ? "complete" : "incomplete"}`,
    `Verification polling: ${verificationPollingComplete ? "complete" : "incomplete"}`,
    `Registry read-back: ${registryReadBackComplete ? "complete" : "incomplete"}`,
    `Next action: ${nextAction}`,
    job.proofUrl ? `Proof URL: ${job.proofUrl}` : "",
    job.verifyUrl ? `Verify URL: ${job.verifyUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    jobId: job.id,
    capsuleId: job.capsuleId,
    status: job.status,
    productionReady,
    backendProductionReady,
    uploadStatusComplete,
    verificationPollingComplete,
    registryReadBackComplete,
    endpoint: job.endpoint ?? "",
    cid,
    payloadHash: job.uploadPayloadHash ?? job.proof?.payloadHash,
    byteLength: job.uploadByteLength ?? job.proof?.byteLength,
    backendJobId: job.backendJobId,
    uploadStatusPolls: job.uploadStatusPolls ?? 0,
    uploadStatusLog,
    latestUploadStatus,
    pollAttempts: job.pollAttempts ?? 0,
    pollLog,
    latestPoll,
    registryStatus: job.proofRegistryStatus,
    registryHashMatch,
    registryByteLengthMatch,
    passedSteps,
    totalSteps: job.steps.length,
    failedSteps,
    pendingSteps,
    blockers,
    summary,
    nextAction,
    copyText,
  };
};
