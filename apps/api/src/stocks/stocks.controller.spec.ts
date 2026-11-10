import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Stock, StockCandle, StockQuote } from '@stockflow/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';

describe('stocks HTTP endpoints', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api/stocks`;
  });

  afterAll(async () => {
    await app?.close();
  });

  async function list(params: Record<string, string> = {}) {
    const url = new URL(baseUrl);
    url.search = new URLSearchParams(params).toString();
    const response = await fetch(url);
    expect(response.status).toBe(200);
    return (await response.json()) as { items: Stock[]; total: number };
  }

  it('returns 30 unique six-digit codes sorted in ascending order', async () => {
    const { items, total } = await list();
    const codes = items.map(({ code }) => code);
    expect(total).toBe(30);
    expect(codes).toHaveLength(30);
    expect(new Set(codes).size).toBe(30);
    expect(codes).toEqual([...codes].sort());
    expect(
      codes.every(
        (code) => typeof code === 'string' && /^[0-9]{6}$/.test(code),
      ),
    ).toBe(true);
    expect(codes).toContain('000660');
  });

  it('matches partial names after trimming and ignores Latin letter case', async () => {
    const korean = await list({ query: '  삼성전  ' });
    expect(korean.total).toBe(1);
    expect(korean.items[0]).toMatchObject({ code: '005930', name: '삼성전자' });
    const latin = await list({ query: 'nav' });
    expect(latin.items.map(({ code }) => code)).toEqual(['035420']);
  });

  it('matches a partial code and preserves leading zeroes', async () => {
    const result = await list({ query: '00593' });
    expect(result.items.map(({ code }) => code)).toEqual(['005930']);
  });

  it.each(['KOSPI', 'KOSDAQ'])('filters by %s', async (market) => {
    const result = await list({ market });
    expect(result.total).toBe(15);
    expect(result.items).toHaveLength(15);
    expect(result.items.every((item) => item.market === market)).toBe(true);
  });

  it('applies the market and keyword together', async () => {
    const match = await list({ query: '삼성전자', market: 'KOSPI' });
    expect(match.total).toBe(1);
    expect(await list({ query: '삼성전자', market: 'KOSDAQ' })).toEqual({
      items: [],
      total: 0,
    });
  });

  it('returns an empty result for a missing keyword', async () => {
    expect(await list({ query: '찾을수없는종목' })).toEqual({
      items: [],
      total: 0,
    });
  });

  it.each([
    '?market=NYSE',
    '?market=KOSPI&market=KOSDAQ',
    '?query=one&query=two',
    `?query=${'a'.repeat(101)}`,
  ])('rejects invalid list input %s', async (query) => {
    expect((await fetch(`${baseUrl}${query}`)).status).toBe(400);
  });

  it('returns stock detail with its six-digit string code', async () => {
    const response = await fetch(`${baseUrl}/005930`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      code: '005930',
      name: '삼성전자',
      market: 'KOSPI',
      sector: '반도체',
    });
  });

  it('returns 404 for a valid but unknown code', async () => {
    expect((await fetch(`${baseUrl}/999999`)).status).toBe(404);
  });

  it.each(['5930', 'ABCDEF', '005930%0A'])(
    'rejects malformed detail code %s',
    async (code) => {
      expect((await fetch(`${baseUrl}/${code}`)).status).toBe(400);
    },
  );

  it.each(['quote', 'candles'])(
    'validates the code on the %s route',
    async (route) => {
      for (const code of ['5930', 'ABCDEF', '005930%0A']) {
        expect((await fetch(baseUrl + '/' + code + '/' + route)).status).toBe(
          400,
        );
      }
      expect((await fetch(baseUrl + '/999999/' + route)).status).toBe(404);
    },
  );

  it('returns a stable quote consistent with its daily candle history', async () => {
    const quoteUrl = baseUrl + '/005930/quote';
    const candlesUrl = baseUrl + '/005930/candles';
    const [quoteResponse, candlesResponse] = await Promise.all([
      fetch(quoteUrl),
      fetch(candlesUrl),
    ]);
    expect(quoteResponse.status).toBe(200);
    expect(candlesResponse.status).toBe(200);
    const quote = (await quoteResponse.json()) as StockQuote;
    const candles = (await candlesResponse.json()) as StockCandle[];
    expect(candles).toHaveLength(30);
    expect(quote.code).toBe('005930');
    expect(quote.sequence).toBe(0);
    expect(Number.isSafeInteger(quote.timestamp)).toBe(true);
    expect(quote.timestamp).toBeGreaterThan(1_000_000_000_000);
    expect(quote.previousClose).toBeGreaterThan(0);
    expect(quote.change).toBe(quote.price - quote.previousClose);
    expect(quote.changeRate).toBeCloseTo(
      (quote.change / quote.previousClose) * 100,
    );
    expect(quote.price).toBe(candles[29].close);
    expect(quote.volume).toBe(candles[29].volume);
    expect(quote.timestamp).toBe(candles[29].timestamp);
    expect(quote.previousClose).toBe(candles[28].close);
    for (const [index, candle] of candles.entries()) {
      expect(Number.isSafeInteger(candle.timestamp)).toBe(true);
      if (index > 0)
        expect(candle.timestamp - candles[index - 1].timestamp).toBe(
          86_400_000,
        );
      expect(candle.high).toBeGreaterThanOrEqual(
        Math.max(candle.open, candle.close),
      );
      expect(candle.low).toBeLessThanOrEqual(
        Math.min(candle.open, candle.close),
      );
      expect(candle.low).toBeGreaterThan(0);
      expect(Number.isInteger(candle.volume)).toBe(true);
      expect(candle.volume).toBeGreaterThanOrEqual(0);
    }
    expect(await (await fetch(quoteUrl)).json()).toEqual(quote);
    expect(await (await fetch(candlesUrl)).json()).toEqual(candles);
  });
});
