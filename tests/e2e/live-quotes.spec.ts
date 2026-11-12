import { expect, test } from '@playwright/test';
import type { QuoteStreamMessage } from '@stockflow/shared';

test('streams real mock ticks to the detail and closes on navigation', async ({
  page,
}) => {
  const connected = page.waitForEvent('websocket', {
    predicate: (socket) => socket.url().includes('/ws/quotes?code=005930'),
  });
  await page.goto('/stocks/005930');
  const socket = await connected;
  const quote = page.getByRole('region', { name: 'Mock 현재가' });
  await expect(quote.getByRole('status')).toHaveText('모의 시세 연결됨');
  await expect(quote.locator('dd').first()).not.toHaveText('15,956원');
  const chart = page.getByRole('img', { name: '일봉 캔들 및 거래량 차트' });
  await expect(chart.locator('canvas').first()).toBeVisible();
  await expect(chart).not.toHaveAccessibleDescription(/15,956원/);
  const closed = socket.waitForEvent('close');
  await page.getByRole('link', { name: '종목 목록으로 돌아가기' }).click();
  await closed;
});

test('rejects older sequence values and accepts a new session snapshot after reconnect', async ({
  page,
}) => {
  let connections = 0;
  let disconnect: (() => void) | undefined;
  const message = (
    sessionId: string,
    sequence: number,
    price: number,
  ): QuoteStreamMessage => ({
    type: sequence === 0 ? 'snapshot' : 'tick',
    sessionId,
    quote: {
      code: '005930',
      price,
      previousClose: 16140,
      change: price - 16140,
      changeRate: ((price - 16140) / 16140) * 100,
      volume: 85000,
      sequence,
      timestamp: 1793923200000,
    },
    candle: {
      timestamp: 1793923200000,
      open: 16140,
      high: 17200,
      low: 15000,
      close: price,
      volume: 85000,
    },
  });

  await page.routeWebSocket('**/ws/quotes?*', (socket) => {
    connections += 1;
    if (connections === 1) {
      disconnect = () => socket.close({ code: 1012 });
      socket.send(JSON.stringify(message('first', 0, 15956)));
      socket.send(JSON.stringify(message('first', 2, 16002)));
      socket.send(JSON.stringify(message('first', 1, 16001)));
    } else {
      socket.send(JSON.stringify(message('second', 0, 15950)));
    }
  });
  await page.goto('/stocks/005930');
  const quote = page.getByRole('region', { name: 'Mock 현재가' });
  await expect(quote.locator('dd').first()).toHaveText('16,002원');
  disconnect?.();
  await expect(quote.getByRole('status')).toHaveText('모의 시세 재연결 중');
  await expect(quote.locator('dd').first()).toHaveText('16,002원');
  await expect(quote.locator('dd').first()).toHaveText('15,950원');
  await expect(quote.getByRole('status')).toHaveText('모의 시세 연결됨');
});
