import { useState, useCallback } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { leaderboardService } from '../services/leaderboard';
import TierBadge from '../components/TierBadge';
import Avatar from '../components/Avatar';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import { MainTabParamList } from '../navigation';

type Props = BottomTabScreenProps<MainTabParamList, 'Ranks'>;

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
  if (rank === 1) return '🥇';
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
      { backgroundColor: theme.card, borderColor: entry.isCurrentUser ? theme.accent : theme.line },
      entry.isCurrentUser && { backgroundColor: theme.accentSoft },
    ]}>
      {/* Rank */}
      <View style={styles.rankCol}>
        {medal
          ? <AppText.Sans preset="body" style={styles.medalGlyph}>{medal}</AppText.Sans>
          : <AppText.Mono preset="mono" color={theme.ink3}>#{entry.rank}</AppText.Mono>}
      </View>

      {/* Avatar */}
      <Avatar
        name={entry.displayName}
        size="sm"
        variant={entry.isCurrentUser ? 'you' : 'opponent'}
      />

      {/* Name + badge */}
      <View style={styles.nameCol}>
        <AppText.Serif
          preset="italic"
          color={theme.ink}
          numberOfLines={1}
          style={styles.nameText}
        >
          {entry.displayName}{entry.isCurrentUser ? ' (You)' : ''}
        </AppText.Serif>
        <TierBadge tier={entry.rankTier} small />
      </View>

      {/* Rating */}
      <AppText.Mono preset="mono" color={theme.ink2}>◆ {entry.eloRating}</AppText.Mono>
    </View>
  );
}

export default function LeaderboardScreen(_: Props) {
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
    ? Math.max(0, 5 - (data?.entries.find(e => e.isCurrentUser)?.gamesPlayed ?? 0))
    : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <AppText.Serif preset="heroSerif" color={theme.ink}>Ranks</AppText.Serif>
      </View>

      {/* ── Tab control ── */}
      <View style={[styles.tabs, { borderBottomColor: theme.line }]}>
        {(['global', 'around', 'tier'] as Tab[]).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === 'global' ? 'Global'
            : tab === 'around' ? 'Around Me'
            : isActive ? `${selectedTier[0]}${selectedTier.slice(1).toLowerCase()} ▾` : 'By Tier ▾';
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && [styles.tabActive, { borderBottomColor: theme.ink }]]}
              onPress={() => {
                if (tab !== activeTab) switchTab(tab);
                else if (tab === 'tier') setTierPickerVisible(true);
              }}
            >
              <AppText.Mono
                preset="chipLabel"
                color={isActive ? theme.ink : theme.ink3}
                style={styles.tabLabel}
              >
                {label.toUpperCase()}
              </AppText.Mono>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Rank banner ── */}
      {data?.currentUserRank != null && (
        <View style={[styles.rankBanner, { backgroundColor: theme.accentSoft }]}>
          <AppText.Mono preset="eyebrow" color={theme.accentDeep}>
            YOUR RANK · #{data.currentUserRank} OF {data.totalRanked}
          </AppText.Mono>
        </View>
      )}

      {/* ── Unranked nudge ── */}
      {data != null && data.currentUserRank == null && gamesNeeded != null && gamesNeeded > 0 && (
        <View style={[styles.rankBanner, { backgroundColor: theme.bg2 }]}>
          <AppText.Mono preset="eyebrow" color={theme.ink3}>
            PLAY {gamesNeeded} MORE MATCH{gamesNeeded !== 1 ? 'ES' : ''} TO EARN YOUR RANK
          </AppText.Mono>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={theme.ink3} />
      ) : (
        <FlatList
          data={data?.entries ?? []}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => <LeaderboardRow entry={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.emptyHeading}>
                {activeTab === 'tier' ? 'Be the first.' : 'Play a few matches\nto earn your rank.'}
              </AppText.Serif>
              <AppText.Sans preset="body" color={theme.ink3} style={styles.emptyBody}>
                {activeTab === 'tier'
                  ? `No ${selectedTier[0]}${selectedTier.slice(1).toLowerCase()} players yet.`
                  : 'Your position appears here once you have 5 matches.'}
              </AppText.Sans>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}

      {/* ── Tier picker modal ── */}
      <Modal visible={tierPickerVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTierPickerVisible(false)}
        >
          <View style={[styles.tierPicker, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.tierPickerTitle}>
              SELECT TIER
            </AppText.Mono>
            {TIERS.map((tier) => (
              <TouchableOpacity
                key={tier}
                style={[
                  styles.tierOption,
                  selectedTier === tier && { backgroundColor: theme.accentSoft },
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
    paddingBottom: 12,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomWidth: 2 },
  tabLabel: {},

  // Banners
  rankBanner: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },

  // List
  loader: { flex: 1, marginTop: 60 },
  list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  rankCol: { width: 32, alignItems: 'center' },
  medalGlyph: { fontSize: 18 },
  nameCol: { flex: 1, gap: 4 },
  nameText: { fontSize: 15, lineHeight: 18 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 20 },
  emptyHeading: { textAlign: 'center' },
  emptyBody: { textAlign: 'center' },

  // Modal
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
