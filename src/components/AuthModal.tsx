/**
 * Модальное окно входа: Google, Яндекс, VK.
 * Если Firebase не настроен — показываем те же кнопки; при нажатии выводим короткую подсказку.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'login' | 'register';
}

export function AuthModal({ isOpen, onClose, mode = 'login' }: AuthModalProps) {
  const { signInWithGoogle, signInWithYandex, signInWithVk, isConfigured } = useAuth();
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) setHint(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGoogle = async () => {
    if (!isConfigured) {
      setHint('Скопируйте .env.example в .env и вставьте ключи из Firebase Console (Project settings → Your apps). Включите Google в Authentication → Sign-in method. Затем перезапустите: npm run dev');
      return;
    }
    await signInWithGoogle();
    onClose();
  };

  const handleYandex = async () => {
    if (!isConfigured) {
      setHint('Сначала настройте Firebase (см. подсказку для Google). Вход через Яндекс будет доступен позже.');
      return;
    }
    await signInWithYandex();
  };

  const handleVk = async () => {
    if (!isConfigured) {
      setHint('Сначала настройте Firebase (см. подсказку для Google). Вход через ВКонтакте будет доступен позже.');
      return;
    }
    await signInWithVk();
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
            Войдите через соцсеть, чтобы сохранять проекты и возвращаться к ним с любого устройства.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleGoogle}
              className="flex items-center justify-center gap-3 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-6 py-3 font-medium text-[#E0E0E0] transition-all hover:border-[#3A3A3A] hover:bg-[#222]"
            >
              <GoogleIcon />
              Войти через Google
            </button>
            <button
              type="button"
              onClick={handleYandex}
              className="flex items-center justify-center gap-3 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-6 py-3 font-medium text-[#E0E0E0] transition-all hover:border-[#3A3A3A] hover:bg-[#222]"
            >
              <YandexIcon />
              Войти через Яндекс
            </button>
            <button
              type="button"
              onClick={handleVk}
              className="flex items-center justify-center gap-3 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-6 py-3 font-medium text-[#E0E0E0] transition-all hover:border-[#3A3A3A] hover:bg-[#222]"
            >
              <VkIcon />
              Войти через ВКонтакте
            </button>
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

function YandexIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.04 12c0-5.523 4.476-10 10-10 5.522 0 10 4.477 10 10s-4.478 10-10 10c-5.524 0-10-4.477-10-10zm10-8c-4.411 0-8 3.589-8 8s3.589 8 8 8 8-3.589 8-8-3.589-8-8-8zm-1 3v2h2v6h2V7h2V5h-6z" />
    </svg>
  );
}

function VkIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.525-2.049-1.727-1.033-1-1.49-1.378-1.744-1.378-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 3.896-2.354 3.896-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.049.17.49-.085.744-.576.744z" />
    </svg>
  );
}
