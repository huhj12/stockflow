import type { StockCandle, StockQuote } from '@stockflow/shared';

const DAY_MS = 86_400_000;
const FIRST_DAY = Date.UTC(2026, 9, 8);

export function createMockPrices(code: string) {
  // Use the code only as a numeric seed. The API identifier stays a string.
  const seed = Number(code);
  const base = 10_000 + (seed % 100_000);
  const closeAt = (day: number) =>
    base + Math.round(Math.sin(((seed % 19) + day) / 3) * 850) + day * 24;

  const candles: StockCandle[] = Array.from({ length: 30 }, (_, day) => {
    const open = closeAt(day - 1);
    const close = closeAt(day);
    const spread = 25 + ((seed + day * 23) % 90);
    return {
      timestamp: FIRST_DAY + day * DAY_MS,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
      close,
      volume: 10_000 + ((seed + day * 2_381) % 200_000),
    };
  });

  const latest = candles[candles.length - 1];
  const previousClose = candles[candles.length - 2].close;
  const change = latest.close - previousClose;
  const quote: StockQuote = {
    code,
    price: latest.close,
    previousClose,
    change,
    changeRate: (change / previousClose) * 100,
    volume: latest.volume,
    timestamp: latest.timestamp,
    sequence: 0,
  };
  return { candles, quote };
}
