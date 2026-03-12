import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import type { AudioFileUpload } from '../types/audio.types';
import {
  SUPPORTED_AUDIO_FORMATS,
  MAX_FILE_SIZE_BYTES,
} from '../types/audio.types';
import { UploadDropzone } from './common/UploadDropzone';
import { ProgressInlineBar } from './common/ProgressInlineBar';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  onStemsSelect?: (files: File[]) => void;
  onWaveformReady?: (waveform: number[]) => void;
  disabled?: boolean;
  isProcessing?: boolean;
  processingStatusLabel?: string;
  processingProgress?: number;
}

export function FileUploader({
  onFileSelect,
  onStemsSelect,
  onWaveformReady,
  disabled = false,
  isProcessing = false,
  processingStatusLabel = 'Обработка...',
  processingProgress = 0,
}: FileUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AudioFileUpload | null>(null);
  const [showStemsUpload, setShowStemsUpload] = useState(false);

  const validateFile = useCallback((file: File): string | null => {
    const isValidType = SUPPORTED_AUDIO_FORMATS.some(
      (fmt) => file.type === fmt || file.name.match(/\.(mp3|wav|flac|m4a)$/i)
    );
    if (!isValidType) {
      return 'Поддерживаются только MP3, WAV, FLAC, M4A';
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `Максимальный размер файла: ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`;
    }
    return null;
  }, []);

  const processFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const ctx = new AudioContext();
        ctx.decodeAudioData(reader.result as ArrayBuffer).then(
          (buffer) => {
            const waveform: number[] = [];
            const data = buffer.getChannelData(0);
            const blockSize = Math.floor(data.length / 512);
            for (let i = 0; i < 512; i++) {
              const start = i * blockSize;
              const slice = data.slice(start, start + blockSize);
              waveform.push(
                slice.length > 0 ? Math.max(...slice.map(Math.abs)) : 0
              );
            }
            setPreview({
              file,
              buffer,
              duration: buffer.duration,
              waveform,
            });
            onWaveformReady?.(waveform);
          },
          () => setError('Не удалось декодировать аудиофайл')
        );
      };
      reader.readAsArrayBuffer(file);
      onFileSelect(file);
    },
    [onFileSelect, onWaveformReady, validateFile]
  );

  const handleStemsInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length >= 2 && onStemsSelect) {
        onStemsSelect(files);
      } else if (files.length > 0) {
        setError('Нужно минимум 2 файла (vocals.wav, drums.wav, bass.wav, other.wav)');
      }
      e.target.value = '';
    },
    [onStemsSelect]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full"
    >
      <div>
        <UploadDropzone
          accept=".mp3,.wav,.flac,.m4a,audio/*"
          onFileSelect={processFile}
          disabled={disabled}
          title="Перетащите файл сюда или нажмите для выбора"
          subtitle="Разделение на дорожки: Music, Vocal, Bass, Drums и другие"
          formatsHint="MP3, WAV, FLAC, M4A — до 100 МБ"
          emptyFooter={onStemsSelect ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowStemsUpload(!showStemsUpload);
                setError(null);
              }}
              className="mt-1 text-xs text-[#8A2BE2] hover:underline"
            >
              {showStemsUpload ? 'Скрыть' : 'Или загрузить готовые stems'}
            </button>
          ) : null}
        />

        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-6 max-w-2xl rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-4"
          >
            <ProgressInlineBar value={processingProgress} label={processingStatusLabel} />
          </motion.div>
        )}

        {showStemsUpload && onStemsSelect && (
          <div className="mt-4 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] p-4">
            <p className="mb-2 text-sm text-[#A0A0A0]">
              Выберите 4 WAV-файла (vocals, drums, bass, other) — например из{' '}
              <code className="rounded bg-[#1A1A1A] px-1">python scripts/separate_audio.py track.wav</code>
            </p>
            <input
              type="file"
              accept=".wav,audio/wav"
              multiple
              onChange={handleStemsInputChange}
              className="block w-full text-sm text-[#A0A0A0] file:mr-4 file:rounded file:border-0 file:bg-[#8A2BE2] file:px-4 file:py-2 file:text-white"
            />
          </div>
        )}

        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8"
          >
            <div className="flex items-center gap-4 overflow-hidden rounded-xl bg-[#1A1A1A] p-4">
              <div className="min-w-0 shrink-0">
                <p className="truncate font-medium text-[#E0E0E0]">
                  {preview.file.name}
                </p>
                <p className="text-sm text-[#A0A0A0]">
                  {preview.duration.toFixed(1)} сек
                </p>
              </div>
              {preview.waveform && preview.waveform.length > 0 && (
                <div className="flex min-w-0 max-w-[60%] flex-1 items-center overflow-hidden">
                  <div className="flex h-12 w-full items-end justify-between gap-0.5 overflow-hidden rounded">
                    {preview.waveform.slice(0, 150).map((v, i) => (
                      <div
                        key={i}
                        className="min-w-[2px] flex-1 rounded-sm bg-gradient-to-t from-[#4B0082] to-[#8A2BE2]"
                        style={{
                          height: `${Math.max(2, Math.min(48, v * 45))}px`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-center text-red-400"
          >
            {error}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
