import { createDemoProof, sha256, stableJson } from "./proof";
import type { BracketPath, BracketPick, GameModeRun, Match } from "./types";

const MAX_PATH_PICKS = 4;

export const createEmptyBracketPath = (): BracketPath => {
  const now = new Date().toISOString();
  return {
    id: `bracket-${crypto.randomUUID()}`,
    title: "My knockout path",
    createdAt: now,
    updatedAt: now,
    picks: [],
  };
};

export const buildBracketPathFromMatches = (
  matches: Match[],
  previous?: BracketPath,
): BracketPath => {
  const previousByMatch = new Map(previous?.picks.map((pick) => [pick.matchId, pick]) ?? []);
  const candidates = matches
    .filter((match) => match.status !== "finished")
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())
    .slice(0, MAX_PATH_PICKS);
  const picks: BracketPick[] = candidates.map((match, index) => {
    const existing = previousByMatch.get(match.id);
    return {
      id: existing?.id ?? `path-${match.id}`,
      matchId: match.id,
      matchLabel: `${match.homeTeam} vs ${match.awayTeam}`,
      stage: match.stage,
      winner: existing?.winner ?? (index % 2 === 0 ? match.homeTeam : match.awayTeam),
      confidence: existing?.confidence ?? 62,
      note: existing?.note ?? `Path read: ${match.stage} winner advances into the next lock window.`,
    };
  });
  const now = new Date().toISOString();
  return {
    ...(previous ?? createEmptyBracketPath()),
    updatedAt: now,
    picks,
  };
};

export const isBracketPathReady = (path: BracketPath) =>
  path.picks.length >= MAX_PATH_PICKS &&
  path.picks.every((pick) => pick.winner.trim().length > 0 && pick.confidence >= 1);

export const createBracketModeRun = async (path: BracketPath): Promise<GameModeRun> => {
  if (!isBracketPathReady(path)) {
    throw new Error("Complete 4 knockout path picks before sealing the bracket proof.");
  }
  const sealedAt = new Date().toISOString();
  const payload = {
    kind: "bracket-path",
    title: path.title,
    picks: path.picks.map((pick) => ({
      matchId: pick.matchId,
      matchLabel: pick.matchLabel,
      stage: pick.stage,
      winner: pick.winner,
      confidence: pick.confidence,
      note: pick.note,
    })),
    sealedAt,
  };
  const payloadHash = await sha256(stableJson(payload));
  const filecoinProof = createDemoProof(payloadHash);
  const sealedPath: BracketPath = {
    ...path,
    updatedAt: sealedAt,
    payloadHash,
    filecoinProof,
  };
  return {
    id: `mode-bracket-${payloadHash.slice(0, 10)}`,
    modeId: "bracket",
    title: "Bracket path",
    createdAt: sealedAt,
    capsuleIds: path.picks.map((pick) => pick.matchId),
    payloadHash,
    filecoinProof,
    status: "sealed",
    summary: `Bracket path sealed with ${path.picks.length} knockout picks.`,
    requirements: ["4 knockout path picks", "Winner, confidence and rationale on every pick"],
    artifact: {
      kind: "bracket-path",
      bracketPath: sealedPath,
      settlements: [],
      resolvedPicks: 0,
      hitPicks: 0,
    },
  };
};

const actualWinnerFor = (match: Match) => {
  if (match.status !== "finished") return undefined;
  if (match.homeScore === undefined || match.awayScore === undefined) return undefined;
  if (match.homeScore > match.awayScore) return match.homeTeam;
  if (match.awayScore > match.homeScore) return match.awayTeam;
  return undefined;
};

export const settleBracketModeRun = (run: GameModeRun, matches: Match[]): GameModeRun => {
  if (run.artifact?.kind !== "bracket-path") {
    throw new Error("Only bracket path mode runs can be settled by knockout path results.");
  }
  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const settlements = run.artifact.bracketPath.picks.map((pick) => {
    const match = matchesById.get(pick.matchId);
    const actualWinner = match ? actualWinnerFor(match) : undefined;
    return {
      capsuleId: pick.matchId,
      matchLabel: pick.matchLabel,
      stage: pick.stage,
      predictedWinner: pick.winner,
      confidence: pick.confidence,
      resultScore: actualWinner ? (actualWinner === pick.winner ? 100 : 0) : undefined,
      winnerHit: actualWinner ? actualWinner === pick.winner : undefined,
    };
  });
  const resolvedPicks = settlements.filter((settlement) => settlement.resultScore !== undefined).length;
  const hitPicks = settlements.filter((settlement) => settlement.winnerHit).length;
  const score = resolvedPicks > 0 ? Math.round((hitPicks / resolvedPicks) * 100) : run.score;
  return {
    ...run,
    status: score === undefined ? "sealed" : "scored",
    score,
    summary:
      resolvedPicks > 0
        ? `Bracket path settled with ${hitPicks}/${resolvedPicks} resolved knockout hits.`
        : "Bracket path sealed; no finished knockout matches available for settlement yet.",
    artifact: {
      ...run.artifact,
      settlements,
      resolvedPicks,
      hitPicks,
    },
  };
};
