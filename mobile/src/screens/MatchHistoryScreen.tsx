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
import AppText from '../components/Text';
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
          <AppText.Sans preset="body" color={theme.ink} style={styles.backText}>←</AppText.Sans>
        </TouchableOpacity>
        <AppText.Serif preset="heroSerif" color={theme.ink}>Match History</AppText.Serif>
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
                <AppText.Mono preset="chipLabel" color={outcomeColor(item.outcome)}>
                  {item.outcome}
                </AppText.Mono>
              </View>
              <View style={styles.matchInfo}>
                <View style={styles.opponentRow}>
                  <AppText.Sans preset="bodyMed" color={theme.ink} numberOfLines={1} style={styles.opponentName}>
                    {item.opponent.displayName ?? 'Anonymous'}
                  </AppText.Sans>
                  <TierBadge tier={item.opponent.rankTier} small />
                </View>
                <AppText.Sans preset="small" color={theme.ink3}>
                  {formatDate(item.finishedAt)} · {formatDuration(item.durationSeconds)}
                  {item.status === 'forfeited' ? ' · Forfeit' : ''}
                </AppText.Sans>
              </View>
              <View style={styles.rightCol}>
                <AppText.Mono preset="mono" color={theme.ink} style={styles.score}>{item.yourScore}–{item.opponentScore}</AppText.Mono>
                <AppText.Mono preset="mono" color={item.yourEloChange > 0 ? theme.accent : item.yourEloChange < 0 ? theme.coral : theme.ink3}>
                  {item.yourEloChange > 0 ? '+' : ''}{item.yourEloChange}
                </AppText.Mono>
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
              <AppText.Sans preset="bodyMed" color={theme.ink}>No matches yet.</AppText.Sans>
              <AppText.Sans preset="body" color={theme.ink2}>
                Play your first duel to see history here.
              </AppText.Sans>
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
  matchInfo: { flex: 1, gap: 4 },
  opponentRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  opponentName: { flexShrink: 1 },
  rightCol: { alignItems: 'flex-end', gap: 2 },
  score: {},
  footerLoader: { paddingVertical: 16 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
});
