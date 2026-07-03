import { describe, expect, it } from "vitest";
import { buildAccountHandoffPacket } from "./accountHandoff";
import type { CloudSyncState, GameModeRun, MemoryRecord, ShareArtifactEvidence, UserProfile } from "./types";

const profile: UserProfile = {
  id: "user-1",
  email: "fan@example.com",
  displayName: "Kickoff Analyst",
  location: "Chengdu",
  createdAt: "2099-01-01T00:00:00.000Z",
  cloudMode: "supabase",
};

const record = (id: string): MemoryRecord => ({
  capsule: {
    id,
    matchId: "m1",
    matchLabel: "Spain vs Austria",
    kickoffAt: "2099-07-01T19:00:00.000Z",
    createdAt: "2099-07-01T12:00:00.000Z",
    sealedAt: "2099-07-01T12:30:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: "bafy-demo",
      pieceCid: "piece-demo",
      provider: "demo",
      dataSetId: "demo",
      proofStatus: "retrievable",
    },
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Spain",
      keyPlayers: [],
      confidence: 72,
      style: "analysis",
      reasoning: "Spain pressure",
      agentSummary: "Spain edge",
      markets: [],
    },
  },
});

const modeRun = (id: string): GameModeRun => ({
  id,
  modeId: "bracket",
  title: "Bracket path",
  createdAt: "2099-07-01T12:00:00.000Z",
  capsuleIds: ["cap-1"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: "bafy-mode",
    pieceCid: "piece-mode",
    provider: "demo",
    dataSetId: "demo",
    proofStatus: "retrievable",
  },
  status: "sealed",
  summary: "Path sealed",
  requirements: ["one locked capsule"],
});

const shareArtifact = (id: string): ShareArtifactEvidence => ({
  id,
  kind: "record",
  proofUrl: `https://example.com/?proof=${id}`,
  imageGenerated: true,
  imageUrl: `https://example.com/cards/${id}.png`,
  imageHash: "c".repeat(64),
  imageByteLength: 120000,
  imageMime: "image/png",
  fileName: `${id}.png`,
});

describe("account handoff packet", () => {
  it("blocks cross-device handoff when Supabase runtime or read-back is missing", () => {
    const cloudState: CloudSyncState = {
      configured: false,
      authenticated: false,
      mode: "local",
      status: "offline",
      message: "Local profile active. Add Supabase env vars to enable cloud sync.",
    };

    const packet = buildAccountHandoffPacket({
      profile: { ...profile, cloudMode: "local" },
      cloudState,
      records: [record("cap-1")],
      modeRuns: [],
      shareEvidence: [],
      publicProfileUrl: "https://example.com/?profile=user-1",
      productionVerifyEnv: "KICKOFF_VERIFY_PROFILE_ID=\nKICKOFF_VERIFY_PROOF_ID=cap-1",
      missingRuntimeEnv: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    });

    expect(packet.crossDeviceReady).toBe(false);
    expect(packet.pendingSyncItems).toBe(1);
    expect(packet.checklist.find((item) => item.key === "runtime")?.status).toBe("blocked");
    expect(packet.nextAction).toContain("Supabase runtime");
    expect(packet.copyText).toContain("Production verify env");
  });

  it("marks handoff ready only after private, content and public profile read-back all match", () => {
    const records = [record("cap-1")];
    const modeRuns = [modeRun("mode-1")];
    const shareEvidence = [shareArtifact("cap-1")];
    const cloudState: CloudSyncState = {
      configured: true,
      authenticated: true,
      mode: "supabase",
      status: "synced",
      message: "synced",
      verification: {
        checkedAt: "2099-07-01T13:00:00.000Z",
        profile: true,
        records: 1,
        modeRuns: 1,
        shareArtifacts: 1,
        publicProofs: 2,
        publicShareImages: 1,
        publicProfile: true,
        expectedRecords: 1,
        expectedModeRuns: 1,
        expectedShareArtifacts: 1,
        recordContentIds: ["cap-1"],
        modeRunContentIds: ["mode-1"],
        shareArtifactContentIds: ["record:cap-1"],
        publicProfileRecordIds: ["cap-1"],
        publicProfileModeRunIds: ["mode-1"],
        publicProfileShareArtifactIds: ["record:cap-1"],
        message: "all synced",
      },
    };

    const packet = buildAccountHandoffPacket({
      profile,
      cloudState,
      records,
      modeRuns,
      shareEvidence,
      publicProfileUrl: "https://example.com/?profile=user-1",
      productionVerifyEnv: "KICKOFF_VERIFY_PROFILE_ID=user-1\nKICKOFF_VERIFY_PROOF_ID=cap-1",
    });

    expect(packet.crossDeviceReady).toBe(true);
    expect(packet.pendingSyncItems).toBe(0);
    expect(packet.checklist.every((item) => item.status === "ready")).toBe(true);
    expect(packet.copyText).toContain("Public profile: https://example.com/?profile=user-1");
  });
});
