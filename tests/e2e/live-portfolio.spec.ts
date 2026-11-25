import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import type { Holding, QuoteStreamMessage } from '@stockflow/shared';
const key = 'stockflow.portfolio.v1';
const holdings: Holding[] = [
  { stockCode: '005930', quantity: 2, averagePrice: 10000 },
  { stockCode: '000660', quantity: 3, averagePrice: 10000 },
];
async function seed(page: Page, rows = holdings) {
  await page.addInitScript(
    ({ key, rows }) =>
      localStorage.setItem(
        key,
        JSON.stringify({ version: 1, holdings: rows, updatedAt: 1 }),
      ),
    { key, rows },
  );
}
function message(
  code: string,
  price: number,
  sequence = 0,
  sessionId = 'first',
): string {
  const value: QuoteStreamMessage = {
    type: sequence === 0 ? 'snapshot' : 'tick',
    sessionId,
    quote: {
      code,
      price,
      previousClose: 10000,
      change: price - 10000,
      changeRate: (price - 10000) / 100,
      volume: 100,
      timestamp: Date.now(),
      sequence,
    },
    candle: {
      timestamp: 1793923200000,
      open: 10000,
      high: 30000,
      low: 5000,
      close: price,
      volume: 100,
    },
  };
  return JSON.stringify(value);
}
const summary = (page: Page) =>
  page.getByRole('region', { name: 'Mock 평가 요약' });
const table = (page: Page) =>
  page.getByRole('region', { name: '포트폴리오 보유 목록' });

test('updates multiple Mock positions without reconnecting on quantity edits and closes removed subscriptions', async ({
  page,
}) => {
  await seed(page);
  const sockets = new Map<string, WebSocketRoute>();
  const counts = new Map<string, number>();
  const closed: string[] = [];
  await page.routeWebSocket('**/ws/quotes?*', (socket) => {
    const code = new URL(socket.url()).searchParams.get('code')!;
    sockets.set(code, socket);
    counts.set(code, (counts.get(code) ?? 0) + 1);
    socket.onClose(() => closed.push(code));
    socket.send(message(code, code === '005930' ? 15000 : 20000));
  });
  await page.goto('/portfolio');
  await expect(summary(page)).toContainText('연결됨 2 / 2종목');
  await expect(summary(page).locator('dd').nth(1)).toHaveText('90,000원');
  sockets.get('005930')!.send(message('005930', 16000, 2));
  sockets.get('005930')!.send(message('005930', 15001, 1));
  sockets.get('005930')!.send(message('005930', 17000, 3, 'wrong-session'));
  await expect(summary(page).locator('dd').nth(1)).toHaveText('92,000원');
  await table(page)
    .getByRole('button', { name: '삼성전자 보유 정보 수정' })
    .click();
  await page.getByLabel('보유 수량 (주)', { exact: true }).fill('4');
  await page
    .getByRole('button', { name: '보유 정보 저장', exact: true })
    .click();
  await expect(summary(page).locator('dd').nth(1)).toHaveText('124,000원');
  expect(counts.get('005930')).toBe(1);
  expect(counts.get('000660')).toBe(1);
  await table(page).getByRole('button', { name: '삼성전자 보유 삭제' }).click();
  await expect.poll(() => closed.includes('005930')).toBe(true);
  await expect(summary(page).locator('dd').nth(1)).toHaveText('60,000원');
  await page
    .getByRole('combobox', { name: '보유 종목', exact: true })
    .selectOption('005930');
  await page.getByLabel('보유 수량 (주)', { exact: true }).fill('2');
  await page.getByLabel('평균 매수가 (원)', { exact: true }).fill('10000');
  await page
    .getByRole('button', { name: '보유 정보 저장', exact: true })
    .click();
  await expect(summary(page).locator('dd').nth(1)).toHaveText('90,000원');
  expect(counts.get('005930')).toBe(2);
  expect(counts.get('000660')).toBe(1);
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  );
  expect(Object.keys(stored.holdings[0]).sort()).toEqual([
    'averagePrice',
    'quantity',
    'stockCode',
  ]);
  await page.getByRole('link', { name: '종목 검색으로 돌아가기' }).click();
  await expect.poll(() => closed.length).toBe(3);
});

test('retains the last price on disconnect and accepts the new session snapshot', async ({
  page,
}) => {
  await seed(page, [holdings[0]]);
  let count = 0;
  let disconnect: (() => void) | undefined;
  await page.routeWebSocket('**/ws/quotes?*', (socket) => {
    count += 1;
    disconnect = () => socket.close({ code: 1012 });
    socket.send(
      message('005930', count === 1 ? 15000 : 14000, 0, String(count)),
    );
  });
  await page.goto('/portfolio');
  await expect(summary(page).locator('dd').nth(1)).toHaveText('30,000원');
  disconnect!();
  await expect(table(page)).toContainText('재연결 중 · 마지막 가격');
  await expect(summary(page).locator('dd').nth(1)).toHaveText('30,000원');
  await expect(summary(page).locator('dd').nth(1)).toHaveText('28,000원');
  disconnect!();
  await expect(table(page)).toContainText('재연결 중 · 마지막 가격');
  await page.getByRole('link', { name: '종목 검색으로 돌아가기' }).click();
  await page.clock.install();
  await page.clock.fastForward(20000);
  expect(count).toBe(2);
});

test('shows a stale last price when the stream goes silent and stops policy-closed subscriptions', async ({
  page,
}) => {
  await seed(page, [holdings[0]]);
  await page.clock.install();
  let count = 0;
  await page.routeWebSocket('**/ws/quotes?*', (socket) => {
    count += 1;
    socket.send(message('005930', 15000));
    if (count > 1) socket.close({ code: 1008 });
  });
  await page.goto('/portfolio');
  await expect(summary(page).locator('dd').nth(1)).toHaveText('30,000원');
  await page.clock.fastForward(8100);
  await expect(table(page)).toContainText('재연결 중 · 마지막 가격');
  await expect(summary(page).locator('dd').nth(1)).toHaveText('30,000원');
  await page.clock.fastForward(1500);
  await expect(table(page)).toContainText('연결 종료 · 마지막 가격');
  await page.clock.fastForward(30000);
  expect(count).toBe(2);
});

test('uses the real Mock server and releases the socket on navigation', async ({
  page,
}) => {
  await seed(page, [holdings[0]]);
  const pending = page.waitForEvent('websocket');
  await page.goto('/portfolio');
  const socket = await pending;
  await expect(summary(page)).toContainText('연결됨 1 / 1종목');
  await expect(summary(page).locator('dd').nth(1)).not.toHaveText('31,912원');
  const closed = socket.waitForEvent('close');
  await page.getByRole('link', { name: '종목 검색으로 돌아가기' }).click();
  await closed;
});
