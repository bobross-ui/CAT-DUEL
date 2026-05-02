import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  SourceSerif4_500Medium,
  SourceSerif4_600SemiBold,
  SourceSerif4_500Medium_Italic,
} from '@expo-google-fonts/source-serif-4';
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider } from './src/context/AuthContext';
import { AppPreferencesProvider } from './src/context/AppPreferencesContext';
import { ThemeProvider } from './src/theme/ThemeProvider';
import RootNavigator, { type RootStackParamList } from './src/navigation';
import { linking } from './src/navigation/linking';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import ThemedToast from './src/components/ThemedToast';
import { init as initAnalytics } from './src/services/analytics';
import { queryClient } from './src/queries/client';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [navigationReady, setNavigationReady] = useState(false);
  const [fontsLoaded] = useFonts({
    'SourceSerif-Medium':       SourceSerif4_500Medium,
    'SourceSerif-SemiBold':     SourceSerif4_600SemiBold,
    'SourceSerif-MediumItalic': SourceSerif4_500Medium_Italic,
    'Geist-Regular':            Geist_400Regular,
    'Geist-Medium':             Geist_500Medium,
    'Geist-SemiBold':           Geist_600SemiBold,
    'Geist-Bold':               Geist_700Bold,
    'JetBrainsMono-Medium':     JetBrainsMono_500Medium,
    'JetBrainsMono-SemiBold':   JetBrainsMono_600SemiBold,
  });

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  const showReactQueryDevtools = __DEV__ && Platform.OS === 'web';

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppPreferencesProvider>
              <ThemeProvider>
                <NavigationContainer
                  ref={navigationRef}
                  linking={linking}
                  documentTitle={{ enabled: false }}
                  onReady={() => setNavigationReady(true)}
                >
                  <RootNavigator navigationRef={navigationRef} navigationReady={navigationReady} />
                </NavigationContainer>
                <ThemedToast />
              </ThemeProvider>
            </AppPreferencesProvider>
          </AuthProvider>
          {showReactQueryDevtools ? <ReactQueryDevtools /> : null}
        </QueryClientProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
