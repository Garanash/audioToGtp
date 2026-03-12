/**
 * Хедер в стиле Moises: мега-меню с карточками, иконками, описаниями, анимацией и соцсетями.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
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

function CompactIconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-full border border-[#2A2A2A] bg-[#111111] p-1.5 text-[#E0E0E0] transition-colors hover:border-[#8A2BE2] hover:text-white"
    >
      {children}
    </button>
  );
}

export function Header() {
  const { user, isLoading, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
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
            src={`${import.meta.env.BASE_URL}musca-logo.png`}
            alt="Musca"
            className={`rounded-md object-cover transition-all ${compactMode ? 'h-14 w-14' : 'h-20 w-20'}`}
          />
        </a>

        <nav className="flex shrink-0 items-center gap-0.5" ref={dropdownRef}>
          {compactMode ? (
            <div className="flex items-center gap-1">
              <CompactIconButton
                title="Сделано для"
                onClick={() => {
                  expandHeader();
                  setOpenDropdown('made-for');
                }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
                  <path d="M3 12.5 12 17l9-4.5" />
                  <path d="M3 17.5 12 22l9-4.5" />
                </svg>
              </CompactIconButton>
              <CompactIconButton
                title="Возможности"
                onClick={() => {
                  expandHeader();
                  setOpenDropdown('features');
                }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 2v4M12 18v4M4 12h4m8 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8" />
                  <circle cx="12" cy="12" r="3.5" />
                </svg>
              </CompactIconButton>
              <CompactIconButton
                title="Платформы"
                onClick={() => {
                  expandHeader();
                  setOpenDropdown('platforms');
                }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="4" width="18" height="12" rx="2" />
                  <path d="M8 20h8M12 16v4" />
                </svg>
              </CompactIconButton>
              <CompactIconButton
                title="Медиаматериалы"
                onClick={() => {
                  expandHeader();
                  setOpenDropdown('media');
                }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="m4 7 8-4 8 4-8 4-8-4Z" />
                  <path d="M4 12l8 4 8-4M4 17l8 4 8-4" />
                </svg>
              </CompactIconButton>
            </div>
          ) : (
            <>
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
                  onClick={() => {
                    expandHeader();
                    setOpenDropdown((v) => (v === key ? null : key));
                  }}
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
            onClick={expandHeader}
            className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#A0A0A0] transition-all duration-200 hover:bg-[#1A1A1A] hover:text-[#E0E0E0]"
          >
            Руководства
          </a>
            </>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
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
