import { useId, useRef, useState, type ReactNode } from 'react';

interface UploadDropzoneProps {
  accept: string;
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  title: string;
  subtitle?: string;
  formatsHint?: string;
  fileInfo?: string | null;
  replaceLabel?: string;
  className?: string;
  minHeightClass?: string;
  icon?: ReactNode;
  emptyFooter?: ReactNode;
}

const DEFAULT_ICON = (
  <svg className="h-5 w-5 text-[#8A2BE2]" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3a1 1 0 0 1 1 1v7h7a1 1 0 1 1 0 2h-7v7a1 1 0 1 1-2 0v-7H4a1 1 0 1 1 0-2h7V4a1 1 0 0 1 1-1Z" />
  </svg>
);

export function UploadDropzone({
  accept,
  onFileSelect,
  disabled = false,
  title,
  subtitle,
  formatsHint = 'MP3, WAV, FLAC, M4A',
  fileInfo = null,
  replaceLabel = 'Заменить файл',
  className = '',
  minHeightClass = 'min-h-[220px]',
  icon = DEFAULT_ICON,
  emptyFooter,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();

  const openFileDialog = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        const file = e.dataTransfer.files?.[0];
        if (file) onFileSelect(file);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-upload-no-open="true"]')) return;
        openFileDialog();
      }}
      className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 ${
        isDragging
          ? 'border-[#8A2BE2] bg-[#8A2BE2]/10'
          : 'border-[#2A2A2A] bg-[#111111] hover:border-[#3A3A3A]'
      } ${disabled ? 'pointer-events-none opacity-70' : 'cursor-pointer'} ${className}`}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
          e.target.value = '';
        }}
        className="hidden"
      />

      {fileInfo ? (
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <p className="text-xs text-[#E0E0E0]">{fileInfo}</p>
          <span className="rounded-lg border border-[#2A2A2A] px-2 py-1 text-[11px] text-[#A0A0A0]">{replaceLabel}</span>
        </div>
      ) : (
        <div className={`flex flex-col items-center justify-center gap-3 p-10 text-center ${minHeightClass}`}>
          <label htmlFor={inputId} className="contents cursor-pointer">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#141414]">
              {icon}
            </div>
            <p className="text-sm font-medium text-[#E0E0E0]">{title}</p>
            {subtitle && <p className="max-w-md text-xs text-[#A0A0A0]">{subtitle}</p>}
            <p className="text-xs text-[#7F7F7F]">{formatsHint}</p>
          </label>
          {emptyFooter && (
            <div data-upload-no-open="true">
              {emptyFooter}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
