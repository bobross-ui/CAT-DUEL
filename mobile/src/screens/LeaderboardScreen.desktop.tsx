import type { ComponentProps } from 'react';
import DesktopFrame from '../components/web/DesktopFrame';
import MobileLeaderboardScreen from './LeaderboardScreen.mobile';

export default function LeaderboardScreenDesktop(props: ComponentProps<typeof MobileLeaderboardScreen>) {
  return (
    <DesktopFrame activeRoute="Ranks">
      <MobileLeaderboardScreen {...props} />
    </DesktopFrame>
  );
}
