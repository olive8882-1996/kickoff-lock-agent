const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export const deployedSupabaseProjectUrlProblem = (supabaseUrl?: string, label = "VITE_SUPABASE_URL") => {
  const configuredUrl = supabaseUrl?.trim() ?? "";
  if (!configuredUrl) return label;
  try {
    const url = new URL(configuredUrl);
    if (
      url.protocol !== "https:" ||
      localHosts.has(url.hostname) ||
      url.hostname.endsWith(".localhost") ||
      !url.hostname.endsWith(".supabase.co")
    ) {
      return `${label} must be a deployed HTTPS Supabase project URL`;
    }
    return "";
  } catch {
    return `${label} must be a valid deployed HTTPS Supabase project URL`;
  }
};

export const supabasePublicStorageProblem = ({
  supabaseUrl,
  imageUrl,
  label,
  requireConfiguredProject = false,
}: {
  supabaseUrl?: string;
  imageUrl: string;
  label: string;
  requireConfiguredProject?: boolean;
}) => {
  const configuredUrl = supabaseUrl?.trim() ?? "";
  const url = imageUrl.trim();
  if (!url) return `${label} missing`;
  const configuredProblem = configuredUrl
    ? deployedSupabaseProjectUrlProblem(configuredUrl)
    : requireConfiguredProject
      ? "VITE_SUPABASE_URL"
      : "";
  if (configuredProblem) return configuredProblem;
  try {
    const actual = new URL(url);
    const expected = configuredUrl ? new URL(configuredUrl) : undefined;
    if (actual.protocol !== "https:") return `${label} must be an HTTPS Supabase Storage URL`;
    if (expected) {
      if (actual.hostname !== expected.hostname) {
        return `${label} must use the configured Supabase project host ${expected.hostname}`;
      }
    } else if (requireConfiguredProject) {
      return "VITE_SUPABASE_URL";
    } else if (!actual.hostname.endsWith(".supabase.co")) {
      return `${label} must use a Supabase project host`;
    }
    if (!actual.pathname.includes("/storage/v1/object/public/")) {
      return `${label} must be a public Supabase Storage object URL`;
    }
    return "";
  } catch {
    return `${label} must be a valid public Supabase Storage URL`;
  }
};
