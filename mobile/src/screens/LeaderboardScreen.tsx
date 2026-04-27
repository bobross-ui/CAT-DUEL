import type { ComponentProps } from 'react';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import DesktopScreen from './LeaderboardScreen.desktop';
import MobileScreen from './LeaderboardScreen.mobile';

export default function LeaderboardScreen(props: ComponentProps<typeof MobileScreen>) {
  const isDesktop = useDesktopLayout();
  const Screen = isDesktop ? DesktopScreen : MobileScreen;

  return <Screen {...props} />;
}
