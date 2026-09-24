import { roleValue } from './flow-shape.js';

/** Settings drafts. Background refreshes must not wipe a form the user has open. */

export function blankKit(sortOrder = 1) {
  return {
    kind: 'kit',
    id: null,
    name: '',
    sortOrder,
    notes: '',
    active: true,
  };
}

export function blankAccess() {
  return {
    kind: 'access',
    id: null,
    name: '',
    email: '',
    firstName: '',
    lastName: '',
    role: 'User',
    active: true,
  };
}

function read(data, key) {
  if (data && typeof data.get === 'function') return data.get(key);
  return data ? data[key] : undefined;
}

export function kitFromForm(editor, data) {
  const recordId = read(data, 'recordId');
  return {
    kind: 'kit',
    id: recordId ? Number(recordId) : (editor?.id ?? null),
    name: String(read(data, 'name') ?? ''),
    sortOrder: read(data, 'sortOrder') ?? '',
    notes: String(read(data, 'notes') ?? ''),
    active: read(data, 'active') === 'on' || read(data, 'active') === true,
  };
}

export function accessFromForm(editor, data) {
  const recordId = read(data, 'recordId');
  return {
    kind: 'access',
    id: recordId ? Number(recordId) : (editor?.id ?? null),
    name: String(read(data, 'name') ?? ''),
    email: String(read(data, 'email') ?? ''),
    firstName: String(read(data, 'firstName') ?? ''),
    lastName: String(read(data, 'lastName') ?? ''),
    role: read(data, 'role') || 'User',
    active: read(data, 'active') === 'on' || read(data, 'active') === true,
  };
}

/** Only open a blank kit form when the user is not already editing something. */
export function editorAfterSettingsRefresh({ openKitForm, editor, nextSortOrder }) {
  if (!openKitForm) return editor ?? null;
  if (editor) return editor;
  return blankKit(nextSortOrder);
}

export function parseSortOrder(value) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+$/.test(text)) {
    return { ok: false, message: 'Enter a whole number, such as 1.' };
  }
  return { ok: true, value: Number(text) };
}

export function validateKit(editor) {
  const errors = {};
  if (!String(editor?.name || '').trim()) errors.name = 'Enter a kit name.';
  const order = parseSortOrder(editor?.sortOrder);
  if (!order.ok) errors.sortOrder = order.message;
  return errors;
}

export function kitPayload(editor) {
  const order = parseSortOrder(editor?.sortOrder);
  const payload = {
    name: String(editor?.name || '').trim(),
    sortOrder: order.ok ? order.value : undefined,
    notes: String(editor?.notes || ''),
    active: Boolean(editor?.active),
  };
  if (editor?.id) payload.id = Number(editor.id);
  return payload;
}

export function validateAccess(editor) {
  const errors = {};
  if (!String(editor?.name || '').trim()) errors.name = 'Enter a name.';
  const email = String(editor?.email || '').trim();
  if (!email) errors.email = 'Enter an email.';
  else if (email.toLowerCase() !== 'admin-drc' && !/^[^\s@]+@centific\.com$/i.test(email)) {
    errors.email = 'Use a Centific email (name@centific.com).';
  }
  return errors;
}

export function accessPayload(editor) {
  const payload = {
    name: String(editor?.name || '').trim(),
    email: String(editor?.email || '').trim(),
    firstName: String(editor?.firstName || '').trim(),
    lastName: String(editor?.lastName || '').trim(),
    role: roleValue(editor?.role),
    active: editor?.active !== false,
  };
  if (editor?.id) payload.id = Number(editor.id);
  return payload;
}
