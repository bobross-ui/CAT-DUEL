import type { ComponentProps } from 'react';
import DesktopFrame from '../components/web/DesktopFrame';
import MobileQuestionScreen from './QuestionScreen.mobile';

export default function QuestionScreenDesktop(props: ComponentProps<typeof MobileQuestionScreen>) {
  return (
    <DesktopFrame activeRoute="Question">
      <MobileQuestionScreen {...props} />
    </DesktopFrame>
  );
}
