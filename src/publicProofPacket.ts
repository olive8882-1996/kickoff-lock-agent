import type { GameModeRun, MemoryRecord, PublicProfile, ShareArtifactEvidence } from "./types";

export type VerifierPacket = {
  kind: "profile" | "proof" | "mode";
  title: string;
  publicUrl: string;
  status: string;
  primaryId: string;
  cid?: string;
  payloadHash?: string;
  score?: string;
  shareImageUrl?: string;
  shareImageHash?: string;
  lines: string[];
  text: string;
};

const short = (value?: string, size = 16) => (value ? `${value.slice(0, size)}${value.length > size ? "..." : ""}` : "missing");

const packetText = (lines: string[]) => lines.filter(Boolean).join("\n");

export const buildRecordVerifierPacket = (
  record: MemoryRecord,
  publicUrl: string,
  artifact?: ShareArtifactEvidence,
): VerifierPacket => {
  const result = record.result
    ? `Actual ${record.result.homeScore}-${record.result.awayScore} · score ${record.result.totalScore}/100`
    : "Reveal pending";
  const status = `${record.capsule.lateLock ? "late practice lock" : "sealed before kickoff"} · ${record.capsule.filecoinProof.mode} ${record.capsule.filecoinProof.proofStatus}`;
  const lines = [
    "Kickoff Lock Agent verifier packet",
    `Proof: ${record.capsule.matchLabel}`,
    `Prediction: ${record.capsule.prediction.homeScore}-${record.capsule.prediction.awayScore}`,
    result,
    `Status: ${status}`,
    `CID: ${record.capsule.filecoinProof.cid}`,
    `Payload hash: ${record.capsule.payloadHash}`,
    `Share image: ${artifact?.imageUrl ?? "not publicly hosted yet"}`,
    `Share image hash: ${artifact?.imageHash ?? "missing"}`,
    `Verify: ${publicUrl}`,
  ];
  return {
    kind: "proof",
    title: record.capsule.matchLabel,
    publicUrl,
    status,
    primaryId: record.capsule.id,
    cid: record.capsule.filecoinProof.cid,
    payloadHash: record.capsule.payloadHash,
    score: result,
    shareImageUrl: artifact?.imageUrl,
    shareImageHash: artifact?.imageHash,
    lines,
    text: packetText(lines),
  };
};

export const buildModeVerifierPacket = (
  run: GameModeRun,
  publicUrl: string,
  artifact?: ShareArtifactEvidence,
): VerifierPacket => {
  const status = `${run.modeId} · ${run.status}`;
  const score = run.score !== undefined ? `Score ${run.score}/100` : `Status ${run.status}`;
  const lines = [
    "Kickoff Lock Agent verifier packet",
    `Mode proof: ${run.title}`,
    `Mode: ${run.modeId}`,
    score,
    `Linked locks: ${run.capsuleIds.length}`,
    `Status: ${status}`,
    `CID: ${run.filecoinProof.cid}`,
    `Payload hash: ${run.payloadHash}`,
    `Share image: ${artifact?.imageUrl ?? "not publicly hosted yet"}`,
    `Share image hash: ${artifact?.imageHash ?? "missing"}`,
    `Verify: ${publicUrl}`,
  ];
  return {
    kind: "mode",
    title: run.title,
    publicUrl,
    status,
    primaryId: run.id,
    cid: run.filecoinProof.cid,
    payloadHash: run.payloadHash,
    score,
    shareImageUrl: artifact?.imageUrl,
    shareImageHash: artifact?.imageHash,
    lines,
    text: packetText(lines),
  };
};

export const buildProfileVerifierPacket = (profile: PublicProfile, publicUrl: string): VerifierPacket => {
  const status = `${profile.locks} locks · ${profile.modeProofs} mode proofs · ${profile.shareArtifacts.length} share manifests`;
  const latestCid =
    profile.records[0]?.capsule.filecoinProof.cid ?? profile.modeRuns[0]?.filecoinProof.cid ?? undefined;
  const lines = [
    "Kickoff Lock Agent verifier packet",
    `Profile: ${profile.displayName}`,
    `Location: ${profile.location}`,
    `Status: ${status}`,
    `Average score: ${profile.averageScore}/100`,
    `Best score: ${profile.bestScore}/100`,
    `XP: ${profile.xp}`,
    `Latest CID: ${latestCid ?? "none"}`,
    `Verify: ${publicUrl}`,
  ];
  return {
    kind: "profile",
    title: profile.displayName,
    publicUrl,
    status,
    primaryId: profile.id,
    cid: latestCid,
    score: `${profile.averageScore}/100 average`,
    lines,
    text: packetText(lines),
  };
};

export const verifierPacketPreview = (packet: VerifierPacket) =>
  `${packet.kind}:${packet.primaryId} · ${short(packet.cid)} · ${packet.status}`;
