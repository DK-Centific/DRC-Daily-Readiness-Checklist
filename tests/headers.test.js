import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CACHE_CONTROL_NO_STORE,
  CONTENT_SECURITY_POLICY,
  CONTENT_SECURITY_POLICY_META,
} from '../js/security-headers.js';

const root = new URL('..', import.meta.url);

function read(name) {
  return readFileSync(new URL(name, root), 'utf8');
}

test('render.yaml, _headers, and the page agree on the security policy', () => {
  const yaml = read('render.yaml');
  const headers = read('_headers');
  const html = read('index.html');
  for (const file of [yaml, headers]) {
    assert.ok(file.includes(CONTENT_SECURITY_POLICY), 'missing content security policy');
  }
  assert.ok(html.includes(CONTENT_SECURITY_POLICY_META), 'missing meta content security policy');
  assert.equal(html.includes('frame-ancestors'), false);
  assert.match(yaml, /X-Frame-Options/);
  assert.match(yaml, /SAMEORIGIN/);
  assert.match(yaml, /Referrer-Policy/);
  assert.match(yaml, /no-referrer/);
  assert.match(yaml, /X-Content-Type-Options/);
  assert.match(yaml, /nosniff/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  for (const path of ['/', '/index.html', '/config.local.json', '/config.local.js']) {
    assert.ok(yaml.includes(`path: ${path}`), path);
    assert.ok(headers.includes(path === '/' ? '\n/\n' : path), path);
  }
  assert.equal(CACHE_CONTROL_NO_STORE, 'private, no-store');
  const named = (header) => yaml.split('\n').filter((line) => line.trim() === `name: ${header}`).length;
  assert.equal(named('Cache-Control'), 4);
  assert.equal(named('CDN-Cache-Control'), 4);
  assert.equal(yaml.includes('no-cache'), false);
  assert.equal(yaml.split(`value: ${CACHE_CONTROL_NO_STORE}`).length - 1, 4);
  assert.match(headers, /X-Frame-Options: SAMEORIGIN/);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /CDN-Cache-Control: no-store/);
});
