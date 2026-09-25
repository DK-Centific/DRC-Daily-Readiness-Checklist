import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTaskRowVisible, mapLogin, mapTask } from '../src/shapes.js';

test('mapLogin returns the page fields and a plain role', () => {
  assert.deepEqual(mapLogin({
    email: 'admin-drc@centific.com',
    name: 'admin-drc',
    firstName: 'Admin',
    lastName: 'DRC',
    role: 'Admin',
  }), {
    email: 'admin-drc@centific.com',
    name: 'admin-drc',
    firstName: 'Admin',
    lastName: 'DRC',
    role: 'Admin',
  });
  assert.equal(mapLogin({ email: 'jane.doe@centific.com', name: 'Jane Doe', role: 'staff' }).role, 'User');
});

test('mapTask maps id, title, and order', () => {
  assert.deepEqual(mapTask({ id: 4, Title: 'Battery charging', TaskOrder: 2, Active: true }), {
    id: 4,
    title: 'Battery charging',
    order: 2,
  });
});

test('a task stays visible unless Active is explicitly false', () => {
  assert.equal(isTaskRowVisible({ Active: false }), false);
  assert.equal(isTaskRowVisible({ Active: 'No' }), false);
  assert.equal(isTaskRowVisible({ Active: 'false' }), false);
  assert.equal(isTaskRowVisible({ Active: null }), true);
  assert.equal(isTaskRowVisible({}), true);
  assert.equal(isTaskRowVisible({ Active: true }), true);
});
