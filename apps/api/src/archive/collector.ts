import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Stock } from '@stockflow/shared';
import { ArchiveRepository, collectionLock } from './archive.repository';
import { dateWindows } from './config';
import type { DailyProvider } from './kis-client';
export async function collectDaily(
  repo: ArchiveRepository,
  provider: DailyProvider,
  stocks: readonly Stock[],
  from: string,
  to: string,
) {
  const windows = dateWindows(from, to);
  const client = await repo.pool.connect();
  let locked = false;
  const id = randomUUID();
  let attempted = 0,
    succeeded = 0,
    rowsWritten = 0;
  const failed: string[] = [];
  try {
    locked = (
      await client.query('SELECT pg_try_advisory_lock($1) AS locked', [
        collectionLock,
      ])
    ).rows[0].locked;
    if (!locked) return { status: 'locked' as const };
    // A process killed between BEGIN and final status leaves a visible interrupted run.
    await client.query(
      "UPDATE archive_collection_runs SET status='interrupted',finished_at=now() WHERE status='running'",
    );
    await repo.seed(stocks, client);
    await client.query(
      "INSERT INTO archive_collection_runs(id,source,status,date_from,date_to) VALUES($1,$2,'running',$3,$4)",
      [id, provider.source, from, to],
    );
    for (const stock of stocks) {
      attempted++;
      try {
        for (const window of windows) {
          let bars;
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              bars = await provider.daily(stock.code, window.from, window.to);
              break;
            } catch (error) {
              lastError = error;
              if (attempt < 2) await sleep(500 * 2 ** attempt);
            }
          }
          if (!bars) throw lastError;
          await repo.writeBars(client, stock.code, bars, provider.source);
          rowsWritten += bars.length;
        }
        succeeded++;
      } catch {
        failed.push(stock.code);
      }
      await client.query(
        'UPDATE archive_collection_runs SET attempted=$2,succeeded=$3,rows_written=$4,failure_codes=$5 WHERE id=$1',
        [id, attempted, succeeded, rowsWritten, failed],
      );
    }
    const status =
      rowsWritten === 0 || succeeded === 0
        ? 'failed'
        : failed.length
          ? 'partial'
          : 'success';
    await client.query(
      'UPDATE archive_collection_runs SET status=$2,finished_at=now() WHERE id=$1',
      [id, status],
    );
    return { id, status, attempted, succeeded, rowsWritten, failed };
  } catch {
    if (locked)
      await client
        .query(
          "UPDATE archive_collection_runs SET status='failed',finished_at=now() WHERE id=$1 AND status='running'",
          [id],
        )
        .catch(() => {});
    throw new Error('Collection failed; inspect private run history');
  } finally {
    // Destroy a damaged connection if unlock fails; never return a held session lock to the pool.
    let damaged = false;
    if (locked)
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [collectionLock]);
      } catch {
        damaged = true;
      }
    client.release(damaged);
  }
}
