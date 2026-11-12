import type { StockCandle } from '@stockflow/shared';
import { describe, expect, it } from 'vitest';
import { DOWN_COLOR, toChartCandles, UP_COLOR } from './chart-candles';

const candle: StockCandle = {
  timestamp: Date.UTC(2026, 10, 5, 15),
  open: 100,
  high: 130,
  low: 90,
  close: 120,
  volume: 80,
};

describe('daily chart candle conversion', () => {
  it('converts milliseconds to the Korean market date and maps OHLC and volume', () => {
    const { prices, volumes } = toChartCandles([candle]);
    expect(prices).toEqual([
      { time: '2026-11-06', open: 100, high: 130, low: 90, close: 120 },
    ]);
    expect(volumes).toEqual([
      { time: '2026-11-06', value: 80, color: UP_COLOR },
    ]);
  });

  it('sorts both series without changing the source and maps a falling candle', () => {
    const later = {
      ...candle,
      timestamp: candle.timestamp + 86_400_000,
      close: 95,
      volume: 0,
    };
    const input = [later, candle];
    const { prices, volumes, latest } = toChartCandles(input);
    expect(prices.map(({ time }) => time)).toEqual([
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(volumes.map(({ time }) => time)).toEqual([
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(volumes[1]).toMatchObject({ value: 0, color: DOWN_COLOR });
    expect(latest?.close).toBe(95);
    expect(input[0]).toBe(later);
  });

  it('rejects different timestamps on the same Korean day', () => {
    expect(() =>
      toChartCandles([
        candle,
        { ...candle, timestamp: candle.timestamp + 1000 },
      ]),
    ).toThrow(/Duplicate candle day/);
  });

  it.each([
    { high: 119 },
    { low: 101 },
    { open: 0 },
    { close: NaN },
    { volume: -1 },
    { volume: 1.5 },
    { timestamp: Infinity },
    { timestamp: Number.MAX_SAFE_INTEGER },
  ])('rejects invalid data %j', (override) => {
    expect(() => toChartCandles([{ ...candle, ...override }])).toThrow();
  });

  it('returns empty series for an empty history', () => {
    expect(toChartCandles([])).toEqual({
      prices: [],
      volumes: [],
      latest: undefined,
    });
  });
});
