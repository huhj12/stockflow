import { expect, test, type Page } from '@playwright/test';
import type { StockListItem } from '@stockflow/shared';

const items = Array.from({ length: 3000 }, (_, index): StockListItem => ({
  code: index === 0 ? '005930' : String(900000 + index),
  name: index === 0 ? '삼성전자' : `가상종목 ${index}`,
  market: index % 2 === 0 ? 'KOSPI' : 'KOSDAQ',
  sector: '테스트',
  price: 10000 + index,
  changeRate: index / 100,
  volume: index * 100,
}));
const region = (page: Page) =>
  page.getByRole('region', { name: '종목 검색 결과' });
const rows = (page: Page) => region(page).locator('tbody tr[data-stock-code]');

test.beforeEach(async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/stocks',
    (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('query')?.trim() ?? '';
      const market = url.searchParams.get('market');
      const filtered = items.filter(
        (item) =>
          (!market || item.market === market) &&
          (!query || item.name.includes(query) || item.code.includes(query)),
      );
      return route.fulfill({
        json: { items: filtered, total: filtered.length },
      });
    },
  );
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('검색 결과 3000건');
});

test('bounds mounted rows and reaches the final row without losing focus', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    '3001',
  );
  await expect.poll(() => rows(page).count()).toBeLessThan(50);
  const first = page.getByRole('link', { name: '삼성전자', exact: true });
  await first.focus();
  await region(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
  });
  await expect(page.locator('tr[data-index="1500"]')).toBeAttached();
  await expect(first).toBeFocused();
  await first.press('ArrowDown');
  await expect(
    page.getByRole('link', { name: '가상종목 1', exact: true }),
  ).toBeFocused();
  await region(page).focus();
  await region(page).press('End');
  const last = page.getByRole('link', { name: '가상종목 2999', exact: true });
  await expect(last).toBeFocused();
  await expect(last.locator('..').locator('..')).toHaveAttribute(
    'aria-rowindex',
    '3001',
  );
  await last.press('Tab');
  const favorite = page.getByRole('button', {
    name: '가상종목 2999 관심종목',
    exact: true,
  });
  await expect(favorite).toBeFocused();
  await favorite.press('Enter');
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await favorite.press('Shift+Tab');
  await expect(last).toBeFocused();
  await last.press('Home');
  await expect(first).toBeFocused();
  await first.press('PageDown');
  const nextPage = page.getByRole('link', { name: '가상종목 6', exact: true });
  await expect(nextPage).toBeFocused();
  await nextPage.press('PageUp');
  await expect(first).toBeFocused();
  await first.press('Tab');
  await page.getByRole('button', { name: '삼성전자 관심종목' }).press('Tab');
  await expect(
    page.getByRole('link', { name: '가상종목 1', exact: true }),
  ).toBeFocused();
  await expect.poll(() => rows(page).count()).toBeLessThan(50);
  expect(errors).toEqual([]);
});

test('sorts the entire data set, resets scroll and opens a real stock by keyboard', async ({
  page,
}) => {
  await region(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole('link', { name: '가상종목 2999', exact: true }),
  ).toBeVisible();
  const price = page.getByRole('columnheader', { name: '가격', exact: true });
  await price.getByRole('button').click();
  await expect(price).toHaveAttribute('aria-sort', 'descending');
  await expect(rows(page).first()).toHaveAttribute('data-stock-code', '902999');
  await expect
    .poll(() => region(page).evaluate((element) => element.scrollTop))
    .toBe(0);
  await region(page).focus();
  await region(page).press('End');
  const samsung = page.getByRole('link', { name: '삼성전자', exact: true });
  await expect(samsung).toBeFocused();
  await samsung.press('Enter');
  await expect(page).toHaveURL(/\/stocks\/005930$/);
  await expect(
    page.getByRole('heading', { name: '삼성전자', exact: true }),
  ).toBeVisible();
});

test('supports full-list reading and retains the preference across search', async ({
  page,
}) => {
  const toggle = page.getByRole('button', {
    name: '전체 목록 표시',
    exact: true,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(3000);
  await page.getByRole('searchbox').fill('가상종목');
  await expect(page.getByRole('status')).toHaveText('검색 결과 2999건');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(2999);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => rows(page).count()).toBeLessThan(50);
  await page.getByRole('searchbox').fill('005930');
  await expect(page.getByRole('status')).toHaveText('검색 결과 1건');
  await expect(rows(page)).toHaveCount(1);
  await expect(toggle).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveAttribute(
    'data-virtualized',
    'false',
  );
});

test('handles mobile resizing, larger text and market changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.addStyleTag({
    content: '.stock-table-virtual { font-size: 28px; }',
  });
  const codeHeader = page.getByRole('columnheader', {
    name: '종목코드',
    exact: true,
  });
  await expect
    .poll(() =>
      codeHeader.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    )
    .toBe(true);
  await region(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    page.getByRole('link', { name: '가상종목 2999', exact: true }),
  ).toBeVisible();
  await expect.poll(() => rows(page).count()).toBeLessThan(50);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  await page.getByRole('combobox', { name: '시장' }).selectOption('KOSDAQ');
  await expect(page.getByRole('status')).toHaveText('검색 결과 1500건');
  await expect(rows(page).first()).toHaveAttribute('data-stock-code', '900001');
  await expect
    .poll(() => region(page).evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(page.getByRole('table')).toHaveAttribute(
    'aria-rowcount',
    '1501',
  );
});

test('reveals keyboard focus horizontally and lets Tab leave the list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await region(page).evaluate((element) => {
    const after = document.createElement('button');
    after.textContent = '목록 다음';
    element.after(after);
    element.scrollLeft = element.scrollWidth;
  });
  await region(page).focus();
  await region(page).press('End');
  const last = page.getByRole('link', { name: '가상종목 2999', exact: true });
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await last.press('Tab');
  const favorite = page.getByRole('button', {
    name: '가상종목 2999 관심종목',
    exact: true,
  });
  await expect(favorite).toBeFocused();
  await expect(favorite).toBeInViewport();
  await favorite.press('Tab');
  const after = page.getByRole('button', { name: '목록 다음', exact: true });
  await expect(after).toBeFocused();
  await after.press('Shift+Tab');
  await expect(favorite).toBeFocused();
  await favorite.press('Shift+Tab');
  await last.press('Home');
  const first = page.getByRole('link', { name: '삼성전자', exact: true });
  await expect(first).toBeFocused();
  await expect(first).toBeInViewport();
});

test('resets scroll when returning to cached market results', async ({
  page,
}) => {
  let requests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/stocks') requests += 1;
  });
  const market = page.getByRole('combobox', { name: '시장' });
  await market.selectOption('KOSDAQ');
  await expect(page.getByRole('status')).toHaveText('검색 결과 1500건');
  await region(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
  });
  await expect
    .poll(() => region(page).evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1000);
  await market.selectOption('');
  await expect(page.getByRole('status')).toHaveText('검색 결과 3000건');
  await expect
    .poll(() => region(page).evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(rows(page).first()).toHaveAttribute('data-stock-code', '005930');
  await region(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await market.selectOption('KOSDAQ');
  await expect(page.getByRole('status')).toHaveText('검색 결과 1500건');
  await expect
    .poll(() => region(page).evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(rows(page).first()).toHaveAttribute('data-stock-code', '900001');
  expect(requests).toBe(1);
});
