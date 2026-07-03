import { describe, expect, it } from "vitest";
import { buildPublicUrl, normalizePublicAppUrl, publicAppUrlConfigured } from "./publicUrls";

describe("public URL helpers", () => {
  it("normalizes deployed HTTPS app URLs for public proof links", () => {
    expect(normalizePublicAppUrl("https://example.com/kickoff-lock-agent")).toBe(
      "https://example.com/kickoff-lock-agent/",
    );
    expect(normalizePublicAppUrl("https://example.com/kickoff-lock-agent/?reset=1#debug")).toBe(
      "https://example.com/kickoff-lock-agent/",
    );
  });

  it("rejects path-only, invalid and non-HTTPS public app URLs", () => {
    expect(normalizePublicAppUrl("/kickoff-lock-agent/")).toBeUndefined();
    expect(normalizePublicAppUrl("http://localhost:5173/kickoff-lock-agent/")).toBeUndefined();
    expect(normalizePublicAppUrl("not a url")).toBeUndefined();
    expect(publicAppUrlConfigured({ VITE_PUBLIC_APP_URL: "/kickoff-lock-agent/" })).toBe(false);
  });

  it("builds share URLs from the deployed public URL before falling back to the current page", () => {
    expect(
      buildPublicUrl(
        "proof",
        "cap-123",
        "https://example.com/kickoff-lock-agent/",
        "http://127.0.0.1:5175/kickoff-lock-agent/?reset=1",
      ),
    ).toBe("https://example.com/kickoff-lock-agent/?proof=cap-123");

    expect(
      buildPublicUrl(
        "mode",
        "mode-abc",
        undefined,
        "http://127.0.0.1:5175/kickoff-lock-agent/?reset=1",
      ),
    ).toBe("http://127.0.0.1:5175/kickoff-lock-agent/?mode=mode-abc");
  });
});
