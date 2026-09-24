/** Shapes returned by the live router, normalized for the page. */

export function isAdminRole(role) {
  return String(role ?? '').trim().toLowerCase() === 'admin';
}

export function roleLabel(role) {
  if (isAdminRole(role)) return 'Admin';
  const text = String(role ?? '').trim();
  if (text.toLowerCase() === 'user') return 'User';
  return text;
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
