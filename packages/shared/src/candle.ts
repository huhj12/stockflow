/** Daily OHLCV. Timestamp is Unix epoch milliseconds and prices are KRW. */
export interface StockCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
