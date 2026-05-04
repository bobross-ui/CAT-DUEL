import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';
import Text from './Text';
import Button from './Button';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';

interface TitaAnswerPadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  submitting?: boolean;
  submitDisabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0', '.'];

export default function TitaAnswerPad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  submitting = false,
  submitDisabled = false,
  style,
}: TitaAnswerPadProps) {
  const { theme } = useTheme();
  const canSubmit = value.trim().length > 0 && !disabled && !submitDisabled;

  function append(char: string) {
    if (disabled) return;
    if (char === '-' && value.includes('-')) return;
    if (char === '-' && value.length > 0) return;
    if (char === '.' && value.includes('.')) return;
    onChange(`${value}${char}`);
  }

  function backspace() {
    if (disabled) return;
    onChange(value.slice(0, -1));
  }

  function clear() {
    if (disabled) return;
    onChange('');
  }

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.display, { borderColor: theme.line, backgroundColor: theme.bg2 }]}>
        <Text.Mono preset="chipLabel" color={theme.ink3} style={styles.displayLabel}>
          TYPE IN THE ANSWER
        </Text.Mono>
        <Text.Serif preset="scoreLg" color={value ? theme.ink : theme.ink3} style={styles.displayValue}>
          {value || '—'}
        </Text.Serif>
      </View>

      <View style={styles.grid}>
        {KEYS.map((key) => (
          <PadKey key={key} label={key} disabled={disabled} onPress={() => append(key)} />
        ))}
        <PadKey
          label="Clear"
          disabled={disabled || value.length === 0}
          onPress={clear}
          wide
        />
        <PadKey
          label="backspace"
          icon="delete"
          disabled={disabled || value.length === 0}
          onPress={backspace}
        />
      </View>

      {onSubmit ? (
        <Button
          label="Submit"
          onPress={onSubmit}
          loading={submitting}
          disabled={!canSubmit}
        />
      ) : null}
    </View>
  );
}

function PadKey({
  label,
  icon,
  disabled,
  onPress,
  wide = false,
}: {
  label: string;
  icon?: ComponentProps<typeof Feather>['name'];
  disabled: boolean;
  onPress: () => void;
  wide?: boolean;
}) {
  const { theme } = useTheme();
  const isUtility = label === 'Clear' || Boolean(icon);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={icon ? 'Backspace' : label}
      style={({ pressed }) => [
        styles.key,
        wide && styles.wideKey,
        {
          backgroundColor: isUtility ? theme.bg2 : theme.card,
          borderColor: theme.line,
          opacity: disabled ? 0.42 : pressed ? 0.72 : 1,
        },
      ]}
    >
      {icon ? (
        <Feather name={icon} size={18} color={theme.ink2} />
      ) : (
        <Text.Mono preset={isUtility ? 'chipLabel' : 'mono'} color={theme.ink}>
          {label}
        </Text.Mono>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  display: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  displayLabel: {
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  displayValue: {
    minHeight: 28,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  key: {
    width: '31.7%',
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wideKey: {
    width: '65.8%',
  },
});
