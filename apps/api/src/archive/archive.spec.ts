import { describe, expect, it, vi } from 'vitest';
import { closedDate, dateWindows, validDate, archivePassword } from './config';
import { isArchiveAuthorized } from './archive-auth';
import { KisClient, normalizeDaily } from './kis-client';
const row = {
  stck_bsop_date: '20261124',
  stck_oprc: '100',
  stck_hgpr: '120',
  stck_lwpr: '90',
  stck_clpr: '110',
  acml_vol: '0',
};
describe('private daily archive', () => {
  it('uses Seoul 19:00 cutoff and handles month changes', () => {
    expect(closedDate(new Date('2026-11-25T09:59:59Z'))).toBe('2026-11-24');
    expect(closedDate(new Date('2026-11-25T10:00:00Z'))).toBe('2026-11-25');
    expect(closedDate(new Date('2026-12-01T00:00:00Z'))).toBe('2026-11-30');
  });
  it('validates real calendar dates and splits ranges below 100 daily records', () => {
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('2024-02-29')).toBe(true);
    const ranges = dateWindows('2026-01-01', '2026-04-01');
    expect(ranges).toEqual([
      { from: '2026-01-01', to: '2026-03-01' },
      { from: '2026-03-02', to: '2026-04-01' },
    ]);
    expect(() => dateWindows('2025-01-01', '2026-11-25')).toThrow();
    expect(() => dateWindows('2026-11-25', '2026-11-24')).toThrow();
  });
  it('protects archive access with a separate password, not a KIS credential', () => {
    const password = 'x'.repeat(32);
    expect(() => archivePassword({ PRIVATE_API_PASSWORD: 'short' })).toThrow();
    expect(isArchiveAuthorized(undefined, password)).toBe(false);
    expect(isArchiveAuthorized('Bearer ' + password, password)).toBe(false);
    expect(
      isArchiveAuthorized(
        'Basic ' + Buffer.from('stockflow:' + password).toString('base64'),
        password,
      ),
    ).toBe(true);
    expect(
      isArchiveAuthorized(
        'Basic ' + Buffer.from('wrong:' + password).toString('base64'),
        password,
      ),
    ).toBe(false);
  });
  it('normalizes descending bars without losing zero volume', () => {
    expect(
      normalizeDaily(
        [row, { ...row, stck_bsop_date: '20261123' }],
        '2026-11-01',
        '2026-11-25',
      ).map((b) => b.date),
    ).toEqual(['2026-11-23', '2026-11-24']);
    expect(normalizeDaily([row], '2026-11-24', '2026-11-24')[0].volume).toBe(0);
  });
  it.each([
    { ...row, stck_clpr: '' },
    { ...row, stck_oprc: '-1' },
    { ...row, stck_hgpr: '99' },
    { ...row, stck_bsop_date: '20260230' },
    { ...row, acml_vol: '-1' },
    { ...row, stck_clpr: '9007199254740992' },
  ])('rejects malformed source bars %#', (invalid) => {
    expect(() =>
      normalizeDaily([invalid], '2026-01-01', '2026-12-31'),
    ).toThrow();
  });
  it('rejects duplicate and out-of-range dates rather than silently overwriting them', () => {
    expect(() =>
      normalizeDaily([row, row], '2026-11-01', '2026-11-25'),
    ).toThrow();
    expect(() => normalizeDaily([row], '2026-11-25', '2026-11-25')).toThrow();
  });
  it('reuses one token and validates business success even with HTTP 200', async () => {
    const calls: string[] = [];
    const request: typeof fetch = vi.fn(async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify(
          String(input).endsWith('/tokenP')
            ? {
                access_token: 'fixture-token',
                access_token_token_expired: '2099-01-01 00:00:00',
              }
            : { rt_cd: '0', output2: [row] },
        ),
        { status: 200 },
      );
    });
    const client = new KisClient('fixture-key', 'fixture-secret', request);
    await client.daily('005930', '2026-11-01', '2026-11-25');
    await client.daily('000660', '2026-11-01', '2026-11-25');
    expect(calls.filter((c) => c.endsWith('/tokenP'))).toHaveLength(1);
    expect(calls[1]).toContain('FID_ORG_ADJ_PRC=1');
    expect(calls[1]).toContain('FID_INPUT_ISCD=005930');
  });
  it('sanitizes upstream errors and refuses failed business responses', async () => {
    let count = 0;
    const request: typeof fetch = async () =>
      new Response(
        JSON.stringify(
          ++count === 1
            ? {
                access_token: 'fixture-token',
                access_token_token_expired: '2099-01-01 00:00:00',
              }
            : { rt_cd: '1', msg1: 'DO-NOT-LEAK-SECRET' },
        ),
      );
    await expect(
      new KisClient('key', 'secret', request).daily(
        '005930',
        '2026-11-01',
        '2026-11-25',
      ),
    ).rejects.toThrow('KIS business request failed');
    const bad: typeof fetch = async () => {
      throw new Error('DO-NOT-LEAK-SECRET');
    };
    await expect(
      new KisClient('key', 'secret', bad).daily(
        '005930',
        '2026-11-01',
        '2026-11-25',
      ),
    ).rejects.toThrow('KIS request failed');
  });
  it('spaces failed token issuance retries at least one second apart', async () => {
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const calls: number[] = [];
    const request: typeof fetch = async () => {
      calls.push(now);
      return new Response(JSON.stringify({ error: 'fixture failure' }));
    };
    const client = new KisClient('key', 'secret', request, async (delay) => {
      now += delay;
    });
    try {
      await expect(
        client.daily('005930', '2026-11-01', '2026-11-25'),
      ).rejects.toThrow('Invalid KIS token response');
      await expect(
        client.daily('005930', '2026-11-01', '2026-11-25'),
      ).rejects.toThrow('Invalid KIS token response');
      expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(1000);
    } finally {
      clock.mockRestore();
    }
  });
});
