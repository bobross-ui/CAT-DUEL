import { useRef, useEffect, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import TierBadge from './TierBadge';
import { useTheme } from '../theme/ThemeProvider';
import { ELO_TIERS } from '../constants';

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
  const deltaColor = eloDelta > 0 ? theme.success : eloDelta < 0 ? theme.danger : theme.textMuted;
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
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.eloRow}>
        <Text style={[styles.eloBefore, { color: theme.textMuted }]}>{eloBefore}</Text>
        <Text style={[styles.arrow, { color: theme.textMuted }]}>→</Text>
        <Text style={[styles.eloAfter, { color: theme.text }]}>{displayElo}</Text>
        <View style={[styles.deltaPill, { backgroundColor: deltaColor }]}>
          <Text style={styles.deltaText}>{deltaSign}{eloDelta}</Text>
        </View>
      </View>

      <View style={styles.tierRow}>
        {tierChanged ? (
          <>
            <TierBadge tier={tierBefore} />
            <Text style={[styles.promotionText, { color: eloDelta > 0 ? theme.success : theme.danger }]}>
              {eloDelta > 0 ? '▲ PROMOTED!' : '▼ Demoted'}
            </Text>
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
    borderWidth: 1.5,
    borderRadius: 16,
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
  eloBefore: {
    fontSize: 22,
    fontWeight: '700',
  },
  arrow: {
    fontSize: 18,
  },
  eloAfter: {
    fontSize: 28,
    fontWeight: '800',
  },
  deltaPill: {
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  deltaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  promotionText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
