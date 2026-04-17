import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface Props {
  tier: string;
  small?: boolean;
  highlighted?: boolean;
}

export default function TierBadge({ tier, small = false, highlighted = false }: Props) {
  const { theme } = useTheme();
  const tierKey = tier.toLowerCase() as keyof typeof theme;
  const color = (theme[tierKey] as string) ?? theme.textMuted;

  return (
    <View style={[
      styles.badge,
      { backgroundColor: color + '22', borderColor: color },
      small && styles.small,
      highlighted && { borderWidth: 2 },
    ]}>
      <Text style={[styles.text, { color }, small && styles.smallText]}>
        {tier}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  small: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  smallText: {
    fontSize: 10,
  },
});
