import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { ComponentProps } from 'react';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import { useAuth } from '../context/AuthContext';
import { useGamesDetail, type MatchDetailData } from '../queries/games';
import { getTier } from '../constants';
import type { GameFinishedPayload, OpponentInfo } from '../navigation';
import DesktopScreen from './DuelResultsScreen.desktop';
import MobileScreen from './DuelResultsScreen.mobile';

function mapToResults(
  match: MatchDetailData,
  currentUserId: string,
): { results: GameFinishedPayload; userId: string; opponent: OpponentInfo } {
  const buildPlayer = (
    userId: string, score: number, answered: number,
    eloChange: number, eloAfter: number,
  ) => {
    const eloBefore = eloAfter - eloChange;
    return {
      userId, score, questionsAnswered: answered,
      eloBefore, eloAfter, eloDelta: eloChange,
      newTier: getTier(eloAfter).name,
      tierChanged: getTier(eloBefore).name !== getTier(eloAfter).name,
    };
  };

  const player1 = buildPlayer(
    match.player1Id, match.player1Score, match.player1Answered,
    match.player1EloChange, match.player1EloAfter,
  );
  const player2 = buildPlayer(
    match.player2Id, match.player2Score, match.player2Answered,
    match.player2EloChange, match.player2EloAfter,
  );

  const oppUser = match.player1Id === currentUserId ? match.player2 : match.player1;
  const opponent: OpponentInfo = {
    userId: oppUser.id,
    displayName: oppUser.displayName,
    avatarUrl: oppUser.avatarUrl,
    eloRating: oppUser.eloRating,
  };

  const results: GameFinishedPayload = {
    gameId: match.id,
    winnerId: match.winnerId,
    isDraw: match.isDraw,
    isForfeit: match.status === 'forfeited',
    currentUserId,
    player1, player2,
    totalQuestions: match.totalQuestions,
    durationSeconds: match.durationSeconds,
    answers: match.answers,
  };

  return { results, userId: currentUserId, opponent };
}

export default function DuelResultsScreen(props: ComponentProps<typeof MobileScreen>) {
  const { route, navigation } = props;
  const { gameId, results, userId, opponent } = route.params;
  const isDesktop = useDesktopLayout();
  const { user } = useAuth();

  const needsFetch = !results || !results.player1 || !results.player2;
  const { data: matchDetail, isError } = useGamesDetail(gameId, { enabled: needsFetch });

  useEffect(() => {
    if (needsFetch && isError) {
      navigation.replace('MatchDetail', { matchId: gameId });
    }
  }, [needsFetch, isError, gameId, navigation]);

  if (needsFetch) {
    if (!matchDetail || !user) {
      return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
    }
    const mapped = mapToResults(matchDetail, user.uid);
    const Screen = isDesktop ? DesktopScreen : MobileScreen;
    return (
      <Screen
        {...props}
        route={{ ...props.route, params: { ...props.route.params, ...mapped } }}
      />
    );
  }

  if (!results || !userId || !opponent) return null;

  const Screen = isDesktop ? DesktopScreen : MobileScreen;
  return <Screen {...props} />;
}
