import { buildPublicUrl, evaluatePublicAuthRedirect, normalizePublicAppUrl } from "./publicUrls";
import { productionModeCoverageProblem } from "./modeEvidence";
import {
  evaluateLeaderboardScopeRows,
  leaderboardRankKeyForScope,
  type LeaderboardEvidenceScope,
} from "./productionEvidence";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { productionShareChannelProblem } from "./shareChannelValidation";
import { validatePublicShareImageResponse } from "./shareImageValidation";
import { deployedSupabaseProjectUrlProblem } from "./supabaseStorageUrl";

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
    path: "kickoff_share_artifacts?select=id,kind,image_url,image_hash,proof_url,image_mime,image_byte_length,generated_at&limit=1",
    action: "Grant anon/authenticated select on public.kickoff_share_artifacts and apply the share artifact policy.",
  },
  {
    id: "leaderboard-view-read",
    label: "Leaderboard view read",
    path: "kickoff_leaderboard?select=id,season_key,friend_code,xp,global_rank,friend_rank,season_rank,rank&limit=1",
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
const authAdminUserUrl = (values: SupabaseDoctorEnv, userId: string) =>
  `${baseUrl(values)}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
const authAuthorizeUrl = (values: SupabaseDoctorEnv, redirectTo: string) => {
  const url = new URL(`${baseUrl(values)}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
};

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
  const urlProblem = deployedSupabaseProjectUrlProblem(env(values, "VITE_SUPABASE_URL"));
  if (urlProblem) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: options.required ?? true,
      detail: urlProblem,
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

const scopeProblems = (
  row: any,
  scope: { userId?: string; friendCode?: string; seasonKey?: string; profileFriendCode?: string },
) => [
  scope.userId && String(row?.user_id ?? "") !== scope.userId ? `user_id ${row?.user_id ?? "missing"} != ${scope.userId}` : "",
  scope.friendCode && String(row?.friend_code ?? "") !== scope.friendCode
    ? `friend_code ${row?.friend_code ?? "missing"} != ${scope.friendCode}`
    : "",
  scope.seasonKey && String(row?.season_key ?? "") !== scope.seasonKey
    ? `season_key ${row?.season_key ?? "missing"} != ${scope.seasonKey}`
    : "",
  scope.profileFriendCode && String(row?.friend_code ?? "") !== scope.profileFriendCode
    ? `friend_code ${row?.friend_code ?? "missing"} != ${scope.profileFriendCode}`
    : "",
].filter(Boolean);

type AccountScope = { userId?: string; friendCode?: string; seasonKey?: string };

const scopedTargetRowValidator =
  (
    targetId: string,
    label: string,
    scope: { userId?: string; friendCode?: string; seasonKey?: string; profileFriendCode?: string },
    sampleKey = "id",
  ) =>
  (rows: any[]) => {
    const row = targetId ? rows.find((item) => String(item?.[sampleKey] ?? item?.id) === targetId) : undefined;
    const problems = row ? scopeProblems(row, scope) : [];
    return {
      passed: Boolean(row && problems.length === 0),
      detail: targetId
        ? row
          ? problems.length === 0
            ? `${label} ${targetId} read back with matching scope`
            : `${label} ${targetId} scope mismatch: ${problems.join("; ")}`
          : `${label} ${targetId} missing`
        : `${label} id missing`,
      sampleIds: idsFromRows(rows, sampleKey),
    };
  };

const scopedTargetRowsValidator =
  (
    targetIds: string[],
    label: string,
    scope: { userId?: string; friendCode?: string; seasonKey?: string },
    sampleKey = "id",
  ) =>
  (rows: any[]) => {
    const rowsById = new Map(rows.map((row) => [String(row?.[sampleKey] ?? row?.id ?? ""), row]));
    const missing = targetIds.filter((id) => !rowsById.has(id));
    const mismatched = targetIds
      .map((id) => {
        const row = rowsById.get(id);
        const problems = row ? scopeProblems(row, scope) : [];
        return problems.length > 0 ? `${id} ${problems.join("; ")}` : "";
      })
      .filter(Boolean);
    return {
      passed: targetIds.length > 0 && missing.length === 0 && mismatched.length === 0,
      detail:
        targetIds.length > 0
          ? missing.length > 0
            ? `${label} missing ${missing.join(", ")}`
            : mismatched.length > 0
              ? `${label} scope mismatch: ${mismatched.join(" | ")}`
              : `${label} ${targetIds.length}/${targetIds.length} read back with matching scope`
          : `${label} ids missing`,
      sampleIds: idsFromRows(rows, sampleKey),
    };
  };

const modeTargetRowsValidator =
  (targetIds: string[], scope: { userId?: string; friendCode?: string; seasonKey?: string }) => (rows: any[]) => {
    const base = scopedTargetRowsValidator(targetIds, "mode proofs", scope)(rows);
    if (!base.passed) return base;
    const modeProblem = productionModeCoverageProblem(rows, "mode proofs");
    return {
      ...base,
      passed: !modeProblem,
      detail: modeProblem || `${base.detail} and mode type coverage ${requiredProductionModeIds.join(", ")}`,
    };
  };

const nonEmpty = (value: unknown) => String(value ?? "").trim().length > 0;

const profileTargetValidator = (targetId: string, friendCode: string) => (rows: any[]) => {
  const row = targetId ? rows.find((item) => String(item?.id ?? "") === targetId) : undefined;
  const problems = row
    ? [
        row.id !== targetId ? `id ${row.id ?? "missing"} != ${targetId}` : "",
        nonEmpty(row.email) ? "" : "email missing",
        nonEmpty(row.display_name) ? "" : "display_name missing",
        nonEmpty(row.location) ? "" : "location missing",
        nonEmpty(row.friend_code) ? "" : "friend_code missing",
        validTimestamp(row.updated_at) ? "" : "updated_at is missing or invalid",
        friendCode && String(row.friend_code ?? "") !== friendCode
          ? `friend_code ${row.friend_code ?? "missing"} != ${friendCode}`
          : "",
      ].filter(Boolean)
    : [];
  return {
    passed: Boolean(targetId && row && problems.length === 0),
    detail: targetId
        ? row
        ? problems.length === 0
          ? `profile ${targetId} read back with email, display name, location, updated_at and matching friend_code`
          : `profile ${targetId} invalid: ${problems.join("; ")}`
        : `profile ${targetId} missing`
      : "profile id missing",
    sampleIds: idsFromRows(rows),
  };
};

const authIdentityProviders = (body: any) =>
  Array.from(
    new Set(
      [
        ...(Array.isArray(body?.identities) ? body.identities.map((identity: any) => identity?.provider) : []),
        ...(Array.isArray(body?.app_metadata?.providers) ? body.app_metadata.providers : []),
        body?.app_metadata?.provider,
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );

const authUserProblems = (body: any, userId: string) => {
  const providers = authIdentityProviders(body);
  return [
    String(body?.id ?? "") === userId ? "" : `id ${body?.id ?? "missing"} != ${userId}`,
    nonEmpty(body?.email) ? "" : "email missing",
    body?.confirmed_at || body?.email_confirmed_at || providers.length > 0 ? "" : "confirmed identity missing",
  ].filter(Boolean);
};

const authProfileIdentityProblems = (authBody: any, profileRow: any, userId: string, profileId: string) => {
  const authEmail = String(authBody?.email ?? "").trim();
  const profileEmail = String(profileRow?.email ?? "").trim();
  return [
    String(authBody?.id ?? "") === userId ? "" : `auth id ${authBody?.id ?? "missing"} != ${userId}`,
    String(profileRow?.id ?? "") === profileId ? "" : `profile id ${profileRow?.id ?? "missing"} != ${profileId}`,
    authBody?.id && profileRow?.id && String(authBody.id) === String(profileRow.id)
      ? ""
      : `auth/profile id mismatch (${authBody?.id ?? "missing"} != ${profileRow?.id ?? "missing"})`,
    authEmail ? "" : "auth email missing",
    profileEmail ? "" : "profile email missing",
    authEmail && profileEmail && authEmail === profileEmail ? "" : `email mismatch (${authEmail || "missing"} != ${profileEmail || "missing"})`,
    nonEmpty(profileRow?.display_name) ? "" : "profile display_name missing",
  ].filter(Boolean);
};

const addAuthTargetUserCheck = async (
  values: SupabaseDoctorEnv,
  fetcher: FetchLike,
  checks: SupabaseDoctorCheck[],
  userId: string,
) => {
  const baseProblem = deployedSupabaseProjectUrlProblem(env(values, "VITE_SUPABASE_URL"));
  if (!userId || baseProblem || !has(values, "SUPABASE_SERVICE_ROLE_KEY")) {
    addCheck(checks, {
      id: "target-auth-user",
      label: "Target Auth user",
      required: true,
      detail: !userId
        ? "KICKOFF_VERIFY_USER_ID missing"
        : baseProblem || "SUPABASE_SERVICE_ROLE_KEY missing for Auth admin user read-back",
      action: "Create/sign in the target Supabase user, then set KICKOFF_VERIFY_USER_ID and local-only SUPABASE_SERVICE_ROLE_KEY for production verification.",
    });
    return;
  }

  const url = authAdminUserUrl(values, userId);
  try {
    const { response, body } = await readJson(fetcher, url, { headers: serviceHeaders(values) });
    const problems = response.ok ? authUserProblems(body, userId) : [];
    const providers = authIdentityProviders(body);
    addCheck(checks, {
      id: "target-auth-user",
      label: "Target Auth user",
      required: true,
      passed: response.ok && problems.length === 0,
      detail: response.ok
        ? problems.length === 0
          ? `Auth user ${userId} read back with email and ${providers.length > 0 ? providers.join("/") : "confirmed identity"}`
          : `Auth user ${userId} invalid: ${problems.join("; ")}`
        : `HTTP ${response.status}`,
      action: "Confirm the target user exists in Supabase Auth and rerun doctor:supabase with SUPABASE_SERVICE_ROLE_KEY set locally.",
      url,
      sampleIds: body?.id ? [String(body.id)] : [],
    });
  } catch (error) {
    addCheck(checks, {
      id: "target-auth-user",
      label: "Target Auth user",
      required: true,
      detail: String(error),
      action: "Confirm the target user exists in Supabase Auth and rerun doctor:supabase with SUPABASE_SERVICE_ROLE_KEY set locally.",
      url,
    });
  }
};

const addAuthProfileIdentityCheck = async (
  values: SupabaseDoctorEnv,
  fetcher: FetchLike,
  checks: SupabaseDoctorCheck[],
  userId: string,
  profileId: string,
) => {
  const baseProblem = deployedSupabaseProjectUrlProblem(env(values, "VITE_SUPABASE_URL"));
  const identityProblem = accountIdentityProblem(userId, profileId);
  if (identityProblem || baseProblem || !has(values, "SUPABASE_SERVICE_ROLE_KEY") || !has(values, "VITE_SUPABASE_ANON_KEY")) {
    addCheck(checks, {
      id: "target-auth-profile-identity",
      label: "Auth/profile identity match",
      required: true,
      detail: identityProblem || baseProblem || "SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing",
      action: "Read the target Auth user and kickoff_profiles row, then confirm they share the same id and email.",
    });
    return;
  }

  const authUrl = authAdminUserUrl(values, userId);
  const profileUrl = restUrl(
    values,
    `kickoff_profiles?select=id,email,display_name,avatar_url,updated_at&id=eq.${encodeURIComponent(profileId)}&limit=1`,
  );
  try {
    const [authResult, profileResult] = await Promise.all([
      readJson(fetcher, authUrl, { headers: serviceHeaders(values) }),
      readJson(fetcher, profileUrl, { headers: anonHeaders(values) }),
    ]);
    const [profileRow] = Array.isArray(profileResult.body) ? profileResult.body : [];
    const problems =
      authResult.response.ok && profileResult.response.ok
        ? authProfileIdentityProblems(authResult.body, profileRow, userId, profileId)
        : [
            authResult.response.ok ? "" : `auth HTTP ${authResult.response.status}`,
            profileResult.response.ok ? "" : `profile HTTP ${profileResult.response.status}`,
          ].filter(Boolean);
    addCheck(checks, {
      id: "target-auth-profile-identity",
      label: "Auth/profile identity match",
      required: true,
      passed: authResult.response.ok && profileResult.response.ok && problems.length === 0,
      detail:
        authResult.response.ok && profileResult.response.ok
          ? problems.length === 0
            ? `Auth user ${userId} and profile ${profileId} share email ${authResult.body.email}`
            : `Auth/profile identity mismatch: ${problems.join("; ")}`
          : problems.join("; "),
      action: "Sync the signed-in Supabase profile from the Auth user before claiming cross-device account recovery.",
      url: profileUrl,
      sampleIds: [String(authResult.body?.id ?? ""), String(profileRow?.id ?? "")].filter(Boolean),
    });
  } catch (error) {
    addCheck(checks, {
      id: "target-auth-profile-identity",
      label: "Auth/profile identity match",
      required: true,
      detail: String(error),
      action: "Sync the signed-in Supabase profile from the Auth user before claiming cross-device account recovery.",
      url: profileUrl,
    });
  }
};

const validSha256 = (value: string | undefined) => Boolean(value && /^[a-f0-9]{64}$/i.test(value));
const MIN_PRODUCTION_SHARE_IMAGE_BYTES = 10_000;

const validProductionShareMime = (value: unknown) => String(value ?? "").trim().toLowerCase() === "image/png";

const validProductionShareByteLength = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= MIN_PRODUCTION_SHARE_IMAGE_BYTES;
};

const validTimestamp = (value: unknown) => {
  if (!value) return false;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time);
};

const publicHttpsUrl = (value: string | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) &&
      !url.hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
};

const expectedPublicProofUrl = (values: SupabaseDoctorEnv, kind: "record" | "mode", targetId: string) => {
  const publicAppUrl = normalizePublicAppUrl(values.VITE_PUBLIC_APP_URL);
  if (!publicAppUrl || !targetId) return "";
  return buildPublicUrl(kind === "record" ? "proof" : "mode", targetId, publicAppUrl, publicAppUrl);
};

const shareArtifactProblem = (
  row: any,
  targetId: string,
  kind: "record" | "mode",
  expectedImageUrl?: string,
  expectedProofUrl?: string,
  scope?: AccountScope,
) =>
  [
    row?.id !== targetId ? `id ${row?.id ?? "missing"} != ${targetId}` : "",
    row?.kind !== kind ? `kind ${row?.kind ?? "missing"} != ${kind}` : "",
    ...scopeProblems(row, scope ?? {}),
    publicHttpsUrl(row?.image_url) ? "" : "image_url is not a deployed HTTPS URL",
    expectedImageUrl && row?.image_url !== expectedImageUrl ? "image_url does not match configured public share image" : "",
    validSha256(row?.image_hash) ? "" : "image_hash is not a 64-character SHA-256 digest",
    publicHttpsUrl(row?.proof_url) ? "" : "proof_url is not a deployed HTTPS URL",
    expectedProofUrl && row?.proof_url !== expectedProofUrl ? "proof_url does not match configured public proof target" : "",
    validProductionShareMime(row?.image_mime) ? "" : `image_mime ${row?.image_mime ?? "missing"} is not image/png`,
    validProductionShareByteLength(row?.image_byte_length)
      ? ""
      : `image_byte_length ${row?.image_byte_length ?? "missing"} is below ${MIN_PRODUCTION_SHARE_IMAGE_BYTES}`,
    validTimestamp(row?.generated_at) ? "" : "generated_at is missing or invalid",
  ].filter(Boolean);

const shareArtifactValidator = (
  targetId: string,
  kind: "record" | "mode",
  label: string,
  expectedImageUrl?: string,
  expectedProofUrl?: string,
  scope?: AccountScope,
) => (rows: any[]) => {
  const row = rows[0];
  const problems = row ? shareArtifactProblem(row, targetId, kind, expectedImageUrl, expectedProofUrl, scope) : [];
  return {
    passed: Boolean(targetId && row && problems.length === 0),
    detail: targetId
        ? row
        ? problems.length === 0
          ? `${label}:${targetId} share artifact has deployed proof/image URLs, PNG manifest and image_hash`
          : `${label}:${targetId} share artifact invalid: ${problems.join("; ")}`
        : `${label}:${targetId} share artifact missing`
      : `${label} id missing`,
    sampleIds: rows.map((item) => `${item.kind}:${item.id}`).filter(Boolean),
  };
};

const shareArtifactsValidator = (
  targetIds: string[],
  kind: "record" | "mode",
  label: string,
  expectedImageUrl?: string,
  expectedProofUrlFor?: (targetId: string) => string,
  scope?: AccountScope,
) => (rows: any[]) => {
  const rowsById = new Map(rows.map((row) => [String(row?.id ?? ""), row]));
  const missing = targetIds.filter((id) => !rowsById.has(id));
  const invalid = targetIds
    .map((id) => {
      const row = rowsById.get(id);
      const problems = row ? shareArtifactProblem(row, id, kind, expectedImageUrl, expectedProofUrlFor?.(id), scope) : [];
      return problems.length > 0 ? `${id} ${problems.join("; ")}` : "";
    })
    .filter(Boolean);
  return {
    passed: targetIds.length > 0 && missing.length === 0 && invalid.length === 0,
    detail:
      targetIds.length > 0
        ? missing.length > 0
          ? `${label} share artifacts missing ${missing.join(", ")}`
          : invalid.length > 0
            ? `${label} share artifacts invalid: ${invalid.join(" | ")}`
            : `${label} ${targetIds.length}/${targetIds.length} share artifacts have deployed proof/image URLs, PNG manifests and image_hash`
        : `${label} ids missing`,
    sampleIds: rows.map((item) => `${item.kind}:${item.id}`).filter(Boolean),
  };
};

const shareChannelProblem = (
  row: any,
  targetId: string,
  kind: "record" | "mode",
  expectedProofUrl?: string,
  scope?: AccountScope,
) => {
  const problems = [
    row?.id !== targetId ? `id ${row?.id ?? "missing"} != ${targetId}` : "",
    row?.kind !== kind ? `kind ${row?.kind ?? "missing"} != ${kind}` : "",
    ...scopeProblems(row, scope ?? {}),
    expectedProofUrl && row?.proof_url !== expectedProofUrl ? "proof_url does not match configured public proof target" : "",
    productionShareChannelProblem(row),
  ].filter(Boolean);
  return problems.join("; ");
};

const shareChannelValidator = (
  targetId: string,
  kind: "record" | "mode",
  label: string,
  expectedProofUrl?: string,
  scope?: AccountScope,
) => (rows: any[]) => {
  const row = rows[0];
  const problem = row ? shareChannelProblem(row, targetId, kind, expectedProofUrl, scope) : "";
  return {
    passed: Boolean(targetId && row && !problem),
    detail: targetId
      ? row?.kind === kind && !problem
        ? `${label}:${targetId} share channel opened and synced`
        : `${label}:${targetId} share channel ${problem || "row missing"}`
      : `${label} id missing`,
    sampleIds: rows.map((item) => `${item.kind}:${item.id}`).filter(Boolean),
  };
};

const shareChannelsValidator = (
  targetIds: string[],
  kind: "record" | "mode",
  label: string,
  expectedProofUrlFor?: (targetId: string) => string,
  scope?: AccountScope,
) => (rows: any[]) => {
  const rowsById = new Map(rows.map((row) => [String(row?.id ?? ""), row]));
  const missing = targetIds.filter((id) => !rowsById.has(id));
  const invalid = targetIds
    .map((id) => {
      const row = rowsById.get(id);
      const problem = row ? shareChannelProblem(row, id, kind, expectedProofUrlFor?.(id), scope) : "";
      return problem ? `${id} ${problem}` : "";
    })
    .filter(Boolean);
  return {
    passed: targetIds.length > 0 && missing.length === 0 && invalid.length === 0,
    detail:
      targetIds.length > 0
        ? missing.length === 0
          ? invalid.length === 0
            ? `${label} ${targetIds.length}/${targetIds.length} share channels opened and synced`
            : `${label} share channels invalid: ${invalid.join(" | ")}`
          : `${label} share channels missing ${missing.join(", ")}`
        : `${label} ids missing`,
    sampleIds: rows.map((item) => `${item.kind}:${item.id}`).filter(Boolean),
  };
};

const addPublicShareImageCheck = async (
  values: SupabaseDoctorEnv,
  fetcher: FetchLike,
  checks: SupabaseDoctorCheck[],
  options: { id: string; label: string; envKey: string; action: string },
) => {
  const shareImageUrl = env(values, options.envKey);
  if (!shareImageUrl) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      detail: `${options.envKey} missing`,
      action: options.action,
    });
    return;
  }
  const urlProblem = publicShareImageUrlProblem(shareImageUrl, options.envKey);
  if (urlProblem) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      detail: urlProblem,
      action: options.action,
      url: shareImageUrl,
    });
    return;
  }
  try {
    const response = await fetcher(shareImageUrl, { method: "GET" });
    const validation = await validatePublicShareImageResponse(response);
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      passed: validation.passed,
      detail: validation.detail,
      action: options.action,
      url: shareImageUrl,
    });
  } catch (error) {
    addCheck(checks, {
      id: options.id,
      label: options.label,
      required: true,
      detail: String(error),
      action: options.action,
      url: shareImageUrl,
    });
  }
};

const listEnv = (values: SupabaseDoctorEnv, key: string) =>
  env(values, key).split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const requiredModeTargetCount = requiredProductionModeIds.length;

const modeTargetProblem = (values: SupabaseDoctorEnv) => {
  const ids = listEnv(values, "KICKOFF_VERIFY_MODE_IDS");
  if (ids.length >= requiredModeTargetCount) return "";
  if (ids.length > 0) return `KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids; got ${ids.length}`;
  if (has(values, "KICKOFF_VERIFY_MODE_ID")) {
    return `KICKOFF_VERIFY_MODE_IDS needs ${requiredModeTargetCount} mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough`;
  }
  return "KICKOFF_VERIFY_MODE_IDS missing";
};

const inFilter = (ids: string[]) => ids.map((id) => encodeURIComponent(id)).join(",");
const filterParam = (key: string, item: string) => (item ? `&${key}=eq.${encodeURIComponent(item)}` : "");
const accountScopeFilters = ({
  userId,
  friendCode,
  seasonKey,
}: {
  userId: string;
  friendCode?: string;
  seasonKey?: string;
}) => [
  filterParam("user_id", userId),
  filterParam("friend_code", friendCode ?? ""),
  filterParam("season_key", seasonKey ?? ""),
].join("");

const accountIdentityProblem = (userId: string, profileId: string) => {
  if (!userId || !profileId) return "KICKOFF_VERIFY_USER_ID and KICKOFF_VERIFY_PROFILE_ID must both be set";
  if (userId !== profileId) return `KICKOFF_VERIFY_USER_ID (${userId}) must match KICKOFF_VERIFY_PROFILE_ID (${profileId})`;
  return "";
};

const leaderboardValidator = (
  userId: string,
  scopeLabel: LeaderboardEvidenceScope,
  scopeTarget?: { key: "friend_code" | "season_key"; value: string },
) => (rows: any[]) => evaluateLeaderboardScopeRows(rows, { userId, scope: scopeLabel, scopeTarget });

const leaderboardBoardValidator = (
  scopeLabel: LeaderboardEvidenceScope,
  scopeTarget?: { key: "friend_code" | "season_key"; value: string },
) => (rows: any[]) => {
  const rankKey = leaderboardRankKeyForScope(scopeLabel);
  const missingScopeTarget = scopeTarget && !scopeTarget.value;
  const rankProblems = rows
    .map((row) => {
      const rank = Number(row?.[rankKey]);
      return Number.isInteger(rank) && rank > 0 ? "" : `${row?.id ?? "unknown"} ${rankKey} missing`;
    })
    .filter(Boolean);
  const scopeProblems = rows
    .map((row) => {
      if (!scopeTarget) return "";
      const actual = String(row?.[scopeTarget.key] ?? "");
      return actual === scopeTarget.value ? "" : `${row?.id ?? "unknown"} ${scopeTarget.key} ${actual || "missing"} != ${scopeTarget.value}`;
    })
    .filter(Boolean);
  const ranks = rows.map((row) => Number(row?.[rankKey])).filter((rank) => Number.isInteger(rank) && rank > 0);
  const ordered = ranks.every((rank, index) => index === 0 || rank >= ranks[index - 1]);
  const problems = [
    missingScopeTarget ? `${scopeTarget.key} target missing` : "",
    rows.length === 0 ? "no board rows returned" : "",
    ...rankProblems,
    ...scopeProblems,
    ordered ? "" : `${rankKey} rows are not sorted ascending`,
  ].filter(Boolean);
  return {
    passed: problems.length === 0,
    detail:
      problems.length === 0
        ? `${rows.length} ${scopeLabel} board row${rows.length === 1 ? "" : "s"} read back with ordered ${rankKey}`
        : `${scopeLabel} board invalid: ${problems.join("; ")}`,
    sampleIds: rows.map((item) => String(item?.id ?? "")).filter(Boolean).slice(0, 5),
  };
};

const listProblems = (row: any, key: string, label: string) => {
  if (!Array.isArray(row?.[key])) return [`${label} missing from kickoff_backend_health`];
  return row[key].length > 0 ? [`${label}: ${row[key].join(", ")}`] : [];
};

const backendHealthProblems = (row: any) => {
  if (!row) return ["no kickoff_backend_health rows returned"];
  const policyCount = Number(row.policy_count ?? 0);
  const requiredPolicyCount = Number(row.required_policy_count ?? 8);
  const storagePolicyCount = Number(row.storage_policy_count ?? 0);
  const requiredStoragePolicyCount = Number(row.required_storage_policy_count ?? 3);
  return [
    row.ready === true ? "" : row.detail ?? "ready flag is false",
    ...listProblems(row, "missing_tables", "missing tables"),
    ...listProblems(row, "missing_views", "missing views"),
    ...listProblems(row, "missing_rls_tables", "missing RLS tables"),
    ...listProblems(row, "missing_columns", "missing columns"),
    ...listProblems(row, "missing_view_columns", "missing view columns"),
    ...listProblems(row, "unsafe_write_policies", "unsafe write policies"),
    policyCount >= requiredPolicyCount ? "" : `policies ${policyCount}/${requiredPolicyCount}`,
    row.storage_bucket_public === true ? "" : "storage bucket is not public",
    storagePolicyCount >= requiredStoragePolicyCount ? "" : `storage policies ${storagePolicyCount}/${requiredStoragePolicyCount}`,
  ].filter(Boolean);
};

export const buildSupabaseProductionDoctorReport = async (
  values: SupabaseDoctorEnv,
  fetcher: FetchLike = fetch,
): Promise<SupabaseDoctorReport> => {
  const checks: SupabaseDoctorCheck[] = [];
  const supabaseUrlProblem = deployedSupabaseProjectUrlProblem(env(values, "VITE_SUPABASE_URL"));
  const supabaseConfigured = !supabaseUrlProblem && has(values, "VITE_SUPABASE_ANON_KEY");

  addCheck(checks, {
    id: "supabase-env",
    label: "Supabase REST env",
    required: true,
    passed: supabaseConfigured,
    detail: supabaseConfigured
      ? "URL and anon key configured"
      : !has(values, "VITE_SUPABASE_URL") || !has(values, "VITE_SUPABASE_ANON_KEY")
        ? "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY"
        : supabaseUrlProblem,
    action: "Create a Supabase project, apply supabase.schema.sql, then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  });

  const redirect = evaluatePublicAuthRedirect(values.VITE_SUPABASE_REDIRECT_URL, values.VITE_PUBLIC_APP_URL);
  addCheck(checks, {
    id: "auth-redirect-url",
    label: "Auth redirect URL",
    required: true,
    passed: redirect.passed,
    detail: redirect.detail,
    action: "Set VITE_SUPABASE_REDIRECT_URL to the same deployed HTTPS URL as VITE_PUBLIC_APP_URL and add it to the Supabase Auth redirect allow-list.",
    url: redirect.redirectUrl,
  });
  addCheck(checks, {
    id: "auth-google-authorize-url",
    label: "Google OAuth authorize URL",
    required: true,
    passed: Boolean(supabaseConfigured && redirect.passed && redirect.redirectUrl),
    detail:
      supabaseConfigured && redirect.passed && redirect.redirectUrl
        ? authAuthorizeUrl(values, redirect.redirectUrl)
        : "Supabase env or redirect URL missing",
    action: "Enable Google provider in Supabase Auth and verify this authorize URL starts the browser login flow.",
    url: supabaseConfigured && redirect.passed && redirect.redirectUrl ? authAuthorizeUrl(values, redirect.redirectUrl) : undefined,
  });

  await queryRows(values, fetcher, checks, {
    id: "backend-health",
    label: "Backend health view",
    path: "kickoff_backend_health?select=*&limit=1",
    action: "Apply supabase.schema.sql until kickoff_backend_health.ready is true.",
    validate: (rows) => {
      const row = rows[0];
      const problems = backendHealthProblems(row);
      return {
        passed: row && problems.length === 0,
        detail: row
          ? problems.length === 0
            ? `schema ${row.schema_version ?? "unknown"} ready with columns, leaderboard view columns and Storage policies`
            : `not ready: ${problems.join("; ")}`
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
  const modeIds = listEnv(values, "KICKOFF_VERIFY_MODE_IDS");
  const targetModeIds = modeIds;
  const modeProblem = modeTargetProblem(values);
  const userId = env(values, "KICKOFF_VERIFY_USER_ID");
  const friendCode = env(values, "KICKOFF_VERIFY_FRIEND_CODE");
  const seasonKey = env(values, "KICKOFF_VERIFY_SEASON_KEY");
  const recordShareImageUrl = env(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  const modeShareImageUrl = env(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL");
  const identityProblem = accountIdentityProblem(userId, profileId);
  const scopedTargetFilters = accountScopeFilters({ userId, friendCode, seasonKey });

  addCheck(checks, {
    id: "target-account-identity",
    label: "Target account identity",
    required: true,
    passed: !identityProblem,
    detail: identityProblem || `${userId} owns profile, records, modes and leaderboards`,
    action: "Use one signed-in Supabase user id for KICKOFF_VERIFY_USER_ID and KICKOFF_VERIFY_PROFILE_ID before seeding target rows.",
  });

  await Promise.all([
    addAuthTargetUserCheck(values, fetcher, checks, userId),
    addAuthProfileIdentityCheck(values, fetcher, checks, userId, profileId),
    queryRows(values, fetcher, checks, {
      id: "target-profile-row",
      label: "Target profile row",
      path: profileId
        ? `kickoff_profiles?select=id,email,display_name,location,friend_code,updated_at&id=eq.${encodeURIComponent(profileId)}&limit=1`
        : "kickoff_profiles?select=id&limit=1",
      action: "Sign in, sync profile, then set KICKOFF_VERIFY_PROFILE_ID to the Supabase user id.",
      validate: profileTargetValidator(profileId, friendCode),
    }),
    queryRows(values, fetcher, checks, {
      id: "target-record-row",
      label: "Target prediction row",
      path: proofId
        ? `kickoff_records?select=id,user_id,season_key,friend_code,total_score&id=eq.${encodeURIComponent(proofId)}${scopedTargetFilters}&limit=1`
        : "kickoff_records?select=id&limit=1",
      action: "Lock and sync one prediction capsule, then set KICKOFF_VERIFY_PROOF_ID.",
      validate: scopedTargetRowValidator(proofId, "prediction", { userId, friendCode, seasonKey }),
    }),
    queryRows(values, fetcher, checks, {
      id: "target-mode-row",
      label: "Target mode proof rows",
      path: !modeProblem
        ? `kickoff_mode_runs?select=id,user_id,mode_id,status,score,season_key,friend_code&id=in.(${inFilter(targetModeIds)})${scopedTargetFilters}&limit=${targetModeIds.length}`
        : "kickoff_mode_runs?select=id&limit=1",
      action: "Create and sync all required tournament mode proofs, then set KICKOFF_VERIFY_MODE_IDS.",
      validate: modeProblem
        ? () => ({ passed: false, detail: modeProblem, sampleIds: targetModeIds })
        : modeTargetRowsValidator(targetModeIds, { userId, friendCode, seasonKey }),
    }),
    queryRows(values, fetcher, checks, {
      id: "target-share-artifact-row",
      label: "Target record share artifact row",
      path: proofId
        ? `kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,image_url,image_hash,proof_url,image_mime,image_byte_length,generated_at&id=eq.${encodeURIComponent(proofId)}&kind=eq.record${scopedTargetFilters}&limit=1`
        : "kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,image_url,image_hash,image_mime,image_byte_length,generated_at&limit=1",
      action: "Generate a record share card, publish its PNG, sync the manifest, then set KICKOFF_VERIFY_PROOF_ID.",
      validate: shareArtifactValidator(
        proofId,
        "record",
        "record",
        recordShareImageUrl,
        expectedPublicProofUrl(values, "record", proofId),
        { userId, friendCode, seasonKey },
      ),
    }),
    queryRows(values, fetcher, checks, {
      id: "target-mode-share-artifact-row",
      label: "Target mode share artifact rows",
      path: !modeProblem
        ? `kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,image_url,image_hash,proof_url,image_mime,image_byte_length,generated_at&id=in.(${inFilter(targetModeIds)})&kind=eq.mode${scopedTargetFilters}&limit=${targetModeIds.length}`
        : "kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,image_url,image_hash,image_mime,image_byte_length,generated_at&limit=1",
      action: "Generate mode proof share cards, publish their PNGs, sync the manifests, then set KICKOFF_VERIFY_MODE_IDS.",
      validate: modeProblem
        ? () => ({ passed: false, detail: modeProblem, sampleIds: targetModeIds })
        : shareArtifactsValidator(
            targetModeIds,
            "mode",
            "mode",
            modeShareImageUrl,
            (id) => expectedPublicProofUrl(values, "mode", id),
            { userId, friendCode, seasonKey },
          ),
    }),
    queryRows(values, fetcher, checks, {
      id: "target-share-channel-row",
      label: "Target record share channel row",
      path: proofId
        ? `kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,proof_url,generated_at,x_intent_url,x_intent_opened_at,native_share_opened_at&id=eq.${encodeURIComponent(proofId)}&kind=eq.record${scopedTargetFilters}&limit=1`
        : "kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind&limit=1",
      action: "Open the X intent or native share for the record proof card, then sync kickoff_share_artifacts.",
      validate: shareChannelValidator(proofId, "record", "record", expectedPublicProofUrl(values, "record", proofId), {
        userId,
        friendCode,
        seasonKey,
      }),
    }),
    queryRows(values, fetcher, checks, {
      id: "target-mode-share-channel-row",
      label: "Target mode share channel rows",
      path: !modeProblem
        ? `kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind,proof_url,generated_at,x_intent_url,x_intent_opened_at,native_share_opened_at&id=in.(${inFilter(targetModeIds)})&kind=eq.mode${scopedTargetFilters}&limit=${targetModeIds.length}`
        : "kickoff_share_artifacts?select=id,user_id,season_key,friend_code,kind&limit=1",
      action: "Open the X intent or native share for every mode proof card, then sync kickoff_share_artifacts.",
      validate: modeProblem
        ? () => ({ passed: false, detail: modeProblem, sampleIds: targetModeIds })
        : shareChannelsValidator(targetModeIds, "mode", "mode", (id) => expectedPublicProofUrl(values, "mode", id), {
            userId,
            friendCode,
            seasonKey,
          }),
    }),
  ]);

  const leaderboardSelect =
    "select=id,display_name,location,friend_code,season_key,locks,revealed,average_score,best_score,xp,streak,exact_hits,verified_proofs,mode_proofs,global_rank,friend_rank,season_rank,rank,updated_at";
  const leaderboardOrder = "order=xp.desc";
  await Promise.all([
    queryRows(values, fetcher, checks, {
      id: "leaderboard-global-user",
      label: "Global leaderboard current user",
      path: userId
        ? `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&id=eq.${encodeURIComponent(userId)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&limit=1`,
      action: "Sync at least one record or mode proof so the current user appears in the global leaderboard.",
      validate: leaderboardValidator(userId, "global"),
    }),
    queryRows(values, fetcher, checks, {
      id: "leaderboard-friend-user",
      label: "Friend leaderboard current user",
      path: userId && friendCode
        ? `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&id=eq.${encodeURIComponent(userId)}&friend_code=eq.${encodeURIComponent(friendCode)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&limit=1`,
      action: "Set KICKOFF_VERIFY_FRIEND_CODE to the synced profile friend_code and confirm the current user appears in that scope.",
      validate: leaderboardValidator(userId && friendCode ? userId : "", "friend", { key: "friend_code", value: friendCode }),
    }),
    queryRows(values, fetcher, checks, {
      id: "leaderboard-season-user",
      label: "Season leaderboard current user",
      path: userId && seasonKey
        ? `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&id=eq.${encodeURIComponent(userId)}&season_key=eq.${encodeURIComponent(seasonKey)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&limit=1`,
      action: "Set KICKOFF_VERIFY_SEASON_KEY to the synced season and confirm the current user appears in that scope.",
      validate: leaderboardValidator(userId && seasonKey ? userId : "", "season", { key: "season_key", value: seasonKey }),
    }),
    queryRows(values, fetcher, checks, {
      id: "leaderboard-global-board",
      label: "Global leaderboard board rows",
      path: `kickoff_leaderboard?${leaderboardSelect}&order=global_rank.asc&limit=20`,
      action: "Read back the public global leaderboard board ordered by global_rank.",
      validate: leaderboardBoardValidator("global"),
    }),
    queryRows(values, fetcher, checks, {
      id: "leaderboard-friend-board",
      label: "Friend leaderboard board rows",
      path: friendCode
        ? `kickoff_leaderboard?${leaderboardSelect}&order=friend_rank.asc&friend_code=eq.${encodeURIComponent(friendCode)}&limit=20`
        : `kickoff_leaderboard?${leaderboardSelect}&order=friend_rank.asc&limit=20`,
      action: "Read back the public friend leaderboard board ordered by friend_rank with the configured friend_code.",
      validate: leaderboardBoardValidator("friend", { key: "friend_code", value: friendCode }),
    }),
    queryRows(values, fetcher, checks, {
      id: "leaderboard-season-board",
      label: "Season leaderboard board rows",
      path: seasonKey
        ? `kickoff_leaderboard?${leaderboardSelect}&order=season_rank.asc&season_key=eq.${encodeURIComponent(seasonKey)}&limit=20`
        : `kickoff_leaderboard?${leaderboardSelect}&order=season_rank.asc&limit=20`,
      action: "Read back the public season leaderboard board ordered by season_rank with the configured season_key.",
      validate: leaderboardBoardValidator("season", { key: "season_key", value: seasonKey }),
    }),
  ]);

  await Promise.all([
    addPublicShareImageCheck(values, fetcher, checks, {
      id: "public-share-image-read",
      label: "Public record share image read",
      envKey: "KICKOFF_VERIFY_SHARE_IMAGE_URL",
      action: "Publish a generated record PNG as a public HTTPS image and set KICKOFF_VERIFY_SHARE_IMAGE_URL.",
    }),
    addPublicShareImageCheck(values, fetcher, checks, {
      id: "public-mode-share-image-read",
      label: "Public mode share image read",
      envKey: "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      action: "Publish a generated mode PNG as a public HTTPS image and set KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL.",
    }),
  ]);

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
