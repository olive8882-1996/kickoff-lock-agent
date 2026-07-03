export type SupabaseDoctorStatus = "passed" | "failed" | "skipped";

export type SupabaseDoctorCheck = {
  id: string;
  label: string;
  required: boolean;
  status: SupabaseDoctorStatus;
  detail: string;
  action: string;
  url?: string;
  sampleIds?: string[];
};

export type SupabaseDoctorReport = {
  ready: boolean;
  requiredPassed: number;
  requiredTotal: number;
  checks: SupabaseDoctorCheck[];
  nextActions: SupabaseDoctorCheck[];
};

export type SupabaseDoctorEnv = Record<string, string | undefined>;

type FetchLike = typeof fetch;

const requiredTableQueries = [
  {
    id: "profiles-public-read",
    label: "Profiles public read",
    path: "kickoff_profiles?select=id,friend_code,updated_at&limit=1",
    action: "Grant anon/authenticated select on public.kickoff_profiles and enable the public read policy.",
  },
  {
    id: "records-public-read",
    label: "Prediction history public read",
    path: "kickoff_records?select=id,user_id,season_key,friend_code,total_score&limit=1",
    action: "Grant anon/authenticated select on public.kickoff_records and apply the public prediction policy.",
  },
  {
    id: "mode-runs-public-read",
    label: "Mode proof public read",
    path: "kickoff_mode_runs?select=id,user_id,mode_id,status,score&limit=1",
    action: "Grant anon/authenticated select on public.kickoff_mode_runs and apply the public mode proof policy.",
  },
  {
    id: "share-artifacts-public-read",
    label: "Share artifact public read",
    path: "kickoff_share_artifacts?select=id,kind,image_url,image_hash,proof_url&limit=1",
    action: "Grant anon/authenticated select on public.kickoff_share_artifacts and apply the share artifact policy.",
  },
  {
    id: "leaderboard-view-read",
    label: "Leaderboard view read",
    path: "kickoff_leaderboard?select=id,season_key,friend_code,xp,rank&limit=1",
    action: "Grant anon/authenticated select on public.kickoff_leaderboard after applying supabase.schema.sql.",
  },
];

const env = (values: SupabaseDoctorEnv, key: string) => values[key]?.trim() ?? "";
const has = (values: SupabaseDoctorEnv, key: string) => env(values, key).length > 0;
const baseUrl = (values: SupabaseDoctorEnv) => env(values, "VITE_SUPABASE_URL").replace(/\/$/, "");
const shareBucket = (values: SupabaseDoctorEnv) => env(values, "VITE_SUPABASE_SHARE_BUCKET") || "kickoff-share-cards";
const anonHeaders = (values: SupabaseDoctorEnv) => ({
  apikey: env(values, "VITE_SUPABASE_ANON_KEY"),
  Authorization: `Bearer ${env(values, "VITE_SUPABASE_ANON_KEY")}`,
});
const serviceHeaders = (values: SupabaseDoctorEnv) => ({
  apikey: env(values, "SUPABASE_SERVICE_ROLE_KEY"),
  Authorization: `Bearer ${env(values, "SUPABASE_SERVICE_ROLE_KEY")}`,
});
const restUrl = (values: SupabaseDoctorEnv, path: string) => `${baseUrl(values)}/rest/v1/${path}`;
const storageBucketUrl = (values: SupabaseDoctorEnv) =>
  `${baseUrl(values)}/storage/v1/bucket/${encodeURIComponent(shareBucket(values))}`;

const addCheck = (
  checks: SupabaseDoctorCheck[],
  check: Omit<SupabaseDoctorCheck, "status"> & { passed?: boolean; skipped?: boolean },
) => {
  const { passed, skipped, ...rest } = check;
  checks.push({
    ...rest,
    status: skipped ? "skipped" : passed ? "passed" : "failed",
  });
};

const readJson = async (fetcher: FetchLike, url: string, init?: RequestInit) => {
  const response = await fetcher(url, init);
  const text = await response.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { response, body, text };
};

const idsFromRows = (rows: any[], fallbackKey = "id") =>
  rows.map((row) => String(row?.[fallbackKey] ?? row?.id ?? "")).filter(Boolean);

const queryRows = async (
  values: SupabaseDoctorEnv,
  fetcher: FetchLike,
  checks: SupabaseDoctorCheck[],
  options: {
    id: string;
    label: string;
    path: string;
    required?: boolean;
    action: string;
    validate?: (rows: any[]) => { passed: boolean; detail: string; sampleIds?: string[] };
  },
) => {
  if (!has(values, "VITE_SUPABASE_URL") || !has(values, "VITE_SUPABASE_ANON_KEY")) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: options.required ?? true,
      detail: "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY",
      action: "Set Supabase project URL and anon key in .env.production.local.",
    });
    return;
  }
  const url = restUrl(values, options.path);
  try {
    const { response, body } = await readJson(fetcher, url, { headers: anonHeaders(values) });
    const rows = Array.isArray(body) ? body : [];
    const result = response.ok
      ? options.validate?.(rows) ?? {
          passed: true,
          detail: `${rows.length} row${rows.length === 1 ? "" : "s"} queryable`,
          sampleIds: idsFromRows(rows),
        }
      : { passed: false, detail: `HTTP ${response.status}` };
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: options.required ?? true,
      passed: result.passed,
      detail: result.detail,
      action: options.action,
      url,
      sampleIds: result.sampleIds,
    });
  } catch (error) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: options.required ?? true,
      detail: String(error),
      action: options.action,
      url,
    });
  }
};

const targetRowValidator = (targetId: string, label: string, sampleKey = "id") => (rows: any[]) => {
  const found = Boolean(targetId && rows.some((row) => String(row?.[sampleKey] ?? row?.id) === targetId));
  return {
    passed: found,
    detail: targetId ? (found ? `${label} ${targetId} read back` : `${label} ${targetId} missing`) : `${label} id missing`,
    sampleIds: idsFromRows(rows, sampleKey),
  };
};

const leaderboardValidator = (userId: string, scopeLabel: string) => (rows: any[]) => {
  const currentUserPresent = Boolean(userId && rows.some((row) => row.id === userId));
  return {
    passed: currentUserPresent,
    detail: userId
      ? `${rows.length} ${scopeLabel} row${rows.length === 1 ? "" : "s"}; current user ${currentUserPresent ? "present" : "missing"}`
      : "KICKOFF_VERIFY_USER_ID missing",
    sampleIds: idsFromRows(rows),
  };
};

export const buildSupabaseProductionDoctorReport = async (
  values: SupabaseDoctorEnv,
  fetcher: FetchLike = fetch,
): Promise<SupabaseDoctorReport> => {
  const checks: SupabaseDoctorCheck[] = [];
  const supabaseConfigured = has(values, "VITE_SUPABASE_URL") && has(values, "VITE_SUPABASE_ANON_KEY");

  addCheck(checks, {
    id: "supabase-env",
    label: "Supabase REST env",
    required: true,
    passed: supabaseConfigured,
    detail: supabaseConfigured ? "URL and anon key configured" : "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY",
    action: "Create a Supabase project, apply supabase.schema.sql, then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  });

  await queryRows(values, fetcher, checks, {
    id: "backend-health",
    label: "Backend health view",
    path: "kickoff_backend_health?select=*&limit=1",
    action: "Apply supabase.schema.sql until kickoff_backend_health.ready is true.",
    validate: (rows) => {
      const row = rows[0];
      return {
        passed: Boolean(row?.ready),
        detail: row
          ? row.ready
            ? `schema ${row.schema_version ?? "unknown"} ready`
            : `not ready: ${row.detail ?? "backend health failed"}`
          : "no kickoff_backend_health rows returned",
        sampleIds: row?.schema_version ? [String(row.schema_version)] : [],
      };
    },
  });

  await Promise.all(
    requiredTableQueries.map((query) =>
      queryRows(values, fetcher, checks, {
        ...query,
        required: true,
      }),
    ),
  );

  const profileId = env(values, "KICKOFF_VERIFY_PROFILE_ID");
  const proofId = env(values, "KICKOFF_VERIFY_PROOF_ID");
  const modeId = env(values, "KICKOFF_VERIFY_MODE_ID");
  const userId = env(values, "KICKOFF_VERIFY_USER_ID");
  const friendCode = env(values, "KICKOFF_VERIFY_FRIEND_CODE");
  const seasonKey = env(values, "KICKOFF_VERIFY_SEASON_KEY");

  await Promise.all([
    queryRows(values, fetcher, checks, {
      id: "target-profile-row",
      label: "Target profile row",
      path: profileId
        ? `kickoff_profiles?select=id,friend_code,updated_at&id=eq.${encodeURIComponent(profileId)}&limit=1`
        : "kickoff_profiles?select=id&limit=1",
      action: "Sign in, sync profile, then set KICKOFF_VERIFY_PROFILE_ID to the Supabase user id.",
      validate: targetRowValidator(profileId, "profile"),
    }),
    queryRows(values, fetcher, checks, {
      id: "target-record-row",
      label: "Target prediction row",
      path: proofId
        ? `kickoff_records?select=id,user_id,season_key,friend_code,total_score&id=eq.${encodeURIComponent(proofId)}&limit=1`
        : "kickoff_records?select=id&limit=1",
      action: "Lock and sync one prediction capsule, then set KICKOFF_VERIFY_PROOF_ID.",
      validate: targetRowValidator(proofId, "prediction"),
    }),
    queryRows(values, fetcher, checks, {
      id: "target-mode-row",
      label: "Target mode proof row",
      path: modeId
        ? `kickoff_mode_runs?select=id,user_id,mode_id,status,score&id=eq.${encodeURIComponent(modeId)}&limit=1`
        : "kickoff_mode_runs?select=id&limit=1",
      action: "Create and sync one tournament mode proof, then set KICKOFF_VERIFY_MODE_ID.",
      validate: targetRowValidator(modeId, "mode proof"),
    }),
    queryRows(values, fetcher, checks, {
      id: "target-share-artifact-row",
      label: "Target share artifact row",
      path: proofId
        ? `kickoff_share_artifacts?select=id,kind,image_url,image_hash,proof_url&id=eq.${encodeURIComponent(proofId)}&kind=eq.record&limit=1`
        : "kickoff_share_artifacts?select=id,kind,image_url,image_hash&limit=1",
      action: "Generate a record share card, upload its PNG to Supabase Storage, sync the manifest, then set KICKOFF_VERIFY_PROOF_ID.",
      validate: (rows) => {
        const row = rows[0];
        return {
          passed: Boolean(proofId && row?.id === proofId && row?.image_url && row?.image_hash),
          detail: proofId
            ? row?.image_url && row?.image_hash
              ? `record:${proofId} share artifact has image_url and image_hash`
              : `record:${proofId} share artifact missing image_url or image_hash`
            : "KICKOFF_VERIFY_PROOF_ID missing",
          sampleIds: rows.map((item) => `${item.kind}:${item.id}`).filter(Boolean),
        };
      },
    }),
  ]);

  const leaderboardSelect = "select=id,friend_code,season_key,xp,verified_proofs,mode_proofs,rank";
  await Promise.all([
    queryRows(values, fetcher, checks, {
      id: "leaderboard-global-user",
      label: "Global leaderboard current user",
      path: userId
        ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encodeURIComponent(userId)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
      action: "Sync at least one record or mode proof so the current user appears in the global leaderboard.",
      validate: leaderboardValidator(userId, "global"),
    }),
    queryRows(values, fetcher, checks, {
      id: "leaderboard-friend-user",
      label: "Friend leaderboard current user",
      path: userId && friendCode
        ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encodeURIComponent(userId)}&friend_code=eq.${encodeURIComponent(friendCode)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
      action: "Set KICKOFF_VERIFY_FRIEND_CODE to the synced profile friend_code and confirm the current user appears in that scope.",
      validate: leaderboardValidator(userId && friendCode ? userId : "", "friend"),
    }),
    queryRows(values, fetcher, checks, {
      id: "leaderboard-season-user",
      label: "Season leaderboard current user",
      path: userId && seasonKey
        ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encodeURIComponent(userId)}&season_key=eq.${encodeURIComponent(seasonKey)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
      action: "Set KICKOFF_VERIFY_SEASON_KEY to the synced season and confirm the current user appears in that scope.",
      validate: leaderboardValidator(userId && seasonKey ? userId : "", "season"),
    }),
  ]);

  const shareImageUrl = env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  if (!shareImageUrl) {
    addCheck(checks, {
      id: "public-share-image-read",
      label: "Public share image read",
      required: true,
      detail: "KICKOFF_VERIFY_SHARE_IMAGE_URL missing",
      action: "Upload a generated PNG to Supabase Storage and set KICKOFF_VERIFY_SHARE_IMAGE_URL to its public URL.",
    });
  } else {
    try {
      const response = await fetcher(shareImageUrl, { method: "GET" });
      const contentType = response.headers.get("content-type") ?? "";
      addCheck(checks, {
        id: "public-share-image-read",
        label: "Public share image read",
        required: true,
        passed: response.ok && contentType.includes("image/"),
        detail: response.ok ? `HTTP ${response.status} ${contentType || "unknown content-type"}` : `HTTP ${response.status}`,
        action: "Ensure the share image URL points to a public Supabase Storage PNG/WebP/JPEG object.",
        url: shareImageUrl,
      });
    } catch (error) {
      addCheck(checks, {
        id: "public-share-image-read",
        label: "Public share image read",
        required: true,
        detail: String(error),
        action: "Ensure the share image URL points to a public Supabase Storage PNG/WebP/JPEG object.",
        url: shareImageUrl,
      });
    }
  }

  if (!has(values, "SUPABASE_SERVICE_ROLE_KEY")) {
    addCheck(checks, {
      id: "storage-bucket-admin-read",
      label: "Storage bucket admin read",
      required: false,
      skipped: true,
      detail: "SUPABASE_SERVICE_ROLE_KEY missing",
      action: "Optionally set SUPABASE_SERVICE_ROLE_KEY locally to verify the Storage bucket public flag via the admin API.",
    });
  } else if (!has(values, "VITE_SUPABASE_URL")) {
    addCheck(checks, {
      id: "storage-bucket-admin-read",
      label: "Storage bucket admin read",
      required: false,
      detail: "Missing VITE_SUPABASE_URL",
      action: "Set VITE_SUPABASE_URL before checking Storage bucket metadata.",
    });
  } else {
    const url = storageBucketUrl(values);
    try {
      const { response, body } = await readJson(fetcher, url, { headers: serviceHeaders(values) });
      addCheck(checks, {
        id: "storage-bucket-admin-read",
        label: "Storage bucket admin read",
        required: false,
        passed: response.ok && body?.public === true,
        detail: response.ok
          ? body?.public === true
            ? `${shareBucket(values)} bucket is public`
            : `${shareBucket(values)} bucket public flag is not true`
          : `HTTP ${response.status}`,
        action: "Create the kickoff-share-cards bucket with public=true or re-run supabase.schema.sql.",
        url,
      });
    } catch (error) {
      addCheck(checks, {
        id: "storage-bucket-admin-read",
        label: "Storage bucket admin read",
        required: false,
        detail: String(error),
        action: "Create the kickoff-share-cards bucket with public=true or re-run supabase.schema.sql.",
        url,
      });
    }
  }

  const required = checks.filter((check) => check.required);
  const requiredPassed = required.filter((check) => check.status === "passed").length;
  return {
    ready: required.length > 0 && requiredPassed === required.length,
    requiredPassed,
    requiredTotal: required.length,
    checks,
    nextActions: checks.filter((check) => check.required && check.status !== "passed"),
  };
};

