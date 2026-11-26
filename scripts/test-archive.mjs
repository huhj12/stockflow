import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const database = process.env.ARCHIVE_TEST_DATABASE_URL;
if (!database)
  throw new Error(
    'ARCHIVE_TEST_DATABASE_URL is required for real PostgreSQL tests',
  );
const admin = new Pool({ connectionString: database });
const schema = 'archive_test_' + randomUUID().replaceAll('-', '');
assert.match(schema, /^archive_test_[a-f0-9]{32}$/);
const url = new URL(database);
url.searchParams.set('options', '-csearch_path=' + schema);
process.env.DATABASE_URL = url.toString();
process.env.PRIVATE_API_PASSWORD = randomBytes(32).toString('hex');
const {
  ArchiveRepository,
  collectionLock,
} = require('../apps/api/dist/archive/archive.repository.js');
const { collectDaily } = require('../apps/api/dist/archive/collector.js');
process.env.ENABLE_PRIVATE_ARCHIVE = '1';
const { AppModule } = require('../apps/api/dist/app.module.js');
const {
  setupPrivateSwagger,
} = require('../apps/api/dist/archive/archive-auth.js');
const { NestFactory } = require('@nestjs/core');
const repo = new ArchiveRepository();
let app;
const stocks = [
  { code: '005930', name: '삼성전자', market: 'KOSPI', sector: '반도체' },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI', sector: '반도체' },
];
let close = 110;
const bar = () => ({
  date: '2026-11-24',
  open: 100,
  high: 150,
  low: 90,
  close,
  volume: 0,
});
const provider = { source: 'fixture', daily: async () => [bar()] };
const from = '2026-11-23',
  to = '2026-11-25';
try {
  await admin.query('CREATE SCHEMA "' + schema + '"');
  await repo.migrate();
  await repo.migrate();
  assert.equal(
    (await collectDaily(repo, provider, stocks, from, to)).status,
    'success',
  );
  close = 120;
  await collectDaily(repo, provider, stocks, from, to);
  assert.equal((await repo.candles('005930', from, to, 'fixture')).length, 1);
  assert.equal((await repo.latest('005930', 'fixture')).close, 120);
  assert.equal(await repo.latest('005930', 'kis'), null);
  const partial = await collectDaily(
    repo,
    {
      source: 'fixture',
      daily: async (code) => {
        if (code === '000660') throw new Error('private upstream failure');
        return [bar()];
      },
    },
    stocks,
    from,
    to,
  );
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.failed, ['000660']);
  const held = await repo.pool.connect();
  try {
    await held.query('SELECT pg_advisory_lock($1)', [collectionLock]);
    assert.equal(
      (await collectDaily(repo, provider, stocks, from, to)).status,
      'locked',
    );
  } finally {
    await held.query('SELECT pg_advisory_unlock($1)', [collectionLock]);
    held.release();
  }
  const failed = await collectDaily(
    repo,
    { source: 'fixture', daily: async () => [] },
    stocks,
    from,
    to,
  );
  assert.equal(failed.status, 'failed');
  const interrupted = randomUUID();
  await repo.pool.query(
    "INSERT INTO archive_collection_runs(id,source,status,date_from,date_to) VALUES($1,'fixture','running',$2,$3)",
    [interrupted, from, to],
  );
  await collectDaily(repo, provider, stocks, from, to);
  assert.equal(
    (
      await repo.pool.query(
        'SELECT status FROM archive_collection_runs WHERE id=$1',
        [interrupted],
      )
    ).rows[0].status,
    'interrupted',
  );
  // Invalid row forces rollback of the whole stock/window, preserving its previous close.
  const client = await repo.pool.connect();
  try {
    await assert.rejects(
      repo.writeBars(
        client,
        '005930',
        [
          { ...bar(), close: 140 },
          { ...bar(), date: '2026-11-23', low: 200 },
        ],
        'fixture',
      ),
    );
  } finally {
    client.release();
  }
  assert.equal((await repo.latest('005930', 'fixture')).close, 120);
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  setupPrivateSwagger(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const headers = {
    Authorization:
      'Basic ' +
      Buffer.from('stockflow:' + process.env.PRIVATE_API_PASSWORD).toString(
        'base64',
      ),
  };
  for (const path of [
    '/api/docs',
    '/api/docs-json',
    '/api/archive/stocks',
    '/api/archive/collection-runs',
  ])
    assert.equal((await fetch(base + path)).status, 401);
  assert.equal(
    (
      await fetch(base + '/api/archive/stocks', {
        headers: { Authorization: 'Basic wrong' },
      })
    ).status,
    401,
  );
  const search = await (
    await fetch(base + '/api/archive/stocks?query=005', { headers })
  ).json();
  assert.equal(search.items[0].code, '005930');
  const candles = await (
    await fetch(
      base +
        '/api/archive/stocks/005930/candles?source=fixture&from=' +
        from +
        '&to=' +
        to,
      { headers },
    )
  ).json();
  assert.equal(candles.total, 1);
  assert.equal(candles.items[0].close, 120);
  const quote = await (
    await fetch(base + '/api/archive/stocks/005930/quote?source=fixture', {
      headers,
    })
  ).json();
  assert.equal(quote.kind, 'daily-close');
  assert.equal(quote.source, 'fixture');
  assert.equal(
    (await fetch(base + '/api/archive/stocks/005930/quote', { headers }))
      .status,
    404,
  );
  for (const path of [
    '/api/archive/stocks?market=BAD',
    '/api/archive/stocks?query=x&query=y',
    '/api/archive/stocks/5930/quote',
    '/api/archive/stocks/005930/candles?to=2026-02-30',
    '/api/archive/stocks/005930/candles?source=bad',
  ])
    assert.equal((await fetch(base + path, { headers })).status, 400);
  const spec = await (await fetch(base + '/api/docs-json', { headers })).json();
  assert.ok(spec.paths['/api/archive/stocks/{code}/candles']);
  assert.equal(spec.paths['/api/stocks'], undefined);
  assert.equal(spec.components.securitySchemes.basic.type, 'http');
  assert.equal((await fetch(base + '/api/docs/', { headers })).status, 200);
  const runs = await (
    await fetch(base + '/api/archive/collection-runs', { headers })
  ).json();
  assert.ok(runs.some((r) => r.status === 'partial'));
  assert.ok(runs.some((r) => r.status === 'interrupted'));
  console.log(
    'Archive PostgreSQL integration passed: migration, upsert, rollback, source separation, lock, partial/empty/interrupted runs, private API and OpenAPI',
  );
} finally {
  if (app) await app.close();
  await repo.onModuleDestroy();
  await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
  await admin.end();
}
