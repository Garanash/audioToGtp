/**
 * Личный кабинет: профиль, проекты пользователя — разделение, конвертация, ноты.
 */

import { useCallback, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useProjects } from '../contexts/ProjectsContext';
import { useOpenProject } from '../contexts/OpenProjectContext';
import type { ProjectListItem } from '../types/project.types';

const TYPE_LABELS: Record<string, string> = {
  separation: 'Разделение треков',
  conversion: 'Конвертация GTP',
  notation: 'Загруженные ноты',
};

const TYPE_ICONS: Record<string, string> = {
  separation: '🎵',
  conversion: '📄',
  notation: '🎸',
};

export function CabinetTab({
  onSwitchToTab,
}: {
  /** (tabId) — переключить на вкладку после загрузки проекта */
  onSwitchToTab?: (tabId: 'separation' | 'conversion') => void;
}) {
  const { user, updateProfile } = useAuth();
  const { list, isLoading, loadSeparationProject, deleteProject } = useProjects();
  const { setPayload } = useOpenProject();
  const [filterType, setFilterType] = useState<string | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setEditName(user.displayName ?? '');
      setEditPhoto(user.photoURL ?? '');
    }
  }, [user]);

  const filtered = filterType
    ? list.filter((p) => p.type === filterType)
    : list;

  const handleLoadSeparation = useCallback(
    async (project: ProjectListItem) => {
      if (project.type !== 'separation') return;
      setLoadingProjectId(project.id);
      try {
        const result = await loadSeparationProject(project.id);
        if (result) {
          setPayload({
            projectId: project.id,
            type: 'separation',
            stems: result.stems,
            duration: result.duration,
            name: project.name,
          });
          onSwitchToTab?.('separation');
        }
      } finally {
        setLoadingProjectId(null);
      }
    },
    [loadSeparationProject, setPayload, onSwitchToTab]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (window.confirm('Удалить этот проект?')) await deleteProject(id);
    },
    [deleteProject]
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSaveProfile = useCallback(async () => {
    if (!user || profileSaving) return;
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      await updateProfile({
        displayName: editName.trim() || undefined,
        photoURL: editPhoto.trim() || undefined,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } finally {
      setProfileSaving(false);
    }
  }, [user, editName, editPhoto, updateProfile, profileSaving]);

  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-12 text-center"
      >
        <h2 className="mb-4 text-2xl font-bold text-[#E0E0E0]">Личный кабинет</h2>
        <p className="text-[#A0A0A0]">
          Войдите в аккаунт, чтобы видеть сохранённые проекты, результаты разделения и конвертации.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-8">
        <div className="mb-6 flex flex-wrap items-center gap-6">
          <div className="relative group">
            {user?.photoURL || editPhoto ? (
              <img
                src={editPhoto || user?.photoURL || ''}
                alt=""
                className="h-20 w-20 rounded-full object-cover ring-2 ring-[#2A2A2A]"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-2xl font-bold text-white">
                {(user?.displayName || user?.email || editName || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-[#A0A0A0]">Имя</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ваше имя"
                className="w-full max-w-md rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] px-4 py-2.5 text-[#E0E0E0] placeholder-[#6B6B6B] focus:border-[#8A2BE2] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#A0A0A0]">Ссылка на аватар</label>
              <input
                type="url"
                value={editPhoto}
                onChange={(e) => setEditPhoto(e.target.value)}
                placeholder="https://..."
                className="w-full max-w-md rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] px-4 py-2.5 text-[#E0E0E0] placeholder-[#6B6B6B] focus:border-[#8A2BE2] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="rounded-lg bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
            >
              {profileSaving ? 'Сохранение...' : profileSaved ? 'Сохранено' : 'Сохранить профиль'}
            </button>
          </div>
        </div>

        <h2 className="mb-2 text-2xl font-bold text-[#E0E0E0]">Проекты</h2>
        <p className="mb-6 text-[#A0A0A0]">
          Здесь сохраняются ваши проекты: результаты разделения треков, конвертации в GTP и загруженные ноты.
        </p>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterType(null)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              !filterType
                ? 'bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-white'
                : 'border border-[#2A2A2A] text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]'
            }`}
          >
            Все
          </button>
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                filterType === type
                  ? 'bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] text-white'
                  : 'border border-[#2A2A2A] text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]'
              }`}
            >
              {TYPE_ICONS[type]} {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-[#A0A0A0]">Загрузка проектов...</p>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[#A0A0A0]">
              {filterType
                ? `Нет проектов типа «${TYPE_LABELS[filterType] || filterType}».`
                : 'Пока нет сохранённых проектов.'}
            </p>
            <p className="mt-2 text-sm text-[#7F7F7F]">
              Разделите трек или выполните конвертацию и сохраните результат.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((p, idx) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4 transition-colors hover:border-[#3A3A3A]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{TYPE_ICONS[p.type] ?? '📁'}</span>
                    <span className="font-semibold text-[#E0E0E0]">{p.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-4 text-sm text-[#A0A0A0]">
                    <span>{formatDate(p.updatedAt)}</span>
                    {p.stemCount != null && <span>{p.stemCount} дорожек</span>}
                    {p.duration != null && (
                      <span>{Math.floor(p.duration / 60)}:{String(Math.floor(p.duration % 60)).padStart(2, '0')}</span>
                    )}
                    {p.midiCount != null && <span>{p.midiCount} MIDI</span>}
                    {p.notationCount != null && <span>{p.notationCount} нот</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {p.type === 'separation' && (
                    <button
                      type="button"
                      onClick={() => handleLoadSeparation(p)}
                      disabled={loadingProjectId === p.id}
                      className="rounded-lg bg-gradient-to-r from-[#8A2BE2] to-[#4B0082] px-4 py-2 text-sm font-semibold text-white transition-all hover:scale-105 disabled:opacity-50"
                    >
                      {loadingProjectId === p.id ? 'Загрузка...' : 'Открыть'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    className="rounded-lg border border-[#2A2A2A] px-4 py-2 text-sm text-[#A0A0A0] transition-colors hover:border-red-500/50 hover:text-red-400"
                  >
                    Удалить
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}
