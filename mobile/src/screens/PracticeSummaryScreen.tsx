import { View, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import AppText from '../components/Text';
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
      <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.title}>Session Complete</AppText.Serif>
      <AppText.Sans preset="body" color={theme.ink2} style={styles.subtitle}>
        {total} question{total !== 1 ? 's' : ''} answered
      </AppText.Sans>

      <View style={[styles.accuracyCircle, { borderColor: theme.ink }]}>
        <AppText.Mono preset="deltaLg" color={theme.ink} style={styles.accuracyValue}>{accuracy}%</AppText.Mono>
        <AppText.Sans preset="label" color={theme.ink2}>Accuracy</AppText.Sans>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderColor: theme.line }]}>
          <AppText.Mono preset="deltaLg" color={theme.accent} style={styles.statValue}>{correct}</AppText.Mono>
          <AppText.Sans preset="small" color={theme.ink2}>Correct</AppText.Sans>
        </View>
        <View style={[styles.statCard, { borderColor: theme.line }]}>
          <AppText.Mono preset="deltaLg" color={theme.coral} style={styles.statValue}>{incorrect}</AppText.Mono>
          <AppText.Sans preset="small" color={theme.ink2}>Incorrect</AppText.Sans>
        </View>
        <View style={[styles.statCard, { borderColor: theme.line }]}>
          <AppText.Mono preset="deltaLg" color={theme.ink} style={styles.statValue}>{formatTime(totalTimeSec)}</AppText.Mono>
          <AppText.Sans preset="small" color={theme.ink2}>Total Time</AppText.Sans>
        </View>
        <View style={[styles.statCard, { borderColor: theme.line }]}>
          <AppText.Mono preset="deltaLg" color={theme.ink} style={styles.statValue}>{formatTime(avgTimeSec)}</AppText.Mono>
          <AppText.Sans preset="small" color={theme.ink2}>Avg / Question</AppText.Sans>
        </View>
      </View>

      <Button
        label="Practice Again"
        onPress={() => navigation.replace('PracticeHome')}
        style={styles.buttonSpacing}
      />
      <Button
        label="Back to Home"
        variant="ghost"
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
  title: { marginBottom: 6 },
  subtitle: { marginBottom: 40 },
  accuracyCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  accuracyValue: { fontSize: 36 },
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
  statValue: { marginBottom: 4 },
  buttonSpacing: { marginBottom: 12, width: '100%' },
});
