import { useEffect, useRef, useState } from 'react';
import {
  View, Pressable, StyleSheet,
  ScrollView, Alert, BackHandler, Animated, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Socket } from 'socket.io-client';
import { RootStackParamList, GameFinishedPayload, ClientQuestion as NavClientQuestion } from '../navigation';
import { getGameSocket, releaseGameSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import AppText from '../components/Text';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import { radii } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Duel'>;
type ClientQuestion = NavClientQuestion;

interface OpponentProgress {
  currentQuestion: number;
  questionsAnswered: number;
}

interface DuelState {
  currentQuestion: ClientQuestion;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: number | null;
  showFeedback: boolean;
  yourScore: number;
  opponentScore: number;
  timeRemaining: number;
  opponentProgress: OpponentProgress | null;
}

const INITIAL: DuelState = {
  currentQuestion: null as unknown as ClientQuestion,
  questionNumber: 0,
  totalQuestions: 0,
  selectedAnswer: null,
  showFeedback: false,
  yourScore: 0,
  opponentScore: 0,
  timeRemaining: 600,
  opponentProgress: null,
};

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ── Blinking dot — 1.4s period ────────────────────────────────────────────────
function BlinkingDot({ color, animate }: { color: string; animate: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!animate) {
      opacity.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
      opacity.stopAnimation(() => opacity.setValue(1));
    };
  }, [animate, opacity]);

  return (
    <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, opacity }} />
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DuelScreen({ route, navigation }: Props) {
  const { gameId, opponent, initialState } = route.params;
  const { user } = useAuth();
  const { theme } = useTheme();
  const { playHaptic, reduceMotionEnabled } = useAppPreferences();
  const insets = useSafeAreaInsets();

  const [ds, setDs] = useState<DuelState>({
    ...INITIAL,
    timeRemaining: initialState.duration,
    totalQuestions: initialState.totalQuestions,
    currentQuestion: initialState.firstQuestion,
    questionNumber: initialState.questionNumber,
  });
  const [opponentDisconnectNotice, setOpponentDisconnectNotice] = useState<string | null>(null);
  const socketRef         = useRef<Socket | null>(null);
  const questionStartTime = useRef(Date.now());
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerWarningSentRef = useRef(initialState.duration <= 60);

  // Animations
  const questionOpacity    = useRef(new Animated.Value(1)).current;
  const yourScoreScale     = useRef(new Animated.Value(1)).current;
  const opponentScoreScale = useRef(new Animated.Value(1)).current;

  function pulseScore(anim: Animated.Value) {
    if (reduceMotionEnabled) return;
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.15, duration: 90, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1,    duration: 90, useNativeDriver: true }),
    ]).start();
  }

  // ── Socket setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function connect() {
      const socket = await getGameSocket();
      if (!mounted) return;
      socketRef.current = socket;

      // Re-join on reconnect only — FoundScreen already joined for the initial connection
      socket.on('connect', () => socket.emit('game:join', { gameId }));

      // Start the timer — game has already started when DuelScreen mounts
      timerRef.current = setInterval(() => {
        setDs(prev => prev.timeRemaining <= 0 ? prev : { ...prev, timeRemaining: prev.timeRemaining - 1 });
      }, 1000);

      socket.on('game:question', ({
        question, questionNumber, totalQuestions,
      }: { question: ClientQuestion; questionNumber: number; totalQuestions: number }) => {
        if (!mounted) return;
        if (reduceMotionEnabled) {
          questionStartTime.current = Date.now();
          questionOpacity.setValue(1);
          setDs(prev => ({
            ...prev, currentQuestion: question, questionNumber, totalQuestions,
            selectedAnswer: null, showFeedback: false,
          }));
          return;
        }

        Animated.timing(questionOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          if (!mounted) return;
          questionStartTime.current = Date.now();
          setDs(prev => ({
            ...prev, currentQuestion: question, questionNumber, totalQuestions,
            selectedAnswer: null, showFeedback: false,
          }));
          Animated.timing(questionOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        });
      });

      socket.on('answer:result', ({
        isCorrect: _isCorrect, yourScore,
      }: { isCorrect: boolean; correctAnswer: number; yourScore: number }) => {
        if (!mounted) return;
        pulseScore(yourScoreScale);
        setDs(prev => ({ ...prev, yourScore, showFeedback: true }));
      });

      socket.on('opponent:scored', ({ opponentScore }: { opponentScore: number }) => {
        if (!mounted) return;
        setDs(prev => {
          if (prev.opponentScore !== opponentScore) pulseScore(opponentScoreScale);
          return { ...prev, opponentScore };
        });
      });

      socket.on('opponent:progress', ({
        currentQuestion, questionsAnswered,
      }: { currentQuestion: number; questionsAnswered: number }) => {
        if (!mounted) return;
        setDs(prev => ({ ...prev, opponentProgress: { currentQuestion, questionsAnswered } }));
      });

      socket.on('game:timer', ({ remaining }: { remaining: number }) => {
        if (!mounted) return;
        setDs(prev => ({ ...prev, timeRemaining: remaining }));
      });

      socket.on('opponent:disconnected', ({
        secondsUntilForfeit,
      }: { gameId: string; secondsUntilForfeit: number }) => {
        if (!mounted) return;
        setOpponentDisconnectNotice(`Opponent disconnected. Forfeit in ${secondsUntilForfeit}s.`);
      });

      socket.on('opponent:reconnected', () => {
        if (!mounted) return;
        setOpponentDisconnectNotice(null);
      });

      socket.on('game:sync', ({
        yourScore,
        opponentScore,
        timeRemaining,
        currentQuestion,
        questionNumber,
        totalQuestions,
        opponentProgress,
      }: {
        yourScore: number;
        opponentScore: number;
        timeRemaining: number;
        currentQuestion: ClientQuestion;
        questionNumber: number;
        totalQuestions: number;
        opponentProgress: OpponentProgress | null;
      }) => {
        if (!mounted) return;
        questionStartTime.current = Date.now();
        questionOpacity.setValue(1);
        setDs(prev => ({
          ...prev, yourScore, opponentScore, timeRemaining,
          currentQuestion,
          questionNumber,
          totalQuestions,
          opponentProgress,
          selectedAnswer: null,
          showFeedback: false,
        }));
      });

      socket.on('game:finished', (results: GameFinishedPayload) => {
        if (!mounted) return;
        setOpponentDisconnectNotice(null);
        if (!results.isDraw) {
          const didWin = results.winnerId === results.currentUserId;
          void playHaptic(didWin ? 'game_won' : 'game_lost');
        }
        socket.disconnect();
        navigation.replace('DuelResults', { results, userId: results.currentUserId, opponent });
      });

      socket.on('game:error', ({ message }: { message: string }) => {
        if (!mounted) return;
        Alert.alert('Game Error', message, [{ text: 'OK', onPress: () => navigation.navigate('MainTabs') }]);
      });
    }

    connect();
    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
      releaseGameSocket();
    };
  }, [gameId, navigation, opponent, playHaptic, questionOpacity, reduceMotionEnabled]);

  useEffect(() => {
    if (ds.timeRemaining > 60 || timerWarningSentRef.current) return;
    timerWarningSentRef.current = true;
    void playHaptic('timer_warning');
  }, [ds.timeRemaining, playHaptic]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { handleQuit(); return true; });
    return () => handler.remove();
  }, []);

  function submitAnswer() {
    if (ds.selectedAnswer === null || !ds.currentQuestion) return;
    void playHaptic('answer_submit');
    socketRef.current?.emit('answer:submit', {
      gameId,
      questionId: ds.currentQuestion.id,
      selectedAnswer: ds.selectedAnswer,
      timeTakenMs: Date.now() - questionStartTime.current,
    });
  }

  function handleQuit() {
    const doQuit = () => socketRef.current?.emit('game:forfeit', { gameId });
    if (Platform.OS === 'web') {
      if (window.confirm('Quit? You will forfeit and your opponent wins.')) doQuit();
    } else {
      Alert.alert('Quit Duel?', 'You will forfeit this match and your opponent will win.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Quit', style: 'destructive', onPress: doQuit },
      ]);
    }
  }

  const isTimerCritical = ds.timeRemaining <= 60;
  const progressPct     = ds.totalQuestions > 0 ? (ds.questionNumber - 1) / ds.totalQuestions : 0;
  const oppName         = opponent.displayName ?? 'Opp';
  const opponentDone    = ds.opponentProgress && ds.opponentProgress.questionsAnswered >= ds.totalQuestions;
  const category        = [ds.currentQuestion.category, ds.currentQuestion.subTopic].filter(Boolean).join(' · ');

  return (
    <ScreenTransitionView style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>


      {/* ── HUD ── */}
      <View style={[styles.hud, { borderBottomColor: theme.line }]}>

        {/* You */}
        <View style={styles.hudSide}>
          <Avatar name={user?.displayName ?? 'Y'} size="sm" variant="you" />
          <Animated.Text style={[styles.hudScore, { color: theme.ink, transform: [{ scale: yourScoreScale }] }]}>
            {ds.yourScore}
          </Animated.Text>
          <AppText.Sans preset="small" color={theme.ink3}>you</AppText.Sans>
        </View>

        {/* vs */}
        <AppText.Serif preset="italic" color={theme.ink3}>vs</AppText.Serif>

        {/* Opponent */}
        <View style={[styles.hudSide, { alignItems: 'center' }]}>
          <Avatar name={oppName} size="sm" variant="opponent" />
          <Animated.Text style={[styles.hudScore, { color: theme.ink, transform: [{ scale: opponentScoreScale }] }]}>
            {ds.opponentScore}
          </Animated.Text>
          {ds.opponentProgress ? (
            <View style={styles.progressPing}>
              {opponentDone
                ? <View style={[styles.pingDot, { backgroundColor: theme.accent }]} />
                : <BlinkingDot color={theme.accent} animate={!reduceMotionEnabled} />
              }
              <AppText.Sans preset="small" color={theme.ink3} numberOfLines={1} style={{ flexShrink: 1 }}>
                {opponentDone
                  ? `${oppName} · done`
                  : `${oppName} · on Q${ds.opponentProgress.currentQuestion}`}
              </AppText.Sans>
            </View>
          ) : (
            <AppText.Sans preset="small" color={theme.ink3} numberOfLines={1}>{oppName}</AppText.Sans>
          )}
        </View>
      </View>

      {opponentDisconnectNotice && (
        <View style={[styles.disconnectBanner, { backgroundColor: theme.amberSoft, borderColor: theme.amber }]}>
          <AppText.Sans preset="label" color={theme.amberDeep}>
            {opponentDisconnectNotice}
          </AppText.Sans>
        </View>
      )}

      {/* ── Progress bar + timer ── */}
      <View style={styles.progressRow}>
        <View style={[styles.progressTrack, { backgroundColor: theme.line2 }]}>
          <View style={[styles.progressFill, {
            backgroundColor: theme.accent,
            width: `${Math.min(progressPct * 100, 100)}%`,
          }]} />
        </View>
        <AppText.Mono
          preset="timer"
          color={isTimerCritical ? theme.coral : theme.ink3}
          style={isTimerCritical ? styles.timerCritical : undefined}
        >
          {formatTime(ds.timeRemaining)}
        </AppText.Mono>
      </View>

      {/* ── Question area (fades on transition) ── */}
      <Animated.View style={[styles.questionArea, { opacity: questionOpacity }]}>
        <ScrollView contentContainerStyle={styles.questionContent} showsVerticalScrollIndicator={false}>

          {/* Q-meta */}
          <View style={styles.qMetaRow}>
            <AppText.Mono
              preset="eyebrow"
              color={theme.ink3}
              style={[styles.qMetaLabel, { textTransform: 'uppercase' }]}
              numberOfLines={1}
            >
              {category}
            </AppText.Mono>
            <View style={[styles.qPill, { borderColor: theme.line }]}>
              <AppText.Mono preset="mono" color={theme.ink3}>
                Q {ds.questionNumber} of {ds.totalQuestions}
              </AppText.Mono>
            </View>
          </View>

          {/* Question */}
          <AppText.Serif preset="questionLg" color={theme.ink} style={styles.questionText}>
            {ds.currentQuestion.text}
          </AppText.Serif>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {(ds.currentQuestion.options as string[]).map((option, index) => {
              const isSelected = ds.selectedAnswer === index;
              return (
                <Pressable
                  key={index}
                  style={[
                    styles.option,
                    {
                      borderColor: isSelected ? theme.accent : theme.line,
                      backgroundColor: isSelected ? theme.accentSoft : theme.card,
                    },
                  ]}
                  onPress={() => !ds.showFeedback && setDs(prev => ({
                    ...prev,
                    selectedAnswer: prev.selectedAnswer === index ? null : index,
                  }))}
                  disabled={ds.showFeedback}
                >
                  <AppText.Serif
                    preset="scoreLg"
                    color={isSelected ? theme.accentDeep : theme.ink3}
                    style={styles.optionKey}
                  >
                    {String.fromCharCode(65 + index)}
                  </AppText.Serif>
                  <AppText.Sans preset="body" color={theme.ink} style={styles.optionText}>
                    {option}
                  </AppText.Sans>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>

      {/* ── Footer: quit + submit ── */}
      <View style={[styles.footer, { borderTopColor: theme.line }]}>
        <Pressable onPress={handleQuit} style={styles.quitBtn} hitSlop={12}>
          <AppText.Sans preset="label" color={theme.ink3}>Quit</AppText.Sans>
        </Pressable>
        {!ds.showFeedback && (
          <View style={styles.submitWrap}>
            <Button label="Submit" onPress={submitAnswer} disabled={ds.selectedAnswer === null} />
          </View>
        )}
      </View>

    </ScreenTransitionView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },


  // HUD
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  hudSide: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  hudScore: {
    fontFamily: 'SourceSerif-SemiBold',
    fontSize: 22,
    lineHeight: 26,
  },
  progressPing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  pingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  disconnectBanner: {
    marginHorizontal: 20,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  // Progress + timer
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  timerCritical: {
    fontFamily: 'JetBrainsMono-SemiBold',
  },

  // Question area
  questionArea:    { flex: 1 },
  questionContent: { padding: 20, paddingBottom: 16 },

  // Q-meta row
  qMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  qMetaLabel: { flex: 1 },
  qPill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },

  // Question + options
  questionText:     { marginBottom: 20 },
  optionsContainer: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: radii.md,
    padding: 14,
  },
  optionKey:  { width: 26, textAlign: 'center' },
  optionText: { flex: 1, paddingTop: 3 },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  quitBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  submitWrap: { flex: 1 },
});
