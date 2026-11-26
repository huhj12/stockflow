import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type { Stock } from '@stockflow/shared';
import { archiveDatabaseUrl } from './config';
import { schemaV1 } from './schema';
import type { DailyBar } from './kis-client';
export const collectionLock = 1515001;
@Injectable()
export class ArchiveRepository implements OnModuleDestroy {
  readonly pool: Pool;
  constructor() {
    this.pool = new Pool({
      connectionString: archiveDatabaseUrl(),
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      query_timeout: 16000,
    });
    this.pool.on('error', () =>
      console.error('Archive database connection lost'),
    );
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(1515000)');
      await client.query(schemaV1);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async seed(stocks: readonly Stock[], client: PoolClient) {
    for (const s of stocks)
      await client.query(
        'INSERT INTO archive_stocks(code,name,market,sector) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO NOTHING',
        [s.code, s.name, s.market, s.sector],
      );
  }
  async writeBars(
    client: PoolClient,
    code: string,
    bars: DailyBar[],
    source: 'kis' | 'fixture',
  ) {
    // A stock/window commits atomically; a failed row cannot leave half its window saved.
    await client.query('BEGIN');
    try {
      for (const b of bars)
        await client.query(
          `INSERT INTO archive_daily_candles(code,exchange,trade_date,adjusted,open,high,low,close,volume,source)
    VALUES($1,'KRX',$2,false,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(code,exchange,trade_date,adjusted,source) DO UPDATE SET
    open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume,collected_at=now()`,
          [code, b.date, b.open, b.high, b.low, b.close, b.volume, source],
        );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  async stocks(query: string, market?: string) {
    const result = await this.pool.query(
      `SELECT code,name,market,sector,metadata_source AS "metadataSource" FROM archive_stocks
   WHERE (strpos(lower(name),lower($1))>0 OR strpos(code,$1)>0) AND ($2::text IS NULL OR market=$2) ORDER BY code LIMIT 500`,
      [query, market ?? null],
    );
    return { items: result.rows, total: result.rowCount };
  }
  async candles(
    code: string,
    from: string,
    to: string,
    source: 'kis' | 'fixture',
  ) {
    const result = await this.pool.query(
      `SELECT trade_date::text AS date,open::text,high::text,low::text,close::text,volume::text,collected_at AS "collectedAt"
   FROM archive_daily_candles WHERE code=$1 AND exchange='KRX' AND adjusted=false AND trade_date BETWEEN $2::date AND $3::date AND source=$4 ORDER BY trade_date`,
      [code, from, to, source],
    );
    return result.rows.map((row) => ({
      ...row,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }));
  }
  async latest(code: string, source: 'kis' | 'fixture') {
    const result = await this.pool.query(
      `SELECT trade_date::text AS date, close::text AS close,volume::text,collected_at AS "collectedAt" FROM archive_daily_candles
   WHERE code=$1 AND source=$2 AND exchange='KRX' AND adjusted=false ORDER BY trade_date DESC LIMIT 1`,
      [code, source],
    );
    const row = result.rows[0];
    return row
      ? { ...row, close: Number(row.close), volume: Number(row.volume) }
      : null;
  }
  async runs() {
    return (
      await this.pool.query(
        'SELECT id,source,status,date_from::text,date_to::text,started_at,finished_at,attempted,succeeded,rows_written,failure_codes FROM archive_collection_runs ORDER BY started_at DESC LIMIT 50',
      )
    ).rows;
  }
}
