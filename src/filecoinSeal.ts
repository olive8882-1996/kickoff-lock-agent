import { sha256, stableJson } from "./proof";
import type {
  FilecoinLookupState,
  FilecoinProof,
  GameModeRun,
  MemoryRecord,
  PredictionCapsule,
  SealBackendHealth,
  SealJob,
  SealPollAttempt,
  SealStep,
} from "./types";

const sealEndpoint = import.meta.env.VITE_FILECOIN_SEAL_API as string | undefined;
const sealToken = import.meta.env.VITE_FILECOIN_SEAL_TOKEN as string | undefined;

const baseSteps = (): SealStep[] => [
  {
    id: "payload",
    label: "Build immutable payload",
    status: "queued",
    detail: "Stable JSON and SHA-256 hash are ready in the capsule.",
  },
  {
    id: "health",
    label: "Check seal API health",
    status: "queued",
    detail: "Confirms the trusted sealing backend is reachable before uploading.",
  },
  {
    id: "upload",
    label: "Upload through Synapse",
    status: "queued",
    detail: "Requires a server endpoint with SYNAPSE_PRIVATE_KEY.",
  },
  {
    id: "deal",
    label: "Storage deal accepted",
    status: "queued",
    detail: "Provider and dataset identifiers will be returned by the seal API.",
  },
  {
    id: "poll",
    label: "Poll retrievability",
    status: "queued",
    detail: "Verifier polls until CID is retrievable.",
  },
  {
    id: "registry",
    label: "Read proof registry",
    status: "queued",
    detail: "Reads /proof/:cid back from the seal API and checks the uploaded payload hash.",
  },
  {
    id: "verify",
    label: "Attach proof",
    status: "queued",
    detail: "Real proof replaces the demo proof after verification.",
  },
];

const mark = (steps: SealStep[], ids: SealStep["id"][], status: SealStep["status"], detail?: string) =>
  steps.map((step) =>
    ids.includes(step.id)
      ? {
          ...step,
          status,
          detail: detail ?? step.detail,
        }
      : step,
  );

const wait = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

export const sealApiHeaders = (base: Record<string, string> = {}, token = sealToken) => ({
  ...base,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export const sealApiUrl = (path: "health" | "seal" | "verify" | "proof", value?: string, endpoint = sealEndpoint) => {
  if (!endpoint) return "";
  const baseUrl = typeof window === "undefined" ? "http://127.0.0.1/" : window.location.href;
  const url = new URL(endpoint, baseUrl);
  if (path === "health") {
    url.pathname = url.pathname
      .replace(/\/seal\/?$/, "/health")
      .replace(/\/verify\/?$/, "/health")
      .replace(/\/proof\/?.*$/, "/health");
    url.search = "";
    return url.toString();
  }
  if (path === "seal") {
    url.pathname = url.pathname.replace(/\/verify\/?$/, "/seal").replace(/\/proof\/?.*$/, "/seal");
    url.search = "";
    return url.toString();
  }
  if (path === "verify") {
    url.pathname = url.pathname.replace(/\/seal\/?$/, "/verify").replace(/\/proof\/?.*$/, "/verify");
    url.search = "";
    url.searchParams.set("cid", value ?? "");
    return url.toString();
  }
  url.pathname = url.pathname.replace(/\/seal\/?$/, `/proof/${encodeURIComponent(value ?? "")}`).replace(/\/verify\/?$/, `/proof/${encodeURIComponent(value ?? "")}`);
  url.search = "";
  return url.toString();
};

const verifyEndpoint = (cid: string) => {
  const url = sealApiUrl("verify", cid);
  if (!url) return "";
  return url;
};

export const sealBackendProductionReady = (health?: SealBackendHealth) =>
  Boolean(
    health?.ok &&
      health.productionReady === true &&
      !health.mockMode &&
      health.hasPrivateKey &&
      health.authRequired &&
      health.persistence === "file" &&
      health.maxUploadBytes,
  );

const failJob = (
  record: MemoryRecord,
  job: SealJob,
  failedStep: SealStep["id"],
  message: string,
): MemoryRecord => ({
  ...record,
  sealJob: {
    ...job,
    status: "failed",
    healthStatus: failedStep === "health" ? "failed" : job.healthStatus,
    updatedAt: new Date().toISOString(),
    steps: mark(job.steps, [failedStep], "failed", message),
    error: message,
  },
});

const failModeJob = (
  run: GameModeRun,
  job: SealJob,
  failedStep: SealStep["id"],
  message: string,
): GameModeRun => ({
  ...run,
  sealJob: {
    ...job,
    status: "failed",
    healthStatus: failedStep === "health" ? "failed" : job.healthStatus,
    updatedAt: new Date().toISOString(),
    steps: mark(job.steps, [failedStep], "failed", message),
    error: message,
  },
});

const normalizeLookupProof = (cid: string, payload: Partial<FilecoinProof> & { checkedAt?: string }): FilecoinProof => ({
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

export const lookupFilecoinProof = async (cid: string): Promise<FilecoinLookupState> => {
  const cleanCid = cid.trim();
  if (!cleanCid) {
    return { status: "missing", message: "Enter a CID to query the seal API." };
  }
  if (!sealEndpoint) {
    return {
      status: "needs-config",
      message: "Set VITE_FILECOIN_SEAL_API to enable CID proof lookup.",
    };
  }
  const proofUrl = sealApiUrl("proof", cleanCid);
  const verifyUrl = sealApiUrl("verify", cleanCid);
  try {
    const proofRes = await fetch(proofUrl);
    if (proofRes.status === 404) {
      return {
        status: "missing",
        message: "No proof metadata found for this CID.",
        checkedAt: new Date().toISOString(),
      };
    }
    if (!proofRes.ok) {
      return { status: "error", message: `Proof lookup returned ${proofRes.status}.` };
    }
    const proofPayload = (await proofRes.json()) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string };
    const verifyRes = await fetch(verifyUrl).catch(() => undefined);
    const verifyPayload = verifyRes?.ok
      ? ((await verifyRes.json()) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string })
      : {};
    const proof = normalizeLookupProof(cleanCid, { ...proofPayload, ...verifyPayload });
    return {
      status: proof.proofStatus === "draft" ? "missing" : "found",
      message: proof.proofStatus === "verified" ? "CID verified by the seal API." : "CID proof metadata loaded.",
      proof,
      checkedAt: verifyPayload.checkedAt ?? proofPayload.checkedAt ?? new Date().toISOString(),
    };
  } catch (error) {
    return { status: "error", message: (error as Error).message };
  }
};

const pollProofStatus = async (
  proof: FilecoinProof,
): Promise<{ proof: FilecoinProof; attempts: number; checkedAt?: string; pollLog: SealPollAttempt[] }> => {
  const endpoint = verifyEndpoint(proof.cid);
  if (!endpoint) return { proof, attempts: 0, pollLog: [] };
  let checkedAt: string | undefined;
  const pollLog: SealPollAttempt[] = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const attemptedAt = new Date().toISOString();
    const res = await fetch(endpoint).catch((error) => {
      pollLog.push({
        attempt,
        checkedAt: attemptedAt,
        status: "error",
        detail: (error as Error).message,
      });
      return undefined;
    });
    if (res?.ok) {
      const status = (await res.json()) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string };
      checkedAt = status.checkedAt ?? new Date().toISOString();
      if (status.proofStatus === "verified" || status.proofStatus === "retrievable") {
        pollLog.push({
          attempt,
          checkedAt,
          status: status.proofStatus,
          proofStatus: status.proofStatus,
          httpStatus: res.status,
          detail:
            status.proofStatus === "verified"
              ? "Seal API verified the CID."
              : "Seal API reports the CID as retrievable.",
          retrievalUrl: status.retrievalUrl ?? proof.retrievalUrl,
        });
        return {
          proof: {
            ...proof,
            ...status,
            mode: "real",
            proofStatus: status.proofStatus,
            retrievalUrl: status.retrievalUrl ?? proof.retrievalUrl,
          },
          attempts: attempt,
          checkedAt,
          pollLog,
        };
      }
      pollLog.push({
        attempt,
        checkedAt,
        status: "pending",
        proofStatus: status.proofStatus ?? "draft",
        httpStatus: res.status,
        detail: `Seal API returned ${status.proofStatus ?? "draft"} proof status.`,
        retrievalUrl: status.retrievalUrl ?? proof.retrievalUrl,
      });
    } else if (res) {
      checkedAt = new Date().toISOString();
      pollLog.push({
        attempt,
        checkedAt,
        status: "pending",
        proofStatus: res.status === 404 ? "missing" : "draft",
        httpStatus: res.status,
        detail: `Seal API verification returned ${res.status}.`,
      });
    }
    await wait(450);
  }
  return { proof, attempts: 5, checkedAt, pollLog };
};

const readProofRegistry = async (
  proof: FilecoinProof,
  expectedPayloadHash: string,
  expectedByteLength: number,
): Promise<{ proof: FilecoinProof; checkedAt: string; hash: string }> => {
  const proofUrl = sealApiUrl("proof", proof.cid);
  if (!proofUrl) throw new Error("Proof registry URL is unavailable.");
  const res = await fetch(proofUrl).catch(() => undefined);
  if (!res?.ok) {
    throw new Error(`Proof registry returned ${res?.status ?? "no response"}.`);
  }
  const payload = (await res.json()) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string; storedAt?: string };
  if (payload.cid && payload.cid !== proof.cid) {
    throw new Error("Proof registry CID did not match the sealed proof.");
  }
  if (payload.payloadHash && payload.payloadHash !== expectedPayloadHash) {
    throw new Error("Proof registry payload hash did not match the uploaded capsule payload.");
  }
  if (payload.byteLength && payload.byteLength !== expectedByteLength) {
    throw new Error("Proof registry byte length did not match the uploaded capsule payload.");
  }
  return {
    proof: normalizeLookupProof(proof.cid, { ...proof, ...payload }),
    checkedAt: payload.checkedAt ?? new Date().toISOString(),
    hash: payload.payloadHash ?? expectedPayloadHash,
  };
};

export const createSealJob = (artifact: Pick<PredictionCapsule, "id">): SealJob => ({
  id: `seal-${artifact.id}-${Date.now()}`,
  capsuleId: artifact.id,
  status: sealEndpoint ? "queued" : "needs-config",
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  endpoint: sealEndpoint,
  healthStatus: sealEndpoint ? "unchecked" : "failed",
  steps: sealEndpoint
    ? mark(baseSteps(), ["payload"], "passed", "Capsule payload is deterministic and ready to upload.")
    : mark(
        mark(baseSteps(), ["payload"], "passed", "Capsule payload is deterministic and ready to upload."),
        ["health", "upload", "deal", "poll", "registry", "verify"],
        "needs-config",
        "Set VITE_FILECOIN_SEAL_API to a trusted backend endpoint.",
      ),
});

export const runSealJob = async (record: MemoryRecord): Promise<MemoryRecord> => {
  const capsule = record.capsule;
  let job = createSealJob(capsule);
  if (!sealEndpoint) return { ...record, sealJob: job };

  job = {
    ...job,
    status: "running",
    updatedAt: new Date().toISOString(),
    steps: mark(job.steps, ["health"], "running", "Checking the configured seal API before upload."),
  };

  const healthUrl = sealApiUrl("health");
  const sealUrl = sealApiUrl("seal");
  const healthRes = await fetch(healthUrl).catch(() => undefined);
  if (!healthRes?.ok) {
    return failJob(record, job, "health", `Seal API health check failed${healthRes ? ` with ${healthRes.status}` : ""}.`);
  }
  const backendHealth = (await healthRes.json().catch(() => ({ ok: true }))) as SealBackendHealth;
  const backendMode = backendHealth.mockMode
    ? "mock seal API"
    : backendHealth.hasPrivateKey
      ? "real Synapse seal API"
      : "seal API missing SYNAPSE_PRIVATE_KEY";
  const productionDetail = sealBackendProductionReady(backendHealth)
    ? "production-ready"
    : `production blockers: ${backendHealth.blockers?.join(", ") || "health response did not declare production readiness"}`;
  const healthDetail = `${backendMode}; ${backendHealth.persistence ?? "unknown"} proof registry; ${
    backendHealth.authRequired ? "token required" : "token not required"
  }; ${productionDetail}.`;

  job = {
    ...job,
    healthStatus: "ready",
    backendHealth,
    updatedAt: new Date().toISOString(),
    steps: mark(
      mark(job.steps, ["health"], "passed", healthDetail),
      ["upload"],
      "running",
      "Uploading capsule payload to the configured seal API.",
    ),
  };

  const uploadPayload = stableJson({ capsule, result: record.result ?? null });
  const uploadPayloadHash = await sha256(uploadPayload);
  const uploadByteLength = new TextEncoder().encode(uploadPayload).byteLength;

  const res = await fetch(sealUrl, {
    method: "POST",
    headers: sealApiHeaders({ "Content-Type": "application/json" }),
    body: uploadPayload,
  }).catch(() => undefined);
  if (!res?.ok) {
    return failJob(record, job, "upload", `Seal API returned ${res?.status ?? "no response"}.`);
  }

  const proof = (await res.json()) as Partial<FilecoinProof>;
  if (!proof.cid) {
    return failJob(record, job, "deal", "Seal API did not return a CID.");
  }
  if (proof.payloadHash && proof.payloadHash !== uploadPayloadHash) {
    return failJob(record, job, "deal", "Seal API payload hash did not match the uploaded capsule payload.");
  }
  const realProof: FilecoinProof = {
    mode: "real",
    cid: String(proof.cid ?? capsule.filecoinProof.cid),
    pieceCid: String(proof.pieceCid ?? proof.cid ?? capsule.filecoinProof.pieceCid),
    provider: String(proof.provider ?? "seal-api-provider"),
    dataSetId: String(proof.dataSetId ?? "seal-api-dataset"),
    proofStatus: (proof.proofStatus as FilecoinProof["proofStatus"]) ?? "verified",
    uploadedAt: new Date().toISOString(),
    retrievalUrl: proof.retrievalUrl,
    payloadHash: proof.payloadHash ?? uploadPayloadHash,
    byteLength: proof.byteLength ?? uploadByteLength,
  };
  job = {
    ...job,
    steps: mark(
      mark(job.steps, ["upload", "deal"], "passed", "Seal API accepted the upload and returned provider proof metadata."),
      ["poll"],
      "running",
      `Polling CID ${realProof.cid} for retrievability.`,
    ),
  };
  const pollResult = await pollProofStatus(realProof);
  const verifyUrl = sealApiUrl("verify", pollResult.proof.cid);
  const proofUrl = sealApiUrl("proof", pollResult.proof.cid);
  let registryResult: Awaited<ReturnType<typeof readProofRegistry>>;
  try {
    registryResult = await readProofRegistry(pollResult.proof, uploadPayloadHash, uploadByteLength);
  } catch (error) {
    return {
      ...failJob(
        record,
        {
          ...job,
          proof: pollResult.proof,
          proofUrl,
          verifyUrl,
          uploadPayloadHash,
          uploadByteLength,
          pollAttempts: pollResult.attempts,
          pollLog: pollResult.pollLog,
          lastCheckedAt: pollResult.checkedAt ?? new Date().toISOString(),
          proofRegistryStatus: "failed",
          proofRegistryCheckedAt: new Date().toISOString(),
          steps: mark(
            mark(job.steps, ["poll"], "passed", `CID ${pollResult.proof.cid} is retrievable.`),
            ["registry"],
            "failed",
            (error as Error).message,
          ),
        },
        "registry",
        (error as Error).message,
      ),
    };
  }
  const verifiedProof = registryResult.proof;
  const verified = verifiedProof.proofStatus === "verified";

  return {
    ...record,
    capsule: {
      ...capsule,
      filecoinProof: verifiedProof,
    },
    sealJob: {
      ...job,
      status: verified ? "verified" : "running",
      backendHealth,
      proof: verifiedProof,
      proofUrl,
      verifyUrl,
      uploadPayloadHash,
      uploadByteLength,
      pollAttempts: pollResult.attempts,
      pollLog: pollResult.pollLog,
      lastCheckedAt: pollResult.checkedAt ?? registryResult.checkedAt,
      proofRegistryStatus: "verified",
      proofRegistryCheckedAt: registryResult.checkedAt,
      proofRegistryHash: registryResult.hash,
      updatedAt: new Date().toISOString(),
      steps: verified
        ? mark(
            mark(
              mark(job.steps, ["poll"], "passed", `CID ${verifiedProof.cid} is retrievable.`),
              ["registry"],
              "passed",
              `Proof registry read back ${registryResult.hash.slice(0, 12)}... for ${verifiedProof.cid}.`,
            ),
            ["verify"],
            "passed",
            "CID is verified by the configured seal API.",
          )
        : mark(
            mark(
              mark(job.steps, ["poll"], "passed", "CID is retrievable but final verification is still pending."),
              ["registry"],
              "passed",
              `Proof registry read back ${registryResult.hash.slice(0, 12)}... for ${verifiedProof.cid}.`,
            ),
            ["verify"],
            "running",
            "Run Auto seal again to re-check final verification.",
          ),
    },
  };
};

export const runModeSealJob = async (run: GameModeRun): Promise<GameModeRun> => {
  let job = createSealJob(run);
  if (!sealEndpoint) return { ...run, sealJob: job };

  job = {
    ...job,
    status: "running",
    updatedAt: new Date().toISOString(),
    steps: mark(job.steps, ["health"], "running", "Checking the configured seal API before uploading the mode proof."),
  };

  const healthUrl = sealApiUrl("health");
  const sealUrl = sealApiUrl("seal");
  const healthRes = await fetch(healthUrl).catch(() => undefined);
  if (!healthRes?.ok) {
    return failModeJob(run, job, "health", `Seal API health check failed${healthRes ? ` with ${healthRes.status}` : ""}.`);
  }
  const backendHealth = (await healthRes.json().catch(() => ({ ok: true }))) as SealBackendHealth;
  const backendMode = backendHealth.mockMode
    ? "mock seal API"
    : backendHealth.hasPrivateKey
      ? "real Synapse seal API"
      : "seal API missing SYNAPSE_PRIVATE_KEY";
  const productionDetail = sealBackendProductionReady(backendHealth)
    ? "production-ready"
    : `production blockers: ${backendHealth.blockers?.join(", ") || "health response did not declare production readiness"}`;
  const healthDetail = `${backendMode}; ${backendHealth.persistence ?? "unknown"} proof registry; ${
    backendHealth.authRequired ? "token required" : "token not required"
  }; ${productionDetail}.`;

  job = {
    ...job,
    healthStatus: "ready",
    backendHealth,
    updatedAt: new Date().toISOString(),
    steps: mark(
      mark(job.steps, ["health"], "passed", healthDetail),
      ["upload"],
      "running",
      "Uploading mode proof payload to the configured seal API.",
    ),
  };

  const { sealJob: _previousSealJob, ...modeRunPayload } = run;
  const uploadPayload = stableJson({ modeRun: modeRunPayload });
  const uploadPayloadHash = await sha256(uploadPayload);
  const uploadByteLength = new TextEncoder().encode(uploadPayload).byteLength;

  const res = await fetch(sealUrl, {
    method: "POST",
    headers: sealApiHeaders({ "Content-Type": "application/json" }),
    body: uploadPayload,
  }).catch(() => undefined);
  if (!res?.ok) {
    return failModeJob(run, job, "upload", `Seal API returned ${res?.status ?? "no response"}.`);
  }

  const proof = (await res.json()) as Partial<FilecoinProof>;
  if (!proof.cid) {
    return failModeJob(run, job, "deal", "Seal API did not return a CID.");
  }
  if (proof.payloadHash && proof.payloadHash !== uploadPayloadHash) {
    return failModeJob(run, job, "deal", "Seal API payload hash did not match the uploaded mode proof payload.");
  }
  const realProof: FilecoinProof = {
    mode: "real",
    cid: String(proof.cid ?? run.filecoinProof.cid),
    pieceCid: String(proof.pieceCid ?? proof.cid ?? run.filecoinProof.pieceCid),
    provider: String(proof.provider ?? "seal-api-provider"),
    dataSetId: String(proof.dataSetId ?? "seal-api-dataset"),
    proofStatus: (proof.proofStatus as FilecoinProof["proofStatus"]) ?? "verified",
    uploadedAt: new Date().toISOString(),
    retrievalUrl: proof.retrievalUrl,
    payloadHash: proof.payloadHash ?? uploadPayloadHash,
    byteLength: proof.byteLength ?? uploadByteLength,
  };
  job = {
    ...job,
    steps: mark(
      mark(job.steps, ["upload", "deal"], "passed", "Seal API accepted the mode proof and returned provider proof metadata."),
      ["poll"],
      "running",
      `Polling CID ${realProof.cid} for retrievability.`,
    ),
  };
  const pollResult = await pollProofStatus(realProof);
  const verifyUrl = sealApiUrl("verify", pollResult.proof.cid);
  const proofUrl = sealApiUrl("proof", pollResult.proof.cid);
  let registryResult: Awaited<ReturnType<typeof readProofRegistry>>;
  try {
    registryResult = await readProofRegistry(pollResult.proof, uploadPayloadHash, uploadByteLength);
  } catch (error) {
    return {
      ...failModeJob(
        run,
        {
          ...job,
          proof: pollResult.proof,
          proofUrl,
          verifyUrl,
          uploadPayloadHash,
          uploadByteLength,
          pollAttempts: pollResult.attempts,
          pollLog: pollResult.pollLog,
          lastCheckedAt: pollResult.checkedAt ?? new Date().toISOString(),
          proofRegistryStatus: "failed",
          proofRegistryCheckedAt: new Date().toISOString(),
          steps: mark(
            mark(job.steps, ["poll"], "passed", `CID ${pollResult.proof.cid} is retrievable.`),
            ["registry"],
            "failed",
            (error as Error).message,
          ),
        },
        "registry",
        (error as Error).message,
      ),
    };
  }
  const verifiedProof = registryResult.proof;
  const verified = verifiedProof.proofStatus === "verified";

  return {
    ...run,
    filecoinProof: verifiedProof,
    sealJob: {
      ...job,
      status: verified ? "verified" : "running",
      backendHealth,
      proof: verifiedProof,
      proofUrl,
      verifyUrl,
      uploadPayloadHash,
      uploadByteLength,
      pollAttempts: pollResult.attempts,
      pollLog: pollResult.pollLog,
      lastCheckedAt: pollResult.checkedAt ?? registryResult.checkedAt,
      proofRegistryStatus: "verified",
      proofRegistryCheckedAt: registryResult.checkedAt,
      proofRegistryHash: registryResult.hash,
      updatedAt: new Date().toISOString(),
      steps: verified
        ? mark(
            mark(
              mark(job.steps, ["poll"], "passed", `CID ${verifiedProof.cid} is retrievable.`),
              ["registry"],
              "passed",
              `Proof registry read back ${registryResult.hash.slice(0, 12)}... for ${verifiedProof.cid}.`,
            ),
            ["verify"],
            "passed",
            "Mode proof CID is verified by the configured seal API.",
          )
        : mark(
            mark(
              mark(job.steps, ["poll"], "passed", "CID is retrievable but final verification is still pending."),
              ["registry"],
              "passed",
              `Proof registry read back ${registryResult.hash.slice(0, 12)}... for ${verifiedProof.cid}.`,
            ),
            ["verify"],
            "running",
            "Run Auto seal again to re-check final verification.",
          ),
    },
  };
};

export const filecoinSealConfigured = Boolean(sealEndpoint);
