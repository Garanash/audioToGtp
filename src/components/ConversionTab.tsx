/**
 * Вкладка «Конвертация в GTP» — слева разбор на дорожки, справа одна дорожка, темп из трека
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ProcessingStatus } from './ProcessingStatus';
import { ExportSection } from './ExportSection';
import type { AudioStems, MidiTrackData } from '../types/audio.types';
import { useAudioSeparation } from '../hooks/useAudioSeparation';
import { useMidiConversion, type AccuracyMode } from '../hooks/useMidiConversion';
import { useGtpExport } from '../hooks/useGtpExport';
import { fileToAudioBuffer } from '../utils/audioBuffer';
import { AlphaTabPlayer } from './AlphaTabPlayer';
import { StaffViewer } from './StaffViewer';
import { JobCenter, type JobItem, type JobStatus, type JobType } from './JobCenter';
import { UploadDropzone } from './common/UploadDropzone';

const AUDIO_EXT = /\.(wav|mp3|flac|m4a)$/i;
const AUDIO_ACCEPT = '.wav,.mp3,.flac,.m4a,audio/wav,audio/mpeg,audio/flac,audio/mp4';
const DEFAULT_TEMPO = 120;
const MIN_TEMPO = 20;
const MAX_TEMPO = 300;

type UiStage = 'idle' | 'preparing' | 'analyzing' | 'separating' | 'converting' | 'ready';

interface ConversionTabProps {
  onWorkflowStateChange?: (state: { started: boolean; loading: boolean; ready: boolean }) => void;
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const JOBS_STORAGE_KEY = 'gtpconverter.jobcenter.v1';
const JOBS_SETTINGS_STORAGE_KEY = 'gtpconverter.jobcenter.settings.v1';
const MAX_STORED_JOBS = 80;

function inferJobProgress(type: JobType, status: JobStatus): number {
  const step = (current: number, total: number) => Math.round((current / total) * 100);
  if (status === 'completed') return 100;
  if (status === 'failed' || status === 'cancelled') return 100;
  if (status === 'retried') return 100;
  if (status === 'unknown') return 5;
  if (type === 'separate') return status === 'processing' ? step(2, 3) : step(1, 3);
  if (type === 'midi') return status === 'processing' ? step(2, 3) : step(1, 3);
  if (type === 'gtp') return status === 'processing' ? step(2, 3) : step(1, 3);
  return 10;
}

function estimateTempoAndKeyFromTracks(tracks: MidiTrackData[]): { bpm: number | null; key: string | null } {
  const allNotes = tracks.flatMap((t) => t.notes);
  if (allNotes.length < 8) return { bpm: null, key: null };

  const onsets = allNotes.map((n) => n.startTime).filter(Number.isFinite).sort((a, b) => a - b);
  const deltas: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const d = onsets[i] - onsets[i - 1];
    if (d > 0.08 && d < 1.2) deltas.push(d);
  }
  const median = deltas.length > 0 ? deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : null;
  let bpm: number | null = null;
  if (median && Number.isFinite(median)) {
    bpm = Math.round(Math.max(MIN_TEMPO, Math.min(MAX_TEMPO, 60 / median)));
  }

  const histogram = new Array(12).fill(0) as number[];
  for (const note of allNotes) {
    const pc = ((Math.round(note.pitch) % 12) + 12) % 12;
    const weight = Math.max(0.05, note.endTime - note.startTime) * Math.max(1, note.velocity / 100);
    histogram[pc] += weight;
  }
  const score = (root: number, profile: number[]) =>
    profile.reduce((sum, p, i) => sum + p * histogram[(i + root) % 12], 0);
  let best = { score: -Infinity, key: null as string | null };
  for (let root = 0; root < 12; root++) {
    const majorScore = score(root, MAJOR_PROFILE);
    if (majorScore > best.score) best = { score: majorScore, key: NOTE_NAMES[root] };
    const minorScore = score(root, MINOR_PROFILE);
    if (minorScore > best.score) best = { score: minorScore, key: `${NOTE_NAMES[root]}m` };
  }
  return { bpm, key: best.key };
}

async function detectBpmFromFile(file: File): Promise<{ bpm: number; key: string | null }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/detect-bpm', { method: 'POST', body: form });
  if (!res.ok) return { bpm: DEFAULT_TEMPO, key: null };
  const data = await res.json().catch(() => ({}));
  const bpm = typeof data.bpm === 'number' && data.bpm > 0 ? data.bpm : DEFAULT_TEMPO;
  const key = typeof data.key === 'string' ? data.key : null;
  return { bpm, key };
}

export function ConversionTab({ onWorkflowStateChange }: ConversionTabProps = {}) {
  const [baseFilename, setBaseFilename] = useState('converted');
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [detectedKey, setDetectedKey] = useState<string | null>(null);
  const [manualTempo, setManualTempo] = useState<number | null>(null);
  const [accuracyMode, setAccuracyMode] = useState<AccuracyMode>('extreme');
  const [workspaceMode, setWorkspaceMode] = useState<'preview' | 'edit'>('preview');
  const [editorSettingsOpen, setEditorSettingsOpen] = useState(false);
  const [editorEditMode, setEditorEditMode] = useState<'select' | 'pencil'>('select');
  const [editorShowReference, setEditorShowReference] = useState(true);
  const [editorOverlayAudio, setEditorOverlayAudio] = useState(true);
  const [editorReferenceTrackIdx, setEditorReferenceTrackIdx] = useState(0);
  const [editorZoom, setEditorZoom] = useState(1.08);
  const [editorHighContrast, setEditorHighContrast] = useState(true);
  const [editorQuantizeDivision, setEditorQuantizeDivision] = useState<'auto' | 8 | 16 | 32>('auto');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [uiStage, setUiStage] = useState<UiStage>('idle');
  const [asyncBackendEnabled, setAsyncBackendEnabled] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [archiveMinutes, setArchiveMinutes] = useState<5 | 15 | 30>(15);
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(true);
  const upsertJob = useCallback((id: string, type: JobType, title: string, status: JobStatus) => {
    setJobs((prev) => {
      const existing = prev.find((j) => j.id === id);
      if (existing) {
        return prev.map((j) => (
          j.id === id
            ? { ...j, status, title, updatedAt: Date.now(), progress: inferJobProgress(type, status) }
            : j
        ));
      }
      const maxPinOrder = prev.reduce((max, j) => Math.max(max, j.pinOrder ?? 0), 0);
      const next: JobItem = {
        id,
        type,
        title,
        status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        progress: inferJobProgress(type, status),
        pinOrder: maxPinOrder + 1,
      };
      return [...prev, next].slice(-MAX_STORED_JOBS);
    });
  }, []);

  const separation = useAudioSeparation({
    onAsyncTask: (task) => upsertJob(task.id, task.type, task.title, task.status as JobStatus),
  });
  const midiConversion = useMidiConversion({
    onAsyncTask: (task) => upsertJob(task.id, task.type, task.title, task.status as JobStatus),
  });
  const { exportMidi, exportGtp, gtpError } = useGtpExport({
    onAsyncTask: (task) => upsertJob(task.id, task.type, task.title, task.status as JobStatus),
  });

  const stems = separation.stems;
  const tracks = midiConversion.tracks;
  const [editedTracks, setEditedTracks] = useState(tracks);
  const isLoading = separation.isLoading || midiConversion.isLoading;
  const error = separation.error ?? midiConversion.error ?? uploadError;

  useEffect(() => {
    setEditedTracks(tracks);
  }, [tracks]);

  useEffect(() => {
    const maxIndex = Math.max(0, (editedTracks?.length ?? 1) - 1);
    setEditorReferenceTrackIdx((prev) => Math.max(0, Math.min(prev, maxIndex)));
  }, [editedTracks]);

  useEffect(() => {
    const ready = Boolean(stems && editedTracks);
    onWorkflowStateChange?.({ started: hasStarted, loading: isLoading, ready });
  }, [hasStarted, isLoading, stems, editedTracks, onWorkflowStateChange]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOBS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as JobItem[];
      if (Array.isArray(parsed)) {
        setJobs(parsed.slice(-MAX_STORED_JOBS));
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOBS_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { archiveMinutes?: 5 | 15 | 30 };
      if (parsed.archiveMinutes === 5 || parsed.archiveMinutes === 15 || parsed.archiveMinutes === 30) {
        setArchiveMinutes(parsed.archiveMinutes);
      }
      if (typeof (parsed as { autoArchiveEnabled?: boolean }).autoArchiveEnabled === 'boolean') {
        setAutoArchiveEnabled(Boolean((parsed as { autoArchiveEnabled?: boolean }).autoArchiveEnabled));
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs.slice(-MAX_STORED_JOBS)));
    } catch {
      /* noop */
    }
  }, [jobs]);

  useEffect(() => {
    try {
      localStorage.setItem(
        JOBS_SETTINGS_STORAGE_KEY,
        JSON.stringify({ archiveMinutes, autoArchiveEnabled })
      );
    } catch {
      /* noop */
    }
  }, [archiveMinutes, autoArchiveEnabled]);

  useEffect(() => {
    let ignore = false;
    const loadHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!ignore) {
          setAsyncBackendEnabled(Boolean(data?.async));
        }
      } catch {
        if (!ignore) setAsyncBackendEnabled(null);
      }
    };
    void loadHealth();
    return () => {
      ignore = true;
    };
  }, []);

  const handleSplitFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setManualTempo(null);
      setHasStarted(true);
      setUiStage('preparing');
      const name = file.name?.replace(/\.[^.]+$/, '') ?? 'converted';
      setBaseFilename(name);
      setUiStage('analyzing');
      const bpmTask = detectBpmFromFile(file)
        .then(({ bpm, key }) => {
          setDetectedBpm(bpm);
          setDetectedKey(key);
        })
        .catch(() => {
          setDetectedBpm(null);
          setDetectedKey(null);
        });
      let stemsResult: AudioStems | null = null;
      try {
        setUiStage('separating');
        stemsResult = await separation.separate(file);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'Ошибка разделения');
        setUiStage('idle');
        return null;
      }
      await bpmTask;
      if (!stemsResult) {
        try {
          const buffer = await fileToAudioBuffer(file);
          stemsResult = { original: buffer, other: buffer };
          separation.setStemsFromProject(stemsResult);
        } catch (e) {
          setUploadError(e instanceof Error ? e.message : 'Не удалось декодировать аудио');
          setUiStage('idle');
          return null;
        }
      }
      setUiStage('converting');
      const converted = await midiConversion.convert(stemsResult, { multiTrack: true, accuracyMode });
      if (converted && (!detectedBpm || !detectedKey)) {
        const estimated = estimateTempoAndKeyFromTracks(converted);
        if (!detectedBpm && estimated.bpm) setDetectedBpm(estimated.bpm);
        if (!detectedKey && estimated.key) setDetectedKey(estimated.key);
      }
      setUiStage(converted ? 'ready' : 'idle');
      return converted;
    },
    [separation, midiConversion, detectedBpm, detectedKey, accuracyMode]
  );

  const handleSingleTrackFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      setManualTempo(null);
      setHasStarted(true);
      setUiStage('preparing');
      const name = file.name?.replace(/\.[^.]+$/, '') ?? 'converted';
      setBaseFilename(name);
      setUiStage('analyzing');
      const bpmTask = detectBpmFromFile(file)
        .then(({ bpm, key }) => {
          setDetectedBpm(bpm);
          setDetectedKey(key);
        })
        .catch(() => {
          setDetectedBpm(null);
          setDetectedKey(null);
        });
      let buffer: AudioBuffer;
      try {
        buffer = await fileToAudioBuffer(file);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : 'Не удалось декодировать аудио (поддерживаются MP3, WAV, FLAC, M4A)');
        setUiStage('idle');
        return null;
      }
      await bpmTask;
      const stemsResult = { original: buffer, other: buffer };
      separation.setStemsFromProject(stemsResult);
      setUiStage('converting');
      const converted = await midiConversion.convert(stemsResult, { multiTrack: false, accuracyMode });
      if (converted && (!detectedBpm || !detectedKey)) {
        const estimated = estimateTempoAndKeyFromTracks(converted);
        if (!detectedBpm && estimated.bpm) setDetectedBpm(estimated.bpm);
        if (!detectedKey && estimated.key) setDetectedKey(estimated.key);
      }
      setUiStage(converted ? 'ready' : 'idle');
      return converted;
    },
    [separation, midiConversion, detectedBpm, detectedKey, accuracyMode]
  );

  const tempo = Math.min(
    MAX_TEMPO,
    Math.max(MIN_TEMPO, manualTempo ?? detectedBpm ?? DEFAULT_TEMPO)
  );
  /** Темп для раскладки нот (без ручного переопределения), чтобы смена темпа меняла только скорость воспроизведения. */
  const layoutTempo = detectedBpm ?? DEFAULT_TEMPO;

  const keySignature = detectedKey ?? null;

  const transposeEditedTracks = useCallback((semitones: number) => {
    if (!editedTracks || semitones === 0) return;
    setEditedTracks((prev) => {
      if (!prev) return prev;
      return prev.map((track) => ({
        ...track,
        notes: track.notes.map((note) => ({
          ...note,
          pitch: Math.max(0, Math.min(127, Math.round(note.pitch + semitones))),
        })),
      }));
    });
  }, [editedTracks]);

  const handleTempoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      setManualTempo(null);
      return;
    }
    const value = Number(raw);
    if (!Number.isNaN(value)) {
      setManualTempo(Math.round(value));
    }
  }, []);

  const handleExportGtp = useCallback(async () => {
    if (editedTracks) {
      await exportGtp(
        editedTracks,
        `${baseFilename}.gp5`,
        tempo,
        layoutTempo,
        keySignature,
        accuracyMode
      );
    }
  }, [editedTracks, baseFilename, tempo, layoutTempo, keySignature, exportGtp, accuracyMode]);

  const handleExportMidi = useCallback(() => {
    if (editedTracks) exportMidi(editedTracks, `${baseFilename}.mid`, tempo, keySignature);
  }, [editedTracks, baseFilename, tempo, keySignature, exportMidi]);

  const reset = useCallback(() => {
    separation.reset();
    midiConversion.reset();
    setDetectedBpm(null);
    setDetectedKey(null);
    setManualTempo(null);
    setWorkspaceMode('preview');
    setUploadError(null);
    setHasStarted(false);
    setUiStage('idle');
    setEditorSettingsOpen(false);
    setJobs([]);
    try {
      localStorage.removeItem(JOBS_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, [separation, midiConversion]);

  const cancelJob = useCallback(async (job: JobItem) => {
    try {
      const res = await fetch(`/api/jobs/${job.type}/${job.id}/cancel`, { method: 'POST' });
      if (!res.ok) return;
      upsertJob(job.id, job.type, job.title, 'cancelled');
    } catch {
      /* noop */
    }
  }, [upsertJob]);

  const retryJob = useCallback(async (job: JobItem) => {
    try {
      const res = await fetch(`/api/jobs/${job.type}/${job.id}/retry`, { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({} as { taskId?: string; status?: string }));
      const newId = typeof data.taskId === 'string' ? data.taskId : job.id;
      upsertJob(job.id, job.type, job.title, 'retried');
      upsertJob(newId, job.type, job.title, 'pending');
    } catch {
      /* noop */
    }
  }, [upsertJob]);

  const clearCompletedJobs = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status !== 'completed'));
  }, []);
  const clearAllJobs = useCallback(() => {
    setJobs([]);
  }, []);
  const togglePinJob = useCallback((job: JobItem) => {
    setJobs((prev) => {
      const maxPinOrder = prev.reduce((max, j) => Math.max(max, j.pinOrder ?? 0), 0);
      return prev.map((j) =>
        j.id === job.id
          ? {
              ...j,
              pinned: !j.pinned,
              pinOrder: !j.pinned ? maxPinOrder + 1 : j.pinOrder,
              updatedAt: Date.now(),
            }
          : j
      );
    });
  }, []);
  const pinAllInProgress = useCallback(() => {
    setJobs((prev) => {
      let nextOrder = prev.reduce((max, j) => Math.max(max, j.pinOrder ?? 0), 0);
      return prev.map((j) => {
        const inProgress = j.status === 'pending' || j.status === 'processing';
        if (!inProgress || j.pinned) return j;
        nextOrder += 1;
        return { ...j, pinned: true, pinOrder: nextOrder, updatedAt: Date.now() };
      });
    });
  }, []);
  const movePinnedJob = useCallback((dragId: string, targetId: string) => {
    setJobs((prev) => {
      const pinned = prev
        .filter((j) => j.pinned)
        .sort((a, b) => (a.pinOrder ?? Number.MAX_SAFE_INTEGER) - (b.pinOrder ?? Number.MAX_SAFE_INTEGER));
      const from = pinned.findIndex((j) => j.id === dragId);
      const to = pinned.findIndex((j) => j.id === targetId);
      if (from < 0 || to < 0) return prev;
      const [item] = pinned.splice(from, 1);
      pinned.splice(to, 0, item);
      const orderMap = new Map<string, number>();
      pinned.forEach((j, idx) => orderMap.set(j.id, idx + 1));
      return prev.map((j) =>
        j.pinned && orderMap.has(j.id)
          ? { ...j, pinOrder: orderMap.get(j.id), updatedAt: Date.now() }
          : j
      );
    });
  }, []);

  useEffect(() => {
    const activeJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'processing');
    if (activeJobs.length === 0) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      for (const job of activeJobs) {
        try {
          const res = await fetch(`/api/jobs/${job.type}/${job.id}`);
          if (!res.ok) continue;
          const data = await res.json().catch(() => ({} as { status?: JobStatus }));
          if (!cancelled && data.status) {
            upsertJob(job.id, job.type, job.title, data.status);
          }
        } catch {
          /* noop */
        }
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobs, upsertJob]);

  useEffect(() => {
    if (!autoArchiveEnabled) return;
    const completedAutoArchiveMs = archiveMinutes * 60 * 1000;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setJobs((prev) =>
        prev.filter((j) => !(!j.pinned && j.status === 'completed' && now - (j.updatedAt ?? j.createdAt) > completedAutoArchiveMs))
      );
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [archiveMinutes, autoArchiveEnabled]);

  const status =
    uiStage === 'preparing'
      ? 'preparing'
      : uiStage === 'analyzing'
        ? 'analyzing'
        : isLoading
          ? separation.isLoading
            ? 'separating'
            : 'converting'
          : stems && tracks
            ? 'ready'
            : 'idle';

  const progress = separation.isLoading ? separation.progress : midiConversion.progress;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {!hasStarted && (
      <div className="overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111]">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-3 md:border-r md:border-[#2A2A2A]">
            <UploadDropzone
              accept={AUDIO_ACCEPT}
              onFileSelect={(f) => {
                if (AUDIO_EXT.test(f.name)) void handleSplitFile(f);
              }}
              disabled={isLoading}
              title="Разобрать на дорожки"
              subtitle="Мультитрек: один файл -> темп/тональность -> стемы -> ноты -> экспорт в GTP"
              formatsHint="MP3, WAV, FLAC, M4A"
              minHeightClass="min-h-[240px]"
              icon={(
                <svg className="h-5 w-5 text-[#8A2BE2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
              )}
            />
          </div>

          <div className="p-3">
            <UploadDropzone
              accept={AUDIO_ACCEPT}
              onFileSelect={(f) => {
                if (AUDIO_EXT.test(f.name)) void handleSingleTrackFile(f);
              }}
              disabled={isLoading}
              title="Одна дорожка"
              subtitle="Монотрек: микс/готовая дорожка -> темп/тональность -> ноты -> экспорт в GTP"
              formatsHint="MP3, WAV, FLAC, M4A"
              minHeightClass="min-h-[240px]"
              icon={(
                <svg className="h-5 w-5 text-[#8A2BE2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              )}
            />
          </div>
        </div>
      </div>
      )}

      <ProcessingStatus
        status={status}
        progress={progress}
        downloadProgress={separation.downloadProgress}
        error={error ?? undefined}
        separationWarning={separation.separationWarning ?? undefined}
        usedFallback={separation.usedFallback}
      />
      {asyncBackendEnabled !== null && (
        <p className="text-xs text-[#7F7F7F]">
          {asyncBackendEnabled
            ? 'Async-ускорение активно: разделение выполняется через Celery очередь.'
            : 'Для ускорения включите Celery: Redis + USE_CELERY=1 + celery worker.'}
        </p>
      )}
      <JobCenter
        jobs={jobs}
        onCancel={cancelJob}
        onRetry={retryJob}
        onClearCompleted={clearCompletedJobs}
        onClearAll={clearAllJobs}
        archiveMinutes={archiveMinutes}
        onArchiveMinutesChange={setArchiveMinutes}
        autoArchiveEnabled={autoArchiveEnabled}
        onAutoArchiveEnabledChange={setAutoArchiveEnabled}
        onTogglePin={togglePinJob}
        onPinAllInProgress={pinAllInProgress}
        onMovePinned={movePinnedJob}
      />

      {detectedBpm != null && (
        <p className="text-sm text-[#A0A0A0]">
          Темп: <span className="font-medium text-[#E0E0E0]">{Math.round(detectedBpm)} BPM</span>
          {detectedKey && (
            <> · Тональность: <span className="font-medium text-[#E0E0E0]">{detectedKey}</span></>
          )}
        </p>
      )}

      {stems && editedTracks && (
        <>
          <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] p-1">
                <button
                  onClick={() => setWorkspaceMode('preview')}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${workspaceMode === 'preview' ? 'bg-[#8A2BE2]/30 text-[#E0E0E0]' : 'text-[#A0A0A0] hover:text-[#E0E0E0]'}`}
                >
                  Просмотр
                </button>
                <button
                  onClick={() => setWorkspaceMode('edit')}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${workspaceMode === 'edit' ? 'bg-[#8A2BE2]/30 text-[#E0E0E0]' : 'text-[#A0A0A0] hover:text-[#E0E0E0]'}`}
                >
                  Редактирование
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#A0A0A0]">
                <span>Темп, BPM:</span>
                <input
                  type="number"
                  min={MIN_TEMPO}
                  max={MAX_TEMPO}
                  step={1}
                  value={tempo}
                  onChange={handleTempoChange}
                  className="w-20 rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 text-[#E0E0E0] focus:border-[#8A2BE2] focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[#A0A0A0]">
                <span>Точность:</span>
                <select
                  value={accuracyMode}
                  onChange={(e) => setAccuracyMode(e.target.value as AccuracyMode)}
                  className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-2 py-1.5 text-[#E0E0E0] focus:border-[#8A2BE2] focus:outline-none"
                >
                  <option value="balanced">Balanced</option>
                  <option value="max">Max Accuracy</option>
                  <option value="ultra">Ultra Accuracy</option>
                  <option value="extreme">Extreme Precision</option>
                </select>
              </label>
              <button
                onClick={() => setEditorSettingsOpen((prev) => !prev)}
                className="rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-1.5 text-sm text-[#E0E0E0] transition-all hover:border-[#8A2BE2] hover:text-white"
                title="Показать инструменты и настройки редактора"
              >
                Редактор: настройки
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_330px]">
              <div>
                {workspaceMode === 'preview' ? (
                  <AlphaTabPlayer
                    tracks={editedTracks}
                    tempo={tempo}
                    layoutTempo={layoutTempo}
                    keySignature={keySignature}
                  />
                ) : (
                  <StaffViewer
                    tracks={editedTracks}
                    onTracksChange={setEditedTracks}
                    detectedKey={detectedKey}
                    tempo={tempo}
                    zoom={editorZoom}
                    highContrast={editorHighContrast}
                    editMode={editorEditMode}
                    onEditModeChange={setEditorEditMode}
                    showReferenceMelody={editorShowReference}
                    onShowReferenceMelodyChange={setEditorShowReference}
                    overlayMelodyAudio={editorOverlayAudio}
                    onOverlayMelodyAudioChange={setEditorOverlayAudio}
                    referenceTrackIdx={editorReferenceTrackIdx}
                    onReferenceTrackIdxChange={setEditorReferenceTrackIdx}
                    hideToolbar
                    quantizeDivision={editorQuantizeDivision}
                  />
                )}
              </div>
              <div className="xl:sticky xl:top-24 xl:self-start">
                <ExportSection
                  stems={stems}
                  tracks={editedTracks}
                  baseFilename={baseFilename}
                  onExportGtp={handleExportGtp}
                  onExportMidi={handleExportMidi}
                  gtpError={gtpError}
                  embedded
                />
              </div>
            </div>
          </div>
          {workspaceMode === 'edit' && (
            <>
              <button
                onClick={() => setEditorSettingsOpen((prev) => !prev)}
                className="fixed bottom-6 right-6 z-[70] flex h-14 w-14 items-center justify-center rounded-full border border-[#8A2BE2]/60 bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-white shadow-2xl transition-all duration-300 hover:scale-105"
                title="Инструменты редактора"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M10.3 2.8a1 1 0 0 1 1.4 0l.8.8a1 1 0 0 0 1 .25l1.1-.32a1 1 0 0 1 1.2.68l.37 1.11a1 1 0 0 0 .76.67l1.15.22a1 1 0 0 1 .8.98v1.13a1 1 0 0 0 .46.85l.98.66a1 1 0 0 1 .29 1.4l-.64.94a1 1 0 0 0-.1.96l.48 1.04a1 1 0 0 1-.52 1.33l-1.05.45a1 1 0 0 0-.58.77l-.19 1.16a1 1 0 0 1-.96.82h-1.13a1 1 0 0 0-.86.48l-.62.99a1 1 0 0 1-1.39.33l-.97-.6a1 1 0 0 0-.95-.08l-1.06.5a1 1 0 0 1-1.34-.5l-.48-1.04a1 1 0 0 0-.77-.58l-1.16-.2a1 1 0 0 1-.82-.96V17.7a1 1 0 0 0-.47-.85l-.99-.63a1 1 0 0 1-.33-1.39l.6-.97a1 1 0 0 0 .08-.95l-.5-1.06a1 1 0 0 1 .5-1.34l1.04-.48a1 1 0 0 0 .58-.77l.2-1.16a1 1 0 0 1 .96-.82h1.13a1 1 0 0 0 .85-.47l.63-.99Z" />
                  <circle cx="12" cy="12" r="3.2" />
                </svg>
              </button>
              <div
                className={`fixed right-0 top-0 z-[65] h-screen w-[320px] border-l border-[#2A2A2A] bg-[#0B0B0B]/95 p-5 shadow-2xl backdrop-blur-xl transition-transform duration-300 ${editorSettingsOpen ? 'translate-x-0' : 'translate-x-full'}`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-base font-semibold text-[#E0E0E0]">Инструменты редактора</h4>
                  <button onClick={() => setEditorSettingsOpen(false)} className="text-sm text-[#A0A0A0] hover:text-[#E0E0E0]">
                    Закрыть
                  </button>
                </div>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="mb-2 text-[#A0A0A0]">Режим</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setEditorEditMode('select')} className={`rounded-lg border px-3 py-2 ${editorEditMode === 'select' ? 'border-[#8A2BE2] bg-[#8A2BE2]/20 text-[#E0E0E0]' : 'border-[#2A2A2A] text-[#A0A0A0]'}`}>Курсор</button>
                      <button onClick={() => setEditorEditMode('pencil')} className={`rounded-lg border px-3 py-2 ${editorEditMode === 'pencil' ? 'border-[#8A2BE2] bg-[#8A2BE2]/20 text-[#E0E0E0]' : 'border-[#2A2A2A] text-[#A0A0A0]'}`}>Карандаш</button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[#A0A0A0]">Транспонирование</p>
                    <div className="grid grid-cols-4 gap-2">
                      <button onClick={() => transposeEditedTracks(-12)} className="rounded border border-[#2A2A2A] px-2 py-1 text-[#E0E0E0]">-12</button>
                      <button onClick={() => transposeEditedTracks(-1)} className="rounded border border-[#2A2A2A] px-2 py-1 text-[#E0E0E0]">-1</button>
                      <button onClick={() => transposeEditedTracks(1)} className="rounded border border-[#2A2A2A] px-2 py-1 text-[#E0E0E0]">+1</button>
                      <button onClick={() => transposeEditedTracks(12)} className="rounded border border-[#2A2A2A] px-2 py-1 text-[#E0E0E0]">+12</button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[#A0A0A0]">Видимость нот</p>
                    <label className="mb-2 block text-xs text-[#A0A0A0]">Zoom: {editorZoom.toFixed(2)}x</label>
                    <input type="range" min={0.8} max={1.6} step={0.05} value={editorZoom} onChange={(e) => setEditorZoom(Number(e.target.value))} className="w-full" />
                    <label className="mt-2 flex items-center gap-2 text-[#A0A0A0]">
                      <input type="checkbox" checked={editorHighContrast} onChange={(e) => setEditorHighContrast(e.target.checked)} />
                      Высокий контраст
                    </label>
                    <div className="mt-3">
                      <label className="mb-1 block text-xs text-[#A0A0A0]">Сетка квантования</label>
                      <select
                        value={String(editorQuantizeDivision)}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEditorQuantizeDivision(
                            value === '8' ? 8 : value === '16' ? 16 : value === '32' ? 32 : 'auto'
                          );
                        }}
                        className="w-full rounded-lg border border-[#2A2A2A] bg-[#111111] px-2 py-2 text-[#E0E0E0]"
                      >
                        <option value="auto">Auto (по плотности)</option>
                        <option value="8">1/8</option>
                        <option value="16">1/16</option>
                        <option value="32">1/32</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[#A0A0A0]">Overlay</p>
                    <label className="flex items-center gap-2 text-[#A0A0A0]">
                      <input type="checkbox" checked={editorShowReference} onChange={(e) => setEditorShowReference(e.target.checked)} />
                      Показывать референс
                    </label>
                    <label className="mt-2 flex items-center gap-2 text-[#A0A0A0]">
                      <input type="checkbox" checked={editorOverlayAudio} onChange={(e) => setEditorOverlayAudio(e.target.checked)} />
                      Аудио overlay
                    </label>
                    <select
                      value={editorReferenceTrackIdx}
                      onChange={(e) => setEditorReferenceTrackIdx(Number(e.target.value))}
                      className="mt-2 w-full rounded-lg border border-[#2A2A2A] bg-[#111111] px-2 py-2 text-[#E0E0E0]"
                    >
                      {editedTracks.map((track, idx) => (
                        <option key={`${track.instrument}-${idx}`} value={idx}>
                          Реф: {track.instrument}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {status !== 'idle' && (
        <div className="flex justify-center">
          <button
            onClick={reset}
            className="rounded-full border border-[#2A2A2A] px-8 py-3 font-medium text-[#A0A0A0] transition-all hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
          >
            Начать заново
          </button>
        </div>
      )}
    </motion.div>
  );
}
