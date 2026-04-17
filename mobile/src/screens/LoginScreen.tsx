import { useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/Button';

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
    if (isRegistering && !displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isRegistering) {
        const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(newUser, { displayName: displayName.trim() });
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
      <Text style={[styles.title, { color: theme.text }]}>CAT Duel</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {isRegistering ? 'Create an account' : 'Sign in to compete'}
      </Text>

      {isRegistering && (
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
          placeholder="Display Name"
          placeholderTextColor={theme.textMuted}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
        />
      )}
      <TextInput
        style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
        placeholder="Email"
        placeholderTextColor={theme.textMuted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
        placeholder="Password"
        placeholderTextColor={theme.textMuted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

      <Button
        label={isRegistering ? 'Register' : 'Sign In'}
        onPress={handleEmailSignIn}
        loading={loading}
        style={styles.buttonSpacing}
      />

      <Text
        style={[styles.toggleText, { color: theme.textSecondary }]}
        onPress={() => { setIsRegistering(r => !r); setError(''); setDisplayName(''); }}
      >
        {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
      </Text>

      {!isRegistering && (
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={handleGoogleSignIn}
          disabled={loading}
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
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
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
    fontSize: 14,
    marginBottom: 12,
  },
  buttonSpacing: {
    marginBottom: 12,
  },
  toggleText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    textDecorationLine: 'underline',
  },
});
