import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdminRole, isTaskVisible, roleLabel } from '../js/flow-shape.js';

test('admin role matches Admin regardless of case', () => {
  assert.equal(isAdminRole('Admin'), true);
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole(' ADMIN '), true);
  assert.equal(isAdminRole('User'), false);
  assert.equal(isAdminRole('user'), false);
  assert.equal(isAdminRole(''), false);
});

test('role labels stay Admin or Staff', () => {
  assert.equal(roleLabel('admin'), 'Admin');
  assert.equal(roleLabel('USER'), 'Staff');
  assert.equal(roleLabel('Staff'), 'Staff');
});

test('tasks stay visible unless Active is explicitly false', () => {
  assert.equal(isTaskVisible({ title: 'Check hardware status' }), true);
  assert.equal(isTaskVisible({ active: true }), true);
  assert.equal(isTaskVisible({ Active: true }), true);
  assert.equal(isTaskVisible({ Active: 'Yes' }), true);
  assert.equal(isTaskVisible({ active: false }), false);
  assert.equal(isTaskVisible({ Active: false }), false);
  assert.equal(isTaskVisible({ active: 'false' }), false);
  assert.equal(isTaskVisible({ Active: 'No' }), false);
});
