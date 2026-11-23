import type { Holding, StockListItem } from '@stockflow/shared';

export const MAX_HOLDINGS = 30;
export const MAX_QUANTITY = 1_000_000;
export const MAX_AVERAGE_PRICE = 100_000_000;
export const PORTFOLIO_STORAGE_KEY = 'stockflow.portfolio.v1';
export interface SavedPortfolio {
  version: 1;
  holdings: Holding[];
  updatedAt: number;
}
export type PortfolioChange =
  { type: 'upsert'; holding: Holding } | { type: 'remove'; stockCode: string };
export class UnsupportedPortfolioVersion extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isStockCode(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{6}$/.test(value);
}
export function isHolding(value: unknown): value is Holding {
  return (
    isRecord(value) &&
    isStockCode(value.stockCode) &&
    typeof value.quantity === 'number' &&
    Number.isSafeInteger(value.quantity) &&
    value.quantity >= 1 &&
    value.quantity <= MAX_QUANTITY &&
    typeof value.averagePrice === 'number' &&
    Number.isSafeInteger(value.averagePrice) &&
    value.averagePrice >= 1 &&
    value.averagePrice <= MAX_AVERAGE_PRICE
  );
}
function validateHoldings(value: unknown): asserts value is Holding[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_HOLDINGS ||
    !value.every(isHolding) ||
    new Set(value.map((holding) => holding.stockCode)).size !== value.length
  ) {
    throw new Error('Invalid portfolio holdings');
  }
}
export function readPortfolio(raw: string | null): SavedPortfolio {
  if (raw === null) return { version: 1, holdings: [], updatedAt: 0 };
  const value: unknown = JSON.parse(raw);
  if (
    isRecord(value) &&
    typeof value.version === 'number' &&
    value.version !== 1
  )
    throw new UnsupportedPortfolioVersion('Unsupported portfolio version');
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.updatedAt !== 'number' ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < 0
  )
    throw new Error('Invalid portfolio storage');
  validateHoldings(value.holdings);
  return {
    version: 1,
    holdings: value.holdings.map(({ stockCode, quantity, averagePrice }) => ({
      stockCode,
      quantity,
      averagePrice,
    })),
    updatedAt: value.updatedAt,
  };
}
export function applyPortfolioChanges(
  base: Holding[],
  changes: PortfolioChange[],
): Holding[] {
  const result = new Map(base.map((holding) => [holding.stockCode, holding]));
  for (const change of changes) {
    if (change.type === 'upsert') {
      if (!isHolding(change.holding)) throw new Error('Invalid holding');
      result.set(change.holding.stockCode, { ...change.holding });
    } else {
      if (!isStockCode(change.stockCode)) throw new Error('Invalid code');
      result.delete(change.stockCode);
    }
  }
  const holdings = [...result.values()].toSorted((a, b) =>
    a.stockCode.localeCompare(b.stockCode),
  );
  validateHoldings(holdings);
  return holdings;
}

export function valuePortfolio(holdings: Holding[], stocks: StockListItem[]) {
  validateHoldings(holdings);
  const catalog = new Map(stocks.map((stock) => [stock.code, stock]));
  const lines = holdings.map((holding) => {
    const stock = catalog.get(holding.stockCode);
    const cost = holding.quantity * holding.averagePrice;
    const candidate = stock ? holding.quantity * stock.price : null;
    const value =
      stock &&
      Number.isSafeInteger(stock.price) &&
      stock.price > 0 &&
      candidate !== null &&
      Number.isSafeInteger(candidate)
        ? candidate
        : null;
    const profit = value === null ? null : value - cost;
    return {
      holding,
      stock,
      cost,
      value,
      profit,
      returnRate: profit === null ? null : (profit / cost) * 100,
    };
  });
  const cost = lines.reduce((sum, line) => sum + line.cost, 0);
  const sum = lines.reduce((total, line) => total + (line.value ?? 0), 0);
  const complete =
    lines.every((line) => line.value !== null) && Number.isSafeInteger(sum);
  const value = complete ? sum : null;
  const profit = value === null ? null : value - cost;
  return {
    lines,
    cost,
    value,
    profit,
    complete,
    returnRate: profit === null || cost === 0 ? null : (profit / cost) * 100,
  };
}
