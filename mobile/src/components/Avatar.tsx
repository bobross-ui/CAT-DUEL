import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const SIZE_MAP = { sm: 36, md: 48, lg: 64 };
const FONT_MAP = { sm: 16, md: 20, lg: 28 };

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Avatar({ name, size = 'md' }: AvatarProps) {
  const { theme } = useTheme();
  const dim = SIZE_MAP[size];
  const fontSize = FONT_MAP[size];
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <View style={[
      styles.circle,
      { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: theme.primary },
    ]}>
      <Text style={[styles.initial, { fontSize, color: theme.primaryFg }]}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    fontWeight: '700',
  },
});
