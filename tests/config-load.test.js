import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRuntimeConfig,
  parseLegacyConfigJs,
  parseLocalConfig,
  resolveBackend,
} from '../js/config-load.js';

test('parses config JSON and ignores extra keys', () => {
  const config = parseLocalConfig(`{
    "backend": "pa",
    "FLOW_URL": " https://example.environment.api.powerplatform.com/invoke?sig=abc ",
    "role": "Admin",
    "extra": "<script>alert(1)</script>"
  }`);
  assert.deepEqual(config, {
    backend: 'pa',
    FLOW_URL: 'https://example.environment.api.powerplatform.com/invoke?sig=abc',
  });
});

test('rejects executable config text', () => {
  assert.throws(() => parseLocalConfig('window.DRC_CONFIG = { backend: "pa", FLOW_URL: "" };'));
  assert.throws(() => parseLocalConfig('{"backend":"other","FLOW_URL":""}'));
  assert.throws(() => parseLocalConfig('["pa"]'));
  assert.throws(() => parseLegacyConfigJs('window.DRC_CONFIG = { backend: "pa", FLOW_URL: "" }; alert(1)'));
  assert.throws(() => parseLegacyConfigJs('new Function("alert(1)")()'));
});

test('reads a commented legacy config file without running it', () => {
  const parsed = parseLegacyConfigJs(`// local only
window.DRC_CONFIG = {
  backend: 'pa',
  FLOW_URL: '',
};
`);
  assert.deepEqual(parsed, { backend: 'pa', FLOW_URL: '' });
});

test('connected config ignores ?backend=mock', () => {
  assert.equal(resolveBackend('pa', new URLSearchParams('backend=mock')), 'pa');
  assert.equal(resolveBackend('pa', new URLSearchParams('backend=mock&debug=1')), 'pa');
  assert.equal(resolveBackend('pa', new URLSearchParams('backend=mock&backendOverride=1')), 'pa');
  assert.equal(resolveBackend('pa', new URLSearchParams('backend=pa')), 'pa');
  const merged = mergeRuntimeConfig({
    built: { backend: 'mock', FLOW_URL: '' },
    fileConfig: { backend: 'pa', FLOW_URL: 'https://example.test/flow' },
    searchParams: new URLSearchParams('backend=mock&latency=3000'),
  });
  assert.equal(merged.backend, 'pa');
  assert.equal(merged.FLOW_URL, 'https://example.test/flow');
  assert.equal(merged.latencyMs, 3000);
});

test('both debug flags allow a connected build to use practice data', () => {
  const params = new URLSearchParams('backend=mock&debug=1&backendOverride=1');
  assert.equal(resolveBackend('pa', params), 'mock');
  const merged = mergeRuntimeConfig({
    fileConfig: { backend: 'pa', FLOW_URL: 'https://example.test/flow' },
    searchParams: params,
  });
  assert.equal(merged.backend, 'mock');
  assert.equal(merged.debug, true);
});

test('practice config still honors the backend query', () => {
  assert.equal(resolveBackend('mock', new URLSearchParams('backend=pa')), 'pa');
  assert.equal(resolveBackend('mock', new URLSearchParams('backend=mock')), 'mock');
  assert.equal(resolveBackend('mock', new URLSearchParams('backend=evil')), 'mock');
  assert.equal(resolveBackend(undefined, new URLSearchParams('')), 'mock');
});
