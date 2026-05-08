import { isAnswerLate } from '../gameSession';

describe('isAnswerLate', () => {
  it('returns false when startedAt is null', () => {
    expect(isAnswerLate(null, 600)).toBe(false);
  });

  it('returns false while game clock is still running', () => {
    const startedAt = Date.now() - 100_000; // 100s elapsed out of 600s
    expect(isAnswerLate(startedAt, 600)).toBe(false);
  });

  it('returns true after the full game duration has elapsed', () => {
    const startedAt = Date.now() - 700_000; // 700s elapsed, game was 600s
    expect(isAnswerLate(startedAt, 600)).toBe(true);
  });

  it('accepts an explicit now timestamp for deterministic testing', () => {
    const startedAt = 1_000;
    expect(isAnswerLate(startedAt, 600, 601_000)).toBe(false); // exactly at boundary
    expect(isAnswerLate(startedAt, 600, 601_001)).toBe(true);  // one ms over
  });
});
