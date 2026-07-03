export type BrandLogoAsset = {
  id: string;
  fileName: string;
  size: string;
  role: "source" | "app-icon" | "favicon" | "apple-touch" | "social-card";
  required: boolean;
};

export type BrandLogoUsage = {
  id: string;
  surface: string;
  evidence: string;
};

export type BrandAssetPacket = {
  ready: boolean;
  publicBaseUrl: string;
  publicLogoUrl: string;
  requiredAssets: number;
  totalAssets: number;
  usages: BrandLogoUsage[];
  assets: BrandLogoAsset[];
  summary: string;
  nextAction: string;
  copyText: string;
};

export const BRAND_LOGO_ASSETS: BrandLogoAsset[] = [
  {
    id: "logo-source",
    fileName: "kickoff-lock-icon-source.png",
    size: "1254x1254",
    role: "source",
    required: true,
  },
  {
    id: "logo-social",
    fileName: "kickoff-lock-icon.png",
    size: "512x512",
    role: "social-card",
    required: true,
  },
  {
    id: "logo-pwa-512",
    fileName: "kickoff-lock-icon-512.png",
    size: "512x512",
    role: "app-icon",
    required: true,
  },
  {
    id: "logo-pwa-192",
    fileName: "kickoff-lock-icon-192.png",
    size: "192x192",
    role: "app-icon",
    required: true,
  },
  {
    id: "logo-apple-touch",
    fileName: "kickoff-lock-apple-touch.png",
    size: "180x180",
    role: "apple-touch",
    required: true,
  },
  {
    id: "logo-favicon",
    fileName: "kickoff-lock-icon-32.png",
    size: "32x32",
    role: "favicon",
    required: true,
  },
];

export const BRAND_LOGO_USAGES: BrandLogoUsage[] = [
  {
    id: "side-rail",
    surface: "App side rail",
    evidence: "Persistent tournament navigation mark",
  },
  {
    id: "hero-lockup",
    surface: "World Cup hero",
    evidence: "First viewport brand lockup",
  },
  {
    id: "public-proof",
    surface: "Public proof pages",
    evidence: "Record and mode verifier brand mark",
  },
  {
    id: "pwa-manifest",
    surface: "PWA install metadata",
    evidence: "Manifest icons and apple-touch icon",
  },
  {
    id: "social-meta",
    surface: "Open Graph and X card",
    evidence: "Public 512px share preview asset",
  },
  {
    id: "generated-share-card",
    surface: "Generated PNG proof cards",
    evidence: "Canvas renderer loads the 512px logo asset",
  },
];

const normalizeBaseUrl = (publicBaseUrl = "") => {
  if (!publicBaseUrl) return "";
  return publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`;
};

export const brandAssetPublicUrl = (publicBaseUrl: string | undefined, fileName = "kickoff-lock-icon.png") => {
  const normalized = normalizeBaseUrl(publicBaseUrl);
  if (!normalized) return `assets/${fileName}`;
  return new URL(`assets/${fileName}`, normalized).toString();
};

export const buildBrandAssetPacket = (publicBaseUrl?: string): BrandAssetPacket => {
  const requiredAssets = BRAND_LOGO_ASSETS.filter((asset) => asset.required).length;
  const publicLogoUrl = brandAssetPublicUrl(publicBaseUrl, "kickoff-lock-icon.png");
  const ready = requiredAssets === BRAND_LOGO_ASSETS.length && BRAND_LOGO_USAGES.length >= 6;
  const nextAction = ready
    ? "Keep the generated logo files committed and deploy them with the next Pages build."
    : "Add the missing logo variants or wire the logo into every public surface.";
  const summary = ready
    ? `${requiredAssets}/${BRAND_LOGO_ASSETS.length} required logo assets are registered across ${BRAND_LOGO_USAGES.length} product surfaces.`
    : "Brand logo asset coverage is incomplete.";
  const copyText = [
    "Kickoff Lock Agent brand asset packet",
    `Ready: ${ready ? "yes" : "no"}`,
    `Public logo: ${publicLogoUrl}`,
    `Assets: ${requiredAssets}/${BRAND_LOGO_ASSETS.length}`,
    `Surfaces: ${BRAND_LOGO_USAGES.length}`,
    `Next action: ${nextAction}`,
    "Files:",
    ...BRAND_LOGO_ASSETS.map((asset) => `- ${asset.fileName} · ${asset.size} · ${asset.role}`),
    "Usage:",
    ...BRAND_LOGO_USAGES.map((usage) => `- ${usage.surface}: ${usage.evidence}`),
  ].join("\n");

  return {
    ready,
    publicBaseUrl: normalizeBaseUrl(publicBaseUrl),
    publicLogoUrl,
    requiredAssets,
    totalAssets: BRAND_LOGO_ASSETS.length,
    usages: BRAND_LOGO_USAGES,
    assets: BRAND_LOGO_ASSETS,
    summary,
    nextAction,
    copyText,
  };
};
