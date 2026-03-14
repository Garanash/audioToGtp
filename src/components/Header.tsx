/**
 * Хедер в стиле Moises: мега-меню с карточками, иконками, описаниями, анимацией и соцсетями.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { AuthModal } from './AuthModal';

type DropdownKey = 'user';

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
  const [openCabinetAfterAuth, setOpenCabinetAfterAuth] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [forceExpanded, setForceExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const expandTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(
    () => () => {
      if (expandTimerRef.current != null) {
        window.clearTimeout(expandTimerRef.current);
      }
    },
    []
  );

  const expandHeader = () => {
    setForceExpanded(true);
    if (expandTimerRef.current != null) {
      window.clearTimeout(expandTimerRef.current);
    }
    expandTimerRef.current = window.setTimeout(() => {
      setForceExpanded(false);
      expandTimerRef.current = null;
    }, 4000);
  };

  useEffect(() => {
    const onScroll = () => {
      setIsCompact(window.scrollY > 60);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: 'login' | 'register' }>).detail;
      setAuthMode(detail?.mode ?? 'register');
      setAuthModalOpen(true);
      expandHeader();
    };
    window.addEventListener('musca:openAuthModal', handler);
    return () => window.removeEventListener('musca:openAuthModal', handler);
  }, []);

  const openLogin = () => {
    expandHeader();
    setAuthMode('login');
    setAuthModalOpen(true);
  };
  const openRegister = () => {
    expandHeader();
    setAuthMode('register');
    setAuthModalOpen(true);
  };

  const compactMode = isCompact && !forceExpanded;

  return (
    <header
      className={`fixed left-0 top-[var(--announcement-height)] z-50 w-full border-b transition-all duration-300 ${compactMode ? 'backdrop-blur-xl' : ''}`}
      style={{
        background: compactMode ? 'rgba(10,10,10,0.92)' : 'var(--bg-header)',
        borderColor: 'var(--header-border)',
      }}
    >
      <div className={`mx-auto flex max-w-[1400px] items-center justify-between px-4 md:px-6 lg:px-8 ${compactMode ? 'h-14 gap-4' : 'h-20 gap-10'}`}>
        <a href="#" onClick={expandHeader} className="flex shrink-0 items-center transition-opacity hover:opacity-90">
          <img
            src={`${import.meta.env.BASE_URL}musicvibe-logo.png`}
            alt="Musicvibe"
            className={`rounded-md object-contain transition-all ${compactMode ? 'h-10' : 'h-12'}`}
          />
        </a>


        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              expandHeader();
              if (user) {
                window.dispatchEvent(new CustomEvent('musca:openCabinet'));
              } else {
                setOpenCabinetAfterAuth(true);
                openLogin();
              }
            }}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#A0A0A0] transition-all duration-200 hover:bg-[#1A1A1A] hover:text-[#E0E0E0]"
            aria-label="Личный кабинет"
          >
            Личный кабинет
          </button>
          {!isLoading &&
              (user ? (
                <div className="relative flex items-center gap-3" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      expandHeader();
                      setOpenDropdown((v) => (v === 'user' ? null : 'user'));
                    }}
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
                          href="#cabinet"
                          className="block px-4 py-2.5 text-sm text-[#E0E0E0] transition-colors hover:bg-[#1A1A1A]"
                          onClick={(e) => {
                            e.preventDefault();
                            setOpenDropdown(null);
                            window.dispatchEvent(new CustomEvent('musca:openCabinet'));
                          }}
                        >
                          Личный кабинет
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
        onClose={() => {
          setAuthModalOpen(false);
          setOpenCabinetAfterAuth(false);
        }}
        onSuccess={() => {
          if (openCabinetAfterAuth) {
            setOpenCabinetAfterAuth(false);
            window.dispatchEvent(new CustomEvent('musca:openCabinet'));
          }
        }}
        mode={authMode}
      />
    </header>
  );
}
