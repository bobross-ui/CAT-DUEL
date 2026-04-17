import { palette } from './tokens';

export interface Theme {
  // Backgrounds
  bg: string;
  surface: string;           // cards, modals, input backgrounds
  surfaceHighlight: string;  // selected/hover surface
  // Borders & dividers
  border: string;
  borderLight: string;       // subtle dividers (list rows)
  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  // Primary action (buttons, tabs)
  primary: string;           // button/tab background
  primaryFg: string;         // text on primary background
  // Semantic (same across modes, but adjusted for visibility)
  success: string;
  successBg: string;
  successBorder: string;
  successText: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  dangerText: string;
  warning: string;
  warningBg: string;
  warningBorder: string;
  warningText: string;
  // Tier colors
  bronze: string;
  silver: string;
  gold: string;
  platinum: string;
  diamond: string;
}

export const lightTheme: Theme = {
  bg:               palette.white,
  surface:          palette.neutral50,
  surfaceHighlight: palette.neutral100,
  border:           palette.neutral200,
  borderLight:      palette.neutral100,
  text:             palette.neutral900,
  textSecondary:    palette.neutral500,
  textMuted:        palette.neutral400,
  primary:          palette.neutral900,
  primaryFg:        palette.white,
  success:          palette.success,
  successBg:        palette.successBg,
  successBorder:    palette.successBorder,
  successText:      palette.successText,
  danger:           palette.danger,
  dangerBg:         palette.dangerBg,
  dangerBorder:     palette.dangerBorder,
  dangerText:       palette.dangerText,
  warning:          palette.warning,
  warningBg:        palette.warningBg,
  warningBorder:    palette.warningBorder,
  warningText:      palette.warningText,
  bronze:           palette.bronze,
  silver:           palette.silver,
  gold:             palette.gold,
  platinum:         palette.platinum,
  diamond:          palette.diamond,
};

export const darkTheme: Theme = {
  bg:               palette.dark900,
  surface:          palette.dark800,
  surfaceHighlight: palette.dark700,
  border:           palette.dark700,
  borderLight:      palette.dark800,
  text:             '#f1f5f9',
  textSecondary:    '#94a3b8',
  textMuted:        '#64748b',
  primary:          '#f1f5f9',   // near-white: inverted from light
  primaryFg:        palette.dark900,
  success:          '#22c55e',
  successBg:        '#052e16',
  successBorder:    '#166534',
  successText:      '#4ade80',
  danger:           '#f87171',
  dangerBg:         '#450a0a',
  dangerBorder:     '#991b1b',
  dangerText:       '#fca5a5',
  warning:          '#fbbf24',
  warningBg:        '#451a03',
  warningBorder:    '#92400e',
  warningText:      '#fcd34d',
  bronze:           palette.bronze,
  silver:           palette.silver,
  gold:             palette.gold,
  platinum:         palette.platinum,
  diamond:          palette.diamond,
};
