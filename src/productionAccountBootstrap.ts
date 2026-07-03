import { parseEnvText } from "./productionEvidence";
import { buildPublicUrl, normalizePublicAppUrl } from "./publicUrls";

export type ProductionAccountBootstrapCheck = {
  key: "user" | "profile" | "record" | "mode" | "friend" | "season" | "shareImage";
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

export type ProductionAccountBootstrapPacket = {
  ready: boolean;
  publicAppUrl?: string;
  missingTargets: string[];
  commands: string[];
  checks: ProductionAccountBootstrapCheck[];
  queries: ProductionAccountBootstrapQuery[];
  publicLinks: Array<{ label: string; url: string; ready: boolean }>;
  summary: string;
  nextAction: string;
  copyText: string;
};

const value = (values: Record<string, string>, key: string) => values[key]?.trim() ?? "";
const encoded = (text: string) => encodeURIComponent(text);

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

export const buildProductionAccountBootstrapPacket = ({
  envText,
  publicAppUrl,
}: {
  envText: string;
  publicAppUrl?: string | boolean;
}): ProductionAccountBootstrapPacket => {
  const values = parseEnvText(envText);
  const normalizedPublicAppUrl = normalizePublicAppUrl(publicAppUrl);
  const userId = value(values, "KICKOFF_VERIFY_USER_ID");
  const profileId = value(values, "KICKOFF_VERIFY_PROFILE_ID");
  const proofId = value(values, "KICKOFF_VERIFY_PROOF_ID");
  const modeId = value(values, "KICKOFF_VERIFY_MODE_ID");
  const friendCode = value(values, "KICKOFF_VERIFY_FRIEND_CODE");
  const seasonKey = value(values, "KICKOFF_VERIFY_SEASON_KEY") || "world-cup-run";
  const shareImageUrl = value(values, "KICKOFF_VERIFY_SHARE_IMAGE_URL");

  const checks: ProductionAccountBootstrapCheck[] = [
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
      key: "record",
      label: "Prediction row",
      passed: Boolean(proofId),
      detail: proofId || "KICKOFF_VERIFY_PROOF_ID missing",
    },
    {
      key: "mode",
      label: "Mode proof row",
      passed: Boolean(modeId),
      detail: modeId || "KICKOFF_VERIFY_MODE_ID missing",
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
      passed: Boolean(shareImageUrl && shareImageUrl.startsWith("https://")),
      detail: shareImageUrl || "KICKOFF_VERIFY_SHARE_IMAGE_URL missing",
    },
  ];

  const leaderboardSelect = "select=id,friend_code,season_key,xp,verified_proofs,mode_proofs";
  const queries: ProductionAccountBootstrapQuery[] = [
    {
      scope: "profile",
      label: "Profile row",
      ready: Boolean(profileId),
      path: profileId
        ? `kickoff_profiles?select=id,friend_code,updated_at&id=eq.${encoded(profileId)}&limit=1`
        : "kickoff_profiles?select=id&limit=1",
    },
    {
      scope: "record",
      label: "Prediction row",
      ready: Boolean(proofId),
      path: proofId
        ? `kickoff_records?select=id,user_id,season_key,friend_code,total_score&id=eq.${encoded(proofId)}&limit=1`
        : "kickoff_records?select=id&limit=1",
    },
    {
      scope: "mode",
      label: "Mode proof row",
      ready: Boolean(modeId),
      path: modeId
        ? `kickoff_mode_runs?select=id,user_id,mode_id,status,score&id=eq.${encoded(modeId)}&limit=1`
        : "kickoff_mode_runs?select=id&limit=1",
    },
    {
      scope: "shareArtifact",
      label: "Share artifact row",
      ready: Boolean(proofId),
      path: proofId
        ? `kickoff_share_artifacts?select=id,kind,image_url,image_hash,proof_url&id=eq.${encoded(proofId)}&kind=eq.record&limit=1`
        : "kickoff_share_artifacts?select=id,kind&limit=1",
    },
    {
      scope: "global",
      label: "Global leaderboard",
      ready: Boolean(userId),
      path: userId
        ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encoded(userId)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
    },
    {
      scope: "friend",
      label: "Friend leaderboard",
      ready: Boolean(userId && friendCode),
      path:
        userId && friendCode
          ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encoded(userId)}&friend_code=eq.${encoded(friendCode)}&limit=1`
          : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
    },
    {
      scope: "season",
      label: "Season leaderboard",
      ready: Boolean(userId && seasonKey),
      path:
        userId && seasonKey
          ? `kickoff_leaderboard?${leaderboardSelect}&id=eq.${encoded(userId)}&season_key=eq.${encoded(seasonKey)}&limit=1`
          : `kickoff_leaderboard?${leaderboardSelect}&limit=1`,
    },
  ];

  const publicLinks = [
    makePublicLink("Public profile", "profile", profileId, normalizedPublicAppUrl),
    makePublicLink("Prediction proof", "proof", proofId, normalizedPublicAppUrl),
    makePublicLink("Mode proof", "mode", modeId, normalizedPublicAppUrl),
  ];
  const missingTargets = checks.filter((check) => !check.passed).map((check) => check.label);
  if (!normalizedPublicAppUrl) missingTargets.push("VITE_PUBLIC_APP_URL");
  const ready = missingTargets.length === 0 && queries.every((query) => query.ready) && publicLinks.every((link) => link.ready);
  const commands = [
    "bun run share:production-image",
    "bun run seed:production-targets --upload-share-image",
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
    publicLinks,
    summary,
    nextAction,
    copyText,
  };
};
