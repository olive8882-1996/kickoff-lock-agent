import { describe, expect, it } from "vitest";
import {
  buildProductionShareImageTargetSvg,
  buildShareImageMetadata,
  DEFAULT_PRODUCTION_MODE_SHARE_IMAGE_TARGET,
  DEFAULT_PRODUCTION_SHARE_IMAGE_TARGET,
  productionShareImagePublicUrl,
} from "./shareImageTarget";

describe("production share image target", () => {
  it("renders a branded SVG with escaped proof data and optional logo", () => {
    const svg = buildProductionShareImageTargetSvg({
      ...DEFAULT_PRODUCTION_SHARE_IMAGE_TARGET,
      matchLabel: "Brazil & Japan",
      logoHref: "data:image/png;base64,logo",
    });

    expect(svg).toContain("KICKOFF LOCK AGENT");
    expect(svg).toContain("WORLD CUP PROOF CARD");
    expect(svg).toContain("BRAZIL &amp; JAPAN");
    expect(svg).toContain("data:image/png;base64,logo");
    expect(svg).toContain(DEFAULT_PRODUCTION_SHARE_IMAGE_TARGET.payloadHash.slice(0, 14));
  });

  it("renders a distinct mode proof share target", () => {
    const svg = buildProductionShareImageTargetSvg(DEFAULT_PRODUCTION_MODE_SHARE_IMAGE_TARGET);

    expect(svg).toContain("LOCKED MODE PROOF");
    expect(svg).toContain("WORLD CUP MODE CARD");
    expect(svg).toContain("MODE PROOF SET");
    expect(svg).toContain("MODE STATUS");
    expect(svg).toContain(DEFAULT_PRODUCTION_MODE_SHARE_IMAGE_TARGET.payloadHash.slice(0, 14));
    expect(svg).not.toContain("PREDICTED SCORE");
  });

  it("builds a stable public URL from the deployed app root", () => {
    expect(
      productionShareImagePublicUrl(
        "https://olive8882-1996.github.io/kickoff-lock-agent/",
        "/generated/kickoff-production-share.png",
      ),
    ).toBe("https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-share.png");
  });

  it("computes publishable PNG metadata", async () => {
    const metadata = await buildShareImageMetadata(new Uint8Array([1, 2, 3, 4]), "image/png");

    expect(metadata.imageMime).toBe("image/png");
    expect(metadata.imageByteLength).toBe(4);
    expect(metadata.imageHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
