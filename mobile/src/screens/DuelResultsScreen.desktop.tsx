import type { ComponentProps } from 'react';
import DesktopFrame from '../components/web/DesktopFrame';
import MobileDuelResultsScreen from './DuelResultsScreen.mobile';

export default function DuelResultsScreenDesktop(props: ComponentProps<typeof MobileDuelResultsScreen>) {
  return (
    <DesktopFrame activeRoute="DuelResults">
      <MobileDuelResultsScreen {...props} />
    </DesktopFrame>
  );
}
