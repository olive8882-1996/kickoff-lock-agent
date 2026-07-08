import { sha256 } from "./proof";

export type ProductionShareImageTarget = {
  title: string;
  eyebrow: string;
  matchLabel: string;
  prediction: string;
  score: string;
  confidence: string;
  proofStatus: string;
  cid: string;
  payloadHash: string;
  proofUrl: string;
  generatedAt: string;
  logoHref?: string;
  predictionCaption?: string;
  scoreLabel?: string;
};

export type ShareImageMetadata = {
  imageMime: "image/png";
  imageByteLength: number;
  imageHash: string;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const short = (value: string, head = 14, tail = 10) => {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

export const DEFAULT_PRODUCTION_SHARE_IMAGE_TARGET: ProductionShareImageTarget = {
  title: "KICKOFF LOCK AGENT",
  eyebrow: "WORLD CUP PROOF CARD",
  matchLabel: "Brazil vs Japan",
  prediction: "2-1",
  score: "92/100",
  confidence: "86% CONFIDENCE",
  proofStatus: "SEALED BEFORE KICKOFF",
  cid: "bafy-kickoff-production-target",
  payloadHash: "9081f2a517c98770b7a8e85bb24dd2a4620129ac962e03a8c8579e94f3991d20",
  proofUrl: "https://olive8882-1996.github.io/kickoff-lock-agent/?proof=cap-production-target",
  generatedAt: "production-target",
};

export const DEFAULT_PRODUCTION_MODE_SHARE_IMAGE_TARGET: ProductionShareImageTarget = {
  title: "LOCKED MODE PROOF",
  eyebrow: "WORLD CUP MODE CARD",
  matchLabel: "Bracket · Parlay · Agent · Upset",
  prediction: "4/4",
  score: "READY",
  confidence: "REQUIRED MODES LOCKED",
  proofStatus: "PUBLIC MODE PROOF PACKAGE",
  cid: "bafy-kickoff-mode-production-target",
  payloadHash: "1bc8b843a559b2b3f58246dd68db4a531b7b9b8f6d9c2a6e1e08bb1a81d2b663",
  proofUrl: "https://olive8882-1996.github.io/kickoff-lock-agent/?mode=world-cup-mode-production-target",
  generatedAt: "production-mode-target",
  predictionCaption: "MODE PROOF SET",
  scoreLabel: "MODE STATUS",
};

export const buildProductionShareImageTargetSvg = (target: ProductionShareImageTarget): string => {
  const logo = target.logoHref
    ? `<image href="${escapeXml(target.logoHref)}" x="72" y="72" width="134" height="134" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
    : `<text x="139" y="154" text-anchor="middle" font-size="58" font-weight="900" fill="#f7c75a">KL</text>`;
  const proofUrl = short(target.proofUrl, 48, 20);
  const predictionCaption = target.predictionCaption ?? "PREDICTED SCORE";
  const scoreLabel = target.scoreLabel ?? "AGENT SCORE";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="${escapeXml(target.title)} share image">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#061315" />
      <stop offset="0.48" stop-color="#0a1710" />
      <stop offset="1" stop-color="#11161e" />
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff1a6" />
      <stop offset="0.5" stop-color="#d69b26" />
      <stop offset="1" stop-color="#7c4b10" />
    </linearGradient>
    <radialGradient id="pitchGlow" cx="50%" cy="92%" r="70%">
      <stop offset="0" stop-color="#30d179" stop-opacity="0.32" />
      <stop offset="0.54" stop-color="#103f2d" stop-opacity="0.34" />
      <stop offset="1" stop-color="#020808" stop-opacity="0" />
    </radialGradient>
    <clipPath id="logoClip">
      <rect x="72" y="72" width="134" height="134" rx="34" />
    </clipPath>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.45" />
    </filter>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)" />
  <rect width="1200" height="675" fill="url(#pitchGlow)" />
  <g opacity="0.22">
    <path d="M0 482 C260 424 484 427 660 470 C842 514 1010 512 1200 466" fill="none" stroke="#d9f2d4" stroke-width="2" />
    <path d="M0 552 C210 505 418 508 610 546 C818 587 1022 584 1200 532" fill="none" stroke="#70d6ff" stroke-width="2" />
    <circle cx="90" cy="214" r="62" fill="#ffffff" opacity="0.12" />
    <circle cx="1110" cy="210" r="70" fill="#ffffff" opacity="0.12" />
  </g>
  <g filter="url(#softShadow)">
    <rect x="56" y="56" width="1088" height="563" rx="18" fill="#071011" stroke="#33524d" stroke-width="1.5" opacity="0.92" />
    <path d="M56 460 C270 420 451 432 600 468 C760 507 958 512 1144 456 L1144 619 L56 619 Z" fill="#0d3526" opacity="0.74" />
    <path d="M56 56 L1144 56 L1144 102 C886 90 698 105 544 151 C357 207 202 205 56 172 Z" fill="#15211b" opacity="0.72" />
  </g>
  <rect x="72" y="72" width="134" height="134" rx="34" fill="#071011" stroke="url(#gold)" stroke-width="3" />
  ${logo}
  <g transform="translate(232 78)">
    <text x="0" y="22" font-size="18" font-weight="800" fill="#e73632" letter-spacing="2">${escapeXml(target.eyebrow)}</text>
    <text x="0" y="82" font-size="62" font-weight="900" fill="#fff7de">${escapeXml(target.title)}</text>
    <text x="0" y="126" font-size="25" font-weight="700" fill="#9ce7ff">${escapeXml(target.proofStatus)}</text>
  </g>
  <g transform="translate(92 258)">
    <text x="0" y="0" font-size="28" font-weight="800" fill="#f7c75a">${escapeXml(target.matchLabel.toUpperCase())}</text>
    <text x="0" y="96" font-size="118" font-weight="950" fill="#fff7de">${escapeXml(target.prediction)}</text>
    <text x="5" y="140" font-size="25" font-weight="750" fill="#eaf8ef">${escapeXml(predictionCaption)}</text>
  </g>
  <g transform="translate(598 260)">
    <rect x="0" y="0" width="458" height="210" rx="16" fill="#0b1718" stroke="#46655c" />
    <text x="32" y="52" font-size="22" font-weight="800" fill="#86e8ff">${escapeXml(scoreLabel)}</text>
    <text x="32" y="126" font-size="72" font-weight="950" fill="url(#gold)">${escapeXml(target.score)}</text>
    <text x="32" y="172" font-size="26" font-weight="750" fill="#fff7de">${escapeXml(target.confidence)}</text>
  </g>
  <g transform="translate(92 548)">
    <text x="0" y="0" font-size="18" font-weight="800" fill="#f7c75a">CID</text>
    <text x="50" y="0" font-size="18" font-weight="700" fill="#e8fff3">${escapeXml(short(target.cid))}</text>
    <text x="360" y="0" font-size="18" font-weight="800" fill="#f7c75a">HASH</text>
    <text x="426" y="0" font-size="18" font-weight="700" fill="#e8fff3">${escapeXml(short(target.payloadHash))}</text>
    <text x="0" y="38" font-size="18" font-weight="750" fill="#9ce7ff">${escapeXml(proofUrl)}</text>
  </g>
  <text x="1108" y="586" text-anchor="end" font-size="16" font-weight="700" fill="#7f9f98">${escapeXml(target.generatedAt)}</text>
</svg>`;
};

export const productionShareImagePublicUrl = (publicAppUrl: string | undefined, fileName: string) => {
  if (!publicAppUrl) return "";
  const base = publicAppUrl.endsWith("/") ? publicAppUrl : `${publicAppUrl}/`;
  const normalizedFile = fileName.replace(/^\/+/, "");
  return new URL(normalizedFile, base).toString();
};

export const buildShareImageMetadata = async (
  bytes: Uint8Array,
  imageMime: ShareImageMetadata["imageMime"] = "image/png",
): Promise<ShareImageMetadata> => ({
  imageMime,
  imageByteLength: bytes.byteLength,
  imageHash: await sha256(`${imageMime}:${Array.from(bytes).join(",")}`),
});
