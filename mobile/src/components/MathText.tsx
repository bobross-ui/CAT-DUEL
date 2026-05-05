import React, { useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text as RNText,
  TextStyle,
  View,
  type TextProps,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import katex from 'katex';
import { useTheme } from '../theme/ThemeProvider';
import { type as typePresets } from '../theme/tokens';

type MathTextPreset = 'question' | 'body' | 'mono';

interface MathTextProps extends TextProps {
  children: string | null | undefined;
  color?: string;
  preset?: MathTextPreset;
  style?: TextStyle | TextStyle[];
}

const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.45/dist/katex.min.css';
const MATH_SEGMENT_PATTERN = /(?<!\\)\$([^$]+)(?<!\\)\$/g;
const HAS_MATH_SEGMENT_PATTERN = /(?<!\\)\$[^$]+(?<!\\)\$/;

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

function hasMath(value: string): boolean {
  return HAS_MATH_SEGMENT_PATTERN.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br/>');
}

function renderMathSegment(value: string): string {
  const originalWarn = console.warn;
  try {
    console.warn = () => undefined;
    return katex.renderToString(value, {
      displayMode: false,
      throwOnError: false,
      strict: false,
    });
  } finally {
    console.warn = originalWarn;
  }
}

function renderMixedHtml(value: string): string {
  let html = '';
  let lastIndex = 0;

  for (const match of value.matchAll(MATH_SEGMENT_PATTERN)) {
    html += escapeHtml(value.slice(lastIndex, match.index));
    html += renderMathSegment(match[1]);
    lastIndex = (match.index ?? 0) + match[0].length;
  }

  html += escapeHtml(value.slice(lastIndex));
  return html;
}

function ensureKatexStyles() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('cat-duel-katex-css')) return;

  const link = document.createElement('link');
  link.id = 'cat-duel-katex-css';
  link.rel = 'stylesheet';
  link.href = KATEX_CSS_URL;
  document.head.appendChild(link);
}

function buildHtmlDocument(content: string, style: TextStyle): string {
  const fontFamily = typeof style.fontFamily === 'string' ? style.fontFamily : 'system-ui, sans-serif';
  const fontSize = typeof style.fontSize === 'number' ? `${style.fontSize}px` : '16px';
  const lineHeight = typeof style.lineHeight === 'number' ? `${style.lineHeight}px` : '1.4';
  const color = typeof style.color === 'string' ? style.color : '#FFFFFF';

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="${KATEX_CSS_URL}" />
    <style>
      html, body {
        background: transparent;
        margin: 0;
        padding: 0;
        overflow: hidden;
      }
      body, #content {
        color: ${color};
        font-family: ${fontFamily};
        font-size: ${fontSize};
        line-height: ${lineHeight};
      }
      .katex {
        color: ${color};
        font-size: 1em;
      }
    </style>
  </head>
  <body>
    <div id="content">${content}</div>
    <script>
      function postHeight() {
        window.ReactNativeWebView.postMessage(String(document.documentElement.scrollHeight));
      }
      window.addEventListener('load', postHeight);
      setTimeout(postHeight, 50);
      setTimeout(postHeight, 250);
    </script>
  </body>
</html>`;
}

export default function MathText({
  children,
  color,
  preset = 'question',
  style,
  ...rest
}: MathTextProps) {
  const { theme } = useTheme();
  const value = children ?? '';
  const flattenedStyle = StyleSheet.flatten([
    presetStyle(preset),
    { color: color ?? theme.ink },
    style,
  ]) as TextStyle;
  const [height, setHeight] = useState(() => flattenedStyle.lineHeight ?? flattenedStyle.fontSize ?? 24);
  const mathHtml = useMemo(() => renderMixedHtml(value), [value]);

  if (!hasMath(value)) {
    return (
      <RNText style={flattenedStyle} {...rest}>
        {value}
      </RNText>
    );
  }

  if (Platform.OS === 'web') {
    ensureKatexStyles();
    return (
      <RNText style={flattenedStyle} {...rest}>
        {React.createElement('span', {
          dangerouslySetInnerHTML: { __html: mathHtml },
        })}
      </RNText>
    );
  }

  const onMessage = (event: WebViewMessageEvent) => {
    const nextHeight = Number(event.nativeEvent.data);
    if (Number.isFinite(nextHeight) && nextHeight > 0) {
      setHeight(Math.ceil(nextHeight));
    }
  };

  return (
    <View pointerEvents="none" style={[style, { minHeight: height, height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: buildHtmlDocument(mathHtml, flattenedStyle) }}
        onMessage={onMessage}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  webView: {
    backgroundColor: 'transparent',
    flex: 1,
  },
});
