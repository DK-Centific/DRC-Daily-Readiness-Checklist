/**
 * Today-view kit progress, read-only admin checklist, and checkout status copy.
 */

import { coerceCompletedTaskIds } from './flow-shape.js';
import { groupTasks, taskHint } from './task-groups.js';

/** Status shown after a kit is checked out. The Check out button stays the verb. */
export const CHECKOUT_STATUS_LABEL = 'Kit ready to deploy';

/** Same words as the day summary row for a short checkout. */
export const INCOMPLETE_CHECKOUT_LABEL = 'Incomplete checkout';

/** Status on a kit someone else has claimed today. */
export const IN_PROGRESS_STATUS = 'In progress';

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

/** Tile label for a short checkout. Fraction is omitted when the day has no task total. */
export function incompleteCheckoutBadge(done, total) {
  const fraction = Number(total) > 0 ? ` · ${done}/${total}` : '';
  return `${INCOMPLETE_CHECKOUT_LABEL}${fraction}`;
}

/**
 * Finished state for one kit on the selected day.
 * Day summary counts the same history outcome (complete / incomplete).
 * lastCheckedOut covers getKits and the moment right after checkout, before
 * that day's history has loaded. Once history is loaded it wins, including
 * a reset that removed the checkout row. An open claim wins over both.
 */
export function kitFinish({ claim, lastCheckedOut, outcome, historyLoaded = false } = {}) {
  if (claim) return null;
  if (outcome?.kind === 'complete' || outcome?.kind === 'incomplete') {
    return {
      kind: outcome.kind,
      checkOutAt: outcome.checkOutAt || '',
      userName: outcome.userName || '',
      userEmail: outcome.userEmail || '',
      tasksCompleted: outcome.tasksCompleted,
      tasksTotal: outcome.tasksTotal,
    };
  }
  if (historyLoaded) return null;
  if (!lastCheckedOut) return null;
  const done = Number(lastCheckedOut.tasksCompleted);
  const total = Number(lastCheckedOut.tasksTotal);
  const incomplete = Number.isFinite(done) && Number.isFinite(total) && total > 0 && done < total;
  return {
    kind: incomplete ? 'incomplete' : 'complete',
    checkOutAt: lastCheckedOut.checkOutAt || '',
    userName: lastCheckedOut.userName || '',
    userEmail: lastCheckedOut.userEmail || '',
    tasksCompleted: Number.isFinite(done) ? done : undefined,
    tasksTotal: Number.isFinite(total) ? total : undefined,
  };
}

/** A checked-out kit with no open claim stays locked until an admin reset. */
export function kitStaysReady(input = {}) {
  return Boolean(kitFinish(input));
}

export function todayKitBadge({ claim, viewerEmail, lastCheckedOut, outcome, historyLoaded = false } = {}) {
  if (claim && claim.userEmail === viewerEmail) {
    return { badgeClass: 'badge-yours', label: 'Yours', claimable: false, locked: false };
  }
  if (claim) {
    return { badgeClass: 'badge-locked', label: inProgressStatus(claim.userName || claim.userEmail), claimable: false, locked: true };
  }
  const finish = kitFinish({ claim: null, lastCheckedOut, outcome, historyLoaded });
  if (finish?.kind === 'incomplete') {
    const done = Number.isFinite(Number(finish.tasksCompleted)) ? Number(finish.tasksCompleted) : 0;
    const total = Number.isFinite(Number(finish.tasksTotal)) ? Number(finish.tasksTotal) : 0;
    return { badgeClass: 'badge-amber', label: incompleteCheckoutBadge(done, total), claimable: false, locked: true };
  }
  if (finish) {
    return { badgeClass: 'badge-sage', label: CHECKOUT_STATUS_LABEL, claimable: false, locked: true };
  }
  return { badgeClass: 'badge-available', label: 'Available', claimable: true, locked: false };
}

/** Optional note on an incomplete checkout. Hidden when every task is done. */
export function renderCheckoutNoteField({ show = false, value = '' } = {}) {
  if (!show) return '';
  return `
    <div class="field checkout-note-field">
      <label for="checkout-note">Note</label>
      <textarea id="checkout-note" name="notes" placeholder="What was wrong?">${esc(value)}</textarea>
    </div>`;
}

/** checkOut body. Send notes only, and only when staff typed one. Never send incompleteReason. */
export function checkOutParams({ claimId, completedTaskIds, tasksTotal, notes } = {}) {
  const body = {
    claimId,
    completedTaskIds,
    tasksTotal,
  };
  const note = String(notes ?? '').trim();
  if (note) body.notes = note;
  return body;
}

export function checkoutReadyMessage(kitName) {
  return `${kitName} is ready to deploy.`;
}

/**
 * Copy under the tile and in the empty checklist area.
 * A finished kit must not say it had no check-in today.
 */
export function kitStatusCopy({ claim, viewerEmail, finish, tasksTotal = 18 } = {}) {
  if (claim && claim.userEmail === viewerEmail) {
    return {
      meta: 'Checked in by you',
      previewTitle: 'Yours',
      previewBody: '',
    };
  }
  if (claim) {
    const label = inProgressStatus(claim.userName || claim.userEmail);
    return {
      meta: label,
      previewTitle: label,
      previewBody: 'Tasks stay with the person who has this kit checked in.',
    };
  }
  if (finish?.kind === 'incomplete') {
    return {
      meta: 'Incomplete checkout. Locked until an admin resets it.',
      previewTitle: INCOMPLETE_CHECKOUT_LABEL,
      previewBody: 'This kit stays locked until an admin resets it for this date.',
    };
  }
  if (finish) {
    return {
      meta: 'Kit ready to deploy. Locked until an admin resets it.',
      previewTitle: CHECKOUT_STATUS_LABEL,
      previewBody: 'This kit stays locked until an admin resets it for this date.',
    };
  }
  const total = Number(tasksTotal) || 18;
  return {
    meta: 'No check-in today',
    previewTitle: `Check in to start ${total} tasks`,
    previewBody: 'Camera, power & batteries, cables & mounts, network, kit contents',
  };
}

/** Claim-status label. Keeps the person's name when the tile already shows one. */
export function inProgressStatus(name) {
  const who = String(name ?? '').trim();
  if (!who) return IN_PROGRESS_STATUS;
  return `${IN_PROGRESS_STATUS} · ${who}`;
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
