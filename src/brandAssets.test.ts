import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND_LOGO_ASSETS,
  BRAND_LOGO_USAGES,
  brandAssetPublicUrl,
  buildBrandAssetPacket,
} from "./brandAssets";

describe("brand logo assets", () => {
  it("keeps every required logo variant in public assets", () => {
    expect(BRAND_LOGO_ASSETS.length).toBeGreaterThanOrEqual(6);
    for (const asset of BRAND_LOGO_ASSETS.filter((item) => item.required)) {
      expect(existsSync(resolve(process.cwd(), "public", "assets", asset.fileName))).toBe(true);
      expect(asset.size).toMatch(/^\d+x\d+$/);
    }
  });

  it("maps the logo to public product surfaces and share-card generation", () => {
    const packet = buildBrandAssetPacket("https://example.com/kickoff-lock-agent/");

    expect(packet.ready).toBe(true);
    expect(packet.publicLogoUrl).toBe("https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png");
    expect(packet.summary).toContain("required logo assets");
    expect(packet.copyText).toContain("Kickoff Lock Agent brand asset packet");
    expect(BRAND_LOGO_USAGES.map((usage) => usage.id)).toEqual(
      expect.arrayContaining(["side-rail", "hero-lockup", "public-proof", "generated-share-card"]),
    );
  });

  it("falls back to a relative asset URL when public app URL is not configured", () => {
    expect(brandAssetPublicUrl(undefined)).toBe("assets/kickoff-lock-icon.png");
  });
});
