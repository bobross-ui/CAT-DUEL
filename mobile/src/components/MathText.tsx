import { Text as RNText, StyleSheet, TextStyle, type TextProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { type as typePresets } from '../theme/tokens';

type MathTextPreset = 'question' | 'body' | 'mono';

interface MathTextProps extends TextProps {
  children: string | null | undefined;
  color?: string;
  preset?: MathTextPreset;
  style?: TextStyle | TextStyle[];
}

type Segment = {
  text: string;
  math: boolean;
};

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

function normalizeMath(value: string): string {
  return value
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)')
    .replace(/\\left|\\right/g, '')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\equiv/g, '≡')
    .replace(/\\Rightarrow|\\implies/g, '⇒')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\infty/g, '∞')
    .replace(/\\in/g, '∈')
    .replace(/\\ne/g, '≠')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\,/g, ' ')
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlain(value: string): string {
  return value
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\times/g, '×')
    .replace(/\\Rightarrow|\\implies/g, '⇒')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)')
    .replace(/\s+/g, ' ');
}

function getSegments(value: string): Segment[] {
  const segments: Segment[] = [];
  const parts = value.split('$');

  parts.forEach((part, index) => {
    if (!part) return;
    const math = index % 2 === 1;
    segments.push({
      text: math ? normalizeMath(part) : normalizePlain(part),
      math,
    });
  });

  return segments.length > 0 ? segments : [{ text: normalizePlain(value), math: false }];
}

export function formatMathText(value: string | null | undefined): string {
  return getSegments(value ?? '').map((segment) => segment.text).join('');
}

export default function MathText({
  children,
  color,
  preset = 'question',
  style,
  ...rest
}: MathTextProps) {
  const { theme } = useTheme();
  const segments = getSegments(children ?? '');

  return (
    <RNText style={[presetStyle(preset), { color: color ?? theme.ink }, style]} {...rest}>
      {segments.map((segment, index) => (
        <RNText
          key={`${segment.text}-${index}`}
          style={segment.math ? [styles.math, { color: color ?? theme.ink }] : undefined}
        >
          {segment.text}
        </RNText>
      ))}
    </RNText>
  );
}

const styles = StyleSheet.create({
  math: {
    fontFamily: typePresets.mono.family,
  },
});
