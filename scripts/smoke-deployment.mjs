import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Reuse the API workspace's ws dependency; do not add a deployment-only library.
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { WebSocket } = requireApi('ws');
const webOrigin = process.env.SMOKE_WEB_ORIGIN ?? 'http://localhost:3000';
const apiBase = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:4000/api';

async function read(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Origin: webOrigin },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, `API ${path}`);
  assert.equal(response.headers.get('access-control-allow-origin'), webOrigin);
  return response.json();
}

const html = await fetch(webOrigin, { signal: AbortSignal.timeout(10_000) });
assert.equal(html.status, 200);
assert.match(await html.text(), /StockFlow/);
await read('/health');
const list = await read('/stocks?query=005930');
assert.equal(list.total, 1);
assert.equal(list.items[0].code, '005930');
const quote = await read('/stocks/005930/quote');
const candles = await read('/stocks/005930/candles');
assert.equal(quote.code, '005930');
assert.equal(candles.length, 30);
const license = await fetch(
  new URL('/licenses/lightweight-charts.txt', webOrigin),
);
assert.equal(license.status, 200);
assert.match(await license.text(), /Apache License/);

const streamUrl = new URL('/ws/quotes?code=005930', apiBase);
streamUrl.protocol = streamUrl.protocol === 'https:' ? 'wss:' : 'ws:';
await new Promise((resolve, reject) => {
  const socket = new WebSocket(streamUrl, { origin: webOrigin });
  let session;
  function finish(error) {
    clearTimeout(timeout);
    socket.terminate();
    if (error) reject(error);
    else resolve();
  }
  const timeout = setTimeout(
    () => finish(new Error('Mock stream timeout')),
    10_000,
  );
  socket.on('error', finish);
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      assert.equal(message.quote.code, '005930');
      assert.equal(message.quote.price, message.candle.close);
      if (!session) {
        assert.equal(message.type, 'snapshot');
        assert.equal(message.quote.sequence, 0);
        assert.equal(typeof message.sessionId, 'string');
        assert.ok(message.sessionId);
        session = message.sessionId;
        assert.equal(message.quote.price, quote.price);
      } else {
        assert.equal(message.type, 'tick');
        assert.equal(message.sessionId, session);
        assert.ok(message.quote.sequence > 0);
        finish();
      }
    } catch (error) {
      finish(error);
    }
  });
});
console.log(
  'Deployment smoke passed: web, static license, REST/CORS, Mock snapshot and tick',
);
