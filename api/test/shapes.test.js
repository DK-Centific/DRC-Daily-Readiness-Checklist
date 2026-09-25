import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTaskRowVisible,
  joinKits,
  mapKitCatalog,
  mapLogin,
  mapTask,
  parseCompletedTaskIds,
} from '../src/shapes.js';

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

test('joinKits attaches the open claim and parses task ids', () => {
  const kits = [
    { id: 14, Title: 'Test Kit 23Sep', SortOrder: 1, Active: true },
    { id: 2, Title: 'Empty', SortOrder: 2, Active: true },
  ];
  const claims = [
    {
      id: 28,
      KitID: 14,
      UserEmail: 'jane.doe@centific.com',
      UserName: 'Jane Doe',
      CheckInAt: '2026-09-24T15:06:00.000Z',
      Status: 'Claimed',
      CompletedTaskIDs: '[1, 2]',
    },
  ];
  const joined = joinKits(kits, claims);
  assert.deepEqual(joined[0], {
    id: 14,
    name: 'Test Kit 23Sep',
    sortOrder: 1,
    claim: {
      claimId: 28,
      userEmail: 'jane.doe@centific.com',
      userName: 'Jane Doe',
      checkInAt: '2026-09-24T15:06:00.000Z',
      status: 'Claimed',
      completedTaskIds: [1, 2],
    },
  });
  assert.equal(joined[1].claim, null);
});

test('bad CompletedTaskIDs becomes an empty array', () => {
  assert.deepEqual(parseCompletedTaskIds('not-json'), []);
  assert.deepEqual(parseCompletedTaskIds(''), []);
  assert.deepEqual(parseCompletedTaskIds('{"a":1}'), []);
  assert.deepEqual(parseCompletedTaskIds(null), []);
  assert.deepEqual(parseCompletedTaskIds('[1, 2]'), [1, 2]);
});

test('listKits shape includes inactive kits and notes', () => {
  assert.deepEqual(mapKitCatalog({
    id: 5,
    Title: 'Old kit',
    Active: false,
    SortOrder: 3,
    Notes: 'spare',
  }), {
    id: 5,
    name: 'Old kit',
    active: false,
    sortOrder: 3,
    notes: 'spare',
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
