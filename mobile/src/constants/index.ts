export const COLORS = {
  bronze: '#CD7F32',
  silver: '#6B9FD4',
  gold: '#F59E0B',
  platinum: '#14B8A6',
  diamond: '#A855F7',
};

export const ELO_TIERS = [
  { name: 'Bronze', min: 0, max: 999, color: COLORS.bronze },
  { name: 'Silver', min: 1000, max: 1299, color: COLORS.silver },
  { name: 'Gold', min: 1300, max: 1599, color: COLORS.gold },
  { name: 'Platinum', min: 1600, max: 1899, color: COLORS.platinum },
  { name: 'Diamond', min: 1900, max: Infinity, color: COLORS.diamond },
];

export function getTier(eloRating: number) {
  return ELO_TIERS.find((t) => eloRating >= t.min && eloRating <= t.max) ?? ELO_TIERS[0];
}

export function getTierToNext(eloRating: number): string {
  const tier = getTier(eloRating);
  if (tier.max === Infinity) return 'max rank';
  const next = ELO_TIERS[ELO_TIERS.indexOf(tier) + 1];
  return `${tier.max + 1 - eloRating} to ${next?.name ?? 'next'}`;
}
