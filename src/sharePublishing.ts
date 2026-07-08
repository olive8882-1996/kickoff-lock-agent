import {
  buildModeXIntentUrl,
  buildXIntentUrl,
  isProductionProofUrl,
  isProductionShareArtifact,
  isPublishableShareArtifact,
} from "./shareCard";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { productionShareChannelProblem, validXIntentForProof, xIntentProblemForProof } from "./shareChannelValidation";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

export type SharePublishQueueItem = {
  id: string;
  kind: ShareArtifactEvidence["kind"];
  label: string;
  hasManifest: boolean;
  hasProductionUrl: boolean;
};

export type SharePublishQueue = {
  totalArtifacts: number;
  publishable: number;
  productionReady: number;
  missingProduction: number;
  items: SharePublishQueueItem[];
  summary: string;
  nextAction: string;
};

export type ShareChannelQueueItem = {
  id: string;
  kind: ShareArtifactEvidence["kind"];
  label: string;
  runnable: boolean;
  hasXIntent: boolean;
  channelOpened: boolean;
  reason: string;
};

export type ShareChannelQueue = {
  totalArtifacts: number;
  productionCards: number;
  openedChannels: number;
  runnable: number;
  items: ShareChannelQueueItem[];
  summary: string;
  nextAction: string;
};

export type ShareChannelEvidenceRow = {
  id: string;
  kind: ShareArtifactEvidence["kind"];
  label: string;
  status: "published" | "ready-to-open" | "needs-x-intent" | "needs-production-card" | "missing-card";
  publishable: boolean;
  productionReady: boolean;
  channelOpened: boolean;
  channel: "x" | "native" | "none";
  proofUrl: string;
  imageUrl: string;
  xIntentUrl: string;
  openCommand: string;
  readBackCommand: string;
  action: string;
};

export type ShareChannelEvidencePacket = {
  ready: boolean;
  totalArtifacts: number;
  productionCards: number;
  openedChannels: number;
  readyToOpen: number;
  missingProductionCards: number;
  rows: ShareChannelEvidenceRow[];
  summary: string;
  nextAction: string;
  copyText: string;
};

export type ShareIntentAuditItem = {
  key: "proof-url" | "image-url" | "image-metadata" | "x-intent" | "share-opened";
  label: string;
  status: "passed" | "pending" | "failed";
  detail: string;
  action: string;
};

export type ShareIntentAuditPacket = {
  ready: boolean;
  publishReady: boolean;
  channelReady: boolean;
  label: string;
  proofUrl: string;
  imageUrl: string;
  xIntentUrl: string;
  checks: ShareIntentAuditItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

export type OpenedShareChannelArtifacts = {
  evidence: ShareArtifactEvidence[];
  opened: ShareArtifactEvidence[];
  skipped: ShareChannelQueueItem[];
};

export type ShareChannelOpenMode = "x" | "native";

const artifactFor = (evidence: ShareArtifactEvidence[], id: string, kind: ShareArtifactEvidence["kind"]) =>
  evidence.find((item) => item.id === id && item.kind === kind);

const shareRows = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  evidence: ShareArtifactEvidence[],
) => [
  ...records.map((record) => ({
    id: record.capsule.id,
    kind: "record" as const,
    label: record.capsule.matchLabel,
    xIntentUrl: (artifact?: ShareArtifactEvidence) => artifact?.xIntentUrl ?? buildXIntentUrl(record, artifact?.proofUrl ?? ""),
    artifact: artifactFor(evidence, record.capsule.id, "record"),
  })),
  ...modeRuns.map((run) => ({
    id: run.id,
    kind: "mode" as const,
    label: run.title,
    xIntentUrl: (artifact?: ShareArtifactEvidence) => artifact?.xIntentUrl ?? buildModeXIntentUrl(run, artifact?.proofUrl ?? ""),
    artifact: artifactFor(evidence, run.id, "mode"),
  })),
];

export const isProductionShareCardEvidence = (artifact?: ShareArtifactEvidence) =>
  Boolean(
    isProductionShareArtifact(artifact) &&
      !publicShareImageUrlProblem(artifact?.imageUrl ?? "", "Share image URL"),
  );

const validIsoTimestamp = (value?: string) => {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
};

const TIMESTAMP_FUTURE_TOLERANCE_MS = 60_000;

const timestampIsNotFuture = (value?: string, now = Date.now()) =>
  validIsoTimestamp(value) && Date.parse(value ?? "") <= now + TIMESTAMP_FUTURE_TOLERANCE_MS;

const openedTimestampProblem = (artifact?: ShareArtifactEvidence) => {
  const openedAt = artifact?.nativeShareOpenedAt ?? artifact?.xIntentOpenedAt;
  if (!openedAt) return "not opened";
  if (!validIsoTimestamp(openedAt)) return "opened timestamp is invalid";
  if (validIsoTimestamp(artifact?.generatedAt) && Date.parse(openedAt) < Date.parse(artifact?.generatedAt ?? "")) {
    return "opened timestamp is before card generation";
  }
  if (!timestampIsNotFuture(openedAt)) return "opened timestamp is in the future";
  return "";
};

const openedAfterGenerated = (artifact: ShareArtifactEvidence, openedAt?: string) => {
  if (!validIsoTimestamp(openedAt)) return false;
  if (!timestampIsNotFuture(openedAt)) return false;
  if (!validIsoTimestamp(artifact.generatedAt)) return true;
  return Date.parse(openedAt ?? "") >= Date.parse(artifact.generatedAt ?? "");
};

const intentCheckStatus = (passed: boolean, failed = false): ShareIntentAuditItem["status"] =>
  passed ? "passed" : failed ? "failed" : "pending";

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

export const buildShareArtifactReadBackCommand = (
  id: string,
  kind: ShareArtifactEvidence["kind"],
  target: Pick<ShareArtifactEvidence, "proofUrl" | "imageUrl" | "xIntentUrl"> | undefined = undefined,
) => {
  const query = new URLSearchParams({
    select: "id,kind,proof_url,image_url,image_hash,x_intent_url,x_intent_opened_at,native_share_opened_at,generated_at",
    id: `eq.${id}`,
    kind: `eq.${kind}`,
    limit: "1",
  });
  if (target?.proofUrl) query.set("proof_url", `eq.${target.proofUrl}`);
  if (target?.imageUrl) query.set("image_url", `eq.${target.imageUrl}`);
  if (target?.xIntentUrl) query.set("x_intent_url", `eq.${target.xIntentUrl}`);
  return [
    `curl -sS "$VITE_SUPABASE_URL/rest/v1/kickoff_share_artifacts?${query.toString()}"`,
    '-H "apikey: $VITE_SUPABASE_ANON_KEY"',
    '-H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"',
  ].join(" ");
};

export const buildShareIntentAuditPacket = (
  artifact: ShareArtifactEvidence | undefined,
  xIntentUrl = artifact?.xIntentUrl ?? "",
  label = artifact ? `${artifact.kind}:${artifact.id}` : "missing share artifact",
): ShareIntentAuditPacket => {
  const proofUrl = artifact?.proofUrl ?? "";
  const imageUrl = artifact?.imageUrl ?? "";
  const publishable = isPublishableShareArtifact(artifact);
  const productionImage = isProductionShareCardEvidence(artifact);
  const xIntentValid = isValidXIntentUrl(artifact, xIntentUrl);
  const xIntentProblem = xIntentProblemForProof({
    proof_url: proofUrl,
    x_intent_url: xIntentUrl,
    generated_at: artifact?.generatedAt,
    x_intent_opened_at: artifact?.xIntentOpenedAt,
    native_share_opened_at: artifact?.nativeShareOpenedAt,
  });
  const channelOpened = hasShareChannelEvidence(artifact);
  const openedAt = artifact?.nativeShareOpenedAt ?? artifact?.xIntentOpenedAt;
  const openedProblem = openedTimestampProblem(artifact);
  const checks: ShareIntentAuditItem[] = [
    {
      key: "proof-url",
      label: "Production proof URL",
      status: intentCheckStatus(isProductionProofUrl(proofUrl), Boolean(proofUrl)),
      detail: proofUrl || "missing",
      action: "Deploy the public proof page and use its HTTPS verifier URL.",
    },
    {
      key: "image-metadata",
      label: "PNG card manifest",
      status: intentCheckStatus(publishable, Boolean(artifact)),
      detail: publishable
        ? `${artifact?.imageMime} · ${artifact?.imageByteLength} bytes · ${artifact?.imageHash?.slice(0, 12)}...`
        : "imageGenerated, PNG mime, >10 KB byte length and SHA-256 hash are required",
      action: "Generate a PNG share card manifest before publishing.",
    },
    {
      key: "image-url",
      label: "Public image URL",
      status: intentCheckStatus(productionImage, Boolean(imageUrl)),
      detail: imageUrl || "missing",
      action: "Upload the PNG to a public HTTPS image URL and sync the manifest.",
    },
    {
      key: "x-intent",
      label: "X intent URL",
      status: intentCheckStatus(xIntentValid, Boolean(xIntentUrl)),
      detail: xIntentValid
        ? "intent includes compact proof text, proof URL parameter and required hashtags"
        : xIntentProblem || xIntentUrl || "missing",
      action: "Regenerate the X intent with compact proof text, proof URL and KickoffLock/Filecoin/WorldCup hashtags.",
    },
    {
      key: "share-opened",
      label: "Channel opened",
      status: intentCheckStatus(channelOpened, Boolean(openedAt)),
      detail: openedAt
        ? channelOpened
          ? `${artifact?.nativeShareOpenedAt ? "native share" : "X intent"} opened at ${openedAt}`
          : openedProblem
        : "not opened",
      action: "Open the X intent or native share sheet and sync the opened timestamp.",
    },
  ];
  const publishReady = checks.slice(0, 4).every((check) => check.status === "passed");
  const channelReady = channelOpened;
  const ready = publishReady && channelReady;
  const firstOpen = checks.find((check) => check.status !== "passed");
  const summary = `${label} · ${checks.filter((check) => check.status === "passed").length}/${checks.length} share intent checks · ${
    ready ? "ready" : publishReady ? "ready to open" : "needs publishing"
  }`;
  const nextAction = firstOpen?.action ?? "Share intent evidence is ready for production read-back.";
  const copyText = [
    "Kickoff Lock Agent share intent audit",
    summary,
    `Proof: ${proofUrl || "missing"}`,
    `Image: ${imageUrl || "missing"}`,
    `X intent: ${xIntentUrl || "missing"}`,
    `Next action: ${nextAction}`,
    ...checks.map((check) => `- ${check.label}: ${check.status} · ${check.detail}`),
  ].join("\n");
  return {
    ready,
    publishReady,
    channelReady,
    label,
    proofUrl,
    imageUrl,
    xIntentUrl,
    checks,
    summary,
    nextAction,
    copyText,
  };
};

export const isValidXIntentUrl = (artifact?: ShareArtifactEvidence, xIntentUrl = artifact?.xIntentUrl) => {
  if (!artifact || !xIntentUrl || !isProductionProofUrl(artifact.proofUrl)) return false;
  return validXIntentForProof({
    proof_url: artifact.proofUrl,
    x_intent_url: xIntentUrl,
    generated_at: artifact.generatedAt,
    x_intent_opened_at: artifact.xIntentOpenedAt,
    native_share_opened_at: artifact.nativeShareOpenedAt,
  });
};

export const hasShareChannelEvidence = (artifact?: ShareArtifactEvidence) =>
  Boolean(
    artifact &&
      isProductionShareCardEvidence(artifact) &&
      isValidXIntentUrl(artifact) &&
      (openedAfterGenerated(artifact, artifact.xIntentOpenedAt) || openedAfterGenerated(artifact, artifact.nativeShareOpenedAt)),
  );

export const buildSharePublishQueue = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  evidence: ShareArtifactEvidence[],
): SharePublishQueue => {
  const rows = shareRows(records, modeRuns, evidence);
  const publishable = rows.filter((row) => isPublishableShareArtifact(row.artifact)).length;
  const productionReady = rows.filter((row) => isProductionShareCardEvidence(row.artifact)).length;
  const items = rows
    .filter((row) => !isProductionShareCardEvidence(row.artifact))
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      label: row.label,
      hasManifest: isPublishableShareArtifact(row.artifact),
      hasProductionUrl: isProductionProofUrl(row.artifact?.imageUrl),
    }));
  const missingProduction = items.length;
  return {
    totalArtifacts: rows.length,
    publishable,
    productionReady,
    missingProduction,
    items,
    summary: `${productionReady}/${rows.length} production share cards · ${publishable}/${rows.length} PNG manifests`,
    nextAction:
      missingProduction === 0
        ? "All proof cards have production share evidence."
        : `Publish ${missingProduction} missing proof card${missingProduction === 1 ? "" : "s"} to Supabase Storage and sync share manifests.`,
  };
};

export const buildShareChannelQueue = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  evidence: ShareArtifactEvidence[],
): ShareChannelQueue => {
  const rows = shareRows(records, modeRuns, evidence);
  const productionCards = rows.filter((row) => isProductionShareCardEvidence(row.artifact)).length;
  const openedChannels = rows.filter((row) => hasShareChannelEvidence(row.artifact)).length;
  const items = rows
    .filter((row) => !hasShareChannelEvidence(row.artifact))
    .map<ShareChannelQueueItem>((row) => {
      const production = isProductionShareCardEvidence(row.artifact);
      const hasXIntent = isValidXIntentUrl(row.artifact);
      return {
        id: row.id,
        kind: row.kind,
        label: row.label,
        runnable: production,
        hasXIntent,
        channelOpened: false,
        reason: production
          ? hasXIntent
            ? "open saved X intent and sync channel timestamp"
            : "create X intent and sync channel timestamp"
          : "publish Supabase Storage proof card before opening share channel",
      };
    });
  const runnable = items.filter((item) => item.runnable).length;
  return {
    totalArtifacts: rows.length,
    productionCards,
    openedChannels,
    runnable,
    items,
    summary: `${openedChannels}/${rows.length} share channels opened · ${productionCards}/${rows.length} production cards`,
    nextAction:
      items.length === 0
        ? "Every proof card has X/native share-channel evidence."
        : runnable > 0
          ? `Open ${runnable} missing X share channel${runnable === 1 ? "" : "s"} and sync artifacts.`
          : "Publish Supabase Storage proof cards before opening share channels.",
  };
};

export const buildOpenedShareChannelArtifacts = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  evidence: ShareArtifactEvidence[],
  openedAt = new Date().toISOString(),
  channel: ShareChannelOpenMode = "x",
): OpenedShareChannelArtifacts => {
  const rows = shareRows(records, modeRuns, evidence);
  const updated = new Map<string, ShareArtifactEvidence>();
  const opened: ShareArtifactEvidence[] = [];
  const skipped: ShareChannelQueueItem[] = [];

  for (const row of rows) {
    if (hasShareChannelEvidence(row.artifact)) continue;
    const production = isProductionShareCardEvidence(row.artifact);
    const hasXIntent = isValidXIntentUrl(row.artifact);
    if (!production || !row.artifact) {
      skipped.push({
        id: row.id,
        kind: row.kind,
        label: row.label,
        runnable: false,
        hasXIntent,
        channelOpened: false,
        reason: "publish Supabase Storage proof card before opening share channel",
      });
      continue;
    }
    const xIntentUrl = row.xIntentUrl(row.artifact);
    if (!isValidXIntentUrl(row.artifact, xIntentUrl)) {
      skipped.push({
        id: row.id,
        kind: row.kind,
        label: row.label,
        runnable: false,
        hasXIntent,
        channelOpened: false,
        reason: "create X intent and sync channel timestamp",
      });
      continue;
    }
    const next =
      channel === "native"
        ? {
            ...row.artifact,
            xIntentUrl,
            nativeShareOpenedAt: openedAt,
          }
        : {
            ...row.artifact,
            xIntentUrl,
            xIntentOpenedAt: openedAt,
          };
    updated.set(`${row.kind}:${row.id}`, next);
    opened.push(next);
  }

  return {
    evidence: [
      ...opened,
      ...evidence.filter((item) => !updated.has(`${item.kind}:${item.id}`)),
    ],
    opened,
    skipped,
  };
};

export const buildShareChannelEvidencePacket = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  evidence: ShareArtifactEvidence[],
): ShareChannelEvidencePacket => {
  const rows = shareRows(records, modeRuns, evidence).map<ShareChannelEvidenceRow>((row) => {
    const publishable = isPublishableShareArtifact(row.artifact);
    const productionReady = isProductionShareCardEvidence(row.artifact);
    const channelOpened = hasShareChannelEvidence(row.artifact);
    const channel = channelOpened ? (row.artifact?.nativeShareOpenedAt ? "native" : "x") : "none";
    const proofUrl = row.artifact?.proofUrl ?? "";
    const imageUrl = row.artifact?.imageUrl ?? "";
    const xIntentUrl = row.artifact && proofUrl ? row.xIntentUrl(row.artifact) : "";
    const xIntentValid = isValidXIntentUrl(row.artifact, xIntentUrl);
    const xIntentProblem = xIntentProblemForProof({
      proof_url: proofUrl,
      x_intent_url: xIntentUrl,
      generated_at: row.artifact?.generatedAt,
      x_intent_opened_at: row.artifact?.xIntentOpenedAt,
      native_share_opened_at: row.artifact?.nativeShareOpenedAt,
    });
    const status: ShareChannelEvidenceRow["status"] = channelOpened
      ? "published"
      : productionReady
        ? xIntentValid
          ? "ready-to-open"
          : "needs-x-intent"
        : publishable
          ? "needs-production-card"
          : "missing-card";
    return {
      id: row.id,
      kind: row.kind,
      label: row.label,
      status,
      publishable,
      productionReady,
      channelOpened,
      channel,
      proofUrl,
      imageUrl,
      xIntentUrl,
      openCommand: xIntentUrl ? `open ${shellSingleQuote(xIntentUrl)}` : "",
      readBackCommand: buildShareArtifactReadBackCommand(row.id, row.kind, row.artifact),
      action:
        status === "published"
          ? "Share channel timestamp is saved and ready for Supabase read-back."
          : status === "ready-to-open"
            ? "Open the X intent or native share sheet, then sync the updated manifest."
            : status === "needs-x-intent"
              ? `Regenerate the X intent: ${xIntentProblem || productionShareChannelProblem({
                  proof_url: proofUrl,
                  x_intent_url: xIntentUrl,
                  generated_at: row.artifact?.generatedAt,
                  x_intent_opened_at: row.artifact?.xIntentOpenedAt,
                  native_share_opened_at: row.artifact?.nativeShareOpenedAt,
                })}.`
              : status === "needs-production-card"
                ? "Publish the generated PNG as a public HTTPS image before opening X."
                : "Generate a publishable PNG share card first.",
    };
  });
  const productionCards = rows.filter((row) => row.productionReady).length;
  const openedChannels = rows.filter((row) => row.channelOpened).length;
  const readyToOpen = rows.filter((row) => row.status === "ready-to-open").length;
  const missingProductionCards = rows.filter((row) => !row.productionReady).length;
  const invalidXIntents = rows.filter((row) => row.status === "needs-x-intent").length;
  const ready = rows.length > 0 && productionCards === rows.length && openedChannels === rows.length;
  const summary = `${openedChannels}/${rows.length} share channels opened · ${productionCards}/${rows.length} production cards · ${readyToOpen} ready to open`;
  const nextAction = ready
    ? "All public proof cards have production image URLs and X/native share-channel evidence."
    : readyToOpen > 0
      ? `Open ${readyToOpen} ready X/native share channel${readyToOpen === 1 ? "" : "s"} and sync the channel timestamp.`
      : invalidXIntents > 0
        ? `Regenerate ${invalidXIntents} X intent URL${invalidXIntents === 1 ? "" : "s"} with proof text, proof URL and required hashtags.`
      : missingProductionCards > 0
        ? `Publish ${missingProductionCards} proof card${missingProductionCards === 1 ? "" : "s"} to HTTPS image URLs before opening X.`
        : "Create record or mode proofs before collecting share-channel evidence.";
  const copyText = [
    "Kickoff Lock Agent share-channel evidence",
    `Ready: ${ready ? "yes" : "no"}`,
    summary,
    `Next action: ${nextAction}`,
    ...rows.map(
      (row) =>
        [
          `- ${row.kind}:${row.id} · ${row.status} · channel=${row.channel} · image=${row.imageUrl || "missing"} · proof=${row.proofUrl || "missing"}`,
          row.openCommand ? `  open: ${row.openCommand}` : "  open: missing X intent",
          `  read-back: ${row.readBackCommand}`,
        ].join("\n"),
    ),
  ].join("\n");

  return {
    ready,
    totalArtifacts: rows.length,
    productionCards,
    openedChannels,
    readyToOpen,
    missingProductionCards,
    rows,
    summary,
    nextAction,
    copyText,
  };
};
