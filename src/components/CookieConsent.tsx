/**
 * Баннер согласия на использование cookies (в стиле Osano).
 * Только текст, ссылка на политику и кнопка «Принят». Без QR-кода.
 */

import { useState, useEffect } from 'react';

const COOKIE_CONSENT_KEY = 'cookie-consent-accepted';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const accepted = localStorage.getItem(COOKIE_CONSENT_KEY);
      setVisible(accepted !== 'true');
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
      setVisible(false);
    } catch {
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Баннер согласия на использование файлов cookie"
      aria-describedby="cookie-consent-description"
      className="fixed bottom-6 left-6 z-[100] w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#2A2A2A] bg-[#111111] p-5 shadow-2xl"
    >
      <p
        id="cookie-consent-description"
        className="text-sm leading-relaxed text-[#E0E0E0]"
      >
        Этот веб-сайт использует такие технологии, как файлы cookie, для
        обеспечения основных функций сайта, а также для аналитики,
        персонализации и таргетированной рекламы.
      </p>
      <a
        href="/privacy"
        className="mt-2 inline-block text-sm font-medium text-[#8A2BE2] underline transition-colors hover:text-[#A855F7]"
      >
        Политика конфиденциальности
      </a>
      <button
        type="button"
        onClick={accept}
        className="mt-4 w-full rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] py-2.5 text-sm font-semibold text-white transition-all hover:opacity-95"
      >
        Принят
      </button>
    </div>
  );
}
