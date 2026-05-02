import { useEffect, useState, useCallback } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { RootStackParamList } from '../navigation';
import TierBadge from '../components/TierBadge';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import AppText from '../components/Text';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';
import { fetchGamesHistory, type MatchHistoryEntry, useGamesHistory } from '../queries/games';
import { queryKeys } from '../queries/keys';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchHistory'>;

function formatMatchTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (date >= todayStart) return `Today, ${time}`;
  if (date >= yesterdayStart) return `Yesterday, ${time}`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + `, ${time}`;
}

export default function MatchHistoryScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { playHaptic } = useAppPreferences();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<MatchHistoryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const historyQuery = useGamesHistory(page, 20);

  useEffect(() => {
    if (!historyQuery.data || historyQuery.data.pagination.page !== page) return;

    setTotalPages(historyQuery.data.pagination.totalPages);
    setEntries((prev) => (
      page === 1 ? historyQuery.data.entries : [...prev, ...historyQuery.data.entries]
    ));
  }, [historyQuery.data, page]);

  const onRefresh = useCallback(async () => {
    void playHaptic('pull_refresh');
    setRefreshing(true);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.games.history(1, 20),
        queryFn: () => fetchGamesHistory(1, 20),
        staleTime: 0,
      });
      setPage(1);
      setTotalPages(data.pagination.totalPages);
      setEntries(data.entries);
    } finally {
      setRefreshing(false);
    }
  }, [playHaptic, queryClient]);

  const loadMore = useCallback(async () => {
    if (historyQuery.isFetching || page >= totalPages) return;
    setPage((current) => current + 1);
  }, [historyQuery.isFetching, page, totalPages]);

  const retry = useCallback(() => {
    setPage(1);
    void historyQuery.refetch();
  }, [historyQuery]);

  const stripeColor = (outcome: 'WIN' | 'LOSS' | 'DRAW') =>
    outcome === 'WIN' ? theme.accent : outcome === 'LOSS' ? theme.coral : theme.ink3;

  const deltaColor = (delta: number) =>
    delta > 0 ? theme.accentDeep : delta < 0 ? theme.coral : theme.ink3;

  return (
    <ScreenTransitionView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <AppText.Sans preset="body" color={theme.ink}>←</AppText.Sans>
        </TouchableOpacity>
        <AppText.Serif preset="heroSerif" color={theme.ink}>Match History</AppText.Serif>
      </View>

      {historyQuery.isLoading && entries.length === 0 ? (
        <View style={styles.list}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} style={styles.loadingCard}>
              <SkeletonBlock height={36} width={36} radius={18} />
              <View style={{ flex: 1, gap: 8 }}>
                <SkeletonBlock height={17} width={i % 2 === 0 ? '64%' : '46%'} />
                <SkeletonBlock height={15} width="74%" />
              </View>
              <SkeletonBlock height={16} width={34} />
            </SkeletonCard>
          ))}
        </View>
      ) : historyQuery.isError ? (
        <View style={styles.errorState}>
          <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.errorHeading}>Couldn't load.</AppText.Serif>
          <AppText.Sans preset="body" color={theme.ink3} style={styles.errorBody}>Check your connection and try again.</AppText.Sans>
          <Button label="Retry" onPress={retry} style={styles.retryBtn} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.matchId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}
              onPress={() => navigation.navigate('MatchDetail', {
                matchId: item.matchId,
                opponentName: item.opponent.displayName,
              })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${item.outcome.toLowerCase()} against ${item.opponent.displayName ?? 'opponent'}, ${item.yourScore} to ${item.opponentScore}`}
              accessibilityHint="Opens match details"
            >
              {/* Left stripe */}
              <View style={[styles.stripe, { backgroundColor: stripeColor(item.outcome) }]} />

              {/* Content */}
              <View style={styles.cardContent}>
                {/* Opponent row */}
                <View style={styles.opponentRow}>
                  <Avatar name={item.opponent.displayName ?? '?'} size="sm" variant="opponent" />
                  <AppText.Serif
                    preset="italic"
                    color={theme.ink}
                    numberOfLines={1}
                    style={styles.opponentName}
                  >
                    {item.opponent.displayName ?? 'Anonymous'}
                  </AppText.Serif>
                  <TierBadge tier={item.opponent.rankTier} small />
                </View>

                {/* Result + timestamp */}
                <View style={styles.metaRow}>
                  <AppText.Sans preset="bodyMed" color={stripeColor(item.outcome)}>
                    {item.outcome} · {item.yourScore}–{item.opponentScore}
                    {item.status === 'forfeited' ? ' · forfeit' : ''}
                  </AppText.Sans>
                  <AppText.Mono preset="mono" color={theme.ink3} style={styles.timestamp}>
                    {formatMatchTime(item.finishedAt)}
                  </AppText.Mono>
                </View>
              </View>

              {/* Elo delta */}
              <AppText.Mono preset="mono" color={deltaColor(item.yourEloChange)} style={styles.delta}>
                {item.yourEloChange > 0 ? '+' : ''}{item.yourEloChange}
              </AppText.Mono>
            </TouchableOpacity>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListFooterComponent={historyQuery.isFetching && page > 1
            ? <ActivityIndicator style={styles.footerLoader} color={theme.ink3} />
            : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.emptyHeading}>
                No matches yet.
              </AppText.Serif>
              <AppText.Sans preset="body" color={theme.ink3}>
                Find your first duel.
              </AppText.Sans>
              <Button
                label="Find Duel"
                onPress={() => navigation.navigate('Matchmaking')}
                style={styles.emptyCta}
              />
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}
    </ScreenTransitionView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorHeading: { marginBottom: 8 },
  errorBody: { marginBottom: 24, textAlign: 'center' },
  retryBtn: { width: 120 },

  // Card row
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  cardContent: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 6,
  },
  opponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  opponentName: {
    flex: 1,
    fontSize: 15,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timestamp: { flex: 1, textAlign: 'right' },
  delta: { paddingRight: 14, minWidth: 36, textAlign: 'right' },

  // Footer
  footerLoader: { paddingVertical: 16 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyHeading: { marginBottom: 4 },
  emptyCta: { marginTop: 12, width: 160 },
});
