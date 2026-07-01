import type { FilecoinProof, PredictionCapsule, PredictionDraft, Match } from "./types";

const encoder = new TextEncoder();

export const stableJson = (value: unknown): string => {
  const sort = (item: any): any => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      return Object.keys(item)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = sort(item[key]);
          return acc;
        }, {});
    }
    return item;
  };
  return JSON.stringify(sort(value), null, 2);
};

export const sha256 = async (input: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const pseudoCid = (hash: string, prefix: string) => `${prefix}${hash.slice(0, 46)}`;

export const createDemoProof = (hash: string): FilecoinProof => ({
  mode: "demo",
  cid: pseudoCid(hash, "bafy-kickoff-"),
  pieceCid: pseudoCid(hash.slice(8) + hash, "baga6ea4seaq"),
  provider: "demo-provider.fil",
  dataSetId: `demo-set-${hash.slice(0, 10)}`,
  proofStatus: "retrievable",
});

export const createCapsule = async (
  match: Match,
  prediction: PredictionDraft,
): Promise<PredictionCapsule> => {
  const now = new Date().toISOString();
  const base = {
    matchId: match.id,
    matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
    kickoffAt: match.kickoffAt,
    createdAt: now,
    prediction,
  };
  const hash = await sha256(stableJson(base));
  const kickoffTime = new Date(match.kickoffAt).getTime();
  const lateLock = Number.isFinite(kickoffTime) && Date.now() > kickoffTime;
  return {
    id: `cap-${hash.slice(0, 12)}`,
    ...base,
    sealedAt: now,
    payloadHash: hash,
    filecoinProof: createDemoProof(hash),
    locked: true,
    lateLock,
  };
};

export const applyRealProof = (
  capsule: PredictionCapsule,
  proofJson: string,
): PredictionCapsule => {
  const parsed = JSON.parse(proofJson) as Partial<FilecoinProof>;
  const required: Array<keyof FilecoinProof> = [
    "cid",
    "pieceCid",
    "provider",
    "dataSetId",
    "proofStatus",
  ];
  const missing = required.filter((field) => !parsed[field]);
  if (missing.length > 0) {
    throw new Error(`Missing proof fields: ${missing.join(", ")}`);
  }
  return {
    ...capsule,
    filecoinProof: {
      mode: "real",
      cid: String(parsed.cid),
      pieceCid: String(parsed.pieceCid),
      provider: String(parsed.provider),
      dataSetId: String(parsed.dataSetId),
      proofStatus: parsed.proofStatus as FilecoinProof["proofStatus"],
    },
  };
};
