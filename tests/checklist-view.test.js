import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECKOUT_STATUS_LABEL,
  INCOMPLETE_CHECKOUT_LABEL,
  checkOutParams,
  checkoutReadyMessage,
  inProgressStatus,
  incompleteCheckoutBadge,
  kitFinish,
  kitStaysReady,
  pastCheckoutBadge,
  renderAdminChecklistMirror,
  renderCheckoutNoteField,
  renderTaskGroups,
  tileProgressLabel,
  todayKitBadge,
} from '../js/checklist-view.js';
import { activityFromRows, outcomeForKit, outcomeForTile } from '../js/calendar-view.js';
import { normalizeHistoryRows } from '../js/flow-shape.js';

function tasks(count = 18) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: index === 0 ? 'Clean camera lenses.' : `Pack item ${index + 1}`,
    order: index + 1,
  }));
}

test('admin locked-tile progress counts live tasks only', () => {
  const label = tileProgressLabel({
    roleIsAdmin: true,
    claim: { userEmail: 'jane.doe@centific.com', completedTaskIds: '[1, 2, 99]' },
    tasks: tasks(18),
  });
  assert.equal(label, '2/18');
});

test('admin progress uses 18 when tasks are not loaded yet', () => {
  assert.equal(tileProgressLabel({
    roleIsAdmin: true,
    claim: { completedTaskIds: [1, 2] },
    tasks: [],
  }), '0/18');
});

test('staff do not get progress on a locked tile', () => {
  assert.equal(tileProgressLabel({
    roleIsAdmin: false,
    claim: { userEmail: 'jane.doe@centific.com', completedTaskIds: [1, 2] },
    tasks: tasks(18),
  }), '');
  assert.equal(tileProgressLabel({
    roleIsAdmin: true,
    claim: null,
    tasks: tasks(18),
  }), '');
});

test('admin read-only checklist mirrors the other person and disables checks', () => {
  const html = renderAdminChecklistMirror({
    tasks: tasks(2),
    completedTaskIds: '[1]',
    viewerName: 'Jane Doe',
  });
  assert.match(html, /Viewing Jane Doe&#39;s checklist \(read-only\)\./);
  assert.match(html, /id="task-1"[^>]*checked[^>]*disabled/);
  assert.match(html, /id="task-2"(?![^>]*checked)[^>]*disabled/);
  assert.match(html, /Clean camera lenses\./);
  assert.equal(html.includes('data-action="retry-tasks"'), false);
});

test('the claimer checklist keeps checks enabled', () => {
  const html = renderTaskGroups({
    tasks: tasks(1),
    completedTaskIds: [1],
    readOnly: false,
  });
  assert.match(html, /id="task-1"[^>]*checked/);
  assert.equal(html.includes('disabled'), false);
});

test('a claimed kit says In progress and keeps the person name', () => {
  assert.equal(inProgressStatus('Jane Doe'), 'In progress · Jane Doe');
  assert.equal(inProgressStatus('jane.doe@centific.com'), 'In progress · jane.doe@centific.com');
  assert.equal(inProgressStatus(''), 'In progress');
  assert.equal(inProgressStatus('Jane Doe').includes('Locked'), false);
});

test('finished kit status says Kit ready to deploy', () => {
  assert.equal(CHECKOUT_STATUS_LABEL, 'Kit ready to deploy');
  assert.equal(pastCheckoutBadge(0, 0), 'Kit ready to deploy');
  assert.equal(pastCheckoutBadge(2, 18), 'Kit ready to deploy · 2/18');
  assert.equal(checkoutReadyMessage('Kit 01'), 'Kit 01 is ready to deploy.');
  assert.equal(checkoutReadyMessage('Kit 01').includes('free'), false);
  assert.equal(pastCheckoutBadge(2, 18).includes('Checked out'), false);
});

test('today tile says Kit ready to deploy after checkout', () => {
  const finished = todayKitBadge({
    claim: null,
    viewerEmail: 'jane.doe@centific.com',
    lastCheckedOut: {
      claimId: 10,
      userEmail: 'jane.doe@centific.com',
      userName: 'Jane Doe',
      checkOutAt: '2026-09-26T18:00:00.000Z',
    },
  });
  assert.equal(finished.badgeClass, 'badge-sage');
  assert.equal(finished.label, 'Kit ready to deploy');
  assert.equal(finished.locked, true);
  assert.equal(finished.claimable, false);
  assert.equal(finished.label.includes('/'), false);
  assert.equal(finished.badgeClass.includes('available'), false);

  const idle = todayKitBadge({
    claim: null,
    viewerEmail: 'jane.doe@centific.com',
    lastCheckedOut: null,
  });
  assert.equal(idle.badgeClass, 'badge-available');
  assert.equal(idle.label, 'Available');
  assert.equal(idle.locked, false);
  assert.equal(idle.claimable, true);

  const mine = todayKitBadge({
    claim: { userEmail: 'jane.doe@centific.com', userName: 'Jane Doe' },
    viewerEmail: 'jane.doe@centific.com',
    lastCheckedOut: { checkOutAt: '2026-09-26T17:00:00.000Z' },
  });
  assert.equal(mine.badgeClass, 'badge-yours');
  assert.equal(mine.label, 'Yours');

  const other = todayKitBadge({
    claim: { userEmail: 'alex@centific.com', userName: 'Alex Kim' },
    viewerEmail: 'jane.doe@centific.com',
    lastCheckedOut: null,
  });
  assert.equal(other.badgeClass, 'badge-locked');
  assert.equal(other.label, 'In progress · Alex Kim');
});

test('a completed kit stays ready and is not claimable until reset clears it', () => {
  const finished = {
    claim: null,
    lastCheckedOut: { checkOutAt: '2026-09-26T18:00:00.000Z', userName: 'Jane Doe' },
  };
  assert.equal(kitStaysReady(finished), true);
  assert.equal(kitStaysReady({ claim: null, lastCheckedOut: null }), false);
  assert.equal(kitStaysReady({
    claim: { userEmail: 'alex@centific.com' },
    lastCheckedOut: { checkOutAt: '2026-09-26T18:00:00.000Z' },
  }), false);
  const badge = todayKitBadge({
    claim: null,
    viewerEmail: 'jane.doe@centific.com',
    lastCheckedOut: finished.lastCheckedOut,
  });
  assert.equal(badge.label, 'Kit ready to deploy');
  assert.equal(badge.claimable, false);
});

test('today tile matches a day-summary checkout even when getKits omitted lastCheckedOut', () => {
  const rows = [
    {
      claimDate: '2026-09-26',
      kitId: 1,
      checkOutAt: '2026-09-26T18:00:00.000Z',
      tasksCompleted: 18,
      tasksTotal: 18,
      userName: 'Jane Doe',
      userEmail: 'jane.doe@centific.com',
    },
    {
      claimDate: '2026-09-26',
      kitId: 2,
      checkOutAt: '2026-09-26T19:00:00.000Z',
      tasksCompleted: 2,
      tasksTotal: 18,
      userName: 'Alex Kim',
    },
  ];
  assert.equal(activityFromRows(rows)['2026-09-26'].complete, 1);
  assert.equal(activityFromRows(rows)['2026-09-26'].incomplete, 1);

  const readyOutcome = outcomeForKit(rows, 1);
  const ready = kitFinish({ claim: null, lastCheckedOut: null, outcome: readyOutcome, historyLoaded: true });
  assert.equal(ready.kind, 'complete');
  const readyBadge = todayKitBadge({
    claim: null,
    viewerEmail: 'brian.leong@centific.com',
    lastCheckedOut: null,
    outcome: readyOutcome,
    historyLoaded: true,
  });
  assert.equal(readyBadge.label, CHECKOUT_STATUS_LABEL);
  assert.equal(readyBadge.badgeClass, 'badge-sage');
  assert.equal(readyBadge.locked, true);
  assert.equal(readyBadge.claimable, false);
  assert.equal(readyBadge.label.includes('Available'), false);
  assert.equal(kitStaysReady({ claim: null, lastCheckedOut: null, outcome: readyOutcome, historyLoaded: true }), true);

  const shortOutcome = outcomeForKit(rows, 2);
  const short = kitFinish({ claim: null, lastCheckedOut: null, outcome: shortOutcome, historyLoaded: true });
  assert.equal(short.kind, 'incomplete');
  const shortBadge = todayKitBadge({
    claim: null,
    viewerEmail: 'brian.leong@centific.com',
    lastCheckedOut: null,
    outcome: shortOutcome,
    historyLoaded: true,
  });
  assert.equal(shortBadge.label, incompleteCheckoutBadge(2, 18));
  assert.equal(shortBadge.label, `${INCOMPLETE_CHECKOUT_LABEL} · 2/18`);
  assert.equal(shortBadge.badgeClass, 'badge-amber');
  assert.equal(shortBadge.claimable, false);
  assert.equal(kitStaysReady({ claim: null, lastCheckedOut: null, outcome: shortOutcome, historyLoaded: true }), true);

  const idle = todayKitBadge({
    claim: null,
    viewerEmail: 'brian.leong@centific.com',
    lastCheckedOut: null,
    outcome: null,
    historyLoaded: true,
  });
  assert.equal(idle.label, 'Available');
  assert.equal(idle.locked, false);
});

test('a counted checkout locks the tile when KitID is a lookup or the kit name', () => {
  const lookupRows = normalizeHistoryRows([{
    claimId: 8,
    date: '2026-09-26',
    KitID: { LookupId: 1, LookupValue: 'Kit 01' },
    KitName: 'Kit 01',
    checkOutAt: '2026-09-26T18:00:00.000Z',
    tasksCompleted: 18,
    tasksTotal: 18,
    status: 'CheckedOut',
  }]);
  assert.equal(activityFromRows(lookupRows)['2026-09-26'].complete, 1);
  const lookupOutcome = outcomeForTile(lookupRows, { id: 1, name: 'Kit 01' });
  assert.equal(lookupOutcome.kind, 'complete');
  const lookupBadge = todayKitBadge({
    claim: null,
    viewerEmail: 'brian.leong@centific.com',
    lastCheckedOut: null,
    outcome: lookupOutcome,
    historyLoaded: true,
  });
  assert.equal(lookupBadge.label, 'Kit ready to deploy');
  assert.equal(lookupBadge.badgeClass, 'badge-sage');
  assert.equal(lookupBadge.locked, true);
  assert.equal(lookupBadge.claimable, false);

  const namedRows = [{
    claimDate: '2026-09-26',
    kitId: 'Kit 01',
    kitName: 'Kit 01',
    checkOutAt: '2026-09-26T18:00:00.000Z',
    tasksCompleted: 18,
    tasksTotal: 18,
  }];
  assert.equal(activityFromRows(namedRows)['2026-09-26'].complete, 1);
  assert.equal(outcomeForKit(namedRows, 4), null);
  const named = outcomeForTile(namedRows, { id: 4, name: 'Kit 01' });
  assert.equal(named.kind, 'complete');
  const namedBadge = todayKitBadge({
    claim: null,
    viewerEmail: 'brian.leong@centific.com',
    lastCheckedOut: null,
    outcome: named,
    historyLoaded: true,
  });
  assert.equal(namedBadge.label, CHECKOUT_STATUS_LABEL);
  assert.equal(namedBadge.locked, true);
  assert.equal(kitStaysReady({
    claim: null,
    lastCheckedOut: null,
    outcome: named,
    historyLoaded: true,
  }), true);
});

test('loaded history with no checkout clears a stale lastCheckedOut', () => {
  const stale = {
    claim: null,
    lastCheckedOut: { checkOutAt: '2026-09-26T18:00:00.000Z', userName: 'Jane Doe' },
    outcome: null,
    historyLoaded: true,
  };
  assert.equal(kitFinish(stale), null);
  assert.equal(kitStaysReady(stale), false);
  assert.equal(todayKitBadge({
    claim: null,
    viewerEmail: 'jane.doe@centific.com',
    lastCheckedOut: stale.lastCheckedOut,
    outcome: null,
    historyLoaded: true,
  }).label, 'Available');
});

test('incomplete checkout dialog has an optional note and complete checkout does not', () => {
  const incomplete = renderCheckoutNoteField({ show: true, value: 'Lens cracked' });
  assert.match(incomplete, /<label for="checkout-note">Note<\/label>/);
  assert.match(incomplete, /placeholder="What was wrong\?"/);
  assert.match(incomplete, />Lens cracked</);
  assert.equal(incomplete.includes('required'), false);
  assert.equal(renderCheckoutNoteField({ show: false, value: 'hidden' }), '');

  assert.deepEqual(checkOutParams({
    claimId: 10,
    completedTaskIds: [1],
    tasksTotal: 18,
    notes: '  Lens cracked  ',
  }), {
    claimId: 10,
    completedTaskIds: [1],
    tasksTotal: 18,
    notes: 'Lens cracked',
  });
  assert.equal('notes' in checkOutParams({
    claimId: 10,
    completedTaskIds: [1, 2],
    tasksTotal: 2,
    notes: '   ',
  }), false);
});
