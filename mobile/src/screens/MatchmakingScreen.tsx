import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Socket } from 'socket.io-client';
import { RootStackParamList } from '../navigation';
import { createMatchmakingSocket } from '../services/socket';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'Matchmaking'>;
type Phase = 'IDLE' | 'SEARCHING' | 'FOUND';

export default function MatchmakingScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [phase, setPhase] = useState<Phase>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const socket = await createMatchmakingSocket();
        if (!mounted) { socket.disconnect(); return; }
        socketRef.current = socket;

        socket.on('connect_error', (err) => {
          if (!mounted) return;
          setError(`Connection failed: ${err.message}`);
          setPhase('IDLE');
        });

        socket.on('queue:joined', () => {
          if (!mounted) return;
          setPhase('SEARCHING');
          setError(null);
        });

        socket.on('queue:error', ({ message }: { message: string }) => {
          if (!mounted) return;
          setError(message);
          setPhase('IDLE');
        });

        socket.on('queue:timeout', () => {
          if (!mounted) return;
          setError('No opponent found. Try again.');
          setPhase('IDLE');
        });

        socket.on('match:found', ({ gameId, opponent }: { gameId: string; opponent: { userId: string; displayName: string | null; avatarUrl: string | null; eloRating: number } }) => {
          if (!mounted) return;
          setPhase('FOUND');
          socket.disconnect();
          navigation.replace('Duel', { gameId, opponent });
        });
      } catch {
        if (!mounted) return;
        setError('Could not connect. Is the server running?');
      }
    }

    connect();

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  function handleFindMatch() {
    setError(null);
    socketRef.current?.emit('queue:join');
  }

  function handleCancel() {
    socketRef.current?.emit('queue:leave');
    setPhase('IDLE');
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={[styles.backText, { color: theme.ink2 }]}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.ink }]}>Find a Duel</Text>
        <Text style={[styles.subtitle, { color: theme.ink2 }]}>
          Get matched with a player near your Elo rating
        </Text>

        {phase === 'IDLE' && (
          <Button label="Find Match" onPress={handleFindMatch} style={styles.findButton} />
        )}

        {phase === 'SEARCHING' && (
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="large" color={theme.ink} style={styles.spinner} />
            <Text style={[styles.searchingText, { color: theme.ink }]}>Searching for an opponent...</Text>
            <Text style={[styles.searchingHint, { color: theme.ink3 }]}>Range widens after 30 seconds</Text>
            <Button label="Cancel" variant="secondary" onPress={handleCancel} style={styles.cancelButton} />
          </View>
        )}

        {phase === 'FOUND' && (
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="large" color={theme.accent} style={styles.spinner} />
            <Text style={[styles.searchingText, { color: theme.ink }]}>Match found! Loading duel...</Text>
          </View>
        )}

        {error && <Text style={[styles.errorText, { color: theme.coral }]}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  backButton: { marginBottom: 32 },
  backText: { fontSize: 16 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 48,
    textAlign: 'center',
    lineHeight: 22,
  },
  findButton: {
    paddingHorizontal: 48,
    minWidth: 200,
  },
  searchingContainer: { alignItems: 'center' },
  spinner: { marginBottom: 20 },
  searchingText: { fontSize: 17, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  searchingHint: { fontSize: 13, marginBottom: 32 },
  cancelButton: { paddingHorizontal: 32 },
  errorText: {
    marginTop: 24,
    fontSize: 14,
    textAlign: 'center',
  },
});
