import { useDesktopLayout } from '../hooks/useDesktopLayout';
import DesktopScreen from './LoginScreen.desktop';
import MobileScreen from './LoginScreen.mobile';

export default function LoginScreen() {
  const isDesktop = useDesktopLayout();
  const Screen = isDesktop ? DesktopScreen : MobileScreen;

  return <Screen />;
}
