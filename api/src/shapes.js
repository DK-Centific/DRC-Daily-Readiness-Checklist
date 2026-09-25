function choiceString(value) {
  if (value && typeof value === 'object' && value.Value != null) return String(value.Value);
  return value == null ? '' : String(value);
}

export function displayRole(role) {
  return choiceString(role).trim().toLowerCase() === 'admin' ? 'Admin' : 'User';
}

export function mapLogin(actor) {
  return {
    email: actor.email,
    name: actor.name || actor.email,
    firstName: actor.firstName || '',
    lastName: actor.lastName || '',
    role: displayRole(actor.role),
  };
}

export function isTaskRowVisible(row) {
  if (!row || typeof row !== 'object') return false;
  const flag = row.Active !== undefined ? row.Active : row.active;
  if (flag === undefined || flag === null || flag === '') return true;
  if (flag === false) return false;
  if (typeof flag === 'string') {
    const text = flag.trim().toLowerCase();
    if (text === 'false' || text === 'no') return false;
  }
  return true;
}

export function mapTask(row) {
  const order = Number(row.TaskOrder ?? row.order);
  const id = Number(row.id ?? row.ID ?? row.Id);
  return {
    id: Number.isFinite(id) ? id : row.id,
    title: String(row.Title ?? row.title ?? ''),
    order: Number.isFinite(order) ? order : 0,
  };
}
