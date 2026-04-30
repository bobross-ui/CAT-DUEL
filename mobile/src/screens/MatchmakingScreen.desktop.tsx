import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Socket } from 'socket.io-client';
import { ActiveGamePayload, InitialGameState, OpponentInfo, RootStackParamList } from '../navigation';
import { createMatchmakingSocket, disconnectGameSocket, getGameSocket, releaseGameSocket } from '../services/socket';
import { useCurrentProfile } from '../hooks/useCurrentProfile';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';
import { getTier } from '../constants';
import { track } from '../services/analytics';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import ScreenTransitionView from '../components/ScreenTransitionView';
import Text from '../components/Text';
import { radii } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Matchmaking'>;
type Phase = 'CONNECTING' | 'SEARCHING' | 'FOUND' | 'COUNTDOWN';
type PreStartStatus = 'waiting_for_opponent' | 'countdown';
type RatingImpact = { win: number; loss: number; draw?: number };
type FoundMatch = {
  gameId: string;
  opponent: OpponentInfo;
  ratingImpact: RatingImpact | null;
};

const RING_SIZE = 150;

function RippleRing({ delay, color, animate }: { delay: number; color: string; animate: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      anim.setValue(0.4);
      return;
    }

    let loop: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      loop = Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: 2400,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
      );
      loop.start();
    }, delay);

    return () => {
      clearTimeout(timer);
      loop?.stop();
      anim.stopAnimation(() => anim.setValue(0));
    };
  }, [animate, anim, delay]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.5] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] });

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          borderColor: color,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

function StatusChip({ phase }: { phase: Phase }) {
  const { theme } = useTheme();
  const { reduceMotionEnabled } = useAppPreferences();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotionEnabled) {
      opacity.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
      opacity.stopAnimation(() => opacity.setValue(1));
    };
  }, [opacity, reduceMotionEnabled]);

  const label =
    phase === 'CONNECTING' ? 'CONNECTING' :
    phase === 'FOUND' ? 'OPPONENT FOUND' :
    phase === 'COUNTDOWN' ? 'STARTING IN...' :
    'SEARCHING FOR OPPONENT';

  return (
    <View style={[styles.statusChip, { backgroundColor: theme.accentSoft }]}>
      <Animated.View style={[styles.statusDot, { backgroundColor: theme.accent, opacity }]} />
      <Text.Mono preset="chipLabel" color={theme.accentDeep}>
        {label}
      </Text.Mono>
    </View>
  );
}

function RuleCell({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();

  return (
    <View style={[styles.ruleCell, { borderColor: theme.line }]}>
      <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
        {label}
      </Text.Mono>
      <Text.Sans preset="bodyMed" color={theme.ink} style={styles.ruleValue}>
        {value}
      </Text.Sans>
    </View>
  );
}

function PlayerCard({
  label,
  name,
  elo,
  matches,
  winRate,
  streak,
  variant,
  found,
}: {
  label: string;
  name: string | null | undefined;
  elo: number | null | undefined;
  matches?: number;
  winRate?: number;
  streak?: number;
  variant: 'you' | 'opponent';
  found?: boolean;
}) {
  const { theme } = useTheme();
  const tier = elo != null ? getTier(elo).name : '...';
  const winPct = winRate != null ? `${Math.round(winRate * 100)}%` : '--';

  return (
    <View
      style={[
        styles.playerCard,
        {
          backgroundColor: found ? theme.accentSoft : theme.card,
          borderColor: found ? theme.accent : theme.line,
          shadowColor: found ? theme.accent : theme.ink,
        },
      ]}
    >
      <Text.Mono preset="eyebrow" color={found ? theme.accentDeep : theme.ink3} style={styles.uppercase}>
        {label}
      </Text.Mono>
      <View style={styles.avatarWrap}>
        <Avatar name={name ?? '?'} size="xl" variant={variant} />
      </View>
      <Text.Serif preset="heroSerif" color={theme.ink} style={styles.playerName} numberOfLines={1}>
        {name ?? 'Player'}
      </Text.Serif>
      <Text.Mono preset="mono" color={found ? theme.accentDeep : theme.ink2}>
        {elo != null ? `◆ ${elo}` : '◆ ...'}
      </Text.Mono>
      <Text.Sans preset="small" color={found ? theme.accentDeep : theme.ink3} style={styles.tierLine} numberOfLines={1}>
        {tier}
      </Text.Sans>
      <View style={[styles.statRow, { borderTopColor: theme.line }]}>
        <SmallStat label="matches" value={matches != null ? String(matches) : '--'} />
        <SmallStat label="win" value={winPct} />
        <SmallStat label="streak" value={streak != null ? String(streak) : '--'} />
      </View>
    </View>
  );
}

function OpponentPlaceholder({ eloLow, eloHigh }: { eloLow: number | null; eloHigh: number | null }) {
  const { theme } = useTheme();
  const { reduceMotionEnabled } = useAppPreferences();

  return (
    <View style={[styles.playerCard, styles.placeholderCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
        opponent
      </Text.Mono>
      <View style={styles.placeholderAvatar}>
        <RippleRing delay={0} color={theme.accent} animate={!reduceMotionEnabled} />
        <RippleRing delay={900} color={theme.accent} animate={!reduceMotionEnabled} />
        <View style={[styles.questionMarkCircle, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
          <Text.Serif preset="display" color={theme.ink3} style={styles.questionMark}>
            ?
          </Text.Serif>
        </View>
      </View>
      <Text.Serif preset="heroSerif" color={theme.ink3} style={styles.playerName}>
        -
      </Text.Serif>
      <Text.Mono preset="mono" color={theme.ink3} style={styles.placeholderText}>
        {eloLow !== null && eloHigh !== null ? `searching by rating · ◆${eloLow}-${eloHigh}` : 'searching by rating'}
      </Text.Mono>
    </View>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();

  return (
    <View style={styles.smallStat}>
      <Text.Mono preset="eyebrow" color={theme.ink3} style={styles.uppercase}>
        {label}
      </Text.Mono>
      <Text.Serif preset="statVal" color={theme.ink}>
        {value}
      </Text.Serif>
    </View>
  );
}

function CountdownBox({ countdown }: { countdown: number | null }) {
  const { theme } = useTheme();

  if (countdown === null) return null;

  return (
    <View style={styles.countdownRow}>
      <Text.Mono preset="mono" color={theme.ink3} style={styles.uppercase}>
        starting in
      </Text.Mono>
      <View style={[styles.countBox, { backgroundColor: theme.ink }]}>
        <Text.Serif preset="verdict" color={theme.bg} style={styles.countText}>
          {Math.max(0, countdown)}
        </Text.Serif>
      </View>
    </View>
  );
}

export default function MatchmakingScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { playHaptic } = useAppPreferences();
  const { user } = useCurrentProfile();
  const [phase, setPhase] = useState<Phase>('CONNECTING');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [foundMatch, setFoundMatch] = useState<FoundMatch | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [initialState, setInitialState] = useState<InitialGameState | null>(null);
  const [statusMessage, setStatusMessage] = useState(route.params?.notice ?? '');
  const [documentHidden, setDocumentHidden] = useState(false);
  const matchmakingSocketRef = useRef<Socket | null>(null);
  const shouldKeepGameSocketRef = useRef(false);
  const navigatedRef = useRef(false);
  const requeueingRef = useRef(false);
  const trackedRatingPreviewRef = useRef(false);

  const range = elapsed >= 30 ? 300 : 150;
  const eloLow = user ? Math.max(0, user.eloRating - range) : null;
  const eloHigh = user ? user.eloRating + range : null;

  const title = useMemo(() => {
    if (phase === 'COUNTDOWN') return 'Starting · CAT Duel';
    if (phase === 'FOUND') return documentHidden ? '(!) Match found! · CAT Duel' : 'Match found! · CAT Duel';
    return 'Searching · CAT Duel';
  }, [documentHidden, phase]);
  useDocumentTitle(title);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const syncHidden = () => setDocumentHidden(document.hidden);
    syncHidden();
    document.addEventListener('visibilitychange', syncHidden);
    return () => document.removeEventListener('visibilitychange', syncHidden);
  }, []);

  useEffect(() => {
    if (phase !== 'SEARCHING') return undefined;

    const interval = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const socket = await createMatchmakingSocket();
        if (!mounted) {
          socket.disconnect();
          return;
        }

        matchmakingSocketRef.current = socket;
        const join = () => socket.emit('queue:join');

        socket.on('connect', join);
        if (socket.connected) join();

        socket.on('connect_error', (err) => {
          if (!mounted) return;
          setError(`Connection failed: ${err.message}`);
        });

        socket.on('queue:joined', () => {
          if (!mounted) return;
          setPhase('SEARCHING');
          setError('');
        });

        socket.on('queue:error', ({ message }: { message: string }) => {
          if (!mounted) return;
          setError(message);
        });

        socket.on('queue:active_game', (activeGame: ActiveGamePayload) => {
          if (!mounted) return;
          socket.disconnect();
          navigation.replace('Duel', activeGame);
        });

        socket.on('queue:timeout', () => {
          if (!mounted) return;
          setError('No opponent found. Try again.');
        });

        socket.on('match:found', (match: FoundMatch) => {
          if (!mounted) return;
          setFoundMatch({
            gameId: match.gameId,
            opponent: match.opponent,
            ratingImpact: match.ratingImpact ?? null,
          });
          setPhase('FOUND');
          setStatusMessage('waiting for both players');
          setError('');
          void playHaptic('match_found');
          socket.disconnect();
          matchmakingSocketRef.current = null;
        });
      } catch {
        if (!mounted) return;
        setError('Could not connect. Is the server running?');
      }
    }

    connect();

    return () => {
      mounted = false;
      matchmakingSocketRef.current?.disconnect();
      matchmakingSocketRef.current = null;
    };
  }, [navigation, playHaptic]);

  useEffect(() => {
    if (!foundMatch?.ratingImpact || trackedRatingPreviewRef.current) return;

    trackedRatingPreviewRef.current = true;
    track('rating_preview_shown', {
      winDelta: foundMatch.ratingImpact.win,
      lossDelta: foundMatch.ratingImpact.loss,
      drawDelta: foundMatch.ratingImpact.draw,
    });
  }, [foundMatch?.ratingImpact]);

  useEffect(() => {
    if (!foundMatch) return undefined;

    let mounted = true;
    let removeListeners: (() => void) | null = null;

    getGameSocket().then((socket) => {
      if (!mounted) return;

      const join = () => socket.emit('game:join', { gameId: foundMatch.gameId });
      const handleStatus = ({ status, seconds }: { gameId: string; status: PreStartStatus; seconds?: number }) => {
        if (!mounted) return;

        if (status === 'waiting_for_opponent') {
          setPhase('FOUND');
          setCountdown(null);
          setStatusMessage('waiting for both players');
          return;
        }

        setPhase('COUNTDOWN');
        setStatusMessage('both players ready');
        if (typeof seconds === 'number') setCountdown(seconds);
      };
      const handleStart = (state: InitialGameState) => {
        if (!mounted) return;
        setCountdown((prev) => prev ?? 0);
        setInitialState(state);
      };
      const handleCancelled = ({ reason }: { gameId: string; reason: 'join_timeout' | 'opponent_left' | 'cancelled' }) => {
        if (!mounted || requeueingRef.current) return;
        setStatusMessage(
          reason === 'join_timeout'
            ? 'opponent did not connect'
            : reason === 'opponent_left'
              ? 'opponent left before start'
              : 'match cancelled',
        );
      };
      const handleRequeueing = async ({ reason }: { gameId: string; reason: 'join_timeout' | 'opponent_left' | 'cancelled' }) => {
        if (!mounted) return;
        requeueingRef.current = true;
        setStatusMessage('finding another match');
        await disconnectGameSocket();
        navigation.replace('Matchmaking', { notice: reasonToNotice(reason) });
      };

      socket.on('connect', join);
      if (socket.connected) join();
      socket.on('match:status', handleStatus);
      socket.once('game:start', handleStart);
      socket.on('match:cancelled', handleCancelled);
      socket.on('match:requeueing', handleRequeueing);

      removeListeners = () => {
        socket.off('connect', join);
        socket.off('match:status', handleStatus);
        socket.off('game:start', handleStart);
        socket.off('match:cancelled', handleCancelled);
        socket.off('match:requeueing', handleRequeueing);
      };
    });

    return () => {
      mounted = false;
      removeListeners?.();
      if (!shouldKeepGameSocketRef.current) {
        void disconnectGameSocket();
        releaseGameSocket();
      }
    };
  }, [foundMatch, navigation]);

  useEffect(() => {
    if (countdown === null) return undefined;

    const interval = setInterval(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    void playHaptic('countdown_tick');
  }, [countdown, playHaptic]);

  useEffect(() => {
    if (!foundMatch || countdown === null || countdown > 0 || !initialState || navigatedRef.current) return;

    navigatedRef.current = true;
    shouldKeepGameSocketRef.current = true;
    navigation.replace('Duel', {
      gameId: foundMatch.gameId,
      opponent: foundMatch.opponent,
      initialState,
    });
  }, [countdown, foundMatch, initialState, navigation]);

  function handleCancel() {
    if (phase === 'SEARCHING' || phase === 'CONNECTING') {
      matchmakingSocketRef.current?.emit('queue:leave');
    }
    navigation.navigate('MainTabs');
  }

  const opponent = foundMatch?.opponent ?? null;
  const ratingImpact = foundMatch?.ratingImpact ?? null;

  return (
    <ScreenTransitionView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.topBar}>
        <StatusChip phase={phase} />
        <Button label="Cancel" variant="ghost" onPress={handleCancel} style={styles.cancelButton} />
      </View>

      <View style={styles.content}>
        <PlayerCard
          label="you"
          name={user?.displayName}
          elo={user?.eloRating}
          matches={user?.gamesPlayed}
          winRate={user?.winRate}
          streak={user?.currentStreak}
          variant="you"
        />

        <View style={styles.centerCell}>
          <Text.Serif preset="display" color={theme.ink} style={styles.vsText}>
            vs
          </Text.Serif>
          <View style={[styles.rulesCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={styles.rulesGrid}>
              <RuleCell label="duration" value="10:00" />
              <RuleCell label="questions" value="20" />
              <RuleCell label="sections" value="Mixed" />
              <RuleCell label="scoring" value="+1 correct" />
            </View>
          </View>
          <CountdownBox countdown={phase === 'COUNTDOWN' ? countdown : null} />
          {ratingImpact ? (
            <View style={[styles.impactChip, { backgroundColor: theme.accentSoft }]}>
              <Text.Mono preset="chipLabel" color={theme.accentDeep}>
                {`RATING IMPACT · WIN +${ratingImpact.win} · LOSE ${ratingImpact.loss}`}
              </Text.Mono>
            </View>
          ) : null}
          {statusMessage ? (
            <Text.Sans preset="small" color={theme.ink3} style={styles.statusMessage}>
              {statusMessage}
            </Text.Sans>
          ) : null}
          {error ? (
            <Text.Sans preset="label" color={theme.coral} style={styles.statusMessage}>
              {error}
            </Text.Sans>
          ) : null}
        </View>

        {opponent ? (
          <PlayerCard
            label="opponent"
            name={opponent.displayName}
            elo={opponent.eloRating}
            variant="opponent"
            found
          />
        ) : (
          <OpponentPlaceholder eloLow={eloLow} eloHigh={eloHigh} />
        )}
      </View>
    </ScreenTransitionView>
  );
}

function reasonToNotice(reason: 'join_timeout' | 'opponent_left' | 'cancelled') {
  if (reason === 'join_timeout') return 'Opponent did not connect. Finding another match...';
  if (reason === 'opponent_left') return 'Opponent left before the duel began. Finding another match...';
  return 'Match cancelled. Finding another match...';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 28,
    left: 36,
    right: 36,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cancelButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 96,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingHorizontal: 36,
    paddingVertical: 96,
  },
  playerCard: {
    width: 300,
    minHeight: 360,
    borderRadius: radii.xxl,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    gap: 7,
  },
  placeholderCard: {
    borderStyle: 'dashed',
    shadowOpacity: 0,
  },
  avatarWrap: {
    marginTop: 12,
    marginBottom: 6,
  },
  placeholderAvatar: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  questionMarkCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionMark: {
    fontFamily: 'SourceSerif-MediumItalic',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
  },
  playerName: {
    maxWidth: '100%',
    textAlign: 'center',
    marginTop: 4,
  },
  tierLine: {
    textAlign: 'center',
  },
  statRow: {
    width: '100%',
    flexDirection: 'row',
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 16,
  },
  smallStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  centerCell: {
    width: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  vsText: {
    fontFamily: 'SourceSerif-MediumItalic',
  },
  rulesCard: {
    width: '100%',
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ruleCell: {
    width: '50%',
    padding: 16,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  ruleValue: {
    marginTop: 4,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countBox: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    textAlign: 'center',
  },
  impactChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.pill,
  },
  statusMessage: {
    textAlign: 'center',
  },
  placeholderText: {
    marginTop: 2,
    textAlign: 'center',
  },
  uppercase: {
    textTransform: 'uppercase',
  },
});
