import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Socket } from 'socket.io-client';
import { Feather } from '@expo/vector-icons';
import DesktopFrame from '../components/web/DesktopFrame';
import EyebrowLabel from '../components/web/EyebrowLabel';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import Text from '../components/Text';
import { useAuth } from '../context/AuthContext';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning';
import type { ClientQuestion, GameFinishedPayload } from '../navigation';
import { getTier } from '../constants';
import { getGameSocket, releaseGameSocket } from '../services/socket';
import { track } from '../services/analytics';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import MobileDuelScreen from './DuelScreen.mobile';

type Props = ComponentProps<typeof MobileDuelScreen>;

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
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
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

export default function DuelScreenDesktop({ route, navigation }: Props) {
  const { gameId, opponent, initialState } = route.params;
  const { user: authUser } = useAuth();
  const { user: profile } = useCurrentProfile();
  const { theme } = useTheme();
  const { playHaptic, reduceMotionEnabled } = useAppPreferences();

  const [ds, setDs] = useState<DuelState>({
    ...INITIAL,
    timeRemaining: initialState.duration,
    totalQuestions: initialState.totalQuestions,
    currentQuestion: initialState.firstQuestion,
    questionNumber: initialState.questionNumber,
  });
  const [opponentDisconnectNotice, setOpponentDisconnectNotice] = useState<string | null>(null);
  const [duelActive, setDuelActive] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const questionStartTime = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerWarningSentRef = useRef(initialState.duration <= 60);
  const matchStartedTrackedRef = useRef(false);

  const questionOpacity = useRef(new Animated.Value(1)).current;
  const yourScoreScale = useRef(new Animated.Value(1)).current;
  const opponentScoreScale = useRef(new Animated.Value(1)).current;

  const isTimerCritical = ds.timeRemaining <= 60;
  const yourName = profile?.displayName ?? authUser?.displayName ?? 'You';
  const yourRating = profile?.eloRating ?? 0;
  const yourTier = profile ? getTier(profile.eloRating).name : 'Ranked';
  const opponentName = opponent.displayName ?? 'Opponent';
  const opponentTier = getTier(opponent.eloRating).name;
  const opponentDone = ds.opponentProgress && ds.opponentProgress.questionsAnswered >= ds.totalQuestions;
  const category = [ds.currentQuestion.category, ds.currentQuestion.subTopic].filter(Boolean).join(' · ');
  const progressPct = ds.totalQuestions > 0 ? (ds.questionNumber - 1) / ds.totalQuestions : 0;
  const opponentProgressPct = ds.totalQuestions > 0
    ? ((ds.opponentProgress?.questionsAnswered ?? 0) / ds.totalQuestions)
    : 0;

  useDocumentTitle(`${isTimerCritical ? '(!) ' : ''}${formatTime(ds.timeRemaining)} Duel · CAT Duel`);
  useUnsavedChangesWarning(duelActive);

  const pulseScore = useCallback((anim: Animated.Value) => {
    if (reduceMotionEnabled) return;
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.15, duration: 90, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 90, useNativeDriver: true }),
    ]).start();
  }, [reduceMotionEnabled]);

  const handleQuit = useCallback(() => {
    const doQuit = () => socketRef.current?.emit('game:forfeit', { gameId });
    if (Platform.OS === 'web') {
      if (window.confirm('Quit? You will forfeit and your opponent wins.')) doQuit();
      return;
    }

    Alert.alert('Quit Duel?', 'You will forfeit this match and your opponent will win.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Quit', style: 'destructive', onPress: doQuit },
    ]);
  }, [gameId]);

  const selectAnswer = useCallback((index: number) => {
    setDs(prev => {
      if (prev.showFeedback) return prev;
      return { ...prev, selectedAnswer: prev.selectedAnswer === index ? null : index };
    });
  }, []);

  const submitAnswer = useCallback(() => {
    if (ds.selectedAnswer === null || !ds.currentQuestion) return;
    void playHaptic('answer_submit');
    socketRef.current?.emit('answer:submit', {
      gameId,
      questionId: ds.currentQuestion.id,
      selectedAnswer: ds.selectedAnswer,
      timeTakenMs: Date.now() - questionStartTime.current,
    });
  }, [ds.currentQuestion, ds.selectedAnswer, gameId, playHaptic]);

  const shortcuts = useMemo(() => [
    { key: '1', handler: () => selectAnswer(0) },
    { key: '2', handler: () => selectAnswer(1) },
    { key: '3', handler: () => selectAnswer(2) },
    { key: '4', handler: () => selectAnswer(3) },
    { key: 'Enter', handler: submitAnswer },
    { key: 'Escape', handler: handleQuit },
  ], [handleQuit, selectAnswer, submitAnswer]);
  useKeyboardShortcuts(shortcuts, duelActive);

  useEffect(() => {
    if (matchStartedTrackedRef.current) return;
    matchStartedTrackedRef.current = true;
    track('match_started', { matchId: gameId, mode: 'ranked_10_min' });
  }, [gameId]);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      const socket = await getGameSocket();
      if (!mounted) return;
      socketRef.current = socket;

      socket.on('connect', () => socket.emit('game:join', { gameId }));

      timerRef.current = setInterval(() => {
        setDs(prev => prev.timeRemaining <= 0 ? prev : { ...prev, timeRemaining: prev.timeRemaining - 1 });
      }, 1000);

      socket.on('game:question', ({
        question, questionNumber, totalQuestions,
      }: { question: ClientQuestion; questionNumber: number; totalQuestions: number }) => {
        if (!mounted) return;
        const applyQuestion = () => {
          questionStartTime.current = Date.now();
          setDs(prev => ({
            ...prev,
            currentQuestion: question,
            questionNumber,
            totalQuestions,
            selectedAnswer: null,
            showFeedback: false,
          }));
        };

        if (reduceMotionEnabled) {
          questionOpacity.setValue(1);
          applyQuestion();
          return;
        }

        Animated.timing(questionOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          if (!mounted) return;
          applyQuestion();
          Animated.timing(questionOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        });
      });

      socket.on('answer:result', ({ yourScore }: { isCorrect: boolean; correctAnswer: number; yourScore: number }) => {
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
          ...prev,
          yourScore,
          opponentScore,
          timeRemaining,
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
        setDuelActive(false);
        setOpponentDisconnectNotice(null);
        const isPlayer1 = results.player1.userId === results.currentUserId;
        const currentPlayer = isPlayer1 ? results.player1 : results.player2;
        const result = results.isDraw
          ? 'draw'
          : results.winnerId === results.currentUserId
            ? 'win'
            : 'loss';
        track('match_ended', {
          matchId: results.gameId,
          result,
          ratingDelta: currentPlayer.eloDelta,
        });
        if (!results.isDraw) {
          const didWin = results.winnerId === results.currentUserId;
          void playHaptic(didWin ? 'game_won' : 'game_lost');
        }
        socket.disconnect();
        navigation.replace('DuelResults', { results, userId: results.currentUserId, opponent });
      });

      socket.on('game:error', ({ message }: { message: string }) => {
        if (!mounted) return;
        setDuelActive(false);
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
  }, [
    gameId,
    navigation,
    opponent,
    playHaptic,
    pulseScore,
    questionOpacity,
    reduceMotionEnabled,
    opponentScoreScale,
    yourScoreScale,
  ]);

  useEffect(() => {
    if (ds.timeRemaining > 60 || timerWarningSentRef.current) return;
    timerWarningSentRef.current = true;
    void playHaptic('timer_warning');
  }, [ds.timeRemaining, playHaptic]);

  const preventContextMenu = Platform.OS === 'web'
    ? { onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault() }
    : {};

  const rightRail = (
    <View style={styles.rightRailStack}>
      <Card style={styles.sideCard}>
        <View style={styles.sideHeader}>
          <EyebrowLabel>Opponent live track</EyebrowLabel>
          <View style={styles.pingRow}>
            {opponentDone
              ? <View style={[styles.pingDot, { backgroundColor: theme.accent }]} />
              : <BlinkingDot color={theme.accent} animate={!reduceMotionEnabled} />
            }
            <Text.Mono preset="chipLabel" color={theme.ink3}>
              {opponentDone ? 'DONE' : `ON Q${ds.opponentProgress?.currentQuestion ?? 1}`}
            </Text.Mono>
          </View>
        </View>
        <View style={[styles.currentOpponentRow, { backgroundColor: theme.bg2 }]}>
          <Text.Mono preset="mono" color={theme.ink3}>
            {opponentDone ? 'DONE' : `Q${ds.opponentProgress?.currentQuestion ?? 1}`}
          </Text.Mono>
          <Text.Sans preset="label" color={theme.ink} numberOfLines={1} style={styles.currentOpponentName}>
            {opponentName}
          </Text.Sans>
        </View>
      </Card>

      <Card style={styles.sideCard}>
        <View style={styles.sideHeader}>
          <EyebrowLabel>Question navigator</EyebrowLabel>
          <Text.Mono preset="chipLabel" color={theme.ink3}>
            {ds.questionNumber}/{ds.totalQuestions}
          </Text.Mono>
        </View>
        <View style={styles.qGrid}>
          {Array.from({ length: ds.totalQuestions }, (_, index) => {
            const q = index + 1;
            const done = q < ds.questionNumber;
            const now = q === ds.questionNumber;
            return (
              <View
                key={q}
                style={[
                  styles.qCell,
                  {
                    borderColor: now ? theme.ink : theme.line,
                    backgroundColor: done ? theme.accentSoft : now ? theme.ink : theme.card,
                  },
                ]}
              >
                <Text.Mono preset="mono" color={now ? theme.bg : done ? theme.accentDeep : theme.ink3}>
                  {done ? '✓' : q}
                </Text.Mono>
              </View>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <LegendSwatch label="done" color={theme.accentSoft} border={theme.line} />
          <LegendSwatch label="now" color={theme.ink} border={theme.ink} />
          <LegendSwatch label="next" color={theme.card} border={theme.line} />
        </View>
      </Card>
    </View>
  );

  return (
    <DesktopFrame
      activeRoute="Duel"
      rightRail={rightRail}
      contentStyle={styles.frameContent}
      rightRailStyle={styles.duelRightRail}
      rightRailContentStyle={styles.duelRightRailContent}
      showLeftRail={false}
    >
      <View style={styles.page}>
        <View style={styles.hudRow}>
          <PlayerHud
            name={yourName}
            meta={`◆ ${yourRating || '—'} · ${yourTier}`}
            score={ds.yourScore}
            avatarVariant="you"
            scoreScale={yourScoreScale}
          />

          <View style={styles.timerBlock}>
            <Text.Mono preset="deltaLg" color={isTimerCritical ? theme.coral : theme.ink}>
              {formatTime(ds.timeRemaining)}
            </Text.Mono>
            <View style={[styles.duelProgressTrack, { backgroundColor: theme.line2 }]}>
              <View style={[
                styles.duelProgressFill,
                { backgroundColor: theme.accent, width: `${Math.min(progressPct * 100, 100)}%` },
              ]} />
              <View style={[
                styles.opponentProgressFill,
                { backgroundColor: theme.ink4, width: `${Math.min(opponentProgressPct * 100, 100)}%` },
              ]} />
            </View>
            <Text.Mono preset="mono" color={theme.ink3}>Q {ds.questionNumber} of {ds.totalQuestions}</Text.Mono>
          </View>

          <PlayerHud
            name={opponentName}
            meta={`◆ ${opponent.eloRating} · ${opponentTier}`}
            score={ds.opponentScore}
            avatarVariant="opponent"
            scoreScale={opponentScoreScale}
            alignRight
            status={opponentDone ? 'done' : `on Q${ds.opponentProgress?.currentQuestion ?? 1}`}
          />
        </View>

        {opponentDisconnectNotice && (
          <View style={[styles.disconnectBanner, { backgroundColor: theme.amberSoft, borderColor: theme.amber }]}>
            <Text.Sans preset="label" color={theme.amberDeep}>{opponentDisconnectNotice}</Text.Sans>
          </View>
        )}

        <Animated.View style={[styles.duelBody, { opacity: questionOpacity }]}>
          <View
            nativeID="duel-passage-panel"
            style={[styles.passagePanel, { borderRightColor: theme.line }]}
            {...preventContextMenu}
          >
            <View style={styles.panelHeader}>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
                {category || 'MIXED'}
              </Text.Mono>
              <Text.Mono preset="chipLabel" color={theme.ink3}>Q{ds.questionNumber}</Text.Mono>
            </View>
            <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.passageScroll}>
              <Text.Serif preset="questionLg" color={theme.ink2} style={styles.passageText} selectable={false}>
                {ds.currentQuestion.text}
              </Text.Serif>
            </ScrollView>
          </View>

          <View nativeID="duel-question-panel" style={styles.questionPanel} {...preventContextMenu}>
            <View style={styles.chipRow}>
              <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
                <Text.Mono preset="chipLabel" color={theme.ink3}>{ds.currentQuestion.category}</Text.Mono>
              </View>
              {ds.currentQuestion.subTopic ? (
                <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
                  <Text.Mono preset="chipLabel" color={theme.ink3}>{ds.currentQuestion.subTopic}</Text.Mono>
                </View>
              ) : null}
              <View style={[styles.metaChip, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
                <Text.Mono preset="chipLabel" color={theme.ink3}>Q{ds.questionNumber}</Text.Mono>
              </View>
            </View>

            <View style={styles.optionsContainer}>
              {(ds.currentQuestion.options as string[]).map((option, index) => {
                const isSelected = ds.selectedAnswer === index;
                return (
                  <Pressable
                    key={index}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        borderColor: isSelected ? theme.accent : theme.line,
                        backgroundColor: isSelected ? theme.accentSoft : theme.card,
                        opacity: pressed ? 0.86 : 1,
                      },
                    ]}
                    onPress={() => selectAnswer(index)}
                    disabled={ds.showFeedback}
                    accessibilityRole="button"
                    accessibilityLabel={`Answer ${String.fromCharCode(65 + index)}. ${option}`}
                    accessibilityState={{ selected: isSelected, disabled: ds.showFeedback }}
                  >
                    <View style={[
                      styles.optionKey,
                      {
                        backgroundColor: isSelected ? theme.accent : theme.bg2,
                        borderColor: isSelected ? theme.accent : theme.line,
                      },
                    ]}>
                      <Text.Mono preset="mono" color={isSelected ? '#FFFFFF' : theme.ink3}>
                        {String.fromCharCode(65 + index)}
                      </Text.Mono>
                    </View>
                    <Text.Sans preset="body" color={theme.ink} style={styles.optionText} selectable={false}>
                      {option}
                    </Text.Sans>
                    <View style={[styles.keyHint, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
                      <Text.Mono preset="chipLabel" color={theme.ink3}>{index + 1}</Text.Mono>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Animated.View>

        <View style={[styles.footerRow, { borderTopColor: theme.line }]}>
          <Pressable
            onPress={handleQuit}
            style={({ pressed }) => [styles.quitButton, pressed && { opacity: 0.72 }]}
            accessibilityRole="button"
            accessibilityLabel="Quit duel"
            accessibilityHint="Forfeits this match"
          >
            <Feather name="log-out" size={16} color={theme.ink3} />
            <Text.Sans preset="label" color={theme.ink3}>Quit</Text.Sans>
          </Pressable>
          <View style={styles.submitArea}>
            <Text.Mono preset="mono" color={theme.ink3}>Press Enter to submit</Text.Mono>
            <View style={styles.submitButton}>
              <Button label="Submit" onPress={submitAnswer} disabled={ds.selectedAnswer === null || ds.showFeedback} />
            </View>
          </View>
        </View>
      </View>
    </DesktopFrame>
  );
}

function PlayerHud({
  name,
  meta,
  score,
  avatarVariant,
  scoreScale,
  alignRight,
  status,
}: {
  name: string;
  meta: string;
  score: number;
  avatarVariant: 'you' | 'opponent';
  scoreScale: Animated.Value;
  alignRight?: boolean;
  status?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.playerHud, alignRight && styles.playerHudRight]}>
      {!alignRight && <Avatar name={name} size="md" variant={avatarVariant} />}
      <View style={[styles.playerCopy, alignRight && styles.playerCopyRight]}>
        <Text.Sans preset="label" color={theme.ink} numberOfLines={1}>{name}</Text.Sans>
        <Text.Mono preset="chipLabel" color={theme.ink3} numberOfLines={1}>{status ? `${meta} · ${status}` : meta}</Text.Mono>
      </View>
      <Animated.View style={[
        styles.scorePill,
        { backgroundColor: theme.bg2, borderColor: theme.line, transform: [{ scale: scoreScale }] },
      ]}>
        <Text.Serif preset="scoreLg" color={theme.ink}>{score}</Text.Serif>
      </Animated.View>
      {alignRight && <Avatar name={name} size="md" variant={avatarVariant} />}
    </View>
  );
}

function LegendSwatch({ label, color, border }: { label: string; color: string; border: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color, borderColor: border }]} />
      <Text.Mono preset="chipLabel" color={theme.ink3}>{label}</Text.Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  frameContent: {
    flexGrow: 1,
  },
  page: {
    flex: 1,
    minHeight: 760,
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    marginBottom: 18,
  },
  playerHud: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerHudRight: {
    justifyContent: 'flex-end',
  },
  playerCopy: {
    flex: 1,
    minWidth: 0,
  },
  playerCopyRight: {
    alignItems: 'flex-end',
  },
  scorePill: {
    minWidth: 54,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  timerBlock: {
    width: 320,
    alignItems: 'center',
    gap: 8,
  },
  duelProgressTrack: {
    width: 280,
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  duelProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radii.pill,
  },
  opponentProgressFill: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.5,
    borderRadius: radii.pill,
  },
  disconnectBanner: {
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  duelBody: {
    flex: 1,
    minHeight: 520,
    flexDirection: 'row',
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  passagePanel: {
    flex: 1.05,
    borderRightWidth: 1,
    paddingRight: 24,
  },
  questionPanel: {
    flex: 1,
    paddingLeft: 24,
    paddingBottom: 18,
  },
  panelHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  uppercase: {
    textTransform: 'uppercase',
  },
  passageScroll: {
    paddingBottom: 24,
  },
  passageText: {
    lineHeight: 32,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  metaChip: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  optionsContainer: {
    gap: 10,
  },
  option: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionKey: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  keyHint: {
    minWidth: 24,
    height: 24,
    borderWidth: 1,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: {
    minHeight: 78,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 18,
  },
  quitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  submitArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  submitButton: {
    width: 160,
  },
  duelRightRail: {
    flexGrow: 0,
    flexShrink: 1,
    width: '18%',
    minWidth: 220,
    maxWidth: 292,
  },
  duelRightRailContent: {
    padding: 18,
  },
  rightRailStack: {
    gap: 16,
  },
  sideCard: {
    gap: 14,
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  currentOpponentRow: {
    minHeight: 48,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  currentOpponentName: {
    flex: 1,
  },
  qGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  qCell: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderRadius: 3,
  },
});
