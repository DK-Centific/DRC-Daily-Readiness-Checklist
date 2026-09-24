import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyEvents, unclaimActor } from '../js/history-events.js';

test('an unclaim with no checkout person falls back to the person who claimed the kit', () => {
  const actor = unclaimActor({
    userName: 'Jane Doe',
    userEmail: 'jane.doe@centific.com',
    checkedOutByName: '',
    checkedOutByEmail: '',
  });
  assert.deepEqual(actor, { name: 'Jane Doe', email: 'jane.doe@centific.com' });
});

test('an older checkout row with no checkout person falls back to the claimant', () => {
  const actor = unclaimActor({
    userName: 'Jane Doe',
    userEmail: 'jane.doe@centific.com',
    status: 'CheckedOut',
  });
  assert.deepEqual(actor, { name: 'Jane Doe', email: 'jane.doe@centific.com' });
  const pascal = unclaimActor({
    userName: 'Jane Doe',
    userEmail: 'jane.doe@centific.com',
    CheckedOutByName: 'Brian Leong',
    CheckedOutByEmail: 'brian.leong@centific.com',
  });
  assert.equal(pascal.email, 'brian.leong@centific.com');
});

test('an admin unclaim keeps the admin as the person who released the kit', () => {
  const actor = unclaimActor({
    userName: 'Jane Doe',
    userEmail: 'jane.doe@centific.com',
    checkedOutByName: 'Brian Leong',
    checkedOutByEmail: 'brian.leong@centific.com',
  });
  assert.equal(actor.name, 'Brian Leong');
  assert.equal(actor.email, 'brian.leong@centific.com');
});

test('history events list the newest action first and include both people', () => {
  const events = historyEvents([
    {
      id: 1,
      kitName: 'Kit 01',
      claimDate: '2026-09-24',
      userName: 'Jane Doe',
      userEmail: 'jane.doe@centific.com',
      checkInAt: '2026-09-24T15:00:00.000Z',
      checkOutAt: '2026-09-24T20:00:00.000Z',
      status: 'CheckedOut',
      checkedOutByName: 'Brian Leong',
      checkedOutByEmail: 'brian.leong@centific.com',
      tasksCompleted: 2,
      tasksTotal: 4,
    },
    {
      id: 2,
      kitName: 'Kit 02',
      claimDate: '2026-09-24',
      userName: 'Brian Leong',
      userEmail: 'brian.leong@centific.com',
      checkInAt: '2026-09-24T18:00:00.000Z',
      checkOutAt: null,
      status: 'Claimed',
      tasksCompleted: 0,
      tasksTotal: 4,
    },
  ]);
  assert.deepEqual(events.map((event) => `${event.kind}:${event.kitName}:${event.email}`), [
    'unclaimed:Kit 01:brian.leong@centific.com',
    'claimed:Kit 02:brian.leong@centific.com',
    'claimed:Kit 01:jane.doe@centific.com',
  ]);
  assert.equal(events[0].tasksCompleted, 2);
  assert.equal(events[0].tasksTotal, 4);
  assert.equal(events[2].name, 'Jane Doe');
});
