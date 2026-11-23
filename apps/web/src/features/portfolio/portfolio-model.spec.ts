import type { Holding, StockListItem } from '@stockflow/shared';
import { describe, expect, it } from 'vitest';
import {
  applyPortfolioChanges,
  isHolding,
  MAX_HOLDINGS,
  readPortfolio,
  UnsupportedPortfolioVersion,
  valuePortfolio,
} from './portfolio-model';
const holding: Holding = {
  stockCode: '005930',
  quantity: 10,
  averagePrice: 10000,
};
const stock: StockListItem = {
  code: '005930',
  name: '삼성전자',
  market: 'KOSPI',
  sector: '테스트',
  price: 12000,
  changeRate: 0,
  volume: 0,
};
const saved = (holdings: unknown, version = 1) =>
  JSON.stringify({ version, holdings, updatedAt: 1 });

describe('portfolio validation and calculations', () => {
  it('keeps leading zeros and starts with an empty portfolio', () => {
    expect(readPortfolio(null).holdings).toEqual([]);
    expect(readPortfolio(saved([holding])).holdings).toEqual([holding]);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 1000001])(
    'rejects invalid quantity %s',
    (quantity) => {
      expect(isHolding({ ...holding, quantity })).toBe(false);
    },
  );
  it.each([0, -1, 1.5, Infinity, 100000001, '100'])(
    'rejects invalid average price %s',
    (averagePrice) => {
      expect(isHolding({ ...holding, averagePrice })).toBe(false);
    },
  );
  it('rejects malformed data, numeric codes, duplicate positions and excess rows', () => {
    expect(() => readPortfolio('{')).toThrow();
    expect(() =>
      readPortfolio(saved([{ ...holding, stockCode: 5930 }])),
    ).toThrow();
    expect(() => readPortfolio(saved([holding, holding]))).toThrow();
    expect(() =>
      readPortfolio(
        saved(
          Array.from({ length: MAX_HOLDINGS + 1 }, (_, i) => ({
            ...holding,
            stockCode: String(900000 + i),
          })),
        ),
      ),
    ).toThrow();
    expect(() => readPortfolio(saved([holding], 2))).toThrow(
      UnsupportedPortfolioVersion,
    );
  });
  it('updates one position instead of duplicating or adding its quantity', () => {
    const result = applyPortfolioChanges(
      [holding],
      [{ type: 'upsert', holding: { ...holding, quantity: 3 } }],
    );
    expect(result).toEqual([{ ...holding, quantity: 3 }]);
    expect(holding.quantity).toBe(10);
    expect(
      applyPortfolioChanges(result, [
        { type: 'remove', stockCode: holding.stockCode },
      ]),
    ).toEqual([]);
  });
  it('calculates gains and losses and aggregates return by invested capital', () => {
    const second = { stockCode: '000660', quantity: 2, averagePrice: 20000 };
    const result = valuePortfolio(
      [holding, second],
      [stock, { ...stock, code: '000660', price: 15000 }],
    );
    expect(result.lines[0]).toMatchObject({
      cost: 100000,
      value: 120000,
      profit: 20000,
      returnRate: 20,
    });
    expect(result.lines[1]).toMatchObject({
      cost: 40000,
      value: 30000,
      profit: -10000,
      returnRate: -25,
    });
    expect(result).toMatchObject({
      cost: 140000,
      value: 150000,
      profit: 10000,
      complete: true,
    });
    expect(result.returnRate).toBeCloseTo((10000 / 140000) * 100);
  });
  it('does not turn missing prices into zero-valued positions or complete totals', () => {
    const result = valuePortfolio(
      [holding, { ...holding, stockCode: '999999' }],
      [stock],
    );
    expect(result.lines[1]).toMatchObject({
      cost: 100000,
      value: null,
      profit: null,
      returnRate: null,
    });
    expect(result).toMatchObject({
      cost: 200000,
      value: null,
      profit: null,
      returnRate: null,
      complete: false,
    });
  });
  it('handles empty portfolios and exact break-even without dividing by zero', () => {
    expect(valuePortfolio([], [])).toMatchObject({
      cost: 0,
      value: 0,
      profit: 0,
      returnRate: null,
      complete: true,
    });
    expect(
      valuePortfolio([holding], [{ ...stock, price: 10000 }]),
    ).toMatchObject({ profit: 0, returnRate: 0 });
  });
  it('refuses unsafe or invalid price products and aggregate values', () => {
    expect(
      valuePortfolio([holding], [{ ...stock, price: NaN }]).value,
    ).toBeNull();
    expect(
      valuePortfolio([holding], [{ ...stock, price: Number.MAX_SAFE_INTEGER }])
        .value,
    ).toBeNull();
    const holdings = [0, 1, 2].map((i) => ({
      ...holding,
      stockCode: String(900000 + i),
      quantity: 1,
    }));
    const stocks = holdings.map((h) => ({
      ...stock,
      code: h.stockCode,
      price: Math.floor(Number.MAX_SAFE_INTEGER / 2),
    }));
    expect(valuePortfolio(holdings, stocks).value).toBeNull();
  });
});
