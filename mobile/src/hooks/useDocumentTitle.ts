import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const previousTitle = document.title;
    document.title = title;

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
