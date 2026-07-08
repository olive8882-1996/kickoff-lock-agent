import { existsSync, readFileSync } from "node:fs";
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
      const file = readFileSync(resolve(process.cwd(), "public", "assets", asset.fileName));
      const width = file.readUInt32BE(16);
      const height = file.readUInt32BE(20);
      expect(`${width}x${height}`).toBe(asset.size);
    }
  });

  it("maps the logo to public product surfaces and share-card generation", () => {
    const packet = buildBrandAssetPacket("https://example.com/kickoff-lock-agent/");

    expect(packet.ready).toBe(true);
    expect(packet.publicLogoUrl).toBe("https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png");
    expect(packet.summary).toContain("required logo assets");
    expect(packet.copyText).toContain("Kickoff Lock Agent brand asset packet");
    expect(BRAND_LOGO_USAGES.map((usage) => usage.id)).toEqual(
      expect.arrayContaining(["side-rail", "hero-lockup", "public-proof", "pwa-shortcuts", "generated-share-card"]),
    );
  });

  it("falls back to a relative asset URL when public app URL is not configured", () => {
    expect(brandAssetPublicUrl(undefined)).toBe("assets/kickoff-lock-icon.png");
  });

  it("wires the logo into browser metadata and PWA install metadata", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "public", "site.webmanifest"), "utf8"));
    const iconFiles = new Set(BRAND_LOGO_ASSETS.map((asset) => `assets/${asset.fileName}`));

    expect(html).toContain('href="assets/kickoff-lock-icon-32.png"');
    expect(html).toContain('href="assets/kickoff-lock-icon-192.png"');
    expect(html).toContain('href="assets/kickoff-lock-apple-touch.png"');
    expect(html).toContain("/assets/kickoff-lock-icon.png");
    expect(html).toContain('name="apple-mobile-web-app-title" content="Kickoff Lock"');
    expect(html).toContain('property="og:site_name" content="Kickoff Lock Agent"');

    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual(
      expect.arrayContaining([
        "assets/kickoff-lock-icon-32.png",
        "assets/kickoff-lock-icon-192.png",
        "assets/kickoff-lock-icon-512.png",
      ]),
    );
    for (const icon of manifest.icons as { src: string; sizes: string; type: string }[]) {
      expect(iconFiles.has(icon.src)).toBe(true);
      expect(icon.type).toBe("image/png");
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
    }
    expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ purpose: "maskable" })]));
    expect(manifest.shortcuts.map((shortcut: { url: string }) => shortcut.url)).toEqual(
      expect.arrayContaining([
        "/kickoff-lock-agent/?action=lock",
        "/kickoff-lock-agent/?action=verify",
        "/kickoff-lock-agent/?view=leaderboard",
      ]),
    );
    for (const shortcut of manifest.shortcuts as { icons: { src: string; sizes: string; type: string }[] }[]) {
      expect(shortcut.icons[0]).toEqual(
        expect.objectContaining({
          src: "assets/kickoff-lock-icon-192.png",
          sizes: "192x192",
          type: "image/png",
        }),
      );
    }
    expect(manifest.screenshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "kickoff-lock-screenshot.png",
          sizes: "1265x712",
          type: "image/png",
        }),
      ]),
    );
  });
});
