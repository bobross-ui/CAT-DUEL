import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  const containerStyle = [
    styles.base,
    variant === 'primary' && {
      backgroundColor: isDisabled ? theme.textMuted : theme.primary,
    },
    variant === 'secondary' && {
      borderWidth: 1.5,
      borderColor: isDisabled ? theme.border : theme.border,
      backgroundColor: 'transparent',
    },
    variant === 'ghost' && {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: 'transparent',
    },
    style,
  ];

  const textColor =
    variant === 'primary'
      ? theme.primaryFg
      : isDisabled
      ? theme.textMuted
      : theme.text;

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
