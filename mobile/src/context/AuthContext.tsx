import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  User,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInAnonymously,
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
import { queryKeys } from '../queries/keys';
import api from '../services/api';
import { guestTrialUsedError, hasUsedGuestTrial, markGuestTrialUsed } from '../services/guestTrial';

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
  signInAsGuest: () => Promise<void>;
  convertGuestWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  convertGuestWithGoogle: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendEmailVerification: () => Promise<void>;
  reloadUser: () => Promise<void>;
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

interface PendingGoogleConversion {
  displayName: string;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [, setUserVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const authStateSeq = useRef(0);
  const pendingBootstrap = useRef<PendingBootstrap | null>(null);
  const pendingGoogleConversion = useRef<PendingGoogleConversion | null>(null);

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
    if (!response) return;

    if (response.type === 'success') {
      const { accessToken } = response.authentication!;
      const credential = GoogleAuthProvider.credential(null, accessToken);
      const pending = pendingGoogleConversion.current;

      if (pending && auth.currentUser) {
        pendingGoogleConversion.current = null;
        (async () => {
          try {
            await linkWithCredential(auth.currentUser!, credential);
            await auth.currentUser!.getIdToken(true);
            const profile = await convertGuestProfile(pending.displayName);
            updateCurrentProfileCache(queryClient, profile);
            pending.resolve();
          } catch (err) {
            pending.reject(err);
          }
        })();
      } else {
        signInWithCredential(auth, credential);
      }
    } else {
      const pending = pendingGoogleConversion.current;
      if (pending) {
        pendingGoogleConversion.current = null;
        pending.reject(new Error('Google sign-in cancelled'));
      }
    }
  }, [queryClient, response]);

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
    await sendEmailVerification(newUser).catch((error) => {
      console.warn('Failed to send verification email', error);
    });
    await bootstrapPromise;
  };

  const resendEmailVerification = async () => {
    if (!auth.currentUser) throw new Error('Not signed in');
    await sendEmailVerification(auth.currentUser);
  };

  const reloadUser = async () => {
    if (!auth.currentUser) return;
    await reload(auth.currentUser);
    await auth.currentUser.getIdToken(true);
    setUserVersion((v) => v + 1);
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

  const signInAsGuest = async () => {
    if (await hasUsedGuestTrial()) throw guestTrialUsedError();
    await signInAnonymously(auth);
    await markGuestTrialUsed();
  };

  const convertGuestWithEmail = async (email: string, password: string, displayName: string) => {
    if (!auth.currentUser) throw new Error('Not signed in');
    const credential = EmailAuthProvider.credential(email, password);
    await linkWithCredential(auth.currentUser, credential);
    await updateProfile(auth.currentUser, { displayName });
    await sendEmailVerification(auth.currentUser).catch((error) => {
      console.warn('Failed to send verification email', error);
    });
    await auth.currentUser.getIdToken(true);
    const profile = await convertGuestProfile(displayName);
    updateCurrentProfileCache(queryClient, profile);
  };

  const convertGuestWithGoogle = async (displayName: string) => {
    if (!auth.currentUser) throw new Error('Not signed in');

    if (Platform.OS === 'web') {
      try {
        await linkWithPopup(auth.currentUser, googleProvider);
      } catch (error) {
        if (isPopupFallbackError(error)) {
          throw new Error('Popup was blocked. Allow popups and try again.');
        }
        throw error;
      }
      await auth.currentUser.getIdToken(true);
      const profile = await convertGuestProfile(displayName);
      updateCurrentProfileCache(queryClient, profile);
      return;
    }

    const conversionPromise = new Promise<void>((resolve, reject) => {
      pendingGoogleConversion.current = { displayName, resolve, reject };
    });
    try {
      await promptAsync();
    } catch (err) {
      pendingGoogleConversion.current = null;
      throw err;
    }
    await conversionPromise;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, bootstrapUser, registerWithEmail, signInWithEmail, signInWithGoogle, signInAsGuest, convertGuestWithEmail, convertGuestWithGoogle, signOut, resendEmailVerification, reloadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

async function bootstrapUser(firebaseUser: User, input?: BootstrapUserInput) {
  await firebaseUser.getIdToken();
  await api.post('/auth/bootstrap', input ?? {});
}

async function convertGuestProfile(displayName: string) {
  const res = await api.post('/auth/convert-guest', { displayName });
  return res.data.data;
}

function updateCurrentProfileCache(
  queryClient: ReturnType<typeof useQueryClient>,
  profile: unknown,
) {
  queryClient.setQueryData(queryKeys.me(), profile);
  void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
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
