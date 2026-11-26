import type { QuoteStreamMessage } from '@stockflow/shared';
import { stockApiUrl } from '../api/stock-api';
import { toChartCandles } from '../utils/chart-candles';

export type LiveState = {
  code: string;
  status: 'connecting' | 'live' | 'reconnecting' | 'offline';
  receivedAt?: number;
  message?: QuoteStreamMessage;
};

function readMessage(
  raw: unknown,
  code: string,
): QuoteStreamMessage | undefined {
  if (typeof raw !== 'string') return;
  try {
    const message = JSON.parse(raw) as QuoteStreamMessage;
    const quote = message?.quote;
    if (
      !quote ||
      quote.code !== code ||
      !['snapshot', 'tick'].includes(message.type) ||
      typeof message.sessionId !== 'string' ||
      !message.sessionId ||
      !Number.isSafeInteger(quote.sequence) ||
      quote.sequence < 0 ||
      ![
        quote.price,
        quote.previousClose,
        quote.change,
        quote.changeRate,
        quote.volume,
        quote.timestamp,
      ].every(Number.isFinite) ||
      quote.price <= 0 ||
      quote.previousClose <= 0 ||
      quote.price !== message.candle?.close ||
      quote.volume !== message.candle.volume
    )
      return;
    toChartCandles([message.candle]);
    return message;
  } catch {
    return;
  }
}

// One transport implementation owns validation, sequencing, reconnect and cleanup.
export function subscribeQuote(
  code: string,
  onState: (state: LiveState) => void,
) {
  const url = stockApiUrl();
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/quotes';
  url.search = new URLSearchParams({ code }).toString();

  let disposed = false;
  let socket: WebSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let last: QuoteStreamMessage | undefined;
  let receivedAt: number | undefined;
  onState({ code, status: 'connecting' });

  function connect() {
    const connection = new WebSocket(url);
    socket = connection;
    let current: QuoteStreamMessage | undefined;

    function watch() {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => connection.close(), 8000);
    }

    watch();
    connection.onmessage = (event) => {
      if (disposed || socket !== connection) return;
      const message = readMessage(event.data, code);
      if (!message) return;
      if (!current) {
        if (message.type !== 'snapshot' || message.quote.sequence !== 0) return;
      } else if (
        message.type !== 'tick' ||
        message.sessionId !== current.sessionId ||
        message.quote.sequence <= current.quote.sequence ||
        message.candle.timestamp !== current.candle.timestamp
      )
        return;

      current = message;
      last = message;
      receivedAt = Date.now();
      attempt = 0;
      watch();
      onState({ code, status: 'live', receivedAt, message });
    };

    connection.onclose = (event) => {
      if (disposed || socket !== connection) return;
      clearTimeout(watchdog);
      if (event.code === 1008) {
        onState({ code, status: 'offline', receivedAt, message: last });
        return;
      }
      onState({ code, status: 'reconnecting', receivedAt, message: last });
      const delay = Math.min(1000 * 2 ** attempt, 15000) + Math.random() * 300;
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };
  }

  connect();
  return () => {
    disposed = true;
    clearTimeout(retryTimer);
    clearTimeout(watchdog);
    socket?.close();
  };
}
