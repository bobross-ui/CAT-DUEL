import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import LeftRail from './LeftRail';

interface DesktopFrameProps {
  children: React.ReactNode;
  rightRail?: React.ReactNode;
  activeRoute?: string;
  contentStyle?: StyleProp<ViewStyle>;
}

export default function DesktopFrame({
  children,
  rightRail,
  activeRoute,
  contentStyle,
}: DesktopFrameProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.shell, { backgroundColor: theme.bg }]}>
      <LeftRail activeRoute={activeRoute} />
      <ScrollView
        style={styles.main}
        contentContainerStyle={[styles.mainContent, contentStyle]}
        showsVerticalScrollIndicator
      >
        {children}
      </ScrollView>
      {rightRail ? (
        <ScrollView
          style={[styles.rightRail, { backgroundColor: theme.bg2, borderLeftColor: theme.line }]}
          contentContainerStyle={styles.rightRailContent}
        >
          {rightRail}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100%',
  },
  main: {
    flexBasis: 0,
    flexGrow: 3,
    flexShrink: 1,
    minWidth: 0,
  },
  mainContent: {
    flexGrow: 1,
  },
  rightRail: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    borderLeftWidth: 1,
  },
  rightRailContent: {
    padding: 24,
    gap: 16,
  },
});
