export class StockApiError extends Error {
  constructor(readonly status: number) {
    super(`Stock API returned ${status}`);
  }
}

export function stockApiUrl(path = '') {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';
  return new URL(`${base.replace(/\/+$/, '')}/stocks${path}`);
}

export async function readStockJson<T>(
  url: URL,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new StockApiError(response.status);
  return response.json();
}
