import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';

interface SkeletonBlockProps {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonBlock({ height, width = '100%', radius = radii.md, style }: SkeletonBlockProps) {
  const { theme } = useTheme();
  const { reduceMotionEnabled } = useAppPreferences();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (reduceMotionEnabled) {
      opacity.setValue(0.65);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotionEnabled]);

  return (
    <Animated.View
      style={[
        styles.block,
        { height, width, borderRadius: radius, backgroundColor: theme.line },
        { opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
  },
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 16,
  },
});
