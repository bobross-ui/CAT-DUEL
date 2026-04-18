import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { type } from '../theme/tokens';

const TAB_CONFIG: Record<string, { label: string; icon: React.ComponentProps<typeof Feather>['name'] }> = {
  Home:  { label: 'HOME',  icon: 'home' },
  Play:  { label: 'PLAY',  icon: 'zap' },
  Ranks: { label: 'RANKS', icon: 'award' },
  Me:    { label: 'ME',    icon: 'user' },
};

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: theme.card,
        borderTopColor: theme.line,
        paddingBottom: Math.max(insets.bottom, 8),
      },
    ]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const config = TAB_CONFIG[route.name];
        if (!config) return null;
        const color = isFocused ? theme.accent : theme.ink3;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
          >
            <Feather name={config.icon} size={20} color={color} />
            <Text style={[
              styles.label,
              {
                color,
                fontFamily: type.chipLabel.family,
                letterSpacing: type.chipLabel.letterSpacing,
              },
            ]}>
              {config.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  label: {
    fontSize: type.chipLabel.size,
    lineHeight: type.chipLabel.lineHeight,
  },
});
