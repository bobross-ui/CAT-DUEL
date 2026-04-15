import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Animated,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { questionService, Question, AnswerResult } from '../services/questions';

type Props = NativeStackScreenProps<RootStackParamList, 'Question'>;

interface SessionStats {
  questionsAnswered: number;
  correctAnswers: number;
  totalTimeMs: number;
  startedAt: Date;
}

export default function QuestionScreen({ navigation, route }: Props) {
  const { category, difficulty } = route.params;

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
      // error handled by showing noMore state
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

  function handleNext() {
    loadNextQuestion();
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (noMore) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noMoreEmoji}>🎉</Text>
        <Text style={styles.noMoreTitle}>You've seen all questions!</Text>
        <Text style={styles.noMoreSub}>in this category</Text>
        {session.current.questionsAnswered > 0 && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleEndSession}>
            <Text style={styles.primaryButtonText}>View Summary</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonText}>Back to Practice</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.categoryBadge}>{question?.category} · {question?.subTopic ?? `Difficulty ${question?.difficulty}`}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.timer}>{formatTime(elapsedSec)}</Text>
          <TouchableOpacity onPress={handleEndSession}>
            <Text style={styles.endText}>End</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Question */}
        <Text style={styles.questionText}>{question?.text}</Text>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {question?.options.map((option, index) => {
            let optionStyle = styles.option;
            let textStyle = styles.optionText;

            if (result) {
              if (index === result.correctAnswer) {
                optionStyle = { ...styles.option, ...styles.optionCorrect };
                textStyle = { ...styles.optionText, ...styles.optionTextCorrect };
              } else if (index === selectedOption && !result.isCorrect) {
                optionStyle = { ...styles.option, ...styles.optionWrong };
                textStyle = { ...styles.optionText, ...styles.optionTextWrong };
              }
            } else if (index === selectedOption) {
              optionStyle = { ...styles.option, ...styles.optionSelected };
              textStyle = { ...styles.optionText, ...styles.optionTextSelected };
            }

            return (
              <TouchableOpacity
                key={index}
                style={optionStyle}
                onPress={() => !result && setSelectedOption(index)}
                disabled={!!result}
              >
                <Text style={styles.optionIndex}>{String.fromCharCode(65 + index)}.</Text>
                <Text style={textStyle}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Spacer for result panel */}
        {result && <View style={{ height: 280 }} />}
      </ScrollView>

      {/* Submit button */}
      {!result && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, (selectedOption === null || submitting) && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={selectedOption === null || submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryButtonText}>Submit Answer</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Result overlay */}
      {result && (
        <Animated.View style={[styles.resultPanel, { transform: [{ translateY: resultSlide }] }]}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultEmoji}>{result.isCorrect ? '✅' : '❌'}</Text>
            <Text style={styles.resultTitle}>{result.isCorrect ? 'Correct!' : 'Incorrect'}</Text>
          </View>
          <ScrollView style={styles.explanationScroll} nestedScrollEnabled>
            <Text style={styles.explanationLabel}>Explanation</Text>
            <Text style={styles.explanationText}>{result.explanation}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
            <Text style={styles.primaryButtonText}>Next Question →</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  categoryBadge: { fontSize: 13, fontWeight: '600', color: '#666' },
  timer: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  endText: { fontSize: 14, color: '#999', fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 24 },
  questionText: { fontSize: 18, fontWeight: '500', lineHeight: 28, marginBottom: 32, color: '#1a1a1a' },
  optionsContainer: { gap: 12 },
  option: {
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  optionSelected: { borderColor: '#1a1a1a', backgroundColor: '#f5f5f5' },
  optionCorrect: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  optionWrong: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  optionIndex: { fontSize: 15, fontWeight: '700', color: '#999', width: 20 },
  optionText: { fontSize: 15, color: '#333', flex: 1, lineHeight: 22 },
  optionTextSelected: { color: '#1a1a1a', fontWeight: '500' },
  optionTextCorrect: { color: '#16a34a', fontWeight: '600' },
  optionTextWrong: { color: '#dc2626', fontWeight: '500' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  primaryButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 0,
  },
  primaryButtonDisabled: { backgroundColor: '#ccc' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  noMoreEmoji: { fontSize: 48, marginBottom: 16 },
  noMoreTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  noMoreSub: { fontSize: 15, color: '#666', marginBottom: 32 },
  resultPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
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
  resultTitle: { fontSize: 20, fontWeight: '700' },
  explanationScroll: { maxHeight: 120, marginBottom: 16 },
  explanationLabel: { fontSize: 13, fontWeight: '600', color: '#999', textTransform: 'uppercase', marginBottom: 6 },
  explanationText: { fontSize: 14, color: '#333', lineHeight: 22 },
});
