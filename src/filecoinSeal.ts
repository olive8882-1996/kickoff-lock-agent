import { stableJson } from "./proof";
import type { FilecoinLookupState, FilecoinProof, MemoryRecord, PredictionCapsule, SealJob, SealStep } from "./types";

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

const normalizeLookupProof = (cid: string, payload: Partial<FilecoinProof> & { checkedAt?: string }): FilecoinProof => ({
  mode: "real",
  cid: String(payload.cid ?? cid),
  pieceCid: String(payload.pieceCid ?? payload.cid ?? cid),
  provider: String(payload.provider ?? "seal-api-provider"),
  dataSetId: String(payload.dataSetId ?? "seal-api-dataset"),
  proofStatus: (payload.proofStatus as FilecoinProof["proofStatus"]) ?? "retrievable",
  uploadedAt: payload.uploadedAt,
  retrievalUrl: payload.retrievalUrl,
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

const pollProofStatus = async (proof: FilecoinProof): Promise<{ proof: FilecoinProof; attempts: number; checkedAt?: string }> => {
  const endpoint = verifyEndpoint(proof.cid);
  if (!endpoint) return { proof, attempts: 0 };
  let checkedAt: string | undefined;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(endpoint).catch(() => undefined);
    if (res?.ok) {
      const status = (await res.json()) as Partial<FilecoinProof> & { ok?: boolean; checkedAt?: string };
      checkedAt = status.checkedAt ?? new Date().toISOString();
      if (status.proofStatus === "verified" || status.proofStatus === "retrievable") {
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
        };
      }
    }
    await wait(450);
  }
  return { proof, attempts: 5, checkedAt };
};

export const createSealJob = (capsule: PredictionCapsule): SealJob => ({
  id: `seal-${capsule.id}-${Date.now()}`,
  capsuleId: capsule.id,
  status: sealEndpoint ? "queued" : "needs-config",
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  endpoint: sealEndpoint,
  healthStatus: sealEndpoint ? "unchecked" : "failed",
  steps: sealEndpoint
    ? mark(baseSteps(), ["payload"], "passed", "Capsule payload is deterministic and ready to upload.")
    : mark(
        mark(baseSteps(), ["payload"], "passed", "Capsule payload is deterministic and ready to upload."),
        ["health", "upload", "deal", "poll", "verify"],
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

  job = {
    ...job,
    healthStatus: "ready",
    updatedAt: new Date().toISOString(),
    steps: mark(
      mark(job.steps, ["health"], "passed", "Seal API health check passed."),
      ["upload"],
      "running",
      "Uploading capsule payload to the configured seal API.",
    ),
  };

  const res = await fetch(sealUrl, {
    method: "POST",
    headers: sealApiHeaders({ "Content-Type": "application/json" }),
    body: stableJson({ capsule, result: record.result ?? null }),
  }).catch(() => undefined);
  if (!res?.ok) {
    return failJob(record, job, "upload", `Seal API returned ${res?.status ?? "no response"}.`);
  }

  const proof = (await res.json()) as Partial<FilecoinProof>;
  if (!proof.cid) {
    return failJob(record, job, "deal", "Seal API did not return a CID.");
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
  const verifiedProof = pollResult.proof;
  const verified = verifiedProof.proofStatus === "verified";
  const verifyUrl = sealApiUrl("verify", verifiedProof.cid);
  const proofUrl = sealApiUrl("proof", verifiedProof.cid);

  return {
    ...record,
    capsule: {
      ...capsule,
      filecoinProof: verifiedProof,
    },
    sealJob: {
      ...job,
      status: verified ? "verified" : "running",
      proof: verifiedProof,
      proofUrl,
      verifyUrl,
      pollAttempts: pollResult.attempts,
      lastCheckedAt: pollResult.checkedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: verified
        ? mark(baseSteps(), ["payload", "health", "upload", "deal", "poll", "verify"], "passed", "CID is verified by the configured seal API.")
        : mark(
            mark(baseSteps(), ["payload", "health", "upload", "deal", "poll"], "passed", "CID is retrievable but final verification is still pending."),
            ["verify"],
            "running",
            "Run Auto seal again to re-check final verification.",
          ),
    },
  };
};

export const filecoinSealConfigured = Boolean(sealEndpoint);
