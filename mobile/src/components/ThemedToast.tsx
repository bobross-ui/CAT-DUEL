import Toast, { BaseToast, ErrorToast, ToastConfig } from 'react-native-toast-message';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';

export default function ThemedToast() {
  const { theme } = useTheme();

  const baseStyle = {
    backgroundColor: theme.card,
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: radii.lg,
  };
  const contentContainerStyle = {
    paddingHorizontal: 14,
  };
  const text1Style = {
    color: theme.ink,
    fontFamily: 'Geist-Medium',
    fontSize: 13,
  };
  const text2Style = {
    color: theme.ink3,
    fontFamily: 'Geist-Regular',
    fontSize: 12,
  };

  const config: ToastConfig = {
    success: (props) => (
      <BaseToast
        {...props}
        style={[baseStyle, { borderLeftColor: theme.accent, borderLeftWidth: 4 }]}
        contentContainerStyle={contentContainerStyle}
        text1Style={text1Style}
        text2Style={text2Style}
      />
    ),
    error: (props) => (
      <ErrorToast
        {...props}
        style={[baseStyle, { borderLeftColor: theme.coral, borderLeftWidth: 4 }]}
        contentContainerStyle={contentContainerStyle}
        text1Style={text1Style}
        text2Style={text2Style}
      />
    ),
    info: (props) => (
      <BaseToast
        {...props}
        style={[baseStyle, { borderLeftColor: theme.ink3, borderLeftWidth: 4 }]}
        contentContainerStyle={contentContainerStyle}
        text1Style={text1Style}
        text2Style={text2Style}
      />
    ),
  };

  return <Toast config={config} />;
}
