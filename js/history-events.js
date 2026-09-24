/** Turn claim rows into a newest-first claimed / unclaimed log. */

import { normalizeHistoryRows } from './flow-shape.js';

function rowEmails(row) {
  return [row?.userEmail, row?.UserEmail, row?.checkedOutByEmail, row?.CheckedOutByEmail]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

/** Date filter uses claimDate. Normalize live rows before calling this. */
export function rowMatchesFilters(row, filters = {}) {
  const email = String(filters.userEmail || '').trim().toLowerCase();
  if (email && !rowEmails(row).includes(email)) return false;
  if (filters.kitId != null && filters.kitId !== '' && String(row?.kitId ?? '') !== String(filters.kitId)) return false;
  const claimDate = String(row?.claimDate || '');
  if (filters.from && claimDate < String(filters.from)) return false;
  if (filters.to && claimDate > String(filters.to)) return false;
  return true;
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function pick(row, camel, pascal) {
  if (!row) return '';
  if (row[camel] != null && text(row[camel])) return text(row[camel]);
  if (row[pascal] != null && text(row[pascal])) return text(row[pascal]);
  return '';
}

export function unclaimActor(row) {
  return {
    name: pick(row, 'checkedOutByName', 'CheckedOutByName') || text(row?.userName),
    email: pick(row, 'checkedOutByEmail', 'CheckedOutByEmail') || text(row?.userEmail),
  };
}

export function historyEvents(rows) {
  const events = [];
  for (const row of normalizeHistoryRows(rows) || []) {
    events.push({
      id: `${row.id}-claimed`,
      kind: 'claimed',
      at: row.checkInAt,
      kitName: row.kitName,
      claimDate: row.claimDate,
      name: text(row.userName),
      email: text(row.userEmail),
      tasksCompleted: row.tasksCompleted,
      tasksTotal: row.tasksTotal,
    });
    if (row.checkOutAt || row.status === 'CheckedOut') {
      const actor = unclaimActor(row);
      events.push({
        id: `${row.id}-unclaimed`,
        kind: 'unclaimed',
        at: row.checkOutAt,
        kitName: row.kitName,
        claimDate: row.claimDate,
        name: actor.name,
        email: actor.email,
        tasksCompleted: row.tasksCompleted,
        tasksTotal: row.tasksTotal,
      });
    }
  }
  events.sort((a, b) => {
    const byTime = String(b.at || '').localeCompare(String(a.at || ''));
    if (byTime !== 0) return byTime;
    if (a.kind === b.kind) return 0;
    return a.kind === 'unclaimed' ? -1 : 1;
  });
  return events;
}
