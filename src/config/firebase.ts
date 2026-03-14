/**
 * Конфигурация Firebase (Auth).
 * Значения из .env (VITE_FIREBASE_*) или fallback для musicvibe.ru.
 * Firebase Console → Authentication → Sign-in method: включите Email/Password, Google.
 * Authorized domains: добавьте musicvibe.ru.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyBHkleC25j-0j0PUYMQzmUsExsCbGkL4SA',
  authDomain: 'musicans-d63be.firebaseapp.com',
  projectId: 'musicans-d63be',
  storageBucket: 'musicans-d63be.firebasestorage.app',
  messagingSenderId: '190038537915',
  appId: '1:190038537915:web:715a7e9988889891a45b9e',
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_CONFIG.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId,
};

function getApp(): FirebaseApp | null {
  if (getApps().length > 0) {
    return getApps()[0] as FirebaseApp;
  }
  const hasConfig = firebaseConfig.apiKey && firebaseConfig.projectId;
  if (!hasConfig) return null;
  return initializeApp(firebaseConfig);
}

let auth: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  const app = getApp();
  if (!app) return null;
  if (!auth) auth = getAuth(app);
  return auth;
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);
