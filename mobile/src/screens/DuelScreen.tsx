import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, BackHandler, Animated,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Socket } from 'socket.io-client';
import { RootStackParamList, GameFinishedPayload } from '../navigation';
import { createGameSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';

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

  const [duelState, setDuelState] = useState<DuelState>(INITIAL_STATE);
  const socketRef = useRef<Socket | null>(null);
  const questionStartTime = useRef(Date.now());
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Score animations
  const yourScoreScale = useRef(new Animated.Value(1)).current;
  const opponentScoreScale = useRef(new Animated.Value(1)).current;

  function animateScore(anim: Animated.Value) {
    Animated.sequence([
      Animated.spring(anim, { toValue: 1.5, useNativeDriver: true, friction: 3, tension: 200 }),
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 5 }),
    ]).start();
  }

  // ── Socket setup ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function connect() {
      const socket = await createGameSocket();
      if (!mounted) { socket.disconnect(); return; }
      socketRef.current = socket;

      // On connect (initial and reconnect), always join the game room.
      // Server sends game:sync if already ACTIVE, starts countdown if WAITING.
      socket.on('connect', () => {
        socket.emit('game:join', { gameId });
      });

      socket.on('game:countdown', ({ seconds }: { seconds: number }) => {
        if (!mounted) return;
        setDuelState((prev) => ({ ...prev, phase: 'COUNTDOWN', countdownSeconds: seconds }));

        // Tick down visually — server drives the real timing
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

      socket.on('game:start', ({ duration, totalQuestions }: { duration: number; totalQuestions: number }) => {
        if (!mounted) return;
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setDuelState((prev) => ({
          ...prev,
          phase: 'ACTIVE',
          duration,
          timeRemaining: duration,
          totalQuestions,
        }));
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
        animateScore(opponentScoreScale);
        setDuelState((prev) => ({ ...prev, opponentScore }));
      });

      socket.on('game:timer', ({ remaining }: { remaining: number }) => {
        if (!mounted) return;
        setDuelState((prev) => ({ ...prev, timeRemaining: remaining }));
      });

      // Reconnection: server sends full current state
      socket.on('game:sync', ({
        yourScore,
        opponentScore,
        timeRemaining,
        currentQuestion,
        questionNumber,
        totalQuestions,
      }: {
        yourScore: number;
        opponentScore: number;
        timeRemaining: number;
        currentQuestion: ClientQuestion;
        questionNumber: number;
        totalQuestions: number;
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
        navigation.replace('DuelResults', {
          results,
          userId: user!.uid,
          opponent,
        });
      });

      socket.on('game:error', ({ message }: { message: string }) => {
        if (!mounted) return;
        Alert.alert('Game Error', message, [
          { text: 'OK', onPress: () => navigation.replace('Profile') },
        ]);
      });
    }

    connect();

    return () => {
      mounted = false;
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [gameId]);

  // ── Hardware back button (Android) ────────────────────────────────────────────

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleQuit();
      return true;
    });
    return () => handler.remove();
  }, [duelState.phase]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  function submitAnswer() {
    if (duelState.selectedAnswer === null || !duelState.currentQuestion) return;
    socketRef.current?.emit('answer:submit', {
      gameId,
      questionId: duelState.currentQuestion.id,
      selectedAnswer: duelState.selectedAnswer,
      timeTakenMs: Date.now() - questionStartTime.current,
    });
    // Disable further selections while waiting for answer:result
    setDuelState((prev) => ({ ...prev, selectedAnswer: prev.selectedAnswer }));
  }

  function handleQuit() {
    if (duelState.phase !== 'ACTIVE' && duelState.phase !== 'COUNTDOWN') {
      navigation.replace('Profile');
      return;
    }
    Alert.alert(
      'Quit Duel?',
      'You will forfeit this match and your opponent will win.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Quit',
          style: 'destructive',
          onPress: () => {
            socketRef.current?.emit('game:forfeit', { gameId });
            socketRef.current?.disconnect();
            navigation.replace('Profile');
          },
        },
      ],
    );
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  const isTimerCritical = duelState.timeRemaining <= 60;

  function renderPrematch() {
    return (
      <View style={styles.centered}>
        <Text style={styles.matchFoundTitle}>Match Found!</Text>
        <View style={styles.opponentCard}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {(opponent.displayName ?? 'O').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.opponentName}>{opponent.displayName ?? 'Opponent'}</Text>
          <Text style={styles.opponentElo}>Elo: {opponent.eloRating}</Text>
        </View>
        <Text style={styles.preparingText}>Connecting to game room...</Text>
      </View>
    );
  }

  function renderCountdown() {
    return (
      <View style={styles.centered}>
        <Text style={styles.countdownLabel}>Get ready!</Text>
        <Text style={styles.countdownNumber}>{duelState.countdownSeconds}</Text>
      </View>
    );
  }

  function renderActive() {
    const { currentQuestion, questionNumber, totalQuestions, selectedAnswer, showFeedback, lastAnswerCorrect } = duelState;
    if (!currentQuestion) return null;

    const feedbackBorderColor = lastAnswerCorrect ? '#16a34a' : '#dc2626';

    return (
      <>
        {/* Score header */}
        <View style={styles.scoreHeader}>
          <View style={styles.playerBlock}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarSmallText}>
                {(user?.displayName ?? 'Y').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.playerLabel}>You</Text>
            <Animated.Text style={[styles.scoreValue, { transform: [{ scale: yourScoreScale }] }]}>
              {duelState.yourScore}
            </Animated.Text>
          </View>

          <View style={styles.timerBlock}>
            <Text style={[styles.timerText, isTimerCritical && styles.timerCritical]}>
              {formatTime(duelState.timeRemaining)}
            </Text>
          </View>

          <View style={styles.playerBlock}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarSmallText}>
                {(opponent.displayName ?? 'O').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.playerLabel}>{opponent.displayName ?? 'Opp'}</Text>
            <Animated.Text style={[styles.scoreValue, { transform: [{ scale: opponentScoreScale }] }]}>
              {duelState.opponentScore}
            </Animated.Text>
          </View>
        </View>

        {/* Question card */}
        <ScrollView
          style={[styles.questionCard, showFeedback && { borderColor: feedbackBorderColor, borderWidth: 2 }]}
          contentContainerStyle={styles.questionCardContent}
        >
          <View style={styles.questionMeta}>
            <Text style={styles.questionNumber}>Q {questionNumber} of {totalQuestions}</Text>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{currentQuestion.category}</Text>
            </View>
          </View>

          <Text style={styles.questionText}>{currentQuestion.text}</Text>

          <View style={styles.optionsContainer}>
            {(currentQuestion.options as string[]).map((option, index) => {
              const isSelected = selectedAnswer === index;
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => !showFeedback && setDuelState((prev) => ({
                    ...prev,
                    selectedAnswer: prev.selectedAnswer === index ? null : index,
                  }))}
                  disabled={showFeedback}
                >
                  <Text style={[styles.optionIndex, isSelected && styles.optionIndexSelected]}>
                    {String.fromCharCode(65 + index)}.
                  </Text>
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Submit */}
        {!showFeedback && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submitButton, selectedAnswer === null && styles.submitButtonDisabled]}
              onPress={submitAnswer}
              disabled={selectedAnswer === null}
            >
              <Text style={styles.submitButtonText}>Submit Answer</Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Quit button — always visible except on prematch */}
      {duelState.phase !== 'PREMATCH' && (
        <TouchableOpacity style={styles.quitButton} onPress={handleQuit}>
          <Text style={styles.quitText}>Quit</Text>
        </TouchableOpacity>
      )}

      {duelState.phase === 'PREMATCH' && renderPrematch()}
      {duelState.phase === 'COUNTDOWN' && renderCountdown()}
      {duelState.phase === 'ACTIVE' && renderActive()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  // Quit
  quitButton: { position: 'absolute', top: 52, right: 20, zIndex: 10, padding: 8 },
  quitText: { fontSize: 14, color: '#999', fontWeight: '600' },

  // Prematch
  matchFoundTitle: { fontSize: 32, fontWeight: '800', marginBottom: 32, color: '#1a1a1a' },
  opponentCard: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    marginBottom: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarInitial: { fontSize: 28, fontWeight: '700', color: '#fff' },
  opponentName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  opponentElo: { fontSize: 14, color: '#666' },
  preparingText: { fontSize: 14, color: '#999' },

  // Countdown
  countdownLabel: { fontSize: 18, color: '#666', marginBottom: 16, fontWeight: '500' },
  countdownNumber: { fontSize: 96, fontWeight: '800', color: '#1a1a1a', lineHeight: 100 },

  // Score header
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  playerBlock: { flex: 1, alignItems: 'center' },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarSmallText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  playerLabel: { fontSize: 12, color: '#999', marginBottom: 2 },
  scoreValue: { fontSize: 28, fontWeight: '800', color: '#1a1a1a' },

  timerBlock: { flex: 1, alignItems: 'center' },
  timerText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    fontVariant: ['tabular-nums'],
  },
  timerCritical: { color: '#dc2626' },

  // Question card
  questionCard: { flex: 1 },
  questionCardContent: { padding: 20, paddingBottom: 32 },
  questionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  questionNumber: { fontSize: 13, fontWeight: '600', color: '#999' },
  categoryBadge: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryBadgeText: { fontSize: 12, fontWeight: '700', color: '#555' },
  questionText: {
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 26,
    color: '#1a1a1a',
    marginBottom: 24,
  },
  optionsContainer: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 14,
  },
  optionSelected: { borderColor: '#1a1a1a', backgroundColor: '#f5f5f5' },
  optionIndex: { fontSize: 15, fontWeight: '700', color: '#bbb', width: 20 },
  optionIndexSelected: { color: '#1a1a1a' },
  optionText: { fontSize: 15, color: '#444', flex: 1, lineHeight: 22 },
  optionTextSelected: { color: '#1a1a1a', fontWeight: '500' },

  // Footer
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  submitButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#ccc' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
