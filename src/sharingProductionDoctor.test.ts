import { describe, expect, it, vi } from "vitest";
import { buildSharingProductionDoctorReport, publicShareUrl, type RenderedPublicPage } from "./sharingProductionDoctor";

const env = {
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  KICKOFF_VERIFY_PROFILE_ID: "user-1",
  KICKOFF_VERIFY_PROOF_ID: "cap-1",
  KICKOFF_VERIFY_MODE_ID: "mode-1",
  KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://cdn.example.com/share-card.png",
};

const pageFor = (url: string): RenderedPublicPage => {
  const parsed = new URL(url);
  const profile = parsed.searchParams.get("profile");
  const proof = parsed.searchParams.get("proof");
  const mode = parsed.searchParams.get("mode");
  if (profile) {
    return {
      text: `Latest proof capsules Tournament mode runs Verifier packet Social metadata share cards ${profile}`,
      canonical: url,
      ogTitle: "Profile",
      ogImage: "https://cdn.example.com/profile.png",
      twitterCard: "summary_large_image",
      jsonLd: JSON.stringify({ identifier: profile }),
    };
  }
  if (mode) {
    return {
      text: `Mode proof verification Mode proof facts Proof timeline Verifier packet Social metadata ${mode}`,
      canonical: url,
      ogTitle: "Mode",
      ogImage: "https://cdn.example.com/mode.png",
      twitterCard: "summary_large_image",
      jsonLd: JSON.stringify({ identifier: mode }),
    };
  }
  return {
    text: `Proof verification Proof facts Proof timeline Verifier packet Social metadata Prediction ${proof}`,
    canonical: url,
    ogTitle: "Proof",
    ogImage: "https://cdn.example.com/proof.png",
    twitterCard: "summary_large_image",
    jsonLd: JSON.stringify({ identifier: proof }),
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
      expect.arrayContaining(["profile-target-id", "proof-target-id", "mode-target-id", "share-image-public-read"]),
    );
    expect(renderer).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("passes when public pages render canonical social metadata and the share image is public", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () =>
      new Response("png", {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "2048" },
      }),
    );
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(true);
    expect(report.requiredPassed).toBe(report.requiredTotal);
    expect(renderer).toHaveBeenCalledTimes(3);
    expect(report.checks.find((check) => check.id === "proof-render")?.detail).toContain("social metadata");
    expect(report.checks.find((check) => check.id === "share-image-public-read")?.detail).toContain("2048 bytes");
  });

  it("fails rendered proof pages when share manifests or social metadata are missing", async () => {
    const renderer = vi.fn(async (url: string) => ({
      ...pageFor(url),
      text: "Cloud proof loaded. No share manifest",
      ogImage: "",
    }));
    const fetcher = vi.fn(async () => new Response("png", { status: 200, headers: { "content-type": "image/png" } }));
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "proof-render")?.detail).toContain("forbidden");
    expect(report.checks.find((check) => check.id === "proof-render")?.detail).toContain("social metadata incomplete");
  });

  it("does not accept a non-image share URL", async () => {
    const renderer = vi.fn(async (url: string) => pageFor(url));
    const fetcher = vi.fn(async () => new Response("html", { status: 200, headers: { "content-type": "text/html" } }));
    const report = await buildSharingProductionDoctorReport(env, { renderer, fetcher: fetcher as any });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "share-image-public-read")).toMatchObject({
      status: "failed",
      detail: "text/html",
    });
  });
});
