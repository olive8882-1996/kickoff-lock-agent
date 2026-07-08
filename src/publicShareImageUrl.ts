const LOCAL_IMAGE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
const FALLBACK_APP_LOGO_ASSET = /\/assets\/kickoff-lock-(?:icon(?:-[0-9]+|-source)?|apple-touch)\.png$/i;

export const publicShareImageUrlProblem = (value: string, label: string) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return `${label} must be a public HTTPS URL`;
    if (LOCAL_IMAGE_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".localhost")) {
      return `${label} must not use a local host`;
    }
    if (!/\.(png|jpe?g|webp)$/i.test(url.pathname)) {
      return `${label} must point to a PNG, JPEG or WebP image path`;
    }
    if (FALLBACK_APP_LOGO_ASSET.test(url.pathname)) {
      return `${label} must be a generated proof card, not the app logo asset`;
    }
    return "";
  } catch {
    return `${label} must be a valid URL`;
  }
};

export const isPublicShareImageUrl = (value: string) => !publicShareImageUrlProblem(value, "Share image URL");
