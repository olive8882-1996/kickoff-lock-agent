import { isProductionProofUrl, isProductionShareArtifact, isPublishableShareArtifact } from "./shareCard";
import type { PublicProofMeta } from "./publicProofMeta";
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

const sameUrl = (left?: string, right?: string) => {
  if (!left || !right) return false;
  try {
    return new URL(left).toString() === new URL(right).toString();
  } catch {
    return false;
  }
};

const textReady = (value?: string) => Boolean(value?.trim() && value.trim().length >= 8);

const artifactMatchesProofTarget = (
  artifact: ShareArtifactEvidence | undefined,
  kind: ShareArtifactEvidence["kind"],
  id: string,
  publicUrl: string,
) => artifact?.kind === kind && artifact.id === id && sameUrl(artifact.proofUrl, publicUrl);

const socialMetaItem = (
  meta: PublicProofMeta | undefined,
  expectedKind: PublicProofMeta["kind"],
  publicUrl: string,
): PublicProofScorecardItem => {
  const passed = Boolean(
    meta &&
      meta.kind === expectedKind &&
      textReady(meta.title) &&
      textReady(meta.description) &&
      sameUrl(meta.canonicalUrl, publicUrl) &&
      meta.twitterCard === "summary_large_image" &&
      isProductionProofUrl(meta.imageUrl) &&
      meta.imageManifest?.imageUrl === meta.imageUrl &&
      /^[a-f0-9]{64}$/i.test(meta.imageManifest?.imageHash ?? "") &&
      (meta.imageManifest?.imageByteLength ?? 0) > 10_000 &&
      String(meta.imageManifest?.imageMime ?? "").startsWith("image/"),
  );
  return {
    key: "social-meta",
    label: "Social preview meta",
    status: status(passed),
    detail: passed
      ? "Canonical URL, title, description, X card and production image are ready."
      : "Attach canonical Open Graph/Twitter metadata with a generated production HTTPS share image manifest.",
  };
};

const structuredDataItem = (
  meta: PublicProofMeta | undefined,
  {
    expectedKind,
    publicUrl,
    identifier,
    payloadHash,
    cid,
  }: {
    expectedKind: PublicProofMeta["kind"];
    publicUrl: string;
    identifier: string;
    payloadHash: string;
    cid: string;
  },
): PublicProofScorecardItem => {
  const jsonLd = meta?.jsonLd ?? {};
  const associatedMedia = jsonLd.associatedMedia as Record<string, unknown> | undefined;
  const mediaUrl = String(associatedMedia?.contentUrl ?? associatedMedia?.url ?? "");
  const passed = Boolean(
    meta &&
      meta.kind === expectedKind &&
      jsonLd["@type"] === "CreativeWork" &&
      jsonLd.identifier === identifier &&
      jsonLd.sha256 === payloadHash &&
      jsonLd.isBasedOn === cid &&
      sameUrl(String(jsonLd.url ?? ""), publicUrl) &&
      sameUrl(String(jsonLd.image ?? ""), meta.imageUrl) &&
      sameUrl(mediaUrl, meta.imageUrl) &&
      /^[a-f0-9]{64}$/i.test(String(associatedMedia?.sha256 ?? "")) &&
      Number(associatedMedia?.contentSize ?? 0) > 10_000 &&
      String(associatedMedia?.encodingFormat ?? "").startsWith("image/"),
  );
  return {
    key: "json-ld",
    label: "JSON-LD proof data",
    status: status(passed),
    detail: passed
      ? "Structured proof data links the URL, CID, payload hash and social image."
      : "Embed JSON-LD CreativeWork data with matching URL, CID, payload hash and generated image evidence.",
  };
};

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
  meta?: PublicProofMeta,
): PublicProofScorecard => {
  const realProof = record.capsule.filecoinProof.mode === "real";
  const retrievable = ["retrievable", "verified"].includes(record.capsule.filecoinProof.proofStatus);
  const publishableShare = isPublishableShareArtifact(artifact);
  const currentArtifact = artifactMatchesProofTarget(artifact, "record", record.capsule.id, publicUrl);
  const productionShare = isProductionShareArtifact(artifact) && currentArtifact;
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
        : publishableShare && !currentArtifact
          ? "Generated PNG belongs to another public proof target."
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
    socialMetaItem(meta, "record", publicUrl),
    structuredDataItem(meta, {
      expectedKind: "record",
      publicUrl,
      identifier: record.capsule.id,
      payloadHash: record.capsule.payloadHash,
      cid: record.capsule.filecoinProof.cid,
    }),
  ];
  return buildScorecard("record", record.capsule.matchLabel, items, publishableShare);
};

export const buildModePublicProofScorecard = (
  run: GameModeRun,
  publicUrl: string,
  artifact?: ShareArtifactEvidence,
  meta?: PublicProofMeta,
): PublicProofScorecard => {
  const realProof = run.filecoinProof.mode === "real";
  const retrievable = ["retrievable", "verified"].includes(run.filecoinProof.proofStatus);
  const publishableShare = isPublishableShareArtifact(artifact);
  const currentArtifact = artifactMatchesProofTarget(artifact, "mode", run.id, publicUrl);
  const productionShare = isProductionShareArtifact(artifact) && currentArtifact;
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
        : publishableShare && !currentArtifact
          ? "Generated PNG belongs to another public proof target."
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
    socialMetaItem(meta, "mode", publicUrl),
    structuredDataItem(meta, {
      expectedKind: "mode",
      publicUrl,
      identifier: run.id,
      payloadHash: run.payloadHash,
      cid: run.filecoinProof.cid,
    }),
  ];
  return buildScorecard("mode", run.title, items, publishableShare);
};
