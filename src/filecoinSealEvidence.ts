import type { SealJob, SealStep } from "./types";
import { sealBackendProductionReady } from "./filecoinSeal";

export type SealEvidencePacket = {
  jobId: string;
  capsuleId: string;
  status: SealJob["status"];
  productionReady: boolean;
  endpoint: string;
  cid?: string;
  payloadHash?: string;
  byteLength?: number;
  pollAttempts: number;
  registryStatus: SealJob["proofRegistryStatus"];
  registryHashMatch: boolean;
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
  const productionReady = sealBackendProductionReady(job.backendHealth);
  const registryHashMatch =
    job.proofRegistryStatus === "verified" &&
    Boolean(job.proofRegistryHash && job.uploadPayloadHash && job.proofRegistryHash === job.uploadPayloadHash);
  const blockers = [
    ...(job.endpoint ? [] : ["missing VITE_FILECOIN_SEAL_API"]),
    ...(job.healthStatus === "ready" ? [] : ["seal API health not ready"]),
    ...(productionReady ? [] : job.backendHealth?.blockers?.length ? job.backendHealth.blockers : ["production seal backend not proven"]),
    ...(job.proof?.cid ? [] : ["CID not returned"]),
    ...(job.uploadPayloadHash && job.proof?.payloadHash === job.uploadPayloadHash ? [] : ["payload hash not matched"]),
    ...(registryHashMatch ? [] : ["proof registry read-back not matched"]),
    ...(job.status === "verified" ? [] : ["verification not complete"]),
  ];
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
    `CID: ${cid ?? "missing"}`,
    `Payload hash: ${job.uploadPayloadHash ?? "missing"}`,
    `Byte length: ${job.uploadByteLength ?? job.proof?.byteLength ?? "missing"}`,
    `Poll attempts: ${job.pollAttempts ?? 0}`,
    `Registry: ${job.proofRegistryStatus ?? "unchecked"} ${registryHashMatch ? "hash-match" : "hash-pending"}`,
    `Production backend: ${productionReady ? "ready" : "not proven"}`,
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
    endpoint: job.endpoint ?? "",
    cid,
    payloadHash: job.uploadPayloadHash ?? job.proof?.payloadHash,
    byteLength: job.uploadByteLength ?? job.proof?.byteLength,
    pollAttempts: job.pollAttempts ?? 0,
    registryStatus: job.proofRegistryStatus,
    registryHashMatch,
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
