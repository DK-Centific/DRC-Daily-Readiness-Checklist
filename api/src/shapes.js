import { normalizeEmail } from './normalize.js';

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

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseCompletedTaskIds(raw) {
  if (raw == null) return [];
  let value = raw;
  for (let attempt = 0; attempt < 2 && typeof value === 'string'; attempt += 1) {
    const text = value.trim();
    if (!text) return [];
    try {
      value = JSON.parse(text);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const ids = [];
  for (const item of value) {
    const n = typeof item === 'string' && /^-?\d+$/.test(item.trim()) ? Number(item) : item;
    if (typeof n === 'number' && Number.isFinite(n)) ids.push(n);
  }
  return ids;
}

export function mapClaim(row) {
  return {
    claimId: asNumber(row.id ?? row.ID ?? row.claimId),
    userEmail: String(row.UserEmail ?? row.userEmail ?? ''),
    userName: String(row.UserName ?? row.userName ?? ''),
    checkInAt: row.CheckInAt ?? row.checkInAt ?? null,
    status: choiceString(row.Status ?? row.status) || 'Claimed',
    completedTaskIds: parseCompletedTaskIds(row.CompletedTaskIDs ?? row.CompletedTaskIds ?? row.completedTaskIds),
  };
}

export function joinKits(kitRows, claimRows) {
  const claimsByKit = new Map();
  for (const claim of claimRows || []) {
    const kitId = asNumber(claim.KitID ?? claim.kitId);
    if (kitId == null || claimsByKit.has(kitId)) continue;
    claimsByKit.set(kitId, mapClaim(claim));
  }
  return (kitRows || [])
    .map((row) => ({
      id: asNumber(row.id),
      name: String(row.Title ?? row.name ?? ''),
      sortOrder: asNumber(row.SortOrder ?? row.sortOrder) ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((kit) => ({
      ...kit,
      claim: claimsByKit.get(kit.id) || null,
    }));
}

export function activeBoolean(value) {
  if (value === false) return false;
  if (typeof value === 'string' && ['false', 'no'].includes(value.trim().toLowerCase())) return false;
  return true;
}

export function mapKitCatalog(row) {
  const sortOrder = Number(row.SortOrder ?? row.sortOrder);
  return {
    id: asNumber(row.id),
    name: String(row.Title ?? row.name ?? ''),
    active: activeBoolean(row.Active ?? row.active),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    notes: String(row.Notes ?? row.notes ?? ''),
  };
}

export function mapHistoryRow(row) {
  const id = asNumber(row.id ?? row.ID);
  const claimDate = String(row.ClaimDate ?? row.claimDate ?? '');
  const checkOutRaw = row.CheckOutAt ?? row.checkOutAt;
  return {
    id,
    claimId: id,
    title: String(row.Title ?? row.title ?? ''),
    userEmail: String(row.UserEmail ?? row.userEmail ?? ''),
    userName: String(row.UserName ?? row.userName ?? ''),
    kitId: asNumber(row.KitID ?? row.kitId),
    kitName: String(row.KitName ?? row.kitName ?? ''),
    claimDate,
    date: claimDate,
    checkInAt: row.CheckInAt ?? row.checkInAt ?? null,
    checkOutAt: checkOutRaw == null || checkOutRaw === '' ? null : checkOutRaw,
    status: choiceString(row.Status ?? row.status),
    tasksCompleted: asNumber(row.TasksCompleted ?? row.tasksCompleted) ?? 0,
    tasksTotal: asNumber(row.TasksTotal ?? row.tasksTotal) ?? 0,
    completedTaskIds: parseCompletedTaskIds(row.CompletedTaskIDs ?? row.CompletedTaskIds ?? row.completedTaskIds),
    checkedOutByEmail: String(row.CheckedOutByEmail ?? row.checkedOutByEmail ?? ''),
    checkedOutByName: String(row.CheckedOutByName ?? row.checkedOutByName ?? ''),
  };
}

export function mapAccessRow(row) {
  const firstName = String(row.FirstName ?? row.firstName ?? '');
  const lastName = String(row.LastName ?? row.lastName ?? '');
  const email = normalizeEmail(row.Email ?? row.email);
  const name = String(row.Title ?? row.name ?? '').trim()
    || [firstName, lastName].filter(Boolean).join(' ')
    || email;
  return {
    id: asNumber(row.id),
    name,
    email,
    firstName,
    lastName,
    role: displayRole(row.Role ?? row.role),
    active: activeBoolean(row.Active ?? row.active),
  };
}
