import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coerceCompletedTaskIds, coerceRecordId, isAdminRole, isTaskVisible, normalizeHistoryRows, normalizeKitClaims, openClaimNeedsTaskHydrate, roleLabel } from '../js/flow-shape.js';
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
  const pascal = normalizeHistoryRows([{ ClaimId: 3, Date: '2026-09-23', KitID: 2, KitName: 'Team 1' }]);
  assert.equal(pascal[0].id, 3);
  assert.equal(pascal[0].claimDate, '2026-09-23');
  assert.equal(pascal[0].kitId, 2);
  assert.equal(pascal[0].kitName, 'Team 1');
  const lookup = normalizeHistoryRows([{
    claimId: 8,
    date: '2026-09-26',
    KitID: { LookupId: 1, LookupValue: 'Kit 01' },
    KitName: 'Kit 01',
    checkOutAt: '2026-09-26T18:00:00.000Z',
    tasksCompleted: 18,
    tasksTotal: 18,
    status: 'CheckedOut',
  }]);
  assert.equal(lookup[0].kitId, 1);
  assert.equal(coerceRecordId({ LookupId: '4' }), 4);
  assert.equal(normalizeHistoryRows(null), null);
  assert.deepEqual(normalizeHistoryRows([{ id: 4, claimDate: '2026-09-24' }]), [{ id: 4, claimDate: '2026-09-24', notes: '' }]);
});

test('history notes come from notes, or CheckoutNotes when notes is missing', () => {
  const named = normalizeHistoryRows([{ id: 1, notes: '  Lens cracked  ' }]);
  assert.equal(named[0].notes, 'Lens cracked');
  const column = normalizeHistoryRows([{ id: 2, CheckoutNotes: 'Camera mount was loose' }]);
  assert.equal(column[0].notes, 'Camera mount was loose');
  const blank = normalizeHistoryRows([{ id: 3, notes: '', CheckoutNotes: 'saved column' }]);
  assert.equal(blank[0].notes, '');
  const missing = normalizeHistoryRows([{ id: 5, notes: null, CheckoutNotes: 'From the column' }]);
  assert.equal(missing[0].notes, 'From the column');
  const events = historyEvents([{ id: 2, checkOutAt: '2026-09-26T18:00:00.000Z', status: 'CheckedOut', CheckoutNotes: 'Camera mount was loose' }]);
  assert.equal(events.find((event) => event.kind === 'unclaimed').notes, 'Camera mount was loose');
});

test('stringified completedTaskIds become a real array', () => {
  assert.deepEqual(coerceCompletedTaskIds('[1, 3]'), [1, 3]);
  assert.deepEqual(coerceCompletedTaskIds('["1","3"]'), [1, 3]);
  assert.deepEqual(coerceCompletedTaskIds('"[1, 3]"'), [1, 3]);
  assert.deepEqual(coerceCompletedTaskIds([1, 3]), [1, 3]);
  assert.equal(coerceCompletedTaskIds('not-json'), 'not-json');
  assert.equal(coerceCompletedTaskIds(null), null);
  const kits = normalizeKitClaims([
    { id: 1, name: 'Kit 01', claim: { claimId: 10, userEmail: 'jane.doe@centific.com', completedTaskIds: '[1, 3]' } },
    { id: 2, name: 'Kit 02', claim: { claimId: 11, userEmail: 'jane.doe@centific.com', CompletedTaskIDs: '["2"]' } },
    { id: 3, name: 'Kit 03', claim: { claimId: 12, userEmail: 'jane.doe@centific.com' } },
    { id: 4, name: 'Kit 04', claim: null },
  ]);
  assert.deepEqual(kits[0].claim.completedTaskIds, [1, 3]);
  assert.equal(Array.isArray(kits[0].claim.completedTaskIds), true);
  assert.deepEqual(kits[1].claim.completedTaskIds, [2]);
  assert.equal(Array.isArray(kits[2].claim.completedTaskIds), false);
  assert.equal(kits[3].claim, null);
  const rows = normalizeHistoryRows([{ claimId: 10, date: '2026-09-24', completedTaskIds: '[1, 3]' }]);
  assert.deepEqual(rows[0].completedTaskIds, [1, 3]);
});

test('a live getKits array is kept and does not need history', () => {
  const kits = normalizeKitClaims([{
    id: 1,
    name: 'Kit 01',
    claim: {
      claimId: 28,
      userEmail: 'jane.doe@centific.com',
      userName: 'Jane Doe',
      checkInAt: '2026-09-24T15:06:00.000Z',
      status: 'Claimed',
      completedTaskIds: [1, 2],
    },
  }]);
  assert.deepEqual(kits[0].claim.completedTaskIds, [1, 2]);
  assert.equal(openClaimNeedsTaskHydrate(kits[0].claim), false);
  assert.equal(openClaimNeedsTaskHydrate({ claimId: 28, status: 'Claimed' }), true);
  assert.equal(openClaimNeedsTaskHydrate({ claimId: 28, completedTaskIds: '[1, 2]' }), false);
  assert.equal(openClaimNeedsTaskHydrate(null), false);
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
