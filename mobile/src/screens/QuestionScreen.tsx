import type { ComponentProps } from 'react';
import { useDesktopLayout } from '../hooks/useDesktopLayout';
import DesktopScreen from './QuestionScreen.desktop';
import MobileScreen from './QuestionScreen.mobile';

export default function QuestionScreen(props: ComponentProps<typeof MobileScreen>) {
  const isDesktop = useDesktopLayout();
  const Screen = isDesktop ? DesktopScreen : MobileScreen;

  return <Screen {...props} />;
}
