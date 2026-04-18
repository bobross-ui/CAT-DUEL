import { useRef } from 'react';
import { Animated, Pressable, ActivityIndicator, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';
import { radii } from '../theme/tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'dark' | 'coral';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
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

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[styles.base, { backgroundColor: bgColor }, borderStyle, style]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
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
