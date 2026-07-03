import { describe, expect, it } from "vitest";
import { buildModeProofTimeline, buildRecordProofTimeline } from "./proofTimeline";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

const artifact: ShareArtifactEvidence = {
  id: "cap-1",
  kind: "record",
  proofUrl: "https://example.com/?proof=cap-1",
  imageGenerated: true,
  generatedAt: "2026-07-03T00:05:00.000Z",
  imageMime: "image/png",
  imageHash: "a".repeat(64),
};

const record: MemoryRecord = {
  capsule: {
    id: "cap-1",
    matchId: "match-1",
    matchLabel: "Brazil vs Japan",
    kickoffAt: "2026-06-20T19:00:00.000Z",
    createdAt: "2026-07-03T00:00:00.000Z",
    sealedAt: "2026-07-03T00:01:00.000Z",
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Brazil",
      keyPlayers: ["No. 10"],
      confidence: 72,
      style: "analysis",
      reasoning: "test",
      agentSummary: "test summary",
      markets: [],
    },
    payloadHash: "b".repeat(64),
    filecoinProof: {
      mode: "real",
      cid: "bafy-real-record",
      pieceCid: "baga-real-record",
      provider: "provider",
      dataSetId: "dataset",
      proofStatus: "retrievable",
      uploadedAt: "2026-07-03T00:02:00.000Z",
    },
    locked: true,
    lateLock: false,
  },
  result: {
    id: "result-1",
    capsuleId: "cap-1",
    revealedAt: "2026-07-03T00:06:00.000Z",
    homeScore: 2,
    awayScore: 1,
    keyPlayers: ["No. 10"],
    source: "manual",
    totalScore: 92,
    breakdown: { winner: 30, exactScore: 30, goalDifference: 12, markets: 8, keyPlayer: 4, confidence: 4, reasoning: 4 },
    explanation: [],
    agentReview: [],
  },
};

describe("public proof timeline", () => {
  it("builds a passed timeline for a revealed real prediction proof with share evidence", () => {
    const timeline = buildRecordProofTimeline(record, artifact);

    expect(timeline.map((item) => item.label)).toEqual([
      "Prediction locked",
      "Payload fingerprinted",
      "Filecoin proof attached",
      "Share image manifest",
      "Result revealed",
    ]);
    expect(timeline.every((item) => item.status === "passed")).toBe(true);
    expect(timeline.find((item) => item.id === "result")?.detail).toContain("92/100");
  });

  it("keeps demo and missing share evidence visible as pending", () => {
    const timeline = buildRecordProofTimeline({
      ...record,
      capsule: {
        ...record.capsule,
        filecoinProof: { ...record.capsule.filecoinProof, mode: "demo" },
      },
      result: undefined,
    });

    expect(timeline.find((item) => item.id === "filecoin")?.status).toBe("pending");
    expect(timeline.find((item) => item.id === "share")?.status).toBe("pending");
    expect(timeline.find((item) => item.id === "result")?.detail).toBe("Awaiting final score");
  });

  it("builds a mode proof timeline with linked locks and share evidence", () => {
    const run: GameModeRun = {
      id: "mode-1",
      modeId: "bracket",
      title: "Bracket path",
      createdAt: "2026-07-03T00:00:00.000Z",
      capsuleIds: ["cap-1"],
      payloadHash: "c".repeat(64),
      filecoinProof: {
        mode: "real",
        cid: "bafy-real-mode",
        pieceCid: "baga-real-mode",
        provider: "provider",
        dataSetId: "dataset",
        proofStatus: "verified",
      },
      status: "scored",
      score: 88,
      summary: "Mode proof",
      requirements: ["one lock"],
    };
    const timeline = buildModeProofTimeline(run, { ...artifact, id: "mode-1", kind: "mode" });

    expect(timeline.find((item) => item.id === "created")?.detail).toContain("1 linked lock");
    expect(timeline.find((item) => item.id === "score")?.status).toBe("passed");
    expect(timeline.find((item) => item.id === "share")?.label).toBe("Mode share image manifest");
  });
});
