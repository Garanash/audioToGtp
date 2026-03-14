/**
 * Контекст для передачи загруженного проекта из кабинета в соответствующую вкладку.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type { AudioStems } from '../types/audio.types';

export interface OpenProjectPayload {
  projectId: string;
  type: 'separation';
  stems: AudioStems;
  duration: number;
  name: string;
}

interface OpenProjectContextValue {
  payload: OpenProjectPayload | null;
  setPayload: (p: OpenProjectPayload | null) => void;
  consumePayload: () => OpenProjectPayload | null;
}

const OpenProjectContext = createContext<OpenProjectContextValue | null>(null);

export function OpenProjectProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<OpenProjectPayload | null>(null);

  const consumePayload = useCallback(() => {
    const p = payload;
    setPayload(null);
    return p;
  }, [payload]);

  return (
    <OpenProjectContext.Provider
      value={{ payload, setPayload, consumePayload }}
    >
      {children}
    </OpenProjectContext.Provider>
  );
}

export function useOpenProject() {
  const ctx = useContext(OpenProjectContext);
  if (!ctx) throw new Error('useOpenProject используется вне OpenProjectProvider');
  return ctx;
}
