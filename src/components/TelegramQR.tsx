/**
 * Небольшой QR-код в правом нижнем углу, ведёт на страницу в Telegram.
 * Рамка в цветах сайта.
 */

import { QRCodeSVG } from 'qrcode.react';

/** Ссылка на группу/канал Telegram */
export const TELEGRAM_PAGE_URL = 'https://t.me/+Xq2sB7hBpcxjOGMy';

const QR_SIZE = 64;

export function TelegramQR() {
  return (
    <a
      href={TELEGRAM_PAGE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-[99] flex flex-col items-center rounded-lg border-0 p-1.5 shadow-lg transition-opacity hover:opacity-95"
      style={{ backgroundColor: '#4B0082' }}
      aria-label="Перейти в Telegram"
    >
      <span className="mb-1.5 text-xs font-semibold text-white">Подпишись</span>
      <span className="flex rounded bg-white p-1">
        <QRCodeSVG
          value={TELEGRAM_PAGE_URL}
          size={QR_SIZE}
          level="M"
          includeMargin={false}
          className="h-[64px] w-[64px]"
        />
      </span>
    </a>
  );
}
