import { useState } from 'react';
import { Alert, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import AppText from './Text';

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function EmailVerificationBanner() {
  const { user, resendEmailVerification, reloadUser } = useAuth();
  const { theme } = useTheme();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  if (!user || user.emailVerified || !user.email) return null;

  const onResend = async () => {
    setResending(true);
    try {
      await resendEmailVerification();
      notify('Verification email sent', `We sent a link to ${user.email}. Check your inbox and spam folder.`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Please try again later.';
      notify("Couldn't send email", msg);
    } finally {
      setResending(false);
    }
  };

  const onCheck = async () => {
    setChecking(true);
    try {
      await reloadUser();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={[styles.banner, { backgroundColor: theme.bg2, borderColor: theme.line }]}>
      <AppText.Sans preset="bodyMed" color={theme.ink}>
        Verify your email
      </AppText.Sans>
      <AppText.Sans preset="small" color={theme.ink3} style={styles.body}>
        We sent a link to {user.email} (check spam). Click it, then tap "I've verified".
      </AppText.Sans>
      <View style={styles.actions}>
        <TouchableOpacity onPress={onResend} disabled={resending} accessibilityRole="button">
          <AppText.Sans preset="label" color={theme.accentDeep}>
            {resending ? 'Sending…' : 'Resend email'}
          </AppText.Sans>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCheck} disabled={checking} accessibilityRole="button">
          <AppText.Sans preset="label" color={theme.accentDeep}>
            {checking ? 'Checking…' : "I've verified"}
          </AppText.Sans>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  body: { marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 20 },
});
