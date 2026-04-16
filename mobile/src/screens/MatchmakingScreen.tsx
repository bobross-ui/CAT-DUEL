import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Socket } from 'socket.io-client';
import { RootStackParamList } from '../navigation';
import { createMatchmakingSocket } from '../services/socket';

type Props = NativeStackScreenProps<RootStackParamList, 'Matchmaking'>;
type Phase = 'IDLE' | 'SEARCHING' | 'FOUND';

export default function MatchmakingScreen({ navigation }: Props) {
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
          // Disconnect matchmaking socket before navigating
          socket.disconnect();
          navigation.replace('Duel', { gameId, opponent });
        });
      } catch (err) {
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
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Find a Duel</Text>
        <Text style={styles.subtitle}>Get matched with a player near your Elo rating</Text>

        {phase === 'IDLE' && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleFindMatch}>
            <Text style={styles.primaryButtonText}>Find Match</Text>
          </TouchableOpacity>
        )}

        {phase === 'SEARCHING' && (
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="large" color="#1a1a1a" style={styles.spinner} />
            <Text style={styles.searchingText}>Searching for an opponent...</Text>
            <Text style={styles.searchingHint}>Range widens after 30 seconds</Text>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'FOUND' && (
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="large" color="#16a34a" style={styles.spinner} />
            <Text style={styles.searchingText}>Match found! Loading duel...</Text>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  backButton: { marginBottom: 32 },
  backText: { fontSize: 16, color: '#666' },
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
    color: '#666',
    marginBottom: 48,
    textAlign: 'center',
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  searchingContainer: { alignItems: 'center' },
  spinner: { marginBottom: 20 },
  searchingText: { fontSize: 17, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  searchingHint: { fontSize: 13, color: '#999', marginBottom: 32 },
  cancelButton: {
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelButtonText: { fontSize: 15, fontWeight: '600', color: '#666' },
  errorText: {
    marginTop: 24,
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
});
