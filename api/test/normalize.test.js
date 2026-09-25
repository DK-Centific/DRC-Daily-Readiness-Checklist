import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corsHeaders, fail, normalizeEmail, ok } from '../src/normalize.js';

test('trims and lowercases', () => {
  assert.equal(normalizeEmail(' Jane.Doe@Centific.com '), 'jane.doe@centific.com');
});

test('maps bare admin-drc', () => {
  assert.equal(normalizeEmail('admin-drc'), 'admin-drc@centific.com');
});

test('maps Admin-DRC@centific.com', () => {
  assert.equal(normalizeEmail('Admin-DRC@centific.com'), 'admin-drc@centific.com');
});

test('blank input is an empty string', () => {
  assert.equal(normalizeEmail('   '), '');
  assert.equal(normalizeEmail(null), '');
});

test('ok and fail keep HTTP 200 and CORS *', () => {
  const good = ok([{ id: 1 }]);
  assert.equal(good.status, 200);
  assert.equal(good.headers['Access-Control-Allow-Origin'], '*');
  assert.deepEqual(good.jsonBody, { ok: true, data: [{ id: 1 }] });

  const bad = fail('NO_ACCESS', "You don't have access. Ask a DRC admin.");
  assert.equal(bad.status, 200);
  assert.equal(bad.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(bad.headers['Content-Type'], 'application/json');
  assert.deepEqual(bad.jsonBody, {
    ok: false,
    error: "You don't have access. Ask a DRC admin.",
    code: 'NO_ACCESS',
  });
  assert.equal(corsHeaders()['Access-Control-Allow-Methods'], 'POST, OPTIONS');
});
