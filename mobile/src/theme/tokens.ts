// Studyhall design tokens — use via useTheme() in components.

export const palette = {
  light: {
    bg:         '#FAF7F2',
    bg2:        '#F2EEE5',
    card:       '#FFFFFF',
    ink:        '#1C1B1A',
    ink2:       '#4A4845',
    ink3:       '#8A877F',
    ink4:       '#BFBBB0',
    line:       'rgba(28,27,26,0.09)',
    line2:      'rgba(28,27,26,0.05)',
    accent:     '#3F7D5C',
    accentSoft: '#E8F0EB',
    accentDeep: '#2E5D44',
    coral:      '#C85A4A',
    coralSoft:  '#F7E6E2',
    amber:      '#C98A2B',
  },
  dark: {
    bg:         '#141312',
    bg2:        '#1A1917',
    card:       '#1E1D1B',
    ink:        '#F2EFE9',
    ink2:       '#BFBCB5',
    ink3:       '#7A7870',
    ink4:       '#4A4845',
    line:       'rgba(255,255,255,0.08)',
    line2:      'rgba(255,255,255,0.04)',
    accent:     '#6FB58D',
    accentSoft: 'rgba(111,181,141,0.15)',
    accentDeep: '#9ECFB5',
    coral:      '#E8826F',
    coralSoft:  'rgba(232,130,111,0.15)',
    amber:      '#D9A04C',
  },
};

export const tierColors = {
  BRONZE:   '#8C5A3C',
  SILVER:   '#8A877F',
  GOLD:     '#C98A2B',
  PLATINUM: '#3F7D5C',
  DIAMOND:  '#6D4C9E',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, huge: 32 };
export const radii   = { sm: 8, md: 10, lg: 14, xl: 16, xxl: 20, pill: 999 };

export const type = {
  // Display — Source Serif 4
  display:    { family: 'SourceSerif-SemiBold',     size: 40, lineHeight: 40, letterSpacing: -1.2 },
  verdict:    { family: 'SourceSerif-Medium',        size: 30, lineHeight: 30, letterSpacing: -0.6 },
  heroSerif:  { family: 'SourceSerif-Medium',        size: 26, lineHeight: 30, letterSpacing: -0.5 },
  h1Serif:    { family: 'SourceSerif-Medium',        size: 22, lineHeight: 28, letterSpacing: -0.2 },
  questionLg: { family: 'SourceSerif-Medium',        size: 19, lineHeight: 27, letterSpacing: -0.1 },
  scoreLg:    { family: 'SourceSerif-SemiBold',      size: 22, lineHeight: 22, letterSpacing: -0.4 },
  statVal:    { family: 'SourceSerif-SemiBold',      size: 20, lineHeight: 24, letterSpacing: -0.2 },
  italic:     { family: 'SourceSerif-MediumItalic',  size: 18, lineHeight: 22 },

  // UI — Geist
  body:       { family: 'Geist-Regular',             size: 15, lineHeight: 22 },
  bodyMed:    { family: 'Geist-Medium',              size: 15, lineHeight: 22 },
  label:      { family: 'Geist-Medium',              size: 13, lineHeight: 18 },
  small:      { family: 'Geist-Regular',             size: 12, lineHeight: 16 },

  // Numbers + micro-labels — JetBrains Mono
  mono:       { family: 'JetBrainsMono-Medium',      size: 13, lineHeight: 16 },
  timer:      { family: 'JetBrainsMono-Medium',      size: 13, lineHeight: 16 },
  deltaLg:    { family: 'JetBrainsMono-SemiBold',    size: 26, lineHeight: 26 },
  chipLabel:  { family: 'JetBrainsMono-Medium',      size: 10, lineHeight: 14, letterSpacing: 1.2 },
  statusBar:  { family: 'JetBrainsMono-SemiBold',    size: 11, lineHeight: 14 },
  eyebrow:    { family: 'JetBrainsMono-Medium',      size: 10, lineHeight: 14, letterSpacing: 1.4 },
};
