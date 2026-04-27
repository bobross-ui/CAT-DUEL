import type { ComponentProps } from 'react';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import DesktopScreen from './MatchmakingScreen.desktop';
import MobileScreen from './MatchmakingScreen.mobile';

export default function MatchmakingScreen(props: ComponentProps<typeof MobileScreen>) {
  const isDesktop = useDesktopLayout();
  const Screen = isDesktop ? DesktopScreen : MobileScreen;

  return <Screen {...props} />;
}
