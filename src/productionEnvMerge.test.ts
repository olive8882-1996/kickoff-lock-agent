import { describe, expect, it } from "vitest";
import {
  productionEnvArtifactFileList,
  productionEnvBlocksFromArtifacts,
  productionEnvMergeFileList,
  mergeVerifyEnvIntoEnvText,
} from "./productionEnvMerge";
import { mergeProductionVerifyEnv } from "./productionEvidence";

describe("production env merge file selection", () => {
  it("ignores .env.example by default so placeholder targets cannot seed production verification", () => {
    expect(productionEnvMergeFileList()).toEqual([
      ".env",
      ".env.local",
      ".env.production",
      ".env.production.local",
    ]);
  });

  it("includes .env.example only when explicitly requested", () => {
    expect(productionEnvMergeFileList({ includeExample: true })[0]).toBe(".env.example");
  });

  it("lists generated production artifacts that can contribute verify env", () => {
    expect(productionEnvArtifactFileList()).toEqual([
      "public/supabase-target-seed.json",
      "public/share-channel-evidence.json",
      "public/leaderboard-backend.json",
      "public/data-target-scout.json",
      "public/filecoin-target-seal.json",
      "public/share-image-upload-record.json",
      "public/share-image-upload-mode.json",
    ]);
  });

  it("extracts verify env blocks from seed, share channel, leaderboard, scout, seal and share upload artifacts", () => {
    const blocks = productionEnvBlocksFromArtifacts([
      {
        fileName: "public/supabase-target-seed.json",
        artifact: {
          seed: {
            verifyEnv: "KICKOFF_VERIFY_USER_ID=user-1\nKICKOFF_VERIFY_PROOF_ID=cap-1\n",
          },
        },
      },
      {
        fileName: "public/share-channel-evidence.json",
        artifact: {
          targets: {
            shareArtifactIds: ["record:cap-1", "mode:mode-bracket", "mode:mode-parlay"],
          },
        },
      },
      {
        fileName: "public/leaderboard-backend.json",
        artifact: {
          targets: {
            leaderboardScopes: ["global", "friend", "season"],
          },
        },
      },
      {
        fileName: "public/data-target-scout.json",
        artifact: {
          verifyEnv:
            "KICKOFF_VERIFY_FIXTURE_IDS=100,200,300\nKICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX=\"100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2\"\n",
        },
      },
      {
        fileName: "public/filecoin-target-seal.json",
        artifact: {
          verifyEnv: "KICKOFF_VERIFY_FILECOIN_RECORD_CID=bafy-record\nKICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
        },
      },
      {
        fileName: "public/share-image-upload-record.json",
        artifact: {
          target: { kind: "record" },
          result: { publicUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/record.png" },
        },
      },
      {
        fileName: "public/share-image-upload-mode.json",
        artifact: {
          target: { kind: "mode" },
          result: { publicUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/mode.png" },
        },
      },
    ]);
    const merged = mergeProductionVerifyEnv(blocks, {});

    expect(merged.values.KICKOFF_VERIFY_USER_ID).toBe("user-1");
    expect(merged.values.KICKOFF_VERIFY_PROOF_ID).toBe("cap-1");
    expect(merged.values.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS).toBe("record:cap-1,mode:mode-bracket,mode:mode-parlay");
    expect(merged.values.KICKOFF_VERIFY_LEADERBOARD_SCOPES).toBe("global,friend,season");
    expect(merged.values.KICKOFF_VERIFY_FIXTURE_IDS).toBe("100,200,300");
    expect(merged.values.KICKOFF_VERIFY_FILECOIN_RECORD_CID).toBe("bafy-record");
    expect(merged.values.KICKOFF_VERIFY_SHARE_IMAGE_URL).toContain("record.png");
    expect(merged.values.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL).toContain("mode.png");
  });

  it("derives new target contract env from legacy share-channel and leaderboard artifact shape", () => {
    const blocks = productionEnvBlocksFromArtifacts([
      {
        fileName: "public/share-channel-evidence.json",
        artifact: {
          targets: {
            proofId: "cap-1",
            modeIds: ["mode-bracket", "mode-parlay"],
          },
        },
      },
      {
        fileName: "public/leaderboard-backend.json",
        artifact: {
          queryContracts: [
            { scope: "global", passed: true },
            { scope: "friend", passed: true },
            { scope: "season", passed: true },
          ],
        },
      },
    ]);
    const merged = mergeProductionVerifyEnv(blocks, {});

    expect(merged.values.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS).toBe("record:cap-1,mode:mode-bracket,mode:mode-parlay");
    expect(merged.values.KICKOFF_VERIFY_LEADERBOARD_SCOPES).toBe("global,friend,season");
  });

  it("merges verify env into an existing env file without dropping runtime secrets", () => {
    const merged = mergeVerifyEnvIntoEnvText(
      [
        "VITE_PUBLIC_APP_URL=https://example.com/app/",
        "VITE_SUPABASE_URL=https://project.supabase.co",
        "KICKOFF_VERIFY_PROOF_ID=old-proof",
        "SUPABASE_SERVICE_ROLE_KEY=service-secret",
      ].join("\n"),
      "KICKOFF_VERIFY_PROOF_ID=new-proof\nKICKOFF_VERIFY_SHARE_IMAGE_URL=https://cdn.example/card.png\n",
    );

    expect(merged).toContain("VITE_PUBLIC_APP_URL=https://example.com/app/");
    expect(merged).toContain("SUPABASE_SERVICE_ROLE_KEY=service-secret");
    expect(merged).not.toContain("KICKOFF_VERIFY_PROOF_ID=old-proof");
    expect(merged).toContain("KICKOFF_VERIFY_PROOF_ID=new-proof");
    expect(merged).toContain("KICKOFF_VERIFY_SHARE_IMAGE_URL=https://cdn.example/card.png");
  });
});
