import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
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

  return (
    <ThemeContext.Provider value={{ theme, mode, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
