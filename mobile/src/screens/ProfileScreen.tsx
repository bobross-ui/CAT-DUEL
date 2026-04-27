import type { ComponentProps } from 'react';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import DesktopScreen from './ProfileScreen.desktop';
import MobileScreen from './ProfileScreen.mobile';

export default function ProfileScreen(props: ComponentProps<typeof MobileScreen>) {
  const isDesktop = useDesktopLayout();
  const Screen = isDesktop ? DesktopScreen : MobileScreen;

  return <Screen {...props} />;
}
