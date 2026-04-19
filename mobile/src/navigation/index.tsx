import { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import PlayScreen from '../screens/PlayScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import PracticeHomeScreen from '../screens/PracticeHomeScreen';
import QuestionScreen from '../screens/QuestionScreen';
import PracticeSummaryScreen from '../screens/PracticeSummaryScreen';
import MatchmakingScreen from '../screens/MatchmakingScreen';
import FoundScreen from '../screens/FoundScreen';
import DuelScreen from '../screens/DuelScreen';
import DuelResultsScreen from '../screens/DuelResultsScreen';
import MatchHistoryScreen from '../screens/MatchHistoryScreen';
import MatchDetailScreen from '../screens/MatchDetailScreen';
import DebugScreen from '../screens/DebugScreen';
import TabBar from '../components/TabBar';

export interface ClientQuestion {
  id: string;
  category: string;
  subTopic: string | null;
  difficulty: number;
  text: string;
  options: string[];
}

export interface InitialGameState {
  duration: number;
  totalQuestions: number;
  firstQuestion: ClientQuestion;
  questionNumber: number;
}

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
  currentUserId: string;
  player1: PlayerResult;
  player2: PlayerResult;
  totalQuestions: number;
  durationSeconds: number;
};

export type MainTabParamList = {
  Home: undefined;
  Play: undefined;
  Ranks: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Matchmaking: undefined;
  Found: { gameId: string; opponent: OpponentInfo; ratingImpact: { win: number; loss: number } | null };
  Duel: { gameId: string; opponent: OpponentInfo; initialState: InitialGameState };
  DuelResults: { results: GameFinishedPayload; userId: string; opponent: OpponentInfo };
  PracticeHome: undefined;
  Question: { category: string; difficulty?: number };
  PracticeSummary: {
    total: number;
    correct: number;
    totalTimeMs: number;
    questions?: { category: string; subTopic: string | null; isCorrect: boolean }[];
  };
  MatchHistory: undefined;
  MatchDetail: { matchId: string; opponentName: string | null };
  Debug: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Play" component={PlayScreen} />
      <Tab.Screen name="Ranks" component={LeaderboardScreen} />
      <Tab.Screen name="Me" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="Matchmaking" component={MatchmakingScreen} />
          <Stack.Screen name="Found" component={FoundScreen} options={{ gestureEnabled: false }} />
          <Stack.Screen
            name="Duel"
            component={DuelScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen name="DuelResults" component={DuelResultsScreen} />
          <Stack.Screen name="PracticeHome" component={PracticeHomeScreen} />
          <Stack.Screen name="Question" component={QuestionScreen} />
          <Stack.Screen name="PracticeSummary" component={PracticeSummaryScreen} />
          <Stack.Screen name="MatchHistory" component={MatchHistoryScreen} />
          <Stack.Screen name="MatchDetail" component={MatchDetailScreen} />
          <Stack.Screen name="Debug" component={DebugScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
