import { useEffect, useRef, useState } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  ScrollView, Alert, BackHandler, Animated, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Socket } from 'socket.io-client';
import { RootStackParamList, GameFinishedPayload } from '../navigation';
import { createGameSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import Avatar from '../components/Avatar';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'Duel'>;

type Phase = 'PREMATCH' | 'COUNTDOWN' | 'ACTIVE' | 'FINISHED';

interface ClientQuestion {
  id: string;
  category: string;
  subTopic: string | null;
  difficulty: number;
  text: string;
  options: string[];
}

interface DuelState {
  phase: Phase;
  countdownSeconds: number;
  currentQuestion: ClientQuestion | null;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: number | null;
  showFeedback: boolean;
  lastAnswerCorrect: boolean | null;
  yourScore: number;
  opponentScore: number;
  timeRemaining: number;
  duration: number;
}

const INITIAL_STATE: DuelState = {
  phase: 'PREMATCH',
  countdownSeconds: 3,
  currentQuestion: null,
  questionNumber: 0,
  totalQuestions: 0,
  selectedAnswer: null,
  showFeedback: false,
  lastAnswerCorrect: null,
  yourScore: 0,
  opponentScore: 0,
  timeRemaining: 600,
  duration: 600,
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function DuelScreen({ route, navigation }: Props) {
  const { gameId, opponent } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();

  const [duelState, setDuelState] = useState<DuelState>(INITIAL_STATE);
  const socketRef = useRef<Socket | null>(null);
  const questionStartTime = useRef(Date.now());
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const yourScoreScale = useRef(new Animated.Value(1)).current;
  const opponentScoreScale = useRef(new Animated.Value(1)).current;

  function animateScore(anim: Animated.Value) {
    Animated.sequence([
      Animated.spring(anim, { toValue: 1.5, useNativeDriver: true, friction: 3, tension: 200 }),
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start();
  }

  useEffect(() => {
    let mounted = true;

    async function connect() {
      const socket = await createGameSocket();
      if (!mounted) { socket.disconnect(); return; }
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('game:join', { gameId });
      });

      socket.on('game:countdown', ({ seconds }: { seconds: number }) => {
        if (!mounted) return;
        setDuelState((prev) => ({ ...prev, phase: 'COUNTDOWN', countdownSeconds: seconds }));

        let remaining = seconds;
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearInterval(countdownIntervalRef.current!);
            countdownIntervalRef.current = null;
          } else {
            setDuelState((prev) => ({ ...prev, countdownSeconds: remaining }));
          }
        }, 1000);
      });

      socket.on('game:start', ({ duration, totalQuestions, firstQuestion, questionNumber }: { duration: number; totalQuestions: number; firstQuestion: ClientQuestion; questionNumber: number }) => {
        if (!mounted) return;
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        questionStartTime.current = Date.now();
        setDuelState((prev) => ({
          ...prev,
          phase: 'ACTIVE',
          duration,
          timeRemaining: duration,
          totalQuestions,
          currentQuestion: firstQuestion,
          questionNumber,
          selectedAnswer: null,
          showFeedback: false,
        }));
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          setDuelState((prev) => {
            if (prev.timeRemaining <= 0) return prev;
            return { ...prev, timeRemaining: prev.timeRemaining - 1 };
          });
        }, 1000);
      });

      socket.on('game:question', ({ question, questionNumber, totalQuestions }: { question: ClientQuestion; questionNumber: number; totalQuestions: number }) => {
        if (!mounted) return;
        questionStartTime.current = Date.now();
        setDuelState((prev) => ({
          ...prev,
          currentQuestion: question,
          questionNumber,
          totalQuestions,
          selectedAnswer: null,
          showFeedback: false,
          lastAnswerCorrect: null,
        }));
      });

      socket.on('answer:result', ({ isCorrect, yourScore }: { isCorrect: boolean; correctAnswer: number; yourScore: number }) => {
        if (!mounted) return;
        animateScore(yourScoreScale);
        setDuelState((prev) => ({
          ...prev,
          yourScore,
          showFeedback: true,
          lastAnswerCorrect: isCorrect,
        }));
      });

      socket.on('opponent:scored', ({ opponentScore }: { opponentScore: number }) => {
        if (!mounted) return;
        setDuelState((prev) => {
          if (prev.opponentScore !== opponentScore) animateScore(opponentScoreScale);
          return { ...prev, opponentScore };
        });
      });

      socket.on('game:timer', ({ remaining }: { remaining: number }) => {
        if (!mounted) return;
        setDuelState((prev) => ({ ...prev, timeRemaining: remaining }));
      });

      socket.on('game:sync', ({
        yourScore, opponentScore, timeRemaining, currentQuestion, questionNumber, totalQuestions,
      }: {
        yourScore: number; opponentScore: number; timeRemaining: number;
        currentQuestion: ClientQuestion; questionNumber: number; totalQuestions: number;
      }) => {
        if (!mounted) return;
        questionStartTime.current = Date.now();
        setDuelState((prev) => ({
          ...prev,
          phase: 'ACTIVE',
          yourScore,
          opponentScore,
          timeRemaining,
          currentQuestion,
          questionNumber,
          totalQuestions,
          selectedAnswer: null,
          showFeedback: false,
        }));
      });

      socket.on('game:finished', (results: GameFinishedPayload) => {
        if (!mounted) return;
        socket.disconnect();
        navigation.replace('DuelResults', { results, userId: results.currentUserId, opponent });
      });

      socket.on('game:error', ({ message }: { message: string }) => {
        if (!mounted) return;
        Alert.alert('Game Error', message, [
          { text: 'OK', onPress: () => navigation.navigate('MainTabs') },
        ]);
      });
    }

    connect();

    return () => {
      mounted = false;
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [gameId]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleQuit();
      return true;
    });
    return () => handler.remove();
  }, [duelState.phase]);

  function submitAnswer() {
    if (duelState.selectedAnswer === null || !duelState.currentQuestion) return;
    socketRef.current?.emit('answer:submit', {
      gameId,
      questionId: duelState.currentQuestion.id,
      selectedAnswer: duelState.selectedAnswer,
      timeTakenMs: Date.now() - questionStartTime.current,
    });
    setDuelState((prev) => ({ ...prev, selectedAnswer: prev.selectedAnswer }));
  }

  function handleQuit() {
    if (duelState.phase !== 'ACTIVE' && duelState.phase !== 'COUNTDOWN') {
      navigation.navigate('MainTabs');
      return;
    }
    const doQuit = () => {
      // Emit forfeit and let the server's game:finished response drive navigation,
      // so the forfeiting player also lands on the results screen.
      socketRef.current?.emit('game:forfeit', { gameId });
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Quit Duel? You will forfeit this match and your opponent will win.')) {
        doQuit();
      }
    } else {
      Alert.alert(
        'Quit Duel?',
        'You will forfeit this match and your opponent will win.',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Quit', style: 'destructive', onPress: doQuit },
        ],
      );
    }
  }

  const isTimerCritical = duelState.timeRemaining <= 60;

  function renderPrematch() {
    return (
      <View style={styles.centered}>
        <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.matchFoundTitle}>Match Found!</AppText.Serif>
        <View style={[styles.opponentCard, { borderColor: theme.line }]}>
          <Avatar name={opponent.displayName ?? 'O'} size="lg" />
          <AppText.Serif preset="h1Serif" color={theme.ink}>{opponent.displayName ?? 'Opponent'}</AppText.Serif>
          <AppText.Sans preset="body" color={theme.ink2}>Elo: {opponent.eloRating}</AppText.Sans>
        </View>
        <AppText.Sans preset="small" color={theme.ink3}>Connecting to game room...</AppText.Sans>
      </View>
    );
  }

  function renderCountdown() {
    return (
      <View style={styles.centered}>
        <AppText.Sans preset="bodyMed" color={theme.ink2} style={styles.countdownLabel}>Get ready!</AppText.Sans>
        <AppText.Mono preset="deltaLg" color={theme.ink} style={styles.countdownNumber}>{duelState.countdownSeconds}</AppText.Mono>
      </View>
    );
  }

  function renderActive() {
    const { currentQuestion, questionNumber, totalQuestions, selectedAnswer, showFeedback, lastAnswerCorrect } = duelState;
    if (!currentQuestion) return null;

    const feedbackBorderColor = lastAnswerCorrect ? theme.accent : theme.coral;

    return (
      <>
        <View style={[styles.scoreHeader, { borderBottomColor: theme.line2 }]}>
          <View style={styles.playerBlock}>
            <Avatar name={user?.displayName ?? 'Y'} size="sm" />
            <AppText.Sans preset="small" color={theme.ink3}>You</AppText.Sans>
            <Animated.Text style={[styles.scoreValue, { color: theme.ink, transform: [{ scale: yourScoreScale }] }]}>
              {duelState.yourScore}
            </Animated.Text>
          </View>

          <View style={styles.timerBlock}>
            <AppText.Mono preset="timer" color={isTimerCritical ? theme.coral : theme.ink} style={styles.timerText}>
              {formatTime(duelState.timeRemaining)}
            </AppText.Mono>
          </View>

          <View style={styles.playerBlock}>
            <Avatar name={opponent.displayName ?? 'O'} size="sm" />
            <AppText.Sans preset="small" color={theme.ink3}>{opponent.displayName ?? 'Opp'}</AppText.Sans>
            <Animated.Text style={[styles.scoreValue, { color: theme.ink, transform: [{ scale: opponentScoreScale }] }]}>
              {duelState.opponentScore}
            </Animated.Text>
          </View>
        </View>

        <ScrollView
          style={[styles.questionCard, showFeedback && { borderColor: feedbackBorderColor, borderWidth: 2 }]}
          contentContainerStyle={styles.questionCardContent}
        >
          <View style={styles.questionMeta}>
            <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.questionNumber}>
              Q {questionNumber} of {totalQuestions}
            </AppText.Mono>
            <View style={[styles.categoryBadge, { backgroundColor: theme.bg2 }]}>
              <AppText.Mono preset="chipLabel" color={theme.ink2}>
                {currentQuestion.category}
              </AppText.Mono>
            </View>
          </View>

          <AppText.Serif preset="questionLg" color={theme.ink} style={styles.questionText}>{currentQuestion.text}</AppText.Serif>

          <View style={styles.optionsContainer}>
            {(currentQuestion.options as string[]).map((option, index) => {
              const isSelected = selectedAnswer === index;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.option,
                    {
                      borderColor: isSelected ? theme.ink : theme.line,
                      backgroundColor: isSelected ? theme.bg2 : theme.bg,
                    },
                  ]}
                  onPress={() => !showFeedback && setDuelState((prev) => ({
                    ...prev,
                    selectedAnswer: prev.selectedAnswer === index ? null : index,
                  }))}
                  disabled={showFeedback}
                >
                  <AppText.Mono preset="mono" color={isSelected ? theme.ink : theme.ink3} style={styles.optionIndex}>
                    {String.fromCharCode(65 + index)}.
                  </AppText.Mono>
                  <AppText.Sans preset="body" color={isSelected ? theme.ink : theme.ink2} style={styles.optionText}>
                    {option}
                  </AppText.Sans>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {!showFeedback && (
          <View style={[styles.footer, { borderTopColor: theme.line2 }]}>
            <Button
              label="Submit Answer"
              onPress={submitAnswer}
              disabled={selectedAnswer === null}
            />
          </View>
        )}
      </>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {duelState.phase !== 'PREMATCH' && (
        <TouchableOpacity style={styles.quitButton} onPress={handleQuit}>
          <AppText.Sans preset="label" color={theme.ink3}>Quit</AppText.Sans>
        </TouchableOpacity>
      )}

      {duelState.phase === 'PREMATCH' && renderPrematch()}
      {duelState.phase === 'COUNTDOWN' && renderCountdown()}
      {duelState.phase === 'ACTIVE' && renderActive()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  quitButton: { position: 'absolute', top: 52, right: 20, zIndex: 10, padding: 8 },

  matchFoundTitle: { marginBottom: 32 },
  opponentCard: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    marginBottom: 32,
    gap: 8,
  },

  countdownLabel: { marginBottom: 16 },
  countdownNumber: { fontSize: 96, lineHeight: 100 },

  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  playerBlock: { flex: 1, alignItems: 'center', gap: 4 },
  scoreValue: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'JetBrainsMono-SemiBold',
  },

  timerBlock: { flex: 1, alignItems: 'center' },
  timerText: { fontSize: 22 },

  questionCard: { flex: 1 },
  questionCardContent: { padding: 20, paddingBottom: 32 },
  questionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  questionNumber: { textTransform: 'uppercase' },
  categoryBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  questionText: { marginBottom: 24 },
  optionsContainer: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
  },
  optionIndex: { width: 20 },
  optionText: { flex: 1 },

  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
});
