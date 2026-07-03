import { describe, expect, it, vi } from "vitest";
import { buildDataTargetScoutReport } from "./dataTargetScout";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const env = {
  VITE_APIFOOTBALL_KEY: "api-key",
  KICKOFF_DATA_SCOUT_SEASON: "2026",
  KICKOFF_DATA_SCOUT_LIMIT: "3",
};

describe("Realtime data target scout", () => {
  it("does not contact API-Football before a key is configured", async () => {
    const fetcher = vi.fn();
    const report = await buildDataTargetScoutReport({}, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checkedFixtures).toBe(0);
    expect(report.nextAction).toContain("VITE_APIFOOTBALL_KEY");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("recommends the fixture with lineups, injuries and odds read-back", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "x-apisports-key": "api-key" });
      if (url.includes("/fixtures?")) {
        return jsonResponse({
          response: [
            {
              fixture: { id: 100, date: "2026-06-20T00:00:00Z", status: { long: "Not Started" } },
              teams: { home: { name: "Brazil" }, away: { name: "Japan" } },
            },
            {
              fixture: { id: 200, date: "2026-06-21T00:00:00Z", status: { long: "Match Finished" } },
              teams: { home: { name: "Spain" }, away: { name: "Austria" } },
            },
          ],
        });
      }
      if (url.includes("fixture=100")) {
        if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [{ team: { id: 1, name: "Brazil" } }] });
        return jsonResponse({ response: [] });
      }
      if (url.includes("fixture=200")) {
        if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [{ team: { id: 2, name: "Spain" } }] });
        if (url.includes("/injuries")) return jsonResponse({ response: [{ player: { id: 9, name: "Player" } }] });
        if (url.includes("/odds")) return jsonResponse({ response: [{ league: { id: 1 }, bookmakers: [{ id: 7 }] }] });
      }
      return jsonResponse({ response: [] });
    });

    const report = await buildDataTargetScoutReport(env, fetcher as any);

    expect(report.ready).toBe(true);
    expect(report.fixtureId).toBe("200");
    expect(report.nextAction).toContain("KICKOFF_VERIFY_FIXTURE_ID=200");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FIXTURE_ID=200");
    expect(report.candidates[0]).toMatchObject({
      fixtureId: "200",
      label: "Spain vs Austria",
      ready: true,
    });
    expect(report.candidates[0].endpoints.map((endpoint) => endpoint.status)).toEqual(["passed", "passed", "passed"]);
  });

  it("returns the best partial fixture with a concrete next action when no candidate is complete", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/fixtures?")) {
        return jsonResponse({
          response: [
            { fixture: { id: 300 }, teams: { home: { name: "A" }, away: { name: "B" } } },
            { fixture: { id: 400 }, teams: { home: { name: "C" }, away: { name: "D" } } },
          ],
        });
      }
      if (url.includes("fixture=400") && url.includes("/fixtures/lineups")) {
        return jsonResponse({ response: [{ team: { id: 4 } }, { team: { id: 5 } }] });
      }
      return jsonResponse({ response: [] });
    });

    const report = await buildDataTargetScoutReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.fixtureId).toBe("400");
    expect(report.nextAction).toContain("missing injuries, odds");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FIXTURE_ID=400");
  });
});
