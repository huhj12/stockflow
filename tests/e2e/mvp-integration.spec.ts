import { expect, test } from '@playwright/test';

test('completes the mobile search, live detail and saved watchlist journey', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page
    .getByRole('searchbox', { name: '종목명 또는 종목코드' })
    .fill('005930');
  await expect(page.getByRole('status')).toHaveText('검색 결과 1건');
  const link = page.getByRole('link', { name: '삼성전자', exact: true });
  await link.focus();
  await link.press('Enter');
  const quote = page.getByRole('region', { name: 'Mock 현재가' });
  await expect(quote.getByRole('status')).toHaveText('모의 시세 연결됨');
  await expect(
    page
      .getByRole('img', { name: '일봉 캔들 및 거래량 차트' })
      .locator('canvas')
      .first(),
  ).toBeVisible();
  await page.getByRole('button', { name: '삼성전자 관심종목' }).click();
  await expect(
    page.getByRole('button', { name: '삼성전자 관심종목' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '관심종목 보기' }).click();
  // Next client navigation must finish before a hard reload.
  await expect(page).toHaveURL(/\/watchlist$/);
  await page.reload();
  await expect(
    page.getByRole('button', { name: '삼성전자 관심종목' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  await page.getByRole('link', { name: '삼성전자', exact: true }).click();
  await expect(quote.getByRole('status')).toHaveText('모의 시세 연결됨');
  await page.getByRole('button', { name: '삼성전자 관심종목' }).click();
  await page.getByRole('link', { name: '관심종목 보기' }).click();
  await expect(page.getByRole('status')).toHaveText(
    '등록된 관심종목이 없습니다.',
  );
  await page.getByRole('link', { name: '종목 검색으로 돌아가기' }).click();
  await expect(page.getByRole('status')).toHaveText('검색 결과 30건');
  expect(errors).toEqual([]);
});

test('keeps the latest search when an earlier response arrives late', async ({
  page,
}) => {
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/api/stocks?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('query') !== '삼성') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    started();
    await held;
    await route.fulfill({ response });
  });
  await page.goto('/');
  const input = page.getByRole('searchbox', { name: '종목명 또는 종목코드' });
  try {
    await input.fill('삼성');
    await intercepted;
    await input.fill('000660');
    await expect(page.getByRole('status')).toHaveText('검색 결과 1건');
    await expect(
      page.getByRole('link', { name: 'SK하이닉스', exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
  // A round trip drains the held response before checking the visible result.
  await page.unrouteAll({ behavior: 'wait' });
  await expect(
    page.getByRole('table').locator('tbody tr td:first-child'),
  ).toHaveText(['000660']);
});

test('recovers a saved watchlist after a catalog failure without losing codes', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'stockflow.watchlist.v1',
      JSON.stringify({ stockCodes: ['005930'], updatedAt: 1 }),
    ),
  );
  await page.route(
    (url) => url.pathname === '/api/stocks',
    (route) => route.abort(),
    { times: 1 },
  );
  await page.goto('/watchlist');
  const region = page.getByRole('region', { name: '저장된 관심종목' });
  await expect(region.getByRole('alert')).toHaveText(
    '종목 정보를 불러오지 못했습니다.',
  );
  await expect(
    region.getByRole('link', { name: '005930', exact: true }),
  ).toHaveAttribute('href', '/stocks/005930');
  await region.getByRole('button', { name: '다시 시도' }).click();
  await expect(
    region.getByRole('link', { name: '삼성전자', exact: true }),
  ).toBeVisible();
  await expect(
    region.getByRole('button', { name: '삼성전자 관심종목' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('cancels a pending reconnect when leaving the detail page', async ({
  page,
}) => {
  await page.clock.install();
  let connections = 0;
  await page.routeWebSocket('**/ws/quotes?*', (socket) => {
    connections += 1;
    socket.close({ code: 1012 });
  });
  await page.goto('/stocks/005930');
  await expect(
    page.getByRole('region', { name: 'Mock 현재가' }).getByRole('status'),
  ).toHaveText('모의 시세 재연결 중');
  await page.getByRole('link', { name: '종목 목록으로 돌아가기' }).click();
  await expect(
    page.getByRole('heading', { name: '국내 주식 종목 검색' }),
  ).toBeVisible();
  const atExit = connections;
  expect(atExit).toBeGreaterThan(0);
  await page.clock.runFor(20_000);
  expect(connections).toBe(atExit);
});
