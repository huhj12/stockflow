import { expect, test, type Page } from '@playwright/test';
import type { Holding } from '@stockflow/shared';
const key = 'stockflow.portfolio.v1';
const number = new Intl.NumberFormat('ko-KR');
const signed = new Intl.NumberFormat('ko-KR', { signDisplay: 'exceptZero' });
const saved = (holdings: Holding[], version = 1) =>
  JSON.stringify({ version, holdings, updatedAt: 1 });
const holding: Holding = {
  stockCode: '005930',
  quantity: 10,
  averagePrice: 10000,
};
const summary = (page: Page) =>
  page.getByRole('region', { name: 'Mock 평가 요약' });
const form = (page: Page) =>
  page.getByRole('region', { name: '보유 정보 입력' });
const table = (page: Page) =>
  page.getByRole('region', { name: '포트폴리오 보유 목록' });
async function seed(page: Page, raw: string) {
  await page.addInitScript(
    ({ key, raw }) => {
      if (!sessionStorage.getItem('portfolio-seeded')) {
        localStorage.setItem(key, raw);
        sessionStorage.setItem('portfolio-seeded', '1');
      }
    },
    { key, raw },
  );
}
async function fill(page: Page, code: string, quantity: string, price: string) {
  await form(page)
    .getByRole('combobox', { name: '보유 종목', exact: true })
    .selectOption(code);
  await form(page).getByLabel('보유 수량 (주)', { exact: true }).fill(quantity);
  await form(page).getByLabel('평균 매수가 (원)', { exact: true }).fill(price);
  await form(page)
    .getByRole('button', { name: '보유 정보 저장', exact: true })
    .click();
}

test('adds, edits and removes a persisted holding with Mock valuation on mobile', async ({
  page,
  request,
}) => {
  const response = await request.get(
    'http://localhost:4000/api/stocks/005930/quote',
  );
  const { price } = await response.json();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page
    .getByRole('link', { name: '가상 포트폴리오', exact: true })
    .click();
  await expect(page).toHaveURL('/portfolio');
  await expect(
    page.getByText('등록된 보유 종목이 없습니다.', { exact: true }),
  ).toBeVisible();
  await fill(page, '005930', '10', '10000');
  await expect(form(page).getByRole('status')).toHaveText(
    '보유 정보를 저장했습니다.',
  );
  await expect(summary(page)).toContainText(number.format(price * 10) + '원');
  await expect(summary(page)).toContainText(
    signed.format((price - 10000) * 10) + '원',
  );
  await page.reload();
  await expect(
    table(page).getByRole('link', { name: '삼성전자', exact: true }),
  ).toBeVisible();
  await expect(table(page).getByText('005930', { exact: true })).toBeVisible();
  await table(page)
    .getByRole('button', { name: '삼성전자 보유 정보 수정' })
    .click();
  await expect(form(page).getByRole('combobox')).toBeDisabled();
  await expect(
    form(page).getByLabel('보유 수량 (주)', { exact: true }),
  ).toBeFocused();
  await form(page).getByLabel('보유 수량 (주)', { exact: true }).fill('99');
  await form(page)
    .getByRole('button', { name: '수정 취소', exact: true })
    .click();
  await expect(form(page).getByRole('combobox')).toBeFocused();
  await expect(table(page).getByText('10주', { exact: true })).toBeVisible();
  await table(page)
    .getByRole('button', { name: '삼성전자 보유 정보 수정' })
    .click();
  await expect(
    form(page).getByLabel('보유 수량 (주)', { exact: true }),
  ).toHaveValue('10');
  await form(page).getByLabel('보유 수량 (주)', { exact: true }).fill('3');
  await form(page)
    .getByLabel('평균 매수가 (원)', { exact: true })
    .fill('20000');
  await form(page)
    .getByRole('button', { name: '보유 정보 저장', exact: true })
    .click();
  await expect(table(page).locator('tbody tr')).toHaveCount(1);
  await expect(summary(page)).toContainText('60,000원');
  await expect(summary(page)).toContainText(number.format(price * 3) + '원');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  await table(page).getByRole('button', { name: '삼성전자 보유 삭제' }).click();
  await expect(
    page.getByText('등록된 보유 종목이 없습니다.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('등록된 보유 종목이 없습니다.', { exact: true }),
  ).toBeVisible();
});

test('rejects zero and fractional holdings without writing browser data', async ({
  page,
}) => {
  await page.goto('/portfolio');
  await fill(page, '005930', '0', '10000');
  await expect(form(page).getByRole('alert')).toContainText(
    '수량은 1~1,000,000주',
  );
  await expect(
    form(page).getByLabel('보유 수량 (주)', { exact: true }),
  ).toBeFocused();
  await form(page).getByLabel('보유 수량 (주)', { exact: true }).fill('1.5');
  await form(page)
    .getByRole('button', { name: '보유 정보 저장', exact: true })
    .click();
  await expect(form(page).getByRole('alert')).toContainText('정수');
  await form(page).getByLabel('보유 수량 (주)', { exact: true }).fill('1');
  await form(page).getByLabel('평균 매수가 (원)', { exact: true }).fill('0');
  await form(page)
    .getByRole('button', { name: '보유 정보 저장', exact: true })
    .click();
  await expect(form(page).getByRole('alert')).toContainText('평균 매수가는');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).toBeNull();
});

test('retains saved holdings while the catalog fails and recovers valuation on retry', async ({
  page,
}) => {
  await seed(page, saved([holding]));
  await page.route(
    (url) => url.pathname === '/api/stocks',
    (route) => route.abort(),
    { times: 1 },
  );
  await page.goto('/portfolio');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    '종목 정보를 불러오지 못했습니다.',
  );
  await expect(
    table(page).getByRole('link', { name: '005930', exact: true }),
  ).toBeVisible();
  await expect(summary(page)).toContainText('100,000원');
  await expect(summary(page).getByRole('definition')).toHaveText([
    '100,000원',
    '—',
    '—',
    '—',
  ]);
  await page
    .getByRole('button', { name: '가격 다시 시도', exact: true })
    .click();
  await expect(
    table(page).getByRole('link', { name: '삼성전자', exact: true }),
  ).toBeVisible();
  await expect(summary(page).getByRole('definition').nth(1)).not.toHaveText(
    '—',
  );
});

test('does not value an unknown saved code as zero or include it in complete totals', async ({
  page,
}) => {
  await seed(page, saved([holding, { ...holding, stockCode: '999999' }]));
  await page.goto('/portfolio');
  await expect(summary(page).getByRole('alert')).toContainText('합계 평가금액');
  await expect(
    table(page).getByRole('link', { name: '999999', exact: true }),
  ).toBeVisible();
  await expect(summary(page).getByRole('definition')).toHaveText([
    '200,000원',
    '—',
    '—',
    '—',
  ]);
});

test('keeps multiple unsaved edits across navigation and saves them on retry', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    sessionStorage.setItem('portfolio-write-fails', '1');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (
        name === key &&
        sessionStorage.getItem('portfolio-write-fails') === '1'
      )
        throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  await page.goto('/portfolio');
  await fill(page, '005930', '1', '10000');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    '현재 세션',
  );
  await fill(page, '000660', '2', '20000');
  await expect(table(page).locator('tbody tr')).toHaveCount(2);
  await page.getByRole('link', { name: '종목 검색으로 돌아가기' }).click();
  await page
    .getByRole('link', { name: '가상 포트폴리오', exact: true })
    .click();
  await expect(table(page).locator('tbody tr')).toHaveCount(2);
  await page.evaluate(() => sessionStorage.removeItem('portfolio-write-fails'));
  await page
    .getByRole('button', { name: '브라우저 저장 다시 시도', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(table(page).locator('tbody tr')).toHaveCount(2);
});

test('recovers malformed storage only after an explicit valid save', async ({
  page,
}) => {
  await seed(page, '{');
  await page.goto('/portfolio');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    '브라우저 저장',
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    '{',
  );
  await fill(page, '005930', '1', '10000');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(
    table(page).getByRole('link', { name: '삼성전자', exact: true }),
  ).toBeVisible();
});

test('keeps future storage versions intact while allowing session-only edits', async ({
  page,
}) => {
  const raw = saved([holding], 2);
  await seed(page, raw);
  await page.goto('/portfolio');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    '브라우저 저장',
  );
  await fill(page, '000660', '2', '20000');
  await expect(
    table(page).getByRole('link', { name: 'SK하이닉스', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    raw,
  );
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    '현재 세션',
  );
});

test('preserves simultaneous edits from two tabs and synchronizes deletion', async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await Promise.all([page.goto('/portfolio'), second.goto('/portfolio')]);
  expect(await page.evaluate(() => Boolean(navigator.locks))).toBe(true);
  await Promise.all([
    fill(page, '005930', '1', '10000'),
    fill(second, '000660', '2', '20000'),
  ]);
  await expect(table(page).locator('tbody tr')).toHaveCount(2);
  await expect(table(second).locator('tbody tr')).toHaveCount(2);
  await second.reload();
  await expect(table(second).locator('tbody tr')).toHaveCount(2);
  await table(second)
    .getByRole('button', { name: 'SK하이닉스 보유 삭제' })
    .click();
  await expect(table(page).locator('tbody tr')).toHaveCount(1);
  await expect(
    table(page).getByRole('link', { name: '삼성전자', exact: true }),
  ).toBeVisible();
});
