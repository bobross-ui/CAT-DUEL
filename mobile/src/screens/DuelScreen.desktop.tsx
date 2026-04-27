import type { ComponentProps } from 'react';
import DesktopFrame from '../components/web/DesktopFrame';
import MobileDuelScreen from './DuelScreen.mobile';

export default function DuelScreenDesktop(props: ComponentProps<typeof MobileDuelScreen>) {
  return (
    <DesktopFrame activeRoute="Duel">
      <MobileDuelScreen {...props} />
    </DesktopFrame>
  );
}
