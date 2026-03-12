/**
 * Вкладка «Разделение на дорожки» — загрузка аудио и разделение на stems.
 * Сохранение и загрузка проектов для авторизованных пользователей.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileUploader } from './FileUploader';
import { StemPlayer } from './StemPlayer';
import { ProgressInlineBar } from './common/ProgressInlineBar';
import { useAudioSeparation } from '../hooks/useAudioSeparation';
import { useAuth } from '../contexts/AuthContext';
import { useProjects } from '../contexts/ProjectsContext';
import type { ProjectListItem } from '../types/project.types';

interface SeparationTabProps {
  onWorkflowStateChange?: (state: { started: boolean; loading: boolean; ready: boolean }) => void;
}

export function SeparationTab({ onWorkflowStateChange }: SeparationTabProps = {}) {
  const [baseFilename, setBaseFilename] = useState('stems');
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const { user } = useAuth();
  const {
    list: projectsList,
    isLoading: projectsLoading,
    saveSeparationProject,
    loadSeparationProject,
    deleteProject,
    refresh,
  } = useProjects();
  const {
    stems,
    isLoading,
    progress,
    downloadProgress,
    error,
    separationWarning,
    usedFallback,
    separate,
    setStemsFromProject,
    reset,
  } = useAudioSeparation();

  const separationProjects = projectsList.filter((p) => p.type === 'separation');

  const handleFileSelect = useCallback(
    (file: File) => {
      setHasStarted(true);
      setBaseFilename(file.name.replace(/\.[^.]+$/, ''));
      separate(file);
    },
    [separate]
  );

  const handleSaveProject = useCallback(async () => {
    if (!stems || !saveName.trim()) return;
    setSaving(true);
    try {
      const duration = stems.original.duration;
      await saveSeparationProject(saveName.trim(), stems, duration);
      setSaveName('');
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [stems, saveName, saveSeparationProject, refresh]);

  const handleOpenProject = useCallback(
    async (project: ProjectListItem) => {
      setLoadingProjectId(project.id);
      try {
        const result = await loadSeparationProject(project.id);
        if (result) {
          setHasStarted(true);
          setStemsFromProject(result.stems);
          setBaseFilename(project.name);
        }
      } finally {
        setLoadingProjectId(null);
      }
    },
    [loadSeparationProject, setStemsFromProject]
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      if (window.confirm('Удалить этот проект?')) await deleteProject(id);
    },
    [deleteProject]
  );

  const handleReset = useCallback(() => {
    reset();
    setHasStarted(false);
    setBaseFilename('stems');
  }, [reset]);

  const status = isLoading ? 'separating' : stems ? 'ready' : 'idle';
  const processingLabelByStatus: Record<string, string> = {
    separating: 'Разделяем трек на дорожки...',
    ready: 'Готово!',
  };
  const detailedStage = isLoading
    ? progress < 10
      ? 'Подготовка файла и валидация формата'
      : progress < 30
        ? 'Загрузка/инициализация модели разделения'
        : progress < 65
          ? 'Анализ спектра и поиск источников'
          : progress < 90
            ? 'Сборка дорожек: Vocal / Drums / Bass / Other'
            : 'Финализация и подготовка результата'
    : null;

  useEffect(() => {
    onWorkflowStateChange?.({ started: hasStarted, loading: isLoading, ready: Boolean(stems) });
  }, [hasStarted, isLoading, stems, onWorkflowStateChange]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {user && separationProjects.length > 0 && (
        <section className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-6">
          <h3 className="mb-4 text-lg font-semibold text-[#E0E0E0]">
            Мои проекты
          </h3>
          {projectsLoading ? (
            <p className="text-[#A0A0A0]">Загрузка...</p>
          ) : (
            <ul className="space-y-2">
              {separationProjects.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-4 py-3"
                >
                  <div>
                    <span className="font-medium text-[#E0E0E0]">{p.name}</span>
                    {p.duration != null && (
                      <span className="ml-2 text-sm text-[#A0A0A0]">
                        {formatDuration(p.duration)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenProject(p)}
                      disabled={loadingProjectId !== null}
                      className="rounded-lg bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {loadingProjectId === p.id ? 'Загрузка...' : 'Открыть'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(p.id)}
                      className="rounded-lg border border-[#2A2A2A] px-4 py-2 text-sm text-[#A0A0A0] hover:text-[#E0E0E0]"
                    >
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!hasStarted && (
        <FileUploader
          onFileSelect={handleFileSelect}
          disabled={isLoading}
        />
      )}

      {isLoading && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0A0A0A]/55 backdrop-blur-[2px]">
          <div className="w-full max-w-md px-4">
            <div className="overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#0F0F10]/95 p-4 shadow-2xl">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#8A2BE2] border-t-transparent" />
                <p className="text-sm font-medium text-[#E0E0E0]">
                  {processingLabelByStatus[status] ?? 'Обработка...'}
                </p>
              </div>
              <ProgressInlineBar
                value={progress}
                label={detailedStage ?? processingLabelByStatus[status] ?? 'Обработка...'}
                className="mb-2"
              />
              {downloadProgress > 0 && downloadProgress < 100 && (
                <p className="text-right text-[11px] text-[#7F7F7F]">Скачивание модели: {Math.round(downloadProgress)}%</p>
              )}
            </div>
          </div>
        </div>
      )}

      {stems && (
        <>
          <StemPlayer
            stems={stems}
            duration={stems.original.duration}
            baseFilename={baseFilename}
          />
          {user && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Название проекта"
                className="rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-4 py-2 text-[#E0E0E0] placeholder-[#A0A0A0] focus:border-[#8A2BE2] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveProject}
                disabled={saving || !saveName.trim()}
                className="rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-6 py-2.5 font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Сохранить проект'}
              </button>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {separationWarning && (
            <p className={`text-sm ${usedFallback ? 'text-amber-300' : 'text-[#A0A0A0]'}`}>{separationWarning}</p>
          )}
        </>
      )}

      {status !== 'idle' && (
        <div className="flex justify-center">
          <button
            onClick={handleReset}
            className="rounded-full border border-[#2A2A2A] px-8 py-3 font-medium text-[#A0A0A0] transition-all hover:border-[#3A3A3A] hover:text-[#E0E0E0]"
          >
            Начать заново
          </button>
        </div>
      )}
    </motion.div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
