import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateApiFootballEndpointRows } from "./apiFootballEndpointEvidence";

describe("API-Football endpoint evidence", () => {
  it("accepts lineup rows only when they carry real lineup structure", () => {
    const result = evaluateApiFootballEndpointRows("lineups", [
      {},
      { team: { id: 1, name: "Spain" } },
      { team: { id: 2, name: "Austria" }, startXI: [{ player: { id: 22, name: "Starter" } }] },
    ]);

    expect(result).toMatchObject({
      passed: true,
      detail: "1/3 valid lineups rows",
      sampleIds: ["2"],
    });
  });

  it("does not accept empty lineup arrays as real lineup read-back", () => {
    const result = evaluateApiFootballEndpointRows("lineups", [
      { team: { id: 1, name: "Spain" }, startXI: [] },
      { team: { id: 2, name: "Austria" }, substitutes: [] },
    ]);

    expect(result).toMatchObject({
      passed: false,
      detail: "0/2 valid lineups rows",
      sampleIds: [],
    });
  });

  it("requires fixture-scoped lineups to cover the target teams", () => {
    const result = evaluateApiFootballEndpointRows(
      "lineups",
      [
        { team: { id: 1, name: "Spain" }, startXI: [{ player: { id: 10, name: "Starter" } }] },
        { team: { id: 3, name: "Canada" }, startXI: [{ player: { id: 30, name: "Starter" } }] },
      ],
      { teamIds: ["1", "2"], teamNames: ["Spain", "Austria"] },
    );

    expect(result).toMatchObject({
      passed: false,
      detail: "1/2 valid lineups rows; 1 team mismatch; missing lineup teams 2",
      sampleIds: ["1"],
      teamMismatchCount: 1,
      missingTeamTargets: ["2"],
    });
  });

  it("accepts injury rows only when player and team or fixture identity are present", () => {
    const result = evaluateApiFootballEndpointRows("injuries", [
      { player: { id: 9, name: "Forward" } },
      { player: { id: 10, name: "Midfielder" }, team: { id: 20, name: "Spain" } },
    ]);

    expect(result).toMatchObject({
      passed: true,
      detail: "1/2 valid injuries rows",
      sampleIds: ["20"],
    });
  });

  it("rejects fixture-scoped injury rows when they belong to another team", () => {
    const result = evaluateApiFootballEndpointRows(
      "injuries",
      [{ player: { id: 10, name: "Midfielder" }, team: { id: 20, name: "Canada" } }],
      { fixtureId: "123", teamNames: ["Spain", "Austria"] },
    );

    expect(result).toMatchObject({
      passed: false,
      detail: "0/1 valid injuries row; 1 team mismatch",
      sampleIds: [],
      teamMismatchCount: 1,
    });
  });

  it("accepts odds rows only when bookmaker markets include priced outcomes", () => {
    const result = evaluateApiFootballEndpointRows("odds", [
      { league: { id: 1 } },
      {
        league: { id: 1 },
        bookmakers: [{ id: 7, name: "Book", bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.80" }] }] }],
      },
    ]);

    expect(result).toMatchObject({
      passed: true,
      detail: "1/2 valid odds rows",
      sampleIds: ["1"],
    });
  });

  it("rejects odds rows when bookmakers do not expose priced markets", () => {
    const result = evaluateApiFootballEndpointRows("odds", [
      { bookmakers: [{ id: 7, name: "Book" }] },
      { bookmakers: [{ id: 8, name: "Book", bets: [{ id: 1, name: "Match Winner", values: [] }] }] },
      { bookmakers: [{ id: 9, name: "Book", bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home" }] }] }] },
    ]);

    expect(result).toMatchObject({
      passed: false,
      detail: "0/3 valid odds rows",
      sampleIds: [],
    });
  });

  it("rejects fixture-scoped rows that explicitly point to a different fixture", () => {
    const result = evaluateApiFootballEndpointRows(
      "odds",
      [
        {
          fixture: { id: 999 },
          bookmakers: [{ id: 7, name: "Book", bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.80" }] }] }],
        },
      ],
      { fixtureId: "123" },
    );

    expect(result).toMatchObject({
      passed: false,
      detail: "0/1 valid odds row; 1 fixture id mismatch for 123",
      sampleIds: [],
      fixtureMismatchCount: 1,
    });
  });

  it("can require fixture identity for production odds and injury read-back", () => {
    const odds = evaluateApiFootballEndpointRows(
      "odds",
      [
        {
          bookmakers: [{ id: 7, name: "Book", bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.80" }] }] }],
        },
      ],
      { fixtureId: "123", requireFixtureIdentity: true },
    );
    const injuries = evaluateApiFootballEndpointRows(
      "injuries",
      [{ player: { id: 10, name: "Midfielder" }, team: { id: 20, name: "Spain" } }],
      { fixtureId: "123", requireFixtureIdentity: true },
    );

    expect(odds).toMatchObject({
      passed: false,
      detail: "0/1 valid odds row; 1 missing fixture identity for 123",
      missingFixtureIdentityCount: 1,
    });
    expect(injuries).toMatchObject({
      passed: false,
      detail: "0/1 valid injuries row; 1 missing fixture identity for 123",
      missingFixtureIdentityCount: 1,
    });
  });

  it("rejects odds rows with explicit teams outside the target fixture", () => {
    const result = evaluateApiFootballEndpointRows(
      "odds",
      [{
        teams: { home: { name: "Canada" }, away: { name: "Morocco" } },
        bookmakers: [{ id: 7, name: "Book", bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "1.80" }] }] }],
      }],
      { fixtureId: "123", teamNames: ["Spain", "Austria"] },
    );

    expect(result).toMatchObject({
      passed: false,
      detail: "0/1 valid odds row; 1 team mismatch",
      sampleIds: [],
      teamMismatchCount: 1,
    });
  });

  it("keeps strict production evidence scoped to the target fixture id", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/run-production-evidence.mjs"), "utf8");

    expect(script).toContain(
      'requireFixtureIdentity: name === "injuries" || name === "odds"',
    );
  });

  it("accepts standings rows only when team identity, positive rank and points are present", () => {
    const result = evaluateApiFootballEndpointRows("standings", [
      { team: { id: 1, name: "Spain" }, rank: 0, points: 9 },
      { team: { id: 2, name: "Austria" }, rank: 2 },
      { team: { id: 3, name: "Canada" }, rank: 3, points: 4 },
    ]);

    expect(result).toMatchObject({
      passed: true,
      detail: "1/3 valid standings rows",
      sampleIds: ["3"],
    });
  });

  it("requires standings rows to cover every target fixture team when scoped", () => {
    const result = evaluateApiFootballEndpointRows(
      "standings",
      [
        { team: { id: 1, name: "Spain" }, rank: 1, points: 9 },
        { team: { id: 3, name: "Canada" }, rank: 3, points: 4 },
      ],
      { standingTeamIds: ["1", "2"] },
    );

    expect(result).toMatchObject({
      passed: false,
      detail: "1/2 valid standings rows; missing standings teams 2",
      sampleIds: ["1"],
    });
  });

  it("can scope standings read-back by fixture team names when API ids are unavailable", () => {
    const result = evaluateApiFootballEndpointRows(
      "standings",
      [
        { team: { name: "Spain" }, rank: 1, points: 9 },
        { team: { name: "Austria" }, rank: 2, points: 6 },
        { team: { name: "Canada" }, rank: 3, points: 4 },
      ],
      { standingTeamNames: ["spain", "AUSTRIA"] },
    );

    expect(result).toMatchObject({
      passed: true,
      detail: "2/3 valid standings rows",
      sampleIds: ["Spain", "Austria"],
    });
  });

  it("rejects non-empty endpoint arrays that only contain empty shells", () => {
    expect(evaluateApiFootballEndpointRows("lineups", [{}]).passed).toBe(false);
    expect(evaluateApiFootballEndpointRows("injuries", [{}]).passed).toBe(false);
    expect(evaluateApiFootballEndpointRows("odds", [{}]).passed).toBe(false);
    expect(evaluateApiFootballEndpointRows("standings", [{}]).passed).toBe(false);
  });
});
