/**
 * Модальное окно входа: Email/пароль + Google, Яндекс.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  mode?: 'login' | 'register';
}

export function AuthModal({ isOpen, onClose, onSuccess, mode = 'login' }: AuthModalProps) {
  const { signInWithGoogle, signInWithYandex, signInWithEmail, signUpWithEmail, isConfigured } = useAuth();
  const [hint, setHint] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setHint(null);
      setEmail('');
      setPassword('');
      setDisplayName('');
      setEmailError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    if (!email.trim() || !password) {
      setEmailError('Заполните email и пароль');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setEmailError('Пароль должен быть не менее 6 символов');
      return;
    }
    if (!isConfigured) {
      setHint('Скопируйте .env.example в .env. Вставьте токены (VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN и др.) из Firebase Console → Project settings. Включите «Email/Password» в Authentication → Sign-in method.');
      return;
    }
    setEmailBusy(true);
    try {
      if (mode === 'register') {
        await signUpWithEmail(email, password, displayName);
      } else {
        await signInWithEmail(email, password);
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка входа';
      const fbMsg = String(msg);
      if (fbMsg.includes('auth/invalid-email')) setEmailError('Неверный формат email');
      else if (fbMsg.includes('auth/user-not-found') || fbMsg.includes('auth/invalid-credential')) setEmailError('Пользователь не найден или неверный пароль');
      else if (fbMsg.includes('auth/email-already-in-use')) setEmailError('Этот email уже зарегистрирован');
      else if (fbMsg.includes('auth/weak-password')) setEmailError('Пароль должен быть не менее 6 символов');
      else if (fbMsg.includes('auth/operation-not-allowed')) setEmailError('Вход по почте отключён. Включите Email/Password в Firebase Console → Authentication → Sign-in method.');
      else if (fbMsg.includes('auth/network-request-failed')) setEmailError('Ошибка сети. Проверьте подключение и добавьте домен в Firebase → Authentication → Authorized domains.');
      else if (fbMsg.includes('auth/too-many-requests')) setEmailError('Слишком много попыток. Попробуйте позже.');
      else setEmailError(fbMsg);
    } finally {
      setEmailBusy(false);
    }
  };

  const handleGoogle = async () => {
    if (!isConfigured) {
      setHint('Скопируйте .env.example в .env и вставьте ключи из Firebase Console (Project settings → Your apps). Включите Google в Authentication → Sign-in method. Затем перезапустите: npm run dev');
      return;
    }
    if (onSuccess) sessionStorage.setItem('musca_openCabinetAfterAuth', '1');
    await signInWithGoogle();
    onSuccess?.();
    onClose();
  };

  const handleYandex = async () => {
    if (!isConfigured) {
      setHint('Сначала настройте Firebase (см. подсказку для Google).');
      return;
    }
    if (onSuccess) sessionStorage.setItem('musca_openCabinetAfterAuth', '1');
    await signInWithYandex();
    onSuccess?.();
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0A]/90 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-2xl font-bold text-[#E0E0E0]">
            {mode === 'register' ? 'Регистрация' : 'Вход'}
          </h3>
          <p className="mt-2 text-[#A0A0A0]">
            Сохраняйте проекты и возвращайтесь к ним с любого устройства.
          </p>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleGoogle}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-4 py-3 text-sm font-medium text-[#E0E0E0] transition-all hover:border-[#3A3A3A] hover:bg-[#222]"
              >
                <GoogleIcon />
                Google
              </button>
              <button
                type="button"
                onClick={handleYandex}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-4 py-3 text-sm font-medium text-[#E0E0E0] transition-all hover:border-[#3A3A3A] hover:bg-[#222]"
              >
                <img src="/yandex-icon.png" alt="" className="h-5 w-5 object-contain" />
                Яндекс
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-[#2A2A2A]" />
              <span className="text-xs text-[#6B6B6B]">или через почту</span>
              <div className="h-px flex-1 bg-[#2A2A2A]" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="mb-1 block text-xs text-[#A0A0A0]">Имя</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Как к вам обращаться"
                    className="w-full rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] px-4 py-3 text-[#E0E0E0] placeholder-[#6B6B6B] focus:border-[#8A2BE2] focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-[#A0A0A0]">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] px-4 py-3 text-[#E0E0E0] placeholder-[#6B6B6B] focus:border-[#8A2BE2] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[#A0A0A0]">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Минимум 6 символов' : '••••••••'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] px-4 py-3 text-[#E0E0E0] placeholder-[#6B6B6B] focus:border-[#8A2BE2] focus:outline-none"
                />
              </div>
              {emailError && (
                <p className="text-sm text-red-400">{emailError}</p>
              )}
              <button
                type="submit"
                disabled={emailBusy}
                className="w-full rounded-xl bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] py-3 font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
              >
                {emailBusy ? 'Проверка...' : mode === 'register' ? 'Зарегистрироваться' : 'Войти'}
              </button>
            </form>
          </div>

          <AnimatePresence>
            {hint && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden"
              >
                <div className="rounded-xl border border-[#8A2BE2]/50 bg-[#1A1A1A] p-4 text-sm text-[#A0A0A0]">
                  {hint}
                  <a
                    href="https://console.firebase.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-[#8A2BE2] hover:underline"
                  >
                    Открыть Firebase Console →
                  </a>
                  <button
                    type="button"
                    onClick={() => setHint(null)}
                    className="mt-2 text-[#E0E0E0] hover:underline"
                  >
                    Закрыть подсказку
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-xl border border-[#2A2A2A] py-2.5 text-[#A0A0A0] transition-colors hover:text-[#E0E0E0]"
          >
            Закрыть
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

