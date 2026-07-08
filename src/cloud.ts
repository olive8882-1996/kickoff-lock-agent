import type {
  CloudBackendHealth,
  CloudSyncState,
  CloudSyncAuditItem,
  CloudSyncOutboxItem,
  CloudSyncVerification,
  LeaderboardEntry,
  LeaderboardReadinessItem,
  LeaderboardScope,
  LeaderboardScopeEvidence,
  GameModeRun,
  MemoryRecord,
  PublicProfile,
  ShareArtifactEvidence,
  UserProfile,
} from "./types";
import { stableJson } from "./proof";
import { runtimeConfigValue } from "./runtimeConfig";
import { validatePublicShareImageResponse } from "./shareImageValidation";

const PROFILE_KEY = "kickoff-lock-agent-profile-v1";
const SESSION_KEY = "kickoff-lock-agent-supabase-session-v1";
const PKCE_KEY = "kickoff-lock-agent-supabase-pkce-v1";
const PKCE_REQUEST_MAX_AGE_MS = 15 * 60 * 1000;

const runtimeEnv = import.meta.env as Record<string, string | boolean | undefined>;
const supabaseUrl = () => runtimeConfigValue(runtimeEnv, "VITE_SUPABASE_URL");
const supabaseAnonKey = () => runtimeConfigValue(runtimeEnv, "VITE_SUPABASE_ANON_KEY");
const supabaseShareBucket = () => runtimeConfigValue(runtimeEnv, "VITE_SUPABASE_SHARE_BUCKET") || "kickoff-share-cards";
const supabaseConfigured = () => Boolean(supabaseUrl() && supabaseAnonKey());

type SupabaseSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
};

type SupabasePkceRequest = {
  codeVerifier: string;
  state: string;
  redirectTo: string;
  createdAt: number;
};

type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: {
    avatar_url?: string;
    full_name?: string;
    name?: string;
  };
};

const REQUIRED_BACKEND_TABLES = [
  "kickoff_profiles",
  "kickoff_records",
  "kickoff_mode_runs",
  "kickoff_share_artifacts",
];
const REQUIRED_BACKEND_VIEWS = ["kickoff_leaderboard", "kickoff_backend_health"];
const REQUIRED_RLS_TABLES = REQUIRED_BACKEND_TABLES;
const REQUIRED_POLICY_COUNT = 8;

const headers = (session?: SupabaseSession) => ({
  apikey: supabaseAnonKey(),
  Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey()}`,
  "Content-Type": "application/json",
});

const restUrl = (path: string) => `${supabaseUrl()}/rest/v1/${path}`;
const storageObjectUrl = (bucket: string, path: string) =>
  `${supabaseUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
const publicStorageObjectUrl = (bucket: string, path: string) =>
  `${supabaseUrl()}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Share image data URL could not be decoded.");
  return response.blob();
};

const storagePathPart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";

export const shareImageStoragePath = (
  profile: Pick<UserProfile, "id">,
  artifact: Pick<ShareArtifactEvidence, "id" | "kind" | "fileName">,
) =>
  [
    storagePathPart(profile.id),
    artifact.kind,
    storagePathPart(artifact.id),
    storagePathPart(artifact.fileName ?? `${artifact.id}-share-card.png`),
  ].join("/");

export const publicShareImageUrl = (path: string, bucket = supabaseShareBucket()) =>
  supabaseConfigured() ? publicStorageObjectUrl(bucket, path) : "";

const emptyBackendHealth = (detail: string): CloudBackendHealth => ({
  checkedAt: new Date().toISOString(),
  ready: false,
  requiredTables: REQUIRED_BACKEND_TABLES,
  missingTables: REQUIRED_BACKEND_TABLES,
  requiredViews: REQUIRED_BACKEND_VIEWS,
  missingViews: REQUIRED_BACKEND_VIEWS,
  rlsTables: REQUIRED_RLS_TABLES,
  missingRlsTables: REQUIRED_RLS_TABLES,
  missingColumns: [],
  missingViewColumns: [],
  policyCount: 0,
  requiredPolicyCount: REQUIRED_POLICY_COUNT,
  unsafeWritePolicies: [],
  storageBucketPublic: false,
  storagePolicyCount: 0,
  requiredStoragePolicyCount: 3,
  detail,
});

const mapBackendHealthRow = (row: any): CloudBackendHealth => {
  const missingTables = Array.isArray(row.missing_tables) ? row.missing_tables.map(String) : REQUIRED_BACKEND_TABLES;
  const missingViews = Array.isArray(row.missing_views) ? row.missing_views.map(String) : REQUIRED_BACKEND_VIEWS;
  const missingRlsTables = Array.isArray(row.missing_rls_tables) ? row.missing_rls_tables.map(String) : REQUIRED_RLS_TABLES;
  const missingColumns = Array.isArray(row.missing_columns)
    ? row.missing_columns.map(String)
    : ["kickoff_backend_health.missing_columns"];
  const missingViewColumns = Array.isArray(row.missing_view_columns)
    ? row.missing_view_columns.map(String)
    : ["kickoff_backend_health.missing_view_columns"];
  const policyCount = Number(row.policy_count ?? 0);
  const requiredPolicyCount = Number(row.required_policy_count ?? REQUIRED_POLICY_COUNT);
  const unsafeWritePolicies = Array.isArray(row.unsafe_write_policies)
    ? row.unsafe_write_policies.map(String)
    : ["kickoff_backend_health.unsafe_write_policies"];
  const storageBucketPublic = row.storage_bucket_public === true;
  const storagePolicyCount = Number(row.storage_policy_count ?? 0);
  const requiredStoragePolicyCount = Number(row.required_storage_policy_count ?? 3);
  const ready = Boolean(row.ready) &&
    missingTables.length === 0 &&
    missingViews.length === 0 &&
    missingRlsTables.length === 0 &&
    missingColumns.length === 0 &&
    missingViewColumns.length === 0 &&
    policyCount >= requiredPolicyCount &&
    unsafeWritePolicies.length === 0 &&
    storageBucketPublic &&
    storagePolicyCount >= requiredStoragePolicyCount;
  return {
    checkedAt: row.checked_at ?? new Date().toISOString(),
    schemaVersion: row.schema_version ?? undefined,
    ready,
    requiredTables: Array.isArray(row.required_tables) ? row.required_tables.map(String) : REQUIRED_BACKEND_TABLES,
    missingTables,
    requiredViews: Array.isArray(row.required_views) ? row.required_views.map(String) : REQUIRED_BACKEND_VIEWS,
    missingViews,
    rlsTables: Array.isArray(row.rls_tables) ? row.rls_tables.map(String) : REQUIRED_RLS_TABLES,
    missingRlsTables,
    missingColumns,
    missingViewColumns,
    policyCount,
    requiredPolicyCount,
    unsafeWritePolicies,
    storageBucketPublic,
    storagePolicyCount,
    requiredStoragePolicyCount,
    detail:
      row.detail ??
      (ready
        ? `Schema ${row.schema_version ?? "unknown"} ready`
        : `Missing tables ${missingTables.join(", ") || "none"}, views ${missingViews.join(", ") || "none"}, RLS ${
            missingRlsTables.join(", ") || "none"
          }, columns ${missingColumns.join(", ") || "none"}, view columns ${
            missingViewColumns.join(", ") || "none"
          }, unsafe write policies ${unsafeWritePolicies.join(", ") || "none"}, storage public ${storageBucketPublic}, storage policies ${storagePolicyCount}/${requiredStoragePolicyCount}`),
  };
};

export const loadCloudBackendHealth = async (anonymous = true): Promise<CloudBackendHealth> => {
  if (!supabaseConfigured()) return emptyBackendHealth("Supabase env missing.");
  const params = new URLSearchParams({ select: "*", limit: "1" });
  try {
    const res = await fetch(restUrl(`kickoff_backend_health?${params.toString()}`), {
      headers: headers(anonymous ? undefined : await refreshSupabaseSession()),
    });
    if (!res.ok) {
      return emptyBackendHealth(`kickoff_backend_health returned ${res.status}. Apply supabase.schema.sql.`);
    }
    const [row] = (await res.json()) as any[];
    return row ? mapBackendHealthRow(row) : emptyBackendHealth("kickoff_backend_health returned no rows.");
  } catch (error) {
    return emptyBackendHealth((error as Error).message);
  }
};

const authRedirectTo = () =>
  runtimeConfigValue(runtimeEnv, "VITE_SUPABASE_REDIRECT_URL") || window.location.origin + import.meta.env.BASE_URL;

const normalizeAuthEmail = (email: string) => {
  const normalized = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid email address before sending a magic link.");
  }
  return normalized;
};

export const buildSupabaseOAuthUrl = (
  provider: "google",
  redirectTo: string,
  baseUrl = supabaseUrl(),
  options: { codeChallenge?: string; state?: string } = {},
) => {
  if (!baseUrl) throw new Error("Supabase is not configured.");
  const url = new URL(`${baseUrl}/auth/v1/authorize`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", redirectTo);
  if (options.codeChallenge) {
    url.searchParams.set("code_challenge", options.codeChallenge);
    url.searchParams.set("code_challenge_method", "s256");
  }
  if (options.state) url.searchParams.set("state", options.state);
  return url.toString();
};

export const isSupabaseSessionExpired = (
  session: SupabaseSession | undefined,
  skewSeconds = 60,
  nowMs = Date.now(),
) => Boolean(session?.expires_at && session.expires_at <= Math.floor(nowMs / 1000) + skewSeconds);

const saveSupabaseSession = (session: SupabaseSession) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const clearSupabaseSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

let refreshSessionInFlight: Promise<SupabaseSession | undefined> | undefined;

const saveSupabasePkceRequest = (request: SupabasePkceRequest) => {
  localStorage.setItem(PKCE_KEY, JSON.stringify(request));
};

const loadSupabasePkceRequest = (): SupabasePkceRequest | undefined => {
  const saved = localStorage.getItem(PKCE_KEY);
  if (!saved) return undefined;
  try {
    const request = JSON.parse(saved) as SupabasePkceRequest;
    const ageMs = Date.now() - Number(request.createdAt);
    if (
      request.codeVerifier &&
      request.state &&
      Number.isFinite(ageMs) &&
      ageMs >= 0 &&
      ageMs <= PKCE_REQUEST_MAX_AGE_MS
    ) {
      return request;
    }
  } catch {
    // A broken verifier should not keep future Google sign-ins stuck.
  }
  localStorage.removeItem(PKCE_KEY);
  return undefined;
};

const clearSupabasePkceRequest = () => {
  localStorage.removeItem(PKCE_KEY);
};

const normalizeSupabaseSession = (payload: any, fallbackRefreshToken?: string): SupabaseSession => ({
  access_token: payload.access_token,
  refresh_token: payload.refresh_token ?? fallbackRefreshToken,
  expires_at: Number(payload.expires_at ?? 0)
    ? Number(payload.expires_at)
    : Number(payload.expires_in ?? 0)
      ? Math.floor(Date.now() / 1000) + Number(payload.expires_in)
      : undefined,
});

const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const randomBase64Url = (byteLength: number) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
};

const sha256Base64Url = async (value: string) => {
  if (!crypto.subtle) throw new Error("Web Crypto is required for Supabase PKCE sign-in.");
  const bytes = new TextEncoder().encode(value);
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
};

export const buildSupabasePkceOAuthUrl = async (
  provider: "google",
  redirectTo = authRedirectTo(),
  baseUrl = supabaseUrl(),
) => {
  const codeVerifier = randomBase64Url(32);
  const state = randomBase64Url(18);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const url = buildSupabaseOAuthUrl(provider, redirectTo, baseUrl, { codeChallenge, state });
  saveSupabasePkceRequest({ codeVerifier, state, redirectTo, createdAt: Date.now() });
  return { url, codeVerifier, codeChallenge, state, redirectTo };
};

export const normalizeFriendCode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const friendCodeFor = (profile: UserProfile) =>
  normalizeFriendCode(profile.friendCode ?? "") ||
  normalizeFriendCode(profile.location || profile.email.split("@")[1] || "global") ||
  "global";

const profileIdentityFor = (profile: UserProfile): NonNullable<CloudSyncVerification["profileIdentity"]> => ({
  id: profile.id,
  email: profile.email,
  displayName: profile.displayName,
  location: profile.location,
  friendCode: friendCodeFor(profile),
});

const profileIdentityProblems = (localProfile: UserProfile, remoteProfile?: UserProfile) => {
  if (!remoteProfile) return ["kickoff_profiles row missing"];
  const remoteIdentity = profileIdentityFor(remoteProfile);
  const expectedFriendCode = friendCodeFor(localProfile);
  const problems = [
    remoteProfile.id === localProfile.id ? "" : "id mismatch",
    remoteProfile.cloudMode === "supabase" ? "" : "profile was not read from Supabase",
    remoteIdentity.email ? "" : "email missing",
    localProfile.email && remoteIdentity.email !== localProfile.email ? "email mismatch" : "",
    remoteIdentity.displayName ? "" : "display name missing",
    remoteIdentity.displayName !== localProfile.displayName ? "display name mismatch" : "",
    remoteIdentity.location ? "" : "location missing",
    remoteIdentity.location !== localProfile.location ? "location mismatch" : "",
    remoteIdentity.friendCode ? "" : "friend code missing",
    remoteIdentity.friendCode !== expectedFriendCode ? "friend code mismatch" : "",
  ].filter(Boolean);
  return Array.from(new Set(problems));
};

const authUserIdentityFor = (user: SupabaseUser | undefined): CloudSyncVerification["authUserIdentity"] | undefined => {
  if (!user?.id) return undefined;
  return {
    id: user.id,
    email: user.email ?? "",
    provider: undefined,
    displayName: user.user_metadata?.full_name ?? user.user_metadata?.name,
  };
};

const authUserProblems = (
  user: SupabaseUser | undefined,
  profile: UserProfile,
  remoteProfile?: UserProfile,
) => {
  if (!user?.id) return ["Supabase Auth user was not read back"];
  const profileId = remoteProfile?.id ?? profile.id;
  const profileEmail = remoteProfile?.email ?? profile.email;
  return [
    user.id === profileId ? "" : `auth id ${user.id} != profile ${profileId}`,
    user.email ? "" : "auth email missing",
    profileEmail && user.email && user.email !== profileEmail ? "auth email mismatch" : "",
  ].filter(Boolean);
};

const currentSeasonKey = "world-cup-run";

export const leaderboardScopeFilter = (scope: LeaderboardScope, profile: UserProfile) => {
  if (scope === "friend") return `friend_code=eq.${friendCodeFor(profile)}`;
  if (scope === "season") return `season_key=eq.${currentSeasonKey}`;
  return "global xp desc";
};

const scoreRecords = (records: MemoryRecord[], modeRuns: GameModeRun[] = []) => {
  const revealed = records.filter((record) => record.result);
  const averageScore =
    revealed.length > 0
      ? Math.round(revealed.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0) / revealed.length)
      : 0;
  const bestScore = Math.max(0, ...revealed.map((record) => record.result?.totalScore ?? 0));
  const exactHits = revealed.filter((record) => (record.result?.breakdown.exactScore ?? 0) > 0).length;
  const verifiedProofs = records.filter(
    (record) =>
      record.capsule.filecoinProof.mode === "real" &&
      ["retrievable", "verified"].includes(record.capsule.filecoinProof.proofStatus),
  ).length;
  const latestRevealed = [...revealed].sort(
    (a, b) => new Date(b.result?.revealedAt ?? 0).getTime() - new Date(a.result?.revealedAt ?? 0).getTime(),
  );
  let streak = 0;
  for (const record of latestRevealed) {
    if ((record.result?.breakdown.winner ?? 0) <= 0) break;
    streak += 1;
  }
  const modeProofs = modeRuns.length;
  const modeScoreXp = modeRuns.reduce((sum, run) => sum + (run.score ?? 0), 0);
  const xp =
    records.length * 120 +
    revealed.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0) +
    modeProofs * 90 +
    modeScoreXp;
  return {
    locks: records.length,
    revealed: revealed.length,
    modeProofs,
    averageScore,
    bestScore,
    exactHits,
    verifiedProofs,
    streak,
    xp,
  };
};

export const getCloudState = (): CloudSyncState => {
  const session = loadSupabaseSession();
  const sessionExpired = isSupabaseSessionExpired(session, 0);
  const refreshable = Boolean(session?.refresh_token);
  if (!supabaseConfigured()) {
    return {
      configured: false,
      authenticated: false,
      mode: "local",
      status: "offline",
      message: "Local profile active. Add Supabase env vars to enable cloud sync.",
    };
  }
  return {
    configured: true,
    authenticated: Boolean(session?.access_token) && !sessionExpired,
    mode: "supabase",
    status: session?.access_token && !sessionExpired ? "ready" : "offline",
    message: session?.access_token
      ? sessionExpired && refreshable
        ? "Supabase session expired. It will refresh before the next cloud action."
        : sessionExpired
          ? "Supabase session expired. Send a new magic link to sign in."
          : "Supabase session ready. Records can sync across devices."
      : "Supabase configured. Send a magic link to sign in.",
    sessionExpiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
    sessionExpired,
    refreshable,
  };
};

export const shouldAutoRecoverCloudSession = (state: CloudSyncState) =>
  state.configured && (state.authenticated || Boolean(state.refreshable));

export const loadProfile = (): UserProfile => {
  const saved = localStorage.getItem(PROFILE_KEY);
  if (saved) return JSON.parse(saved) as UserProfile;
  const profile: UserProfile = {
    id: `local-${crypto.randomUUID()}`,
    email: "fan@kickoff.local",
    displayName: "Kickoff Analyst",
    location: "Chengdu",
    createdAt: new Date().toISOString(),
    cloudMode: supabaseConfigured() ? "supabase" : "local",
  };
  saveProfile(profile);
  return profile;
};

export const saveProfile = (profile: UserProfile) => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
};

export const loadSupabaseSession = (): SupabaseSession | undefined => {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return undefined;
  try {
    const session = JSON.parse(saved) as SupabaseSession;
    if (session?.access_token || session?.refresh_token) return session;
  } catch {
    // Bad local session state should not trap the account flow in a broken signed-in state.
  }
  clearSupabaseSession();
  return undefined;
};

export const refreshSupabaseSession = async (): Promise<SupabaseSession | undefined> => {
  const session = loadSupabaseSession();
  if (!supabaseConfigured() || !session) return session;
  if (!isSupabaseSessionExpired(session) && session.access_token) return session;
  if (!session.refresh_token) return session;
  if (refreshSessionInFlight) return refreshSessionInFlight;
  refreshSessionInFlight = (async () => {
    const res = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) {
      if ([400, 401, 403].includes(res.status)) clearSupabaseSession();
      throw new Error(`Session refresh failed: ${res.status}`);
    }
    const nextSession = normalizeSupabaseSession(await res.json(), session.refresh_token);
    saveSupabaseSession(nextSession);
    return nextSession;
  })().finally(() => {
    refreshSessionInFlight = undefined;
  });
  return refreshSessionInFlight;
};

const requireFreshSession = async () => {
  const session = await refreshSupabaseSession();
  if (!supabaseConfigured() || !session?.access_token || isSupabaseSessionExpired(session, 0)) {
    throw new Error("Sign in with Supabase before using cloud sync.");
  }
  return session;
};

export const consumeSupabaseHash = (): SupabaseSession | undefined => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  if (!accessToken) return loadSupabaseSession();
  const session = normalizeSupabaseSession({
    access_token: accessToken,
    refresh_token: hash.get("refresh_token") ?? undefined,
    expires_in: hash.get("expires_in"),
    expires_at: hash.get("expires_at"),
  });
  saveSupabaseSession(session);
  window.history.replaceState({}, "", window.location.pathname + window.location.search);
  return session;
};

export const hasSupabaseAuthCallback = () => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.has("access_token") || search.has("code");
};

const clearSupabaseCodeFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  params.delete("code");
  params.delete("state");
  const nextSearch = params.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
  );
};

export const exchangeSupabaseAuthCode = async (code: string, state?: string): Promise<SupabaseSession> => {
  if (!supabaseConfigured()) throw new Error("Supabase is not configured.");
  const request = loadSupabasePkceRequest();
  if (!request?.codeVerifier) throw new Error("Supabase PKCE verifier missing. Start Google sign-in again.");
  if (request.state !== state) {
    clearSupabasePkceRequest();
    throw new Error("Supabase OAuth state mismatch. Start Google sign-in again.");
  }
  const res = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      auth_code: code,
      code_verifier: request.codeVerifier,
    }),
  });
  if (!res.ok) throw new Error(`Supabase code exchange failed: ${res.status}`);
  const session = normalizeSupabaseSession(await res.json());
  saveSupabaseSession(session);
  clearSupabasePkceRequest();
  clearSupabaseCodeFromUrl();
  return session;
};

export const consumeSupabaseAuthCallback = async (): Promise<SupabaseSession | undefined> => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (hash.has("access_token")) return consumeSupabaseHash();
  const search = new URLSearchParams(window.location.search);
  const code = search.get("code");
  if (!code) return loadSupabaseSession();
  return exchangeSupabaseAuthCode(code, search.get("state") ?? undefined);
};

export const loadCurrentUser = async (): Promise<SupabaseUser | undefined> => {
  if (!supabaseConfigured() || !loadSupabaseSession()) return undefined;
  const session = await requireFreshSession();
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Profile load failed: ${res.status}`);
  return res.json();
};

export const hydrateProfileFromAuth = async (profile: UserProfile): Promise<UserProfile> => {
  const user = await loadCurrentUser();
  if (!user?.id) return profile;
  const next: UserProfile = {
    ...profile,
    id: user.id,
    email: user.email ?? profile.email,
    displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? profile.displayName,
    avatarUrl: user.user_metadata?.avatar_url ?? profile.avatarUrl,
    cloudMode: "supabase",
  };
  saveProfile(next);
  return next;
};

export const resolveCloudProfileForSync = async (profile: UserProfile): Promise<UserProfile> => {
  if (!supabaseConfigured() || !loadSupabaseSession()) return profile;
  const user = await loadCurrentUser();
  if (!user?.id) return profile;
  const next: UserProfile = {
    ...profile,
    id: user.id,
    email: user.email ?? profile.email,
    avatarUrl: user.user_metadata?.avatar_url ?? profile.avatarUrl,
    cloudMode: "supabase",
  };
  saveProfile(next);
  return next;
};

const cloudProfileValue = (incoming: string | undefined, fallback: string) => {
  const next = incoming?.trim();
  return next ? next : fallback;
};

export const mergeCloudProfile = (
  localProfile: UserProfile,
  cloudProfile?: UserProfile,
): UserProfile => {
  if (!cloudProfile) return localProfile;
  const next: UserProfile = {
    ...localProfile,
    id: cloudProfileValue(cloudProfile.id, localProfile.id),
    email: cloudProfileValue(cloudProfile.email, localProfile.email),
    displayName: cloudProfileValue(cloudProfile.displayName, localProfile.displayName),
    location: cloudProfileValue(cloudProfile.location, localProfile.location),
    friendCode: normalizeFriendCode(cloudProfile.friendCode ?? localProfile.friendCode ?? ""),
    avatarUrl: cloudProfile.avatarUrl ?? localProfile.avatarUrl,
    createdAt: localProfile.createdAt || cloudProfile.createdAt,
    cloudMode: "supabase",
  };
  saveProfile(next);
  return next;
};

const uniqueTruthy = (items: Array<string | undefined>) => [
  ...new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))),
];

const loadCurrentUserSoft = async () => loadCurrentUser().catch(() => undefined);

const cloudIdentityOrFilter = (
  profile: UserProfile,
  user: SupabaseUser | undefined,
  idColumn: "id" | "user_id",
) => {
  if (user?.id) return `(${idColumn}.eq.${user.id})`;
  const ids = uniqueTruthy([user?.id, profile.id]);
  const clauses = ids.map((id) => `${idColumn}.eq.${id}`);
  return `(${clauses.join(",")})`;
};

export const syncProfileToCloud = async (profile: UserProfile) => {
  if (!supabaseConfigured() || !loadSupabaseSession()) return;
  const session = await requireFreshSession();
  const cloudProfile = await resolveCloudProfileForSync(profile);
  const row = {
    id: cloudProfile.id,
    email: cloudProfile.email,
    display_name: cloudProfile.displayName,
    location: cloudProfile.location,
    avatar_url: cloudProfile.avatarUrl ?? null,
    friend_code: friendCodeFor(cloudProfile),
    updated_at: new Date().toISOString(),
  };
  const res = await fetch(restUrl("kickoff_profiles?on_conflict=id"), {
    method: "POST",
    headers: { ...headers(session), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Profile sync failed: ${res.status}`);
  return cloudProfile;
};

export const signOutCloud = async () => {
  const session = await refreshSupabaseSession().catch(() => loadSupabaseSession());
  if (supabaseConfigured() && session) {
    await fetch(`${supabaseUrl()}/auth/v1/logout`, {
      method: "POST",
      headers: headers(session),
    }).catch(() => undefined);
  }
  localStorage.removeItem(SESSION_KEY);
  clearSupabasePkceRequest();
};

export const sendMagicLink = async (email: string) => {
  if (!supabaseConfigured()) throw new Error("Supabase is not configured.");
  const normalizedEmail = normalizeAuthEmail(email);
  const redirectTo = authRedirectTo();
  const res = await fetch(`${supabaseUrl()}/auth/v1/otp`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email: normalizedEmail,
      create_user: true,
      options: { email_redirect_to: redirectTo },
    }),
  });
  if (!res.ok) throw new Error(`Magic link failed: ${res.status}`);
  return { email: normalizedEmail, redirectTo };
};

export const startGoogleSignIn = async () => {
  if (!supabaseConfigured()) throw new Error("Supabase is not configured.");
  const request = await buildSupabasePkceOAuthUrl("google", authRedirectTo());
  window.location.assign(request.url);
};

type CloudSyncWriteOptions = {
  profileAlreadySynced?: boolean;
};

export const syncRecordsToCloud = async (
  profile: UserProfile,
  records: MemoryRecord[],
  options: CloudSyncWriteOptions = {},
) => {
  if (!supabaseConfigured() || !loadSupabaseSession()) {
    return {
      status: "offline" as const,
      message: "Cloud sync skipped. Sign in with Supabase to sync records.",
    };
  }
  const session = await requireFreshSession();
  const cloudProfile = options.profileAlreadySynced ? profile : (await syncProfileToCloud(profile)) ?? profile;
  const rows = records.map((record) => ({
    id: record.capsule.id,
    user_id: cloudProfile.id,
    email: cloudProfile.email,
    display_name: cloudProfile.displayName,
    location: cloudProfile.location,
    friend_code: friendCodeFor(cloudProfile),
    season_key: currentSeasonKey,
    capsule: record.capsule,
    result: record.result ?? null,
    seal_job: record.sealJob ?? null,
    total_score: record.result?.totalScore ?? null,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) {
    return { status: "synced" as const, message: "No records to sync." };
  }
  const res = await fetch(restUrl("kickoff_records?on_conflict=id"), {
    method: "POST",
    headers: { ...headers(session), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Cloud sync failed: ${res.status}`);
  return { status: "synced" as const, message: `Synced ${rows.length} records to Supabase.` };
};

export const syncModeRunsToCloud = async (
  profile: UserProfile,
  modeRuns: GameModeRun[],
  options: CloudSyncWriteOptions = {},
) => {
  if (!supabaseConfigured() || !loadSupabaseSession()) {
    return {
      status: "offline" as const,
      message: "Mode proof sync skipped. Sign in with Supabase to sync mode runs.",
    };
  }
  const session = await requireFreshSession();
  const cloudProfile = options.profileAlreadySynced ? profile : (await syncProfileToCloud(profile)) ?? profile;
  const rows = modeRuns.map((run) => ({
    id: run.id,
    user_id: cloudProfile.id,
    email: cloudProfile.email,
    display_name: cloudProfile.displayName,
    location: cloudProfile.location,
    friend_code: friendCodeFor(cloudProfile),
    season_key: currentSeasonKey,
    mode_id: run.modeId,
    status: run.status,
    score: run.score ?? null,
    mode_run: run,
    created_at: run.createdAt,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) {
    return { status: "synced" as const, message: "No mode proof runs to sync." };
  }
  const res = await fetch(restUrl("kickoff_mode_runs?on_conflict=id"), {
    method: "POST",
    headers: { ...headers(session), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Mode proof sync failed: ${res.status}`);
  return { status: "synced" as const, message: `Synced ${rows.length} mode proof runs to Supabase.` };
};

export const shareArtifactCloudId = (artifact: Pick<ShareArtifactEvidence, "kind" | "id">) =>
  `${artifact.kind}:${artifact.id}`;

const shareArtifactRow = (
  profile: UserProfile,
  artifact: ShareArtifactEvidence,
) => ({
  id: artifact.id,
  kind: artifact.kind,
  user_id: profile.id,
  email: profile.email,
  display_name: profile.displayName,
  location: profile.location,
  friend_code: friendCodeFor(profile),
  season_key: currentSeasonKey,
  proof_url: artifact.proofUrl,
  image_generated: artifact.imageGenerated,
  generated_at: artifact.generatedAt ?? null,
  file_name: artifact.fileName ?? null,
  image_url: artifact.imageUrl ?? null,
  image_mime: artifact.imageMime ?? null,
  image_byte_length: artifact.imageByteLength ?? null,
  image_hash: artifact.imageHash ?? null,
  x_intent_url: artifact.xIntentUrl ?? null,
  x_intent_opened_at: artifact.xIntentOpenedAt ?? null,
  native_share_opened_at: artifact.nativeShareOpenedAt ?? null,
  artifact,
  updated_at: new Date().toISOString(),
});

const mapShareArtifactRow = (row: any): ShareArtifactEvidence => ({
  ...(row.artifact ?? {}),
  id: row.artifact?.id ?? row.id,
  kind: row.artifact?.kind ?? row.kind,
  proofUrl: row.artifact?.proofUrl ?? row.proof_url,
  imageGenerated: row.artifact?.imageGenerated ?? Boolean(row.image_generated),
  generatedAt: row.artifact?.generatedAt ?? row.generated_at ?? undefined,
  fileName: row.artifact?.fileName ?? row.file_name ?? undefined,
  imageUrl: row.artifact?.imageUrl ?? row.image_url ?? undefined,
  imageMime: row.artifact?.imageMime ?? row.image_mime ?? undefined,
  imageByteLength: row.artifact?.imageByteLength ?? row.image_byte_length ?? undefined,
  imageHash: row.artifact?.imageHash ?? row.image_hash ?? undefined,
  xIntentUrl: row.artifact?.xIntentUrl ?? row.x_intent_url ?? undefined,
  xIntentOpenedAt: row.artifact?.xIntentOpenedAt ?? row.x_intent_opened_at ?? undefined,
  nativeShareOpenedAt: row.artifact?.nativeShareOpenedAt ?? row.native_share_opened_at ?? undefined,
});

const canReadPublicShareImage = async (imageUrl?: string) => {
  if (!imageUrl || !imageUrl.startsWith("https://")) return false;
  try {
    const res = await fetch(imageUrl, { method: "GET", cache: "no-store" });
    const validation = await validatePublicShareImageResponse(res);
    return validation.passed;
  } catch {
    return false;
  }
};

export const syncShareArtifactsToCloud = async (
  profile: UserProfile,
  artifacts: ShareArtifactEvidence[],
  options: CloudSyncWriteOptions = {},
) => {
  if (!supabaseConfigured() || !loadSupabaseSession()) {
    return {
      status: "offline" as const,
      message: "Share artifact sync skipped. Sign in with Supabase to sync proof cards.",
    };
  }
  const session = await requireFreshSession();
  const cloudProfile = options.profileAlreadySynced ? profile : (await syncProfileToCloud(profile)) ?? profile;
  const rows = artifacts.map((artifact) => shareArtifactRow(cloudProfile, artifact));
  if (rows.length === 0) {
    return { status: "synced" as const, message: "No share artifacts to sync." };
  }
  const res = await fetch(restUrl("kickoff_share_artifacts?on_conflict=id,kind"), {
    method: "POST",
    headers: { ...headers(session), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Share artifact sync failed: ${res.status}`);
  return { status: "synced" as const, message: `Synced ${rows.length} share artifacts to Supabase.` };
};

export const syncCloudOutboxToCloud = async (
  profile: UserProfile,
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  shareArtifacts: ShareArtifactEvidence[] = [],
) => {
  if (!supabaseConfigured() || !loadSupabaseSession()) {
    return {
      status: "offline" as const,
      profile,
      message: "Cloud outbox sync skipped. Sign in with Supabase to sync profile and history.",
    };
  }
  const cloudProfile = (await syncProfileToCloud(profile)) ?? profile;
  const [recordsResult, modeRunsResult, shareArtifactsResult] = await Promise.all([
    records.length > 0
      ? syncRecordsToCloud(cloudProfile, records, { profileAlreadySynced: true })
      : Promise.resolve({ status: "synced" as const, message: "No records to sync." }),
    modeRuns.length > 0
      ? syncModeRunsToCloud(cloudProfile, modeRuns, { profileAlreadySynced: true })
      : Promise.resolve({ status: "synced" as const, message: "No mode proof runs to sync." }),
    shareArtifacts.length > 0
      ? syncShareArtifactsToCloud(cloudProfile, shareArtifacts, { profileAlreadySynced: true })
      : Promise.resolve({ status: "synced" as const, message: "No share artifacts to sync." }),
  ]);
  return {
    status: "synced" as const,
    profile: cloudProfile,
    records: recordsResult,
    modeRuns: modeRunsResult,
    shareArtifacts: shareArtifactsResult,
    message: "Cloud outbox synced with profile read-back prerequisites.",
  };
};

export const uploadShareImageToCloud = async (
  profile: UserProfile,
  artifact: Pick<ShareArtifactEvidence, "id" | "kind" | "fileName" | "imageMime">,
  dataUrl: string,
) => {
  if (!supabaseConfigured() || !loadSupabaseSession()) {
    return {
      status: "skipped" as const,
      message: "Share image upload skipped. Sign in with Supabase to publish public image URLs.",
    };
  }
  const session = await requireFreshSession();
  const path = shareImageStoragePath(profile, artifact);
  const blob = await dataUrlToBlob(dataUrl);
  const res = await fetch(storageObjectUrl(supabaseShareBucket(), path), {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey(),
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": artifact.imageMime || blob.type || "image/png",
      "x-upsert": "true",
    },
    body: blob,
  });
  if (!res.ok) throw new Error(`Share image upload failed: ${res.status}`);
  return {
    status: "uploaded" as const,
    message: "Share image uploaded to Supabase Storage.",
    path,
    imageUrl: publicShareImageUrl(path),
  };
};

const recordCompleteness = (record: MemoryRecord) => {
  const realProof = record.capsule.filecoinProof.mode === "real" ? 4 : 0;
  const verifiedSeal = record.sealJob?.status === "verified" ? 3 : 0;
  const result = record.result ? 8 : 0;
  const timestamp = new Date(
    record.result?.revealedAt ??
      record.sealJob?.updatedAt ??
      record.capsule.sealedAt ??
      record.capsule.createdAt,
  ).getTime();
  return result + realProof + verifiedSeal + (Number.isFinite(timestamp) ? timestamp / 1_000_000_000_000_000 : 0);
};

const chooseRecordVersion = (current: MemoryRecord, incoming: MemoryRecord) =>
  recordCompleteness(incoming) >= recordCompleteness(current) ? incoming : current;

export const mergeMemoryRecords = (localRecords: MemoryRecord[], cloudRecords: MemoryRecord[]) => {
  const byId = new Map<string, MemoryRecord>();
  [...localRecords, ...cloudRecords].forEach((record) => {
    const current = byId.get(record.capsule.id);
    byId.set(record.capsule.id, current ? chooseRecordVersion(current, record) : record);
  });
  return [...byId.values()].sort(
    (a, b) =>
      new Date(b.result?.revealedAt ?? b.capsule.sealedAt ?? b.capsule.createdAt).getTime() -
      new Date(a.result?.revealedAt ?? a.capsule.sealedAt ?? a.capsule.createdAt).getTime(),
  );
};

const modeRunCompleteness = (run: GameModeRun) => {
  const scored = run.status === "scored" ? 8 : 0;
  const realProof = run.filecoinProof.mode === "real" ? 4 : 0;
  const artifact = run.artifact ? 2 : 0;
  const score = run.score ?? 0;
  const timestamp = new Date(run.createdAt).getTime();
  return scored + realProof + artifact + score / 1000 + (Number.isFinite(timestamp) ? timestamp / 1_000_000_000_000_000 : 0);
};

const chooseModeRunVersion = (current: GameModeRun, incoming: GameModeRun) =>
  modeRunCompleteness(incoming) >= modeRunCompleteness(current) ? incoming : current;

export const mergeModeRuns = (localRuns: GameModeRun[], cloudRuns: GameModeRun[]) => {
  const byId = new Map<string, GameModeRun>();
  [...localRuns, ...cloudRuns].forEach((run) => {
    const current = byId.get(run.id);
    byId.set(run.id, current ? chooseModeRunVersion(current, run) : run);
  });
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
};

const shareArtifactCompleteness = (artifact: ShareArtifactEvidence) => {
  const timestamp = new Date(
    artifact.nativeShareOpenedAt ?? artifact.xIntentOpenedAt ?? artifact.generatedAt ?? 0,
  ).getTime();
  return (
    (artifact.imageGenerated ? 4 : 0) +
    (artifact.imageHash ? 4 : 0) +
    (artifact.imageUrl ? 4 : 0) +
    (artifact.fileName ? 2 : 0) +
    (artifact.imageByteLength ? 2 : 0) +
    (artifact.xIntentUrl ? 1 : 0) +
    (artifact.xIntentOpenedAt || artifact.nativeShareOpenedAt ? 3 : 0) +
    (Number.isFinite(timestamp) ? timestamp / 1_000_000_000_000_000 : 0)
  );
};

export const recordContentFingerprint = (record: MemoryRecord) =>
  stableJson({
    capsule: {
      id: record.capsule.id,
      matchId: record.capsule.matchId,
      matchLabel: record.capsule.matchLabel,
      kickoffAt: record.capsule.kickoffAt,
      createdAt: record.capsule.createdAt,
      sealedAt: record.capsule.sealedAt,
      locked: record.capsule.locked,
      lateLock: record.capsule.lateLock,
      prediction: record.capsule.prediction,
      payloadHash: record.capsule.payloadHash,
      filecoinProof: record.capsule.filecoinProof,
    },
    result: record.result ?? null,
    sealJob: record.sealJob
      ? {
          id: record.sealJob.id,
          capsuleId: record.sealJob.capsuleId,
          status: record.sealJob.status,
          proofUrl: record.sealJob.proofUrl,
          verifyUrl: record.sealJob.verifyUrl,
          uploadPayloadHash: record.sealJob.uploadPayloadHash,
          uploadByteLength: record.sealJob.uploadByteLength,
          proofRegistryStatus: record.sealJob.proofRegistryStatus,
          proofRegistryHash: record.sealJob.proofRegistryHash,
          proofRegistryByteLength: record.sealJob.proofRegistryByteLength,
          proof: record.sealJob.proof,
        }
      : null,
  });

export const modeRunContentFingerprint = (run: GameModeRun) =>
  stableJson({
    id: run.id,
    modeId: run.modeId,
    title: run.title,
    createdAt: run.createdAt,
    capsuleIds: run.capsuleIds,
    payloadHash: run.payloadHash,
    filecoinProof: run.filecoinProof,
    status: run.status,
    score: run.score ?? null,
    summary: run.summary,
    requirements: run.requirements,
    artifact: run.artifact ?? null,
    sealJob: run.sealJob
      ? {
          id: run.sealJob.id,
          capsuleId: run.sealJob.capsuleId,
          status: run.sealJob.status,
          proofUrl: run.sealJob.proofUrl,
          verifyUrl: run.sealJob.verifyUrl,
          uploadPayloadHash: run.sealJob.uploadPayloadHash,
          uploadByteLength: run.sealJob.uploadByteLength,
          proofRegistryStatus: run.sealJob.proofRegistryStatus,
          proofRegistryHash: run.sealJob.proofRegistryHash,
          proofRegistryByteLength: run.sealJob.proofRegistryByteLength,
          proof: run.sealJob.proof,
        }
      : null,
  });

export const shareArtifactContentFingerprint = (artifact: ShareArtifactEvidence) =>
  stableJson({
    cloudId: shareArtifactCloudId(artifact),
    id: artifact.id,
    kind: artifact.kind,
    proofUrl: artifact.proofUrl,
    imageGenerated: artifact.imageGenerated,
    generatedAt: artifact.generatedAt ?? null,
    fileName: artifact.fileName ?? null,
    imageUrl: artifact.imageUrl ?? null,
    imageMime: artifact.imageMime ?? null,
    imageByteLength: artifact.imageByteLength ?? null,
    imageHash: artifact.imageHash ?? null,
    xIntentUrl: artifact.xIntentUrl ?? null,
    xIntentOpenedAt: artifact.xIntentOpenedAt ?? null,
    nativeShareOpenedAt: artifact.nativeShareOpenedAt ?? null,
  });

const mergeShareArtifactVersion = (
  current: ShareArtifactEvidence,
  incoming: ShareArtifactEvidence,
): ShareArtifactEvidence => {
  const preferred =
    shareArtifactCompleteness(incoming) >= shareArtifactCompleteness(current) ? incoming : current;
  const fallback = preferred === incoming ? current : incoming;
  const preferredGeneratedAt = preferred.generatedAt ? new Date(preferred.generatedAt).getTime() : 0;
  const fallbackGeneratedAt = fallback.generatedAt ? new Date(fallback.generatedAt).getTime() : 0;
  const imageSource = fallbackGeneratedAt > preferredGeneratedAt ? fallback : preferred;
  return {
    ...fallback,
    ...preferred,
    generatedAt: preferred.generatedAt ?? fallback.generatedAt,
    fileName: imageSource.fileName ?? preferred.fileName ?? fallback.fileName,
    imageUrl: imageSource.imageUrl ?? preferred.imageUrl ?? fallback.imageUrl,
    imageMime: imageSource.imageMime ?? preferred.imageMime ?? fallback.imageMime,
    imageByteLength: imageSource.imageByteLength ?? preferred.imageByteLength ?? fallback.imageByteLength,
    imageHash: imageSource.imageHash ?? preferred.imageHash ?? fallback.imageHash,
    xIntentUrl: preferred.xIntentUrl ?? fallback.xIntentUrl,
    xIntentOpenedAt: preferred.xIntentOpenedAt ?? fallback.xIntentOpenedAt,
    nativeShareOpenedAt: preferred.nativeShareOpenedAt ?? fallback.nativeShareOpenedAt,
  };
};

export const mergeShareArtifacts = (
  localArtifacts: ShareArtifactEvidence[],
  cloudArtifacts: ShareArtifactEvidence[],
) => {
  const byId = new Map<string, ShareArtifactEvidence>();
  [...localArtifacts, ...cloudArtifacts].forEach((artifact) => {
    const key = shareArtifactCloudId(artifact);
    const current = byId.get(key);
    byId.set(key, current ? mergeShareArtifactVersion(current, artifact) : artifact);
  });
  return [...byId.values()].sort(
    (a, b) =>
      new Date(b.nativeShareOpenedAt ?? b.xIntentOpenedAt ?? b.generatedAt ?? 0).getTime() -
      new Date(a.nativeShareOpenedAt ?? a.xIntentOpenedAt ?? a.generatedAt ?? 0).getTime(),
  );
};

export type CloudRecoverySnapshot = {
  profile: UserProfile;
  records: MemoryRecord[];
  modeRuns: GameModeRun[];
  shareArtifacts: ShareArtifactEvidence[];
  remoteRecordCount: number;
  remoteModeRunCount: number;
  remoteShareArtifactCount: number;
  hasRemoteHistory: boolean;
};

export const buildCloudRecoverySnapshot = ({
  localProfile,
  remoteProfile,
  localRecords,
  remoteRecords,
  localModeRuns,
  remoteModeRuns,
  localShareArtifacts,
  remoteShareArtifacts,
}: {
  localProfile: UserProfile;
  remoteProfile?: UserProfile;
  localRecords: MemoryRecord[];
  remoteRecords: MemoryRecord[];
  localModeRuns: GameModeRun[];
  remoteModeRuns: GameModeRun[];
  localShareArtifacts: ShareArtifactEvidence[];
  remoteShareArtifacts: ShareArtifactEvidence[];
}): CloudRecoverySnapshot => {
  const records = mergeMemoryRecords(localRecords, remoteRecords);
  const modeRuns = mergeModeRuns(localModeRuns, remoteModeRuns);
  const shareArtifacts = mergeShareArtifacts(localShareArtifacts, remoteShareArtifacts);
  return {
    profile: mergeCloudProfile(localProfile, remoteProfile),
    records,
    modeRuns,
    shareArtifacts,
    remoteRecordCount: remoteRecords.length,
    remoteModeRunCount: remoteModeRuns.length,
    remoteShareArtifactCount: remoteShareArtifacts.length,
    hasRemoteHistory: remoteRecords.length > 0 || remoteModeRuns.length > 0 || remoteShareArtifacts.length > 0,
  };
};

export const cloudRecoveryMessage = (reason: string, snapshot: CloudRecoverySnapshot) =>
  snapshot.hasRemoteHistory
    ? `${reason} merged ${snapshot.remoteRecordCount} cloud records, ${snapshot.remoteModeRunCount} mode proof runs and ${snapshot.remoteShareArtifactCount} share manifests.`
    : `${reason} no cloud history found; local records, mode runs and share manifests are ready to sync.`;

export const loadRecordsFromCloud = async (profile: UserProfile): Promise<MemoryRecord[]> => {
  const session = await requireFreshSession();
  const user = await loadCurrentUserSoft();
  const params = new URLSearchParams({
    select: "capsule,result,seal_job,updated_at",
    or: cloudIdentityOrFilter(profile, user, "user_id"),
    order: "updated_at.desc",
  });
  const res = await fetch(restUrl(`kickoff_records?${params.toString()}`), {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Cloud history load failed: ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows.map((row) => ({
    capsule: row.capsule,
    result: row.result ?? undefined,
    sealJob: row.seal_job ?? undefined,
  }));
};

export const loadModeRunsFromCloud = async (profile: UserProfile): Promise<GameModeRun[]> => {
  const session = await requireFreshSession();
  const user = await loadCurrentUserSoft();
  const params = new URLSearchParams({
    select: "mode_run,updated_at",
    or: cloudIdentityOrFilter(profile, user, "user_id"),
    order: "updated_at.desc",
  });
  const res = await fetch(restUrl(`kickoff_mode_runs?${params.toString()}`), {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Cloud mode proof load failed: ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows.map((row) => row.mode_run as GameModeRun).filter(Boolean);
};

export const loadShareArtifactsFromCloud = async (
  profile: UserProfile,
): Promise<ShareArtifactEvidence[]> => {
  const session = await requireFreshSession();
  const user = await loadCurrentUserSoft();
  const params = new URLSearchParams({
    select: "artifact,id,kind,proof_url,image_generated,generated_at,file_name,image_url,image_mime,image_byte_length,image_hash,x_intent_url,x_intent_opened_at,native_share_opened_at,updated_at",
    or: cloudIdentityOrFilter(profile, user, "user_id"),
    order: "updated_at.desc",
  });
  const res = await fetch(restUrl(`kickoff_share_artifacts?${params.toString()}`), {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Cloud share artifact load failed: ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows.map(mapShareArtifactRow).filter((artifact) => artifact.id && artifact.kind);
};

const ownerMapFromRows = (rows: any[], keyFor: (row: any) => string) =>
  Object.fromEntries(
    rows
      .map((row) => [keyFor(row), String(row?.user_id ?? "")] as const)
      .filter(([id, owner]) => id && owner),
  );

const loadRecordOwnerRows = async (profile: UserProfile) => {
  const session = await requireFreshSession();
  const user = await loadCurrentUserSoft();
  const params = new URLSearchParams({
    select: "id,user_id",
    or: cloudIdentityOrFilter(profile, user, "user_id"),
  });
  const res = await fetch(restUrl(`kickoff_records?${params.toString()}`), {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Cloud record owner read-back failed: ${res.status}`);
  return (await res.json()) as any[];
};

const loadModeRunOwnerRows = async (profile: UserProfile) => {
  const session = await requireFreshSession();
  const user = await loadCurrentUserSoft();
  const params = new URLSearchParams({
    select: "id,user_id",
    or: cloudIdentityOrFilter(profile, user, "user_id"),
  });
  const res = await fetch(restUrl(`kickoff_mode_runs?${params.toString()}`), {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Cloud mode owner read-back failed: ${res.status}`);
  return (await res.json()) as any[];
};

const loadShareArtifactOwnerRows = async (profile: UserProfile) => {
  const session = await requireFreshSession();
  const user = await loadCurrentUserSoft();
  const params = new URLSearchParams({
    select: "id,kind,user_id",
    or: cloudIdentityOrFilter(profile, user, "user_id"),
  });
  const res = await fetch(restUrl(`kickoff_share_artifacts?${params.toString()}`), {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Cloud share artifact owner read-back failed: ${res.status}`);
  return (await res.json()) as any[];
};

export const loadProfileFromCloud = async (profile: UserProfile): Promise<UserProfile | undefined> => {
  const session = await requireFreshSession();
  const user = await loadCurrentUserSoft();
  const params = user?.id
    ? new URLSearchParams({
        select: "*",
        id: `eq.${user.id}`,
        limit: "1",
      })
    : new URLSearchParams({
        select: "*",
        or: cloudIdentityOrFilter(profile, user, "id"),
        order: "updated_at.desc",
        limit: "1",
      });
  const res = await fetch(restUrl(`kickoff_profiles?${params.toString()}`), {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Cloud profile load failed: ${res.status}`);
  const [row] = (await res.json()) as any[];
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email ?? profile.email,
    displayName: row.display_name ?? profile.displayName,
    location: row.location ?? profile.location,
    friendCode: row.friend_code ?? profile.friendCode,
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: row.updated_at ?? profile.createdAt,
    cloudMode: "supabase",
  };
};

export const loadPublicRecord = async (capsuleId: string, anonymous = true): Promise<MemoryRecord | undefined> => {
  if (!supabaseConfigured() || !capsuleId) return undefined;
  const params = new URLSearchParams({
    select: "capsule,result,seal_job",
    id: `eq.${capsuleId}`,
    limit: "1",
  });
  const res = await fetch(restUrl(`kickoff_records?${params.toString()}`), {
    headers: headers(anonymous ? undefined : loadSupabaseSession()),
  });
  if (!res.ok) throw new Error(`Public proof load failed: ${res.status}`);
  const [row] = (await res.json()) as any[];
  if (!row) return undefined;
  return {
    capsule: row.capsule,
    result: row.result ?? undefined,
    sealJob: row.seal_job ?? undefined,
  };
};

export const loadPublicModeRun = async (runId: string, anonymous = true): Promise<GameModeRun | undefined> => {
  if (!supabaseConfigured() || !runId) return undefined;
  const params = new URLSearchParams({
    select: "mode_run",
    id: `eq.${runId}`,
    limit: "1",
  });
  const res = await fetch(restUrl(`kickoff_mode_runs?${params.toString()}`), {
    headers: headers(anonymous ? undefined : loadSupabaseSession()),
  });
  if (!res.ok) throw new Error(`Public mode proof load failed: ${res.status}`);
  const [row] = (await res.json()) as any[];
  return row?.mode_run as GameModeRun | undefined;
};

export const loadPublicShareArtifact = async (
  id: string,
  kind: ShareArtifactEvidence["kind"],
  anonymous = true,
): Promise<ShareArtifactEvidence | undefined> => {
  if (!supabaseConfigured() || !id) return undefined;
  const params = new URLSearchParams({
    select: "artifact,id,kind,proof_url,image_generated,generated_at,file_name,image_url,image_mime,image_byte_length,image_hash,x_intent_url,x_intent_opened_at,native_share_opened_at,updated_at",
    id: `eq.${id}`,
    kind: `eq.${kind}`,
    limit: "1",
  });
  const res = await fetch(restUrl(`kickoff_share_artifacts?${params.toString()}`), {
    headers: headers(anonymous ? undefined : loadSupabaseSession()),
  });
  if (!res.ok) throw new Error(`Public share artifact load failed: ${res.status}`);
  const [row] = (await res.json()) as any[];
  return row ? mapShareArtifactRow(row) : undefined;
};

export const buildPublicProfile = (
  profile: UserProfile,
  records: MemoryRecord[],
  modeRuns: GameModeRun[] = [],
  shareArtifacts: ShareArtifactEvidence[] = [],
): PublicProfile => {
  const revealed = records.filter((record) => record.result);
  const averageScore =
    revealed.length > 0
      ? Math.round(revealed.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0) / revealed.length)
      : 0;
  const bestScore = Math.max(0, ...revealed.map((record) => record.result?.totalScore ?? 0));
  const xp = records.length * 120 + revealed.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0);
  const modeXp = modeRuns.length * 90 + modeRuns.reduce((sum, run) => sum + (run.score ?? 0), 0);

  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    location: profile.location,
    avatarUrl: profile.avatarUrl,
    friendCode: friendCodeFor(profile),
    records,
    modeRuns,
    shareArtifacts,
    locks: records.length,
    revealed: revealed.length,
    modeProofs: modeRuns.length,
    averageScore,
    bestScore,
    xp: xp + modeXp,
  };
};

const buildPublicProfileFromRows = (
  profileRow: any,
  recordRows: any[],
  modeRunRows: any[],
  shareArtifactRows: any[] = [],
): PublicProfile => {
  const records = recordRows.map((row) => ({
    capsule: row.capsule,
    result: row.result ?? undefined,
    sealJob: row.seal_job ?? undefined,
  })) as MemoryRecord[];
  const modeRuns = modeRunRows.map((row) => row.mode_run as GameModeRun).filter(Boolean);
  const recordIds = new Set(records.map((record) => record.capsule.id));
  const modeRunIds = new Set(modeRuns.map((run) => run.id));
  const shareArtifacts = shareArtifactRows
    .map(mapShareArtifactRow)
    .filter((artifact) =>
      artifact.kind === "record"
        ? recordIds.has(artifact.id)
        : artifact.kind === "mode"
          ? modeRunIds.has(artifact.id)
          : false,
    );
  const publicProfile = buildPublicProfile(
    {
      id: profileRow.id,
      email: profileRow.email ?? "",
      displayName: profileRow.display_name ?? "Unknown analyst",
      location: profileRow.location ?? "Global",
      avatarUrl: profileRow.avatar_url ?? undefined,
      createdAt: profileRow.updated_at ?? new Date().toISOString(),
      cloudMode: "supabase",
    },
    records,
    modeRuns,
    shareArtifacts,
  );
  return {
    ...publicProfile,
    friendCode: profileRow.friend_code ?? publicProfile.friendCode,
  };
};

export const loadPublicProfile = async (profileId: string, anonymous = true): Promise<PublicProfile | undefined> => {
  if (!supabaseConfigured() || !profileId) return undefined;
  const profileParams = new URLSearchParams({
    select: "*",
    id: `eq.${profileId}`,
    limit: "1",
  });
  const profileRes = await fetch(restUrl(`kickoff_profiles?${profileParams.toString()}`), {
    headers: headers(anonymous ? undefined : loadSupabaseSession()),
  });
  if (!profileRes.ok) throw new Error(`Public profile load failed: ${profileRes.status}`);
  const [profileRow] = (await profileRes.json()) as any[];
  if (!profileRow) return undefined;

  const recordParams = new URLSearchParams({
    select: "capsule,result,seal_job,updated_at",
    user_id: `eq.${profileId}`,
    order: "updated_at.desc",
    limit: "30",
  });
  const recordsRes = await fetch(restUrl(`kickoff_records?${recordParams.toString()}`), {
    headers: headers(anonymous ? undefined : loadSupabaseSession()),
  });
  if (!recordsRes.ok) throw new Error(`Public profile records load failed: ${recordsRes.status}`);
  const recordRows = (await recordsRes.json()) as any[];

  const modeRunParams = new URLSearchParams({
    select: "mode_run,updated_at",
    user_id: `eq.${profileId}`,
    order: "updated_at.desc",
    limit: "30",
  });
  const modeRunsRes = await fetch(restUrl(`kickoff_mode_runs?${modeRunParams.toString()}`), {
    headers: headers(anonymous ? undefined : loadSupabaseSession()),
  });
  if (!modeRunsRes.ok) throw new Error(`Public profile mode proof load failed: ${modeRunsRes.status}`);
  const modeRunRows = (await modeRunsRes.json()) as any[];

  const shareArtifactParams = new URLSearchParams({
    select: "artifact,id,kind,proof_url,image_generated,generated_at,file_name,image_url,image_mime,image_byte_length,image_hash,x_intent_url,x_intent_opened_at,native_share_opened_at,updated_at",
    user_id: `eq.${profileId}`,
    order: "updated_at.desc",
    limit: "60",
  });
  const shareArtifactsRes = await fetch(restUrl(`kickoff_share_artifacts?${shareArtifactParams.toString()}`), {
    headers: headers(anonymous ? undefined : loadSupabaseSession()),
  });
  if (!shareArtifactsRes.ok) throw new Error(`Public profile share artifacts load failed: ${shareArtifactsRes.status}`);
  const shareArtifactRows = (await shareArtifactsRes.json()) as any[];
  return buildPublicProfileFromRows(profileRow, recordRows, modeRunRows, shareArtifactRows);
};

export const verifyCloudSyncReadback = async (
  profile: UserProfile,
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  shareArtifacts: ShareArtifactEvidence[] = [],
): Promise<CloudSyncVerification> => {
  if (!supabaseConfigured() || !loadSupabaseSession()) {
    return {
      checkedAt: new Date().toISOString(),
      backendHealth: await loadCloudBackendHealth(true),
      profile: false,
      authUserProblems: ["Supabase session is not available"],
      profileIdentityProblems: ["Supabase session is not available"],
      records: 0,
      modeRuns: 0,
      publicProofs: 0,
      shareArtifacts: 0,
      publicShareImages: 0,
      publicProfile: false,
      expectedRecords: records.length,
      expectedModeRuns: modeRuns.length,
      expectedShareArtifacts: shareArtifacts.length,
      recordIds: [],
      modeRunIds: [],
      publicProofIds: [],
      publicProofContentIds: [],
      shareArtifactIds: [],
      recordOwnerIds: {},
      modeRunOwnerIds: {},
      shareArtifactOwnerIds: {},
      publicShareImageIds: [],
      publicProfileRecordIds: [],
      publicProfileModeRunIds: [],
      publicProfileShareArtifactIds: [],
      publicProfileRecordContentIds: [],
      publicProfileModeRunContentIds: [],
      publicProfileShareArtifactContentIds: [],
      recordContentIds: [],
      modeRunContentIds: [],
      shareArtifactContentIds: [],
      missingRecordIds: records.map((record) => record.capsule.id),
      missingModeRunIds: modeRuns.map((run) => run.id),
      missingPublicProofIds: [
        ...records.map((record) => `record:${record.capsule.id}`),
        ...modeRuns.map((run) => `mode:${run.id}`),
      ],
      missingPublicProofContentIds: [
        ...records.map((record) => `record:${record.capsule.id}`),
        ...modeRuns.map((run) => `mode:${run.id}`),
      ],
      missingShareArtifactIds: shareArtifacts.map(shareArtifactCloudId),
      missingPublicShareImageIds: shareArtifacts.map(shareArtifactCloudId),
      missingPublicProfileRecordIds: records.map((record) => record.capsule.id),
      missingPublicProfileModeRunIds: modeRuns.map((run) => run.id),
      missingPublicProfileShareArtifactIds: shareArtifacts.map(shareArtifactCloudId),
      missingPublicProfileRecordContentIds: records.map((record) => record.capsule.id),
      missingPublicProfileModeRunContentIds: modeRuns.map((run) => run.id),
      missingPublicProfileShareArtifactContentIds: shareArtifacts.map(shareArtifactCloudId),
      missingRecordContentIds: records.map((record) => record.capsule.id),
      missingModeRunContentIds: modeRuns.map((run) => run.id),
      missingShareArtifactContentIds: shareArtifacts.map(shareArtifactCloudId),
      message: "Cloud read-back skipped. Supabase session is not available.",
    };
  }

  const [
    backendHealth,
    currentUser,
    remoteProfile,
    remoteRecords,
    remoteModeRuns,
    remoteShareArtifacts,
    recordOwnerRows,
    modeRunOwnerRows,
    shareArtifactOwnerRows,
    publicProfile,
    publicRecords,
    publicModeRuns,
  ] = await Promise.all([
    loadCloudBackendHealth(true),
    loadCurrentUserSoft(),
    loadProfileFromCloud(profile),
    loadRecordsFromCloud(profile),
    loadModeRunsFromCloud(profile),
    loadShareArtifactsFromCloud(profile).catch(() => []),
    loadRecordOwnerRows(profile),
    loadModeRunOwnerRows(profile),
    loadShareArtifactOwnerRows(profile).catch(() => []),
    loadPublicProfile(profile.id, true).catch(() => undefined),
    Promise.all(records.map((record) => loadPublicRecord(record.capsule.id, true).catch(() => undefined))),
    Promise.all(modeRuns.map((run) => loadPublicModeRun(run.id, true).catch(() => undefined))),
  ]);

  const expectedRecordIds = new Set(records.map((record) => record.capsule.id));
  const expectedModeRunIds = new Set(modeRuns.map((run) => run.id));
  const expectedShareArtifactIds = new Set(shareArtifacts.map(shareArtifactCloudId));
  const recordIds = remoteRecords
    .filter((record) => expectedRecordIds.has(record.capsule.id))
    .map((record) => record.capsule.id);
  const modeRunIds = remoteModeRuns
    .filter((run) => expectedModeRunIds.has(run.id))
    .map((run) => run.id);
  const shareArtifactIds = remoteShareArtifacts
    .filter((artifact) => expectedShareArtifactIds.has(shareArtifactCloudId(artifact)))
    .map(shareArtifactCloudId);
  const remoteRecordById = new Map(remoteRecords.map((record) => [record.capsule.id, record]));
  const remoteModeRunById = new Map(remoteModeRuns.map((run) => [run.id, run]));
  const remoteShareArtifactById = new Map(remoteShareArtifacts.map((artifact) => [shareArtifactCloudId(artifact), artifact]));
  const recordContentIds = records
    .filter((record) => {
      const remote = remoteRecordById.get(record.capsule.id);
      return remote ? recordContentFingerprint(remote) === recordContentFingerprint(record) : false;
    })
    .map((record) => record.capsule.id);
  const modeRunContentIds = modeRuns
    .filter((run) => {
      const remote = remoteModeRunById.get(run.id);
      return remote ? modeRunContentFingerprint(remote) === modeRunContentFingerprint(run) : false;
    })
    .map((run) => run.id);
  const shareArtifactContentIds = shareArtifacts
    .filter((artifact) => {
      const remote = remoteShareArtifactById.get(shareArtifactCloudId(artifact));
      return remote ? shareArtifactContentFingerprint(remote) === shareArtifactContentFingerprint(artifact) : false;
    })
    .map(shareArtifactCloudId);
  const publicShareImageChecks = await Promise.all(
    shareArtifacts.map(async (artifact) => {
      const id = shareArtifactCloudId(artifact);
      const remote = remoteShareArtifactById.get(id);
      return {
        id,
        readable: await canReadPublicShareImage(remote?.imageUrl ?? artifact.imageUrl),
      };
    }),
  );
  const publicShareImageIds = publicShareImageChecks.filter((item) => item.readable).map((item) => item.id);
  const publicRecordIds = publicRecords.flatMap((record) =>
    record && expectedRecordIds.has(record.capsule.id) ? [`record:${record.capsule.id}`] : [],
  );
  const publicModeRunIds = publicModeRuns.flatMap((run) =>
    run && expectedModeRunIds.has(run.id) ? [`mode:${run.id}`] : [],
  );
  const publicProofIds = [...publicRecordIds, ...publicModeRunIds];
  const publicRecordContentIds = records
    .filter((record, index) => {
      const publicRecord = publicRecords[index];
      return publicRecord ? recordContentFingerprint(publicRecord) === recordContentFingerprint(record) : false;
    })
    .map((record) => `record:${record.capsule.id}`);
  const publicModeRunContentIds = modeRuns
    .filter((run, index) => {
      const publicModeRun = publicModeRuns[index];
      return publicModeRun ? modeRunContentFingerprint(publicModeRun) === modeRunContentFingerprint(run) : false;
    })
    .map((run) => `mode:${run.id}`);
  const publicProofContentIds = [...publicRecordContentIds, ...publicModeRunContentIds];
  const publicProfileRecordIds = publicProfile
    ? publicProfile.records
        .filter((record) => expectedRecordIds.has(record.capsule.id))
        .map((record) => record.capsule.id)
    : [];
  const publicProfileModeRunIds = publicProfile
    ? publicProfile.modeRuns
        .filter((run) => expectedModeRunIds.has(run.id))
        .map((run) => run.id)
    : [];
  const publicProfileShareArtifactIds = publicProfile
    ? publicProfile.shareArtifacts
        .filter((artifact) => expectedShareArtifactIds.has(shareArtifactCloudId(artifact)))
        .map(shareArtifactCloudId)
    : [];
  const publicProfileRecordById = new Map((publicProfile?.records ?? []).map((record) => [record.capsule.id, record]));
  const publicProfileModeRunById = new Map((publicProfile?.modeRuns ?? []).map((run) => [run.id, run]));
  const publicProfileShareArtifactById = new Map(
    (publicProfile?.shareArtifacts ?? []).map((artifact) => [shareArtifactCloudId(artifact), artifact]),
  );
  const publicProfileRecordContentIds = records
    .filter((record) => {
      const archived = publicProfileRecordById.get(record.capsule.id);
      return archived ? recordContentFingerprint(archived) === recordContentFingerprint(record) : false;
    })
    .map((record) => record.capsule.id);
  const publicProfileModeRunContentIds = modeRuns
    .filter((run) => {
      const archived = publicProfileModeRunById.get(run.id);
      return archived ? modeRunContentFingerprint(archived) === modeRunContentFingerprint(run) : false;
    })
    .map((run) => run.id);
  const publicProfileShareArtifactContentIds = shareArtifacts
    .filter((artifact) => {
      const archived = publicProfileShareArtifactById.get(shareArtifactCloudId(artifact));
      return archived ? shareArtifactContentFingerprint(archived) === shareArtifactContentFingerprint(artifact) : false;
    })
    .map(shareArtifactCloudId);
  const missingRecordIds = records
    .map((record) => record.capsule.id)
    .filter((id) => !recordIds.includes(id));
  const missingModeRunIds = modeRuns
    .map((run) => run.id)
    .filter((id) => !modeRunIds.includes(id));
  const missingShareArtifactIds = shareArtifacts
    .map(shareArtifactCloudId)
    .filter((id) => !shareArtifactIds.includes(id));
  const missingRecordContentIds = records
    .map((record) => record.capsule.id)
    .filter((id) => !recordContentIds.includes(id));
  const missingModeRunContentIds = modeRuns
    .map((run) => run.id)
    .filter((id) => !modeRunContentIds.includes(id));
  const missingShareArtifactContentIds = shareArtifacts
    .map(shareArtifactCloudId)
    .filter((id) => !shareArtifactContentIds.includes(id));
  const missingPublicShareImageIds = shareArtifacts
    .map(shareArtifactCloudId)
    .filter((id) => !publicShareImageIds.includes(id));
  const missingPublicProfileRecordIds = records
    .map((record) => record.capsule.id)
    .filter((id) => !publicProfileRecordIds.includes(id));
  const missingPublicProfileModeRunIds = modeRuns
    .map((run) => run.id)
    .filter((id) => !publicProfileModeRunIds.includes(id));
  const missingPublicProfileShareArtifactIds = shareArtifacts
    .map(shareArtifactCloudId)
    .filter((id) => !publicProfileShareArtifactIds.includes(id));
  const missingPublicProfileRecordContentIds = records
    .map((record) => record.capsule.id)
    .filter((id) => !publicProfileRecordContentIds.includes(id));
  const missingPublicProfileModeRunContentIds = modeRuns
    .map((run) => run.id)
    .filter((id) => !publicProfileModeRunContentIds.includes(id));
  const missingPublicProfileShareArtifactContentIds = shareArtifacts
    .map(shareArtifactCloudId)
    .filter((id) => !publicProfileShareArtifactContentIds.includes(id));
  const expectedPublicProofIds = [
    ...records.map((record) => `record:${record.capsule.id}`),
    ...modeRuns.map((run) => `mode:${run.id}`),
  ];
  const missingPublicProofIds = expectedPublicProofIds.filter((id) => !publicProofIds.includes(id));
  const missingPublicProofContentIds = expectedPublicProofIds.filter((id) => !publicProofContentIds.includes(id));
  const verifiedRecords = recordIds.length;
  const verifiedModeRuns = modeRunIds.length;
  const verifiedShareArtifacts = shareArtifactIds.length;
  const recordOwnerIds = ownerMapFromRows(
    recordOwnerRows.filter((row) => expectedRecordIds.has(String(row?.id ?? ""))),
    (row) => String(row?.id ?? ""),
  );
  const modeRunOwnerIds = ownerMapFromRows(
    modeRunOwnerRows.filter((row) => expectedModeRunIds.has(String(row?.id ?? ""))),
    (row) => String(row?.id ?? ""),
  );
  const shareArtifactOwnerIds = ownerMapFromRows(
    shareArtifactOwnerRows.filter((row) => expectedShareArtifactIds.has(`${row?.kind ?? ""}:${row?.id ?? ""}`)),
    (row) => `${row?.kind ?? ""}:${row?.id ?? ""}`,
  );
  const publicShareImages = publicShareImageIds.length;
  const publicProofs = publicProofIds.length;
  const profileIdentity = remoteProfile ? profileIdentityFor(remoteProfile) : undefined;
  const authIdentity = authUserIdentityFor(currentUser);
  const authProblems = authUserProblems(currentUser, profile, remoteProfile);
  const profileProblems = [...profileIdentityProblems(profile, remoteProfile), ...authProblems];
  const profileReady = profileProblems.length === 0;
  const publicProfileReady = Boolean(
    publicProfile?.id === profile.id &&
      publicProfileRecordIds.length >= records.length &&
      publicProfileModeRunIds.length >= modeRuns.length &&
      publicProfileShareArtifactIds.length >= shareArtifacts.length &&
      publicProfileRecordContentIds.length >= records.length &&
      publicProfileModeRunContentIds.length >= modeRuns.length &&
      publicProfileShareArtifactContentIds.length >= shareArtifacts.length,
  );
  const expectedLinks = records.length + modeRuns.length;
  const fullyVerified =
    profileReady &&
    backendHealth.ready &&
    verifiedRecords >= records.length &&
    verifiedModeRuns >= modeRuns.length &&
    recordContentIds.length >= records.length &&
    modeRunContentIds.length >= modeRuns.length &&
    publicProofs >= expectedLinks &&
    publicProofContentIds.length >= expectedLinks &&
    verifiedShareArtifacts >= shareArtifacts.length &&
    shareArtifactContentIds.length >= shareArtifacts.length &&
    publicShareImages >= shareArtifacts.length &&
    publicProfileReady;

  return {
    checkedAt: new Date().toISOString(),
    backendHealth,
    profile: profileReady,
    profileIdentity,
    authUserIdentity: authIdentity,
    profileIdentityProblems: profileProblems,
    authUserProblems: authProblems,
    records: verifiedRecords,
    modeRuns: verifiedModeRuns,
    publicProofs,
    shareArtifacts: verifiedShareArtifacts,
    publicShareImages,
    publicProfile: publicProfileReady,
    expectedRecords: records.length,
    expectedModeRuns: modeRuns.length,
    expectedShareArtifacts: shareArtifacts.length,
    recordIds,
    modeRunIds,
    publicProofIds,
    publicProofContentIds,
    shareArtifactIds,
    recordOwnerIds,
    modeRunOwnerIds,
    shareArtifactOwnerIds,
    publicShareImageIds,
    publicProfileRecordIds,
    publicProfileModeRunIds,
    publicProfileShareArtifactIds,
    publicProfileRecordContentIds,
    publicProfileModeRunContentIds,
    publicProfileShareArtifactContentIds,
    recordContentIds,
    modeRunContentIds,
    shareArtifactContentIds,
    missingRecordIds,
    missingModeRunIds,
    missingPublicProofIds,
    missingPublicProofContentIds,
    missingShareArtifactIds,
    missingPublicShareImageIds,
    missingPublicProfileRecordIds,
    missingPublicProfileModeRunIds,
    missingPublicProfileShareArtifactIds,
    missingPublicProfileRecordContentIds,
    missingPublicProfileModeRunContentIds,
    missingPublicProfileShareArtifactContentIds,
    missingRecordContentIds,
    missingModeRunContentIds,
    missingShareArtifactContentIds,
    message: fullyVerified
      ? `Cloud read-back verified backend schema, profile, ${verifiedRecords} records, ${verifiedModeRuns} mode runs, ${verifiedShareArtifacts} share artifacts, ${publicShareImages} share images, ${publicProofs} public links, ${publicProofContentIds.length} public proof fingerprints, public profile archive fingerprints and matching content fingerprints.`
      : `Cloud read-back incomplete: backend ${backendHealth.ready ? "ready" : "not ready"}, profile ${profileReady ? "verified" : "missing"}, ${verifiedRecords}/${records.length} records, ${recordContentIds.length}/${records.length} record fingerprints, ${verifiedModeRuns}/${modeRuns.length} modes, ${modeRunContentIds.length}/${modeRuns.length} mode fingerprints, ${verifiedShareArtifacts}/${shareArtifacts.length} share artifacts, ${shareArtifactContentIds.length}/${shareArtifacts.length} share fingerprints, ${publicShareImages}/${shareArtifacts.length} share images, ${publicProofs}/${expectedLinks} public links, ${publicProofContentIds.length}/${expectedLinks} public proof fingerprints, public profile ${publicProfileReady ? "verified" : "missing"} (${publicProfileRecordContentIds.length}/${records.length} record archive fingerprints, ${publicProfileModeRunContentIds.length}/${modeRuns.length} mode archive fingerprints, ${publicProfileShareArtifactContentIds.length}/${shareArtifacts.length} share archive fingerprints).`,
  };
};

export const LEADERBOARD_SELECT_FIELDS = [
  "id",
  "display_name",
  "location",
  "friend_code",
  "season_key",
  "locks",
  "revealed",
  "average_score",
  "best_score",
  "xp",
  "streak",
  "exact_hits",
  "verified_proofs",
  "mode_proofs",
  "global_rank",
  "friend_rank",
  "season_rank",
  "rank",
  "updated_at",
].join(",");

export const loadLeaderboard = async (
  scope: LeaderboardScope,
  profile: UserProfile,
): Promise<LeaderboardEntry[]> => {
  if (!supabaseConfigured()) return [];
  const positiveRank = (value: unknown) => {
    const rank = Number(value);
    return Number.isInteger(rank) && rank > 0 ? rank : undefined;
  };
  const paramsForScope = (limit: string) => {
    const params = new URLSearchParams({
      select: LEADERBOARD_SELECT_FIELDS,
      order: "xp.desc",
      limit,
    });
    if (scope === "friend") params.set("friend_code", `eq.${friendCodeFor(profile)}`);
    if (scope === "season") params.set("season_key", `eq.${currentSeasonKey}`);
    return params;
  };
  const mapRows = (rows: any[], source: LeaderboardScope) =>
    rows.map((row) => {
      const globalRank = positiveRank(row.global_rank ?? row.rank);
      const friendRank = positiveRank(row.friend_rank ?? row.rank);
      const seasonRank = positiveRank(row.season_rank ?? row.rank);
      const scopedRank = source === "friend" ? friendRank : source === "season" ? seasonRank : globalRank;
      return {
        id: row.id,
        displayName: row.display_name ?? "Unknown analyst",
        location: row.location ?? "Global",
        rank: scopedRank,
        globalRank,
        friendRank,
        seasonRank,
        locks: Number(row.locks ?? 0),
        revealed: Number(row.revealed ?? 0),
        averageScore: Number(row.average_score ?? 0),
        bestScore: Number(row.best_score ?? 0),
        xp: Number(row.xp ?? 0),
        streak: Number(row.streak ?? 0),
        exactHits: Number(row.exact_hits ?? 0),
        verifiedProofs: Number(row.verified_proofs ?? 0),
        modeProofs: Number(row.mode_proofs ?? 0),
        seasonKey: row.season_key ?? undefined,
        friendCode: row.friend_code ?? undefined,
        updatedAt: row.updated_at ?? undefined,
        source,
      };
    });
  const res = await fetch(restUrl(`kickoff_leaderboard?${paramsForScope("20").toString()}`), {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Leaderboard load failed: ${res.status}`);
  const rows = (await res.json()) as any[];
  const entries = mapRows(rows, scope);
  if (entries.some((entry) => entry.id === profile.id)) return entries;

  const currentUserParams = paramsForScope("1");
  currentUserParams.set("id", `eq.${profile.id}`);
  const currentUserRes = await fetch(restUrl(`kickoff_leaderboard?${currentUserParams.toString()}`), {
    headers: headers(),
  });
  if (!currentUserRes.ok) throw new Error(`Leaderboard current user load failed: ${currentUserRes.status}`);
  const currentUserRows = (await currentUserRes.json()) as any[];
  return [...entries, ...mapRows(currentUserRows, scope)].filter(
    (entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index,
  );
};

export const leaderboardTargetQuery = (scope: LeaderboardScope, profile: UserProfile) => {
  const params = new URLSearchParams({
    select: LEADERBOARD_SELECT_FIELDS,
    order: "xp.desc",
    limit: "1",
    id: `eq.${profile.id}`,
  });
  if (scope === "friend") params.set("friend_code", `eq.${friendCodeFor(profile)}`);
  if (scope === "season") params.set("season_key", `eq.${currentSeasonKey}`);
  return `kickoff_leaderboard?${params.toString()}`;
};

export const buildLeaderboardScopeEvidence = (
  scope: LeaderboardScope,
  profile: UserProfile,
  rows: LeaderboardEntry[] = [],
  patch: Partial<LeaderboardScopeEvidence> = {},
): LeaderboardScopeEvidence => {
  const currentUser = rows.find((entry) => entry.id === profile.id);
  const currentUserRank = Number.isInteger(currentUser?.rank) && Number(currentUser?.rank) > 0 ? currentUser?.rank : undefined;
  return {
    scope,
    status: rows.length > 0 ? "loaded" : "empty",
    rows: rows.length,
    filter: leaderboardScopeFilter(scope, profile),
    targetQuery: leaderboardTargetQuery(scope, profile),
    currentUserPresent: Boolean(currentUser),
    currentUserRank,
    currentUserXp: currentUser?.xp,
    currentUserLocks: currentUser?.locks,
    currentUserRevealed: currentUser?.revealed,
    currentUserVerifiedProofs: currentUser?.verifiedProofs,
    currentUserModeProofs: currentUser?.modeProofs,
    currentUserExactHits: currentUser?.exactHits,
    currentUserFriendCode: currentUser?.friendCode,
    currentUserSeasonKey: currentUser?.seasonKey,
    expectedFriendCode: friendCodeFor(profile),
    expectedSeasonKey: currentSeasonKey,
    checkedAt: new Date().toISOString(),
    sampleIds: rows.slice(0, 3).map((entry) => entry.id),
    ...patch,
  };
};

export const loadGlobalLeaderboard = () => loadLeaderboard("global", loadProfile());

export const buildLocalLeaderboard = (
  profile: UserProfile,
  records: MemoryRecord[],
  modeRuns: GameModeRun[] = [],
): LeaderboardEntry[] => {
  const stats = scoreRecords(records, modeRuns);
  return [
    {
      id: profile.id,
      displayName: profile.displayName,
      location: profile.location,
      rank: 1,
      ...stats,
      friendCode: friendCodeFor(profile),
      seasonKey: currentSeasonKey,
      updatedAt: new Date().toISOString(),
      source: "local",
    },
  ];
};

export const isCloudReadbackComplete = (
  verification: CloudSyncVerification | undefined,
  expectedRecords: number,
  expectedModeRuns: number,
  expectedShareArtifacts = 0,
  expectedTargetIds: {
    recordIds?: string[];
    modeRunIds?: string[];
    shareArtifactIds?: string[];
  } = {},
) => {
  const verifiedRecordContent = verification?.recordContentIds?.length ?? verification?.records ?? 0;
  const verifiedModeRunContent = verification?.modeRunContentIds?.length ?? verification?.modeRuns ?? 0;
  const verifiedShareContent = verification?.shareArtifactContentIds?.length ?? verification?.shareArtifacts ?? 0;
  const verifiedShareImages = verification?.publicShareImages ?? (expectedShareArtifacts === 0 ? 0 : -1);
  const verifiedPublicProfileRecords = verification?.publicProfileRecordIds?.length ?? (verification?.publicProfile ? expectedRecords : 0);
  const verifiedPublicProfileModeRuns = verification?.publicProfileModeRunIds?.length ?? (verification?.publicProfile ? expectedModeRuns : 0);
  const verifiedPublicProfileShareArtifacts =
    verification?.publicProfileShareArtifactIds?.length ?? (verification?.publicProfile ? expectedShareArtifacts : 0);
  const verifiedPublicProfileRecordContent =
    verification?.publicProfileRecordContentIds?.length ?? verifiedPublicProfileRecords;
  const verifiedPublicProfileModeRunContent =
    verification?.publicProfileModeRunContentIds?.length ?? verifiedPublicProfileModeRuns;
  const verifiedPublicProfileShareArtifactContent =
    verification?.publicProfileShareArtifactContentIds?.length ?? verifiedPublicProfileShareArtifacts;
  const profileIdentityPassed = Boolean(verification?.profileIdentity) && (verification?.profileIdentityProblems?.length ?? 0) === 0;
  const containsAll = (actual: string[] | undefined, expected: string[] | undefined) =>
    !expected?.length || expected.every((id) => actual?.includes(id));
  const targetIdsMatch =
    containsAll(verification?.recordIds, expectedTargetIds.recordIds) &&
    containsAll(verification?.recordContentIds, expectedTargetIds.recordIds) &&
    containsAll(verification?.publicProfileRecordIds, expectedTargetIds.recordIds) &&
    containsAll(verification?.publicProfileRecordContentIds ?? verification?.publicProfileRecordIds, expectedTargetIds.recordIds) &&
    containsAll(
      verification?.publicProofIds,
      expectedTargetIds.recordIds?.map((id) => `record:${id}`),
    ) &&
    containsAll(
      verification?.publicProofContentIds,
      expectedTargetIds.recordIds?.map((id) => `record:${id}`),
    ) &&
    containsAll(verification?.modeRunIds, expectedTargetIds.modeRunIds) &&
    containsAll(verification?.modeRunContentIds, expectedTargetIds.modeRunIds) &&
    containsAll(verification?.publicProfileModeRunIds, expectedTargetIds.modeRunIds) &&
    containsAll(verification?.publicProfileModeRunContentIds ?? verification?.publicProfileModeRunIds, expectedTargetIds.modeRunIds) &&
    containsAll(
      verification?.publicProofIds,
      expectedTargetIds.modeRunIds?.map((id) => `mode:${id}`),
    ) &&
    containsAll(
      verification?.publicProofContentIds,
      expectedTargetIds.modeRunIds?.map((id) => `mode:${id}`),
    ) &&
    containsAll(verification?.shareArtifactIds, expectedTargetIds.shareArtifactIds) &&
    containsAll(verification?.shareArtifactContentIds, expectedTargetIds.shareArtifactIds) &&
    containsAll(verification?.publicProfileShareArtifactIds, expectedTargetIds.shareArtifactIds) &&
    containsAll(
      verification?.publicProfileShareArtifactContentIds ?? verification?.publicProfileShareArtifactIds,
      expectedTargetIds.shareArtifactIds,
    ) &&
    containsAll(verification?.publicShareImageIds, expectedTargetIds.shareArtifactIds);
  return Boolean(
      verification &&
      verification.backendHealth?.ready &&
      verification.profile &&
      profileIdentityPassed &&
      verification.records >= expectedRecords &&
      verification.modeRuns >= expectedModeRuns &&
      (verification.shareArtifacts ?? 0) >= expectedShareArtifacts &&
      verifiedRecordContent >= expectedRecords &&
      verifiedModeRunContent >= expectedModeRuns &&
      verifiedShareContent >= expectedShareArtifacts &&
      verifiedShareImages >= expectedShareArtifacts &&
      verification.publicProofs >= expectedRecords + expectedModeRuns &&
      verification.publicProfile &&
      verifiedPublicProfileRecords >= expectedRecords &&
      verifiedPublicProfileModeRuns >= expectedModeRuns &&
      verifiedPublicProfileShareArtifacts >= expectedShareArtifacts &&
      verifiedPublicProfileRecordContent >= expectedRecords &&
      verifiedPublicProfileModeRunContent >= expectedModeRuns &&
      verifiedPublicProfileShareArtifactContent >= expectedShareArtifacts &&
      targetIdsMatch,
  );
};

export const buildCloudSyncCoverage = (
  cloudState: CloudSyncState,
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  shareArtifacts: ShareArtifactEvidence[] = [],
) => {
  const localItems = records.length + modeRuns.length + shareArtifacts.length;
  const verification = cloudState.verification;
  const recordIds = records.map((record) => record.capsule.id);
  const modeRunIds = modeRuns.map((run) => run.id);
  const shareArtifactIds = shareArtifacts.map(shareArtifactCloudId);
  const readbackPassed = isCloudReadbackComplete(verification, records.length, modeRuns.length, shareArtifacts.length, {
    recordIds,
    modeRunIds,
    shareArtifactIds,
  });
  if (localItems === 0) {
    return {
      passed: false,
      pendingItems: 0,
      detail: "No local proofs yet",
    };
  }
  if (!cloudState.configured) {
    return {
      passed: false,
      pendingItems: localItems,
      detail: `${localItems} local item${localItems === 1 ? "" : "s"} waiting for Supabase env`,
    };
  }
  if (!cloudState.authenticated) {
    return {
      passed: false,
      pendingItems: localItems,
      detail: `${localItems} local item${localItems === 1 ? "" : "s"} waiting for sign-in`,
    };
  }
  if (readbackPassed) {
    return {
      passed: true,
      pendingItems: 0,
      detail: `${localItems} item${localItems === 1 ? "" : "s"} verified by cloud read-back`,
    };
  }
  if (cloudState.status === "syncing") {
    return {
      passed: false,
      pendingItems: localItems,
      detail: `${localItems} local item${localItems === 1 ? "" : "s"} syncing now`,
    };
  }
  const presentCount = (actual: string[] | undefined, expected: string[]) =>
    expected.filter((id) => actual?.includes(id)).length;
  const acknowledgedItems =
    presentCount(verification?.recordContentIds, recordIds) +
    presentCount(verification?.modeRunContentIds, modeRunIds) +
    presentCount(verification?.shareArtifactContentIds, shareArtifactIds);
  return {
    passed: false,
    pendingItems: verification ? Math.max(0, localItems - acknowledgedItems) : localItems,
    detail:
      cloudState.status === "error"
        ? `${localItems} local item${localItems === 1 ? "" : "s"} need sync retry`
        : `${localItems} local item${localItems === 1 ? "" : "s"} pending cloud acknowledgement`,
  };
};

const outboxStatus = (
  cloudState: CloudSyncState,
  total: number,
  verified: number,
  missing: string[],
): CloudSyncOutboxItem["status"] => {
  if (total === 0 || (verified >= total && missing.length === 0)) return "verified";
  if (!cloudState.configured) return "blocked";
  if (cloudState.status === "syncing") return "syncing";
  return "queued";
};

const outboxDetail = (prefix: string, verified: number, total: number, missing: string[]) =>
  `${verified}/${total} ${prefix}${formatMissingIds(missing)}`;

export const buildCloudSyncOutbox = (
  cloudState: CloudSyncState,
  profile: UserProfile,
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  shareArtifacts: ShareArtifactEvidence[] = [],
): CloudSyncOutboxItem[] => {
  const verification = cloudState.verification;
  const profileVerified =
    Boolean(verification?.profile) &&
    Boolean(verification?.profileIdentity) &&
    (verification?.profileIdentityProblems?.length ?? 0) === 0;
  const recordIds = records.map((record) => record.capsule.id);
  const modeRunIds = modeRuns.map((run) => run.id);
  const shareArtifactIds = shareArtifacts.map(shareArtifactCloudId);
  const verifiedRecords = recordIds.filter((id) => verification?.recordContentIds?.includes(id)).length;
  const verifiedModeRuns = modeRunIds.filter((id) => verification?.modeRunContentIds?.includes(id)).length;
  const verifiedShareArtifacts = shareArtifactIds.filter((id) => verification?.shareArtifactContentIds?.includes(id)).length;
  const publicProofIds = [
    ...recordIds.map((id) => `record:${id}`),
    ...modeRunIds.map((id) => `mode:${id}`),
  ];
  const verifiedPublicProofs = publicProofIds.filter((id) => verification?.publicProofIds?.includes(id)).length;
  const verifiedPublicProofContent = publicProofIds.filter((id) => verification?.publicProofContentIds?.includes(id)).length;
  const blockAction = cloudState.configured ? "Sign in to flush this outbox to Supabase." : "Set Supabase env vars before this outbox can sync.";
  const syncAction =
    cloudState.status === "syncing"
      ? "Sync is running; the row must still be read back before it counts as verified."
      : "Run Sync after sign-in; completion requires a Supabase read-back match.";
  const profileMissing = profileVerified ? [] : [profile.id || "profile"];
  const recordMissing = recordIds.filter((id) => !verification?.recordContentIds?.includes(id));
  const modeMissing = modeRunIds.filter((id) => !verification?.modeRunContentIds?.includes(id));
  const shareMissing = shareArtifactIds.filter((id) => !verification?.shareArtifactContentIds?.includes(id));
  const proofMissing = publicProofIds.filter((id) => !verification?.publicProofIds?.includes(id));
  const proofContentMissing = publicProofIds.filter((id) => !verification?.publicProofContentIds?.includes(id));

  return [
    {
      key: "profile",
      label: "Profile row",
      status: outboxStatus(cloudState, 1, profileVerified ? 1 : 0, profileMissing),
      queued: profileVerified ? 0 : 1,
      verified: profileVerified ? 1 : 0,
      total: 1,
      detail: profileVerified
        ? `1/1 profile identity read back for ${profile.email || profile.id}`
        : `profile identity waiting for read-back${formatMissingIds(profileMissing)}`,
      action: profileVerified ? "Profile can be restored on another device." : blockAction,
    },
    {
      key: "records",
      label: "Prediction history",
      status: outboxStatus(cloudState, records.length, verifiedRecords, recordMissing),
      queued: Math.max(0, records.length - verifiedRecords),
      verified: verifiedRecords,
      total: records.length,
      detail: outboxDetail("prediction capsule fingerprints read back", verifiedRecords, records.length, recordMissing),
      action: verifiedRecords >= records.length ? "Prediction history is cloud-acknowledged." : syncAction,
    },
    {
      key: "modeRuns",
      label: "Mode proofs",
      status: outboxStatus(cloudState, modeRuns.length, verifiedModeRuns, modeMissing),
      queued: Math.max(0, modeRuns.length - verifiedModeRuns),
      verified: verifiedModeRuns,
      total: modeRuns.length,
      detail: outboxDetail("mode proof fingerprints read back", verifiedModeRuns, modeRuns.length, modeMissing),
      action: verifiedModeRuns >= modeRuns.length ? "Mode proof history is cloud-acknowledged." : syncAction,
    },
    {
      key: "shareArtifacts",
      label: "Share manifests",
      status: outboxStatus(cloudState, shareArtifacts.length, verifiedShareArtifacts, shareMissing),
      queued: Math.max(0, shareArtifacts.length - verifiedShareArtifacts),
      verified: verifiedShareArtifacts,
      total: shareArtifacts.length,
      detail: outboxDetail("share card manifest fingerprints read back", verifiedShareArtifacts, shareArtifacts.length, shareMissing),
      action: verifiedShareArtifacts >= shareArtifacts.length ? "Share manifests are cloud-acknowledged." : syncAction,
    },
    {
      key: "publicProofs",
      label: "Public proof links",
      status: outboxStatus(cloudState, publicProofIds.length, verifiedPublicProofContent, [...proofMissing, ...proofContentMissing]),
      queued: Math.max(0, publicProofIds.length - verifiedPublicProofContent),
      verified: verifiedPublicProofContent,
      total: publicProofIds.length,
      detail: outboxDetail(
        "anonymous proof link fingerprints read back",
        verifiedPublicProofContent,
        publicProofIds.length,
        [...proofMissing, ...proofContentMissing],
      ),
      action: verifiedPublicProofContent >= publicProofIds.length
        ? "Proof URLs work without this local session and match the synced payloads."
        : syncAction,
    },
  ];
};

const auditStatus = (blocked: boolean, passed: boolean): CloudSyncAuditItem["status"] =>
  blocked ? "blocked" : passed ? "passed" : "pending";

const formatMissingIds = (ids?: string[]) => {
  if (!ids || ids.length === 0) return "";
  const shown = ids.slice(0, 3).join(", ");
  const rest = ids.length > 3 ? ` +${ids.length - 3} more` : "";
  return ` · missing ${shown}${rest}`;
};

export const buildCloudSyncAudit = (
  cloudState: CloudSyncState,
  profile: UserProfile,
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  leaderboardEntries: LeaderboardEntry[] = [],
  shareArtifacts: ShareArtifactEvidence[] = [],
): CloudSyncAuditItem[] => {
  const configured = cloudState.configured;
  const signedIn = cloudState.authenticated;
  const cloudProfile = profile.cloudMode === "supabase" && !profile.id.startsWith("local-");
  const remoteLeaderboardRows = leaderboardEntries.filter((entry) => entry.source !== "local").length;
  const leaderboardScopes = new Set(leaderboardEntries.filter((entry) => entry.source !== "local").map((entry) => entry.source));
  const totalProofLinks = records.length + modeRuns.length;
  const verification = cloudState.verification;
  const verifiedProfile = Boolean(verification?.profile);
  const verifiedRecords = verification?.records ?? 0;
  const verifiedModeRuns = verification?.modeRuns ?? 0;
  const verifiedPublicProofs = verification?.publicProofs ?? 0;
  const verifiedPublicProofContent = verification?.publicProofContentIds?.length ?? 0;
  const verifiedShareArtifacts = verification?.shareArtifacts ?? 0;
  const verifiedShareImages = verification?.publicShareImages ?? 0;
  const verifiedPublicProfile = Boolean(verification?.publicProfile);
  const verifiedPublicProfileArchives =
    (verification?.publicProfileRecordIds?.length ?? 0) +
    (verification?.publicProfileModeRunIds?.length ?? 0) +
    (verification?.publicProfileShareArtifactIds?.length ?? 0);
  const verifiedPublicProfileArchiveFingerprints =
    (verification?.publicProfileRecordContentIds?.length ?? verification?.publicProfileRecordIds?.length ?? 0) +
    (verification?.publicProfileModeRunContentIds?.length ?? verification?.publicProfileModeRunIds?.length ?? 0) +
    (verification?.publicProfileShareArtifactContentIds?.length ?? verification?.publicProfileShareArtifactIds?.length ?? 0);
  const totalPublicProfileArchives = records.length + modeRuns.length + shareArtifacts.length;
  const backendReady = Boolean(verification?.backendHealth?.ready);
  const totalContentFingerprints = records.length + modeRuns.length + shareArtifacts.length;
  const verifiedContentFingerprints =
    (verification?.recordContentIds?.length ?? verification?.records ?? 0) +
    (verification?.modeRunContentIds?.length ?? verification?.modeRuns ?? 0) +
    (verification?.shareArtifactContentIds?.length ?? verification?.shareArtifacts ?? 0);
  const blockingDetail = configured ? "sign in required" : "Supabase env missing";

  return [
    {
      key: "backend",
      label: "Supabase backend schema",
      status: auditStatus(!configured, backendReady),
      synced: backendReady ? 1 : 0,
      total: 1,
      detail: verification?.backendHealth
        ? `${verification.backendHealth.schemaVersion ?? "unknown schema"} · ${verification.backendHealth.detail}`
        : configured
          ? "backend health not checked"
          : "Supabase env missing",
      action: backendReady
        ? "Required tables, views, RLS and policies are present."
        : "Apply supabase.schema.sql and verify kickoff_backend_health.",
    },
    {
      key: "profile",
      label: "Cloud profile",
      status: auditStatus(!configured, signedIn && cloudProfile && verifiedProfile),
      synced: signedIn && cloudProfile && verifiedProfile ? 1 : 0,
      total: 1,
      detail: verifiedProfile ? `read-back profile id ${profile.id}` : cloudProfile ? `profile id ${profile.id}` : blockingDetail,
      action: verifiedProfile
        ? verification?.authUserIdentity
          ? `Profile was read back from Supabase for Auth user ${verification.authUserIdentity.email || verification.authUserIdentity.id}.`
          : "Profile was read back from Supabase."
        : verification?.authUserProblems?.length
          ? verification.authUserProblems.join("; ")
          : cloudProfile
            ? "Run Sync to verify the cloud profile."
            : "Sign in and save profile.",
    },
    {
      key: "records",
      label: "Prediction history",
      status: auditStatus(!configured || !signedIn, records.length > 0 && verifiedRecords >= records.length),
      synced: verifiedRecords,
      total: records.length,
      detail: records.length > 0
        ? `${verifiedRecords}/${records.length} capsules read back${formatMissingIds(verification?.missingRecordIds)}`
        : "no local capsules",
      action: verifiedRecords >= records.length && records.length > 0 ? "Records verified by cloud read-back." : "Run Sync after locking predictions.",
    },
    {
      key: "modeRuns",
      label: "Mode proof history",
      status: auditStatus(!configured || !signedIn, modeRuns.length > 0 && verifiedModeRuns >= modeRuns.length),
      synced: verifiedModeRuns,
      total: modeRuns.length,
      detail: modeRuns.length > 0
        ? `${verifiedModeRuns}/${modeRuns.length} mode proofs read back${formatMissingIds(verification?.missingModeRunIds)}`
        : "no mode proofs",
      action: verifiedModeRuns >= modeRuns.length && modeRuns.length > 0 ? "Mode proofs verified by cloud read-back." : "Create a mode proof and sync.",
    },
    {
      key: "publicProofs",
      label: "Public proof links",
      status: auditStatus(!configured || !signedIn, totalProofLinks > 0 && verifiedPublicProofContent >= totalProofLinks),
      synced: verifiedPublicProofContent,
      total: totalProofLinks,
      detail: totalProofLinks > 0
        ? `${verifiedPublicProofs}/${totalProofLinks} public links, ${verifiedPublicProofContent}/${totalProofLinks} public proof fingerprints${formatMissingIds([
            ...(verification?.missingPublicProofIds ?? []),
            ...(verification?.missingPublicProofContentIds ?? []),
          ])}`
        : "no proof links",
      action:
        verifiedPublicProofContent >= totalProofLinks && totalProofLinks > 0
          ? "Proof and mode URLs resolve without the local session and match synced payloads."
          : "Sync history before sharing public links.",
    },
    {
      key: "shareArtifacts",
      label: "Share card manifests",
      status: auditStatus(
        !configured || !signedIn,
        shareArtifacts.length > 0 &&
          verifiedShareArtifacts >= shareArtifacts.length &&
          verifiedShareImages >= shareArtifacts.length,
      ),
      synced: verifiedShareArtifacts,
      total: shareArtifacts.length,
      detail: shareArtifacts.length > 0
        ? `${verifiedShareArtifacts}/${shareArtifacts.length} card manifests, ${verifiedShareImages}/${shareArtifacts.length} public images read back${formatMissingIds([
            ...(verification?.missingShareArtifactIds ?? []),
            ...(verification?.missingPublicShareImageIds ?? []),
          ])}`
        : "no share card manifests",
      action:
        verifiedShareArtifacts >= shareArtifacts.length && verifiedShareImages >= shareArtifacts.length && shareArtifacts.length > 0
          ? "Share card manifests and public PNG URLs are stored with the cloud account."
          : "Generate proof cards, upload public images and sync their manifests to Supabase.",
    },
    {
      key: "contentFingerprints",
      label: "Content fingerprints",
      status: auditStatus(!configured || !signedIn, totalContentFingerprints > 0 && verifiedContentFingerprints >= totalContentFingerprints),
      synced: verifiedContentFingerprints,
      total: totalContentFingerprints,
      detail: totalContentFingerprints > 0
        ? `${verifiedContentFingerprints}/${totalContentFingerprints} remote content fingerprints match${formatMissingIds([
            ...(verification?.missingRecordContentIds ?? []),
            ...(verification?.missingModeRunContentIds ?? []),
            ...(verification?.missingShareArtifactContentIds ?? []),
          ])}`
        : "no cloud content to fingerprint",
      action:
        verifiedContentFingerprints >= totalContentFingerprints && totalContentFingerprints > 0
          ? "Remote records, modes and card manifests match local content fingerprints."
          : "Sync again or pull cloud history if an older remote row overwrote local content.",
    },
    {
      key: "publicProfile",
      label: "Public profile",
      status: auditStatus(
        !configured,
        cloudProfile &&
          verifiedPublicProfile &&
          (totalPublicProfileArchives === 0 || verifiedPublicProfileArchiveFingerprints >= totalPublicProfileArchives),
      ),
      synced: cloudProfile && verifiedPublicProfile ? verifiedPublicProfileArchiveFingerprints : 0,
      total: Math.max(1, totalPublicProfileArchives),
      detail: verifiedPublicProfile
        ? `anonymous ?profile=${profile.id} · archives ${verifiedPublicProfileArchives}/${totalPublicProfileArchives}, fingerprints ${verifiedPublicProfileArchiveFingerprints}/${totalPublicProfileArchives}${formatMissingIds([
            ...(verification?.missingPublicProfileRecordIds ?? []),
            ...(verification?.missingPublicProfileModeRunIds ?? []),
            ...(verification?.missingPublicProfileShareArtifactIds ?? []),
            ...(verification?.missingPublicProfileRecordContentIds ?? []),
            ...(verification?.missingPublicProfileModeRunContentIds ?? []),
            ...(verification?.missingPublicProfileShareArtifactContentIds ?? []),
          ])}`
        : cloudProfile
          ? `?profile=${profile.id}`
          : "local preview only",
      action:
        verifiedPublicProfile && (totalPublicProfileArchives === 0 || verifiedPublicProfileArchiveFingerprints >= totalPublicProfileArchives)
          ? "Profile page can load synced archives anonymously."
          : "Sync cloud history and verify the public profile includes records, mode proofs and share cards.",
    },
    {
      key: "leaderboard",
      label: "Leaderboard backend",
      status: auditStatus(!configured, remoteLeaderboardRows > 0),
      synced: remoteLeaderboardRows,
      total: Math.max(1, remoteLeaderboardRows),
      detail:
        remoteLeaderboardRows > 0
          ? `${remoteLeaderboardRows} remote leaderboard row${remoteLeaderboardRows === 1 ? "" : "s"} loaded · ${[...leaderboardScopes].join(", ")}`
          : "local fallback row only",
      action:
        leaderboardScopes.size >= 3
          ? "Global, friend and season boards have backend evidence."
          : "Load Supabase leaderboard rows for every scope.",
    },
  ];
};

export const buildLeaderboardReadiness = (
  cloudState: CloudSyncState,
  remoteEntries: LeaderboardEntry[],
  profile: UserProfile,
  scopeEvidence: LeaderboardScopeEvidence[] = [],
): LeaderboardReadinessItem[] => {
  const remoteRows = remoteEntries.filter((entry) => entry.source !== "local");
  const scopes: LeaderboardScope[] = ["global", "friend", "season"];
  const scopeCounts = scopes.reduce(
    (counts, scope) => ({ ...counts, [scope]: remoteRows.filter((entry) => entry.source === scope).length }),
    {} as Record<LeaderboardScope, number>,
  );
  const evidenceByScope = new Map(scopeEvidence.map((item) => [item.scope, item]));
  return [
    {
      key: "view",
      label: "Supabase view",
      passed: cloudState.configured,
      detail: cloudState.configured ? "kickoff_leaderboard is configured for public reads" : "local preview only",
    },
    ...scopes.map((scope) => {
      const evidence = evidenceByScope.get(scope);
      const scopeDetail =
        scope === "friend"
          ? `friend_code filter ready · ${friendCodeFor(profile)}`
          : scope === "season"
            ? `season_key filter ready · ${currentSeasonKey}`
            : "global xp ranking ready";
      const rows = evidence?.rows ?? scopeCounts[scope];
      const queryPassed = evidence
        ? evidence.status === "loaded" &&
          evidence.rows > 0 &&
          evidence.currentUserPresent &&
          Number.isInteger(evidence.currentUserRank) &&
          Number(evidence.currentUserRank) > 0
        : rows > 0 &&
          remoteRows.some(
            (entry) =>
              entry.source === scope &&
              entry.id === profile.id &&
              Number.isInteger(entry.rank) &&
              Number(entry.rank) > 0,
          );
      return {
        key: scope,
        label: `${scope} scope`,
        passed: queryPassed,
        detail: cloudState.configured
          ? evidence
            ? evidence.status === "error"
              ? `${scope} query failed · ${evidence.filter} · ${evidence.error ?? "unknown error"}`
              : `${rows} remote ${scope} row${rows === 1 ? "" : "s"} · ${evidence.status} · ${evidence.filter} · current user ${
                  evidence.currentUserPresent
                    ? Number.isInteger(evidence.currentUserRank) && Number(evidence.currentUserRank) > 0
                      ? `rank ${evidence.currentUserRank}`
                      : "missing scoped rank"
                    : "missing"
                } · ${scopeDetail}`
            : rows > 0
              ? `${rows} remote ${scope} row${rows === 1 ? "" : "s"} · ${scopeDetail}`
              : `no remote ${scope} rows yet · ${scopeDetail}`
          : "requires Supabase env vars",
      } satisfies LeaderboardReadinessItem;
    }),
    {
      key: "remoteRows",
      label: "Remote rows",
      passed: remoteRows.length > 0,
      detail:
        remoteRows.length > 0
          ? `${remoteRows.length} Supabase leaderboard rows loaded`
          : "showing local fallback row until cloud leaderboard returns data",
    },
  ];
};
