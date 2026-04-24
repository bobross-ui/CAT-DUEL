import { useState } from 'react';
import { Modal, Platform, StyleSheet, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import AppText from './Text';
import Button from './Button';
import { useTheme } from '../theme/ThemeProvider';

type WebNavigator = Navigator & {
  clipboard?: {
    writeText?: (text: string) => Promise<void>;
  };
};

interface Props {
  visible: boolean;
  title: string;
  message: string;
  url: string;
  onClose: () => void;
}

export default function ShareLinkModal({ visible, message, url, onClose }: Props) {
  const { theme } = useTheme();
  const [copying, setCopying] = useState(false);

  async function copyLink() {
    setCopying(true);
    try {
      const nav = globalThis.navigator as WebNavigator | undefined;
      if (Platform.OS === 'web' && nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url);
        Toast.show({
          type: 'success',
          text1: 'Link copied',
          text2: 'Paste it anywhere to share.',
          position: 'top',
          visibilityTime: 2200,
          topOffset: 54,
        });
        return;
      }

      Toast.show({
        type: 'info',
        text1: 'Select the link',
        text2: 'Copy it manually from the field.',
        position: 'top',
        visibilityTime: 3000,
        topOffset: 54,
      });
    } finally {
      setCopying(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.line }]}>
          <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.title}>
            Share link
          </AppText.Serif>
          <AppText.Sans preset="body" color={theme.ink2} style={styles.body}>
            {message}
          </AppText.Sans>
          <TextInput
            value={url}
            editable={false}
            selectTextOnFocus
            multiline
            style={[
              styles.urlBox,
              {
                borderColor: theme.line,
                backgroundColor: theme.bg2,
                color: theme.ink,
              },
            ]}
          />
          <View style={styles.actions}>
            <Button label="Close" variant="ghost" onPress={onClose} style={styles.actionBtn} />
            <Button label="Copy" onPress={copyLink} loading={copying} style={styles.actionBtn} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center' },
  urlBox: {
    minHeight: 74,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'JetBrainsMono-Medium',
    fontSize: 12,
    lineHeight: 18,
  },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1 },
});
