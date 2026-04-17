import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Text from './Text';

const SIZE_MAP = { sm: 28, md: 40, lg: 64, xl: 88 };
const FONT_MAP = { sm: 12, md: 16, lg: 28, xl: 38 };

const GRADIENTS = {
  you:      ['#3F7D5C', '#2E5D44'] as const,
  opponent: ['#A06040', '#7A4830'] as const,
};

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'you' | 'opponent';
}

export default function Avatar({ name, size = 'md', variant = 'you' }: AvatarProps) {
  const dim = SIZE_MAP[size];
  const fontSize = FONT_MAP[size];
  const initial = (name || '?').charAt(0).toUpperCase();
  const colors = GRADIENTS[variant];

  return (
    <View style={[styles.wrapper, { width: dim, height: dim, borderRadius: dim / 2 }]}>
      <LinearGradient
        colors={[...colors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { borderRadius: dim / 2 }]}
      >
        <View style={[styles.shine, { borderRadius: dim / 2 }]} />
        <Text.Serif
          preset="h1Serif"
          color="#FFFFFF"
          style={{ fontSize, lineHeight: fontSize + 4 }}
        >
          {initial}
        </Text.Serif>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shine: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.12)',
    height: '50%',
  },
});
