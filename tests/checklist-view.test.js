import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECKOUT_STATUS_LABEL,
  checkoutReadyMessage,
  pastCheckoutBadge,
  renderAdminChecklistMirror,
  renderTaskGroups,
  tileProgressLabel,
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

test('finished kit status says Kit ready to deploy', () => {
  assert.equal(CHECKOUT_STATUS_LABEL, 'Kit ready to deploy');
  assert.equal(pastCheckoutBadge(0, 0), 'Kit ready to deploy');
  assert.equal(pastCheckoutBadge(2, 18), 'Kit ready to deploy · 2/18');
  assert.equal(checkoutReadyMessage('Kit 01'), 'Kit 01 is ready to deploy. The kit is free for this date.');
  assert.equal(pastCheckoutBadge(2, 18).includes('Checked out'), false);
});
