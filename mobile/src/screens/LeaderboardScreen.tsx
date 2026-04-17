import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { leaderboardService } from '../services/leaderboard';
import TierBadge from '../components/TierBadge';

type Props = NativeStackScreenProps<RootStackParamList, 'Leaderboard'>;

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
  const medal = getMedal(entry.rank);
  return (
    <View style={[styles.row, entry.isCurrentUser && styles.rowHighlighted]}>
      <Text style={styles.rank}>{medal ?? `#${entry.rank}`}</Text>
      <View style={styles.nameCol}>
        <Text style={styles.name} numberOfLines={1}>
          {entry.displayName}
          {entry.isCurrentUser ? '  (You)' : ''}
        </Text>
        <TierBadge tier={entry.rankTier} small />
      </View>
      <Text style={styles.elo}>{entry.eloRating}</Text>
    </View>
  );
}

export default function LeaderboardScreen({ route, navigation }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('global');
  const [selectedTier, setSelectedTier] = useState(route.params.userTier);
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Leaderboard</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'global' && styles.tabActive]}
          onPress={() => switchTab('global')}
        >
          <Text style={[styles.tabText, activeTab === 'global' && styles.tabTextActive]}>
            Global
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'around' && styles.tabActive]}
          onPress={() => switchTab('around')}
        >
          <Text style={[styles.tabText, activeTab === 'around' && styles.tabTextActive]}>
            Around Me
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tier' && styles.tabActive]}
          onPress={() => {
            if (activeTab !== 'tier') switchTab('tier');
            else setTierPickerVisible(true);
          }}
        >
          <Text style={[styles.tabText, activeTab === 'tier' && styles.tabTextActive]}>
            {activeTab === 'tier' ? selectedTier : 'By Tier'} ▾
          </Text>
        </TouchableOpacity>
      </View>

      {/* Your rank banner */}
      {data?.currentUserRank != null && (
        <View style={styles.rankBanner}>
          <Text style={styles.rankBannerText}>
            Your rank: #{data.currentUserRank} of {data.totalRanked}
          </Text>
        </View>
      )}

      {/* Unranked nudge */}
      {data != null && data.currentUserRank == null && gamesNeeded != null && gamesNeeded > 0 && (
        <View style={styles.unrankedBanner}>
          <Text style={styles.unrankedText}>
            Play {gamesNeeded} more match{gamesNeeded !== 1 ? 'es' : ''} to join the leaderboard
          </Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#1a1a1a" />
      ) : (
        <FlatList
          data={data?.entries ?? []}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => <LeaderboardRow entry={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No players ranked yet.</Text>
              <Text style={styles.emptySubText}>Play 5 matches to join the leaderboard.</Text>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}

      {/* Tier picker modal */}
      <Modal visible={tierPickerVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTierPickerVisible(false)}
        >
          <View style={styles.tierPicker}>
            <Text style={styles.tierPickerTitle}>Select Tier</Text>
            {TIERS.map((tier) => (
              <TouchableOpacity
                key={tier}
                style={[styles.tierOption, selectedTier === tier && styles.tierOptionActive]}
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
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 24, color: '#1a1a1a' },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
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
    backgroundColor: '#f3f4f6',
  },
  tabActive: { backgroundColor: '#1a1a1a' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#666' },
  tabTextActive: { color: '#fff' },
  rankBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  rankBannerText: { fontSize: 13, fontWeight: '600', color: '#15803d' },
  unrankedBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#fef9c3',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  unrankedText: { fontSize: 13, fontWeight: '600', color: '#854d0e' },
  loader: { flex: 1, marginTop: 60 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  rowHighlighted: { backgroundColor: '#fafafa', marginHorizontal: -20, paddingHorizontal: 20 },
  rank: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', width: 36 },
  nameCol: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  elo: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  emptySubText: { fontSize: 14, color: '#888' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierPicker: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: 260,
    gap: 10,
  },
  tierPickerTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  tierOption: { padding: 8, borderRadius: 8, alignItems: 'flex-start' },
  tierOptionActive: { backgroundColor: '#f3f4f6' },
});
