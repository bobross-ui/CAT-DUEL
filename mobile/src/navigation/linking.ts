import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from '.';

const DEFAULT_APP_URL = 'https://catduel.app';

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

export const APP_WEB_URL = trimTrailingSlash(
  process.env.EXPO_PUBLIC_APP_URL || DEFAULT_APP_URL,
);

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [APP_WEB_URL, Linking.createURL('/')],
  config: {
    screens: {
      DeepLinkedProfile: 'profile/:userId',
      DeepLinkedMatch: 'match/:matchId',
      DeepLinkedLeaderboard: {
        path: 'leaderboard/:tier?',
        parse: {
          tier: (tier: string) => tier.toUpperCase(),
        },
      },
    },
  },
};

export type ParsedAppLink =
  | { kind: 'profile'; userId: string; path: string }
  | { kind: 'match'; matchId: string; path: string }
  | { kind: 'leaderboard'; tier?: string; path: string };

function stripExpoWebPrefix(pathname: string) {
  return pathname.replace(/^\/--(?=\/|$)/, '');
}

export function parseAppLink(url: string): ParsedAppLink | null {
  try {
    const parsed = new URL(url);
    const path = stripExpoWebPrefix(parsed.pathname);
    const pathSegments = path.split('/').filter(Boolean).map(decodeURIComponent);
    const segments = parsed.protocol === 'catduel:' && parsed.hostname
      ? [decodeURIComponent(parsed.hostname), ...pathSegments]
      : pathSegments;

    if (segments[0] === 'profile' && segments[1]) {
      return { kind: 'profile', userId: segments[1], path: `/profile/${segments[1]}` };
    }

    if (segments[0] === 'match' && segments[1]) {
      return { kind: 'match', matchId: segments[1], path: `/match/${segments[1]}` };
    }

    if (segments[0] === 'leaderboard') {
      const tier = segments[1]?.toUpperCase();
      return {
        kind: 'leaderboard',
        tier,
        path: tier ? `/leaderboard/${tier.toLowerCase()}` : '/leaderboard',
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function profileUrl(userId: string) {
  return `${APP_WEB_URL}/profile/${encodeURIComponent(userId)}`;
}

export function matchUrl(matchId: string) {
  return `${APP_WEB_URL}/match/${encodeURIComponent(matchId)}`;
}

export function leaderboardUrl(tier?: string) {
  return tier
    ? `${APP_WEB_URL}/leaderboard/${encodeURIComponent(tier.toLowerCase())}`
    : `${APP_WEB_URL}/leaderboard`;
}
