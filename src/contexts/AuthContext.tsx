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
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile,
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
  updateProfile: (data: { displayName?: string; photoURL?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_CACHE_KEY = 'musca_profile_cache';

function getCachedProfile(uid: string): { displayName?: string; photoURL?: string } | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.uid === uid) return { displayName: data.displayName, photoURL: data.photoURL };
  } catch {
    // ignore
  }
  return null;
}

function setCachedProfile(uid: string, displayName: string | null, photoURL: string | null) {
  try {
    localStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({ uid, displayName, photoURL })
    );
  } catch {
    // ignore
  }
}

function mapFirebaseUser(u: User): AuthUser {
  const provider = u.providerData?.[0];
  const cached = getCachedProfile(u.uid);
  return {
    uid: u.uid,
    email: u.email ?? null,
    displayName: u.displayName ?? cached?.displayName ?? null,
    photoURL: u.photoURL ?? cached?.photoURL ?? null,
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
      if (u && sessionStorage.getItem('musca_openCabinetAfterAuth') === '1') {
        sessionStorage.removeItem('musca_openCabinetAfterAuth');
        window.dispatchEvent(new CustomEvent('musca:openCabinet'));
      }
    });
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setUser(mapFirebaseUser(result.user));
        }
      })
      .catch(() => {});
    return () => unsubscribe();
  }, [auth]);

  // Обработка OAuth callback: #auth_token=... или #auth_error=...
  // Для Яндекса: auth_profile=base64({displayName, photoURL, email})
  useEffect(() => {
    const hash = window.location.hash?.slice(1) || '';
    const params = new URLSearchParams(hash);
    const token = params.get('auth_token');
    const profileB64 = params.get('auth_profile');
    const error = params.get('auth_error');
    if (token && auth) {
      signInWithCustomToken(auth, token)
        .then(async (cred) => {
          const fbUser = cred?.user;
          if (!fbUser) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            return;
          }
          let displayName: string | null = null;
          let photoURL: string | null = null;
          let email: string | null = null;
          if (profileB64) {
            try {
              const padded = String(profileB64).replace(/-/g, '+').replace(/_/g, '/');
              const padLen = (4 - padded.length % 4) % 4;
              const binary = atob(padded + '='.repeat(padLen));
              const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
              const jsonStr = new TextDecoder().decode(bytes);
              const profile = JSON.parse(jsonStr) as { displayName?: string; photoURL?: string; email?: string };
              displayName = profile.displayName ?? null;
              photoURL = profile.photoURL ?? null;
              email = profile.email ?? null;
              if (displayName || photoURL) {
                await firebaseUpdateProfile(fbUser, { displayName: displayName || undefined, photoURL: photoURL || undefined });
              }
            } catch {
              // ignore
            }
          }
          const mergedUser = {
            uid: fbUser.uid,
            email: email ?? fbUser.email ?? null,
            displayName: displayName ?? fbUser.displayName ?? null,
            photoURL: photoURL ?? fbUser.photoURL ?? null,
            providerId: fbUser.providerData?.[0]?.providerId ?? 'custom',
          };
          setCachedProfile(fbUser.uid, mergedUser.displayName, mergedUser.photoURL);
          setUser(mergedUser);
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
    window.location.href = '/api/auth/google';
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
        await firebaseUpdateProfile(user, { displayName: displayName.trim() });
        setCachedProfile(user.uid, displayName.trim(), user.photoURL ?? null);
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

  const updateProfile = useCallback(
    async (data: { displayName?: string; photoURL?: string }) => {
      const u = auth?.currentUser;
      if (!u) throw new Error('Не авторизован');
      await firebaseUpdateProfile(u, {
        displayName: data.displayName ?? u.displayName ?? undefined,
        photoURL: data.photoURL ?? u.photoURL ?? undefined,
      });
      const next = {
        uid: u.uid,
        email: u.email ?? null,
        displayName: data.displayName ?? u.displayName ?? null,
        photoURL: data.photoURL ?? u.photoURL ?? null,
        providerId: u.providerData?.[0]?.providerId ?? 'firebase',
      };
      setCachedProfile(u.uid, next.displayName, next.photoURL);
      setUser(next);
    },
    [auth]
  );

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
      updateProfile,
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
      updateProfile,
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
