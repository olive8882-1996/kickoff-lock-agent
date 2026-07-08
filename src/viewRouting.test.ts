import { describe, expect, it } from "vitest";
import { appViewFromParams } from "./viewRouting";

describe("URL view routing", () => {
  it("opens app views from query params", () => {
    expect(appViewFromParams(new URLSearchParams("view=account"))).toBe("account");
    expect(appViewFromParams(new URLSearchParams("view=modes"))).toBe("modes");
    expect(appViewFromParams(new URLSearchParams("view=leaderboard"))).toBe("memory");
  });

  it("opens PWA shortcut actions", () => {
    expect(appViewFromParams(new URLSearchParams("action=lock"))).toBe("predict");
    expect(appViewFromParams(new URLSearchParams("action=verify"))).toBe("verify");
  });

  it("falls back to the match board for unknown routes", () => {
    expect(appViewFromParams(new URLSearchParams("view=unknown"))).toBe("matches");
    expect(appViewFromParams(new URLSearchParams(""))).toBe("matches");
  });
});
