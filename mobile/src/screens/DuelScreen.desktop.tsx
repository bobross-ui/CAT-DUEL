import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Alert,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { imageUri } from '../services/imageUri';
import { useQueryClient } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { Feather } from '@expo/vector-icons';
import DesktopFrame from '../components/web/DesktopFrame';
import EyebrowLabel from '../components/web/EyebrowLabel';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import MathText from '../components/MathText';
import Text from '../components/Text';
import TitaAnswerPad from '../components/TitaAnswerPad';
import { useAuth } from '../context/AuthContext';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning';
import type { ClientQuestion, GameFinishedPayload, OpponentInfo, OpponentProgress } from '../navigation';
import { getTier } from '../constants';
import { getGameSocket, releaseGameSocket } from '../services/socket';
import { track } from '../services/analytics';
import { queryKeys } from '../queries/keys';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/themes';
import { radii } from '../theme/tokens';
import DinoGame from '../components/DinoGame';
import MobileDuelScreen from './DuelScreen.mobile';

type Props = ComponentProps<typeof MobileDuelScreen>;

type QuestionCellStatus = 'answered' | 'current' | 'skipped' | 'unseen';

interface DuelState {
  currentQuestion: ClientQuestion;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: number | null;
  typedAnswer: string;
  showFeedback: boolean;
  yourScore: number;
  opponentScore: number;
  timeRemaining: number;
  yourSeenIds: string[];
  yourSkippedIds: string[];
  answeredQuestionIds: Set<string>;
  questionIds: string[];
  playerFinished: boolean;
  opponentProgress: OpponentProgress | null;
}

const INITIAL: DuelState = {
  currentQuestion: null as unknown as ClientQuestion,
  questionNumber: 0,
  totalQuestions: 0,
  selectedAnswer: null,
  typedAnswer: '',
  showFeedback: false,
  yourScore: 0,
  opponentScore: 0,
  timeRemaining: 600,
  yourSeenIds: [],
  yourSkippedIds: [],
  answeredQuestionIds: new Set<string>(),
  questionIds: [],
  playerFinished: false,
  opponentProgress: null,
};

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function splitDisplayCode(displayName: string) {
  const match = displayName.match(/^(.*)(#[0-9]{6})$/);
  return match ? { name: match[1], code: match[2] } : { name: displayName, code: null };
}

export default function DuelScreenDesktop({ route, navigation }: Props) {
  const { gameId } = route.params;
  const initialOpponent = route.params.opponent!;
  const initialState = route.params.initialState!;
  const { user: authUser } = useAuth();
  const { user: profile } = useCurrentProfile();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const { playHaptic, reduceMotionEnabled } = useAppPreferences();
  const initialQuestion = initialState.firstQuestion;

  const [ds, setDs] = useState<DuelState>({
    ...INITIAL,
    timeRemaining: initialState.duration,
    totalQuestions: initialState.totalQuestions,
    ...(initialQuestion ? { currentQuestion: initialQuestion } : {}),
    questionNumber: initialState.questionNumber,
    yourSeenIds: initialQuestion ? [initialQuestion.id] : [],
  });
  const [opponentDisconnectNotice, setOpponentDisconnectNotice] = useState<string | null>(null);
  const [duelActive, setDuelActive] = useState(true);
  const [opponent, setOpponent] = useState<OpponentInfo>(initialOpponent);
  const opponentRef = useRef(initialOpponent);
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
  const opponentDisplayName = splitDisplayCode(opponentName);
  const opponentTier = getTier(opponent.eloRating).name;
  const opponentAnswered = ds.opponentProgress?.questionsAnswered ?? 0;
  const opponentSkipped = ds.opponentProgress?.questionsSkipped ?? 0;
  const opponentDone = ds.opponentProgress
    ? opponentAnswered + opponentSkipped >= ds.totalQuestions
    : false;
  const category = ds.currentQuestion ? [ds.currentQuestion.category, ds.currentQuestion.subTopic].filter(Boolean).join(' · ') : '';
  const progressPct = ds.totalQuestions > 0 ? ds.answeredQuestionIds.size / ds.totalQuestions : 0;
  const isTita = ds.currentQuestion?.questionType === 'TITA';
  const allDone = ds.playerFinished || ds.answeredQuestionIds.size >= ds.totalQuestions;
  const opponentHudStatus = opponentDone
    ? 'done'
    : opponentSkipped > 0
      ? `${opponentAnswered} ans · ${opponentSkipped} skipped`
      : `${opponentAnswered} answered`;

  useDocumentTitle(`${isTimerCritical ? '(!) ' : ''}${formatTime(ds.timeRemaining)} Duel · CAT Duel`);
  useUnsavedChangesWarning(duelActive);

  const pulseScore = useCallback((anim: Animated.Value) => {
    if (reduceMotionEnabled) return;
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.15, duration: 90, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 90, useNativeDriver: true }),
    ]).start();
  }, [reduceMotionEnabled]);

  const applyOpponent = useCallback((nextOpponent: OpponentInfo) => {
    opponentRef.current = nextOpponent;
    setOpponent(nextOpponent);
  }, []);

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
      return { ...prev, selectedAnswer: index, typedAnswer: '' };
    });
  }, []);

  const submitAnswer = useCallback(() => {
    if (!ds.currentQuestion) return;
    if (ds.showFeedback) return;
    if (ds.currentQuestion.questionType === 'TITA' && ds.typedAnswer.trim().length === 0) return;
    if (ds.currentQuestion.questionType === 'MCQ' && ds.selectedAnswer === null) return;
    void playHaptic('answer_submit');
    socketRef.current?.emit('answer:submit', {
      gameId,
      questionId: ds.currentQuestion.id,
      ...(ds.currentQuestion.questionType === 'TITA'
        ? { typedAnswer: ds.typedAnswer }
        : { selectedAnswer: ds.selectedAnswer }),
      timeTakenMs: Date.now() - questionStartTime.current,
    });
  }, [ds.currentQuestion, ds.selectedAnswer, ds.showFeedback, ds.typedAnswer, gameId, playHaptic]);

  const handleSkip = useCallback(() => {
    if (!ds.currentQuestion || ds.showFeedback || allDone) return;
    void playHaptic('answer_submit');
    socketRef.current?.emit('question:skip', {
      gameId,
      questionId: ds.currentQuestion.id,
    });
  }, [allDone, ds.currentQuestion, ds.showFeedback, gameId, playHaptic]);

  const handleJump = useCallback((targetQuestionId: string) => {
    if (!ds.currentQuestion || ds.showFeedback || allDone) return;
    if (targetQuestionId === ds.currentQuestion.id) return;
    socketRef.current?.emit('question:jump', { gameId, questionId: targetQuestionId });
  }, [allDone, ds.currentQuestion, ds.showFeedback, gameId]);

  const shortcuts = useMemo(() => {
    if (isTita) {
      return [
        ...['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => ({
          key,
          handler: () => setDs(prev => {
            if (prev.showFeedback) return prev;
            return { ...prev, typedAnswer: `${prev.typedAnswer}${key}` };
          }),
        })),
        {
          key: '.',
          handler: () => setDs(prev => {
            if (prev.showFeedback || prev.typedAnswer.includes('.')) return prev;
            return { ...prev, typedAnswer: `${prev.typedAnswer}.` };
          }),
        },
        {
          key: '-',
          handler: () => setDs(prev => {
            if (prev.showFeedback || prev.typedAnswer.length > 0) return prev;
            return { ...prev, typedAnswer: '-' };
          }),
        },
        {
          key: 'Backspace',
          handler: () => setDs(prev => {
            if (prev.showFeedback) return prev;
            return { ...prev, typedAnswer: prev.typedAnswer.slice(0, -1) };
          }),
        },
        { key: 's', handler: handleSkip },
        { key: 'Enter', handler: submitAnswer },
        { key: 'Escape', handler: handleQuit },
      ];
    }

    return [
      { key: '1', handler: () => selectAnswer(0) },
      { key: '2', handler: () => selectAnswer(1) },
      { key: '3', handler: () => selectAnswer(2) },
      { key: '4', handler: () => selectAnswer(3) },
      { key: 's', handler: handleSkip },
      { key: 'Enter', handler: submitAnswer },
      { key: 'Escape', handler: handleQuit },
    ];
  }, [handleQuit, handleSkip, isTita, selectAnswer, submitAnswer]);
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

      const join = () => socket.emit('game:join', { gameId });
      socket.on('connect', join);
      if (socket.connected) join();

      timerRef.current = setInterval(() => {
        setDs(prev => prev.timeRemaining <= 0 ? prev : { ...prev, timeRemaining: prev.timeRemaining - 1 });
      }, 1000);

      socket.on('game:question', ({
        question, questionNumber, totalQuestions, yourSkippedIds,
      }: { question: ClientQuestion; questionNumber: number; totalQuestions: number; yourSkippedIds: string[] }) => {
        if (!mounted) return;
        const applyQuestion = () => {
          questionStartTime.current = Date.now();
          setDs(prev => ({
            ...prev,
            currentQuestion: question,
            questionNumber,
            totalQuestions,
            selectedAnswer: null,
            typedAnswer: '',
            showFeedback: false,
            playerFinished: false,
            yourSeenIds: prev.yourSeenIds.includes(question.id)
              ? prev.yourSeenIds
              : [...prev.yourSeenIds, question.id],
            yourSkippedIds,
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

      socket.on('answer:result', ({ questionId, yourScore }: { questionId: string; isCorrect: boolean; correctAnswer: number | null; correctAnswerText?: string | null; yourScore: number }) => {
        if (!mounted) return;
        pulseScore(yourScoreScale);
        setDs(prev => {
          const answeredQuestionIds = new Set(prev.answeredQuestionIds);
          answeredQuestionIds.add(questionId);
          const yourSkippedIds = prev.yourSkippedIds.filter(id => id !== questionId);
          return {
            ...prev,
            yourScore,
            showFeedback: true,
            answeredQuestionIds,
            yourSkippedIds,
            playerFinished: answeredQuestionIds.size >= prev.totalQuestions,
          };
        });
      });

      socket.on('opponent:scored', ({ opponentScore }: { opponentScore: number }) => {
        if (!mounted) return;
        setDs(prev => {
          if (prev.opponentScore !== opponentScore) pulseScore(opponentScoreScale);
          return { ...prev, opponentScore };
        });
      });

      socket.on('opponent:progress', ({
        questionsAnswered, questionsSkipped,
      }: OpponentProgress) => {
        if (!mounted) return;
        setDs(prev => ({ ...prev, opponentProgress: { questionsAnswered, questionsSkipped } }));
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
        opponent: syncedOpponent,
        timeRemaining,
        currentQuestion,
        currentQuestionId,
        questionNumber,
        questionIds,
        totalQuestions,
        yourSeenIds,
        yourSkippedIds,
        opponentProgress,
        playerFinished,
      }: {
        yourScore: number;
        opponentScore: number;
        opponent?: OpponentInfo;
        timeRemaining: number;
        currentQuestion: ClientQuestion | null | undefined;
        currentQuestionId?: string;
        questionNumber: number;
        questionIds?: string[];
        totalQuestions: number;
        yourSeenIds?: string[];
        yourSkippedIds?: string[];
        opponentProgress: OpponentProgress | null;
        playerFinished?: boolean;
      }) => {
        if (!mounted) return;
        if (syncedOpponent) applyOpponent(syncedOpponent);
        const syncedSkippedIds = yourSkippedIds ?? [];
        const syncedSeenIds = yourSeenIds ?? (currentQuestionId ? [currentQuestionId] : []);
        const answeredQuestionIds = new Set(syncedSeenIds.filter(
          id => id !== currentQuestionId && !syncedSkippedIds.includes(id),
        ));
        if (playerFinished) {
          setDs(prev => ({
            ...prev,
            yourScore,
            opponentScore,
            timeRemaining,
            totalQuestions,
            opponentProgress,
            showFeedback: true,
            questionNumber: totalQuestions,
            questionIds: questionIds ?? prev.questionIds,
            yourSeenIds: syncedSeenIds,
            yourSkippedIds: syncedSkippedIds,
            answeredQuestionIds,
            playerFinished: true,
            ...(currentQuestion ? { currentQuestion } : {}),
          }));
          return;
        }
        if (!currentQuestion) return;
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
          questionIds: questionIds ?? prev.questionIds,
          yourSeenIds: syncedSeenIds,
          yourSkippedIds: syncedSkippedIds,
          answeredQuestionIds,
          playerFinished: false,
          selectedAnswer: null,
          typedAnswer: '',
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
        void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.games.all() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard.all() });
        socket.disconnect();
        navigation.replace('DuelResults', {
          gameId,
          results,
          userId: results.currentUserId,
          opponent: opponentRef.current,
        });
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
    applyOpponent,
    navigation,
    playHaptic,
    pulseScore,
    queryClient,
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

  if (!ds.currentQuestion && !allDone) return null;

  const preventContextMenu = Platform.OS === 'web'
    ? { onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault() }
    : {};
  const submitOnEnter = Platform.OS === 'web'
    ? {
      onKeyDown: (event: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        submitAnswer();
      },
    }
    : {};

  const renderQuestionCell = (qId: string | null, qNumber: number) => {
    const status: QuestionCellStatus = qId
      ? getQuestionCellStatus(qId, ds)
      : qNumber === ds.questionNumber ? 'current' : 'unseen';
    const colors = questionCellColors(status, theme);
    const isInteractive = qId !== null && (status === 'skipped' || status === 'current');

    return (
      <Pressable
        key={qId ?? qNumber}
        onPress={qId ? () => handleJump(qId) : undefined}
        disabled={!isInteractive}
        style={({ pressed }) => [
          styles.qCell,
          {
            borderColor: colors.border,
            backgroundColor: colors.background,
            borderStyle: status === 'skipped' ? 'dashed' : 'solid',
            opacity: pressed ? 0.78 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Question ${qNumber}`}
        accessibilityState={{ disabled: !isInteractive, selected: status === 'current' }}
      >
        <Text.Mono preset="mono" color={colors.text}>
          {status === 'answered' ? '✓' : qNumber}
        </Text.Mono>
      </Pressable>
    );
  };

  const rightRail = (
    <View style={styles.rightRailStack}>
      <Card style={styles.sideCard}>
        <View style={styles.sideHeader}>
          <EyebrowLabel>Question navigator</EyebrowLabel>
          <Text.Mono preset="chipLabel" color={theme.ink3}>
            {ds.answeredQuestionIds.size}/{ds.totalQuestions}
          </Text.Mono>
        </View>
        <View style={styles.qGrid}>
          {ds.questionIds.length > 0
            ? ds.questionIds.map((qId, index) => renderQuestionCell(qId, index + 1))
            : Array.from({ length: ds.totalQuestions }, (_, index) => renderQuestionCell(null, index + 1))}
        </View>
        <View style={styles.legendRow}>
          <LegendSwatch label="answered" color={theme.accentSoft} border={theme.line} />
          <LegendSwatch label="now" color={theme.ink} border={theme.ink} />
          <LegendSwatch label="skipped" color={theme.amberSoft} border={theme.amber} />
          <LegendSwatch label="unseen" color={theme.card} border={theme.line} />
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
      fillHeight
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
            </View>
            <Text.Mono preset="mono" color={theme.ink3}>
              {ds.answeredQuestionIds.size} / {ds.totalQuestions} submitted
            </Text.Mono>
          </View>

          <PlayerHud
            name={opponentName}
            meta={`◆ ${opponent.eloRating} · ${opponentTier}`}
            score={ds.opponentScore}
            avatarVariant="opponent"
            scoreScale={opponentScoreScale}
            alignRight
            status={opponentHudStatus}
          />
        </View>

        {opponentDisconnectNotice && (
          <View style={[styles.disconnectBanner, { backgroundColor: theme.amberSoft, borderColor: theme.amber }]}>
            <Text.Sans preset="label" color={theme.amberDeep}>{opponentDisconnectNotice}</Text.Sans>
          </View>
        )}

        {allDone ? (
          <DinoGame />
        ) : (
        <Animated.View style={[styles.duelBody, { opacity: questionOpacity }]}>
          <View
            nativeID="duel-passage-panel"
            style={[styles.passagePanel, { borderRightColor: theme.line }]}
            {...preventContextMenu}
          >
            <View style={styles.panelHeader}>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
                {ds.currentQuestion.passage ? 'PASSAGE' : (category || 'MIXED')}
              </Text.Mono>
              <Text.Mono preset="chipLabel" color={theme.ink3}>Q{ds.questionNumber}</Text.Mono>
            </View>
            <ScrollView
              style={styles.passageScrollView}
              showsVerticalScrollIndicator
              contentContainerStyle={styles.passageScroll}
            >
              <MathText preset="question" color={theme.ink2} style={styles.passageText} selectable={false}>
                {ds.currentQuestion.passage ? ds.currentQuestion.passage.text : ds.currentQuestion.text}
              </MathText>
              {ds.currentQuestion.passage?.images.map((path) => (
                <Image
                  key={path}
                  source={{ uri: imageUri(path) }}
                  resizeMode="contain"
                  style={{ width: '100%', height: 220, marginTop: 12, borderRadius: 8 }}
                />
              ))}
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

            <ScrollView
              style={styles.optionsScroll}
              contentContainerStyle={styles.optionsContainer}
              showsVerticalScrollIndicator
            >
              {ds.currentQuestion.passage && (
                <MathText preset="body" color={theme.ink2} style={styles.questionStem} selectable={false}>
                  {ds.currentQuestion.text}
                </MathText>
              )}
              {isTita ? (
                <TitaAnswerPad
                  value={ds.typedAnswer}
                  onChange={(value) => setDs(prev => ({ ...prev, typedAnswer: value }))}
                  disabled={ds.showFeedback}
                />
              ) : (ds.currentQuestion.options ?? []).map((option, index) => {
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
                    {...submitOnEnter}
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
                    <MathText preset="body" color={theme.ink} style={styles.optionText} selectable={false}>
                      {option}
                    </MathText>
                    <View style={[styles.keyHint, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
                      <Text.Mono preset="chipLabel" color={theme.ink3}>{index + 1}</Text.Mono>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Animated.View>
        )}

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
          {allDone ? (
            <Text.Mono preset="mono" color={theme.ink3}>
              {opponentDone ? 'Results loading…' : `Waiting for ${opponentDisplayName.name}…`}
            </Text.Mono>
          ) : (
            <View style={styles.submitArea}>
              <Text.Mono preset="mono" color={theme.ink3}>{isTita ? 'Use the keypad, then submit' : 'Press Enter to submit'}</Text.Mono>
              <View style={styles.skipButton}>
                <Button
                  label="Skip"
                  variant="ghost"
                  onPress={handleSkip}
                  disabled={ds.showFeedback || allDone}
                  accessibilityLabel="Skip question"
                />
              </View>
              <View style={styles.submitButton}>
                <Button label="Submit" onPress={submitAnswer} disabled={ds.showFeedback || (isTita ? ds.typedAnswer.trim().length === 0 : ds.selectedAnswer === null)} />
              </View>
            </View>
          )}
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
  const displayName = splitDisplayCode(name);
  return (
    <View style={[styles.playerHud, alignRight && styles.playerHudRight]}>
      {!alignRight && <Avatar name={name} size="md" variant={avatarVariant} />}
      <View style={[styles.playerCopy, alignRight && styles.playerCopyRight]}>
        <Text.Sans preset="label" color={theme.ink} numberOfLines={1}>
          {displayName.name}
          {displayName.code ? <Text.Mono preset="chipLabel" color={theme.ink3}>{`  ${displayName.code}`}</Text.Mono> : null}
        </Text.Sans>
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

function getQuestionCellStatus(questionId: string, ds: DuelState): QuestionCellStatus {
  if (ds.answeredQuestionIds.has(questionId)) return 'answered';
  if (questionId === ds.currentQuestion.id) return 'current';
  if (ds.yourSkippedIds.includes(questionId)) return 'skipped';
  return 'unseen';
}

function questionCellColors(status: QuestionCellStatus, theme: Theme) {
  switch (status) {
    case 'answered':
      return { background: theme.accentSoft, border: theme.line, text: theme.accentDeep };
    case 'current':
      return { background: theme.ink, border: theme.ink, text: theme.bg };
    case 'skipped':
      return { background: theme.amberSoft, border: theme.amber, text: theme.amberDeep };
    case 'unseen':
      return { background: theme.card, border: theme.line, text: theme.ink3 };
  }
}

const styles = StyleSheet.create({
  frameContent: {
    flexGrow: 1,
  },
  page: {
    flex: 1,
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
  disconnectBanner: {
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  duelBody: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  passagePanel: {
    flex: 1.05,
    minHeight: 0,
    borderRightWidth: 1,
    paddingRight: 24,
  },
  questionPanel: {
    flex: 1,
    minHeight: 0,
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
  passageScrollView: {
    flex: 1,
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
  questionStem: {
    marginBottom: 14,
    lineHeight: 28,
  },
  optionsContainer: {
    gap: 10,
  },
  optionsScroll: {
    flex: 1,
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
  skipButton: {
    width: 128,
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
