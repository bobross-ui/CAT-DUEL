import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import api from '../services/api';
import Button from '../components/Button';
import ShareLinkModal from '../components/ShareLinkModal';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import AppText from '../components/Text';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { matchUrl } from '../navigation/linking';
import { track } from '../services/analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'DuelResults'>;

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
    subTopic: string | null;
    text: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  };
}

interface GroupedQuestion {
  questionId: string;
  question: AnswerDetail['question'];
  yourAnswer: AnswerDetail | null;
  theirAnswer: AnswerDetail | null;
}

// ── Mark circle (✓ / ✗ / —) ──────────────────────────────────────────────────
function MarkCircle({ correct, dim = false }: { correct: boolean | null; dim?: boolean }) {
  const { theme } = useTheme();
  const bg     = correct === null ? theme.line2    : correct ? theme.accentSoft : theme.coralSoft;
  const color  = correct === null ? theme.ink3     : correct ? theme.accentDeep : theme.coral;
  const symbol = correct === null ? '—' : correct ? '✓' : '✗';
  return (
    <View style={[styles.markCircle, { backgroundColor: bg, opacity: dim ? 0.5 : 1 }]}>
      <AppText.Sans preset="label" color={color} style={styles.markSymbol}>
        {symbol}
      </AppText.Sans>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DuelResultsScreen({ route, navigation }: Props) {
  const { results, userId, opponent } = route.params;
  const { theme } = useTheme();
  const { reduceMotionEnabled } = useAppPreferences();
  const insets = useSafeAreaInsets();

  const isPlayer1 = results.player1.userId === userId;
  const yours  = isPlayer1 ? results.player1 : results.player2;
  const theirs = isPlayer1 ? results.player2 : results.player1;

  const youWon = results.winnerId === userId;
  const isDraw = results.isDraw;

  const verdictText  = isDraw ? 'Draw.' : youWon ? 'Victory.' : 'Defeat.';
  const verdictColor = isDraw ? theme.ink2 : youWon ? theme.accentDeep : theme.coral;
  const deltaColor   = isDraw ? theme.ink3 : youWon ? theme.accentDeep : theme.coral;
  const deltaText    = yours.eloDelta >= 0 ? `+${yours.eloDelta}` : `${yours.eloDelta}`;
  const eloSub       = `◆ ${yours.eloBefore} → ${yours.eloAfter} · ${yours.newTier}`;

  const tierChangeLabel = yours.tierChanged
    ? (yours.eloDelta > 0
        ? `promoted to ${yours.newTier.toLowerCase()}`
        : `dropped to ${yours.newTier.toLowerCase()}`)
    : null;

  const totalScore = yours.score + theirs.score;
  const yourFrac  = totalScore > 0 ? yours.score / totalScore : 0.5;
  const theirFrac = totalScore > 0 ? theirs.score / totalScore : 0.5;
  const gapWidth = yours.score > 0 && theirs.score > 0 ? 2 : 0;
  const [splitBarWidth, setSplitBarWidth] = useState(0);
  const yourBarWidth = useState(() => new Animated.Value(0))[0];
  const theirBarWidth = useState(() => new Animated.Value(0))[0];

  const [rawAnswers, setRawAnswers] = useState<AnswerDetail[]>([]);
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);
  const [breakdownError, setBreakdownError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shareVisible, setShareVisible] = useState(false);

  useEffect(() => {
    if (splitBarWidth <= 0) return;

    const availableWidth = Math.max(splitBarWidth - gapWidth, 0);
    const yourTarget = availableWidth * yourFrac;
    const theirTarget = availableWidth * theirFrac;

    if (reduceMotionEnabled) {
      yourBarWidth.setValue(yourTarget);
      theirBarWidth.setValue(theirTarget);
      return;
    }

    yourBarWidth.setValue(0);
    theirBarWidth.setValue(0);

    Animated.parallel([
      Animated.timing(yourBarWidth, {
        toValue: yourTarget,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(theirBarWidth, {
        toValue: theirTarget,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start();
  }, [gapWidth, reduceMotionEnabled, splitBarWidth, theirBarWidth, theirFrac, yourBarWidth, yourFrac]);

  function loadBreakdown() {
    setLoadingBreakdown(true);
    setBreakdownError('');
    api
      .get(`/games/${results.gameId}`)
      .then((res) => {
        setRawAnswers(res.data.data.answers ?? []);
      })
      .catch(() => setBreakdownError('Failed to load breakdown.'))
      .finally(() => setLoadingBreakdown(false));
  }

  function openShareMatch() {
    track('share_initiated', { surface: 'results' });
    setShareVisible(true);
  }

  useEffect(() => {
    loadBreakdown();
  }, [results.gameId]);

  // Group answers by questionId — one entry per unique question, preserving order
  const grouped = useMemo<GroupedQuestion[]>(() => {
    const map = new Map<string, GroupedQuestion>();
    for (const a of rawAnswers) {
      if (!map.has(a.questionId)) {
        map.set(a.questionId, {
          questionId: a.questionId,
          question: a.question,
          yourAnswer: null,
          theirAnswer: null,
        });
      }
      const entry = map.get(a.questionId)!;
      if (a.userId === userId) {
        entry.yourAnswer = a;
      } else {
        entry.theirAnswer = a;
      }
    }
    return Array.from(map.values());
  }, [rawAnswers, userId]);

  const oppName = opponent.displayName ?? 'Opponent';

  return (
    <ScreenTransitionView style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero block ── */}
        <View style={[styles.hero, { borderBottomColor: theme.line }]}>

          {/* Verdict row */}
          <View style={styles.verdictRow}>
            <View style={styles.verdictLeft}>
              <AppText.Serif
                preset="verdict"
                color={verdictColor}
                style={{ fontFamily: 'SourceSerif-MediumItalic', lineHeight: 40 }}
              >
                {verdictText}
              </AppText.Serif>
              <AppText.Mono preset="mono" color={theme.ink3} style={{ marginTop: 4 }}>
                {eloSub}
              </AppText.Mono>
              {tierChangeLabel && (
                <View style={[
                  styles.tierChip,
                  { backgroundColor: youWon ? theme.accentSoft : theme.coralSoft },
                ]}>
                  <AppText.Mono
                    preset="chipLabel"
                    color={youWon ? theme.accentDeep : theme.coral}
                    style={{ textTransform: 'uppercase' }}
                  >
                    {tierChangeLabel}
                  </AppText.Mono>
                </View>
              )}
            </View>
            <AppText.Mono preset="deltaLg" color={deltaColor} style={{ lineHeight: 36, marginTop: 5 }}>
              {deltaText}
            </AppText.Mono>
          </View>

          {/* Score split bar */}
          <View style={styles.scoreSection}>
            <View style={styles.scoreLabels}>
              <AppText.Sans preset="small" color={theme.ink3}>you</AppText.Sans>
              <AppText.Sans preset="small" color={theme.ink3}>{oppName}</AppText.Sans>
            </View>
            <View
              style={[styles.splitBar, { backgroundColor: theme.line2 }]}
              onLayout={(event) => setSplitBarWidth(event.nativeEvent.layout.width)}
            >
              <Animated.View
                style={[styles.barSegment, { width: yourBarWidth, backgroundColor: theme.accent }]}
              />
              {gapWidth > 0 ? <View style={styles.barGap} /> : null}
              <Animated.View
                style={[styles.barSegment, { width: theirBarWidth, backgroundColor: theme.ink3 }]}
              />
            </View>
            <View style={styles.scoreNumbers}>
              <AppText.Serif preset="statVal" color={theme.ink}>{yours.score}</AppText.Serif>
              <AppText.Serif preset="statVal" color={theme.ink3}>{theirs.score}</AppText.Serif>
            </View>
          </View>

          {/* Forfeit note */}
          {results.isForfeit && (
            <View style={[styles.forfeitPill, { backgroundColor: theme.amberSoft }]}>
              <AppText.Mono
                preset="chipLabel"
                color={theme.amber}
                style={{ textTransform: 'uppercase' }}
              >
                {youWon ? 'opponent forfeited' : 'you forfeited'}
              </AppText.Mono>
            </View>
          )}
        </View>

        {/* ── Question review ── */}
        <View style={styles.breakdown}>
          <View style={styles.sectionHeader}>
            <AppText.Mono
              preset="eyebrow"
              color={theme.ink3}
              style={{ textTransform: 'uppercase', letterSpacing: 1.4 }}
            >
              Question Review
            </AppText.Mono>
            <View style={styles.markLegend}>
              <AppText.Mono preset="eyebrow" color={theme.ink3}>you</AppText.Mono>
              <AppText.Mono preset="eyebrow" color={theme.ink4}>{oppName}</AppText.Mono>
            </View>
          </View>

          {loadingBreakdown ? (
            <View style={styles.skeletonList}>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonCard key={i} style={styles.loadingReviewCard}>
                  <SkeletonBlock height={16} width={30} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <SkeletonBlock height={16} width={i % 2 === 0 ? '62%' : '46%'} />
                    <SkeletonBlock height={12} width="28%" />
                  </View>
                  <SkeletonBlock height={22} width={22} radius={11} />
                  <SkeletonBlock height={22} width={22} radius={11} />
                </SkeletonCard>
              ))}
            </View>
          ) : breakdownError ? (
            <View style={[styles.breakdownError, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.breakdownErrorHeading}>Couldn't load.</AppText.Serif>
              <AppText.Sans preset="body" color={theme.ink3} style={styles.breakdownErrorBody}>Check your connection and try again.</AppText.Sans>
              <Button label="Retry" onPress={loadBreakdown} style={styles.breakdownRetryBtn} />
            </View>
          ) : (
            grouped.map((q, idx) => {
              const isExpanded = expandedId === q.questionId;
              return (
                <Pressable
                  key={q.questionId}
                  onPress={() => setExpandedId(isExpanded ? null : q.questionId)}
                  style={[styles.reviewCard, { backgroundColor: theme.card, borderColor: theme.line }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Question ${idx + 1} review, ${q.yourAnswer?.isCorrect ? 'you were correct' : 'you were incorrect'}`}
                  accessibilityHint={isExpanded ? 'Collapses the answer explanation' : 'Expands the answer explanation'}
                  accessibilityState={{ expanded: isExpanded }}
                >
                  {/* Compact header row */}
                  <View style={styles.reviewRow}>
                    <AppText.Mono preset="mono" color={theme.ink2} style={styles.qNum}>
                      Q{idx + 1}
                    </AppText.Mono>
                    <View style={styles.topicBlock}>
                      <AppText.Sans preset="bodyMed" color={theme.ink} numberOfLines={1}>
                        {q.question.subTopic?.toLowerCase() ?? q.question.category.toLowerCase()}
                      </AppText.Sans>
                      <AppText.Mono preset="eyebrow" color={theme.ink3}>
                        {q.question.category}
                      </AppText.Mono>
                    </View>
                    <View style={styles.marks}>
                      <MarkCircle correct={q.yourAnswer ? q.yourAnswer.isCorrect : null} />
                      <MarkCircle correct={q.theirAnswer ? q.theirAnswer.isCorrect : null} dim />
                    </View>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={theme.ink3}
                    />
                  </View>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <View style={[styles.expandedSection, { borderTopColor: theme.line }]}>
                      <AppText.Serif preset="questionLg" color={theme.ink} style={styles.questionText}>
                        {q.question.text}
                      </AppText.Serif>

                      <View style={styles.optionsList}>
                        {(q.question.options as string[]).map((opt, i) => {
                          const isCorrectOpt  = i === q.question.correctAnswer;
                          const isYourWrong   = q.yourAnswer != null
                            && i === q.yourAnswer.selectedAnswer
                            && !q.yourAnswer.isCorrect;

                          let bg    = theme.bg2;
                          let color = theme.ink2;
                          if (isCorrectOpt) { bg = theme.accentSoft; color = theme.accentDeep; }
                          if (isYourWrong)  { bg = theme.coralSoft;  color = theme.coral; }

                          return (
                            <View key={i} style={[styles.optionRow, { backgroundColor: bg }]}>
                              <AppText.Mono
                                preset="eyebrow"
                                color={color}
                                style={styles.optionLetter}
                              >
                                {String.fromCharCode(65 + i)}
                              </AppText.Mono>
                              <AppText.Sans preset="body" color={color} style={{ flex: 1 }}>
                                {opt}
                              </AppText.Sans>
                            </View>
                          );
                        })}
                      </View>

                      <AppText.Mono
                        preset="eyebrow"
                        color={theme.ink3}
                        style={{ textTransform: 'uppercase', marginTop: 12, marginBottom: 4 }}
                      >
                        Explanation
                      </AppText.Mono>
                      <AppText.Sans preset="body" color={theme.ink2}>
                        {q.question.explanation}
                      </AppText.Sans>
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
        </View>

        {/* ── Actions ── */}
        <View style={[styles.actions, { borderTopColor: theme.line }]}>
          <Pressable
            onPress={() => navigation.navigate('MainTabs')}
            style={[styles.homeBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
            accessibilityRole="button"
            accessibilityLabel="Back to home"
          >
            <Feather name="home" size={22} color={theme.ink2} />
          </Pressable>
          <Pressable
            onPress={openShareMatch}
            style={[styles.homeBtn, { backgroundColor: theme.card, borderColor: theme.line }]}
            accessibilityRole="button"
            accessibilityLabel="Share match"
          >
            <Feather name="share-2" size={20} color={theme.ink2} />
          </Pressable>
          <View style={styles.rematchWrap}>
            <Button label="Rematch →" onPress={() => navigation.replace('Matchmaking')} />
          </View>
        </View>

      </ScrollView>
      <ShareLinkModal
        visible={shareVisible}
        title="CAT Duel match"
        message="Review this CAT Duel match:"
        url={matchUrl(results.gameId)}
        onClose={() => setShareVisible(false)}
      />
    </ScreenTransitionView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: 40 },

  // Hero
  hero: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 20,
    borderBottomWidth: 1,
    gap: 16,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  verdictLeft: { flex: 1, gap: 4 },
  tierChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginTop: 6,
  },

  // Score bar
  scoreSection: { gap: 6 },
  scoreLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  splitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barSegment: { height: 8 },
  barGap:     { width: 2 },
  scoreNumbers: { flexDirection: 'row', justifyContent: 'space-between' },

  forfeitPill: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },

  // Breakdown
  breakdown: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  markLegend: {
    flexDirection: 'row',
    gap: 10,
  },
  skeletonList: {
    gap: 8,
  },
  loadingReviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  breakdownError: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 20,
  },
  breakdownErrorHeading: { marginBottom: 8 },
  breakdownErrorBody: { marginBottom: 16, textAlign: 'center' },
  breakdownRetryBtn: { width: 120 },

  // Review card (wraps header + optional expanded section)
  reviewCard: {
    borderWidth: 1,
    borderRadius: radii.md,
    marginBottom: 8,
    overflow: 'hidden',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  qNum:       { width: 30 },
  topicBlock: { flex: 1, gap: 2 },
  marks: {
    flexDirection: 'row',
    gap: 6,
  },

  markCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markSymbol: {
    lineHeight: 22,
    textAlign: 'center',
  },

  // Expanded section
  expandedSection: {
    borderTopWidth: 1,
    padding: 14,
  },
  questionText: { marginBottom: 14 },
  optionsList:  { gap: 6 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  optionLetter: { width: 16, textAlign: 'center', paddingTop: 1 },

  // Actions
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
  },
  homeBtn: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rematchWrap: { flex: 1 },
});
