import { View, Text, StyleSheet } from 'react-native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation';
import Button from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Play'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function PlayScreen({ navigation }: Props) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.ink }]}>Play</Text>
      <Text style={[styles.sub, { color: theme.ink3 }]}>Choose your game mode</Text>

      <Button
        label="Find Duel"
        onPress={() => navigation.navigate('Matchmaking')}
        style={styles.buttonSpacing}
      />
      <Button
        label="Solo Practice"
        variant="secondary"
        onPress={() => navigation.navigate('PracticeHome')}
        style={styles.buttonSpacing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 100 },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: 16, marginBottom: 48 },
  buttonSpacing: { marginBottom: 12 },
});
