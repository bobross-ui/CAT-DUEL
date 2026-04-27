import type { ComponentProps } from 'react';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import DesktopScreen from './PracticeHomeScreen.desktop';
import MobileScreen from './PracticeHomeScreen.mobile';

export default function PracticeHomeScreen(props: ComponentProps<typeof MobileScreen>) {
  const isDesktop = useDesktopLayout();
  const Screen = isDesktop ? DesktopScreen : MobileScreen;

  return <Screen {...props} />;
}
