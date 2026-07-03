import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

export type ProofTimelineItem = {
  id: string;
  label: string;
  detail: string;
  timestamp?: string;
  status: "passed" | "pending" | "failed";
};

const short = (value?: string, length = 12) => (value ? `${value.slice(0, length)}${value.length > length ? "..." : ""}` : "missing");

const proofStatus = (proofMode?: string, proofState?: string) => {
  if (proofMode === "real" && ["retrievable", "verified"].includes(proofState ?? "")) return "passed";
  if (proofMode === "demo") return "pending";
  return proofState ? "pending" : "failed";
};

const shareStatus = (artifact?: ShareArtifactEvidence) =>
  artifact?.imageGenerated && artifact.imageHash && artifact.proofUrl ? "passed" : "pending";

export const buildRecordProofTimeline = (
  record: MemoryRecord,
  artifact?: ShareArtifactEvidence,
): ProofTimelineItem[] => [
  {
    id: "lock",
    label: "Prediction locked",
    detail: record.capsule.lateLock ? "Late practice lock" : "Sealed before kickoff",
    timestamp: record.capsule.sealedAt ?? record.capsule.createdAt,
    status: record.capsule.locked && !record.capsule.lateLock ? "passed" : record.capsule.locked ? "pending" : "failed",
  },
  {
    id: "hash",
    label: "Payload fingerprinted",
    detail: `SHA-256 ${short(record.capsule.payloadHash)}`,
    timestamp: record.capsule.sealedAt ?? record.capsule.createdAt,
    status: record.capsule.payloadHash.length >= 32 ? "passed" : "failed",
  },
  {
    id: "filecoin",
    label: "Filecoin proof attached",
    detail: `${record.capsule.filecoinProof.mode} · ${record.capsule.filecoinProof.proofStatus} · ${short(record.capsule.filecoinProof.cid)}`,
    timestamp: record.capsule.filecoinProof.uploadedAt ?? record.sealJob?.updatedAt,
    status: proofStatus(record.capsule.filecoinProof.mode, record.capsule.filecoinProof.proofStatus),
  },
  {
    id: "share",
    label: "Share image manifest",
    detail: artifact?.imageHash ? `${artifact.imageMime ?? "image/png"} · ${short(artifact.imageHash)}` : "Waiting for generated PNG manifest",
    timestamp: artifact?.generatedAt,
    status: shareStatus(artifact),
  },
  {
    id: "result",
    label: "Result revealed",
    detail: record.result ? `Score ${record.result.totalScore}/100 · actual ${record.result.homeScore}-${record.result.awayScore}` : "Awaiting final score",
    timestamp: record.result?.revealedAt,
    status: record.result ? "passed" : "pending",
  },
];

export const buildModeProofTimeline = (
  run: GameModeRun,
  artifact?: ShareArtifactEvidence,
): ProofTimelineItem[] => [
  {
    id: "created",
    label: "Mode proof created",
    detail: `${run.modeId} · ${run.capsuleIds.length} linked lock${run.capsuleIds.length === 1 ? "" : "s"}`,
    timestamp: run.createdAt,
    status: "passed",
  },
  {
    id: "hash",
    label: "Mode payload fingerprinted",
    detail: `SHA-256 ${short(run.payloadHash)}`,
    timestamp: run.createdAt,
    status: run.payloadHash.length >= 32 ? "passed" : "failed",
  },
  {
    id: "filecoin",
    label: "Filecoin proof attached",
    detail: `${run.filecoinProof.mode} · ${run.filecoinProof.proofStatus} · ${short(run.filecoinProof.cid)}`,
    timestamp: run.filecoinProof.uploadedAt ?? run.sealJob?.updatedAt,
    status: proofStatus(run.filecoinProof.mode, run.filecoinProof.proofStatus),
  },
  {
    id: "share",
    label: "Mode share image manifest",
    detail: artifact?.imageHash ? `${artifact.imageMime ?? "image/png"} · ${short(artifact.imageHash)}` : "Waiting for mode share PNG manifest",
    timestamp: artifact?.generatedAt,
    status: shareStatus(artifact),
  },
  {
    id: "score",
    label: "Mode scored",
    detail: run.score !== undefined ? `Score ${run.score}/100` : `Status ${run.status}`,
    timestamp: run.sealJob?.updatedAt ?? run.createdAt,
    status: run.score !== undefined || run.status === "scored" ? "passed" : "pending",
  },
];
