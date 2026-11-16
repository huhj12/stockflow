'use client';

import type { Watchlist } from '@stockflow/shared';
import { useEffect } from 'react';
import { create } from 'zustand';

type WatchlistState = Watchlist & {
  ready: boolean;
  storageError: boolean;
  load: () => void;
  toggle: (code: string) => void;
};

const key = 'stockflow.watchlist.v1';
const validCode = (code: unknown): code is string =>
  typeof code === 'string' && code.length === 6 && /^[0-9]{6}$/.test(code);

export const useWatchlist = create<WatchlistState>((set, get) => ({
  stockCodes: [],
  updatedAt: 0,
  ready: false,
  storageError: false,
  load: () => {
    if (get().ready) return;
    try {
      const raw = localStorage.getItem(key);
      const saved = raw ? JSON.parse(raw) : null;
      set({
        ready: true,
        stockCodes: Array.isArray(saved?.stockCodes)
          ? [...new Set<string>(saved.stockCodes.filter(validCode))]
          : [],
        updatedAt:
          Number.isSafeInteger(saved?.updatedAt) && saved.updatedAt >= 0
            ? saved.updatedAt
            : 0,
      });
    } catch {
      set({ ready: true, storageError: true });
    }
  },
  toggle: (code) => {
    const { ready, stockCodes } = get();
    if (!ready || !validCode(code)) return;
    const watchlist: Watchlist = {
      stockCodes: stockCodes.includes(code)
        ? stockCodes.filter((saved) => saved !== code)
        : [...stockCodes, code],
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(key, JSON.stringify(watchlist));
      set({ ...watchlist, storageError: false });
    } catch {
      set({ ...watchlist, storageError: true });
    }
  },
}));

export function useLoadWatchlist() {
  const load = useWatchlist((state) => state.load);
  useEffect(load, [load]);
}
