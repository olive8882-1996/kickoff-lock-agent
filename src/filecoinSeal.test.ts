import { describe, expect, it } from "vitest";
import { lookupFilecoinProof, runSealJob, sealApiUrl } from "./filecoinSeal";
import type { MemoryRecord } from "./types";

const record: MemoryRecord = {
  capsule: {
    id: "cap-seal",
    matchId: "m1",
    matchLabel: "A vs B",
    kickoffAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2098-12-31T00:00:00.000Z",
    sealedAt: "2098-12-31T00:00:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: "bafy",
      pieceCid: "piece",
      provider: "demo",
      dataSetId: "set",
      proofStatus: "retrievable",
    },
    prediction: {
      homeScore: 1,
      awayScore: 0,
      winner: "A",
      keyPlayers: [],
      confidence: 55,
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
      markets: [],
    },
  },
};

describe("Filecoin seal workflow", () => {
  it("marks workflow as needing configuration when no seal API exists", async () => {
    const updated = await runSealJob(record);
    expect(updated.sealJob?.status).toBe("needs-config");
    expect(updated.sealJob?.steps.some((step) => step.status === "needs-config")).toBe(true);
  });

  it("builds proof and verify URLs from a seal endpoint", () => {
    expect(sealApiUrl("verify", "bafy123", "https://seal.example/seal")).toBe(
      "https://seal.example/verify?cid=bafy123",
    );
    expect(sealApiUrl("proof", "bafy123", "https://seal.example/seal")).toBe(
      "https://seal.example/proof/bafy123",
    );
  });

  it("reports needs-config for CID lookup without a seal API", async () => {
    const result = await lookupFilecoinProof("bafy123");
    expect(result.status).toBe("needs-config");
    expect(result.message).toContain("VITE_FILECOIN_SEAL_API");
  });
});
