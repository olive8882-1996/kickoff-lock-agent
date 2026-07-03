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
