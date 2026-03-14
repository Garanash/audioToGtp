/**
 * Утилиты для работы с AudioBuffer
 */

import lamejs from 'lamejs';

const WAVEFORM_SAMPLES = 512;

/**
 * Конвертирует File в AudioBuffer
 */
export async function fileToAudioBuffer(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Генерирует даунсемплированную волновую форму для визуализации
 */
export function getWaveform(audioBuffer: AudioBuffer): number[] {
  const data = audioBuffer.getChannelData(0);
  const waveform: number[] = [];
  const blockSize = Math.floor(data.length / WAVEFORM_SAMPLES);

  for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, data.length);
    const slice = data.slice(start, end);
    const max = slice.length > 0 ? Math.max(...slice.map(Math.abs)) : 0;
    waveform.push(max);
  }

  return waveform;
}

export const BASIC_PITCH_SAMPLE_RATE = 22050;
export const DEMUCS_SAMPLE_RATE = 44100;
export const DEMUCS_FAST_SAMPLE_RATE = 32000;

function createMonoFromStereo(audioBuffer: AudioBuffer): Float32Array {
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.numberOfChannels > 1
    ? audioBuffer.getChannelData(1)
    : left;
  const mono = new Float32Array(audioBuffer.length);
  for (let i = 0; i < audioBuffer.length; i++) {
    mono[i] = (left[i] + right[i]) / 2;
  }
  return mono;
}

function createMonoFloatArray(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0).slice();
  }
  return createMonoFromStereo(audioBuffer);
}

/**
 * Линейная интерполяция при ресемплинге
 */
function resampleFloatArray(
  input: Float32Array,
  inputRate: number,
  outputRate: number
): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const idx = Math.floor(srcIndex);
    const frac = srcIndex - idx;
    output[i] =
      idx < input.length - 1
        ? input[idx] * (1 - frac) + input[idx + 1] * frac
        : input[idx];
  }
  return output;
}

/**
 * Ресемплирует AudioBuffer в моно 22050 Hz для Basic Pitch
 */
export function resampleToMono22050(audioBuffer: AudioBuffer): AudioBuffer {
  if (
    audioBuffer.sampleRate === BASIC_PITCH_SAMPLE_RATE &&
    audioBuffer.numberOfChannels === 1
  ) {
    return audioBuffer;
  }

  const monoData = createMonoFloatArray(audioBuffer);
  const resampled = resampleFloatArray(
    monoData,
    audioBuffer.sampleRate,
    BASIC_PITCH_SAMPLE_RATE
  );

  const ctx = new AudioContext({ sampleRate: BASIC_PITCH_SAMPLE_RATE });
  const buffer = ctx.createBuffer(1, resampled.length, BASIC_PITCH_SAMPLE_RATE);
  const channelData = new Float32Array(resampled.length);
  channelData.set(resampled);
  buffer.copyToChannel(channelData, 0);
  return buffer;
}

/**
 * Ресемплирует AudioBuffer в стерео 44100 Hz для Demucs
 */
export function resampleTo44100Stereo(audioBuffer: AudioBuffer): AudioBuffer {
  if (
    audioBuffer.sampleRate === DEMUCS_SAMPLE_RATE &&
    audioBuffer.numberOfChannels === 2
  ) {
    return audioBuffer;
  }

  const left = audioBuffer.getChannelData(0);
  const right =
    audioBuffer.numberOfChannels > 1
      ? audioBuffer.getChannelData(1)
      : left;
  const resampledLeft = resampleFloatArray(
    left,
    audioBuffer.sampleRate,
    DEMUCS_SAMPLE_RATE
  );
  const resampledRight = resampleFloatArray(
    right,
    audioBuffer.sampleRate,
    DEMUCS_SAMPLE_RATE
  );

  const ctx = new AudioContext({ sampleRate: DEMUCS_SAMPLE_RATE });
  const buffer = ctx.createBuffer(
    2,
    resampledLeft.length,
    DEMUCS_SAMPLE_RATE
  );
  buffer.copyToChannel(new Float32Array(resampledLeft), 0);
  buffer.copyToChannel(new Float32Array(resampledRight), 1);
  return buffer;
}

/**
 * Ресемплирует AudioBuffer в стерео с заданной частотой
 */
export function resampleToStereo(audioBuffer: AudioBuffer, targetSampleRate: number): AudioBuffer {
  const safeRate = Math.max(8000, Math.floor(targetSampleRate));
  if (
    audioBuffer.sampleRate === safeRate &&
    audioBuffer.numberOfChannels === 2
  ) {
    return audioBuffer;
  }

  const left = audioBuffer.getChannelData(0);
  const right =
    audioBuffer.numberOfChannels > 1
      ? audioBuffer.getChannelData(1)
      : left;
  const resampledLeft = resampleFloatArray(
    left,
    audioBuffer.sampleRate,
    safeRate
  );
  const resampledRight = resampleFloatArray(
    right,
    audioBuffer.sampleRate,
    safeRate
  );

  const ctx = new AudioContext({ sampleRate: safeRate });
  const buffer = ctx.createBuffer(
    2,
    resampledLeft.length,
    safeRate
  );
  buffer.copyToChannel(new Float32Array(resampledLeft), 0);
  buffer.copyToChannel(new Float32Array(resampledRight), 1);
  return buffer;
}

/**
 * Конвертирует AudioBuffer в WAV Blob для howler.js
 */
export function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const channels: Float32Array[] = [];

  for (let i = 0; i < numChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true); // format (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  const offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset + (i * numChannels + ch) * 2, intSample, true);
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

const MP3_BITRATE_KBPS = 192;
const MP3_SAMPLE_BLOCK = 1152;

function floatToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

const MP3_YIELD_EVERY_CHUNKS = 50;

/**
 * Конвертирует AudioBuffer в MP3 Blob (синхронная версия, блокирует главный поток)
 */
export function audioBufferToMp3Blob(audioBuffer: AudioBuffer): Blob {
  return audioBufferToMp3BlobSync(audioBuffer);
}

/**
 * Конвертирует AudioBuffer в MP3 Blob асинхронно с отдачей управления и отчётом прогресса
 */
export async function audioBufferToMp3BlobAsync(
  audioBuffer: AudioBuffer,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  await new Promise<void>((r) => setTimeout(r, 0));
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const left = floatToInt16(audioBuffer.getChannelData(0));
  const right =
    channels > 1 ? floatToInt16(audioBuffer.getChannelData(1)) : left;

  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, MP3_BITRATE_KBPS);
  const mp3Chunks: Int8Array[] = [];
  const totalChunks = Math.ceil(left.length / MP3_SAMPLE_BLOCK);

  for (let i = 0; i < left.length; i += MP3_SAMPLE_BLOCK) {
    const chunkIndex = Math.floor(i / MP3_SAMPLE_BLOCK);
    if (chunkIndex > 0 && chunkIndex % MP3_YIELD_EVERY_CHUNKS === 0) {
      const percent = Math.min(99, Math.round((chunkIndex / totalChunks) * 100));
      onProgress?.(percent);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    const leftChunk = left.subarray(i, i + MP3_SAMPLE_BLOCK);
    const rightChunk = right.subarray(i, i + MP3_SAMPLE_BLOCK);
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) mp3Chunks.push(mp3buf);
  }
  const final = encoder.flush();
  if (final.length > 0) mp3Chunks.push(final);

  const totalLength = mp3Chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  onProgress?.(100);
  return new Blob([result], { type: 'audio/mpeg' });
}

function audioBufferToMp3BlobSync(audioBuffer: AudioBuffer): Blob {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const left = floatToInt16(audioBuffer.getChannelData(0));
  const right =
    channels > 1 ? floatToInt16(audioBuffer.getChannelData(1)) : left;

  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, MP3_BITRATE_KBPS);
  const mp3Chunks: Int8Array[] = [];

  for (let i = 0; i < left.length; i += MP3_SAMPLE_BLOCK) {
    const leftChunk = left.subarray(i, i + MP3_SAMPLE_BLOCK);
    const rightChunk = right.subarray(i, i + MP3_SAMPLE_BLOCK);
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) mp3Chunks.push(mp3buf);
  }
  const final = encoder.flush();
  if (final.length > 0) mp3Chunks.push(final);

  const totalLength = mp3Chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new Blob([result], { type: 'audio/mpeg' });
}

/**
 * Конвертирует AudioBuffer в WAV и возвращает base64-строку (для отправки на сервер sound-to-midi).
 */
export async function audioBufferToWavBase64(audioBuffer: AudioBuffer): Promise<string> {
  const blob = audioBufferToWavBlob(audioBuffer);
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
