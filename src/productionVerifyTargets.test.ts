import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEnvText } from "./productionEvidence";
import { buildProductionVerifyEnvFromArtifacts, requiredProductionModeIds } from "./productionVerifyTargets";
import type { FilecoinProof, GameModeRun, MemoryRecord, SealJob, ShareArtifactEvidence, UserProfile } from "./types";

const proof = (cid: string, payloadHash: string): FilecoinProof => ({
  mode: "real",
  cid,
  pieceCid: `piece-${cid}`,
  provider: "synapse",
  dataSetId: `dataset-${cid}`,
  proofStatus: "verified",
  payloadHash,
  byteLength: 2048,
});

const sealJob = (cid: string, payloadHash: string): SealJob => ({
  id: `seal-${cid}`,
  capsuleId: cid,
  status: "verified",
  startedAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:01:00.000Z",
  endpoint: "https://seal.example/seal",
  healthStatus: "ready",
  proof: proof(cid, payloadHash),
  uploadPayloadHash: payloadHash,
  uploadByteLength: 2048,
  pollAttempts: 2,
  pollLog: [],
  proofRegistryStatus: "verified",
  proofRegistryHash: payloadHash,
  steps: [],
});

const profile: UserProfile = {
  id: "user-1",
  email: "fan@example.com",
  displayName: "Fan",
  location: "Chengdu",
  createdAt: "2026-07-03T00:00:00.000Z",
  cloudMode: "supabase",
};

const record = (): MemoryRecord => ({
  capsule: {
    id: "cap-1",
    matchId: "match-1",
    matchLabel: "Brazil vs Japan",
    kickoffAt: "2026-07-03T20:00:00.000Z",
    createdAt: "2026-07-03T00:00:00.000Z",
    sealedAt: "2026-07-03T00:02:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: proof("bafy-record", "a".repeat(64)),
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: "Brazil",
      keyPlayers: [],
      confidence: 72,
      style: "analysis",
      reasoning: "test",
      agentSummary: "test",
      markets: [],
    },
  },
  sealJob: sealJob("bafy-record", "a".repeat(64)),
});

const modeRun = (modeId: GameModeRun["modeId"], index: number): GameModeRun => {
  const payloadHash = String(index + 2).repeat(64).slice(0, 64);
  return {
    id: `mode-${modeId}`,
    modeId,
    title: modeId,
    createdAt: "2026-07-03T00:00:00.000Z",
    capsuleIds: ["cap-1"],
    payloadHash,
    filecoinProof: proof(`bafy-mode-${index}`, payloadHash),
    status: "scored",
    score: 90,
    summary: "sealed",
    requirements: [],
    sealJob: sealJob(`bafy-mode-${index}`, payloadHash),
  };
};

const shareEvidence: ShareArtifactEvidence[] = [
  {
    id: "cap-1",
    kind: "record",
    proofUrl: "https://example.com/?proof=cap-1",
    imageGenerated: true,
    imageUrl: "https://cdn.example.com/card.png",
  },
  {
    id: "mode-bracket",
    kind: "mode",
    proofUrl: "https://example.com/?mode=mode-bracket",
    imageGenerated: true,
    imageUrl: "https://cdn.example.com/mode-card.png",
  },
];

describe("production verify target env from artifacts", () => {
  it("exports all required mode ids and Filecoin mode CID/hash pairs", () => {
    const envText = buildProductionVerifyEnvFromArtifacts({
      profile,
      records: [record()],
      modeRuns: [
        modeRun("bracket", 1),
        modeRun("parlay", 2),
        modeRun("agent-vs-human", 3),
        modeRun("upset", 4),
        modeRun("group-path", 5),
        modeRun("penalty-pressure", 6),
      ],
      shareEvidence,
      publicProfileUrl: "https://example.com/?profile=user-1",
    });
    const env = parseEnvText(envText);

    expect(requiredProductionModeIds).toEqual(["bracket", "parlay", "agent-vs-human", "upset", "group-path", "penalty-pressure"]);
    expect(env.KICKOFF_VERIFY_MODE_IDS).toBe("mode-bracket,mode-parlay,mode-agent-vs-human,mode-upset,mode-group-path,mode-penalty-pressure");
    expect(env.KICKOFF_VERIFY_PUBLIC_PROFILE_URL).toBe("https://example.com/?profile=user-1");
    expect(env.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS).toBe("record:cap-1,mode:mode-bracket");
    expect(env.KICKOFF_VERIFY_LEADERBOARD_SCOPES).toBe("global,friend,season");
    expect(env.KICKOFF_VERIFY_FILECOIN_MODE_CIDS).toBe("bafy-mode-1,bafy-mode-2,bafy-mode-3,bafy-mode-4,bafy-mode-5,bafy-mode-6");
    expect(env.KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES.split(",")).toHaveLength(6);
    expect(env.KICKOFF_VERIFY_FILECOIN_MODE_CID).toBe("bafy-mode-1");
    expect(env.KICKOFF_VERIFY_FILECOIN_RECORD_CID).toBe("bafy-record");
    expect(env.KICKOFF_VERIFY_SHARE_IMAGE_URL).toBe("https://cdn.example.com/card.png");
    expect(env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL).toBe("https://cdn.example.com/mode-card.png");
  });

  it("keeps README production mode acceptance wording aligned with the six required mode ids", () => {
    const readme = readFileSync("README.md", "utf8");
    const productionEvidenceScript = readFileSync("scripts/run-production-evidence.mjs", "utf8");

    expect(readme).toContain("six required mode proof rows (bracket, parlay, Agent vs Human, upset, group-path and penalty-pressure)");
    expect(readme).toContain("KICKOFF_VERIFY_MODE_IDS=... # comma-separated bracket/parlay/agent-vs-human/upset/group-path/penalty-pressure mode proof run ids");
    expect(readme).not.toMatch(/all four (required )?mode/i);
    expect(readme).not.toMatch(/four-mode production/i);
    expect(productionEvidenceScript).toContain("requiredProductionModeIds.length");
    expect(productionEvidenceScript).not.toMatch(/requiredCount\s*=\s*4/);
  });
});
