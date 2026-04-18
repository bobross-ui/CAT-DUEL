import { useState, useCallback } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { leaderboardService } from '../services/leaderboard';
import TierBadge from '../components/TierBadge';
import AppText from '../components/Text';
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
      { borderBottomColor: theme.line2 },
      entry.isCurrentUser && { backgroundColor: theme.bg2 },
    ]}>
      <AppText.Mono preset="mono" color={theme.ink} style={styles.rank}>{medal ?? `#${entry.rank}`}</AppText.Mono>
      <View style={styles.nameCol}>
        <AppText.Sans preset="bodyMed" color={theme.ink} numberOfLines={1}>
          {entry.displayName}
          {entry.isCurrentUser ? '  (You)' : ''}
        </AppText.Sans>
        <TierBadge tier={entry.rankTier} small />
      </View>
      <AppText.Mono preset="mono" color={theme.ink} style={styles.elo}>{entry.eloRating}</AppText.Mono>
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
        <AppText.Serif preset="heroSerif" color={theme.ink}>Leaderboard</AppText.Serif>
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
                { backgroundColor: isActive ? theme.ink : theme.bg2 },
              ]}
              onPress={() => {
                if (tab !== activeTab) switchTab(tab);
                else if (tab === 'tier') setTierPickerVisible(true);
              }}
            >
              <AppText.Mono preset="chipLabel" color={isActive ? theme.bg : theme.ink2}>
                {label}
              </AppText.Mono>
            </TouchableOpacity>
          );
        })}
      </View>

      {data?.currentUserRank != null && (
        <View style={[styles.rankBanner, { backgroundColor: theme.accentSoft }]}>
          <AppText.Sans preset="label" color={theme.accentDeep}>
            Your rank: #{data.currentUserRank} of {data.totalRanked}
          </AppText.Sans>
        </View>
      )}

      {data != null && data.currentUserRank == null && gamesNeeded != null && gamesNeeded > 0 && (
        <View style={[styles.unrankedBanner, { backgroundColor: theme.amberSoft }]}>
          <AppText.Sans preset="label" color={theme.amberDeep}>
            Play {gamesNeeded} more match{gamesNeeded !== 1 ? 'es' : ''} to join the leaderboard
          </AppText.Sans>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color={theme.ink} />
      ) : (
        <FlatList
          data={data?.entries ?? []}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => <LeaderboardRow entry={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText.Sans preset="bodyMed" color={theme.ink}>No players ranked yet.</AppText.Sans>
              <AppText.Sans preset="body" color={theme.ink2}>
                Play 5 matches to join the leaderboard.
              </AppText.Sans>
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
          <View style={[styles.tierPicker, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.tierPickerTitle}>Select Tier</AppText.Serif>
            {TIERS.map((tier) => (
              <TouchableOpacity
                key={tier}
                style={[
                  styles.tierOption,
                  selectedTier === tier && { backgroundColor: theme.bg2 },
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
  rankBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  unrankedBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  loader: { flex: 1, marginTop: 60 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  rank: { width: 36 },
  nameCol: { flex: 1, gap: 4 },
  elo: {},
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
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
  tierPickerTitle: { marginBottom: 4 },
  tierOption: { padding: 8, borderRadius: 8, alignItems: 'flex-start' },
});
