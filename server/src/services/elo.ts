export const ELO_CONSTANTS = {
  K_FACTOR_NEW: 32,
  K_FACTOR_ESTABLISHED: 16,
  NEW_PLAYER_GAMES: 30,
  DIVISOR: 400,
  MIN_ELO: 100,
};

export interface EloInput {
  playerElo: number;
  opponentElo: number;
  playerGamesPlayed: number;
  actualScore: 0 | 0.5 | 1;
}

export interface EloResult {
  newRating: number;
  delta: number;
  expectedScore: number;
  kFactor: number;
}

export function calculateElo(input: EloInput): EloResult {
  const { playerElo, opponentElo, playerGamesPlayed, actualScore } = input;

  const kFactor =
    playerGamesPlayed < ELO_CONSTANTS.NEW_PLAYER_GAMES
      ? ELO_CONSTANTS.K_FACTOR_NEW
      : ELO_CONSTANTS.K_FACTOR_ESTABLISHED;

  const expectedScore =
    1 / (1 + Math.pow(10, (opponentElo - playerElo) / ELO_CONSTANTS.DIVISOR));
  const rawDelta = kFactor * (actualScore - expectedScore);
  const delta = Math.round(rawDelta);
  const newRating = Math.max(ELO_CONSTANTS.MIN_ELO, playerElo + delta);
  const actualDelta = newRating - playerElo;

  return { newRating, delta: actualDelta, expectedScore, kFactor };
}

export interface MatchEloInput {
  player1: { elo: number; gamesPlayed: number };
  player2: { elo: number; gamesPlayed: number };
  player1Score: number;
  player2Score: number;
  isForfeit?: boolean;
  forfeitedBy?: string;
}

export interface MatchEloResult {
  player1: EloResult;
  player2: EloResult;
  outcome: 'player1_win' | 'player2_win' | 'draw';
}

export function calculateMatchElo(input: MatchEloInput): MatchEloResult {
  let p1Actual: 0 | 0.5 | 1;
  let p2Actual: 0 | 0.5 | 1;
  let outcome: MatchEloResult['outcome'];

  if (input.player1Score > input.player2Score) {
    p1Actual = 1;
    p2Actual = 0;
    outcome = 'player1_win';
  } else if (input.player2Score > input.player1Score) {
    p1Actual = 0;
    p2Actual = 1;
    outcome = 'player2_win';
  } else {
    p1Actual = 0.5;
    p2Actual = 0.5;
    outcome = 'draw';
  }

  return {
    player1: calculateElo({
      playerElo: input.player1.elo,
      opponentElo: input.player2.elo,
      playerGamesPlayed: input.player1.gamesPlayed,
      actualScore: p1Actual,
    }),
    player2: calculateElo({
      playerElo: input.player2.elo,
      opponentElo: input.player1.elo,
      playerGamesPlayed: input.player2.gamesPlayed,
      actualScore: p2Actual,
    }),
    outcome,
  };
}

export type RankTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

export function getRankTier(elo: number): RankTier {
  if (elo >= 1900) return 'DIAMOND';
  if (elo >= 1600) return 'PLATINUM';
  if (elo >= 1300) return 'GOLD';
  if (elo >= 1000) return 'SILVER';
  return 'BRONZE';
}
