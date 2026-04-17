import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/theme/ThemeProvider';
import RootNavigator from './src/navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
