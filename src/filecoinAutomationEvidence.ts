import { sealBackendProductionReady } from "./filecoinSeal";
import { filecoinSealApiEndpointProblem } from "./filecoinSealApiReadiness";
import {
  filecoinSealProofUrlProblem,
  filecoinSealVerifyUrlProblem,
  hasUploadStatusProgression,
  hasVerificationPollProgression,
  latestUploadStatusVerified,
  latestVerificationPollVerified,
} from "./filecoinSealJobChecks";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import type { GameMode, GameModeRun, MemoryRecord, SealJob } from "./types";

export type FilecoinAutomationLane = {
  kind: "record" | "mode";
  laneId: string;
  modeId?: GameMode["id"];
  artifactId?: string;
  jobId?: string;
  backendJobId?: string;
  status: "verified" | "partial" | "missing";
  productionBackend: boolean;
  cid?: string;
  payloadHashMatch: boolean;
  registryHashMatch: boolean;
  registryByteLengthMatch: boolean;
  uploadStatusVerified: boolean;
  uploadStatusProgression: boolean;
  verificationPollVerified: boolean;
  verificationPollProgression: boolean;
  uploadStatusPolls: number;
  pollAttempts: number;
  proofUrl?: string;
  verifyUrl?: string;
  blockers: string[];
  summary: string;
};

export type FilecoinAutomationQueueItem = {
  kind: "record" | "mode";
  modeId?: GameMode["id"];
  artifactId?: string;
  runnable: boolean;
  reason: string;
};

export type FilecoinAutomationEvidencePacket = {
  ready: boolean;
  lanesReady: number;
  totalLanes: number;
  verifiedJobs: number;
  productionBackends: number;
  registryMatches: number;
  uploadStatusPolls: number;
  pollAttempts: number;
  lanes: FilecoinAutomationLane[];
  queue: FilecoinAutomationQueueItem[];
  runnableQueue: number;
  missingArtifacts: number;
  checks: Array<{
    key: string;
    label: string;
    passed: boolean;
    detail: string;
  }>;
  summary: string;
  nextAction: string;
  copyText: string;
};

const jobScore = (job?: SealJob) =>
  job
    ? (job.status === "verified" ? 16 : job.status === "running" ? 8 : 0) +
      (sealBackendProductionReady(job.backendHealth) ? 8 : 0) +
      (job.proofRegistryStatus === "verified" ? 4 : 0) +
      (job.proof?.mode === "real" ? 2 : 0) +
      (job.pollAttempts ?? 0) / 100
    : 0;

const payloadHashMatch = (job?: SealJob) =>
  Boolean(job?.uploadPayloadHash && job.proof?.payloadHash && job.uploadPayloadHash === job.proof.payloadHash);

const registryHashMatch = (job?: SealJob) =>
  Boolean(
    job?.proofRegistryStatus === "verified" &&
      job.proofRegistryHash &&
      job.uploadPayloadHash &&
      job.proofRegistryHash === job.uploadPayloadHash,
  );

const registryByteLengthMatch = (job?: SealJob) =>
  Boolean(
    job?.proofRegistryStatus === "verified" &&
      job.proofRegistryByteLength &&
      job.uploadByteLength &&
      Number(job.proofRegistryByteLength) === Number(job.uploadByteLength),
  );

const laneFor = (
  kind: FilecoinAutomationLane["kind"],
  artifactId: string | undefined,
  job: SealJob | undefined,
  modeId?: GameMode["id"],
): FilecoinAutomationLane => {
  if (!job) {
    return {
      kind,
      laneId: kind === "mode" ? `mode:${modeId ?? artifactId ?? "missing"}` : "record",
      modeId,
      artifactId,
      status: "missing",
      productionBackend: false,
      payloadHashMatch: false,
      registryHashMatch: false,
      registryByteLengthMatch: false,
      uploadStatusVerified: false,
      uploadStatusProgression: false,
      verificationPollVerified: false,
      verificationPollProgression: false,
      uploadStatusPolls: 0,
      pollAttempts: 0,
      blockers: [`missing ${kind} seal job`],
      summary: `${kind} proof has not run one-click Filecoin sealing yet.`,
    };
  }

  const productionBackend = sealBackendProductionReady(job.backendHealth);
  const endpointProblem = filecoinSealApiEndpointProblem(job.endpoint ?? "");
  const hashMatch = payloadHashMatch(job);
  const registryMatch = registryHashMatch(job);
  const registryByteMatch = registryByteLengthMatch(job);
  const uploadStatusVerified = latestUploadStatusVerified(job);
  const verificationPollVerified = latestVerificationPollVerified(job);
  const uploadProgression = hasUploadStatusProgression(job);
  const verificationProgression = hasVerificationPollProgression(job);
  const proofUrlProblem = job.proof?.cid ? filecoinSealProofUrlProblem(job) : "";
  const verifyUrlProblem = job.proof?.cid ? filecoinSealVerifyUrlProblem(job) : "";
  const blockers = [
    ...(endpointProblem ? [endpointProblem] : []),
    ...(job.status === "verified" ? [] : [`seal job ${job.status}`]),
    ...(job.proof?.mode === "real" && job.proof.cid ? [] : ["real CID missing"]),
    ...(proofUrlProblem ? [proofUrlProblem] : []),
    ...(verifyUrlProblem ? [verifyUrlProblem] : []),
    ...(job.backendJobId && job.uploadStatusPolls ? [] : ["upload job status polling missing"]),
    ...(job.backendJobId && uploadStatusVerified ? [] : ["upload job did not finish with matching CID"]),
    ...(job.backendJobId && uploadProgression ? [] : ["upload job status did not progress from running to verified"]),
    ...(job.pollAttempts ? [] : ["verification polling missing"]),
    ...(verificationPollVerified ? [] : ["verification polling did not reach verified"]),
    ...(verificationProgression ? [] : ["verification polling did not progress to verified"]),
    ...(hashMatch ? [] : ["payload hash mismatch"]),
    ...(registryMatch && registryByteMatch ? [] : ["proof registry read-back missing"]),
    ...(productionBackend ? [] : job.backendHealth?.blockers?.length ? job.backendHealth.blockers : ["production backend not proven"]),
  ];
  const status = blockers.length === 0 ? "verified" : job.status === "verified" || job.proof?.mode === "real" ? "partial" : "missing";
  return {
    kind,
    laneId: kind === "mode" ? `mode:${modeId ?? artifactId ?? job.id}` : "record",
    modeId,
    artifactId,
    jobId: job.id,
    backendJobId: job.backendJobId,
    status,
    productionBackend,
    cid: job.proof?.cid,
    payloadHashMatch: hashMatch,
    registryHashMatch: registryMatch,
    registryByteLengthMatch: registryByteMatch,
    uploadStatusVerified,
    uploadStatusProgression: uploadProgression,
    verificationPollVerified,
    verificationPollProgression: verificationProgression,
    uploadStatusPolls: job.uploadStatusPolls ?? 0,
    pollAttempts: job.pollAttempts ?? 0,
    proofUrl: job.proofUrl,
    verifyUrl: job.verifyUrl,
    blockers,
    summary: `${kind} ${artifactId ?? "artifact"} · ${job.status} · ${job.proof?.cid ?? "no CID"} · ${job.pollAttempts ?? 0} polls`,
  };
};

const bestRecordJob = (records: MemoryRecord[]) =>
  records
    .filter((record) => record.sealJob)
    .sort((a, b) => jobScore(b.sealJob) - jobScore(a.sealJob))[0];

export const requiredFilecoinModeIds: GameMode["id"][] = requiredProductionModeIds;

const bestModeRunFor = (runs: GameModeRun[], modeId: GameMode["id"]) =>
  runs
    .filter((run) => run.modeId === modeId)
    .sort((a, b) => jobScore(b.sealJob) - jobScore(a.sealJob))[0];

const needsSeal = (job?: SealJob) =>
  !job ||
  job.status !== "verified" ||
  job.proof?.mode !== "real" ||
  !payloadHashMatch(job) ||
  !registryHashMatch(job) ||
  !registryByteLengthMatch(job) ||
  !sealBackendProductionReady(job.backendHealth);

const recordSealCandidates = (records: MemoryRecord[]) =>
  records
    .filter((record) => record.capsule.locked)
    .sort((a, b) => {
      const needsScore = Number(needsSeal(b.sealJob)) - Number(needsSeal(a.sealJob));
      if (needsScore !== 0) return needsScore;
      const sealScore = jobScore(b.sealJob) - jobScore(a.sealJob);
      if (sealScore !== 0) return sealScore;
      return new Date(b.capsule.createdAt).getTime() - new Date(a.capsule.createdAt).getTime();
    });

export const buildFilecoinAutomationSealQueue = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
): FilecoinAutomationQueueItem[] => {
  const recordCandidates = recordSealCandidates(records);
  const recordsNeedingSeal = recordCandidates.filter((record) => needsSeal(record.sealJob));
  const queue: FilecoinAutomationQueueItem[] = [];
  if (recordsNeedingSeal.length > 0) {
    queue.push(
      ...recordsNeedingSeal.map((record) => ({
        kind: "record" as const,
        artifactId: record.capsule.id,
        runnable: true,
        reason: record.sealJob ? `retry ${record.sealJob.status} prediction seal lane` : "run prediction seal lane",
      })),
    );
  } else if (recordCandidates.length === 0) {
    queue.push({
      kind: "record",
      runnable: false,
      reason: "lock a prediction capsule before batch sealing",
    });
  }

  for (const modeId of requiredFilecoinModeIds) {
    const run = bestModeRunFor(modeRuns, modeId);
    if (!run) {
      queue.push({
        kind: "mode",
        modeId,
        runnable: false,
        reason: `create a ${modeId} mode proof before sealing`,
      });
      continue;
    }
    if (needsSeal(run.sealJob)) {
      queue.push({
        kind: "mode",
        modeId,
        artifactId: run.id,
        runnable: true,
        reason: run.sealJob ? `retry ${run.sealJob.status} ${modeId} seal lane` : `run ${modeId} seal lane`,
      });
    }
  }
  return queue;
};

export const buildFilecoinAutomationEvidencePacket = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
): FilecoinAutomationEvidencePacket => {
  const record = bestRecordJob(records);
  const requiredModeRuns = requiredFilecoinModeIds.map((modeId) => bestModeRunFor(modeRuns, modeId));
  const lanes = [
    laneFor("record", record?.capsule.id, record?.sealJob),
    ...requiredModeRuns.map((run, index) => laneFor("mode", run?.id, run?.sealJob, requiredFilecoinModeIds[index]!)),
  ];
  const queue = buildFilecoinAutomationSealQueue(records, modeRuns);
  const runnableQueue = queue.filter((item) => item.runnable).length;
  const missingArtifacts = queue.filter((item) => !item.runnable).length;
  const modeLanes = lanes.filter((lane) => lane.kind === "mode");
  const lanesReady = lanes.filter((lane) => lane.status === "verified").length;
  const verifiedJobs = lanes.filter((lane) => lane.jobId && lane.cid).length;
  const productionBackends = lanes.filter((lane) => lane.productionBackend).length;
  const registryMatches = lanes.filter((lane) => lane.registryHashMatch && lane.registryByteLengthMatch).length;
  const uploadStatusPolls = lanes.reduce((sum, lane) => sum + lane.uploadStatusPolls, 0);
  const pollAttempts = lanes.reduce((sum, lane) => sum + lane.pollAttempts, 0);
  const uploadStatusVerified = lanes.filter((lane) => lane.uploadStatusVerified).length;
  const verificationPollVerified = lanes.filter((lane) => lane.verificationPollVerified).length;
  const uploadStatusProgressions = lanes.filter((lane) => lane.uploadStatusProgression).length;
  const verificationPollProgressions = lanes.filter((lane) => lane.verificationPollProgression).length;
  const baseChecks = [
    {
      key: "record",
      label: "Prediction seal lane",
      passed: lanes[0].status === "verified",
      detail: lanes[0].summary,
    },
    {
      key: "mode",
      label: "Required mode seal lanes",
      passed: modeLanes.every((lane) => lane.status === "verified"),
      detail: `${modeLanes.filter((lane) => lane.status === "verified").length}/${modeLanes.length} required mode lanes verified`,
    },
    {
      key: "backend",
      label: "Production backend",
      passed: productionBackends === lanes.length,
      detail: `${productionBackends}/${lanes.length} lanes production-ready`,
    },
    {
      key: "registry",
      label: "Registry read-back",
      passed: registryMatches === lanes.length,
      detail: `${registryMatches}/${lanes.length} payload hashes and byte lengths matched`,
    },
    {
      key: "upload-status",
      label: "Upload status polling",
      passed: uploadStatusVerified === lanes.length && uploadStatusProgressions === lanes.length,
      detail: `${uploadStatusProgressions}/${lanes.length} lanes progressed to verified upload status · ${uploadStatusPolls} poll${uploadStatusPolls === 1 ? "" : "s"}`,
    },
    {
      key: "polling",
      label: "Verification polling",
      passed: verificationPollVerified === lanes.length && verificationPollProgressions === lanes.length && lanes.every((lane) => lane.verifyUrl),
      detail: `${verificationPollProgressions}/${lanes.length} lanes progressed to verified status · ${pollAttempts} total poll attempt${pollAttempts === 1 ? "" : "s"}`,
    },
  ];
  const ready = baseChecks.every((check) => check.passed);
  const checks = [
    ...baseChecks,
    {
      key: "batch-queue",
      label: "Batch seal queue",
      passed: ready || (runnableQueue > 0 && missingArtifacts === 0),
      detail: ready
        ? "all seal lanes complete"
        : `${runnableQueue} runnable lane${runnableQueue === 1 ? "" : "s"} · ${missingArtifacts} missing artifact${missingArtifacts === 1 ? "" : "s"}`,
    },
  ];
  const nextLane = lanes.find((lane) => lane.status !== "verified");
  const nextAction = ready
    ? "Record and every required mode proof Filecoin automation are production verified."
    : runnableQueue > 0
      ? `Run batch Filecoin seal for ${runnableQueue} queued lane${runnableQueue === 1 ? "" : "s"}.`
    : nextLane
      ? `${nextLane.kind}${nextLane.modeId ? ` ${nextLane.modeId}` : ""}: ${nextLane.blockers[0] ?? "run one-click sealing"}`
      : "Run production Filecoin verification.";
  const summary = `${lanesReady}/${lanes.length} Filecoin automation lanes verified · ${registryMatches}/${lanes.length} registry matches · ${productionBackends}/${lanes.length} production backends.`;
  const copyText = [
    "Kickoff Lock Agent Filecoin automation evidence",
    `Ready: ${ready ? "yes" : "no"}`,
    `Lanes verified: ${lanesReady}/${lanes.length}`,
    `Verified jobs: ${verifiedJobs}/${lanes.length}`,
    `Production backend: ${productionBackends}/${lanes.length}`,
    `Registry matches: ${registryMatches}/${lanes.length}`,
    `Upload status polls: ${uploadStatusPolls}`,
    `Poll attempts: ${pollAttempts}`,
    `Batch queue: ${runnableQueue} runnable, ${missingArtifacts} missing artifacts`,
    `Next action: ${nextAction}`,
    "Queue:",
    ...queue.map(
      (item) =>
        `- ${item.kind}${item.modeId ? `:${item.modeId}` : ""} · ${item.runnable ? "runnable" : "missing"} · ${item.artifactId ?? "no artifact"} · ${item.reason}`,
    ),
    ...lanes.map(
      (lane) =>
        `${lane.kind}: ${lane.status} · ${lane.artifactId ?? "missing"} · ${lane.cid ?? "no CID"} · blockers ${lane.blockers.join(", ") || "none"}`,
    ),
  ].join("\n");

  return {
    ready,
    lanesReady,
    totalLanes: lanes.length,
    verifiedJobs,
    productionBackends,
    registryMatches,
    uploadStatusPolls,
    pollAttempts,
    lanes,
    queue,
    runnableQueue,
    missingArtifacts,
    checks,
    summary,
    nextAction,
    copyText,
  };
};
