import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdminRole, isTaskVisible, normalizeHistoryRows, roleLabel } from '../js/flow-shape.js';
import { activityFromRows } from '../js/calendar-view.js';
import { historyEvents } from '../js/history-events.js';

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

test('live history rows use claimDate and id', () => {
  const rows = normalizeHistoryRows([
    {
      claimId: 10,
      date: '2026-09-24',
      kitId: 1,
      kitName: 'Kit 01',
      userName: 'Jane Doe',
      userEmail: 'jane.doe@centific.com',
      checkInAt: '2026-09-24T15:00:00.000Z',
      checkOutAt: '2026-09-24T20:00:00.000Z',
      status: 'CheckedOut',
      tasksCompleted: 18,
      tasksTotal: 18,
    },
    {
      id: 2,
      claimId: 99,
      claimDate: '2026-09-23',
      date: '2026-01-01',
      kitId: 2,
      checkOutAt: '',
      checkInAt: '2026-09-23T16:00:00.000Z',
      tasksCompleted: 1,
      tasksTotal: 18,
    },
  ]);
  assert.equal(rows[0].id, 10);
  assert.equal(rows[0].claimDate, '2026-09-24');
  assert.equal(rows[0].claimId, 10);
  assert.equal(rows[0].date, '2026-09-24');
  assert.equal(rows[1].id, 2);
  assert.equal(rows[1].claimDate, '2026-09-23');
  assert.deepEqual(activityFromRows(rows)['2026-09-24'], { claimed: 1, complete: 1, incomplete: 0, open: 0 });
  assert.equal(activityFromRows(rows)['2026-09-23'].open, 1);
  const events = historyEvents(rows);
  assert.equal(events.some((event) => event.id === '10-claimed' && event.claimDate === '2026-09-24'), true);
  assert.equal(normalizeHistoryRows(null), null);
  assert.deepEqual(normalizeHistoryRows([{ id: 4, claimDate: '2026-09-24' }]), [{ id: 4, claimDate: '2026-09-24' }]);
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
