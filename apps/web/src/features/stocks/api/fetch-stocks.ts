import type { Market, StockListItem } from '@stockflow/shared';

import { readStockJson, stockApiUrl } from './stock-api';

interface StockList {
  items: StockListItem[];
  total: number;
}

export async function fetchStocks(
  query: string,
  market: Market | '',
  signal: AbortSignal,
): Promise<StockList> {
  const url = stockApiUrl();
  if (query) url.searchParams.set('query', query);
  if (market) url.searchParams.set('market', market);

  return readStockJson<StockList>(url, signal);
}
