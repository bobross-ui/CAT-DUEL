import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ComponentProps } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { z } from 'zod';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { queryClient } from '../queries/client';
import { queryKeys } from '../queries/keys';
import api from '../services/api';
import Text from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';

const displayNameSchema = z.string().trim().min(2, 'Display name must be at least 2 characters.').max(30, 'Display name must be 30 characters or less.');

type Field = 'displayName' | 'email' | 'password';
type ButtonName = 'submit' | 'google' | 'toggle';

export default function LoginScreenDesktop() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [focusedField, setFocusedField] = useState<Field | null>(null);
  const [focusedButton, setFocusedButton] = useState<ButtonName | null>(null);

  useDocumentTitle(isRegistering ? 'Create account · CAT Duel' : 'Sign in · CAT Duel');

  const handleEmailSignIn = async () => {
    if (!email || !password) {
      setError('Please enter email and password.');
      return;
    }

    const parsedDisplayName = isRegistering ? displayNameSchema.safeParse(displayName) : null;
    if (parsedDisplayName && !parsedDisplayName.success) {
      setError(parsedDisplayName.error.issues[0]?.message ?? 'Please enter a display name.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      if (isRegistering) {
        const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
        const nextDisplayName = parsedDisplayName?.success ? parsedDisplayName.data : '';
        await updateProfile(newUser, { displayName: nextDisplayName });
        const res = await api.patch('/users/me', { displayName: nextDisplayName });
        queryClient.setQueryData(queryKeys.me(), res.data.data);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') setError('Email already registered. Sign in instead.');
      else if (code === 'auth/weak-password') setError('Password must be at least 6 characters.');
      else setError(isRegistering ? 'Registration failed.' : 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      console.warn('Google sign-in failed', err);
      setError(getGoogleSignInErrorMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering((value) => !value);
    setError('');
    setDisplayName('');
  };

  const disabled = loading || googleLoading;

  return (
    <View style={[styles.page, { backgroundColor: theme.bg2 }]}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <View style={styles.brand}>
          <View style={[styles.brandMark, { backgroundColor: theme.ink }]}>
            <Text.Serif preset="h1Serif" color={theme.bg}>C</Text.Serif>
          </View>
          <View>
            <Text.Serif preset="h1Serif" color={theme.ink}>CAT-Duel</Text.Serif>
            <Text.Mono preset="chipLabel" color={theme.ink3}>RANKED PREP</Text.Mono>
          </View>
        </View>

        <View style={styles.heading}>
          <Text.Serif preset="display" color={theme.ink} style={styles.title}>
            {isRegistering ? 'Create account' : 'Sign in'}
          </Text.Serif>
          <Text.Sans preset="body" color={theme.ink2}>
            {isRegistering ? 'Start your ranked CAT prep climb.' : 'Continue your climb from any desktop.'}
          </Text.Sans>
        </View>

        <View style={styles.form}>
          {isRegistering && (
            <LabeledInput
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={30}
              focused={focusedField === 'displayName'}
              onFocus={() => setFocusedField('displayName')}
              onBlur={() => setFocusedField(null)}
              accessibilityLabel="Display name"
            />
          )}

          <LabeledInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            focused={focusedField === 'email'}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            accessibilityLabel="Email"
          />

          <LabeledInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
            secureTextEntry
            textContentType={isRegistering ? 'newPassword' : 'password'}
            focused={focusedField === 'password'}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            accessibilityLabel="Password"
            onSubmitEditing={handleEmailSignIn}
          />
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.coralSoft, borderColor: theme.coral }]}>
            <Text.Sans preset="label" color={theme.coral}>{error}</Text.Sans>
          </View>
        ) : null}

        <DesktopButton
          label={isRegistering ? 'Create account' : 'Sign in'}
          onPress={handleEmailSignIn}
          loading={loading}
          disabled={disabled}
          focused={focusedButton === 'submit'}
          onFocus={() => setFocusedButton('submit')}
          onBlur={() => setFocusedButton(null)}
          style={{ backgroundColor: theme.accent }}
          textColor="#FFFFFF"
        />

        {!isRegistering && (
          <DesktopButton
            label="Continue with Google"
            onPress={handleGoogleSignIn}
            loading={googleLoading}
            disabled={disabled}
            focused={focusedButton === 'google'}
            onFocus={() => setFocusedButton('google')}
            onBlur={() => setFocusedButton(null)}
            style={{ backgroundColor: theme.card, borderColor: theme.line, borderWidth: 1 }}
            textColor={theme.ink}
            accessibilityHint="Starts Google sign in"
          />
        )}

        <Pressable
          onPress={toggleMode}
          disabled={disabled}
          onFocus={() => setFocusedButton('toggle')}
          onBlur={() => setFocusedButton(null)}
          accessibilityRole="button"
          accessibilityLabel={isRegistering ? 'Sign in instead' : 'Create an account instead'}
          style={({ pressed }) => [
            styles.toggle,
            focusedButton === 'toggle' && { borderColor: theme.accent },
            pressed && { opacity: 0.72 },
            disabled && { opacity: 0.45 },
          ]}
        >
          <Text.Sans preset="label" color={theme.ink2} style={styles.toggleText}>
            {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </Text.Sans>
        </Pressable>
      </View>
    </View>
  );
}

function LabeledInput({
  label,
  focused,
  ...props
}: ComponentProps<typeof TextInput> & {
  label: string;
  focused: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.inputGroup}>
      <Text.Sans preset="label" color={theme.ink2} style={styles.inputLabel}>
        {label}
      </Text.Sans>
      <TextInput
        {...props}
        placeholderTextColor={theme.ink3}
        style={[
          styles.input,
          {
            backgroundColor: theme.bg,
            borderColor: focused ? theme.accent : theme.line,
            color: theme.ink,
          },
          focused && styles.focusRing,
          props.style,
        ]}
      />
    </View>
  );
}

function DesktopButton({
  label,
  onPress,
  loading,
  disabled,
  focused,
  onFocus,
  onBlur,
  style,
  textColor,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  style?: StyleProp<ViewStyle>;
  textColor: string;
  accessibilityHint?: string;
}) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [
        styles.desktopButton,
        style,
        focused && { borderColor: theme.accent },
        pressed && !disabled && { opacity: 0.82 },
        disabled && { opacity: 0.55 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text.Sans preset="bodyMed" color={textColor}>{label}</Text.Sans>
      )}
    </Pressable>
  );
}

function getGoogleSignInErrorMessage(err: unknown) {
  const code = (err as { code?: string })?.code;

  if (code === 'auth/unauthorized-domain') {
    return 'Google sign-in is not configured for this web address.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked. Allow popups and try again.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in was cancelled.';
  }

  return 'Google sign-in failed.';
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderRadius: radii.xxl,
    padding: 32,
    boxShadow: '0 24px 40px rgba(0,0,0,0.08)',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 30,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    gap: 8,
    marginBottom: 28,
  },
  title: {
    lineHeight: 44,
  },
  form: {
    gap: 14,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    paddingLeft: 2,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  focusRing: {
    borderWidth: 2,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 16,
    marginBottom: 14,
  },
  desktopButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  toggle: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radii.sm,
    marginTop: 14,
  },
  toggleText: {
    textDecorationLine: 'underline',
  },
});
