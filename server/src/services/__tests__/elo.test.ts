import {
  calculateElo,
  calculateMatchElo,
  getRankTier,
  ELO_CONSTANTS,
} from '../elo';

describe('calculateElo', () => {
  describe('equal-rated match (1200 vs 1200)', () => {
    it('winner gains ~16 (K/2), loser loses ~16', () => {
      const win = calculateElo({ playerElo: 1200, opponentElo: 1200, playerGamesPlayed: 5, actualScore: 1 });
      const loss = calculateElo({ playerElo: 1200, opponentElo: 1200, playerGamesPlayed: 5, actualScore: 0 });
      expect(win.delta).toBe(16);
      expect(loss.delta).toBe(-16);
    });

    it('draw results in 0 change', () => {
      const draw = calculateElo({ playerElo: 1200, opponentElo: 1200, playerGamesPlayed: 5, actualScore: 0.5 });
      expect(draw.delta).toBe(0);
    });
  });

  describe('upset win (1000 beats 1500)', () => {
    it('winner gains close to full K (32)', () => {
      const result = calculateElo({ playerElo: 1000, opponentElo: 1500, playerGamesPlayed: 5, actualScore: 1 });
      expect(result.delta).toBeGreaterThan(28);
      expect(result.delta).toBeLessThanOrEqual(32);
    });
  });

  describe('heavy favorite wins (1500 beats 1000)', () => {
    it('winner gains very little (1–3)', () => {
      const result = calculateElo({ playerElo: 1500, opponentElo: 1000, playerGamesPlayed: 5, actualScore: 1 });
      expect(result.delta).toBeGreaterThanOrEqual(1);
      expect(result.delta).toBeLessThan(4);
    });
  });

  describe('draw with rating gap', () => {
    it('lower-rated player gains Elo, higher-rated loses', () => {
      const lower = calculateElo({ playerElo: 1000, opponentElo: 1400, playerGamesPlayed: 5, actualScore: 0.5 });
      const higher = calculateElo({ playerElo: 1400, opponentElo: 1000, playerGamesPlayed: 5, actualScore: 0.5 });
      expect(lower.delta).toBeGreaterThan(0);
      expect(higher.delta).toBeLessThan(0);
    });
  });

  describe('K-factor switch', () => {
    it('player with 29 games uses K=32', () => {
      const result = calculateElo({ playerElo: 1200, opponentElo: 1200, playerGamesPlayed: 29, actualScore: 1 });
      expect(result.kFactor).toBe(32);
      expect(result.delta).toBe(16);
    });

    it('player with 30 games uses K=16', () => {
      const result = calculateElo({ playerElo: 1200, opponentElo: 1200, playerGamesPlayed: 30, actualScore: 1 });
      expect(result.kFactor).toBe(16);
      expect(result.delta).toBe(8);
    });

    it('delta magnitude is ~2x larger with K=32 vs K=16 at equal ratings', () => {
      const newP = calculateElo({ playerElo: 1200, opponentElo: 1200, playerGamesPlayed: 5, actualScore: 1 });
      const estP = calculateElo({ playerElo: 1200, opponentElo: 1200, playerGamesPlayed: 50, actualScore: 1 });
      expect(newP.delta).toBe(estP.delta * 2);
    });
  });

  describe('Elo floor', () => {
    it('player at 100 Elo loses badly — new rating stays at 100', () => {
      const result = calculateElo({ playerElo: 100, opponentElo: 2500, playerGamesPlayed: 5, actualScore: 0 });
      expect(result.newRating).toBe(100);
      expect(result.delta).toBe(0);
    });

    it('never produces a rating below MIN_ELO', () => {
      const result = calculateElo({ playerElo: 105, opponentElo: 2500, playerGamesPlayed: 5, actualScore: 0 });
      expect(result.newRating).toBeGreaterThanOrEqual(ELO_CONSTANTS.MIN_ELO);
    });
  });
});

describe('calculateMatchElo', () => {
  const p = (elo: number, gamesPlayed: number) => ({ elo, gamesPlayed });

  describe('symmetry', () => {
    it('if P1 beats P2 at same K, p1.delta === -p2.delta', () => {
      const result = calculateMatchElo({
        player1: p(1200, 5),
        player2: p(1200, 5),
        player1Score: 10,
        player2Score: 7,
      });
      expect(result.player1.delta).toBe(-result.player2.delta);
      expect(result.outcome).toBe('player1_win');
    });
  });

  describe('verification example from spec', () => {
    it('1200 vs 1200, new players (K=32): winner +16, loser -16', () => {
      const result = calculateMatchElo({
        player1: p(1200, 5),
        player2: p(1200, 5),
        player1Score: 10,
        player2Score: 7,
      });
      expect(result.player1.delta).toBe(16);
      expect(result.player2.delta).toBe(-16);
    });

    it('1200 vs 1200, established players (K=16): winner +8, loser -8', () => {
      const result = calculateMatchElo({
        player1: p(1200, 50),
        player2: p(1200, 50),
        player1Score: 10,
        player2Score: 7,
      });
      expect(result.player1.delta).toBe(8);
      expect(result.player2.delta).toBe(-8);
    });
  });

  describe('draw', () => {
    it('equal score at same rating → both get 0 change', () => {
      const result = calculateMatchElo({
        player1: p(1200, 5),
        player2: p(1200, 5),
        player1Score: 8,
        player2Score: 8,
      });
      expect(result.player1.delta).toBe(0);
      expect(result.player2.delta).toBe(0);
      expect(result.outcome).toBe('draw');
    });
  });

  describe('outcome detection', () => {
    it('p2 wins when p2Score > p1Score', () => {
      const result = calculateMatchElo({
        player1: p(1200, 5),
        player2: p(1200, 5),
        player1Score: 5,
        player2Score: 10,
      });
      expect(result.outcome).toBe('player2_win');
      expect(result.player2.delta).toBeGreaterThan(0);
      expect(result.player1.delta).toBeLessThan(0);
    });
  });
});

describe('getRankTier', () => {
  it('< 1000 → BRONZE', () => {
    expect(getRankTier(0)).toBe('BRONZE');
    expect(getRankTier(999)).toBe('BRONZE');
  });

  it('1000 → SILVER', () => {
    expect(getRankTier(1000)).toBe('SILVER');
    expect(getRankTier(1299)).toBe('SILVER');
  });

  it('1300 → GOLD', () => {
    expect(getRankTier(1300)).toBe('GOLD');
    expect(getRankTier(1599)).toBe('GOLD');
  });

  it('1600 → PLATINUM', () => {
    expect(getRankTier(1600)).toBe('PLATINUM');
    expect(getRankTier(1899)).toBe('PLATINUM');
  });

  it('1900+ → DIAMOND', () => {
    expect(getRankTier(1900)).toBe('DIAMOND');
    expect(getRankTier(9999)).toBe('DIAMOND');
  });

  it('exact tier boundaries', () => {
    expect(getRankTier(999)).toBe('BRONZE');
    expect(getRankTier(1000)).toBe('SILVER');
    expect(getRankTier(1299)).toBe('SILVER');
    expect(getRankTier(1300)).toBe('GOLD');
    expect(getRankTier(1599)).toBe('GOLD');
    expect(getRankTier(1600)).toBe('PLATINUM');
    expect(getRankTier(1899)).toBe('PLATINUM');
    expect(getRankTier(1900)).toBe('DIAMOND');
  });
});
