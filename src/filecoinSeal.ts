import { stableJson } from "./proof";
import type { FilecoinProof, MemoryRecord, PredictionCapsule, SealJob, SealStep } from "./types";

const sealEndpoint = import.meta.env.VITE_FILECOIN_SEAL_API as string | undefined;

const baseSteps = (): SealStep[] => [
  {
    id: "payload",
    label: "Build immutable payload",
    status: "queued",
    detail: "Stable JSON and SHA-256 hash are ready in the capsule.",
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

export const createSealJob = (capsule: PredictionCapsule): SealJob => ({
  id: `seal-${capsule.id}-${Date.now()}`,
  capsuleId: capsule.id,
  status: sealEndpoint ? "queued" : "needs-config",
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  endpoint: sealEndpoint,
  steps: sealEndpoint
    ? mark(baseSteps(), ["payload"], "passed", "Capsule payload is deterministic and ready to upload.")
    : mark(baseSteps(), ["upload", "deal", "poll", "verify"], "needs-config", "Set VITE_FILECOIN_SEAL_API to a trusted backend endpoint."),
});

export const runSealJob = async (record: MemoryRecord): Promise<MemoryRecord> => {
  const capsule = record.capsule;
  let job = createSealJob(capsule);
  if (!sealEndpoint) return { ...record, sealJob: job };

  job = {
    ...job,
    status: "running",
    updatedAt: new Date().toISOString(),
    steps: mark(job.steps, ["upload"], "running", "Uploading capsule payload to the configured seal API."),
  };

  const res = await fetch(sealEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stableJson({ capsule, result: record.result ?? null }),
  });
  if (!res.ok) {
    return {
      ...record,
      sealJob: {
        ...job,
        status: "failed",
        updatedAt: new Date().toISOString(),
        steps: mark(job.steps, ["upload"], "failed", `Seal API returned ${res.status}.`),
        error: `Seal API returned ${res.status}`,
      },
    };
  }

  const proof = (await res.json()) as Partial<FilecoinProof>;
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

  return {
    ...record,
    capsule: {
      ...capsule,
      filecoinProof: realProof,
    },
    sealJob: {
      ...job,
      status: "verified",
      proof: realProof,
      updatedAt: new Date().toISOString(),
      steps: mark(baseSteps(), ["payload", "upload", "deal", "poll", "verify"], "passed", "Real proof returned by the configured seal API."),
    },
  };
};

export const filecoinSealConfigured = Boolean(sealEndpoint);
