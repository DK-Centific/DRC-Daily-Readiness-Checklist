/**
 * Today-view kit progress, read-only admin checklist, and checkout status copy.
 */

import { coerceCompletedTaskIds } from './flow-shape.js';
import { groupTasks, taskHint } from './task-groups.js';

/** Status shown after a kit is checked out. The Check out button stays the verb. */
export const CHECKOUT_STATUS_LABEL = 'Kit ready to deploy';

/** Same fallback renderTasks uses when the live task list is not loaded yet. */
export const TASK_TOTAL_FALLBACK = 18;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function checkoutStatusLabel(extra = '') {
  return extra ? `${CHECKOUT_STATUS_LABEL}${extra}` : CHECKOUT_STATUS_LABEL;
}

/** Past-day tile badge. Fraction is omitted when the day has no task total. */
export function pastCheckoutBadge(done, total) {
  const fraction = total > 0 ? ` · ${done}/${total}` : '';
  return checkoutStatusLabel(fraction);
}

export function checkoutReadyMessage(kitName) {
  return `${kitName} is ready to deploy. The kit is free for this date.`;
}

/**
 * done = completedTaskIds that match the live task list.
 * total = tasks.length, or 18 when that list is still empty.
 */
export function countClaimProgress(completedTaskIds, tasks) {
  const ids = coerceCompletedTaskIds(completedTaskIds);
  const doneIds = new Set(Array.isArray(ids) ? ids : []);
  const list = Array.isArray(tasks) ? tasks : [];
  const done = list.filter((task) => doneIds.has(task.id)).length;
  const total = list.length || TASK_TOTAL_FALLBACK;
  return { done, total, label: `${done}/${total}` };
}

/**
 * Admin-only {done}/{total} for an open claim on today's kit tile.
 * Staff never get this string, including on a locked tile.
 */
export function tileProgressLabel({ roleIsAdmin, claim, tasks }) {
  if (!roleIsAdmin || !claim) return '';
  return countClaimProgress(claim.completedTaskIds, tasks).label;
}

export function readOnlyChecklistNote(name) {
  const who = name || 'this person';
  return `Viewing ${who}'s checklist (read-only).`;
}

export function renderTaskGroups({
  tasks,
  completedTaskIds,
  readOnly = false,
  groupManual = {},
  statusHtml = () => '',
}) {
  const ids = coerceCompletedTaskIds(completedTaskIds);
  const done = new Set(Array.isArray(ids) ? ids : []);
  return groupTasks(tasks).map((group) => {
    const completed = group.tasks.filter((task) => done.has(task.id)).length;
    const total = group.tasks.length;
    const complete = completed === total;
    const manual = groupManual[group.id];
    const collapsed = manual === 'open' ? false : manual === 'closed' ? true : complete;
    const rows = group.tasks.map((task) => {
      const on = done.has(task.id);
      const hint = taskHint(task.title);
      const status = readOnly ? '' : statusHtml(task.id);
      return `
        <li class="task-row ${on ? 'done' : ''}">
          <input class="task-check" id="task-${task.id}" data-task-id="${task.id}" type="checkbox" ${on ? 'checked' : ''}${readOnly ? ' disabled' : ''} aria-labelledby="task-label-${task.id}">
          <div class="task-body">
            <label class="task-name" id="task-label-${task.id}" for="task-${task.id}">${esc(task.title)}</label>
            ${hint ? `<p class="task-hint">${esc(hint)}</p>` : ''}
          </div>
          ${status}
        </li>`;
    }).join('');
    return `
      <div class="task-group ${complete ? 'complete' : ''} ${collapsed ? 'collapsed' : ''}">
        <button type="button" class="task-group-head" data-action="toggle-group" data-group="${group.id}" aria-expanded="${collapsed ? 'false' : 'true'}">
          ${complete ? '<span class="group-check" aria-hidden="true">✓</span>' : ''}
          <span class="section">${esc(group.label)}</span>
          <span class="group-count tabular">${completed}/${total}</span>
          <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <ul class="task-list">${rows}</ul>
      </div>`;
  }).join('');
}

/** Admin mirror of someone else's open claim. Checks come from that claim; boxes stay disabled. */
export function renderAdminChecklistMirror({
  tasks,
  completedTaskIds,
  viewerName,
  groupManual = {},
}) {
  const note = readOnlyChecklistNote(viewerName);
  const blocks = renderTaskGroups({
    tasks,
    completedTaskIds,
    readOnly: true,
    groupManual,
  });
  return `<div class="checklist-readonly"><p class="note-readonly">${esc(note)}</p>${blocks}</div>`;
}
