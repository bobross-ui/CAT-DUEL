import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { ComponentProps } from 'react';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import { useGamesActive } from '../queries/games';
import DesktopScreen from './DuelScreen.desktop';
import MobileScreen from './DuelScreen.mobile';

export default function DuelScreen(props: ComponentProps<typeof MobileScreen>) {
  const { route, navigation } = props;
  const { opponent, initialState } = route.params;
  const needsGameData = !opponent || !initialState;
  const { data: activeGame, isLoading } = useGamesActive({ enabled: needsGameData });
  const isDesktop = useDesktopLayout();

  useEffect(() => {
    if (!needsGameData || isLoading) return;
    if (activeGame && 'gameId' in activeGame && activeGame.gameId === route.params.gameId) {
      navigation.replace('Duel', {
        gameId: activeGame.gameId,
        opponent: activeGame.opponent,
        initialState: activeGame.initialState,
      });
    } else {
      navigation.replace('MainTabs');
    }
  }, [activeGame, isLoading, needsGameData, navigation, route.params.gameId]);

  if (needsGameData) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const Screen = isDesktop ? DesktopScreen : MobileScreen;
  return <Screen {...props} />;
}
