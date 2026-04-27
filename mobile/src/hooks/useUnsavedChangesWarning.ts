import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useUnsavedChangesWarning(enabled: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return undefined;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enabled]);
}
