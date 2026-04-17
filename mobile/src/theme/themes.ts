import { palette, tierColors } from './tokens';

// Studyhall theme = palette + backward-compat aliases for screens not yet migrated.
// The compat block below keeps old `theme.text`, `theme.border`, etc. working.
// Remove these aliases as each screen is migrated to Studyhall tokens in Step 5.3.

function buildTheme(p: typeof palette.light) {
  return {
    ...p,
    // ── Compat aliases (old → new) ──────────────────────────
    // Backgrounds
    surface:          p.bg2,
    surfaceHighlight: p.bg2,
    // Borders
    border:           p.line,
    borderLight:      p.line2,
    // Text
    text:             p.ink,
    textSecondary:    p.ink2,
    textMuted:        p.ink3,
    // Primary action
    primary:          p.ink,
    primaryFg:        p.bg,
    // Semantic
    success:          p.accent,
    successBg:        p.accentSoft,
    successBorder:    p.accent,
    successText:      p.accentDeep,
    danger:           p.coral,
    dangerBg:         p.coralSoft,
    dangerBorder:     p.coral,
    dangerText:       p.coral,
    warning:          p.amber,
    warningBg:        p.amber,
    warningBorder:    p.amber,
    warningText:      p.amber,
    // Tier colors
    bronze:           tierColors.BRONZE,
    silver:           tierColors.SILVER,
    gold:             tierColors.GOLD,
    platinum:         tierColors.PLATINUM,
    diamond:          tierColors.DIAMOND,
  };
}

export const lightTheme = buildTheme(palette.light);
export const darkTheme  = buildTheme(palette.dark);
export type Theme = typeof lightTheme;
