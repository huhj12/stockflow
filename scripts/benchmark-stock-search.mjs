import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const webOrigin = 'http://localhost:3100';
const apiBase = 'http://localhost:4100/api';
const sampleCount = Number(process.env.BENCH_SAMPLES ?? 7);
const warmups = 2;
const label = process.env.BENCH_LABEL ?? 'day11-baseline';
assert.match(
  label,
  /^[a-z0-9-]+$/,
  'BENCH_LABEL must contain lowercase letters, digits or hyphens',
);
assert.ok(
  Number.isInteger(sampleCount) && sampleCount >= 5 && sampleCount <= 30,
  'BENCH_SAMPLES: integer 5..30',
);
const children = [];
let browser;
let logs = '';
const raw = [];
function start(args, extraEnv) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.on('error', (error) => {
    logs += String(error);
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      logs = (logs + data).slice(-16_000);
    });
  children.push(child);
}
async function ready(url) {
  for (let i = 0; i < 120; i += 1) {
    if (children.some((child) => child.exitCode !== null))
      throw new Error(logs);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server startup timeout: ${url}\n${logs}`);
}
async function ensureFree(url) {
  let occupied = false;
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    occupied = true;
  } catch {
    /* no HTTP server */
  }
  assert.ok(
    !occupied,
    `Benchmark port is in use: ${url}; no existing server will be stopped`,
  );
}
function summary(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    n: values.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted.at(-1),
  };
}
// Measure inside the browser, excluding Playwright locator polling round trips.
async function arm(page, expected, eventType) {
  await page.evaluate(
    ({ expected, eventType }) => {
      const state = window.__stockflowBench;
      state.profiles = [];
      state.longTasks = [];
      state.started = null;
      state.result = null;
      const observer = new MutationObserver(check);
      let finishing = false;
      function check() {
        if (state.started === null || finishing) return;
        const table = document.querySelector('table');
        const rows = document.querySelectorAll(
          'tbody tr:not([aria-hidden="true"])',
        );
        const countMatches =
          table?.dataset.virtualized === 'true'
            ? Number(table.dataset.stockCount) === expected.rows &&
              rows.length > 0
            : rows.length === expected.rows;
        const first = rows[0]?.querySelector('td')?.textContent;
        const sort = document
          .querySelector('th[aria-sort]')
          ?.getAttribute('aria-sort');
        const button = document.querySelector(
          `button[aria-label="${expected.favoriteName} 관심종목"]`,
        );
        const matches = expected.favoriteName
          ? button?.getAttribute('aria-pressed') === expected.pressed
          : countMatches &&
            (!expected.first || first === expected.first) &&
            (!expected.sort || sort === expected.sort);
        if (!matches) return;
        finishing = true;
        observer.disconnect();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const ended = performance.now();
            const entries = performance
              .getEntriesByType('resource')
              .filter(
                (entry) =>
                  entry.name.includes('/api/stocks?query=') &&
                  entry.startTime >= state.started,
              );
            const request = entries.at(-1);
            state.result = {
              elapsedMs: ended - state.started,
              apiMs: request ? request.responseEnd - request.startTime : null,
              domElements: document.querySelectorAll('*').length,
              renderedRows: rows.length,
              profiles: state.profiles,
              longTasks: state.longTasks.filter(
                (entry) =>
                  entry.startTime < ended &&
                  entry.startTime + entry.duration > state.started,
              ),
            };
          }),
        );
      }
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      document.addEventListener(
        eventType,
        () => {
          state.started = performance.now();
        },
        { once: true, capture: true },
      );
    },
    { expected, eventType },
  );
}
async function result(page) {
  await page.waitForFunction(
    () => window.__stockflowBench.result !== null,
    null,
    { timeout: 60_000 },
  );
  return page.evaluate(() => window.__stockflowBench.result);
}
async function initialize(context) {
  await context.addInitScript(() => {
    window.__stockflowBench = {
      profiles: [],
      longTasks: [],
      started: null,
      result: null,
    };
    window.addEventListener('stockflow:profile', (event) =>
      window.__stockflowBench.profiles.push(event.detail),
    );
    new PerformanceObserver((list) => {
      window.__stockflowBench.longTasks.push(
        ...list
          .getEntries()
          .map(({ startTime, duration }) => ({ startTime, duration })),
      );
    }).observe({ type: 'longtask', buffered: true });
  });
}
try {
  await ensureFree(webOrigin);
  await ensureFree(`${apiBase}/health`);
  start(['apps/api/dist/main.js'], { PORT: '4100', WEB_ORIGIN: webOrigin });
  start(
    [
      'node_modules/next/dist/bin/next',
      'start',
      'apps/web',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3100',
    ],
    { NEXT_PUBLIC_ENABLE_PROFILING: '1' },
  );
  await ready(`${apiBase}/health`);
  await ready(webOrigin);
  browser = await chromium.launch();
  const catalog = await (await fetch(`${apiBase}/stocks`)).json();
  assert.equal(catalog.total, 30);
  const httpSamples = [];
  for (let i = -warmups; i < sampleCount; i += 1) {
    const began = performance.now();
    const response = await fetch(`${apiBase}/stocks?query=005930`);
    const data = await response.json();
    assert.equal(data.items[0].code, '005930');
    if (i >= 0) httpSamples.push(performance.now() - began);
  }
  const realContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await initialize(realContext);
  const realPage = await realContext.newPage();
  for (let i = -warmups; i < sampleCount; i += 1) {
    await realPage.goto(webOrigin);
    await realPage
      .getByRole('status')
      .filter({ hasText: '검색 결과 30건' })
      .waitFor();
    await arm(realPage, { rows: 1, first: '005930' }, 'input');
    await realPage.getByRole('searchbox').fill('005930');
    const measurement = await result(realPage);
    assert.ok(
      measurement.profiles.length,
      'No React Profiler events; run npm run bench:build first',
    );
    if (i >= 0)
      raw.push({
        scenario: 'real-search',
        rows: 30,
        cpuRate: 1,
        iteration: i,
        ...measurement,
      });
  }
  await realContext.close();
  for (const cpuRate of [1, 4]) {
    for (const size of [30, 300, 3000]) {
      const items = Array.from({ length: size }, (_, index) => ({
        ...catalog.items[index % catalog.items.length],
        code: String(900000 + index),
        name: `성능테스트 ${index}`,
        price: 10000 + index,
        changeRate: (index % 21) - 10,
        volume: index * 100,
      }));
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      await initialize(context);
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
      await page.route(
        (url) => url.pathname === '/api/stocks',
        (route) => route.fulfill({ json: { items, total: size } }),
      );
      await page.goto(webOrigin);
      await page
        .getByRole('status')
        .filter({ hasText: `검색 결과 ${size}건` })
        .waitFor();
      for (let i = -warmups; i < sampleCount; i += 1) {
        await arm(page, { rows: size }, 'input');
        await page.getByRole('searchbox').fill(`fixture-${i}`);
        const search = await result(page);
        if (i >= 0)
          raw.push({
            scenario: 'synthetic-search',
            rows: size,
            cpuRate,
            iteration: i,
            ...search,
          });
        const descending = i % 2 === 0;
        await arm(
          page,
          {
            rows: size,
            sort: descending ? 'descending' : 'ascending',
            first: String(descending ? 900000 + size - 1 : 900000),
          },
          'click',
        );
        await page
          .getByRole('columnheader', { name: '가격', exact: true })
          .getByRole('button')
          .click();
        const sort = await result(page);
        if (i >= 0)
          raw.push({
            scenario: 'synthetic-sort',
            rows: size,
            cpuRate,
            iteration: i,
            ...sort,
          });
        const favorite = page.getByRole('button', {
          name: '성능테스트 0 관심종목',
          exact: true,
        });
        // Reveal the same code before starting the click timer in either implementation.
        await page.evaluate((last) => {
          const region = document.querySelector(
            '[data-virtualized-region="true"]',
          );
          if (region) region.scrollTop = last ? region.scrollHeight : 0;
        }, descending);
        await favorite.waitFor({ state: 'visible' });
        const pressed =
          (await favorite.getAttribute('aria-pressed')) === 'true'
            ? 'false'
            : 'true';
        await arm(page, { favoriteName: '성능테스트 0', pressed }, 'click');
        await favorite.click();
        const toggle = await result(page);
        if (i >= 0)
          raw.push({
            scenario: 'synthetic-watchlist',
            rows: size,
            cpuRate,
            iteration: i,
            ...toggle,
          });
      }
      await context.close();
      console.log(`Measured ${size} synthetic rows, CPU ${cpuRate}x`);
    }
  }
  const groups = new Map();
  for (const item of raw) {
    const key = `${item.scenario}:${item.rows}:${item.cpuRate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const report = {
    measuredAt: new Date().toISOString(),
    label,
    sourceCommit: execFileSync(
      'git',
      [
        '-c',
        `safe.directory=${root.replaceAll('\\', '/').replace(/\/$/, '')}`,
        'rev-parse',
        'HEAD',
      ],
      { cwd: root, encoding: 'utf8' },
    ).trim(),
    trackedWorktreeDirty: Boolean(
      execFileSync(
        'git',
        [
          '-c',
          `safe.directory=${root.replaceAll('\\', '/').replace(/\/$/, '')}`,
          'status',
          '--porcelain',
          '--untracked-files=no',
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim(),
    ),
    environment: {
      os: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0].model,
      logicalCpus: os.cpus().length,
      hostNode: process.version,
      chromium: browser.version(),
      viewport: '1280x800',
      build: 'Next production --profile',
      network:
        'loopback, no throttling; synthetic responses intercepted in browser',
      warmups,
      samples: sampleCount,
    },
    httpWithJsonMs: summary(httpSamples),
    summaries: [...groups.entries()].map(([key, samples]) => ({
      key,
      elapsedMs: summary(samples.map((s) => s.elapsedMs)),
      reactRenderSumMs: summary(
        samples.map((s) =>
          s.profiles.reduce((sum, p) => sum + p.actualDuration, 0),
        ),
      ),
      reactCommits: samples.map((s) => s.profiles.length),
      domElements: samples[0].domElements,
      longTaskCount: samples.reduce((sum, s) => sum + s.longTasks.length, 0),
    })),
    httpSamples,
    raw,
  };
  const output = path.join(root, '.tools/performance');
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, `${label}.json`),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({ output, httpWithJsonMs: report.httpWithJsonMs }),
  );
  console.table(
    report.summaries.map((row) => ({
      scenario: row.key,
      p50ms: row.elapsedMs.p50.toFixed(1),
      p95ms: row.elapsedMs.p95.toFixed(1),
      reactP50ms: row.reactRenderSumMs.p50.toFixed(1),
      dom: row.domElements,
      longTasks: row.longTaskCount,
    })),
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode !== null) return;
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }),
  );
}
