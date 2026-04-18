import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import api from '../services/api';
import { useTheme } from '../theme/ThemeProvider';

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
  const { theme } = useTheme();
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
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.ink} />
      </View>
    );
  }

  if (!match || !myId) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.errorText, { color: theme.coral }]}>Failed to load match.</Text>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backText, { color: theme.ink }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>
          vs {opponentName ?? opponent.displayName ?? 'Opponent'}
        </Text>
      </View>

      <Text style={[styles.outcomeLabel, { color: outcomeColor }]}>{outcomeLabel}</Text>

      {match.status === 'forfeited' && (
        <View style={[styles.forfeitBanner, { backgroundColor: theme.amberSoft, borderColor: theme.amber }]}>
          <Text style={[styles.forfeitText, { color: theme.amberDeep }]}>Match ended by forfeit</Text>
        </View>
      )}

      <View style={[styles.summaryCard, { borderColor: theme.line }]}>
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreLabel, { color: theme.ink3 }]}>You</Text>
          <Text style={[styles.scoreValue, { color: theme.ink }]}>{myScore}</Text>
          <Text style={[styles.eloDelta, { color: eloColor }]}>
            {myEloChange > 0 ? '+' : ''}{myEloChange} Elo
          </Text>
        </View>
        <Text style={[styles.scoreSep, { color: theme.line }]}>—</Text>
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreLabel, { color: theme.ink3 }]}>{opponent.displayName ?? 'Opponent'}</Text>
          <Text style={[styles.scoreValue, { color: theme.ink }]}>{theirScore}</Text>
        </View>
      </View>

      {myAnswers.length > 0 && (
        <View style={styles.breakdown}>
          <Text style={[styles.breakdownTitle, { color: theme.ink }]}>Your Answers</Text>
          {myAnswers.map((a, idx) => (
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
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16 },
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
  title: { fontSize: 18, fontWeight: '700', flex: 1 },
  outcomeLabel: {
    fontSize: 32,
    fontWeight: '800',
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
  forfeitText: { fontSize: 13, fontWeight: '600' },
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
  scoreLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  scoreValue: { fontSize: 40, fontWeight: '800' },
  eloDelta: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  scoreSep: { fontSize: 22 },
  breakdown: { paddingHorizontal: 20 },
  breakdownTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  answerCard: { borderRadius: 12, borderWidth: 1.5, padding: 16, marginBottom: 16 },
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
});
