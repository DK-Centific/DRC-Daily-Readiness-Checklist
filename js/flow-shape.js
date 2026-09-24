/** Shapes returned by the live router, normalized for the page. */

export function isAdminRole(role) {
  return String(role ?? '').trim().toLowerCase() === 'admin';
}

/** What the page shows. SharePoint still stores User. */
export function roleLabel(role) {
  if (isAdminRole(role)) return 'Admin';
  const text = String(role ?? '').trim().toLowerCase();
  if (text === 'user' || text === 'staff') return 'Staff';
  return String(role ?? '').trim();
}

/** What upsertAccess sends. Staff on screen is User in SharePoint. */
export function roleValue(role) {
  return isAdminRole(role) ? 'Admin' : 'User';
}

function hasValue(value) {
  return value != null && String(value).trim() !== '';
}

function firstFilled(row, keys) {
  for (const key of keys) {
    if (hasValue(row[key])) return row[key];
  }
  return undefined;
}

function fillAlias(next, row, target, keys) {
  if (hasValue(next[target])) return;
  const value = firstFilled(row, keys);
  if (value === undefined) return;
  next[target] = typeof value === 'string' ? value.trim() : value;
}

/**
 * Live getHistory uses date and claimId. The page reads claimDate and id.
 * PascalCase aliases are copied onto the camelCase fields when those are blank.
 */
export function normalizeHistoryRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const next = { ...row };
  fillAlias(next, row, 'id', ['ID', 'Id', 'claimId', 'ClaimId']);
  fillAlias(next, row, 'claimDate', ['ClaimDate', 'date', 'Date']);
  fillAlias(next, row, 'kitId', ['KitID', 'KitId']);
  fillAlias(next, row, 'kitName', ['KitName']);
  fillAlias(next, row, 'userEmail', ['UserEmail']);
  fillAlias(next, row, 'userName', ['UserName']);
  fillAlias(next, row, 'checkInAt', ['CheckInAt']);
  fillAlias(next, row, 'checkOutAt', ['CheckOutAt']);
  fillAlias(next, row, 'status', ['Status']);
  fillAlias(next, row, 'tasksCompleted', ['TasksCompleted']);
  fillAlias(next, row, 'tasksTotal', ['TasksTotal']);
  fillAlias(next, row, 'completedTaskIds', ['CompletedTaskIDs', 'CompletedTaskIds']);
  fillAlias(next, row, 'checkedOutByEmail', ['CheckedOutByEmail']);
  fillAlias(next, row, 'checkedOutByName', ['CheckedOutByName']);
  return next;
}

export function normalizeHistoryRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(normalizeHistoryRow);
}

/** Hide a task only when Active is explicitly false. A missing flag stays visible. */
export function isTaskVisible(task) {
  if (!task || typeof task !== 'object') return false;
  const flag = task.active !== undefined ? task.active : task.Active;
  if (flag === undefined || flag === null || flag === '') return true;
  if (flag === false) return false;
  if (typeof flag === 'string') {
    const text = flag.trim().toLowerCase();
    if (text === 'false' || text === 'no') return false;
  }
  return true;
}
