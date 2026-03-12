import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

export type JobType = 'separate' | 'midi' | 'gtp';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'retried' | 'unknown';

export interface JobItem {
  id: string;
  type: JobType;
  title: string;
  status: JobStatus;
  createdAt: number;
  updatedAt?: number;
  progress?: number;
  pinned?: boolean;
  pinOrder?: number;
}

interface JobCenterProps {
  jobs: JobItem[];
  onCancel: (job: JobItem) => void;
  onRetry: (job: JobItem) => void;
  onClearCompleted: () => void;
  onClearAll: () => void;
  archiveMinutes: 5 | 15 | 30;
  onArchiveMinutesChange: (minutes: 5 | 15 | 30) => void;
  autoArchiveEnabled: boolean;
  onAutoArchiveEnabledChange: (enabled: boolean) => void;
  onTogglePin: (job: JobItem) => void;
  onPinAllInProgress: () => void;
  onMovePinned: (dragId: string, targetId: string) => void;
}

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'В очереди',
  processing: 'В работе',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
  retried: 'Перезапущено',
  unknown: 'Неизвестно',
};

type JobFilter = 'all' | 'in-progress' | 'pinned' | JobType;

export function JobCenter({
  jobs,
  onCancel,
  onRetry,
  onClearCompleted,
  onClearAll,
  archiveMinutes,
  onArchiveMinutesChange,
  autoArchiveEnabled,
  onAutoArchiveEnabledChange,
  onTogglePin,
  onPinAllInProgress,
  onMovePinned,
}: JobCenterProps) {
  if (jobs.length === 0) return null;
  const [filter, setFilter] = useState<JobFilter>('all');
  const stats = useMemo(() => {
    const byStatus = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    const byType = { separate: 0, midi: 0, gtp: 0 };
    for (const job of jobs) {
      if (job.status === 'pending') byStatus.pending += 1;
      if (job.status === 'processing') byStatus.processing += 1;
      if (job.status === 'completed') byStatus.completed += 1;
      if (job.status === 'failed') byStatus.failed += 1;
      byType[job.type] += 1;
    }
    return { byStatus, byType };
  }, [jobs]);
  const filteredJobs = useMemo(() => {
    if (filter === 'all') return jobs;
    if (filter === 'in-progress') {
      return jobs.filter((j) => j.status === 'pending' || j.status === 'processing');
    }
    if (filter === 'pinned') {
      return jobs.filter((j) => Boolean(j.pinned));
    }
    return jobs.filter((j) => j.type === filter);
  }, [jobs, filter]);
  const sortedFiltered = useMemo(
    () => filteredJobs.slice().sort((a, b) => b.createdAt - a.createdAt),
    [filteredJobs]
  );
  const pinnedJobs = useMemo(
    () =>
      sortedFiltered
        .filter((j) => j.pinned)
        .sort((a, b) => (a.pinOrder ?? Number.MAX_SAFE_INTEGER) - (b.pinOrder ?? Number.MAX_SAFE_INTEGER)),
    [sortedFiltered]
  );
  const regularJobs = useMemo(() => sortedFiltered.filter((j) => !j.pinned), [sortedFiltered]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#A0A0A0]">Job Center</h3>
        <div className="flex items-center gap-2">
          <select
            value={archiveMinutes}
            onChange={(e) => onArchiveMinutesChange(Number(e.target.value) as 5 | 15 | 30)}
            className="rounded-md border border-[#2A2A2A] bg-[#0A0A0A] px-2 py-1 text-xs text-[#A0A0A0]"
            title="TTL completed задач"
          >
            <option value={5}>TTL 5m</option>
            <option value={15}>TTL 15m</option>
            <option value={30}>TTL 30m</option>
          </select>
          <label className="flex items-center gap-1 rounded-md border border-[#2A2A2A] px-2 py-1 text-xs text-[#A0A0A0]">
            <input
              type="checkbox"
              checked={autoArchiveEnabled}
              onChange={(e) => onAutoArchiveEnabledChange(e.target.checked)}
            />
            Auto
          </label>
          <button
            onClick={onClearCompleted}
            className="rounded-md border border-[#2A2A2A] px-2 py-1 text-xs text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]"
          >
            Очистить completed
          </button>
          <button
            onClick={onClearAll}
            className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
          >
            Очистить всё
          </button>
          <button
            onClick={onPinAllInProgress}
            className="rounded-md border border-amber-500/50 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/10"
          >
            Pin all in-progress
          </button>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1 text-[11px] text-[#7F7F7F] md:grid-cols-4">
        <span>pending: {stats.byStatus.pending}</span>
        <span>processing: {stats.byStatus.processing}</span>
        <span>completed: {stats.byStatus.completed}</span>
        <span>failed: {stats.byStatus.failed}</span>
        <span>separate: {stats.byType.separate}</span>
        <span>midi: {stats.byType.midi}</span>
        <span>gtp: {stats.byType.gtp}</span>
        <span>total: {jobs.length}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {[
          { id: 'all' as const, label: 'Все' },
          { id: 'in-progress' as const, label: 'В работе' },
          { id: 'pinned' as const, label: 'Pinned' },
          { id: 'separate' as const, label: 'Separate' },
          { id: 'midi' as const, label: 'MIDI' },
          { id: 'gtp' as const, label: 'GTP' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
              filter === item.id
                ? 'bg-[#8A2BE2]/25 text-[#E0E0E0]'
                : 'bg-[#0A0A0A] text-[#A0A0A0] hover:text-[#E0E0E0]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {pinnedJobs.length > 0 && (
          <p className="text-[11px] uppercase tracking-wide text-amber-300/80">Pinned</p>
        )}
        {pinnedJobs.map((job) => {
          const inFlight = job.status === 'pending' || job.status === 'processing';
          const canRetry = job.status === 'failed' || job.status === 'cancelled' || job.status === 'unknown';
          return (
            <div
              key={job.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-[#0A0A0A] px-3 py-2"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', job.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dragId = e.dataTransfer.getData('text/plain');
                if (dragId && dragId !== job.id) onMovePinned(dragId, job.id);
              }}
              title="Перетащите, чтобы изменить порядок"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-[#E0E0E0]">{job.title}</p>
                <p className="text-xs text-[#7F7F7F]">{job.type} · {STATUS_LABEL[job.status]} · {job.id.slice(0, 8)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1F1F1F]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082]"
                    initial={false}
                    animate={{ width: `${Math.max(3, Math.min(100, job.progress ?? 0))}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onTogglePin(job)}
                  className="rounded-md border border-amber-500/60 px-2 py-1 text-xs text-amber-300"
                  title="Снять pin"
                >
                  Pinned
                </button>
                {inFlight && (
                  <button
                    onClick={() => onCancel(job)}
                    className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    Cancel
                  </button>
                )}
                {canRetry && (
                  <button
                    onClick={() => onRetry(job)}
                    className="rounded-md border border-[#2A2A2A] px-2 py-1 text-xs text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {regularJobs.length > 0 && pinnedJobs.length > 0 && (
          <p className="pt-1 text-[11px] uppercase tracking-wide text-[#7F7F7F]">Others</p>
        )}
        {regularJobs.map((job) => {
          const inFlight = job.status === 'pending' || job.status === 'processing';
          const canRetry = job.status === 'failed' || job.status === 'cancelled' || job.status === 'unknown';
          return (
            <div key={job.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#E0E0E0]">{job.title}</p>
                <p className="text-xs text-[#7F7F7F]">{job.type} · {STATUS_LABEL[job.status]} · {job.id.slice(0, 8)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1F1F1F]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#4B0082]"
                    initial={false}
                    animate={{ width: `${Math.max(3, Math.min(100, job.progress ?? 0))}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onTogglePin(job)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    job.pinned
                      ? 'border-amber-500/60 text-amber-300'
                      : 'border-[#2A2A2A] text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]'
                  }`}
                  title={job.pinned ? 'Снять pin' : 'Закрепить задачу'}
                >
                  {job.pinned ? 'Pinned' : 'Pin'}
                </button>
                {inFlight && (
                  <button
                    onClick={() => onCancel(job)}
                    className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    Cancel
                  </button>
                )}
                {canRetry && (
                  <button
                    onClick={() => onRetry(job)}
                    className="rounded-md border border-[#2A2A2A] px-2 py-1 text-xs text-[#A0A0A0] hover:border-[#8A2BE2] hover:text-[#E0E0E0]"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filteredJobs.length === 0 && (
          <p className="rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-xs text-[#7F7F7F]">
            По текущему фильтру задач нет
          </p>
        )}
      </div>
    </motion.div>
  );
}
