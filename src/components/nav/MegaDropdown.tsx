/**
 * Мега-меню в стиле Moises.ai: карточки с крупным визуалом слева, заголовком и CTA справа.
 */

import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconArrowRight } from './NavIcons';

export interface MegaDropdownCard {
  id: string;
  title: string;
  description: string;
  href: string;
  ctaText?: string;
  icon: ReactNode;
  /** Градиент или фон блока с картинкой (Tailwind) */
  gradient?: string;
  /** Опционально: URL картинки как на Moises */
  imageUrl?: string;
}

interface MegaDropdownProps {
  label: string;
  cards: MegaDropdownCard[];
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function MegaDropdown({
  label,
  cards,
  isOpen,
  onClose,
  children,
  footer,
}: MegaDropdownProps) {
  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" aria-hidden onClick={onClose} />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="absolute left-0 top-full z-50 mt-1.5 w-[min(92vw,680px)] rounded-2xl bg-[#0F0F0F] p-5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]"
              style={{ boxShadow: '0 24px 48px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)' }}
            >
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8A2BE2]">
                {label}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {cards.map((card, i) => (
                  <motion.a
                    key={card.id}
                    href={card.href}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="group relative flex overflow-hidden rounded-2xl bg-[#161616] transition-all duration-200 hover:bg-[#1C1C1C] hover:shadow-[0_8px_24px_-4px_rgba(138,43,226,0.15)]"
                    onClick={onClose}
                  >
                    {/* Блок изображения/иконки слева — как на Moises */}
                    <div
                      className={`relative flex h-[100px] w-[100px] shrink-0 items-center justify-center sm:h-[110px] sm:w-[110px] ${card.gradient ?? 'bg-gradient-to-br from-[#8A2BE2]/25 to-[#4B0082]/25'}`}
                    >
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt=""
                          className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                        />
                      ) : (
                        <span className="flex items-center justify-center text-[#E8E8E8] [&_svg]:h-12 [&_svg]:w-12 transition-transform duration-200 group-hover:scale-110">
                          {card.icon}
                        </span>
                      )}
                    </div>
                    {/* Контент справа */}
                    <div className="flex min-w-0 flex-1 flex-col justify-center px-5 py-4">
                      <h4 className="text-base font-bold tracking-tight text-[#F0F0F0] group-hover:text-white">
                        {card.title}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[#9A9A9A]">
                        {card.description}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#8A2BE2] transition-all group-hover:gap-2 group-hover:text-[#A855F7]">
                        {card.ctaText ?? 'Подробнее'}
                        <IconArrowRight />
                      </span>
                    </div>
                  </motion.a>
                ))}
              </div>
              {footer && (
                <div className="mt-5 border-t border-white/[0.06] pt-4">
                  {footer}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
