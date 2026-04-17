import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import api from '../services/api';

type Props = NativeStackScreenProps<RootStackParamList, 'MatchDetail'>;

interface AnswerDetail {
  id: string;
  userId: string;
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

interface MatchData {
  id: string;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  isDraw: boolean;
  status: string;
  player1Score: number;
  player2Score: number;
  player1EloChange: number;
  player2EloChange: number;
  durationSeconds: number;
  finishedAt: string;
  player1: { id: string; displayName: string | null };
  player2: { id: string; displayName: string | null };
  answers: AnswerDetail[];
}

export default function MatchDetailScreen({ route, navigation }: Props) {
  const { matchId, opponentName } = route.params;
  const [match, setMatch] = useState<MatchData | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/games/${matchId}`),
      api.get('/auth/me'),
    ])
      .then(([matchRes, meRes]) => {
        setMatch(matchRes.data.data);
        setMyId(meRes.data.data.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [matchId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  if (!match || !myId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load match.</Text>
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

  const outcomeColor = { WIN: '#16a34a', LOSS: '#dc2626', DRAW: '#f59e0b' }[outcome];
  const outcomeLabel = { WIN: 'You Won', LOSS: 'You Lost', DRAW: 'Draw' }[outcome];

  const myAnswers = match.answers.filter(a => a.userId === myId);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          vs {opponentName ?? opponent.displayName ?? 'Opponent'}
        </Text>
      </View>

      <Text style={[styles.outcomeLabel, { color: outcomeColor }]}>{outcomeLabel}</Text>

      {match.status === 'forfeited' && (
        <View style={styles.forfeitBanner}>
          <Text style={styles.forfeitText}>Match ended by forfeit</Text>
        </View>
      )}

      {/* Score + Elo row */}
      <View style={styles.summaryCard}>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel}>You</Text>
          <Text style={styles.scoreValue}>{myScore}</Text>
          <Text style={[styles.eloDelta, {
            color: myEloChange > 0 ? '#16a34a' : myEloChange < 0 ? '#dc2626' : '#9ca3af',
          }]}>
            {myEloChange > 0 ? '+' : ''}{myEloChange} Elo
          </Text>
        </View>
        <Text style={styles.scoreSep}>—</Text>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel}>{opponent.displayName ?? 'Opponent'}</Text>
          <Text style={styles.scoreValue}>{theirScore}</Text>
        </View>
      </View>

      {/* Answer breakdown */}
      {myAnswers.length > 0 && (
        <View style={styles.breakdown}>
          <Text style={styles.breakdownTitle}>Your Answers</Text>
          {myAnswers.map((a, idx) => (
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
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#e53e3e' },
  container: {
    backgroundColor: '#fff',
    paddingBottom: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 24, color: '#1a1a1a' },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  outcomeLabel: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  forfeitBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#fef9c3',
    borderWidth: 1,
    borderColor: '#fde047',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  forfeitText: { fontSize: 13, fontWeight: '600', color: '#854d0e' },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 16,
    padding: 24,
    gap: 24,
  },
  scoreBlock: { alignItems: 'center', flex: 1 },
  scoreLabel: { fontSize: 13, color: '#999', fontWeight: '600', marginBottom: 6 },
  scoreValue: { fontSize: 40, fontWeight: '800', color: '#1a1a1a' },
  eloDelta: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  scoreSep: { fontSize: 22, color: '#ddd' },
  breakdown: { paddingHorizontal: 20 },
  breakdownTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 16 },
  answerCard: { borderRadius: 12, borderWidth: 1.5, padding: 16, marginBottom: 16 },
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
});
