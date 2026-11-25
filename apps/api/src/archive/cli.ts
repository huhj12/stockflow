import 'reflect-metadata';
import { ArchiveRepository } from './archive.repository';
import { collectDaily } from './collector';
import { closedDate, dateWindows, shiftDate } from './config';
import { KisClient } from './kis-client';
import { mockStocks } from '../stocks/stocks.mock';
async function main() {
  const command = process.argv[2];
  if (command !== 'migrate' && command !== 'collect')
    throw new Error('Use migrate or collect');
  const repo = new ArchiveRepository();
  try {
    if (command === 'migrate') {
      await repo.migrate();
      const seedClient = await repo.pool.connect();
      try {
        await repo.seed(mockStocks, seedClient);
      } finally {
        seedClient.release();
      }
      console.log('Archive migration completed');
      return;
    }
    if (process.env.KIS_ENV !== 'prod')
      throw new Error('KIS_ENV=prod required for this read-only KRX collector');
    const end = process.env.ARCHIVE_TO || closedDate();
    const from = process.env.ARCHIVE_FROM || shiftDate(end, -89);
    dateWindows(from, end);
    if (end > closedDate())
      throw new Error('Collection end must be a closed KRX date');
    const requested = process.env.ARCHIVE_CODES?.split(',').map((c) =>
      c.trim(),
    );
    if (
      requested &&
      (!requested.length ||
        new Set(requested).size !== requested.length ||
        requested.some((c) => !mockStocks.some((s) => s.code === c)))
    )
      throw new Error('ARCHIVE_CODES must contain unique catalog codes');
    const stocks = requested
      ? mockStocks.filter((s) => requested.includes(s.code))
      : mockStocks;
    const provider = new KisClient(
      process.env.KIS_APP_KEY ?? '',
      process.env.KIS_APP_SECRET ?? '',
    );
    const result = await collectDaily(repo, provider, stocks, from, end);
    console.log(JSON.stringify(result));
    if (result.status === 'failed' || result.status === 'partial')
      process.exitCode = 1;
  } finally {
    await repo.onModuleDestroy();
  }
}
void main().catch(() => {
  console.error(
    'Archive command failed. Check configuration, database and private run history; credentials are never printed.',
  );
  process.exitCode = 1;
});
