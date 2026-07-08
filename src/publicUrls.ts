export type PublicUrlEnv = Record<string, string | boolean | undefined>;

const stringValue = (value: string | boolean | undefined) =>
  typeof value === "string" ? value.trim() : "";

export const normalizePublicAppUrl = (value: string | boolean | undefined) => {
  const raw = stringValue(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    url.search = "";
    url.hash = "";
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    return url.toString();
  } catch {
    return undefined;
  }
};

export const evaluatePublicAuthRedirect = (
  redirectValue: string | boolean | undefined,
  publicAppValue: string | boolean | undefined,
) => {
  const redirectUrl = normalizePublicAppUrl(redirectValue);
  const publicAppUrl = normalizePublicAppUrl(publicAppValue);
  if (!redirectUrl) {
    return {
      passed: false,
      redirectUrl,
      publicAppUrl,
      detail: "Missing valid HTTPS VITE_SUPABASE_REDIRECT_URL",
    };
  }
  if (publicAppUrl && redirectUrl !== publicAppUrl) {
    return {
      passed: false,
      redirectUrl,
      publicAppUrl,
      detail: `VITE_SUPABASE_REDIRECT_URL (${redirectUrl}) must match VITE_PUBLIC_APP_URL (${publicAppUrl})`,
    };
  }
  return {
    passed: true,
    redirectUrl,
    publicAppUrl,
    detail: redirectUrl,
  };
};

export const buildPublicUrl = (
  key: "proof" | "profile" | "mode",
  id: string,
  publicAppUrl: string | boolean | undefined,
  fallbackHref: string,
) => {
  const base = normalizePublicAppUrl(publicAppUrl) ?? fallbackHref;
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set(key, id);
  return url.toString();
};

export const publicAppUrlConfigured = (env: PublicUrlEnv) => Boolean(normalizePublicAppUrl(env.VITE_PUBLIC_APP_URL));
