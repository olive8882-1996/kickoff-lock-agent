import { sealBackendProductionReady } from "./filecoinSeal";
import type { GameModeRun, MemoryRecord, SealJob } from "./types";

export type FilecoinAutomationLane = {
  kind: "record" | "mode";
  artifactId?: string;
  jobId?: string;
  status: "verified" | "partial" | "missing";
  productionBackend: boolean;
  cid?: string;
  payloadHashMatch: boolean;
  registryHashMatch: boolean;
  pollAttempts: number;
  proofUrl?: string;
  verifyUrl?: string;
  blockers: string[];
  summary: string;
};

export type FilecoinAutomationEvidencePacket = {
  ready: boolean;
  lanesReady: number;
  totalLanes: number;
  verifiedJobs: number;
  productionBackends: number;
  registryMatches: number;
  pollAttempts: number;
  lanes: FilecoinAutomationLane[];
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

const laneFor = (
  kind: FilecoinAutomationLane["kind"],
  artifactId: string | undefined,
  job: SealJob | undefined,
): FilecoinAutomationLane => {
  if (!job) {
    return {
      kind,
      artifactId,
      status: "missing",
      productionBackend: false,
      payloadHashMatch: false,
      registryHashMatch: false,
      pollAttempts: 0,
      blockers: [`missing ${kind} seal job`],
      summary: `${kind} proof has not run one-click Filecoin sealing yet.`,
    };
  }

  const productionBackend = sealBackendProductionReady(job.backendHealth);
  const hashMatch = payloadHashMatch(job);
  const registryMatch = registryHashMatch(job);
  const blockers = [
    ...(job.endpoint ? [] : ["missing seal API endpoint"]),
    ...(job.status === "verified" ? [] : [`seal job ${job.status}`]),
    ...(job.proof?.mode === "real" && job.proof.cid ? [] : ["real CID missing"]),
    ...(job.verifyUrl ? [] : ["verify URL missing"]),
    ...(job.pollAttempts ? [] : ["verification polling missing"]),
    ...(hashMatch ? [] : ["payload hash mismatch"]),
    ...(registryMatch ? [] : ["proof registry read-back missing"]),
    ...(productionBackend ? [] : job.backendHealth?.blockers?.length ? job.backendHealth.blockers : ["production backend not proven"]),
  ];
  const status = blockers.length === 0 ? "verified" : job.status === "verified" || job.proof?.mode === "real" ? "partial" : "missing";
  return {
    kind,
    artifactId,
    jobId: job.id,
    status,
    productionBackend,
    cid: job.proof?.cid,
    payloadHashMatch: hashMatch,
    registryHashMatch: registryMatch,
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

const bestModeJob = (runs: GameModeRun[]) =>
  runs
    .filter((run) => run.sealJob)
    .sort((a, b) => jobScore(b.sealJob) - jobScore(a.sealJob))[0];

export const buildFilecoinAutomationEvidencePacket = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
): FilecoinAutomationEvidencePacket => {
  const record = bestRecordJob(records);
  const modeRun = bestModeJob(modeRuns);
  const lanes = [
    laneFor("record", record?.capsule.id, record?.sealJob),
    laneFor("mode", modeRun?.id, modeRun?.sealJob),
  ];
  const lanesReady = lanes.filter((lane) => lane.status === "verified").length;
  const verifiedJobs = lanes.filter((lane) => lane.jobId && lane.cid).length;
  const productionBackends = lanes.filter((lane) => lane.productionBackend).length;
  const registryMatches = lanes.filter((lane) => lane.registryHashMatch).length;
  const pollAttempts = lanes.reduce((sum, lane) => sum + lane.pollAttempts, 0);
  const checks = [
    {
      key: "record",
      label: "Prediction seal lane",
      passed: lanes[0].status === "verified",
      detail: lanes[0].summary,
    },
    {
      key: "mode",
      label: "Mode proof seal lane",
      passed: lanes[1].status === "verified",
      detail: lanes[1].summary,
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
      detail: `${registryMatches}/${lanes.length} payload hashes matched`,
    },
    {
      key: "polling",
      label: "Verification polling",
      passed: lanes.every((lane) => lane.pollAttempts > 0 && lane.verifyUrl),
      detail: `${pollAttempts} total poll attempt${pollAttempts === 1 ? "" : "s"}`,
    },
  ];
  const ready = checks.every((check) => check.passed);
  const nextLane = lanes.find((lane) => lane.status !== "verified");
  const nextAction = ready
    ? "Record and mode proof Filecoin automation are both production verified."
    : nextLane
      ? `${nextLane.kind}: ${nextLane.blockers[0] ?? "run one-click sealing"}`
      : "Run production Filecoin verification.";
  const summary = `${lanesReady}/${lanes.length} Filecoin automation lanes verified · ${registryMatches}/${lanes.length} registry matches · ${productionBackends}/${lanes.length} production backends.`;
  const copyText = [
    "Kickoff Lock Agent Filecoin automation evidence",
    `Ready: ${ready ? "yes" : "no"}`,
    `Lanes verified: ${lanesReady}/${lanes.length}`,
    `Verified jobs: ${verifiedJobs}/${lanes.length}`,
    `Production backend: ${productionBackends}/${lanes.length}`,
    `Registry matches: ${registryMatches}/${lanes.length}`,
    `Poll attempts: ${pollAttempts}`,
    `Next action: ${nextAction}`,
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
    pollAttempts,
    lanes,
    checks,
    summary,
    nextAction,
    copyText,
  };
};
