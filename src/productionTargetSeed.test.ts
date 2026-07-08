import { describe, expect, it, vi } from "vitest";
import {
  buildProductionTargetSeed,
  buildProductionTargetSeedArtifact,
  buildProductionTargetSeedReport,
  publicSeedUrl,
  readShareImageMetadata,
  requiredProductionTargetSeedEnv,
  upsertProductionTargetSeed,
  verifyProductionTargetSeedAuthUser,
  type ShareImageSeedMetadata,
} from "./productionTargetSeed";
import type { SupabaseDoctorReport } from "./supabaseProductionDoctor";

const image: ShareImageSeedMetadata = {
  imageUrl: "https://cdn.example.com/kickoff-share.png",
  imageMime: "image/png",
  imageByteLength: 120_000,
  imageHash: "a".repeat(64),
};

const modeImage: ShareImageSeedMetadata = {
  imageUrl: "https://cdn.example.com/kickoff-mode-share.png",
  imageMime: "image/png",
  imageByteLength: 130_000,
  imageHash: "b".repeat(64),
};

const pngBytes = (width = 1200, height = 675, size = 12_000) => {
  const bytes = new Uint8Array(size).fill(1);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
};

const env = {
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/?old=1#hash",
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  KICKOFF_SEED_SHARE_IMAGE_URL: image.imageUrl,
  KICKOFF_SEED_MODE_SHARE_IMAGE_URL: modeImage.imageUrl,
  KICKOFF_SEED_USER_ID: "user-prod-1",
  KICKOFF_SEED_EMAIL: "fan@example.com",
  KICKOFF_SEED_DISPLAY_NAME: "Production Fan",
  KICKOFF_SEED_LOCATION: "Chengdu",
};

const doctor = (ready = true): SupabaseDoctorReport => ({
  ready,
  requiredPassed: ready ? 21 : 20,
  requiredTotal: 21,
  checks: ready
    ? [
        {
          id: "target-auth-user",
          label: "Target Auth user",
          required: true,
          status: "passed",
          detail: "Auth user read back",
          action: "seed",
        },
        {
          id: "target-auth-profile-identity",
          label: "Auth/profile identity match",
          required: true,
          status: "passed",
          detail: "Auth user and profile share email",
          action: "seed",
        },
      ]
    : [],
  nextActions: ready
    ? []
    : [
        {
          id: "target-profile-row",
          label: "Target profile row",
          required: true,
          status: "failed",
          detail: "missing",
          action: "seed",
        },
      ],
});

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
      KICKOFF_SEED_MODE_SHARE_IMAGE_URL: modeImage.imageUrl,
    };
    expect(requiredProductionTargetSeedEnv(values)).toEqual(
      expect.arrayContaining([
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "KICKOFF_SEED_USER_ID or KICKOFF_VERIFY_USER_ID",
      ]),
    );
    const report = await buildProductionTargetSeedReport(values, { image, modeImage, now: "2026-07-03T00:00:00.000Z" });
    expect(report.ready).toBe(false);
    expect(report.seed?.targets.proofId).toMatch(/^cap-prod-/);
    expect(report.seed?.verifyEnv).toContain("KICKOFF_VERIFY_PROOF_ID=");
  });

  it("does not mark production target seed ready without an explicit Auth user id", async () => {
    const report = await buildProductionTargetSeedReport(
      {
        ...env,
        KICKOFF_SEED_USER_ID: "",
        KICKOFF_VERIFY_USER_ID: "",
      },
      { image, modeImage, now: "2026-07-03T00:00:00.000Z" },
    );

    expect(report.ready).toBe(false);
    expect(report.missing).toContain("KICKOFF_SEED_USER_ID or KICKOFF_VERIFY_USER_ID");
    expect(report.seed?.targets.userId).toBe("kickoff-production-seed");
  });

  it("blocks production target seed when seed and verification account ids disagree", async () => {
    const report = await buildProductionTargetSeedReport(
      {
        ...env,
        KICKOFF_SEED_USER_ID: "auth-user-a",
        KICKOFF_VERIFY_USER_ID: "auth-user-b",
        KICKOFF_VERIFY_PROFILE_ID: "auth-user-b",
      },
      { image, modeImage, now: "2026-07-03T00:00:00.000Z" },
    );

    expect(report.ready).toBe(false);
    expect(report.missing).toEqual(
      expect.arrayContaining([
        "KICKOFF_SEED_USER_ID must match KICKOFF_VERIFY_USER_ID",
        "KICKOFF_SEED_USER_ID must match KICKOFF_VERIFY_PROFILE_ID",
      ]),
    );
  });

  it("requires a mode-specific share image before building production seed report", async () => {
    const report = await buildProductionTargetSeedReport(
      {
        ...env,
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "",
        KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "",
      },
      { image, now: "2026-07-03T00:00:00.000Z" },
    );

    expect(report.ready).toBe(false);
    expect(report.missing).toContain("KICKOFF_SEED_MODE_SHARE_IMAGE_URL");
    expect(report.seed).toBeUndefined();
  });

  it("marks seed ready from public GitHub Pages share image URLs when Supabase is configured", async () => {
    const report = await buildProductionTargetSeedReport(
      {
        ...env,
        KICKOFF_SEED_SHARE_IMAGE_URL:
          "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-share.png",
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL:
          "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-mode-share.png",
      },
      { image, modeImage, now: "2026-07-03T00:00:00.000Z" },
    );

    expect(report.ready).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.seed?.targets.proofId).toMatch(/^cap-prod-/);
  });

  it("does not mark seed ready from local or non-image share URLs", async () => {
    const report = await buildProductionTargetSeedReport(
      {
        ...env,
        KICKOFF_SEED_SHARE_IMAGE_URL: "http://localhost/share.png",
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/kickoff-mode-share.svg",
      },
      { image, modeImage, now: "2026-07-03T00:00:00.000Z" },
    );

    expect(report.ready).toBe(false);
    expect(report.missing).toEqual(
      expect.arrayContaining([
        "Record share image URL must be a public HTTPS URL",
        "Mode share image URL must point to a PNG, JPEG or WebP image path",
      ]),
    );
    expect(report.seed?.targets.proofId).toMatch(/^cap-prod-/);
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
    expect(seed.modeRuns.map((run) => run.modeId)).toEqual(["bracket", "parlay", "agent-vs-human", "upset", "group-path", "penalty-pressure"]);
    expect(seed.modeRuns.map((run) => run.title)).toEqual([
      "Production bracket path",
      "Production parlay ticket",
      "Production agent calibration",
      "Production upset challenge",
      "Production group path",
      "Production penalty pressure",
    ]);
    expect(seed.rows.modeRuns).toHaveLength(6);
    expect(seed.targets.modeIds).toHaveLength(6);
    expect(seed.rows.shareArtifacts).toHaveLength(7);
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
    expect(seed.rows.shareArtifacts.filter((artifact) => artifact.kind === "mode").map((artifact) => artifact.id)).toEqual(
      seed.targets.modeIds,
    );
    expect(seed.targets.modeShareImageUrl).toBe(image.imageUrl);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_USER_ID=${seed.targets.userId}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_PROFILE_ID=${seed.targets.profileId}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_PROOF_ID=${seed.targets.proofId}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_MODE_ID=${seed.targets.modeId}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_MODE_IDS=${JSON.stringify(seed.targets.modeIds.join(","))}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_SHARE_IMAGE_URL=${image.imageUrl}`);
  });

  it("can seed a distinct production share image for mode proof artifacts", async () => {
    const seed = await buildProductionTargetSeed(
      env,
      { record: image, mode: modeImage },
      "2026-07-03T00:00:00.000Z",
    );

    expect(seed.rows.shareArtifacts[0]).toMatchObject({
      kind: "record",
      image_url: image.imageUrl,
      image_hash: image.imageHash,
    });
    expect(seed.rows.shareArtifacts.filter((artifact) => artifact.kind === "mode")).toHaveLength(6);
    expect(seed.rows.shareArtifacts.filter((artifact) => artifact.kind === "mode")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mode",
          image_url: modeImage.imageUrl,
          image_hash: modeImage.imageHash,
        }),
      ]),
    );
    expect(seed.targets.shareImageUrl).toBe(image.imageUrl);
    expect(seed.targets.modeShareImageUrl).toBe(modeImage.imageUrl);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_SHARE_IMAGE_URL=${image.imageUrl}`);
    expect(seed.verifyEnv).toContain(`KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL=${modeImage.imageUrl}`);
    expect(seed.verifyEnv.match(/^KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL=/gm)).toHaveLength(1);
  });

  it("reads a mode-specific share image when mode seed env is configured", async () => {
    const fetcher = vi.fn(async (url: string) =>
      new Response(url.includes("mode") ? pngBytes(1200, 675, 13_000) : pngBytes(1200, 675, 12_000), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const report = await buildProductionTargetSeedReport(
      {
        ...env,
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL: modeImage.imageUrl,
      },
      { fetcher: fetcher as any, now: "2026-07-03T00:00:00.000Z" },
    );

    expect(fetcher).toHaveBeenCalledWith(image.imageUrl, { method: "GET" });
    expect(fetcher).toHaveBeenCalledWith(modeImage.imageUrl, { method: "GET" });
    expect(report.seed?.targets.shareImageUrl).toBe(image.imageUrl);
    expect(report.seed?.targets.modeShareImageUrl).toBe(modeImage.imageUrl);
    expect(report.seed?.rows.shareArtifacts.filter((artifact) => artifact.kind === "mode")).toHaveLength(6);
    expect(report.seed?.rows.shareArtifacts.filter((artifact) => artifact.kind === "mode")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mode",
          image_url: modeImage.imageUrl,
        }),
      ]),
    );
  });

  it("reads and hashes public share image metadata", async () => {
    const fetcher = vi.fn(async () =>
      new Response(pngBytes(), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const metadata = await readShareImageMetadata(env, fetcher as any);

    expect(fetcher).toHaveBeenCalledWith(image.imageUrl, { method: "GET" });
    expect(metadata).toMatchObject({
      imageUrl: image.imageUrl,
      imageMime: "image/png",
      imageByteLength: 12_000,
    });
    expect(metadata.imageHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds a reusable Supabase target seed artifact with upsert and doctor read-back state", async () => {
    const report = await buildProductionTargetSeedReport(env, {
      image,
      modeImage,
      now: "2026-07-03T00:00:00.000Z",
    });

    const artifact = buildProductionTargetSeedArtifact(report, {
      dryRun: false,
      upserted: true,
      authUser: {
        ready: true,
        userId: "user-prod-1",
        url: "https://project.supabase.co/auth/v1/admin/users/user-prod-1",
        detail: "Auth user user-prod-1 read back with email and google",
        missing: [],
        sampleIds: ["user-prod-1"],
      },
      doctor: doctor(true),
      envFiles: [".env.production.local"],
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.artifactVersion).toBe(1);
    expect(artifact.generatedAt).toBe("2026-07-04T12:00:00.000Z");
    expect(artifact.envFiles).toEqual([".env.production.local"]);
    expect(artifact.doctor).toMatchObject({
      ready: true,
      requiredPassed: 21,
      requiredTotal: 21,
      passedCheckIds: ["target-auth-user", "target-auth-profile-identity"],
      failedCheckIds: [],
    });
    expect(artifact.acceptance).toMatchObject({
      authUserReady: true,
      upserted: true,
      doctorReady: true,
      profileTarget: true,
      recordTarget: true,
      modeTargetCount: 6,
      requiredModeTargetCount: 6,
      shareArtifactCount: 7,
      requiredShareArtifactCount: 7,
      recordShareChannelOpened: true,
      modeShareChannelCount: 6,
      requiredModeShareChannelCount: 6,
      shareChannelCount: 7,
      requiredShareChannelCount: 7,
      outputEnvKeys: [
        "KICKOFF_VERIFY_USER_ID",
        "KICKOFF_VERIFY_PROFILE_ID",
        "KICKOFF_VERIFY_PUBLIC_PROFILE_URL",
        "KICKOFF_VERIFY_PROOF_ID",
        "KICKOFF_VERIFY_MODE_IDS",
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS",
        "KICKOFF_VERIFY_FRIEND_CODE",
        "KICKOFF_VERIFY_SEASON_KEY",
        "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ],
    });
  });

  it("keeps the Supabase target seed artifact incomplete for dry-runs or failed doctor read-back", async () => {
    const report = await buildProductionTargetSeedReport(env, {
      image,
      modeImage,
      now: "2026-07-03T00:00:00.000Z",
    });

    const artifact = buildProductionTargetSeedArtifact(report, {
      dryRun: true,
      upserted: false,
      doctor: doctor(false),
    });

    expect(artifact.dryRun).toBe(true);
    expect(artifact.acceptance.authUserReady).toBe(false);
    expect(artifact.acceptance.upserted).toBe(false);
    expect(artifact.acceptance.doctorReady).toBe(false);
    expect(artifact.doctor?.failedCheckIds).toEqual(["target-profile-row"]);
  });

  it("verifies the Supabase Auth user before production target rows are written", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "user-prod-1",
          email: "fan@example.com",
          identities: [{ provider: "google" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const check = await verifyProductionTargetSeedAuthUser(env, "user-prod-1", fetcher as any);

    expect(check).toMatchObject({
      ready: true,
      userId: "user-prod-1",
      detail: "Auth user user-prod-1 read back with email and google",
      sampleIds: ["user-prod-1"],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/admin/users/user-prod-1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer service-key" }),
      }),
    );
  });

  it("blocks Auth preflight when the service role user read-back is missing or mismatched", async () => {
    const missing = await verifyProductionTargetSeedAuthUser(
      { ...env, SUPABASE_SERVICE_ROLE_KEY: "" },
      "user-prod-1",
      vi.fn() as any,
    );
    expect(missing).toMatchObject({ ready: false, missing: ["SUPABASE_SERVICE_ROLE_KEY"] });

    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ id: "other-user", email: "" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const mismatched = await verifyProductionTargetSeedAuthUser(env, "user-prod-1", fetcher as any);

    expect(mismatched.ready).toBe(false);
    expect(mismatched.detail).toContain("auth id other-user != user-prod-1");
    expect(mismatched.detail).toContain("auth email missing");
  });

  it("rejects placeholder share image metadata before seeding production target rows", async () => {
    const fetcher = vi.fn(async () =>
      new Response(pngBytes(320, 180, 512), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    await expect(readShareImageMetadata(env, fetcher as any)).rejects.toThrow("Share image URL is not production-ready");
  });

  it("upserts target rows through Supabase REST with service role auth", async () => {
    const seed = await buildProductionTargetSeed(env, image, "2026-07-03T00:00:00.000Z");
    const fetcher = vi.fn(async () => new Response("[]", { status: 201 }));

    await upsertProductionTargetSeed(env, seed, fetcher as any);

    expect(fetcher).toHaveBeenCalledTimes(4);
    const calls = fetcher.mock.calls as unknown as Array<[string, any]>;
    expect(calls.map(([url]) => url)).toEqual([
      "https://project.supabase.co/rest/v1/kickoff_profiles?on_conflict=id",
      "https://project.supabase.co/rest/v1/kickoff_records?on_conflict=id",
      "https://project.supabase.co/rest/v1/kickoff_mode_runs?on_conflict=id",
      "https://project.supabase.co/rest/v1/kickoff_share_artifacts?on_conflict=id,kind",
    ]);
    for (const [, init] of calls) {
      expect(init.headers.Authorization).toBe("Bearer service-key");
      expect(init.headers.Prefer).toContain("resolution=merge-duplicates");
    }
  });
});
