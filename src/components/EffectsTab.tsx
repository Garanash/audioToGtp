import { useCallback, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadDropzone } from './common/UploadDropzone';
import { audioBufferToWavBlob, fileToAudioBuffer } from '../utils/audioBuffer';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

interface FxPreset {
  name: string;
  wet: number;
  delayMs: number;
  feedback: number;
  reverbSec: number;
  lowpassHz: number;
  distortion: number;
}

const FX_PRESETS: FxPreset[] = [
  { name: 'Studio Vocal', wet: 28, delayMs: 140, feedback: 18, reverbSec: 1.1, lowpassHz: 16000, distortion: 2 },
  { name: 'Hall Space', wet: 52, delayMs: 360, feedback: 32, reverbSec: 3.2, lowpassHz: 13200, distortion: 4 },
  { name: 'Tape Echo', wet: 48, delayMs: 430, feedback: 52, reverbSec: 1.4, lowpassHz: 9200, distortion: 11 },
  { name: 'Lo-Fi Cloud', wet: 62, delayMs: 250, feedback: 28, reverbSec: 2.7, lowpassHz: 5600, distortion: 18 },
];

export function EffectsTab() {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [wet, setWet] = useState(40);
  const [delayMs, setDelayMs] = useState(280);
  const [feedback, setFeedback] = useState(35);
  const [reverbSec, setReverbSec] = useState(1.8);
  const [lowpassHz, setLowpassHz] = useState(14000);
  const [distortion, setDistortion] = useState(8);
  const [processing, setProcessing] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<'A' | 'B'>('B');
  const [preserveTime, setPreserveTime] = useState(0);
  const [resumeAfterSwitch, setResumeAfterSwitch] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const duration = useMemo(() => buffer?.duration ?? 0, [buffer]);
  const activeSrc = compareMode === 'A' ? originalUrl : resultUrl;

  const onPickFile = useCallback(async (picked: File | null) => {
    if (!picked) return;
    const decoded = await fileToAudioBuffer(picked);
    setFile(picked);
    setBuffer(decoded);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(URL.createObjectURL(picked));
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultBlob(null);
    setResultUrl(null);
    setCompareMode('B');
  }, [originalUrl, resultUrl]);

  const applyPreset = (preset: FxPreset) => {
    setWet(preset.wet);
    setDelayMs(preset.delayMs);
    setFeedback(preset.feedback);
    setReverbSec(preset.reverbSec);
    setLowpassHz(preset.lowpassHz);
    setDistortion(preset.distortion);
  };

  const applyEffects = useCallback(async () => {
    if (!buffer || !file) return;
    setProcessing(true);
    try {
      const ctx = new OfflineAudioContext({
        numberOfChannels: Math.max(1, buffer.numberOfChannels),
        length: buffer.length,
        sampleRate: buffer.sampleRate,
      });

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();
      const masterGain = ctx.createGain();
      dryGain.gain.value = 1 - clamp(wet / 100, 0, 1);
      wetGain.gain.value = clamp(wet / 100, 0, 1);

      const delay = ctx.createDelay(2.0);
      delay.delayTime.value = clamp(delayMs / 1000, 0, 2);
      const feedbackGain = ctx.createGain();
      feedbackGain.gain.value = clamp(feedback / 100, 0, 0.95);
      delay.connect(feedbackGain);
      feedbackGain.connect(delay);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = clamp(lowpassHz, 1000, 20000);

      const convolver = ctx.createConvolver();
      const irLength = Math.max(1, Math.floor(buffer.sampleRate * clamp(reverbSec, 0.2, 6)));
      const ir = ctx.createBuffer(2, irLength, buffer.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < irLength; i++) {
          const decay = Math.pow(1 - i / irLength, 2);
          data[i] = (Math.random() * 2 - 1) * decay;
        }
      }
      convolver.buffer = ir;

      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(44100);
      const k = clamp(distortion, 0, 100);
      for (let i = 0; i < curve.length; i++) {
        const x = (i * 2) / curve.length - 1;
        curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
      }
      shaper.curve = curve;
      shaper.oversample = '2x';

      source.connect(dryGain);
      dryGain.connect(masterGain);

      source.connect(lowpass);
      lowpass.connect(shaper);
      shaper.connect(delay);
      shaper.connect(convolver);
      delay.connect(wetGain);
      convolver.connect(wetGain);
      wetGain.connect(masterGain);
      masterGain.connect(ctx.destination);

      source.start(0);
      const rendered = await ctx.startRendering();
      const wav = audioBufferToWavBlob(rendered);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const nextUrl = URL.createObjectURL(wav);
      setResultBlob(wav);
      setResultUrl(nextUrl);
      setCompareMode('B');
    } finally {
      setProcessing(false);
    }
  }, [buffer, file, wet, delayMs, feedback, reverbSec, lowpassHz, distortion, resultUrl]);

  const exportPreset = () => {
    const preset = {
      wet,
      delayMs,
      feedback,
      reverbSec,
      lowpassHz,
      distortion,
    };
    downloadBlob(new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }), 'fx-preset.json');
  };

  const importPreset = async (picked: File | null) => {
    if (!picked) return;
    try {
      const text = await picked.text();
      const data = JSON.parse(text) as Partial<FxPreset>;
      setWet(clamp(Number(data.wet ?? wet), 0, 100));
      setDelayMs(clamp(Number(data.delayMs ?? delayMs), 30, 1200));
      setFeedback(clamp(Number(data.feedback ?? feedback), 0, 90));
      setReverbSec(clamp(Number(data.reverbSec ?? reverbSec), 0.2, 6));
      setLowpassHz(clamp(Number(data.lowpassHz ?? lowpassHz), 1000, 20000));
      setDistortion(clamp(Number(data.distortion ?? distortion), 0, 40));
    } catch {
      // ignore invalid preset
    }
  };

  const switchCompareMode = (next: 'A' | 'B') => {
    if (next === compareMode) return;
    const el = audioRef.current;
    if (el) {
      setPreserveTime(el.currentTime || 0);
      setResumeAfterSwitch(!el.paused);
    }
    setCompareMode(next);
  };

  const onAudioMetaLoaded = () => {
    const el = audioRef.current;
    if (!el) return;
    const target = Math.min(preserveTime, Math.max(0, (el.duration || 0) - 0.05));
    if (target > 0) {
      try {
        el.currentTime = target;
      } catch {
        // noop
      }
    }
    if (resumeAfterSwitch) {
      void el.play().catch(() => undefined);
    }
    setResumeAfterSwitch(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-5">
        <UploadDropzone
          accept=".mp3,.wav,.flac,.m4a,audio/*"
          onFileSelect={(picked) => void onPickFile(picked)}
          title="Перетащите файл сюда или нажмите для выбора"
          subtitle="Кабинет эффектов: reverb, delay, filter, distortion"
          formatsHint="MP3, WAV, FLAC, M4A — до 100 МБ"
          fileInfo={file ? `${file.name} · ${duration.toFixed(1)}с` : null}
          replaceLabel="Заменить файл"
        />
      </div>

      <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-5">
        <h3 className="mb-4 text-lg font-semibold text-[#E0E0E0]">Эффекты</h3>
        <div className="mb-4 flex flex-wrap gap-2">
          {FX_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-full border border-[#2A2A2A] bg-[#0F0F0F] px-3 py-1.5 text-xs text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]"
            >
              {preset.name}
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs text-[#A0A0A0]">Dry/Wet: {wet}%<input type="range" min={0} max={100} value={wet} onChange={(e) => setWet(Number(e.target.value))} className="mt-1 w-full" /></label>
          <label className="text-xs text-[#A0A0A0]">Delay: {delayMs}ms<input type="range" min={30} max={1200} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} className="mt-1 w-full" /></label>
          <label className="text-xs text-[#A0A0A0]">Feedback: {feedback}%<input type="range" min={0} max={90} value={feedback} onChange={(e) => setFeedback(Number(e.target.value))} className="mt-1 w-full" /></label>
          <label className="text-xs text-[#A0A0A0]">Reverb: {reverbSec.toFixed(1)}s<input type="range" min={0.2} max={6} step={0.1} value={reverbSec} onChange={(e) => setReverbSec(Number(e.target.value))} className="mt-1 w-full" /></label>
          <label className="text-xs text-[#A0A0A0]">Low-pass: {lowpassHz}Hz<input type="range" min={1000} max={20000} step={100} value={lowpassHz} onChange={(e) => setLowpassHz(Number(e.target.value))} className="mt-1 w-full" /></label>
          <label className="text-xs text-[#A0A0A0]">Distortion: {distortion}%<input type="range" min={0} max={40} value={distortion} onChange={(e) => setDistortion(Number(e.target.value))} className="mt-1 w-full" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void applyEffects()}
            disabled={!buffer || processing}
            className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {processing ? 'Применяем эффекты...' : 'Применить эффекты'}
          </button>
          {resultBlob && file && (
            <button
              type="button"
              onClick={() => downloadBlob(resultBlob, `${file.name.replace(/\.[^.]+$/, '')}-fx.wav`)}
              className="rounded-full border border-[#2A2A2A] px-5 py-2 text-sm text-[#E0E0E0]"
            >
              Скачать WAV
            </button>
          )}
          <button
            type="button"
            onClick={exportPreset}
            className="rounded-full border border-[#2A2A2A] px-5 py-2 text-sm text-[#A0A0A0] hover:text-[#E0E0E0]"
          >
            Экспорт preset
          </button>
          <label className="cursor-pointer rounded-full border border-[#2A2A2A] px-5 py-2 text-sm text-[#A0A0A0] hover:text-[#E0E0E0]">
            Импорт preset
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => void importPreset(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>

      {resultUrl && (
        <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-5">
          <h4 className="mb-3 text-sm font-semibold text-[#E0E0E0]">Предпрослушивание</h4>
          {originalUrl && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] p-1">
              <button
                type="button"
                onClick={() => switchCompareMode('A')}
                className={`rounded-md px-3 py-1.5 text-xs ${compareMode === 'A' ? 'bg-[#8A2BE2]/30 text-[#E0E0E0]' : 'text-[#A0A0A0]'}`}
              >
                A: Original
              </button>
              <button
                type="button"
                onClick={() => switchCompareMode('B')}
                className={`rounded-md px-3 py-1.5 text-xs ${compareMode === 'B' ? 'bg-[#8A2BE2]/30 text-[#E0E0E0]' : 'text-[#A0A0A0]'}`}
              >
                B: FX
              </button>
            </div>
          )}
          <audio ref={audioRef} onLoadedMetadata={onAudioMetaLoaded} controls src={activeSrc ?? undefined} className="w-full" />
        </div>
      )}
    </motion.div>
  );
}
