import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import MathText from '../components/MathText';
import ShareLinkModal from '../components/ShareLinkModal';
import Text from '../components/Text';
import DesktopFrame from '../components/web/DesktopFrame';
import DesktopHero from '../components/web/DesktopHero';
import EyebrowLabel from '../components/web/EyebrowLabel';
import PageContainer from '../components/web/PageContainer';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { track } from '../services/analytics';
import { matchUrl } from '../navigation/linking';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import MobileDuelResultsScreen from './DuelResultsScreen.mobile';

type Props = ComponentProps<typeof MobileDuelResultsScreen>;

interface AnswerDetail {
  id: string;
  userId: string;
  questionId: string;
  selectedAnswer: number | null;
  typedAnswer: string | null;
  isCorrect: boolean;
  timeTakenMs: number;
  question: {
    id: string;
    category: string;
    questionType: 'MCQ' | 'TITA';
    subTopic: string | null;
    subType: string | null;
    text: string;
    options: string[] | null;
    correctAnswer: number | null;
    correctAnswerText: string | null;
    explanation: string;
  };
}

interface GroupedQuestion {
  questionId: string;
  question: AnswerDetail['question'];
  yourAnswer: AnswerDetail | null;
  theirAnswer: AnswerDetail | null;
}

const SECTIONS = ['QUANT', 'DILR', 'VARC'];

function formatTime(ms?: number) {
  if (ms == null) return '--';
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}:${rest.toString().padStart(2, '0')}` : `${seconds}s`;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function MarkCircle({ correct, dim = false }: { correct: boolean | null; dim?: boolean }) {
  const { theme } = useTheme();
  const bg = correct === null ? theme.line2 : correct ? theme.accentSoft : theme.coralSoft;
  const color = correct === null ? theme.ink3 : correct ? theme.accentDeep : theme.coral;
  const symbol = correct === null ? '-' : correct ? '✓' : '✗';

  return (
    <View style={[styles.markCircle, { backgroundColor: bg, opacity: dim ? 0.48 : 1 }]}>
      <Text.Sans preset="label" color={color} style={styles.markSymbol}>
        {symbol}
      </Text.Sans>
    </View>
  );
}

function AnswerValue({ label, value, correct }: { label: string; value: string; correct: boolean | null }) {
  const { theme } = useTheme();
  const color = correct === null ? theme.ink2 : correct ? theme.accentDeep : theme.coral;

  return (
    <View style={[styles.answerValue, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text.Mono preset="chipLabel" color={theme.ink3} style={styles.uppercase}>
        {label}
      </Text.Mono>
      <Text.Sans preset="bodyMed" color={color}>
        {value}
      </Text.Sans>
    </View>
  );
}

export default function DuelResultsScreenDesktop({ route, navigation }: Props) {
  const { results, userId, opponent } = route.params;
  const { theme } = useTheme();
  const { user } = useCurrentProfile();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shareVisible, setShareVisible] = useState(false);

  const isPlayer1 = results.player1.userId === userId;
  const yours = isPlayer1 ? results.player1 : results.player2;
  const theirs = isPlayer1 ? results.player2 : results.player1;
  const youWon = results.winnerId === userId;
  const isDraw = results.isDraw;
  const oppName = opponent.displayName ?? 'Opponent';
  const yourName = user?.displayName ?? 'You';
  const verdictText = isDraw ? 'Draw.' : youWon ? 'Victory.' : 'Defeat.';
  const verdictColor = isDraw ? theme.ink2 : youWon ? theme.accentDeep : theme.coral;
  const deltaText = yours.eloDelta >= 0 ? `+${yours.eloDelta}` : `${yours.eloDelta}`;
  const titleOutcome = isDraw ? 'Draw' : youWon ? 'Won' : 'Lost';

  const grouped = useMemo<GroupedQuestion[]>(() => {
    const map = new Map<string, GroupedQuestion>();
    for (const answer of results.answers ?? []) {
      if (!map.has(answer.questionId)) {
        map.set(answer.questionId, {
          questionId: answer.questionId,
          question: answer.question,
          yourAnswer: null,
          theirAnswer: null,
        });
      }

      const entry = map.get(answer.questionId)!;
      if (answer.userId === userId) entry.yourAnswer = answer;
      else entry.theirAnswer = answer;
    }

    return Array.from(map.values());
  }, [results.answers, userId]);

  const sectionStats = useMemo(() => SECTIONS.map((section) => {
    const rows = grouped.filter((row) => row.question.category === section);
    return {
      section,
      total: rows.length,
      yourCorrect: rows.filter((row) => row.yourAnswer?.isCorrect).length,
      theirCorrect: rows.filter((row) => row.theirAnswer?.isCorrect).length,
    };
  }), [grouped]);

  const yourTimes = useMemo(
    () => grouped.flatMap((row) => row.yourAnswer ? [row.yourAnswer.timeTakenMs] : []),
    [grouped],
  );
  const theirTimes = useMemo(
    () => grouped.flatMap((row) => row.theirAnswer ? [row.theirAnswer.timeTakenMs] : []),
    [grouped],
  );
  const yourAverageTimeMs = average(yourTimes);
  const opponentAverageTimeMs = average(theirTimes);
  const totalQuestions = results.totalQuestions || grouped.length;
  const accuracy = totalQuestions > 0 ? Math.round((yours.score / yours.questionsAnswered) * 100) : 0;
  const unanswered = Math.max(totalQuestions - yours.questionsAnswered, 0);
  const scoreGap = yours.score - theirs.score;

  useDocumentTitle(`Result: ${titleOutcome} ${yours.score}-${theirs.score} · CAT Duel`);

  const openShareMatch = useCallback(() => {
    track('share_initiated', { surface: 'results_desktop' });
    setShareVisible(true);
  }, []);

  return (
    <DesktopFrame activeRoute="DuelResults">
      <PageContainer maxWidth={1180} style={styles.page}>
        <DesktopHero variant="accent" style={styles.hero}>
          <View style={styles.heroContent}>
            <View style={styles.heroMain}>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
                MATCH #{results.gameId.slice(0, 8)} · JUST NOW · RANKED
              </Text.Mono>
              <Text.Serif preset="display" color={verdictColor} style={styles.verdict}>
                {verdictText}
              </Text.Serif>
              <View style={styles.ratingTrail}>
                <Text.Mono preset="mono" color={theme.ink2}>◆ {yours.eloBefore}</Text.Mono>
                <Feather name="arrow-right" size={15} color={theme.ink3} />
                <Text.Mono preset="mono" color={theme.ink}>◆ {yours.eloAfter}</Text.Mono>
                <View style={[
                  styles.deltaPill,
                  { backgroundColor: yours.eloDelta >= 0 ? theme.accentSoft : theme.coralSoft },
                ]}>
                  <Text.Mono
                    preset="chipLabel"
                    color={yours.eloDelta >= 0 ? theme.accentDeep : theme.coral}
                  >
                    {deltaText}
                  </Text.Mono>
                </View>
                <View style={[styles.tierPill, { backgroundColor: theme.bg }]}>
                  <Text.Mono preset="chipLabel" color={theme.ink3}>
                    {yours.newTier}
                  </Text.Mono>
                </View>
              </View>
            </View>

            <View style={styles.vsStack}>
              <View style={styles.avatarPair}>
                <Avatar name={yourName} size="lg" variant="you" />
                <Text.Serif preset="italic" color={theme.ink3} style={styles.vsText}>vs</Text.Serif>
                <Avatar name={oppName} size="lg" variant="opponent" />
              </View>
              <View style={styles.scoreline}>
                <Text.Serif preset="display" color={theme.accentDeep} style={styles.scoreNumber}>
                  {yours.score}
                </Text.Serif>
                <Text.Serif preset="italic" color={theme.ink3}>vs</Text.Serif>
                <Text.Serif preset="display" color={theme.ink3} style={styles.scoreNumber}>
                  {theirs.score}
                </Text.Serif>
              </View>
              {results.isForfeit ? (
                <View style={[styles.forfeitPill, { backgroundColor: theme.amberSoft }]}>
                  <Text.Mono preset="chipLabel" color={theme.amber}>
                    {youWon ? 'OPPONENT FORFEITED' : 'YOU FORFEITED'}
                  </Text.Mono>
                </View>
              ) : null}
            </View>
          </View>
        </DesktopHero>

        <View style={styles.bodyGrid}>
          <Card style={styles.tableCard}>
            <View style={styles.tableHeaderTop}>
              <View>
                <EyebrowLabel>Answer breakdown</EyebrowLabel>
                <Text.Serif preset="h1Serif" color={theme.ink}>Question table</Text.Serif>
              </View>
            </View>

            <View style={[styles.qtableHead, { borderBottomColor: theme.line }]}>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={[styles.uppercase, styles.col_]}>#</Text.Mono>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={[styles.uppercase, styles.col_topic]}>topic</Text.Mono>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={[styles.uppercase, styles.col_section]}>section</Text.Mono>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={[styles.uppercase, styles.col_you]}>you</Text.Mono>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={[styles.uppercase, styles.col_them]}>them</Text.Mono>
              <Text.Mono preset="eyebrow" color={theme.ink3} style={[styles.uppercase, styles.col_time]}>time</Text.Mono>
              <View style={styles.col_chevron} />
            </View>

            {(
              grouped.map((row, index) => {
                const isExpanded = expandedId === row.questionId;
                return (
                  <View key={row.questionId}>
                    <Pressable
                      onPress={() => setExpandedId(isExpanded ? null : row.questionId)}
                      style={({ pressed }) => [
                        styles.qtableRow,
                        { borderBottomColor: theme.line2 },
                        isExpanded && { backgroundColor: theme.bg2 },
                        pressed && { backgroundColor: theme.bg2 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Question ${index + 1} review`}
                      accessibilityHint={isExpanded ? 'Collapses the question explanation' : 'Expands the question explanation'}
                      accessibilityState={{ expanded: isExpanded }}
                    >
                      <Text.Mono preset="mono" color={theme.ink2} style={styles.col_}>
                        Q{index + 1}
                      </Text.Mono>
                      <Text.Serif preset="questionLg" color={theme.ink} numberOfLines={1} style={styles.col_topic}>
                        {row.question.subTopic ?? row.question.category}
                      </Text.Serif>
                      <Text.Mono preset="chipLabel" color={theme.ink3} style={styles.col_section}>
                        {row.question.category}
                      </Text.Mono>
                      <View style={styles.col_you}>
                        <MarkCircle correct={row.yourAnswer ? row.yourAnswer.isCorrect : null} />
                      </View>
                      <View style={styles.col_them}>
                        <MarkCircle correct={row.theirAnswer ? row.theirAnswer.isCorrect : null} dim />
                      </View>
                      <Text.Mono preset="mono" color={theme.ink3} style={styles.col_time}>
                        {formatTime(row.yourAnswer?.timeTakenMs)}
                      </Text.Mono>
                      <View style={styles.col_chevron}>
                        <Feather
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={theme.ink3}
                        />
                      </View>
                    </Pressable>

                    {isExpanded ? (
                      <View style={[styles.expandedReview, { backgroundColor: theme.bg2, borderBottomColor: theme.line2 }]}>
                        <MathText preset="question" color={theme.ink} style={styles.expandedQuestion}>
                          {row.question.text}
                        </MathText>

                        {row.question.questionType === 'TITA' ? (
                          <View style={styles.titaReview}>
                            <AnswerValue label="your answer" value={row.yourAnswer?.typedAnswer ?? '-'} correct={row.yourAnswer?.isCorrect ?? null} />
                            <AnswerValue label="correct answer" value={row.question.correctAnswerText ?? '-'} correct />
                          </View>
                        ) : (
                          <View style={styles.optionsList}>
                            {(row.question.options ?? []).map((option, optionIndex) => {
                            const isCorrectOption = optionIndex === row.question.correctAnswer;
                            const isYourPick = row.yourAnswer?.selectedAnswer === optionIndex;
                            const isTheirPick = row.theirAnswer?.selectedAnswer === optionIndex;
                            const isYourWrongPick = isYourPick && !isCorrectOption;
                            const optionBg = isCorrectOption
                              ? theme.accentSoft
                              : isYourWrongPick
                                ? theme.coralSoft
                                : theme.card;
                            const optionColor = isCorrectOption
                              ? theme.accentDeep
                              : isYourWrongPick
                                ? theme.coral
                                : theme.ink2;

                            return (
                              <View
                                key={`${row.questionId}-${optionIndex}`}
                                style={[styles.optionRow, { backgroundColor: optionBg, borderColor: theme.line }]}
                              >
                                <Text.Mono preset="mono" color={optionColor} style={styles.optionLetter}>
                                  {String.fromCharCode(65 + optionIndex)}
                                </Text.Mono>
                                <MathText preset="body" color={optionColor} style={styles.optionText}>
                                  {option}
                                </MathText>
                                <View style={styles.optionTags}>
                                  {isYourPick ? (
                                    <Text.Mono preset="chipLabel" color={optionColor}>YOU</Text.Mono>
                                  ) : null}
                                  {isTheirPick ? (
                                    <Text.Mono preset="chipLabel" color={theme.ink3}>THEM</Text.Mono>
                                  ) : null}
                                </View>
                              </View>
                            );
                            })}
                          </View>
                        )}

                        <View style={styles.explanationBlock}>
                          <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
                            Explanation
                          </Text.Mono>
                          <MathText preset="body" color={theme.ink2}>
                            {row.question.explanation}
                          </MathText>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </Card>

          <View style={styles.sidePanel}>
            <Card style={styles.sideCard}>
              <EyebrowLabel>Section breakdown</EyebrowLabel>
              <View style={styles.sectionBars}>
                {sectionStats.map((section) => {
                  const yourPct = section.total ? section.yourCorrect / section.total : 0;
                  const theirPct = section.total ? section.theirCorrect / section.total : 0;
                  return (
                    <View key={section.section} style={styles.sectionBarBlock}>
                      <View style={styles.sectionBarLabel}>
                        <Text.Mono preset="mono" color={theme.ink}>{section.section}</Text.Mono>
                        <Text.Mono preset="mono" color={theme.ink3}>
                          {section.yourCorrect}/{section.total || 0}
                        </Text.Mono>
                      </View>
                      <View style={[styles.barTrack, { backgroundColor: theme.line2 }]}>
                        <View style={[styles.barFill, { width: `${yourPct * 100}%`, backgroundColor: theme.accent }]} />
                        <View style={[
                          styles.opponentMarker,
                          { left: `${theirPct * 100}%`, backgroundColor: theme.ink3 },
                        ]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>

            <Card style={styles.sideCard}>
              <EyebrowLabel>Pace</EyebrowLabel>
              <View style={styles.paceRow}>
                <View>
                  <Text.Mono preset="eyebrow" color={theme.ink3}>YOU</Text.Mono>
                  <Text.Serif preset="scoreLg" color={theme.ink}>{formatTime(yourAverageTimeMs ?? undefined)}</Text.Serif>
                </View>
                <Feather
                  name={yourAverageTimeMs != null && opponentAverageTimeMs != null && yourAverageTimeMs <= opponentAverageTimeMs ? 'arrow-down' : 'arrow-up'}
                  size={18}
                  color={yourAverageTimeMs != null && opponentAverageTimeMs != null && yourAverageTimeMs <= opponentAverageTimeMs ? theme.accentDeep : theme.coral}
                />
                <View style={styles.paceOpponent}>
                  <Text.Mono preset="eyebrow" color={theme.ink3}>THEM</Text.Mono>
                  <Text.Serif preset="scoreLg" color={theme.ink3}>{formatTime(opponentAverageTimeMs ?? undefined)}</Text.Serif>
                </View>
              </View>
            </Card>

            <Card style={styles.sideCard}>
              <EyebrowLabel>Match summary</EyebrowLabel>
              <View style={styles.summaryGrid}>
                <View>
                  <Text.Serif preset="scoreLg" color={theme.ink}>{accuracy}%</Text.Serif>
                  <Text.Mono preset="eyebrow" color={theme.ink3}>ACCURACY</Text.Mono>
                </View>
                <View>
                  <Text.Serif preset="scoreLg" color={theme.ink}>{yours.questionsAnswered}/{totalQuestions}</Text.Serif>
                  <Text.Mono preset="eyebrow" color={theme.ink3}>ANSWERED</Text.Mono>
                </View>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: theme.line }]} />
              <View style={styles.summaryGrid}>
                <View>
                  <Text.Serif preset="scoreLg" color={scoreGap >= 0 ? theme.accentDeep : theme.coral}>
                    {scoreGap > 0 ? '+' : ''}{scoreGap}
                  </Text.Serif>
                  <Text.Mono preset="eyebrow" color={theme.ink3}>SCORE GAP</Text.Mono>
                </View>
                <View>
                  <Text.Serif preset="scoreLg" color={theme.ink}>{unanswered}</Text.Serif>
                  <Text.Mono preset="eyebrow" color={theme.ink3}>UNANSWERED</Text.Mono>
                </View>
              </View>
            </Card>

            <Card style={styles.actionsCard}>
              <Button label="Home" variant="ghost" onPress={() => navigation.navigate('MainTabs')} />
              <Button label="Share" variant="ghost" onPress={openShareMatch} />
              <Button label="Rematch →" variant="dark" onPress={() => navigation.replace('Matchmaking')} />
            </Card>
          </View>
        </View>
      </PageContainer>

      <ShareLinkModal
        visible={shareVisible}
        title="CAT Duel match"
        message="Review this CAT Duel match:"
        url={matchUrl(results.gameId)}
        onClose={() => setShareVisible(false)}
      />
    </DesktopFrame>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: 28,
  },
  hero: {
    borderRadius: radii.xl,
    minHeight: 292,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 36,
    minHeight: 228,
  },
  heroMain: {
    flex: 1,
    minWidth: 0,
    gap: 14,
    justifyContent: 'center',
  },
  uppercase: {
    textTransform: 'uppercase',
  },
  verdict: {
    fontFamily: 'SourceSerif-MediumItalic',
    fontSize: 88,
    lineHeight: 92,
  },
  ratingTrail: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  deltaPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  tierPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  vsStack: {
    width: 300,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  avatarPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vsText: {
    paddingHorizontal: 2,
  },
  scoreline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  scoreNumber: {
    fontSize: 64,
    lineHeight: 66,
  },
  forfeitPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  bodyGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
  },
  tableCard: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    overflow: 'hidden',
  },
  tableHeaderTop: {
    padding: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  qtableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 10,
    gap: 12,
  },
  qtableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 14,
    gap: 12,
  },
  col_: {
    width: 42,
  },
  col_topic: {
    flex: 1,
    minWidth: 0,
  },
  col_section: {
    width: 76,
  },
  col_you: {
    width: 42,
    alignItems: 'center',
  },
  col_them: {
    width: 42,
    alignItems: 'center',
  },
  col_time: {
    width: 58,
    textAlign: 'right',
  },
  col_chevron: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  markCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markSymbol: {
    lineHeight: 22,
  },
  expandedReview: {
    borderBottomWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 16,
  },
  expandedQuestion: {
    maxWidth: 760,
  },
  optionsList: {
    gap: 8,
  },
  titaReview: {
    gap: 8,
    maxWidth: 480,
  },
  answerValue: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionLetter: {
    width: 20,
    textAlign: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionTags: {
    minWidth: 54,
    alignItems: 'flex-end',
    gap: 4,
  },
  explanationBlock: {
    gap: 6,
    maxWidth: 760,
  },
  sidePanel: {
    width: 320,
    gap: 16,
  },
  sideCard: {
    gap: 16,
  },
  sectionBars: {
    gap: 16,
  },
  sectionBarBlock: {
    gap: 8,
  },
  sectionBarLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: 10,
    borderRadius: 5,
  },
  opponentMarker: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
  },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  paceOpponent: {
    alignItems: 'flex-end',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  summaryDivider: {
    height: 1,
  },
  actionsCard: {
    gap: 10,
  },
});
