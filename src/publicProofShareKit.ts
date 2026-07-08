import { isProductionProofUrl, isProductionShareArtifact, isPublishableShareArtifact } from "./shareCard";
import { buildModeProofShareText, buildModeXIntentUrl, buildProofShareText, buildXIntentUrl } from "./shareCard";
import {
  hasProductionShareChannelEvidence,
  productionShareChannelProblem,
  validXIntentForProof,
  xIntentProblemForProof,
} from "./shareChannelValidation";
import {
  buildShareArtifactReadBackCommand,
  buildShareIntentAuditPacket,
  type ShareIntentAuditPacket,
} from "./sharePublishing";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

export type PublicProofShareKitAction = {
  key: "verify" | "image" | "x" | "channel" | "copy";
  label: string;
  status: "ready" | "pending";
  detail: string;
};

export type PublicProofPublicationPayload = {
  id: string;
  kind: "record" | "mode";
  proof_url: string;
  image_generated: boolean;
  generated_at: string | null;
  file_name: string | null;
  image_url: string | null;
  image_mime: string | null;
  image_byte_length: number | null;
  image_hash: string | null;
  x_intent_url: string;
  x_intent_opened_at: string | null;
  native_share_opened_at: string | null;
};

export type PublicProofAcceptanceCheck = {
  key:
    | "proof-url"
    | "image-manifest"
    | "image-url"
    | "proof-match"
    | "artifact-target"
    | "x-intent"
    | "channel-opened"
    | "supabase-readback";
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
  nextAction: string;
};

export type PublicProofPublicationPackage = {
  id: string;
  kind: "record" | "mode";
  table: "kickoff_share_artifacts";
  status: "missing-image" | "needs-hosting" | "ready-to-open" | "published";
  ready: boolean;
  publishReady: boolean;
  channelReady: boolean;
  payload: PublicProofPublicationPayload;
  acceptance: {
    proofUrlProduction: boolean;
    imageManifest: boolean;
    imageUrlProduction: boolean;
    artifactMatchesProof: boolean;
    artifactMatchesTarget: boolean;
    xIntentValid: boolean;
    channelOpened: boolean;
  };
  acceptanceChecklist: PublicProofAcceptanceCheck[];
  blockers: string[];
  summary: string;
  nextAction: string;
  copyText: string;
};

export type PublicProofShareKit = {
  id: string;
  kind: "record" | "mode";
  title: string;
  status: "ready" | "needs-image" | "needs-production-url";
  headline: string;
  proofUrl: string;
  imageUrl: string;
  xIntentUrl: string;
  copyText: string;
  artifactLabel: string;
  intentAudit: ShareIntentAuditPacket;
  publicationPackage: PublicProofPublicationPackage;
  actions: PublicProofShareKitAction[];
  summary: string;
};

export type PublicProofPublicationLedgerRow = {
  id: string;
  kind: PublicProofShareKit["kind"];
  title: string;
  status: PublicProofPublicationPackage["status"];
  publishReady: boolean;
  channelReady: boolean;
  readBackReady: boolean;
  proofUrl: string;
  imageUrl: string;
  xIntentUrl: string;
  passedChecks: number;
  totalChecks: number;
  blockers: string[];
  readBackCommand: string;
  action: string;
};

export type PublicProofPublicationLedger = {
  ready: boolean;
  totalTargets: number;
  recordTargets: number;
  modeTargets: number;
  publishReady: number;
  channelReady: number;
  readBackReady: number;
  missingImages: number;
  missingProductionUrls: number;
  blockers: string[];
  rows: PublicProofPublicationLedgerRow[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const artifactLabel = (artifact?: ShareArtifactEvidence) => {
  if (isProductionShareArtifact(artifact)) return "production image";
  if (isPublishableShareArtifact(artifact)) return "local PNG manifest";
  return "missing share image";
};

const artifactMatchesProof = (proofUrl: string, artifact?: ShareArtifactEvidence) =>
  Boolean(artifact?.proofUrl && artifact.proofUrl === proofUrl);

const artifactMatchesTarget = (
  id: string,
  kind: PublicProofShareKit["kind"],
  proofUrl: string,
  artifact?: ShareArtifactEvidence,
) => Boolean(artifact?.id === id && artifact.kind === kind && artifactMatchesProof(proofUrl, artifact));

const buildStatus = (
  id: string,
  kind: PublicProofShareKit["kind"],
  proofUrl: string,
  artifact?: ShareArtifactEvidence,
): PublicProofShareKit["status"] => {
  if (!isPublishableShareArtifact(artifact)) return "needs-image";
  if (
    !isProductionProofUrl(proofUrl) ||
    !isProductionShareArtifact(artifact) ||
    !artifactMatchesTarget(id, kind, proofUrl, artifact)
  ) {
    return "needs-production-url";
  }
  return "ready";
};

const shareChannelRow = (proofUrl: string, artifact: ShareArtifactEvidence | undefined, xIntentUrl: string) => ({
  proof_url: proofUrl,
  x_intent_url: xIntentUrl,
  generated_at: artifact?.generatedAt,
  x_intent_opened_at: artifact?.xIntentOpenedAt,
  native_share_opened_at: artifact?.nativeShareOpenedAt,
});

const buildActions = (
  id: string,
  kind: PublicProofShareKit["kind"],
  proofUrl: string,
  artifact: ShareArtifactEvidence | undefined,
  xIntentUrl: string,
): PublicProofShareKitAction[] => {
  const productionProof = isProductionProofUrl(proofUrl);
  const productionArtifact = isProductionShareArtifact(artifact) && artifactMatchesTarget(id, kind, proofUrl, artifact);
  const channelRow = shareChannelRow(proofUrl, artifact, xIntentUrl);
  const xIntentValid = validXIntentForProof(channelRow);
  const xIntentProblem = xIntentProblemForProof(channelRow);
  const xReady = Boolean(productionProof && productionArtifact && xIntentValid);
  const channelOpened = Boolean(productionArtifact && hasProductionShareChannelEvidence(channelRow));
  const channelProblem = productionShareChannelProblem(channelRow);
  const channelDetail = channelOpened && artifact?.nativeShareOpenedAt
    ? `Native share opened at ${artifact.nativeShareOpenedAt}.`
    : channelOpened && artifact?.xIntentOpenedAt
      ? `X intent opened at ${artifact.xIntentOpenedAt}.`
      : xReady
        ? "Open the X intent or native share sheet to save channel evidence."
        : channelProblem || "Production proof and image URLs are required before channel evidence can be collected.";
  return [
    {
      key: "verify",
      label: "Open public proof",
      status: productionProof ? "ready" : "pending",
      detail: proofUrl,
    },
    {
      key: "image",
      label: "Use share image",
      status: isPublishableShareArtifact(artifact) ? "ready" : "pending",
      detail: artifact?.imageUrl ?? artifact?.fileName ?? "Generate a public PNG share card.",
    },
    {
      key: "x",
      label: "Post to X",
      status: xReady ? "ready" : "pending",
      detail: xReady
        ? xIntentUrl
        : productionProof && productionArtifact
          ? xIntentProblem
          : "Publish matching HTTPS proof/image URLs and a valid X intent before opening X.",
    },
    {
      key: "channel",
      label: "Share channel evidence",
      status: channelOpened ? "ready" : "pending",
      detail: channelDetail,
    },
    {
      key: "copy",
      label: "Copy proof text",
      status: "ready",
      detail: "Prepared copy includes prediction, score, CID, and verifier URL.",
    },
  ];
};

const buildPublicationPackage = (
  id: string,
  kind: PublicProofShareKit["kind"],
  title: string,
  proofUrl: string,
  artifact: ShareArtifactEvidence | undefined,
  xIntentUrl: string,
): PublicProofPublicationPackage => {
  const channelRow = shareChannelRow(proofUrl, artifact, xIntentUrl);
  const proofUrlProduction = isProductionProofUrl(proofUrl);
  const imageManifest = isPublishableShareArtifact(artifact);
  const imageUrlProduction = isProductionShareArtifact(artifact);
  const matchesProof = artifactMatchesProof(proofUrl, artifact);
  const matchesTarget = artifactMatchesTarget(id, kind, proofUrl, artifact);
  const xIntentValid = validXIntentForProof(channelRow);
  const xIntentProblem = xIntentProblemForProof(channelRow);
  const channelOpened = Boolean(imageUrlProduction && matchesTarget && hasProductionShareChannelEvidence(channelRow));
  const publishReady = Boolean(proofUrlProduction && imageManifest && imageUrlProduction && matchesTarget && xIntentValid);
  const ready = Boolean(publishReady && channelOpened);
  const acceptanceChecklist: PublicProofAcceptanceCheck[] = [
    {
      key: "proof-url",
      label: "Deployed proof URL",
      passed: proofUrlProduction,
      expected: "Public HTTPS proof URL",
      actual: proofUrl || "missing",
      nextAction: "Deploy the public proof page and pass its HTTPS verifier URL.",
    },
    {
      key: "image-manifest",
      label: "PNG card manifest",
      passed: imageManifest,
      expected: "Generated PNG manifest with byte length and SHA-256 hash",
      actual: imageManifest
        ? `${artifact?.imageMime} · ${artifact?.imageByteLength} bytes · ${artifact?.imageHash?.slice(0, 12)}...`
        : "missing",
      nextAction: "Generate the share card PNG manifest.",
    },
    {
      key: "image-url",
      label: "Hosted image URL",
      passed: imageUrlProduction,
      expected: "Public HTTPS PNG, JPEG or WebP URL",
      actual: artifact?.imageUrl ?? "missing",
      nextAction: "Upload the PNG to public storage and sync the artifact image URL.",
    },
    {
      key: "proof-match",
      label: "Card matches proof",
      passed: matchesProof,
      expected: "Artifact proof URL equals the opened public proof URL",
      actual: artifact?.proofUrl ?? "missing",
      nextAction: "Regenerate or sync the share artifact with the current proof URL.",
    },
    {
      key: "artifact-target",
      label: "Artifact target",
      passed: matchesTarget,
      expected: `Artifact kind/id equals ${kind}:${id}`,
      actual: artifact ? `${artifact.kind}:${artifact.id}` : "missing",
      nextAction: "Regenerate or sync the share artifact for the current public proof target.",
    },
    {
      key: "x-intent",
      label: "X intent URL",
      passed: xIntentValid,
      expected: "Intent includes compact proof text, proof URL parameter and KickoffLock/Filecoin/WorldCup hashtags",
      actual: xIntentUrl || "missing",
      nextAction: "Regenerate the X intent URL from the current proof URL.",
    },
    {
      key: "channel-opened",
      label: "Channel opened",
      passed: channelOpened,
      expected: "X intent or native share opened after card generation",
      actual: artifact?.nativeShareOpenedAt ?? artifact?.xIntentOpenedAt ?? "missing",
      nextAction: "Open the X intent or native share sheet and sync the opened timestamp.",
    },
    {
      key: "supabase-readback",
      label: "Supabase read-back",
      passed: ready,
      expected: "kickoff_share_artifacts row can be read back with proof, image and channel evidence",
      actual: ready ? "ready for read-back" : "pending required checks",
      nextAction: "Run the sharing doctor after the row is synced.",
    },
  ];
  const blockers = [
    !imageManifest ? "Generate a PNG share image manifest." : "",
    !proofUrlProduction ? "Use a deployed HTTPS public proof URL." : "",
    imageManifest && !imageUrlProduction ? "Upload the PNG to a public HTTPS image URL." : "",
    imageManifest && !matchesProof ? "Regenerate or sync the card with the current proof URL." : "",
    imageManifest && matchesProof && !matchesTarget ? "Regenerate or sync the card for the current proof target." : "",
    publishReady && !channelOpened ? "Open the X intent or native share sheet and sync the opened timestamp." : "",
    proofUrlProduction && imageUrlProduction && !xIntentValid
      ? `Regenerate the X intent with matching compact proof text: ${xIntentProblem}.`
      : "",
  ].filter(Boolean);
  const status: PublicProofPublicationPackage["status"] = ready
    ? "published"
    : publishReady
      ? "ready-to-open"
      : imageManifest
        ? "needs-hosting"
        : "missing-image";
  const payload: PublicProofPublicationPayload = {
    id,
    kind,
    proof_url: proofUrl,
    image_generated: Boolean(artifact?.imageGenerated),
    generated_at: artifact?.generatedAt ?? null,
    file_name: artifact?.fileName ?? null,
    image_url: artifact?.imageUrl ?? null,
    image_mime: artifact?.imageMime ?? null,
    image_byte_length: artifact?.imageByteLength ?? null,
    image_hash: artifact?.imageHash ?? null,
    x_intent_url: xIntentUrl,
    x_intent_opened_at: artifact?.xIntentOpenedAt ?? null,
    native_share_opened_at: artifact?.nativeShareOpenedAt ?? null,
  };
  const summary = `${title} · ${status} · ${blockers.length ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}` : "ready"}`;
  const nextAction = blockers[0] ?? "Share publication package is ready for Supabase read-back.";
  const copyText = [
    "Kickoff Lock Agent proof publication package",
    "Table: kickoff_share_artifacts",
    summary,
    `Next action: ${nextAction}`,
    "Acceptance checklist:",
    ...acceptanceChecklist.map(
      (check) => `- ${check.label}: ${check.passed ? "passed" : "pending"} · expected=${check.expected} · actual=${check.actual}`,
    ),
    JSON.stringify(payload, null, 2),
  ].join("\n");
  return {
    id,
    kind,
    table: "kickoff_share_artifacts",
    status,
    ready,
    publishReady,
    channelReady: channelOpened,
    payload,
    acceptance: {
      proofUrlProduction,
      imageManifest,
      imageUrlProduction,
      artifactMatchesProof: matchesProof,
      artifactMatchesTarget: matchesTarget,
      xIntentValid,
      channelOpened,
    },
    acceptanceChecklist,
    blockers,
    summary,
    nextAction,
    copyText,
  };
};

const buildKit = (
  id: string,
  kind: PublicProofShareKit["kind"],
  title: string,
  proofUrl: string,
  xIntentUrl: string,
  copyText: string,
  artifact?: ShareArtifactEvidence,
): PublicProofShareKit => {
  const status = buildStatus(id, kind, proofUrl, artifact);
  const imageUrl = artifact?.imageUrl ?? "";
  const label = artifactLabel(artifact);
  const intentAudit = buildShareIntentAuditPacket(artifact, xIntentUrl, title);
  const publicationPackage = buildPublicationPackage(id, kind, title, proofUrl, artifact, xIntentUrl);
  return {
    id,
    kind,
    title,
    status,
    headline:
      status === "ready"
        ? "Ready to publish and judge"
        : status === "needs-production-url"
          ? "Generated locally, needs deployed URLs"
          : "Generate share image before publishing",
    proofUrl,
    imageUrl,
    xIntentUrl,
    copyText,
    artifactLabel: label,
    intentAudit,
    publicationPackage,
    actions: buildActions(id, kind, proofUrl, artifact, xIntentUrl),
    summary: `${title} · ${label} · ${status}`,
  };
};

export const buildRecordPublicProofShareKit = (
  record: MemoryRecord,
  proofUrl: string,
  artifact?: ShareArtifactEvidence,
): PublicProofShareKit =>
  buildKit(
    record.capsule.id,
    "record",
    record.capsule.matchLabel,
    proofUrl,
    artifact?.xIntentUrl ?? buildXIntentUrl(record, proofUrl),
    buildProofShareText(record, proofUrl),
    artifact,
  );

export const buildModePublicProofShareKit = (
  run: GameModeRun,
  proofUrl: string,
  artifact?: ShareArtifactEvidence,
): PublicProofShareKit =>
  buildKit(
    run.id,
    "mode",
    run.title,
    proofUrl,
    artifact?.xIntentUrl ?? buildModeXIntentUrl(run, proofUrl),
    buildModeProofShareText(run, proofUrl),
    artifact,
  );

export const buildPublicProofPublicationLedger = (kits: PublicProofShareKit[]): PublicProofPublicationLedger => {
  const rows = kits.map<PublicProofPublicationLedgerRow>((kit) => {
    const passedChecks = kit.publicationPackage.acceptanceChecklist.filter((check) => check.passed).length;
    const firstOpenCheck = kit.publicationPackage.acceptanceChecklist.find((check) => !check.passed);
    return {
      id: kit.id,
      kind: kit.kind,
      title: kit.title,
      status: kit.publicationPackage.status,
      publishReady: kit.publicationPackage.publishReady,
      channelReady: kit.publicationPackage.channelReady,
      readBackReady: kit.publicationPackage.ready,
      proofUrl: kit.proofUrl,
      imageUrl: kit.imageUrl,
      xIntentUrl: kit.xIntentUrl,
      passedChecks,
      totalChecks: kit.publicationPackage.acceptanceChecklist.length,
      blockers: kit.publicationPackage.blockers,
      readBackCommand: buildShareArtifactReadBackCommand(kit.id, kit.kind),
      action: firstOpenCheck?.nextAction ?? "Run the sharing doctor and keep the Supabase row readable.",
    };
  });
  const totalTargets = rows.length;
  const recordTargets = rows.filter((row) => row.kind === "record").length;
  const modeTargets = rows.filter((row) => row.kind === "mode").length;
  const publishReady = rows.filter((row) => row.publishReady).length;
  const channelReady = rows.filter((row) => row.channelReady).length;
  const readBackReady = rows.filter((row) => row.readBackReady).length;
  const missingImages = rows.filter((row) => row.status === "missing-image").length;
  const missingProductionUrls = rows.filter((row) => row.status === "needs-hosting").length;
  const blockers = rows.flatMap((row) => row.blockers.map((blocker) => `${row.kind}:${row.id} ${blocker}`));
  const ready = totalTargets > 0 && readBackReady === totalTargets;
  const nextAction = ready
    ? "All public proof share cards are published, opened and ready for Supabase read-back."
    : totalTargets === 0
      ? "Create record or mode proofs before building public share cards."
      : blockers[0] ?? rows.find((row) => !row.readBackReady)?.action ?? "Run the sharing doctor after syncing rows.";
  const summary = `${readBackReady}/${totalTargets} share cards read-back ready · records ${recordTargets} · modes ${modeTargets} · publish ${publishReady}/${totalTargets} · opened ${channelReady}/${totalTargets}`;
  const copyText = [
    "Kickoff Lock Agent public proof publication ledger",
    `Ready: ${ready ? "yes" : "no"}`,
    summary,
    `Next action: ${nextAction}`,
    ...rows.map((row) =>
      [
        `- ${row.kind}:${row.id} · ${row.status} · checks ${row.passedChecks}/${row.totalChecks}`,
        `  proof: ${row.proofUrl || "missing"}`,
        `  image: ${row.imageUrl || "missing"}`,
        `  x-intent: ${row.xIntentUrl || "missing"}`,
        `  read-back: ${row.readBackCommand}`,
        `  action: ${row.action}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready,
    totalTargets,
    recordTargets,
    modeTargets,
    publishReady,
    channelReady,
    readBackReady,
    missingImages,
    missingProductionUrls,
    blockers,
    rows,
    summary,
    nextAction,
    copyText,
  };
};
