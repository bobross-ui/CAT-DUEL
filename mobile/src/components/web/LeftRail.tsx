import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp } from '@react-navigation/native';
import Avatar from '../Avatar';
import Text from '../Text';
import { useTheme } from '../../theme/ThemeProvider';
import { radii } from '../../theme/tokens';
import { getTier } from '../../constants';
import { useCurrentProfile } from '../../hooks/useCurrentProfile';
import type { MainTabParamList, RootStackParamList } from '../../navigation';
import EyebrowLabel from './EyebrowLabel';
import NavRow from './NavRow';

interface LeftRailProps {
  activeRoute?: string;
}

type RailNavigation = NavigationProp<RootStackParamList & MainTabParamList>;

function routeIsActive(activeRoute: string, names: string[]) {
  return names.includes(activeRoute);
}

export default function LeftRail({ activeRoute }: LeftRailProps) {
  const { theme } = useTheme();
  const route = useRoute();
  const navigation = useNavigation<RailNavigation>();
  const { user } = useCurrentProfile();
  const currentRoute = activeRoute ?? route.name;
  const inDuel = currentRoute === 'Duel';
  const displayName = user?.displayName ?? 'Player';
  const tier = user ? getTier(user.eloRating) : null;

  const navigateTab = (screen: 'Home' | 'Ranks' | 'Me') => {
    if (inDuel) return;
    if (['Home', 'Ranks', 'Me', 'Play'].includes(currentRoute)) {
      navigation.navigate(screen);
      return;
    }
    navigation.navigate('MainTabs', { screen });
  };

  const navigateStack = (screen: 'PracticeHome' | 'MatchHistory') => {
    if (inDuel && screen !== 'MatchHistory') return;
    navigation.navigate(screen);
  };

  return (
    <View style={[styles.rail, { backgroundColor: theme.bg, borderRightColor: theme.line }]}>
      <View style={styles.brandRow}>
        <View style={[styles.brandMark, { backgroundColor: theme.ink }]}>
          <Text.Serif preset="h1Serif" color={theme.bg}>C</Text.Serif>
        </View>
        <View>
          <Text.Serif preset="h1Serif" color={theme.ink}>CAT-Duel</Text.Serif>
          <Text.Mono preset="chipLabel" color={theme.ink3}>RANKED PREP</Text.Mono>
        </View>
      </View>

      <View style={styles.group}>
        <EyebrowLabel>compete</EyebrowLabel>
        <NavRow
          icon="home"
          label="Home"
          active={routeIsActive(currentRoute, ['Home'])}
          disabled={inDuel}
          onPress={() => navigateTab('Home')}
        />
        <NavRow
          icon="book-open"
          label="Practice"
          active={routeIsActive(currentRoute, ['PracticeHome', 'Question', 'PracticeSummary'])}
          disabled={inDuel}
          onPress={() => navigateStack('PracticeHome')}
        />
        <NavRow
          icon="award"
          label="Leaderboard"
          active={routeIsActive(currentRoute, ['Ranks', 'Leaderboard'])}
          disabled={inDuel}
          onPress={() => navigateTab('Ranks')}
        />
        <NavRow
          icon="user"
          label="Profile"
          active={routeIsActive(currentRoute, ['Me', 'Profile'])}
          disabled={inDuel}
          onPress={() => navigateTab('Me')}
        />
      </View>

      <View style={styles.group}>
        <EyebrowLabel>learn</EyebrowLabel>
        <NavRow icon="bookmark" label="Topics" disabled />
        <NavRow
          icon="clock"
          label="Past matches"
          active={currentRoute === 'MatchHistory'}
          onPress={() => navigateStack('MatchHistory')}
        />
      </View>

      <View style={styles.spacer} />

      <Pressable
        onPress={() => navigateTab('Me')}
        disabled={inDuel}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        accessibilityState={{ disabled: inDuel }}
        style={({ pressed }) => [
          styles.profileChip,
          {
            backgroundColor: theme.bg2,
            borderColor: theme.line,
            opacity: inDuel ? 0.4 : pressed ? 0.78 : 1,
          },
        ]}
      >
        <Avatar name={displayName} size="sm" />
        <View style={styles.profileText}>
          <Text.Sans preset="label" color={theme.ink} numberOfLines={1}>{displayName}</Text.Sans>
          <Text.Mono preset="chipLabel" color={theme.ink3}>
            {user ? `◆ ${user.eloRating} · ${tier?.name ?? 'Bronze'}` : 'LOADING'}
          </Text.Mono>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 240,
    borderRightWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    gap: 8,
    marginBottom: 22,
  },
  spacer: {
    flex: 1,
  },
  profileChip: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
});
