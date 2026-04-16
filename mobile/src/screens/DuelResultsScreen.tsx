import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import api from '../services/api';

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

  const isPlayer1 = results.player1.userId === userId;
  const yours = isPlayer1 ? results.player1 : results.player2;
  const theirs = isPlayer1 ? results.player2 : results.player1;

  const youWon = results.winnerId === userId;
  const isDraw = results.isDraw;
  const outcomeLabel = isDraw ? 'Draw!' : youWon ? 'You Won!' : 'You Lost';
  const outcomeColor = isDraw ? '#f59e0b' : youWon ? '#16a34a' : '#dc2626';

  const [answers, setAnswers] = useState<AnswerDetail[]>([]);
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);

  useEffect(() => {
    api
      .get(`/games/${results.gameId}`)
      .then((res) => setAnswers(res.data.data.answers ?? []))
      .catch(() => {/* non-critical — breakdown just won't show */})
      .finally(() => setLoadingBreakdown(false));
  }, [results.gameId]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.outcomeLabel, { color: outcomeColor }]}>{outcomeLabel}</Text>

      <View style={styles.scoreRow}>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreName}>You</Text>
          <Text style={styles.scoreNumber}>{yours.score}</Text>
          <Text style={styles.scoreAnswered}>{yours.questionsAnswered} answered</Text>
        </View>
        <Text style={styles.scoreSep}>—</Text>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreName}>{opponent.displayName ?? 'Opponent'}</Text>
          <Text style={styles.scoreNumber}>{theirs.score}</Text>
          <Text style={styles.scoreAnswered}>{theirs.questionsAnswered} answered</Text>
        </View>
      </View>

      {/* Per-question breakdown */}
      {loadingBreakdown ? (
        <ActivityIndicator style={styles.loader} color="#999" />
      ) : answers.length > 0 ? (
        <View style={styles.breakdown}>
          <Text style={styles.breakdownTitle}>Your Answers</Text>
          {answers.map((a, idx) => (
            <View key={a.id} style={[styles.answerCard, a.isCorrect ? styles.answerCorrect : styles.answerWrong]}>
              <View style={styles.answerHeader}>
                <Text style={styles.answerNumber}>Q{idx + 1}</Text>
                <Text style={styles.answerCategory}>{a.question.category}</Text>
                <Text style={[styles.answerBadge, a.isCorrect ? styles.badgeCorrect : styles.badgeWrong]}>
                  {a.isCorrect ? 'Correct' : 'Wrong'}
                </Text>
              </View>
              <Text style={styles.questionText}>{a.question.text}</Text>
              <View style={styles.optionsGrid}>
                {(a.question.options as string[]).map((opt, i) => {
                  const isSelected = i === a.selectedAnswer;
                  const isCorrectOpt = i === a.question.correctAnswer;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.optionRow,
                        isCorrectOpt && styles.optionRowCorrect,
                        isSelected && !isCorrectOpt && styles.optionRowWrong,
                      ]}
                    >
                      <Text style={[
                        styles.optionText,
                        isCorrectOpt && styles.optionTextCorrect,
                        isSelected && !isCorrectOpt && styles.optionTextWrong,
                      ]}>
                        {String.fromCharCode(65 + i)}. {opt}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.explanationLabel}>Explanation</Text>
              <Text style={styles.explanationText}>{a.question.explanation}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.replace('Matchmaking')}
        >
          <Text style={styles.primaryButtonText}>Play Again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.replace('Profile')}
        >
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
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
    borderColor: '#e5e5e5',
    borderRadius: 16,
    padding: 28,
    width: '100%',
    justifyContent: 'center',
  },
  scoreBlock: { alignItems: 'center', flex: 1 },
  scoreName: { fontSize: 14, color: '#999', fontWeight: '600', marginBottom: 8 },
  scoreNumber: { fontSize: 48, fontWeight: '800', color: '#1a1a1a', lineHeight: 52 },
  scoreAnswered: { fontSize: 12, color: '#aaa', marginTop: 4 },
  scoreSep: { fontSize: 24, color: '#ddd', fontWeight: '300' },
  loader: { marginVertical: 32 },
  breakdown: { width: '100%', marginBottom: 24 },
  breakdownTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  answerCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
  },
  answerCorrect: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  answerWrong: { borderColor: '#fecaca', backgroundColor: '#fff5f5' },
  answerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  answerNumber: { fontSize: 12, fontWeight: '700', color: '#666' },
  answerCategory: { fontSize: 11, color: '#888', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  answerBadge: { marginLeft: 'auto', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 99 },
  badgeCorrect: { backgroundColor: '#dcfce7', color: '#15803d' },
  badgeWrong: { backgroundColor: '#fee2e2', color: '#b91c1c' },
  questionText: { fontSize: 14, color: '#1a1a1a', lineHeight: 20, marginBottom: 12 },
  optionsGrid: { gap: 6, marginBottom: 12 },
  optionRow: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f9fafb' },
  optionRowCorrect: { backgroundColor: '#dcfce7' },
  optionRowWrong: { backgroundColor: '#fee2e2' },
  optionText: { fontSize: 13, color: '#444' },
  optionTextCorrect: { color: '#15803d', fontWeight: '600' },
  optionTextWrong: { color: '#b91c1c', fontWeight: '600' },
  explanationLabel: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  explanationText: { fontSize: 13, color: '#555', lineHeight: 18 },
  actions: { width: '100%', gap: 12, marginTop: 8 },
  primaryButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
});
