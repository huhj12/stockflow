import { spawnSync } from 'node:child_process';

// npm supplies its exact CLI path on Windows and Unix; avoid shell quoting.
if (!process.env.npm_execpath)
  throw new Error('Run through npm run bench:build');
const env = {
  ...process.env,
  NEXT_PUBLIC_ENABLE_PROFILING: '1',
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4100/api',
  NEXT_TELEMETRY_DISABLED: '1',
};
for (const args of [
  ['run', 'build', '-w', '@stockflow/shared'],
  ['run', 'build', '-w', '@stockflow/api'],
  ['run', 'build', '-w', '@stockflow/web', '--', '--profile'],
]) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, ...args],
    {
      stdio: 'inherit',
      env,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
