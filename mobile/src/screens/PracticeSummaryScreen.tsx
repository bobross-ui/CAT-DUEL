import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeSummary'>;

export default function PracticeSummaryScreen({ navigation, route }: Props) {
  const { total, correct, totalTimeMs } = route.params;
  const incorrect = total - correct;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const avgTimeSec = total > 0 ? Math.round(totalTimeMs / total / 1000) : 0;
  const totalTimeSec = Math.round(totalTimeMs / 1000);

  function formatTime(sec: number) {
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Session Complete</Text>
      <Text style={styles.subtitle}>{total} question{total !== 1 ? 's' : ''} answered</Text>

      {/* Accuracy ring placeholder */}
      <View style={styles.accuracyCircle}>
        <Text style={styles.accuracyValue}>{accuracy}%</Text>
        <Text style={styles.accuracyLabel}>Accuracy</Text>
      </View>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.correct]}>{correct}</Text>
          <Text style={styles.statLabel}>Correct</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.incorrect]}>{incorrect}</Text>
          <Text style={styles.statLabel}>Incorrect</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatTime(totalTimeSec)}</Text>
          <Text style={styles.statLabel}>Total Time</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatTime(avgTimeSec)}</Text>
          <Text style={styles.statLabel}>Avg / Question</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.replace('PracticeHome')}
      >
        <Text style={styles.primaryButtonText}>Practice Again</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('Profile')}
      >
        <Text style={styles.secondaryButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingTop: 80,
    alignItems: 'center',
  },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 40 },
  accuracyCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    borderColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  accuracyValue: { fontSize: 36, fontWeight: '800' },
  accuracyLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    marginBottom: 40,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  statLabel: { fontSize: 13, color: '#666' },
  correct: { color: '#16a34a' },
  incorrect: { color: '#dc2626' },
  primaryButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
});
