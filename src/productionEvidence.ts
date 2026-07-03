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
  filecoinRecordCid?: string;
  filecoinRecordPayloadHash?: string;
  filecoinModeCid?: string;
  filecoinModePayloadHash?: string;
  friendCode?: string;
  seasonKey?: string;
  fixtureId?: string;
  shareImageUrl?: string;
  allowFailures?: boolean;
};

export const PRODUCTION_VERIFY_ENV_KEYS = [
  "KICKOFF_VERIFY_USER_ID",
  "KICKOFF_VERIFY_PROFILE_ID",
  "KICKOFF_VERIFY_PROOF_ID",
  "KICKOFF_VERIFY_MODE_ID",
  "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
  "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
  "KICKOFF_VERIFY_FILECOIN_MODE_CID",
  "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH",
  "KICKOFF_VERIFY_FRIEND_CODE",
  "KICKOFF_VERIFY_SEASON_KEY",
  "KICKOFF_VERIFY_FIXTURE_ID",
  "KICKOFF_VERIFY_SHARE_IMAGE_URL",
  "KICKOFF_VERIFY_ALLOW_FAILURES",
] as const;

export type ProductionVerifyEnvKey = (typeof PRODUCTION_VERIFY_ENV_KEYS)[number];

export type ProductionVerifyEnvMergeResult = {
  values: Record<ProductionVerifyEnvKey, string>;
  text: string;
  presentKeys: ProductionVerifyEnvKey[];
  missingKeys: ProductionVerifyEnvKey[];
};

export type PublicRenderKind = "profile" | "proof" | "mode";

export type PublicRenderExpectation = {
  kind: PublicRenderKind;
  queryKey: PublicRenderKind;
  targetId: string;
  requiredText: string[];
  forbiddenText: string[];
};

export const publicRenderExpectation = (
  kind: PublicRenderKind,
  targetId: string,
): PublicRenderExpectation => {
  if (kind === "profile") {
    return {
      kind,
      queryKey: "profile",
      targetId,
      requiredText: ["Latest proof capsules", "Tournament mode runs", "Social metadata", "share cards"],
      forbiddenText: ["Profile unavailable", "needs share card"],
    };
  }
  if (kind === "mode") {
    return {
      kind,
      queryKey: "mode",
      targetId,
      requiredText: ["Mode proof verification", "Mode proof facts", "Social metadata", targetId],
      forbiddenText: ["No share manifest yet", "Cloud mode proof loaded. No share manifest"],
    };
  }
  return {
    kind,
    queryKey: "proof",
    targetId,
    requiredText: ["Proof verification", "Proof facts", "Social metadata", "Prediction", targetId],
    forbiddenText: ["No share manifest yet", "Cloud proof loaded. No share manifest"],
  };
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
  const values: Array<[ProductionVerifyEnvKey, string | boolean | undefined]> = [
    ["KICKOFF_VERIFY_USER_ID", targets.userId],
    ["KICKOFF_VERIFY_PROFILE_ID", targets.profileId],
    ["KICKOFF_VERIFY_PROOF_ID", targets.proofId],
    ["KICKOFF_VERIFY_MODE_ID", targets.modeId],
    ["KICKOFF_VERIFY_FILECOIN_RECORD_CID", targets.filecoinRecordCid],
    ["KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH", targets.filecoinRecordPayloadHash],
    ["KICKOFF_VERIFY_FILECOIN_MODE_CID", targets.filecoinModeCid],
    ["KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH", targets.filecoinModePayloadHash],
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

export const mergeProductionVerifyEnv = (
  envBlocks: string[],
  baseValues: Record<string, string | undefined> = {},
): ProductionVerifyEnvMergeResult => {
  const values = PRODUCTION_VERIFY_ENV_KEYS.reduce(
    (acc, key) => {
      acc[key] = baseValues[key]?.trim() ?? "";
      return acc;
    },
    {} as Record<ProductionVerifyEnvKey, string>,
  );

  for (const block of envBlocks) {
    const parsed = parseEnvText(block);
    for (const key of PRODUCTION_VERIFY_ENV_KEYS) {
      const value = parsed[key]?.trim();
      if (value) values[key] = value;
      else if (!(key in values)) values[key] = "";
    }
  }

  if (!values.KICKOFF_VERIFY_SEASON_KEY) values.KICKOFF_VERIFY_SEASON_KEY = "world-cup-run";
  if (!values.KICKOFF_VERIFY_ALLOW_FAILURES) values.KICKOFF_VERIFY_ALLOW_FAILURES = "1";

  const presentKeys = PRODUCTION_VERIFY_ENV_KEYS.filter((key) => values[key]);
  const missingKeys = PRODUCTION_VERIFY_ENV_KEYS.filter((key) => !values[key]);
  const text = `${PRODUCTION_VERIFY_ENV_KEYS.map((key) => `${key}=${envValue(values[key])}`).join("\n")}\n`;
  return { values, text, presentKeys, missingKeys };
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
