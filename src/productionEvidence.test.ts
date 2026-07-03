import { describe, expect, it } from "vitest";
import {
  buildProductionVerifyEnv,
  mergeProductionVerifyEnv,
  parseEnvText,
  productionFriendCode,
  publicRenderExpectation,
  summarizeProductionEvidence,
  type ProductionEvidencePacket,
} from "./productionEvidence";

const packet = (checks: ProductionEvidencePacket["checks"]): ProductionEvidencePacket => ({
  generatedAt: "2026-07-03T00:00:00.000Z",
  source: "local-script",
  strict: true,
  checks,
});

describe("production evidence summary", () => {
  it("parses dotenv-style verification variables", () => {
    expect(
      parseEnvText(`
        # production verification
        export VITE_PUBLIC_APP_URL="https://example.com/kickoff-lock-agent/"
        KICKOFF_VERIFY_USER_ID=user-1
        KICKOFF_VERIFY_SHARE_IMAGE_URL=https://example.com/card.png # public image
        bad-key=value
      `),
    ).toEqual({
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      KICKOFF_VERIFY_USER_ID: "user-1",
      KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://example.com/card.png",
    });
  });

  it("builds copyable production verification target env", () => {
    const env = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "user-1",
      proofId: "cap-1",
      modeId: "mode-1",
      filecoinRecordCid: "bafy-record",
      filecoinRecordPayloadHash: "a".repeat(64),
      filecoinModeCid: "bafy-mode",
      filecoinModePayloadHash: "b".repeat(64),
      friendCode: productionFriendCode("Chengdu, Sichuan", "fan@example.com"),
      shareImageUrl: "https://example.com/cards/cap-1.png",
    });

    expect(env).toContain("KICKOFF_VERIFY_USER_ID=user-1");
    expect(env).toContain("KICKOFF_VERIFY_FRIEND_CODE=chengdu-sichuan");
    expect(env).toContain("KICKOFF_VERIFY_FILECOIN_RECORD_CID=bafy-record");
    expect(env).toContain(`KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH=${"b".repeat(64)}`);
    expect(env).toContain("KICKOFF_VERIFY_SEASON_KEY=world-cup-run");
    expect(env).toContain("KICKOFF_VERIFY_FIXTURE_ID=");
    expect(parseEnvText(env).KICKOFF_VERIFY_SHARE_IMAGE_URL).toBe("https://example.com/cards/cap-1.png");
  });

  it("merges production verification env blocks without letting empty values erase real targets", () => {
    const merged = mergeProductionVerifyEnv([
      buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        proofId: "cap-1",
        modeId: "mode-1",
        shareImageUrl: "https://example.com/card.png",
      }),
      buildProductionVerifyEnv({
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModePayloadHash: "b".repeat(64),
        fixtureId: "fixture-200",
      }),
      `
      KICKOFF_VERIFY_FILECOIN_RECORD_CID=bafy-record
      KICKOFF_VERIFY_FILECOIN_MODE_CID=bafy-mode
      KICKOFF_VERIFY_PROOF_ID=
      `,
    ]);

    expect(merged.values.KICKOFF_VERIFY_USER_ID).toBe("user-1");
    expect(merged.values.KICKOFF_VERIFY_PROOF_ID).toBe("cap-1");
    expect(merged.values.KICKOFF_VERIFY_FIXTURE_ID).toBe("fixture-200");
    expect(merged.values.KICKOFF_VERIFY_FILECOIN_RECORD_CID).toBe("bafy-record");
    expect(merged.values.KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH).toBe("a".repeat(64));
    expect(merged.values.KICKOFF_VERIFY_ALLOW_FAILURES).toBe("1");
    expect(merged.missingKeys).not.toContain("KICKOFF_VERIFY_SEASON_KEY");
    expect(merged.text).toContain("KICKOFF_VERIFY_FILECOIN_MODE_CID=bafy-mode");
  });

  it("requires every required external check to pass", () => {
    const summary = summarizeProductionEvidence(
      packet([
        {
          id: "public-app-root",
          category: "public-app",
          label: "Public app root",
          required: true,
          status: "passed",
          detail: "HTTP 200",
          checkedAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "supabase-backend-health",
          category: "supabase",
          label: "Backend schema health",
          required: true,
          status: "failed",
          detail: "not ready",
          checkedAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "football-data-backup",
          category: "runtime",
          label: "Backup feed",
          required: false,
          status: "warning",
          detail: "optional token missing",
          checkedAt: "2026-07-03T00:00:00.000Z",
        },
      ]),
    );

    expect(summary.complete).toBe(false);
    expect(summary.requiredPassed).toBe(1);
    expect(summary.requiredTotal).toBe(2);
    expect(summary.optionalTotal).toBe(1);
    expect(summary.failedRequired.map((check) => check.id)).toEqual(["supabase-backend-health"]);
  });

  it("marks the packet complete when all required checks pass", () => {
    const summary = summarizeProductionEvidence(
      packet([
        {
          id: "public-app-root",
          category: "public-app",
          label: "Public app root",
          required: true,
          status: "passed",
          detail: "HTTP 200",
          checkedAt: "2026-07-03T00:00:00.000Z",
        },
      ]),
    );

    expect(summary.loaded).toBe(true);
    expect(summary.complete).toBe(true);
    expect(summary.openRequired).toEqual([]);
  });

  it("defines strict public render expectations for production proof surfaces", () => {
    expect(publicRenderExpectation("profile", "user-1")).toMatchObject({
      queryKey: "profile",
      requiredText: expect.arrayContaining(["Latest proof capsules", "Tournament mode runs", "Verifier packet"]),
      forbiddenText: expect.arrayContaining(["Profile unavailable", "needs share card"]),
    });
    expect(publicRenderExpectation("proof", "cap-1")).toMatchObject({
      queryKey: "proof",
      requiredText: expect.arrayContaining(["Proof verification", "Proof timeline", "Verifier packet", "cap-1"]),
      forbiddenText: expect.arrayContaining(["No share manifest yet"]),
    });
    expect(publicRenderExpectation("mode", "mode-1")).toMatchObject({
      queryKey: "mode",
      requiredText: expect.arrayContaining(["Mode proof verification", "Proof timeline", "Verifier packet", "mode-1"]),
      forbiddenText: expect.arrayContaining(["Cloud mode proof loaded. No share manifest"]),
    });
  });
});
