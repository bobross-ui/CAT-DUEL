import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import type {
  NavigationContainerRefWithCurrent,
  NavigatorScreenParams,
} from '@react-navigation/native';
import {
  NativeStackScreenProps,
  createNativeStackNavigator,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
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
import SettingsScreen from '../screens/SettingsScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import TabBar from '../components/TabBar';
import { identify, reset as resetAnalytics, track } from '../services/analytics';
import { clearCurrentProfileCache, fetchCurrentProfile } from '../hooks/useCurrentProfile';
import { parseAppLink } from './linking';

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

type AnswerDetail = {
  id: string;
  userId: string;
  questionId: string;
  selectedAnswer: number;
  isCorrect: boolean;
  timeTakenMs: number;
  question: {
    id: string;
    category: string;
    subTopic: string | null;
    text: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  };
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
  answers: AnswerDetail[];
};

export type ActiveGamePayload = {
  gameId: string;
  opponent: OpponentInfo;
  initialState: InitialGameState;
};

export type MainTabParamList = {
  Home: undefined;
  Play: undefined;
  Ranks: { tier?: string } | undefined;
  Me: undefined;
};

export type CompletionTarget = 'home' | 'practice' | 'match';

export type DeepLinkTarget =
  | { kind: 'profile'; userId: string; path: string }
  | { kind: 'match'; matchId: string; path: string }
  | { kind: 'leaderboard'; tier?: string; path: string };

type RedirectTarget = CompletionTarget | DeepLinkTarget;

export type RootStackParamList = {
  Login: undefined;
  Onboarding: undefined;
  DeepLinkedProfile: { userId: string };
  DeepLinkedMatch: { matchId: string };
  DeepLinkedLeaderboard: { tier?: string };
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Matchmaking: { notice?: string } | undefined;
  Found: { gameId: string; opponent: OpponentInfo; ratingImpact: { win: number; loss: number; draw?: number } | null };
  Duel: { gameId: string; opponent: OpponentInfo; initialState: InitialGameState };
  DuelResults: { results: GameFinishedPayload; userId: string; opponent: OpponentInfo };
  PracticeHome: undefined;
  Question: { categories: string[]; difficulty?: number };
  PracticeSummary: {
    total: number;
    correct: number;
    totalTimeMs: number;
    questions?: { category: string; subTopic: string | null; isCorrect: boolean }[];
  };
  MatchHistory: undefined;
  MatchDetail: { matchId: string; opponentName?: string | null };
  PublicProfile: { userId: string };
  Debug: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

interface AuthProfile {
  id?: string;
  rankTier?: string;
  gamesPlayed?: number;
  currentStreak?: number;
  longestStreak?: number;
  onboardingCompletedAt: string | null;
}

function analyticsRouteForTarget(target: DeepLinkTarget) {
  if (target.kind === 'leaderboard') return target.tier ? 'leaderboard_tier' : 'leaderboard';
  return target.kind;
}

function resetToTarget(
  navigation: NavigationContainerRefWithCurrent<RootStackParamList>,
  target: RedirectTarget,
) {
  if (typeof target === 'string') {
    if (target === 'practice') {
      navigation.resetRoot({
        index: 1,
        routes: [{ name: 'MainTabs' }, { name: 'PracticeHome' }],
      });
      return;
    }

    if (target === 'match') {
      navigation.resetRoot({
        index: 1,
        routes: [{ name: 'MainTabs' }, { name: 'Matchmaking' }],
      });
      return;
    }

    navigation.resetRoot({ index: 0, routes: [{ name: 'MainTabs' }] });
    return;
  }

  if (target.kind === 'leaderboard') {
    navigation.resetRoot({
      index: 0,
      routes: [{
        name: 'MainTabs',
        params: { screen: 'Ranks', params: target.tier ? { tier: target.tier } : undefined },
      }],
    });
    return;
  }

  const nextRoute = target.kind === 'profile'
    ? { name: 'PublicProfile' as const, params: { userId: target.userId } }
    : { name: 'MatchDetail' as const, params: { matchId: target.matchId } };

  navigation.resetRoot({
    index: 1,
    routes: [{ name: 'MainTabs' }, nextRoute],
  });
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

export default function RootNavigator({
  navigationRef,
  navigationReady,
}: {
  navigationRef: NavigationContainerRefWithCurrent<RootStackParamList>;
  navigationReady: boolean;
}) {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [postOnboardingTarget, setPostOnboardingTarget] = useState<RedirectTarget | null>(null);
  const previousStreakRef = useRef<number | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setProfileError(false);
      previousStreakRef.current = null;
      return;
    }

    setProfileLoading(true);
    setProfileError(false);
    try {
      const nextProfile = await fetchCurrentProfile() as AuthProfile;
      setProfile(nextProfile);
      if (nextProfile.id) {
        identify(nextProfile.id, {
          tier: nextProfile.rankTier,
          gamesPlayed: nextProfile.gamesPlayed,
          currentStreak: nextProfile.currentStreak,
        });
      }

      if (typeof nextProfile.currentStreak === 'number') {
        const previousStreak = previousStreakRef.current;
        if (previousStreak !== null && previousStreak !== nextProfile.currentStreak) {
          track('streak_changed', {
            currentStreak: nextProfile.currentStreak,
            longestStreak: nextProfile.longestStreak,
            broken: nextProfile.currentStreak < previousStreak,
          });
        }
        previousStreakRef.current = nextProfile.currentStreak;
      }
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

  useEffect(() => {
    if (!user) {
      clearCurrentProfileCache();
      resetAnalytics();
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;

    Linking.getInitialURL().then((url) => {
      if (!mounted || !url) return;
      const target = parseAppLink(url);
      if (target) {
        track('deeplink_opened', { route: analyticsRouteForTarget(target) });
        setPostOnboardingTarget((current) => current ?? target);
      }
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const target = parseAppLink(url);
      if (target) {
        setPostOnboardingTarget(target);
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const handleOnboardingCompleted = useCallback((target: CompletionTarget, completedAt: string) => {
    track('onboarding_completed', { destination: target });
    setPostOnboardingTarget((current) => current ?? target);
    setProfile((current) => ({
      ...(current ?? {}),
      onboardingCompletedAt: completedAt,
    }));
  }, []);

  const hasCompletedOnboarding = Boolean(profile?.onboardingCompletedAt);

  const handleDeepLink = useCallback((
    target: DeepLinkTarget,
  ) => {
    track('deeplink_opened', { route: analyticsRouteForTarget(target) });
    setPostOnboardingTarget(target);

    if (!user || !hasCompletedOnboarding) {
      navigationRef.resetRoot({ index: 0, routes: [{ name: user ? 'Onboarding' : 'Login' }] });
    }
  }, [hasCompletedOnboarding, navigationRef, user]);

  useEffect(() => {
    if (!navigationReady || !user || !hasCompletedOnboarding || !postOnboardingTarget) return;

    const target = postOnboardingTarget;
    setPostOnboardingTarget(null);
    resetToTarget(navigationRef, target);
  }, [
    hasCompletedOnboarding,
    navigationReady,
    navigationRef,
    postOnboardingTarget,
    user,
  ]);

  function DeepLinkedProfileRedirect({
    route,
  }: NativeStackScreenProps<RootStackParamList, 'DeepLinkedProfile'>) {
    useEffect(() => {
      handleDeepLink({
        kind: 'profile',
        userId: route.params.userId,
        path: `/profile/${route.params.userId}`,
      });
    }, [handleDeepLink, route.params.userId]);

    return null;
  }

  function DeepLinkedMatchRedirect({
    route,
  }: NativeStackScreenProps<RootStackParamList, 'DeepLinkedMatch'>) {
    useEffect(() => {
      handleDeepLink({
        kind: 'match',
        matchId: route.params.matchId,
        path: `/match/${route.params.matchId}`,
      });
    }, [handleDeepLink, route.params.matchId]);

    return null;
  }

  function DeepLinkedLeaderboardRedirect({
    route,
  }: NativeStackScreenProps<RootStackParamList, 'DeepLinkedLeaderboard'>) {
    const tier = route.params?.tier?.toUpperCase();

    useEffect(() => {
      handleDeepLink({
        kind: 'leaderboard',
        tier,
        path: tier ? `/leaderboard/${tier.toLowerCase()}` : '/leaderboard',
      });
    }, [handleDeepLink, tier]);

    return null;
  }

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

  const initialRouteName = !user
    ? 'Login'
    : hasCompletedOnboarding
      ? 'MainTabs'
      : 'Onboarding';

  return (
    <Stack.Navigator
      key={`${user ? 'user' : 'guest'}-${hasCompletedOnboarding ? 'ready' : 'onboarding'}`}
      screenOptions={{ headerShown: false }}
      initialRouteName={initialRouteName}
    >
      <Stack.Screen name="DeepLinkedProfile" component={DeepLinkedProfileRedirect} />
      <Stack.Screen name="DeepLinkedMatch" component={DeepLinkedMatchRedirect} />
      <Stack.Screen name="DeepLinkedLeaderboard" component={DeepLinkedLeaderboardRedirect} />
      {user && hasCompletedOnboarding ? (
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
          <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
          <Stack.Screen name="Debug" component={DebugScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
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
