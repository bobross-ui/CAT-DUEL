import { StyleProp, TextStyle } from 'react-native';
import Text from '../Text';
import { useTheme } from '../../theme/ThemeProvider';

interface EyebrowLabelProps {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export default function EyebrowLabel({ children, color, style }: EyebrowLabelProps) {
  const { theme } = useTheme();

  return (
    <Text.Mono
      preset="eyebrow"
      color={color ?? theme.ink3}
      style={[{ textTransform: 'uppercase' }, style]}
    >
      {children}
    </Text.Mono>
  );
}
