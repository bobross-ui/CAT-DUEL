import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import api from '../services/api';
import TierBadge from '../components/TierBadge';
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MatchHistoryScreen({ navigation }: Props) {
  const { theme } = useTheme();
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
    setRefreshing(true);
    await fetchPage(1, true);
    setRefreshing(false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await fetchPage(page + 1, false);
    setLoadingMore(false);
  }, [fetchPage, loadingMore, page, totalPages]);

  // Map outcome to theme semantic colors
  const outcomeColor = (outcome: 'WIN' | 'LOSS' | 'DRAW') =>
    outcome === 'WIN' ? theme.accent : outcome === 'LOSS' ? theme.coral : theme.amber;
  const outcomeBg = (outcome: 'WIN' | 'LOSS' | 'DRAW') =>
    outcome === 'WIN' ? theme.accentSoft : outcome === 'LOSS' ? theme.coralSoft : theme.amberSoft;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backText, { color: theme.ink }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.ink }]}>Match History</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={theme.ink} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.matchId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.line2 }]}
              onPress={() => navigation.navigate('MatchDetail', {
                matchId: item.matchId,
                opponentName: item.opponent.displayName,
              })}
            >
              <View style={[styles.outcomePill, { backgroundColor: outcomeBg(item.outcome) }]}>
                <Text style={[styles.outcomeText, { color: outcomeColor(item.outcome) }]}>
                  {item.outcome}
                </Text>
              </View>
              <View style={styles.matchInfo}>
                <View style={styles.opponentRow}>
                  <Text style={[styles.opponentName, { color: theme.ink }]} numberOfLines={1}>
                    {item.opponent.displayName ?? 'Anonymous'}
                  </Text>
                  <TierBadge tier={item.opponent.rankTier} small />
                </View>
                <Text style={[styles.matchMeta, { color: theme.ink3 }]}>
                  {formatDate(item.finishedAt)} · {formatDuration(item.durationSeconds)}
                  {item.status === 'forfeited' ? ' · Forfeit' : ''}
                </Text>
              </View>
              <View style={styles.rightCol}>
                <Text style={[styles.score, { color: theme.ink }]}>{item.yourScore}–{item.opponentScore}</Text>
                <Text style={[styles.eloDelta, {
                  color: item.yourEloChange > 0 ? theme.accent : item.yourEloChange < 0 ? theme.coral : theme.ink3,
                }]}>
                  {item.yourEloChange > 0 ? '+' : ''}{item.yourEloChange}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore
            ? <ActivityIndicator style={styles.footerLoader} color={theme.ink3} />
            : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.ink }]}>No matches yet.</Text>
              <Text style={[styles.emptySubText, { color: theme.ink2 }]}>
                Play your first duel to see history here.
              </Text>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}
    </View>
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
    gap: 12,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 24 },
  title: { fontSize: 22, fontWeight: '800' },
  loader: { flex: 1, marginTop: 60 },
  list: { paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  outcomePill: {
    width: 44,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
  },
  outcomeText: { fontSize: 11, fontWeight: '800' },
  matchInfo: { flex: 1, gap: 4 },
  opponentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  opponentName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  matchMeta: { fontSize: 12 },
  rightCol: { alignItems: 'flex-end', gap: 2 },
  score: { fontSize: 15, fontWeight: '700' },
  eloDelta: { fontSize: 13, fontWeight: '600' },
  footerLoader: { paddingVertical: 16 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubText: { fontSize: 14 },
});
