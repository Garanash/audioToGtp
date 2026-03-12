/**
 * Контекст проектов пользователя: список, сохранение, загрузка.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AudioStems, StemType } from '../types/audio.types';
import { STEM_ORDER } from '../types/audio.types';
import { audioBufferToWavBlob } from '../utils/audioBuffer';
import {
  fetchProjects,
  fetchProject,
  createSeparationProject,
  deleteProject as apiDeleteProject,
  downloadProjectStem,
} from '../api/projects';
import type { ProjectListItem, SeparationProject } from '../types/project.types';
import { useAuth } from './AuthContext';

export interface ProjectsContextValue {
  list: ProjectListItem[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  saveSeparationProject: (
    name: string,
    stems: AudioStems,
    duration: number
  ) => Promise<SeparationProject | null>;
  loadSeparationProject: (
    projectId: string
  ) => Promise<{ stems: AudioStems; duration: number } | null>;
  deleteProject: (id: string) => Promise<boolean>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

async function loadStemsFromProject(
  projectId: string,
  stemFiles: string[],
  getIdToken: () => Promise<string | null>
): Promise<AudioStems | null> {
  const token = await getIdToken();
  if (!token) return null;
  const ctx = new AudioContext();
  const buffers: Record<string, AudioBuffer> = {};
  let original: AudioBuffer | null = null;
  for (const name of stemFiles) {
    const ab = await downloadProjectStem(projectId, name, token);
    if (!ab) continue;
    const buf = await ctx.decodeAudioData(ab);
    const stemName = name.replace(/\.wav$/i, '');
    if (STEM_ORDER.includes(stemName as StemType)) {
      buffers[stemName] = buf;
    }
    if (!original) original = buf;
  }
  if (!original) return null;
  const stems: AudioStems = {
    ...buffers,
    original,
  };
  return stems;
}

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { user, getIdToken } = useAuth();
  const [list, setList] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    const token = await getIdToken();
    if (!token) {
      setList([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await fetchProjects(token);
      setList(data);
    } finally {
      setIsLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (user) refresh();
    else setList([]);
  }, [user, refresh]);

  const saveSeparationProject = useCallback(
    async (
      name: string,
      stems: AudioStems,
      duration: number
    ): Promise<SeparationProject | null> => {
      const token = await getIdToken();
      if (!token) return null;
      const files: File[] = [];
      const order = STEM_ORDER.filter((s) => stems[s as keyof AudioStems]);
      for (const stem of order) {
        const buf = stems[stem as keyof AudioStems] as AudioBuffer;
        if (!buf) continue;
        const blob = audioBufferToWavBlob(buf);
        files.push(new File([blob], `${stem}.wav`, { type: 'audio/wav' }));
      }
      if (files.length === 0) return null;
      return createSeparationProject({ name, duration, stemFiles: files }, token);
    },
    [getIdToken]
  );

  const loadSeparationProject = useCallback(
    async (
      projectId: string
    ): Promise<{ stems: AudioStems; duration: number } | null> => {
      const token = await getIdToken();
      if (!token) return null;
      const project = await fetchProject(projectId, token);
      if (!project || project.type !== 'separation') return null;
      const sep = project as SeparationProject & { stem_files?: string[] };
      const stemFiles = sep.stemFiles ?? sep.stem_files ?? [];
      const stems = await loadStemsFromProject(
        projectId,
        stemFiles,
        getIdToken
      );
      if (!stems) return null;
      return {
        stems,
        duration: sep.duration ?? stems.original.duration,
      };
    },
    [getIdToken]
  );

  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      const token = await getIdToken();
      if (!token) return false;
      const ok = await apiDeleteProject(id, token);
      if (ok) await refresh();
      return ok;
    },
    [getIdToken, refresh]
  );

  const value = useMemo<ProjectsContextValue>(
    () => ({
      list,
      isLoading,
      refresh,
      saveSeparationProject,
      loadSeparationProject,
      deleteProject,
    }),
    [
      list,
      isLoading,
      refresh,
      saveSeparationProject,
      loadSeparationProject,
      deleteProject,
    ]
  );

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects используется вне ProjectsProvider');
  return ctx;
}
