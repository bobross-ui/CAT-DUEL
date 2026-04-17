import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { shadows } from '../theme/tokens';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function Card({ children, style }: CardProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bg }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 20,
    ...shadows.card,
  },
});
