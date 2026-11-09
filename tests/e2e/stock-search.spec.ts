import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('shows the mock catalog and all 30 stocks', async ({ page }) => {
  await expect(page.getByText(/테스트용 Mock 종목 30개/)).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('검색 결과 30건');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(31);
});

test('finds Samsung Electronics by name', async ({ page }) => {
  await page
    .getByRole('searchbox', { name: '종목명 또는 종목코드' })
    .fill('삼성전자');
  await expect(page.getByRole('status')).toHaveText('검색 결과 1건');
  await expect(page.getByRole('rowheader', { name: '삼성전자' })).toBeVisible();
});

test('finds Samsung Electronics by its six-digit code using the keyboard', async ({
  page,
}) => {
  await page.keyboard.press('Tab');
  const input = page.getByRole('searchbox', { name: '종목명 또는 종목코드' });
  await expect(input).toBeFocused();
  await page.keyboard.type('005930');
  await expect(page.getByRole('status')).toHaveText('검색 결과 1건');
  await expect(
    page.getByRole('cell', { name: '005930', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('rowheader', { name: '삼성전자' })).toBeVisible();
});

test('filters by market on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.getByRole('combobox', { name: '시장' }).selectOption('KOSDAQ');
  await expect(page.getByRole('status')).toHaveText('검색 결과 15건');
  await expect(
    page.getByRole('cell', { name: 'KOSDAQ', exact: true }),
  ).toHaveCount(15);
  await expect(
    page.getByRole('cell', { name: 'KOSPI', exact: true }),
  ).toHaveCount(0);
  const tableRegion = page.getByRole('region', { name: '종목 검색 결과' });
  await tableRegion.focus();
  await expect(tableRegion).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
});

test('announces an empty search result', async ({ page }) => {
  await page
    .getByRole('searchbox', { name: '종목명 또는 종목코드' })
    .fill('찾을수없는종목');
  await expect(page.getByRole('status')).toHaveText('검색 결과가 없습니다.');
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('shows an error and retries the same request', async ({ page }) => {
  await expect(page.getByRole('status')).toHaveText('검색 결과 30건');
  await page.route(
    (url) =>
      url.pathname === '/api/stocks' &&
      url.searchParams.get('query') === '005930',
    (route) => route.abort(),
    { times: 1 },
  );
  await page
    .getByRole('searchbox', { name: '종목명 또는 종목코드' })
    .fill('005930');
  await expect(
    page
      .getByRole('region', { name: '국내 주식 종목 검색' })
      .getByRole('alert'),
  ).toHaveText('종목 목록을 불러오지 못했습니다.');
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('status')).toHaveText('검색 결과 1건');
  await expect(page.getByRole('rowheader', { name: '삼성전자' })).toBeVisible();
});
