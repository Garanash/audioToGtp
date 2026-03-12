/**
 * Проигрыватель нотной записи — iframe со standalone AlphaTab
 * AlphaTab не поддерживает импорт MIDI, поэтому MIDI конвертируется в MusicXML
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { MidiTrackData } from '../types/audio.types';
import {
  midiTrackDataToMusicXml,
  midiBufferToMusicXmlData,
} from '../utils/midiToMusicXml';

const MIDI_EXT = /\.(mid|midi)$/i;

interface AlphaTabPlayerProps {
  file?: File | null;
  tracks?: MidiTrackData[] | null;
  /** Темп воспроизведения (BPM). Для файла — переопределение; для tracks — темп звучания. */
  tempo?: number;
  /** Темп для раскладки нот (секунды → длительности). Если не задан, используется tempo — тогда смена темпа не меняет скорость воспроизведения для tracks. */
  layoutTempo?: number;
  /** Тональность (например "C", "Am", "F#"). */
  keySignature?: string | null;
  fileName?: string;
  onReplaceFile?: () => void;
}

interface TrackMetaItem {
  instrument: string;
  program: number;
}

export function AlphaTabPlayer({
  file,
  tracks,
  tempo,
  layoutTempo,
  keySignature = null,
  fileName,
  onReplaceFile,
}: AlphaTabPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const urlRef = useRef<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [sourceTempo, setSourceTempo] = useState<number>(layoutTempo ?? tempo ?? 120);
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const source = file ?? (tracks && tracks.length > 0 ? 'tracks' : null);

  useEffect(() => {
    if (!source) return;

    setError(null);
    setIsPreparing(true);
    let cancelled = false;

    const run = async () => {
      try {
        let blob: Blob;
        if (file) {
          if (MIDI_EXT.test(file.name)) {
            const buf = await file.arrayBuffer();
            const { xml, sourceTempo: midiTempo } = await midiBufferToMusicXmlData(buf);
            blob = new Blob([xml], { type: 'application/xml' });
            if (!cancelled) {
              setSourceTempo(midiTempo);
            }
          } else {
            blob = file;
            if (!cancelled) {
              setSourceTempo(layoutTempo ?? tempo ?? 120);
            }
          }
        } else if (tracks && tracks.length > 0) {
          const layout = layoutTempo ?? tempo ?? 120;
          const xml = midiTrackDataToMusicXml(tracks, layout, keySignature ?? null);
          blob = new Blob([xml], { type: 'application/xml' });
          if (!cancelled) {
            setSourceTempo(layout);
          }
        } else {
          return;
        }

        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setObjectUrl(url);
        setIsPreparing(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Ошибка загрузки');
          setObjectUrl(null);
          setIsPreparing(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      const prev = urlRef.current;
      urlRef.current = null;
      if (prev) URL.revokeObjectURL(prev);
      setObjectUrl(null);
      setIsPreparing(false);
    };
  }, [source, file, tracks, layoutTempo, keySignature]);

  if (!source) return null;

  const base = import.meta.env.BASE_URL;
  const hasTempoOverride = typeof tempo === 'number' && Number.isFinite(tempo) && tempo > 0;
  const tempoParam = hasTempoOverride ? Math.max(20, Math.min(300, Math.round(tempo as number))) : null;
  const resolvedBaseTempo = Number.isFinite(sourceTempo) && sourceTempo > 0 ? sourceTempo : 120;
  const baseTempoParam = Math.max(20, Math.min(300, Math.round(resolvedBaseTempo)));
  const trackMeta: TrackMetaItem[] = (tracks ?? []).map((t) => ({
    instrument: t.instrument,
    program:
      typeof t.program === 'number'
        ? t.program
        : t.instrument === 'bass'
          ? 33
          : t.instrument === 'guitar'
            ? 24
            : 0,
  }));
  const trackMetaParam = tracks && tracks.length > 0
    ? encodeURIComponent(JSON.stringify(trackMeta))
    : '';
  const playerUrl = objectUrl
    ? `${base}alphatab-player.html?file=${encodeURIComponent(objectUrl)}` +
      `&baseTempo=${baseTempoParam}` +
      (tempoParam ? `&tempo=${tempoParam}` : '') +
      (fileName ? `&fileName=${encodeURIComponent(fileName)}` : '') +
      (trackMetaParam ? `&trackMeta=${trackMetaParam}` : '')
    : 'about:blank';

  useEffect(() => {
    setIframeLoaded(false);
  }, [playerUrl]);

  useEffect(() => {
    if (!iframeLoaded) return;
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    if (!tempoParam) return;
    frame.contentWindow.postMessage(
      {
        type: 'setTempo',
        tempo: tempoParam,
        baseTempo: baseTempoParam,
      },
      '*'
    );
  }, [iframeLoaded, tempoParam, baseTempoParam]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const current = document.fullscreenElement;
      setIsFullscreen(Boolean(current && containerRef.current && current === containerRef.current));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen();
      return;
    }
    await containerRef.current.requestFullscreen();
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative h-full min-h-[calc(100vh-220px)] overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111] ${
        isFullscreen ? 'min-h-screen rounded-none border-0' : ''
      }`}
    >
      <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
        {onReplaceFile && (
          <button
            type="button"
            onClick={onReplaceFile}
            className="rounded-full border border-[#2A2A2A] bg-[#0A0A0A]/90 px-3 py-1.5 text-xs font-medium text-[#A0A0A0] transition-colors hover:border-[#8A2BE2] hover:text-[#E0E0E0]"
          >
            Заменить файл
          </button>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-full border border-[#2A2A2A] bg-[#0A0A0A]/90 px-3 py-1.5 text-xs font-medium text-[#A0A0A0] transition-colors hover:border-[#8A2BE2] hover:text-[#E0E0E0]"
        >
          {isFullscreen ? 'Свернуть' : 'На весь экран'}
        </button>
      </div>
      <iframe
        key={playerUrl}
        ref={iframeRef}
        src={playerUrl}
        title="Нотная запись"
        className={`h-full min-h-[500px] w-full border-0 ${!objectUrl ? 'hidden' : ''}`}
        sandbox="allow-scripts allow-same-origin"
        allowFullScreen
        onLoad={() => setIframeLoaded(true)}
      />
      {!objectUrl && (
        <div className="flex min-h-[500px] items-center justify-center bg-[#0A0A0A] px-6">
          {isPreparing ? (
            <div className="text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#8A2BE2] border-t-transparent" />
              <p className="text-sm text-[#A0A0A0]">Подготавливаем нотную запись...</p>
            </div>
          ) : error ? (
            <div className="max-w-md rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              {error}
            </div>
          ) : (
            <p className="text-sm text-[#A0A0A0]">Нет данных для отображения.</p>
          )}
        </div>
      )}
      {error && (
        <p className="p-4 text-sm text-red-400">{error}</p>
      )}
    </motion.div>
  );
}
