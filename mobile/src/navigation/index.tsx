import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PracticeHomeScreen from '../screens/PracticeHomeScreen';
import QuestionScreen from '../screens/QuestionScreen';
import PracticeSummaryScreen from '../screens/PracticeSummaryScreen';
import MatchmakingScreen from '../screens/MatchmakingScreen';
import DuelScreen from '../screens/DuelScreen';
import DuelResultsScreen from '../screens/DuelResultsScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import MatchHistoryScreen from '../screens/MatchHistoryScreen';
import MatchDetailScreen from '../screens/MatchDetailScreen';

export type OpponentInfo = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  eloRating: number;
};

type PlayerResult = {
  userId: string;
  score: number;
  questionsAnswered: number;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  newTier: string;
  tierChanged: boolean;
};

export type GameFinishedPayload = {
  gameId: string;
  winnerId: string | null;
  isDraw: boolean;
  isForfeit: boolean;
  currentUserId: string; // Postgres UUID for this specific player, injected by server on emit
  player1: PlayerResult;
  player2: PlayerResult;
  totalQuestions: number;
  durationSeconds: number;
};

export type RootStackParamList = {
  Login: undefined;
  Profile: undefined;
  PracticeHome: undefined;
  Question: { category: string; difficulty?: number };
  PracticeSummary: { total: number; correct: number; totalTimeMs: number };
  Matchmaking: undefined;
  Duel: { gameId: string; opponent: OpponentInfo };
  DuelResults: { results: GameFinishedPayload; userId: string; opponent: OpponentInfo };
  Leaderboard: undefined;
  MatchHistory: undefined;
  MatchDetail: { matchId: string; opponentName: string | null };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="PracticeHome" component={PracticeHomeScreen} />
          <Stack.Screen name="Question" component={QuestionScreen} />
          <Stack.Screen name="PracticeSummary" component={PracticeSummaryScreen} />
          <Stack.Screen name="Matchmaking" component={MatchmakingScreen} />
          <Stack.Screen
            name="Duel"
            component={DuelScreen}
            options={{ gestureEnabled: false }} // Prevent swipe-back during duel
          />
          <Stack.Screen name="DuelResults" component={DuelResultsScreen} />
          <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
          <Stack.Screen name="MatchHistory" component={MatchHistoryScreen} />
          <Stack.Screen name="MatchDetail" component={MatchDetailScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
