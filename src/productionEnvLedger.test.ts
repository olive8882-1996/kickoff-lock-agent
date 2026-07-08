import { describe, expect, it } from "vitest";
import { buildProductionVerifyEnv } from "./productionEvidence";
import { buildProductionEnvLedger } from "./productionEnvLedger";

const accountTargets = {
  userId: "user-1",
  profileId: "user-1",
  publicProfileUrl: "https://example.com/?profile=user-1",
  proofId: "cap-1",
  modeIds: ["mode-bracket", "mode-parlay", "mode-agent", "mode-upset", "mode-group-path", "mode-penalty-pressure"],
  shareArtifactIds: ["record:cap-1", "mode:mode-bracket"],
  friendCode: "chengdu",
  seasonKey: "world-cup-run",
};

const filecoinTargets = {
  filecoinRecordJobId: "job-record",
  filecoinRecordCid: "bafy-record",
  filecoinRecordPayloadHash: "a".repeat(64),
  filecoinModeJobIds: ["job-mode-1", "job-mode-2", "job-mode-3", "job-mode-4", "job-mode-5", "job-mode-6"],
  filecoinModeCids: ["bafy-1", "bafy-2", "bafy-3", "bafy-4", "bafy-5", "bafy-6"],
  filecoinModePayloadHashes: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)],
};

const dataTargets = {
  fixtureIds: ["100", "200", "300"],
  fixtureSignalMatrix:
    "100:lineups=2|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
};

const shareTargets = {
  shareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
  modeShareImageUrl: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
};

describe("production verify env ledger", () => {
  it("marks missing external target variables with clear commands", () => {
    const ledger = buildProductionEnvLedger(
      buildProductionVerifyEnv({
        ...accountTargets,
        allowFailures: true,
      }),
    );

    expect(ledger.ready).toBe(false);
    expect(ledger.requiredFilled).toBeLessThan(ledger.requiredTotal);
    expect(ledger.missingRequiredKeys).toEqual(
      expect.arrayContaining([
        "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
        "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
        "KICKOFF_VERIFY_FIXTURE_IDS",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
      ]),
    );
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_MODE_ID")).toMatchObject({
      required: false,
      status: "optional",
    });
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_FILECOIN_RECORD_CID")).toMatchObject({
      command: "bun run seal:production-targets",
      status: "missing",
    });
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_FIXTURE_IDS")).toMatchObject({
      command: "bun run scout:data-targets",
      status: "missing",
    });
    expect(ledger.nextAction).toContain("seal:production-targets");
    expect(ledger.copyText).toContain("Missing required keys:");
  });

  it("treats multi-mode CID and fixture lists as production-ready targets", () => {
    const ledger = buildProductionEnvLedger(
      buildProductionVerifyEnv({
        ...accountTargets,
        ...filecoinTargets,
        ...dataTargets,
        ...shareTargets,
        allowFailures: true,
      }),
    );

    expect(ledger.ready).toBe(true);
    expect(ledger.missingRequiredKeys).toEqual([]);
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_FILECOIN_MODE_CID")).toMatchObject({
      required: false,
      status: "optional",
    });
    expect(ledger.groups.find((group) => group.group === "filecoin")).toMatchObject({
      ready: true,
    });
    expect(ledger.nextAction).toContain("doctor:production");
  });

  it("does not accept account target env when profile id differs from the signed-in user id", () => {
    const ledger = buildProductionEnvLedger(
      buildProductionVerifyEnv({
        ...accountTargets,
        profileId: "profile-2",
        ...filecoinTargets,
        ...dataTargets,
        ...shareTargets,
        allowFailures: true,
      }),
    );

    expect(ledger.ready).toBe(false);
    expect(ledger.missingRequiredKeys).toContain("KICKOFF_VERIFY_PROFILE_ID");
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_PROFILE_ID")).toMatchObject({
      status: "invalid",
      valuePreview: "profile-2 (must match KICKOFF_VERIFY_USER_ID)",
    });
  });

  it("accepts deployed public bitmap URLs as share image targets", () => {
    const ledger = buildProductionEnvLedger(
      buildProductionVerifyEnv({
        ...accountTargets,
        ...filecoinTargets,
        ...dataTargets,
        shareImageUrl: "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-share.png",
        modeShareImageUrl: "https://cdn.example.com/mode-card.webp",
        allowFailures: true,
      }),
    );

    expect(ledger.ready).toBe(true);
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_SHARE_IMAGE_URL")).toMatchObject({
      status: "filled",
    });
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL")).toMatchObject({
      status: "filled",
    });
  });


  it("requires standings rows in the fixture signal matrix before realtime data targets are ready", () => {
    const ledger = buildProductionEnvLedger(
      buildProductionVerifyEnv({
        ...accountTargets,
        ...filecoinTargets,
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=2|injuries=1|odds=1,200:lineups=2|injuries=1|odds=1,300:lineups=2|injuries=1|odds=1",
        ...shareTargets,
        allowFailures: true,
      }),
    );

    expect(ledger.ready).toBe(false);
    expect(ledger.missingRequiredKeys).toContain("KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX");
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX")).toMatchObject({
      status: "invalid",
      valuePreview: expect.stringContaining("missing standings rows"),
    });
  });

  it("requires both team lineup rows in the fixture signal matrix before realtime data targets are ready", () => {
    const ledger = buildProductionEnvLedger(
      buildProductionVerifyEnv({
        ...accountTargets,
        ...filecoinTargets,
        fixtureIds: ["100", "200", "300"],
        fixtureSignalMatrix:
          "100:lineups=1|injuries=1|odds=1|standings=2,200:lineups=2|injuries=1|odds=1|standings=2,300:lineups=2|injuries=1|odds=1|standings=2",
        ...shareTargets,
        allowFailures: true,
      }),
    );

    expect(ledger.ready).toBe(false);
    expect(ledger.missingRequiredKeys).toContain("KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX");
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX")).toMatchObject({
      status: "invalid",
      valuePreview: expect.stringContaining("100 missing lineups rows"),
    });
  });

  it("keeps malformed target values out of ready even when every key is present", () => {
    const ledger = buildProductionEnvLedger(
      buildProductionVerifyEnv({
        ...accountTargets,
        publicProfileUrl: "http://localhost:5173/?profile=user-1",
        proofId: "cap-1",
        modeIds: ["mode-bracket"],
        shareArtifactIds: ["cap-1"],
        filecoinRecordCid: "bafy-record",
        filecoinRecordPayloadHash: "not-a-sha",
        filecoinModeCids: ["bafy-1", "bafy-2"],
        filecoinModePayloadHashes: ["b".repeat(64), "not-a-sha"],
        leaderboardScopes: ["global", "friend"],
        fixtureIds: ["100"],
        fixtureSignalMatrix: "100:lineups=1|injuries=0|odds=1",
        shareImageUrl: "http://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-share.png",
        modeShareImageUrl: "https://cdn.example.com/mode-card.svg",
      }),
    );

    expect(ledger.ready).toBe(false);
    expect(ledger.missingRequiredKeys).toEqual(
      expect.arrayContaining([
        "KICKOFF_VERIFY_MODE_IDS",
        "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
        "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
        "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
        "KICKOFF_VERIFY_FIXTURE_IDS",
        "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ]),
    );
    expect(ledger.rows.find((row) => row.key === "KICKOFF_VERIFY_SHARE_IMAGE_URL")).toMatchObject({
      status: "invalid",
    });
    expect(ledger.copyText).toContain("must be a public HTTPS URL");
    expect(ledger.copyText).toContain("must point to a PNG, JPEG or WebP image path");
  });
});
