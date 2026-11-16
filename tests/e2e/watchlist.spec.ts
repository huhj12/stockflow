import { expect, test } from '@playwright/test';

test('saves from search, shares state with detail and persists removal', async ({
  page,
}) => {
  await page.goto('/');
  const favorite = page.getByRole('button', { name: '삼성전자 관심종목' });
  await expect(favorite).toHaveAttribute('aria-pressed', 'false');
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '삼성전자', exact: true }).click();
  await expect(page).toHaveURL(/\/stocks\/005930$/);
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('link', { name: '관심종목 보기' }).click();
  await expect(page).toHaveURL(/\/watchlist$/);
  await page.reload();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: '삼성전자' })).toHaveAttribute(
    'href',
    '/stocks/005930',
  );
  await favorite.click();
  await expect(page.getByRole('status')).toHaveText(
    '등록된 관심종목이 없습니다.',
  );
  await page.reload();
  await expect(page.getByRole('status')).toHaveText(
    '등록된 관심종목이 없습니다.',
  );
});

test('recovers from malformed browser storage', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('stockflow.watchlist.v1', '{'),
  );
  await page.goto('/watchlist');
  await expect(
    page.getByRole('region', { name: '저장된 관심종목' }).getByRole('alert'),
  ).toContainText('저장 데이터를 읽지 못했습니다');
  await expect(page.getByRole('status')).toHaveText(
    '등록된 관심종목이 없습니다.',
  );
});
