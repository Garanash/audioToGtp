import { motion } from 'framer-motion';
import { ProgressInlineBar } from './common/ProgressInlineBar';

const STATUS_LABELS: Record<string, string> = {
  preparing: 'Подготовка файла...',
  analyzing: 'Определение тональности и темпа...',
  'loading-model': 'Загрузка модели...',
  separating: 'Разделение на инструменты...',
  converting: 'Конвертация в GTP...',
  ready: 'Готово!',
  error: 'Ошибка',
};

interface ProcessingStatusProps {
  status: string;
  progress: number;
  downloadProgress?: number;
  error?: string;
  separationWarning?: string;
  usedFallback?: boolean;
}

export function ProcessingStatus({
  status,
  progress,
  downloadProgress = 0,
  error,
  separationWarning,
  usedFallback,
}: ProcessingStatusProps) {
  if (status === 'idle') return null;
  const isProcessing =
    status === 'preparing' ||
    status === 'analyzing' ||
    status === 'loading-model' ||
    status === 'separating' ||
    status === 'converting';

  if (isProcessing) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[88] flex items-center justify-center bg-[#0A0A0A]/55 backdrop-blur-[2px]"
      >
        <div className="w-full max-w-md px-4">
          <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111]/95 p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#8A2BE2] border-t-transparent" />
              <p className="text-sm font-medium text-[#E0E0E0]">{STATUS_LABELS[status] ?? status}</p>
            </div>
            <ProgressInlineBar value={progress} />
            {downloadProgress > 0 && downloadProgress < 100 && (
              <p className="mt-2 text-right text-[11px] text-[#7F7F7F]">
                Скачивание модели: {downloadProgress.toFixed(0)}%
              </p>
            )}
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8"
    >
      <div className="flex items-center gap-4">
        {status !== 'ready' && status !== 'error' && (
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#8A2BE2] border-t-transparent" />
        )}
        {status === 'ready' && (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-green-500 to-emerald-600">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
        <div className="flex-1">
          <p className="text-lg font-semibold text-[#E0E0E0]">
            {STATUS_LABELS[status] ?? status}
          </p>
          {error && (
            <p className="mt-1 text-sm text-red-400">{error}</p>
          )}
          {separationWarning && status === 'ready' && (
            <div
              className={`mt-3 rounded-lg border p-3 text-sm ${
                usedFallback
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                  : 'border-[#8A2BE2]/50 bg-[#8A2BE2]/10 text-[#A0A0A0]'
              }`}
            >
              <p className="font-medium">
                {usedFallback ? '⚠ Качество разделения' : '💡 Совет'}
              </p>
              <p className="mt-1">{separationWarning}</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
