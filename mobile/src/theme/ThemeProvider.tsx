import { createContext, useContext, useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { Theme, lightTheme, darkTheme } from './themes';
import { getStoredValue, setStoredValue } from '../services/storage';

type Preference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  mode: 'light' | 'dark';
  preference: Preference;
  setPreference: (p: Preference) => void;
}

const STORE_KEY = 'theme_pref';

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: 'light',
  preference: 'system',
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<Preference>('system');

  useEffect(() => {
    getStoredValue(STORE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    });
  }, []);

  const setPreference = (p: Preference) => {
    setPref(p);
    void setStoredValue(STORE_KEY, p);
  };

  const mode = preference === 'system' ? (system ?? 'light') : preference;
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const thumb = mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(28,27,26,0.22)';
    const css = `
      * { scrollbar-width: thin; scrollbar-color: ${thumb} transparent; }
      *::-webkit-scrollbar { width: 6px; height: 6px; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-thumb { background: ${thumb}; border-radius: 3px; }
    `;
    const el = document.getElementById('cat-duel-scrollbar') ?? (() => {
      const s = document.createElement('style');
      s.id = 'cat-duel-scrollbar';
      document.head.appendChild(s);
      return s;
    })();
    el.textContent = css;
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ theme, mode, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
