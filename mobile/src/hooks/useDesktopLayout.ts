import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

const DESKTOP_BREAKPOINT = 1024;

function hasDesktopInput() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function useDesktopLayout() {
  const { width } = useWindowDimensions();
  const [desktopInput, setDesktopInput] = useState(hasDesktopInput);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return undefined;

    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setDesktopInput(media.matches);
    update();

    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return Platform.OS === 'web' && desktopInput && width >= DESKTOP_BREAKPOINT;
}
