import type { GameFinishedPayload, OpponentInfo } from '../navigation';
import type { MatchDetailData } from '../queries/games';

function playerResult(
  player: MatchDetailData['player1'],
  score: number,
  questionsAnswered: number,
  eloDelta: number,
) {
  return {
    userId: player.id,
    score,
    questionsAnswered,
    eloBefore: player.eloRating - eloDelta,
    eloAfter: player.eloRating,
    eloDelta,
    newTier: player.rankTier,
    tierChanged: false,
  };
}

export function buildResultsFromMatchDetail(
  match: MatchDetailData,
  currentUserId: string,
): { results: GameFinishedPayload; opponent: OpponentInfo } {
  const isPlayer1 = match.player1Id === currentUserId;
  const opponent = isPlayer1 ? match.player2 : match.player1;

  return {
    opponent: {
      userId: opponent.id,
      displayName: opponent.displayName,
      avatarUrl: opponent.avatarUrl,
      eloRating: opponent.eloRating,
    },
    results: {
      gameId: match.id,
      winnerId: match.winnerId,
      isDraw: match.isDraw,
      isForfeit: match.status === 'forfeited',
      currentUserId,
      player1: playerResult(
        match.player1,
        match.player1Score,
        match.player1Answered,
        match.player1EloChange,
      ),
      player2: playerResult(
        match.player2,
        match.player2Score,
        match.player2Answered,
        match.player2EloChange,
      ),
      totalQuestions: match.totalQuestions,
      durationSeconds: match.durationSeconds,
      answers: match.answers,
    },
  };
}
