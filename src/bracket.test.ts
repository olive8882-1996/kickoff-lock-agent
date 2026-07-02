import { describe, expect, it } from "vitest";
import { buildBracketPathFromMatches, createBracketModeRun, isBracketPathReady } from "./bracket";
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
    expect(run.artifact?.bracketPath.picks).toHaveLength(4);
  });
});
