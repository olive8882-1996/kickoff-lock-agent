import type { CloudSyncState, LeaderboardEntry, MemoryRecord, UserProfile } from "./types";

const PROFILE_KEY = "kickoff-lock-agent-profile-v1";
const SESSION_KEY = "kickoff-lock-agent-supabase-session-v1";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

type SupabaseSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
};

const configured = Boolean(supabaseUrl && supabaseAnonKey);

const headers = (session?: SupabaseSession) => ({
  apikey: supabaseAnonKey ?? "",
  Authorization: `Bearer ${session?.access_token ?? supabaseAnonKey ?? ""}`,
  "Content-Type": "application/json",
});

const restUrl = (path: string) => `${supabaseUrl}/rest/v1/${path}`;

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
  const rows = records.map((record) => ({
    id: record.capsule.id,
    user_id: profile.id,
    email: profile.email,
    display_name: profile.displayName,
    location: profile.location,
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

export const loadGlobalLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  const session = loadSupabaseSession();
  if (!configured || !session) return [];
  const res = await fetch(
    restUrl("kickoff_leaderboard?select=*&order=xp.desc&limit=20"),
    { headers: headers(session) },
  );
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
    source: "global",
  }));
};

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
