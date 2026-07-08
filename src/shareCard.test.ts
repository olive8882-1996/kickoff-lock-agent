import { describe, expect, it } from "vitest";
import {
  buildModeProofShareText,
  buildModeRunShareCardPayload,
  buildModeXIntentUrl,
  buildProofShareText,
  buildShareArtifactEvidence,
  buildShareCardPayload,
  buildXIntentUrl,
  canNativeShareFiles,
  isPublishableShareArtifact,
  isProductionProofUrl,
  isProductionShareArtifact,
} from "./shareCard";
import type { GameModeRun, MemoryRecord } from "./types";

const record: MemoryRecord = {
  capsule: {
    id: "cap-share",
    matchId: "m1",
    matchLabel: "Spain vs Austria",
    kickoffAt: "2099-07-01T20:00:00.000Z",
    createdAt: "2099-07-01T10:00:00.000Z",
    sealedAt: "2099-07-01T10:10:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "abc123".repeat(11),
    filecoinProof: {
      mode: "real",
      cid: "bafy-share-proof",
      pieceCid: "baga-share-piece",
      provider: "synapse",
      dataSetId: "dataset",
      proofStatus: "verified",
    },
    prediction: {
      homeScore: 2,
      awayScore: 0,
      winner: "Spain",
      keyPlayers: ["Pedri"],
      confidence: 68,
      style: "analysis",
      reasoning: "Spain controls midfield.",
      agentSummary: "Spain 2-0 Austria",
      markets: [],
    },
  },
  result: {
    id: "result-share",
    capsuleId: "cap-share",
    revealedAt: "2099-07-01T22:00:00.000Z",
    homeScore: 2,
    awayScore: 1,
    keyPlayers: ["Pedri"],
    source: "manual",
    totalScore: 76,
    breakdown: {
      winner: 30,
      exactScore: 0,
      goalDifference: 10,
      markets: 12,
      keyPlayer: 10,
      confidence: 6,
      reasoning: 8,
    },
    explanation: [],
    agentReview: [],
  },
};

const modeRun: GameModeRun = {
  id: "mode-share",
  modeId: "parlay",
  title: "Three-lock parlay",
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: ["cap-a", "cap-b", "cap-c"],
  payloadHash: "def456".repeat(11),
  filecoinProof: {
    mode: "real",
    cid: "bafy-mode-share-proof",
    pieceCid: "baga-mode-share-piece",
    provider: "synapse",
    dataSetId: "mode-dataset",
    proofStatus: "verified",
  },
  status: "scored",
  score: 82,
  summary: "Parlay hit two of three settled legs.",
  requirements: ["At least three locks", "All picks sealed before kickoff"],
};

describe("share card payload", () => {
  it("carries proof, score and public verification fields for social images", () => {
    const payload = buildShareCardPayload(record, "https://example.com/kickoff-lock-agent/?proof=cap-share");

    expect(payload.matchLabel).toBe("SPAIN VS AUSTRIA");
    expect(payload.prediction).toBe("2-0");
    expect(payload.actual).toBe("2-1");
    expect(payload.score).toBe("76/100");
    expect(payload.confidence).toBe("68% CONFIDENCE");
    expect(payload.proofMode).toBe("REAL PROOF");
    expect(payload.proofStatus).toBe("VERIFIED");
    expect(payload.cid).toBe("bafy-share-proof");
    expect(payload.hash).toContain("abc123");
    expect(payload.proofUrl).toContain("?proof=cap-share");
  });

  it("labels unrevealed capsules as pending without hiding the proof URL", () => {
    const payload = buildShareCardPayload({ capsule: record.capsule }, "https://example.com/?proof=cap-share");

    expect(payload.actual).toBe("PENDING");
    expect(payload.score).toBe("PENDING");
    expect(payload.proofUrl).toContain("proof=cap-share");
  });

  it("builds public proof share text with score, CID and verifier URL", () => {
    const text = buildProofShareText(record, "https://example.com/kickoff-lock-agent/?proof=cap-share");

    expect(text).toContain("Spain vs Austria");
    expect(text).toContain("Actual 2-1");
    expect(text).toContain("scored 76/100");
    expect(text).toContain("bafy-share-proof");
    expect(text).toContain("Verify: https://example.com/kickoff-lock-agent/?proof=cap-share");
  });

  it("builds an X intent URL that carries the public proof URL and hashtags", () => {
    const intent = new URL(buildXIntentUrl(record, "https://example.com/kickoff-lock-agent/?proof=cap-share"));

    expect(intent.origin).toBe("https://twitter.com");
    expect(intent.pathname).toBe("/intent/tweet");
    expect(intent.searchParams.get("url")).toBe("https://example.com/kickoff-lock-agent/?proof=cap-share");
    expect(intent.searchParams.get("text")).toContain("bafy-share-proof");
    expect(intent.searchParams.get("hashtags")).toBe("KickoffLock,Filecoin,WorldCup");
  });

  it("keeps record X intent text compact enough for one-click publishing", () => {
    const longRecord: MemoryRecord = {
      ...record,
      capsule: {
        ...record.capsule,
        matchLabel:
          "Spain Golden Generation Invitational XI vs Austria Alpine Counterpressing Selection With Extra Long Name",
        filecoinProof: {
          ...record.capsule.filecoinProof,
          cid: `bafy${"x".repeat(120)}`,
        },
      },
    };
    const proofUrl = "https://example.com/kickoff-lock-agent/?proof=cap-share&share=public-card";
    const intent = new URL(buildXIntentUrl(longRecord, proofUrl));
    const text = intent.searchParams.get("text") ?? "";

    expect(text.length).toBeLessThanOrEqual(280);
    expect(text).toContain(proofUrl);
    expect(text).toContain("bafy");
    expect(intent.searchParams.get("url")).toBe(proofUrl);
  });

  it("carries mode proof fields for public mode share cards", () => {
    const payload = buildModeRunShareCardPayload(modeRun, "https://example.com/kickoff-lock-agent/?mode=mode-share");

    expect(payload.matchLabel).toBe("THREE-LOCK PARLAY");
    expect(payload.prediction).toBe("PARLAY");
    expect(payload.actual).toBe("SCORED");
    expect(payload.score).toBe("82/100");
    expect(payload.confidence).toBe("3 LOCKS LINKED");
    expect(payload.proofMode).toBe("REAL PROOF");
    expect(payload.proofStatus).toBe("VERIFIED");
    expect(payload.cid).toBe("bafy-mode-share-proof");
    expect(payload.hash).toContain("def456");
    expect(payload.proofUrl).toContain("?mode=mode-share");
  });

  it("builds public mode proof share text and X intent URL", () => {
    const proofUrl = "https://example.com/kickoff-lock-agent/?mode=mode-share";
    const text = buildModeProofShareText(modeRun, proofUrl);
    const intent = new URL(buildModeXIntentUrl(modeRun, proofUrl));

    expect(text).toContain("Three-lock parlay");
    expect(text).toContain("Score 82/100");
    expect(text).toContain("3 linked locks");
    expect(text).toContain("bafy-mode-share-proof");
    expect(text).toContain(`Verify: ${proofUrl}`);
    expect(intent.origin).toBe("https://twitter.com");
    expect(intent.searchParams.get("url")).toBe(proofUrl);
    expect(intent.searchParams.get("text")).toContain("bafy-mode-share-proof");
  });

  it("keeps mode X intent text compact enough for one-click publishing", () => {
    const longModeRun: GameModeRun = {
      ...modeRun,
      title: "Five-leg tactical upset ladder with a very long public proof title for knockout chaos",
      filecoinProof: {
        ...modeRun.filecoinProof,
        cid: `bafy${"y".repeat(120)}`,
      },
    };
    const proofUrl = "https://example.com/kickoff-lock-agent/?mode=mode-share&share=public-card";
    const intent = new URL(buildModeXIntentUrl(longModeRun, proofUrl));
    const text = intent.searchParams.get("text") ?? "";

    expect(text.length).toBeLessThanOrEqual(280);
    expect(text).toContain(proofUrl);
    expect(text).toContain("bafy");
    expect(intent.searchParams.get("url")).toBe(proofUrl);
  });

  it("detects native file sharing support before trying to share an image", () => {
    const files = [{} as File];

    expect(canNativeShareFiles(files, { share: async () => undefined, canShare: () => true } as Navigator)).toBe(true);
    expect(canNativeShareFiles(files, { share: async () => undefined, canShare: () => false } as Navigator)).toBe(false);
  });

  it("builds a publishable share artifact manifest with image hash and byte size", async () => {
    const dataUrl = `data:image/png;base64,${"a".repeat(16_000)}`;
    const evidence = await buildShareArtifactEvidence({
      id: "cap-share",
      kind: "record",
      proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-share",
      dataUrl,
      fileName: "cap-share-card.png",
      imageUrl: "https://example.com/cards/cap-share-card.png",
      xIntentUrl: buildXIntentUrl(record, "https://example.com/kickoff-lock-agent/?proof=cap-share"),
    });

    expect(evidence.imageGenerated).toBe(true);
    expect(evidence.imageMime).toBe("image/png");
    expect(evidence.imageByteLength).toBeGreaterThan(10_000);
    expect(evidence.imageHash).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.fileName).toBe("cap-share-card.png");
    expect(evidence.imageUrl).toBe("https://example.com/cards/cap-share-card.png");
    expect(evidence.xIntentUrl).toContain("twitter.com/intent/tweet");
    expect(isPublishableShareArtifact(evidence)).toBe(true);
    expect(isProductionShareArtifact(evidence)).toBe(true);
  });

  it("rejects incomplete share evidence as non-publishable", () => {
    expect(
      isPublishableShareArtifact({
        id: "cap-share",
        kind: "record",
        proofUrl: "https://example.com/?proof=cap-share",
        imageGenerated: true,
        imageMime: "image/png",
        imageByteLength: 100,
        imageHash: "not-a-real-hash",
        fileName: "cap-share-card.png",
      }),
    ).toBe(false);

    expect(
      isPublishableShareArtifact({
        id: "cap-share",
        kind: "record",
        proofUrl: "https://example.com/?proof=cap-share",
        imageGenerated: true,
        imageMime: "image/png",
        imageByteLength: 12_000,
        imageHash: "a".repeat(64),
        fileName: "cap-share-card.png",
      }),
    ).toBe(false);
  });

  it("requires deployed HTTPS proof URLs for production sharing evidence", async () => {
    const dataUrl = `data:image/png;base64,${"a".repeat(16_000)}`;
    const localhostEvidence = await buildShareArtifactEvidence({
      id: "cap-local",
      kind: "record",
      proofUrl: "http://localhost:5173/kickoff-lock-agent/?proof=cap-local",
      dataUrl,
      fileName: "cap-local-card.png",
    });

    expect(isProductionProofUrl("https://example.com/kickoff-lock-agent/?proof=cap-share")).toBe(true);
    expect(isProductionProofUrl("https://example.com/cards/cap-share.png")).toBe(true);
    expect(isProductionProofUrl("http://localhost:5173/kickoff-lock-agent/?proof=cap-share")).toBe(false);
    expect(isProductionProofUrl("https://127.0.0.1:5173/kickoff-lock-agent/?proof=cap-share")).toBe(false);
    expect(isProductionProofUrl("/kickoff-lock-agent/?proof=cap-share")).toBe(false);
    expect(isPublishableShareArtifact(localhostEvidence)).toBe(true);
    expect(isProductionShareArtifact(localhostEvidence)).toBe(false);

    const proofOnlyEvidence = await buildShareArtifactEvidence({
      id: "cap-no-image-url",
      kind: "record",
      proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-no-image-url",
      dataUrl,
      fileName: "cap-no-image-url-card.png",
    });
    expect(isPublishableShareArtifact(proofOnlyEvidence)).toBe(true);
    expect(isProductionShareArtifact(proofOnlyEvidence)).toBe(false);
  });
});
