import { useRef } from 'react';
import { Animated, Pressable, ActivityIndicator, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';
import { radii } from '../theme/tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'dark' | 'coral';
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { theme } = useTheme();
  const { reduceMotionEnabled } = useAppPreferences();
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const onPressIn = () => {
    if (reduceMotionEnabled) return;
    Animated.timing(scale, { toValue: 0.98, duration: 80, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    if (reduceMotionEnabled) return;
    Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }).start();
  };

  const bgColor = (() => {
    if (isDisabled) return theme.ink4;
    switch (variant) {
      case 'primary': return theme.accent;
      case 'dark':    return theme.ink;
      case 'coral':   return theme.coral;
      case 'ghost': return 'transparent';
    }
  })();

  const textColor = (() => {
    if (isDisabled) return theme.ink3;
    switch (variant) {
      case 'primary': return '#FFFFFF';
      case 'dark':    return theme.bg;
      case 'coral':   return '#FFFFFF';
      case 'ghost': return theme.ink2;
    }
  })();

  const borderStyle = variant === 'ghost'
    ? { borderWidth: 1, borderColor: theme.line }
    : undefined;
  const { containerStyle, pressableStyle } = splitButtonStyle(style);

  return (
    <Animated.View style={[containerStyle, { transform: [{ scale }] }]}>
      <Pressable
        style={[styles.base, { backgroundColor: bgColor }, borderStyle, pressableStyle]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <Text.Sans preset="bodyMed" color={textColor}>{label}</Text.Sans>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function splitButtonStyle(style: StyleProp<ViewStyle>) {
  const flattened = StyleSheet.flatten(style);

  if (!flattened) {
    return { containerStyle: undefined, pressableStyle: undefined };
  }

  const containerStyle: ViewStyle = {};
  const pressableStyle: ViewStyle = { ...flattened };
  const container = containerStyle as Record<string, unknown>;
  const pressable = pressableStyle as Record<string, unknown>;

  containerStyleKeys.forEach((key) => {
    container[key] = flattened[key];
    delete pressable[key];
  });

  return { containerStyle, pressableStyle };
}

const containerStyleKeys = [
  'alignSelf',
  'flex',
  'flexBasis',
  'flexGrow',
  'flexShrink',
  'height',
  'margin',
  'marginBottom',
  'marginEnd',
  'marginHorizontal',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginTop',
  'marginVertical',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'width',
] as const;
