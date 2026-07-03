import { describe, expect, it, vi } from "vitest";
import { buildDataProductionDoctorReport } from "./dataProductionDoctor";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

const env = {
  VITE_APIFOOTBALL_KEY: "api-football",
  KICKOFF_VERIFY_FIXTURE_ID: "12345",
  VITE_ODDS_API_KEY: "odds",
  VITE_ODDS_API_SPORT_KEY: "soccer_fifa_world_cup",
};

const successfulFetcher = vi.fn(async (url: string, init?: RequestInit) => {
  if (url.includes("thesportsdb.com")) {
    return jsonResponse({ events: [{ idEvent: "tsdb-1" }] });
  }
  if (url.includes("espn.com")) {
    return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
  }
  if (url.includes("/fixtures/lineups")) {
    expect(init?.headers).toMatchObject({ "x-apisports-key": "api-football" });
    return jsonResponse({ response: [{ team: { id: 1, name: "Spain" }, startXI: [] }] });
  }
  if (url.includes("/injuries")) {
    return jsonResponse({ response: [{ player: { id: 9, name: "Player" }, team: { name: "Spain" } }] });
  }
  if (url.includes("/odds?fixture=")) {
    return jsonResponse({ response: [{ league: { id: 1 }, bookmakers: [{ id: 1, name: "Book" }] }] });
  }
  if (url.includes("api.the-odds-api.com")) {
    return jsonResponse([{ id: "odds-1", home_team: "Spain", away_team: "Austria" }]);
  }
  return jsonResponse({ error: "unexpected" }, { status: 404 });
});

describe("Realtime data production doctor", () => {
  it("keeps required enrichment checks incomplete when API-Football and fixture env are missing", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      return jsonResponse({}, { status: 429 });
    });

    const report = await buildDataProductionDoctorReport({}, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "free-feed-continuity")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "api-football-key")?.status).toBe("failed");
    expect(report.checks.find((check) => check.id === "api-football-lineups-readback")?.detail).toContain("Missing VITE_APIFOOTBALL_KEY");
    expect(report.checks.find((check) => check.id === "odds-api-h2h-readback")?.status).toBe("skipped");
  });

  it("passes required checks when free continuity and API-Football lineups, injuries and odds read back live rows", async () => {
    successfulFetcher.mockClear();
    const report = await buildDataProductionDoctorReport(env, successfulFetcher as any);

    expect(report.ready).toBe(true);
    expect(report.requiredPassed).toBe(report.requiredTotal);
    expect(report.checks.find((check) => check.id === "api-football-lineups-readback")?.sampleIds).toContain("1");
    expect(report.checks.find((check) => check.id === "odds-api-h2h-readback")?.status).toBe("passed");
    expect(successfulFetcher.mock.calls.some(([url]) => String(url).includes("fixture=12345"))).toBe(true);
  });

  it("accepts API-Football as odds provider config even when The Odds API is absent", async () => {
    const report = await buildDataProductionDoctorReport(
      {
        VITE_APIFOOTBALL_KEY: "api-football",
        KICKOFF_VERIFY_FIXTURE_ID: "12345",
      },
      successfulFetcher as any,
    );

    expect(report.checks.find((check) => check.id === "odds-provider-config")?.status).toBe("passed");
    expect(report.checks.find((check) => check.id === "odds-api-h2h-readback")?.status).toBe("skipped");
  });

  it("does not pass production enrichment when endpoint payloads are empty", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("espn.com")) return jsonResponse({ leagues: [{ slug: "fifa.world" }], events: [{ id: "espn-1" }] });
      if (url.includes("thesportsdb.com")) return jsonResponse({ events: [] });
      if (url.includes("api-football")) return jsonResponse({ response: [] });
      return jsonResponse([], { status: 200 });
    });

    const report = await buildDataProductionDoctorReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "api-football-lineups-readback")).toMatchObject({
      status: "failed",
      detail: "0 rows returned",
    });
    expect(report.checks.find((check) => check.id === "api-football-injuries-readback")?.status).toBe("failed");
    expect(report.checks.find((check) => check.id === "api-football-odds-readback")?.status).toBe("failed");
  });
});
