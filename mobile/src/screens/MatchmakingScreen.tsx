import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Socket } from 'socket.io-client';
import { RootStackParamList } from '../navigation';
import { createMatchmakingSocket } from '../services/socket';
import api from '../services/api';
import Avatar from '../components/Avatar';
import AppText from '../components/Text';
import Button from '../components/Button';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Matchmaking'>;
type Phase = 'CONNECTING' | 'SEARCHING' | 'FOUND';

const RING_SIZE = 200;

// ── Ripple ring — animated outward pulse ──────────────────────────────────────
function RippleRing({
  delay,
  color,
  animate,
}: {
  delay: number;
  color: string;
  animate: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      anim.setValue(0.35);
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
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0] });

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

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MatchmakingScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { playHaptic, reduceMotionEnabled } = useAppPreferences();
  const [phase, setPhase] = useState<Phase>('CONNECTING');
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ displayName: string | null; eloRating: number } | null>(null);
  const [matchStats, setMatchStats] = useState<{ onlineCount: number; avgWaitSec: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulsing dot for status chip
  const dotOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotionEnabled) {
      dotOpacity.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
      dotOpacity.stopAnimation(() => dotOpacity.setValue(1));
    };
  }, [dotOpacity, reduceMotionEnabled]);

  // Start elapsed counter once searching begins
  useEffect(() => {
    if (phase === 'SEARCHING') {
      elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    }
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [phase]);

  // Fetch profile + matchmaking stats, then connect socket
  useEffect(() => {
    let mounted = true;

    Promise.all([
      api.get('/auth/me').catch(() => null),
      api.get('/matchmaking/stats').catch(() => null),
    ]).then(([profileRes, statsRes]) => {
      if (!mounted) return;
      if (profileRes) setProfile(profileRes.data.data);
      if (statsRes)   setMatchStats(statsRes.data.data);
    });

    async function connect() {
      try {
        const socket = await createMatchmakingSocket();
        if (!mounted) { socket.disconnect(); return; }
        socketRef.current = socket;

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
          setError(null);
        });

        socket.on('queue:error', ({ message }: { message: string }) => {
          if (!mounted) return;
          setError(message);
        });

        socket.on('queue:timeout', () => {
          if (!mounted) return;
          setError('No opponent found. Try again.');
        });

        socket.on('match:found', ({
          gameId, opponent, ratingImpact,
        }: {
          gameId: string;
          opponent: { userId: string; displayName: string | null; avatarUrl: string | null; eloRating: number };
          ratingImpact?: { win: number; loss: number };
        }) => {
          if (!mounted) return;
          setPhase('FOUND');
          void playHaptic('match_found');
          socket.disconnect();
          navigation.replace('Found', { gameId, opponent, ratingImpact: ratingImpact ?? null });
        });
      } catch {
        if (!mounted) return;
        setError('Could not connect. Is the server running?');
      }
    }

    connect();

    return () => {
      mounted = false;
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  function handleCancel() {
    socketRef.current?.emit('queue:leave');
    navigation.navigate('MainTabs');
  }

  const range  = elapsed >= 30 ? 300 : 150;
  const eloLow = profile ? Math.max(0, profile.eloRating - range) : null;
  const eloHigh = profile ? profile.eloRating + range : null;

  const chipLabel =
    phase === 'CONNECTING' ? 'connecting' :
    phase === 'FOUND'      ? 'match found' :
    'searching for opponent';

  return (
    <ScreenTransitionView style={[styles.container, { backgroundColor: theme.bg }]}>

      {/* ── Center stack ── */}
      <View style={styles.centerStack}>

        {/* Status chip */}
        <View style={[styles.statusChip, { backgroundColor: theme.accentSoft }]}>
          <Animated.View style={[styles.statusDot, { backgroundColor: theme.accent, opacity: dotOpacity }]} />
          <AppText.Mono preset="chipLabel" color={theme.accentDeep} style={styles.chipText}>
            {chipLabel}
          </AppText.Mono>
        </View>

        {/* Ripple rings + avatar ── all centered in rippleContainer */}
        <View style={styles.rippleContainer}>
          {/* Rings are position:absolute, same size as container → centered automatically */}
          <RippleRing delay={0} color={theme.accent} animate={!reduceMotionEnabled} />
          <RippleRing delay={800} color={theme.accent} animate={!reduceMotionEnabled} />
          <RippleRing delay={1600} color={theme.accent} animate={!reduceMotionEnabled} />

          {/* Avatar card on top (non-absolute, centered by parent justifyContent) */}
          <View style={[styles.avatarCard, {
            backgroundColor: theme.card,
            shadowColor: theme.accent,
          }]}>
            <Avatar name={profile?.displayName ?? '?'} size="xl" />
          </View>
        </View>

        {/* Heading */}
        <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.heading}>
          finding a worthy rival
        </AppText.Serif>

        {/* Hint lines */}
        {eloLow !== null && (
          <AppText.Mono preset="mono" color={theme.ink3} style={styles.hint}>
            matching by rating · ◆{eloLow} – ◆{eloHigh}
          </AppText.Mono>
        )}
        <AppText.Mono preset="mono" color={theme.ink3} style={styles.hint}>
          10-min duel · mixed
        </AppText.Mono>

        {/* Live stats — shown once fetched */}
        {matchStats && (
          <AppText.Mono preset="statusBar" color={theme.ink4} style={styles.statsText}>
            {matchStats.onlineCount.toLocaleString()} online · avg wait {matchStats.avgWaitSec}s
          </AppText.Mono>
        )}

        {/* Error */}
        {error && (
          <AppText.Sans preset="label" color={theme.coral} style={styles.errorText}>
            {error}
          </AppText.Sans>
        )}
      </View>

      {/* ── Cancel button ── */}
      <View style={styles.footer}>
        <Button label="Cancel" variant="ghost" onPress={handleCancel} />
      </View>
    </ScreenTransitionView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  centerStack: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },

  // Status chip
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipText: {
    textTransform: 'uppercase',
  },

  // Ripple + avatar
  rippleContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
  },
  avatarCard: {
    width: 104,
    height: 104,
    borderRadius: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },

  heading: {
    textAlign: 'center',
    marginTop: 4,
  },
  hint: {
    textAlign: 'center',
  },
  statsText: {
    textAlign: 'center',
    marginTop: 2,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 8,
  },

  footer: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
});
