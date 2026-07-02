import type {
  CloudSyncState,
  CloudSyncAuditItem,
  LeaderboardEntry,
  LeaderboardReadinessItem,
  LeaderboardScope,
  GameModeRun,
  MemoryRecord,
  PublicProfile,
  UserProfile,
} from "./types";

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

const authRedirectTo = () =>
  import.meta.env.VITE_SUPABASE_REDIRECT_URL ?? window.location.origin + import.meta.env.BASE_URL;

export const buildSupabaseOAuthUrl = (
  provider: "google",
  redirectTo: string,
  baseUrl = supabaseUrl,
) => {
  if (!baseUrl) throw new Error("Supabase is not configured.");
  const url = new URL(`${baseUrl}/auth/v1/authorize`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", redirectTo);
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

const normalizeSupabaseSession = (payload: any, fallbackRefreshToken?: string): SupabaseSession => ({
  access_token: payload.access_token,
  refresh_token: payload.refresh_token ?? fallbackRefreshToken,
  expires_at: Number(payload.expires_at ?? 0)
    ? Number(payload.expires_at)
    : Number(payload.expires_in ?? 0)
      ? Math.floor(Date.now() / 1000) + Number(payload.expires_in)
      : undefined,
});

const friendCodeFor = (profile: UserProfile) =>
  (profile.location || profile.email.split("@")[1] || "global")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "global";

const currentSeasonKey = "world-cup-run";

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

export const refreshSupabaseSession = async (): Promise<SupabaseSession | undefined> => {
  const session = loadSupabaseSession();
  if (!configured || !session) return session;
  if (!isSupabaseSessionExpired(session) && session.access_token) return session;
  if (!session.refresh_token) return session;
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) throw new Error(`Session refresh failed: ${res.status}`);
  const nextSession = normalizeSupabaseSession(await res.json(), session.refresh_token);
  saveSupabaseSession(nextSession);
  return nextSession;
};

const requireFreshSession = async () => {
  const session = await refreshSupabaseSession();
  if (!configured || !session?.access_token || isSupabaseSessionExpired(session, 0)) {
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

export const loadCurrentUser = async (): Promise<SupabaseUser | undefined> => {
  if (!configured || !loadSupabaseSession()) return undefined;
  const session = await requireFreshSession();
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
  if (!configured || !loadSupabaseSession()) return;
  const session = await requireFreshSession();
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
  const session = await refreshSupabaseSession().catch(() => loadSupabaseSession());
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
  const redirectTo = authRedirectTo();
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

export const startGoogleSignIn = () => {
  if (!configured) throw new Error("Supabase is not configured.");
  window.location.assign(buildSupabaseOAuthUrl("google", authRedirectTo()));
};

export const syncRecordsToCloud = async (profile: UserProfile, records: MemoryRecord[]) => {
  if (!configured || !loadSupabaseSession()) {
    return {
      status: "offline" as const,
      message: "Cloud sync skipped. Sign in with Supabase to sync records.",
    };
  }
  const session = await requireFreshSession();
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

export const syncModeRunsToCloud = async (profile: UserProfile, modeRuns: GameModeRun[]) => {
  if (!configured || !loadSupabaseSession()) {
    return {
      status: "offline" as const,
      message: "Mode proof sync skipped. Sign in with Supabase to sync mode runs.",
    };
  }
  const session = await requireFreshSession();
  const user = await loadCurrentUser();
  await syncProfileToCloud(profile);
  const rows = modeRuns.map((run) => ({
    id: run.id,
    user_id: user?.id ?? profile.id,
    email: user?.email ?? profile.email,
    display_name: profile.displayName,
    location: profile.location,
    friend_code: friendCodeFor(profile),
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

export const loadRecordsFromCloud = async (profile: UserProfile): Promise<MemoryRecord[]> => {
  const session = await requireFreshSession();
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

export const loadModeRunsFromCloud = async (profile: UserProfile): Promise<GameModeRun[]> => {
  const session = await requireFreshSession();
  const params = new URLSearchParams({
    select: "mode_run,updated_at",
    or: `(user_id.eq.${profile.id},email.eq.${profile.email})`,
    order: "updated_at.desc",
  });
  const res = await fetch(restUrl(`kickoff_mode_runs?${params.toString()}`), {
    headers: headers(session),
  });
  if (!res.ok) throw new Error(`Cloud mode proof load failed: ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows.map((row) => row.mode_run as GameModeRun).filter(Boolean);
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

export const loadPublicModeRun = async (runId: string): Promise<GameModeRun | undefined> => {
  if (!configured || !runId) return undefined;
  const params = new URLSearchParams({
    select: "mode_run",
    id: `eq.${runId}`,
    limit: "1",
  });
  const res = await fetch(restUrl(`kickoff_mode_runs?${params.toString()}`), {
    headers: headers(loadSupabaseSession()),
  });
  if (!res.ok) throw new Error(`Public mode proof load failed: ${res.status}`);
  const [row] = (await res.json()) as any[];
  return row?.mode_run as GameModeRun | undefined;
};

export const buildPublicProfile = (
  profile: UserProfile,
  records: MemoryRecord[],
  modeRuns: GameModeRun[] = [],
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
    locks: records.length,
    revealed: revealed.length,
    modeProofs: modeRuns.length,
    averageScore,
    bestScore,
    xp: xp + modeXp,
  };
};

const buildPublicProfileFromRows = (profileRow: any, recordRows: any[], modeRunRows: any[]): PublicProfile => {
  const records = recordRows.map((row) => ({
    capsule: row.capsule,
    result: row.result ?? undefined,
    sealJob: row.seal_job ?? undefined,
  })) as MemoryRecord[];
  const modeRuns = modeRunRows.map((row) => row.mode_run as GameModeRun).filter(Boolean);
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
  );
  return {
    ...publicProfile,
    friendCode: profileRow.friend_code ?? publicProfile.friendCode,
  };
};

export const loadPublicProfile = async (profileId: string): Promise<PublicProfile | undefined> => {
  if (!configured || !profileId) return undefined;
  const profileParams = new URLSearchParams({
    select: "*",
    id: `eq.${profileId}`,
    limit: "1",
  });
  const profileRes = await fetch(restUrl(`kickoff_profiles?${profileParams.toString()}`), {
    headers: headers(loadSupabaseSession()),
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
    headers: headers(loadSupabaseSession()),
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
    headers: headers(loadSupabaseSession()),
  });
  if (!modeRunsRes.ok) throw new Error(`Public profile mode proof load failed: ${modeRunsRes.status}`);
  const modeRunRows = (await modeRunsRes.json()) as any[];
  return buildPublicProfileFromRows(profileRow, recordRows, modeRunRows);
};

export const loadLeaderboard = async (
  scope: LeaderboardScope,
  profile: UserProfile,
): Promise<LeaderboardEntry[]> => {
  if (!configured) return [];
  const params = new URLSearchParams({
    select: "*",
    order: "xp.desc",
    limit: "20",
  });
  if (scope === "friend") params.set("friend_code", `eq.${friendCodeFor(profile)}`);
  if (scope === "season") params.set("season_key", `eq.${currentSeasonKey}`);
  const res = await fetch(restUrl(`kickoff_leaderboard?${params.toString()}`), {
    headers: headers(await refreshSupabaseSession()),
  });
  if (!res.ok) throw new Error(`Leaderboard load failed: ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows.map((row, index) => ({
    id: row.id,
    displayName: row.display_name ?? "Unknown analyst",
    location: row.location ?? "Global",
    rank: Number(row.rank ?? index + 1),
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
    source: scope,
  }));
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

export const buildCloudSyncCoverage = (
  cloudState: CloudSyncState,
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
) => {
  const localItems = records.length + modeRuns.length;
  const canSync = cloudState.configured && cloudState.authenticated;
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
  if (cloudState.status === "synced") {
    return {
      passed: true,
      pendingItems: 0,
      detail: `${localItems} local item${localItems === 1 ? "" : "s"} acknowledged by cloud`,
    };
  }
  if (cloudState.status === "syncing") {
    return {
      passed: false,
      pendingItems: localItems,
      detail: `${localItems} local item${localItems === 1 ? "" : "s"} syncing now`,
    };
  }
  return {
    passed: false,
    pendingItems: localItems,
    detail:
      cloudState.status === "error"
        ? `${localItems} local item${localItems === 1 ? "" : "s"} need sync retry`
        : `${localItems} local item${localItems === 1 ? "" : "s"} pending cloud acknowledgement`,
  };
};

const auditStatus = (blocked: boolean, passed: boolean): CloudSyncAuditItem["status"] =>
  blocked ? "blocked" : passed ? "passed" : "pending";

export const buildCloudSyncAudit = (
  cloudState: CloudSyncState,
  profile: UserProfile,
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  leaderboardEntries: LeaderboardEntry[] = [],
): CloudSyncAuditItem[] => {
  const configured = cloudState.configured;
  const signedIn = cloudState.authenticated;
  const synced = cloudState.status === "synced";
  const cloudProfile = profile.cloudMode === "supabase" && !profile.id.startsWith("local-");
  const remoteLeaderboardRows = leaderboardEntries.filter((entry) => entry.source !== "local").length;
  const leaderboardScopes = new Set(leaderboardEntries.filter((entry) => entry.source !== "local").map((entry) => entry.source));
  const totalProofLinks = records.length + modeRuns.length;
  const blockingDetail = configured ? "sign in required" : "Supabase env missing";

  return [
    {
      key: "profile",
      label: "Cloud profile",
      status: auditStatus(!configured, signedIn && cloudProfile),
      synced: signedIn && cloudProfile ? 1 : 0,
      total: 1,
      detail: cloudProfile ? `profile id ${profile.id}` : blockingDetail,
      action: cloudProfile ? "Profile can sync across devices." : "Sign in and save profile.",
    },
    {
      key: "records",
      label: "Prediction history",
      status: auditStatus(!configured || !signedIn, synced && records.length > 0),
      synced: synced ? records.length : 0,
      total: records.length,
      detail: records.length > 0 ? `${records.length} local capsule${records.length === 1 ? "" : "s"}` : "no local capsules",
      action: synced ? "Records acknowledged by cloud." : "Run Sync after locking predictions.",
    },
    {
      key: "modeRuns",
      label: "Mode proof history",
      status: auditStatus(!configured || !signedIn, synced && modeRuns.length > 0),
      synced: synced ? modeRuns.length : 0,
      total: modeRuns.length,
      detail: modeRuns.length > 0 ? `${modeRuns.length} local mode proof${modeRuns.length === 1 ? "" : "s"}` : "no mode proofs",
      action: synced ? "Mode proofs acknowledged by cloud." : "Create a mode proof and sync.",
    },
    {
      key: "publicProofs",
      label: "Public proof links",
      status: auditStatus(!configured || !signedIn, synced && totalProofLinks > 0),
      synced: synced ? totalProofLinks : 0,
      total: totalProofLinks,
      detail: totalProofLinks > 0 ? `${totalProofLinks} proof link${totalProofLinks === 1 ? "" : "s"} can be published` : "no proof links",
      action: synced ? "Proof and mode URLs can resolve from another device." : "Sync history before sharing public links.",
    },
    {
      key: "publicProfile",
      label: "Public profile",
      status: auditStatus(!configured, cloudProfile && synced),
      synced: cloudProfile && synced ? 1 : 0,
      total: 1,
      detail: cloudProfile ? `?profile=${profile.id}` : "local preview only",
      action: cloudProfile && synced ? "Profile page can load synced archives." : "Sync cloud history to publish the profile.",
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
): LeaderboardReadinessItem[] => {
  const remoteRows = remoteEntries.filter((entry) => entry.source !== "local");
  const scopes: LeaderboardScope[] = ["global", "friend", "season"];
  const scopeCounts = scopes.reduce(
    (counts, scope) => ({ ...counts, [scope]: remoteRows.filter((entry) => entry.source === scope).length }),
    {} as Record<LeaderboardScope, number>,
  );
  return [
    {
      key: "view",
      label: "Supabase view",
      passed: cloudState.configured,
      detail: cloudState.configured ? "kickoff_leaderboard is configured for public reads" : "local preview only",
    },
    ...scopes.map((scope) => {
      const scopeDetail =
        scope === "friend"
          ? `friend_code filter ready · ${friendCodeFor(profile)}`
          : scope === "season"
            ? `season_key filter ready · ${currentSeasonKey}`
            : "global xp ranking ready";
      const rows = scopeCounts[scope];
      return {
        key: scope,
        label: `${scope} scope`,
        passed: rows > 0,
        detail: cloudState.configured
          ? rows > 0
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
