/**
 * Кнопка и модальное окно: информация об альфа-тестировании и донаты.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

const SBER_COLLECTION_URL = 'https://messenger.online.sberbank.ru/sl/LEHUAIXDFPiaqnb85';
const DONATION_GOAL = 350_000;

export function AlphaModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-[99] flex h-12 w-12 items-center justify-center rounded-full border-0 bg-amber-500/90 text-xl font-bold text-black shadow-lg transition-all hover:scale-110 hover:bg-amber-400"
        aria-label="Информация о проекте"
        title="Альфа-тестирование"
      >
        !
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A0A0A]/95 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-4 top-4 text-[#6B6B6B] hover:text-[#E0E0E0]"
                aria-label="Закрыть"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <h3 className="text-2xl font-bold text-[#E0E0E0]">
                Alpha-тестирование
              </h3>
              <p className="mt-3 text-[#A0A0A0]">
                Веб-приложение Musicvibe находится в стадии альфа-тестирования. 
                Мы активно дорабатываем функционал и улучшаем стабильность.
              </p>
              <p className="mt-4 text-[#E0E0E0]">
                Принимаем донаты на покупку мощного сервера для обработки аудио. 
                Цель: <span className="font-bold text-amber-400">{DONATION_GOAL.toLocaleString('ru-RU')} ₽</span> — 
                на хорошее железо для быстрой работы Demucs и других инструментов.
              </p>

              <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] p-6">
                <p className="text-sm font-semibold text-[#E0E0E0]">
                  Сбор в СберБанк Онлайн
                </p>
                <a
                  href={SBER_COLLECTION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-[#1A1A1A]"
                >
                  <QRCodeSVG
                    value={SBER_COLLECTION_URL}
                    size={140}
                    level="M"
                    includeMargin={false}
                    className="rounded-lg bg-white p-2"
                  />
                  <span className="text-sm text-[#8A2BE2] hover:underline">
                    Открыть сбор →
                  </span>
                </a>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-6 w-full rounded-xl border border-[#2A2A2A] py-2.5 text-[#A0A0A0] transition-colors hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
              >
                Закрыть
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
