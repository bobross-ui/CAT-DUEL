import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import DesktopFrame from '../components/web/DesktopFrame';
import EyebrowLabel from '../components/web/EyebrowLabel';
import Text from '../components/Text';
import Button from '../components/Button';
import MathText from '../components/MathText';
import TitaAnswerPad from '../components/TitaAnswerPad';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { questionService, type AnswerResult, type Question } from '../services/questions';
import { useTheme } from '../theme/ThemeProvider';
import MobileQuestionScreen from './QuestionScreen.mobile';

type Props = ComponentProps<typeof MobileQuestionScreen>;

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

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

function getCategoryCounts(questions: AnsweredQ[]): Record<string, number> {
  return questions.reduce<Record<string, number>>((counts, question) => {
    counts[question.category] = (counts[question.category] ?? 0) + 1;
    return counts;
  }, {});
}

export default function QuestionScreenDesktop({ navigation, route }: Props) {
  const { categories, difficulty } = route.params;
  const { theme } = useTheme();
  const categoryLabel = categories.join(' · ');

  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [noMore, setNoMore] = useState(false);
  const [error, setError] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [hoveredOption, setHoveredOption] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const session = useRef<SessionStats>({
    questionsAnswered: 0,
    correctAnswers: 0,
    totalTimeMs: 0,
    answeredQuestions: [],
  });
  const questionStartTime = useRef<number>(Date.now());

  const qNumber = session.current.questionsAnswered + 1;
  useDocumentTitle(question ? `Practice · Q${qNumber} · CAT Duel` : 'Practice · CAT Duel');

  const handleEndSession = useCallback(() => {
    navigation.replace('PracticeSummary', {
      total: session.current.questionsAnswered,
      correct: session.current.correctAnswers,
      totalTimeMs: session.current.totalTimeMs,
      questions: session.current.answeredQuestions,
    });
  }, [navigation]);

  const loadNextQuestion = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelectedOption(null);
    setTypedAnswer('');
    setHoveredOption(null);
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
  }, [categories, difficulty]);

  useEffect(() => {
    void loadNextQuestion();
  }, [loadNextQuestion]);

  const handleSubmit = useCallback(async () => {
    if (!question || submitting) return;
    if (question.questionType === 'MCQ' && selectedOption === null) return;
    if (question.questionType === 'TITA' && typedAnswer.trim().length === 0) return;
    setSubmitting(true);

    const timeTakenMs = Date.now() - questionStartTime.current;

    try {
      const res = await questionService.submitAnswer(
        question.id,
        question.questionType === 'TITA'
          ? { typedAnswer, timeTakenMs }
          : { selectedAnswer: selectedOption as number, timeTakenMs },
      );
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
  }, [question, selectedOption, submitting, typedAnswer]);

  const selectOption = useCallback((index: number) => {
    if (result) return;
    setSelectedOption(index);
  }, [result]);

  const handleEnter = useCallback(() => {
    if (result) {
      void loadNextQuestion();
      return;
    }
    void handleSubmit();
  }, [handleSubmit, loadNextQuestion, result]);

  const isTita = question?.questionType === 'TITA';

  const shortcuts = useMemo(() => {
    if (isTita) {
      return [
        ...['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => ({
          key,
          handler: () => !result && setTypedAnswer((value) => `${value}${key}`),
        })),
        { key: '.', handler: () => !result && setTypedAnswer((value) => value.includes('.') ? value : `${value}.`) },
        { key: '-', handler: () => !result && setTypedAnswer((value) => value.length === 0 ? '-' : value) },
        { key: 'Backspace', handler: () => !result && setTypedAnswer((value) => value.slice(0, -1)) },
        { key: 'Enter', handler: handleEnter },
      ];
    }

    return [
      { key: '1', handler: () => selectOption(0) },
      { key: '2', handler: () => selectOption(1) },
      { key: '3', handler: () => selectOption(2) },
      { key: '4', handler: () => selectOption(3) },
      { key: 'Enter', handler: handleEnter },
    ];
  }, [handleEnter, isTita, result, selectOption]);
  useKeyboardShortcuts(shortcuts, !!question && !loading && !noMore && !error);

  const preventContextMenu = Platform.OS === 'web'
    ? { onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault() }
    : {};
  const handleFocusedOptionEnter = Platform.OS === 'web'
    ? {
      onKeyDown: (event: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        handleEnter();
      },
    }
    : {};

  if (loading) {
    return (
      <DesktopFrame activeRoute="PracticeHome" contentStyle={styles.centeredFrame} showLeftRail={false}>
        <ActivityIndicator color={theme.ink3} />
      </DesktopFrame>
    );
  }

  if (noMore) {
    return (
      <DesktopFrame activeRoute="PracticeHome" contentStyle={styles.centeredFrame} showLeftRail={false}>
        <View style={styles.emptyState}>
          <Text.Serif preset="h1Serif" color={theme.ink} style={styles.centerText}>
            You've seen every question in this filter.
          </Text.Serif>
          <Text.Sans preset="body" color={theme.ink3} style={styles.emptySub}>
            Try a different section.
          </Text.Sans>
          {session.current.questionsAnswered > 0 && (
            <Button label="View Summary" onPress={handleEndSession} style={styles.fullButton} />
          )}
          <Button label="Try a different section" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </DesktopFrame>
    );
  }

  if (error) {
    return (
      <DesktopFrame activeRoute="PracticeHome" contentStyle={styles.centeredFrame} showLeftRail={false}>
        <View style={styles.emptyState}>
          <Text.Serif preset="h1Serif" color={theme.ink} style={styles.centerText}>
            Couldn't load.
          </Text.Serif>
          <Text.Sans preset="body" color={theme.ink3} style={styles.emptySub}>
            Check your connection and try again.
          </Text.Sans>
          <Button label="Retry" onPress={loadNextQuestion} style={styles.fullButton} />
          <Button label="Back to Practice" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </DesktopFrame>
    );
  }

  return (
    <DesktopFrame activeRoute="PracticeHome" contentStyle={styles.frameContent} showLeftRail={false}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View>
            <EyebrowLabel>
              {question?.category}{question?.subTopic ? ` · ${question.subTopic}` : ''}
            </EyebrowLabel>
            <Text.Mono preset="mono" color={theme.ink3} style={styles.questionCounter}>Q {qNumber}</Text.Mono>
          </View>
          <View style={[styles.modePill, { backgroundColor: theme.bg2, borderColor: theme.line }]}>
            <Text.Mono preset="chipLabel" color={theme.ink3}>PRACTICE</Text.Mono>
          </View>
          <Pressable
            onPress={handleEndSession}
            accessibilityRole="button"
            accessibilityLabel="End practice session"
            style={({ pressed }) => [styles.endButton, { opacity: pressed ? 0.72 : 1 }]}
          >
            <Text.Sans preset="label" color={theme.ink3}>End session</Text.Sans>
          </Pressable>
        </View>

        <View style={[styles.practiceBody, { borderColor: theme.line, backgroundColor: theme.card }]}>
          <View
            nativeID="practice-question-panel"
            style={[
              styles.questionPanel,
              { borderRightColor: theme.line },
            ]}
            {...preventContextMenu}
          >
            <View style={styles.panelHeader}>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
                {question?.category || categoryLabel}
              </Text.Mono>
              {question?.subTopic ? (
                <Text.Mono preset="chipLabel" color={theme.ink3}>{question.subTopic}</Text.Mono>
              ) : null}
            </View>
            <ScrollView
              style={styles.questionScrollView}
              contentContainerStyle={styles.questionScroll}
              showsVerticalScrollIndicator
            >
              <MathText
                preset="question"
                color={theme.ink2}
                style={styles.questionText}
                selectable={false}
              >
                {question?.text}
              </MathText>
            </ScrollView>
          </View>

          <View nativeID="practice-answer-panel" style={styles.answerPanel} {...preventContextMenu}>
            <View style={styles.chipRow}>
              <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
                <Text.Mono preset="chipLabel" color={theme.ink3}>{question?.category}</Text.Mono>
              </View>
              {question?.subTopic ? (
                <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
                  <Text.Mono preset="chipLabel" color={theme.ink3}>{question.subTopic}</Text.Mono>
                </View>
              ) : null}
              <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
                <Text.Mono preset="chipLabel" color={theme.ink3}>Q{qNumber}</Text.Mono>
              </View>
            </View>

            <ScrollView
              style={styles.answerScrollView}
              contentContainerStyle={styles.answerScroll}
              showsVerticalScrollIndicator={false}
            >
              {isTita ? (
                <TitaAnswerPad
                  value={typedAnswer}
                  onChange={setTypedAnswer}
                  disabled={!!result}
                />
              ) : (
                <View style={styles.options}>
                  {question?.options?.map((option, index) => {
                  let borderColor = theme.line;
                  let bg = theme.card;
                  let keyBg = theme.bg2;
                  let keyColor = theme.ink3;
                  let keyBorder = theme.line;

                  if (result) {
                    if (index === result.correctAnswer) {
                      borderColor = theme.accent;
                      bg = theme.accentSoft;
                      keyBg = theme.accent;
                      keyColor = theme.bg;
                      keyBorder = theme.accent;
                    } else if (index === selectedOption && !result.isCorrect) {
                      borderColor = theme.coral;
                      bg = theme.coralSoft;
                      keyBg = theme.coral;
                      keyColor = theme.bg;
                      keyBorder = theme.coral;
                    }
                  } else if (index === selectedOption) {
                    borderColor = theme.accent;
                    bg = theme.accentSoft;
                    keyBg = theme.accent;
                    keyColor = theme.bg;
                    keyBorder = theme.accent;
                  }

                  return (
                    <Pressable
                      key={option}
                      onPress={() => selectOption(index)}
                      onHoverIn={() => setHoveredOption(index)}
                      onHoverOut={() => setHoveredOption(null)}
                      disabled={!!result}
                      accessibilityRole="button"
                      accessibilityLabel={`Answer ${OPTION_KEYS[index]}. ${option}`}
                      accessibilityState={{ selected: selectedOption === index, disabled: !!result }}
                      {...handleFocusedOptionEnter}
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor: bg,
                          borderColor: hoveredOption === index && !result ? theme.ink4 : borderColor,
                          opacity: pressed ? 0.88 : 1,
                        },
                      ]}
                    >
                      <View style={[styles.keyBadge, { backgroundColor: keyBg, borderColor: keyBorder }]}>
                        <Text.Mono preset="mono" color={keyColor}>{OPTION_KEYS[index]}</Text.Mono>
                      </View>
                      <MathText preset="body" color={theme.ink} style={styles.optionText} selectable={false}>
                        {option}
                      </MathText>
                      {!result && (
                        <View style={[styles.keyHint, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
                          <Text.Mono preset="chipLabel" color={theme.ink3}>{index + 1}</Text.Mono>
                        </View>
                      )}
                    </Pressable>
                  );
                  })}
                </View>
              )}

              {result && (
                <View style={[styles.explanationBlock, { backgroundColor: theme.bg2, borderColor: theme.line }]}>
                  <EyebrowLabel color={result.isCorrect ? theme.accentDeep : theme.coral}>
                    {result.isCorrect ? 'Accepted' : 'Rejected'}
                  </EyebrowLabel>
                  {result.correctAnswerText ? (
                    <Text.Sans preset="bodyMed" color={theme.ink2} style={styles.explanationText}>
                      Answer: {result.correctAnswerText}
                    </Text.Sans>
                  ) : null}
                  <MathText preset="body" color={theme.ink2} style={styles.explanationText}>
                    {result.explanation}
                  </MathText>
                </View>
              )}
            </ScrollView>

            <View style={[styles.answerFooter, { borderTopColor: theme.line }]}>
              <Text.Mono preset="mono" color={theme.ink3}>
                {result ? 'Press Enter for the next question' : isTita ? 'Use the keypad, then press Enter' : 'Press Enter to submit'}
              </Text.Mono>
              <View style={styles.actionButton}>
                {result ? (
                  <Button label="Next →" onPress={loadNextQuestion} />
                ) : (
                  <Button
                    label="Submit"
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={isTita ? typedAnswer.trim().length === 0 : selectedOption === null}
                  />
                )}
              </View>
            </View>
          </View>
        </View>
      </View>
    </DesktopFrame>
  );
}

const styles = StyleSheet.create({
  centeredFrame: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyState: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
    marginBottom: 10,
  },
  emptySub: {
    textAlign: 'center',
    marginBottom: 28,
  },
  fullButton: {
    width: '100%',
    marginBottom: 12,
  },
  frameContent: {
    flexGrow: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 26,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
  },
  questionCounter: {
    marginTop: 8,
  },
  modePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  endButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  practiceBody: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  questionPanel: {
    flex: 1.05,
    minHeight: 0,
    borderRightWidth: 1,
    minWidth: 0,
  },
  answerPanel: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  panelHeader: {
    minHeight: 56,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  questionScroll: {
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 32,
  },
  questionScrollView: {
    flex: 1,
  },
  uppercase: {
    textTransform: 'uppercase',
  },
  questionText: {
    lineHeight: 34,
  },
  chipRow: {
    minHeight: 56,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  answerScroll: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  answerScrollView: {
    flex: 1,
  },
  options: {
    gap: 12,
  },
  option: {
    minHeight: 70,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  keyBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  keyHint: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerFooter: {
    minHeight: 76,
    borderTopWidth: 1,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  actionButton: {
    minWidth: 140,
  },
  explanationBlock: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  explanationText: {
    lineHeight: 24,
  },
});
