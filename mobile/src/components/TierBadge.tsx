import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

const TIER_COLOR_MAP: Record<string, string> = {
  BRONZE: COLORS.bronze,
  SILVER: COLORS.silver,
  GOLD: COLORS.gold,
  PLATINUM: COLORS.platinum,
  DIAMOND: COLORS.diamond,
};

interface Props {
  tier: string;
  small?: boolean;
  highlighted?: boolean;
}

export default function TierBadge({ tier, small = false, highlighted = false }: Props) {
  const color = TIER_COLOR_MAP[tier] ?? COLORS.bronze;
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
