import { useRef, useEffect, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import TierBadge from './TierBadge';
import { getTier } from '../constants';

interface Props {
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  tierChanged: boolean;
  newTier: string;
}

export default function EloChangeCard({ eloBefore, eloAfter, eloDelta, tierChanged, newTier }: Props) {
  const animatedValue = useRef(new Animated.Value(eloBefore)).current;
  const [displayElo, setDisplayElo] = useState(eloBefore);

  const tierBefore = getTier(eloBefore).name.toUpperCase();
  const deltaColor = eloDelta > 0 ? '#16a34a' : eloDelta < 0 ? '#dc2626' : '#9ca3af';
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
    <View style={styles.card}>
      <View style={styles.eloRow}>
        <Text style={styles.eloBefore}>{eloBefore}</Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={styles.eloAfter}>{displayElo}</Text>
        <View style={[styles.deltaPill, { backgroundColor: deltaColor }]}>
          <Text style={styles.deltaText}>{deltaSign}{eloDelta}</Text>
        </View>
      </View>

      <View style={styles.tierRow}>
        {tierChanged ? (
          <>
            <TierBadge tier={tierBefore} />
            <Text style={[styles.promotionText, { color: eloDelta > 0 ? '#16a34a' : '#dc2626' }]}>
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
    borderColor: '#e5e5e5',
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
    color: '#9ca3af',
  },
  arrow: {
    fontSize: 18,
    color: '#9ca3af',
  },
  eloAfter: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a1a',
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
