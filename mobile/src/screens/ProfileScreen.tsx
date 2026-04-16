import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, RefreshControl, Modal, TextInput,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { RootStackParamList } from '../navigation';

interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  eloRating: number;
  gamesPlayed: number;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Edit modal state
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
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      setEditError(code === 'DISPLAY_NAME_TAKEN' ? 'That name is already taken.' : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.nameRow}>
          <Text style={styles.title}>{profile?.displayName ?? 'Anonymous'}</Text>
          <TouchableOpacity onPress={openEdit} style={styles.editButton}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.email}>{profile?.email}</Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile?.eloRating}</Text>
            <Text style={styles.statLabel}>Elo Rating</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile?.gamesPlayed}</Text>
            <Text style={styles.statLabel}>Games Played</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.duelButton} onPress={() => navigation.navigate('Matchmaking')}>
          <Text style={styles.duelButtonText}>Find Duel</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.practiceButton} onPress={() => navigation.navigate('PracticeHome')}>
          <Text style={styles.practiceButtonText}>Practice</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={editVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Display Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              autoCapitalize="words"
              autoFocus
              maxLength={50}
            />
            {editError ? <Text style={styles.modalError}>{editError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setEditVisible(false)}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={saveDisplayName}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalSaveText}>Save</Text>}
              </TouchableOpacity>
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
    backgroundColor: '#fff',
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
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  editButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  editButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 48,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  error: {
    color: '#e53e3e',
    fontSize: 16,
  },
  duelButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  duelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  practiceButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  practiceButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  signOutButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  modalError: {
    color: '#e53e3e',
    fontSize: 13,
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  modalSave: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
