import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECKOUT_STATUS_LABEL,
  checkoutReadyMessage,
  inProgressStatus,
  pastCheckoutBadge,
  renderAdminChecklistMirror,
  renderTaskGroups,
  tileProgressLabel,
  todayKitBadge,
} from '../js/checklist-view.js';

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
  assert.equal(checkoutReadyMessage('Kit 01'), 'Kit 01 is ready to deploy. The kit is free for this date.');
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
  assert.equal(finished.label.includes('/'), false);

  const idle = todayKitBadge({
    claim: null,
    viewerEmail: 'jane.doe@centific.com',
    lastCheckedOut: null,
  });
  assert.equal(idle.badgeClass, 'badge-available');
  assert.equal(idle.label, 'Available');

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
