import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLegacyConfigJs, parseLocalConfig } from '../js/config-load.js';

const root = fileURLToPath(new URL('..', import.meta.url));

test('build writes JSON config and copies header rules', () => {
  const dist = join(root, 'dist');
  rmSync(dist, { recursive: true, force: true });
  const flow = 'https://example.environment.api.powerplatform.com/invoke?sig=test-value';
  const withFlow = spawnSync('bash', ['scripts/build.sh'], {
    cwd: root,
    env: { ...process.env, DRC_FLOW_URL: flow },
    encoding: 'utf8',
  });
  assert.equal(withFlow.status, 0, withFlow.stderr || withFlow.stdout);
  const written = readFileSync(join(dist, 'config.local.json'), 'utf8');
  assert.deepEqual(parseLocalConfig(written), { backend: 'pa', FLOW_URL: flow });
  assert.equal(existsSync(join(dist, 'config.local.js')), false);
  assert.match(readFileSync(join(dist, '_headers'), 'utf8'), /private, no-store/);
  assert.match(readFileSync(join(dist, 'index.html'), 'utf8'), /config\.local\.json|Content-Security-Policy/);

  rmSync(dist, { recursive: true, force: true });
  const practice = spawnSync('bash', ['scripts/build.sh'], {
    cwd: root,
    env: { ...process.env, DRC_FLOW_URL: '' },
    encoding: 'utf8',
  });
  assert.equal(practice.status, 0, practice.stderr || practice.stdout);
  assert.equal(existsSync(join(dist, 'config.local.json')), false);
  assert.equal(existsSync(join(dist, 'config.local.js')), false);
  rmSync(dist, { recursive: true, force: true });
});

test('legacy config file round-trips through the strict reader', () => {
  const flow = 'https://example.environment.api.powerplatform.com/invoke?sig=abc"quoted';
  const js = `window.DRC_CONFIG = { backend: 'pa', FLOW_URL: ${JSON.stringify(flow)} };\n`;
  assert.deepEqual(parseLegacyConfigJs(js), { backend: 'pa', FLOW_URL: flow });
});
