import { expect, test } from '@playwright/test';

test('opens a searched stock by keyboard, shows mock prices and returns to the list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  await page
    .getByRole('searchbox', { name: '종목명 또는 종목코드' })
    .fill('005930');
  const link = page.getByRole('link', { name: '삼성전자', exact: true });
  await link.focus();
  await expect(link).toBeFocused();
  await link.press('Enter');
  await expect(page).toHaveURL(/\/stocks\/005930$/);
  await expect(page.getByRole('heading', { name: '삼성전자' })).toBeVisible();
  await expect(page.getByText('005930 · KOSPI · 반도체')).toBeVisible();
  const quote = page.getByRole('region', { name: 'Mock 현재가' });
  await expect(quote).toContainText(/현재가\s*[\d,]+원/);
  await expect(quote).toContainText(/전일 대비.*%/);
  await expect(quote).toContainText(/거래량\s*[\d,]+주/);
  const chart = page.getByRole('img', { name: '일봉 캔들 및 거래량 차트' });
  await expect(chart.locator('canvas').first()).toBeVisible();
  const chartSection = page.getByRole('region', { name: '가격 차트' });
  await expect(
    chartSection.getByRole('link', { name: 'TradingView, Inc.' }),
  ).toHaveAttribute('href', 'https://www.tradingview.com/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  await page.getByRole('link', { name: '종목 목록으로 돌아가기' }).click();
  await expect(
    page.getByRole('heading', { name: '국내 주식 종목 검색' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/');
});

test('distinguishes an invalid code from an unlisted stock', async ({
  page,
}) => {
  await page.goto('/stocks/5930');
  await expect(
    page.getByRole('heading', { name: '잘못된 종목코드입니다.' }),
  ).toBeVisible();
  await page.goto('/stocks/999999');
  await expect(
    page.getByRole('heading', { name: '종목을 찾을 수 없습니다.' }),
  ).toBeVisible();
});

test('retries a failed quote request', async ({ page }) => {
  let failQuote = true;
  await page.route('**/api/stocks/005930/quote', (route) =>
    failQuote ? route.abort() : route.continue(),
  );
  await page.goto('/stocks/005930');
  const error = page.getByRole('region', { name: '종목 상세' });
  await expect(error.getByRole('alert')).toHaveText(
    '종목 정보를 불러오지 못했습니다.',
  );
  failQuote = false;
  await error.getByRole('button', { name: '다시 시도' }).click();
  await expect(
    page.getByRole('heading', { name: 'Mock 현재가' }),
  ).toBeVisible();
});

test('shows an empty chart state without hiding the quote', async ({
  page,
}) => {
  await page.route('**/api/stocks/005930/candles', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto('/stocks/005930');
  await expect(
    page.getByRole('heading', { name: 'Mock 현재가' }),
  ).toBeVisible();
  await expect(page.getByText('표시할 가격 데이터가 없습니다.')).toBeVisible();
});

test('resizes, disposes its canvases and shows the next stock history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/stocks/005930');
  const chart = page.getByRole('img', { name: '일봉 캔들 및 거래량 차트' });
  await expect(chart.locator('canvas').first()).toBeVisible();
  await expect(chart).toHaveAccessibleDescription(/15,956원/);
  const canvasWidth = () =>
    chart.evaluate((element) =>
      Math.max(
        ...Array.from(
          element.querySelectorAll('canvas'),
          (canvas) => canvas.clientWidth,
        ),
      ),
    );
  const narrowWidth = await canvasWidth();
  await page.setViewportSize({ width: 820, height: 800 });
  await expect.poll(canvasWidth).toBeGreaterThan(narrowWidth);

  const oldChart = await chart.elementHandle();
  try {
    await page.getByRole('link', { name: '종목 목록으로 돌아가기' }).click();
    await expect(
      page.getByRole('heading', { name: '국내 주식 종목 검색' }),
    ).toBeVisible();
    await expect
      .poll(() =>
        oldChart.evaluate(
          (element) => element.querySelectorAll('canvas').length,
        ),
      )
      .toBe(0);
    await page.getByRole('link', { name: 'SK하이닉스', exact: true }).click();
    await expect(page).toHaveURL(/\/stocks\/000660$/);
    await expect(chart.locator('canvas').first()).toBeVisible();
    await expect(chart).toHaveAccessibleDescription(/마지막 모의 종가/);
    await expect(chart).not.toHaveAccessibleDescription(/15,956원/);
  } finally {
    await oldChart.dispose();
  }
});

test('shows an error for invalid candle data while retaining the quote', async ({
  page,
}) => {
  await page.route('**/api/stocks/005930/candles', (route) =>
    route.fulfill({
      json: [
        {
          timestamp: 1793923200000,
          open: 100,
          high: 80,
          low: 50,
          close: 90,
          volume: 20,
        },
      ],
    }),
  );
  await page.goto('/stocks/005930');
  await expect(
    page.getByRole('heading', { name: 'Mock 현재가' }),
  ).toBeVisible();
  const section = page.getByRole('region', { name: '가격 차트' });
  await expect(section.getByRole('alert')).toHaveText(
    '가격 데이터 형식이 올바르지 않습니다.',
  );
  await expect(section.locator('canvas')).toHaveCount(0);
});
