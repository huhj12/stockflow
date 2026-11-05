import { expect, test } from '@playwright/test';
test('web and API are available', async ({ page, request }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'StockFlow', exact: true }),
  ).toBeVisible();
  const response = await request.get('http://localhost:4000/api/health');
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual({
    status: 'ok',
    service: 'stockflow-api',
  });
});
