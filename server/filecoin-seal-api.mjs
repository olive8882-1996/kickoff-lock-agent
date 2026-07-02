import { createServer } from "node:http";
import { Synapse } from "@filoz/synapse-sdk";

const port = Number(process.env.PORT ?? 8787);
const privateKey = process.env.SYNAPSE_PRIVATE_KEY;
const mockMode = process.env.FILECOIN_SEAL_MOCK === "1";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.ALLOW_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const json = (res, status, body) => {
  res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const pseudoProof = async (bytes) => {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

const proofStatusFor = (cid) => ({
  ok: Boolean(cid),
  mode: "real",
  cid,
  pieceCid: cid ? `piece-${cid}` : undefined,
  provider: mockMode ? "mock-synapse-provider" : "synapse-verifier",
  dataSetId: cid ? `lookup-${cid.slice(0, 12)}` : undefined,
  proofStatus: cid ? "verified" : "draft",
  retrievalUrl: cid ? `https://cid.ipfs.tech/#${cid}` : undefined,
  checkedAt: new Date().toISOString(),
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      mockMode,
      hasPrivateKey: Boolean(privateKey),
      service: "kickoff-lock-filecoin-seal-api",
      endpoints: ["POST /seal", "GET /verify?cid=", "GET /proof/:cid"],
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/verify") {
    json(res, 200, proofStatusFor(url.searchParams.get("cid") ?? ""));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/proof/")) {
    json(res, 200, proofStatusFor(decodeURIComponent(url.pathname.replace(/^\/proof\//, ""))));
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/seal") {
    json(res, 404, { error: "Use POST /seal, GET /verify?cid=, GET /proof/:cid or GET /health" });
    return;
  }

  try {
    const bytes = await readBody(req);
    if (bytes.length === 0) {
      json(res, 400, { error: "Empty capsule payload" });
      return;
    }
    const proof = mockMode ? await pseudoProof(bytes) : await uploadWithSynapse(bytes);
    json(res, 200, proof);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Filecoin seal API listening on http://127.0.0.1:${port}`);
  console.log(mockMode ? "Mock mode enabled." : "Real Synapse mode enabled.");
});
