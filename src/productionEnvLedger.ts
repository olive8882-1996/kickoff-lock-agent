import {
  PRODUCTION_VERIFY_ENV_KEYS,
  parseEnvText,
  type ProductionVerifyEnvKey,
} from "./productionEvidence";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";

export type ProductionEnvLedgerStatus = "filled" | "missing" | "optional" | "invalid";

export type ProductionEnvLedgerGroup =
  | "account"
  | "modes"
  | "filecoin"
  | "data"
  | "sharing"
  | "control";

export type ProductionEnvLedgerRow = {
  key: ProductionVerifyEnvKey;
  label: string;
  group: ProductionEnvLedgerGroup;
  required: boolean;
  status: ProductionEnvLedgerStatus;
  valuePreview: string;
  command: string;
  action: string;
};

export type ProductionEnvLedgerPacket = {
  ready: boolean;
  filled: number;
  total: number;
  requiredFilled: number;
  requiredTotal: number;
  missingRequiredKeys: ProductionVerifyEnvKey[];
  groups: Array<{
    group: ProductionEnvLedgerGroup;
    label: string;
    filled: number;
    total: number;
    ready: boolean;
  }>;
  rows: ProductionEnvLedgerRow[];
  nextAction: string;
  copyText: string;
};

const groupLabels: Record<ProductionEnvLedgerGroup, string> = {
  account: "Account cloud",
  modes: "Mode targets",
  filecoin: "Filecoin seals",
  data: "Realtime data",
  sharing: "Public sharing",
  control: "Verification control",
};

const meta: Record<ProductionVerifyEnvKey, Omit<ProductionEnvLedgerRow, "required" | "status" | "valuePreview">> = {
  KICKOFF_VERIFY_USER_ID: {
    key: "KICKOFF_VERIFY_USER_ID",
    label: "Synced user id",
    group: "account",
    command: "bun run seed:production-targets",
    action: "Sync or seed a production Supabase user and leaderboard row.",
  },
  KICKOFF_VERIFY_PROFILE_ID: {
    key: "KICKOFF_VERIFY_PROFILE_ID",
    label: "Public profile id",
    group: "account",
    command: "bun run seed:production-targets",
    action: "Publish a profile row that public profile pages can read back.",
  },
  KICKOFF_VERIFY_PUBLIC_PROFILE_URL: {
    key: "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
    label: "Public profile URL",
    group: "account",
    command: "bun run seed:production-targets",
    action: "Use the deployed HTTPS public profile URL for clean-session account restore.",
  },
  KICKOFF_VERIFY_PROOF_ID: {
    key: "KICKOFF_VERIFY_PROOF_ID",
    label: "Prediction proof id",
    group: "account",
    command: "bun run seed:production-targets",
    action: "Lock and sync one prediction capsule to Supabase.",
  },
  KICKOFF_VERIFY_MODE_ID: {
    key: "KICKOFF_VERIFY_MODE_ID",
    label: "Primary mode proof id",
    group: "modes",
    command: "bun run seed:production-targets",
    action: "Create at least one synced tournament mode proof.",
  },
  KICKOFF_VERIFY_MODE_IDS: {
    key: "KICKOFF_VERIFY_MODE_IDS",
    label: "All required mode proof ids",
    group: "modes",
    command: "bun run seed:production-targets",
    action: "Create bracket, parlay, Agent vs Human, upset and group path proof runs.",
  },
  KICKOFF_VERIFY_SHARE_ARTIFACT_IDS: {
    key: "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
    label: "Share artifact ids",
    group: "sharing",
    command: "bun run seed:production-targets",
    action: "Sync record and mode share-card manifests so public cards can be read back by id.",
  },
  KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID: {
    key: "KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID",
    label: "Record seal job id",
    group: "filecoin",
    command: "bun run seal:production-targets",
    action: "Copy the async upload job id returned by the production record seal.",
  },
  KICKOFF_VERIFY_FILECOIN_RECORD_CID: {
    key: "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
    label: "Record proof CID",
    group: "filecoin",
    command: "bun run seal:production-targets",
    action: "Seal one prediction capsule through the production seal API.",
  },
  KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: {
    key: "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
    label: "Record payload hash",
    group: "filecoin",
    command: "bun run seal:production-targets",
    action: "Copy the sealed prediction payload hash returned by the seal target report.",
  },
  KICKOFF_VERIFY_FILECOIN_MODE_CID: {
    key: "KICKOFF_VERIFY_FILECOIN_MODE_CID",
    label: "Primary mode proof CID",
    group: "filecoin",
    command: "bun run seal:production-targets",
    action: "Seal at least one mode proof if multi-mode CIDs are not available yet.",
  },
  KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS: {
    key: "KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS",
    label: "All required mode seal job ids",
    group: "filecoin",
    command: "bun run seal:production-targets",
    action: "Merge the async upload job id list from every required mode seal.",
  },
  KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH: {
    key: "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH",
    label: "Primary mode payload hash",
    group: "filecoin",
    command: "bun run seal:production-targets",
    action: "Copy the primary sealed mode payload hash.",
  },
  KICKOFF_VERIFY_FILECOIN_MODE_CIDS: {
    key: "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
    label: "All required mode CIDs",
    group: "filecoin",
    command: "bun run seal:production-targets",
    action: "Seal every required tournament mode proof and merge the CID list.",
  },
  KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: {
    key: "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
    label: "All required mode payload hashes",
    group: "filecoin",
    command: "bun run seal:production-targets",
    action: "Merge the payload hash list from the mode seal report.",
  },
  KICKOFF_VERIFY_FRIEND_CODE: {
    key: "KICKOFF_VERIFY_FRIEND_CODE",
    label: "Friend leaderboard code",
    group: "account",
    command: "bun run seed:production-targets",
    action: "Use the synced profile friend code for the friend leaderboard scope.",
  },
  KICKOFF_VERIFY_SEASON_KEY: {
    key: "KICKOFF_VERIFY_SEASON_KEY",
    label: "Season leaderboard key",
    group: "account",
    command: "bun run seed:production-targets",
    action: "Use the production season key for the season leaderboard scope.",
  },
  KICKOFF_VERIFY_LEADERBOARD_SCOPES: {
    key: "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
    label: "Leaderboard scopes",
    group: "account",
    command: "bun run leaderboard:bootstrap",
    action: "Verify current-user read-back for global, friend and season leaderboard scopes.",
  },
  KICKOFF_VERIFY_FIXTURE_ID: {
    key: "KICKOFF_VERIFY_FIXTURE_ID",
    label: "Primary fixture id",
    group: "data",
    command: "bun run scout:data-targets",
    action: "Scout a World Cup fixture with lineups, injuries, odds and standings.",
  },
  KICKOFF_VERIFY_FIXTURE_IDS: {
    key: "KICKOFF_VERIFY_FIXTURE_IDS",
    label: "Fixture id list",
    group: "data",
    command: "bun run scout:data-targets",
    action: "Merge target fixture ids returned by the data scout.",
  },
  KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX: {
    key: "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
    label: "Fixture signal matrix",
    group: "data",
    command: "bun run scout:data-targets",
    action: "Use the scout output showing lineups, injuries, odds and standings rows for every target fixture.",
  },
  KICKOFF_VERIFY_SHARE_IMAGE_URL: {
    key: "KICKOFF_VERIFY_SHARE_IMAGE_URL",
    label: "Record share image URL",
    group: "sharing",
    command: "bun run share:upload-image",
    action: "Publish the generated record PNG/JPEG/WebP at a public HTTPS URL and sync that URL into share artifacts.",
  },
  KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: {
    key: "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
    label: "Mode share image URL",
    group: "sharing",
    command: "bun run share:upload-image -- --kind=mode",
    action: "Publish the generated mode PNG/JPEG/WebP at a public HTTPS URL and sync that URL into mode share artifacts.",
  },
  KICKOFF_VERIFY_ALLOW_FAILURES: {
    key: "KICKOFF_VERIFY_ALLOW_FAILURES",
    label: "Allow failures flag",
    group: "control",
    command: "bun run verify:production",
    action: "Keep as 1 while collecting targets; remove for final strict verification.",
  },
};

const has = (values: Record<string, string>, key: ProductionVerifyEnvKey) => Boolean(values[key]?.trim());

const list = (values: Record<string, string>, key: ProductionVerifyEnvKey) =>
  (values[key] ?? "").split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const validSha256 = (value: string) => /^[a-f0-9]{64}$/i.test(value);
const requiredFixtureSignals = ["lineups", "injuries", "odds", "standings"];
const requiredFixtureSignalRows = (signal: string) => (signal === "standings" || signal === "lineups" ? 2 : 1);
const requiredLeaderboardScopes = ["global", "friend", "season"];

const publicHttpsUrlProblem = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "must be an HTTPS URL";
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname) || url.hostname.endsWith(".localhost")) {
      return "must be a deployed URL, not localhost";
    }
    return "";
  } catch {
    return "must be a valid URL";
  }
};

const parseFixtureSignalMatrix = (value: string) =>
  value
    .split(/[,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [fixtureId = "", signalText = ""] = entry.split(":");
      const signals = Object.fromEntries(
        signalText
          .split("|")
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => {
            const [key = "", rows = "0"] = item.split("=");
            return [key.trim(), Number(rows)];
          }),
      );
      return { fixtureId: fixtureId.trim(), signals };
    });

const requiredFor = (values: Record<string, string>, key: ProductionVerifyEnvKey) => {
  if (key === "KICKOFF_VERIFY_MODE_ID") return !has(values, "KICKOFF_VERIFY_MODE_IDS");
  if (key === "KICKOFF_VERIFY_FILECOIN_MODE_CID") return !has(values, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  if (key === "KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS") return has(values, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  if (key === "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH") return !has(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  if (key === "KICKOFF_VERIFY_FIXTURE_ID") return !has(values, "KICKOFF_VERIFY_FIXTURE_IDS");
  return key !== "KICKOFF_VERIFY_ALLOW_FAILURES";
};

const preview = (value: string) => {
  if (!value) return "missing";
  if (value.length <= 38) return value;
  return `${value.slice(0, 18)}...${value.slice(-12)}`;
};

const valueProblem = (values: Record<string, string>, key: ProductionVerifyEnvKey) => {
  const value = values[key]?.trim() ?? "";
  if (!value) return "";
  if (
    key === "KICKOFF_VERIFY_PROFILE_ID" &&
    values.KICKOFF_VERIFY_USER_ID?.trim() &&
    values.KICKOFF_VERIFY_USER_ID.trim() !== value
  ) {
    return "must match KICKOFF_VERIFY_USER_ID";
  }
  if (key === "KICKOFF_VERIFY_PUBLIC_PROFILE_URL") {
    return publicHttpsUrlProblem(value);
  }
  if (key === "KICKOFF_VERIFY_MODE_IDS" && list(values, key).length < requiredProductionModeIds.length) {
    return `needs ${requiredProductionModeIds.length} mode proof ids`;
  }
  if (key === "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS") {
    const artifactIds = list(values, key);
    if (artifactIds.length < 2) return "needs record and mode share artifact ids";
    if (artifactIds.some((id) => !/^(record|mode):[^,\s]+$/.test(id))) return "must use record:<id> or mode:<id> entries";
  }
  if (key === "KICKOFF_VERIFY_LEADERBOARD_SCOPES") {
    const scopes = list(values, key).map((scope) => scope.toLowerCase());
    const missing = requiredLeaderboardScopes.filter((scope) => !scopes.includes(scope));
    if (missing.length > 0) return `missing ${missing.join(", ")}`;
  }
  if (key === "KICKOFF_VERIFY_FIXTURE_IDS" && list(values, key).length < 3) {
    return "needs 3 fixture targets";
  }
  if (key === "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX") {
    const fixtureIds = list(values, "KICKOFF_VERIFY_FIXTURE_IDS");
    const rows = parseFixtureSignalMatrix(value);
    if (fixtureIds.length < 3) return "requires 3 fixture targets first";
    for (const fixtureId of fixtureIds) {
      const row = rows.find((item) => item.fixtureId === fixtureId);
      if (!row) return `missing ${fixtureId}`;
      const missingSignals = requiredFixtureSignals.filter(
        (signal) => !Number.isFinite(row.signals[signal]) || row.signals[signal] < requiredFixtureSignalRows(signal),
      );
      if (missingSignals.length > 0) return `${fixtureId} missing ${missingSignals.join(", ")} rows`;
    }
  }
  if (key === "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH" && !validSha256(value)) {
    return "must be a 64-character SHA-256 hex digest";
  }
  if (key === "KICKOFF_VERIFY_FILECOIN_MODE_CIDS" && list(values, key).length < requiredProductionModeIds.length) {
    return `needs ${requiredProductionModeIds.length} mode CIDs`;
  }
  if (key === "KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS") {
    const jobIds = list(values, key);
    if (jobIds.length < requiredProductionModeIds.length) {
      return `needs ${requiredProductionModeIds.length} mode job ids`;
    }
    const cids = list(values, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
    if (cids.length > 0 && cids.length !== jobIds.length) return "must match KICKOFF_VERIFY_FILECOIN_MODE_CIDS count";
  }
  if (key === "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES") {
    const hashes = list(values, key);
    if (hashes.length < requiredProductionModeIds.length) {
      return `needs ${requiredProductionModeIds.length} mode payload hashes`;
    }
    if (hashes.some((hash) => !validSha256(hash))) return "must contain only 64-character SHA-256 hex digests";
    const cids = list(values, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
    if (cids.length > 0 && cids.length !== hashes.length) return "must match KICKOFF_VERIFY_FILECOIN_MODE_CIDS count";
  }
  if (key === "KICKOFF_VERIFY_SHARE_IMAGE_URL") {
    return publicShareImageUrlProblem(value, key);
  }
  if (key === "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL") {
    return publicShareImageUrlProblem(value, key);
  }
  return "";
};

export const buildProductionEnvLedger = (envText: string): ProductionEnvLedgerPacket => {
  const values = parseEnvText(envText);
  const rows = PRODUCTION_VERIFY_ENV_KEYS.map<ProductionEnvLedgerRow>((key) => {
    const value = values[key]?.trim() ?? "";
    const required = requiredFor(values, key);
    const problem = valueProblem(values, key);
    const status: ProductionEnvLedgerStatus = value ? (problem ? "invalid" : "filled") : required ? "missing" : "optional";
    return {
      ...meta[key],
      required,
      status,
      valuePreview: problem ? `${preview(value)} (${problem})` : preview(value),
    };
  });
  const filled = rows.filter((row) => row.status === "filled").length;
  const requiredRows = rows.filter((row) => row.required);
  const requiredFilled = requiredRows.filter((row) => row.status === "filled").length;
  const missingRequiredKeys = requiredRows
    .filter((row) => row.status === "missing" || row.status === "invalid")
    .map((row) => row.key);
  const groups = (Object.keys(groupLabels) as ProductionEnvLedgerGroup[]).map((group) => {
    const groupRows = rows.filter((row) => row.group === group && row.required);
    return {
      group,
      label: groupLabels[group],
      filled: groupRows.filter((row) => row.status === "filled").length,
      total: groupRows.length,
      ready: groupRows.every((row) => row.status === "filled"),
    };
  });
  const firstMissing = rows.find((row) => row.status === "missing" || row.status === "invalid");
  const nextAction = firstMissing
    ? `${firstMissing.label}: ${firstMissing.action} Run ${firstMissing.command}.`
    : "Production verify target env is complete. Run bun run verify:production, then bun run doctor:production.";
  const copyText = [
    "Kickoff Lock Agent production verify env ledger",
    `Ready: ${missingRequiredKeys.length === 0 ? "yes" : "no"}`,
    `Required keys: ${requiredFilled}/${requiredRows.length}`,
    `Missing required keys: ${missingRequiredKeys.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Rows:",
    ...rows.map((row) => `- ${row.key} [${row.status}] ${row.valuePreview} · ${row.command}`),
  ].join("\n");

  return {
    ready: missingRequiredKeys.length === 0,
    filled,
    total: rows.length,
    requiredFilled,
    requiredTotal: requiredRows.length,
    missingRequiredKeys,
    groups,
    rows,
    nextAction,
    copyText,
  };
};
