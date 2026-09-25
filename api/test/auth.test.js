import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdmin, resolveActor } from '../src/auth.js';

const rows = [
  { Email: 'admin-drc@centific.com', Title: 'admin-drc', Role: 'Admin', Active: true },
  { Email: 'jane.doe@centific.com', Title: 'Jane Doe', FirstName: 'Jane', LastName: 'Doe', Role: 'User', Active: true },
  { Email: 'gone@centific.com', Title: 'Gone', Role: 'User', Active: false },
  { Email: 'choice@centific.com', Title: 'Choice User', Role: { Value: 'User' }, Active: 'No' },
  { Email: 'blank-active@centific.com', Title: 'Blank Active', Role: 'User', Active: null },
];

test('resolves active user', () => {
  const a = resolveActor(rows, 'Jane.Doe@centific.com');
  assert.equal(a.email, 'jane.doe@centific.com');
  assert.equal(a.role, 'User');
  assert.equal(a.name, 'Jane Doe');
  assert.equal(a.firstName, 'Jane');
  assert.equal(a.lastName, 'Doe');
  assert.equal(a.active, true);
});

test('maps bare admin-drc onto the canonical admin row', () => {
  const a = resolveActor(rows, 'admin-drc');
  assert.equal(a.email, 'admin-drc@centific.com');
  assert.equal(a.role, 'Admin');
  assert.equal(a.name, 'admin-drc');
});

test('rejects inactive', () => {
  assert.equal(resolveActor(rows, 'gone@centific.com'), null);
  assert.equal(resolveActor(rows, 'choice@centific.com'), null);
});

test('null Active passes (Active ne false)', () => {
  const a = resolveActor(rows, 'blank-active@centific.com');
  assert.equal(a.email, 'blank-active@centific.com');
});

test('unknown email is null', () => {
  assert.equal(resolveActor(rows, 'nobody@centific.com'), null);
  assert.equal(resolveActor(rows, '  '), null);
});

test('isAdmin', () => {
  assert.equal(isAdmin({ role: 'Admin' }), true);
  assert.equal(isAdmin({ role: 'admin' }), true);
  assert.equal(isAdmin({ role: 'User' }), false);
  assert.equal(isAdmin(null), false);
});
