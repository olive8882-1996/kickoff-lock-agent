import { describe, expect, it } from "vitest";
import { buildModeEvidencePacket } from "./modeEvidence";
import type { CloudSyncVerification, GameMode, GameModeRun, ShareArtifactEvidence } from "./types";

const modes: GameMode[] = [
  { id: "bracket", title: "Bracket path", status: "playable", description: "Path", progress: 100, reward: "Badge" },
  { id: "parlay", title: "Multi-match parlay", status: "playable", description: "Parlay", progress: 100, reward: "XP" },
  { id: "agent-vs-human", title: "Agent vs Human", status: "playable", description: "Calibration", progress: 100, reward: "Badge" },
  { id: "upset", title: "Upset Challenge", status: "playable", description: "Upset", progress: 100, reward: "XP" },
];

const run = (modeId: GameMode["id"], mode: "demo" | "real" = "real"): GameModeRun => ({
  id: `mode-${modeId}`,
  modeId,
  title: modes.find((item) => item.id === modeId)?.title ?? modeId,
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: [`cap-${modeId}`],
  payloadHash: `${modeId.replace(/[^a-z]/g, "").padEnd(64, "a")}`.slice(0, 64),
  filecoinProof: {
    mode,
    cid: `bafy-${modeId}`,
    pieceCid: `piece-${modeId}`,
    provider: mode === "real" ? "synapse" : "demo",
    dataSetId: `set-${modeId}`,
    proofStatus: "verified",
    payloadHash: `${modeId.replace(/[^a-z]/g, "").padEnd(64, "a")}`.slice(0, 64),
    byteLength: 2048,
  },
  status: "sealed",
  summary: `${modeId} sealed`,
  requirements: [],
});

const artifact = (id: string): ShareArtifactEvidence => ({
  id,
  kind: "mode",
  proofUrl: `https://example.com/kickoff-lock-agent/?mode=${id}`,
  imageGenerated: true,
  generatedAt: "2099-07-01T12:05:00.000Z",
  fileName: `${id}.png`,
  imageUrl: `https://example.com/cards/${id}.png`,
  imageMime: "image/png",
  imageByteLength: 120_000,
  imageHash: "a".repeat(64),
});

const verificationFor = (runs: GameModeRun[]): CloudSyncVerification => ({
  checkedAt: "2099-07-01T12:10:00.000Z",
  profile: true,
  records: 0,
  modeRuns: runs.length,
  publicProofs: runs.length,
  publicProfile: true,
  expectedRecords: 0,
  expectedModeRuns: runs.length,
  modeRunIds: runs.map((item) => item.id),
  modeRunContentIds: runs.map((item) => item.id),
  publicProofIds: runs.map((item) => `mode:${item.id}`),
  message: "verified",
});

describe("mode evidence packet", () => {
  it("requires all four modes to have real Filecoin, cloud read-back, public proof links and share cards", () => {
    const runs = modes.map((mode) => run(mode.id));
    const packet = buildModeEvidencePacket(modes, runs, runs.map((item) => artifact(item.id)), verificationFor(runs));

    expect(packet.complete).toBe(true);
    expect(packet.passedModes).toBe(4);
    expect(packet.realFilecoinModes).toBe(4);
    expect(packet.cloudModes).toBe(4);
    expect(packet.publicProofModes).toBe(4);
    expect(packet.shareCardModes).toBe(4);
    expect(packet.copyText).toContain("Modes ready: 4/4");
  });

  it("keeps local demo mode runs out of production-ready status", () => {
    const localRun = run("bracket", "demo");
    const packet = buildModeEvidencePacket(modes, [localRun], [], undefined);

    expect(packet.complete).toBe(false);
    expect(packet.modeRuns).toBe(1);
    expect(packet.missingModes).toEqual(["bracket", "parlay", "agent-vs-human", "upset"]);
    expect(packet.items.find((item) => item.modeId === "bracket")?.status).toBe("needs-filecoin");
    expect(packet.items.find((item) => item.modeId === "parlay")?.status).toBe("missing-run");
    expect(packet.nextAction).toContain("real Filecoin proof");
  });
});
