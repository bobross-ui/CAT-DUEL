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
import Button from '../components/Button';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import { ELO_TIERS, getTier } from '../constants';

interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  eloRating: number;
  gamesPlayed: number;
  rankTier: string;
}

function TierProgressBar({ eloRating }: { eloRating: number; rankTier: string }) {
  const { theme } = useTheme();
  const tier = getTier(eloRating);
  const isDiamond = tier.max === Infinity;
  const progress = isDiamond ? 1 : (eloRating - tier.min) / (tier.max - tier.min + 1);
  const nextTier = isDiamond ? null : ELO_TIERS[ELO_TIERS.indexOf(tier) + 1];

  return (
    <View style={progressStyles.container}>
      <View style={progressStyles.labelRow}>
        <AppText.Sans preset="small" color={theme.ink3}>
          {isDiamond ? 'Max Rank' : `${eloRating} / ${tier.max + 1} to ${nextTier?.name}`}
        </AppText.Sans>
        <AppText.Mono preset="mono" color={tier.color} style={progressStyles.pct}>
          {isDiamond ? '100%' : `${Math.round(progress * 100)}%`}
        </AppText.Mono>
      </View>
      <View style={[progressStyles.track, { backgroundColor: theme.bg2 }]}>
        <View style={[
          progressStyles.fill,
          { width: `${Math.round(progress * 100)}%` as `${number}%`, backgroundColor: tier.color },
        ]} />
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: { width: '100%', marginBottom: 32 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  pct: { fontWeight: '700' },
  track: { height: 6, borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99 },
});

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Me'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ProfileScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [debugTaps, setDebugTaps] = useState(0);

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const fetchProfile = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setProfile(res.data.data);
      setError('');
    } catch {
      setError('Failed to load profile.');
    }
  }, []);

  useEffect(() => {
    fetchProfile().finally(() => setLoading(false));
  }, [fetchProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  }, [fetchProfile]);

  function openEdit() {
    setEditName(profile?.displayName ?? '');
    setEditError('');
    setEditVisible(true);
  }

  async function saveDisplayName() {
    if (!editName.trim()) {
      setEditError('Name cannot be empty.');
      return;
    }
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
        <ActivityIndicator size="large" color={theme.ink} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <AppText.Sans preset="body" color={theme.coral}>{error}</AppText.Sans>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.nameRow}>
          <TouchableOpacity
            onPress={() => {
              const next = debugTaps + 1;
              setDebugTaps(next);
              if (next >= 5) { setDebugTaps(0); navigation.navigate('Debug'); }
            }}
            activeOpacity={1}
          >
            <AppText.Serif preset="heroSerif" color={theme.ink}>{profile?.displayName ?? 'Anonymous'}</AppText.Serif>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openEdit}
            style={[styles.editButton, { borderColor: theme.line }]}
          >
            <AppText.Sans preset="label" color={theme.ink2}>Edit</AppText.Sans>
          </TouchableOpacity>
        </View>
        {profile && (
          <View style={styles.tierBadgeRow}>
            <TierBadge tier={profile.rankTier} />
          </View>
        )}
        <AppText.Sans preset="body" color={theme.ink2} style={styles.email}>{profile?.email}</AppText.Sans>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <AppText.Mono preset="deltaLg" color={theme.ink}>{profile?.eloRating}</AppText.Mono>
            <AppText.Sans preset="label" color={theme.ink2} style={styles.statLabel}>Elo Rating</AppText.Sans>
          </View>
          <View style={styles.stat}>
            <AppText.Mono preset="deltaLg" color={theme.ink}>{profile?.gamesPlayed}</AppText.Mono>
            <AppText.Sans preset="label" color={theme.ink2} style={styles.statLabel}>Games Played</AppText.Sans>
          </View>
        </View>

        {profile && <TierProgressBar eloRating={profile.eloRating} rankTier={profile.rankTier} />}

        <Button
          label="Match History"
          variant="ghost"
          onPress={() => navigation.navigate('MatchHistory')}
          style={styles.buttonSpacing}
        />
        <Button
          label="Sign Out"
          variant="ghost"
          onPress={signOut}
          style={styles.buttonSpacing}
        />
      </ScrollView>

      <Modal visible={editVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.modalTitle}>Edit Display Name</AppText.Serif>
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
            {editError ? <AppText.Sans preset="small" color={theme.coral} style={styles.modalError}>{editError}</AppText.Sans> : null}
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
  },
  container: {
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 40,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  editButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  email: {
    marginBottom: 40,
  },
  tierBadgeRow: {
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 16,
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    marginTop: 4,
  },
  buttonSpacing: {
    marginBottom: 12,
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
    width: '100%',
  },
  modalTitle: {
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  modalError: {
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalActionBtn: {
    flex: 1,
  },
});
