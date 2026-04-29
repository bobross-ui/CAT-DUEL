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

function getKFactor(gamesPlayed: number): number {
  return gamesPlayed < ELO_CONSTANTS.NEW_PLAYER_GAMES
    ? ELO_CONSTANTS.K_FACTOR_NEW
    : ELO_CONSTANTS.K_FACTOR_ESTABLISHED;
}

function getExpectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / ELO_CONSTANTS.DIVISOR));
}

function normalizeDelta(delta: number): number {
  return delta === 0 ? 0 : delta;
}

export function calculateElo(input: EloInput): EloResult {
  const { playerElo, opponentElo, playerGamesPlayed, actualScore } = input;

  const kFactor = getKFactor(playerGamesPlayed);
  const expectedScore = getExpectedScore(playerElo, opponentElo);
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
  let outcome: MatchEloResult['outcome'];

  if (input.player1Score > input.player2Score) {
    p1Actual = 1;
    outcome = 'player1_win';
  } else if (input.player2Score > input.player1Score) {
    p1Actual = 0;
    outcome = 'player2_win';
  } else {
    p1Actual = 0.5;
    outcome = 'draw';
  }

  const p1Expected = getExpectedScore(input.player1.elo, input.player2.elo);
  const p2Expected = 1 - p1Expected;
  const matchKFactor = Math.max(
    getKFactor(input.player1.gamesPlayed),
    getKFactor(input.player2.gamesPlayed),
  );

  let p1Delta = Math.round(matchKFactor * (p1Actual - p1Expected));
  let p2Delta = -p1Delta;

  if (input.player1.elo + p1Delta < ELO_CONSTANTS.MIN_ELO) {
    p1Delta = ELO_CONSTANTS.MIN_ELO - input.player1.elo;
    p2Delta = -p1Delta;
  }
  if (input.player2.elo + p2Delta < ELO_CONSTANTS.MIN_ELO) {
    p2Delta = ELO_CONSTANTS.MIN_ELO - input.player2.elo;
    p1Delta = -p2Delta;
  }
  p1Delta = normalizeDelta(p1Delta);
  p2Delta = normalizeDelta(p2Delta);

  return {
    player1: {
      newRating: input.player1.elo + p1Delta,
      delta: p1Delta,
      expectedScore: p1Expected,
      kFactor: matchKFactor,
    },
    player2: {
      newRating: input.player2.elo + p2Delta,
      delta: p2Delta,
      expectedScore: p2Expected,
      kFactor: matchKFactor,
    },
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
