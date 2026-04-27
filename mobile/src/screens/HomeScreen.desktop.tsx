import type { ComponentProps } from 'react';
import DesktopFrame from '../components/web/DesktopFrame';
import MobileHomeScreen from './HomeScreen.mobile';

export default function HomeScreenDesktop(props: ComponentProps<typeof MobileHomeScreen>) {
  return (
    <DesktopFrame activeRoute="Home">
      <MobileHomeScreen {...props} />
    </DesktopFrame>
  );
}
