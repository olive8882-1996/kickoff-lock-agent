import { sealBackendProductionReady } from "./filecoinSeal";
import { filecoinSealApiEndpointProblem } from "./filecoinSealApiReadiness";
import { filecoinProofMetadataProblems } from "./filecoinProofValidation";
import {
  buildFilecoinSealResumeReadiness,
  filecoinSealProofUrlProblem,
  filecoinSealStatusUrlProblem,
  filecoinSealVerifyUrlProblem,
  filecoinSealPollEvidenceProblems,
  hasUploadStatusProgression,
  hasVerificationPollProgression,
  latestUploadStatusVerified,
  latestVerificationPollVerified,
  type FilecoinSealResumeNextAction,
  type FilecoinSealResumeRisk,
} from "./filecoinSealJobChecks";
import { requiredFilecoinModeIds } from "./filecoinAutomationEvidence";
import type { GameMode, GameModeRun, MemoryRecord, SealJob } from "./types";

export type FilecoinSealLifecycleStageKey =
  | "one-click"
  | "production-backend"
  | "upload-status"
  | "cid"
  | "verification-poll"
  | "proof-readback";

export type FilecoinSealLifecycleStage = {
  key: FilecoinSealLifecycleStageKey;
  label: string;
  passed: boolean;
  detail: string;
};

export type FilecoinSealLifecycleReadBackCommand = {
  id: string;
  kind: "record" | "mode";
  artifactId?: string;
  modeId?: GameMode["id"];
  label: string;
  route: "upload-status" | "verify" | "proof";
  url: string;
  command: string;
  ready: boolean;
  authMode: "same-origin-proxy" | "bearer-env" | "public";
  responseExpectation: {
    responseType: "json";
    requiredFields: string[];
    expectedCid?: string;
    expectedJobId?: string;
    expectedPayloadHash?: string;
  };
};

export type FilecoinSealLifecycleReadBackDossierStep = {
  route: FilecoinSealLifecycleReadBackCommand["route"];
  label: string;
  passed: boolean;
  commandReady: boolean;
  verdict: string;
  command?: string;
  requiredFields: string[];
};

export type FilecoinSealLifecycleReadBackDossier = {
  id: string;
  kind: "record" | "mode";
  artifactId?: string;
  modeId?: GameMode["id"];
  label: string;
  ready: boolean;
  passedSteps: number;
  totalSteps: number;
  steps: FilecoinSealLifecycleReadBackDossierStep[];
  blockers: string[];
  copyText: string;
};

export type FilecoinSealLifecycleArtifact = {
  kind: "record" | "mode";
  artifactId?: string;
  modeId?: GameMode["id"];
  title: string;
  jobId?: string;
  backendJobId?: string;
  uploadStatusUrl?: string;
  status: "complete" | "resumable" | "queued" | "missing" | "blocked";
  cid?: string;
  uploadStatusPolls: number;
  verificationPolls: number;
  registryHashMatch: boolean;
  registryByteLengthMatch: boolean;
  productionBackend: boolean;
  resumable: boolean;
  resumeRisk: FilecoinSealResumeRisk;
  resumeNextAction: FilecoinSealResumeNextAction;
  resumeNextActionDetail: string;
  resumeBlockers: string[];
  resumeEvidence: string[];
  passedStages: number;
  totalStages: number;
  stages: FilecoinSealLifecycleStage[];
  readBackCommands: FilecoinSealLifecycleReadBackCommand[];
  blockers: string[];
  nextAction: string;
};

export type FilecoinSealLifecycleResumeQueueItem = {
  id: string;
  kind: "record" | "mode";
  artifactId?: string;
  modeId?: GameMode["id"];
  label: string;
  backendJobId?: string;
  uploadStatusUrl?: string;
  status: FilecoinSealLifecycleArtifact["status"];
  canResume: boolean;
  risk: FilecoinSealResumeRisk;
  nextAction: FilecoinSealResumeNextAction;
  nextActionDetail: string;
  blockers: string[];
  evidence: string[];
  uploadStatusPolls: number;
  verificationPolls: number;
};

export type FilecoinSealLifecyclePacket = {
  ready: boolean;
  completeArtifacts: number;
  totalArtifacts: number;
  resumableArtifacts: number;
  resumeQueueReady: number;
  queuedArtifacts: number;
  missingArtifacts: number;
  productionBackends: number;
  registryProofs: number;
  uploadStatusPolls: number;
  verificationPolls: number;
  readBackReady: number;
  readBackDossierReady: number;
  readBackCommands: FilecoinSealLifecycleReadBackCommand[];
  readBackDossiers: FilecoinSealLifecycleReadBackDossier[];
  resumeQueue: FilecoinSealLifecycleResumeQueueItem[];
  artifacts: FilecoinSealLifecycleArtifact[];
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
    ? (job.status === "verified" ? 16 : job.status === "running" ? 8 : job.status === "queued" ? 4 : 0) +
      (sealBackendProductionReady(job.backendHealth) ? 8 : 0) +
      (job.proofRegistryStatus === "verified" ? 4 : 0) +
      (job.backendJobId ? 2 : 0) +
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

const resumable = (job?: SealJob) =>
  Boolean(job?.backendJobId && job.uploadPayloadHash && job.uploadByteLength && job.status !== "verified");

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

const readBackAuthMode = (job?: SealJob): FilecoinSealLifecycleReadBackCommand["authMode"] => {
  if (job?.backendHealth?.service === "kickoff-lock-filecoin-seal-proxy") return "same-origin-proxy";
  return job?.backendHealth?.authRequired ? "bearer-env" : "public";
};

const curlReadBackCommand = (url: string, authMode: FilecoinSealLifecycleReadBackCommand["authMode"]) =>
  authMode === "bearer-env"
    ? `curl -sS ${shellSingleQuote(url)} -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`
    : `curl -sS ${shellSingleQuote(url)}`;

const lifecycleReadBackCommands = (
  kind: "record" | "mode",
  artifactId: string | undefined,
  modeId: GameMode["id"] | undefined,
  job: SealJob | undefined,
): FilecoinSealLifecycleReadBackCommand[] => {
  const authMode = readBackAuthMode(job);
  const idPrefix = `${kind}-${modeId ?? artifactId ?? "missing"}`;
  const base = { kind, artifactId, modeId, authMode };
  const commands: FilecoinSealLifecycleReadBackCommand[] = [];
  if (job?.uploadStatusUrl) {
    commands.push({
      ...base,
      id: `${idPrefix}-upload-status`,
      label: `${kind === "record" ? "Prediction" : modeId} upload status`,
      route: "upload-status",
      url: job.uploadStatusUrl,
      command: curlReadBackCommand(job.uploadStatusUrl, authMode),
      ready: Boolean(job.backendJobId && !filecoinSealStatusUrlProblem(job)),
      responseExpectation: {
        responseType: "json",
        requiredFields: ["ok", "jobId", "status", "payloadHash", "byteLength"],
        expectedJobId: job.backendJobId,
        expectedPayloadHash: job.uploadPayloadHash,
      },
    });
  }
  if (job?.verifyUrl) {
    commands.push({
      ...base,
      id: `${idPrefix}-verify`,
      label: `${kind === "record" ? "Prediction" : modeId} CID verification`,
      route: "verify",
      url: job.verifyUrl,
      command: curlReadBackCommand(job.verifyUrl, authMode),
      ready: !filecoinSealVerifyUrlProblem(job),
      responseExpectation: {
        responseType: "json",
        requiredFields: ["ok", "cid", "payloadHash", "byteLength", "proofStatus"],
        expectedCid: job.proof?.cid,
        expectedPayloadHash: job.uploadPayloadHash,
      },
    });
  }
  if (job?.proofUrl) {
    commands.push({
      ...base,
      id: `${idPrefix}-proof`,
      label: `${kind === "record" ? "Prediction" : modeId} CID metadata`,
      route: "proof",
      url: job.proofUrl,
      command: curlReadBackCommand(job.proofUrl, authMode),
      ready: !filecoinSealProofUrlProblem(job),
      responseExpectation: {
        responseType: "json",
        requiredFields: ["ok", "cid", "payloadHash", "byteLength", "storedAt"],
        expectedCid: job.proof?.cid,
        expectedPayloadHash: job.uploadPayloadHash,
      },
    });
  }
  return commands;
};

const bestRecordWithSealEvidence = (records: MemoryRecord[]) =>
  records
    .filter((record) => record.capsule.locked)
    .sort((a, b) => {
      const sealScore = jobScore(b.sealJob) - jobScore(a.sealJob);
      if (sealScore !== 0) return sealScore;
      return new Date(b.capsule.createdAt).getTime() - new Date(a.capsule.createdAt).getTime();
    })[0];

const bestModeRunFor = (runs: GameModeRun[], modeId: GameMode["id"]) =>
  runs
    .filter((run) => run.modeId === modeId)
    .sort((a, b) => jobScore(b.sealJob) - jobScore(a.sealJob))[0];

const artifactLifecycle = ({
  kind,
  artifactId,
  title,
  modeId,
  job,
}: {
  kind: "record" | "mode";
  artifactId?: string;
  title: string;
  modeId?: GameMode["id"];
  job?: SealJob;
}): FilecoinSealLifecycleArtifact => {
  const endpointProblem = filecoinSealApiEndpointProblem(job?.endpoint ?? "");
  const productionBackend = Boolean(job && !endpointProblem && sealBackendProductionReady(job.backendHealth));
  const statusUrlProblem = filecoinSealStatusUrlProblem(job);
  const uploadStatusPassed = Boolean(
    job?.backendJobId &&
      job.uploadStatusUrl &&
      !statusUrlProblem &&
      latestUploadStatusVerified(job) &&
      hasUploadStatusProgression(job),
  );
  const metadataProblems = filecoinProofMetadataProblems(job?.proof, {
    expectedPayloadHash: job?.uploadPayloadHash,
    expectedByteLength: job?.uploadByteLength,
    label: "sealed proof",
  });
  const cidPassed = Boolean(job?.proof?.mode === "real" && job.proof.cid && payloadHashMatch(job) && metadataProblems.length === 0);
  const verificationPollPassed = Boolean(
    job?.verifyUrl && job.pollLog?.length && latestVerificationPollVerified(job) && hasVerificationPollProgression(job),
  );
  const pollProblems = filecoinSealPollEvidenceProblems(job);
  const verificationPollProblem = pollProblems.find((problem) => problem.includes("verification poll"));
  const registryHash = registryHashMatch(job);
  const registryBytes = registryByteLengthMatch(job);
  const registryPassed = Boolean(job?.proofUrl && registryHash && registryBytes);
  const oneClickPassed = Boolean(
    job?.backendJobId && job.uploadStatusUrl && !statusUrlProblem && job.uploadPayloadHash && job.uploadByteLength,
  );
  const stages: FilecoinSealLifecycleStage[] = [
    {
      key: "one-click",
      label: "One-click upload job",
      passed: oneClickPassed,
      detail: job?.backendJobId
        ? `${job.backendJobId}${statusUrlProblem ? ` · ${statusUrlProblem}` : " · status URL targets backend job"}`
        : "no async backend upload job yet",
    },
    {
      key: "production-backend",
      label: "Production seal backend",
      passed: productionBackend,
      detail: productionBackend
        ? "deployed HTTPS /seal backend is production-ready"
        : endpointProblem || job?.backendHealth?.blockers?.[0] || "production backend not proven",
    },
    {
      key: "upload-status",
      label: "Upload status polling",
      passed: uploadStatusPassed,
      detail: `${job?.uploadStatusPolls ?? 0} poll${(job?.uploadStatusPolls ?? 0) === 1 ? "" : "s"} · ${
        job?.uploadStatusLog?.at(-1)?.status ?? "not polled"
      }${uploadStatusPassed ? "" : ` · ${statusUrlProblem || "progression missing"}`}`,
    },
    {
      key: "cid",
      label: "CID + payload hash",
      passed: cidPassed,
      detail: cidPassed
        ? `${job?.proof?.cid} · payload hash and proof metadata match`
        : metadataProblems[0] ?? job?.proof?.cid ?? "CID missing or hash mismatch",
    },
    {
      key: "verification-poll",
      label: "Verification polling",
      passed: verificationPollPassed,
      detail: `${job?.pollAttempts ?? 0} attempt${(job?.pollAttempts ?? 0) === 1 ? "" : "s"} · ${
        job?.pollLog?.at(-1)?.proofStatus ?? "not verified"
      }${verificationPollPassed ? "" : ` · ${verificationPollProblem ?? "progression missing"}`}`,
    },
    {
      key: "proof-readback",
      label: "Proof page read-back",
      passed: registryPassed,
      detail: registryPassed
        ? "proof registry hash and byte length match the uploaded payload"
        : `${job?.proofRegistryStatus ?? "unchecked"} · hash ${registryHash ? "match" : "pending"} · bytes ${
            registryBytes ? "match" : "pending"
          }`,
    },
  ];
  const blockers = stages.filter((stage) => !stage.passed).map((stage) => stage.detail);
  const passedStages = stages.filter((stage) => stage.passed).length;
  const readBackCommands = lifecycleReadBackCommands(kind, artifactId, modeId, job);
  const resumeReadiness = buildFilecoinSealResumeReadiness(job, job?.endpoint);
  const isResumable = resumeReadiness.canResume || resumable(job);
  const status =
    passedStages === stages.length
      ? "complete"
      : isResumable
        ? "resumable"
        : job?.status === "queued" || job?.status === "running"
          ? "queued"
          : job
            ? "blocked"
            : "missing";
  const nextAction =
    status === "complete"
      ? "Lifecycle complete: upload job, CID, verification polling and proof read-back all match."
      : isResumable
        ? `Resume backend seal job ${job?.backendJobId}: ${resumeReadiness.nextActionDetail}`
        : blockers[0] ?? "Run Filecoin one-click sealing.";

  return {
    kind,
    artifactId,
    modeId,
    title,
    jobId: job?.id,
    backendJobId: job?.backendJobId,
    uploadStatusUrl: job?.uploadStatusUrl,
    status,
    cid: job?.proof?.cid,
    uploadStatusPolls: job?.uploadStatusPolls ?? 0,
    verificationPolls: job?.pollAttempts ?? 0,
    registryHashMatch: registryHash,
    registryByteLengthMatch: registryBytes,
    productionBackend,
    resumable: isResumable,
    resumeRisk: resumeReadiness.risk,
    resumeNextAction: resumeReadiness.nextAction,
    resumeNextActionDetail: resumeReadiness.nextActionDetail,
    resumeBlockers: resumeReadiness.blockers,
    resumeEvidence: resumeReadiness.evidence,
    passedStages,
    totalStages: stages.length,
    stages,
    readBackCommands,
    blockers,
    nextAction,
  };
};

const stagePassed = (artifact: FilecoinSealLifecycleArtifact, key: FilecoinSealLifecycleStageKey) =>
  Boolean(artifact.stages.find((stage) => stage.key === key)?.passed);

const commandByRoute = (artifact: FilecoinSealLifecycleArtifact, route: FilecoinSealLifecycleReadBackCommand["route"]) =>
  artifact.readBackCommands.find((command) => command.route === route);

const readBackDossierFor = (artifact: FilecoinSealLifecycleArtifact): FilecoinSealLifecycleReadBackDossier => {
  const uploadCommand = commandByRoute(artifact, "upload-status");
  const verifyCommand = commandByRoute(artifact, "verify");
  const proofCommand = commandByRoute(artifact, "proof");
  const label = artifact.kind === "record" ? "Prediction proof dossier" : `${artifact.modeId} proof dossier`;
  const id = `dossier-${artifact.kind}-${artifact.modeId ?? artifact.artifactId ?? "missing"}`;
  const steps: FilecoinSealLifecycleReadBackDossierStep[] = [
    {
      route: "upload-status",
      label: "Upload status read-back",
      commandReady: Boolean(uploadCommand?.ready),
      passed: Boolean(uploadCommand?.ready && stagePassed(artifact, "one-click") && stagePassed(artifact, "upload-status")),
      verdict: uploadCommand?.ready
        ? "Command targets the async backend job and expects jobId, status, payloadHash and byteLength."
        : "Missing a ready /jobs/:backendJobId read-back command.",
      command: uploadCommand?.command,
      requiredFields: uploadCommand?.responseExpectation.requiredFields ?? ["ok", "jobId", "status", "payloadHash", "byteLength"],
    },
    {
      route: "verify",
      label: "CID verification read-back",
      commandReady: Boolean(verifyCommand?.ready),
      passed: Boolean(verifyCommand?.ready && stagePassed(artifact, "cid") && stagePassed(artifact, "verification-poll")),
      verdict: verifyCommand?.ready
        ? "Command verifies the requested CID and matches payload hash, byte length and proofStatus."
        : "Missing a ready /verify read-back command for the sealed CID.",
      command: verifyCommand?.command,
      requiredFields: verifyCommand?.responseExpectation.requiredFields ?? ["ok", "cid", "payloadHash", "byteLength", "proofStatus"],
    },
    {
      route: "proof",
      label: "Proof registry read-back",
      commandReady: Boolean(proofCommand?.ready),
      passed: Boolean(proofCommand?.ready && stagePassed(artifact, "proof-readback")),
      verdict: proofCommand?.ready
        ? "Command reads proof registry metadata and requires storedAt, payloadHash and byteLength."
        : "Missing a ready /proof/:cid registry read-back command.",
      command: proofCommand?.command,
      requiredFields: proofCommand?.responseExpectation.requiredFields ?? ["ok", "cid", "payloadHash", "byteLength", "storedAt"],
    },
  ];
  const passedSteps = steps.filter((step) => step.passed).length;
  const blockers = [
    ...steps.filter((step) => !step.passed).map((step) => `${step.label}: ${step.verdict}`),
    ...artifact.blockers,
  ];
  const ready = passedSteps === steps.length;
  const copyText = [
    `${label}: ${ready ? "ready" : "pending"} (${passedSteps}/${steps.length})`,
    `Artifact: ${artifact.artifactId ?? "missing"}`,
    `CID: ${artifact.cid ?? "missing"}`,
    `Backend job: ${artifact.backendJobId ?? "missing"}`,
    ...steps.map(
      (step) =>
        `- ${step.label}: ${step.passed ? "passed" : "pending"} · fields ${step.requiredFields.join(", ")} · ${
          step.command ?? "command missing"
        }`,
    ),
    ...(blockers.length ? [`Blockers: ${blockers.join("; ")}`] : ["Blockers: none"]),
  ].join("\n");

  return {
    id,
    kind: artifact.kind,
    artifactId: artifact.artifactId,
    modeId: artifact.modeId,
    label,
    ready,
    passedSteps,
    totalSteps: steps.length,
    steps,
    blockers,
    copyText,
  };
};

export const buildFilecoinSealLifecyclePacket = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
): FilecoinSealLifecyclePacket => {
  const record = bestRecordWithSealEvidence(records);
  const artifacts = [
    artifactLifecycle({
      kind: "record",
      artifactId: record?.capsule.id,
      title: record ? record.capsule.matchLabel : "Prediction proof lane",
      job: record?.sealJob,
    }),
    ...requiredFilecoinModeIds.map((modeId) => {
      const run = bestModeRunFor(modeRuns, modeId);
      return artifactLifecycle({
        kind: "mode",
        artifactId: run?.id,
        title: run?.title ?? `${modeId} proof lane`,
        modeId,
        job: run?.sealJob,
      });
    }),
  ];
  const completeArtifacts = artifacts.filter((artifact) => artifact.status === "complete").length;
  const resumableArtifacts = artifacts.filter((artifact) => artifact.resumable).length;
  const resumeQueue = artifacts
    .filter((artifact) => artifact.status !== "complete")
    .map<FilecoinSealLifecycleResumeQueueItem>((artifact) => ({
      id: `${artifact.kind}-${artifact.modeId ?? artifact.artifactId ?? "missing"}`,
      kind: artifact.kind,
      artifactId: artifact.artifactId,
      modeId: artifact.modeId,
      label: artifact.kind === "record" ? "Prediction proof" : `${artifact.modeId} mode proof`,
      backendJobId: artifact.backendJobId,
      uploadStatusUrl: artifact.uploadStatusUrl,
      status: artifact.status,
      canResume: artifact.resumable && artifact.resumeRisk === "ready",
      risk: artifact.resumeRisk,
      nextAction: artifact.resumeNextAction,
      nextActionDetail: artifact.resumeNextActionDetail,
      blockers: artifact.resumeBlockers,
      evidence: artifact.resumeEvidence,
      uploadStatusPolls: artifact.uploadStatusPolls,
      verificationPolls: artifact.verificationPolls,
    }));
  const resumeQueueReady = resumeQueue.filter((item) => item.canResume).length;
  const queuedArtifacts = artifacts.filter((artifact) => artifact.status === "queued").length;
  const missingArtifacts = artifacts.filter((artifact) => artifact.status === "missing").length;
  const productionBackends = artifacts.filter((artifact) => artifact.productionBackend).length;
  const cidProofs = artifacts.filter((artifact) => artifact.stages.find((stage) => stage.key === "cid")?.passed).length;
  const registryProofs = artifacts.filter((artifact) => artifact.registryHashMatch && artifact.registryByteLengthMatch).length;
  const uploadStatusPolls = artifacts.reduce((sum, artifact) => sum + artifact.uploadStatusPolls, 0);
  const verificationPolls = artifacts.reduce((sum, artifact) => sum + artifact.verificationPolls, 0);
  const readBackCommands = artifacts.flatMap((artifact) => artifact.readBackCommands);
  const readBackReady = readBackCommands.filter((command) => command.ready).length;
  const readBackDossiers = artifacts.map(readBackDossierFor);
  const readBackDossierReady = readBackDossiers.filter((dossier) => dossier.ready).length;
  const totalArtifacts = artifacts.length;
  const checks = [
    {
      key: "artifacts",
      label: "Required artifacts",
      passed: missingArtifacts === 0,
      detail: `${totalArtifacts - missingArtifacts}/${totalArtifacts} prediction/mode artifacts exist`,
    },
    {
      key: "one-click",
      label: "One-click async jobs",
      passed: artifacts.every((artifact) => artifact.stages.find((stage) => stage.key === "one-click")?.passed),
      detail: `${artifacts.filter((artifact) => artifact.backendJobId).length}/${totalArtifacts} backend job ids captured`,
    },
    {
      key: "production",
      label: "Production backend",
      passed: productionBackends === totalArtifacts,
      detail: `${productionBackends}/${totalArtifacts} lanes used production-ready HTTPS /seal backend`,
    },
    {
      key: "upload-status",
      label: "Upload status completion",
      passed: artifacts.every((artifact) => artifact.stages.find((stage) => stage.key === "upload-status")?.passed),
      detail: `${uploadStatusPolls} upload status poll${uploadStatusPolls === 1 ? "" : "s"} recorded`,
    },
    {
      key: "cid-payload",
      label: "CID payload and metadata",
      passed: cidProofs === totalArtifacts,
      detail: `${cidProofs}/${totalArtifacts} real CIDs matched payload hashes and production proof metadata`,
    },
    {
      key: "cid-verify",
      label: "CID verification polling",
      passed: artifacts.every((artifact) => artifact.stages.find((stage) => stage.key === "verification-poll")?.passed),
      detail: `${verificationPolls} verification poll attempt${verificationPolls === 1 ? "" : "s"} recorded`,
    },
    {
      key: "proof-readback",
      label: "Proof read-back",
      passed: registryProofs === totalArtifacts,
      detail: `${registryProofs}/${totalArtifacts} proof registry payload hashes and byte lengths matched`,
    },
    {
      key: "readback-commands",
      label: "CID read-back commands",
      passed: readBackReady === totalArtifacts * 3,
      detail: `${readBackReady}/${totalArtifacts * 3} upload status, verify and proof metadata commands ready`,
    },
    {
      key: "readback-dossiers",
      label: "Judge read-back dossiers",
      passed: readBackDossierReady === totalArtifacts,
      detail: `${readBackDossierReady}/${totalArtifacts} lanes have upload status, CID verify and proof registry dossiers ready`,
    },
    {
      key: "recovery",
      label: "Resume queue",
      passed: completeArtifacts === totalArtifacts || resumeQueueReady > 0,
      detail:
        completeArtifacts === totalArtifacts
          ? "nothing left to resume"
          : `${resumeQueueReady}/${resumeQueue.length} resume-ready job${
              resumeQueueReady === 1 ? "" : "s"
            } · ${queuedArtifacts} queued lane${
              queuedArtifacts === 1 ? "" : "s"
            }`,
    },
  ];
  const ready = checks.filter((check) => check.key !== "recovery").every((check) => check.passed);
  const nextArtifact = artifacts.find((artifact) => artifact.status !== "complete");
  const nextAction = ready
    ? "Filecoin one-click lifecycle is complete across prediction and required mode lanes."
    : nextArtifact
      ? `${nextArtifact.kind}${nextArtifact.modeId ? ` ${nextArtifact.modeId}` : ""}: ${nextArtifact.nextAction}`
      : "Run Filecoin lifecycle verification.";
  const summary = `${completeArtifacts}/${totalArtifacts} Filecoin lifecycles complete · ${resumableArtifacts} resumable · ${registryProofs}/${totalArtifacts} proof read-backs matched.`;
  const copyText = [
    "Kickoff Lock Agent Filecoin lifecycle evidence",
    `Ready: ${ready ? "yes" : "no"}`,
    `Complete artifacts: ${completeArtifacts}/${totalArtifacts}`,
    `Production backends: ${productionBackends}/${totalArtifacts}`,
    `Registry proof read-backs: ${registryProofs}/${totalArtifacts}`,
    `Upload status polls: ${uploadStatusPolls}`,
    `Verification polls: ${verificationPolls}`,
    `Read-back commands: ${readBackReady}/${readBackCommands.length}`,
    `Judge read-back dossiers: ${readBackDossierReady}/${totalArtifacts}`,
    `Resumable jobs: ${resumableArtifacts}`,
    `Resume queue: ${resumeQueueReady}/${resumeQueue.length} ready`,
    `Next action: ${nextAction}`,
    "Checks:",
    ...checks.map((check) => `- ${check.label}: ${check.passed ? "passed" : "pending"} · ${check.detail}`),
    "Resume queue:",
    ...(resumeQueue.length
      ? resumeQueue.map(
          (item) =>
            `- ${item.label} · ${item.canResume ? "ready" : item.risk} · ${item.backendJobId ?? "no backend job"} · ${
              item.nextActionDetail
            }`,
        )
      : ["- none"]),
    "CID read-back commands:",
    ...(readBackCommands.length
      ? readBackCommands.map(
          (command) =>
            `- ${command.label} · ${command.ready ? "ready" : "pending"} · ${command.authMode} · ${command.command}`,
        )
      : ["- none"]),
    "Judge read-back dossiers:",
    ...readBackDossiers.map((dossier) => dossier.copyText),
    "Artifacts:",
    ...artifacts.map(
      (artifact) =>
        `- ${artifact.kind}${artifact.modeId ? `:${artifact.modeId}` : ""} · ${artifact.status} · ${
          artifact.artifactId ?? "missing"
        } · CID ${artifact.cid ?? "missing"} · resume ${artifact.resumeRisk} · ${
          artifact.passedStages
        }/${artifact.totalStages} stages · ${artifact.nextAction}`,
    ),
  ].join("\n");

  return {
    ready,
    completeArtifacts,
    totalArtifacts,
    resumableArtifacts,
    resumeQueueReady,
    queuedArtifacts,
    missingArtifacts,
    productionBackends,
    registryProofs,
    uploadStatusPolls,
    verificationPolls,
    readBackReady,
    readBackDossierReady,
    readBackCommands,
    readBackDossiers,
    resumeQueue,
    artifacts,
    checks,
    summary,
    nextAction,
    copyText,
  };
};
