import { createElement, useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { z } from 'zod';
import DesktopFrame from '../components/web/DesktopFrame';
import EyebrowLabel from '../components/web/EyebrowLabel';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import ShareLinkModal from '../components/ShareLinkModal';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import Text from '../components/Text';
import TierBadge from '../components/TierBadge';
import api from '../services/api';
import { track } from '../services/analytics';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { getTier, getTierToNext } from '../constants';
import { profileUrl } from '../navigation/linking';
import { useTheme } from '../theme/ThemeProvider';
import MobileProfileScreen from './ProfileScreen.mobile';

type Props = ComponentProps<typeof MobileProfileScreen>;

interface MatchStats {
  currentElo: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  peakElo: number;
  eloHistory: { finishedAt: string; elo: number }[];
}

interface MatchHistoryEntry {
  matchId: string;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  yourScore: number;
  opponentScore: number;
  yourEloChange: number;
  finishedAt: string;
  opponent: {
    displayName: string | null;
    avatarUrl: string | null;
    rankTier?: string;
  };
}

const displayNameSchema = z.string().trim().min(2, 'Name must be at least 2 characters.').max(30, 'Name must be 30 characters or less.');
const CHART_WIDTH = 640;
const CHART_HEIGHT = 180;

function formatJoined(value?: string) {
  if (!value) return 'joined recently';
  return `joined ${new Date(value).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
}

function formatAgo(value: string) {
  const then = new Date(value).getTime();
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function recent90Days(history: MatchStats['eloHistory']) {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return history.filter((item) => new Date(item.finishedAt).getTime() >= cutoff);
}

function RatingChart({ history }: { history: MatchStats['eloHistory'] }) {
  const { theme } = useTheme();
  const points = useMemo(() => recent90Days(history), [history]);
  const chartPoints = points.length > 0 ? points : history.slice(-1);
  const values = chartPoints.map((point) => point.elo);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = Math.max(1, max - min);
  const pathPoints = chartPoints.map((point, index) => {
    const x = chartPoints.length === 1 ? CHART_WIDTH / 2 : (index / (chartPoints.length - 1)) * CHART_WIDTH;
    const y = CHART_HEIGHT - ((point.elo - min) / range) * (CHART_HEIGHT - 24) - 12;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const fillPoints = pathPoints
    ? `0,${CHART_HEIGHT} ${pathPoints} ${CHART_WIDTH},${CHART_HEIGHT}`
    : '';
  const startLabel = chartPoints[0]?.finishedAt
    ? new Date(chartPoints[0].finishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : 'start';
  const endLabel = chartPoints[chartPoints.length - 1]?.finishedAt
    ? new Date(chartPoints[chartPoints.length - 1].finishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : 'today';

  return (
    <View>
      <View style={styles.chartArea}>
        <View style={styles.yAxisLabels}>
          <Text.Mono preset="chipLabel" color={theme.ink3}>{max || '-'}</Text.Mono>
          <Text.Mono preset="chipLabel" color={theme.ink3}>{min || '-'}</Text.Mono>
        </View>
        <View style={[styles.chartFrame, { backgroundColor: theme.bg2, borderColor: theme.line }]}>
          {pathPoints ? (
            createElement('svg', {
              width: '100%',
              height: '100%',
              viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
              preserveAspectRatio: 'none',
              style: StyleSheet.absoluteFill,
            },
              createElement('polygon', { points: fillPoints, fill: theme.accent, opacity: 0.1 }),
              createElement('polyline', {
                points: pathPoints,
                fill: 'none',
                stroke: theme.accent,
                strokeWidth: 4,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              }),
              chartPoints.length === 1 ? createElement('circle', {
                cx: CHART_WIDTH / 2,
                cy: CHART_HEIGHT - 12,
                r: 5,
                fill: theme.accent,
              }) : null,
            )
          ) : (
            <View style={styles.emptyChart}>
              <Text.Serif preset="h1Serif" color={theme.ink}>No rating history yet.</Text.Serif>
              <Text.Sans preset="small" color={theme.ink3}>Your line appears after your first duel.</Text.Sans>
            </View>
          )}
        </View>
      </View>
      <View style={styles.xAxisLabels}>
        <View style={styles.yAxisSpacer} />
        <View style={styles.dateLabels}>
          <Text.Mono preset="chipLabel" color={theme.ink3}>{startLabel}</Text.Mono>
          <Text.Mono preset="chipLabel" color={theme.ink3}>{endLabel}</Text.Mono>
        </View>
      </View>
    </View>
  );
}

export default function ProfileScreenDesktop({ navigation }: Props) {
  const { theme, mode } = useTheme();
  const { user, loading: profileLoading, error: profileError, refresh } = useCurrentProfile();
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  useDocumentTitle(user?.displayName ? `${user.displayName} · CAT Duel` : 'Your profile · CAT Duel');

  const fetchProfileData = useCallback(async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        api.get('/games/stats').catch(() => null),
        api.get('/games/history?page=1&limit=3').catch(() => null),
      ]);
      setStats(statsRes?.data.data ?? null);
      setMatches(historyRes?.data.data.entries ?? []);
      setError('');
    } catch {
      setError('Failed to load profile.');
    }
  }, []);

  useEffect(() => {
    void Promise.all([refresh(), fetchProfileData()]).finally(() => setLoading(false));
  }, [fetchProfileData, refresh]);

  const retry = useCallback(() => {
    setLoading(true);
    setError('');
    void Promise.all([refresh(), fetchProfileData()]).finally(() => setLoading(false));
  }, [fetchProfileData, refresh]);

  function openEdit() {
    setEditName(user?.displayName ?? '');
    setEditError('');
    setEditVisible(true);
  }

  async function saveDisplayName() {
    const parsed = displayNameSchema.safeParse(editName);
    if (!parsed.success) {
      setEditError(parsed.error.issues[0]?.message ?? 'Enter a valid display name.');
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      await api.patch('/users/me', { displayName: parsed.data });
      await refresh();
      setEditVisible(false);
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      setEditError(code === 'DISPLAY_NAME_TAKEN' ? 'That name is already taken.' : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function openShareProfile() {
    if (!user) return;
    track('share_initiated', { surface: 'profile' });
    setShareVisible(true);
  }

  const rating = stats?.currentElo ?? user?.eloRating ?? 0;
  const tier = getTier(rating);
  const progress = tier.max === Infinity ? 1 : (rating - tier.min) / (tier.max - tier.min + 1);
  const gamesPlayed = stats?.gamesPlayed ?? user?.gamesPlayed ?? 0;
  const winRate = stats?.winRate ?? user?.winRate ?? 0;
  const winRatePct = Math.round(winRate * 100);
  const bestStreak = user?.longestStreak ?? 0;
  const displayName = user?.displayName ?? 'Anonymous';
  const initial = displayName.charAt(0).toUpperCase();
  const coverMuted = mode === 'dark' ? 'rgba(0,0,0,0.56)' : 'rgba(255,255,255,0.58)';
  const coverMark = mode === 'dark' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  if (loading || profileLoading) {
    return (
      <DesktopFrame activeRoute="Me">
        <View style={styles.cover} />
        <View style={styles.head}>
          <SkeletonBlock height={120} width={120} radius={60} />
          <View style={styles.headText}>
            <SkeletonBlock height={40} width="42%" />
            <SkeletonBlock height={16} width="36%" />
          </View>
          <SkeletonBlock height={44} width={116} />
        </View>
        <View style={styles.body}>
          <View style={styles.leftCol}>
            <SkeletonCard style={styles.loadingCard}><SkeletonBlock height={84} /></SkeletonCard>
            <SkeletonCard style={styles.loadingCard}><SkeletonBlock height={92} /></SkeletonCard>
          </View>
          <View style={styles.rightCol}>
            <SkeletonCard style={styles.loadingCard}><SkeletonBlock height={220} /></SkeletonCard>
            <SkeletonCard style={styles.loadingCard}><SkeletonBlock height={220} /></SkeletonCard>
          </View>
        </View>
      </DesktopFrame>
    );
  }

  if (error || profileError || !user) {
    return (
      <DesktopFrame activeRoute="Me">
        <View style={styles.errorPage}>
          <Text.Serif preset="display" color={theme.ink}>Couldn't load.</Text.Serif>
          <Text.Sans preset="body" color={theme.ink3} style={styles.errorCopy}>
            Check your connection and try again.
          </Text.Sans>
          <Button label="Retry" onPress={retry} style={styles.retryButton} />
        </View>
      </DesktopFrame>
    );
  }

  return (
    <>
      <DesktopFrame activeRoute="Me">
        <View style={[styles.cover, { backgroundColor: theme.ink }]}>
          <LinearGradient
            colors={['rgba(63,125,92,0.36)', 'rgba(201,138,43,0.22)', 'rgba(0,0,0,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text.Mono preset="eyebrow" color={coverMuted} style={styles.coverCrumb}>PROFILE</Text.Mono>
          <Text.Serif preset="display" color={coverMark} style={styles.coverInitial}>{initial}</Text.Serif>
        </View>

        <View style={styles.head}>
          <View style={[
            styles.avatarRing,
            {
              backgroundColor: theme.bg,
              shadowColor: mode === 'dark' ? '#FFFFFF' : '#000',
              shadowOpacity: mode === 'dark' ? 0.14 : 0.16,
              shadowRadius: mode === 'dark' ? 28 : 24,
            },
          ]}>
            <Avatar name={displayName} size="xl" />
          </View>
          <View style={styles.headText}>
            <View style={styles.nameRow}>
              <Text.Serif preset="display" color={theme.ink} numberOfLines={1} style={styles.name}>
                {displayName}
              </Text.Serif>
              <TierBadge tier={user.rankTier} small />
            </View>
            <Text.Mono preset="mono" color={theme.ink3}>
              {formatJoined(user.createdAt)} · {gamesPlayed} matches
            </Text.Mono>
          </View>
          <View style={styles.actions}>
            <Button label="Edit profile" variant="ghost" onPress={openEdit} style={styles.actionButton} />
            <Pressable
              onPress={() => navigation.navigate('Settings')}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              style={({ pressed }) => [
                styles.iconButton,
                { borderColor: theme.line, backgroundColor: theme.card },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Feather name="settings" size={18} color={theme.ink} />
            </Pressable>
            <Pressable
              onPress={openShareProfile}
              accessibilityRole="button"
              accessibilityLabel="Share profile"
              style={({ pressed }) => [
                styles.iconButton,
                { borderColor: theme.line, backgroundColor: theme.card },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Feather name="share-2" size={18} color={theme.ink} />
            </Pressable>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.leftCol}>
            <Card style={styles.ratingCard}>
              <EyebrowLabel>Current rating</EyebrowLabel>
              <Text.Serif preset="display" color={theme.ink} style={styles.ratingValue}>{rating}</Text.Serif>
              <View style={styles.ratingMeta}>
                <TierBadge tier={tier.name} small />
                <Text.Mono preset="mono" color={theme.ink3}>{getTierToNext(rating)}</Text.Mono>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: theme.line }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(progress * 100)}%` as `${number}%`, backgroundColor: tier.color },
                  ]}
                />
              </View>
            </Card>

            <Card style={styles.statCard}>
              <EyebrowLabel>Stats</EyebrowLabel>
              <View style={styles.statGrid}>
                <View style={styles.statItem}>
                  <Text.Serif preset="statVal" color={theme.ink}>{gamesPlayed}</Text.Serif>
                  <Text.Mono preset="eyebrow" color={theme.ink3}>MATCHES</Text.Mono>
                </View>
                <View style={styles.statItem}>
                  <Text.Serif preset="statVal" color={theme.ink}>{winRatePct}%</Text.Serif>
                  <Text.Mono preset="eyebrow" color={theme.ink3}>WIN RATE</Text.Mono>
                </View>
                <View style={styles.statItem}>
                  <Text.Serif preset="statVal" color={theme.ink}>{bestStreak}</Text.Serif>
                  <Text.Mono preset="eyebrow" color={theme.ink3}>BEST STREAK</Text.Mono>
                </View>
              </View>
            </Card>

            <Card style={styles.achievementsCard}>
              <EyebrowLabel>Achievements</EyebrowLabel>
              <View style={styles.badgeGrid}>
                {[0, 1, 2, 3].map((slot) => (
                  <View key={slot} style={[styles.lockedBadge, { backgroundColor: theme.bg2, borderColor: theme.line }]}>
                    <Feather name="lock" size={16} color={theme.ink3} />
                  </View>
                ))}
              </View>
            </Card>
          </View>

          <View style={styles.rightCol}>
            <Card style={styles.chartCard}>
              <View style={styles.cardHeader}>
                <EyebrowLabel>Rating · 90 days</EyebrowLabel>
                <Text.Mono preset="mono" color={theme.ink3}>peak {stats?.peakElo ?? rating}</Text.Mono>
              </View>
              <RatingChart history={stats?.eloHistory ?? []} />
            </Card>

            <Card style={styles.topicCard}>
              <View style={styles.cardHeader}>
                <EyebrowLabel>Topic mastery</EyebrowLabel>
                <Feather name="clock" size={16} color={theme.ink3} />
              </View>
              <View style={styles.futureState}>
                <Text.Serif preset="h1Serif" color={theme.ink}>Coming in a future version.</Text.Serif>
                <Text.Sans preset="small" color={theme.ink3}>
                  Practice and duel history will power subtopic mastery here.
                </Text.Sans>
              </View>
            </Card>

            <Card style={styles.matchesCard}>
              <View style={styles.cardHeader}>
                <EyebrowLabel>Recent matches</EyebrowLabel>
                <Pressable
                  onPress={() => navigation.navigate('MatchHistory')}
                  accessibilityRole="button"
                  accessibilityLabel="Open match history"
                >
                  <Text.Mono preset="chipLabel" color={theme.accentDeep}>VIEW ALL</Text.Mono>
                </Pressable>
              </View>

              {matches.length === 0 ? (
                <View style={styles.emptyMatches}>
                  <Text.Serif preset="h1Serif" color={theme.ink}>No matches yet.</Text.Serif>
                  <Text.Sans preset="small" color={theme.ink3}>Find a duel to start the record.</Text.Sans>
                </View>
              ) : matches.map((match) => {
                const deltaColor = match.yourEloChange > 0
                  ? theme.accentDeep
                  : match.yourEloChange < 0
                    ? theme.coral
                    : theme.ink3;
                return (
                  <Pressable
                    key={match.matchId}
                    onPress={() => navigation.navigate('MatchDetail', {
                      matchId: match.matchId,
                      opponentName: match.opponent.displayName,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={`${match.outcome.toLowerCase()} against ${match.opponent.displayName ?? 'opponent'}`}
                    style={({ pressed }) => [
                      styles.matchRow,
                      { borderBottomColor: theme.line2 },
                      pressed && { backgroundColor: theme.bg2 },
                    ]}
                  >
                    <Avatar name={match.opponent.displayName ?? '?'} size="sm" variant="opponent" />
                    <View style={styles.matchMain}>
                      <Text.Sans preset="label" color={theme.ink} numberOfLines={1}>
                        {match.opponent.displayName ?? 'Anonymous'}
                      </Text.Sans>
                      <Text.Mono preset="chipLabel" color={theme.ink3}>{formatAgo(match.finishedAt)}</Text.Mono>
                    </View>
                    <Text.Mono preset="mono" color={theme.ink2} style={styles.score}>
                      {match.yourScore}-{match.opponentScore}
                    </Text.Mono>
                    <Text.Mono preset="mono" color={deltaColor} style={styles.delta}>
                      {formatDelta(match.yourEloChange)}
                    </Text.Mono>
                  </Pressable>
                );
              })}
            </Card>
          </View>
        </View>
      </DesktopFrame>

      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalOverlay} accessibilityViewIsModal accessibilityLabel="Edit display name">
          <View style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <Text.Serif preset="h1Serif" color={theme.ink} style={styles.modalTitle}>
              Edit Display Name
            </Text.Serif>
            <TextInput
              style={[styles.modalInput, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.bg2 }]}
              value={editName}
              onChangeText={setEditName}
              autoCapitalize="words"
              autoFocus
              maxLength={30}
              placeholderTextColor={theme.ink3}
              accessibilityLabel="Display name"
            />
            {editError ? (
              <Text.Sans preset="small" color={theme.coral} style={styles.modalError}>{editError}</Text.Sans>
            ) : null}
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setEditVisible(false)}
                disabled={saving}
                style={styles.modalActionBtn}
              />
              <Button label="Save" onPress={saveDisplayName} loading={saving} style={styles.modalActionBtn} />
            </View>
          </View>
        </View>
      </Modal>

      <ShareLinkModal
        visible={shareVisible}
        title="CAT Duel profile"
        message={`Check out ${displayName} on CAT Duel:`}
        url={profileUrl(user.id)}
        onClose={() => setShareVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cover: {
    height: 168,
    overflow: 'hidden',
  },
  coverCrumb: {
    position: 'absolute',
    top: 32,
    left: 60,
  },
  coverInitial: {
    position: 'absolute',
    right: 72,
    bottom: -34,
    fontSize: 190,
    lineHeight: 190,
    fontStyle: 'italic',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 60,
    marginTop: -36,
    gap: 24,
  },
  avatarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    padding: 16,
    shadowOffset: { width: 0, height: 12 },
  },
  headText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 54,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: {
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 50,
  },
  actionButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 60,
    paddingTop: 32,
    paddingBottom: 60,
  },
  leftCol: {
    width: 320,
    gap: 16,
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
    gap: 16,
  },
  loadingCard: {
    gap: 12,
  },
  ratingCard: {
    gap: 16,
  },
  ratingValue: {
    fontSize: 56,
    lineHeight: 58,
  },
  ratingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressTrack: {
    height: 6,
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
  },
  statCard: {
    gap: 16,
  },
  statGrid: {
    gap: 14,
  },
  statItem: {
    gap: 4,
  },
  achievementsCard: {
    gap: 16,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  lockedBadge: {
    width: 58,
    height: 58,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCard: {
    gap: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  chartArea: {
    flexDirection: 'row',
    gap: 12,
  },
  yAxisLabels: {
    width: 42,
    height: CHART_HEIGHT,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 2,
  },
  chartFrame: {
    flex: 1,
    height: CHART_HEIGHT,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyChart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  xAxisLabels: {
    flexDirection: 'row',
    marginTop: 10,
  },
  yAxisSpacer: {
    width: 54,
  },
  dateLabels: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  topicCard: {
    gap: 18,
  },
  futureState: {
    paddingVertical: 20,
    gap: 6,
  },
  matchesCard: {
    paddingBottom: 8,
  },
  emptyMatches: {
    paddingVertical: 28,
    gap: 6,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  matchMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  score: {
    width: 52,
    textAlign: 'right',
  },
  delta: {
    width: 44,
    textAlign: 'right',
  },
  errorPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
  },
  errorCopy: {
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    width: 140,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    width: 420,
    maxWidth: '100%',
  },
  modalTitle: {
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalError: {
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  modalActionBtn: {
    flex: 1,
  },
});
