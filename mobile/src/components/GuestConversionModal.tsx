import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { displayNameSchema } from '../utils/displayName';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import AppText from './Text';
import Button from './Button';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function GuestConversionModal({ visible, onClose }: Props) {
  const { theme } = useTheme();
  const { convertGuestWithEmail, convertGuestWithGoogle, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const loading = emailLoading || googleLoading;

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please enter email and password.');
      return;
    }
    const parsed = displayNameSchema.safeParse(displayName);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please enter a display name.');
      return;
    }

    setError('');
    setEmailLoading(true);
    try {
      await convertGuestWithEmail(email, password, parsed.data);
    } catch (err: unknown) {
      const code = getErrorCode(err);
      if (code === 'auth/email-already-in-use') setError('Email already registered. Use a different email.');
      else if (code === 'auth/weak-password') setError('Password must be at least 6 characters.');
      else if (code === 'auth/credential-already-in-use') setError('That email is already linked to an account.');
      else if (code === 'DISPLAY_NAME_TAKEN') setError('That display name is already taken.');
      else setError('Could not save your account. Try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleGoogle = async () => {
    const parsed = displayNameSchema.safeParse(displayName);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please enter a display name.');
      return;
    }

    setError('');
    setGoogleLoading(true);
    try {
      await convertGuestWithGoogle(parsed.data);
    } catch (err: unknown) {
      const code = getErrorCode(err);
      if (code === 'auth/credential-already-in-use') setError('That Google account is already linked elsewhere.');
      else if (code === 'DISPLAY_NAME_TAKEN') setError('That display name is already taken.');
      else if (code === 'auth/popup-closed-by-user') setError('Google sign-in was cancelled.');
      else if (code === 'auth/popup-blocked') setError('Popup was blocked. Allow popups and try again.');
      else setError('Could not link your Google account. Try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSkip = async () => {
    await signOut();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay} accessibilityViewIsModal accessibilityLabel="Save your score">
        <View style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.line }]}>
          <Pressable
            onPress={onClose}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="View results"
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
          >
            <Feather name="x" size={20} color={theme.ink2} />
          </Pressable>

          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.title}>
              Save your score
            </AppText.Serif>
            <AppText.Sans preset="body" color={theme.ink2} style={styles.subtitle}>
              Sign up to keep your stats and join the leaderboard.
            </AppText.Sans>

            <TextInput
              style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.bg2 }]}
              placeholder="Display name"
              placeholderTextColor={theme.ink3}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              maxLength={30}
              accessibilityLabel="Display name"
            />
            <TextInput
              style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.bg2 }]}
              placeholder="Email"
              placeholderTextColor={theme.ink3}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              accessibilityLabel="Email"
            />
            <TextInput
              style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.bg2 }]}
              placeholder="Password"
              placeholderTextColor={theme.ink3}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
              accessibilityLabel="Password"
            />

            {error ? (
              <AppText.Sans preset="label" color={theme.coral} style={styles.error}>{error}</AppText.Sans>
            ) : null}

            <Button label="Create account" onPress={handleSubmit} loading={emailLoading} disabled={loading && !emailLoading} style={styles.submit} />
            <Button label="Continue with Google" variant="ghost" onPress={handleGoogle} loading={googleLoading} disabled={loading && !googleLoading} />
            <Button label="Skip for now" variant="ghost" onPress={handleSkip} disabled={loading} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function getErrorCode(error: unknown) {
  return (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code
    ?? (error as { code?: string })?.code;
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
    maxHeight: '90%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 8,
    zIndex: 1,
  },
  scrollContent: { gap: 12 },
  title: { textAlign: 'center', marginTop: 4 },
  subtitle: { textAlign: 'center', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { textAlign: 'center' },
  submit: { marginTop: 4 },
});
