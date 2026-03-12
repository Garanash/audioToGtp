import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { audioBufferToWavBlob, fileToAudioBuffer } from '../utils/audioBuffer';
import { useAudioSeparation } from '../hooks/useAudioSeparation';
import { UploadDropzone } from './common/UploadDropzone';
import { ProgressInlineBar } from './common/ProgressInlineBar';

export type ToolMode =
  | 'all'
  | 'vocal-remover'
  | 'pitcher'
  | 'time-signature'
  | 'cutter'
  | 'joiner'
  | 'recorder'
  | 'karaoke';

interface ToolsTabProps {
  mode?: ToolMode;
}

type MeterSignature = '3/4' | '4/4';

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatTimeCompact(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0';
  const whole = Math.floor(seconds);
  const mm = String(Math.floor(whole / 60)).padStart(2, '0');
  const ss = String(whole % 60).padStart(2, '0');
  const tenth = Math.floor((seconds - whole) * 10);
  return `${mm}:${ss}.${tenth}`;
}

function semitoneToKey(semitones: number): string {
  const keys = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const idx = ((semitones % 12) + 12) % 12;
  return `${keys[idx]} major`;
}

function buildWaveformBars(buffer: AudioBuffer, bars = 240): number[] {
  const data = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(data.length / bars));
  const points: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = i * blockSize;
    const end = Math.min(data.length, start + blockSize);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > peak) peak = v;
    }
    points.push(peak);
  }
  return points;
}

interface AudioComparePlayerProps {
  originalUrl?: string | null;
  resultUrl: string | null;
  resultLabel?: string;
  onDownload?: () => void;
  downloadLabel?: string;
}

function AudioComparePlayer({
  originalUrl = null,
  resultUrl,
  resultLabel = 'Результат',
  onDownload,
  downloadLabel = 'Скачать WAV',
}: AudioComparePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [compareMode, setCompareMode] = useState<'A' | 'B'>('B');
  const [preserveTime, setPreserveTime] = useState(0);
  const [resumeAfterSwitch, setResumeAfterSwitch] = useState(false);

  const hasAB = Boolean(originalUrl && resultUrl);
  const activeSrc = compareMode === 'A' ? originalUrl : resultUrl;

  useEffect(() => {
    if (!audioRef.current) return;
    const el = audioRef.current;
    const onLoaded = () => {
      const targetTime = Math.min(preserveTime, Math.max(0, (el.duration || 0) - 0.05));
      if (Number.isFinite(targetTime) && targetTime > 0) {
        try {
          el.currentTime = targetTime;
        } catch {
          /* noop */
        }
      }
      if (resumeAfterSwitch) {
        void el.play().catch(() => undefined);
      }
      setResumeAfterSwitch(false);
    };
    el.addEventListener('loadedmetadata', onLoaded);
    return () => el.removeEventListener('loadedmetadata', onLoaded);
  }, [activeSrc, preserveTime, resumeAfterSwitch]);

  if (!resultUrl) return null;

  return (
    <div className="space-y-3 rounded-xl border border-[#2A2A2A] bg-[#111111] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#E0E0E0]">{resultLabel}</p>
        {onDownload && (
          <button
            onClick={onDownload}
            className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300"
          >
            {downloadLabel}
          </button>
        )}
      </div>

      {hasAB && (
        <div className="flex items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] p-1">
          <button
            onClick={() => {
              const el = audioRef.current;
              if (el) {
                setPreserveTime(el.currentTime || 0);
                setResumeAfterSwitch(!el.paused);
              }
              setCompareMode('A');
            }}
            className={`rounded-md px-3 py-1.5 text-xs ${compareMode === 'A' ? 'bg-[#8A2BE2]/30 text-[#E0E0E0]' : 'text-[#A0A0A0]'}`}
          >
            A: Original
          </button>
          <button
            onClick={() => {
              const el = audioRef.current;
              if (el) {
                setPreserveTime(el.currentTime || 0);
                setResumeAfterSwitch(!el.paused);
              }
              setCompareMode('B');
            }}
            className={`rounded-md px-3 py-1.5 text-xs ${compareMode === 'B' ? 'bg-[#8A2BE2]/30 text-[#E0E0E0]' : 'text-[#A0A0A0]'}`}
          >
            B: Result
          </button>
        </div>
      )}

      <audio ref={audioRef} controls src={activeSrc ?? undefined} className="w-full" />
    </div>
  );
}

async function detectBpmFromBackend(file: File): Promise<number | null> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/detect-bpm', { method: 'POST', body: form });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { bpm?: number };
    if (typeof data.bpm === 'number' && Number.isFinite(data.bpm) && data.bpm > 0) {
      return Math.round(clamp(data.bpm, 40, 240));
    }
    return null;
  } catch {
    return null;
  }
}

interface OnsetEnvelopeData {
  novelty: Float32Array;
  frameSec: number;
}

function buildOnsetEnvelope(decoded: AudioBuffer): OnsetEnvelopeData {
  const data = decoded.getChannelData(0);
  const frameSize = Math.max(256, Math.floor(decoded.sampleRate * 0.01));
  const frameSec = frameSize / decoded.sampleRate;
  const energies: number[] = [];
  for (let i = 0; i < data.length; i += frameSize) {
    let sum = 0;
    const end = Math.min(data.length, i + frameSize);
    for (let j = i; j < end; j++) {
      const v = data[j];
      sum += v * v;
    }
    energies.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  const novelty = new Float32Array(Math.max(0, energies.length - 1));
  for (let i = 1; i < energies.length; i++) {
    novelty[i - 1] = Math.max(0, energies[i] - energies[i - 1]);
  }
  return { novelty, frameSec };
}

function scoreTempoCandidate(
  novelty: Float32Array,
  frameSec: number,
  bpm: number,
  meter: MeterSignature = '4/4'
): number {
  const b = clamp(bpm, 40, 240);
  const lag = Math.max(1, Math.round((60 / b) / frameSec));
  if (lag >= novelty.length) return 0;
  let score = 0;
  for (let i = lag; i < novelty.length; i++) {
    score += novelty[i] * novelty[i - lag];
  }
  const lagHalf = Math.max(1, Math.round(lag / 2));
  const lagDouble = Math.min(novelty.length - 1, lag * 2);
  for (let i = lagHalf; i < novelty.length; i++) score += novelty[i] * novelty[i - lagHalf] * 0.35;
  for (let i = lagDouble; i < novelty.length; i++) score += novelty[i] * novelty[i - lagDouble] * 0.45;
  const barLag = meter === '3/4' ? lag * 3 : lag * 4;
  const barLagHalf = Math.max(1, Math.round(barLag / 2));
  if (barLag < novelty.length) {
    for (let i = barLag; i < novelty.length; i++) score += novelty[i] * novelty[i - barLag] * 0.4;
  }
  if (barLagHalf < novelty.length) {
    for (let i = barLagHalf; i < novelty.length; i++) score += novelty[i] * novelty[i - barLagHalf] * 0.18;
  }
  return score;
}

function detectTimeSignatureWithConfidence(buffer: AudioBuffer): { meter: MeterSignature; confidence: number } {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const frame = Math.max(256, Math.floor(sampleRate * 0.025));
  const envelope: number[] = [];
  for (let i = 0; i < data.length; i += frame) {
    let sum = 0;
    const end = Math.min(data.length, i + frame);
    for (let j = i; j < end; j++) sum += Math.abs(data[j]);
    envelope.push(sum / Math.max(1, end - i));
  }
  if (envelope.length < 20) return { meter: '4/4', confidence: 0.3 };
  const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length;
  const peaks = envelope
    .map((v, i) => ({ v, i }))
    .filter((x, idx, arr) => x.v > mean * 1.3 && idx > 0 && idx < arr.length - 1 && x.v >= arr[idx - 1].v && x.v >= arr[idx + 1].v)
    .slice(0, 180);
  if (peaks.length < 8) return { meter: '4/4', confidence: 0.35 };
  const scoreFor = (beats: 3 | 4): number => {
    const cycle = beats * 8;
    return peaks.reduce((acc, p) => {
      const pos = p.i % cycle;
      const dist = Math.min(pos, cycle - pos);
      return acc + Math.exp(-(dist * dist) / 8);
    }, 0);
  };
  const s3 = scoreFor(3);
  const s4 = scoreFor(4);
  const meter: MeterSignature = s3 > s4 * 1.12 ? '3/4' : '4/4';
  const confidence = Math.abs(s4 - s3) / Math.max(1e-6, Math.max(s4, s3));
  return { meter, confidence: clamp(confidence, 0, 1) };
}

function detectBpmFallback(decoded: AudioBuffer, meter: MeterSignature): number | null {
  const { novelty, frameSec } = buildOnsetEnvelope(decoded);
  if (novelty.length < 50) return null;
  let bestBpm = 0;
  let bestScore = -1;
  for (let bpm = 60; bpm <= 180; bpm++) {
    const s = scoreTempoCandidate(novelty, frameSec, bpm, meter);
    if (s > bestScore) {
      bestScore = s;
      bestBpm = bpm;
    }
  }
  return bestBpm > 0 ? Math.round(bestBpm) : null;
}

function buildToolCardClass(mode: ToolMode, singleHeight: string) {
  return `rounded-2xl border border-[#2A2A2A] bg-[#111111] p-5 ${mode === 'all' ? 'min-h-[260px]' : singleHeight}`;
}

export function ToolsTab({ mode = 'all' }: ToolsTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [tempoPct, setTempoPct] = useState(100);
  const [pitcherPosition, setPitcherPosition] = useState(0);
  const [isPitcherPlaying, setIsPitcherPlaying] = useState(false);
  const [estimatedBpm, setEstimatedBpm] = useState<number>(120);
  const [pitcherAnalyzing, setPitcherAnalyzing] = useState(false);
  const [pitcherProgress, setPitcherProgress] = useState(0);
  const [timeSignature, setTimeSignature] = useState<MeterSignature | null>(null);
  const [meterConfidence, setMeterConfidence] = useState(0);
  const [cutStart, setCutStart] = useState(0);
  const [cutEnd, setCutEnd] = useState(30);
  const [joinFiles, setJoinFiles] = useState<File[]>([]);
  const [karaokeBusy, setKaraokeBusy] = useState(false);
  const [karaokeProgress, setKaraokeProgress] = useState(0);
  const [karaokePreviewUrl, setKaraokePreviewUrl] = useState<string | null>(null);
  const [karaokeBlob, setKaraokeBlob] = useState<Blob | null>(null);
  const [karaokeLrcText, setKaraokeLrcText] = useState('');
  const [instrumentalBusy, setInstrumentalBusy] = useState(false);
  const [instrumentalPreviewUrl, setInstrumentalPreviewUrl] = useState<string | null>(null);
  const [instrumentalBlob, setInstrumentalBlob] = useState<Blob | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [cutBusy, setCutBusy] = useState(false);
  const [cutProgress, setCutProgress] = useState(0);
  const [cutResultBlob, setCutResultBlob] = useState<Blob | null>(null);
  const [cutResultUrl, setCutResultUrl] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinProgress, setJoinProgress] = useState(0);
  const [joinResultBlob, setJoinResultBlob] = useState<Blob | null>(null);
  const [joinResultUrl, setJoinResultUrl] = useState<string | null>(null);
  const [denoiseBusy, setDenoiseBusy] = useState(false);
  const [denoiseProgress, setDenoiseProgress] = useState(0);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | null>(null);
  const [denoiseResultBlob, setDenoiseResultBlob] = useState<Blob | null>(null);
  const [denoiseResultUrl, setDenoiseResultUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const audioRef = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode; startedAt: number; offset: number } | null>(null);
  const pitcherRafRef = useRef<number | null>(null);
  const { separate, stems, isLoading, progress: separationProgress } = useAudioSeparation();

  const duration = useMemo(() => buffer?.duration ?? 0, [buffer]);
  const hasPitcherData = Boolean(buffer);
  const joinedTotalDuration = useMemo(
    () => joinFiles.reduce((sum, f) => sum + (Number((f as File & { _duration?: number })._duration) || 0), 0),
    [joinFiles]
  );
  const cutterWaveform = useMemo(() => (buffer ? buildWaveformBars(buffer, 220) : []), [buffer]);
  const activeOverlayLoader = useMemo(() => {
    if (instrumentalBusy || isLoading) {
      const detail = separationProgress < 25
        ? 'Инициализируем модель разделения'
        : separationProgress < 75
          ? 'Выделяем вокальную и инструментальную составляющие'
          : 'Собираем дорожки и готовим предпрослушивание';
      return { label: 'Создаем минусовку...', detail, progress: separationProgress };
    }
    if (pitcherAnalyzing) {
      const detail = pitcherProgress < 45 ? 'Определяем тактовый размер' : 'Анализируем темп и ритм';
      return { label: 'Анализ тактового размера и темпа...', detail, progress: pitcherProgress };
    }
    if (cutBusy) return { label: 'Подготовка фрагмента...', detail: 'Рендерим выделенный диапазон в WAV', progress: cutProgress };
    if (joinBusy) return { label: 'Склеиваем мультитрек...', detail: 'Синхронизируем и микшируем дорожки', progress: joinProgress };
    if (denoiseBusy) return { label: 'Очищаем запись...', detail: 'Подавляем фоновые шумы и артефакты', progress: denoiseProgress };
    if (karaokeBusy) return { label: 'Генерация караоке...', detail: 'Готовим instrumental и LRC-шаблон', progress: karaokeProgress };
    return null;
  }, [
    instrumentalBusy,
    isLoading,
    separationProgress,
    pitcherAnalyzing,
    pitcherProgress,
    cutBusy,
    cutProgress,
    joinBusy,
    joinProgress,
    denoiseBusy,
    denoiseProgress,
    karaokeBusy,
    karaokeProgress,
  ]);

  useEffect(() => {
    return () => {
      if (karaokePreviewUrl) URL.revokeObjectURL(karaokePreviewUrl);
      if (instrumentalPreviewUrl) URL.revokeObjectURL(instrumentalPreviewUrl);
      if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
      if (cutResultUrl) URL.revokeObjectURL(cutResultUrl);
      if (joinResultUrl) URL.revokeObjectURL(joinResultUrl);
      if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
      if (denoiseResultUrl) URL.revokeObjectURL(denoiseResultUrl);
    };
  }, [karaokePreviewUrl, instrumentalPreviewUrl, originalPreviewUrl, cutResultUrl, joinResultUrl, recordedPreviewUrl, denoiseResultUrl]);

  const analyzePitcherTrack = useCallback(async (decoded: AudioBuffer, picked: File) => {
    setPitcherAnalyzing(true);
    setPitcherProgress(8);
    const { meter, confidence } = detectTimeSignatureWithConfidence(decoded);
    setTimeSignature(meter);
    setMeterConfidence(confidence);
    setPitcherProgress(42);
    const { novelty, frameSec } = buildOnsetEnvelope(decoded);
    const backendBpm = await detectBpmFromBackend(picked);
    setPitcherProgress(70);
    const fallbackBpm = detectBpmFallback(decoded, meter);
    if (backendBpm && fallbackBpm) {
      const backendScore = scoreTempoCandidate(novelty, frameSec, backendBpm, meter);
      const fallbackScore = scoreTempoCandidate(novelty, frameSec, fallbackBpm, meter);
      setEstimatedBpm(fallbackScore > backendScore * 1.08 ? fallbackBpm : backendBpm);
    } else if (backendBpm) {
      setEstimatedBpm(backendBpm);
    } else if (fallbackBpm) {
      setEstimatedBpm(fallbackBpm);
    }
    setPitcherProgress(100);
    window.setTimeout(() => setPitcherAnalyzing(false), 260);
  }, []);

  const onPickFile = useCallback(async (picked: File | null) => {
    if (!picked) return;
    const decoded = await fileToAudioBuffer(picked);
    setPitcherProgress(24);
    setFile(picked);
    setBuffer(decoded);
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    setOriginalPreviewUrl(URL.createObjectURL(picked));
    if (cutResultUrl) URL.revokeObjectURL(cutResultUrl);
    if (joinResultUrl) URL.revokeObjectURL(joinResultUrl);
    if (denoiseResultUrl) URL.revokeObjectURL(denoiseResultUrl);
    setCutResultBlob(null);
    setCutResultUrl(null);
    setJoinResultBlob(null);
    setJoinResultUrl(null);
    setDenoiseResultBlob(null);
    setDenoiseResultUrl(null);
    setCutStart(0);
    setCutEnd(Math.min(30, decoded.duration));
    setPitcherPosition(0);
    await analyzePitcherTrack(decoded, picked);
  }, [originalPreviewUrl, cutResultUrl, joinResultUrl, denoiseResultUrl, analyzePitcherTrack]);

  const stopPitcher = useCallback(() => {
    if (pitcherRafRef.current) {
      cancelAnimationFrame(pitcherRafRef.current);
      pitcherRafRef.current = null;
    }
    if (!audioRef.current) return;
    try {
      audioRef.current.source.stop();
      audioRef.current.source.disconnect();
      audioRef.current.ctx.close();
    } catch {
      /* noop */
    }
    audioRef.current = null;
    setIsPitcherPlaying(false);
    setPitcherPosition(0);
  }, []);

  const playPitcher = useCallback(async () => {
    if (!buffer) return;
    stopPitcher();
    const ctx = new AudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.detune.value = pitchSemitones * 100;
    source.playbackRate.value = clamp(tempoPct / 100, 0.5, 1.8);
    source.connect(ctx.destination);
    source.start();
    audioRef.current = { ctx, source, startedAt: ctx.currentTime, offset: 0 };
    setIsPitcherPlaying(true);
    const tick = () => {
      const ref = audioRef.current;
      if (!ref) return;
      const speed = clamp(tempoPct / 100, 0.5, 1.8);
      const elapsed = (ref.ctx.currentTime - ref.startedAt) * speed;
      const position = clamp(ref.offset + elapsed, 0, duration);
      setPitcherPosition(position);
      if (position >= duration - 0.02) {
        setIsPitcherPlaying(false);
        return;
      }
      pitcherRafRef.current = requestAnimationFrame(tick);
    };
    pitcherRafRef.current = requestAnimationFrame(tick);
    source.onended = () => {
      setIsPitcherPlaying(false);
      if (pitcherRafRef.current) {
        cancelAnimationFrame(pitcherRafRef.current);
        pitcherRafRef.current = null;
      }
    };
  }, [buffer, pitchSemitones, tempoPct, stopPitcher, duration]);

  useEffect(() => () => {
    if (pitcherRafRef.current) cancelAnimationFrame(pitcherRafRef.current);
  }, []);

  const removeVocals = useCallback(async () => {
    if (!file) return;
    setInstrumentalBusy(true);
    try {
      const result = await separate(file);
      if (!result) return;
      const instrumental = result.other ?? result.guitar ?? result.piano ?? result.original;
      const blob = audioBufferToWavBlob(instrumental);
      if (instrumentalPreviewUrl) URL.revokeObjectURL(instrumentalPreviewUrl);
      const previewUrl = URL.createObjectURL(blob);
      setInstrumentalBlob(blob);
      setInstrumentalPreviewUrl(previewUrl);
    } finally {
      setInstrumentalBusy(false);
    }
  }, [file, separate, instrumentalPreviewUrl]);

  const analyzeMeter = useCallback(() => {
    if (!buffer) return;
    const { meter, confidence } = detectTimeSignatureWithConfidence(buffer);
    setTimeSignature(meter);
    setMeterConfidence(confidence);
  }, [buffer]);

  const exportCut = useCallback(() => {
    if (!buffer) return;
    setCutBusy(true);
    setCutProgress(8);
    const start = clamp(cutStart, 0, Math.max(0, duration - 0.1));
    const end = clamp(cutEnd, start + 0.1, duration);
    const sampleRate = buffer.sampleRate;
    const startFrame = Math.floor(start * sampleRate);
    const endFrame = Math.floor(end * sampleRate);
    const length = Math.max(1, endFrame - startFrame);
    const out = new AudioContext({ sampleRate }).createBuffer(buffer.numberOfChannels, length, sampleRate);
    setCutProgress(36);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      out.copyToChannel(buffer.getChannelData(ch).slice(startFrame, endFrame), ch);
    }
    setCutProgress(74);
    const blob = audioBufferToWavBlob(out);
    if (cutResultUrl) URL.revokeObjectURL(cutResultUrl);
    const url = URL.createObjectURL(blob);
    setCutResultBlob(blob);
    setCutResultUrl(url);
    setCutProgress(100);
    window.setTimeout(() => setCutBusy(false), 180);
  }, [buffer, cutStart, cutEnd, duration, file, cutResultUrl]);

  const addJoinFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const next = await Promise.all(
      Array.from(files).map(async (f) => {
        const b = await fileToAudioBuffer(f);
        const clone = f as File & { _duration?: number };
        clone._duration = b.duration;
        return clone;
      })
    );
    setJoinFiles((prev) => [...prev, ...next]);
  }, []);

  const removeJoinFile = useCallback((idx: number) => {
    setJoinFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const moveJoinFile = useCallback((from: number, to: number) => {
    setJoinFiles((prev) => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }, []);

  const joinMultiTrack = useCallback(async () => {
    if (joinFiles.length < 2) return;
    setJoinBusy(true);
    setJoinProgress(10);
    const buffers = await Promise.all(joinFiles.map((f) => fileToAudioBuffer(f)));
    setJoinProgress(42);
    const maxLen = Math.max(...buffers.map((b) => b.length));
    const sampleRate = Math.max(...buffers.map((b) => b.sampleRate));
    const ctx = new AudioContext({ sampleRate });
    const out = ctx.createBuffer(2, maxLen, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const target = out.getChannelData(ch);
      target.fill(0);
      for (const b of buffers) {
        const src = b.getChannelData(Math.min(ch, b.numberOfChannels - 1));
        for (let i = 0; i < src.length; i++) target[i] += src[i] / buffers.length;
      }
    }
    setJoinProgress(82);
    const blob = audioBufferToWavBlob(out);
    if (joinResultUrl) URL.revokeObjectURL(joinResultUrl);
    const url = URL.createObjectURL(blob);
    setJoinResultBlob(blob);
    setJoinResultUrl(url);
    setJoinProgress(100);
    window.setTimeout(() => setJoinBusy(false), 180);
  }, [joinFiles, joinResultUrl]);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    mediaChunksRef.current = [];
    recorder.ondataavailable = (e) => mediaChunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
      setRecordedBlob(blob);
      if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
      setRecordedPreviewUrl(URL.createObjectURL(blob));
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }, [recordedPreviewUrl]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  const denoiseRecording = useCallback(async () => {
    if (!recordedBlob) return;
    setDenoiseBusy(true);
    setDenoiseProgress(12);
    const arr = await recordedBlob.arrayBuffer();
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(arr);
    setDenoiseProgress(48);
    const out = ctx.createBuffer(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
    const threshold = 0.02;
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const src = decoded.getChannelData(ch);
      const dst = out.getChannelData(ch);
      for (let i = 0; i < src.length; i++) dst[i] = Math.abs(src[i]) < threshold ? 0 : src[i];
    }
    setDenoiseProgress(84);
    const blob = audioBufferToWavBlob(out);
    if (denoiseResultUrl) URL.revokeObjectURL(denoiseResultUrl);
    const url = URL.createObjectURL(blob);
    setDenoiseResultBlob(blob);
    setDenoiseResultUrl(url);
    setDenoiseProgress(100);
    window.setTimeout(() => setDenoiseBusy(false), 180);
  }, [recordedBlob, denoiseResultUrl]);

  const createKaraoke = useCallback(async () => {
    if (!file) return;
    setKaraokeBusy(true);
    setKaraokeProgress(8);
    try {
      const result = await separate(file);
      if (!result) return;
      setKaraokeProgress(62);
      const instrumental = result.other ?? result.original;
      const karaokeBlob = audioBufferToWavBlob(instrumental);
      setKaraokeBlob(karaokeBlob);
      if (karaokePreviewUrl) URL.revokeObjectURL(karaokePreviewUrl);
      const nextUrl = URL.createObjectURL(karaokeBlob);
      setKaraokePreviewUrl(nextUrl);
      const lrc = `[00:00.00] ${file.name}\n[00:10.00] Karaoke track generated\n`;
      setKaraokeLrcText(lrc);
      downloadBlob(karaokeBlob, `${file.name.replace(/\.[^.]+$/, '')}-karaoke.wav`);
      downloadBlob(new Blob([lrc], { type: 'text/plain;charset=utf-8' }), `${file.name.replace(/\.[^.]+$/, '')}.lrc`);
      setKaraokeProgress(100);
    } finally {
      window.setTimeout(() => setKaraokeBusy(false), 180);
    }
  }, [file, separate, karaokePreviewUrl]);

  const isMode = (value: Exclude<ToolMode, 'all'>) => mode === 'all' || mode === value;

  const SingleFileInput = ({ title, hint }: { title: string; hint: string }) => (
    <UploadDropzone
      accept=".mp3,.wav,.flac,.m4a,audio/*"
      onFileSelect={(picked) => void onPickFile(picked)}
      title="Перетащите файл сюда или нажмите для выбора"
      subtitle={`${title}. ${hint}`}
      formatsHint="MP3, WAV, FLAC, M4A — до 100 МБ"
      fileInfo={file ? `${file.name} · ${duration.toFixed(1)}с` : null}
      replaceLabel="Заменить файл"
      className={mode === 'all' ? 'mb-4' : 'mb-4 h-full w-full'}
      minHeightClass={mode === 'all' ? 'min-h-[220px]' : 'min-h-[380px]'}
    />
  );

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {activeOverlayLoader && (
        <div className="fixed inset-0 z-[88] flex items-center justify-center bg-[#0A0A0A]/55 backdrop-blur-[2px]">
          <div className="w-full max-w-md px-4">
            <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111]/95 p-5 shadow-2xl">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#8A2BE2] border-t-transparent" />
                <div>
                  <p className="text-sm font-medium text-[#E0E0E0]">{activeOverlayLoader.label}</p>
                  <p className="text-xs text-[#A0A0A0]">{activeOverlayLoader.detail}</p>
                </div>
              </div>
              <ProgressInlineBar value={activeOverlayLoader.progress} />
            </div>
          </div>
        </div>
      )}
      {mode === 'all' && (
      <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".mp3,.wav,.flac,.m4a,audio/*"
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-sm text-[#E0E0E0]"
          />
          <span className="text-sm text-[#A0A0A0]">{file ? `${file.name} · ${duration.toFixed(1)}с` : 'Выберите трек для инструментов'}</span>
        </div>
      </div>
      )}

      <div className={`grid gap-4 ${mode === 'all' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
        {isMode('vocal-remover') && (
        <div className={buildToolCardClass(mode, 'min-h-[420px]')}>
          {mode !== 'all' && (
            <SingleFileInput
              title="Удаление вокала"
              hint="Загрузите трек и получите минусовку с live A/B и загрузкой результата."
            />
          )}
          {file && (
            <div className="mb-4 rounded-xl border border-[#2A2A2A] bg-[#0C0C0C] p-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#A0A0A0]">
                <span className="rounded-md bg-[#1A1A1A] px-2 py-1 text-[#E0E0E0]">{file.name}</span>
                <span>Длительность: {duration.toFixed(1)}с</span>
                <span>Режим: Instrumental A/B</span>
              </div>
            </div>
          )}
          {(file || instrumentalPreviewUrl || instrumentalBusy || isLoading) && (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-5 rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] p-6">
            <button
              onClick={() => void removeVocals()}
              disabled={!file || isLoading || instrumentalBusy}
              className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-8 py-3 text-base font-semibold text-white disabled:opacity-50"
            >
              {instrumentalBusy || isLoading ? 'Создаем минусовку...' : 'Сделать минусовку'}
            </button>
            {(instrumentalBusy || isLoading) && (
              <div className="w-full max-w-md">
                <ProgressInlineBar value={separationProgress} label="Обработка" />
              </div>
            )}
            {instrumentalPreviewUrl && (
              <div className="w-full max-w-2xl">
                <AudioComparePlayer
                  originalUrl={originalPreviewUrl}
                  resultUrl={instrumentalPreviewUrl}
                  resultLabel="Минусовка готова"
                  onDownload={() => {
                    if (!instrumentalBlob || !file) return;
                    downloadBlob(instrumentalBlob, `${file.name.replace(/\.[^.]+$/, '')}-instrumental.wav`);
                  }}
                />
              </div>
            )}
          </div>
          )}
        </div>
        )}

        {isMode('pitcher') && (
        <div className={buildToolCardClass(mode, 'min-h-[430px]')}>
          {mode !== 'all' && (
            <SingleFileInput
              title="Pitcher"
              hint="После загрузки получите Pitch/Speed, BPM, размер и сможете повторно запустить анализ."
            />
          )}
          {file && pitcherAnalyzing ? (
            <div className="rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] p-4">
              <p className="mb-2 text-sm font-medium text-[#E0E0E0]">Анализ тактового размера и темпа...</p>
              <ProgressInlineBar value={pitcherProgress} />
            </div>
          ) : file ? (
          <div className="rounded-xl border border-[#2A2A2A] bg-[#0C0C0C] p-5">
            <div className="mb-4 flex flex-wrap items-center gap-4 text-[#E0E0E0]">
              {hasPitcherData ? (
                <span className="font-mono text-2xl">{formatTimeCompact(pitcherPosition || duration)}</span>
              ) : (
                <div className="h-8 w-24 animate-pulse rounded-md bg-[#1C1C1C]" />
              )}
              <span className="text-sm text-[#A0A0A0]">PITCH</span>
              {hasPitcherData ? (
                <span className="font-mono text-xl">{`${pitchSemitones > 0 ? '+' : ''}${pitchSemitones}.00`}</span>
              ) : (
                <div className="h-6 w-16 animate-pulse rounded-md bg-[#1C1C1C]" />
              )}
              {hasPitcherData ? (
                <span className="text-sm text-[#A0A0A0]">{semitoneToKey(pitchSemitones)}</span>
              ) : (
                <div className="h-5 w-20 animate-pulse rounded-md bg-[#1C1C1C]" />
              )}
              <span className="text-sm text-[#A0A0A0]">SPEED</span>
              {hasPitcherData ? (
                <span className="font-mono text-xl">{`${(tempoPct / 100).toFixed(2)}x`}</span>
              ) : (
                <div className="h-6 w-16 animate-pulse rounded-md bg-[#1C1C1C]" />
              )}
              {hasPitcherData ? (
                <span className="font-mono text-lg">{estimatedBpm}</span>
              ) : (
                <div className="h-6 w-10 animate-pulse rounded-md bg-[#1C1C1C]" />
              )}
              {hasPitcherData ? (
                <span className="text-sm text-[#A0A0A0]">размер: {timeSignature ?? '—'} ({Math.round(meterConfidence * 100)}%)</span>
              ) : (
                <div className="h-5 w-36 animate-pulse rounded-md bg-[#1C1C1C]" />
              )}
              {hasPitcherData ? (
                <span className="text-sm text-[#A0A0A0]">format: {file?.name.split('.').pop()?.toLowerCase() ?? '—'}</span>
              ) : (
                <div className="h-5 w-20 animate-pulse rounded-md bg-[#1C1C1C]" />
              )}
              <button
                onClick={() => {
                  if (!buffer || !file) return;
                  void analyzePitcherTrack(buffer, file);
                }}
                disabled={!buffer || pitcherAnalyzing}
                className="rounded-full border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#A0A0A0] disabled:opacity-40"
              >
                Повторить анализ
              </button>
              <button
                onClick={() => {
                  if (!buffer) return;
                  const preset = JSON.stringify(
                    {
                      pitchSemitones,
                      tempoPct,
                      bpm: estimatedBpm,
                      key: semitoneToKey(pitchSemitones),
                      meter: timeSignature,
                    },
                    null,
                    2
                  );
                  downloadBlob(new Blob([preset], { type: 'application/json' }), `${file?.name.replace(/\.[^.]+$/, '') ?? 'pitcher'}-preset.json`);
                }}
                disabled={!buffer}
                className="ml-auto rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
            <label className="mb-2 block text-xs text-[#A0A0A0]">Pitch</label>
            <input type="range" min={-12} max={12} step={1} value={pitchSemitones} onChange={(e) => setPitchSemitones(Number(e.target.value))} className="mb-3 w-full" disabled={!buffer} />
            <label className="mb-2 block text-xs text-[#A0A0A0]">Speed</label>
            <input type="range" min={60} max={160} step={1} value={tempoPct} onChange={(e) => setTempoPct(Number(e.target.value))} className="mb-4 w-full" disabled={!buffer} />
            <div className="flex gap-2">
              <button onClick={() => void playPitcher()} disabled={!buffer} className="rounded-lg border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#E0E0E0]">{isPitcherPlaying ? 'Replay' : 'Play'}</button>
              <button onClick={stopPitcher} disabled={!buffer} className="rounded-lg border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#A0A0A0] disabled:opacity-40">Stop</button>
            </div>
          </div>
          ) : null}
        </div>
        )}

        {isMode('time-signature') && (
        <div className={buildToolCardClass(mode, 'min-h-[320px]')}>
          {mode !== 'all' && (
            <SingleFileInput
              title="Поиск тактового размера"
              hint="Загрузите файл и получите размер с оценкой точности."
            />
          )}
          {buffer && (
            <div className="mb-4 rounded-xl border border-[#2A2A2A] bg-[#0C0C0C] p-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#A0A0A0]">
                <span className="rounded-md bg-[#1A1A1A] px-2 py-1 text-[#E0E0E0]">{file?.name ?? 'Трек'}</span>
                <span>Размер: {timeSignature ?? '—'}</span>
                <span>Точность: {Math.round(meterConfidence * 100)}%</span>
              </div>
            </div>
          )}
          {buffer && (
            <div className="flex items-center gap-3">
              <button onClick={analyzeMeter} disabled={!buffer} className="rounded-lg border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#E0E0E0]">Определить</button>
              <span className="text-sm text-[#A0A0A0]">{timeSignature ? `Размер: ${timeSignature} (${Math.round(meterConfidence * 100)}%)` : 'Не определен'}</span>
            </div>
          )}
        </div>
        )}

        {isMode('cutter') && (
        <div className={buildToolCardClass(mode, 'min-h-[360px]')}>
          {mode !== 'all' && (
            <SingleFileInput
              title="Резак"
              hint="Загрузите трек, выставьте Start/End и экспортируйте фрагмент."
            />
          )}
          {(buffer || cutResultUrl || cutBusy) && (
          <>
          {buffer && (
            <div className="mb-3 rounded-xl border border-[#2A2A2A] bg-[#0C0C0C] p-3">
              <div className="relative flex h-20 items-end gap-[1px] overflow-hidden rounded-md border border-[#232323] bg-[#101010] px-1">
                {cutterWaveform.map((peak, idx) => {
                  const percent = (idx / Math.max(1, cutterWaveform.length - 1)) * 100;
                  const startPercent = (cutStart / Math.max(0.001, duration)) * 100;
                  const endPercent = (cutEnd / Math.max(0.001, duration)) * 100;
                  const inRange = percent >= startPercent && percent <= endPercent;
                  return (
                    <div
                      key={`cut-wave-${idx}`}
                      className="w-full rounded-[2px]"
                      style={{
                        height: `${Math.max(4, Math.min(72, peak * 74))}px`,
                        backgroundColor: inRange ? '#8A2BE2' : '#3A3A3A',
                        opacity: inRange ? 0.95 : 0.45,
                      }}
                    />
                  );
                })}
                <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-[#C79BFF]" style={{ left: `${(cutStart / Math.max(0.001, duration)) * 100}%` }} />
                <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-[#C79BFF]" style={{ left: `${(cutEnd / Math.max(0.001, duration)) * 100}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[#A0A0A0]">
                <span>Start: {(cutStart * 1000).toFixed(0)} ms</span>
                <span>End: {(cutEnd * 1000).toFixed(0)} ms</span>
                <span>Length: {((cutEnd - cutStart) * 1000).toFixed(0)} ms</span>
              </div>
            </div>
          )}
          <label className="mb-1 block text-xs text-[#A0A0A0]">Start: {cutStart.toFixed(1)}s</label>
          <input type="range" min={0} max={Math.max(0, duration)} step={0.1} value={cutStart} onChange={(e) => setCutStart(Number(e.target.value))} className="mb-2 w-full" />
          <label className="mb-1 block text-xs text-[#A0A0A0]">End: {cutEnd.toFixed(1)}s</label>
          <input type="range" min={0} max={Math.max(0, duration)} step={0.1} value={cutEnd} onChange={(e) => setCutEnd(Number(e.target.value))} className="mb-3 w-full" />
          <button onClick={exportCut} disabled={!buffer || cutBusy} className="rounded-lg border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#E0E0E0] disabled:opacity-50">
            {cutBusy ? 'Подготовка...' : 'Экспорт фрагмента'}
          </button>
          {cutBusy && (
            <div className="mt-3">
              <ProgressInlineBar value={cutProgress} label="Обработка" />
            </div>
          )}
          {cutResultUrl && (
            <div className="mt-4">
              <AudioComparePlayer
                originalUrl={originalPreviewUrl}
                resultUrl={cutResultUrl}
                resultLabel="Фрагмент готов"
                onDownload={() => {
                  if (!cutResultBlob || !file) return;
                  downloadBlob(cutResultBlob, `${file.name.replace(/\.[^.]+$/, '')}-cut.wav`);
                }}
              />
            </div>
          )}
          </>
          )}
        </div>
        )}

        {isMode('joiner') && (
        <div className={buildToolCardClass(mode, 'min-h-[360px]')}>
          <div className="mb-3 rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] p-3">
            <input
              type="file"
              multiple
              accept=".wav,.mp3,.flac,.m4a,audio/*"
              onChange={(e) => void addJoinFiles(e.target.files)}
              className="w-full text-xs text-[#A0A0A0]"
            />
            <p className="mt-2 text-xs text-[#7F7F7F]">Добавьте 2+ файла, упорядочьте список и соедините в один мультитрек.</p>
          </div>
          <div className="mb-3 max-h-48 space-y-2 overflow-auto rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] p-2">
            {joinFiles.length === 0 && <p className="px-2 py-1 text-xs text-[#7F7F7F]">Файлы еще не добавлены</p>}
            {joinFiles.map((f, idx) => (
              <div key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg border border-[#2A2A2A] bg-[#131313] px-2 py-1.5">
                <span className="truncate text-xs text-[#E0E0E0]">{idx + 1}. {f.name}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveJoinFile(idx, idx - 1)} disabled={idx === 0} className="rounded border border-[#2A2A2A] px-2 text-[10px] text-[#A0A0A0] disabled:opacity-40">↑</button>
                  <button onClick={() => moveJoinFile(idx, idx + 1)} disabled={idx === joinFiles.length - 1} className="rounded border border-[#2A2A2A] px-2 text-[10px] text-[#A0A0A0] disabled:opacity-40">↓</button>
                  <button onClick={() => removeJoinFile(idx)} className="rounded border border-red-500/40 px-2 text-[10px] text-red-300">x</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#A0A0A0]">Треков: {joinFiles.length} · Суммарно: {joinedTotalDuration.toFixed(1)}s</span>
            <button onClick={() => void joinMultiTrack()} disabled={joinFiles.length < 2 || joinBusy} className="rounded-lg border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#E0E0E0] disabled:opacity-50">
              {joinBusy ? 'Склеиваем...' : 'Join и скачать'}
            </button>
          </div>
          {joinBusy && (
            <div className="mt-3">
              <ProgressInlineBar value={joinProgress} label="Обработка" />
            </div>
          )}
          {joinResultUrl && (
            <div className="mt-4">
              <AudioComparePlayer
                originalUrl={null}
                resultUrl={joinResultUrl}
                resultLabel="Склеенный мультитрек"
                onDownload={() => {
                  if (!joinResultBlob) return;
                  downloadBlob(joinResultBlob, 'multitrack-joined.wav');
                }}
              />
            </div>
          )}
        </div>
        )}

        {isMode('recorder') && (
        <div className={buildToolCardClass(mode, 'min-h-[360px]')}>
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-5 rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] p-6">
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => void startRecording()}
                disabled={recording}
                className="flex h-16 w-16 items-center justify-center rounded-full border border-red-500/50 bg-red-500/15 text-red-300 disabled:opacity-50"
              >
                <span className="text-xs font-bold">REC</span>
              </button>
              <button
                onClick={stopRecording}
                disabled={!recording}
                className="flex h-16 w-16 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#1A1A1A] text-[#E0E0E0] disabled:opacity-50"
              >
                <span className="text-xs font-bold">STOP</span>
              </button>
            </div>
            <button onClick={() => void denoiseRecording()} disabled={!recordedBlob || denoiseBusy} className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-5 py-2 text-sm text-white disabled:opacity-50">
              {denoiseBusy ? 'Очищаем...' : 'Очистить шум и скачать'}
            </button>
            <span className="text-xs text-[#A0A0A0]">{recording ? 'Идет запись...' : recordedBlob ? 'Запись готова' : 'Нет записи'}</span>
            {denoiseBusy && (
              <div className="w-full max-w-md">
                <ProgressInlineBar value={denoiseProgress} label="Обработка" />
              </div>
            )}
          </div>
          {denoiseResultUrl && (
            <div className="mt-4">
              <AudioComparePlayer
                originalUrl={recordedPreviewUrl}
                resultUrl={denoiseResultUrl}
                resultLabel="Очищенная запись"
                onDownload={() => {
                  if (!denoiseResultBlob) return;
                  downloadBlob(denoiseResultBlob, 'recording-denoised.wav');
                }}
              />
            </div>
          )}
        </div>
        )}

        {isMode('karaoke') && (
        <div className={buildToolCardClass(mode, 'min-h-[360px]')}>
          {mode !== 'all' && (
            <SingleFileInput
              title="Караоке"
              hint="Загрузите трек и получите instrumental + шаблон .lrc с предпрослушиванием."
            />
          )}
          {(file || karaokeBusy || karaokePreviewUrl) && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button onClick={() => void createKaraoke()} disabled={!file || karaokeBusy} className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-4 py-2 text-sm text-white disabled:opacity-50">
                {karaokeBusy ? 'Генерация...' : 'Создать караоке'}
              </button>
              <span className="text-sm text-[#A0A0A0]">Экспортируется instrumental + шаблон `.lrc`</span>
            </div>
          {karaokeBusy && (
            <div className="mb-3">
              <ProgressInlineBar value={karaokeProgress} label="Обработка" />
            </div>
          )}
          {karaokePreviewUrl && (
            <div className="space-y-2 rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] p-3">
              <p className="text-xs font-medium text-[#E0E0E0]">Просмотр караоке</p>
              <AudioComparePlayer
                originalUrl={originalPreviewUrl}
                resultUrl={karaokePreviewUrl}
                resultLabel="Karaoke instrumental"
                onDownload={() => {
                  if (!karaokeBlob || !file) return;
                  downloadBlob(karaokeBlob, `${file.name.replace(/\.[^.]+$/, '')}-karaoke.wav`);
                }}
              />
              <pre className="max-h-28 overflow-auto rounded-md border border-[#2A2A2A] bg-[#111111] p-2 text-[11px] text-[#A0A0A0]">{karaokeLrcText}</pre>
            </div>
          )}
          {stems && <p className="mt-2 text-xs text-[#7F7F7F]">Обработанные дорожки готовы: vocals/drums/bass/other/guitar/piano (если доступны).</p>}
          </>
          )}
        </div>
        )}
      </div>
    </motion.div>
  );
}

