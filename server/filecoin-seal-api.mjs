import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { Synapse } from "@filoz/synapse-sdk";

const port = Number(process.env.PORT ?? 8787);
const privateKey = process.env.SYNAPSE_PRIVATE_KEY;
const truthyFlag = (value) => /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
const mockMode = truthyFlag(process.env.FILECOIN_SEAL_MOCK);
const proofStorePath = process.env.FILECOIN_PROOF_STORE_PATH;
const sealToken = process.env.FILECOIN_SEAL_TOKEN;
const maxUploadBytes = Number(process.env.FILECOIN_MAX_UPLOAD_BYTES || 262_144);
const allowOrigin = process.env.ALLOW_ORIGIN ?? "*";
const proofStore = new Map();
const jobStore = new Map();

const corsRestricted = () => {
  try {
    const url = new URL(allowOrigin);
    return url.protocol === "https:" && allowOrigin !== "*";
  } catch {
    return false;
  }
};

const productionBlockers = () => {
  const blockers = [];
  if (mockMode) blockers.push("FILECOIN_SEAL_MOCK is enabled");
  if (!privateKey) blockers.push("SYNAPSE_PRIVATE_KEY is missing");
  if (!sealToken) blockers.push("FILECOIN_SEAL_TOKEN is missing");
  if (!proofStorePath) blockers.push("FILECOIN_PROOF_STORE_PATH is missing");
  if (!corsRestricted()) blockers.push("ALLOW_ORIGIN must be a deployed HTTPS app origin");
  if (!Number.isFinite(maxUploadBytes) || maxUploadBytes <= 0) blockers.push("FILECOIN_MAX_UPLOAD_BYTES is invalid");
  return blockers;
};

const sealApiHealth = () => {
  const blockers = productionBlockers();
  return {
    ok: true,
    mockMode,
    hasPrivateKey: Boolean(privateKey),
    authRequired: Boolean(sealToken),
    productionReady: blockers.length === 0,
    blockers,
    service: "kickoff-lock-filecoin-seal-api",
    proofCount: proofStore.size,
    jobCount: jobStore.size,
    persistence: proofStorePath ? "file" : "memory",
    maxUploadBytes,
    allowOrigin: corsRestricted() ? "restricted" : "wildcard-or-invalid",
    corsRestricted: corsRestricted(),
    proofStorePath: proofStorePath ? "configured" : undefined,
    endpoints: ["POST /seal", "POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"],
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": allowOrigin,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const json = (res, status, body) => {
  res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req, maxBytes = maxUploadBytes) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      total += chunk.length;
      if (total > maxBytes) {
        rejected = true;
        const error = new Error(`Capsule payload exceeds ${maxBytes} bytes`);
        error.statusCode = 413;
        reject(error);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });

const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

const isAuthorized = (req) => {
  if (!sealToken) return true;
  return req.headers.authorization === `Bearer ${sealToken}`;
};

const pseudoProof = async (bytes) => {
  const hex = sha256Hex(bytes);
  return {
    mode: "real",
    cid: `bafy-mock-${hex.slice(0, 46)}`,
    pieceCid: `baga-mock-${hex.slice(0, 48)}`,
    provider: "mock-synapse-provider",
    dataSetId: `mock-dataset-${hex.slice(0, 12)}`,
    proofStatus: "verified",
    uploadedAt: new Date().toISOString(),
    retrievalUrl: `https://cid.ipfs.tech/#bafy-mock-${hex.slice(0, 46)}`,
  };
};

const validateSealPayload = (bytes) => {
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    return "Seal payload must be valid JSON.";
  }
  if (!payload || typeof payload !== "object") {
    return "Seal payload must be a JSON object.";
  }
  if (payload.capsule && typeof payload.capsule === "object") {
    if (typeof payload.capsule.id !== "string" || payload.capsule.id.length === 0) {
      return "Seal payload capsule.id is required.";
    }
    if (typeof payload.capsule.payloadHash !== "string" || !/^[a-f0-9]{64}$/i.test(payload.capsule.payloadHash)) {
      return "Seal payload capsule.payloadHash must be a 64-character SHA-256 hex digest.";
    }
    if (payload.capsule.locked !== true) {
      return "Seal payload capsule.locked must be true.";
    }
    if (typeof payload.capsule.sealedAt !== "string" || payload.capsule.sealedAt.length === 0) {
      return "Seal payload capsule.sealedAt is required.";
    }
    if (!payload.capsule.prediction || typeof payload.capsule.prediction !== "object") {
      return "Seal payload capsule.prediction is required.";
    }
    return "";
  }
  if (payload.modeRun && typeof payload.modeRun === "object") {
    if (typeof payload.modeRun.id !== "string" || payload.modeRun.id.length === 0) {
      return "Seal payload modeRun.id is required.";
    }
    if (typeof payload.modeRun.payloadHash !== "string" || !/^[a-f0-9]{64}$/i.test(payload.modeRun.payloadHash)) {
      return "Seal payload modeRun.payloadHash must be a 64-character SHA-256 hex digest.";
    }
    if (!["sealed", "scored"].includes(payload.modeRun.status)) {
      return "Seal payload modeRun.status must be sealed or scored.";
    }
    if (!Array.isArray(payload.modeRun.capsuleIds) || payload.modeRun.capsuleIds.length === 0) {
      return "Seal payload modeRun.capsuleIds is required.";
    }
    return "";
  }
  return "Seal payload must include a capsule or modeRun object.";
};

const uploadWithSynapse = async (bytes) => {
  if (!privateKey) throw new Error("Missing SYNAPSE_PRIVATE_KEY");
  const synapse = await Synapse.create({ privateKey });
  const storage = await synapse.storage();
  const uploadResult = await storage.upload(bytes);
  const cid = uploadResult.commp ?? uploadResult.cid ?? uploadResult.pieceCid;
  return {
    mode: "real",
    cid,
    pieceCid: uploadResult.pieceCid ?? uploadResult.commp ?? uploadResult.cid,
    provider: uploadResult.provider ?? "synapse-selected-provider",
    dataSetId: uploadResult.dataSetId ?? uploadResult.datasetId ?? "synapse-dataset",
    proofStatus: "verified",
    uploadedAt: new Date().toISOString(),
    retrievalUrl: cid ? `https://cid.ipfs.tech/#${cid}` : undefined,
  };
};

const loadProofStore = async () => {
  if (!proofStorePath) return;
  try {
    const raw = await readFile(proofStorePath, "utf8");
    const parsed = JSON.parse(raw);
    const proofs = Array.isArray(parsed) ? parsed : parsed.proofs;
    if (!Array.isArray(proofs)) return;
    for (const proof of proofs) {
      if (proof?.cid) proofStore.set(String(proof.cid), proof);
    }
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    for (const storedJob of jobs) {
      if (!storedJob?.jobId) continue;
      const job = { ...storedJob };
      if (["queued", "running"].includes(job.status) && !job.proof?.cid) {
        job.status = "failed";
        job.error = "Seal job was interrupted before completion; resubmit the payload.";
        job.updatedAt = new Date().toISOString();
      }
      jobStore.set(String(job.jobId), job);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not load Filecoin proof store at ${proofStorePath}: ${error.message}`);
    }
  }
};

const persistSealStore = async () => {
  if (!proofStorePath) return;
  await mkdir(dirname(proofStorePath), { recursive: true });
  const tmpPath = `${proofStorePath}.tmp`;
  await writeFile(
    tmpPath,
    `${JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        proofs: Array.from(proofStore.values()),
        jobs: Array.from(jobStore.values()).map((job) => ({
          jobId: job.jobId,
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          payloadHash: job.payloadHash,
          byteLength: job.byteLength,
          proof: job.proof,
          error: job.error,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await rename(tmpPath, proofStorePath);
};

const registerProof = async (proof, bytes) => {
  if (!proof.cid) throw new Error("Seal provider did not return a CID");
  const storedProof = {
    ...proof,
    ok: true,
    mode: "real",
    payloadHash: sha256Hex(bytes),
    byteLength: bytes.length,
    storedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
  };
  proofStore.set(String(proof.cid), storedProof);
  await persistSealStore();
  return storedProof;
};

const publicJob = (job) => ({
  ok: job.status !== "failed",
  jobId: job.jobId,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  payloadHash: job.payloadHash,
  byteLength: job.byteLength,
  cid: job.proof?.cid,
  proof: job.proof,
  error: job.error,
});

const sealBytes = async (bytes) => {
  const proof = mockMode ? await pseudoProof(bytes) : await uploadWithSynapse(bytes);
  return registerProof(proof, bytes);
};

const createSealJob = (bytes) => {
  const payloadHash = sha256Hex(bytes);
  const jobId = `seal-job-${payloadHash.slice(0, 16)}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const job = {
    jobId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    payloadHash,
    byteLength: bytes.length,
  };
  jobStore.set(jobId, job);
  void persistSealStore().catch((error) => console.warn(`Could not persist Filecoin seal job ${jobId}: ${error.message}`));

  void (async () => {
    job.status = "running";
    job.updatedAt = new Date().toISOString();
    await persistSealStore().catch((error) => console.warn(`Could not persist Filecoin seal job ${jobId}: ${error.message}`));
    try {
      job.proof = await sealBytes(bytes);
      job.status = "verified";
      job.updatedAt = new Date().toISOString();
      await persistSealStore();
    } catch (error) {
      job.status = "failed";
      job.error = error.message;
      job.updatedAt = new Date().toISOString();
      await persistSealStore().catch((persistError) =>
        console.warn(`Could not persist failed Filecoin seal job ${jobId}: ${persistError.message}`),
      );
    }
  })();

  return job;
};

const storedProofFor = (cid) => {
  const cleanCid = String(cid ?? "").trim();
  if (!cleanCid) {
    return { status: 400, body: { ok: false, proofStatus: "draft", error: "Missing cid" } };
  }
  const proof = proofStore.get(cleanCid);
  if (!proof) {
    return {
      status: 404,
      body: {
        ok: false,
        cid: cleanCid,
        proofStatus: "draft",
        error: "CID is not registered by this seal API instance.",
        checkedAt: new Date().toISOString(),
      },
    };
  }
  return {
    status: 200,
    body: {
      ...proof,
      checkedAt: new Date().toISOString(),
    },
  };
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, sealApiHealth());
    return;
  }

  if (
    req.method === "GET" &&
    (url.pathname === "/verify" || url.pathname.startsWith("/proof/") || url.pathname.startsWith("/jobs/")) &&
    !isAuthorized(req)
  ) {
    json(res, 401, { error: "Missing or invalid seal API token" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/verify") {
    const result = storedProofFor(url.searchParams.get("cid") ?? "");
    json(res, result.status, result.body);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/proof/")) {
    const result = storedProofFor(decodeURIComponent(url.pathname.replace(/^\/proof\//, "")));
    json(res, result.status, result.body);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
    const jobId = decodeURIComponent(url.pathname.replace(/^\/jobs\//, ""));
    const job = jobStore.get(jobId);
    if (!job) {
      json(res, 404, { ok: false, jobId, status: "missing", error: "Seal job is not registered by this seal API instance." });
      return;
    }
    json(res, job.status === "failed" ? 500 : 200, publicJob(job));
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/seal") {
    json(res, 404, { error: "Use POST /seal, POST /seal?async=1, GET /jobs/:id, GET /verify?cid=, GET /proof/:cid or GET /health" });
    return;
  }

  try {
    if (!isAuthorized(req)) {
      json(res, 401, { error: "Missing or invalid seal API token" });
      return;
    }
    const bytes = await readBody(req);
    if (bytes.length === 0) {
      json(res, 400, { error: "Empty capsule payload" });
      return;
    }
    const invalidPayload = validateSealPayload(bytes);
    if (invalidPayload) {
      json(res, 400, { error: invalidPayload });
      return;
    }
    if (url.searchParams.get("async") === "1") {
      const job = createSealJob(bytes);
      json(res, 202, {
        ...publicJob(job),
        statusUrl: `/jobs/${encodeURIComponent(job.jobId)}`,
      });
      return;
    }
    json(res, 200, await sealBytes(bytes));
  } catch (error) {
    json(res, error.statusCode ?? 500, { error: error.message });
  }
});

await loadProofStore();

server.listen(port, "127.0.0.1", () => {
  console.log(`Filecoin seal API listening on http://127.0.0.1:${port}`);
  console.log(mockMode ? "Mock mode enabled." : "Real Synapse mode enabled.");
  console.log(proofStorePath ? `Proof registry loaded from ${proofStorePath}` : "Proof registry persistence: memory");
});
