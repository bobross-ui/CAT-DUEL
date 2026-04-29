import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import DesktopFrame from '../components/web/DesktopFrame';
import PageContainer from '../components/web/PageContainer';
import EyebrowLabel from '../components/web/EyebrowLabel';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import Text from '../components/Text';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { leaderboardService } from '../services/leaderboard';
import { useTheme } from '../theme/ThemeProvider';
import { tierColors } from '../theme/tokens';
import MobileLeaderboardScreen from './LeaderboardScreen.mobile';

type Props = ComponentProps<typeof MobileLeaderboardScreen>;
type RankView = 'global' | 'around' | 'tier';
type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  eloRating: number;
  rankTier: Tier;
  gamesPlayed: number;
  winRate: number;
  isCurrentUser: boolean;
}

interface LeaderboardData {
  entries: LeaderboardEntry[];
  currentUserRank: number | null;
  totalRanked: number;
  tierCounts?: Record<Tier, number>;
}

const TIERS: Tier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
const PAGE_SIZE = 10;
const TIER_RANGES: Record<Tier, string> = {
  BRONZE: '0-999',
  SILVER: '1000-1299',
  GOLD: '1300-1599',
  PLATINUM: '1600-1899',
  DIAMOND: '1900+',
};

function normalizeTier(tier?: string): Tier | null {
  const upper = tier?.toUpperCase();
  return upper && TIERS.includes(upper as Tier) ? upper as Tier : null;
}

function titleCaseTier(tier: string) {
  return tier[0] + tier.slice(1).toLowerCase();
}

function formatWinRate(value: number | undefined) {
  if (value == null) return '-';
  return `${Math.round(value * 100)}%`;
}

function rankLabel(data: LeaderboardData | null) {
  if (!data) return 'Loading rank';
  if (data.currentUserRank != null) return `Your rank #${data.currentUserRank}`;
  const currentEntry = data.entries.find((entry) => entry.isCurrentUser);
  const gamesNeeded = Math.max(0, 5 - (currentEntry?.gamesPlayed ?? 0));
  return gamesNeeded > 0 ? `Play ${gamesNeeded} more matches to rank` : 'Play more matches to rank';
}

function PodiumPlayer({ entry, place }: { entry: LeaderboardEntry; place: 1 | 2 | 3 }) {
  const { theme } = useTheme();
  const avatarSize = place === 1 ? 'xl' as const : 'lg' as const;
  const blockHeight = place === 1 ? 110 : place === 2 ? 80 : 50;

  return (
    <View style={styles.podiumPlayer}>
      <View
        style={[
          styles.podiumAvatar,
          place === 1 && { borderColor: tierColors.GOLD, borderWidth: 3 },
        ]}
      >
        <Avatar name={entry.displayName} size={avatarSize} variant={entry.isCurrentUser ? 'you' : 'opponent'} />
      </View>
      <Text.Sans preset="label" color={theme.ink} numberOfLines={1} style={styles.podiumName}>
        {entry.displayName}
      </Text.Sans>
      <Text.Mono preset="chipLabel" color={theme.ink3}>RATING {entry.eloRating}</Text.Mono>
      <View
        style={[
          styles.podiumBlock,
          {
            height: blockHeight,
            backgroundColor: place === 1 ? theme.ink : theme.bg2,
            borderColor: theme.line,
          },
        ]}
      >
        <Text.Serif preset="h1Serif" color={place === 1 ? theme.bg : theme.ink}>{place}</Text.Serif>
      </View>
    </View>
  );
}

function EmptyPodiumSlot({ place }: { place: 1 | 2 | 3 }) {
  const { theme } = useTheme();
  const blockHeight = place === 1 ? 110 : place === 2 ? 80 : 50;

  return (
    <View style={styles.podiumPlayer}>
      <View style={[styles.emptyAvatar, { backgroundColor: theme.bg2, borderColor: theme.line }]} />
      <Text.Sans preset="label" color={theme.ink3}>Open seat</Text.Sans>
      <Text.Mono preset="chipLabel" color={theme.ink4}>PLAY TO CLAIM</Text.Mono>
      <View style={[styles.podiumBlock, { height: blockHeight, backgroundColor: theme.bg2, borderColor: theme.line }]}>
        <Text.Serif preset="h1Serif" color={theme.ink3}>{place}</Text.Serif>
      </View>
    </View>
  );
}

function LeaderboardTable({
  entries,
  emptyTitle,
}: {
  entries: LeaderboardEntry[];
  emptyTitle: string;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.table, { borderColor: theme.line }]}>
      <View style={[styles.tableHeader, { backgroundColor: theme.bg2, borderBottomColor: theme.line }]}>
        <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.rankCell}>#</Text.Mono>
        <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.playerHeaderCell}>PLAYER</Text.Mono>
        <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.ratingCell}>RATING</Text.Mono>
        <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.tierCell}>TIER</Text.Mono>
        <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.winCell}>WIN %</Text.Mono>
        <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.matchesCell}>MATCHES</Text.Mono>
      </View>

      {entries.length === 0 ? (
        <View style={styles.emptyTable}>
          <Text.Serif preset="h1Serif" color={theme.ink}>{emptyTitle}</Text.Serif>
          <Text.Sans preset="small" color={theme.ink3}>Ranked players appear here after five matches.</Text.Sans>
        </View>
      ) : entries.map((entry) => (
        <View
          key={`${entry.userId}-${entry.rank}`}
          style={[
            styles.tableRow,
            { borderBottomColor: theme.line2 },
            entry.isCurrentUser && { backgroundColor: theme.accentSoft },
          ]}
        >
          <Text.Mono preset="mono" color={entry.rank <= 3 ? theme.accentDeep : theme.ink3} style={styles.rankCell}>
            #{entry.rank}
          </Text.Mono>
          <View style={styles.playerCell}>
            <Avatar name={entry.displayName} size="sm" variant={entry.isCurrentUser ? 'you' : 'opponent'} />
            <View style={styles.playerNameWrap}>
              <Text.Sans preset="label" color={theme.ink} numberOfLines={1}>
                {entry.displayName}{entry.isCurrentUser ? ' · you' : ''}
              </Text.Sans>
            </View>
          </View>
          <Text.Serif preset="statVal" color={theme.ink} style={styles.ratingCell}>{entry.eloRating}</Text.Serif>
          <Text.Sans preset="small" color={theme.ink2} style={styles.tierCell}>{titleCaseTier(entry.rankTier)}</Text.Sans>
          <Text.Mono preset="mono" color={theme.ink2} style={styles.winCell}>{formatWinRate(entry.winRate)}</Text.Mono>
          <Text.Mono preset="mono" color={theme.ink2} style={styles.matchesCell}>{entry.gamesPlayed}</Text.Mono>
        </View>
      ))}
    </View>
  );
}

export default function LeaderboardScreenDesktop({ route }: Props) {
  const { theme } = useTheme();
  const { user } = useCurrentProfile();
  const initialTier = normalizeTier(route.params?.tier);
  const [activeView, setActiveView] = useState<RankView>(initialTier ? 'tier' : 'global');
  const [selectedTier, setSelectedTier] = useState<Tier>(initialTier ?? 'SILVER');
  const [globalData, setGlobalData] = useState<LeaderboardData | null>(null);
  const [tableData, setTableData] = useState<LeaderboardData | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useDocumentTitle('Leaderboard · CAT Duel');

  const podiumEntries = useMemo(() => {
    const entries = globalData?.entries ?? [];
    return [2, 1, 3].map((rank) => entries.find((entry) => entry.rank === rank) ?? null);
  }, [globalData?.entries]);

  const callerTier = normalizeTier(user?.rankTier);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const globalRes = await leaderboardService.getGlobal();
      const tableRes = activeView === 'global'
        ? globalRes
        : activeView === 'around'
          ? await leaderboardService.getAroundMe()
          : await leaderboardService.getTier(selectedTier);

      setGlobalData(globalRes.data.data);
      setTableData(tableRes.data.data);
      setError('');
    } catch {
      setGlobalData(null);
      setTableData(null);
      setError('Failed to load leaderboard.');
    } finally {
      setLoading(false);
    }
  }, [activeView, selectedTier]);

  useEffect(() => {
    const nextTier = normalizeTier(route.params?.tier);
    if (!nextTier) return;
    setSelectedTier(nextTier);
    setActiveView('tier');
  }, [route.params?.tier]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(0);
  }, [activeView, selectedTier]);

  const tableEntries = tableData?.entries ?? [];
  const shouldPaginate = activeView !== 'around' && tableEntries.length > PAGE_SIZE;
  const totalPages = shouldPaginate ? Math.ceil(tableEntries.length / PAGE_SIZE) : 1;
  const pageIndex = Math.min(page, totalPages - 1);
  const visibleEntries = shouldPaginate
    ? tableEntries.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE)
    : tableEntries;

  const activeLabel = activeView === 'global'
    ? 'Global ranks'
    : activeView === 'around'
      ? 'Around me'
      : `${titleCaseTier(selectedTier)} tier`;
  const emptyTitle = activeView === 'tier'
    ? `No ${titleCaseTier(selectedTier)} players yet.`
    : 'No ranked table yet.';

  return (
    <DesktopFrame activeRoute="Ranks">
      <PageContainer style={styles.page}>
        <View style={[styles.headerStrip, { borderBottomColor: theme.line }]}>
          <View style={styles.titleBlock}>
            <Text.Serif preset="display" color={theme.ink} style={styles.title}>Leaderboard</Text.Serif>
            <Text.Mono preset="mono" color={theme.ink3}>season 04 · day 18 of 30 · resets in 12d</Text.Mono>
          </View>

          <View style={styles.headerActions}>
            <View style={[styles.scopeControl, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
              <Pressable
                onPress={() => setActiveView('global')}
                accessibilityRole="button"
                accessibilityLabel="Show global leaderboard"
                accessibilityState={{ selected: activeView === 'global' }}
                style={[
                  styles.scopeOption,
                  activeView === 'global' && { backgroundColor: theme.card, borderColor: theme.line },
                ]}
              >
                <Text.Mono preset="chipLabel" color={activeView === 'global' ? theme.ink : theme.ink3}>GLOBAL</Text.Mono>
              </Pressable>
              <Pressable
                onPress={() => setActiveView('around')}
                accessibilityRole="button"
                accessibilityLabel="Show around me leaderboard"
                accessibilityState={{ selected: activeView === 'around' }}
                style={[
                  styles.scopeOption,
                  activeView === 'around' && { backgroundColor: theme.card, borderColor: theme.line },
                ]}
              >
                <Text.Mono preset="chipLabel" color={activeView === 'around' ? theme.ink : theme.ink3}>AROUND ME</Text.Mono>
              </Pressable>
            </View>
            <View style={[styles.rankPill, { backgroundColor: theme.accentSoft }]}>
              <Text.Mono preset="chipLabel" color={theme.accentDeep}>{rankLabel(globalData).toUpperCase()}</Text.Mono>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.bodyGrid}>
            <SkeletonCard style={styles.leftPanelLoading}>
              <SkeletonBlock height={14} width="32%" />
              <SkeletonBlock height={180} width="100%" />
              <SkeletonBlock height={14} width="28%" />
              {[0, 1, 2, 3, 4].map((item) => <SkeletonBlock key={item} height={42} width="100%" />)}
            </SkeletonCard>
            <SkeletonCard style={styles.rankPanel}>
              <SkeletonBlock height={18} width="36%" />
              {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => <SkeletonBlock key={item} height={44} width="100%" />)}
            </SkeletonCard>
          </View>
        ) : error ? (
          <Card style={styles.errorCard}>
            <Text.Serif preset="h1Serif" color={theme.ink}>Couldn't load leaderboard.</Text.Serif>
            <Text.Sans preset="body" color={theme.ink3}>Check your connection and try again.</Text.Sans>
            <Button label="Retry" onPress={fetchData} style={styles.retryButton} />
          </Card>
        ) : (
          <View style={styles.bodyGrid}>
            <Card style={[styles.leftPanel, { backgroundColor: theme.bg2 }]}>
              <EyebrowLabel>Global top 3</EyebrowLabel>
              <View style={styles.podium}>
                {podiumEntries.map((entry, index) => {
                  const place = [2, 1, 3][index] as 1 | 2 | 3;
                  return entry
                    ? <PodiumPlayer key={place} entry={entry} place={place} />
                    : <EmptyPodiumSlot key={place} place={place} />;
                })}
              </View>

              <EyebrowLabel>Tier ladder</EyebrowLabel>
              <View style={styles.ladder}>
                {[...TIERS].reverse().map((tier) => {
                  const isCallerTier = callerTier === tier;
                  const isSelected = activeView === 'tier' && selectedTier === tier;
                  return (
                    <Pressable
                      key={tier}
                      onPress={() => {
                        setSelectedTier(tier);
                        setActiveView('tier');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${titleCaseTier(tier)} leaderboard`}
                      accessibilityState={{ selected: isSelected }}
                      style={[
                        styles.ladderRow,
                        { backgroundColor: theme.card, borderColor: isCallerTier ? theme.accent : theme.line },
                        isCallerTier && { backgroundColor: theme.accentSoft, borderStyle: 'dashed' },
                        isSelected && { borderColor: theme.ink, borderStyle: 'solid' },
                      ]}
                    >
                      <View style={[styles.tierDot, { backgroundColor: tierColors[tier] }]} />
                      <View style={styles.ladderName}>
                        <Text.Sans preset="label" color={theme.ink}>
                          {titleCaseTier(tier)}{isCallerTier ? ' · you' : ''}
                        </Text.Sans>
                        <Text.Mono preset="chipLabel" color={theme.ink3}>{TIER_RANGES[tier]}</Text.Mono>
                      </View>
                      <Text.Mono preset="mono" color={theme.ink2}>
                        {globalData?.tierCounts?.[tier] ?? 0}
                      </Text.Mono>
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            <Card style={styles.rankPanel}>
              <View style={styles.rankPanelHeader}>
                <View>
                  <EyebrowLabel>Rank table</EyebrowLabel>
                  <Text.Serif preset="h1Serif" color={theme.ink}>{activeLabel}</Text.Serif>
                </View>
                {shouldPaginate ? (
                  <Text.Mono preset="chipLabel" color={theme.ink3}>
                    {pageIndex * PAGE_SIZE + 1}-{Math.min((pageIndex + 1) * PAGE_SIZE, tableEntries.length)} OF {tableEntries.length}
                  </Text.Mono>
                ) : null}
              </View>
              <LeaderboardTable entries={visibleEntries} emptyTitle={emptyTitle} />
              {shouldPaginate ? (
                <View style={styles.paginationRow}>
                  <Pressable
                    onPress={() => setPage((current) => Math.max(0, current - 1))}
                    disabled={pageIndex === 0}
                    accessibilityRole="button"
                    accessibilityLabel="Show previous leaderboard page"
                    style={[
                      styles.pageButton,
                      { borderColor: theme.line, opacity: pageIndex === 0 ? 0.4 : 1 },
                    ]}
                  >
                    <Text.Mono preset="chipLabel" color={theme.ink2}>PREV</Text.Mono>
                  </Pressable>
                  <Text.Mono preset="chipLabel" color={theme.ink3}>
                    PAGE {pageIndex + 1} OF {totalPages}
                  </Text.Mono>
                  <Pressable
                    onPress={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                    disabled={pageIndex >= totalPages - 1}
                    accessibilityRole="button"
                    accessibilityLabel="Show next leaderboard page"
                    style={[
                      styles.pageButton,
                      { borderColor: theme.line, opacity: pageIndex >= totalPages - 1 ? 0.4 : 1 },
                    ]}
                  >
                    <Text.Mono preset="chipLabel" color={theme.ink2}>NEXT</Text.Mono>
                  </Pressable>
                </View>
              ) : null}
            </Card>
          </View>
        )}
      </PageContainer>
    </DesktopFrame>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    gap: 24,
  },
  headerStrip: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 24,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  titleBlock: {
    gap: 6,
  },
  title: {
    fontStyle: 'italic',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 12,
  },
  scopeControl: {
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  scopeOption: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 86,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  rankPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bodyGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 20,
  },
  leftPanel: {
    flexBasis: 332,
    flexGrow: 0,
    flexShrink: 0,
    gap: 18,
  },
  leftPanelLoading: {
    flexBasis: 332,
    flexGrow: 0,
    flexShrink: 0,
    gap: 16,
  },
  podium: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  podiumPlayer: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  podiumAvatar: {
    borderColor: 'transparent',
    borderRadius: 999,
    padding: 3,
  },
  podiumName: {
    maxWidth: '100%',
    textAlign: 'center',
  },
  podiumBlock: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    width: '100%',
  },
  emptyAvatar: {
    borderRadius: 44,
    borderWidth: 1,
    height: 72,
    width: 72,
  },
  ladder: {
    gap: 8,
  },
  ladderRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tierDot: {
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  ladderName: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rankPanel: {
    flex: 1,
    gap: 16,
    minWidth: 0,
  },
  rankPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  table: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  tableRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rankCell: {
    width: 46,
  },
  playerCell: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 160,
  },
  playerHeaderCell: {
    flex: 1,
    minWidth: 160,
  },
  playerNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  ratingCell: {
    textAlign: 'right',
    width: 74,
  },
  tierCell: {
    width: 84,
  },
  winCell: {
    textAlign: 'right',
    width: 58,
  },
  matchesCell: {
    textAlign: 'right',
    width: 70,
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  pageButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emptyTable: {
    gap: 6,
    padding: 28,
  },
  errorCard: {
    alignSelf: 'center',
    gap: 10,
    maxWidth: 420,
    width: '100%',
  },
  retryButton: {
    marginTop: 8,
  },
});
