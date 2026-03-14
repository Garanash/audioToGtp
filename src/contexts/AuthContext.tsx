/**
 * Контекст авторизации: Google, Яндекс, Email/Password.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '../config/firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId: string;
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isConfigured: boolean;
}

export interface AuthContextValue extends AuthState {
  signInWithGoogle: () => Promise<void>;
  signInWithYandex: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithCustomToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseUser(u: User): AuthUser {
  const provider = u.providerData?.[0];
  return {
    uid: u.uid,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    photoURL: u.photoURL ?? null,
    providerId: provider?.providerId ?? 'firebase',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const auth = getFirebaseAuth();
  const isConfigured = Boolean(auth);

  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u ? mapFirebaseUser(u) : null);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  // Обработка OAuth callback: #auth_token=... или #auth_error=...
  useEffect(() => {
    const hash = window.location.hash?.slice(1) || '';
    const params = new URLSearchParams(hash);
    const token = params.get('auth_token');
    const error = params.get('auth_error');
    if (token && auth) {
      signInWithCustomToken(auth, token)
        .then(() => {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        })
        .catch(() => {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        });
      return;
    }
    if (error) {
      console.warn('OAuth error:', error);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [auth]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      console.warn('Firebase не настроен. Добавьте VITE_FIREBASE_* в .env');
      return;
    }
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, [auth]);

  const signInWithYandex = useCallback(async () => {
    if (!auth) return;
    window.location.href = '/api/auth/yandex';
  }, [auth]);

  const signInWithCustomTokenFn = useCallback(
    async (token: string) => {
      if (!auth) {
        throw new Error('Firebase не настроен');
      }
      await signInWithCustomToken(auth, token);
    },
    [auth]
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!auth) {
        throw new Error('Firebase не настроен. Добавьте VITE_FIREBASE_* в .env');
      }
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },
    [auth]
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      if (!auth) {
        throw new Error('Firebase не настроен. Добавьте VITE_FIREBASE_* в .env');
      }
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (displayName?.trim()) {
        await updateProfile(user, { displayName: displayName.trim() });
      }
    },
    [auth]
  );

  const signOut = useCallback(async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
  }, [auth]);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!auth?.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, [auth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isConfigured,
      signInWithGoogle,
      signInWithYandex,
      signInWithEmail,
      signUpWithEmail,
      signInWithCustomToken: signInWithCustomTokenFn,
      signOut,
      getIdToken,
    }),
    [
      user,
      isLoading,
      isConfigured,
      signInWithGoogle,
      signInWithYandex,
      signInWithEmail,
      signUpWithEmail,
      signInWithCustomTokenFn,
      signOut,
      getIdToken,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth используется вне AuthProvider');
  return ctx;
}
