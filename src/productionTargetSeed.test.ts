import { describe, expect, it, vi } from "vitest";
import {
  buildProductionTargetSeed,
  buildProductionTargetSeedReport,
  publicSeedUrl,
  readShareImageMetadata,
  requiredProductionTargetSeedEnv,
  upsertProductionTargetSeed,
  type ShareImageSeedMetadata,
} from "./productionTargetSeed";

const image: ShareImageSeedMetadata = {
  imageUrl: "https://cdn.example.com/kickoff-share.png",
  imageMime: "image/png",
  imageByteLength: 120_000,
  imageHash: "a".repeat(64),
};

const env = {
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/?old=1#hash",
  VITE_SUPABASE_URL: "https://supabase.example.com",
  VITE_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  KICKOFF_SEED_SHARE_IMAGE_URL: image.imageUrl,
  KICKOFF_SEED_USER_ID: "user-prod-1",
  KICKOFF_SEED_EMAIL: "fan@example.com",
  KICKOFF_SEED_DISPLAY_NAME: "Production Fan",
  KICKOFF_SEED_LOCATION: "Chengdu",
};

describe("production target seed", () => {
  it("builds clean public target URLs", () => {
    expect(publicSeedUrl(env.VITE_PUBLIC_APP_URL, "proof", "cap-1")).toBe(
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
    );
  });

  it("reports missing write env while still allowing dry-run seed construction", async () => {
    const values = {
      VITE_PUBLIC_APP_URL: env.VITE_PUBLIC_APP_URL,
      KICKOFF_SEED_SHARE_IMAGE_URL: image.imageUrl,
    };
    expect(requiredProductionTargetSeedEnv(values)).toEqual(
      expect.arrayContaining(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
    );
    const report = await buildProductionTargetSeedReport(values, { image, now: "2026-07-03T00:00:00.000Z" });
    expect(report.ready).toBe(false);
    expect(report.seed?.targets.proofId).toMatch(/^cap-prod-/);
    expect(report.seed?.verifyEnv).toContain("KICKOFF_VERIFY_PROOF_ID=");
  });

  it("builds profile, record, mode and share artifact rows that match production doctor targets", async () => {
    const seed = await buildProductionTargetSeed(env, image, "2026-07-03T00:00:00.000Z");

    expect(seed.targets).toMatchObject({
      userId: "user-prod-1",
      profileId: "user-prod-1",
      friendCode: "chengdu",
      seasonKey: "world-cup-run",
      shareImageUrl: image.imageUrl,
    });
    expect(seed.rows.profile).toMatchObject({ id: "user-prod-1", friend_code: "chengdu" });
    expect(seed.rows.record).toMatchObject({
      id: seed.targets.proofId,
      user_id: "user-prod-1",
      total_score: 92,
    });
    expect(seed.rows.modeRun).toMatchObject({
      id: seed.targets.modeId,
      user_id: "user-prod-1",
      mode_id: "bracket",
      status: "scored",
      score: 88,
    });
    expect(seed.rows.shareArtifacts).toHaveLength(2);
    expect(seed.rows.shareArtifacts[0]).toMatchObject({
      id: seed.targets.proofId,
      kind: "record",
      image_url: image.imageUrl,
      image_hash: image.imageHash,
    });
    expect(seed.rows.shareArtifacts[1]).toMatchObject({
      id: seed.targets.modeId,
      kind: "mode",
      image_url: image.imageUrl,
      image_hash: image.imageHash,
    });
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_USER_ID=${seed.targets.userId}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_PROFILE_ID=${seed.targets.profileId}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_PROOF_ID=${seed.targets.proofId}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_MODE_ID=${seed.targets.modeId}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_SHARE_IMAGE_URL=${image.imageUrl}`);
  });

  it("reads and hashes public share image metadata", async () => {
    const fetcher = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const metadata = await readShareImageMetadata(env, fetcher as any);

    expect(fetcher).toHaveBeenCalledWith(image.imageUrl, { method: "GET" });
    expect(metadata).toMatchObject({
      imageUrl: image.imageUrl,
      imageMime: "image/png",
      imageByteLength: 4,
    });
    expect(metadata.imageHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("upserts target rows through Supabase REST with service role auth", async () => {
    const seed = await buildProductionTargetSeed(env, image, "2026-07-03T00:00:00.000Z");
    const fetcher = vi.fn(async () => new Response("[]", { status: 201 }));

    await upsertProductionTargetSeed(env, seed, fetcher as any);

    expect(fetcher).toHaveBeenCalledTimes(4);
    const calls = fetcher.mock.calls as unknown as Array<[string, any]>;
    expect(calls.map(([url]) => url)).toEqual([
      "https://supabase.example.com/rest/v1/kickoff_profiles?on_conflict=id",
      "https://supabase.example.com/rest/v1/kickoff_records?on_conflict=id",
      "https://supabase.example.com/rest/v1/kickoff_mode_runs?on_conflict=id",
      "https://supabase.example.com/rest/v1/kickoff_share_artifacts?on_conflict=id,kind",
    ]);
    for (const [, init] of calls) {
      expect(init.headers.Authorization).toBe("Bearer service-key");
      expect(init.headers.Prefer).toContain("resolution=merge-duplicates");
    }
  });
});
