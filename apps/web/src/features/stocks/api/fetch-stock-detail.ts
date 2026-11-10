import type { Stock, StockCandle, StockQuote } from '@stockflow/shared';
import { readStockJson, stockApiUrl } from './stock-api';

export async function fetchStockDetail(code: string, signal: AbortSignal) {
  const path = `/${encodeURIComponent(code)}`;
  const [stock, quote, candles] = await Promise.all([
    readStockJson<Stock>(stockApiUrl(path), signal),
    readStockJson<StockQuote>(stockApiUrl(`${path}/quote`), signal),
    readStockJson<StockCandle[]>(stockApiUrl(`${path}/candles`), signal),
  ]);
  return { stock, quote, candles };
}
