import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackScreenProps, createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import api from '../services/api';
import Button from '../components/Button';
import AppText from '../components/Text';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
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

export type ActiveGamePayload = {
  gameId: string;
  opponent: OpponentInfo;
  initialState: InitialGameState;
};

export type MainTabParamList = {
  Home: undefined;
  Play: undefined;
  Ranks: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  PostOnboardingRedirect: { target: 'home' | 'practice' | 'match' };
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Matchmaking: { notice?: string } | undefined;
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

type CompletionTarget = 'home' | 'practice' | 'match';

interface AuthProfile {
  onboardingCompletedAt: string | null;
}

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

function PostOnboardingRedirect({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PostOnboardingRedirect'>) {
  useEffect(() => {
    const routes: Parameters<typeof navigation.reset>[0]['routes'] = [{ name: 'MainTabs' }];

    if (route.params.target === 'practice') {
      routes.push({ name: 'PracticeHome' });
    } else if (route.params.target === 'match') {
      routes.push({ name: 'Matchmaking' });
    }

    navigation.reset({ index: routes.length - 1, routes });
  }, [navigation, route.params.target]);

  return null;
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [postOnboardingTarget, setPostOnboardingTarget] = useState<CompletionTarget | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setProfileError(false);
      setPostOnboardingTarget(null);
      return;
    }

    setProfileLoading(true);
    setProfileError(false);
    try {
      const res = await api.get('/auth/me');
      setProfile(res.data.data);
    } catch {
      setProfile(null);
      setProfileError(true);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const handleOnboardingCompleted = useCallback((target: CompletionTarget, completedAt: string) => {
    setPostOnboardingTarget(target);
    setProfile((current) => ({
      ...(current ?? {}),
      onboardingCompletedAt: completedAt,
    }));
  }, []);

  if (loading || (user && profileLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.ink3} />
      </View>
    );
  }

  if (user && profileError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.bg }}>
        <AppText.Serif preset="h1Serif" color={theme.ink} style={{ marginBottom: 8, textAlign: 'center' }}>
          Couldn't load.
        </AppText.Serif>
        <AppText.Sans preset="body" color={theme.ink2} style={{ marginBottom: 20, textAlign: 'center' }}>
          Check your connection and try again.
        </AppText.Sans>
        <Button label="Retry" onPress={fetchProfile} />
      </View>
    );
  }

  const hasCompletedOnboarding = Boolean(profile?.onboardingCompletedAt);
  const initialRouteName = !user
    ? 'Login'
    : hasCompletedOnboarding
      ? (postOnboardingTarget ? 'PostOnboardingRedirect' : 'MainTabs')
      : 'Onboarding';

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRouteName}
    >
      {user && hasCompletedOnboarding ? (
        <>
          <Stack.Screen
            name="PostOnboardingRedirect"
            component={PostOnboardingRedirect}
            initialParams={{ target: postOnboardingTarget ?? 'home' }}
          />
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
      ) : user ? (
        <Stack.Screen name="Onboarding">
          {(props) => (
            <OnboardingScreen
              {...props}
              onCompleted={handleOnboardingCompleted}
            />
          )}
        </Stack.Screen>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
