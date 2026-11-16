'use client';

import type { Watchlist } from '@stockflow/shared';
import { useEffect } from 'react';
import { create } from 'zustand';

type WatchlistState = Watchlist & {
  ready: boolean;
  storageError: boolean;
  load: () => void;
  toggle: (code: string) => Promise<void>;
};

const key = 'stockflow.watchlist.v1';
const validCode = (code: unknown): code is string =>
  typeof code === 'string' && code.length === 6 && /^[0-9]{6}$/.test(code);

function readWatchlist(raw: string | null): Watchlist {
  const saved = raw ? JSON.parse(raw) : null;
  return {
    stockCodes: Array.isArray(saved?.stockCodes)
      ? [...new Set<string>(saved.stockCodes.filter(validCode))]
      : [],
    updatedAt:
      Number.isSafeInteger(saved?.updatedAt) && saved.updatedAt >= 0
        ? saved.updatedAt
        : 0,
  };
}

export const useWatchlist = create<WatchlistState>((set, get) => ({
  stockCodes: [],
  updatedAt: 0,
  ready: false,
  storageError: false,
  load: () => {
    try {
      set({
        ...readWatchlist(localStorage.getItem(key)),
        ready: true,
        storageError: false,
      });
    } catch {
      set({ ready: true, storageError: true });
    }
  },
  toggle: async (code) => {
    const { ready, stockCodes } = get();
    if (!ready || !validCode(code)) return;

    // Preserve the action the user saw, even if another tab already applied it.
    const remove = stockCodes.includes(code);
    function change(current: string[]): Watchlist {
      return {
        stockCodes: remove
          ? current.filter((saved) => saved !== code)
          : [...new Set([...current, code])],
        updatedAt: Date.now(),
      };
    }

    function save() {
      let latest = get().stockCodes;
      try {
        latest = readWatchlist(localStorage.getItem(key)).stockCodes;
      } catch {
        // A fresh save can replace malformed data or remain in memory.
      }
      const watchlist = change(latest);
      try {
        localStorage.setItem(key, JSON.stringify(watchlist));
        set({ ...watchlist, storageError: false });
      } catch {
        set({ ...watchlist, storageError: true });
      }
    }

    // Serialize read-modify-write across tabs where Web Locks is available.
    if (navigator.locks) {
      await navigator.locks.request(key, save).catch(save);
    } else {
      save();
    }
  },
}));

export function useLoadWatchlist() {
  const load = useWatchlist((state) => state.load);
  useEffect(() => {
    load();
    function sync(event: StorageEvent) {
      if (
        (event.key === key || event.key === null) &&
        event.storageArea === localStorage
      )
        load();
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [load]);
}
