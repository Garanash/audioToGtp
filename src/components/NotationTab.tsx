/**
 * Вкладка нотной записи — загрузка GTP/MIDI и просмотр в AlphaTab
 */

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { AlphaTabPlayer } from './AlphaTabPlayer';
import type { MidiTrackData } from '../types/audio.types';
import { UploadDropzone } from './common/UploadDropzone';

const NOTATION_EXTENSIONS = /\.(gp|gp3|gp4|gp5|gpx|gp7|gtp|mid|midi|xml|musicxml)$/i;
interface NotationTabProps {
  convertedTracks?: MidiTrackData[] | null;
}

export function NotationTab({ convertedTracks }: NotationTabProps) {
  const [notationFile, setNotationFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userWantsUpload, setUserWantsUpload] = useState(false);

  const hasFile = notationFile !== null;
  const hasTracks = convertedTracks && convertedTracks.length > 0;
  const showPlayer = hasFile || (hasTracks && !userWantsUpload);

  const validateFile = useCallback((file: File): string | null => {
    if (!NOTATION_EXTENSIONS.test(file.name)) {
      return 'Поддерживаются: .gp, .gp3, .gp4, .gp5, .gpx, .gp7, .gtp, .mid, .midi, .xml';
    }
    if (file.size > 50 * 1024 * 1024) {
      return 'Максимальный размер: 50 МБ';
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const err = validateFile(file);
      if (err) {
        setError(err);
        return;
      }
      setNotationFile(file);
      setUserWantsUpload(false);
    },
    [validateFile]
  );

  const clearAndShowUpload = useCallback(() => {
    setNotationFile(null);
    setError(null);
    setUserWantsUpload(true);
  }, []);

  if (showPlayer) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex min-h-[calc(100vh-220px)] flex-col gap-4"
      >
        <div className="min-h-0 flex-1">
          {hasFile ? (
            <AlphaTabPlayer file={notationFile} fileName={notationFile?.name} onReplaceFile={clearAndShowUpload} />
          ) : (
            <AlphaTabPlayer
              tracks={convertedTracks!}
              onReplaceFile={clearAndShowUpload}
            />
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <UploadDropzone
        accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7,.gtp,.mid,.midi,.xml,.musicxml"
        onFileSelect={handleFile}
        title="Перетащите файл сюда или нажмите для выбора"
        subtitle="Ноты и табы: Guitar Pro, MIDI, MusicXML"
        formatsHint=".gp, .gp3, .gp4, .gp5, .gpx, .gp7, .gtp, .mid, .midi, .xml · до 50 МБ"
        icon={(
          <svg className="h-5 w-5 text-[#8A2BE2]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 4v10a3 3 0 1 1-2-2.82V6.2l6-1.5v8.8a3 3 0 1 1-2-2.82V7.3l-2 .5Z" />
            <path d="M3 7h7v1.8H3zm0 3.8h7v1.8H3zm0 3.8h7v1.8H3z" />
          </svg>
        )}
      />

      {error && (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      )}
    </motion.div>
  );
}
