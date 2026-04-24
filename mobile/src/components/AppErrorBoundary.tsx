import React from 'react';
import { StyleSheet, View } from 'react-native';
import AppText from './Text';
import { track } from '../services/analytics';

interface State {
  hasError: boolean;
}

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    track('app_error', {
      message: error.message,
      componentStackPresent: Boolean(info.componentStack),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.fallback}>
          <AppText.Serif preset="h1Serif" color="#1C1B1A" style={styles.title}>
            Couldn't load.
          </AppText.Serif>
          <AppText.Sans preset="body" color="#4A4845" style={styles.body}>
            Restart the app and try again.
          </AppText.Sans>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FAF7F2',
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
});
