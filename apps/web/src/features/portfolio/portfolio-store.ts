'use client';

import type { Holding } from '@stockflow/shared';
import { useEffect } from 'react';
import { create } from 'zustand';
import {
  applyPortfolioChanges,
  isHolding,
  isStockCode,
  MAX_HOLDINGS,
  PORTFOLIO_STORAGE_KEY,
  readPortfolio,
  UnsupportedPortfolioVersion,
  type PortfolioChange,
} from './portfolio-model';

type PortfolioState = {
  holdings: Holding[];
  updatedAt: number;
  ready: boolean;
  storageError: boolean;
  pending: PortfolioChange[];
  load: () => void;
  upsert: (holding: Holding) => Promise<string | undefined>;
  remove: (code: string) => Promise<string | undefined>;
  retry: () => Promise<string | undefined>;
};

export const usePortfolio = create<PortfolioState>((set, get) => ({
  holdings: [],
  updatedAt: 0,
  ready: false,
  storageError: false,
  pending: [],
  load: () => {
    try {
      const saved = readPortfolio(localStorage.getItem(PORTFOLIO_STORAGE_KEY));
      const pending = get().pending;
      set({
        holdings: applyPortfolioChanges(saved.holdings, pending),
        updatedAt: pending.length ? get().updatedAt : saved.updatedAt,
        ready: true,
        storageError: pending.length > 0,
      });
    } catch {
      set({ ready: true, storageError: true });
    }
  },
  upsert: async (holding) => {
    if (!isHolding(holding))
      return '종목코드·수량·평균 매수가를 확인해 주세요.';
    return mutate({ type: 'upsert', holding: { ...holding } });
  },
  remove: async (stockCode) => {
    if (!isStockCode(stockCode)) return '종목코드를 확인해 주세요.';
    return mutate({ type: 'remove', stockCode });
  },
  retry: async () => {
    if (get().pending.length) return mutate();
    get().load();
    return get().storageError
      ? '저장 데이터를 다시 읽지 못했습니다.'
      : undefined;
  },
}));

async function mutate(change?: PortfolioChange): Promise<string | undefined> {
  if (!usePortfolio.getState().ready)
    return '보유 정보를 불러온 후 다시 시도해 주세요.';
  function save() {
    const state = usePortfolio.getState();
    const code =
      change?.type === 'upsert' ? change.holding.stockCode : change?.stockCode;
    // Absolute per-code edits are idempotent. Keep only the last unsaved intent per code.
    const pending = change
      ? [
          ...state.pending.filter(
            (entry) =>
              (entry.type === 'upsert'
                ? entry.holding.stockCode
                : entry.stockCode) !== code,
          ),
          change,
        ]
      : state.pending;
    let base = state.holdings;
    let canWrite = true;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    } catch {
      canWrite = false;
    }
    if (canWrite) {
      try {
        base = readPortfolio(raw).holdings;
      } catch (error) {
        // Explicit edits can repair corrupt v1 data, but never overwrite a newer schema.
        if (error instanceof UnsupportedPortfolioVersion) canWrite = false;
      }
    }
    let holdings: Holding[];
    try {
      holdings = applyPortfolioChanges(base, pending);
    } catch {
      return `보유 종목은 최대 ${MAX_HOLDINGS}개이며 수량·가격 범위를 확인해 주세요.`;
    }
    const updatedAt = Date.now();
    if (canWrite) {
      try {
        localStorage.setItem(
          PORTFOLIO_STORAGE_KEY,
          JSON.stringify({ version: 1, holdings, updatedAt }),
        );
        usePortfolio.setState({
          holdings,
          updatedAt,
          pending: [],
          storageError: false,
        });
        return;
      } catch {
        /* Keep unsaved operations to rebase on the next successful save. */
      }
    }
    usePortfolio.setState({ holdings, updatedAt, pending, storageError: true });
  }
  // Same-origin tabs serialize read/rebase/write; existing saved rows survive other-tab edits.
  try {
    if (navigator.locks)
      return await navigator.locks.request(PORTFOLIO_STORAGE_KEY, save);
  } catch {
    /* Web Locks may be unavailable; use best-effort local storage. */
  }
  return save();
}

export function useLoadPortfolio() {
  const load = usePortfolio((state) => state.load);
  useEffect(() => {
    load();
    function sync(event: StorageEvent) {
      if (event.key === PORTFOLIO_STORAGE_KEY || event.key === null) load();
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [load]);
}
