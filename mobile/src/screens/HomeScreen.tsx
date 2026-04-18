import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation';
import api from '../services/api';
import Button from '../components/Button';
import TierBadge from '../components/TierBadge';
import { useTheme } from '../theme/ThemeProvider';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

interface UserProfile {
  displayName: string | null;
  eloRating: number;
  rankTier: string;
  gamesPlayed: number;
}

export default function HomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setProfile(res.data.data);
    } catch {
      // non-critical — show whatever we have
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

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.ink3} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={[styles.greeting, { color: theme.ink3 }]}>Welcome back</Text>
      <Text style={[styles.name, { color: theme.ink }]}>
        {profile?.displayName ?? 'Player'}
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { color: theme.ink }]}>{profile?.eloRating ?? '—'}</Text>
          <Text style={[styles.statLabel, { color: theme.ink3 }]}>Elo Rating</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={[styles.statValue, { color: theme.ink }]}>{profile?.gamesPlayed ?? 0}</Text>
          <Text style={[styles.statLabel, { color: theme.ink3 }]}>Games</Text>
        </View>
        {profile && (
          <View style={[styles.statBlock, styles.tierBlock]}>
            <TierBadge tier={profile.rankTier} />
          </View>
        )}
      </View>

      <Button
        label="Find Duel"
        onPress={() => navigation.navigate('Matchmaking')}
        style={styles.buttonSpacing}
      />
      <Button
        label="Solo Practice"
        variant="secondary"
        onPress={() => navigation.navigate('PracticeHome')}
        style={styles.buttonSpacing}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { paddingHorizontal: 32, paddingTop: 80, paddingBottom: 48 },
  greeting: { fontSize: 14, marginBottom: 4 },
  name: { fontSize: 28, fontWeight: '700', marginBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 28, alignItems: 'center', marginBottom: 48 },
  statBlock: { alignItems: 'flex-start' },
  tierBlock: { justifyContent: 'center' },
  statValue: { fontSize: 28, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 2 },
  buttonSpacing: { marginBottom: 12 },
});
