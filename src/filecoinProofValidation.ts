import type { FilecoinProof } from "./types";

const suspiciousToken = /(^|[^a-z0-9])(mock|demo|seed|kickoff|pseudo)([^a-z0-9]|$)/i;
const placeholderValues = new Set(["seal-api-provider", "seal-api-dataset"]);

const suspiciousValue = (value: string) => suspiciousToken.test(value) || placeholderValues.has(value.trim().toLowerCase());

export const filecoinCidProblem = (cid: string | undefined, label = "CID") => {
  const value = cid?.trim() ?? "";
  if (!value) return `${label} missing`;
  if (!value.startsWith("bafy")) return `${label} must be a Filecoin/IPFS CID that starts with bafy`;
  if (suspiciousValue(value)) return `${label} looks like mock, demo or seed data`;
  return "";
};

export const filecoinProofMetadataProblems = (
  proof: Partial<FilecoinProof> | undefined,
  options: {
    cid?: string;
    expectedPayloadHash?: string;
    expectedByteLength?: number;
    label?: string;
  } = {},
) => {
  const label = options.label ?? "proof";
  const problems: string[] = [];
  if (!proof) return [`${label} missing`];

  const cid = proof.cid?.trim() ?? "";
  const expectedCid = options.cid?.trim() ?? "";
  const cidProblem = filecoinCidProblem(cid, `${label} CID`);
  if (cidProblem) problems.push(cidProblem);
  if (expectedCid && cid !== expectedCid) problems.push(`${label} CID mismatch`);
  if (proof.mode !== "real") problems.push(`${label} mode must be real`);

  ([
    ["pieceCid", "piece CID"],
    ["provider", "provider"],
    ["dataSetId", "data set id"],
  ] as const).forEach(([key, human]) => {
    const value = String(proof[key] ?? "").trim();
    if (!value) {
      problems.push(`${label} ${human} missing`);
    } else if (suspiciousValue(value)) {
      problems.push(`${label} ${human} looks like mock, demo or placeholder data`);
    }
  });

  if (!["retrievable", "verified"].includes(String(proof.proofStatus ?? ""))) {
    problems.push(`${label} proof status must be retrievable or verified`);
  }
  if (options.expectedPayloadHash && proof.payloadHash !== options.expectedPayloadHash) {
    problems.push(`${label} payload hash mismatch`);
  }
  if (options.expectedByteLength && proof.byteLength !== options.expectedByteLength) {
    problems.push(`${label} byte length mismatch`);
  }

  return problems;
};
