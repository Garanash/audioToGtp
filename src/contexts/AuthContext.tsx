/**
 * Контекст авторизации: Google, Яндекс, VK (структура готова для добавления провайдеров).
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
  signOut as firebaseSignOut,
  onAuthStateChanged,
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
  signInWithVk: () => Promise<void>;
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
    // TODO: добавить Yandex OAuth (через backend или кастомный провайдер Firebase)
    window.alert('Вход через Яндекс будет доступен в следующем обновлении.');
  }, [auth]);

  const signInWithVk = useCallback(async () => {
    if (!auth) return;
    // TODO: добавить VK OAuth (через backend или кастомный провайдер Firebase)
    window.alert('Вход через ВКонтакте будет доступен в следующем обновлении.');
  }, [auth]);

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
      signInWithVk,
      signOut,
      getIdToken,
    }),
    [
      user,
      isLoading,
      isConfigured,
      signInWithGoogle,
      signInWithYandex,
      signInWithVk,
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
