// Raw design tokens — never reference these directly in components.
// Use the theme object from useTheme() instead.

export const palette = {
  // Tier colors (keep in sync with server RankTier enum)
  bronze:   '#CD7F32',
  silver:   '#6B9FD4',
  gold:     '#F59E0B',
  platinum: '#14B8A6',
  diamond:  '#A855F7',

  // Semantic
  success:  '#16a34a',
  successBg: '#f0fdf4',
  successBorder: '#bbf7d0',
  successText: '#15803d',
  danger:   '#dc2626',
  dangerBg: '#fee2e2',
  dangerBorder: '#fecaca',
  dangerText: '#b91c1c',
  warning:  '#f59e0b',
  warningBg: '#fef9c3',
  warningBorder: '#fde047',
  warningText: '#854d0e',

  // Neutrals
  white:      '#ffffff',
  black:      '#000000',
  neutral50:  '#f9fafb',
  neutral100: '#f3f4f6',
  neutral200: '#e5e7eb',
  neutral300: '#d1d5db',
  neutral400: '#9ca3af',
  neutral500: '#6b7280',
  neutral600: '#4b5563',
  neutral700: '#374151',
  neutral800: '#1f2937',
  neutral900: '#111827',

  // Dark mode surface layers
  dark900: '#0f172a',
  dark800: '#1e293b',
  dark700: '#334155',
  dark600: '#475569',
};

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
};

export const radii = {
  sm:   6,
  md:   10,
  lg:   16,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};
