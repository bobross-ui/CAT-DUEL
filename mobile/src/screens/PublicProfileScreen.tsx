import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import AppText from '../components/Text';
import TierBadge from '../components/TierBadge';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useTheme } from '../theme/ThemeProvider';
import { getTier, getTierToNext } from '../constants';
import { useUserProfile } from '../queries/users';

type Props = NativeStackScreenProps<RootStackParamList, 'PublicProfile'>;

export default function PublicProfileScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const { theme } = useTheme();
  const profileQuery = useUserProfile(userId);
  const profile = profileQuery.data ?? null;

  if (profileQuery.isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.ink3} />
      </View>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.errorHeading}>
          Couldn't load.
        </AppText.Serif>
        <AppText.Sans preset="body" color={theme.ink3} style={styles.errorBody}>
          Check the link and try again.
        </AppText.Sans>
        <Button label="Retry" onPress={() => { void profileQuery.refetch(); }} style={styles.retryBtn} />
      </View>
    );
  }

  const tier = getTier(profile.eloRating);
  const joined = new Date(profile.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });

  return (
    <ScreenTransitionView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Button
          label="Back"
          variant="ghost"
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        />

        <Avatar name={profile.displayName ?? 'Player'} size="xl" />
        <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.name}>
          {profile.displayName ?? 'Anonymous'}
        </AppText.Serif>
        <View style={styles.ratingRow}>
          <AppText.Mono preset="mono" color={theme.ink2}>◆ {profile.eloRating}</AppText.Mono>
          <TierBadge tier={tier.name} small />
        </View>

        <Card style={styles.statsCard}>
          <View style={styles.statBlock}>
            <AppText.Serif preset="statVal" color={theme.ink}>{profile.gamesPlayed}</AppText.Serif>
            <AppText.Mono preset="eyebrow" color={theme.ink3}>matches</AppText.Mono>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.line }]} />
          <View style={styles.statBlock}>
            <AppText.Serif preset="statVal" color={theme.ink}>{tier.name}</AppText.Serif>
            <AppText.Mono preset="eyebrow" color={theme.ink3}>tier</AppText.Mono>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.line }]} />
          <View style={styles.statBlock}>
            <AppText.Serif preset="statVal" color={theme.ink}>{joined}</AppText.Serif>
            <AppText.Mono preset="eyebrow" color={theme.ink3}>joined</AppText.Mono>
          </View>
        </Card>

        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: theme.line }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: tier.max === Infinity
                    ? '100%'
                    : `${Math.round(((profile.eloRating - tier.min) / (tier.max - tier.min + 1)) * 100)}%`,
                  backgroundColor: tier.color,
                },
              ]}
            />
          </View>
          <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.progressLabel}>
            {getTierToNext(profile.eloRating)}
          </AppText.Mono>
        </View>
      </ScrollView>
    </ScreenTransitionView>
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
    paddingTop: 56,
    paddingBottom: 48,
    paddingHorizontal: 20,
    gap: 14,
  },
  backBtn: { alignSelf: 'flex-start', width: 92 },
  name: { textAlign: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statsCard: { flexDirection: 'row', alignItems: 'center', padding: 20, width: '100%' },
  statBlock: { flex: 1, alignItems: 'center', gap: 6 },
  statDivider: { width: 1, height: 36, marginHorizontal: 4 },
  progressWrap: { width: '100%', gap: 6 },
  progressTrack: { height: 2, borderRadius: 99, overflow: 'hidden', width: '100%' },
  progressFill: { height: '100%', borderRadius: 99 },
  progressLabel: { textAlign: 'right' },
  errorHeading: { marginBottom: 8 },
  errorBody: { marginBottom: 24, textAlign: 'center' },
  retryBtn: { width: 120 },
});
