import { describe, expect, it } from "vitest";
import { isPublicShareImageUrl, publicShareImageUrlProblem } from "./publicShareImageUrl";

describe("public share image URL validation", () => {
  it("accepts deployed generated bitmap share cards", () => {
    expect(isPublicShareImageUrl("https://cdn.example.com/cards/kickoff-production-share.png")).toBe(true);
    expect(publicShareImageUrlProblem("https://cdn.example.com/cards/mode-card.webp", "Share image URL")).toBe("");
  });

  it("rejects app logo assets as production proof-card evidence", () => {
    expect(
      publicShareImageUrlProblem(
        "https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png",
        "KICKOFF_VERIFY_SHARE_IMAGE_URL",
      ),
    ).toBe("KICKOFF_VERIFY_SHARE_IMAGE_URL must be a generated proof card, not the app logo asset");
    expect(
      publicShareImageUrlProblem(
        "https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon-512.png?cache=1",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ),
    ).toBe("KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must be a generated proof card, not the app logo asset");
    expect(
      publicShareImageUrlProblem(
        "https://example.com/kickoff-lock-agent/assets/kickoff-lock-apple-touch.png",
        "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ),
    ).toBe("KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL must be a generated proof card, not the app logo asset");
  });
});
