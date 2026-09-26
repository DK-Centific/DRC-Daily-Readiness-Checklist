import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyEventVerb, historyEvents, rowMatchesFilters, unclaimActor } from '../js/history-events.js';
import { normalizeHistoryRows } from '../js/flow-shape.js';
import { activityFromRows } from '../js/calendar-view.js';

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

test('a live history row for today stays in History after normalize', () => {
  const today = '2026-09-23';
  const live = {
    claimId: 14,
    date: today,
    userEmail: 'jane.doe@centific.com',
    kitId: 1,
    kitName: 'Team 1',
    checkInAt: '2026-09-23T15:00:00.000Z',
    status: 'Claimed',
  };
  assert.equal(rowMatchesFilters(live, { from: today, to: today }), false);
  const [row] = normalizeHistoryRows([live]);
  assert.equal(row.id, 14);
  assert.equal(row.claimDate, today);
  assert.equal(rowMatchesFilters(row, { from: today, to: today }), true);
  const events = historyEvents([live]);
  assert.equal(events[0].kind, 'claimed');
  assert.equal(events[0].id, '14-claimed');
  assert.equal(events[0].claimDate, today);
  assert.equal(events[0].kitName, 'Team 1');
  assert.equal(activityFromRows([live])[today].open, 1);
});

test('a checked-out history line says completed', () => {
  assert.equal(historyEventVerb('claimed'), 'claimed');
  assert.equal(historyEventVerb('unclaimed'), 'completed');
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
    },
  ]);
  const finished = events.find((event) => event.kind === 'unclaimed');
  assert.equal(finished.label, 'completed');
  assert.equal(finished.label.includes('unclaimed'), false);
  const opened = events.find((event) => event.kind === 'claimed');
  assert.equal(opened.label, 'claimed');
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
