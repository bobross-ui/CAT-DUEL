import { useState } from 'react';
import {
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { z } from 'zod';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/Button';
import AppText from '../components/Text';

const displayNameSchema = z.string().trim().min(2, 'Display name must be at least 2 characters.').max(30, 'Display name must be 30 characters or less.');

export default function LoginScreen() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

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
        await updateProfile(newUser, { displayName: parsedDisplayName!.data });
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
    try {
      await signInWithGoogle();
    } catch {
      setError('Google sign-in failed.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.title}>CAT Duel</AppText.Serif>
      <AppText.Sans preset="body" color={theme.ink2} style={styles.subtitle}>
        {isRegistering ? 'Create an account' : 'Sign in to compete'}
      </AppText.Sans>

      {isRegistering && (
        <TextInput
          style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.bg }]}
          placeholder="Display Name"
          placeholderTextColor={theme.ink3}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          maxLength={30}
          accessibilityLabel="Display name"
          accessibilityHint="Enter the public name shown to other players"
        />
      )}
      <TextInput
        style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.bg }]}
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
        style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.bg }]}
        placeholder="Password"
        placeholderTextColor={theme.ink3}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType={isRegistering ? 'newPassword' : 'password'}
        accessibilityLabel="Password"
      />

      {error ? <AppText.Sans preset="label" color={theme.coral} style={styles.error}>{error}</AppText.Sans> : null}

      <Button
        label={isRegistering ? 'Register' : 'Sign In'}
        onPress={handleEmailSignIn}
        loading={loading}
        style={styles.buttonSpacing}
      />

      <AppText.Sans
        preset="label"
        color={theme.ink2}
        style={styles.toggleText}
        onPress={() => { setIsRegistering(r => !r); setError(''); setDisplayName(''); }}
        accessibilityRole="button"
        accessibilityLabel={isRegistering ? 'Sign in instead' : 'Register instead'}
      >
        {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
      </AppText.Sans>

      {!isRegistering && (
        <Button
          label="Continue with Google"
          variant="ghost"
          onPress={handleGoogleSignIn}
          disabled={loading}
          accessibilityHint="Starts Google sign in"
          style={styles.buttonSpacing}
        />
      )}

      {/* Bottom spacer so keyboard avoid doesn't crush content */}
      <View style={{ height: 1 }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 40,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  error: {
    marginBottom: 12,
  },
  buttonSpacing: {
    marginBottom: 12,
  },
  toggleText: {
    textAlign: 'center',
    marginBottom: 12,
    textDecorationLine: 'underline',
  },
});
