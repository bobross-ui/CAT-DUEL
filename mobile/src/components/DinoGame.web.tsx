import React, { useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { radii } from '../theme/tokens';

export default function DinoGame() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const focus = () => {
      iframe.focus();
      try { iframe.contentWindow?.focus(); } catch { /* cross-origin */ }
    };
    iframe.addEventListener('load', focus);
    focus();
    return () => iframe.removeEventListener('load', focus);
  }, []);

  return (
    <View style={styles.container}>
      {React.createElement('iframe', {
        ref: iframeRef,
        src: '/dino.html',
        title: 'Mini runner game',
        style: { width: '100%', height: '100%', border: 'none' },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
});
