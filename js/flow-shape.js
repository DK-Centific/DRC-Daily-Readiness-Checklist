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

/**
 * Checkout note text. `notes` wins. The saved column is CheckoutNotes.
 * A missing note is "".
 */
export function checkoutNotesText(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return '';
  if (Object.prototype.hasOwnProperty.call(record, 'notes') && record.notes != null) {
    return String(record.notes).trim();
  }
  const keys = ['CheckoutNotes', 'Notes', 'checkoutNote', 'CheckoutNote', 'incompleteReason'];
  for (const key of keys) {
    if (record[key] == null) continue;
    const text = String(record[key]).trim();
    if (text) return text;
  }
  return '';
}

/** checkOut success always includes notes, even when the kit had no note. */
export function normalizeCheckoutData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const notes = checkoutNotesText(data);
  if (data.notes === notes) return data;
  return { ...data, notes };
}

function fillAlias(next, row, target, keys) {
  if (hasValue(next[target])) return;
  const value = firstFilled(row, keys);
  if (value === undefined) return;
  next[target] = typeof value === 'string' ? value.trim() : value;
}

/** SharePoint lookups arrive as { LookupId, LookupValue }. The page matches a number. */
export function coerceRecordId(value) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return undefined;
    if (/^-?\d+$/.test(text)) {
      const number = Number(text);
      if (Number.isSafeInteger(number)) return number;
    }
    return text;
  }
  if (typeof value === 'object') {
    const nested = value.LookupId ?? value.lookupId ?? value.Id ?? value.ID ?? value.id;
    if (nested != null && nested !== value) return coerceRecordId(nested);
  }
  return undefined;
}

function taskId(value) {
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  return value;
}

/**
 * Live getKits sometimes sends completedTaskIds as a JSON string.
 * A real array is left as-is. A string that is not a JSON array is left as-is
 * so the page can still fall back to getHistory.
 */
export function coerceCompletedTaskIds(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  let parsed = value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (typeof parsed !== 'string') break;
    const text = parsed.trim();
    if (!text) return value;
    try {
      parsed = JSON.parse(text);
    } catch {
      return value;
    }
  }
  if (!Array.isArray(parsed)) return value;
  return parsed.map(taskId);
}

function withCompletedTaskIds(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const raw = hasValue(record.completedTaskIds)
    ? record.completedTaskIds
    : firstFilled(record, ['CompletedTaskIDs', 'CompletedTaskIds']);
  if (raw === undefined) return record;
  const ids = coerceCompletedTaskIds(raw);
  if (!Array.isArray(ids)) return record;
  if (ids === record.completedTaskIds) return record;
  return { ...record, completedTaskIds: ids };
}

/** History is only needed when this open claim still has no task-id array. */
export function openClaimNeedsTaskHydrate(claim) {
  if (!claim || typeof claim !== 'object') return false;
  return !Array.isArray(coerceCompletedTaskIds(claim.completedTaskIds));
}

/** Copy stringified claim task ids onto a real array before the page decides to hydrate. */
export function normalizeKitClaims(kits) {
  if (!Array.isArray(kits)) return kits;
  return kits.map((kit) => {
    if (!kit || typeof kit !== 'object' || !kit.claim || typeof kit.claim !== 'object') return kit;
    const claim = withCompletedTaskIds(kit.claim);
    if (claim === kit.claim) return kit;
    return { ...kit, claim };
  });
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
  next.notes = checkoutNotesText(row);
  const kitId = coerceRecordId(next.kitId);
  if (kitId !== undefined) next.kitId = kitId;
  return withCompletedTaskIds(next);
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
