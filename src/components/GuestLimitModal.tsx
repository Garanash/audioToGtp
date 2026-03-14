/**
 * Модалка при достижении лимита гостя: предлагает зарегистрироваться.
 */

import { motion } from 'framer-motion';

const AUTH_EVENT = 'musca:openAuthModal';

function openAuthModal(mode: 'login' | 'register' = 'register') {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { mode } }));
}

interface GuestLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionName: string;
}

export function GuestLimitModal({ isOpen, onClose, actionName }: GuestLimitModalProps) {
  if (!isOpen) return null;

  const handleRegister = () => {
    onClose();
    openAuthModal('register');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0A0A0A]/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="mx-4 w-full max-w-md rounded-2xl border border-[#2A2A2A] bg-[#111111] p-6 shadow-2xl"
      >
        <h3 className="text-lg font-bold text-[#E0E0E0]">
          Лимит гостевого доступа
        </h3>
        <p className="mt-3 text-sm text-[#A0A0A0]">
          Вы уже использовали «{actionName}» в этом режиме. Зарегистрируйтесь для неограниченного доступа ко всем инструментам.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#2A2A2A] px-4 py-2.5 text-sm text-[#A0A0A0] hover:bg-[#1A1A1A] hover:text-[#E0E0E0]"
          >
            Закрыть
          </button>
          <button
            type="button"
            onClick={handleRegister}
            className="flex-1 rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
          >
            Регистрация
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
