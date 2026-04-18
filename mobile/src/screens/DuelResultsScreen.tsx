import { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import api from '../services/api';
import EloChangeCard from '../components/EloChangeCard';
import Button from '../components/Button';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'DuelResults'>;

interface AnswerDetail {
  id: string;
  questionId: string;
  selectedAnswer: number;
  isCorrect: boolean;
  timeTakenMs: number;
  question: {
    id: string;
    category: string;
    text: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  };
}

export default function DuelResultsScreen({ route, navigation }: Props) {
  const { results, userId, opponent } = route.params;
  const { theme } = useTheme();

  const isPlayer1 = results.player1.userId === userId;
  const yours = isPlayer1 ? results.player1 : results.player2;
  const theirs = isPlayer1 ? results.player2 : results.player1;

  const youWon = results.winnerId === userId;
  const isDraw = results.isDraw;
  const outcomeLabel = isDraw ? 'Draw!' : youWon ? 'You Won!' : 'You Lost';
  const outcomeColor = isDraw ? theme.amber : youWon ? theme.accent : theme.coral;

  const [answers, setAnswers] = useState<AnswerDetail[]>([]);
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);

  useEffect(() => {
    api
      .get(`/games/${results.gameId}`)
      .then((res) => setAnswers(res.data.data.answers ?? []))
      .catch(() => {})
      .finally(() => setLoadingBreakdown(false));
  }, [results.gameId]);

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.container}>
      <AppText.Serif preset="display" color={outcomeColor} style={styles.outcomeLabel}>{outcomeLabel}</AppText.Serif>

      {results.isForfeit && (
        <View style={[styles.forfeitBanner, { backgroundColor: theme.amberSoft, borderColor: theme.amber }]}>
          <AppText.Sans preset="label" color={theme.amberDeep}>
            {youWon ? 'Opponent forfeited the match' : 'You forfeited the match'}
          </AppText.Sans>
        </View>
      )}

      <EloChangeCard
        eloBefore={yours.eloBefore}
        eloAfter={yours.eloAfter}
        eloDelta={yours.eloDelta}
        tierChanged={yours.tierChanged}
        newTier={yours.newTier}
      />

      <View style={[styles.scoreRow, { borderColor: theme.line }]}>
        <View style={styles.scoreBlock}>
          <AppText.Sans preset="label" color={theme.ink3}>You</AppText.Sans>
          <AppText.Serif preset="display" color={theme.ink} style={styles.scoreNumber}>{yours.score}</AppText.Serif>
          <AppText.Sans preset="small" color={theme.ink3}>{yours.questionsAnswered} answered</AppText.Sans>
        </View>
        <AppText.Sans preset="body" color={theme.line}>—</AppText.Sans>
        <View style={styles.scoreBlock}>
          <AppText.Sans preset="label" color={theme.ink3}>{opponent.displayName ?? 'Opponent'}</AppText.Sans>
          <AppText.Serif preset="display" color={theme.ink} style={styles.scoreNumber}>{theirs.score}</AppText.Serif>
          <AppText.Sans preset="small" color={theme.ink3}>{theirs.questionsAnswered} answered</AppText.Sans>
        </View>
      </View>

      {loadingBreakdown ? (
        <ActivityIndicator style={styles.loader} color={theme.ink3} />
      ) : answers.length > 0 ? (
        <View style={styles.breakdown}>
          <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.breakdownTitle}>Your Answers</AppText.Serif>
          {answers.map((a, idx) => (
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
      ) : null}

      <View style={styles.actions}>
        <Button label="Play Again" onPress={() => navigation.replace('Matchmaking')} style={styles.buttonSpacing} />
        <Button label="Back to Home" variant="ghost" onPress={() => navigation.navigate('MainTabs')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 80,
    paddingBottom: 48,
    alignItems: 'center',
  },
  outcomeLabel: {
    marginBottom: 40,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginBottom: 32,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 28,
    width: '100%',
    justifyContent: 'center',
  },
  scoreBlock: { alignItems: 'center', flex: 1 },
  scoreNumber: { marginVertical: 6 },
  loader: { marginVertical: 32 },
  breakdown: { width: '100%', marginBottom: 24 },
  breakdownTitle: { marginBottom: 16 },
  answerCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
  },
  answerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  answerBadge: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 99 },
  questionText: { marginBottom: 12 },
  optionsGrid: { gap: 6, marginBottom: 12 },
  optionRow: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  explanationLabel: { textTransform: 'uppercase', marginBottom: 4 },
  explanationText: { lineHeight: 18 },
  actions: { width: '100%', gap: 12, marginTop: 8 },
  buttonSpacing: { marginBottom: 0 },
  forfeitBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
});
