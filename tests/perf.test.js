import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMockBackend } from '../js/mock-backend.js';
import {
  TASK_SAVE_WAIT_MS,
  createDebouncedFlush,
  createRequestGate,
  defaultHistoryRange,
  readTaskCache,
  stableKey,
  writeTaskCache,
} from '../js/requests.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test('history opens on the last 14 days', () => {
  assert.deepEqual(defaultHistoryRange('2026-09-24'), {
    from: '2026-09-11',
    to: '2026-09-24',
  });
});

test('task cache is fresh inside 10 minutes and stale after', () => {
  const storage = memoryStorage();
  const now = 1_000_000;
  writeTaskCache(storage, [{ id: 1, title: 'Check hardware status' }], now);
  assert.equal(readTaskCache(storage, now + 60_000).fresh, true);
  assert.equal(readTaskCache(storage, now + 10 * 60 * 1000).fresh, false);
  assert.equal(readTaskCache(storage, now + 60_000).tasks[0].title, 'Check hardware status');
});

test('identical in-flight requests share one call', async () => {
  let calls = 0;
  const gate = createRequestGate({
    async call(body) {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { ok: true, data: body.action };
    },
  });
  const [a, b] = await Promise.all([
    gate.request({ action: 'getTasks', actor: 'jane.doe@centific.com' }),
    gate.request({ action: 'getTasks', actor: 'jane.doe@centific.com' }),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.data, 'getTasks');
  assert.equal(b.data, 'getTasks');
  assert.equal(stableKey({ action: 'getTasks', actor: 'a', kitId: 1 }), stableKey({ kitId: 1, actor: 'a', action: 'getTasks' }));
});

test('a newer request on the same lane cancels the older one', async () => {
  const seen = [];
  const gate = createRequestGate({
    call(body, { signal }) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ ok: true, data: body.date }), 40);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    },
  });
  const first = gate.request({ action: 'getKits', actor: 'a', date: '2026-09-01' }, { lane: 'kits' });
  const second = gate.request({ action: 'getKits', actor: 'a', date: '2026-09-02' }, { lane: 'kits' });
  const [older, newer] = await Promise.all([first, second]);
  seen.push(older.code, newer.data);
  assert.equal(older.code, 'ABORTED');
  assert.equal(newer.data, '2026-09-02');
});

test('debug mode logs action and milliseconds', async () => {
  const lines = [];
  let clock = 0;
  const gate = createRequestGate({
    debug: true,
    log(line) { lines.push(line); },
    now() { clock += 25; return clock; },
    async call() { return { ok: true, data: [] }; },
  });
  await gate.request({ action: 'getHistory', actor: 'a', from: '2026-09-11', to: '2026-09-24' });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^getHistory \d+ms$/);
});

test('task saves batch into one flush', async () => {
  let runs = 0;
  const gate = createDebouncedFlush(30, () => { runs += 1; });
  gate.schedule();
  gate.schedule();
  gate.schedule();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(runs, 1);
  assert.equal(TASK_SAVE_WAIT_MS, 600);
});

test('practice mode can wait before each call', async () => {
  const api = createMockBackend(memoryStorage(), { latencyMs: 40 });
  const started = Date.now();
  const result = await api.call({ action: 'login', email: 'jane.doe@centific.com' });
  assert.equal(result.ok, true);
  assert.ok(Date.now() - started >= 35);
});
