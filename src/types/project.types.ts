/**
 * Типы проектов пользователя (разделение, конвертация, ноты).
 */

export type ProjectType = 'separation' | 'conversion' | 'notation';

export interface ProjectBase {
  id: string;
  userId: string;
  name: string;
  type: ProjectType;
  createdAt: string; // ISO
  updatedAt: string;
}

export interface SeparationProject extends ProjectBase {
  type: 'separation';
  /** Имена файлов дорожек (vocals.wav, drums.wav, ...) */
  stemFiles: string[];
  /** Длительность в секундах */
  duration: number;
}

export interface ConversionProject extends ProjectBase {
  type: 'conversion';
  /** ID проекта разделения или null если загружены готовые stems */
  separationProjectId: string | null;
  /** Имена загруженных MIDI дорожек / файлов */
  midiFiles: string[];
}

export interface NotationProject extends ProjectBase {
  type: 'notation';
  /** Имена загруженных файлов (gp, gp5, midi и т.д.) */
  notationFiles: string[];
}

export type Project = SeparationProject | ConversionProject | NotationProject;

export interface ProjectListItem {
  id: string;
  name: string;
  type: ProjectType;
  createdAt: string;
  updatedAt: string;
  /** Дополнительно для отображения */
  stemCount?: number;
  duration?: number;
  midiCount?: number;
  notationCount?: number;
}
