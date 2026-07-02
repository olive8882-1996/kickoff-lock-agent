import { describe, expect, it } from "vitest";
import { loadSeedMatches, sourceLabel } from "./providers";

describe("provider metadata", () => {
  it("labels every configured source for the match board", () => {
    expect(sourceLabel("espn")).toBe("ESPN");
    expect(sourceLabel("api-football")).toBe("API-Football");
    expect(sourceLabel("worldcup26")).toBe("worldcup26");
    expect(sourceLabel("thesportsdb")).toBe("TheSportsDB");
    expect(sourceLabel("seed")).toBe("Seed");
  });

  it("exposes health evidence for the offline seed fallback", () => {
    const result = loadSeedMatches();
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.evidence?.join(" ")).toContain("seed matches loaded");
    expect(result.warning).toMatch(/seed data/i);
  });
});
