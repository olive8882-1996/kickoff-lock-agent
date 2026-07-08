import { describe, expect, it } from "vitest";
import { buildModeProofMeta, buildProfileMeta, buildRecordProofMeta } from "./publicProofMeta";
import type { GameModeRun, MemoryRecord, PublicProfile, ShareArtifactEvidence } from "./types";

const record: MemoryRecord = {
  capsule: {
    id: "cap-meta",
    matchId: "match-1",
    matchLabel: "Brazil vs Japan",
    kickoffAt: "2099-07-02T20:00:00.000Z",
    createdAt: "2099-07-01T20:00:00.000Z",
    sealedAt: "2099-07-01T21:00:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "real",
      cid: "bafy-real-meta",
      pieceCid: "baga-real-meta",
      provider: "synapse",
      dataSetId: "dataset",
      proofStatus: "verified",
    },
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Brazil",
      keyPlayers: ["No. 10"],
      confidence: 66,
      style: "analysis",
      reasoning: "Brazil should create enough pressure to win narrowly.",
      agentSummary: "Agent sees late goal pressure.",
      markets: [],
    },
  },
  result: {
    id: "result-meta",
    capsuleId: "cap-meta",
    revealedAt: "2099-07-02T22:00:00.000Z",
    homeScore: 2,
    awayScore: 1,
    keyPlayers: ["No. 10"],
    source: "manual",
    totalScore: 91,
    breakdown: {
      winner: 24,
      exactScore: 24,
      goalDifference: 12,
      markets: 0,
      keyPlayer: 10,
      confidence: 10,
      reasoning: 11,
    },
    explanation: [],
    agentReview: [],
  },
};

const modeRun: GameModeRun = {
  id: "mode-meta",
  modeId: "parlay",
  title: "Multi-match parlay",
  createdAt: "2099-07-02T20:00:00.000Z",
  capsuleIds: ["cap-1", "cap-2", "cap-3"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "real",
    cid: "bafy-mode-meta",
    pieceCid: "baga-mode-meta",
    provider: "synapse",
    dataSetId: "dataset",
    proofStatus: "verified",
  },
  status: "scored",
  score: 82,
  summary: "Parlay proof sealed and scored.",
  requirements: ["3 sealed match capsules"],
};

const artifact: ShareArtifactEvidence = {
  id: "cap-meta",
  kind: "record",
  proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-meta",
  imageGenerated: true,
  generatedAt: "2099-07-02T20:00:00.000Z",
  fileName: "cap-meta-public-proof.png",
  imageUrl: "https://cdn.example.com/kickoff-lock/cap-meta-public-proof.png",
  imageMime: "image/png",
  imageByteLength: 123456,
  imageHash: "c".repeat(64),
};

describe("public proof metadata", () => {
  it("builds social and structured metadata for a public record proof", () => {
    const meta = buildRecordProofMeta(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-meta",
      "/kickoff-lock-agent/assets/kickoff-lock-icon.png",
      artifact,
    );

    expect(meta.title).toContain("Brazil vs Japan");
    expect(meta.description).toContain("Prediction 2-1");
    expect(meta.canonicalUrl).toContain("?proof=cap-meta");
    expect(meta.twitterCard).toBe("summary_large_image");
    expect(meta.imageUrl).toBe("https://cdn.example.com/kickoff-lock/cap-meta-public-proof.png");
    expect(meta.jsonLd.image).toBe("https://cdn.example.com/kickoff-lock/cap-meta-public-proof.png");
    expect(meta.imageManifest?.imageUrl).toBe("https://cdn.example.com/kickoff-lock/cap-meta-public-proof.png");
    expect(meta.imageManifest?.imageHash).toBe("c".repeat(64));
    expect(meta.imageManifest?.imageByteLength).toBe(123456);
    expect(meta.imageManifest?.imageMime).toBe("image/png");
    expect(meta.jsonLd.associatedMedia).toMatchObject({
      "@type": "ImageObject",
      name: "cap-meta-public-proof.png",
      url: "https://cdn.example.com/kickoff-lock/cap-meta-public-proof.png",
      contentUrl: "https://cdn.example.com/kickoff-lock/cap-meta-public-proof.png",
      encodingFormat: "image/png",
      contentSize: 123456,
      sha256: "c".repeat(64),
    });
    expect(meta.jsonLd["@type"]).toBe("CreativeWork");
    expect(meta.jsonLd.sha256).toBe("a".repeat(64));
  });

  it("builds metadata for mode proof pages", () => {
    const modeArtifact: ShareArtifactEvidence = {
      ...artifact,
      id: "mode-meta",
      kind: "mode",
      proofUrl: "https://example.com/kickoff-lock-agent/?mode=mode-meta",
      imageUrl: "https://cdn.example.com/kickoff-lock/mode-meta-public-proof.png",
    };
    const meta = buildModeProofMeta(
      modeRun,
      "https://example.com/kickoff-lock-agent/?mode=mode-meta",
      "assets/kickoff-lock-icon.png",
      modeArtifact,
    );

    expect(meta.kind).toBe("mode");
    expect(meta.title).toContain("Multi-match parlay");
    expect(meta.description).toContain("3 linked locks");
    expect(meta.imageUrl).toBe("https://cdn.example.com/kickoff-lock/mode-meta-public-proof.png");
    expect(meta.jsonLd.identifier).toBe("mode-meta");
    expect(meta.jsonLd.isBasedOn).toBe("bafy-mode-meta");
    expect(meta.jsonLd.associatedMedia).toMatchObject({
      "@type": "ImageObject",
      contentUrl: "https://cdn.example.com/kickoff-lock/mode-meta-public-proof.png",
      sha256: "c".repeat(64),
    });
  });

  it("does not attach a share image manifest from a different public proof URL", () => {
    const meta = buildRecordProofMeta(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-meta",
      "/kickoff-lock-agent/assets/kickoff-lock-icon.png",
      {
        ...artifact,
        proofUrl: "https://example.com/kickoff-lock-agent/?proof=another-proof",
        imageUrl: "https://cdn.example.com/kickoff-lock/another-proof-card.png",
      },
    );

    expect(meta.imageUrl).toBe("https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png");
    expect(meta.jsonLd.image).toBe("https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png");
    expect(meta.imageManifest).toBeUndefined();
    expect(meta.jsonLd.associatedMedia).toBeUndefined();
  });

  it("does not attach a share image manifest from a different proof target identity", () => {
    const meta = buildRecordProofMeta(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-meta",
      "/kickoff-lock-agent/assets/kickoff-lock-icon.png",
      {
        ...artifact,
        id: "mode-meta",
        kind: "mode",
        proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-meta",
        imageUrl: "https://cdn.example.com/kickoff-lock/mode-meta-card.png",
      },
    );

    expect(meta.imageUrl).toBe("https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png");
    expect(meta.imageManifest).toBeUndefined();
    expect(meta.jsonLd.associatedMedia).toBeUndefined();
  });

  it("does not attach a mode share image manifest from a different mode proof URL", () => {
    const meta = buildModeProofMeta(
      modeRun,
      "https://example.com/kickoff-lock-agent/?mode=mode-meta",
      "assets/kickoff-lock-icon.png",
      {
        ...artifact,
        id: "mode-other",
        kind: "mode",
        proofUrl: "https://example.com/kickoff-lock-agent/?mode=mode-other",
        imageUrl: "https://cdn.example.com/kickoff-lock/mode-other-card.png",
      },
    );

    expect(meta.imageUrl).toBe("https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png");
    expect(meta.jsonLd.image).toBe("https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png");
    expect(meta.imageManifest).toBeUndefined();
    expect(meta.jsonLd.associatedMedia).toBeUndefined();
  });

  it("builds metadata for public profiles", () => {
    const profile: PublicProfile = {
      id: "user-meta",
      displayName: "Kickoff Analyst",
      location: "Chengdu",
      records: [record],
      modeRuns: [modeRun],
      shareArtifacts: [artifact],
      locks: 1,
      revealed: 1,
      modeProofs: 1,
      averageScore: 91,
      bestScore: 91,
      xp: 320,
    };
    const meta = buildProfileMeta(
      profile,
      "https://example.com/kickoff-lock-agent/?profile=user-meta",
      "/kickoff-lock-agent/assets/kickoff-lock-icon.png",
    );

    expect(meta.kind).toBe("profile");
    expect(meta.title).toContain("Kickoff Analyst");
    expect(meta.description).toContain("1 locked predictions");
    expect(meta.jsonLd["@type"]).toBe("ProfilePage");
    expect((meta.jsonLd.about as Record<string, unknown>).homeLocation).toBe("Chengdu");
  });
});
