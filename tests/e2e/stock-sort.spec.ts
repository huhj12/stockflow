import { expect, test } from '@playwright/test';
import type { StockListItem } from '@stockflow/shared';

test('sorts the filtered market numerically and retains the selected sort', async ({
  page,
  request,
}) => {
  const response = await request.get(
    `http://localhost:${process.env.PLAYWRIGHT_API_PORT ?? 4000}/api/stocks?market=KOSPI`,
  );
  expect(response.ok()).toBeTruthy();
  const { items } = (await response.json()) as { items: StockListItem[] };

  await page.goto('/');
  await page.getByRole('combobox', { name: '시장' }).selectOption('KOSPI');
  const table = page.getByRole('table');
  const codes = table.locator('tbody tr td:first-child');
  await expect(codes).toHaveText(items.map(({ code }) => code));

  for (const [key, label] of [
    ['price', '가격'],
    ['changeRate', '등락률'],
    ['volume', '거래량'],
  ] as const) {
    const header = table.getByRole('columnheader', {
      name: label,
      exact: true,
    });
    const button = header.getByRole('button');
    await button.focus();
    await button.press('Enter');
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await expect(codes).toHaveText(
      items
        .toSorted((a, b) => b[key] - a[key] || a.code.localeCompare(b.code))
        .map(({ code }) => code),
    );
    await button.press('Enter');
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect(codes).toHaveText(
      items
        .toSorted((a, b) => a[key] - b[key] || a.code.localeCompare(b.code))
        .map(({ code }) => code),
    );
  }
  await page
    .getByRole('searchbox', { name: '종목명 또는 종목코드' })
    .fill('005930');
  await expect(codes).toHaveText(['005930']);
  await expect(
    table.getByRole('columnheader', { name: '거래량' }),
  ).toHaveAttribute('aria-sort', 'ascending');
});
