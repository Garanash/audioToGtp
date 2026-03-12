import { motion } from 'framer-motion';

interface ProgressInlineBarProps {
  value: number;
  label?: string;
  showPercent?: boolean;
  className?: string;
  barHeightClass?: string;
  trackClassName?: string;
  fillClassName?: string;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function ProgressInlineBar({
  value,
  label,
  showPercent = true,
  className = '',
  barHeightClass = 'h-2',
  trackClassName = 'bg-[#2A2A2A]',
  fillClassName = 'bg-gradient-to-r from-[#8A2BE2] to-[#4B0082]',
}: ProgressInlineBarProps) {
  const progress = clampProgress(value);
  const visual = Math.max(2, progress);

  return (
    <div className={className}>
      {(label || showPercent) && (
        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-[#A0A0A0]">
          <span>{label ?? ''}</span>
          {showPercent ? <span>{Math.round(progress)}%</span> : null}
        </div>
      )}
      <div className={`${barHeightClass} overflow-hidden rounded-full ${trackClassName}`}>
        <motion.div
          className={`h-full ${fillClassName}`}
          initial={{ width: 0 }}
          animate={{ width: `${visual}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>
    </div>
  );
}
