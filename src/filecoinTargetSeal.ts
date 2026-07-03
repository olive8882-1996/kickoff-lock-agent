import { buildProductionVerifyEnv } from "./productionEvidence";
import { buildProductionTargetSeed, type ShareImageSeedMetadata } from "./productionTargetSeed";
import { sha256, stableJson } from "./proof";
import type { FilecoinProof, GameModeRun, MemoryRecord, SealBackendHealth } from "./types";

export type FilecoinTargetSealEnv = Record<string, string | undefined>;

export type FilecoinSealTargetKind = "record" | "mode";

export type FilecoinSealTarget = {
  kind: FilecoinSealTargetKind;
  id: string;
  payload: string;
  payloadHash: string;
  byteLength: number;
  cid?: string;
  proof?: FilecoinProof;
  verifyUrl?: string;
  proofUrl?: string;
};

export type FilecoinTargetSealReport = {
  ready: boolean;
  dryRun: boolean;
  endpoint: string;
  health?: SealBackendHealth;
  productionReady: boolean;
  targets: FilecoinSealTarget[];
  verifyEnv: string;
  blockers: string[];
};

type FetchLike = typeof fetch;

const env = (values: FilecoinTargetSealEnv, key: string) => values[key]?.trim() ?? "";

const targetImage: ShareImageSeedMetadata = {
  imageUrl: "https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png",
  imageMime: "image/png",
  imageByteLength: 120_000,
  imageHash: "0".repeat(64),
};

export const filecoinTargetUrl = (
  values: FilecoinTargetSealEnv,
  path: "health" | "seal" | "verify" | "proof",
  cid?: string,
) => {
  const endpoint = env(values, "VITE_FILECOIN_SEAL_API");
  if (!endpoint) return "";
  const url = new URL(endpoint, env(values, "VITE_PUBLIC_APP_URL") || "http://127.0.0.1/");
  if (path === "health") {
    url.pathname = url.pathname
      .replace(/\/seal\/?$/, "/health")
      .replace(/\/verify\/?$/, "/health")
      .replace(/\/proof\/?.*$/, "/health");
    url.search = "";
    return url.toString();
  }
  if (path === "seal") {
    url.pathname = url.pathname
      .replace(/\/verify\/?$/, "/seal")
      .replace(/\/proof\/?.*$/, "/seal")
      .replace(/\/health\/?$/, "/seal");
    url.search = "";
    return url.toString();
  }
  if (path === "verify") {
    url.pathname = url.pathname
      .replace(/\/seal\/?$/, "/verify")
      .replace(/\/proof\/?.*$/, "/verify")
      .replace(/\/health\/?$/, "/verify");
    url.search = "";
    url.searchParams.set("cid", cid ?? "");
    return url.toString();
  }
  url.pathname = url.pathname
    .replace(/\/seal\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`)
    .replace(/\/verify\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`)
    .replace(/\/health\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`);
  url.search = "";
  return url.toString();
};

const headers = (values: FilecoinTargetSealEnv, base: Record<string, string> = {}) => ({
  ...base,
  ...(env(values, "VITE_FILECOIN_SEAL_TOKEN")
    ? { Authorization: `Bearer ${env(values, "VITE_FILECOIN_SEAL_TOKEN")}` }
    : {}),
});

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

export const buildFilecoinTargetPayloads = async (
  values: FilecoinTargetSealEnv,
  now = new Date().toISOString(),
) => {
  const seed = await buildProductionTargetSeed(
    {
      ...values,
      VITE_PUBLIC_APP_URL: env(values, "VITE_PUBLIC_APP_URL") || "https://example.com/kickoff-lock-agent/",
    },
    targetImage,
    now,
  );
  const recordPayload = stableJson({ capsule: seed.record.capsule, result: seed.record.result ?? null });
  const { sealJob: _sealJob, ...modeRunPayload } = seed.modeRun;
  const modePayload = stableJson({ modeRun: modeRunPayload });
  return {
    seed,
    record: {
      kind: "record" as const,
      id: seed.record.capsule.id,
      payload: recordPayload,
      payloadHash: await sha256(recordPayload),
      byteLength: new TextEncoder().encode(recordPayload).byteLength,
    },
    mode: {
      kind: "mode" as const,
      id: seed.modeRun.id,
      payload: modePayload,
      payloadHash: await sha256(modePayload),
      byteLength: new TextEncoder().encode(modePayload).byteLength,
    },
  };
};

const normalizeProof = (cid: string, payload: Partial<FilecoinProof>): FilecoinProof => ({
  mode: "real",
  cid: String(payload.cid ?? cid),
  pieceCid: String(payload.pieceCid ?? payload.cid ?? cid),
  provider: String(payload.provider ?? "seal-api-provider"),
  dataSetId: String(payload.dataSetId ?? "seal-api-dataset"),
  proofStatus: (payload.proofStatus as FilecoinProof["proofStatus"]) ?? "retrievable",
  uploadedAt: payload.uploadedAt,
  retrievalUrl: payload.retrievalUrl,
  payloadHash: payload.payloadHash,
  byteLength: payload.byteLength,
});

const sealOneTarget = async (
  values: FilecoinTargetSealEnv,
  fetcher: FetchLike,
  target: Omit<FilecoinSealTarget, "cid" | "proof" | "verifyUrl" | "proofUrl">,
): Promise<FilecoinSealTarget> => {
  const sealUrl = filecoinTargetUrl(values, "seal");
  const seal = await readJson(fetcher, sealUrl, {
    method: "POST",
    headers: headers(values, { "Content-Type": "application/json" }),
    body: target.payload,
  });
  if (!seal.response.ok) throw new Error(`${target.kind} seal failed: HTTP ${seal.response.status} ${seal.text}`);
  const cid = String(seal.body?.cid ?? "");
  if (!cid) throw new Error(`${target.kind} seal did not return a CID.`);
  if (seal.body?.payloadHash && seal.body.payloadHash !== target.payloadHash) {
    throw new Error(`${target.kind} seal payload hash mismatch.`);
  }

  const verifyUrl = filecoinTargetUrl(values, "verify", cid);
  const proofUrl = filecoinTargetUrl(values, "proof", cid);
  const verify = await readJson(fetcher, verifyUrl, { headers: headers(values) });
  if (!verify.response.ok) throw new Error(`${target.kind} verify failed: HTTP ${verify.response.status}`);
  const proof = await readJson(fetcher, proofUrl, { headers: headers(values) });
  if (!proof.response.ok) throw new Error(`${target.kind} proof registry failed: HTTP ${proof.response.status}`);
  const proofPayload = { ...seal.body, ...verify.body, ...proof.body };
  if (proofPayload.cid && proofPayload.cid !== cid) throw new Error(`${target.kind} proof registry CID mismatch.`);
  if (proofPayload.payloadHash && proofPayload.payloadHash !== target.payloadHash) {
    throw new Error(`${target.kind} proof registry payload hash mismatch.`);
  }
  if (proofPayload.byteLength && proofPayload.byteLength !== target.byteLength) {
    throw new Error(`${target.kind} proof registry byte length mismatch.`);
  }
  const normalized = normalizeProof(cid, {
    ...proofPayload,
    payloadHash: proofPayload.payloadHash ?? target.payloadHash,
    byteLength: proofPayload.byteLength ?? target.byteLength,
  });
  return {
    ...target,
    cid,
    proof: normalized,
    verifyUrl,
    proofUrl,
  };
};

export const buildFilecoinTargetSealReport = async (
  values: FilecoinTargetSealEnv,
  options: {
    dryRun?: boolean;
    fetcher?: FetchLike;
    now?: string;
  } = {},
): Promise<FilecoinTargetSealReport> => {
  const dryRun = options.dryRun ?? false;
  const fetcher = options.fetcher ?? fetch;
  const endpoint = env(values, "VITE_FILECOIN_SEAL_API");
  const blockers: string[] = [];
  const payloads = await buildFilecoinTargetPayloads(values, options.now);
  if (!endpoint) blockers.push("VITE_FILECOIN_SEAL_API missing");
  if (!env(values, "VITE_FILECOIN_SEAL_TOKEN")) blockers.push("VITE_FILECOIN_SEAL_TOKEN missing");
  if (dryRun || blockers.length > 0) {
    return {
      ready: false,
      dryRun,
      endpoint,
      productionReady: false,
      targets: [payloads.record, payloads.mode],
      blockers,
      verifyEnv: buildProductionVerifyEnv({
        userId: payloads.seed.targets.userId,
        profileId: payloads.seed.targets.profileId,
        proofId: payloads.seed.targets.proofId,
        modeId: payloads.seed.targets.modeId,
        friendCode: payloads.seed.targets.friendCode,
        seasonKey: payloads.seed.targets.seasonKey,
        filecoinRecordPayloadHash: payloads.record.payloadHash,
        filecoinModePayloadHash: payloads.mode.payloadHash,
        shareImageUrl: payloads.seed.targets.shareImageUrl,
      }),
    };
  }

  const health = await readJson(fetcher, filecoinTargetUrl(values, "health"), { headers: headers(values) });
  if (!health.response.ok) throw new Error(`Seal API health failed: HTTP ${health.response.status}`);
  const backendHealth = health.body as SealBackendHealth;
  const productionReady = Boolean(backendHealth.productionReady && !backendHealth.mockMode && backendHealth.authRequired && backendHealth.persistence === "file");
  if (!productionReady) {
    blockers.push(...(backendHealth.blockers ?? ["Seal API health did not declare production readiness."]));
  }

  const [record, mode] = await Promise.all([
    sealOneTarget(values, fetcher, payloads.record),
    sealOneTarget(values, fetcher, payloads.mode),
  ]);
  return {
    ready: productionReady,
    dryRun,
    endpoint,
    health: backendHealth,
    productionReady,
    targets: [record, mode],
    blockers,
    verifyEnv: buildProductionVerifyEnv({
      userId: payloads.seed.targets.userId,
      profileId: payloads.seed.targets.profileId,
      proofId: payloads.seed.targets.proofId,
      modeId: payloads.seed.targets.modeId,
      friendCode: payloads.seed.targets.friendCode,
      seasonKey: payloads.seed.targets.seasonKey,
      filecoinRecordCid: record.cid,
      filecoinRecordPayloadHash: record.payloadHash,
      filecoinModeCid: mode.cid,
      filecoinModePayloadHash: mode.payloadHash,
      shareImageUrl: payloads.seed.targets.shareImageUrl,
      allowFailures: true,
    }),
  };
};
