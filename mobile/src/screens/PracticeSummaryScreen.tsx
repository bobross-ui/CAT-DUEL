import { View, ScrollView, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import AppText from '../components/Text';
import Card from '../components/Card';
import Button from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeSummary'>;

function MarkCircle({ isCorrect }: { isCorrect: boolean }) {
  const { theme } = useTheme();
  const bg = isCorrect ? theme.accentSoft : theme.coralSoft;
  const color = isCorrect ? theme.accentDeep : theme.coral;
  return (
    <View style={[styles.markCircle, { backgroundColor: bg }]}>
      <AppText.Mono preset="chipLabel" color={color}>{isCorrect ? '✓' : '✗'}</AppText.Mono>
    </View>
  );
}

export default function PracticeSummaryScreen({ navigation, route }: Props) {
  const { total, correct, questions } = route.params;
  const { theme } = useTheme();
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.container}
    >
      {/* ── Hero ── */}
      <AppText.Serif preset="verdict" color={theme.ink} style={styles.verdict}>
        {accuracy >= 80 ? 'Strong.' : accuracy >= 50 ? 'Solid.' : 'Keep going.'}
      </AppText.Serif>
      <AppText.Mono preset="mono" color={theme.ink3} style={styles.sub}>
        {correct} of {total} correct · {accuracy}%
      </AppText.Mono>

      {/* ── Score Card ── */}
      <Card style={styles.scoreCard}>
        <View style={styles.scoreBlock}>
          <AppText.Serif preset="statVal" color={theme.accent}>{correct}</AppText.Serif>
          <AppText.Mono preset="eyebrow" color={theme.ink3}>CORRECT</AppText.Mono>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.line }]} />
        <View style={styles.scoreBlock}>
          <AppText.Serif preset="statVal" color={theme.coral}>{total - correct}</AppText.Serif>
          <AppText.Mono preset="eyebrow" color={theme.ink3}>INCORRECT</AppText.Mono>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.line }]} />
        <View style={styles.scoreBlock}>
          <AppText.Serif preset="statVal" color={theme.ink}>{total}</AppText.Serif>
          <AppText.Mono preset="eyebrow" color={theme.ink3}>TOTAL</AppText.Mono>
        </View>
      </Card>

      {/* ── Question review ── */}
      {questions && questions.length > 0 && (
        <View style={styles.reviewSection}>
          <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.reviewHeader}>
            QUESTION REVIEW
          </AppText.Mono>
          {questions.map((q, i) => (
            <Card key={i} style={styles.qRow}>
              <AppText.Mono preset="mono" color={theme.ink2} style={styles.qNum}>Q{i + 1}</AppText.Mono>
              <View style={styles.qTopic}>
                <AppText.Sans preset="bodyMed" color={theme.ink} numberOfLines={1}>
                  {q.subTopic ?? q.category}
                </AppText.Sans>
                <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
                  {q.category}
                </AppText.Mono>
              </View>
              <MarkCircle isCorrect={q.isCorrect} />
            </Card>
          ))}
        </View>
      )}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <Button
          label="Try Again"
          onPress={() => navigation.replace('PracticeHome')}
          style={styles.actionBtn}
        />
        <Button
          label="Home"
          variant="ghost"
          onPress={() => navigation.navigate('MainTabs')}
          style={styles.actionBtn}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 48,
    gap: 16,
  },

  // Hero
  verdict: { textAlign: 'center' },
  sub: { textAlign: 'center', marginTop: 6 },

  // Score card
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  scoreBlock: { flex: 1, alignItems: 'center', gap: 6 },
  divider: { width: 1, height: 36, marginHorizontal: 4 },

  // Review
  reviewSection: { gap: 8 },
  reviewHeader: { marginBottom: 2 },
  uppercase: { textTransform: 'uppercase' },
  qRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  qNum: { width: 28 },
  qTopic: { flex: 1, gap: 2 },

  // Mark circle
  markCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Actions
  actions: { gap: 10, marginTop: 8 },
  actionBtn: {},
});
