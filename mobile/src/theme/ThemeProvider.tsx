import { createContext, useContext, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Theme, lightTheme, darkTheme } from './themes';

interface ThemeContextValue {
  theme: Theme;
  mode: 'light' | 'dark';
  setOverride: (mode: 'light' | 'dark' | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: 'light',
  setOverride: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [override, setOverride] = useState<'light' | 'dark' | null>(null);
  const mode = override ?? systemScheme ?? 'light';
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, mode, setOverride }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
