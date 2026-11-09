import type { Market, Stock } from '@stockflow/shared';

interface StockList {
  items: Stock[];
  total: number;
}

export async function fetchStocks(
  query: string,
  market: Market | '',
  signal: AbortSignal,
): Promise<StockList> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/stocks`);
  if (query) url.searchParams.set('query', query);
  if (market) url.searchParams.set('market', market);

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Stock API returned ${response.status}`);
  return response.json();
}
