import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, InitialGameState } from '../navigation';
import api from '../services/api';
import { disconnectGameSocket, getGameSocket, releaseGameSocket } from '../services/socket';
import AppText from '../components/Text';
import Avatar from '../components/Avatar';
import Card from '../components/Card';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { getTier } from '../constants';
import { track } from '../services/analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'Found'>;
type PreStartStatus = 'waiting_for_opponent' | 'countdown';

interface UserProfile {
  displayName: string | null;
  eloRating: number;
  rankTier: string;
}

// ── Countdown digit — scales in from 1.2 on each tick ────────────────────────
function CountdownDigit({ count, animate }: { count: number; animate: boolean }) {
  const { theme, mode } = useTheme();
  const scaleAnim  = useRef(new Animated.Value(1.2)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      scaleAnim.setValue(1);
      opacityAnim.setValue(1);
      return;
    }

    scaleAnim.setValue(1.2);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.timing(scaleAnim,   { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [animate, count, opacityAnim, scaleAnim]);

  // On ink background: accent box, white digit
  const boxBg   = theme.accent;
  const textCol = mode === 'dark' ? theme.bg : '#FFFFFF';

  return (
    <Animated.View
      style={[
        styles.countBox,
        { backgroundColor: boxBg, transform: [{ scale: scaleAnim }], opacity: opacityAnim },
      ]}
    >
      <AppText.Serif preset="verdict" color={textCol} style={{ textAlign: 'center' }}>
        {count}
      </AppText.Serif>
    </Animated.View>
  );
}

// ── Side card (you or opponent) ───────────────────────────────────────────────
function SideCard({
  isYou,
  name,
  elo,
  tierName,
  winRate,
}: {
  isYou: boolean;
  name: string | null;
  elo: number;
  tierName: string;
  winRate?: number | null;
}) {
  const { theme } = useTheme();

  const tierLine = winRate != null
    ? `${tierName} · ${Math.round(winRate * 100)}% win`
    : tierName;

  return (
    <View style={[
      styles.sideCard,
      isYou
        ? { backgroundColor: theme.card, borderColor: theme.line, borderWidth: 1 }
        : { backgroundColor: theme.accentSoft },
    ]}>
      <Avatar name={name ?? '?'} size="lg" variant={isYou ? 'you' : 'opponent'} />
      <AppText.Serif
        preset="statVal"
        color={theme.ink}
        style={styles.sideName}
        numberOfLines={1}
      >
        {name ?? 'Player'}
      </AppText.Serif>
      <AppText.Mono preset="mono" color={isYou ? theme.ink2 : theme.accentDeep}>
        ◆ {elo}
      </AppText.Mono>
      <AppText.Sans
        preset="small"
        color={isYou ? theme.ink3 : theme.accentDeep}
        style={{ marginTop: 2, textAlign: 'center' }}
        numberOfLines={1}
      >
        {tierLine}
      </AppText.Sans>
    </View>
  );
}

// ── Rules grid cell ───────────────────────────────────────────────────────────
function RuleCell({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.ruleCell}>
      <AppText.Mono preset="eyebrow" color={theme.ink3} style={{ textTransform: 'uppercase' }}>
        {label}
      </AppText.Mono>
      <AppText.Sans preset="bodyMed" color={theme.ink} style={{ marginTop: 3 }}>
        {value}
      </AppText.Sans>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function FoundScreen({ navigation, route }: Props) {
  const { gameId, opponent, ratingImpact } = route.params;
  const { theme, mode } = useTheme();
  const { playHaptic, reduceMotionEnabled } = useAppPreferences();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [winRate, setWinRate] = useState<number | null>(null);
  const [preStartStatus, setPreStartStatus] = useState<PreStartStatus>('waiting_for_opponent');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [initialState, setInitialState] = useState<InitialGameState | null>(null);
  const [statusMessage, setStatusMessage] = useState('waiting for both players');
  const navigatedRef = useRef(false);
  const shouldKeepSocketRef = useRef(false);
  const requeueingRef = useRef(false);
  const trackedRatingPreviewRef = useRef(false);

  function reasonToNotice(reason: 'join_timeout' | 'opponent_left' | 'cancelled') {
    if (reason === 'join_timeout') return 'Opponent didn’t connect. Finding another match...';
    if (reason === 'opponent_left') return 'Opponent left before the duel began. Finding another match...';
    return 'Match cancelled. Finding another match...';
  }

  // Connect, join game, store initialState when server fires game:start
  useEffect(() => {
    if (!ratingImpact || trackedRatingPreviewRef.current) return;
    trackedRatingPreviewRef.current = true;
    track('rating_preview_shown', {
      winDelta: ratingImpact.win,
      lossDelta: ratingImpact.loss,
      drawDelta: ratingImpact.draw,
    });
  }, [ratingImpact]);

  useEffect(() => {
    let mounted = true;
    let removeListeners: (() => void) | null = null;

    getGameSocket().then(socket => {
      if (!mounted) return;

      const join = () => socket.emit('game:join', { gameId });
      socket.on('connect', join);
      if (socket.connected) join();

      socket.on('match:status', ({
        status,
        seconds,
      }: {
        gameId: string;
        status: PreStartStatus;
        seconds?: number;
      }) => {
        if (!mounted) return;
        setPreStartStatus(status);

        if (status === 'waiting_for_opponent') {
          setCountdown(null);
          setStatusMessage('waiting for both players');
          return;
        }

        setStatusMessage('both players ready');
        if (typeof seconds === 'number') {
          setCountdown(seconds);
        }
      });

      socket.once('game:start', (state: InitialGameState) => {
        if (!mounted) return;
        setCountdown((prev) => prev ?? 0);
        setInitialState(state);
      });

      socket.on('match:cancelled', ({
        reason,
      }: {
        gameId: string;
        reason: 'join_timeout' | 'opponent_left' | 'cancelled';
      }) => {
        if (!mounted || requeueingRef.current) return;
        setStatusMessage(reason === 'join_timeout'
          ? 'opponent did not connect'
          : reason === 'opponent_left'
            ? 'opponent left before start'
            : 'match cancelled');
      });

      socket.on('match:requeueing', async ({
        reason,
      }: {
        gameId: string;
        reason: 'join_timeout' | 'opponent_left' | 'cancelled';
      }) => {
        if (!mounted) return;
        requeueingRef.current = true;
        setStatusMessage('finding another match');
        await disconnectGameSocket();
        navigation.replace('Matchmaking', { notice: reasonToNotice(reason) });
      });

      removeListeners = () => {
        socket.off('connect', join);
        socket.off('match:status');
        socket.off('game:start');
        socket.off('match:cancelled');
        socket.off('match:requeueing');
      };
    });

    return () => {
      mounted = false;
      removeListeners?.();
      if (!shouldKeepSocketRef.current) {
        void disconnectGameSocket();
        releaseGameSocket();
      }
    };
  }, [gameId, navigation]);

  // Fetch user profile + win rate
  useEffect(() => {
    Promise.all([
      api.get('/auth/me').catch(() => null),
      api.get('/games/stats').catch(() => null),
    ]).then(([profileRes, statsRes]) => {
      if (profileRes) setProfile(profileRes.data.data);
      if (statsRes)   setWinRate(statsRes.data.data?.winRate ?? null);
    });
  }, []);

  // Tick down once countdown has started
  useEffect(() => {
    if (countdown === null) return;
    const interval = setInterval(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    void playHaptic('countdown_tick');
  }, [countdown, playHaptic]);

  // Navigate when countdown finishes AND game:start has been received
  useEffect(() => {
    if (countdown !== null && countdown <= 0 && initialState && !navigatedRef.current) {
      navigatedRef.current = true;
      shouldKeepSocketRef.current = true;
      navigation.replace('Duel', { gameId, opponent, initialState });
    }
  }, [countdown, gameId, initialState, navigation, opponent]);

  const myTierName  = profile ? getTier(profile.eloRating).name : '—';
  const oppTierName = getTier(opponent.eloRating).name;

  // Banner colors: ink bg, bg-colored text
  const bannerBg   = theme.ink;
  const bannerText = mode === 'dark' ? theme.bg2 : '#FFFFFF';

  return (
    <ScreenTransitionView style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Eyebrow */}
        <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.eyebrow}>
          OPPONENT FOUND
        </AppText.Mono>

        {/* Headline: "you vs {name}" — opponent name in italic accentDeep */}
        <View style={styles.headlineRow}>
          <AppText.Serif preset="heroSerif" color={theme.ink}>
            {'you vs '}
          </AppText.Serif>
          <AppText.Serif
            preset="heroSerif"
            color={theme.accentDeep}
            style={{ fontFamily: 'SourceSerif-MediumItalic' }}
          >
            {opponent.displayName ?? 'opponent'}
          </AppText.Serif>
        </View>

        {/* VS row */}
        <View style={styles.vsRow}>
          <SideCard
            isYou
            name={profile?.displayName ?? null}
            elo={profile?.eloRating ?? 0}
            tierName={myTierName}
            winRate={winRate}
          />
          <AppText.Serif preset="italic" color={theme.ink3} style={styles.vsLabel}>
            vs
          </AppText.Serif>
          <SideCard
            isYou={false}
            name={opponent.displayName}
            elo={opponent.eloRating}
            tierName={oppTierName}
          />
        </View>

        {/* Rules card */}
        <Card style={styles.rulesCard}>
          <View style={styles.rulesGrid}>
            <RuleCell label="DURATION"  value="10:00" />
            <RuleCell label="QUESTIONS" value="20" />
            <RuleCell label="SECTIONS"  value="Mixed" />
            <RuleCell label="SCORING"   value="+1 per correct" />
          </View>
        </Card>

        {/* Rating impact chip */}
        {ratingImpact && (
          <View style={[styles.ratingChip, { backgroundColor: theme.accentSoft }]}>
            <AppText.Mono
              preset="chipLabel"
              color={theme.accentDeep}
              style={{ textTransform: 'uppercase' }}
            >
              {`rating impact · win +${ratingImpact.win} · lose ${ratingImpact.loss}`}
            </AppText.Mono>
          </View>
        )}

        {/* Start banner — "get ready" hold then countdown */}
        <View style={[styles.banner, { backgroundColor: bannerBg }]}>
          {preStartStatus === 'countdown' && countdown !== null ? (
            <>
              <CountdownDigit count={Math.max(0, countdown)} animate={!reduceMotionEnabled} />
              <AppText.Serif preset="h1Serif" color={bannerText}>
                starting in
              </AppText.Serif>
            </>
          ) : (
            <AppText.Serif preset="h1Serif" color={bannerText}>
              waiting for opponent
            </AppText.Serif>
          )}
        </View>

        {/* Abandon note */}
        <AppText.Sans preset="small" color={theme.ink3} style={styles.abandonNote}>
          {statusMessage}
        </AppText.Sans>
      </ScrollView>
    </ScreenTransitionView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
    alignItems: 'center',
  },

  eyebrow: {
    letterSpacing: 1.4,
  },

  headlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'baseline',
  },

  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },

  sideCard: {
    flex: 1,
    borderRadius: radii.lg,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  sideName: {
    textAlign: 'center',
    marginTop: 8,
  },

  vsLabel: {
    textAlign: 'center',
  },

  rulesCard: {
    width: '100%',
    padding: 0,
  },
  rulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  ruleCell: {
    width: '50%',
    padding: 10,
  },

  ratingChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },

  banner: {
    width: '100%',
    borderRadius: radii.lg,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  countBox: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },

  abandonNote: {
    textAlign: 'center',
  },
});
