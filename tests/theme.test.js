import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChoice, resolveTheme, themeAttribute, THEME_KEY } from '../js/theme.js';

test('theme choice falls back to system', () => {
  assert.equal(normalizeChoice(undefined), 'system');
  assert.equal(normalizeChoice('Light'), 'light');
  assert.equal(normalizeChoice('DARK'), 'dark');
  assert.equal(normalizeChoice('sepia'), 'system');
});

test('system leaves the theme attribute unset', () => {
  assert.equal(THEME_KEY, 'drc_theme');
  assert.equal(themeAttribute('system'), null);
  assert.equal(themeAttribute('light'), 'light');
  assert.equal(themeAttribute('dark'), 'dark');
  assert.equal(themeAttribute('nope'), null);
});

test('system follows the OS, and an explicit choice does not', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('', true), 'dark');
});
