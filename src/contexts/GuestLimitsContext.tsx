/**
 * Лимиты для гостей: каждое действие доступно только 1 раз без регистрации.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'musca-guest-used-actions-v1';

export type GuestActionId =
  | 'separation'
  | 'conversion'
  | 'joiner'
  | 'vocal-remover'
  | 'pitcher'
  | 'time-signature'
  | 'cutter'
  | 'recorder'
  | 'karaoke'
  | 'effects';

function loadUsedActions(): Set<GuestActionId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.filter((id): id is GuestActionId => 
      ['separation', 'conversion', 'joiner', 'vocal-remover', 'pitcher', 
       'time-signature', 'cutter', 'recorder', 'karaoke', 'effects'].includes(id)
    ));
  } catch {
    return new Set();
  }
}

function saveUsedActions(used: Set<GuestActionId>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...used]));
  } catch {
    /* ignore */
  }
}

interface GuestLimitsContextValue {
  canPerform: (actionId: GuestActionId) => boolean;
  markUsed: (actionId: GuestActionId) => void;
  isGuest: boolean;
}

const GuestLimitsContext = createContext<GuestLimitsContextValue | null>(null);

export function GuestLimitsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [usedActions, setUsedActions] = useState<Set<GuestActionId>>(loadUsedActions);
  const isGuest = !user;

  const canPerform = useCallback(
    (actionId: GuestActionId): boolean => {
      if (!isGuest) return true;
      return !usedActions.has(actionId);
    },
    [isGuest, usedActions]
  );

  const markUsed = useCallback((actionId: GuestActionId) => {
    setUsedActions((prev) => {
      if (prev.has(actionId)) return prev;
      const next = new Set(prev);
      next.add(actionId);
      saveUsedActions(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ canPerform, markUsed, isGuest }),
    [canPerform, markUsed, isGuest]
  );

  return (
    <GuestLimitsContext.Provider value={value}>
      {children}
    </GuestLimitsContext.Provider>
  );
}

export function useGuestLimits(): GuestLimitsContextValue {
  const ctx = useContext(GuestLimitsContext);
  if (!ctx) throw new Error('useGuestLimits используется вне GuestLimitsProvider');
  return ctx;
}
