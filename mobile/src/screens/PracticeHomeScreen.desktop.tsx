import type { ComponentProps } from 'react';
import DesktopFrame from '../components/web/DesktopFrame';
import MobilePracticeHomeScreen from './PracticeHomeScreen.mobile';

export default function PracticeHomeScreenDesktop(props: ComponentProps<typeof MobilePracticeHomeScreen>) {
  return (
    <DesktopFrame activeRoute="PracticeHome">
      <MobilePracticeHomeScreen {...props} />
    </DesktopFrame>
  );
}
