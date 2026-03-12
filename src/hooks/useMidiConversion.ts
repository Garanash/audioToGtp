/**
 * Хук для конвертации аудио в MIDI.
 * Поддерживает два режима: сервер (sound-to-midi) и клиент (Basic Pitch).
 */

import { useCallback, useState } from 'react';
import type { AudioStems, MidiTrackData, StemType } from '../types/audio.types';
import { STEM_ORDER } from '../types/audio.types';
import { audioBufferToWavBase64, resampleToMono22050 } from '../utils/audioBuffer';

type AsyncTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'unknown';
interface AsyncTaskEvent {
  id: string;
  type: 'midi';
  status: AsyncTaskStatus;
  title: string;
}
export type AccuracyMode = 'balanced' | 'max' | 'ultra' | 'extreme';

const getBasicPitchModelUrl = (): string => {
  const base =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
  const path = base.endsWith('/') ? `${base}models/basic-pitch/model.json` : `${base}/models/basic-pitch/model.json`;
  return path;
};

const MIDI_CONFIGS: Record<
  StemType,
  { onsetThresh: number; frameThresh: number; minNoteLen: number }
> = {
  vocals: { onsetThresh: 0.65, frameThresh: 0.35, minNoteLen: 6 },
  drums: { onsetThresh: 0.25, frameThresh: 0.18, minNoteLen: 3 },
  bass: { onsetThresh: 0.45, frameThresh: 0.28, minNoteLen: 8 },
  other: { onsetThresh: 0.45, frameThresh: 0.28, minNoteLen: 5 },
  guitar: { onsetThresh: 0.5, frameThresh: 0.3, minNoteLen: 6 },
  piano: { onsetThresh: 0.5, frameThresh: 0.3, minNoteLen: 5 },
};

const NOTE_POST_PROCESS: Record<
  StemType,
  {
    minDurationSec: number;
    quantizeStepSec: number;
    mergeGapSec: number;
    pitchRange?: [number, number];
    maxQuantizeShiftSec: number;
  }
> = {
  vocals: { minDurationSec: 0.06, quantizeStepSec: 0.02, mergeGapSec: 0.03, pitchRange: [36, 96], maxQuantizeShiftSec: 0.008 },
  drums: { minDurationSec: 0.03, quantizeStepSec: 0.01, mergeGapSec: 0.02, maxQuantizeShiftSec: 0.004 },
  bass: { minDurationSec: 0.08, quantizeStepSec: 0.02, mergeGapSec: 0.05, pitchRange: [28, 67], maxQuantizeShiftSec: 0.01 },
  guitar: { minDurationSec: 0.06, quantizeStepSec: 0.02, mergeGapSec: 0.04, pitchRange: [40, 88], maxQuantizeShiftSec: 0.01 },
  piano: { minDurationSec: 0.05, quantizeStepSec: 0.02, mergeGapSec: 0.03, pitchRange: [21, 108], maxQuantizeShiftSec: 0.008 },
  other: { minDurationSec: 0.05, quantizeStepSec: 0.02, mergeGapSec: 0.03, maxQuantizeShiftSec: 0.008 },
};

const PROGRAM_BY_INSTRUMENT: Record<StemType, number> = {
  vocals: 52, // Choir Aahs
  drums: 0, // ignored for percussion channel
  bass: 33, // Acoustic Bass
  guitar: 24, // Nylon Guitar
  piano: 0, // Acoustic Grand Piano
  other: 0,
};
const POLL_INTERVAL_MS = 1200;
const POLL_MAX_ATTEMPTS = 300;
const NOTE_CONFIDENCE_DEFAULT = 0.55;

function nearestAnchor(value: number, anchors: number[], windowSec: number): number | null {
  let best: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const delta = Math.abs(anchor - value);
    if (delta < bestDelta) {
      best = anchor;
      bestDelta = delta;
    }
    if (anchor > value + windowSec) break;
  }
  return bestDelta <= windowSec ? best : null;
}

function quantize(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function quantizeWithLimitedShift(value: number, step: number, maxShift: number): number {
  const snapped = quantize(value, step);
  const delta = snapped - value;
  if (Math.abs(delta) <= maxShift) return snapped;
  return value + Math.sign(delta) * maxShift;
}

function estimateNoteConfidence(
  note: { startTime: number; endTime: number; velocity: number; confidence?: number },
  minDurationSec: number
): number {
  if (typeof note.confidence === 'number' && Number.isFinite(note.confidence)) {
    return clamp(note.confidence, 0, 1);
  }
  const duration = Math.max(0.001, note.endTime - note.startTime);
  const durationScore = clamp(duration / Math.max(minDurationSec * 3, 0.12), 0, 1);
  const velocityScore = clamp(note.velocity / 127, 0, 1);
  return clamp(0.35 * durationScore + 0.65 * velocityScore, 0.05, 0.98);
}

function extractMixAnchors(original: AudioBuffer): number[] {
  const data = original.getChannelData(0);
  const sampleRate = original.sampleRate || 44100;
  const frameSize = Math.max(256, Math.floor(sampleRate * 0.02)); // ~20ms
  const energies: number[] = [];
  for (let i = 0; i < data.length; i += frameSize) {
    let sum = 0;
    const end = Math.min(data.length, i + frameSize);
    for (let j = i; j < end; j++) {
      const s = data[j];
      sum += s * s;
    }
    energies.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  if (energies.length < 4) return [];
  const anchors: number[] = [];
  const avgEnergy = energies.reduce((acc, v) => acc + v, 0) / energies.length;
  const threshold = avgEnergy * 1.6;
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > threshold && energies[i] > energies[i - 1] * 1.1 && energies[i] >= energies[i + 1]) {
      anchors.push((i * frameSize) / sampleRate);
    }
  }
  return anchors;
}

function buildGlobalOnsetAnchors(tracks: MidiTrackData[]): number[] {
  const onsets = tracks
    .flatMap((track) => track.notes.map((note) => note.startTime))
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  if (onsets.length < 2) return onsets;
  const clusters: { center: number; count: number }[] = [];
  const clusterWindow = 0.018;
  for (const onset of onsets) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(onset - last.center) <= clusterWindow) {
      const nextCount = last.count + 1;
      last.center = (last.center * last.count + onset) / nextCount;
      last.count = nextCount;
    } else {
      clusters.push({ center: onset, count: 1 });
    }
  }
  return clusters.filter((c) => c.count >= 2).map((c) => c.center);
}

function refineTrackByReference(
  track: MidiTrackData,
  anchors: number[],
  mixAnchors: number[],
  accuracyMode: AccuracyMode
): MidiTrackData {
  if (track.notes.length === 0) return track;
  const anchorWindow = accuracyMode === 'extreme' ? 0.03 : accuracyMode === 'ultra' ? 0.025 : 0.02;
  const lowConfidenceThreshold = accuracyMode === 'extreme' ? 0.58 : accuracyMode === 'ultra' ? 0.52 : 0.45;
  const notes = track.notes
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((note) => {
      const conf = estimateNoteConfidence(note, NOTE_POST_PROCESS[track.instrument].minDurationSec);
      let start = note.startTime;
      const anchor = nearestAnchor(start, anchors, anchorWindow);
      const mixAnchor = nearestAnchor(start, mixAnchors, anchorWindow * 1.3);
      if (conf < lowConfidenceThreshold && (anchor !== null || mixAnchor !== null)) {
        const target = anchor !== null && mixAnchor !== null ? (anchor + mixAnchor) / 2 : (anchor ?? mixAnchor ?? start);
        const blend = accuracyMode === 'extreme' ? 0.75 : 0.6;
        start = start + (target - start) * blend;
      }
      const duration = Math.max(
        NOTE_POST_PROCESS[track.instrument].minDurationSec,
        note.endTime - note.startTime
      );
      return {
        ...note,
        startTime: Math.max(0, start),
        endTime: Math.max(start + NOTE_POST_PROCESS[track.instrument].minDurationSec, start + duration),
        confidence: conf,
      };
    });

  const cleaned = notes.filter((note, idx, arr) => {
    if (idx === 0) return true;
    const prev = arr[idx - 1];
    const samePitch = prev.pitch === note.pitch;
    const nearDuplicate = samePitch && Math.abs(prev.startTime - note.startTime) < 0.01;
    const weaker = (prev.confidence ?? NOTE_CONFIDENCE_DEFAULT) >= (note.confidence ?? NOTE_CONFIDENCE_DEFAULT);
    return !(nearDuplicate && weaker);
  });

  const qualityScore = cleaned.length > 0
    ? cleaned.reduce((sum, n) => sum + (n.confidence ?? NOTE_CONFIDENCE_DEFAULT), 0) / cleaned.length
    : 0;

  return { ...track, notes: cleaned, qualityScore };
}

function refineTracksWithReference(
  tracks: MidiTrackData[],
  stems: AudioStems,
  accuracyMode: AccuracyMode
): MidiTrackData[] {
  if (accuracyMode === 'balanced') return tracks;
  const anchors = buildGlobalOnsetAnchors(tracks);
  const mixAnchors = extractMixAnchors(stems.original);
  return tracks.map((track) => refineTrackByReference(track, anchors, mixAnchors, accuracyMode));
}

function postProcessTrack(track: MidiTrackData, accuracyMode: AccuracyMode = 'balanced'): MidiTrackData {
  const cfg = NOTE_POST_PROCESS[track.instrument];
  const noteDensity = track.notes.length > 0
    ? track.notes.length / Math.max(1, track.notes[track.notes.length - 1].endTime - track.notes[0].startTime)
    : 0;
  const modeStepMultiplier =
    accuracyMode === 'extreme' ? 0.45 : accuracyMode === 'ultra' ? 0.6 : accuracyMode === 'max' ? 0.75 : 1;
  const modeMergeMultiplier =
    accuracyMode === 'extreme' ? 0.25 : accuracyMode === 'ultra' ? 0.45 : accuracyMode === 'max' ? 0.7 : 1;
  const modeShiftMultiplier =
    accuracyMode === 'extreme' ? 0.35 : accuracyMode === 'ultra' ? 0.5 : accuracyMode === 'max' ? 0.7 : 1;
  const dynamicStepBase = cfg.quantizeStepSec * modeStepMultiplier;
  const dynamicStep = noteDensity > 10 ? dynamicStepBase / 2 : noteDensity < 3 ? dynamicStepBase * 1.5 : dynamicStepBase;
  const mergeGap = cfg.mergeGapSec * modeMergeMultiplier;
  const maxShift = cfg.maxQuantizeShiftSec * modeShiftMultiplier;
  const minDuration = cfg.minDurationSec * (accuracyMode === 'extreme' ? 0.75 : accuracyMode === 'ultra' ? 0.85 : 1);
  const notes = [...track.notes]
    .map((n) => {
      const start = Math.max(0, quantizeWithLimitedShift(n.startTime, dynamicStep, maxShift));
      const endRaw = Math.max(
        start + minDuration,
        quantizeWithLimitedShift(n.endTime, dynamicStep, maxShift)
      );
      const pitch = cfg.pitchRange
        ? clamp(Math.round(n.pitch), cfg.pitchRange[0], cfg.pitchRange[1])
        : Math.round(n.pitch);
      return {
        pitch,
        startTime: start,
        endTime: endRaw,
        velocity: clamp(Math.round(n.velocity), 1, 127),
        confidence: estimateNoteConfidence(n, minDuration),
      };
    })
    .filter((n) => n.endTime - n.startTime >= minDuration)
    .sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);

  const merged: typeof notes = [];
  for (const note of notes) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.pitch === note.pitch &&
      note.startTime - last.endTime <= mergeGap
    ) {
      last.endTime = Math.max(last.endTime, note.endTime);
      last.velocity = Math.max(last.velocity, note.velocity);
      continue;
    }
    merged.push({ ...note });
  }

  for (let i = 0; i < merged.length - 1; i++) {
    const current = merged[i];
    const next = merged[i + 1];
    if (current.pitch === next.pitch && current.endTime > next.startTime) {
      current.endTime = Math.max(current.startTime + minDuration, next.startTime);
    }
  }

  return {
    ...track,
    notes: merged,
    program: track.program ?? PROGRAM_BY_INSTRUMENT[track.instrument],
    qualityScore:
      merged.length > 0
        ? merged.reduce((sum, n) => sum + (n.confidence ?? NOTE_CONFIDENCE_DEFAULT), 0) / merged.length
        : 0,
  };
}

function postProcessTracks(tracks: MidiTrackData[], accuracyMode: AccuracyMode = 'balanced'): MidiTrackData[] {
  return tracks.map((track) => postProcessTrack(track, accuracyMode));
}

export interface ConvertOptions {
  /** true = все 6 дорожек в порядке STEM_ORDER (пустые при отсутствии стема), false = только дорожки с данными (1 для моно) */
  multiTrack?: boolean;
  /** true = конвертация на сервере через sound-to-midi (PyPI), false = Basic Pitch в браузере */
  useServerMidi?: boolean;
  accuracyMode?: AccuracyMode;
}

export interface UseMidiConversionResult {
  tracks: MidiTrackData[] | null;
  isLoading: boolean;
  progress: number;
  error: string | null;
  convert: (stems: AudioStems, options?: ConvertOptions) => Promise<MidiTrackData[] | null>;
  reset: () => void;
}

interface UseMidiConversionOptions {
  onAsyncTask?: (task: AsyncTaskEvent) => void;
}

export function useMidiConversion(hookOptions: UseMidiConversionOptions = {}): UseMidiConversionResult {
  const [tracks, setTracks] = useState<MidiTrackData[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const convert = useCallback(
    async (stems: AudioStems, options?: ConvertOptions): Promise<MidiTrackData[] | null> => {
      const multiTrack = options?.multiTrack ?? true;
      const useServerMidi = options?.useServerMidi ?? true;
      const accuracyMode = options?.accuracyMode ?? 'balanced';
      setIsLoading(true);
      setProgress(0);
      setError(null);
      setTracks(null);

      const stemEntries: [StemType, AudioBuffer | undefined][] = [
        ['vocals', stems.vocals],
        ['drums', stems.drums],
        ['bass', stems.bass],
        ['guitar', stems.guitar],
        ['piano', stems.piano],
        ['other', stems.other],
      ];

      if (useServerMidi) {
        try {
          setProgress(10);
          const stemsPayload: Record<string, string> = {};
          const withBuffer = stemEntries.filter(([, b]) => b) as [StemType, AudioBuffer][];
          for (let i = 0; i < withBuffer.length; i++) {
            const [instrument, buffer] = withBuffer[i];
            stemsPayload[instrument] = await audioBufferToWavBase64(buffer);
            setProgress(10 + Math.round((i + 1) / withBuffer.length * 80));
          }
          if (Object.keys(stemsPayload).length === 0) {
            setError('Нет аудио для конвертации');
            setIsLoading(false);
            return null;
          }
          const res = await fetch('/api/convert-to-midi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stems: stemsPayload, multiTrack, accuracyMode }),
          });
          if (res.status === 503 || res.status === 500) {
            setError(null);
            return convert(stems, { ...options, useServerMidi: false });
          }
          if (!res.ok) {
            const text = await res.text();
            let msg = text;
            try {
              const j = JSON.parse(text) as { detail?: string };
              if (j.detail) msg = j.detail;
            } catch {
              /* use text as is */
            }
            throw new Error(msg || `Ошибка ${res.status}`);
          }
          const data = await res.json();
          let serverTracks = (data.tracks || []) as MidiTrackData[];
          if (typeof data?.taskId === 'string') {
            const taskId = data.taskId as string;
            hookOptions.onAsyncTask?.({ id: taskId, type: 'midi', status: 'pending', title: 'MIDI конвертация' });
            for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
              const statusRes = await fetch(`/api/convert-to-midi/status/${taskId}`);
              if (statusRes.ok) {
                const statusData = (await statusRes.json().catch(() => ({}))) as { status?: string };
                if (statusData.status) {
                  hookOptions.onAsyncTask?.({
                    id: taskId,
                    type: 'midi',
                    status: statusData.status as AsyncTaskStatus,
                    title: 'MIDI конвертация',
                  });
                }
                if (statusData.status === 'completed') {
                  const resultRes = await fetch(`/api/convert-to-midi/result/${taskId}`);
                  if (!resultRes.ok) throw new Error('Не удалось получить результат конвертации MIDI');
                  const resultData = await resultRes.json().catch(() => ({}));
                  serverTracks = (resultData.tracks || []) as MidiTrackData[];
                  hookOptions.onAsyncTask?.({ id: taskId, type: 'midi', status: 'completed', title: 'MIDI конвертация' });
                  break;
                }
                if (statusData.status === 'failed') {
                  throw new Error('Серверная MIDI-задача завершилась с ошибкой');
                }
                if (statusData.status === 'cancelled') {
                  throw new Error('MIDI-задача отменена');
                }
              }
              setProgress(Math.min(98, 30 + Math.round((i / POLL_MAX_ATTEMPTS) * 60)));
              await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            }
          }
          const tracksData = refineTracksWithReference(
            postProcessTracks(serverTracks, accuracyMode),
            stems,
            accuracyMode
          );
          setTracks(tracksData);
          setProgress(100);
          setIsLoading(false);
          return tracksData;
        } catch (err) {
          console.warn('Server MIDI conversion failed, falling back to Basic Pitch:', err);
          setError(null);
          return convert(stems, { ...options, useServerMidi: false });
        }
      }

      try {
        const {
          BasicPitch,
          noteFramesToTime,
          addPitchBendsToNoteEvents,
          outputToNotesPoly,
        } = await import('@spotify/basic-pitch');

        const basicPitch = new BasicPitch(getBasicPitchModelUrl());

        const resultTracks: MidiTrackData[] = [];

        const total = stemEntries.filter(([, b]) => b).length;
        let completed = 0;

        for (const [instrument, buffer] of stemEntries) {
          if (!buffer) continue;

          const config = (() => {
            const base = MIDI_CONFIGS[instrument];
            if (accuracyMode === 'balanced') return base;
            if (accuracyMode === 'max') {
              return {
                onsetThresh: Math.max(0.05, base.onsetThresh - 0.08),
                frameThresh: Math.max(0.05, base.frameThresh - 0.06),
                minNoteLen: Math.max(2, base.minNoteLen - 1),
              };
            }
            if (accuracyMode === 'ultra') {
              return {
                onsetThresh: Math.max(0.03, base.onsetThresh - 0.12),
                frameThresh: Math.max(0.03, base.frameThresh - 0.09),
                minNoteLen: Math.max(1, base.minNoteLen - 2),
              };
            }
            return {
              onsetThresh: Math.max(0.02, base.onsetThresh - 0.16),
              frameThresh: Math.max(0.02, base.frameThresh - 0.12),
              minNoteLen: 1,
            };
          })();
          const resampledBuffer = resampleToMono22050(buffer);

          const frames: number[][] = [];
          const onsets: number[][] = [];
          const contours: number[][] = [];

          await basicPitch.evaluateModel(
            resampledBuffer,
            (f: number[][], o: number[][], c: number[][]) => {
              frames.push(...f);
              onsets.push(...o);
              contours.push(...c);
            },
            (p: number) => {
              const stemProgress =
                (completed / total) * 100 + (p / total) * 25;
              setProgress(stemProgress);
            }
          );

          const notes = noteFramesToTime(
            addPitchBendsToNoteEvents(
              contours,
              outputToNotesPoly(
                frames,
                onsets,
                config.onsetThresh,
                config.frameThresh,
                config.minNoteLen
              )
            )
          );

          const midiNotes = notes.map((n) => ({
            pitch: Math.round(n.pitchMidi),
            startTime: n.startTimeSeconds,
            endTime: n.startTimeSeconds + n.durationSeconds,
            velocity: Math.round((n.amplitude ?? 0.8) * 127),
          }));

          resultTracks.push(postProcessTrack({ instrument, notes: midiNotes }, accuracyMode));
          completed++;
          setProgress((completed / total) * 100);
        }

        const finalTracks = multiTrack
          ? (() => {
              const byInstrument = new Map(resultTracks.map((t) => [t.instrument, t]));
              return STEM_ORDER.map((instrument) => byInstrument.get(instrument) ?? { instrument, notes: [] });
            })()
          : resultTracks;
        const refinedTracks = refineTracksWithReference(finalTracks, stems, accuracyMode);
        setTracks(refinedTracks);
        setProgress(100);
        return refinedTracks;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Ошибка конвертации в MIDI';
        setError(message);
        console.error('MIDI conversion error:', err);

        const withData = stemEntries
          .filter(([, buf]) => buf)
          .map(([instrument]) => ({ instrument, notes: [] } as MidiTrackData));
        const emptyTracks = multiTrack
          ? (() => {
              const byInstrument = new Map(withData.map((t) => [t.instrument, t]));
              return STEM_ORDER.map((instrument) => byInstrument.get(instrument) ?? { instrument, notes: [] });
            })()
          : withData;
        setTracks(emptyTracks);
        setProgress(100);
        return emptyTracks;
      } finally {
        setIsLoading(false);
      }
    },
    [hookOptions.onAsyncTask]
  );

  const reset = useCallback(() => {
    setTracks(null);
    setProgress(0);
    setError(null);
  }, []);

  return { tracks, isLoading, progress, error, convert, reset };
}
