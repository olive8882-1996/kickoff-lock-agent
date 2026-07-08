import { createDemoProof, sha256, stableJson } from "./proof";
import type { BracketPath, BracketPick, GameMode, GameModeRun, MemoryRecord, ModeArtifact } from "./types";

export type ModeReadiness = {
  modeId: GameMode["id"];
  eligibleRecords: MemoryRecord[];
  requirements: string[];
  ready: boolean;
  nextAction: string;
};

const revealed = (records: MemoryRecord[]) => records.filter((record) => record.result);
const isUpsetEligible = (record: MemoryRecord) => record.capsule.prediction.confidence <= 70;
const isPenaltyPressureEligible = (record: MemoryRecord) =>
  record.capsule.prediction.keyPlayers.length > 0 ||
  record.capsule.prediction.markets.length > 0 ||
  record.capsule.prediction.confidence >= 75;
const bracketStages = ["Round of 16", "Quarterfinal", "Semifinal", "Final"];
type ParlayLeg = Extract<ModeArtifact, { kind: "parlay-ticket" }>["legs"][number];
type GroupTableRow = Extract<ModeArtifact, { kind: "group-table-path" }>["table"][number];
type PenaltyPressureTaker = Extract<ModeArtifact, { kind: "penalty-pressure-ticket" }>["takers"][number];

const teamsForRecord = (record: MemoryRecord) => {
  const [home = "", away = ""] = record.capsule.matchLabel.split(/\s+vs\s+/i).map((item) => item.trim());
  return { home, away };
};

const applyTableResult = (
  table: Map<string, Omit<GroupTableRow, "projectedRank">>,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  key: "predicted" | "actual",
) => {
  if (!home || !away) return;
  const ensure = (team: string) => {
    const row = table.get(team) ?? {
      team,
      predictedPoints: 0,
      predictedGoalDifference: 0,
      actualPoints: 0,
      actualGoalDifference: 0,
      locks: 0,
    };
    table.set(team, row);
    return row;
  };
  const homeRow = ensure(home);
  const awayRow = ensure(away);
  const homePoints = homeScore === awayScore ? 1 : homeScore > awayScore ? 3 : 0;
  const awayPoints = homeScore === awayScore ? 1 : awayScore > homeScore ? 3 : 0;
  const homeDiff = homeScore - awayScore;
  const awayDiff = awayScore - homeScore;
  if (key === "predicted") {
    homeRow.predictedPoints += homePoints;
    awayRow.predictedPoints += awayPoints;
    homeRow.predictedGoalDifference += homeDiff;
    awayRow.predictedGoalDifference += awayDiff;
    homeRow.locks += 1;
    awayRow.locks += 1;
  } else {
    homeRow.actualPoints = (homeRow.actualPoints ?? 0) + homePoints;
    awayRow.actualPoints = (awayRow.actualPoints ?? 0) + awayPoints;
    homeRow.actualGoalDifference = (homeRow.actualGoalDifference ?? 0) + homeDiff;
    awayRow.actualGoalDifference = (awayRow.actualGoalDifference ?? 0) + awayDiff;
  }
};

const rankedGroupTable = (table: Map<string, Omit<GroupTableRow, "projectedRank">>) =>
  [...table.values()]
    .sort(
      (a, b) =>
        b.predictedPoints - a.predictedPoints ||
        b.predictedGoalDifference - a.predictedGoalDifference ||
        a.team.localeCompare(b.team),
    )
    .map((row, index) => ({ ...row, projectedRank: index + 1 }));

const createBracketPathArtifact = (records: MemoryRecord[]): ModeArtifact => {
  const now = new Date().toISOString();
  const picks: BracketPick[] = records.map((record, index) => ({
    id: `path-${record.capsule.id}`,
    matchId: record.capsule.matchId,
    matchLabel: record.capsule.matchLabel,
    stage: bracketStages[index] ?? `Knockout pick ${index + 1}`,
    winner: record.capsule.prediction.winner,
    confidence: record.capsule.prediction.confidence,
    note: record.capsule.prediction.agentSummary || record.capsule.prediction.reasoning,
  }));
  const settlements = records.map((record, index) => ({
    capsuleId: record.capsule.id,
    matchLabel: record.capsule.matchLabel,
    stage: bracketStages[index] ?? `Knockout pick ${index + 1}`,
    predictedWinner: record.capsule.prediction.winner,
    confidence: record.capsule.prediction.confidence,
    resultScore: record.result?.totalScore,
    winnerHit: record.result ? record.result.breakdown.winner > 0 : undefined,
  }));
  const resolvedPicks = settlements.filter((pick) => pick.resultScore !== undefined).length;
  const hitPicks = settlements.filter((pick) => pick.winnerHit).length;
  const bracketPath: BracketPath = {
    id: `bracket-${records.map((record) => record.capsule.id).join("-")}`,
    title: "Sealed knockout path",
    createdAt: now,
    updatedAt: now,
    picks,
  };
  return {
    kind: "bracket-path",
    bracketPath,
    settlements,
    resolvedPicks,
    hitPicks,
  };
};

export const getModeReadiness = (
  modeId: GameMode["id"],
  records: MemoryRecord[],
): ModeReadiness => {
  const locked = records.filter((record) => record.capsule.locked);
  const scored = revealed(records);
  if (modeId === "bracket") {
    return {
      modeId,
      eligibleRecords: locked.slice(0, 4),
      requirements: ["4 sealed knockout path picks", "At least 2 revealed results for scoring"],
      ready: locked.length >= 4,
      nextAction: locked.length >= 4 ? "Seal bracket path proof" : `Seal ${4 - locked.length} more picks`,
    };
  }
  if (modeId === "parlay") {
    const parlayRecords = locked.filter((record) => record.capsule.prediction.markets.length > 0);
    return {
      modeId,
      eligibleRecords: parlayRecords.slice(0, 3),
      requirements: ["3 sealed match capsules", "Market picks included in each capsule"],
      ready: parlayRecords.length >= 3,
      nextAction: parlayRecords.length >= 3 ? "Seal parlay proof" : `Seal ${3 - parlayRecords.length} more market locks`,
    };
  }
  if (modeId === "agent-vs-human") {
    return {
      modeId,
      eligibleRecords: scored.slice(0, 3),
      requirements: ["At least 1 revealed lock", "Agent review generated after reveal"],
      ready: scored.length >= 1,
      nextAction: scored.length >= 1 ? "Seal calibration proof" : "Reveal one locked prediction",
    };
  }
  if (modeId === "group-path") {
    const teamSet = new Set(locked.flatMap((record) => {
      const teams = teamsForRecord(record);
      return [teams.home, teams.away].filter(Boolean);
    }));
    return {
      modeId,
      eligibleRecords: locked.slice(0, 6),
      requirements: ["4 sealed group-stage locks", "At least 4 teams represented in the projected table"],
      ready: locked.length >= 4 && teamSet.size >= 4,
      nextAction:
        locked.length < 4
          ? `Seal ${4 - locked.length} more group-stage locks`
          : teamSet.size < 4
            ? `Add locks covering ${4 - teamSet.size} more team${4 - teamSet.size === 1 ? "" : "s"}`
            : "Seal group table path proof",
    };
  }
  if (modeId === "penalty-pressure") {
    const pressureRecords = locked.filter(isPenaltyPressureEligible);
    return {
      modeId,
      eligibleRecords: pressureRecords.slice(0, 5),
      requirements: ["2 sealed pressure picks", "Each pick needs a key player, market call or 75%+ winner call"],
      ready: pressureRecords.length >= 2,
      nextAction:
        pressureRecords.length >= 2
          ? "Seal penalty pressure proof"
          : `Add ${2 - pressureRecords.length} more pressure pick${2 - pressureRecords.length === 1 ? "" : "s"}`,
    };
  }
  const upsetRecords = locked.filter(isUpsetEligible);
  return {
    modeId,
    eligibleRecords: upsetRecords.slice(0, 3),
    requirements: ["At least 1 bold or underdog-style sealed pick", "Public leaderboard multiplier after reveal"],
    ready: upsetRecords.length >= 1,
    nextAction: upsetRecords.length >= 1 ? "Seal upset challenge proof" : "Create a bold lock at 70% confidence or below",
  };
};

const createModeArtifact = (modeId: GameMode["id"], records: MemoryRecord[]): ModeArtifact | undefined => {
  if (modeId === "bracket") {
    return createBracketPathArtifact(records);
  }
  if (modeId === "parlay") {
    let chainBustedAt: number | undefined;
    const legs: ParlayLeg[] = records.map((record, index) => {
      const winnerHit = record.result ? record.result.breakdown.winner > 0 : undefined;
      const inactive = chainBustedAt !== undefined;
      const sequenceIndex = index + 1;
      const chainStatus: NonNullable<ParlayLeg["chainStatus"]> =
        winnerHit === undefined ? (inactive ? "inactive" : "pending") : winnerHit && !inactive ? "hit" : "miss";
      const leg = {
        capsuleId: record.capsule.id,
        matchLabel: record.capsule.matchLabel,
        sequenceIndex,
        chainStep: `Leg ${sequenceIndex}`,
        pick: record.capsule.prediction.winner,
        confidence: record.capsule.prediction.confidence,
        markets: record.capsule.prediction.markets,
        resultScore: record.result?.totalScore,
        winnerHit,
        survivesChain: winnerHit === undefined ? undefined : winnerHit && !inactive,
        chainStatus,
      };
      if (winnerHit === false && chainBustedAt === undefined) {
        chainBustedAt = sequenceIndex;
      }
      return leg;
    });
    const settledLegs = legs.filter((leg) => leg.resultScore !== undefined).length;
    const hitLegs = legs.filter((leg) => leg.winnerHit).length;
    const chainHitLegs = chainBustedAt === undefined ? hitLegs : Math.max(0, chainBustedAt - 1);
    const chainStatus = chainBustedAt !== undefined ? "busted" : settledLegs === legs.length ? "complete" : "live";
    return {
      kind: "parlay-ticket",
      legs,
      settledLegs,
      hitLegs,
      chainResolvedLegs: settledLegs,
      chainHitLegs,
      chainBustedAt,
      chainStatus,
    };
  }
  if (modeId === "agent-vs-human") {
    const samples = records
      .filter((record) => record.result)
      .map((record) => {
        const totalScore = record.result?.totalScore ?? 0;
        return {
          capsuleId: record.capsule.id,
          matchLabel: record.capsule.matchLabel,
          confidence: record.capsule.prediction.confidence,
          totalScore,
          winnerHit: (record.result?.breakdown.winner ?? 0) > 0,
          calibrationError: Math.abs(record.capsule.prediction.confidence - totalScore),
          review: record.result?.agentReview ?? [],
        };
      });
    const averageCalibrationError =
      samples.length > 0
        ? Math.round(samples.reduce((sum, sample) => sum + sample.calibrationError, 0) / samples.length)
        : 0;
    return {
      kind: "agent-calibration",
      samples,
      averageCalibrationError,
    };
  }
  if (modeId === "upset") {
    const picks = records.map((record) => {
      const winnerHit = record.result ? record.result.breakdown.winner > 0 : undefined;
      const multiplier = record.capsule.prediction.confidence <= 45 ? 3 : 2;
      return {
        capsuleId: record.capsule.id,
        matchLabel: record.capsule.matchLabel,
        predictedWinner: record.capsule.prediction.winner,
        confidence: record.capsule.prediction.confidence,
        resultScore: record.result?.totalScore,
        winnerHit,
        multiplier,
      };
    });
    const resolvedPicks = picks.filter((pick) => pick.resultScore !== undefined).length;
    const hitPicks = picks.filter((pick) => pick.winnerHit).length;
    return {
      kind: "upset-ticket",
      picks,
      resolvedPicks,
      hitPicks,
      bonusXp: picks.reduce((sum, pick) => sum + (pick.winnerHit ? pick.multiplier * 50 : 0), 0),
    };
  }
  if (modeId === "group-path") {
    const table = new Map<string, Omit<GroupTableRow, "projectedRank">>();
    const picks = records.map((record) => {
      const teams = teamsForRecord(record);
      applyTableResult(
        table,
        teams.home,
        teams.away,
        record.capsule.prediction.homeScore,
        record.capsule.prediction.awayScore,
        "predicted",
      );
      if (record.result) {
        applyTableResult(table, teams.home, teams.away, record.result.homeScore, record.result.awayScore, "actual");
      }
      return {
        capsuleId: record.capsule.id,
        matchLabel: record.capsule.matchLabel,
        predictedWinner: record.capsule.prediction.winner,
        predictedScore: `${record.capsule.prediction.homeScore}-${record.capsule.prediction.awayScore}`,
        actualScore: record.result ? `${record.result.homeScore}-${record.result.awayScore}` : undefined,
        winnerHit: record.result ? record.result.breakdown.winner > 0 : undefined,
      };
    });
    const ranked = rankedGroupTable(table);
    const resolvedMatches = picks.filter((pick) => pick.actualScore).length;
    const winnerHits = picks.filter((pick) => pick.winnerHit).length;
    return {
      kind: "group-table-path",
      table: ranked,
      picks,
      resolvedMatches,
      winnerHits,
      topTwo: ranked.slice(0, 2).map((row) => row.team),
    };
  }
  if (modeId === "penalty-pressure") {
    const takers: PenaltyPressureTaker[] = records.map((record) => {
      const keyPlayer = record.capsule.prediction.keyPlayers[0];
      const market = record.capsule.prediction.markets[0];
      const pressurePick = keyPlayer ?? market?.pick ?? record.capsule.prediction.winner;
      const pickType: PenaltyPressureTaker["pickType"] = keyPlayer ? "key-player" : market ? "market" : "winner";
      const pressureRating = Math.min(100, Math.max(1, Math.round(record.capsule.prediction.confidence * 0.65 + (100 - record.capsule.prediction.confidence) * 0.35)));
      const pressureHit =
        record.result && pickType === "key-player"
          ? record.result.keyPlayers.some((actual) => actual.toLowerCase().includes(pressurePick.toLowerCase()))
          : record.result && pickType === "market"
            ? (record.result.breakdown.markets ?? 0) > 0
            : record.result
              ? record.result.breakdown.winner > 0
              : undefined;
      return {
        capsuleId: record.capsule.id,
        matchLabel: record.capsule.matchLabel,
        pressurePick,
        pickType,
        confidence: record.capsule.prediction.confidence,
        pressureRating,
        resultScore: record.result?.totalScore,
        pressureHit,
      };
    });
    const resolvedPicks = takers.filter((taker) => taker.resultScore !== undefined).length;
    const hitPicks = takers.filter((taker) => taker.pressureHit).length;
    const averagePressure =
      takers.length > 0 ? Math.round(takers.reduce((sum, taker) => sum + taker.pressureRating, 0) / takers.length) : 0;
    return {
      kind: "penalty-pressure-ticket",
      takers,
      resolvedPicks,
      hitPicks,
      averagePressure,
    };
  }
  return undefined;
};

const scoreModeArtifact = (artifact: ModeArtifact | undefined, fallbackScore: number | undefined) => {
  if (!artifact) return fallbackScore;
  if (artifact.kind === "agent-calibration") {
    return artifact.samples.length > 0 ? Math.max(0, 100 - artifact.averageCalibrationError) : fallbackScore;
  }
  if (artifact.kind === "parlay-ticket") {
    const chainHits = artifact.chainHitLegs ?? artifact.hitLegs;
    return artifact.settledLegs > 0 ? Math.round((chainHits / artifact.legs.length) * 100) : fallbackScore;
  }
  if (artifact.kind === "upset-ticket") {
    return artifact.resolvedPicks > 0 ? Math.round((artifact.hitPicks / artifact.resolvedPicks) * 100) : fallbackScore;
  }
  if (artifact.kind === "group-table-path") {
    return artifact.resolvedMatches > 0 ? Math.round((artifact.winnerHits / artifact.resolvedMatches) * 100) : fallbackScore;
  }
  if (artifact.kind === "penalty-pressure-ticket") {
    return artifact.resolvedPicks > 0 ? Math.round((artifact.hitPicks / artifact.resolvedPicks) * 100) : fallbackScore;
  }
  if (artifact.kind === "bracket-path") {
    return artifact.resolvedPicks && artifact.resolvedPicks > 0
      ? Math.round(((artifact.hitPicks ?? 0) / artifact.resolvedPicks) * 100)
      : fallbackScore;
  }
  return fallbackScore;
};

const summarizeModeRun = (
  mode: GameMode,
  capsuleCount: number,
  artifact: ModeArtifact | undefined,
  score: number | undefined,
) => {
  if (artifact?.kind === "parlay-ticket") {
    const chain =
      artifact.chainBustedAt !== undefined
        ? ` · chain busted at leg ${artifact.chainBustedAt}`
        : artifact.chainStatus === "complete"
          ? " · chain completed"
          : "";
    return `Parlay chain ticket sealed with ${artifact.legs.length} legs${score !== undefined ? ` · ${artifact.chainHitLegs ?? artifact.hitLegs}/${artifact.legs.length} chain hits` : ""}${chain}.`;
  }
  if (artifact?.kind === "agent-calibration") {
    return `Agent calibration sealed with ${artifact.samples.length} revealed samples · avg error ${artifact.averageCalibrationError}.`;
  }
  if (artifact?.kind === "upset-ticket") {
    return `Upset challenge sealed with ${artifact.picks.length} bold pick${artifact.picks.length === 1 ? "" : "s"} · ${artifact.bonusXp} bonus XP.`;
  }
  if (artifact?.kind === "group-table-path") {
    const topTwo = artifact.topTwo.join(" / ") || "pending";
    const settlement =
      artifact.resolvedMatches > 0 ? ` · ${artifact.winnerHits}/${artifact.resolvedMatches} resolved winner hits` : "";
    return `Group path sealed with ${artifact.picks.length} locks · projected top two ${topTwo}${settlement}.`;
  }
  if (artifact?.kind === "penalty-pressure-ticket") {
    const settlement =
      artifact.resolvedPicks > 0 ? ` · ${artifact.hitPicks}/${artifact.resolvedPicks} pressure picks hit` : "";
    return `Penalty pressure proof sealed with ${artifact.takers.length} clutch pick${artifact.takers.length === 1 ? "" : "s"} · avg pressure ${artifact.averagePressure}${settlement}.`;
  }
  if (artifact?.kind === "bracket-path") {
    const champion = artifact.bracketPath.picks.at(-1)?.winner;
    const settlement =
      artifact.resolvedPicks && artifact.resolvedPicks > 0
        ? ` · ${artifact.hitPicks ?? 0}/${artifact.resolvedPicks} resolved path hits`
        : "";
    return `Bracket path sealed with ${artifact.bracketPath.picks.length} knockout picks${champion ? ` · champion path ends at ${champion}` : ""}${settlement}.`;
  }
  return `${mode.title} sealed with ${capsuleCount} capsule${capsuleCount === 1 ? "" : "s"}.`;
};

export const createGameModeRun = async (
  mode: GameMode,
  records: MemoryRecord[],
): Promise<GameModeRun> => {
  const readiness = getModeReadiness(mode.id, records);
  if (!readiness.ready) throw new Error(readiness.nextAction);
  const scored = readiness.eligibleRecords.filter((record) => record.result);
  const fallbackScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0) / scored.length)
      : undefined;
  const artifact = createModeArtifact(mode.id, readiness.eligibleRecords);
  const score = scoreModeArtifact(artifact, fallbackScore);
  const payload = {
    modeId: mode.id,
    title: mode.title,
    createdAt: new Date().toISOString(),
    capsuleIds: readiness.eligibleRecords.map((record) => record.capsule.id),
    artifact,
    score,
  };
  const payloadHash = await sha256(stableJson(payload));
  return {
    id: `mode-${mode.id}-${payloadHash.slice(0, 10)}`,
    modeId: mode.id,
    title: mode.title,
    createdAt: payload.createdAt,
    capsuleIds: payload.capsuleIds,
    payloadHash,
    filecoinProof: createDemoProof(payloadHash),
    status: score === undefined ? "sealed" : "scored",
    score,
    summary: summarizeModeRun(mode, payload.capsuleIds.length, artifact, score),
    requirements: readiness.requirements,
    artifact,
  };
};
