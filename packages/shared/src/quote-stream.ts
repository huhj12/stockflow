import type { StockCandle } from './candle';
import type { StockQuote } from './quote';

export interface QuoteStreamMessage {
  type: 'snapshot' | 'tick';
  sessionId: string;
  quote: StockQuote;
  candle: StockCandle;
}
