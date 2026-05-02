import { useCallback, useState } from 'react';
import {
  View, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Pressable,
} from 'react-native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import AppText from '../components/Text';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';
import { getTier, getTierToNext } from '../constants';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useGamesHistory } from '../queries/games';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 22) return 'Evening';
  return 'Late night';
}

function getStreakCopy(streak: number) {
  if (streak <= 1) return 'Ready to climb?';
  if (streak < 7) return `${streak}-day streak`;
  return `${streak}-day streak · on fire`;
}

export default function HomeScreen({ navigation }: Props) {
  const { theme, mode } = useTheme();
  const { playHaptic } = useAppPreferences();
  const { user: profile, loading: profileLoading, error: profileError, refresh } = useCurrentProfile();
  const historyQuery = useGamesHistory(1, 20);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    void playHaptic('pull_refresh');
    setRefreshing(true);
    await Promise.all([refresh(), historyQuery.refetch()]);
    setRefreshing(false);
  }, [historyQuery, playHaptic, refresh]);

  if (historyQuery.isLoading || profileLoading) {
    return (
      <ScreenTransitionView style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={styles.container}>
          <View style={styles.loadingHeader}>
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonBlock height={30} width="70%" />
              <SkeletonBlock height={16} width="42%" />
            </View>
            <SkeletonBlock height={52} width={52} radius={26} />
          </View>
          <SkeletonCard style={styles.loadingStatsCard}>
            <SkeletonBlock height={30} width="28%" />
            <SkeletonBlock height={30} width="28%" />
            <SkeletonBlock height={30} width="28%" />
          </SkeletonCard>
          <SkeletonCard style={styles.loadingPlayCard}>
            <SkeletonBlock height={14} width="64%" />
            <SkeletonBlock height={48} width="36%" />
            <SkeletonBlock height={18} width="78%" />
          </SkeletonCard>
          <SkeletonCard>
            <SkeletonBlock height={18} width="46%" />
            <SkeletonBlock height={14} width="62%" style={{ marginTop: 8 }} />
          </SkeletonCard>
        </View>
      </ScreenTransitionView>
    );
  }

  if (historyQuery.isError || profileError) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.errorHeading}>Couldn't load.</AppText.Serif>
        <AppText.Sans preset="body" color={theme.ink3} style={styles.errorBody}>Check your connection and try again.</AppText.Sans>
        <Button
          label="Retry"
          onPress={() => {
            void Promise.all([refresh(), historyQuery.refetch()]);
          }}
          style={styles.retryBtn}
        />
      </View>
    );
  }

  const streak = profile?.currentStreak ?? 0;
  const ratingDelta = profile?.ratingChangeToday;
  const deltaCopy = ratingDelta
    ? (ratingDelta > 0 ? `+${ratingDelta} today` : `${ratingDelta} today`)
    : 'steady';
  const deltaColor = ratingDelta && ratingDelta > 0
    ? theme.accentDeep
    : ratingDelta && ratingDelta < 0
      ? theme.coral
      : theme.ink3;
  const tier = profile ? getTier(profile.eloRating) : null;
  const entries = historyQuery.data?.entries ?? [];
  const wins = entries.filter((entry) => entry.outcome === 'WIN').length;
  const winRate = entries.length > 0 ? Math.round((wins / entries.length) * 100) : null;

  // Play card inverts: dark bg + white text in light mode, light bg + dark text in dark mode
  const playCardBg      = mode === 'dark' ? theme.ink : '#1C1B1A';
  const playTextPrimary = mode === 'dark' ? '#1C1B1A' : '#FFFFFF';
  const playTextMid     = mode === 'dark' ? 'rgba(28,27,26,0.7)'  : 'rgba(255,255,255,0.7)';
  const playTextFaint   = mode === 'dark' ? 'rgba(28,27,26,0.55)' : 'rgba(255,255,255,0.55)';
  const playTextFainter = mode === 'dark' ? 'rgba(28,27,26,0.45)' : 'rgba(255,255,255,0.45)';
  const playDividerBg   = mode === 'dark' ? 'rgba(28,27,26,0.12)' : 'rgba(255,255,255,0.12)';

  return (
    <ScreenTransitionView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.greetingRow}>
            <AppText.Serif preset="heroSerif" color={theme.ink}>
              {getGreeting()},{' '}
            </AppText.Serif>
            <AppText.Serif preset="heroSerif" color={theme.accentDeep}>
              {profile?.displayName ?? 'there'}
            </AppText.Serif>
          </View>
          <AppText.Sans preset="small" color={theme.ink3}>{getStreakCopy(streak)}</AppText.Sans>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Me')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Avatar name={profile?.displayName ?? '?'} size="md" />
        </TouchableOpacity>
      </View>

      {/* ── 3-stat Card ── */}
      <Card style={styles.statsCard}>
        {/* Rating */}
        <View style={styles.statBlock}>
          <AppText.Serif preset="statVal" color={theme.ink}>
            ◆ {profile?.eloRating ?? '—'}
          </AppText.Serif>
          <AppText.Mono preset="mono" color={deltaColor} style={styles.statDelta}>
            {deltaCopy}
          </AppText.Mono>
        </View>

        <View style={[styles.statDivider, { backgroundColor: theme.line }]} />

        {/* Tier */}
        <View style={styles.statBlock}>
          <AppText.Serif
            preset="statVal"
            color={tier?.color ?? theme.ink}
          >
            {tier?.name ?? '—'}
          </AppText.Serif>
          <AppText.Mono preset="mono" color={theme.ink3} style={styles.statDelta}>
            {profile ? getTierToNext(profile.eloRating) : '—'}
          </AppText.Mono>
        </View>

        <View style={[styles.statDivider, { backgroundColor: theme.line }]} />

        {/* Win% */}
        <View style={styles.statBlock}>
          <AppText.Serif preset="statVal" color={theme.ink}>
            {winRate !== null ? `${winRate}%` : '—'}
          </AppText.Serif>
          <AppText.Mono preset="mono" color={theme.ink3} style={styles.statDelta}>
            last 20
          </AppText.Mono>
        </View>
      </Card>

      {/* ── Big Play card ── */}
      <Pressable
        style={({ pressed }) => [
          styles.playCard,
          { backgroundColor: playCardBg, opacity: pressed ? 0.92 : 1 },
        ]}
        onPress={() => navigation.navigate('Matchmaking')}
        accessibilityRole="button"
        accessibilityLabel="Find a ranked duel"
        accessibilityHint="Opens matchmaking"
      >
        {/* Eyebrow row */}
        <View style={styles.playCardTop}>
          <AppText.Mono
            preset="eyebrow"
            color={playTextFaint}
            style={styles.eyebrow}
          >
            10-min duel · mixed · ranked
          </AppText.Mono>
          <AppText.Mono preset="eyebrow" color={playTextFainter}>◆ ◆ ◆</AppText.Mono>
        </View>

        {/* Title */}
        <AppText.Serif preset="display" color={playTextPrimary} style={styles.playTitle}>
          Play
        </AppText.Serif>

        {/* Sub */}
        <AppText.Sans preset="body" color={playTextMid} style={styles.playSub}>
          find a matched opponent · ~12s avg wait
        </AppText.Sans>

        {/* Divider + CTA */}
        <View style={[styles.playDivider, { backgroundColor: playDividerBg }]} />
        <View style={styles.playCtaRow}>
          <AppText.Sans preset="label" color={playTextMid}>
            Tap to enter queue
          </AppText.Sans>
          <View style={[styles.arrowCircle, { backgroundColor: theme.accent }]}>
            <AppText.Sans preset="bodyMed" color="#FFFFFF">→</AppText.Sans>
          </View>
        </View>
      </Pressable>

        {/* ── Practice ── */}
        <TouchableOpacity
          style={[styles.practiceRow, { borderColor: theme.line, backgroundColor: theme.bg2 }]}
          onPress={() => navigation.navigate('PracticeHome')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Solo Practice"
          accessibilityHint="Opens practice setup"
        >
          <View>
            <AppText.Sans preset="bodyMed" color={theme.ink}>Solo Practice</AppText.Sans>
            <AppText.Sans preset="small" color={theme.ink3}>no pressure · full feedback</AppText.Sans>
          </View>
          <AppText.Sans preset="label" color={theme.ink3}>→</AppText.Sans>
        </TouchableOpacity>
      </ScrollView>
    </ScreenTransitionView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  container: {
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 48,
    gap: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: { flex: 1, gap: 4, paddingRight: 16 },
  greetingRow: { flexDirection: 'row', flexWrap: 'wrap' },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 4,
  },
  loadingStatsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  loadingPlayCard: {
    height: 214,
    justifyContent: 'space-between',
  },
  errorHeading: { marginBottom: 8 },
  errorBody: { marginBottom: 24, textAlign: 'center' },
  retryBtn: { width: 120 },

  // Stats card — override Card's default padding
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  statDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 4,
  },
  statDelta: {},

  // Play card
  playCard: {
    borderRadius: 14,
    padding: 22,
  },
  playCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  eyebrow: { textTransform: 'uppercase' },
  playTitle: { marginBottom: 6 },
  playSub: { marginBottom: 20 },
  playDivider: {
    height: 1,
    marginBottom: 16,
  },
  playCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Practice row
  practiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
});
