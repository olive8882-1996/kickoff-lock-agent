import { describe, expect, it } from "vitest";
import { buildSharePublishQueue } from "./sharePublishing";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

const record = (id: string): MemoryRecord => ({
  capsule: {
    id,
    matchId: `match-${id}`,
    matchLabel: `${id} home vs ${id} away`,
    kickoffAt: "2099-07-01T20:00:00.000Z",
    createdAt: "2099-07-01T10:00:00.000Z",
    sealedAt: "2099-07-01T10:10:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "real",
      cid: `bafy-${id}`,
      pieceCid: `piece-${id}`,
      provider: "synapse",
      dataSetId: "set",
      proofStatus: "verified",
    },
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: `${id} home`,
      keyPlayers: [],
      confidence: 66,
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
      markets: [],
    },
  },
});

const modeRun = (id: string): GameModeRun => ({
  id,
  modeId: "parlay",
  title: `Mode ${id}`,
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: ["cap-a", "cap-b", "cap-c"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "real",
    cid: `bafy-${id}`,
    pieceCid: `piece-${id}`,
    provider: "synapse",
    dataSetId: "set",
    proofStatus: "verified",
  },
  status: "sealed",
  summary: "sealed",
  requirements: [],
});

const artifact = (
  id: string,
  kind: ShareArtifactEvidence["kind"],
  patch: Partial<ShareArtifactEvidence> = {},
): ShareArtifactEvidence => ({
  id,
  kind,
  proofUrl: `https://example.com/kickoff-lock-agent/?${kind === "record" ? "proof" : "mode"}=${id}`,
  imageGenerated: true,
  generatedAt: "2099-07-01T12:05:00.000Z",
  fileName: `${id}.png`,
  imageMime: "image/png",
  imageByteLength: 64_000,
  imageHash: "c".repeat(64),
  ...patch,
});

describe("share publish queue", () => {
  it("queues missing and local-only share card manifests for production publishing", () => {
    const queue = buildSharePublishQueue(
      [record("cap-ready"), record("cap-local"), record("cap-missing")],
      [modeRun("mode-local")],
      [
        artifact("cap-ready", "record", { imageUrl: "https://example.com/cards/cap-ready.png" }),
        artifact("cap-local", "record", { proofUrl: "http://localhost:5173/?proof=cap-local" }),
        artifact("mode-local", "mode", { imageUrl: "https://example.com/cards/mode-local.png", proofUrl: "/?mode=mode-local" }),
      ],
    );

    expect(queue.totalArtifacts).toBe(4);
    expect(queue.productionReady).toBe(1);
    expect(queue.publishable).toBe(3);
    expect(queue.missingProduction).toBe(3);
    expect(queue.items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "record:cap-local",
      "record:cap-missing",
      "mode:mode-local",
    ]);
    expect(queue.items.find((item) => item.id === "cap-local")?.hasManifest).toBe(true);
    expect(queue.items.find((item) => item.id === "cap-missing")?.hasManifest).toBe(false);
    expect(queue.nextAction).toContain("Publish 3 missing proof cards");
  });

  it("returns an empty queue once every card has deployed HTTPS proof and image URLs", () => {
    const queue = buildSharePublishQueue(
      [record("cap-ready")],
      [modeRun("mode-ready")],
      [
        artifact("cap-ready", "record", { imageUrl: "https://example.com/cards/cap-ready.png" }),
        artifact("mode-ready", "mode", { imageUrl: "https://example.com/cards/mode-ready.png" }),
      ],
    );

    expect(queue.productionReady).toBe(2);
    expect(queue.missingProduction).toBe(0);
    expect(queue.items).toEqual([]);
    expect(queue.nextAction).toBe("All proof cards have production share evidence.");
  });
});
