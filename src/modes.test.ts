import { describe, expect, it } from "vitest";
import { createGameModeRun, getModeReadiness } from "./modes";
import type { GameMode, MemoryRecord } from "./types";

const mode: GameMode = {
  id: "parlay",
  title: "Multi-match parlay",
  status: "playable",
  description: "Bundle three locks.",
  progress: 50,
  reward: "XP",
};

const calibrationMode: GameMode = {
  id: "agent-vs-human",
  title: "Agent vs Human",
  status: "playable",
  description: "Calibrate confidence against revealed score.",
  progress: 50,
  reward: "Calibration badge",
};

const upsetMode: GameMode = {
  id: "upset",
  title: "Upset Challenge",
  status: "playable",
  description: "Seal a bold low-confidence call.",
  progress: 50,
  reward: "Bonus XP",
};

const bracketMode: GameMode = {
  id: "bracket",
  title: "Bracket path",
  status: "playable",
  description: "Seal four knockout path picks.",
  progress: 50,
  reward: "Path badge",
};

const groupPathMode: GameMode = {
  id: "group-path",
  title: "Group path",
  status: "playable",
  description: "Project a group table from sealed locks.",
  progress: 50,
  reward: "Table badge",
};

const penaltyPressureMode: GameMode = {
  id: "penalty-pressure",
  title: "Penalty pressure",
  status: "playable",
  description: "Seal clutch taker and pressure market calls.",
  progress: 50,
  reward: "Ice-vein badge",
};

const record = (id: string, score?: number): MemoryRecord => ({
  capsule: {
    id,
    matchId: `match-${id}`,
    matchLabel: `${id} home vs ${id} away`,
    kickoffAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2098-12-31T00:00:00.000Z",
    sealedAt: "2098-12-31T00:00:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: `bafy-${id}`,
      pieceCid: `piece-${id}`,
      provider: "demo",
      dataSetId: "set",
      proofStatus: "retrievable",
    },
    prediction: {
      homeScore: 1,
      awayScore: 0,
      winner: `${id} home`,
      keyPlayers: [],
      confidence: 60,
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
      markets: [
        {
          id: "winner",
          label: "1X2",
          pick: `${id} home`,
          confidence: 60,
          rationale: "Rationale",
        },
      ],
    },
  },
  result:
    score === undefined
      ? undefined
      : {
          id: `res-${id}`,
          capsuleId: id,
          revealedAt: "2099-01-01T02:00:00.000Z",
          homeScore: 1,
          awayScore: 0,
          keyPlayers: [],
          source: "manual",
          totalScore: score,
          breakdown: {
            winner: 24,
            exactScore: 24,
            goalDifference: 12,
            markets: 10,
            keyPlayer: 0,
            confidence: 10,
            reasoning: 5,
          },
          explanation: [],
          agentReview: [],
        },
});

describe("game mode proof runs", () => {
  it("requires enough sealed records before parlay proof creation", () => {
    const readiness = getModeReadiness("parlay", [record("one"), record("two")]);
    expect(readiness.ready).toBe(false);
    expect(readiness.nextAction).toMatch(/Seal 1 more/);
  });

  it("creates a deterministic mode proof run with score when records are revealed", async () => {
    const run = await createGameModeRun(mode, [record("one", 80), record("two", 70), record("three", 90)]);
    expect(run.modeId).toBe("parlay");
    expect(run.capsuleIds).toEqual(["one", "two", "three"]);
    expect(run.score).toBe(100);
    expect(run.artifact?.kind).toBe("parlay-ticket");
    expect(run.summary).toContain("Parlay chain ticket");
    if (run.artifact?.kind !== "parlay-ticket") throw new Error("Expected parlay artifact");
    expect(run.artifact.chainStatus).toBe("complete");
    expect(run.artifact.chainHitLegs).toBe(3);
    expect(run.artifact.legs.map((leg) => leg.chainStatus)).toEqual(["hit", "hit", "hit"]);
    expect(run.payloadHash).toHaveLength(64);
    expect(run.filecoinProof.cid).toMatch(/^bafy-kickoff-/);
  });

  it("tracks parlay chain survival and bust position", async () => {
    const first = record("one", 80);
    const second = record("two", 55);
    const third = record("three", 90);
    if (!second.result) throw new Error("Expected second result");
    second.result.breakdown.winner = 0;

    const run = await createGameModeRun(mode, [first, second, third]);

    expect(run.artifact?.kind).toBe("parlay-ticket");
    if (run.artifact?.kind !== "parlay-ticket") throw new Error("Expected parlay artifact");
    expect(run.score).toBe(33);
    expect(run.artifact.hitLegs).toBe(2);
    expect(run.artifact.chainHitLegs).toBe(1);
    expect(run.artifact.chainBustedAt).toBe(2);
    expect(run.artifact.chainStatus).toBe("busted");
    expect(run.artifact.legs.map((leg) => leg.survivesChain)).toEqual([true, false, false]);
    expect(run.artifact.legs.map((leg) => leg.chainStatus)).toEqual(["hit", "miss", "miss"]);
    expect(run.summary).toContain("chain busted at leg 2");
  });

  it("creates an agent calibration artifact from revealed records", async () => {
    const run = await createGameModeRun(calibrationMode, [record("one", 80), record("two", 40)]);
    expect(run.artifact?.kind).toBe("agent-calibration");
    expect(run.score).toBe(80);
    expect(run.summary).toContain("avg error 20");
  });

  it("creates an upset ticket with bonus XP for low-confidence hits", async () => {
    const bold = record("bold", 84);
    bold.capsule.prediction.confidence = 44;
    const readiness = getModeReadiness("upset", [bold]);
    expect(readiness.ready).toBe(true);

    const run = await createGameModeRun(upsetMode, [bold]);
    expect(run.artifact?.kind).toBe("upset-ticket");
    expect(run.score).toBe(100);
    expect(run.summary).toContain("150 bonus XP");
  });

  it("creates a bracket path artifact from sealed knockout records", async () => {
    const run = await createGameModeRun(bracketMode, [
      record("r16", 80),
      record("quarter", 70),
      record("semi"),
      record("final"),
    ]);

    expect(run.modeId).toBe("bracket");
    expect(run.artifact?.kind).toBe("bracket-path");
    if (run.artifact?.kind !== "bracket-path") throw new Error("Expected bracket path artifact");
    expect(run.artifact.bracketPath.picks).toHaveLength(4);
    expect(run.artifact.bracketPath.picks.map((pick) => pick.stage)).toEqual([
      "Round of 16",
      "Quarterfinal",
      "Semifinal",
      "Final",
    ]);
    expect(run.artifact.bracketPath.picks.at(-1)?.winner).toBe("final home");
    expect(run.artifact.resolvedPicks).toBe(2);
    expect(run.artifact.hitPicks).toBe(2);
    expect(run.artifact.settlements?.map((pick) => pick.winnerHit)).toEqual([true, true, undefined, undefined]);
    expect(run.score).toBe(100);
    expect(run.summary).toContain("Bracket path");
    expect(run.summary).toContain("final home");
    expect(run.summary).toContain("2/2 resolved path hits");
  });

  it("allows regular bold upset locks while still rejecting safe picks", () => {
    const bold = record("bold");
    bold.capsule.prediction.confidence = 70;
    const safe = record("safe");
    safe.capsule.prediction.confidence = 71;

    expect(getModeReadiness("upset", [bold]).ready).toBe(true);
    expect(getModeReadiness("upset", [safe]).ready).toBe(false);
    expect(getModeReadiness("upset", [safe]).nextAction).toMatch(/70% confidence or below/);
  });

  it("creates a group table path artifact from sealed group-stage locks", async () => {
    const one = record("one", 80);
    one.capsule.matchLabel = "Spain vs Japan";
    one.capsule.prediction.homeScore = 2;
    one.capsule.prediction.awayScore = 1;
    one.capsule.prediction.winner = "Spain";
    const two = record("two", 40);
    two.capsule.matchLabel = "Brazil vs Canada";
    two.capsule.prediction.homeScore = 1;
    two.capsule.prediction.awayScore = 1;
    two.capsule.prediction.winner = "Draw";
    if (!two.result) throw new Error("Expected second result");
    two.result.homeScore = 2;
    two.result.awayScore = 0;
    two.result.breakdown.winner = 0;
    const three = record("three");
    three.capsule.matchLabel = "Spain vs Canada";
    three.capsule.prediction.homeScore = 1;
    three.capsule.prediction.awayScore = 0;
    three.capsule.prediction.winner = "Spain";
    const four = record("four");
    four.capsule.matchLabel = "Brazil vs Japan";
    four.capsule.prediction.homeScore = 2;
    four.capsule.prediction.awayScore = 1;
    four.capsule.prediction.winner = "Brazil";

    const readiness = getModeReadiness("group-path", [one, two, three, four]);
    expect(readiness.ready).toBe(true);

    const run = await createGameModeRun(groupPathMode, [one, two, three, four]);

    expect(run.modeId).toBe("group-path");
    expect(run.artifact?.kind).toBe("group-table-path");
    if (run.artifact?.kind !== "group-table-path") throw new Error("Expected group table path artifact");
    expect(run.artifact.picks).toHaveLength(4);
    expect(run.artifact.resolvedMatches).toBe(2);
    expect(run.artifact.winnerHits).toBe(1);
    expect(run.score).toBe(50);
    expect(run.artifact.topTwo).toEqual(["Spain", "Brazil"]);
    expect(run.artifact.table.find((row) => row.team === "Spain")).toMatchObject({
      projectedRank: 1,
      predictedPoints: 6,
      predictedGoalDifference: 2,
      actualPoints: 3,
      actualGoalDifference: 1,
      locks: 2,
    });
    expect(run.artifact.table.find((row) => row.team === "Brazil")).toMatchObject({
      projectedRank: 2,
      predictedPoints: 4,
      predictedGoalDifference: 1,
      actualPoints: 3,
      actualGoalDifference: 2,
      locks: 2,
    });
    expect(run.artifact.picks.map((pick) => pick.winnerHit)).toEqual([true, false, undefined, undefined]);
    expect(run.artifact.picks.map((pick) => pick.actualScore)).toEqual(["1-0", "2-0", undefined, undefined]);
    expect(run.summary).toContain("Group path sealed");
    expect(run.summary).toContain("Spain / Brazil");
  });

  it("keeps group path locked until enough teams are represented", () => {
    const one = record("one");
    one.capsule.matchLabel = "Spain vs Japan";
    const two = record("two");
    two.capsule.matchLabel = "Spain vs Japan";
    const three = record("three");
    three.capsule.matchLabel = "Spain vs Japan";
    const four = record("four");
    four.capsule.matchLabel = "Spain vs Japan";

    const readiness = getModeReadiness("group-path", [one, two, three, four]);

    expect(readiness.ready).toBe(false);
    expect(readiness.nextAction).toContain("2 more teams");
  });

  it("creates a penalty pressure ticket from key-player, market and high-confidence calls", async () => {
    const taker = record("taker", 82);
    taker.capsule.prediction.keyPlayers = ["Kylian Mbappe"];
    if (!taker.result) throw new Error("Expected first result");
    taker.result.keyPlayers = ["Kylian Mbappe"];

    const market = record("market", 64);
    market.capsule.prediction.keyPlayers = [];
    market.capsule.prediction.markets = [
      {
        id: "both-score",
        label: "Both teams score",
        pick: "Yes",
        confidence: 63,
        rationale: "Open match state",
      },
    ];
    if (!market.result) throw new Error("Expected second result");
    market.result.breakdown.markets = 15;

    const readiness = getModeReadiness("penalty-pressure", [taker, market]);
    expect(readiness.ready).toBe(true);
    expect(readiness.requirements).toContain("2 sealed pressure picks");

    const run = await createGameModeRun(penaltyPressureMode, [taker, market]);

    expect(run.modeId).toBe("penalty-pressure");
    expect(run.artifact?.kind).toBe("penalty-pressure-ticket");
    if (run.artifact?.kind !== "penalty-pressure-ticket") throw new Error("Expected penalty pressure artifact");
    expect(run.score).toBe(100);
    expect(run.artifact.takers.map((item) => item.pickType)).toEqual(["key-player", "market"]);
    expect(run.artifact.hitPicks).toBe(2);
    expect(run.artifact.resolvedPicks).toBe(2);
    expect(run.artifact.averagePressure).toBeGreaterThan(50);
    expect(run.summary).toContain("Penalty pressure proof");
    expect(run.summary).toContain("2/2 pressure picks hit");
  });

  it("keeps penalty pressure locked until two pressure-qualified picks exist", () => {
    const plain = record("plain");
    plain.capsule.prediction.keyPlayers = [];
    plain.capsule.prediction.markets = [];
    plain.capsule.prediction.confidence = 60;
    const highConfidence = record("high");
    highConfidence.capsule.prediction.keyPlayers = [];
    highConfidence.capsule.prediction.markets = [];
    highConfidence.capsule.prediction.confidence = 75;

    const readiness = getModeReadiness("penalty-pressure", [plain, highConfidence]);

    expect(readiness.ready).toBe(false);
    expect(readiness.eligibleRecords.map((item) => item.capsule.id)).toEqual(["high"]);
    expect(readiness.nextAction).toContain("Add 1 more pressure pick");
  });
});
