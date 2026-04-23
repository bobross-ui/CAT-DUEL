import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
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
import RootNavigator from './src/navigation';
import ThemedToast from './src/components/ThemedToast';

SplashScreen.preventAutoHideAsync();

export default function App() {
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
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppPreferencesProvider>
          <ThemeProvider>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
            <ThemedToast />
          </ThemeProvider>
        </AppPreferencesProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
