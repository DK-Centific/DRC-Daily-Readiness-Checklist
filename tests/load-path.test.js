import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, name);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('sign-in does not load Settings lists', () => {
  const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const enterApp = functionBody(source, 'enterApp');
  assert.equal(enterApp.includes('refreshAccess'), false);
  assert.equal(enterApp.includes('refreshKitList'), false);
  assert.equal(enterApp.includes('listAccess'), false);
  assert.equal(enterApp.includes('listKits'), false);
  assert.equal(enterApp.includes('refreshKits'), true);
  const setTab = functionBody(source, 'setTab');
  assert.equal(setTab.includes("tab === 'settings') refreshSettings()"), true);
});

test('calendar marks wait until the kit list has settled', () => {
  const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const schedule = functionBody(source, 'scheduleMonthMarks');
  assert.equal(schedule.includes('checklistReadyForMonthMarks'), true);
  assert.equal(schedule.indexOf('checklistReadyForMonthMarks') < schedule.indexOf('refreshMonthMarks'), true);
  const ranges = functionBody(source, 'monthRangesToLoad');
  assert.equal(ranges.includes('monthMarkTargets'), true);
});

test('history fills task ticks only when getKits left them off the open claim', () => {
  const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const refresh = functionBody(source, 'refreshKits');
  assert.equal(refresh.includes('openClaimNeedsTaskHydrate'), true);
  assert.equal(refresh.indexOf('openClaimNeedsTaskHydrate') < refresh.indexOf('hydrateTaskIds'), true);
  const hydrate = functionBody(source, 'hydrateTaskIds');
  assert.equal(hydrate.includes("action: 'getHistory'") || hydrate.includes("apiCall('getHistory'"), true);
  assert.equal(hydrate.includes('openClaimNeedsTaskHydrate'), true);
});

test('task saves stay on the existing debounce', () => {
  const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(source, /createDebouncedFlush\(TASK_SAVE_WAIT_MS/);
});
