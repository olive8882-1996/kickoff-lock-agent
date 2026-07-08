import { describe, expect, it } from "vitest";
import {
  buildModePublicProofShareKit,
  buildPublicProofPublicationLedger,
  buildRecordPublicProofShareKit,
} from "./publicProofShareKit";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

const xIntent = (proofUrl: string) => {
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", `Kickoff Lock Agent proof\nVerify: ${proofUrl}`);
  url.searchParams.set("url", proofUrl);
  url.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");
  return url.toString();
};

const artifact: ShareArtifactEvidence = {
  id: "cap-1",
  kind: "record",
  proofUrl: "https://example.com/kickoff-lock-agent/?proof=cap-1",
  imageGenerated: true,
  generatedAt: "2026-01-01T00:05:00.000Z",
  fileName: "cap-1-public-proof.png",
  imageUrl: "https://cdn.example.com/cards/cap-1-public-proof.png",
  imageMime: "image/png",
  imageByteLength: 240000,
  imageHash: "a".repeat(64),
  xIntentUrl: xIntent("https://example.com/kickoff-lock-agent/?proof=cap-1"),
};

const record: MemoryRecord = {
  capsule: {
    id: "cap-1",
    matchId: "match-1",
    matchLabel: "Brazil vs Japan",
    kickoffAt: "2099-07-01T19:00:00.000Z",
    createdAt: "2099-07-01T12:00:00.000Z",
    sealedAt: "2099-07-01T12:30:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "b".repeat(64),
    filecoinProof: {
      mode: "real",
      cid: "bafy-real",
      pieceCid: "piece-real",
      provider: "synapse",
      dataSetId: "dataset",
      proofStatus: "verified",
    },
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Brazil",
      keyPlayers: [],
      confidence: 70,
      style: "analysis",
      reasoning: "Brazil edge",
      agentSummary: "Brazil edge",
      markets: [],
    },
  },
  result: {
    id: "result-1",
    capsuleId: "cap-1",
    revealedAt: "2099-07-01T21:00:00.000Z",
    homeScore: 2,
    awayScore: 1,
    keyPlayers: [],
    source: "manual",
    totalScore: 92,
    breakdown: { winner: 30, exactScore: 30, goalDifference: 12, markets: 8, keyPlayer: 4, confidence: 4, reasoning: 4 },
    explanation: [],
    agentReview: [],
  },
};

const modeRun: GameModeRun = {
  id: "mode-1",
  modeId: "bracket",
  title: "Bracket path",
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: ["cap-1", "cap-2"],
  payloadHash: "c".repeat(64),
  filecoinProof: {
    mode: "real",
    cid: "bafy-mode-real",
    pieceCid: "piece-mode-real",
    provider: "synapse",
    dataSetId: "dataset",
    proofStatus: "retrievable",
  },
  status: "scored",
  score: 88,
  summary: "Path sealed and scored.",
  requirements: ["two locks"],
};

describe("public proof share kit", () => {
  it("marks a production record proof as ready to publish", () => {
    const kit = buildRecordPublicProofShareKit(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      artifact,
    );

    expect(kit.status).toBe("ready");
    expect(kit.headline).toBe("Ready to publish and judge");
    expect(kit.copyText).toContain("I locked Brazil vs Japan before kickoff");
    expect(kit.xIntentUrl).toContain("https://twitter.com/intent/tweet");
    expect(kit.actions.find((action) => action.key === "image")?.status).toBe("ready");
    expect(kit.actions.find((action) => action.key === "x")?.status).toBe("ready");
    expect(kit.intentAudit).toMatchObject({
      ready: false,
      publishReady: true,
      channelReady: false,
      label: "Brazil vs Japan",
    });
    expect(kit.intentAudit.checks.find((check) => check.key === "x-intent")).toMatchObject({
      status: "passed",
    });
    expect(kit.actions.find((action) => action.key === "channel")).toMatchObject({
      status: "pending",
      detail: "Open the X intent or native share sheet to save channel evidence.",
    });
    expect(kit.publicationPackage).toMatchObject({
      id: "cap-1",
      kind: "record",
      status: "ready-to-open",
      publishReady: true,
      channelReady: false,
      ready: false,
      blockers: ["Open the X intent or native share sheet and sync the opened timestamp."],
    });
    expect(kit.publicationPackage.payload).toMatchObject({
      id: "cap-1",
      kind: "record",
      proof_url: "https://example.com/kickoff-lock-agent/?proof=cap-1",
      image_url: "https://cdn.example.com/cards/cap-1-public-proof.png",
      image_hash: "a".repeat(64),
      x_intent_url: xIntent("https://example.com/kickoff-lock-agent/?proof=cap-1"),
    });
    expect(kit.publicationPackage.copyText).toContain("kickoff_share");
    expect(kit.publicationPackage.acceptanceChecklist.map((check) => `${check.key}:${check.passed}`)).toEqual([
      "proof-url:true",
      "image-manifest:true",
      "image-url:true",
      "proof-match:true",
      "artifact-target:true",
      "x-intent:true",
      "channel-opened:false",
      "supabase-readback:false",
    ]);
    expect(kit.publicationPackage.copyText).toContain("Acceptance checklist:");
    expect(kit.publicationPackage.copyText).toContain("Channel opened: pending");
  });

  it("keeps a local generated image in needs-production-url status", () => {
    const kit = buildRecordPublicProofShareKit(
      record,
      "http://127.0.0.1:4173/kickoff-lock-agent/?proof=cap-1",
      { ...artifact, imageUrl: undefined, proofUrl: "http://127.0.0.1:4173/?proof=cap-1" },
    );

    expect(kit.status).toBe("needs-production-url");
    expect(kit.artifactLabel).toBe("local PNG manifest");
    expect(kit.xIntentUrl).toContain("twitter.com/intent/tweet");
    expect(kit.actions.find((action) => action.key === "verify")?.status).toBe("pending");
    expect(kit.intentAudit.publishReady).toBe(false);
    expect(kit.intentAudit.checks.find((check) => check.key === "proof-url")?.status).toBe("failed");
    expect(kit.actions.find((action) => action.key === "x")).toMatchObject({
      status: "pending",
      detail: "Publish matching HTTPS proof/image URLs and a valid X intent before opening X.",
    });
    expect(kit.publicationPackage).toMatchObject({
      status: "needs-hosting",
      publishReady: false,
      acceptance: {
        proofUrlProduction: false,
        imageManifest: true,
        imageUrlProduction: false,
        artifactMatchesProof: false,
        artifactMatchesTarget: false,
        xIntentValid: false,
        channelOpened: false,
      },
    });
    expect(kit.publicationPackage.blockers).toContain("Use a deployed HTTPS public proof URL.");
    expect(kit.publicationPackage.blockers).toContain("Upload the PNG to a public HTTPS image URL.");
    expect(kit.publicationPackage.acceptanceChecklist.find((check) => check.key === "proof-url")).toMatchObject({
      passed: false,
      actual: "http://127.0.0.1:4173/kickoff-lock-agent/?proof=cap-1",
    });
    expect(kit.publicationPackage.acceptanceChecklist.find((check) => check.key === "image-url")).toMatchObject({
      passed: false,
      actual: "missing",
    });
  });

  it("does not mark X publishing ready until both proof and image are production HTTPS URLs", () => {
    const kit = buildRecordPublicProofShareKit(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { ...artifact, imageUrl: undefined },
    );

    expect(kit.status).toBe("needs-production-url");
    expect(kit.xIntentUrl).toContain("twitter.com/intent/tweet");
    expect(kit.actions.find((action) => action.key === "verify")?.status).toBe("ready");
    expect(kit.actions.find((action) => action.key === "image")?.status).toBe("ready");
    expect(kit.actions.find((action) => action.key === "x")?.status).toBe("pending");
    expect(kit.publicationPackage.status).toBe("needs-hosting");
    expect(kit.publicationPackage.blockers).toContain("Upload the PNG to a public HTTPS image URL.");
  });

  it("does not mark X publishing ready when the artifact proof URL does not match the current proof", () => {
    const kit = buildRecordPublicProofShareKit(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      {
        ...artifact,
        proofUrl: "https://example.com/kickoff-lock-agent/?proof=another",
        xIntentUrl: xIntent("https://example.com/kickoff-lock-agent/?proof=another"),
      },
    );

    expect(kit.status).toBe("needs-production-url");
    expect(kit.actions.find((action) => action.key === "x")).toMatchObject({
      status: "pending",
      detail: "Publish matching HTTPS proof/image URLs and a valid X intent before opening X.",
    });
    expect(kit.publicationPackage.acceptance.artifactMatchesProof).toBe(false);
    expect(kit.publicationPackage.blockers).toContain("Regenerate or sync the card with the current proof URL.");
  });

  it("does not mark publishing ready when the artifact belongs to another proof target identity", () => {
    const kit = buildRecordPublicProofShareKit(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      {
        ...artifact,
        id: "mode-1",
        kind: "mode",
      },
    );

    expect(kit.status).toBe("needs-production-url");
    expect(kit.actions.find((action) => action.key === "x")).toMatchObject({
      status: "pending",
      detail: "Publish matching HTTPS proof/image URLs and a valid X intent before opening X.",
    });
    expect(kit.publicationPackage).toMatchObject({
      status: "needs-hosting",
      publishReady: false,
      acceptance: {
        artifactMatchesProof: true,
        artifactMatchesTarget: false,
      },
    });
    expect(kit.publicationPackage.acceptanceChecklist.find((check) => check.key === "artifact-target")).toMatchObject({
      passed: false,
      actual: "mode:mode-1",
    });
    expect(kit.publicationPackage.blockers).toContain("Regenerate or sync the card for the current proof target.");
  });

  it("does not mark X publishing ready when the intent URL points at another proof", () => {
    const kit = buildRecordPublicProofShareKit(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      {
        ...artifact,
        xIntentUrl: xIntent("https://example.com/kickoff-lock-agent/?proof=another"),
      },
    );

    expect(kit.status).toBe("ready");
    expect(kit.actions.find((action) => action.key === "x")).toMatchObject({
      status: "pending",
      detail: "X intent url parameter must match proof_url",
    });
    expect(kit.actions.find((action) => action.key === "channel")).toMatchObject({
      status: "pending",
      detail: "X intent url parameter must match proof_url",
    });
    expect(kit.publicationPackage).toMatchObject({
      status: "needs-hosting",
      publishReady: false,
      acceptance: {
        xIntentValid: false,
      },
    });
    expect(kit.publicationPackage.blockers).toContain(
      "Regenerate the X intent with matching compact proof text: X intent url parameter must match proof_url.",
    );
  });

  it("builds a mode proof share kit with mode copy", () => {
    const kit = buildModePublicProofShareKit(
      modeRun,
      "https://example.com/kickoff-lock-agent/?mode=mode-1",
      {
        ...artifact,
        id: "mode-1",
        kind: "mode",
        proofUrl: "https://example.com/kickoff-lock-agent/?mode=mode-1",
        xIntentUrl: xIntent("https://example.com/kickoff-lock-agent/?mode=mode-1"),
      },
    );

    expect(kit.kind).toBe("mode");
    expect(kit.status).toBe("ready");
    expect(kit.copyText).toContain("World Cup Bracket path mode proof");
    expect(kit.xIntentUrl).toContain("twitter.com/intent/tweet");
    expect(kit.summary).toContain("production image");
    expect(kit.publicationPackage).toMatchObject({
      id: "mode-1",
      kind: "mode",
      status: "ready-to-open",
    });
    expect(kit.publicationPackage.payload).toMatchObject({
      id: "mode-1",
      kind: "mode",
      proof_url: "https://example.com/kickoff-lock-agent/?mode=mode-1",
    });
  });

  it("builds a missing-image publication package before card generation", () => {
    const kit = buildRecordPublicProofShareKit(record, "https://example.com/kickoff-lock-agent/?proof=cap-1");

    expect(kit.status).toBe("needs-image");
    expect(kit.publicationPackage).toMatchObject({
      id: "cap-1",
      status: "missing-image",
      publishReady: false,
      ready: false,
      payload: {
        image_generated: false,
        generated_at: null,
        file_name: null,
        image_url: null,
      },
    });
    expect(kit.publicationPackage.blockers).toContain("Generate a PNG share image manifest.");
  });

  it("shows X share-channel evidence when the intent timestamp has been synced", () => {
    const kit = buildRecordPublicProofShareKit(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { ...artifact, xIntentOpenedAt: "2026-01-01T00:10:00.000Z" },
    );

    expect(kit.actions.find((action) => action.key === "channel")).toMatchObject({
      status: "ready",
      detail: "X intent opened at 2026-01-01T00:10:00.000Z.",
    });
    expect(kit.intentAudit.ready).toBe(true);
    expect(kit.intentAudit.channelReady).toBe(true);
    expect(kit.publicationPackage).toMatchObject({
      status: "published",
      ready: true,
      publishReady: true,
      channelReady: true,
      blockers: [],
    });
    expect(kit.publicationPackage.nextAction).toBe("Share publication package is ready for Supabase read-back.");
    expect(kit.publicationPackage.acceptanceChecklist.every((check) => check.passed)).toBe(true);
    expect(kit.publicationPackage.acceptanceChecklist.find((check) => check.key === "supabase-readback")).toMatchObject({
      passed: true,
      actual: "ready for read-back",
    });
  });

  it("shows native share-channel evidence when the native sheet has been opened", () => {
    const kit = buildModePublicProofShareKit(
      modeRun,
      "https://example.com/kickoff-lock-agent/?mode=mode-1",
      {
        ...artifact,
        id: "mode-1",
        kind: "mode",
        proofUrl: "https://example.com/kickoff-lock-agent/?mode=mode-1",
        xIntentUrl: xIntent("https://example.com/kickoff-lock-agent/?mode=mode-1"),
        nativeShareOpenedAt: "2026-01-01T00:11:00.000Z",
      },
    );

    expect(kit.actions.find((action) => action.key === "channel")).toMatchObject({
      status: "ready",
      detail: "Native share opened at 2026-01-01T00:11:00.000Z.",
    });
  });

  it("builds a batch publication ledger across record and mode proof cards", () => {
    const readyRecord = buildRecordPublicProofShareKit(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { ...artifact, xIntentOpenedAt: "2026-01-01T00:10:00.000Z" },
    );
    const localMode = buildModePublicProofShareKit(
      modeRun,
      "https://example.com/kickoff-lock-agent/?mode=mode-1",
      {
        ...artifact,
        id: "mode-1",
        kind: "mode",
        proofUrl: "https://example.com/kickoff-lock-agent/?mode=mode-1",
        imageUrl: undefined,
        xIntentUrl: xIntent("https://example.com/kickoff-lock-agent/?mode=mode-1"),
      },
    );

    const ledger = buildPublicProofPublicationLedger([readyRecord, localMode]);

    expect(ledger.ready).toBe(false);
    expect(ledger.totalTargets).toBe(2);
    expect(ledger.recordTargets).toBe(1);
    expect(ledger.modeTargets).toBe(1);
    expect(ledger.publishReady).toBe(1);
    expect(ledger.channelReady).toBe(1);
    expect(ledger.readBackReady).toBe(1);
    expect(ledger.missingProductionUrls).toBe(1);
    expect(ledger.nextAction).toContain("mode:mode-1 Upload the PNG");
    expect(ledger.rows.map((row) => `${row.kind}:${row.id}:${row.status}:${row.passedChecks}/${row.totalChecks}`)).toEqual([
      "record:cap-1:published:8/8",
      "mode:mode-1:needs-hosting:5/8",
    ]);
    expect(ledger.rows[0].readBackCommand).toContain("$VITE_SUPABASE_URL/rest/v1/kickoff_share_artifacts");
    expect(ledger.copyText).toContain("Kickoff Lock Agent public proof publication ledger");
    expect(ledger.copyText).toContain("read-back: curl -sS");
  });

  it("marks the batch publication ledger ready after every card is published and opened", () => {
    const recordKit = buildRecordPublicProofShareKit(
      record,
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { ...artifact, xIntentOpenedAt: "2026-01-01T00:10:00.000Z" },
    );
    const modeKit = buildModePublicProofShareKit(
      modeRun,
      "https://example.com/kickoff-lock-agent/?mode=mode-1",
      {
        ...artifact,
        id: "mode-1",
        kind: "mode",
        proofUrl: "https://example.com/kickoff-lock-agent/?mode=mode-1",
        imageUrl: "https://cdn.example.com/cards/mode-1-public-proof.png",
        xIntentUrl: xIntent("https://example.com/kickoff-lock-agent/?mode=mode-1"),
        nativeShareOpenedAt: "2026-01-01T00:11:00.000Z",
      },
    );

    const ledger = buildPublicProofPublicationLedger([recordKit, modeKit]);

    expect(ledger.ready).toBe(true);
    expect(ledger.readBackReady).toBe(2);
    expect(ledger.blockers).toEqual([]);
    expect(ledger.nextAction).toBe("All public proof share cards are published, opened and ready for Supabase read-back.");
    expect(ledger.summary).toContain("2/2 share cards read-back ready");
  });
});
