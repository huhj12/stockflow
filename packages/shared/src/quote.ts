// timestamp is Unix epoch milliseconds; sequence increases per stock within one stream session.
export interface StockQuote {
  code: string;
  price: number;
  previousClose: number;
  change: number;
  changeRate: number;
  volume: number;
  timestamp: number;
  sequence: number;
}
