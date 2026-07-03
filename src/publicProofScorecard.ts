import { isProductionProofUrl, isProductionShareArtifact, isPublishableShareArtifact } from "./shareCard";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

export type PublicProofScorecardItem = {
  key: string;
  label: string;
  status: "passed" | "pending" | "failed";
  detail: string;
};

export type PublicProofScorecard = {
  kind: "record" | "mode";
  title: string;
  passed: number;
  total: number;
  productionReady: boolean;
  shareReady: boolean;
  items: PublicProofScorecardItem[];
  summary: string;
  nextAction: string;
};

const status = (passed: boolean, failed = false): PublicProofScorecardItem["status"] =>
  passed ? "passed" : failed ? "failed" : "pending";

const firstOpenAction = (items: PublicProofScorecardItem[]) =>
  items.find((item) => item.status !== "passed")?.detail ?? "Public proof package is production-ready.";

const buildScorecard = (
  kind: PublicProofScorecard["kind"],
  title: string,
  items: PublicProofScorecardItem[],
  shareReady: boolean,
): PublicProofScorecard => {
  const passed = items.filter((item) => item.status === "passed").length;
  const productionReady = passed === items.length;
  return {
    kind,
    title,
    passed,
    total: items.length,
    productionReady,
    shareReady,
    items,
    summary: `${title} · ${passed}/${items.length} public proof checks · ${productionReady ? "production-ready" : "needs evidence"}`,
    nextAction: firstOpenAction(items),
  };
};

export const buildRecordPublicProofScorecard = (
  record: MemoryRecord,
  publicUrl: string,
  artifact?: ShareArtifactEvidence,
): PublicProofScorecard => {
  const realProof = record.capsule.filecoinProof.mode === "real";
  const retrievable = ["retrievable", "verified"].includes(record.capsule.filecoinProof.proofStatus);
  const publishableShare = isPublishableShareArtifact(artifact);
  const productionShare = isProductionShareArtifact(artifact);
  const items: PublicProofScorecardItem[] = [
    {
      key: "lock",
      label: "Lock timing",
      status: status(record.capsule.locked && !record.capsule.lateLock, record.capsule.lateLock),
      detail: record.capsule.lateLock ? "Prediction was locked after kickoff." : "Prediction locked before kickoff.",
    },
    {
      key: "payload",
      label: "Payload hash",
      status: status(/^[a-f0-9]{64}$/i.test(record.capsule.payloadHash)),
      detail: record.capsule.payloadHash,
    },
    {
      key: "filecoin",
      label: "Filecoin proof",
      status: status(realProof && retrievable),
      detail: realProof ? `${record.capsule.filecoinProof.proofStatus} · ${record.capsule.filecoinProof.cid}` : "Demo proof still needs a real CID.",
    },
    {
      key: "result",
      label: "Result reveal",
      status: status(Boolean(record.result)),
      detail: record.result ? `${record.result.totalScore}/100 scored result` : "Reveal final score before publishing as a completed proof.",
    },
    {
      key: "share",
      label: "Share image manifest",
      status: status(productionShare, !publishableShare && Boolean(artifact)),
      detail: productionShare
        ? `${artifact?.fileName ?? "share card"} · public image read-back candidate`
        : publishableShare
          ? "Generated PNG exists, but proof/image URLs are not deployed HTTPS URLs yet."
          : "Generate and sync a PNG share manifest.",
    },
    {
      key: "url",
      label: "Deployed public URL",
      status: status(isProductionProofUrl(publicUrl)),
      detail: isProductionProofUrl(publicUrl) ? publicUrl : "Use VITE_PUBLIC_APP_URL and deployed HTTPS proof links.",
    },
  ];
  return buildScorecard("record", record.capsule.matchLabel, items, publishableShare);
};

export const buildModePublicProofScorecard = (
  run: GameModeRun,
  publicUrl: string,
  artifact?: ShareArtifactEvidence,
): PublicProofScorecard => {
  const realProof = run.filecoinProof.mode === "real";
  const retrievable = ["retrievable", "verified"].includes(run.filecoinProof.proofStatus);
  const publishableShare = isPublishableShareArtifact(artifact);
  const productionShare = isProductionShareArtifact(artifact);
  const items: PublicProofScorecardItem[] = [
    {
      key: "mode",
      label: "Mode proof",
      status: status(run.status === "sealed" || run.status === "scored"),
      detail: `${run.modeId} · ${run.status}`,
    },
    {
      key: "payload",
      label: "Payload hash",
      status: status(/^[a-f0-9]{64}$/i.test(run.payloadHash)),
      detail: run.payloadHash,
    },
    {
      key: "filecoin",
      label: "Filecoin proof",
      status: status(realProof && retrievable),
      detail: realProof ? `${run.filecoinProof.proofStatus} · ${run.filecoinProof.cid}` : "Demo proof still needs a real CID.",
    },
    {
      key: "linked-locks",
      label: "Linked locks",
      status: status(run.capsuleIds.length > 0),
      detail: `${run.capsuleIds.length} capsule${run.capsuleIds.length === 1 ? "" : "s"} linked`,
    },
    {
      key: "share",
      label: "Share image manifest",
      status: status(productionShare, !publishableShare && Boolean(artifact)),
      detail: productionShare
        ? `${artifact?.fileName ?? "mode card"} · public image read-back candidate`
        : publishableShare
          ? "Generated PNG exists, but proof/image URLs are not deployed HTTPS URLs yet."
          : "Generate and sync a PNG mode share manifest.",
    },
    {
      key: "url",
      label: "Deployed public URL",
      status: status(isProductionProofUrl(publicUrl)),
      detail: isProductionProofUrl(publicUrl) ? publicUrl : "Use VITE_PUBLIC_APP_URL and deployed HTTPS mode proof links.",
    },
  ];
  return buildScorecard("mode", run.title, items, publishableShare);
};
