import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import api from '../services/api';
import EloChangeCard from '../components/EloChangeCard';
import Button from '../components/Button';
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
      <Text style={[styles.outcomeLabel, { color: outcomeColor }]}>{outcomeLabel}</Text>

      {results.isForfeit && (
        <View style={[styles.forfeitBanner, { backgroundColor: theme.amberSoft, borderColor: theme.amber }]}>
          <Text style={[styles.forfeitText, { color: theme.amberDeep }]}>
            {youWon ? 'Opponent forfeited the match' : 'You forfeited the match'}
          </Text>
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
          <Text style={[styles.scoreName, { color: theme.ink3 }]}>You</Text>
          <Text style={[styles.scoreNumber, { color: theme.ink }]}>{yours.score}</Text>
          <Text style={[styles.scoreAnswered, { color: theme.ink3 }]}>{yours.questionsAnswered} answered</Text>
        </View>
        <Text style={[styles.scoreSep, { color: theme.line }]}>—</Text>
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreName, { color: theme.ink3 }]}>{opponent.displayName ?? 'Opponent'}</Text>
          <Text style={[styles.scoreNumber, { color: theme.ink }]}>{theirs.score}</Text>
          <Text style={[styles.scoreAnswered, { color: theme.ink3 }]}>{theirs.questionsAnswered} answered</Text>
        </View>
      </View>

      {loadingBreakdown ? (
        <ActivityIndicator style={styles.loader} color={theme.ink3} />
      ) : answers.length > 0 ? (
        <View style={styles.breakdown}>
          <Text style={[styles.breakdownTitle, { color: theme.ink }]}>Your Answers</Text>
          {answers.map((a, idx) => (
            <View key={a.id} style={[
              styles.answerCard,
              { borderColor: a.isCorrect ? theme.accent : theme.coral,
                backgroundColor: a.isCorrect ? theme.accentSoft : theme.coralSoft },
            ]}>
              <View style={styles.answerHeader}>
                <Text style={[styles.answerNumber, { color: theme.ink2 }]}>Q{idx + 1}</Text>
                <Text style={[styles.answerCategory, { color: theme.ink3, backgroundColor: theme.bg2 }]}>
                  {a.question.category}
                </Text>
                <Text style={[
                  styles.answerBadge,
                  { backgroundColor: a.isCorrect ? theme.accentSoft : theme.coralSoft,
                    color: a.isCorrect ? theme.accentDeep : theme.coral },
                ]}>
                  {a.isCorrect ? 'Correct' : 'Wrong'}
                </Text>
              </View>
              <Text style={[styles.questionText, { color: theme.ink }]}>{a.question.text}</Text>
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
                      <Text style={[
                        styles.optionText,
                        { color: theme.ink2 },
                        isCorrectOpt && { color: theme.accentDeep, fontWeight: '600' },
                        isSelected && !isCorrectOpt && { color: theme.coral, fontWeight: '600' },
                      ]}>
                        {String.fromCharCode(65 + i)}. {opt}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.explanationLabel, { color: theme.ink3 }]}>Explanation</Text>
              <Text style={[styles.explanationText, { color: theme.ink2 }]}>{a.question.explanation}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label="Play Again" onPress={() => navigation.replace('Matchmaking')} style={styles.buttonSpacing} />
        <Button label="Back to Home" variant="secondary" onPress={() => navigation.navigate('MainTabs')} />
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
    fontSize: 40,
    fontWeight: '800',
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
  scoreName: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  scoreNumber: { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  scoreAnswered: { fontSize: 12, marginTop: 4 },
  scoreSep: { fontSize: 24, fontWeight: '300' },
  loader: { marginVertical: 32 },
  breakdown: { width: '100%', marginBottom: 24 },
  breakdownTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  answerCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
  },
  answerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  answerNumber: { fontSize: 12, fontWeight: '700' },
  answerCategory: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  answerBadge: { marginLeft: 'auto', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 99 },
  questionText: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  optionsGrid: { gap: 6, marginBottom: 12 },
  optionRow: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  optionText: { fontSize: 13 },
  explanationLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  explanationText: { fontSize: 13, lineHeight: 18 },
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
  forfeitText: { fontSize: 13, fontWeight: '600' },
});
