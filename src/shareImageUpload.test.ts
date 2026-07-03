import { describe, expect, it, vi } from "vitest";
import {
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
          KICKOFF_VERIFY_MODE_ID: "mode-verify",
        },
        { fileName: "mode.png", kind: "mode" },
      ),
    ).toMatchObject({
      profileId: "user-verify",
      artifactId: "mode-verify",
      kind: "mode",
    });
  });

  it("uploads a PNG with service-role auth and verifies public read-back", async () => {
    const bytes = new Uint8Array(12_000).fill(7);
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
});
