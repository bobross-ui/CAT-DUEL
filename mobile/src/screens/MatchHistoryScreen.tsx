import { useState, useCallback } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import api from '../services/api';
import TierBadge from '../components/TierBadge';
import Avatar from '../components/Avatar';
import AppText from '../components/Text';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchHistory'>;

interface MatchEntry {
  matchId: string;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  yourScore: number;
  opponentScore: number;
  yourEloChange: number;
  opponent: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    eloRating: number;
    rankTier: string;
  };
  status: string;
  durationSeconds: number;
  finishedAt: string;
}

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
  const [entries, setEntries] = useState<MatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (p: number, replace: boolean) => {
    try {
      const res = await api.get(`/games/history?page=${p}&limit=20`);
      const { entries: newEntries, pagination } = res.data.data;
      setEntries(prev => replace ? newEntries : [...prev, ...newEntries]);
      setTotalPages(pagination.totalPages);
      setPage(p);
    } catch { /* non-critical */ }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchPage(1, true).finally(() => setLoading(false));
    }, [fetchPage]),
  );

  const onRefresh = useCallback(async () => {
    void playHaptic('pull_refresh');
    setRefreshing(true);
    await fetchPage(1, true);
    setRefreshing(false);
  }, [fetchPage, playHaptic]);

  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await fetchPage(page + 1, false);
    setLoadingMore(false);
  }, [fetchPage, loadingMore, page, totalPages]);

  const stripeColor = (outcome: 'WIN' | 'LOSS' | 'DRAW') =>
    outcome === 'WIN' ? theme.accent : outcome === 'LOSS' ? theme.coral : theme.ink3;

  const deltaColor = (delta: number) =>
    delta > 0 ? theme.accentDeep : delta < 0 ? theme.coral : theme.ink3;

  return (
    <ScreenTransitionView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <AppText.Sans preset="body" color={theme.ink}>←</AppText.Sans>
        </TouchableOpacity>
        <AppText.Serif preset="heroSerif" color={theme.ink}>Match History</AppText.Serif>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={theme.ink3} />
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
          ListFooterComponent={loadingMore
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
  loader: { flex: 1, marginTop: 60 },
  list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },

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
});
