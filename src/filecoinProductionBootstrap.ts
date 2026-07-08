import { buildFilecoinSealApiReadinessReport, resolvedPublicSealApi, sameOriginSealSelected } from "./filecoinSealApiReadiness";
import { parseEnvText } from "./productionEvidence";
import { requiredProductionModeIds } from "./productionVerifyTargets";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";

export type FilecoinProductionBootstrapStatus = "done" | "ready" | "blocked";

export type FilecoinProductionBootstrapStage = {
  id: "api" | "dry-run" | "seal" | "doctor";
  label: string;
  status: FilecoinProductionBootstrapStatus;
  command: string;
  executeCommand: string;
  requiredEnv: string[];
  missingEnv: string[];
  outputEnv: string[];
  detail: string;
};

export type FilecoinProductionReadBackCommand = {
  label: string;
  kind: "health" | "job" | "verify" | "proof";
  url: string;
  authMode: "none" | "bearer-token" | "same-origin";
  command: string;
  ready: boolean;
  responseExpectation: {
    ok?: boolean;
    productionReady?: boolean;
    mockMode?: boolean;
    authRequired?: boolean;
    persistence?: string;
    status?: string;
    proofStatus?: string;
    cid?: string;
    jobId?: string;
    payloadHash?: string;
  };
  expectedCid?: string;
  expectedJobId?: string;
  expectedPayloadHash?: string;
};

export type FilecoinProductionBootstrapPlan = {
  ready: boolean;
  execute: boolean;
  stageReadyCount: number;
  totalStages: number;
  blockedStages: number;
  missingEnv: string[];
  stages: FilecoinProductionBootstrapStage[];
  readBackCommands: FilecoinProductionReadBackCommand[];
  commands: string[];
  nextAction: string;
  copyText: string;
};

export type FilecoinProductionBootstrapEnv = Record<string, string | undefined>;

const requiredSealOutputKeys = [
  "KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID",
  "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
  "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
  "KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS",
  "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
  "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
];

const requiredModeSealCount = requiredProductionModeIds.length;

const targetSeedKeys = [
  "VITE_PUBLIC_APP_URL",
  "VITE_SUPABASE_URL",
  "KICKOFF_SEED_SHARE_IMAGE_URL or KICKOFF_VERIFY_SHARE_IMAGE_URL",
  "KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
];

const value = (env: FilecoinProductionBootstrapEnv, key: string) => env[key]?.trim() ?? "";

const has = (env: FilecoinProductionBootstrapEnv, key: string) => Boolean(value(env, key));

const hasAny = (env: FilecoinProductionBootstrapEnv, keys: string[]) => keys.some((key) => has(env, key));

const missing = (env: FilecoinProductionBootstrapEnv, keys: string[]) =>
  keys.filter((key) => {
    if (key.includes(" or ")) return !hasAny(env, key.split(/\s+or\s+/));
    return !has(env, key);
  });

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const stageCommand = (execute: boolean, command: string, executeCommand: string) => (execute ? executeCommand : command);

const listValue = (values: Record<string, string>, key: string) =>
  (values[key] ?? "").split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const validSha256 = (value: string) => /^[a-f0-9]{64}$/i.test(value);
const sealOutputProblems = (values: Record<string, string>) => {
  const problems = requiredSealOutputKeys.filter((key) => !values[key]);
  const modeCids = listValue(values, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  const modeHashes = listValue(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  const recordJobId = values.KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID ?? "";
  const modeJobIds = listValue(values, "KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS");
  const recordHash = values.KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH ?? "";

  if (recordHash && !validSha256(recordHash)) {
    problems.push("KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH must be a 64-character SHA-256 hex digest");
  }
  if (modeCids.length > 0 && modeCids.length < requiredModeSealCount) {
    problems.push(`KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs ${requiredModeSealCount} mode CIDs`);
  }
  if (modeHashes.length > 0 && modeHashes.length < requiredModeSealCount) {
    problems.push(`KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs ${requiredModeSealCount} mode payload hashes`);
  }
  if (modeCids.length > 0 && modeHashes.length > 0 && modeCids.length !== modeHashes.length) {
    problems.push("KICKOFF_VERIFY_FILECOIN_MODE_CIDS and KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES counts must match");
  }
  if (modeJobIds.length > 0 && modeJobIds.length < requiredModeSealCount) {
    problems.push(`KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS needs ${requiredModeSealCount} mode job ids`);
  }
  if (modeJobIds.length > 0 && modeCids.length > 0 && modeJobIds.length !== modeCids.length) {
    problems.push("KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS and KICKOFF_VERIFY_FILECOIN_MODE_CIDS counts must match");
  }
  if (modeHashes.some((hash) => !validSha256(hash))) {
    problems.push("KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES must contain only 64-character SHA-256 hex digests");
  }
  return unique(problems);
};

const shareImageProblem = (
  env: FilecoinProductionBootstrapEnv,
  keys: string[],
  label: string,
) => {
  const imageUrl = keys.map((key) => value(env, key)).find(Boolean) ?? "";
  if (!imageUrl) return `${keys.join(" or ")} missing`;
  return publicShareImageUrlProblem(imageUrl, label);
};

const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

const targetUrlFromSealApi = (sealApi: string, path: "health" | "job" | "verify" | "proof", cidOrJobId?: string) => {
  if (!sealApi) return "";
  try {
    const url = new URL(sealApi);
    if (path === "health") {
      url.pathname = url.pathname.replace(/\/seal\/?$/, "/health");
      url.search = "";
    } else if (path === "job") {
      url.pathname = url.pathname.replace(/\/seal\/?$/, `/jobs/${encodeURIComponent(cidOrJobId ?? "")}`);
      url.search = "";
    } else if (path === "verify") {
      url.pathname = url.pathname.replace(/\/seal\/?$/, "/verify");
      url.search = "";
      url.searchParams.set("cid", cidOrJobId ?? "");
    } else {
      url.pathname = url.pathname.replace(/\/seal\/?$/, `/proof/${encodeURIComponent(cidOrJobId ?? "")}`);
      url.search = "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};

const curlCommand = (url: string, includeBearerToken: boolean) =>
  [
    "curl -sS",
    shellSingleQuote(url),
    ...(includeBearerToken ? ["-H", '"Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"'] : []),
  ].join(" ");

const buildReadBackCommands = (
  env: FilecoinProductionBootstrapEnv,
  values: Record<string, string>,
): FilecoinProductionReadBackCommand[] => {
  const sealApi = resolvedPublicSealApi(env);
  const sameOriginSeal = sameOriginSealSelected(env);
  const authMode: FilecoinProductionReadBackCommand["authMode"] = sameOriginSeal ? "same-origin" : "bearer-token";
  const recordCid = values.KICKOFF_VERIFY_FILECOIN_RECORD_CID ?? "";
  const recordHash = values.KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH ?? "";
  const recordJobId = values.KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID ?? "";
  const modeJobIds = listValue(values, "KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS");
  const modeCids = listValue(values, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  const modeHashes = listValue(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  const commandFor = (
    label: string,
    path: "health" | "job" | "verify" | "proof",
    cidOrJobId?: string,
    expectedPayloadHash?: string,
  ): FilecoinProductionReadBackCommand => {
    const url = targetUrlFromSealApi(sealApi, path, cidOrJobId);
    const ready = Boolean(url && (path === "health" || cidOrJobId));
    const itemAuthMode = path === "health" ? "none" : authMode;
    return {
      label,
      kind: path,
      url,
      authMode: itemAuthMode,
      ready,
      responseExpectation:
        path === "health"
          ? {
              ok: true,
              productionReady: true,
              mockMode: false,
              authRequired: true,
              persistence: "file",
            }
          : path === "job"
            ? {
                ok: true,
                status: "verified",
                jobId: cidOrJobId,
              }
            : {
                ok: true,
                proofStatus: path === "verify" ? "verified" : "retrievable",
                cid: cidOrJobId,
                payloadHash: expectedPayloadHash,
              },
      expectedCid: path === "verify" || path === "proof" ? cidOrJobId : undefined,
      expectedJobId: path === "job" ? cidOrJobId : undefined,
      expectedPayloadHash,
      command: ready
        ? curlCommand(url, itemAuthMode === "bearer-token")
        : `Set VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1 and ${path === "health" ? "seal API env" : path === "job" ? "target job id" : "target CID"} before reading ${label}.`,
    };
  };

  return [
    commandFor("Seal API health", "health"),
    commandFor("Record upload status", "job", recordJobId),
    commandFor("Record verify status", "verify", recordCid, recordHash),
    commandFor("Record proof read-back", "proof", recordCid, recordHash),
    ...modeCids.flatMap((cid, index) => [
      commandFor(`Mode ${index + 1} upload status`, "job", modeJobIds[index]),
      commandFor(`Mode ${index + 1} verify status`, "verify", cid, modeHashes[index]),
      commandFor(`Mode ${index + 1} proof read-back`, "proof", cid, modeHashes[index]),
    ]),
  ];
};

export const buildFilecoinProductionBootstrapPlan = (
  env: FilecoinProductionBootstrapEnv,
  options: { execute?: boolean; proofStoreWritable?: boolean } = {},
): FilecoinProductionBootstrapPlan => {
  const execute = Boolean(options.execute);
  const api = buildFilecoinSealApiReadinessReport(env, {
    proofStoreWritable: options.proofStoreWritable,
  });
  const values = parseEnvText(
    Object.entries(env)
      .map(([key, item]) => `${key}=${item ?? ""}`)
      .join("\n"),
  );
  const seedMissing = unique([
    ...missing(env, targetSeedKeys),
    shareImageProblem(env, ["KICKOFF_SEED_SHARE_IMAGE_URL", "KICKOFF_VERIFY_SHARE_IMAGE_URL"], "Record share image URL"),
    shareImageProblem(
      env,
      ["KICKOFF_SEED_MODE_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
      "Mode share image URL",
    ),
  ]);
  const sealOutputsMissing = sealOutputProblems(values);
  const sameOriginSeal = sameOriginSealSelected(env);
  const browserRuntimeMissing = [
    ...(resolvedPublicSealApi(env) ? [] : ["VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1 with VITE_PUBLIC_APP_URL"]),
    ...(sameOriginSeal ? [] : missing(env, ["VITE_FILECOIN_SEAL_TOKEN"])),
  ];
  const doctorMissing = execute && api.ready && seedMissing.length === 0 ? [] : [...browserRuntimeMissing, ...sealOutputsMissing];

  const stages: FilecoinProductionBootstrapStage[] = [
    {
      id: "api",
      label: "Preflight production seal API",
      status: api.ready ? "ready" : "blocked",
      command: "bun run filecoin:api:check",
      executeCommand: "bun run filecoin:api:check",
      requiredEnv: [
        "SYNAPSE_PRIVATE_KEY",
        "FILECOIN_SEAL_TOKEN",
        "VITE_FILECOIN_SEAL_TOKEN unless VITE_FILECOIN_SEAL_SAME_ORIGIN=1",
        "FILECOIN_PROOF_STORE_PATH",
        "ALLOW_ORIGIN",
        "VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN",
        "FILECOIN_SEAL_UPSTREAM_URL when VITE_FILECOIN_SEAL_SAME_ORIGIN=1",
      ],
      missingEnv: api.blockers.map((check) => check.label),
      outputEnv: ["production-ready /health response"],
      detail: api.ready
        ? `${api.passed}/${api.total} API readiness checks passed.`
        : api.blockers.map((check) => `${check.label}: ${check.action}`).join(" "),
    },
    {
      id: "dry-run",
      label: "Build seal target payloads",
      status: seedMissing.length === 0 ? "ready" : "blocked",
      command: "bun run seal:production-targets -- --dry-run",
      executeCommand: "bun run seal:production-targets -- --dry-run",
      requiredEnv: targetSeedKeys,
      missingEnv: seedMissing,
      outputEnv: [
        "record payload hash",
        "mode payload hashes",
        "KICKOFF_VERIFY_PROOF_ID",
        "KICKOFF_VERIFY_MODE_IDS",
      ],
      detail: "Build deterministic production record and mode payloads before submitting them to the seal API.",
    },
    {
      id: "seal",
      label: "Seal production proof targets",
      status: sealOutputsMissing.length === 0 ? "done" : api.ready && seedMissing.length === 0 ? "ready" : "blocked",
      command: "bun run seal:production-targets",
      executeCommand: "bun run seal:production-targets",
      requiredEnv: ["production-ready seal API", ...targetSeedKeys],
      missingEnv: sealOutputsMissing.length === 0 ? [] : [...(api.ready ? [] : ["production-ready seal API"]), ...seedMissing],
      outputEnv: requiredSealOutputKeys,
      detail:
        sealOutputsMissing.length === 0
          ? `record CID/hash plus ${requiredModeSealCount}/${requiredModeSealCount} mode CID/hash pairs collected.`
          : `POST the record target and all ${requiredModeSealCount} mode targets to /seal?async=1, poll /jobs/:id, then verify /verify and /proof read-back.`,
    },
    {
      id: "doctor",
      label: "Verify Filecoin read-back",
      status: doctorMissing.length === 0 ? "ready" : "blocked",
      command: "bun run doctor:filecoin",
      executeCommand: "bun run doctor:filecoin",
      requiredEnv: [
        "VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN",
        "VITE_FILECOIN_SEAL_TOKEN",
        ...requiredSealOutputKeys,
      ],
      missingEnv: doctorMissing,
      outputEnv: ["Filecoin production evidence"],
      detail: "Verify health, contract readiness, record CID read-back and every required mode CID/hash pair.",
    },
  ];

  const blockedStages = stages.filter((stage) => stage.status === "blocked").length;
  const stageReadyCount = stages.filter((stage) => stage.status === "ready" || stage.status === "done").length;
  const missingEnv = unique(stages.flatMap((stage) => stage.missingEnv));
  const readBackCommands = buildReadBackCommands(env, values);
  const commands = stages
    .filter((stage) => stage.status !== "done")
    .map((stage) => stageCommand(execute, stage.command, stage.executeCommand));
  const next = stages.find((stage) => stage.status !== "done");
  const nextAction = next
    ? next.status === "ready"
      ? `${next.label}: run ${stageCommand(execute, next.command, next.executeCommand)}.`
      : `${next.label}: set ${next.missingEnv.join(", ")} first.`
    : "Filecoin production bootstrap targets are ready. Run bun run doctor:filecoin.";
  const copyText = [
    "Kickoff Lock Agent Filecoin production bootstrap",
    `Mode: ${execute ? "execute" : "plan"}`,
    `Stages: ${stageReadyCount}/${stages.length} ready or done`,
    `Missing env: ${missingEnv.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Filecoin read-back commands:",
    ...readBackCommands.map((item) =>
      `- ${item.label}: ${item.command}${item.expectedPayloadHash ? ` (expect payload hash ${item.expectedPayloadHash})` : ""}`,
    ),
    "Stages:",
    ...stages.map((stage) =>
      [
        `- ${stage.label} [${stage.status}]`,
        `  command: ${stage.command}`,
        `  execute: ${stage.executeCommand}`,
        `  requires: ${stage.requiredEnv.join(", ")}`,
        `  missing: ${stage.missingEnv.join(", ") || "none"}`,
        `  outputs: ${stage.outputEnv.join(", ")}`,
        `  detail: ${stage.detail}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready: blockedStages === 0,
    execute,
    stageReadyCount,
    totalStages: stages.length,
    blockedStages,
    missingEnv,
    stages,
    readBackCommands,
    commands,
    nextAction,
    copyText,
  };
};
