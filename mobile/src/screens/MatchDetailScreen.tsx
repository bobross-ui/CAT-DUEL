import {
  View, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useGamesDetail } from '../queries/games';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchDetail'>;

export default function MatchDetailScreen({ route, navigation }: Props) {
  const { matchId, opponentName } = route.params;
  const { theme } = useTheme();
  const { user: profile, loading: profileLoading } = useCurrentProfile();
  const { data: match, isLoading: matchLoading } = useGamesDetail(matchId);

  const myId = profile?.id ?? null;

  if (matchLoading || profileLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.ink} />
      </View>
    );
  }

  if (!match || !myId) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <AppText.Sans preset="body" color={theme.coral}>Failed to load match.</AppText.Sans>
      </View>
    );
  }

  const isPlayer1 = match.player1Id === myId;
  const myScore = isPlayer1 ? match.player1Score : match.player2Score;
  const theirScore = isPlayer1 ? match.player2Score : match.player1Score;
  const myEloChange = isPlayer1 ? match.player1EloChange : match.player2EloChange;
  const opponent = isPlayer1 ? match.player2 : match.player1;

  let outcome: 'WIN' | 'LOSS' | 'DRAW';
  if (match.winnerId === myId) outcome = 'WIN';
  else if (match.winnerId == null) outcome = 'DRAW';
  else outcome = 'LOSS';

  const outcomeColor = outcome === 'WIN' ? theme.accent : outcome === 'LOSS' ? theme.coral : theme.amber;
  const outcomeLabel = { WIN: 'You Won', LOSS: 'You Lost', DRAW: 'Draw' }[outcome];
  const eloColor = myEloChange > 0 ? theme.accent : myEloChange < 0 ? theme.coral : theme.ink3;

  const myAnswers = match.answers.filter(a => a.userId === myId);

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <AppText.Sans preset="body" color={theme.ink} style={styles.backText}>←</AppText.Sans>
        </TouchableOpacity>
        <AppText.Serif preset="h1Serif" color={theme.ink} numberOfLines={1} style={styles.title}>
          vs {opponentName ?? opponent.displayName ?? 'Opponent'}
        </AppText.Serif>
      </View>

      <AppText.Serif preset="verdict" color={outcomeColor} style={styles.outcomeLabel}>{outcomeLabel}</AppText.Serif>

      {match.status === 'forfeited' && (
        <View style={[styles.forfeitBanner, { backgroundColor: theme.amberSoft, borderColor: theme.amber }]}>
          <AppText.Sans preset="label" color={theme.amberDeep}>Match ended by forfeit</AppText.Sans>
        </View>
      )}

      <View style={[styles.summaryCard, { borderColor: theme.line }]}>
        <View style={styles.scoreBlock}>
          <AppText.Sans preset="label" color={theme.ink3} style={styles.scoreLabel}>You</AppText.Sans>
          <AppText.Serif preset="display" color={theme.ink}>{myScore}</AppText.Serif>
          <AppText.Mono preset="mono" color={eloColor} style={styles.eloDelta}>
            {myEloChange > 0 ? '+' : ''}{myEloChange} Elo
          </AppText.Mono>
        </View>
        <AppText.Sans preset="body" color={theme.line}>—</AppText.Sans>
        <View style={styles.scoreBlock}>
          <AppText.Sans preset="label" color={theme.ink3} style={styles.scoreLabel}>{opponent.displayName ?? 'Opponent'}</AppText.Sans>
          <AppText.Serif preset="display" color={theme.ink}>{theirScore}</AppText.Serif>
        </View>
      </View>

      {myAnswers.length > 0 && (
        <View style={styles.breakdown}>
          <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.breakdownTitle}>Your Answers</AppText.Serif>
          {myAnswers.map((a, idx) => (
            <View key={a.id} style={[
              styles.answerCard,
              { borderColor: a.isCorrect ? theme.accent : theme.coral,
                backgroundColor: a.isCorrect ? theme.accentSoft : theme.coralSoft },
            ]}>
              <View style={styles.answerHeader}>
                <AppText.Mono preset="mono" color={theme.ink2}>Q{idx + 1}</AppText.Mono>
                <AppText.Mono preset="chipLabel" color={theme.ink3} style={{ backgroundColor: theme.bg2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 }}>
                  {a.question.category}
                </AppText.Mono>
                <AppText.Mono preset="chipLabel" style={[
                  styles.answerBadge,
                  { backgroundColor: a.isCorrect ? theme.accentSoft : theme.coralSoft,
                    color: a.isCorrect ? theme.accentDeep : theme.coral },
                ]}>
                  {a.isCorrect ? 'Correct' : 'Wrong'}
                </AppText.Mono>
              </View>
              <AppText.Serif preset="questionLg" color={theme.ink} style={styles.questionText}>{a.question.text}</AppText.Serif>
              <View style={styles.optionsGrid}>
                {(a.question.options as string[]).map((opt, i) => {
                  const isSelected = i === a.selectedAnswer;
                  const isCorrectOpt = i === a.question.correctAnswer;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.optionRow,
                        { backgroundColor: theme.bg2 },
                        isCorrectOpt && { backgroundColor: theme.accentSoft },
                        isSelected && !isCorrectOpt && { backgroundColor: theme.coralSoft },
                      ]}
                    >
                      <AppText.Sans
                        preset="body"
                        style={[
                          isCorrectOpt && { color: theme.accentDeep, fontWeight: '600' },
                          isSelected && !isCorrectOpt && { color: theme.coral, fontWeight: '600' },
                          !isCorrectOpt && !isSelected && { color: theme.ink2 },
                        ]}
                      >
                        {String.fromCharCode(65 + i)}. {opt}
                      </AppText.Sans>
                    </View>
                  );
                })}
              </View>
              <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.explanationLabel}>Explanation</AppText.Mono>
              <AppText.Sans preset="body" color={theme.ink2} style={styles.explanationText}>{a.question.explanation}</AppText.Sans>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 24 },
  title: { flex: 1 },
  outcomeLabel: {
    textAlign: 'center',
    marginBottom: 16,
  },
  forfeitBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 24,
    gap: 24,
  },
  scoreBlock: { alignItems: 'center', flex: 1 },
  scoreLabel: { marginBottom: 6 },
  eloDelta: { marginTop: 4 },
  breakdown: { paddingHorizontal: 20 },
  breakdownTitle: { marginBottom: 16 },
  answerCard: { borderRadius: 12, borderWidth: 1.5, padding: 16, marginBottom: 16 },
  answerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  answerBadge: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 99 },
  questionText: { marginBottom: 12 },
  optionsGrid: { gap: 6, marginBottom: 12 },
  optionRow: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  explanationLabel: { textTransform: 'uppercase', marginBottom: 4 },
  explanationText: { lineHeight: 18 },
});
