/**
 * Мега-меню в стиле Moises: карточки с иконкой, описанием, анимацией при наведении.
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
  /** Градиент фона карточки (Tailwind или произвольный) */
  gradient?: string;
}

interface MegaDropdownProps {
  label: string;
  cards: MegaDropdownCard[];
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Дополнительный блок снизу (соцсети и т.д.) */
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
            <div
              className="fixed inset-0 z-40"
              aria-hidden
              onClick={onClose}
            />
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="absolute left-0 top-full z-50 mt-2 w-[min(90vw,640px)] rounded-2xl border border-[#2A2A2A] bg-[#111111] p-6 shadow-2xl"
              style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(138,43,226,0.08)' }}
            >
              <p className="mb-4 text-xs font-medium uppercase tracking-wider text-[#8A2BE2]">
                {label}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {cards.map((card, i) => (
                  <motion.a
                    key={card.id}
                    href={card.href}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="group relative flex gap-4 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A]/80 p-4 transition-all duration-300 hover:scale-[1.02] hover:border-[#8A2BE2]/50 hover:bg-[#1A1A1A] hover:shadow-lg hover:shadow-[#8A2BE2]/10"
                    onClick={onClose}
                  >
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${card.gradient ?? 'bg-gradient-to-br from-[#8A2BE2]/20 to-[#4B0082]/20'} text-[#E0E0E0] transition-transform duration-300 group-hover:scale-110 group-hover:text-white`}
                    >
                      {card.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-[#E0E0E0] transition-colors group-hover:text-white">
                        {card.title}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-sm text-[#A0A0A0]">
                        {card.description}
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#8A2BE2] group-hover:gap-2 group-hover:text-[#A855F7]">
                        {card.ctaText ?? 'Подробнее'}
                        <IconArrowRight />
                      </span>
                    </div>
                  </motion.a>
                ))}
              </div>
              {footer && (
                <div className="mt-6 border-t border-[#2A2A2A] pt-4">
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
