import type { ComponentProps } from 'react';
import DesktopFrame from '../components/web/DesktopFrame';
import MobileProfileScreen from './ProfileScreen.mobile';

export default function ProfileScreenDesktop(props: ComponentProps<typeof MobileProfileScreen>) {
  return (
    <DesktopFrame activeRoute="Me">
      <MobileProfileScreen {...props} />
    </DesktopFrame>
  );
}
