import { Platform, Share } from 'react-native';

type WebNavigator = Navigator & {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  clipboard?: {
    writeText?: (text: string) => Promise<void>;
  };
};

export async function shareLink(message: string, url: string, title = 'CAT Duel') {
  if (Platform.OS === 'web') {
    const text = `${message} ${url}`;
    const nav = globalThis.navigator as WebNavigator | undefined;

    if (nav?.share) {
      await nav.share({ title, text: message, url });
      return;
    }

    await nav?.clipboard?.writeText?.(text);
    return;
  }

  await Share.share({
    title,
    url,
    message: Platform.OS === 'ios' ? message : `${message} ${url}`,
  });
}
