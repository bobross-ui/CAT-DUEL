import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}

export default function PageContainer({ children, maxWidth, style }: PageContainerProps) {
  return (
    <View
      style={[
        styles.container,
        maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 56,
  },
});
