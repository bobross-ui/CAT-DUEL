import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Socket } from 'socket.io-client';
import { RootStackParamList } from '../navigation';
import { createMatchmakingSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import AppText from '../components/Text';
import Button from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'GuestMatchmaking'>;

const ERROR_MESSAGES: Record<string, string> = {
  ALREADY_PLAYED: 'You have already played your practice match. Sign up to play more.',
  NO_BOT_AVAILABLE: 'No opponents available right now. Try again in a moment.',
  NOT_GUEST: 'This account is not in guest mode.',
  INTERNAL: 'Something went wrong. Try again.',
};

export default function GuestMatchmakingScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const socket = await createMatchmakingSocket();
        if (!mounted) { socket.disconnect(); return; }
        socketRef.current = socket;

        const start = () => socket.emit('guest:start');
        socket.on('connect', start);
        if (socket.connected) start();

        socket.on('connect_error', (err) => {
          if (!mounted) return;
          setError(`Connection failed: ${err.message}`);
        });

        socket.on('guest:error', ({ code }: { code: string }) => {
          if (!mounted) return;
          setError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL);
        });

        socket.on('queue:active_game', (activeGame) => {
          if (!mounted) return;
          socket.disconnect();
          navigation.replace('Duel', activeGame);
        });

        socket.on('match:found', ({
          gameId, opponent, ratingImpact,
        }: {
          gameId: string;
          opponent: { userId: string; displayName: string | null; avatarUrl: string | null; eloRating: number; gamesPlayed?: number; winRate?: number };
          ratingImpact?: { win: number; loss: number; draw?: number };
        }) => {
          if (!mounted) return;
          socket.disconnect();
          navigation.replace('Found', { gameId, opponent, ratingImpact: ratingImpact ?? null });
        });
      } catch {
        if (!mounted) return;
        setError('Could not connect. Try again.');
      }
    }

    connect();

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [navigation]);

  const handleCancel = async () => {
    socketRef.current?.disconnect();
    await signOut();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.center}>
        {error ? (
          <AppText.Sans preset="body" color={theme.coral} style={styles.text}>
            {error}
          </AppText.Sans>
        ) : (
          <>
            <ActivityIndicator color={theme.ink3} size="large" />
            <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.text}>
              setting up your practice duel
            </AppText.Serif>
          </>
        )}
      </View>
      <View style={styles.footer}>
        <Button label="Cancel" variant="ghost" onPress={handleCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  text: { textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 48 },
});
