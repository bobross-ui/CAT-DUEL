import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { type as typePresets } from '../theme/tokens';

type SerifPreset  = 'display' | 'verdict' | 'heroSerif' | 'h1Serif' | 'questionLg' | 'scoreLg' | 'statVal' | 'italic';
type SansPreset   = 'body' | 'bodyMed' | 'label' | 'small';
type MonoPreset   = 'mono' | 'timer' | 'deltaLg' | 'chipLabel' | 'statusBar' | 'eyebrow';

interface BaseProps extends TextProps {
  color?: string;
}

function presetStyle(preset: keyof typeof typePresets): TextStyle {
  const p = typePresets[preset];
  return {
    fontFamily: p.family,
    fontSize: p.size,
    lineHeight: p.lineHeight,
    ...('letterSpacing' in p ? { letterSpacing: p.letterSpacing } : {}),
  };
}

function Serif({ preset = 'h1Serif', color, style, ...rest }: BaseProps & { preset?: SerifPreset }) {
  const { theme } = useTheme();
  return (
    <RNText style={[presetStyle(preset), { color: color ?? theme.ink }, style]} {...rest} />
  );
}

function Sans({ preset = 'body', color, style, ...rest }: BaseProps & { preset?: SansPreset }) {
  const { theme } = useTheme();
  return (
    <RNText style={[presetStyle(preset), { color: color ?? theme.ink }, style]} {...rest} />
  );
}

function Mono({ preset = 'mono', color, style, ...rest }: BaseProps & { preset?: MonoPreset }) {
  const { theme } = useTheme();
  return (
    <RNText
      style={[
        presetStyle(preset),
        { color: color ?? theme.ink, fontVariant: ['tabular-nums'] },
        style,
      ]}
      {...rest}
    />
  );
}

const Text = { Serif, Sans, Mono };
export default Text;
