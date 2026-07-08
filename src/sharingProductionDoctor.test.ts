import { describe, expect, it, vi } from "vitest";
import {
  buildPublicRestoreEvidenceArtifact,
  buildSharingProductionDoctorReport,
  publicShareUrl,
  type RenderedPublicPage,
} from "./sharingProductionDoctor";

const env = {
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_URL: "https://project.supabase.co",
  KICKOFF_VERIFY_PROFILE_ID: "user-1",
  KICKOFF_VERIFY_PROOF_ID: "cap-1",
  KICKOFF_VERIFY_MODE_ID: "mode-1",
  KICKOFF_VERIFY_MODE_IDS: "mode-1,mode-2,mode-3,mode-4,mode-5,mode-6",
  KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
  KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
};

const pngBytes = (width = 1200, height = 675, size = 12_000) => {
  const bytes = new Uint8Array(size);
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

const shareImageResponse = (options: { width?: number; height?: number; size?: number } = {}) => {
  const bytes = pngBytes(options.width, options.height, options.size);
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "image/png", "content-length": String(bytes.byteLength) },
  });
};

const imageObject = (imageUrl: string) => ({
  "@type": "ImageObject",
  contentUrl: imageUrl,
  encodingFormat: "image/png",
  contentSize: 12_000,
  sha256: "a".repeat(64),
});

const pageFor = (url: string): RenderedPublicPage => {
  const parsed = new URL(url);
  const profile = parsed.searchParams.get("profile");
  const proof = parsed.searchParams.get("proof");
  const mode = parsed.searchParams.get("mode");
  if (profile) {
    return {
      text: `Cloud profile loaded. Latest proof capsules Tournament mode runs Verifier packet Social metadata share cards ${profile}`,
      canonical: url,
      ogTitle: "Profile",
      ogImage: "https://cdn.example.com/profile.png",
      twitterCard: "summary_large_image",
      jsonLd: JSON.stringify({ identifier: profile }),
      publicKind: "profile",
      publicTarget: profile,
      publicSource: "cloud",
    };
  }
  if (mode) {
    return {
      text: `Cloud mode proof and share manifest loaded. Mode proof verification Mode proof facts Proof timeline Verifier packet Social metadata ${mode}`,
      canonical: url,
      ogTitle: "Mode",
      ogImage: env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL,
      twitterCard: "summary_large_image",
      jsonLd: JSON.stringify({
        identifier: mode,
        image: env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL,
        associatedMedia: imageObject(env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL),
      }),
      publicKind: "mode",
      publicTarget: mode,
      publicSource: "cloud",
    };
  }
  return {
    text: `Cloud proof and share manifest loaded. Proof verification Proof facts Proof timeline Verifier packet Social metadata Prediction ${proof}`,
    canonical: url,
    ogTitle: "Proof",
    ogImage: env.KICKOFF_VERIFY_SHARE_IMAGE_URL,
    twitterCard: "summary_large_image",
    jsonLd: JSON.stringify({
      identifier: proof,
      image: env.KICKOFF_VERIFY_SHARE_IMAGE_URL,
      associatedMedia: imageObject(env.KICKOFF_VERIFY_SHARE_IMAGE_URL),
    }),
    publicKind: "proof",
    publicTarget: proof ?? "",
    publicSource: "cloud",
  };
};

describe("sharing production doctor", () => {
  it("builds public proof URLs from the deployed app URL", () => {
    expect(publicShareUrl(env.VITE_PUBLIC_APP_URL, "proof", "cap-1")).toBe(
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
    );
  });

  it("fails clearly when public target ids and share image URL are missing", async () => {
    const renderer = vi.fn();
    const fetcher = vi.fn();
    const report = await buildSharingProductionDoctorReport(
      { VITE_PUBLIC_APP_URL: env.VITE_PUBLIC_APP_URL },
      { renderer, fetcher: fetcher as any },
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "public-app-url")?.status).toBe("passed");
    expect(report.nextActions.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        "profile-target-id",
        "proof-target-id",
        "mode-target-id",
        "share-image-public-read",
        "mode-share-image-public-read",
      ]),
    );
    expect(renderer).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("passes when public pages render canonical social metadata and the share image is public", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(true);
    expect(report.requiredPassed).toBe(report.requiredTotal);
    expect(renderer).toHaveBeenCalledTimes(8);
    expect(report.checks.find((check) => check.id === "mode-target-id")?.sampleIds).toEqual([
      "mode-1",
      "mode-2",
      "mode-3",
      "mode-4",
      "mode-5",
      "mode-6",
    ]);
    expect(report.checks.find((check) => check.id === "mode-render")?.detail).toContain("6/6");
    expect(report.checks.find((check) => check.id === "clean-session-restore")).toMatchObject({
      status: "passed",
    });
    expect(report.checks.find((check) => check.id === "proof-render")?.detail).toContain("social metadata");
    expect(report.checks.find((check) => check.id === "share-image-public-read")?.detail).toContain("12000 bytes");
    expect(report.checks.find((check) => check.id === "share-image-public-read")?.detail).toContain("1200x675");
    expect(report.checks.find((check) => check.id === "mode-share-image-public-read")?.detail).toContain("12000 bytes");
    expect(report.checks.find((check) => check.id === "mode-share-image-public-read")?.detail).toContain("1200x675");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("builds a reusable public restore artifact from clean-session render evidence", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });
    const artifact = buildPublicRestoreEvidenceArtifact(report, {
      env,
      envFiles: [".env.production.local"],
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(true);
    expect(artifact.targets).toMatchObject({
      publicAppUrl: "https://example.com/kickoff-lock-agent/",
      profileId: "user-1",
      proofId: "cap-1",
      modeIds: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
    });
    expect(artifact.acceptance).toMatchObject({
      publicAppUrlReady: true,
      cleanSessionRestore: true,
      profileRender: true,
      proofRender: true,
      modeRenderCount: 6,
      cleanSessionProfileIds: ["user-1"],
      cleanSessionProofIds: ["cap-1"],
      cleanSessionModeIds: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
      shareImageReadBack: true,
      modeShareImageReadBack: true,
    });
    expect(artifact.pageTargets).toHaveLength(8);
    expect(artifact.pageTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "profile",
          targetId: "user-1",
          url: "https://example.com/kickoff-lock-agent/?profile=user-1",
          ready: true,
          expectedSource: "cloud",
        }),
        expect.objectContaining({
          kind: "proof",
          targetId: "cap-1",
          url: "https://example.com/kickoff-lock-agent/?proof=cap-1",
          ready: true,
          expectedSource: "cloud",
        }),
        expect.objectContaining({
          kind: "mode",
          targetId: "mode-5",
          url: "https://example.com/kickoff-lock-agent/?mode=mode-5",
          ready: true,
          expectedSource: "cloud",
        }),
      ]),
    );
    expect(artifact.readBackCommands).toHaveLength(16);
    expect(artifact.readBackCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "public-page:profile:user-1",
          kind: "public-page",
          expectedSource: "cloud",
          authMode: "public-page",
          url: "https://example.com/kickoff-lock-agent/?profile=user-1",
          command: "curl -sS 'https://example.com/kickoff-lock-agent/?profile=user-1'",
          ready: true,
          responseExpectation: {
            responseType: "public-html",
            targetKind: "profile",
            targetId: "user-1",
            expectedSource: "cloud",
            requiresCleanSession: true,
            pageKind: "profile",
            queryParam: "profile",
            targetIds: ["user-1"],
            requiredFields: [
              "canonical-url",
              "og:title",
              "og:image",
              "twitter:card",
              "json-ld",
              "public-kind",
              "public-target",
              "public-source-cloud",
              "social-metadata",
              "share-image",
              "cloud-record",
            ],
          },
        }),
        expect.objectContaining({
          id: "supabase-row:profile:user-1",
          kind: "supabase-row",
          table: "kickoff_profiles",
          expectedSource: "cloud",
          authMode: "anon",
          queryPath: "kickoff_profiles?select=id%2Cemail%2Cdisplay_name%2Clocation%2Cfriend_code%2Cseason_key%2Cupdated_at&id=eq.user-1&limit=1",
          url: "https://project.supabase.co/rest/v1/kickoff_profiles?select=id%2Cemail%2Cdisplay_name%2Clocation%2Cfriend_code%2Cseason_key%2Cupdated_at&id=eq.user-1&limit=1",
          command: expect.stringContaining("$VITE_SUPABASE_ANON_KEY"),
          ready: true,
          responseExpectation: {
            responseType: "supabase-array",
            targetKind: "profile",
            targetId: "user-1",
            expectedSource: "cloud",
            minRows: 1,
            requiredFields: ["id", "email", "display_name", "location", "friend_code", "season_key", "updated_at"],
            table: "kickoff_profiles",
          },
        }),
        expect.objectContaining({
          id: "supabase-row:proof:cap-1",
          kind: "supabase-row",
          table: "kickoff_records",
          expectedSource: "cloud",
          authMode: "anon",
          queryPath: "kickoff_records?select=id%2Cuser_id%2Ccapsule%2Cresult%2Cseal_job%2Cupdated_at&id=eq.cap-1&limit=1",
          command: expect.stringContaining("/rest/v1/kickoff_records"),
          ready: true,
        }),
        expect.objectContaining({
          id: "supabase-row:mode:mode-5",
          kind: "supabase-row",
          table: "kickoff_mode_runs",
          expectedSource: "cloud",
          authMode: "anon",
          queryPath: "kickoff_mode_runs?select=id%2Cuser_id%2Cmode_id%2Cstatus%2Cscore%2Cmode_run%2Cupdated_at&id=eq.mode-5&limit=1",
          command: expect.stringContaining("id=eq.mode-5"),
          ready: true,
        }),
      ]),
    );
  });

  it("keeps the public restore artifact not ready when clean-session cloud markers are missing", async () => {
    const renderer = vi.fn(async (url: string) => {
      const page = pageFor(url);
      return {
        ...page,
        text: page.text.replace("Cloud profile loaded. ", "").replace("Cloud proof and share manifest loaded. ", ""),
        publicSource: "",
      };
    });
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });
    const artifact = buildPublicRestoreEvidenceArtifact(report, {
      env,
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.cleanSessionRestore).toBe(false);
    expect(artifact.acceptance.modeRenderCount).toBe(6);
    expect(artifact.acceptance.cleanSessionProfileIds).toEqual([]);
    expect(artifact.acceptance.cleanSessionProofIds).toEqual([]);
    expect(artifact.acceptance.cleanSessionModeIds).toEqual(["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"]);
  });

  it("keeps proof and mode clean-session ids when only the public profile falls back", async () => {
    const renderer = vi.fn(async (url: string) => {
      const page = pageFor(url);
      return url.includes("profile=")
        ? {
            ...page,
            text: page.text.replace("Cloud profile loaded. ", "Public fixture profile loaded. "),
            publicSource: "fixture",
          }
        : page;
    });
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });
    const artifact = buildPublicRestoreEvidenceArtifact(report, {
      env,
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.cleanSessionRestore).toBe(false);
    expect(artifact.acceptance.cleanSessionProfileIds).toEqual([]);
    expect(artifact.acceptance.cleanSessionProofIds).toEqual(["cap-1"]);
    expect(artifact.acceptance.cleanSessionModeIds).toEqual(["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"]);
  });

  it("evaluates rendered page copy case-insensitively while keeping social metadata strict", async () => {
    const renderer = vi.fn(async (url: string) => {
      const page = pageFor(url);
      return {
        ...page,
        text: page.text.toUpperCase(),
      };
    });
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "proof-render")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "mode-render")?.status).toBe("passed");
  });

  it("fails the full mode render check when any listed mode page is incomplete", async () => {
    const renderer = vi.fn(async (url: string) => {
      if (url.includes("mode-4")) {
        return {
          ...pageFor(url),
          text: "Cloud mode proof loaded. No share manifest",
          ogImage: "",
        };
      }
      return pageFor(url);
    });
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    const modeRender = report.checks.find((check) => check.id === "mode-render");
    expect(modeRender?.status).toBe("failed");
    expect(modeRender?.detail).toContain("mode-4");
    expect(modeRender?.detail).toContain("social metadata incomplete");
  });

  it("fails clean-session restore when public pages render but do not prove cloud-loaded content", async () => {
    const renderer = vi.fn(async (url: string) => {
      const page = pageFor(url);
      return {
        ...page,
        text: page.text
          .replace("Cloud profile loaded. ", "")
          .replace("Cloud proof and share manifest loaded. ", "")
          .replace("Cloud mode proof and share manifest loaded. ", ""),
        publicSource: "",
      };
    });
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "proof-render")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "mode-render")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "clean-session-restore")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("clean-session cloud restore missing"),
    });
  });

  it("does not pass clean-session restore from localhost public app URLs", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(
      {
        ...env,
        VITE_PUBLIC_APP_URL: "https://localhost:4173/kickoff-lock-agent/",
      },
      { renderer, fetcher: fetcher as any },
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "clean-session-restore")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("non-production public URL"),
    });
  });

  it("requires six mode proof ids before rendering public mode pages", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(
      {
        ...env,
        KICKOFF_VERIFY_MODE_IDS: "mode-1",
      },
      { renderer, fetcher: fetcher as any },
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "mode-target-id")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; got 1",
      sampleIds: ["mode-1"],
    });
    expect(report.checks.find((check) => check.id === "mode-render")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; got 1",
    });
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it("does not accept legacy single mode id for full sharing doctor acceptance", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(
      {
        ...env,
        KICKOFF_VERIFY_MODE_IDS: "",
        KICKOFF_VERIFY_MODE_ID: "mode-legacy",
      },
      { renderer, fetcher: fetcher as any },
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "mode-target-id")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_IDS needs 6 mode proof ids; legacy KICKOFF_VERIFY_MODE_ID is not enough",
      sampleIds: [],
    });
    expect(report.checks.find((check) => check.id === "mode-render")?.detail).toContain("legacy KICKOFF_VERIFY_MODE_ID is not enough");
  });

  it("fails rendered proof pages when share manifests or social metadata are missing", async () => {
    const renderer = vi.fn(async (url: string) => ({
      ...pageFor(url),
      text: "Cloud proof loaded. No share manifest",
      ogImage: "",
    }));
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "proof-render")?.detail).toContain("forbidden");
    expect(report.checks.find((check) => check.id === "proof-render")?.detail).toContain("social metadata incomplete");
  });

  it("requires rendered proof metadata to use the uploaded Supabase share image URL", async () => {
    const renderer = vi.fn(async (url: string) => {
      const page = pageFor(url);
      return url.includes("mode=")
        ? { ...page, ogImage: "https://cdn.example.com/wrong-mode-card.png" }
        : url.includes("proof=")
          ? { ...page, ogImage: "https://cdn.example.com/wrong-record-card.png" }
          : page;
    });
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "proof-render")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining(
        "og:image https://cdn.example.com/wrong-record-card.png does not match expected share image https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      ),
    });
    expect(report.checks.find((check) => check.id === "mode-render")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining(
        "og:image https://cdn.example.com/wrong-mode-card.png does not match expected share image https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
      ),
    });
    expect(report.checks.find((check) => check.id === "clean-session-restore")?.detail).toContain(
      "expected share image",
    );
  });

  it("requires rendered proof JSON-LD image to use the uploaded Supabase share image URL", async () => {
    const renderer = vi.fn(async (url: string) => {
      const page = pageFor(url);
      return url.includes("mode=")
        ? { ...page, jsonLd: JSON.stringify({ identifier: new URL(url).searchParams.get("mode"), image: "https://cdn.example.com/wrong-mode-jsonld.png" }) }
        : url.includes("proof=")
          ? { ...page, jsonLd: JSON.stringify({ identifier: new URL(url).searchParams.get("proof"), image: "https://cdn.example.com/wrong-record-jsonld.png" }) }
          : page;
    });
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "proof-render")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining(
        "JSON-LD image https://cdn.example.com/wrong-record-jsonld.png does not match expected share image https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
      ),
    });
    expect(report.checks.find((check) => check.id === "mode-render")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining(
        "JSON-LD image https://cdn.example.com/wrong-mode-jsonld.png does not match expected share image https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-1/card.png",
      ),
    });
  });

  it("requires rendered proof JSON-LD associatedMedia to match the uploaded share image URL", async () => {
    const renderer = vi.fn(async (url: string) => {
      const page = pageFor(url);
      return url.includes("mode=")
        ? {
            ...page,
            jsonLd: JSON.stringify({
              identifier: new URL(url).searchParams.get("mode"),
              image: env.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL,
              associatedMedia: imageObject("https://cdn.example.com/wrong-mode-associated-media.png"),
            }),
          }
        : url.includes("proof=")
          ? {
              ...page,
              jsonLd: JSON.stringify({
                identifier: new URL(url).searchParams.get("proof"),
                image: env.KICKOFF_VERIFY_SHARE_IMAGE_URL,
              }),
            }
          : page;
    });
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "proof-render")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("JSON-LD associatedMedia missing"),
    });
    expect(report.checks.find((check) => check.id === "mode-render")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("JSON-LD associatedMedia https://cdn.example.com/wrong-mode-associated-media.png does not match expected share image"),
    });
  });

  it("requires clean-session DOM target markers to match the rendered proof target", async () => {
    const renderer = vi.fn(async (url: string) => {
      const page = pageFor(url);
      return url.includes("proof=")
        ? {
            ...page,
            publicTarget: "cap-other",
          }
        : page;
    });
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "proof-render")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("public target cap-other mismatch"),
    });
    expect(report.checks.find((check) => check.id === "clean-session-restore")?.detail).toContain(
      "proof:cap-1 (public target mismatch)",
    );
  });

  it("does not accept a non-image share URL", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () => new Response("html", { status: 200, headers: { "content-type": "text/html" } }));
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "share-image-public-read")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("unsupported mime text/html"),
    });
    expect(report.checks.find((check) => check.id === "mode-share-image-public-read")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("unsupported mime text/html"),
    });
  });

  it("does not accept public share images outside the configured Supabase Storage project", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(
      {
        ...env,
        KICKOFF_VERIFY_SHARE_IMAGE_URL: "http://localhost/share-card.png",
        KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/generated/mode.svg",
      },
      { renderer, fetcher: fetcher as any },
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "share-image-public-read")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_SHARE_IMAGE_URL must be a public HTTPS URL",
    });
    expect(report.checks.find((check) => check.id === "mode-share-image-public-read")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must point to a PNG, JPEG or WebP image path",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not accept the app logo asset as uploaded production share-card evidence", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () => shareImageResponse());
    const report = await buildSharingProductionDoctorReport(
      {
        ...env,
        KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png",
        KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon-512.png",
      },
      { renderer, fetcher: fetcher as any },
    );

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "share-image-public-read")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_SHARE_IMAGE_URL must be a generated proof card, not the app logo asset",
    });
    expect(report.checks.find((check) => check.id === "mode-share-image-public-read")).toMatchObject({
      status: "failed",
      detail: "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must be a generated proof card, not the app logo asset",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not accept tiny or wrongly proportioned placeholder share images", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async (url: string) =>
      url.includes("mode") ? shareImageResponse({ width: 400, height: 400, size: 12_000 }) : shareImageResponse({ size: 128 }),
    );
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "share-image-public-read")).toMatchObject({
      status: "failed",
      detail: expect.stringContaining("image bytes 128/10000"),
    });
    const modeShareImage = report.checks.find((check) => check.id === "mode-share-image-public-read");
    expect(modeShareImage?.status).toBe("failed");
    expect(modeShareImage?.detail).toContain("width 400/1000");
    expect(modeShareImage?.detail).toContain("aspect 1.00");
  });
});
