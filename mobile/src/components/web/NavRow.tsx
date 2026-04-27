import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Text from '../Text';
import { useTheme } from '../../theme/ThemeProvider';
import { radii } from '../../theme/tokens';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

interface NavRowProps {
  icon: FeatherName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  keyHint?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function NavRow({
  icon,
  label,
  active = false,
  disabled = false,
  badge,
  keyHint,
  onPress,
  style,
}: NavRowProps) {
  const { theme } = useTheme();
  const foreground = active ? theme.bg : theme.ink2;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: active ? theme.ink : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.78 : 1,
        },
        style,
      ]}
    >
      <Feather name={icon} size={18} color={foreground} />
      <Text.Sans preset="label" color={foreground} style={styles.label}>
        {label}
      </Text.Sans>
      <View style={styles.spacer} />
      {badge ? (
        <View style={[styles.badge, { borderColor: active ? theme.bg : theme.line }]}>
          <Text.Mono preset="chipLabel" color={foreground}>{badge}</Text.Mono>
        </View>
      ) : null}
      {keyHint ? (
        <View style={[styles.keyHint, { borderColor: active ? theme.bg : theme.line }]}>
          <Text.Mono preset="chipLabel" color={foreground}>{keyHint}</Text.Mono>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 42,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  keyHint: {
    borderWidth: 1,
    borderRadius: 5,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
