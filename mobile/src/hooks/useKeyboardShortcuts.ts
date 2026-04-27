import { useEffect } from 'react';
import { Platform } from 'react-native';

interface Shortcut {
  key: string;
  handler: () => void;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const shortcut = shortcuts.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (!shortcut) return;

      event.preventDefault();
      shortcut.handler();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, shortcuts]);
}
