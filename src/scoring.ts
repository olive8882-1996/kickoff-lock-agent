import type { Match, PredictionCapsule, ResultCapsule, ScoreBreakdown } from "./types";

const predictedWinner = (home: number, away: number, homeTeam: string, awayTeam: string) => {
  if (home === away) return "Draw";
  return home > away ? homeTeam : awayTeam;
};

export const scorePrediction = (
  capsule: PredictionCapsule,
  match: Match,
  actualHome: number,
  actualAway: number,
  actualKeyPlayers: string[],
): ResultCapsule => {
  const prediction = capsule.prediction;
  const actualWinner = predictedWinner(actualHome, actualAway, match.homeTeam, match.awayTeam);
  const expectedWinner = predictedWinner(
    prediction.homeScore,
    prediction.awayScore,
    match.homeTeam,
    match.awayTeam,
  );
  const exactScore = prediction.homeScore === actualHome && prediction.awayScore === actualAway;
  const winnerCorrect = expectedWinner === actualWinner;
  const goalDiffCorrect =
    prediction.homeScore - prediction.awayScore === actualHome - actualAway;
  const keyPlayerHit =
    prediction.keyPlayers.length > 0 &&
    prediction.keyPlayers.some((player) =>
      actualKeyPlayers.some((actual) => actual.toLowerCase().includes(player.toLowerCase())),
    );
  const confidencePenalty = winnerCorrect
    ? Math.min(10, Math.max(3, Math.round(prediction.confidence / 10)))
    : Math.max(0, 10 - Math.round(prediction.confidence / 10));
  const reasoningQuality = prediction.reasoning.trim().length > 70 ? 5 : 3;
  const breakdown: ScoreBreakdown = {
    winner: winnerCorrect ? 30 : 0,
    exactScore: exactScore ? 30 : 0,
    goalDifference: goalDiffCorrect ? 15 : 0,
    keyPlayer: keyPlayerHit ? 10 : 0,
    confidence: confidencePenalty,
    reasoning: reasoningQuality,
  };
  const totalScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const explanation = [
    winnerCorrect
      ? `Winner call was right: ${actualWinner}.`
      : `Winner call missed: predicted ${expectedWinner}, actual ${actualWinner}.`,
    exactScore
      ? "Exact score hit for the full 30-point bonus."
      : `Exact score missed: predicted ${prediction.homeScore}-${prediction.awayScore}, actual ${actualHome}-${actualAway}.`,
    goalDiffCorrect
      ? "Goal difference matched the final result."
      : "Goal difference did not match the final result.",
    keyPlayerHit
      ? "At least one key player callout matched the result notes."
      : "No key player callout was matched in the result notes.",
    winnerCorrect
      ? "Confidence was rewarded because the main call landed."
      : "High confidence is penalized when the main call misses.",
  ];
  return {
    id: `res-${capsule.id}-${Date.now()}`,
    capsuleId: capsule.id,
    revealedAt: new Date().toISOString(),
    homeScore: actualHome,
    awayScore: actualAway,
    keyPlayers: actualKeyPlayers,
    source: match.dataSource,
    totalScore,
    breakdown,
    explanation,
  };
};
