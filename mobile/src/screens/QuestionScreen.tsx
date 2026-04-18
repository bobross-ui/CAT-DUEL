import { useEffect, useRef, useState } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Animated,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { questionService, Question, AnswerResult } from '../services/questions';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'Question'>;

interface SessionStats {
  questionsAnswered: number;
  correctAnswers: number;
  totalTimeMs: number;
  startedAt: Date;
}

export default function QuestionScreen({ navigation, route }: Props) {
  const { category, difficulty } = route.params;
  const { theme } = useTheme();

  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [noMore, setNoMore] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const session = useRef<SessionStats>({
    questionsAnswered: 0,
    correctAnswers: 0,
    totalTimeMs: 0,
    startedAt: new Date(),
  });
  const questionStartTime = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultSlide = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    loadNextQuestion();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startTimer() {
    setElapsedSec(0);
    questionStartTime.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - questionStartTime.current) / 1000));
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function loadNextQuestion() {
    setLoading(true);
    setSelectedOption(null);
    setResult(null);
    resultSlide.setValue(300);

    try {
      const res = await questionService.getNext({ category, difficulty });
      const data = res.data.data;
      if ('noMoreQuestions' in data) {
        setNoMore(true);
      } else {
        setQuestion(data as Question);
        startTimer();
      }
    } catch {
      setNoMore(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (selectedOption === null || !question) return;
    setSubmitting(true);
    stopTimer();

    const timeTakenMs = Date.now() - questionStartTime.current;

    try {
      const res = await questionService.submitAnswer(question.id, selectedOption, timeTakenMs);
      const answerResult = res.data.data;

      session.current.questionsAnswered++;
      session.current.totalTimeMs += timeTakenMs;
      if (answerResult.isCorrect) session.current.correctAnswers++;

      setResult(answerResult);
      Animated.spring(resultSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();
    } finally {
      setSubmitting(false);
    }
  }

  function handleEndSession() {
    stopTimer();
    navigation.replace('PracticeSummary', {
      total: session.current.questionsAnswered,
      correct: session.current.correctAnswers,
      totalTimeMs: session.current.totalTimeMs,
    });
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.ink} />
      </View>
    );
  }

  if (noMore) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <AppText.Sans style={styles.noMoreEmoji}>🎉</AppText.Sans>
        <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.noMoreTitle}>You've seen all questions!</AppText.Serif>
        <AppText.Sans preset="body" color={theme.ink2} style={styles.noMoreSub}>in this category</AppText.Sans>
        {session.current.questionsAnswered > 0 && (
          <Button label="View Summary" onPress={handleEndSession} style={styles.buttonSpacing} />
        )}
        <Button label="Back to Practice" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { borderBottomColor: theme.line2 }]}>
        <View>
          <AppText.Mono preset="eyebrow" color={theme.ink2} style={styles.categoryBadge}>
            {question?.category} · {question?.subTopic ?? `Difficulty ${question?.difficulty}`}
          </AppText.Mono>
        </View>
        <View style={styles.headerRight}>
          <AppText.Mono preset="timer" color={theme.ink} style={styles.timer}>{formatTime(elapsedSec)}</AppText.Mono>
          <TouchableOpacity onPress={handleEndSession}>
            <AppText.Sans preset="label" color={theme.ink3}>End</AppText.Sans>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <AppText.Serif preset="questionLg" color={theme.ink} style={styles.questionText}>{question?.text}</AppText.Serif>

        <View style={styles.optionsContainer}>
          {question?.options.map((option, index) => {
            let borderColor = theme.line;
            let bg = theme.bg;
            let textColor = theme.ink;

            if (result) {
              if (index === result.correctAnswer) {
                borderColor = theme.accent;
                bg = theme.accentSoft;
                textColor = theme.accentDeep;
              } else if (index === selectedOption && !result.isCorrect) {
                borderColor = theme.coral;
                bg = theme.coralSoft;
                textColor = theme.coral;
              }
            } else if (index === selectedOption) {
              borderColor = theme.ink;
              bg = theme.bg2;
              textColor = theme.ink;
            }

            return (
              <TouchableOpacity
                key={index}
                style={[styles.option, { borderColor, backgroundColor: bg }]}
                onPress={() => !result && setSelectedOption(index)}
                disabled={!!result}
              >
                <AppText.Mono preset="mono" color={theme.ink3} style={styles.optionIndex}>
                  {String.fromCharCode(65 + index)}.
                </AppText.Mono>
                <AppText.Sans preset="body" color={textColor} style={styles.optionText}>{option}</AppText.Sans>
              </TouchableOpacity>
            );
          })}
        </View>

        {result && <View style={{ height: 280 }} />}
      </ScrollView>

      {!result && (
        <View style={[styles.footer, { borderTopColor: theme.line2 }]}>
          <Button
            label="Submit Answer"
            onPress={handleSubmit}
            loading={submitting}
            disabled={selectedOption === null}
          />
        </View>
      )}

      {result && (
        <Animated.View style={[
          styles.resultPanel,
          { backgroundColor: theme.bg, transform: [{ translateY: resultSlide }] },
        ]}>
          <View style={styles.resultHeader}>
            <AppText.Sans style={styles.resultEmoji}>{result.isCorrect ? '✅' : '❌'}</AppText.Sans>
            <AppText.Serif preset="h1Serif" color={theme.ink}>{result.isCorrect ? 'Correct!' : 'Incorrect'}</AppText.Serif>
          </View>
          <ScrollView style={styles.explanationScroll} nestedScrollEnabled>
            <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.explanationLabel}>Explanation</AppText.Mono>
            <AppText.Sans preset="body" color={theme.ink2} style={styles.explanationText}>{result.explanation}</AppText.Sans>
          </ScrollView>
          <Button label="Next Question →" onPress={loadNextQuestion} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  categoryBadge: { textTransform: 'uppercase' },
  timer: { fontSize: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: 24 },
  questionText: { marginBottom: 32 },
  optionsContainer: { gap: 12 },
  option: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  optionIndex: { width: 20 },
  optionText: { flex: 1 },
  footer: { padding: 20, borderTopWidth: 1 },
  noMoreEmoji: { fontSize: 48, marginBottom: 16 },
  noMoreTitle: { marginBottom: 8 },
  noMoreSub: { marginBottom: 32 },
  buttonSpacing: { marginBottom: 12, width: '100%' },
  resultPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
    maxHeight: '55%',
  },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  resultEmoji: { fontSize: 24 },
  explanationScroll: { maxHeight: 120, marginBottom: 16 },
  explanationLabel: { textTransform: 'uppercase', marginBottom: 6 },
  explanationText: { lineHeight: 22 },
});
