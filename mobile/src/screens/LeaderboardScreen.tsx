import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { leaderboardService } from '../services/leaderboard';
import TierBadge from '../components/TierBadge';
import { useTheme } from '../theme/ThemeProvider';

type Tab = 'global' | 'around' | 'tier';
const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  eloRating: number;
  rankTier: string;
  gamesPlayed: number;
  isCurrentUser: boolean;
}

interface LeaderboardData {
  entries: LeaderboardEntry[];
  currentUserRank: number | null;
  totalRanked: number;
}

function getMedal(rank: number) {
  if (rank === 1) return '👑';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const { theme } = useTheme();
  const medal = getMedal(entry.rank);
  return (
    <View style={[
      styles.row,
      { borderBottomColor: theme.borderLight },
      entry.isCurrentUser && { backgroundColor: theme.surfaceHighlight },
    ]}>
      <Text style={[styles.rank, { color: theme.text }]}>{medal ?? `#${entry.rank}`}</Text>
      <View style={styles.nameCol}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {entry.displayName}
          {entry.isCurrentUser ? '  (You)' : ''}
        </Text>
        <TierBadge tier={entry.rankTier} small />
      </View>
      <Text style={[styles.elo, { color: theme.text }]}>{entry.eloRating}</Text>
    </View>
  );
}

export default function LeaderboardScreen() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('global');
  const [selectedTier, setSelectedTier] = useState('SILVER');
  const [tierPickerVisible, setTierPickerVisible] = useState(false);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (tab: Tab, tier: string) => {
    try {
      let res;
      if (tab === 'global') res = await leaderboardService.getGlobal();
      else if (tab === 'around') res = await leaderboardService.getAroundMe();
      else res = await leaderboardService.getTier(tier);
      setData(res.data.data);
    } catch {
      setData(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData(activeTab, selectedTier).finally(() => setLoading(false));
    }, [activeTab, selectedTier, fetchData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(activeTab, selectedTier);
    setRefreshing(false);
  }, [activeTab, selectedTier, fetchData]);

  function switchTab(tab: Tab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setData(null);
  }

  const gamesNeeded = activeTab !== 'tier' && data?.currentUserRank == null
    ? 5 - (data?.entries.find(e => e.isCurrentUser)?.gamesPlayed ?? 0)
    : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Leaderboard</Text>
      </View>

      <View style={styles.tabs}>
        {(['global', 'around', 'tier'] as Tab[]).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === 'global' ? 'Global' : tab === 'around' ? 'Around Me'
            : isActive ? `${selectedTier} ▾` : 'By Tier ▾';
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab,
                { backgroundColor: isActive ? theme.primary : theme.surfaceHighlight },
              ]}
              onPress={() => {
                if (tab !== activeTab) switchTab(tab);
                else if (tab === 'tier') setTierPickerVisible(true);
              }}
            >
              <Text style={[styles.tabText, { color: isActive ? theme.primaryFg : theme.textSecondary }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {data?.currentUserRank != null && (
        <View style={[styles.rankBanner, { backgroundColor: theme.successBg }]}>
          <Text style={[styles.rankBannerText, { color: theme.successText }]}>
            Your rank: #{data.currentUserRank} of {data.totalRanked}
          </Text>
        </View>
      )}

      {data != null && data.currentUserRank == null && gamesNeeded != null && gamesNeeded > 0 && (
        <View style={[styles.unrankedBanner, { backgroundColor: theme.warningBg }]}>
          <Text style={[styles.unrankedText, { color: theme.warningText }]}>
            Play {gamesNeeded} more match{gamesNeeded !== 1 ? 'es' : ''} to join the leaderboard
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={theme.text} />
      ) : (
        <FlatList
          data={data?.entries ?? []}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => <LeaderboardRow entry={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.text }]}>No players ranked yet.</Text>
              <Text style={[styles.emptySubText, { color: theme.textSecondary }]}>
                Play 5 matches to join the leaderboard.
              </Text>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}

      <Modal visible={tierPickerVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTierPickerVisible(false)}
        >
          <View style={[styles.tierPicker, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={[styles.tierPickerTitle, { color: theme.text }]}>Select Tier</Text>
            {TIERS.map((tier) => (
              <TouchableOpacity
                key={tier}
                style={[
                  styles.tierOption,
                  selectedTier === tier && { backgroundColor: theme.surfaceHighlight },
                ]}
                onPress={() => {
                  setSelectedTier(tier);
                  setActiveTab('tier');
                  setData(null);
                  setTierPickerVisible(false);
                }}
              >
                <TierBadge tier={tier} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800' },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabText: { fontSize: 12, fontWeight: '600' },
  rankBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  rankBannerText: { fontSize: 13, fontWeight: '600' },
  unrankedBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  unrankedText: { fontSize: 13, fontWeight: '600' },
  loader: { flex: 1, marginTop: 60 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  rank: { fontSize: 16, fontWeight: '700', width: 36 },
  nameCol: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '600' },
  elo: { fontSize: 16, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubText: { fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierPicker: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    width: 260,
    gap: 10,
  },
  tierPickerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  tierOption: { padding: 8, borderRadius: 8, alignItems: 'flex-start' },
});
