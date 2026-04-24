import { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { setEnabled as setAnalyticsServiceEnabled } from '../services/analytics';

type HapticEvent =
  | 'match_found'
  | 'countdown_tick'
  | 'answer_submit'
  | 'timer_warning'
  | 'game_won'
  | 'game_lost'
  | 'pull_refresh';

interface AppPreferencesContextValue {
  hapticsEnabled: boolean;
  analyticsEnabled: boolean;
  reduceMotionEnabled: boolean;
  setHapticsEnabled: (enabled: boolean) => void;
  setAnalyticsEnabled: (enabled: boolean) => void;
  playHaptic: (event: HapticEvent) => Promise<void>;
}

const HAPTICS_STORE_KEY = 'haptics_enabled';
const ANALYTICS_STORE_KEY = 'analytics_enabled';

const AppPreferencesContext = createContext<AppPreferencesContextValue>({
  hapticsEnabled: true,
  analyticsEnabled: true,
  reduceMotionEnabled: false,
  setHapticsEnabled: () => {},
  setAnalyticsEnabled: () => {},
  playHaptic: async () => {},
});

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(true);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(HAPTICS_STORE_KEY).then((value) => {
      if (value === 'true') setHapticsEnabledState(true);
      if (value === 'false') setHapticsEnabledState(false);
    });
    SecureStore.getItemAsync(ANALYTICS_STORE_KEY).then((value) => {
      if (value === 'true') {
        setAnalyticsEnabledState(true);
        setAnalyticsServiceEnabled(true);
      }
      if (value === 'false') {
        setAnalyticsEnabledState(false);
        setAnalyticsServiceEnabled(false);
      }
    });
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotionEnabled)
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => subscription.remove();
  }, []);

  const setHapticsEnabled = (enabled: boolean) => {
    setHapticsEnabledState(enabled);
    void SecureStore.setItemAsync(HAPTICS_STORE_KEY, String(enabled));
  };

  const setAnalyticsEnabled = (enabled: boolean) => {
    setAnalyticsEnabledState(enabled);
    setAnalyticsServiceEnabled(enabled);
    void SecureStore.setItemAsync(ANALYTICS_STORE_KEY, String(enabled));
  };

  const playHaptic = async (event: HapticEvent) => {
    if (!hapticsEnabled) return;

    try {
      switch (event) {
        case 'match_found':
        case 'game_won':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        case 'timer_warning':
        case 'game_lost':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return;
        case 'countdown_tick':
        case 'answer_submit':
        case 'pull_refresh':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Haptics should never break the main flow.
    }
  };

  return (
    <AppPreferencesContext.Provider
      value={{
        hapticsEnabled,
        analyticsEnabled,
        reduceMotionEnabled,
        setHapticsEnabled,
        setAnalyticsEnabled,
        playHaptic,
      }}
    >
      {children}
    </AppPreferencesContext.Provider>
  );
}

export function useAppPreferences() {
  return useContext(AppPreferencesContext);
}
