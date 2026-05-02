import { StyleSheet } from 'react-native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation';
import Button from '../components/Button';
import ScreenTransitionView from '../components/ScreenTransitionView';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import { useGamesActive } from '../queries/games';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Play'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function PlayScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const activeGameQuery = useGamesActive({ enabled: false });

  const handleFindDuel = async () => {
    const activeGame = await activeGameQuery.refetch().then((result) => result.data).catch(() => null);
    if (activeGame?.gameId && activeGame.opponent && activeGame.initialState) {
      navigation.navigate('Duel', activeGame);
      return;
    }

    navigation.navigate('Matchmaking');
  };

  return (
    <ScreenTransitionView style={[styles.container, { backgroundColor: theme.bg }]}>
      <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.title}>Play</AppText.Serif>
      <AppText.Sans preset="body" color={theme.ink3} style={styles.sub}>Choose your game mode</AppText.Sans>

      <Button
        label="Find Duel"
        onPress={handleFindDuel}
        style={styles.buttonSpacing}
      />
      <Button
        label="Solo Practice"
        variant="ghost"
        onPress={() => navigation.navigate('PracticeHome')}
        style={styles.buttonSpacing}
      />
    </ScreenTransitionView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 100 },
  title: { marginBottom: 8 },
  sub: { marginBottom: 48 },
  buttonSpacing: { marginBottom: 12 },
});
