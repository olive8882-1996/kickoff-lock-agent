export type ProductionEvidenceCategory =
  | "runtime"
  | "public-app"
  | "supabase"
  | "data"
  | "filecoin"
  | "sharing";

export type ProductionEvidenceStatus = "passed" | "failed" | "warning" | "skipped";

export type ProductionEvidenceCheck = {
  id: string;
  category: ProductionEvidenceCategory;
  label: string;
  required: boolean;
  status: ProductionEvidenceStatus;
  detail: string;
  checkedAt: string;
  url?: string;
  action?: string;
  sampleIds?: string[];
};

export type ProductionEvidencePacket = {
  generatedAt: string;
  source: "local-script" | "ci" | "manual";
  strict: boolean;
  envFiles?: string[];
  checks: ProductionEvidenceCheck[];
};

export type ProductionVerifyTargets = {
  userId?: string;
  profileId?: string;
  proofId?: string;
  modeId?: string;
  friendCode?: string;
  seasonKey?: string;
  fixtureId?: string;
  shareImageUrl?: string;
  allowFailures?: boolean;
};

export const productionFriendCode = (location?: string, email?: string) =>
  (location || email?.split("@")[1] || "global")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "global";

const envValue = (value?: string | boolean) => {
  if (typeof value === "boolean") return value ? "1" : "0";
  const text = value ?? "";
  return /^[A-Za-z0-9_./:@-]*$/.test(text) ? text : JSON.stringify(text);
};

export const buildProductionVerifyEnv = (targets: ProductionVerifyTargets) => {
  const values: Array<[string, string | boolean | undefined]> = [
    ["KICKOFF_VERIFY_USER_ID", targets.userId],
    ["KICKOFF_VERIFY_PROFILE_ID", targets.profileId],
    ["KICKOFF_VERIFY_PROOF_ID", targets.proofId],
    ["KICKOFF_VERIFY_MODE_ID", targets.modeId],
    ["KICKOFF_VERIFY_FRIEND_CODE", targets.friendCode],
    ["KICKOFF_VERIFY_SEASON_KEY", targets.seasonKey ?? "world-cup-run"],
    ["KICKOFF_VERIFY_FIXTURE_ID", targets.fixtureId],
    ["KICKOFF_VERIFY_SHARE_IMAGE_URL", targets.shareImageUrl],
    ["KICKOFF_VERIFY_ALLOW_FAILURES", targets.allowFailures ?? true],
  ];
  return `${values.map(([key, value]) => `${key}=${envValue(value)}`).join("\n")}\n`;
};

export const parseEnvText = (text: string) => {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    const rawValue = normalized.slice(separator + 1).trim();
    const quoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));
    const value = quoted ? rawValue.slice(1, -1) : rawValue.replace(/\s+#.*$/, "").trim();
    values[key] = value;
  }
  return values;
};

export const productionCheckPassed = (check: ProductionEvidenceCheck) => check.status === "passed";

export const summarizeProductionEvidence = (packet?: ProductionEvidencePacket) => {
  const checks = packet?.checks ?? [];
  const required = checks.filter((check) => check.required);
  const optional = checks.filter((check) => !check.required);
  const requiredPassed = required.filter(productionCheckPassed).length;
  const optionalPassed = optional.filter(productionCheckPassed).length;
  const failedRequired = required.filter((check) => check.status === "failed");
  const openRequired = required.filter((check) => check.status !== "passed");
  return {
    generatedAt: packet?.generatedAt,
    loaded: Boolean(packet),
    requiredPassed,
    requiredTotal: required.length,
    optionalPassed,
    optionalTotal: optional.length,
    failedRequired,
    openRequired,
    complete: required.length > 0 && requiredPassed === required.length,
  };
};
