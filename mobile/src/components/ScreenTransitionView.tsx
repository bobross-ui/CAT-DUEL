import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { useAppPreferences } from '../context/AppPreferencesContext';

interface ScreenTransitionViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function ScreenTransitionView({
  children,
  style,
}: ScreenTransitionViewProps) {
  const { reduceMotionEnabled } = useAppPreferences();
  const opacity = useRef(new Animated.Value(reduceMotionEnabled ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(reduceMotionEnabled ? 1 : 0.99)).current;

  useEffect(() => {
    if (reduceMotionEnabled) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }

    opacity.setValue(0);
    scale.setValue(0.99);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, reduceMotionEnabled, scale]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}
