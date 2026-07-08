import { describe, expect, it, vi } from "vitest";
import { buildDataTargetScoutArtifact, buildDataTargetScoutReport } from "./dataTargetScout";
import { parseEnvText } from "./productionEvidence";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const env = {
  VITE_APIFOOTBALL_KEY: "api-key",
  KICKOFF_DATA_SCOUT_SEASON: "2026",
  KICKOFF_DATA_SCOUT_LIMIT: "3",
  KICKOFF_DATA_SCOUT_TARGETS: "1",
};

const pricedOddsRow = {
  bookmakers: [
    {
      id: 7,
      name: "Book",
      bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.80" }] }],
    },
  ],
};

const oddsFor = (fixtureId: number | string) => ({ fixture: { id: fixtureId }, ...pricedOddsRow });
const injuryFor = (fixtureId: number | string, team: Record<string, unknown>) => ({
  fixture: { id: fixtureId },
  player: { id: 9, name: "Player" },
  team,
});

const standingsPayload = {
  response: [
    {
      league: {
        standings: [[
          { rank: 1, team: { id: 1, name: "Spain" }, points: 9 },
          { rank: 2, team: { id: 2, name: "Austria" }, points: 6 },
          { rank: 3, team: { id: 3, name: "Brazil" }, points: 6 },
          { rank: 4, team: { id: 4, name: "Japan" }, points: 4 },
          { rank: 5, team: { id: 5, name: "Canada" }, points: 4 },
          { rank: 6, team: { id: 6, name: "Morocco" }, points: 4 },
          { rank: 7, team: { id: 7, name: "Argentina" }, points: 3 },
          { rank: 8, team: { id: 8, name: "USA" }, points: 3 },
          { rank: 9, team: { id: 9, name: "England" }, points: 3 },
          { rank: 10, team: { id: 10, name: "Ghana" }, points: 3 },
          { rank: 11, team: { id: 11, name: "A" }, points: 1 },
          { rank: 12, team: { id: 12, name: "B" }, points: 1 },
          { rank: 13, team: { id: 13, name: "C" }, points: 1 },
          { rank: 14, team: { id: 14, name: "D" }, points: 1 },
          { rank: 15, team: { id: 15, name: "France" }, points: 0 },
          { rank: 16, team: { id: 16, name: "Korea Republic" }, points: 0 },
        ]],
      },
    },
  ],
};

describe("Realtime data target scout", () => {
  it("does not contact API-Football before a key is configured", async () => {
    const fetcher = vi.fn();
    const report = await buildDataTargetScoutReport({}, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.checkedFixtures).toBe(0);
    expect(report.fixtureIds).toEqual([]);
    expect(report.nextAction).toContain("VITE_APIFOOTBALL_KEY");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("can scout fixture targets through a deployed data proxy without exposing an API-Football key", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toBeUndefined();
      expect(url).toContain("https://data.example.workers.dev/proxy");
      const parsed = new URL(url);
      expect(parsed.searchParams.get("source")).toBe("api-football");
      const target = parsed.searchParams.get("url") ?? "";
      if (target.includes("/fixtures?")) {
        return jsonResponse({
          response: [
            {
              fixture: { id: 2600, date: "2026-06-20T00:00:00Z", status: { long: "Match Finished" } },
              teams: { home: { name: "Brazil" }, away: { name: "Japan" } },
            },
          ],
        });
      }
      if (target.includes("/fixtures/lineups")) return jsonResponse({ response: [
        { team: { id: 1, name: "Brazil" }, startXI: [{ player: { id: 10, name: "Starter" } }] },
        { team: { id: 2, name: "Japan" }, startXI: [{ player: { id: 20, name: "Starter" } }] },
      ] });
      if (target.includes("/injuries")) return jsonResponse({ response: [injuryFor(2600, { id: 1, name: "Brazil" })] });
      if (target.includes("/odds")) return jsonResponse({ response: [{ league: { id: 1 }, ...oddsFor(2600) }] });
      if (target.includes("/standings")) return jsonResponse(standingsPayload);
      return jsonResponse({ response: [] });
    });

    const report = await buildDataTargetScoutReport(
      {
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        KICKOFF_DATA_SCOUT_SEASON: "2026",
        KICKOFF_DATA_SCOUT_TARGETS: "1",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(true);
    expect(report.fixtureIds).toEqual(["2600"]);
    expect(report.candidates[0].endpoints.every((endpoint) => endpoint.url.includes("data.example.workers.dev/proxy"))).toBe(true);
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
        if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [{ team: { id: 1, name: "Brazil" }, startXI: [{ player: { id: 10, name: "Starter" } }] }] });
        return jsonResponse({ response: [] });
      }
      if (url.includes("fixture=200")) {
        if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [
          { team: { id: 2, name: "Spain" }, startXI: [{ player: { id: 10, name: "Starter" } }] },
          { team: { id: 3, name: "Austria" }, startXI: [{ player: { id: 11, name: "Starter" } }] },
        ] });
        if (url.includes("/injuries")) return jsonResponse({ response: [injuryFor(200, { id: 2, name: "Spain" })] });
        if (url.includes("/odds")) return jsonResponse({ response: [{ league: { id: 1 }, ...oddsFor(200) }] });
      }
      if (url.includes("/standings?")) return jsonResponse(standingsPayload);
      return jsonResponse({ response: [] });
    });

    const report = await buildDataTargetScoutReport(env, fetcher as any);

    expect(report.ready).toBe(true);
    expect(report.fixtureId).toBe("200");
    expect(report.fixtureIds).toEqual(["200"]);
    expect(report.requiredFixtureCount).toBe(1);
    expect(report.nextAction).toContain("KICKOFF_VERIFY_FIXTURE_IDS=200");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FIXTURE_ID=200");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FIXTURE_IDS=200");
    expect(report.signalMatrix).toBe("200:lineups=2|injuries=1|odds=1|standings=2");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX=\"200:lineups=2|injuries=1|odds=1|standings=2\"");
    expect(report.candidates[0]).toMatchObject({
      fixtureId: "200",
      label: "Spain vs Austria",
      ready: true,
      signalMatrix: "200:lineups=2|injuries=1|odds=1|standings=2",
    });
    expect(report.candidates[0].endpoints.map((endpoint) => endpoint.status)).toEqual(["passed", "passed", "passed", "passed"]);
  });

  it("preserves existing production target context while emitting fixture verify env", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/fixtures?")) {
        return jsonResponse({
          response: [
            {
              fixture: { id: 200, date: "2026-06-21T00:00:00Z", status: { long: "Match Finished" } },
              teams: { home: { id: 2, name: "Spain" }, away: { id: 3, name: "Austria" } },
            },
          ],
        });
      }
      if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [
        { team: { id: 2, name: "Spain" }, startXI: [{ player: { id: 10, name: "Starter" } }] },
        { team: { id: 3, name: "Austria" }, startXI: [{ player: { id: 11, name: "Starter" } }] },
      ] });
      if (url.includes("/injuries")) return jsonResponse({ response: [{ fixture: { id: 200 }, team: { id: 2 }, player: { id: 9 } }] });
      if (url.includes("/odds")) return jsonResponse({ response: [{ fixture: { id: 200 }, ...pricedOddsRow }] });
      if (url.includes("/standings?")) return jsonResponse(standingsPayload);
      return jsonResponse({ response: [] });
    });

    const report = await buildDataTargetScoutReport(
      {
        ...env,
        KICKOFF_VERIFY_USER_ID: "user-1",
        KICKOFF_VERIFY_PROFILE_ID: "user-1",
        KICKOFF_VERIFY_PUBLIC_PROFILE_URL: "https://example.com/kickoff-lock-agent/?profile=user-1",
        KICKOFF_VERIFY_PROOF_ID: "cap-1",
        KICKOFF_VERIFY_MODE_IDS: "mode-bracket,mode-parlay",
        KICKOFF_VERIFY_SHARE_ARTIFACT_IDS: "record:cap-1,mode:mode-bracket,mode:mode-parlay",
        KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
        KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: "a".repeat(64),
        KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-mode-bracket,bafy-mode-parlay",
        KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: `${"b".repeat(64)},${"c".repeat(64)}`,
        KICKOFF_VERIFY_FRIEND_CODE: "chengdu",
        KICKOFF_VERIFY_SEASON_KEY: "world-cup-run",
        KICKOFF_VERIFY_LEADERBOARD_SCOPES: "global,friend,season",
        KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://cdn.example.com/record.png",
        KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/mode.png",
      },
      fetcher as any,
    );
    const verifyEnv = parseEnvText(report.verifyEnv);

    expect(verifyEnv.KICKOFF_VERIFY_PUBLIC_PROFILE_URL).toBe("https://example.com/kickoff-lock-agent/?profile=user-1");
    expect(verifyEnv.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS).toBe("record:cap-1,mode:mode-bracket,mode:mode-parlay");
    expect(verifyEnv.KICKOFF_VERIFY_LEADERBOARD_SCOPES).toBe("global,friend,season");
    expect(verifyEnv.KICKOFF_VERIFY_FILECOIN_RECORD_CID).toBe("bafy-record");
    expect(verifyEnv.KICKOFF_VERIFY_FILECOIN_MODE_CIDS).toBe("bafy-mode-bracket,bafy-mode-parlay");
    expect(verifyEnv.KICKOFF_VERIFY_FIXTURE_IDS).toBe("200");
    expect(verifyEnv.KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX).toBe("200:lineups=2|injuries=1|odds=1|standings=2");
  });

  it("does not recommend a fixture when endpoint rows explicitly belong to another fixture", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/fixtures?")) {
        return jsonResponse({
          response: [
            {
              fixture: { id: 700, date: "2026-06-20T00:00:00Z", status: { long: "Match Finished" } },
              teams: { home: { name: "Canada" }, away: { name: "Morocco" } },
            },
          ],
        });
      }
      if (url.includes("fixture=700")) {
        if (url.includes("/fixtures/lineups")) {
          return jsonResponse({ response: [{ team: { id: 7 }, startXI: [{ player: { id: 10, name: "Starter" } }] }] });
        }
        if (url.includes("/injuries")) {
          return jsonResponse({ response: [{ fixture: { id: 700 }, team: { id: 7 }, player: { id: 70 } }] });
        }
        if (url.includes("/odds")) {
          return jsonResponse({ response: [{ fixture: { id: 999 }, ...pricedOddsRow }] });
        }
      }
      if (url.includes("/standings?")) return jsonResponse(standingsPayload);
      return jsonResponse({ response: [] });
    });

    const report = await buildDataTargetScoutReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.fixtureIds).toEqual(["700"]);
    expect(report.signalMatrix).toBe("700:lineups=0|injuries=0|odds=0|standings=2");
    expect(report.candidates[0]).toMatchObject({
      fixtureId: "700",
      ready: false,
      signalMatrix: "700:lineups=0|injuries=0|odds=0|standings=2",
    });
    expect(report.nextAction).toContain("missing lineups, injuries, odds");
  });

  it("builds a reusable scout evidence artifact for production acceptance handoff", async () => {
    const report = await buildDataTargetScoutReport(
      {
        ...env,
        KICKOFF_DATA_SCOUT_TARGETS: "2",
      },
      vi.fn(async (url: string) => {
        if (url.includes("/fixtures?")) {
          return jsonResponse({
            response: [
              { fixture: { id: 900 }, teams: { home: { id: 7, name: "Argentina" }, away: { id: 8, name: "USA" } } },
              { fixture: { id: 901 }, teams: { home: { id: 9, name: "England" }, away: { id: 10, name: "Ghana" } } },
            ],
          });
        }
        if (url.includes("fixture=900")) {
          if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [
            { team: { id: 7 }, startXI: [{ player: { id: 10, name: "Starter" } }] },
            { team: { id: 8 }, startXI: [{ player: { id: 11, name: "Starter" } }] },
          ] });
          if (url.includes("/injuries")) return jsonResponse({ response: [injuryFor(900, { id: 7 })] });
          if (url.includes("/odds")) return jsonResponse({ response: [oddsFor(900)] });
        }
        if (url.includes("fixture=901")) {
          if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [
            { team: { id: 9 }, startXI: [{ player: { id: 10, name: "Starter" } }] },
            { team: { id: 10 }, startXI: [{ player: { id: 11, name: "Starter" } }] },
          ] });
          if (url.includes("/injuries")) return jsonResponse({ response: [injuryFor(901, { id: 9 })] });
          if (url.includes("/odds")) return jsonResponse({ response: [oddsFor(901)] });
        }
        if (url.includes("/standings?")) return jsonResponse(standingsPayload);
        return jsonResponse({ response: [] });
      }) as any,
    );

    const artifact = buildDataTargetScoutArtifact(report, {
      envFiles: [".env.production.local"],
      generatedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(artifact.artifactVersion).toBe(1);
    expect(artifact.generatedAt).toBe("2026-07-04T12:00:00.000Z");
    expect(artifact.envFiles).toEqual([".env.production.local"]);
    expect(artifact.acceptance).toMatchObject({
      readyFixtureCount: 2,
      requiredFixtureCount: 2,
      completeSignalMatrix: true,
      fixtureSignals: [
        {
          fixtureId: "900",
          ready: true,
          rows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
          requiredRows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
          missingEndpoints: [],
        },
        {
          fixtureId: "901",
          ready: true,
          rows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
          requiredRows: { lineups: 2, injuries: 1, odds: 1, standings: 2 },
          missingEndpoints: [],
        },
      ],
      outputEnvKeys: ["KICKOFF_VERIFY_FIXTURE_IDS", "KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX"],
    });
    expect(artifact.acceptance.endpointReadBackCommands).toHaveLength(8);
    expect(artifact.acceptance.endpointReadBackCommands.find((item) => item.id === "900:lineups")).toMatchObject({
      fixtureId: "900",
      key: "lineups",
      ready: true,
      rows: 2,
      command: expect.stringContaining("curl -sS 'https://v3.football.api-sports.io/fixtures/lineups?fixture=900'"),
    });
    expect(artifact.acceptance.endpointReadBackCommands.find((item) => item.id === "900:lineups")?.command).toContain(
      "$APIFOOTBALL_KEY_OR_VITE_APIFOOTBALL_KEY",
    );
    expect(artifact.acceptance.endpointReadBackCommands.map((item) => item.command).join("\n")).not.toContain("api-key");
    expect(artifact.verifyEnv).toContain('KICKOFF_VERIFY_FIXTURE_IDS="900,901"');
  });

  it("keeps proxied endpoint read-back commands secretless", async () => {
    const report = await buildDataTargetScoutReport(
      {
        VITE_DATA_PROXY_URL: "https://data.example.workers.dev/proxy",
        KICKOFF_DATA_SCOUT_SEASON: "2026",
        KICKOFF_DATA_SCOUT_TARGETS: "1",
      },
      vi.fn(async (url: string) => {
        const parsed = new URL(url);
        const target = parsed.searchParams.get("url") ?? "";
        if (target.includes("/fixtures?")) {
          return jsonResponse({
            response: [
              { fixture: { id: 2600 }, teams: { home: { id: 1, name: "Brazil" }, away: { id: 2, name: "Japan" } } },
            ],
          });
        }
        if (target.includes("/fixtures/lineups")) return jsonResponse({ response: [
          { team: { id: 1 }, startXI: [{ player: { id: 10 } }] },
          { team: { id: 2 }, startXI: [{ player: { id: 11 } }] },
        ] });
        if (target.includes("/injuries")) return jsonResponse({ response: [injuryFor(2600, { id: 1 })] });
        if (target.includes("/odds")) return jsonResponse({ response: [oddsFor(2600)] });
        if (target.includes("/standings")) return jsonResponse(standingsPayload);
        return jsonResponse({ response: [] });
      }) as any,
    );

    const artifact = buildDataTargetScoutArtifact(report);
    const commands = artifact.acceptance.endpointReadBackCommands.map((item) => item.command);

    expect(artifact.ready).toBe(true);
    expect(commands.every((command) => command.includes("https://data.example.workers.dev/proxy"))).toBe(true);
    expect(commands.every((command) => !command.includes("x-apisports-key"))).toBe(true);
    expect(commands.every((command) => !command.includes("api-key"))).toBe(true);
  });

  it("returns the best partial fixture with a concrete next action when no candidate is complete", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/fixtures?")) {
        return jsonResponse({
          response: [
            { fixture: { id: 300 }, teams: { home: { name: "A" }, away: { name: "B" } } },
            { fixture: { id: 400 }, teams: { home: { id: 4, name: "C" }, away: { id: 5, name: "D" } } },
          ],
        });
      }
      if (url.includes("fixture=400") && url.includes("/fixtures/lineups")) {
        return jsonResponse({ response: [{ team: { id: 4 }, startXI: [{ player: { id: 10, name: "Starter" } }] }, { team: { id: 5 }, substitutes: [{ player: { id: 20, name: "Substitute" } }] }] });
      }
      if (url.includes("/standings?")) return jsonResponse(standingsPayload);
      return jsonResponse({ response: [] });
    });

    const report = await buildDataTargetScoutReport(env, fetcher as any);

    expect(report.ready).toBe(false);
    expect(report.fixtureId).toBe("400");
    expect(report.fixtureIds).toEqual(["400"]);
    expect(report.requiredFixtureCount).toBe(1);
    expect(report.nextAction).toContain("missing injuries, odds");
    expect(report.candidates[0].missingEndpoints).toEqual(["injuries", "odds"]);
    expect(report.gaps[0]).toMatchObject({
      fixtureId: "400",
      missingEndpoints: ["injuries", "odds"],
      action: expect.stringContaining("KICKOFF_DATA_SCOUT_LIMIT"),
    });
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FIXTURE_ID=400");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FIXTURE_IDS=400");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX=\"400:lineups=2|injuries=0|odds=0|standings=2\"");
    const artifactAcceptance = buildDataTargetScoutArtifact(report).acceptance;
    expect(artifactAcceptance).toMatchObject({
      readyFixtureCount: 0,
      requiredFixtureCount: 1,
      completeSignalMatrix: false,
      fixtureSignals: [
        expect.objectContaining({
          fixtureId: "400",
          ready: false,
          rows: { lineups: 2, injuries: 0, odds: 0, standings: 2 },
          missingEndpoints: ["injuries", "odds"],
        }),
      ],
    });
    expect(artifactAcceptance.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fixtureId: "400",
          missingEndpoints: ["injuries", "odds"],
        }),
      ]),
    );
  });

  it("can validate an explicit candidate fixture list before choosing verify targets", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/fixtures?")) {
        expect(url).toContain("ids=700-800");
        return jsonResponse({
          response: [
            { fixture: { id: 700 }, teams: { home: { id: 5, name: "Canada" }, away: { id: 6, name: "Morocco" } } },
            { fixture: { id: 800 }, teams: { home: { id: 15, name: "France" }, away: { id: 16, name: "Korea Republic" } } },
          ],
        });
      }
      if (url.includes("fixture=700")) {
        if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [
          { team: { id: 5 }, startXI: [{ player: { id: 10, name: "Starter" } }] },
          { team: { id: 6 }, startXI: [{ player: { id: 11, name: "Starter" } }] },
        ] });
        if (url.includes("/injuries")) return jsonResponse({ response: [injuryFor(700, { id: 5 })] });
        if (url.includes("/odds")) return jsonResponse({ response: [oddsFor(700)] });
      }
      if (url.includes("/standings?")) return jsonResponse(standingsPayload);
      if (url.includes("fixture=800") && url.includes("/fixtures/lineups")) {
        return jsonResponse({ response: [{ team: { id: 15 }, startXI: [{ player: { id: 10, name: "Starter" } }] }] });
      }
      return jsonResponse({ response: [] });
    });

    const report = await buildDataTargetScoutReport(
      {
        ...env,
        KICKOFF_DATA_SCOUT_FIXTURE_IDS: "700, 800",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(true);
    expect(report.fixtureIds).toEqual(["700"]);
    expect(report.signalMatrix).toBe("700:lineups=2|injuries=1|odds=1|standings=2");
    expect(report.candidates.map((candidate) => candidate.fixtureId)).toEqual(["700", "800"]);
    expect(report.nextAction).toContain("KICKOFF_VERIFY_FIXTURE_IDS=700");
  });

  it("keeps scouting incomplete until the configured target count is filled", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/fixtures?")) {
        return jsonResponse({
          response: [
            { fixture: { id: 100 }, teams: { home: { id: 3, name: "Brazil" }, away: { id: 4, name: "Japan" } } },
            { fixture: { id: 200 }, teams: { home: { name: "Spain" }, away: { name: "Austria" } } },
          ],
        });
      }
      if (url.includes("fixture=100")) {
        if (url.includes("/fixtures/lineups")) return jsonResponse({ response: [
          { team: { id: 3 }, startXI: [{ player: { id: 10, name: "Starter" } }] },
          { team: { id: 4 }, startXI: [{ player: { id: 11, name: "Starter" } }] },
        ] });
        if (url.includes("/injuries")) return jsonResponse({ response: [injuryFor(100, { id: 3 })] });
        return jsonResponse({ response: [oddsFor(100)] });
      }
      if (url.includes("/standings?")) return jsonResponse(standingsPayload);
      return jsonResponse({ response: [] });
    });

    const report = await buildDataTargetScoutReport(
      {
        ...env,
        KICKOFF_DATA_SCOUT_TARGETS: "3",
      },
      fetcher as any,
    );

    expect(report.ready).toBe(false);
    expect(report.fixtureIds).toEqual(["100"]);
    expect(report.requiredFixtureCount).toBe(3);
    expect(report.signalMatrix).toBe("100:lineups=2|injuries=1|odds=1|standings=2");
    expect(report.nextAction).toContain("Found 1/3 complete fixture targets");
  });
});
