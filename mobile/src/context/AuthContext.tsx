import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  updateProfile,
} from 'firebase/auth';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { auth } from '../config/firebase';
import api from '../services/api';

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!;
const googleProvider = new GoogleAuthProvider();

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  bootstrapUser: (firebaseUser: User, input?: BootstrapUserInput) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface BootstrapUserInput {
  displayName?: string;
}

interface PendingBootstrap {
  input: BootstrapUserInput;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const authStateSeq = useRef(0);
  const pendingBootstrap = useRef<PendingBootstrap | null>(null);

  const redirectUri = makeRedirectUri();

  const [, response, promptAsync] = Google.useAuthRequest({
    clientId: WEB_CLIENT_ID,
    redirectUri,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const seq = authStateSeq.current + 1;
      authStateSeq.current = seq;

      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const pending = pendingBootstrap.current;
      if (!pending) setLoading(true);
      try {
        const bootstrapInput = pending?.input;
        pendingBootstrap.current = null;
        await bootstrapUser(firebaseUser, bootstrapInput);
        pending?.resolve();
        if (authStateSeq.current !== seq) return;
        setUser(firebaseUser);
      } catch (error) {
        console.warn('User bootstrap failed', error);
        pending?.reject(error);
        if (authStateSeq.current !== seq) return;
        setUser(null);
        await firebaseSignOut(auth).catch(() => {});
      } finally {
        if (!pending && authStateSeq.current === seq) setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    getRedirectResult(auth).catch((error) => {
      console.warn('Google redirect sign-in failed', error);
    });
  }, []);

  useEffect(() => {
    if (response?.type === 'success') {
      const { accessToken } = response.authentication!;
      const credential = GoogleAuthProvider.credential(null, accessToken);
      signInWithCredential(auth, credential);
    }
  }, [response]);

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const registerWithEmail = async (email: string, password: string, displayName: string) => {
    const bootstrapPromise = new Promise<void>((resolve, reject) => {
      pendingBootstrap.current = { input: { displayName }, resolve, reject };
    });
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password).catch((error) => {
      pendingBootstrap.current = null;
      throw error;
    });
    await updateProfile(newUser, { displayName });
    await bootstrapPromise;
  };

  const signInWithGoogle = async () => {
    if (Platform.OS === 'web') {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (error) {
        if (isPopupFallbackError(error)) {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        throw error;
      }
      return;
    }

    await promptAsync();
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, bootstrapUser, registerWithEmail, signInWithEmail, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

async function bootstrapUser(firebaseUser: User, input?: BootstrapUserInput) {
  await firebaseUser.getIdToken();
  await api.post('/auth/bootstrap', input ?? {});
}

function isPopupFallbackError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

  return code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user';
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
