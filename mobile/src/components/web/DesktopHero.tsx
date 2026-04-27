import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeProvider';
import { radii } from '../../theme/tokens';

interface DesktopHeroProps {
  children: React.ReactNode;
  variant?: 'default' | 'dark' | 'accent';
  style?: StyleProp<ViewStyle>;
}

export default function DesktopHero({ children, variant = 'default', style }: DesktopHeroProps) {
  const { theme } = useTheme();
  const isDark = variant === 'dark';
  const isAccent = variant === 'accent';

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: isDark ? theme.ink : isAccent ? theme.accentSoft : theme.bg2,
        },
        style,
      ]}
    >
      {isAccent ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(201,138,43,0.24)', 'rgba(63,125,92,0.08)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    borderRadius: radii.xl,
    padding: 32,
  },
});
