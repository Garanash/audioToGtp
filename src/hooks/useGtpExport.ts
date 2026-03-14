/**
 * Хук для экспорта в GTP / MIDI
 */

import { useCallback, useState } from 'react';
import type { MidiTrackData } from '../types/audio.types';
import {
  createMultiTrackMidi,
  createSingleTrackMidi,
  downloadBlob,
} from '../utils/midiUtils';
import type { AccuracyMode } from './useMidiConversion';

const DEFAULT_TEMPO = 120;
const POLL_INTERVAL_MS = 1200;
const POLL_MAX_ATTEMPTS = 300;

type AsyncTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'unknown';
interface AsyncTaskEvent {
  id: string;
  type: 'gtp';
  status: AsyncTaskStatus;
  title: string;
  progress?: number;
}
interface UseGtpExportOptions {
  onAsyncTask?: (task: AsyncTaskEvent) => void;
}

async function pollGtpResult(
  taskId: string,
  onTask?: (task: AsyncTaskEvent) => void
): Promise<Blob | null> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    const statusRes = await fetch(`/api/convert-to-gtp/status/${taskId}`);
    if (statusRes.ok) {
      const statusData = (await statusRes.json().catch(() => ({}))) as {
        status?: string;
        progress?: number;
      };
      if (statusData.status) {
        onTask?.({
          id: taskId,
          type: 'gtp',
          status: statusData.status as AsyncTaskStatus,
          title: 'GTP экспорт',
          progress: statusData.progress,
        });
      }
      if (statusData.status === 'completed') {
        const resultRes = await fetch(`/api/convert-to-gtp/result/${taskId}`);
        if (!resultRes.ok) return null;
        return resultRes.blob();
      }
      if (statusData.status === 'failed') return null;
      if (statusData.status === 'cancelled') return null;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return null;
}

export interface UseGtpExportResult {
  exportMidi: (
    tracks: MidiTrackData[],
    filename?: string,
    tempo?: number,
    keySignature?: string | null
  ) => void;
  exportSingleTrack: (
    track: MidiTrackData,
    filename?: string,
    tempo?: number,
    keySignature?: string | null
  ) => void;
  exportToGtp: (
    tracks: MidiTrackData[],
    tempo?: number,
    baseTempo?: number,
    keySignature?: string | null,
    accuracyMode?: AccuracyMode
  ) => Promise<Blob | null>;
  exportGtp: (
    tracks: MidiTrackData[],
    filename?: string,
    tempo?: number,
    baseTempo?: number,
    keySignature?: string | null,
    accuracyMode?: AccuracyMode
  ) => Promise<boolean>;
  gtpError: string | null;
}

export function useGtpExport(options: UseGtpExportOptions = {}): UseGtpExportResult {
  const [gtpError, setGtpError] = useState<string | null>(null);

  const exportMidi = useCallback(
    (
      tracks: MidiTrackData[],
      filename = 'converted.mid',
      tempo = DEFAULT_TEMPO,
      keySignature: string | null = null
    ) => {
      const blob = createMultiTrackMidi(tracks, tempo, keySignature);
      downloadBlob(blob, filename);
    },
    []
  );

  const exportSingleTrack = useCallback(
    (
      track: MidiTrackData,
      filename?: string,
      tempo = DEFAULT_TEMPO,
      keySignature: string | null = null
    ) => {
      const name = filename ?? `${track.instrument}.mid`;
      const blob = createSingleTrackMidi(track, tempo, keySignature);
      downloadBlob(blob, name);
    },
    []
  );

  const exportToGtp = useCallback(
    async (
      tracks: MidiTrackData[],
      tempo = DEFAULT_TEMPO,
      baseTempo = tempo,
      keySignature: string | null = null,
      accuracyMode: AccuracyMode = 'balanced'
    ): Promise<Blob | null> => {
      try {
        const body: {
          tracks: MidiTrackData[];
          tempo: number;
          baseTempo: number;
          key?: string;
          accuracyMode: AccuracyMode;
        } = {
          tracks,
          tempo,
          baseTempo,
          accuracyMode,
        };
        if (keySignature && keySignature.trim()) body.key = keySignature.trim();
        const response = await fetch('/api/convert-to-gtp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          let msg = text;
          try {
            const j = JSON.parse(text) as { detail?: string };
            if (j.detail) msg = j.detail;
          } catch {
            /* use text */
          }
          setGtpError(msg || `Ошибка ${response.status}`);
          return null;
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = (await response.json().catch(() => ({}))) as { taskId?: string };
          if (json.taskId) {
            options.onAsyncTask?.({ id: json.taskId, type: 'gtp', status: 'pending', title: 'GTP экспорт' });
            const blob = await pollGtpResult(json.taskId, options.onAsyncTask);
            if (!blob) {
              setGtpError('Не удалось получить результат GTP из очереди');
              return null;
            }
            options.onAsyncTask?.({ id: json.taskId, type: 'gtp', status: 'completed', title: 'GTP экспорт' });
            setGtpError(null);
            return blob;
          }
        }
        setGtpError(null);
        return response.blob();
      } catch (e) {
        setGtpError(e instanceof Error ? e.message : 'Сервер недоступен');
        return null;
      }
    },
    [options.onAsyncTask]
  );

  const exportGtp = useCallback(
    async (
      tracks: MidiTrackData[],
      filename = 'converted.gp5',
      tempo = DEFAULT_TEMPO,
      baseTempo = tempo,
      keySignature: string | null = null,
      accuracyMode: AccuracyMode = 'balanced'
    ): Promise<boolean> => {
      const blob = await exportToGtp(tracks, tempo, baseTempo, keySignature, accuracyMode);
      if (!blob) return false;
      downloadBlob(blob, filename);
      return true;
    },
    [exportToGtp]
  );

  return { exportMidi, exportSingleTrack, exportToGtp, exportGtp, gtpError };
}
