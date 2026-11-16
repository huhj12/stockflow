import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { QuoteStreamMessage } from '@stockflow/shared';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { StocksService } from './stocks.service';

@Injectable()
export class QuoteStream implements OnModuleDestroy {
  private websocket?: WebSocketServer;

  constructor(@Inject(StocksService) private readonly stocks: StocksService) {}

  attach(server: Server, origin: string) {
    this.websocket = new WebSocketServer({
      server,
      path: '/ws/quotes',
      maxPayload: 1024,
      verifyClient: ({ req }: { req: IncomingMessage }) =>
        req.headers.origin === origin,
    });
    this.websocket.on('connection', (socket, request) => {
      socket.on('error', () => socket.terminate());
      const codes = new URL(
        request.url ?? '/',
        'http://localhost',
      ).searchParams.getAll('code');
      const code = codes[0];
      if (codes.length !== 1 || code.length !== 6 || !/^[0-9]{6}$/.test(code)) {
        socket.close(1008, 'Invalid stock code');
        return;
      }

      let prices;
      try {
        prices = this.stocks.getPrices(code);
      } catch {
        socket.close(1008, 'Unknown stock');
        return;
      }

      const sessionId = randomUUID();
      const base = prices.quote;
      let candle = prices.candles[prices.candles.length - 1];
      let sequence = 0;
      let lastPong = Date.now();
      socket.on('pong', () => {
        lastPong = Date.now();
      });

      const send = (message: QuoteStreamMessage) => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify(message));
      };

      send({ type: 'snapshot', sessionId, quote: base, candle });
      const timer = setInterval(() => {
        if (
          Date.now() - lastPong > 30_000 ||
          socket.bufferedAmount > 64 * 1024
        ) {
          socket.terminate();
          return;
        }
        sequence += 1;
        if (sequence % 10 === 0 && socket.readyState === WebSocket.OPEN)
          socket.ping();
        const price = base.price + Math.round(Math.sin(sequence / 4) * 160);
        const change = price - base.previousClose;
        // Simulate ticks inside the last mock trading day.
        candle = {
          ...candle,
          high: Math.max(candle.high, price),
          low: Math.min(candle.low, price),
          close: price,
          volume: candle.volume + 100,
        };
        send({
          type: 'tick',
          sessionId,
          candle,
          quote: {
            ...base,
            price,
            change,
            changeRate: (change / base.previousClose) * 100,
            volume: candle.volume,
            timestamp: Date.now(),
            sequence,
          },
        });
      }, 1000);
      socket.once('close', () => clearInterval(timer));
    });
  }

  onModuleDestroy() {
    this.websocket?.clients.forEach((socket) => socket.terminate());
    this.websocket?.close();
  }
}
