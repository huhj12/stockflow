import type { Holding } from '@stockflow/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_HOLDINGS,
  PORTFOLIO_STORAGE_KEY,
  readPortfolio,
} from './portfolio-model';
import { usePortfolio } from './portfolio-store';

const a: Holding = { stockCode: '005930', quantity: 1, averagePrice: 10000 };
const b: Holding = { stockCode: '000660', quantity: 2, averagePrice: 20000 };
const c: Holding = { stockCode: '035420', quantity: 3, averagePrice: 30000 };
let values: Map<string, string>;
let failWrite: boolean;
let failRead: boolean;
let storage: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};
const snapshot = (holdings: Holding[], version = 1) =>
  JSON.stringify({ version, holdings, updatedAt: 1 });

beforeEach(() => {
  values = new Map();
  failWrite = false;
  failRead = false;
  storage = {
    getItem: vi.fn((key: string) => {
      if (failRead) throw new Error('read blocked');
      return values.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (failWrite) throw new Error('quota');
      values.set(key, value);
    }),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_key: string, callback: () => unknown) => callback(),
    },
  });
  usePortfolio.setState({
    holdings: [],
    updatedAt: 0,
    ready: true,
    storageError: false,
    pending: [],
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('portfolio browser persistence', () => {
  it('upserts a position without duplicating it and persists deletion', async () => {
    await usePortfolio.getState().upsert(a);
    await usePortfolio.getState().upsert({ ...a, quantity: 4 });
    expect(usePortfolio.getState().holdings).toEqual([{ ...a, quantity: 4 }]);
    expect(readPortfolio(values.get(PORTFOLIO_STORAGE_KEY)!).holdings).toEqual([
      { ...a, quantity: 4 },
    ]);
    await usePortfolio.getState().remove(a.stockCode);
    expect(readPortfolio(values.get(PORTFOLIO_STORAGE_KEY)!).holdings).toEqual(
      [],
    );
  });
  it('keeps multiple unsaved edits and rebases them on another tab before retry', async () => {
    failWrite = true;
    await usePortfolio.getState().upsert(a);
    await usePortfolio.getState().upsert(b);
    expect(usePortfolio.getState().holdings).toHaveLength(2);
    expect(usePortfolio.getState().pending).toHaveLength(2);
    values.set(PORTFOLIO_STORAGE_KEY, snapshot([c]));
    usePortfolio.getState().load();
    expect(
      usePortfolio.getState().holdings.map((holding) => holding.stockCode),
    ).toEqual(['000660', '005930', '035420']);
    failWrite = false;
    await usePortfolio.getState().retry();
    expect(
      readPortfolio(values.get(PORTFOLIO_STORAGE_KEY)!).holdings,
    ).toHaveLength(3);
    expect(usePortfolio.getState()).toMatchObject({
      pending: [],
      storageError: false,
    });
  });
  it('retains the latest absolute edit and removal instead of replaying quantities', async () => {
    values.set(PORTFOLIO_STORAGE_KEY, snapshot([a]));
    usePortfolio.getState().load();
    failWrite = true;
    await usePortfolio.getState().upsert({ ...a, quantity: 4 });
    await usePortfolio.getState().upsert({ ...a, quantity: 8 });
    expect(usePortfolio.getState().pending).toHaveLength(1);
    await usePortfolio.getState().remove(a.stockCode);
    await usePortfolio.getState().upsert(b);
    failWrite = false;
    await usePortfolio.getState().retry();
    expect(readPortfolio(values.get(PORTFOLIO_STORAGE_KEY)!).holdings).toEqual([
      b,
    ]);
  });
  it('does not overwrite data that cannot be read', async () => {
    values.set(PORTFOLIO_STORAGE_KEY, snapshot([a]));
    usePortfolio.getState().load();
    failRead = true;
    await usePortfolio.getState().upsert(b);
    expect(usePortfolio.getState().holdings).toHaveLength(2);
    expect(usePortfolio.getState().storageError).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('does not replace an unsupported future schema', async () => {
    const raw = snapshot([c], 2);
    values.set(PORTFOLIO_STORAGE_KEY, raw);
    usePortfolio.getState().load();
    await usePortfolio.getState().upsert(a);
    await usePortfolio.getState().retry();
    expect(values.get(PORTFOLIO_STORAGE_KEY)).toBe(raw);
    expect(usePortfolio.getState()).toMatchObject({
      holdings: [a],
      storageError: true,
    });
  });
  it('preserves malformed storage until an explicit valid edit repairs it', async () => {
    values.set(PORTFOLIO_STORAGE_KEY, '{');
    usePortfolio.getState().load();
    expect(values.get(PORTFOLIO_STORAGE_KEY)).toBe('{');
    expect(usePortfolio.getState().storageError).toBe(true);
    await usePortfolio.getState().upsert(a);
    expect(readPortfolio(values.get(PORTFOLIO_STORAGE_KEY)!).holdings).toEqual([
      a,
    ]);
    expect(usePortfolio.getState().storageError).toBe(false);
  });
  it('rejects invalid data or excess holdings without changing storage', async () => {
    expect(
      await usePortfolio.getState().upsert({ ...a, quantity: 0 }),
    ).toBeDefined();
    const holdings = Array.from({ length: MAX_HOLDINGS }, (_, i) => ({
      ...a,
      stockCode: String(900000 + i),
    }));
    const raw = snapshot(holdings);
    values.set(PORTFOLIO_STORAGE_KEY, raw);
    usePortfolio.getState().load();
    expect(await usePortfolio.getState().upsert(a)).toContain('최대 30개');
    expect(values.get(PORTFOLIO_STORAGE_KEY)).toBe(raw);
    expect(usePortfolio.getState().holdings).toEqual(holdings);
  });
  it('supports browsers without Web Locks and loads an external clear', async () => {
    vi.stubGlobal('navigator', {});
    await usePortfolio.getState().upsert(a);
    expect(readPortfolio(values.get(PORTFOLIO_STORAGE_KEY)!).holdings).toEqual([
      a,
    ]);
    values.delete(PORTFOLIO_STORAGE_KEY);
    usePortfolio.getState().load();
    expect(usePortfolio.getState().holdings).toEqual([]);
  });
});
