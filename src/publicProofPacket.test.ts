import { describe, expect, it } from "vitest";
import {
  buildModeVerifierPacket,
  buildProfileVerifierPacket,
  buildRecordVerifierPacket,
  verifierPacketPreview,
} from "./publicProofPacket";
import type { GameModeRun, MemoryRecord, PublicProfile, ShareArtifactEvidence } from "./types";

const artifact: ShareArtifactEvidence = {
  id: "cap-1",
  kind: "record",
  proofUrl: "https://example.com/?proof=cap-1",
  imageGenerated: true,
  imageUrl: "https://cdn.example.com/card.png",
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
      cid: "bafy-record",
      pieceCid: "baga-record",
      provider: "provider",
      dataSetId: "dataset",
      proofStatus: "retrievable",
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

describe("public verifier packets", () => {
  it("builds a copyable prediction proof packet", () => {
    const packet = buildRecordVerifierPacket(record, "https://example.com/?proof=cap-1", artifact);

    expect(packet.kind).toBe("proof");
    expect(packet.text).toContain("Brazil vs Japan");
    expect(packet.text).toContain("CID: bafy-record");
    expect(packet.text).toContain("https://cdn.example.com/card.png");
    expect(verifierPacketPreview(packet)).toContain("proof:cap-1");
  });

  it("builds a mode proof packet with linked lock count", () => {
    const run: GameModeRun = {
      id: "mode-1",
      modeId: "bracket",
      title: "Bracket path",
      createdAt: "2026-07-03T00:00:00.000Z",
      capsuleIds: ["cap-1", "cap-2"],
      payloadHash: "c".repeat(64),
      filecoinProof: {
        mode: "real",
        cid: "bafy-mode",
        pieceCid: "baga-mode",
        provider: "provider",
        dataSetId: "dataset",
        proofStatus: "verified",
      },
      status: "scored",
      score: 88,
      summary: "Mode proof",
      requirements: ["two locks"],
    };

    const packet = buildModeVerifierPacket(run, "https://example.com/?mode=mode-1");

    expect(packet.text).toContain("Mode proof: Bracket path");
    expect(packet.text).toContain("Linked locks: 2");
    expect(packet.text).toContain("Share image: not publicly hosted yet");
  });

  it("builds a profile packet from public profile totals", () => {
    const profile: PublicProfile = {
      id: "user-1",
      displayName: "Kickoff Analyst",
      location: "Chengdu",
      records: [record],
      modeRuns: [],
      shareArtifacts: [artifact],
      locks: 1,
      revealed: 1,
      modeProofs: 0,
      averageScore: 92,
      bestScore: 92,
      xp: 212,
    };

    const packet = buildProfileVerifierPacket(profile, "https://example.com/?profile=user-1");

    expect(packet.text).toContain("Profile: Kickoff Analyst");
    expect(packet.text).toContain("1 locks");
    expect(packet.text).toContain("Latest CID: bafy-record");
  });
});
