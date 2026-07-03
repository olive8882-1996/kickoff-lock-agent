import { describe, expect, it } from "vitest";
import { buildProfileArchiveEvidencePacket } from "./profileArchiveEvidence";
import type { CloudSyncVerification, PublicProfile, ShareArtifactEvidence } from "./types";

const shareArtifact = (id: string, kind: ShareArtifactEvidence["kind"], publicImage = true): ShareArtifactEvidence => ({
  id,
  kind,
  generatedAt: "2099-01-01T00:00:00.000Z",
  fileName: `${id}-${kind}.png`,
  imageMime: "image/png",
  imageByteLength: 12000,
  imageHash: "a".repeat(64),
  imageGenerated: true,
  proofUrl: `https://example.com/kickoff-lock-agent/?${kind === "mode" ? "mode" : "proof"}=${id}`,
  imageUrl: publicImage ? `https://cdn.example.com/${id}-${kind}.png` : undefined,
});

const profile = (shareArtifacts: ShareArtifactEvidence[] = [shareArtifact("cap-1", "record"), shareArtifact("mode-1", "mode")]): PublicProfile => ({
  id: "user-1",
  email: "user@example.com",
  displayName: "Kickoff Analyst",
  location: "Chengdu",
  friendCode: "chengdu",
  records: [
    {
      capsule: {
        id: "cap-1",
        matchId: "m1",
        matchLabel: "A vs B",
        kickoffAt: "2099-01-01T00:00:00.000Z",
        createdAt: "2098-12-31T00:00:00.000Z",
        sealedAt: "2098-12-31T00:00:00.000Z",
        locked: true,
        lateLock: false,
        payloadHash: "b".repeat(64),
        filecoinProof: {
          mode: "real",
          cid: "bafy-record",
          pieceCid: "piece-record",
          provider: "synapse",
          dataSetId: "dataset",
          proofStatus: "verified",
        },
        prediction: {
          homeScore: 2,
          awayScore: 1,
          winner: "A",
          keyPlayers: [],
          confidence: 70,
          style: "analysis",
          reasoning: "reason",
          agentSummary: "summary",
          markets: [],
        },
      },
    },
  ],
  modeRuns: [
    {
      id: "mode-1",
      modeId: "bracket",
      title: "Bracket path",
      createdAt: "2099-01-01T00:00:00.000Z",
      capsuleIds: ["cap-1"],
      payloadHash: "c".repeat(64),
      filecoinProof: {
        mode: "real",
        cid: "bafy-mode",
        pieceCid: "piece-mode",
        provider: "synapse",
        dataSetId: "dataset",
        proofStatus: "verified",
      },
      status: "sealed",
      summary: "Bracket path sealed.",
      requirements: [],
    },
  ],
  shareArtifacts,
  locks: 1,
  revealed: 0,
  modeProofs: 1,
  averageScore: 0,
  bestScore: 0,
  xp: 210,
});

const verification = (patch: Partial<CloudSyncVerification> = {}): CloudSyncVerification => ({
  checkedAt: "2099-01-01T00:00:00.000Z",
  profile: true,
  records: 1,
  modeRuns: 1,
  publicProofs: 2,
  shareArtifacts: 2,
  publicShareImages: 2,
  publicProfile: true,
  expectedRecords: 1,
  expectedModeRuns: 1,
  expectedShareArtifacts: 2,
  recordIds: ["cap-1"],
  modeRunIds: ["mode-1"],
  shareArtifactIds: ["record:cap-1", "mode:mode-1"],
  publicShareImageIds: ["record:cap-1", "mode:mode-1"],
  publicProfileRecordIds: ["cap-1"],
  publicProfileModeRunIds: ["mode-1"],
  publicProfileShareArtifactIds: ["record:cap-1", "mode:mode-1"],
  recordContentIds: ["cap-1"],
  modeRunContentIds: ["mode-1"],
  shareArtifactContentIds: ["record:cap-1", "mode:mode-1"],
  missingRecordIds: [],
  missingModeRunIds: [],
  missingPublicProofIds: [],
  missingShareArtifactIds: [],
  missingPublicShareImageIds: [],
  missingPublicProfileRecordIds: [],
  missingPublicProfileModeRunIds: [],
  missingPublicProfileShareArtifactIds: [],
  missingRecordContentIds: [],
  missingModeRunContentIds: [],
  missingShareArtifactContentIds: [],
  message: "Cloud read-back verified.",
  ...patch,
});

describe("profile archive evidence packet", () => {
  it("keeps local profile previews separate from cloud archive read-back", () => {
    const packet = buildProfileArchiveEvidencePacket({
      profile: profile(),
      profileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      source: "local-preview",
    });

    expect(packet.ready).toBe(false);
    expect(packet.checks.find((check) => check.key === "public-archive")?.status).toBe("blocked");
    expect(packet.summary).toContain("Kickoff Analyst");
    expect(packet.copyText).toContain("Ready: no");
  });

  it("marks a profile archive ready after anonymous archive, fingerprint and image read-back", () => {
    const packet = buildProfileArchiveEvidencePacket({
      profile: profile(),
      profileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      verification: verification(),
      source: "cloud-readback",
    });

    expect(packet.ready).toBe(true);
    expect(packet.verifiedArchives).toBe(4);
    expect(packet.expectedArchives).toBe(4);
    expect(packet.contentFingerprints).toBe(4);
    expect(packet.publicProofLinks).toBe(2);
    expect(packet.missingIds).toEqual([]);
    expect(packet.copyText).toContain("Ready: yes");
  });

  it("lists missing mode archives, fingerprints and public images", () => {
    const packet = buildProfileArchiveEvidencePacket({
      profile: profile([shareArtifact("cap-1", "record"), shareArtifact("mode-1", "mode", false)]),
      profileUrl: "https://example.com/kickoff-lock-agent/?profile=user-1",
      verification: verification({
        publicProfile: false,
        publicShareImages: 1,
        publicProfileModeRunIds: [],
        publicProfileShareArtifactIds: ["record:cap-1"],
        shareArtifactContentIds: ["record:cap-1"],
        missingPublicProfileModeRunIds: ["mode-1"],
        missingPublicProfileShareArtifactIds: ["mode:mode-1"],
        missingShareArtifactContentIds: ["mode:mode-1"],
        missingPublicShareImageIds: ["mode:mode-1"],
      }),
      source: "cloud-readback",
    });

    expect(packet.ready).toBe(false);
    expect(packet.missingIds).toEqual(expect.arrayContaining(["mode-1", "mode:mode-1"]));
    expect(packet.checks.find((check) => check.key === "public-images")?.status).toBe("pending");
  });
});
