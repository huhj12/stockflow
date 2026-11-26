import { setTimeout as sleep } from 'node:timers/promises';
import { validDate } from './config';
export type DailyBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export interface DailyProvider {
  source: 'kis' | 'fixture';
  daily(code: string, from: string, to: string): Promise<DailyBar[]>;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integer(value: unknown, positive = true) {
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    throw new Error('Invalid KIS numeric field');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < (positive ? 1 : 0))
    throw new Error('Invalid KIS numeric range');
  return n;
}
export function normalizeDaily(
  value: unknown,
  from: string,
  to: string,
): DailyBar[] {
  if (!Array.isArray(value)) throw new Error('Missing KIS candles');
  const rows = new Map<string, DailyBar>();
  for (const row of value) {
    if (
      !record(row) ||
      typeof row.stck_bsop_date !== 'string' ||
      !/^\d{8}$/.test(row.stck_bsop_date)
    )
      throw new Error('Invalid KIS candle date');
    const d = row.stck_bsop_date;
    const date = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
    if (!validDate(date) || date < from || date > to || rows.has(date))
      throw new Error('Invalid or duplicate KIS candle date');
    const bar = {
      date,
      open: integer(row.stck_oprc),
      high: integer(row.stck_hgpr),
      low: integer(row.stck_lwpr),
      close: integer(row.stck_clpr),
      volume: integer(row.acml_vol, false),
    };
    if (
      bar.high < Math.max(bar.open, bar.close) ||
      bar.low > Math.min(bar.open, bar.close) ||
      bar.low > bar.high
    )
      throw new Error('Invalid KIS OHLC');
    rows.set(date, bar);
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export class KisClient implements DailyProvider {
  readonly source = 'kis' as const;
  private token?: { value: string; expires: number };
  private tokenRequest?: Promise<string>;
  private lastRequest = 0;
  private lastTokenRequest = 0;
  constructor(
    private readonly key: string,
    private readonly secret: string,
    private readonly request: typeof fetch = fetch,
    private readonly wait: (delay: number) => Promise<void> = async (delay) => {
      await sleep(delay);
    },
  ) {
    if (!key || !secret)
      throw new Error('KIS_APP_KEY and KIS_APP_SECRET are required');
  }
  private async json(path: string, init: RequestInit) {
    // Serial collector calls leave ample headroom below the production 18 TPS ceiling.
    const isToken = path === '/oauth2/tokenP';
    await this.wait(
      Math.max(
        0,
        250 - (Date.now() - this.lastRequest),
        isToken ? 1000 - (Date.now() - this.lastTokenRequest) : 0,
      ),
    );
    this.lastRequest = Date.now();
    if (isToken) this.lastTokenRequest = this.lastRequest;
    let response: Response;
    try {
      response = await this.request(
        'https://openapi.koreainvestment.com:9443' + path,
        { ...init, signal: AbortSignal.timeout(15000) },
      );
    } catch {
      throw new Error('KIS request failed');
    }
    if (!response.ok) throw new Error('KIS HTTP request failed');
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('Invalid KIS response');
    }
    if (!record(body)) throw new Error('Invalid KIS response');
    return body;
  }
  private accessToken() {
    if (this.token && this.token.expires > Date.now() + 60000)
      return Promise.resolve(this.token.value);
    if (!this.tokenRequest)
      this.tokenRequest = this.issueToken().finally(() => {
        this.tokenRequest = undefined;
      });
    return this.tokenRequest;
  }
  private async issueToken() {
    const body = await this.json('/oauth2/tokenP', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: this.key,
        appsecret: this.secret,
      }),
    });
    // Returned expiration wins over a fixed 24-hour timer; repeated issuance may reuse a token.
    const expiry =
      typeof body.access_token_token_expired === 'string'
        ? Date.parse(
            body.access_token_token_expired.replace(' ', 'T') + '+09:00',
          )
        : NaN;
    if (
      typeof body.access_token !== 'string' ||
      !body.access_token ||
      !Number.isFinite(expiry) ||
      expiry <= Date.now() + 60000
    )
      throw new Error('Invalid KIS token response');
    this.token = { value: body.access_token, expires: expiry };
    return this.token.value;
  }
  async daily(code: string, from: string, to: string) {
    const token = await this.accessToken();
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: from.replaceAll('-', ''),
      FID_INPUT_DATE_2: to.replaceAll('-', ''),
      FID_PERIOD_DIV_CODE: 'D',
      FID_ORG_ADJ_PRC: '1',
    });
    const body = await this.json(
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?' +
        params,
      {
        method: 'GET',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: 'Bearer ' + token,
          appkey: this.key,
          appsecret: this.secret,
          tr_id: 'FHKST03010100',
          custtype: 'P',
        },
      },
    );
    if (body.rt_cd !== '0') throw new Error('KIS business request failed');
    return normalizeDaily(body.output2, from, to);
  }
}
