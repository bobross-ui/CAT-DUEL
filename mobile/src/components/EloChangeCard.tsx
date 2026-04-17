import { useRef, useEffect, useState } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import TierBadge from './TierBadge';
import Text from './Text';
import { useTheme } from '../theme/ThemeProvider';
import { ELO_TIERS } from '../constants';
import { radii } from '../theme/tokens';

interface Props {
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  tierChanged: boolean;
  newTier: string;
}

export default function EloChangeCard({ eloBefore, eloAfter, eloDelta, tierChanged, newTier }: Props) {
  const { theme } = useTheme();
  const animatedValue = useRef(new Animated.Value(eloBefore)).current;
  const [displayElo, setDisplayElo] = useState(eloBefore);

  const tierObj = ELO_TIERS.find(t => eloBefore >= t.min && eloBefore <= t.max) ?? ELO_TIERS[0];
  const tierBefore = tierObj.name.toUpperCase();
  const deltaColor = eloDelta > 0 ? theme.accent : eloDelta < 0 ? theme.coral : theme.ink3;
  const deltaSign = eloDelta > 0 ? '+' : '';

  useEffect(() => {
    const listener = animatedValue.addListener(({ value }) => setDisplayElo(Math.round(value)));
    const timer = setTimeout(() => {
      Animated.timing(animatedValue, {
        toValue: eloAfter,
        duration: 1500,
        useNativeDriver: false,
      }).start();
    }, 500);
    return () => {
      clearTimeout(timer);
      animatedValue.removeListener(listener);
    };
  }, []);

  return (
    <View style={[styles.card, { borderColor: theme.line }]}>
      <View style={styles.eloRow}>
        <Text.Serif preset="scoreLg" color={theme.ink3}>{eloBefore}</Text.Serif>
        <Text.Sans preset="body" color={theme.ink3}>→</Text.Sans>
        <Text.Serif preset="scoreLg" color={theme.ink}>{displayElo}</Text.Serif>
        <View style={[styles.deltaPill, { backgroundColor: deltaColor }]}>
          <Text.Mono preset="chipLabel" color="#FFFFFF" style={{ fontSize: 14 }}>
            {deltaSign}{eloDelta}
          </Text.Mono>
        </View>
      </View>

      <View style={styles.tierRow}>
        {tierChanged ? (
          <>
            <TierBadge tier={tierBefore} />
            <Text.Mono preset="chipLabel" color={eloDelta > 0 ? theme.accent : theme.coral}>
              {eloDelta > 0 ? '▲ PROMOTED!' : '▼ Demoted'}
            </Text.Mono>
            <TierBadge tier={newTier} highlighted />
          </>
        ) : (
          <TierBadge tier={newTier} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    gap: 14,
  },
  eloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deltaPill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
