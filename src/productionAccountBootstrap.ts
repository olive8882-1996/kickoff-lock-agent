import { parseEnvText } from "./productionEvidence";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { buildPublicUrl, evaluatePublicAuthRedirect, normalizePublicAppUrl } from "./publicUrls";
import { deployedSupabaseProjectUrlProblem } from "./supabaseStorageUrl";

export type ProductionAccountBootstrapCheck = {
  key:
    | "supabaseUrl"
    | "supabaseAnon"
    | "serviceRole"
    | "authRedirect"
    | "magicLink"
    | "googleOAuth"
    | "pkceOAuth"
    | "accountIdentity"
    | "user"
    | "profile"
    | "record"
    | "mode"
    | "cleanSessionProfile"
    | "cleanSessionProof"
    | "cleanSessionModes"
    | "friend"
    | "season"
    | "shareImage"
    | "modeShareImage";
  label: string;
  passed: boolean;
  detail: string;
};

export type ProductionAccountBootstrapQuery = {
  scope: "global" | "friend" | "season" | "profile" | "record" | "mode" | "shareArtifact";
  label: string;
  path: string;
  ready: boolean;
};

export type ProductionAccountBootstrapReadBackCommand = {
  label: string;
  scope:
    | ProductionAccountBootstrapQuery["scope"]
    | "auth-user"
    | "public-profile"
    | "public-proof"
    | "public-mode";
  path: string;
  url: string;
  authMode: "anon" | "service-role" | "public-page";
  targetIds: string[];
  expectedUserId?: string;
  expectedFriendCode?: string;
  expectedSeasonKey?: string;
  responseExpectation: {
    responseType: "supabase-array" | "supabase-auth-user" | "public-html";
    minRows?: number;
    targetIds: string[];
    requiredFields: string[];
    expectedUserId?: string;
    expectedFriendCode?: string;
    expectedSeasonKey?: string;
    expectedSource?: "cloud";
    requiresCleanSession?: boolean;
    pageKind?: "profile" | "proof" | "mode";
    queryParam?: "profile" | "proof" | "mode";
  };
  command: string;
  ready: boolean;
};

export type ProductionAccountBootstrapPacket = {
  ready: boolean;
  publicAppUrl?: string;
  missingTargets: string[];
  commands: string[];
  checks: ProductionAccountBootstrapCheck[];
  queries: ProductionAccountBootstrapQuery[];
  authReadBackCommand: ProductionAccountBootstrapReadBackCommand;
  readBackCommands: ProductionAccountBootstrapReadBackCommand[];
  cleanSessionReadBackCommands: ProductionAccountBootstrapReadBackCommand[];
  publicLinks: Array<{ label: string; url: string; ready: boolean }>;
  summary: string;
  nextAction: string;
  copyText: string;
};

const value = (values: Record<string, string | undefined>, key: string) => values[key]?.trim() ?? "";
const listValue = (values: Record<string, string | undefined>, key: string) =>
  value(values, key).split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
const encoded = (text: string) => encodeURIComponent(text);
const inFilter = (ids: string[]) => ids.map(encoded).join(",");
const filterParam = (key: string, item: string) => (item ? `&${key}=eq.${encoded(item)}` : "");
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
const googleAuthorizeUrl = (supabaseUrl: string, redirectUrl: string) => {
  const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectUrl);
  return url.toString();
};

const googlePkceAuthorizeUrl = (supabaseUrl: string, redirectUrl: string) => {
  const url = new URL(googleAuthorizeUrl(supabaseUrl, redirectUrl));
  url.searchParams.set("code_challenge", "<runtime-generated-s256-challenge>");
  url.searchParams.set("code_challenge_method", "s256");
  url.searchParams.set("state", "<runtime-generated-state>");
  return url.toString();
};

const magicLinkEndpoint = (supabaseUrl: string) => `${supabaseUrl.replace(/\/$/, "")}/auth/v1/otp`;
const supabaseRestUrl = (supabaseUrl: string, path: string) => `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
const anonymousReadBackCommand = (supabaseUrl: string, path: string) =>
  [
    "curl -sS",
    shellSingleQuote(supabaseRestUrl(supabaseUrl, path)),
    "-H",
    shellSingleQuote("apikey: $VITE_SUPABASE_ANON_KEY"),
    "-H",
    shellSingleQuote("Authorization: Bearer $VITE_SUPABASE_ANON_KEY"),
  ].join(" ");

const authAdminUserCommand = (supabaseUrl: string, userId: string) =>
  [
    "curl -sS",
    shellSingleQuote(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users/${encoded(userId)}`),
    "-H",
    shellSingleQuote("apikey: $SUPABASE_SERVICE_ROLE_KEY"),
    "-H",
    shellSingleQuote("Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"),
  ].join(" ");

const publicPageReadBackCommand = (url: string) => `curl -sS ${shellSingleQuote(url)}`;

const makePublicLink = (
  label: string,
  key: "profile" | "proof" | "mode",
  id: string,
  publicAppUrl: string | undefined,
) => ({
  label,
  url: id && publicAppUrl ? buildPublicUrl(key, id, publicAppUrl, publicAppUrl) : "",
  ready: Boolean(id && publicAppUrl),
});

const fields = (select: string) => select.split(",").map((field) => field.trim()).filter(Boolean);

const accountResponseExpectation = ({
  responseType,
  minRows,
  targetIds,
  requiredFields,
  expectedUserId,
  expectedFriendCode,
  expectedSeasonKey,
  expectedSource,
  requiresCleanSession,
  pageKind,
  queryParam,
}: ProductionAccountBootstrapReadBackCommand["responseExpectation"]): ProductionAccountBootstrapReadBackCommand["responseExpectation"] => ({
  responseType,
  minRows,
  targetIds,
  requiredFields,
  expectedUserId: expectedUserId || undefined,
  expectedFriendCode: expectedFriendCode || undefined,
  expectedSeasonKey: expectedSeasonKey || undefined,
  expectedSource,
  requiresCleanSession,
  pageKind,
  queryParam,
});

export const buildProductionAccountBootstrapPacket = ({
  envText,
  publicAppUrl,
  runtimeEnv = {},
}: {
  envText: string;
  publicAppUrl?: string | boolean;
  runtimeEnv?: Record<string, string | undefined>;
}): ProductionAccountBootstrapPacket => {
  const values = { ...runtimeEnv, ...parseEnvText(envText) };
  const normalizedPublicAppUrl = normalizePublicAppUrl(publicAppUrl);
  const supabaseUrl = value(values, "VITE_SUPABASE_URL");
  const supabaseAnonKey = value(values, "VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = value(values, "SUPABASE_SERVICE_ROLE_KEY");
  const userId = value(values, "KICKOFF_VERIFY_USER_ID");
  const profileId = value(values, "KICKOFF_VERIFY_PROFILE_ID");
  const proofId = value(values, "KICKOFF_VERIFY_PROOF_ID");
  const modeId = value(values, "KICKOFF_VERIFY_MODE_ID");
  const modeIds = listValue(values, "KICKOFF_VERIFY_MODE_IDS");
  const targetModeIds = modeIds;
  const friendCode = value(values, "KICKOFF_VERIFY_FRIEND_CODE");
  const seasonKey = value(values, "KICKOFF_VERIFY_SEASON_KEY") || "world-cup-run";
  const shareImageUrl = value(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL");
  const modeShareImageUrl = value(values, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL");
  const redirect = evaluatePublicAuthRedirect(value(values, "VITE_SUPABASE_REDIRECT_URL"), normalizedPublicAppUrl);
  const supabaseUrlIssue = deployedSupabaseProjectUrlProblem(supabaseUrl);
  const supabaseUrlReady = !supabaseUrlIssue;
  const shareImageProblem = shareImageUrl
    ? publicShareImageUrlProblem(shareImageUrl, "KICKOFF_VERIFY_SHARE_IMAGE_URL")
    : "KICKOFF_VERIFY_SHARE_IMAGE_URL missing";
  const modeShareImageProblem = modeShareImageUrl
    ? publicShareImageUrlProblem(modeShareImageUrl, "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL")
    : "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL missing";
  const scopedTargetReady = Boolean(userId && friendCode && seasonKey);
  const scopedTargetFilters = accountScopeFilters({ userId, friendCode, seasonKey });
  const publicLinks = [
    makePublicLink("Public profile", "profile", profileId, normalizedPublicAppUrl),
    makePublicLink("Prediction proof", "proof", proofId, normalizedPublicAppUrl),
    ...targetModeIds.map((targetModeId, index) =>
      makePublicLink(
        targetModeIds.length > 1 ? `Mode proof ${index + 1}` : "Mode proof",
        "mode",
        targetModeId,
        normalizedPublicAppUrl,
      ),
    ),
  ];
  const profilePublicLink = publicLinks.find((link) => link.label === "Public profile");
  const proofPublicLink = publicLinks.find((link) => link.label === "Prediction proof");
  const modePublicLinks = publicLinks.filter((link) => link.label.startsWith("Mode proof"));

  const checks: ProductionAccountBootstrapCheck[] = [
    {
      key: "supabaseUrl",
      label: "Supabase project URL",
      passed: supabaseUrlReady,
      detail: supabaseUrl
        ? supabaseUrlReady
          ? supabaseUrl
          : supabaseUrlIssue
        : "VITE_SUPABASE_URL missing",
    },
    {
      key: "supabaseAnon",
      label: "Supabase anon key",
      passed: Boolean(supabaseAnonKey),
      detail: supabaseAnonKey ? "configured" : "VITE_SUPABASE_ANON_KEY missing",
    },
    {
      key: "serviceRole",
      label: "Supabase service role",
      passed: Boolean(serviceRoleKey),
      detail: serviceRoleKey ? "configured for target seeding" : "SUPABASE_SERVICE_ROLE_KEY missing",
    },
    {
      key: "authRedirect",
      label: "Auth redirect URL",
      passed: redirect.passed,
      detail: redirect.detail,
    },
    {
      key: "googleOAuth",
      label: "Google OAuth authorize URL",
      passed: Boolean(supabaseUrlReady && supabaseAnonKey && redirect.passed && redirect.redirectUrl),
      detail:
        supabaseUrlReady && supabaseAnonKey && redirect.passed && redirect.redirectUrl
          ? googleAuthorizeUrl(supabaseUrl, redirect.redirectUrl)
          : "Supabase env or VITE_SUPABASE_REDIRECT_URL missing or not deployed",
    },
    {
      key: "pkceOAuth",
      label: "Google OAuth PKCE contract",
      passed: Boolean(supabaseUrlReady && supabaseAnonKey && redirect.passed && redirect.redirectUrl),
      detail:
        supabaseUrlReady && supabaseAnonKey && redirect.passed && redirect.redirectUrl
          ? googlePkceAuthorizeUrl(supabaseUrl, redirect.redirectUrl)
          : "Supabase env or VITE_SUPABASE_REDIRECT_URL missing or not deployed",
    },
    {
      key: "magicLink",
      label: "Magic link auth endpoint",
      passed: Boolean(supabaseUrlReady && supabaseAnonKey && redirect.passed && redirect.redirectUrl),
      detail:
        supabaseUrlReady && supabaseAnonKey && redirect.passed && redirect.redirectUrl
          ? `${magicLinkEndpoint(supabaseUrl)} redirects to ${redirect.redirectUrl}`
          : "Supabase env or VITE_SUPABASE_REDIRECT_URL missing or not deployed",
    },
    {
      key: "user",
      label: "Supabase user target",
      passed: Boolean(userId),
      detail: userId || "KICKOFF_VERIFY_USER_ID missing",
    },
    {
      key: "profile",
      label: "Public profile row",
      passed: Boolean(profileId),
      detail: profileId || "KICKOFF_VERIFY_PROFILE_ID missing",
    },
    {
      key: "accountIdentity",
      label: "Account identity alignment",
      passed: Boolean(userId && profileId && userId === profileId),
      detail:
        userId && profileId
          ? userId === profileId
            ? `${userId} owns profile, records, modes and leaderboards`
            : `KICKOFF_VERIFY_USER_ID (${userId}) must match KICKOFF_VERIFY_PROFILE_ID (${profileId})`
          : "KICKOFF_VERIFY_USER_ID and KICKOFF_VERIFY_PROFILE_ID must both be set",
    },
    {
      key: "record",
      label: "Prediction row",
      passed: Boolean(proofId),
      detail: proofId || "KICKOFF_VERIFY_PROOF_ID missing",
    },
    {
      key: "mode",
      label: "Mode proof rows",
      passed: targetModeIds.length >= requiredProductionModeIds.length,
      detail: targetModeIds.length >= requiredProductionModeIds.length
        ? targetModeIds.join(", ")
        : modeId
          ? `KICKOFF_VERIFY_MODE_IDS needs ${requiredProductionModeIds.length} mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough`
          : `KICKOFF_VERIFY_MODE_IDS needs ${requiredProductionModeIds.length} mode proof ids`,
    },
    {
      key: "cleanSessionProfile",
      label: "Clean-session profile URL",
      passed: Boolean(profilePublicLink?.ready),
      detail: profilePublicLink?.ready
        ? profilePublicLink.url
        : "Public profile link must open from a clean browser without localStorage.",
    },
    {
      key: "cleanSessionProof",
      label: "Clean-session proof URL",
      passed: Boolean(proofPublicLink?.ready),
      detail: proofPublicLink?.ready
        ? proofPublicLink.url
        : "Prediction proof link must open from a clean browser without localStorage.",
    },
    {
      key: "cleanSessionModes",
      label: "Clean-session mode URLs",
      passed:
        modePublicLinks.length >= requiredProductionModeIds.length &&
        modePublicLinks.every((link) => link.ready),
      detail:
        modePublicLinks.length >= requiredProductionModeIds.length && modePublicLinks.every((link) => link.ready)
          ? modePublicLinks.map((link) => link.url).join(", ")
          : `Need ${requiredProductionModeIds.length} public mode proof URLs that render without localStorage.`,
    },
    {
      key: "friend",
      label: "Friend leaderboard scope",
      passed: Boolean(friendCode),
      detail: friendCode || "KICKOFF_VERIFY_FRIEND_CODE missing",
    },
    {
      key: "season",
      label: "Season leaderboard scope",
      passed: Boolean(seasonKey),
      detail: seasonKey || "KICKOFF_VERIFY_SEASON_KEY missing",
    },
    {
      key: "shareImage",
      label: "Public share image",
      passed: !shareImageProblem,
      detail: shareImageProblem || shareImageUrl,
    },
    {
      key: "modeShareImage",
      label: "Public mode share image",
      passed: !modeShareImageProblem,
      detail: modeShareImageProblem || modeShareImageUrl,
    },
  ];

  const profileSelect = "id,email,display_name,location,friend_code,season_key,updated_at";
  const recordSelect = "id,user_id,season_key,friend_code,total_score";
  const modeSelect = "id,user_id,mode_id,status,score,season_key,friend_code";
  const shareArtifactSelect = "id,user_id,season_key,friend_code,kind,image_url,image_hash,proof_url";
  const leaderboardSelect =
    "select=id,display_name,location,friend_code,season_key,locks,revealed,average_score,best_score,xp,streak,exact_hits,verified_proofs,mode_proofs,global_rank,friend_rank,season_rank,rank,updated_at";
  const leaderboardFields = fields(leaderboardSelect.replace(/^select=/, ""));
  const leaderboardOrder = "order=xp.desc";
  const queries: ProductionAccountBootstrapQuery[] = [
    {
      scope: "profile",
      label: "Profile row",
      ready: Boolean(profileId && userId && profileId === userId),
      path: profileId
        ? `kickoff_profiles?select=${profileSelect}&id=eq.${encoded(profileId)}&limit=1`
        : "kickoff_profiles?select=id&limit=1",
    },
    {
      scope: "record",
      label: "Prediction row",
      ready: Boolean(proofId && scopedTargetReady),
      path: proofId
        ? `kickoff_records?select=${recordSelect}&id=eq.${encoded(proofId)}${scopedTargetFilters}&limit=1`
        : "kickoff_records?select=id&limit=1",
    },
    {
      scope: "mode",
      label: "Mode proof rows",
      ready: targetModeIds.length >= requiredProductionModeIds.length && scopedTargetReady,
      path: targetModeIds.length >= requiredProductionModeIds.length
        ? `kickoff_mode_runs?select=${modeSelect}&id=in.(${inFilter(targetModeIds)})${scopedTargetFilters}&limit=${targetModeIds.length}`
        : "kickoff_mode_runs?select=id&limit=1",
    },
    {
      scope: "shareArtifact",
      label: "Record share artifact row",
      ready: Boolean(proofId && scopedTargetReady),
      path: proofId
        ? `kickoff_share_artifacts?select=${shareArtifactSelect}&id=eq.${encoded(proofId)}&kind=eq.record${scopedTargetFilters}&limit=1`
        : "kickoff_share_artifacts?select=id,kind&limit=1",
    },
    {
      scope: "shareArtifact",
      label: "Mode share artifact rows",
      ready: targetModeIds.length >= requiredProductionModeIds.length && scopedTargetReady,
      path: targetModeIds.length >= requiredProductionModeIds.length
        ? `kickoff_share_artifacts?select=${shareArtifactSelect}&id=in.(${inFilter(targetModeIds)})&kind=eq.mode${scopedTargetFilters}&limit=${targetModeIds.length}`
        : "kickoff_share_artifacts?select=id,kind&limit=1",
    },
    {
      scope: "global",
      label: "Global leaderboard",
      ready: Boolean(userId),
      path: userId
        ? `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&id=eq.${encoded(userId)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&limit=1`,
    },
    {
      scope: "friend",
      label: "Friend leaderboard",
      ready: Boolean(userId && friendCode),
      path:
        userId && friendCode
          ? `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&id=eq.${encoded(userId)}&friend_code=eq.${encoded(friendCode)}&limit=1`
          : `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&limit=1`,
    },
    {
      scope: "season",
      label: "Season leaderboard",
      ready: Boolean(userId && seasonKey),
      path:
        userId && seasonKey
          ? `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&id=eq.${encoded(userId)}&season_key=eq.${encoded(seasonKey)}&limit=1`
          : `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&limit=1`,
    },
  ];

  const missingTargets = checks.filter((check) => !check.passed).map((check) => check.label);
  if (!normalizedPublicAppUrl) missingTargets.push("VITE_PUBLIC_APP_URL");
  const ready = missingTargets.length === 0 && queries.every((query) => query.ready) && publicLinks.every((link) => link.ready);
  const targetIdsForQuery = (query: ProductionAccountBootstrapQuery) => {
    if (query.label === "Profile row") return profileId ? [profileId] : [];
    if (query.label === "Prediction row") return proofId ? [proofId] : [];
    if (query.label === "Mode proof rows") return targetModeIds;
    if (query.label === "Record share artifact row") return proofId ? [proofId] : [];
    if (query.label === "Mode share artifact rows") return targetModeIds;
    return userId ? [userId] : [];
  };
  const requiredFieldsForQuery = (query: ProductionAccountBootstrapQuery) => {
    if (query.label === "Profile row") return fields(profileSelect);
    if (query.label === "Prediction row") return fields(recordSelect);
    if (query.label === "Mode proof rows") return fields(modeSelect);
    if (query.label === "Record share artifact row" || query.label === "Mode share artifact rows") return fields(shareArtifactSelect);
    return leaderboardFields;
  };
  const minRowsForQuery = (query: ProductionAccountBootstrapQuery) =>
    query.label === "Mode proof rows" || query.label === "Mode share artifact rows" ? targetModeIds.length : 1;
  const readBackCommands = queries.map<ProductionAccountBootstrapReadBackCommand>((query) => {
    const url = supabaseUrlReady && supabaseAnonKey ? supabaseRestUrl(supabaseUrl, query.path) : "";
    const targetIds = targetIdsForQuery(query);
    return {
      label: query.label,
      scope: query.scope,
      path: query.path,
      url,
      authMode: "anon",
      targetIds,
      expectedUserId: userId || undefined,
      expectedFriendCode: friendCode || undefined,
      expectedSeasonKey: seasonKey || undefined,
      responseExpectation: accountResponseExpectation({
        responseType: "supabase-array",
        minRows: minRowsForQuery(query),
        targetIds,
        requiredFields: requiredFieldsForQuery(query),
        expectedUserId: userId,
        expectedFriendCode: query.scope === "friend" || query.scope === "record" || query.scope === "mode" || query.scope === "shareArtifact" ? friendCode : undefined,
        expectedSeasonKey: query.scope === "season" || query.scope === "record" || query.scope === "mode" || query.scope === "shareArtifact" ? seasonKey : undefined,
        expectedSource: "cloud",
      }),
      ready: Boolean(query.ready && supabaseUrlReady && supabaseAnonKey),
      command:
        supabaseUrlReady && supabaseAnonKey
          ? anonymousReadBackCommand(supabaseUrl, query.path)
          : `Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before reading ${query.path}`,
    };
  });
  const authUrl = supabaseUrlReady && userId ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users/${encoded(userId)}` : "";
  const authReadBackCommand: ProductionAccountBootstrapReadBackCommand = {
    label: "Auth admin user",
    scope: "auth-user",
    path: userId ? `auth/v1/admin/users/${encoded(userId)}` : "auth/v1/admin/users/:id",
    url: authUrl,
    authMode: "service-role",
    targetIds: userId ? [userId] : [],
    expectedUserId: userId || undefined,
    responseExpectation: accountResponseExpectation({
      responseType: "supabase-auth-user",
      targetIds: userId ? [userId] : [],
      requiredFields: ["id", "email"],
      expectedUserId: userId,
      expectedSource: "cloud",
    }),
    ready: Boolean(supabaseUrlReady && serviceRoleKey && userId),
    command:
      supabaseUrlReady && userId
        ? authAdminUserCommand(supabaseUrl, userId)
        : "Set VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and KICKOFF_VERIFY_USER_ID before reading the Auth user.",
  };
  const cleanSessionReadBackCommands = publicLinks.map<ProductionAccountBootstrapReadBackCommand>((link) => {
    const scope =
      link.label === "Public profile"
        ? "public-profile"
        : link.label === "Prediction proof"
          ? "public-proof"
          : "public-mode";
    const queryParam = scope === "public-profile" ? "profile" : scope === "public-proof" ? "proof" : "mode";
    const pageKind = queryParam;
    const targetId = link.url ? new URL(link.url).searchParams.get(queryParam) ?? "" : "";
    return {
      label: `Clean-session ${link.label}`,
      scope,
      path: link.url ? new URL(link.url).pathname + new URL(link.url).search : "",
      url: link.url,
      authMode: "public-page",
      targetIds: targetId ? [targetId] : [],
      expectedUserId: userId || undefined,
      responseExpectation: accountResponseExpectation({
        responseType: "public-html",
        targetIds: targetId ? [targetId] : [],
        requiredFields: ["canonical-url", "social-metadata", "share-image", "cloud-record"],
        expectedUserId: userId,
        expectedSource: "cloud",
        requiresCleanSession: true,
        pageKind,
        queryParam,
      }),
      ready: link.ready,
      command: link.ready ? publicPageReadBackCommand(link.url) : `Set VITE_PUBLIC_APP_URL and target id before opening ${link.label}.`,
    };
  });
  const commands = [
    "bun run share:production-image",
    "bun run runtime:config:check",
    "bun run seed:production-targets --upload-share-image --upload-mode-share-image",
    "bun run doctor:supabase",
    "bun run verify:production",
  ];
  const nextAction = ready
    ? "Run the production seed command, then verify Supabase read-back and public proof pages."
    : `Fill ${missingTargets[0] ?? "production targets"} in .env.production.local, then rerun seed:production-targets.`;
  const summary = `${checks.filter((check) => check.passed).length}/${checks.length} account targets filled · ${queries.filter((query) => query.ready).length}/${queries.length} Supabase queries ready · ${publicLinks.filter((link) => link.ready).length}/${publicLinks.length} public links ready.`;
  const copyText = [
    "Kickoff Lock Agent production account bootstrap",
    `Ready: ${ready ? "yes" : "no"}`,
    `Public app: ${normalizedPublicAppUrl ?? "missing"}`,
    `Summary: ${summary}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Supabase read-back queries:",
    ...queries.map((query) => `- ${query.label}: ${query.path}`),
    "Supabase Auth admin read-back command:",
    `- ${authReadBackCommand.label}: ${authReadBackCommand.command}`,
    "Supabase anonymous read-back commands:",
    ...readBackCommands.map((item) => `- ${item.label}: ${item.command}`),
    "Clean-session public page read-back commands:",
    ...cleanSessionReadBackCommands.map((item) => `- ${item.label}: ${item.command}`),
    "Public links:",
    ...publicLinks.map((link) => `- ${link.label}: ${link.url || "missing"}`),
  ].join("\n");

  return {
    ready,
    publicAppUrl: normalizedPublicAppUrl,
    missingTargets,
    commands,
    checks,
    queries,
    authReadBackCommand,
    readBackCommands,
    cleanSessionReadBackCommands,
    publicLinks,
    summary,
    nextAction,
    copyText,
  };
};
