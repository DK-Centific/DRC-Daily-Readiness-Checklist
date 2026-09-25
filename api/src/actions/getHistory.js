import { rowFromItem } from '../graph.js';
import { fail, normalizeEmail, ok } from '../normalize.js';
import { mapHistoryRow } from '../shapes.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const HISTORY_SELECT = [
  'Title',
  'UserEmail',
  'UserName',
  'KitID',
  'KitName',
  'ClaimDate',
  'CheckInAt',
  'CheckOutAt',
  'Status',
  'TasksCompleted',
  'TasksTotal',
  'CompletedTaskIDs',
  'CheckedOutByEmail',
  'CheckedOutByName',
];

function odataString(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Build a Graph $filter for getHistory.
 * A missing kitId is omitted. It is never coerced with int() or turned into 0.
 */
export function buildHistoryFilter(params = {}) {
  const clauses = [];
  if (params.userEmail != null && String(params.userEmail).trim() !== '') {
    const email = normalizeEmail(params.userEmail);
    if (!email) return { error: 'VALIDATION', message: 'userEmail is not valid.' };
    const escaped = odataString(email);
    clauses.push(`(fields/UserEmail eq '${escaped}' or fields/CheckedOutByEmail eq '${escaped}')`);
  }
  if (params.kitId !== undefined && params.kitId !== null && String(params.kitId).trim() !== '') {
    const kitId = Number(params.kitId);
    if (!Number.isInteger(kitId)) {
      return { error: 'VALIDATION', message: 'kitId must be a number.' };
    }
    clauses.push(`fields/KitID eq ${kitId}`);
  }
  if (params.from != null && String(params.from).trim() !== '') {
    const from = String(params.from).trim();
    if (!DATE.test(from)) return { error: 'VALIDATION', message: 'from must be YYYY-MM-DD.' };
    clauses.push(`fields/ClaimDate ge '${from}'`);
  }
  if (params.to != null && String(params.to).trim() !== '') {
    const to = String(params.to).trim();
    if (!DATE.test(to)) return { error: 'VALIDATION', message: 'to must be YYYY-MM-DD.' };
    clauses.push(`fields/ClaimDate le '${to}'`);
  }
  return { filter: clauses.length ? clauses.join(' and ') : undefined };
}

export async function getHistory(deps, body) {
  const built = buildHistoryFilter(body || {});
  if (built.error) return fail(built.error, built.message);
  // Newest id first is applied below. Graph $orderby=id is not reliable on list items.
  const items = await deps.graph.listItems(deps.settings.lists.log, {
    filter: built.filter,
    select: HISTORY_SELECT,
    top: 500,
  });
  const rows = items
    .map(rowFromItem)
    .map(mapHistoryRow)
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  return ok(rows);
}
