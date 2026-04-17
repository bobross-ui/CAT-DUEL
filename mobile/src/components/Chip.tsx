import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import Text from './Text';
import { radii } from '../theme/tokens';

interface ChipProps {
  label: string;
  variant?: 'default' | 'accent' | 'coral' | 'dark';
  dot?: boolean;
}

export default function Chip({ label, variant = 'default', dot = false }: ChipProps) {
  const { theme } = useTheme();

  const bgColor = (() => {
    switch (variant) {
      case 'accent': return theme.accentSoft;
      case 'coral':  return theme.coralSoft;
      case 'dark':   return theme.ink;
      case 'default': return theme.bg2;
    }
  })();

  const textColor = (() => {
    switch (variant) {
      case 'accent': return theme.accentDeep;
      case 'coral':  return theme.coral;
      case 'dark':   return theme.bg;
      case 'default': return theme.ink2;
    }
  })();

  return (
    <View style={[styles.chip, { backgroundColor: bgColor }]}>
      {dot && <View style={[styles.dot, { backgroundColor: textColor }]} />}
      <Text.Mono preset="chipLabel" color={textColor} style={{ textTransform: 'uppercase' }}>
        {label}
      </Text.Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
