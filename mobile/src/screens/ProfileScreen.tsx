import { useEffect, useState, useCallback } from 'react';
import {
  View, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, RefreshControl, Modal, TextInput,
} from 'react-native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { MainTabParamList, RootStackParamList } from '../navigation';
import TierBadge from '../components/TierBadge';
import Avatar from '../components/Avatar';
import Card from '../components/Card';
import Button from '../components/Button';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import { getTier, getTierToNext } from '../constants';

interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  eloRating: number;
  gamesPlayed: number;
  rankTier: string;
}

interface MatchStats {
  totalGames: number;
  winRate: number;   // 0–1 fraction
  peakElo: number;
}

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Me'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ProfileScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [debugTaps, setDebugTaps] = useState(0);

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, statsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/games/stats').catch(() => null),
      ]);
      setProfile(profileRes.data.data);
      setError('');
      if (statsRes) setStats(statsRes.data.data);
    } catch {
      setError('Failed to load profile.');
    }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  function openEdit() {
    setEditName(profile?.displayName ?? '');
    setEditError('');
    setEditVisible(true);
  }

  async function saveDisplayName() {
    if (!editName.trim()) { setEditError('Name cannot be empty.'); return; }
    setSaving(true);
    setEditError('');
    try {
      await api.patch('/users/me', { displayName: editName.trim() });
      setProfile((prev) => prev ? { ...prev, displayName: editName.trim() } : prev);
      setEditVisible(false);
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      setEditError(code === 'DISPLAY_NAME_TAKEN' ? 'That name is already taken.' : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.ink3} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.errorHeading}>Couldn't load.</AppText.Serif>
        <AppText.Sans preset="body" color={theme.ink3} style={styles.errorBody}>Check your connection and try again.</AppText.Sans>
        <Button
          label="Retry"
          onPress={() => { setError(''); setLoading(true); fetchData().finally(() => setLoading(false)); }}
          style={styles.retryBtn}
        />
      </View>
    );
  }

  const tier = profile ? getTier(profile.eloRating) : null;
  const isDiamond = tier?.max === Infinity;
  const progress = tier && !isDiamond
    ? (profile!.eloRating - tier.min) / (tier.max - tier.min + 1)
    : 1;
  const winRatePct = stats ? Math.round(stats.winRate * 100) : null;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        {/* ── Hero ── */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            const next = debugTaps + 1;
            setDebugTaps(next);
            if (next >= 5) { setDebugTaps(0); navigation.navigate('Debug'); }
          }}
        >
          <Avatar name={profile?.displayName ?? '?'} size="xl" />
        </TouchableOpacity>

        {/* Name + edit */}
        <View style={styles.nameRow}>
          <AppText.Serif preset="h1Serif" color={theme.ink}>
            {profile?.displayName ?? 'Anonymous'}
          </AppText.Serif>
          <TouchableOpacity onPress={openEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <AppText.Sans preset="label" color={theme.ink3}>edit</AppText.Sans>
          </TouchableOpacity>
        </View>

        {/* Rating + tier badge */}
        <View style={styles.ratingRow}>
          <AppText.Mono preset="mono" color={theme.ink2}>◆ {profile?.eloRating}</AppText.Mono>
          {profile && <TierBadge tier={profile.rankTier} small />}
        </View>

        {/* ── 3-stat Card ── */}
        <Card style={styles.statsCard}>
          <View style={styles.statBlock}>
            <AppText.Serif preset="statVal" color={theme.ink}>
              {stats?.totalGames ?? profile?.gamesPlayed ?? '—'}
            </AppText.Serif>
            <AppText.Mono preset="eyebrow" color={theme.ink3}>matches</AppText.Mono>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.line }]} />
          <View style={styles.statBlock}>
            <AppText.Serif preset="statVal" color={theme.ink}>
              {winRatePct !== null ? `${winRatePct}%` : '—'}
            </AppText.Serif>
            <AppText.Mono preset="eyebrow" color={theme.ink3}>win rate</AppText.Mono>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.line }]} />
          <View style={styles.statBlock}>
            <AppText.Serif preset="statVal" color={theme.ink}>
              {stats?.peakElo ? `◆ ${stats.peakElo}` : '—'}
            </AppText.Serif>
            <AppText.Mono preset="eyebrow" color={theme.ink3}>peak</AppText.Mono>
          </View>
        </Card>

        {/* ── Tier progress hairline ── */}
        {profile && (
          <View style={styles.progressWrap}>
            <View style={[styles.progressTrack, { backgroundColor: theme.line }]}>
              <View style={[
                styles.progressFill,
                {
                  width: `${Math.round(progress * 100)}%` as `${number}%`,
                  backgroundColor: tier?.color ?? theme.accent,
                },
              ]} />
            </View>
            <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.progressLabel}>
              {getTierToNext(profile.eloRating)}
            </AppText.Mono>
          </View>
        )}

        {/* ── List rows ── */}
        <View style={styles.listSection}>
          <TouchableOpacity
            style={[styles.listRow, { backgroundColor: theme.card, borderColor: theme.line }]}
            onPress={() => navigation.navigate('MatchHistory')}
            activeOpacity={0.7}
          >
            <AppText.Sans preset="bodyMed" color={theme.ink}>Match History</AppText.Sans>
            <AppText.Sans preset="body" color={theme.ink3}>→</AppText.Sans>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listRow, { backgroundColor: theme.card, borderColor: theme.line }]}
            activeOpacity={0.7}
          >
            <AppText.Sans preset="bodyMed" color={theme.ink}>Settings</AppText.Sans>
            <AppText.Sans preset="body" color={theme.ink3}>→</AppText.Sans>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listRow, { backgroundColor: theme.card, borderColor: theme.line }]}
            onPress={signOut}
            activeOpacity={0.7}
          >
            <AppText.Sans preset="bodyMed" color={theme.coral}>Sign Out</AppText.Sans>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Edit name modal ── */}
      <Modal visible={editVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.modalTitle}>
              Edit Display Name
            </AppText.Serif>
            <TextInput
              style={[styles.modalInput, {
                borderColor: theme.line,
                color: theme.ink,
                backgroundColor: theme.bg2,
              }]}
              value={editName}
              onChangeText={setEditName}
              autoCapitalize="words"
              autoFocus
              maxLength={50}
              placeholderTextColor={theme.ink3}
            />
            {editError
              ? <AppText.Sans preset="small" color={theme.coral} style={styles.modalError}>{editError}</AppText.Sans>
              : null}
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setEditVisible(false)}
                disabled={saving}
                style={styles.modalActionBtn}
              />
              <Button
                label="Save"
                onPress={saveDisplayName}
                loading={saving}
                style={styles.modalActionBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  container: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: 48,
    paddingHorizontal: 20,
    gap: 14,
  },

  // Hero
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Stats card
  statsCard: { flexDirection: 'row', alignItems: 'center', padding: 20, width: '100%' },
  statBlock: { flex: 1, alignItems: 'center', gap: 6 },
  statDivider: { width: 1, height: 36, marginHorizontal: 4 },

  // Progress
  progressWrap: { width: '100%', gap: 6 },
  progressTrack: { height: 2, borderRadius: 99, overflow: 'hidden', width: '100%' },
  progressFill: { height: '100%', borderRadius: 99 },
  progressLabel: { textAlign: 'right' },

  // List rows
  listSection: { width: '100%', gap: 8 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
  },

  // Error state
  errorHeading: { marginBottom: 8 },
  errorBody: { marginBottom: 24, textAlign: 'center' },
  retryBtn: { width: 120 },

  // Modal
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
    width: '100%',
  },
  modalTitle: { marginBottom: 16 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  modalError: { marginBottom: 8 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalActionBtn: { flex: 1 },
});
