import { Text as RNText, TextStyle, type TextProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { type as typePresets } from '../theme/tokens';

type MathTextPreset = 'question' | 'body' | 'mono';

interface MathTextProps extends TextProps {
  children: string | null | undefined;
  color?: string;
  preset?: MathTextPreset;
  style?: TextStyle | TextStyle[];
}

function presetStyle(preset: MathTextPreset): TextStyle {
  if (preset === 'body') {
    return {
      fontFamily: typePresets.body.family,
      fontSize: typePresets.body.size,
      lineHeight: typePresets.body.lineHeight,
    };
  }

  if (preset === 'mono') {
    return {
      fontFamily: typePresets.mono.family,
      fontSize: typePresets.mono.size,
      lineHeight: typePresets.mono.lineHeight,
    };
  }

  return {
    fontFamily: typePresets.questionLg.family,
    fontSize: typePresets.questionLg.size,
    lineHeight: typePresets.questionLg.lineHeight,
  };
}

export default function MathText({
  children,
  color,
  preset = 'question',
  style,
  ...rest
}: MathTextProps) {
  const { theme } = useTheme();

  return (
    <RNText style={[presetStyle(preset), { color: color ?? theme.ink }, style]} {...rest}>
      {children ?? ''}
    </RNText>
  );
}
