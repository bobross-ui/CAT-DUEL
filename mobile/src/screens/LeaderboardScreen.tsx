import { useEffect, useState, useCallback } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet,
  Modal, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { leaderboardService } from '../services/leaderboard';
import { MainTabParamList } from '../navigation';
import TierBadge from '../components/TierBadge';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import ShareLinkModal from '../components/ShareLinkModal';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import AppText from '../components/Text';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';
import { leaderboardUrl } from '../navigation/linking';
import { track } from '../services/analytics';
type Tab = 'global' | 'around' | 'tier';
const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

type Props = BottomTabScreenProps<MainTabParamList, 'Ranks'>;

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

function normalizeTier(tier?: string) {
  const upper = tier?.toUpperCase();
  return upper && TIERS.includes(upper) ? upper : null;
}

export default function LeaderboardScreen({ route }: Props) {
  const { theme } = useTheme();
  const { playHaptic } = useAppPreferences();
  const initialTier = normalizeTier(route.params?.tier);
  const [activeTab, setActiveTab] = useState<Tab>(initialTier ? 'tier' : 'global');
  const [selectedTier, setSelectedTier] = useState(initialTier ?? 'SILVER');
  const [tierPickerVisible, setTierPickerVisible] = useState(false);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [shareVisible, setShareVisible] = useState(false);

  const fetchData = useCallback(async (tab: Tab, tier: string) => {
    try {
      let res;
      if (tab === 'global') res = await leaderboardService.getGlobal();
      else if (tab === 'around') res = await leaderboardService.getAroundMe();
      else res = await leaderboardService.getTier(tier);
      setData(res.data.data);
      setError('');
    } catch {
      setData(null);
      setError('Failed to load ranks.');
    }
  }, []);

  useEffect(() => {
    const nextTier = normalizeTier(route.params?.tier);
    if (!nextTier) return;
    setSelectedTier(nextTier);
    setActiveTab('tier');
    setData(null);
  }, [route.params?.tier]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData(activeTab, selectedTier).finally(() => setLoading(false));
    }, [activeTab, selectedTier, fetchData]),
  );

  const onRefresh = useCallback(async () => {
    void playHaptic('pull_refresh');
    setRefreshing(true);
    await fetchData(activeTab, selectedTier);
    setRefreshing(false);
  }, [activeTab, selectedTier, fetchData, playHaptic]);

  function switchTab(tab: Tab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setData(null);
  }

  function openShareRanks() {
    const tier = activeTab === 'tier' ? selectedTier : undefined;
    track('share_initiated', { surface: 'leaderboard', tier: tier ?? null });
    setShareVisible(true);
  }

  const retry = useCallback(() => {
    setError('');
    setLoading(true);
    fetchData(activeTab, selectedTier).finally(() => setLoading(false));
  }, [activeTab, fetchData, selectedTier]);

  const gamesNeeded = activeTab !== 'tier' && data?.currentUserRank == null
    ? Math.max(0, 5 - (data?.entries.find(e => e.isCurrentUser)?.gamesPlayed ?? 0))
    : null;

  return (
    <ScreenTransitionView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <AppText.Serif preset="heroSerif" color={theme.ink}>Ranks</AppText.Serif>
        <TouchableOpacity
          onPress={openShareRanks}
          style={[styles.shareBtn, { borderColor: theme.line, backgroundColor: theme.card }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Share leaderboard"
        >
          <AppText.Mono preset="eyebrow" color={theme.ink2}>SHARE</AppText.Mono>
        </TouchableOpacity>
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
              accessibilityRole="tab"
              accessibilityLabel={`${label} leaderboard`}
              accessibilityState={{ selected: isActive }}
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
        <View style={styles.list}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} style={styles.loadingRow}>
              <SkeletonBlock height={18} width={32} />
              <SkeletonBlock height={36} width={36} radius={18} />
              <View style={{ flex: 1, gap: 6 }}>
                <SkeletonBlock height={16} width={i % 2 === 0 ? '68%' : '52%'} />
                <SkeletonBlock height={14} width="32%" />
              </View>
              <SkeletonBlock height={16} width={56} />
            </SkeletonCard>
          ))}
        </View>
      ) : error ? (
        <View style={styles.errorState}>
          <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.errorHeading}>Couldn't load.</AppText.Serif>
          <AppText.Sans preset="body" color={theme.ink3} style={styles.errorBody}>Check your connection and try again.</AppText.Sans>
          <Button label="Retry" onPress={retry} style={styles.retryBtn} />
        </View>
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
                {activeTab === 'tier'
                  ? `Be the first ${selectedTier[0]}${selectedTier.slice(1).toLowerCase()}.`
                  : 'Play a few matches\nto earn your rank.'}
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
      <Modal visible={tierPickerVisible} transparent animationType="fade" onRequestClose={() => setTierPickerVisible(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTierPickerVisible(false)}
          accessibilityViewIsModal
          accessibilityLabel="Select leaderboard tier"
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
                accessibilityRole="button"
                accessibilityLabel={`Show ${tier.toLowerCase()} leaderboard`}
                accessibilityState={{ selected: selectedTier === tier }}
              >
                <TierBadge tier={tier} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <ShareLinkModal
        visible={shareVisible}
        title="CAT Duel ranks"
        message={
          activeTab === 'tier'
            ? `Climb the ${selectedTier.toLowerCase()} ranks on CAT Duel:`
            : 'Climb the CAT Duel ranks:'
        }
        url={leaderboardUrl(activeTab === 'tier' ? selectedTier : undefined)}
        onClose={() => setShareVisible(false)}
      />
    </ScreenTransitionView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  shareBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    paddingVertical: 12,
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
