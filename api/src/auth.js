import { normalizeEmail } from './normalize.js';

function roleString(role) {
  if (role && typeof role === 'object' && role.Value != null) return String(role.Value);
  return String(role ?? '');
}

function isActiveFlag(v) {
  if (v === false) return false;
  if (typeof v === 'string' && ['false', 'no'].includes(v.trim().toLowerCase())) return false;
  return true; // PA: Active ne false
}

export function resolveActor(rows, rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;
  const row = (rows || []).find((r) => normalizeEmail(r.Email || r.email) === email);
  if (!row || !isActiveFlag(row.Active ?? row.active)) return null;
  const role = roleString(row.Role ?? row.role);
  const firstName = row.FirstName || row.firstName || '';
  const lastName = row.LastName || row.lastName || '';
  const name = row.Title || row.name || [firstName, lastName].filter(Boolean).join(' ') || email;
  return { email, name, firstName, lastName, role, active: true };
}

export function isAdmin(actor) {
  return String(actor?.role ?? '').trim().toLowerCase() === 'admin';
}
