import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { MidiTrackData, StemType } from '../types/audio.types';
import { STEM_LABELS } from '../types/audio.types';

const STAFF_LINE_SPACING = 8;
const BASE_NOTE_RADIUS = 6;
const PAGE_WIDTH = 1024;
const PAGE_PADDING_X = 24;
const MIN_TIME_SCALE = 22;
const MAX_TIME_SCALE = 120;
const TRACK_HEIGHT = 90;
const MIN_NOTE_WIDTH = 10;
const DEFAULT_NOTE_DURATION = 0.5;
const DEFAULT_VELOCITY = 100;
const MIN_PITCH = 28;
const MAX_PITCH = 108;
const MAX_OVERLAY_OCTAVE = 12;

type EditMode = 'select' | 'pencil';
type DragType = 'move' | 'resize';

interface DragState {
  trackIdx: number;
  noteIdx: number;
  type: DragType;
  startX: number;
  startY: number;
  originalStart: number;
  originalEnd: number;
  originalPitch: number;
}

interface StaffViewerProps {
  tracks: MidiTrackData[];
  onTracksChange?: (tracks: MidiTrackData[]) => void;
  detectedKey?: string | null;
  tempo?: number;
  rhythmSignature?: string;
  zoom?: number;
  highContrast?: boolean;
  editMode?: EditMode;
  onEditModeChange?: (mode: EditMode) => void;
  showReferenceMelody?: boolean;
  onShowReferenceMelodyChange?: (value: boolean) => void;
  overlayMelodyAudio?: boolean;
  onOverlayMelodyAudioChange?: (value: boolean) => void;
  referenceTrackIdx?: number;
  onReferenceTrackIdxChange?: (idx: number) => void;
  hideToolbar?: boolean;
  quantizeDivision?: 'auto' | 8 | 16 | 32;
}

const STRING_INFO: Record<StemType, number | null> = {
  guitar: 6,
  bass: 4,
  vocals: null,
  drums: null,
  piano: null,
  other: null,
};

const STEM_OPTIONS: StemType[] = ['guitar', 'bass', 'piano', 'vocals', 'drums', 'other'];
const STEM_ICONS: Record<StemType, string> = {
  guitar: '🎸',
  bass: '🎻',
  piano: '🎹',
  vocals: '🎤',
  drums: '🥁',
  other: '🎼',
};
const CIRCLE_MAJOR = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'Ab', 'Eb', 'Bb', 'F'];
const CIRCLE_MINOR = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m', 'Fm', 'Cm', 'Gm', 'Dm'];

function normalizeKeyLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  const v = key.trim();
  if (!v) return null;
  const compact = v.replace(/\s+/g, '').replace(/major$/i, '').replace(/minor$/i, 'm');
  const lower = compact.toLowerCase();
  if (lower.endsWith('m')) {
    const root = compact.slice(0, -1);
    return `${root.charAt(0).toUpperCase()}${root.slice(1)}m`;
  }
  return `${compact.charAt(0).toUpperCase()}${compact.slice(1)}`;
}

function circleIndexForKey(key: string | null | undefined): number {
  const normalized = normalizeKeyLabel(key);
  if (!normalized) return -1;
  const majorIdx = CIRCLE_MAJOR.indexOf(normalized);
  if (majorIdx >= 0) return majorIdx;
  return CIRCLE_MINOR.indexOf(normalized);
}

function detectRhythmSignature(tracks: MidiTrackData[], tempo: number): string {
  if (!Number.isFinite(tempo) || tempo <= 0) return '4/4';
  const beatSeconds = 60 / tempo;
  const onsets = tracks
    .flatMap((track) => track.notes.map((note) => note.startTime))
    .filter((t) => Number.isFinite(t) && t >= 0)
    .sort((a, b) => a - b)
    .slice(0, 800);
  if (onsets.length < 8) return '4/4';

  const sigma = beatSeconds * 0.18;
  const scoreFor = (beatsPerBar: 3 | 4): number => {
    const bar = beatsPerBar * beatSeconds;
    return onsets.reduce((acc, t) => {
      const mod = t % bar;
      const distance = Math.min(mod, bar - mod);
      return acc + Math.exp(-(distance * distance) / (2 * sigma * sigma));
    }, 0);
  };

  const score3 = scoreFor(3);
  const score4 = scoreFor(4);
  if (score3 > score4 * 1.12) return '3/4';
  return '4/4';
}

function detectQuantizeStepSec(tracks: MidiTrackData[], tempo: number): number {
  if (!Number.isFinite(tempo) || tempo <= 0) return 0.125;
  const beat = 60 / tempo;
  const onsets = tracks.flatMap((t) => t.notes.map((n) => n.startTime)).sort((a, b) => a - b);
  if (onsets.length < 8) return beat / 4; // 1/16
  let densePairs = 0;
  for (let i = 1; i < onsets.length; i++) {
    if (onsets[i] - onsets[i - 1] < beat / 4) densePairs++;
  }
  const densityRatio = densePairs / Math.max(1, onsets.length - 1);
  if (densityRatio > 0.4) return beat / 8; // 1/32
  if (densityRatio > 0.18) return beat / 4; // 1/16
  return beat / 2; // 1/8
}

function midiToStaffY(midiNote: number): number {
  const staffCenterY = 40;
  const middleC = 60;
  return staffCenterY - (midiNote - middleC) * (STAFF_LINE_SPACING / 2);
}

function staffYToMidi(baseY: number, y: number): number {
  const staffCenterY = 40;
  const middleC = 60;
  const localY = y - baseY - 20;
  const pitch = middleC + ((staffCenterY - localY) * 2) / STAFF_LINE_SPACING;
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.round(pitch)));
}

function cloneTracks(tracks: MidiTrackData[]): MidiTrackData[] {
  return tracks.map((track) => ({
    ...track,
    notes: track.notes.map((note) => ({ ...note })),
  }));
}

export function StaffViewer({
  tracks: initialTracks,
  onTracksChange,
  detectedKey = null,
  tempo = 120,
  rhythmSignature,
  zoom = 1,
  highContrast = false,
  editMode: controlledEditMode,
  onEditModeChange,
  showReferenceMelody: controlledShowReferenceMelody,
  onShowReferenceMelodyChange,
  overlayMelodyAudio: controlledOverlayMelodyAudio,
  onOverlayMelodyAudioChange,
  referenceTrackIdx: controlledReferenceTrackIdx,
  onReferenceTrackIdxChange,
  hideToolbar = false,
  quantizeDivision = 'auto',
}: StaffViewerProps) {
  const [tracks, setTracks] = useState<MidiTrackData[]>(cloneTracks(initialTracks));
  const [selectedNote, setSelectedNote] = useState<{ trackIdx: number; noteIdx: number } | null>(null);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [internalEditMode, setInternalEditMode] = useState<EditMode>('select');
  const [transposeSemitones, setTransposeSemitones] = useState(0);
  const [internalShowReferenceMelody, setInternalShowReferenceMelody] = useState(true);
  const [internalOverlayMelodyAudio, setInternalOverlayMelodyAudio] = useState(true);
  const [internalReferenceTrackIdx, setInternalReferenceTrackIdx] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const editMode = controlledEditMode ?? internalEditMode;
  const setEditModeState = onEditModeChange ?? setInternalEditMode;
  const showReferenceMelody = controlledShowReferenceMelody ?? internalShowReferenceMelody;
  const setShowReferenceState = onShowReferenceMelodyChange ?? setInternalShowReferenceMelody;
  const overlayMelodyAudio = controlledOverlayMelodyAudio ?? internalOverlayMelodyAudio;
  const setOverlayAudioState = onOverlayMelodyAudioChange ?? setInternalOverlayMelodyAudio;
  const referenceTrackIdx = controlledReferenceTrackIdx ?? internalReferenceTrackIdx;
  const setReferenceTrackState = onReferenceTrackIdxChange ?? setInternalReferenceTrackIdx;


  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number>(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadPercent, setPlayheadPercent] = useState(0);
  const keyIndex = useMemo(() => circleIndexForKey(detectedKey), [detectedKey]);
  const autoRhythmSignature = useMemo(
    () => rhythmSignature ?? detectRhythmSignature(tracks, tempo),
    [rhythmSignature, tempo, tracks]
  );
  const quantizeStepSec = useMemo(() => {
    const beat = 60 / Math.max(1, tempo);
    if (quantizeDivision === 8) return beat / 2;
    if (quantizeDivision === 16) return beat / 4;
    if (quantizeDivision === 32) return beat / 8;
    return detectQuantizeStepSec(tracks, tempo);
  }, [tracks, tempo, quantizeDivision]);
  const quantizeLabel = useMemo(() => {
    const beat = 60 / Math.max(1, tempo);
    if (quantizeStepSec <= beat / 8 + 1e-4) return '1/32';
    if (quantizeStepSec <= beat / 4 + 1e-4) return '1/16';
    return '1/8';
  }, [quantizeStepSec, tempo]);

  useEffect(() => {
    setTracks(cloneTracks(initialTracks));
    setSelectedNote(null);
    setSelectedTrack(0);
  }, [initialTracks]);

  useEffect(() => {
    onTracksChange?.(tracks);
  }, [tracks, onTracksChange]);

  const allNotes = useMemo(
    () =>
      tracks.flatMap((track, trackIdx) =>
        track.notes.map((note, noteIdx) => ({
          ...note,
          trackIdx,
          noteIdx,
          instrument: track.instrument,
        }))
      ),
    [tracks]
  );

  const referenceNotes = useMemo(
    () => tracks[referenceTrackIdx]?.notes ?? [],
    [tracks, referenceTrackIdx]
  );

  const maxTime = allNotes.length > 0 ? Math.max(...allNotes.map((note) => note.endTime)) : 0;
  const drawableWidth = PAGE_WIDTH - PAGE_PADDING_X * 2;
  const scaledMinTime = MIN_TIME_SCALE * Math.max(0.7, zoom);
  const scaledMaxTime = MAX_TIME_SCALE * Math.max(0.7, zoom);
  const timeScale = maxTime > 0
    ? Math.max(scaledMinTime, Math.min(scaledMaxTime, (drawableWidth / Math.max(maxTime, 6)) * zoom))
    : MAX_TIME_SCALE;
  const width = PAGE_WIDTH;
  const height = tracks.length * TRACK_HEIGHT;
  const noteRadius = Math.max(5, Math.min(10, BASE_NOTE_RADIUS * Math.max(0.8, zoom)));

  const deleteSelectedNote = useCallback(() => {
    if (!selectedNote) return;
    const { trackIdx, noteIdx } = selectedNote;
    setTracks((prev) => {
      const next = cloneTracks(prev);
      next[trackIdx].notes.splice(noteIdx, 1);
      return next;
    });
    setSelectedNote(null);
  }, [selectedNote]);

  const updateTrackInstrument = useCallback((trackIdx: number, instrument: StemType) => {
    setTracks((prev) => {
      const next = cloneTracks(prev);
      const track = next[trackIdx];
      track.instrument = instrument;
      if (instrument === 'guitar') track.program = 24;
      else if (instrument === 'bass') track.program = 33;
      else if (instrument === 'piano') track.program = 0;
      else if (instrument === 'vocals') track.program = 52;
      else if (instrument === 'drums') track.program = 0;
      else track.program = 0;
      return next;
    });
  }, []);

  const transpose = useCallback((semitones: number) => {
    if (!semitones) return;
    setTracks((prev) => {
      const next = cloneTracks(prev);
      for (const track of next) {
        track.notes = track.notes.map((note) => ({
          ...note,
          pitch: Math.max(MIN_PITCH, Math.min(MAX_PITCH, note.pitch + semitones)),
        }));
      }
      return next;
    });
  }, []);

  const applyTransposeInput = useCallback(() => {
    transpose(transposeSemitones);
    setTransposeSemitones(0);
  }, [transpose, transposeSemitones]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedNote();
      }
      if (e.key.toLowerCase() === 'p') setEditModeState('pencil');
      if (e.key.toLowerCase() === 'v') setEditModeState('select');
      if (e.key === 'ArrowUp' && selectedNote) {
        e.preventDefault();
        setTracks((prev) => {
          const next = cloneTracks(prev);
          const note = next[selectedNote.trackIdx].notes[selectedNote.noteIdx];
          note.pitch = Math.min(MAX_PITCH, note.pitch + 1);
          return next;
        });
      }
      if (e.key === 'ArrowDown' && selectedNote) {
        e.preventDefault();
        setTracks((prev) => {
          const next = cloneTracks(prev);
          const note = next[selectedNote.trackIdx].notes[selectedNote.noteIdx];
          note.pitch = Math.max(MIN_PITCH, note.pitch - 1);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedNote, selectedNote, setEditModeState]);

  const playAll = useCallback(() => {
    if (allNotes.length === 0) return;

    const ctx = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = ctx;
    const startAt = ctx.currentTime;
    const totalDuration = maxTime + 0.5;

    allNotes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440 * Math.pow(2, (note.pitch - 69) / 12);
      osc.type = note.instrument === 'bass' ? 'triangle' : 'sine';
      gain.gain.setValueAtTime(0.11 * (note.velocity / 127), startAt + note.startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + note.endTime);
      osc.start(startAt + note.startTime);
      osc.stop(startAt + note.endTime + 0.02);
    });

    if (overlayMelodyAudio && referenceNotes.length > 0) {
      referenceNotes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const overlayPitch = Math.min(MAX_PITCH, note.pitch + MAX_OVERLAY_OCTAVE);
        osc.frequency.value = 440 * Math.pow(2, (overlayPitch - 69) / 12);
        osc.type = 'square';
        gain.gain.setValueAtTime(0.03, startAt + note.startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + note.endTime);
        osc.start(startAt + note.startTime);
        osc.stop(startAt + note.endTime + 0.02);
      });
    }

    setIsPlaying(true);
    setCurrentTime(0);

    const startWallTime = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - startWallTime) / 1000;
      if (elapsed >= totalDuration) {
        setCurrentTime(totalDuration);
        setPlayheadPercent(100);
        setIsPlaying(false);
        cancelAnimationFrame(animationRef.current);
        return;
      }
      setCurrentTime(elapsed);
      setPlayheadPercent(maxTime > 0 ? (elapsed / maxTime) * 100 : 0);
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [allNotes, maxTime, overlayMelodyAudio, referenceNotes]);

  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(animationRef.current);
    setIsPlaying(false);
    setCurrentTime(0);
    setPlayheadPercent(0);
  }, []);

  useEffect(() => () => cancelAnimationFrame(animationRef.current), []);

  const isNotePlaying = (startTime: number, endTime: number) =>
    isPlaying && currentTime >= startTime && currentTime <= endTime;

  const handleDragStart = useCallback(
    (e: React.MouseEvent, trackIdx: number, noteIdx: number, type: DragType) => {
      e.stopPropagation();
      const note = tracks[trackIdx]?.notes[noteIdx];
      if (!note) return;
      setSelectedTrack(trackIdx);
      setSelectedNote({ trackIdx, noteIdx });
      setDragState({
        trackIdx,
        noteIdx,
        type,
        startX: e.clientX,
        startY: e.clientY,
        originalStart: note.startTime,
        originalEnd: note.endTime,
        originalPitch: note.pitch,
      });
    },
    [tracks]
  );

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!dragState) return;
      const dxSec = (e.clientX - dragState.startX) / timeScale;
      const dyPitch = Math.round((e.clientY - dragState.startY) / 4);
      setTracks((prev) => {
        const next = cloneTracks(prev);
        const note = next[dragState.trackIdx]?.notes[dragState.noteIdx];
        if (!note) return prev;
        if (dragState.type === 'move') {
          const dur = dragState.originalEnd - dragState.originalStart;
          const rawStart = Math.max(0, dragState.originalStart + dxSec);
          const newStart = Math.round(rawStart / quantizeStepSec) * quantizeStepSec;
          note.startTime = newStart;
          note.endTime = Math.max(newStart + 0.05, newStart + dur);
          note.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, dragState.originalPitch - dyPitch));
        } else {
          const rawEnd = Math.max(
            dragState.originalStart + 0.05,
            dragState.originalEnd + dxSec
          );
          const end = Math.max(dragState.originalStart + quantizeStepSec, Math.round(rawEnd / quantizeStepSec) * quantizeStepSec);
          note.endTime = end;
        }
        return next;
      });
    },
    [dragState, quantizeStepSec, timeScale]
  );

  const handleSvgMouseUp = useCallback(() => {
    if (!dragState) return;
    setDragState(null);
    setTracks((prev) => {
      const next = cloneTracks(prev);
      next.forEach((track) => {
        track.notes.sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < track.notes.length - 1; i++) {
          const current = track.notes[i];
          const following = track.notes[i + 1];
          if (current.pitch === following.pitch && current.endTime > following.startTime) {
            current.endTime = Math.max(current.startTime + quantizeStepSec, following.startTime);
          }
        }
      });
      return next;
    });
  }, [dragState, quantizeStepSec]);

  const handleLaneClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (editMode !== 'pencil' || tracks.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const trackIdx = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
      const baseY = trackIdx * TRACK_HEIGHT;
      const rawStart = Math.max(0, (x - PAGE_PADDING_X) / timeScale);
      const startTime = Math.round(rawStart / quantizeStepSec) * quantizeStepSec;
      const pitch = staffYToMidi(baseY, y);
      setTracks((prev) => {
        const next = cloneTracks(prev);
        next[trackIdx].notes.push({
          pitch,
          startTime,
          endTime: startTime + Math.max(DEFAULT_NOTE_DURATION, quantizeStepSec * 2),
          velocity: DEFAULT_VELOCITY,
        });
        next[trackIdx].notes.sort((a, b) => a.startTime - b.startTime);
        return next;
      });
      setSelectedTrack(trackIdx);
    },
    [editMode, quantizeStepSec, timeScale, tracks.length]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-[calc(100vh-140px)] flex-col overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#111111]"
    >
      <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-[#2A2A2A] bg-[#1A1A1A] px-4 py-4">
        {hideToolbar ? (
          <div className="flex w-full items-center justify-between gap-3">
            <button
              onClick={isPlaying ? stopPlayback : playAll}
              disabled={allNotes.length === 0}
              className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-5 py-2 text-xs font-semibold text-white transition-all duration-300 hover:scale-105 disabled:opacity-50"
            >
              {isPlaying ? 'Стоп' : 'Воспроизвести'}
            </button>
            <div className="flex items-center gap-2 text-xs text-[#A0A0A0]">
              <span>Режим: {editMode === 'pencil' ? 'Карандаш' : 'Курсор'}</span>
              <span className="rounded-full border border-[#2A2A2A] bg-[#0A0A0A] px-2 py-1 text-[11px] text-[#A0A0A0]">
                Сетка: {quantizeLabel}
              </span>
            </div>
          </div>
        ) : (
          <>
        <div className="flex items-center gap-2">
          <button
            onClick={isPlaying ? stopPlayback : playAll}
            disabled={allNotes.length === 0}
            className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-5 py-2 text-xs font-semibold text-white transition-all duration-300 hover:scale-105 disabled:opacity-50"
          >
            {isPlaying ? 'Стоп' : 'Воспроизвести'}
          </button>
          <button
            onClick={() => setEditModeState('select')}
            className={`rounded-md px-3 py-1.5 text-xs ${editMode === 'select' ? 'bg-[#8A2BE2]/30 text-[#E0E0E0]' : 'text-[#A0A0A0] hover:text-[#E0E0E0]'}`}
          >
            Курсор
          </button>
          <button
            onClick={() => setEditModeState('pencil')}
            className={`rounded-md px-3 py-1.5 text-xs ${editMode === 'pencil' ? 'bg-[#8A2BE2]/30 text-[#E0E0E0]' : 'text-[#A0A0A0] hover:text-[#E0E0E0]'}`}
          >
            Карандаш
          </button>
          {selectedNote && (
            <button
              onClick={deleteSelectedNote}
              className="rounded-md border border-red-500/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
            >
              Удалить
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => transpose(-1)} className="rounded bg-[#0A0A0A] px-2 py-1 text-xs text-[#A0A0A0]">-1</button>
          <button onClick={() => transpose(1)} className="rounded bg-[#0A0A0A] px-2 py-1 text-xs text-[#A0A0A0]">+1</button>
          <button onClick={() => transpose(-12)} className="rounded bg-[#0A0A0A] px-2 py-1 text-xs text-[#A0A0A0]">-12</button>
          <button onClick={() => transpose(12)} className="rounded bg-[#0A0A0A] px-2 py-1 text-xs text-[#A0A0A0]">+12</button>
          <input
            type="number"
            value={transposeSemitones}
            onChange={(e) => setTransposeSemitones(Number(e.target.value) || 0)}
            className="w-16 rounded border border-[#2A2A2A] bg-[#0A0A0A] px-2 py-1 text-xs text-[#E0E0E0]"
            title="Сдвиг в полутонах"
          />
          <button onClick={applyTransposeInput} className="rounded bg-[#0A0A0A] px-2 py-1 text-xs text-[#A0A0A0]">
            OK
          </button>
          <select
            value={referenceTrackIdx}
            onChange={(e) => setReferenceTrackState(Number(e.target.value))}
            className="rounded border border-[#2A2A2A] bg-[#0A0A0A] px-2 py-1 text-xs text-[#E0E0E0]"
          >
            {tracks.map((track, idx) => (
              <option key={`${track.instrument}-${idx}`} value={idx}>
                Реф: {STEM_LABELS[track.instrument]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-[#A0A0A0]">
            <input type="checkbox" checked={showReferenceMelody} onChange={(e) => setShowReferenceState(e.target.checked)} />
            Overlay
          </label>
          <label className="flex items-center gap-1 text-xs text-[#A0A0A0]">
            <input type="checkbox" checked={overlayMelodyAudio} onChange={(e) => setOverlayAudioState(e.target.checked)} />
            Audio
          </label>
          <span className="rounded-full border border-[#2A2A2A] bg-[#0A0A0A] px-2 py-1 text-[11px] text-[#A0A0A0]">
            Сетка: {quantizeLabel}
          </span>
        </div>
          </>
        )}
      </div>

      <div className={`${highContrast ? 'bg-[#E7E7E7]' : 'bg-[#EDEDED]'} relative flex-1 overflow-y-auto`} style={{ minHeight: 'calc(100vh - 220px)' }}>
        <div className="mx-auto my-6 w-full max-w-[1040px] rounded-2xl border border-[#D7D7D7] bg-white shadow-xl">
        <div className="pointer-events-none absolute left-3 top-3 z-20">
          <div className="pointer-events-auto flex flex-col gap-2 rounded-2xl border border-[#2A2A2A] bg-[#0A0A0A]/90 p-2 backdrop-blur">
            {tracks.map((track, idx) => (
              <button
                key={`tool-${idx}-${track.instrument}`}
                onClick={() => setSelectedTrack(idx)}
                title={`${STEM_LABELS[track.instrument]} · ${STRING_INFO[track.instrument] ? `${STRING_INFO[track.instrument]} струн` : 'без табов'}`}
                className={`flex h-10 w-10 items-center justify-center rounded-full border text-lg transition-all ${
                  selectedTrack === idx
                    ? 'border-[#8A2BE2] bg-[#8A2BE2]/25 text-[#E0E0E0]'
                    : 'border-[#2A2A2A] bg-[#111111] text-[#A0A0A0] hover:border-[#3A3A3A]'
                }`}
              >
                {STEM_ICONS[track.instrument]}
              </button>
            ))}
            <div className="h-px bg-[#2A2A2A]" />
            <select
              value={tracks[selectedTrack]?.instrument ?? 'other'}
              onChange={(e) => updateTrackInstrument(selectedTrack, e.target.value as StemType)}
              className="rounded-md border border-[#2A2A2A] bg-[#111111] px-2 py-1 text-[11px] text-[#E0E0E0]"
            >
              {STEM_OPTIONS.map((instrument) => (
                <option key={instrument} value={instrument}>
                  {STEM_LABELS[instrument]}
                </option>
              ))}
            </select>
            <div className="rounded-xl border border-[#2A2A2A] bg-[#111111] p-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[#6A6A6A]">
                Harmony HUD
              </div>
              <div className="mb-2 grid grid-cols-2 gap-1 text-[10px] text-[#A0A0A0]">
                <span>Тональность</span>
                <span className="text-right text-[#E0E0E0]">{normalizeKeyLabel(detectedKey) ?? 'N/A'}</span>
                <span>Ритм</span>
                <span className="text-right text-[#E0E0E0]">{autoRhythmSignature}</span>
                <span>BPM</span>
                <span className="text-right text-[#E0E0E0]">{Math.round(tempo)}</span>
              </div>
              <svg width="132" height="132" viewBox="0 0 132 132" className="mx-auto block">
                <circle cx="66" cy="66" r="62" fill="#0A0A0A" stroke="#2A2A2A" />
                <circle cx="66" cy="66" r="42" fill="#111111" stroke="#2A2A2A" />
                {CIRCLE_MAJOR.map((label, i) => {
                  const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
                  const x = 66 + Math.cos(angle) * 56;
                  const y = 66 + Math.sin(angle) * 56;
                  const active = keyIndex === i;
                  return (
                    <g key={`maj-${label}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r={active ? 10 : 8}
                        fill={active ? '#8A2BE2' : '#1A1A1A'}
                        stroke={active ? '#C084FC' : '#2A2A2A'}
                        strokeWidth={active ? 2 : 1}
                      />
                      <text
                        x={x}
                        y={y + 3}
                        textAnchor="middle"
                        fontSize="8"
                        fill={active ? '#FFFFFF' : '#CFCFCF'}
                        fontWeight={active ? 700 : 400}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
                {CIRCLE_MINOR.map((label, i) => {
                  const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
                  const x = 66 + Math.cos(angle) * 36;
                  const y = 66 + Math.sin(angle) * 36;
                  const active = keyIndex === i;
                  return (
                    <text
                      key={`min-${label}`}
                      x={x}
                      y={y + 3}
                      textAnchor="middle"
                      fontSize="7"
                      fill={active ? '#93C5FD' : '#7A7A7A'}
                      fontWeight={active ? 700 : 400}
                    >
                      {label}
                    </text>
                  );
                })}
                <text x="66" y="66" textAnchor="middle" fontSize="9" fill="#A0A0A0">
                  Circle of
                </text>
                <text x="66" y="77" textAnchor="middle" fontSize="9" fill="#A0A0A0">
                  Fifths
                </text>
              </svg>
            </div>
          </div>
        </div>
        <svg
          width={width}
          height={height}
          className="block w-full"
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          onClick={handleLaneClick}
        >
          <line
            x1={PAGE_PADDING_X + currentTime * timeScale}
            y1={0}
            x2={PAGE_PADDING_X + currentTime * timeScale}
            y2={height}
            stroke="#8A2BE2"
            strokeWidth={2}
            strokeDasharray="4 4"
            opacity={isPlaying ? 1 : 0.5}
          />

          {tracks.map((track, trackIdx) => {
            const baseY = trackIdx * TRACK_HEIGHT;
            const notes = track.notes.slice().sort((a, b) => a.startTime - b.startTime);
            return (
              <g key={`${track.instrument}-${trackIdx}`}>
                <rect
                  x={0}
                  y={baseY}
                  width={width}
                  height={TRACK_HEIGHT}
                  fill={trackIdx % 2 === 0 ? '#FFFFFF' : '#F7F7F7'}
                  onClick={() => setSelectedTrack(trackIdx)}
                />
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={i}
                    x1={0}
                    y1={baseY + 20 + i * STAFF_LINE_SPACING * 2}
                    x2={width}
                    y2={baseY + 20 + i * STAFF_LINE_SPACING * 2}
                    stroke="#D9D9D9"
                    strokeWidth={1}
                  />
                ))}
                <text x={8} y={baseY + 14} className="fill-[#666]" style={{ fontSize: 10 }}>
                  {STEM_LABELS[track.instrument]} {STRING_INFO[track.instrument] ? `(${STRING_INFO[track.instrument]} st)` : ''}
                </text>

                {showReferenceMelody &&
                  trackIdx !== referenceTrackIdx &&
                  referenceNotes.map((note, idx) => {
                    const x = PAGE_PADDING_X + note.startTime * timeScale;
                    const y = baseY + 20 + midiToStaffY(note.pitch);
                    const w = Math.max((note.endTime - note.startTime) * timeScale, MIN_NOTE_WIDTH);
                    const active = isNotePlaying(note.startTime, note.endTime);
                    return (
                      <rect
                        key={`ref-${idx}`}
                        x={x}
                        y={y - noteRadius}
                        width={w}
                        height={noteRadius * 2}
                        rx={noteRadius}
                        fill="none"
                        stroke={active ? '#22D3EE' : '#1E40AF'}
                        strokeWidth={active ? 2 : 1}
                        opacity={0.45}
                        strokeDasharray="3 3"
                      />
                    );
                  })}

                {notes.map((note, noteIdx) => {
                  const x = PAGE_PADDING_X + note.startTime * timeScale;
                  const y = baseY + 20 + midiToStaffY(note.pitch);
                  const w = Math.max((note.endTime - note.startTime) * timeScale, MIN_NOTE_WIDTH);
                  const selected = selectedNote?.trackIdx === trackIdx && selectedNote?.noteIdx === noteIdx;
                  const playing = isNotePlaying(note.startTime, note.endTime);
                  return (
                    <g key={`${track.instrument}-${noteIdx}`}>
                      <rect
                        x={x}
                        y={y - noteRadius}
                        width={w}
                        height={noteRadius * 2}
                        rx={noteRadius}
                        fill={selected ? '#3B82F6' : playing ? '#06B6D4' : '#8A2BE2'}
                        stroke={selected ? '#60A5FA' : '#A855F7'}
                        strokeWidth={selected ? 2 : 1}
                        style={{ cursor: editMode === 'select' ? 'move' : 'pointer' }}
                        onMouseDown={(e) => editMode === 'select' && handleDragStart(e, trackIdx, noteIdx, 'move')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTrack(trackIdx);
                          setSelectedNote({ trackIdx, noteIdx });
                        }}
                      />
                      <circle
                        cx={x + w}
                        cy={y}
                        r={4}
                        fill="#E0E0E0"
                        opacity={0.8}
                        style={{ cursor: 'ew-resize' }}
                        onMouseDown={(e) => handleDragStart(e, trackIdx, noteIdx, 'resize')}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-[#2A2A2A] bg-[#1A1A1A] px-4 py-2 text-xs text-[#A0A0A0]">
        <span>{currentTime.toFixed(1)} / {maxTime.toFixed(1)} сек</span>
        <div className="h-1 flex-1 max-w-sm overflow-hidden rounded-full bg-[#2A2A2A]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082]"
            initial={false}
            animate={{ width: `${Math.min(playheadPercent, 100)}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      </div>
    </motion.div>
  );
}
