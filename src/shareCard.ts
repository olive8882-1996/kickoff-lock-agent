import { sha256 } from "./proof";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

export type ShareCardPayload = {
  title: string;
  subtitle: string;
  matchLabel: string;
  prediction: string;
  actual: string;
  score: string;
  confidence: string;
  proofMode: string;
  proofStatus: string;
  cid: string;
  hash: string;
  proofUrl: string;
  footer: string;
};

type ShareArtifactOptions = {
  id: string;
  kind: ShareArtifactEvidence["kind"];
  proofUrl: string;
  dataUrl: string;
  fileName: string;
  imageUrl?: string;
  generatedAt?: string;
  xIntentUrl?: string;
  xIntentOpenedAt?: string;
  nativeShareOpenedAt?: string;
};

type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
};

export const buildShareCardPayload = (record: MemoryRecord, proofUrl: string): ShareCardPayload => {
  const { capsule, result } = record;
  return {
    title: "KICKOFF LOCK AGENT",
    subtitle: capsule.lateLock ? "LATE PRACTICE LOCK" : "LOCKED BEFORE KICKOFF",
    matchLabel: capsule.matchLabel.toUpperCase(),
    prediction: `${capsule.prediction.homeScore}-${capsule.prediction.awayScore}`,
    actual: result ? `${result.homeScore}-${result.awayScore}` : "PENDING",
    score: result ? `${result.totalScore}/100` : "PENDING",
    confidence: `${capsule.prediction.confidence}% CONFIDENCE`,
    proofMode: `${capsule.filecoinProof.mode.toUpperCase()} PROOF`,
    proofStatus: capsule.filecoinProof.proofStatus.toUpperCase(),
    cid: capsule.filecoinProof.cid,
    hash: capsule.payloadHash,
    proofUrl,
    footer: "PUBLIC PROOF CARD · FILECOIN-STYLE CAPSULE · WORLD CUP PREDICTION MEMORY",
  };
};

const modeLabel = (run: GameModeRun) =>
  ({
    bracket: "BRACKET",
    parlay: "PARLAY",
    "agent-vs-human": "AGENT VS HUMAN",
    upset: "UPSET",
  })[run.modeId];

export const buildModeRunShareCardPayload = (run: GameModeRun, proofUrl: string): ShareCardPayload => ({
  title: "KICKOFF LOCK MODES",
  subtitle: "TOURNAMENT MODE PROOF",
  matchLabel: run.title.toUpperCase(),
  prediction: modeLabel(run),
  actual: run.status.toUpperCase(),
  score: run.score !== undefined ? `${run.score}/100` : "PENDING",
  confidence: `${run.capsuleIds.length} LOCK${run.capsuleIds.length === 1 ? "" : "S"} LINKED`,
  proofMode: `${run.filecoinProof.mode.toUpperCase()} PROOF`,
  proofStatus: run.filecoinProof.proofStatus.toUpperCase(),
  cid: run.filecoinProof.cid,
  hash: run.payloadHash,
  proofUrl,
  footer: "PUBLIC MODE PROOF · FILECOIN-STYLE TOURNAMENT MEMORY · WORLD CUP PREDICTION GAME",
});

export const buildProofShareText = (record: MemoryRecord, proofUrl = "") => {
  const { capsule, result } = record;
  const scoreText = result
    ? `Actual ${result.homeScore}-${result.awayScore} · scored ${result.totalScore}/100`
    : "Reveal pending";
  const proofLabel = capsule.filecoinProof.mode === "real" ? "real Filecoin proof" : "demo proof";
  return [
    `I locked ${capsule.matchLabel} before kickoff: ${capsule.prediction.homeScore}-${capsule.prediction.awayScore}.`,
    scoreText,
    `${proofLabel}: ${capsule.filecoinProof.cid}`,
    proofUrl ? `Verify: ${proofUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildModeProofShareText = (run: GameModeRun, proofUrl = "") => {
  const scoreText = run.score !== undefined ? `Score ${run.score}/100` : `Status ${run.status}`;
  const proofLabel = run.filecoinProof.mode === "real" ? "real Filecoin proof" : "demo proof";
  return [
    `I sealed a World Cup ${run.title} mode proof on Kickoff Lock Agent.`,
    `${scoreText} · ${run.capsuleIds.length} linked lock${run.capsuleIds.length === 1 ? "" : "s"}`,
    `${proofLabel}: ${run.filecoinProof.cid}`,
    proofUrl ? `Verify: ${proofUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildXIntentUrl = (record: MemoryRecord, proofUrl: string) => {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", buildProofShareText(record));
  url.searchParams.set("url", proofUrl);
  url.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");
  return url.toString();
};

export const buildModeXIntentUrl = (run: GameModeRun, proofUrl: string) => {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", buildModeProofShareText(run));
  url.searchParams.set("url", proofUrl);
  url.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");
  return url.toString();
};

const dataUrlParts = (dataUrl: string) => {
  const [header = "", payload = ""] = dataUrl.split(",", 2);
  const mime = header.match(/^data:([^;]+);/)?.[1] ?? "application/octet-stream";
  const base64Payload = header.includes(";base64") ? payload : btoa(decodeURIComponent(payload));
  const padding = base64Payload.endsWith("==") ? 2 : base64Payload.endsWith("=") ? 1 : 0;
  return {
    mime,
    payload: base64Payload,
    byteLength: Math.max(0, Math.floor((base64Payload.length * 3) / 4) - padding),
  };
};

export const buildShareArtifactEvidence = async ({
  id,
  kind,
  proofUrl,
  dataUrl,
  fileName,
  imageUrl,
  generatedAt = new Date().toISOString(),
  xIntentUrl,
  xIntentOpenedAt,
  nativeShareOpenedAt,
}: ShareArtifactOptions): Promise<ShareArtifactEvidence> => {
  const image = dataUrlParts(dataUrl);
  return {
    id,
    kind,
    proofUrl,
    imageGenerated: true,
    generatedAt,
    fileName,
    imageUrl,
    imageMime: image.mime,
    imageByteLength: image.byteLength,
    imageHash: await sha256(`${image.mime}:${image.payload}`),
    xIntentUrl,
    xIntentOpenedAt,
    nativeShareOpenedAt,
  };
};

export const isPublishableShareArtifact = (evidence?: ShareArtifactEvidence) =>
  Boolean(
    evidence?.imageGenerated &&
      evidence.proofUrl &&
      evidence.fileName?.endsWith(".png") &&
      evidence.imageMime === "image/png" &&
      (evidence.imageByteLength ?? 0) > 10_000 &&
      /^[a-f0-9]{64}$/.test(evidence.imageHash ?? ""),
  );

const LOCAL_PROOF_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

export const isProductionProofUrl = (proofUrl?: string) => {
  if (!proofUrl) return false;

  try {
    const url = new URL(proofUrl);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && !LOCAL_PROOF_HOSTS.has(hostname) && !hostname.endsWith(".local");
  } catch {
    return false;
  }
};

export const isProductionShareArtifact = (evidence?: ShareArtifactEvidence) =>
  isPublishableShareArtifact(evidence) &&
  isProductionProofUrl(evidence?.proofUrl) &&
  isProductionProofUrl(evidence?.imageUrl);

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | undefined>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(undefined);
    image.src = src;
  });

const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sw = width / scale;
  const sh = height / scale;
  const sx = (image.naturalWidth - sw) / 2;
  const sy = (image.naturalHeight - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
};

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius = 10) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawWrappedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
) => {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || current === "") {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  lines.slice(0, maxLines).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
};

const setFittedFont = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  options: { weight: number; maxSize: number; minSize: number; family: string },
) => {
  let size = options.maxSize;
  do {
    ctx.font = `${options.weight} ${size}px ${options.family}`;
    size -= 2;
  } while (size >= options.minSize && ctx.measureText(text).width > maxWidth);
};

const drawProofPattern = (ctx: CanvasRenderingContext2D, hash: string, x: number, y: number, size: number) => {
  const cells = 9;
  const gap = 3;
  const cell = Math.floor((size - gap * (cells - 1)) / cells);
  ctx.fillStyle = "rgba(238, 247, 243, 0.1)";
  ctx.fillRect(x - 12, y - 12, size + 24, size + 24);
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const index = (row * cells + col) % hash.length;
      const active = Number.parseInt(hash[index] ?? "0", 16) % 2 === 0;
      ctx.fillStyle = active ? "#eef7f3" : "rgba(238, 247, 243, 0.16)";
      ctx.fillRect(x + col * (cell + gap), y + row * (cell + gap), cell, cell);
    }
  }
};

const generateShareCardFromPayload = async (
  payload: ShareCardPayload,
  options: { assetBaseUrl?: string } = {},
): Promise<string> => {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  const assetBaseUrl = options.assetBaseUrl ?? `${import.meta.env.BASE_URL}assets/`;
  const [stadium, icon] = await Promise.all([
    loadImage(`${assetBaseUrl}stadium-hero.jpg`),
    loadImage(`${assetBaseUrl}kickoff-lock-icon.png`),
  ]);

  const gradient = ctx.createLinearGradient(0, 0, 1200, 675);
  gradient.addColorStop(0, "#061112");
  gradient.addColorStop(0.52, "#102d24");
  gradient.addColorStop(1, "#05090b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 675);

  if (stadium) {
    drawImageCover(ctx, stadium, 0, 0, 1200, 675);
    const shade = ctx.createLinearGradient(0, 0, 1200, 675);
    shade.addColorStop(0, "rgba(3, 8, 10, 0.95)");
    shade.addColorStop(0.56, "rgba(3, 8, 10, 0.72)");
    shade.addColorStop(1, "rgba(3, 8, 10, 0.44)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 1200, 675);
  }

  ctx.fillStyle = "rgba(241, 201, 77, 0.18)";
  ctx.fillRect(0, 0, 1200, 10);
  ctx.fillStyle = "#f1c94d";
  ctx.fillRect(0, 0, 480, 10);
  ctx.fillStyle = "#ff4d40";
  ctx.fillRect(480, 0, 320, 10);
  ctx.fillStyle = "#1aa6ff";
  ctx.fillRect(800, 0, 400, 10);

  if (icon) {
    roundRect(ctx, 70, 54, 62, 62, 10);
    ctx.fillStyle = "rgba(3, 8, 10, 0.72)";
    ctx.fill();
    ctx.drawImage(icon, 76, 60, 50, 50);
  }

  ctx.fillStyle = "#eef7f3";
  ctx.font = "900 46px Inter, Arial, sans-serif";
  ctx.fillText(payload.title, icon ? 150 : 70, 92);
  ctx.fillStyle = "#ff5b4e";
  ctx.font = "800 24px Inter, Arial, sans-serif";
  ctx.fillText(payload.subtitle, icon ? 150 : 70, 132);

  roundRect(ctx, 70, 170, 690, 320, 14);
  ctx.fillStyle = "rgba(3, 8, 10, 0.6)";
  ctx.fill();
  ctx.strokeStyle = "rgba(241, 201, 77, 0.34)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#f1c94d";
  ctx.font = "900 52px Inter, Arial, sans-serif";
  drawWrappedText(ctx, payload.matchLabel, 104, 248, 600, 58, 2);

  ctx.fillStyle = "#eef7f3";
  setFittedFont(ctx, payload.prediction, 600, {
    weight: 900,
    maxSize: 112,
    minSize: 58,
    family: "Inter, Arial, sans-serif",
  });
  ctx.fillText(payload.prediction, 104, 390);

  ctx.fillStyle = "rgba(238, 247, 243, 0.72)";
  ctx.font = "700 26px Inter, Arial, sans-serif";
  ctx.fillText(payload.confidence, 106, 438);
  ctx.fillText(`ACTUAL ${payload.actual} · SCORE ${payload.score}`, 106, 474);

  roundRect(ctx, 805, 170, 325, 320, 14);
  ctx.fillStyle = "rgba(3, 8, 10, 0.68)";
  ctx.fill();
  ctx.strokeStyle = "rgba(238, 247, 243, 0.16)";
  ctx.stroke();
  drawProofPattern(ctx, payload.hash, 870, 215, 190);

  ctx.fillStyle = payload.proofMode.includes("REAL") ? "#d8ffd9" : "#ffe8a8";
  ctx.font = "900 27px Inter, Arial, sans-serif";
  ctx.fillText(payload.proofMode, 840, 448);
  ctx.fillText(payload.proofStatus, 840, 482);

  roundRect(ctx, 70, 525, 1060, 94, 12);
  ctx.fillStyle = "rgba(3, 8, 10, 0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(238, 247, 243, 0.14)";
  ctx.stroke();

  ctx.fillStyle = "rgba(238, 247, 243, 0.9)";
  ctx.font = "800 20px Inter, Arial, sans-serif";
  ctx.fillText(`CID ${payload.cid.slice(0, 66)}`, 96, 562);
  ctx.fillStyle = "rgba(238, 247, 243, 0.66)";
  ctx.font = "700 18px Inter, Arial, sans-serif";
  const proofUrlText = payload.proofUrl || "Open the public verifier from the proof panel";
  ctx.fillText(`VERIFY ${proofUrlText.slice(0, 88)}`, 96, 595);

  ctx.fillStyle = "#f1c94d";
  ctx.font = "900 15px Inter, Arial, sans-serif";
  ctx.fillText(payload.footer, 70, 652);

  return canvas.toDataURL("image/png");
};

export const generateShareCard = async (
  record: MemoryRecord,
  options: { proofUrl?: string; assetBaseUrl?: string } = {},
): Promise<string> =>
  generateShareCardFromPayload(buildShareCardPayload(record, options.proofUrl ?? ""), options);

export const generateModeShareCard = async (
  run: GameModeRun,
  options: { proofUrl?: string; assetBaseUrl?: string } = {},
): Promise<string> =>
  generateShareCardFromPayload(buildModeRunShareCardPayload(run, options.proofUrl ?? ""), options);

export const downloadDataUrl = (dataUrl: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
};

export const dataUrlToFile = async (dataUrl: string, fileName: string) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/png" });
};

export const canNativeShareFiles = (files: File[], nav: ShareNavigator = navigator as ShareNavigator) =>
  Boolean(typeof nav.share === "function" && nav.canShare?.({ files }));
