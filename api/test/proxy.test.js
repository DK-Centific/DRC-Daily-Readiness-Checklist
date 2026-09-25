import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyWrite } from '../src/proxy.js';
import { route } from '../src/router.js';

const accessRows = [
  { id: 3, Email: 'admin-drc@centific.com', Title: 'admin-drc', Role: 'Admin', Active: true },
  { id: 4, Email: 'jane.doe@centific.com', Title: 'Jane Doe', Role: 'User', Active: true },
];

const routerUrl = 'https://example.invalid/router?sig=secret';

test('proxy passes through JSON status and body and adds CORS', async () => {
  const res = await proxyWrite({
    url: routerUrl,
    body: { action: 'checkIn', actor: 'jane.doe@centific.com', kitId: 4 },
    fetchImpl: async (url, init) => {
      assert.equal(url, routerUrl);
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(init.body), { action: 'checkIn', actor: 'jane.doe@centific.com', kitId: 4 });
      assert.ok(init.signal);
      return {
        status: 200,
        async text() {
          return JSON.stringify({ ok: false, error: 'This kit is already claimed.', code: 'KIT_CLAIMED' });
        },
      };
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(res.jsonBody.code, 'KIT_CLAIMED');
  assert.equal(JSON.stringify(res).includes('sig=secret'), false);
});

test('proxy passes through a JSON 500', async () => {
  const res = await proxyWrite({
    url: routerUrl,
    body: { action: 'checkOut', actor: 'jane.doe@centific.com' },
    fetchImpl: async () => ({
      status: 500,
      async text() { return JSON.stringify({ ok: false, error: 'flow failed', code: 'BACKEND' }); },
    }),
  });
  assert.equal(res.status, 500);
  assert.deepEqual(res.jsonBody, { ok: false, error: 'flow failed', code: 'BACKEND' });
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});

test('network errors become BACKEND without the upstream message', async () => {
  const res = await proxyWrite({
    url: routerUrl,
    body: { action: 'updateTasks', actor: 'jane.doe@centific.com' },
    fetchImpl: async () => {
      throw new Error('connect ECONNREFUSED sig=secret');
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.jsonBody, { ok: false, error: 'Upstream unavailable', code: 'BACKEND' });
});

test('missing router URL does not call fetch', async () => {
  let called = false;
  const res = await proxyWrite({
    url: '',
    body: { action: 'checkIn', actor: 'jane.doe@centific.com' },
    fetchImpl: async () => { called = true; },
  });
  assert.equal(called, false);
  assert.equal(res.jsonBody.code, 'BACKEND');
  assert.equal(res.jsonBody.error, 'Upstream unavailable');
});

test('checkIn is proxied only after an active actor is resolved', async () => {
  let called = false;
  const blocked = await route({ action: 'checkIn', actor: 'nobody@centific.com', kitId: 1 }, {
    accessRows,
    settings: { paRouterUrl: routerUrl },
    fetchImpl: async () => { called = true; },
  });
  assert.equal(called, false);
  assert.equal(blocked.jsonBody.code, 'NO_ACCESS');

  const res = await route({
    action: 'checkIn',
    actor: 'Jane.Doe@centific.com',
    kitId: 1,
    date: '2026-09-24',
  }, {
    accessRows,
    settings: { paRouterUrl: routerUrl },
    fetchImpl: async (url, init) => {
      called = true;
      assert.equal(url, routerUrl);
      assert.equal(JSON.parse(init.body).actor, 'Jane.Doe@centific.com');
      return { status: 200, async text() { return JSON.stringify({ ok: true, data: { claimId: 8 } }); } };
    },
  });
  assert.equal(called, true);
  assert.equal(res.jsonBody.data.claimId, 8);
});

test('non-admin resetDay is FORBIDDEN and does not call Power Automate', async () => {
  let called = false;
  const res = await route({ action: 'resetDay', actor: 'jane.doe@centific.com', date: '2026-09-24' }, {
    accessRows,
    settings: { paRouterUrl: routerUrl },
    fetchImpl: async () => { called = true; },
  });
  assert.equal(called, false);
  assert.equal(res.jsonBody.code, 'FORBIDDEN');
});
