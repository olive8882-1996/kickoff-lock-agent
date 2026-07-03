import { isProductionProofUrl, isProductionShareArtifact, isPublishableShareArtifact } from "./shareCard";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

export type PublicProofJudgeSummaryItem = {
  key: "lock" | "score" | "filecoin" | "payload" | "share" | "url";
  label: string;
  value: string;
  status: "passed" | "pending" | "failed";
};

export type PublicProofJudgeSummary = {
  kind: "record" | "mode";
  title: string;
  subtitle: string;
  ready: boolean;
  passed: number;
  total: number;
  primaryScore: string;
  cid: string;
  payloadHash: string;
  shareImage: string;
  publicUrl: string;
  items: PublicProofJudgeSummaryItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const status = (passed: boolean, failed = false): PublicProofJudgeSummaryItem["status"] =>
  passed ? "passed" : failed ? "failed" : "pending";

const shortHash = (value: string) => (value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value);

const firstOpenAction = (items: PublicProofJudgeSummaryItem[]) =>
  items.find((item) => item.status !== "passed")?.value ?? "This public proof is ready for judging.";

const buildSummary = (
  kind: PublicProofJudgeSummary["kind"],
  title: string,
  subtitle: string,
  primaryScore: string,
  cid: string,
  payloadHash: string,
  shareImage: string,
  publicUrl: string,
  items: PublicProofJudgeSummaryItem[],
): PublicProofJudgeSummary => {
  const passed = items.filter((item) => item.status === "passed").length;
  const ready = passed === items.length;
  const summary = `${title} · ${passed}/${items.length} judge checks · ${ready ? "ready" : "needs evidence"}`;
  const nextAction = firstOpenAction(items);
  const copyText = [
    "Kickoff Lock Agent public proof judge summary",
    `Type: ${kind}`,
    `Title: ${title}`,
    `Status: ${ready ? "ready" : "needs evidence"}`,
    `Score: ${primaryScore}`,
    `CID: ${cid}`,
    `Payload hash: ${payloadHash}`,
    `Share image: ${shareImage}`,
    `Public URL: ${publicUrl}`,
    `Next action: ${nextAction}`,
    ...items.map((item) => `${item.label}: ${item.status} · ${item.value}`),
  ].join("\n");

  return {
    kind,
    title,
    subtitle,
    ready,
    passed,
    total: items.length,
    primaryScore,
    cid,
    payloadHash,
    shareImage,
    publicUrl,
    items,
    summary,
    nextAction,
    copyText,
  };
};

export const buildRecordPublicProofJudgeSummary = (
  record: MemoryRecord,
  publicUrl: string,
  artifact?: ShareArtifactEvidence,
): PublicProofJudgeSummary => {
  const realProof = record.capsule.filecoinProof.mode === "real";
  const retrievable = ["retrievable", "verified"].includes(record.capsule.filecoinProof.proofStatus);
  const productionShare = isProductionShareArtifact(artifact);
  const publishableShare = isPublishableShareArtifact(artifact);
  const actual = record.result ? `${record.result.homeScore}-${record.result.awayScore}` : "pending";
  const primaryScore = record.result ? `${record.result.totalScore}/100` : "reveal pending";
  const prediction = `${record.capsule.prediction.homeScore}-${record.capsule.prediction.awayScore}`;
  const shareImage = artifact?.imageUrl ?? "not publicly hosted yet";
  const items: PublicProofJudgeSummaryItem[] = [
    {
      key: "lock",
      label: "Kickoff lock",
      status: status(record.capsule.locked && !record.capsule.lateLock, record.capsule.lateLock),
      value: record.capsule.lateLock ? "late practice lock" : "sealed before kickoff",
    },
    {
      key: "score",
      label: "Prediction result",
      status: status(Boolean(record.result)),
      value: `prediction ${prediction} · actual ${actual} · score ${primaryScore}`,
    },
    {
      key: "filecoin",
      label: "Filecoin CID",
      status: status(realProof && retrievable),
      value: realProof ? `${record.capsule.filecoinProof.proofStatus} · ${record.capsule.filecoinProof.cid}` : "demo proof needs real CID",
    },
    {
      key: "payload",
      label: "Payload hash",
      status: status(/^[a-f0-9]{64}$/i.test(record.capsule.payloadHash)),
      value: record.capsule.payloadHash,
    },
    {
      key: "share",
      label: "Share image",
      status: status(productionShare, Boolean(artifact) && !publishableShare),
      value: productionShare
        ? `${artifact?.fileName ?? "share card"} · ${artifact?.imageHash ?? "hash missing"}`
        : publishableShare
          ? "generated PNG needs deployed HTTPS image URL"
          : "generate and sync public PNG share card",
    },
    {
      key: "url",
      label: "Public URL",
      status: status(isProductionProofUrl(publicUrl)),
      value: publicUrl,
    },
  ];

  return buildSummary(
    "record",
    record.capsule.matchLabel,
    `Prediction ${prediction} · actual ${actual}`,
    primaryScore,
    record.capsule.filecoinProof.cid,
    shortHash(record.capsule.payloadHash),
    shareImage,
    publicUrl,
    items,
  );
};

export const buildModePublicProofJudgeSummary = (
  run: GameModeRun,
  publicUrl: string,
  artifact?: ShareArtifactEvidence,
): PublicProofJudgeSummary => {
  const realProof = run.filecoinProof.mode === "real";
  const retrievable = ["retrievable", "verified"].includes(run.filecoinProof.proofStatus);
  const productionShare = isProductionShareArtifact(artifact);
  const publishableShare = isPublishableShareArtifact(artifact);
  const primaryScore = run.score !== undefined ? `${run.score}/100` : run.status;
  const shareImage = artifact?.imageUrl ?? "not publicly hosted yet";
  const items: PublicProofJudgeSummaryItem[] = [
    {
      key: "lock",
      label: "Linked locks",
      status: status(run.capsuleIds.length > 0),
      value: `${run.capsuleIds.length} capsule${run.capsuleIds.length === 1 ? "" : "s"} linked`,
    },
    {
      key: "score",
      label: "Mode result",
      status: status(run.status === "sealed" || run.status === "scored"),
      value: `${run.modeId} · ${run.status} · ${primaryScore}`,
    },
    {
      key: "filecoin",
      label: "Filecoin CID",
      status: status(realProof && retrievable),
      value: realProof ? `${run.filecoinProof.proofStatus} · ${run.filecoinProof.cid}` : "demo proof needs real CID",
    },
    {
      key: "payload",
      label: "Payload hash",
      status: status(/^[a-f0-9]{64}$/i.test(run.payloadHash)),
      value: run.payloadHash,
    },
    {
      key: "share",
      label: "Share image",
      status: status(productionShare, Boolean(artifact) && !publishableShare),
      value: productionShare
        ? `${artifact?.fileName ?? "mode card"} · ${artifact?.imageHash ?? "hash missing"}`
        : publishableShare
          ? "generated PNG needs deployed HTTPS image URL"
          : "generate and sync public PNG mode share card",
    },
    {
      key: "url",
      label: "Public URL",
      status: status(isProductionProofUrl(publicUrl)),
      value: publicUrl,
    },
  ];

  return buildSummary(
    "mode",
    run.title,
    `${run.modeId} · ${run.status}`,
    primaryScore,
    run.filecoinProof.cid,
    shortHash(run.payloadHash),
    shareImage,
    publicUrl,
    items,
  );
};
