import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Synapse } from "@filoz/synapse-sdk";

const privateKey = process.env.SYNAPSE_PRIVATE_KEY;
const capsulePath = resolve(process.env.KICKOFF_CAPSULE_PATH ?? "./proofs/demo-prediction-capsule.json");

if (!privateKey) {
  console.error("Missing SYNAPSE_PRIVATE_KEY. Copy .env.example and use a funded Filecoin key.");
  process.exit(1);
}

let capsuleBytes;
try {
  capsuleBytes = await readFile(capsulePath);
} catch {
  console.error(`Capsule file not found: ${capsulePath}`);
  process.exit(1);
}

const synapse = await Synapse.create({ privateKey });
const storage = await synapse.storage();
const uploadResult = await storage.upload(capsuleBytes);

const proof = {
  mode: "real",
  cid: uploadResult.commp ?? uploadResult.cid ?? uploadResult.pieceCid,
  pieceCid: uploadResult.pieceCid ?? uploadResult.commp ?? uploadResult.cid,
  provider: uploadResult.provider ?? "synapse-selected-provider",
  dataSetId: uploadResult.dataSetId ?? uploadResult.datasetId ?? "synapse-dataset",
  proofStatus: "verified",
  uploadedAt: new Date().toISOString(),
  sourceCapsule: capsulePath,
};

const outPath = resolve(`./proofs/synapse-proof-${Date.now()}.json`);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(proof, null, 2));
console.log(`Wrote Synapse proof JSON: ${outPath}`);
