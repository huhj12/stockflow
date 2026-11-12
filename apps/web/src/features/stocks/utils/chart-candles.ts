import type { StockCandle } from '@stockflow/shared';
import type { CandlestickData, HistogramData } from 'lightweight-charts';

export const UP_COLOR = '#ff6b78';
export const DOWN_COLOR = '#66a8ff';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function toChartCandles(input: readonly StockCandle[]) {
  if (!Array.isArray(input)) throw new Error('Expected a candle array');

  const days = new Set<string>();
  const bars = input
    .map((candle: StockCandle) => {
      if (!candle || typeof candle !== 'object')
        throw new Error('Invalid candle');
      const { timestamp, open, high, low, close, volume } = candle;
      if (
        !Number.isSafeInteger(timestamp) ||
        timestamp < 0 ||
        ![open, high, low, close].every(
          (price) => Number.isFinite(price) && price > 0,
        ) ||
        high < Math.max(open, close) ||
        low > Math.min(open, close) ||
        !Number.isSafeInteger(volume) ||
        volume < 0
      ) {
        throw new Error('Invalid OHLCV candle');
      }

      // Mock candles are modern Korean market dates (UTC+09:00).
      const day = new Date(timestamp + KST_OFFSET_MS);
      if (!Number.isFinite(day.getTime()) || day.getUTCFullYear() > 9999) {
        throw new Error('Invalid candle date');
      }
      const time = day.toISOString().slice(0, 10);
      if (days.has(time)) throw new Error(`Duplicate candle day: ${time}`);
      days.add(time);

      return { time, open, high, low, close, volume };
    })
    .sort((a, b) => a.time.localeCompare(b.time));

  const prices: CandlestickData[] = bars.map(
    ({ time, open, high, low, close }) => ({
      time,
      open,
      high,
      low,
      close,
    }),
  );
  const volumes: HistogramData[] = bars.map(
    ({ time, open, close, volume }) => ({
      time,
      value: volume,
      color: close >= open ? UP_COLOR : DOWN_COLOR,
    }),
  );

  return { prices, volumes, latest: bars.at(-1) };
}
