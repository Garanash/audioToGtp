/**
 * Хедер в стиле Moises: мега-меню с карточками, иконками, описаниями, анимацией и соцсетями.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { MegaDropdown } from './nav/MegaDropdown';
import {
  MADE_FOR_CARDS,
  FEATURES_CARDS,
  PLATFORMS_CARDS,
  MEDIA_CARDS,
  MediaDropdownFooter,
} from './nav/navConfig';

type DropdownKey = 'made-for' | 'features' | 'platforms' | 'media' | 'user';

const MEGA_MENUS: { key: DropdownKey; label: string }[] = [
  { key: 'made-for', label: 'Сделано для' },
  { key: 'features', label: 'Возможности' },
  { key: 'platforms', label: 'Платформы' },
  { key: 'media', label: 'Медиаматериалы' },
];

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function Header() {
  const { user, isLoading, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openLogin = () => {
    setAuthMode('login');
    setAuthModalOpen(true);
  };
  const openRegister = () => {
    setAuthMode('register');
    setAuthModalOpen(true);
  };

  const getCards = (key: DropdownKey) => {
    switch (key) {
      case 'made-for':
        return MADE_FOR_CARDS;
      case 'features':
        return FEATURES_CARDS;
      case 'platforms':
        return PLATFORMS_CARDS;
      case 'media':
        return MEDIA_CARDS;
      default:
        return [];
    }
  };

  const getFooter = (key: DropdownKey) => {
    if (key === 'media') return <MediaDropdownFooter />;
    return undefined;
  };

  return (
    <header
      className="fixed left-0 top-[var(--announcement-height)] z-50 w-full border-b transition-colors"
      style={{
        background: 'var(--bg-header)',
        borderColor: 'var(--header-border)',
      }}
    >
      <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between gap-10 px-4 md:px-6 lg:px-8">
        <a href="#" className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90">
          <h1 className="bg-gradient-to-r from-white to-gray-500 bg-clip-text text-xl font-extrabold tracking-tight text-transparent md:text-2xl">
            Audio to GTP
          </h1>
          <span className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-[#8A2BE2]/20">
            Converter
          </span>
        </a>

        <nav className="flex shrink-0 items-center gap-0.5" ref={dropdownRef}>
          {MEGA_MENUS.map(({ key, label }) => (
              <MegaDropdown
                key={key}
                label={label}
                cards={getCards(key)}
                isOpen={openDropdown === key}
                onClose={() => setOpenDropdown(null)}
                footer={getFooter(key)}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenDropdown((v) => (v === key ? null : key))
                  }
                  className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm font-medium text-[#A0A0A0] transition-all duration-200 hover:bg-[#1A1A1A] hover:text-[#E0E0E0]"
                >
                  {label}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${openDropdown === key ? 'rotate-180' : ''}`}
                  />
                </button>
              </MegaDropdown>
          ))}
          <a
            href="#guides"
            className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#A0A0A0] transition-all duration-200 hover:bg-[#1A1A1A] hover:text-[#E0E0E0]"
          >
            Руководства
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {!isLoading &&
              (user ? (
                <div className="relative flex items-center gap-3" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDropdown((v) => (v === 'user' ? null : 'user'))
                    }
                    className="flex items-center gap-2 rounded-full border border-[#2A2A2A] py-1.5 pl-1.5 pr-3 transition-all duration-200 hover:border-[#3A3A3A] hover:shadow-md"
                  >
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover ring-2 ring-[#2A2A2A]"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-sm font-bold text-white">
                        {(user.displayName || user.email || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <ChevronDown
                      className={`h-4 w-4 text-[#A0A0A0] transition-transform duration-200 ${openDropdown === 'user' ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <AnimatePresence>
                    {openDropdown === 'user' && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 top-full z-50 mt-2 min-w-[220px] rounded-2xl border border-[#2A2A2A] bg-[#111111] py-2 shadow-2xl"
                        style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
                      >
                        <div className="border-b border-[#2A2A2A] px-4 py-3">
                          <p className="truncate text-sm font-semibold text-[#E0E0E0]">
                            {user.displayName || 'Пользователь'}
                          </p>
                          {user.email && (
                            <p className="truncate text-xs text-[#A0A0A0]">
                              {user.email}
                            </p>
                          )}
                        </div>
                        <a
                          href="#"
                          className="block px-4 py-2.5 text-sm text-[#E0E0E0] transition-colors hover:bg-[#1A1A1A]"
                          onClick={() => setOpenDropdown(null)}
                        >
                          Мои проекты
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            signOut();
                            setOpenDropdown(null);
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-[#E0E0E0] transition-colors hover:bg-[#1A1A1A]"
                        >
                          Выход
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={openLogin}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-[#A0A0A0] transition-all duration-200 hover:bg-[#1A1A1A] hover:text-[#E0E0E0]"
                  >
                    Вход
                  </button>
                  <button
                    type="button"
                    onClick={openRegister}
                    className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#8A2BE2]/25 transition-all duration-300 hover:scale-105 hover:opacity-95 hover:shadow-[#8A2BE2]/40"
                  >
                    Регистрация
                  </button>
                </>
          ))}
        </div>
      </div>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        mode={authMode}
      />
    </header>
  );
}
