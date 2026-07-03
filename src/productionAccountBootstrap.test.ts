import { describe, expect, it } from "vitest";
import { buildProductionAccountBootstrapPacket } from "./productionAccountBootstrap";
import { buildProductionVerifyEnv } from "./productionEvidence";

describe("production account bootstrap packet", () => {
  it("builds a ready account and leaderboard acceptance packet from verify env", () => {
    const envText = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "user-1",
      proofId: "cap-1",
      modeId: "mode-1",
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      shareImageUrl: "https://cdn.example.com/share.png",
      allowFailures: true,
    });

    const packet = buildProductionAccountBootstrapPacket({
      envText,
      publicAppUrl: "https://example.com/kickoff-lock-agent/?old=1#hash",
    });

    expect(packet.ready).toBe(true);
    expect(packet.summary).toContain("7/7 account targets");
    expect(packet.publicLinks.map((link) => link.url)).toEqual([
      "https://example.com/kickoff-lock-agent/?profile=user-1",
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      "https://example.com/kickoff-lock-agent/?mode=mode-1",
    ]);
    expect(packet.queries.find((query) => query.scope === "friend")?.path).toContain("friend_code=eq.chengdu");
    expect(packet.queries.find((query) => query.scope === "season")?.path).toContain("season_key=eq.world-cup-run");
    expect(packet.commands).toEqual(
      expect.arrayContaining(["bun run seed:production-targets --upload-share-image", "bun run verify:production"]),
    );
    expect(packet.copyText).toContain("Supabase read-back queries");
  });

  it("keeps the packet pending when public targets and share image are missing", () => {
    const packet = buildProductionAccountBootstrapPacket({
      envText: "KICKOFF_VERIFY_USER_ID=user-1\nKICKOFF_VERIFY_SEASON_KEY=world-cup-run\n",
      publicAppUrl: "",
    });

    expect(packet.ready).toBe(false);
    expect(packet.missingTargets).toEqual(
      expect.arrayContaining([
        "Public profile row",
        "Prediction row",
        "Mode proof row",
        "Friend leaderboard scope",
        "Public share image",
        "VITE_PUBLIC_APP_URL",
      ]),
    );
    expect(packet.publicLinks.every((link) => !link.ready)).toBe(true);
    expect(packet.nextAction).toContain(".env.production.local");
  });
});
