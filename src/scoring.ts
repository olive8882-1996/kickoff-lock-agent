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
  const markets = prediction.markets ?? [];
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
  const totalGoals = actualHome + actualAway;
  const bothScore = actualHome > 0 && actualAway > 0 ? "Yes" : "No";
  const marketHits = markets.filter((market) => {
    if (market.id === "winner") return market.pick === actualWinner;
    if (market.id === "total-goals") {
      const threshold = Number(market.pick.replace(/[^\d.]/g, ""));
      return market.pick.toLowerCase().startsWith("over") ? totalGoals > threshold : totalGoals < threshold;
    }
    if (market.id === "both-score") return market.pick === bothScore;
    if (market.id === "first-goal") return actualKeyPlayers.some((actual) => actual.toLowerCase().includes(market.pick.toLowerCase()));
    return false;
  }).length;
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
    winner: winnerCorrect ? 24 : 0,
    exactScore: exactScore ? 24 : 0,
    goalDifference: goalDiffCorrect ? 12 : 0,
    markets: Math.round((marketHits / Math.max(1, markets.length)) * 15),
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
    `${marketHits}/${markets.length} market calls landed.`,
    winnerCorrect
      ? "Confidence was rewarded because the main call landed."
      : "High confidence is penalized when the main call misses.",
  ];
  const agentReview = [
    exactScore
      ? "Agent review: scoreline model was well calibrated; keep the current market weighting."
      : "Agent review: scoreline missed, so future locks should separate result confidence from exact-score confidence.",
    marketHits >= Math.ceil(markets.length / 2)
      ? "Market layer added useful signal beyond the headline score."
      : "Market layer underperformed; review totals and first-goal assumptions before the next lock.",
    keyPlayerHit
      ? "Player/signal notes were actionable and should be promoted in the next pre-match brief."
      : "Player/signal notes were too broad or absent from result evidence; tighten them next time.",
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
    agentReview,
  };
};
