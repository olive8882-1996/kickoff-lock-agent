import type { CloudSyncState, LeaderboardEntry, LeaderboardScope, MemoryRecord, UserProfile } from "./types";

const PROFILE_KEY = "kickoff-lock-agent-profile-v1";
const SESSION_KEY = "kickoff-lock-agent-supabase-session-v1";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type SupabaseSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
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

const configured = Boolean(supabaseUrl && supabaseAnonKey);

const headers = (session?: SupabaseSession) => ({
  apikey: supabaseAnonKey ?? "",
  Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey ?? ""}`,
  "Content-Type": "application/json",
});

const restUrl = (path: string) => `${supabaseUrl}/rest/v1/${path}`;

const friendCodeFor = (profile: UserProfile) =>
  (profile.location || profile.email.split("@")[1] || "global")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "global";

const currentSeasonKey = "world-cup-run";

export const getCloudState = (): CloudSyncState => {
  const session = loadSupabaseSession();
  if (!configured) {
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
    authenticated: Boolean(session?.access_token),
    mode: "supabase",
    status: session?.access_token ? "ready" : "offline",
    message: session?.access_token
      ? "Supabase session ready. Records can sync across devices."
      : "Supabase configured. Send a magic link to sign in.",
  };
};

export const loadProfile = (): UserProfile => {
  const saved = localStorage.getItem(PROFILE_KEY);
  if (saved) return JSON.parse(saved) as UserProfile;
  const profile: UserProfile = {
    id: `local-${crypto.randomUUID()}`,
    email: "fan@kickoff.local",
    displayName: "Kickoff Analyst",
    location: "Chengdu",
    createdAt: new Date().toISOString(),
    cloudMode: configured ? "supabase" : "local",
  };
  saveProfile(profile);
  return profile;
};

export const saveProfile = (profile: UserProfile) => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
};

export const loadSupabaseSession = (): SupabaseSession | undefined => {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) return JSON.parse(saved) as SupabaseSession;
  return undefined;
};

export const consumeSupabaseHash = (): SupabaseSession | undefined => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  if (!accessToken) return loadSupabaseSession();
  const session: SupabaseSession = {
    access_token: accessToken,
    refresh_token: hash.get("refresh_token") ?? undefined,
    expires_at: Number(hash.get("expires_in") ?? 0)
      ? Math.floor(Date.now() / 1000) + Number(hash.get("expires_in"))
      : undefined,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.history.replaceState({}, "", window.location.pathname + window.location.search);
  return session;
};

export const loadCurrentUser = async (): Promise<SupabaseUser | undefined> => {
  const session = loadSupabaseSession();
  if (!configured || !session) return undefined;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
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

export const syncProfileToCloud = async (profile: UserProfile) => {
  const session = loadSupabaseSession();
  if (!configured || !session) return;
  const user = await loadCurrentUser();
  const row = {
    id: user?.id ?? profile.id,
    email: user?.email ?? profile.email,
    display_name: profile.displayName,
    location: profile.location,
    avatar_url: profile.avatarUrl ?? null,
    friend_code: friendCodeFor(profile),
    updated_at: new Date().toISOString(),
  };
  const res = await fetch(restUrl("kickoff_profiles?on_conflict=id"), {
    method: "POST",
    headers: { ...headers(session), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Profile sync failed: ${res.status}`);
};

export const signOutCloud = async () => {
  const session = loadSupabaseSession();
  if (configured && session) {
    await fetch(`${supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: headers(session),
    }).catch(() => undefined);
  }
  localStorage.removeItem(SESSION_KEY);
};

export const sendMagicLink = async (email: string) => {
  if (!configured) throw new Error("Supabase is not configured.");
  const redirectTo = import.meta.env.VITE_SUPABASE_REDIRECT_URL ?? window.location.origin + import.meta.env.BASE_URL;
  const res = await fetch(`${supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email,
      create_user: true,
      options: { email_redirect_to: redirectTo },
    }),
  });
  if (!res.ok) throw new Error(`Magic link failed: ${res.status}`);
};

export const syncRecordsToCloud = async (profile: UserProfile, records: MemoryRecord[]) => {
  const session = loadSupabaseSession();
  if (!configured || !session) {
    return {
      status: "offline" as const,
      message: "Cloud sync skipped. Sign in with Supabase to sync records.",
    };
  }
  const user = await loadCurrentUser();
  await syncProfileToCloud(profile);
  const rows = records.map((record) => ({
    id: record.capsule.id,
    user_id: user?.id ?? profile.id,
    email: user?.email ?? profile.email,
    display_name: profile.displayName,
    location: profile.location,
    friend_code: friendCodeFor(profile),
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

export const loadRecordsFromCloud = async (profile: UserProfile): Promise<MemoryRecord[]> => {
  const session = loadSupabaseSession();
  if (!configured || !session) throw new Error("Sign in with Supabase before pulling cloud records.");
  const params = new URLSearchParams({
    select: "capsule,result,seal_job,updated_at",
    or: `(user_id.eq.${profile.id},email.eq.${profile.email})`,
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

export const loadPublicRecord = async (capsuleId: string): Promise<MemoryRecord | undefined> => {
  if (!configured || !capsuleId) return undefined;
  const params = new URLSearchParams({
    select: "capsule,result,seal_job",
    id: `eq.${capsuleId}`,
    limit: "1",
  });
  const res = await fetch(restUrl(`kickoff_records?${params.toString()}`), {
    headers: headers(loadSupabaseSession()),
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

export const loadLeaderboard = async (
  scope: LeaderboardScope,
  profile: UserProfile,
): Promise<LeaderboardEntry[]> => {
  const session = loadSupabaseSession();
  if (!configured || !session) return [];
  const params = new URLSearchParams({
    select: "*",
    order: "xp.desc",
    limit: "20",
  });
  if (scope === "friend") params.set("friend_code", `eq.${friendCodeFor(profile)}`);
  if (scope === "season") params.set("season_key", `eq.${currentSeasonKey}`);
  const res = await fetch(restUrl(`kickoff_leaderboard?${params.toString()}`), {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Leaderboard load failed: ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name ?? "Unknown analyst",
    location: row.location ?? "Global",
    locks: Number(row.locks ?? 0),
    averageScore: Number(row.average_score ?? 0),
    bestScore: Number(row.best_score ?? 0),
    xp: Number(row.xp ?? 0),
    streak: Number(row.streak ?? 0),
    seasonKey: row.season_key ?? undefined,
    friendCode: row.friend_code ?? undefined,
    source: scope,
  }));
};

export const loadGlobalLeaderboard = () => loadLeaderboard("global", loadProfile());

export const buildLocalLeaderboard = (
  profile: UserProfile,
  records: MemoryRecord[],
): LeaderboardEntry[] => {
  const revealed = records.filter((record) => record.result);
  const averageScore =
    revealed.length > 0
      ? Math.round(revealed.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0) / revealed.length)
      : 0;
  const bestScore = Math.max(0, ...revealed.map((record) => record.result?.totalScore ?? 0));
  const streak = records.reduce((run, record) => {
    if (!record.result) return run;
    return record.result.breakdown.winner > 0 ? run + 1 : 0;
  }, 0);
  const xp = records.length * 120 + revealed.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0);
  return [
    {
      id: profile.id,
      displayName: profile.displayName,
      location: profile.location,
      locks: records.length,
      averageScore,
      bestScore,
      xp,
      streak,
      source: "local",
    },
  ];
};
