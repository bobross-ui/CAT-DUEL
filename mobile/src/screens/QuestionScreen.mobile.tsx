import { useEffect, useRef, useState } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { questionService, Question, AnswerResult } from '../services/questions';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'Question'>;

interface AnsweredQ {
  category: string;
  subTopic: string | null;
  isCorrect: boolean;
}

interface SessionStats {
  questionsAnswered: number;
  correctAnswers: number;
  totalTimeMs: number;
  answeredQuestions: AnsweredQ[];
}

function getCategoryCounts(questions: AnsweredQ[]): Record<string, number> {
  return questions.reduce<Record<string, number>>((counts, question) => {
    counts[question.category] = (counts[question.category] ?? 0) + 1;
    return counts;
  }, {});
}

export default function QuestionScreen({ navigation, route }: Props) {
  const { categories, difficulty } = route.params;
  const { theme } = useTheme();

  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [noMore, setNoMore] = useState(false);
  const [error, setError] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const session = useRef<SessionStats>({
    questionsAnswered: 0,
    correctAnswers: 0,
    totalTimeMs: 0,
    answeredQuestions: [],
  });
  const questionStartTime = useRef<number>(Date.now());

  useEffect(() => {
    loadNextQuestion();
  }, []);

  async function loadNextQuestion() {
    setLoading(true);
    setError('');
    setSelectedOption(null);
    setResult(null);
    questionStartTime.current = Date.now();

    try {
      const res = await questionService.getNext({
        categories,
        categoryCounts: getCategoryCounts(session.current.answeredQuestions),
        difficulty,
      });
      const data = res.data.data;
      if ('noMoreQuestions' in data) {
        setNoMore(true);
        setQuestion(null);
      } else {
        setNoMore(false);
        setQuestion(data as Question);
      }
    } catch {
      setError('Failed to load question.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (selectedOption === null || !question) return;
    setSubmitting(true);

    const timeTakenMs = Date.now() - questionStartTime.current;

    try {
      const res = await questionService.submitAnswer(question.id, selectedOption, timeTakenMs);
      const answerResult = res.data.data;

      session.current.questionsAnswered++;
      session.current.totalTimeMs += timeTakenMs;
      if (answerResult.isCorrect) session.current.correctAnswers++;
      session.current.answeredQuestions.push({
        category: question.category,
        subTopic: question.subTopic,
        isCorrect: answerResult.isCorrect,
      });

      setResult(answerResult);
    } finally {
      setSubmitting(false);
    }
  }

  function handleEndSession() {
    navigation.replace('PracticeSummary', {
      total: session.current.questionsAnswered,
      correct: session.current.correctAnswers,
      totalTimeMs: session.current.totalTimeMs,
      questions: session.current.answeredQuestions,
    });
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.ink3} />
      </View>
    );
  }

  if (noMore) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.noMoreTitle}>
          You've seen every question in this filter.
        </AppText.Serif>
        <AppText.Sans preset="body" color={theme.ink3} style={styles.noMoreSub}>
          Try a different section.
        </AppText.Sans>
        {session.current.questionsAnswered > 0 && (
          <Button label="View Summary" onPress={handleEndSession} style={styles.btnSpacing} />
        )}
        <Button label="Try a different section" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.noMoreTitle}>
          Couldn't load.
        </AppText.Serif>
        <AppText.Sans preset="body" color={theme.ink3} style={styles.noMoreSub}>
          Check your connection and try again.
        </AppText.Sans>
        <Button label="Retry" onPress={loadNextQuestion} style={styles.btnSpacing} />
        <Button label="Back to Practice" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const qNumber = session.current.questionsAnswered + 1;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: theme.line }]}>
        <View style={styles.qMeta}>
          <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
            {question?.category}{question?.subTopic ? ` · ${question.subTopic}` : ''}
          </AppText.Mono>
        </View>
        <TouchableOpacity
          onPress={handleEndSession}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="End practice session"
        >
          <AppText.Sans preset="label" color={theme.ink3}>End</AppText.Sans>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Q-number */}
        <AppText.Mono preset="eyebrow" color={theme.ink3} style={[styles.uppercase, styles.qNum]}>
          Q {qNumber}
        </AppText.Mono>

        {/* Question */}
        <AppText.Serif preset="questionLg" color={theme.ink} style={styles.questionText}>
          {question?.text}
        </AppText.Serif>

        {/* Options */}
        <View style={styles.options}>
          {question?.options.map((option, index) => {
            let borderColor = theme.line;
            let bg = theme.card;
            let letterColor = theme.ink3;

            if (result) {
              if (index === result.correctAnswer) {
                borderColor = theme.accent;
                bg = theme.accentSoft;
                letterColor = theme.accentDeep;
              } else if (index === selectedOption && !result.isCorrect) {
                borderColor = theme.coral;
                bg = theme.coralSoft;
                letterColor = theme.coral;
              }
            } else if (index === selectedOption) {
              borderColor = theme.accent;
              bg = theme.accentSoft;
              letterColor = theme.accentDeep;
            }

            return (
              <TouchableOpacity
                key={index}
                style={[styles.option, { borderColor, backgroundColor: bg }]}
                onPress={() => !result && setSelectedOption(index)}
                disabled={!!result}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Answer ${String.fromCharCode(65 + index)}. ${option}`}
                accessibilityState={{ selected: selectedOption === index, disabled: !!result }}
              >
                <AppText.Serif preset="scoreLg" color={letterColor} style={styles.letterKey}>
                  {String.fromCharCode(65 + index)}
                </AppText.Serif>
                <AppText.Sans preset="body" color={theme.ink} style={styles.optionText}>{option}</AppText.Sans>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Inline explanation after submit */}
        {result && (
          <View style={[styles.explanation, { backgroundColor: theme.bg2, borderColor: theme.line }]}>
            <AppText.Mono preset="eyebrow" color={result.isCorrect ? theme.accentDeep : theme.coral} style={styles.uppercase}>
              {result.isCorrect ? 'CORRECT' : 'INCORRECT'}
            </AppText.Mono>
            <AppText.Sans preset="body" color={theme.ink2} style={styles.explanationText}>
              {result.explanation}
            </AppText.Sans>
          </View>
        )}
      </ScrollView>

      {/* ── Footer ── */}
      <View style={[styles.footer, { borderTopColor: theme.line }]}>
        {result ? (
          <Button label="Next →" onPress={loadNextQuestion} />
        ) : (
          <Button
            label="Submit"
            onPress={handleSubmit}
            loading={submitting}
            disabled={selectedOption === null}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  qMeta: { flex: 1 },
  uppercase: { textTransform: 'uppercase' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 16 },
  qNum: { marginBottom: 12 },
  questionText: { marginBottom: 28 },

  // Options
  options: { gap: 10 },
  option: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  letterKey: { fontSize: 16, lineHeight: 22, width: 20 },
  optionText: { flex: 1 },

  // Explanation
  explanation: {
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  explanationText: {},

  // Footer
  footer: { padding: 20, borderTopWidth: 1 },

  // No more
  noMoreTitle: { textAlign: 'center', marginBottom: 10 },
  noMoreSub: { textAlign: 'center', marginBottom: 32 },
  btnSpacing: { marginBottom: 12, width: '100%' },
});
