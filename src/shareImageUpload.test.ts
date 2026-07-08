import { describe, expect, it, vi } from "vitest";
import {
  buildShareImageUploadArtifact,
  missingShareImageUploadEnv,
  productionShareImageUploadTarget,
  supabasePublicShareImageUrl,
  supabaseShareImageStoragePath,
  supabaseStorageUploadUrl,
  uploadSupabaseShareImage,
} from "./shareImageUpload";

const env = {
  VITE_SUPABASE_URL: "https://project.supabase.co/",
  VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

const pngBytes = (width = 1200, height = 675, size = 12_000) => {
  const bytes = new Uint8Array(size).fill(7);
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

describe("Supabase share image upload", () => {
  it("sanitizes public storage paths for profile and artifact ids", () => {
    expect(
      supabaseShareImageStoragePath({
        profileId: "User 123",
        kind: "record",
        artifactId: "Cap Fancy",
        fileName: "Cap Fancy Share.PNG",
      }),
    ).toBe("user-123/record/cap-fancy/cap-fancy-share.png");
  });

  it("builds upload and public URLs for the configured bucket", () => {
    const path = "user-123/record/cap-card/cap-card.png";

    expect(supabaseStorageUploadUrl(env, path)).toBe(
      "https://project.supabase.co/storage/v1/object/kickoff-share-cards/user-123/record/cap-card/cap-card.png",
    );
    expect(supabasePublicShareImageUrl(env, path)).toBe(
      "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-123/record/cap-card/cap-card.png",
    );
  });

  it("reports missing production upload credentials", () => {
    expect(missingShareImageUploadEnv({ VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards" })).toEqual([
      "VITE_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("rejects local Supabase projects as production upload targets", async () => {
    const localEnv = {
      ...env,
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    };
    const fetcher = vi.fn() as unknown as typeof fetch;
    const report = await uploadSupabaseShareImage(
      localEnv,
      {
        profileId: "user-123",
        kind: "record",
        artifactId: "cap-card",
        fileName: "cap-card.png",
      },
      pngBytes(),
      fetcher,
    );

    expect(missingShareImageUploadEnv(localEnv)).toEqual([
      "VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL",
    ]);
    expect(report).toMatchObject({
      ready: false,
      missing: ["VITE_SUPABASE_URL must be a deployed HTTPS Supabase project URL"],
      localImage: {
        imageMime: "image/png",
        imageByteLength: 12_000,
        imageHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("derives production upload targets from seed and verify env", () => {
    expect(
      productionShareImageUploadTarget(
        {
          KICKOFF_VERIFY_USER_ID: "user-verify",
          KICKOFF_SEED_USER_ID: "user-seed",
          KICKOFF_VERIFY_PROOF_ID: "cap-verify",
          KICKOFF_SEED_PROOF_ID: "cap-seed",
        },
        { fileName: "card.png" },
      ),
    ).toMatchObject({
      profileId: "user-seed",
      artifactId: "cap-seed",
      kind: "record",
      fileName: "card.png",
      imageMime: "image/png",
    });

    expect(
      productionShareImageUploadTarget(
        {
          KICKOFF_VERIFY_USER_ID: "user-verify",
          KICKOFF_VERIFY_MODE_IDS: "mode-bracket,mode-parlay,mode-agent,mode-upset,mode-group-path,mode-penalty-pressure",
        },
        { fileName: "mode.png", kind: "mode" },
      ),
    ).toMatchObject({
      profileId: "user-verify",
      artifactId: "mode-bracket",
      kind: "mode",
    });
  });

  it("uploads a PNG with service-role auth and verifies public read-back", async () => {
    const bytes = pngBytes();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (String(input).includes("/object/public/")) {
        return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } });
      }
      return new Response(JSON.stringify({ Key: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const report = await uploadSupabaseShareImage(
      env,
      {
        profileId: "user-123",
        kind: "record",
        artifactId: "cap-card",
        fileName: "cap-card.png",
      },
      bytes,
      fetcher,
    );

    expect(report.ready).toBe(true);
    expect(report.result?.publicUrl).toBe(
      "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-123/record/cap-card/cap-card.png",
    );
    expect(report.result?.imageHash).toMatch(/^[a-f0-9]{64}$/);
    const uploadCall = calls.find((call) => call.url.includes("/storage/v1/object/kickoff-share-cards/"));
    expect(uploadCall?.init?.method).toBe("POST");
    expect(uploadCall?.init?.headers).toMatchObject({
      apikey: "service-role",
      Authorization: "Bearer service-role",
      "Content-Type": "image/png",
      "x-upsert": "true",
    });
  });

  it("builds a reusable upload artifact for production sharing evidence", async () => {
    const bytes = pngBytes();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/object/public/")) {
        return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } });
      }
      return new Response(JSON.stringify({ Key: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const target = {
      profileId: "user-123",
      kind: "mode" as const,
      artifactId: "mode-card",
      fileName: "mode-card.png",
    };
    const report = await uploadSupabaseShareImage(env, target, bytes, fetcher);

    const artifact = buildShareImageUploadArtifact(report, {
      envFiles: [".env.production.local"],
      generatedAt: "2026-07-04T12:00:00.000Z",
      filePath: "/tmp/mode-card.png",
      target,
    });

    expect(artifact.artifactVersion).toBe(1);
    expect(artifact.generatedAt).toBe("2026-07-04T12:00:00.000Z");
    expect(artifact.envFiles).toEqual([".env.production.local"]);
    expect(artifact.acceptance).toMatchObject({
      uploaded: true,
      publicReadBack: true,
      supabasePublicUrl: true,
      imageHashReady: true,
      localImageHashReady: true,
      localImageSizeReady: true,
      outputEnvKeys: ["KICKOFF_SEED_MODE_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
    });
    expect(artifact.readBackCommands).toEqual([
      expect.objectContaining({
        id: "public-image",
        url: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-123/mode/mode-card/mode-card.png",
        command:
          "curl -sS 'https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-123/mode/mode-card/mode-card.png' -o /tmp/kickoff-share-image-readback.png",
        ready: true,
        path: "user-123/mode/mode-card/mode-card.png",
        responseExpectation: {
          responseType: "image",
          contentType: "image/png",
          expectedImageHash: artifact.result?.imageHash,
          expectedByteLength: 12_000,
          minByteLength: 10_000,
          expectedPublicUrl:
            "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-123/mode/mode-card/mode-card.png",
          expectedStoragePath: "user-123/mode/mode-card/mode-card.png",
        },
      }),
    ]);
  });

  it("keeps blocked upload artifacts inspectable with local PNG metadata", async () => {
    const bytes = pngBytes();
    const target = {
      profileId: "user-123",
      kind: "record" as const,
      artifactId: "cap-card",
      fileName: "cap-card.png",
    };
    const report = await uploadSupabaseShareImage(
      { VITE_SUPABASE_SHARE_BUCKET: "kickoff-share-cards" },
      target,
      bytes,
      vi.fn() as unknown as typeof fetch,
    );

    const artifact = buildShareImageUploadArtifact(report, {
      generatedAt: "2026-07-04T12:00:00.000Z",
      filePath: "/tmp/cap-card.png",
      target,
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance).toMatchObject({
      uploaded: false,
      publicReadBack: false,
      supabasePublicUrl: false,
      imageHashReady: true,
      localImageHashReady: true,
      localImageSizeReady: true,
    });
    expect(artifact.readBackCommands).toEqual([]);
  });

  it("does not mark an upload artifact ready without public read-back and a real image hash", () => {
    const target = {
      profileId: "user-123",
      kind: "record" as const,
      artifactId: "cap-card",
      fileName: "cap-card.png",
    };

    const artifact = buildShareImageUploadArtifact(
      {
        ready: true,
        missing: [],
        result: {
          path: "user-123/record/cap-card/cap-card.png",
          uploadUrl: "https://project.supabase.co/storage/v1/object/kickoff-share-cards/user-123/record/cap-card/cap-card.png",
          publicUrl:
            "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-123/record/cap-card/cap-card.png",
          imageMime: "image/png",
          imageByteLength: 12_000,
          imageHash: "placeholder",
          publicReadBack: false,
        },
      },
      {
        generatedAt: "2026-07-04T12:00:00.000Z",
        filePath: "/tmp/cap-card.png",
        target,
      },
    );

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance).toMatchObject({
      uploaded: true,
      publicReadBack: false,
      supabasePublicUrl: true,
      imageHashReady: false,
    });
  });
});
