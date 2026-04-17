import { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Theme, lightTheme, darkTheme } from './themes';

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
    SecureStore.getItemAsync(STORE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    });
  }, []);

  const setPreference = (p: Preference) => {
    setPref(p);
    SecureStore.setItemAsync(STORE_KEY, p);
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
