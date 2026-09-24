import test from 'node:test';
import assert from 'node:assert/strict';
import { toastKindClass } from '../js/toast-kind.js';

test('toast kinds are limited to ok, error, and slow', () => {
  assert.equal(toastKindClass('ok'), 'ok');
  assert.equal(toastKindClass('error'), 'error');
  assert.equal(toastKindClass('ERROR'), 'error');
  assert.equal(toastKindClass('slow'), 'slow');
  assert.equal(toastKindClass('err'), '');
  assert.equal(toastKindClass('ok" onclick="alert(1)'), '');
  assert.equal(toastKindClass('<img>'), '');
  assert.equal(toastKindClass(null), '');
});
