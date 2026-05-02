import { useCallback, useMemo, useRef, type ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DesktopFrame from '../components/web/DesktopFrame';
import PageContainer from '../components/web/PageContainer';
import EyebrowLabel from '../components/web/EyebrowLabel';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import Text from '../components/Text';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { type MatchHistoryEntry, useGamesHistory, useGamesStats } from '../queries/games';
import { useLeaderboardGlobal } from '../queries/leaderboard';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useTheme } from '../theme/ThemeProvider';
import { palette } from '../theme/tokens';
import { getTier, getTierToNext } from '../constants';
import MobileHomeScreen from './HomeScreen.mobile';

type Props = ComponentProps<typeof MobileHomeScreen>;
const INITIAL_MATCHMAKING_RANGE = 150;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 22) return 'Evening';
  return 'Late night';
}

function getStreakCopy(streak: number) {
  if (streak <= 1) return 'READY TO CLIMB';
  if (streak < 7) return `${streak}-DAY STREAK`;
  return `${streak}-DAY STREAK · ON FIRE`;
}

function formatDelta(delta: number | undefined) {
  if (!delta) return 'steady';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function formatAgo(value: string) {
  const then = new Date(value).getTime();
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

export default function HomeScreenDesktop({ navigation }: Props) {
  const { theme, mode } = useTheme();
  const { user, loading: profileLoading, error: profileError, refresh } = useCurrentProfile();
  const statsQuery = useGamesStats();
  const historyQuery = useGamesHistory(1, 5);
  const leaderboardQuery = useLeaderboardGlobal();
  const pulse = useRef(new Animated.Value(1)).current;

  useDocumentTitle('CAT Duel');

  const navigateToMatchmaking = useCallback(() => {
    navigation.navigate('Matchmaking');
  }, [navigation]);

  const runPlayPulse = useCallback(() => {
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1.015, duration: 110, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [pulse]);

  const shortcuts = useMemo(() => [{
    key: 'p',
    handler: () => {
      runPlayPulse();
      navigateToMatchmaking();
    },
  }], [navigateToMatchmaking, runPlayPulse]);
  useKeyboardShortcuts(shortcuts);

  const retry = useCallback(() => {
    void Promise.all([
      refresh(),
      statsQuery.refetch(),
      historyQuery.refetch(),
      leaderboardQuery.refetch(),
    ]);
  }, [historyQuery, leaderboardQuery, refresh, statsQuery]);

  const displayName = user?.displayName ?? 'there';
  const tier = user ? getTier(user.eloRating) : null;
  const ratingDelta = user?.ratingChangeToday;
  const deltaColor = ratingDelta && ratingDelta > 0
    ? theme.accentDeep
    : ratingDelta && ratingDelta < 0
      ? theme.coral
      : theme.ink3;
  const stats = statsQuery.data ?? null;
  const recentMatches = historyQuery.data?.entries ?? [];
  const leaders = leaderboardQuery.data?.entries.slice(0, 5) ?? [];
  const winRate = stats ? Math.round(stats.winRate * 100) : null;
  const todaysMatches = recentMatches.filter((match) => isToday(match.finishedAt)).length;
  const heroIsLight = mode === 'dark';
  const heroBg = heroIsLight ? palette.light.bg : palette.light.ink;
  const heroTitleColor = heroIsLight ? palette.light.ink : palette.light.bg;
  const heroBodyColor = heroIsLight ? palette.light.ink2 : 'rgba(255,255,255,0.68)';
  const heroMutedColor = heroIsLight ? palette.light.ink3 : 'rgba(255,255,255,0.58)';
  const heroMetaColor = heroIsLight ? palette.light.ink3 : 'rgba(255,255,255,0.52)';
  const queueEloLow = user ? Math.max(0, user.eloRating - INITIAL_MATCHMAKING_RANGE) : null;
  const queueEloHigh = user ? user.eloRating + INITIAL_MATCHMAKING_RANGE : null;
  const queueMeta = queueEloLow !== null ? `◆ ${queueEloLow}-${queueEloHigh} · ~12S WAIT` : '◆ — · ~12S WAIT';

  const rightRail = (
    <View style={styles.rightRailStack}>
      <Pressable
        onPress={() => navigation.navigate('Ranks')}
        accessibilityRole="button"
        accessibilityLabel="Open leaderboard"
      >
        {({ pressed }) => (
          <Card style={[styles.sideCard, pressed && { opacity: 0.82 }]}>
            <View style={styles.sideHeader}>
              <EyebrowLabel>Weekly climbers</EyebrowLabel>
              <Feather name="arrow-up-right" size={16} color={theme.ink3} />
            </View>
            <View style={styles.leaderList}>
              {leaders.length > 0 ? leaders.map((entry) => (
                <View
                  key={entry.userId}
                  style={[
                    styles.leaderRow,
                    entry.isCurrentUser && { backgroundColor: theme.accentSoft },
                  ]}
                >
                  <Text.Mono preset="mono" color={theme.ink3} style={styles.leaderRank}>
                    #{entry.rank}
                  </Text.Mono>
                  <Avatar name={entry.displayName} size="sm" variant={entry.isCurrentUser ? 'you' : 'opponent'} />
                  <View style={styles.leaderName}>
                    <Text.Sans preset="label" color={theme.ink} numberOfLines={1}>
                      {entry.displayName}
                    </Text.Sans>
                    <Text.Mono preset="chipLabel" color={theme.ink3}>◆ {entry.eloRating}</Text.Mono>
                  </View>
                </View>
              )) : (
                <View style={styles.emptySide}>
                  <Text.Serif preset="h1Serif" color={theme.ink}>No ranked table yet.</Text.Serif>
                  <Text.Sans preset="small" color={theme.ink3}>Play five matches to enter the climb.</Text.Sans>
                </View>
              )}
            </View>
          </Card>
        )}
      </Pressable>

      <Card style={styles.sideCard}>
        <View style={styles.sideHeader}>
          <EyebrowLabel>Friends online</EyebrowLabel>
          <Feather name="users" size={16} color={theme.ink3} />
        </View>
        <View style={styles.friendsEmpty}>
          <Text.Serif preset="h1Serif" color={theme.ink}>Quiet for now.</Text.Serif>
          <Text.Sans preset="small" color={theme.ink3}>Add friends to see who's playing.</Text.Sans>
          <View style={[styles.disabledCta, { borderColor: theme.line }]}>
            <Text.Mono preset="chipLabel" color={theme.ink3}>COMING SOON</Text.Mono>
          </View>
        </View>
      </Card>
    </View>
  );

  if (leaderboardQuery.isLoading || statsQuery.isLoading || historyQuery.isLoading || profileLoading) {
    return (
      <DesktopFrame activeRoute="Home" rightRail={rightRail}>
        <PageContainer style={styles.page}>
          <View style={styles.headerRow}>
            <View style={styles.loadingTitle}>
              <SkeletonBlock height={42} width="44%" />
              <SkeletonBlock height={16} width="24%" />
            </View>
            <SkeletonBlock height={44} width={104} />
          </View>
          <SkeletonCard style={styles.statsStrip}>
            {[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} height={42} width="20%" />)}
          </SkeletonCard>
          <SkeletonCard style={styles.heroCard}>
            <SkeletonBlock height={14} width="24%" />
            <SkeletonBlock height={72} width="28%" />
            <SkeletonBlock height={18} width="42%" />
          </SkeletonCard>
        </PageContainer>
      </DesktopFrame>
    );
  }

  if (leaderboardQuery.isError || statsQuery.isError || historyQuery.isError || profileError) {
    return (
      <DesktopFrame activeRoute="Home" rightRail={rightRail}>
        <PageContainer maxWidth={760} style={styles.errorPage}>
          <Text.Serif preset="display" color={theme.ink}>Couldn't load.</Text.Serif>
          <Text.Sans preset="body" color={theme.ink3} style={styles.errorBody}>
            Check your connection and try again.
          </Text.Sans>
          <Button label="Retry" onPress={retry} style={styles.retryButton} />
        </PageContainer>
      </DesktopFrame>
    );
  }

  return (
    <DesktopFrame activeRoute="Home" rightRail={rightRail}>
      <PageContainer style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <View style={styles.greetingLine}>
              <Text.Serif preset="display" color={theme.ink} style={styles.desktopTitle}>
                {getGreeting()},{' '}
              </Text.Serif>
              <Text.Serif preset="display" color={theme.accentDeep} style={[styles.desktopTitle, styles.italicName]}>
                {displayName}
              </Text.Serif>
            </View>
            <Text.Mono preset="eyebrow" color={theme.ink3}>
              {getStreakCopy(user?.currentStreak ?? 0)}
            </Text.Mono>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              disabled
              accessibilityRole="button"
              accessibilityLabel="Search coming soon"
              accessibilityState={{ disabled: true }}
              style={[styles.iconButton, { borderColor: theme.line, backgroundColor: theme.card, opacity: 0.58 }]}
            >
              <Feather name="search" size={18} color={theme.ink3} />
            </Pressable>
            <Pressable
              disabled
              accessibilityRole="button"
              accessibilityLabel="Notifications coming soon"
              accessibilityState={{ disabled: true }}
              style={[styles.iconButton, { borderColor: theme.line, backgroundColor: theme.card, opacity: 0.58 }]}
            >
              <Feather name="bell" size={18} color={theme.ink3} />
            </Pressable>
          </View>
        </View>

        <Card style={styles.statsStrip}>
          <StatCell label="rating" value={`◆ ${user?.eloRating ?? '—'}`} meta={`${formatDelta(ratingDelta)} today`} metaColor={deltaColor} />
          <StatDivider />
          <StatCell label="tier" value={tier?.name ?? '—'} meta={user ? getTierToNext(user.eloRating) : '—'} valueColor={tier?.color} />
          <StatDivider />
          <StatCell label="win %" value={winRate !== null ? `${winRate}%` : '—'} meta="all time" />
          <StatDivider />
          <StatCell label="today" value={`${todaysMatches}`} meta="matches" />
        </Card>

        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Pressable
            onPress={navigateToMatchmaking}
            accessibilityRole="button"
            accessibilityLabel="Find a ranked duel"
            accessibilityHint="Opens matchmaking"
          >
            {({ pressed }) => (
              <View style={[styles.heroCard, { backgroundColor: heroBg, opacity: pressed ? 0.94 : 1 }]}>
                <View style={[styles.heroGlow, { backgroundColor: palette.light.accent }]} />
                <View style={[styles.heroGlowAmber, { backgroundColor: palette.light.amber }]} />
                <View style={styles.heroLeft}>
                  <Text.Mono preset="eyebrow" color={heroMutedColor}>
                    RANKED · 10-MIN DUEL
                  </Text.Mono>
                  <Text.Serif preset="display" color={heroTitleColor} style={styles.playWord}>Play.</Text.Serif>
                  <Text.Sans preset="body" color={heroBodyColor} style={styles.heroDescription}>
                    Twenty mixed questions, one matched opponent, rating on the line.
                  </Text.Sans>
                </View>
                <View style={styles.heroRight}>
                  <View style={[styles.heroButton, { backgroundColor: theme.accent }]}>
                    <Feather name="play" size={18} color="#FFFFFF" />
                    <Text.Sans preset="bodyMed" color="#FFFFFF">Enter queue</Text.Sans>
                  </View>
                  <Text.Mono preset="chipLabel" color={heroMetaColor}>{queueMeta}</Text.Mono>
                </View>
              </View>
            )}
          </Pressable>
        </Animated.View>

        <View style={styles.modeGrid}>
          <ModeCard
            kicker="SOLO"
            title="Practice"
            description="No rating change. Full feedback after every answer."
            meta="all sections"
            onPress={() => navigation.navigate('PracticeHome')}
          />
          <ModeCard kicker="ROOM" title="Custom" description="Challenge links and private tables." meta="coming soon" muted />
          <ModeCard kicker="BURST" title="Quick" description="Shorter rounds for warmups." meta="coming soon" muted />
        </View>

        <View style={styles.sectionHeader}>
          <Text.Serif preset="h1Serif" color={theme.ink}>Recent matches</Text.Serif>
          <Pressable onPress={() => navigation.navigate('MatchHistory')} accessibilityRole="button">
            <Text.Mono preset="eyebrow" color={theme.accentDeep}>VIEW ALL →</Text.Mono>
          </Pressable>
        </View>

        <View style={styles.matchList}>
          {recentMatches.length > 0 ? recentMatches.map((match) => (
            <RecentMatchRow key={match.matchId} match={match} />
          )) : (
            <Card style={styles.emptyMatches}>
              <Text.Serif preset="h1Serif" color={theme.ink}>No matches yet.</Text.Serif>
              <Text.Sans preset="body" color={theme.ink3}>Your duel history will appear here after the first match.</Text.Sans>
            </Card>
          )}
        </View>
      </PageContainer>
    </DesktopFrame>
  );
}

function StatCell({
  label,
  value,
  meta,
  valueColor,
  metaColor,
}: {
  label: string;
  value: string;
  meta: string;
  valueColor?: string;
  metaColor?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.statCell}>
      <Text.Mono preset="eyebrow" color={theme.ink3}>{label}</Text.Mono>
      <Text.Serif preset="statVal" color={valueColor ?? theme.ink} style={styles.statValue}>{value}</Text.Serif>
      <Text.Mono preset="mono" color={metaColor ?? theme.ink3}>{meta}</Text.Mono>
    </View>
  );
}

function StatDivider() {
  const { theme } = useTheme();
  return <View style={[styles.statDivider, { backgroundColor: theme.line }]} />;
}

function ModeCard({
  kicker,
  title,
  description,
  meta,
  muted,
  onPress,
}: {
  kicker: string;
  title: string;
  description: string;
  meta: string;
  muted?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={muted}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: muted }}
      style={styles.modePressable}
    >
      {({ pressed }) => (
        <Card style={[
          styles.modeCard,
          muted && { opacity: 0.52 },
          pressed && { opacity: 0.82 },
        ]}>
          <Text.Mono preset="eyebrow" color={theme.ink3}>{kicker}</Text.Mono>
          <Text.Serif preset="h1Serif" color={theme.ink}>{title}</Text.Serif>
          <Text.Sans preset="small" color={theme.ink3} style={styles.modeDescription}>{description}</Text.Sans>
          <View style={styles.modeMeta}>
            <Text.Mono preset="chipLabel" color={muted ? theme.ink3 : theme.accentDeep}>{meta}</Text.Mono>
            <View style={[styles.modeArrow, { borderColor: theme.line }]}>
              <Feather name="arrow-right" size={14} color={muted ? theme.ink3 : theme.ink} />
            </View>
          </View>
        </Card>
      )}
    </Pressable>
  );
}

function RecentMatchRow({ match }: { match: MatchHistoryEntry }) {
  const { theme } = useTheme();
  const won = match.outcome === 'WIN';
  const lost = match.outcome === 'LOSS';
  const deltaColor = won ? theme.accentDeep : lost ? theme.coral : theme.ink3;
  const opponentName = match.opponent.displayName ?? 'Anonymous';
  return (
    <Card style={styles.matchRow}>
      <Avatar name={opponentName} size="sm" variant="opponent" />
      <View style={styles.matchName}>
        <Text.Sans preset="label" color={theme.ink} numberOfLines={1}>vs {opponentName}</Text.Sans>
        <Text.Mono preset="chipLabel" color={theme.ink3}>{formatAgo(match.finishedAt)}</Text.Mono>
      </View>
      <Text.Mono preset="mono" color={theme.ink2} style={styles.matchScore}>
        {match.yourScore}-{match.opponentScore}
      </Text.Mono>
      <Text.Mono preset="mono" color={deltaColor} style={styles.matchDelta}>
        {match.yourEloChange > 0 ? `+${match.yourEloChange}` : match.yourEloChange}
      </Text.Mono>
      <View style={[
        styles.outcomePill,
        { backgroundColor: won ? theme.accentSoft : lost ? theme.coralSoft : theme.bg2 },
      ]}>
        <Text.Mono preset="chipLabel" color={deltaColor}>{match.outcome}</Text.Mono>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 24,
  },
  headerCopy: {
    flex: 1,
    gap: 8,
  },
  greetingLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  desktopTitle: {
    fontSize: 38,
    lineHeight: 42,
  },
  italicName: {
    fontStyle: 'italic',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    flex: 1,
    gap: 10,
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 24,
  },
  statCell: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  statValue: {
    fontSize: 26,
    lineHeight: 30,
  },
  statDivider: {
    width: 1,
    height: 54,
    marginHorizontal: 18,
  },
  heroCard: {
    minHeight: 254,
    borderRadius: 18,
    paddingVertical: 38,
    paddingHorizontal: 42,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    gap: 24,
  },
  heroGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.22,
    right: -72,
    top: -88,
  },
  heroGlowAmber: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.14,
    right: 172,
    bottom: -104,
  },
  heroLeft: {
    flex: 1,
    gap: 16,
    zIndex: 1,
  },
  playWord: {
    fontSize: 88,
    lineHeight: 88,
  },
  heroDescription: {
    maxWidth: 430,
  },
  heroRight: {
    minWidth: 220,
    flex: 1,
    alignItems: 'flex-end',
    gap: 14,
    zIndex: 1,
  },
  heroButton: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  modePressable: {
    minWidth: 190,
    flexBasis: 190,
    flexGrow: 1,
  },
  modeCard: {
    minHeight: 168,
    justifyContent: 'space-between',
    gap: 10,
  },
  modeDescription: {
    minHeight: 34,
  },
  modeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modeArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchList: {
    gap: 10,
  },
  matchRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  matchName: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  matchScore: {
    width: 64,
    textAlign: 'right',
  },
  matchDelta: {
    width: 54,
    textAlign: 'right',
  },
  outcomePill: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  emptyMatches: {
    gap: 8,
  },
  rightRailStack: {
    gap: 16,
  },
  sideCard: {
    padding: 16,
    gap: 14,
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leaderList: {
    gap: 8,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  leaderRank: {
    width: 34,
  },
  leaderName: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  emptySide: {
    gap: 6,
    paddingVertical: 8,
  },
  friendsEmpty: {
    gap: 10,
  },
  disabledCta: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  errorPage: {
    justifyContent: 'center',
    minHeight: 520,
    gap: 8,
  },
  errorBody: {
    marginBottom: 12,
  },
  retryButton: {
    width: 132,
  },
});
