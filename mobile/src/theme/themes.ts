import { palette } from './tokens';

// Studyhall theme = palette + backward-compat aliases for screens not yet migrated.
// The compat block below keeps old `theme.text`, `theme.border`, etc. working.
// Remove these aliases as each screen is migrated to Studyhall tokens in Step 5.3.

function buildTheme(p: typeof palette.light) {
  return { ...p };
}

export const lightTheme = buildTheme(palette.light);
export const darkTheme  = buildTheme(palette.dark);
export type Theme = typeof lightTheme;
