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

/** Live getHistory uses date and claimId. The page reads claimDate and id. */
export function normalizeHistoryRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  const next = { ...row };
  if (!hasValue(next.claimDate) && hasValue(next.date)) {
    next.claimDate = typeof next.date === 'string' ? next.date.trim() : next.date;
  }
  if (!hasValue(next.id) && hasValue(next.claimId)) next.id = next.claimId;
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
