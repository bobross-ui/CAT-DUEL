import { View, StyleSheet } from 'react-native';
import Text from './Text';
import { tierColors, radii } from '../theme/tokens';

interface Props {
  tier: string;
  small?: boolean;
  highlighted?: boolean;
}

export default function TierBadge({ tier, small = false, highlighted = false }: Props) {
  const key = tier.toUpperCase() as keyof typeof tierColors;
  const color = tierColors[key] ?? tierColors.BRONZE;

  return (
    <View style={[
      styles.badge,
      { backgroundColor: color + '22', borderColor: color },
      small && styles.small,
      highlighted && { borderWidth: 2 },
    ]}>
      <Text.Mono
        preset="chipLabel"
        color={color}
        style={[!small && styles.text, small && styles.smallText]}
      >
        {tier.toUpperCase()}
      </Text.Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  small: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
  },
  smallText: {
    fontSize: 10,
  },
});
