import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeSummary'>;

export default function PracticeSummaryScreen({ navigation, route }: Props) {
  const { total, correct, totalTimeMs } = route.params;
  const { theme } = useTheme();
  const incorrect = total - correct;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const avgTimeSec = total > 0 ? Math.round(totalTimeMs / total / 1000) : 0;
  const totalTimeSec = Math.round(totalTimeMs / 1000);

  function formatTime(sec: number) {
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.ink }]}>Session Complete</Text>
      <Text style={[styles.subtitle, { color: theme.ink2 }]}>
        {total} question{total !== 1 ? 's' : ''} answered
      </Text>

      <View style={[styles.accuracyCircle, { borderColor: theme.ink }]}>
        <Text style={[styles.accuracyValue, { color: theme.ink }]}>{accuracy}%</Text>
        <Text style={[styles.accuracyLabel, { color: theme.ink2 }]}>Accuracy</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderColor: theme.line }]}>
          <Text style={[styles.statValue, { color: theme.accent }]}>{correct}</Text>
          <Text style={[styles.statLabel, { color: theme.ink2 }]}>Correct</Text>
        </View>
        <View style={[styles.statCard, { borderColor: theme.line }]}>
          <Text style={[styles.statValue, { color: theme.coral }]}>{incorrect}</Text>
          <Text style={[styles.statLabel, { color: theme.ink2 }]}>Incorrect</Text>
        </View>
        <View style={[styles.statCard, { borderColor: theme.line }]}>
          <Text style={[styles.statValue, { color: theme.ink }]}>{formatTime(totalTimeSec)}</Text>
          <Text style={[styles.statLabel, { color: theme.ink2 }]}>Total Time</Text>
        </View>
        <View style={[styles.statCard, { borderColor: theme.line }]}>
          <Text style={[styles.statValue, { color: theme.ink }]}>{formatTime(avgTimeSec)}</Text>
          <Text style={[styles.statLabel, { color: theme.ink2 }]}>Avg / Question</Text>
        </View>
      </View>

      <Button
        label="Practice Again"
        onPress={() => navigation.replace('PracticeHome')}
        style={styles.buttonSpacing}
      />
      <Button
        label="Back to Home"
        variant="secondary"
        onPress={() => navigation.navigate('MainTabs')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 80,
    alignItems: 'center',
  },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 16, marginBottom: 40 },
  accuracyCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  accuracyValue: { fontSize: 36, fontWeight: '800' },
  accuracyLabel: { fontSize: 13, fontWeight: '600' },
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
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  statLabel: { fontSize: 13 },
  buttonSpacing: { marginBottom: 12, width: '100%' },
});
