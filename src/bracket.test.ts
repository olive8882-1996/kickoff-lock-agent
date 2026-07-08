import { describe, expect, it } from "vitest";
import { buildBracketPathFromMatches, createBracketModeRun, isBracketPathReady, settleBracketModeRun } from "./bracket";
import type { Match } from "./types";

const matches: Match[] = [
  ["m1", "Spain", "Austria"],
  ["m2", "Brazil", "Japan"],
  ["m3", "Portugal", "Croatia"],
  ["m4", "England", "Ghana"],
].map(([id, homeTeam, awayTeam], index) => ({
  id,
  homeTeam,
  awayTeam,
  kickoffAt: `2099-07-0${index + 1}T20:00:00.000Z`,
  stage: index === 1 ? "Quarterfinal" : "Round of 16",
  status: "upcoming",
  dataSource: "seed",
}));

describe("bracket path mode", () => {
  it("builds four editable knockout path picks from upcoming matches", () => {
    const path = buildBracketPathFromMatches(matches);
    expect(path.picks).toHaveLength(4);
    expect(path.picks[0].matchLabel).toBe("Spain vs Austria");
    expect(path.picks[1].winner).toBe("Japan");
    expect(isBracketPathReady(path)).toBe(true);
  });

  it("seals a bracket path as a mode proof run", async () => {
    const path = buildBracketPathFromMatches(matches);
    const run = await createBracketModeRun(path);
    expect(run.modeId).toBe("bracket");
    expect(run.payloadHash).toHaveLength(64);
    expect(run.filecoinProof.cid).toContain("bafy-kickoff");
    expect(run.artifact?.kind).toBe("bracket-path");
    if (run.artifact?.kind !== "bracket-path") throw new Error("Expected bracket path artifact");
    expect(run.artifact.bracketPath.picks).toHaveLength(4);
    expect(run.artifact.resolvedPicks).toBe(0);
    expect(run.artifact.hitPicks).toBe(0);
    expect(run.artifact.settlements).toEqual([]);
  });

  it("settles a sealed bracket path from finished knockout match scores without changing the sealed hash", async () => {
    const path = buildBracketPathFromMatches(matches);
    path.picks[0] = { ...path.picks[0]!, winner: "Spain" };
    path.picks[1] = { ...path.picks[1]!, winner: "Brazil" };
    const run = await createBracketModeRun(path);

    const settled = settleBracketModeRun(run, [
      { ...matches[0]!, status: "finished", homeScore: 2, awayScore: 0 },
      { ...matches[1]!, status: "finished", homeScore: 0, awayScore: 1 },
      { ...matches[2]!, status: "upcoming", homeScore: undefined, awayScore: undefined },
      { ...matches[3]!, status: "finished", homeScore: 1, awayScore: 1 },
    ]);

    expect(settled.payloadHash).toBe(run.payloadHash);
    expect(settled.filecoinProof).toEqual(run.filecoinProof);
    expect(settled.status).toBe("scored");
    expect(settled.score).toBe(50);
    expect(settled.summary).toBe("Bracket path settled with 1/2 resolved knockout hits.");
    expect(settled.artifact?.kind).toBe("bracket-path");
    if (settled.artifact?.kind !== "bracket-path") throw new Error("Expected bracket path artifact");
    expect(settled.artifact.resolvedPicks).toBe(2);
    expect(settled.artifact.hitPicks).toBe(1);
    expect(settled.artifact.settlements?.map((settlement) => settlement.winnerHit)).toEqual([
      true,
      false,
      undefined,
      undefined,
    ]);
    expect(settled.artifact.settlements?.map((settlement) => settlement.resultScore)).toEqual([
      100,
      0,
      undefined,
      undefined,
    ]);
  });
});
