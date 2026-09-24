/**
 * localStorage mock of the DRC Power Automate router.
 * Same actions, error codes, and business rules as docs/DRC_SPEC_AND_API_CONTRACT.md.
 */

const STORAGE_KEY = 'drc.mock.v1';

const NO_ACCESS = "You don't have access. Ask a DRC admin.";

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function fail(error, code) {
  return { ok: false, error, code };
}

function ok(data) {
  return { ok: true, data };
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email === 'admin-drc@centific.com') return 'admin-drc';
  return email;
}

function isAcceptableEmail(email) {
  return email === 'admin-drc' || /^[a-z0-9._%+-]+@centific\.com$/.test(email);
}

function deriveName(email) {
  if (email === 'admin-drc') return { firstName: 'Admin', lastName: 'DRC' };
  const local = email.split('@')[0];
  const parts = local.split('.').filter(Boolean);
  const cap = (part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : '');
  if (parts.length >= 2) {
    return { firstName: cap(parts[0]), lastName: parts.slice(1).map(cap).join(' ') };
  }
  return { firstName: cap(local), lastName: '' };
}

function isValidDate(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return false;
  const [year, month, day] = String(ymd).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function asId(value) {
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

function seed() {
  const addedAt = '2026-01-01T00:00:00.000Z';
  return {
    nextId: { access: 5, kit: 5, task: 5, log: 1 },
    access: [
      { id: 1, name: 'Brian Leong', email: 'brian.leong@centific.com', firstName: 'Brian', lastName: 'Leong', role: 'Admin', active: true, addedBy: 'seed', addedAt },
      { id: 2, name: 'Annie Tran', email: 'thaingan.tran@centific.com', firstName: 'Annie', lastName: 'Tran', role: 'Admin', active: true, addedBy: 'seed', addedAt },
      { id: 3, name: 'admin-drc', email: 'admin-drc', firstName: 'admin-drc', lastName: '', role: 'Admin', active: true, addedBy: 'seed', addedAt },
      { id: 4, name: 'Jane Doe', email: 'jane.doe@centific.com', firstName: 'Jane', lastName: 'Doe', role: 'User', active: true, addedBy: 'seed', addedAt },
    ],
    kits: [
      { id: 1, name: 'Kit 01', active: true, sortOrder: 1, notes: 'Cart A' },
      { id: 2, name: 'Kit 02', active: true, sortOrder: 2, notes: 'Cart B' },
      { id: 3, name: 'Kit 03', active: true, sortOrder: 3, notes: '' },
      { id: 4, name: 'Kit 04', active: true, sortOrder: 4, notes: '' },
    ],
    tasks: [
      { id: 1, title: 'Check hardware status', order: 1, active: true },
      { id: 2, title: 'Verify network connection', order: 2, active: true },
      { id: 3, title: 'Confirm kit contents', order: 3, active: true },
      { id: 4, title: 'Record start conditions', order: 4, active: true },
    ],
    logs: [],
  };
}

function publicAccess(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    active: row.active,
  };
}

function publicKit(row) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    sortOrder: row.sortOrder,
    notes: row.notes || '',
  };
}

function publicLog(row) {
  return {
    id: row.id,
    title: row.title,
    userEmail: row.userEmail,
    userName: row.userName,
    kitId: row.kitId,
    kitName: row.kitName,
    claimDate: row.claimDate,
    checkInAt: row.checkInAt,
    checkOutAt: row.checkOutAt,
    status: row.status,
    tasksCompleted: row.tasksCompleted,
    tasksTotal: row.tasksTotal,
    completedTaskIds: [...row.completedTaskIds],
  };
}

function publicClaim(row) {
  return {
    claimId: row.id,
    userEmail: row.userEmail,
    userName: row.userName,
    checkInAt: row.checkInAt,
    status: row.status,
    completedTaskIds: [...row.completedTaskIds],
  };
}

function findAccess(db, email) {
  const key = normalizeEmail(email);
  return db.access.find((row) => row.email === key) || null;
}

function requireActive(db, actor) {
  const user = findAccess(db, actor);
  if (!user || !user.active) return fail(NO_ACCESS, 'NO_ACCESS');
  return { user };
}

function requireAdmin(db, actor) {
  const result = requireActive(db, actor);
  if (!result.user) return result;
  if (result.user.role !== 'Admin') return fail('Admin access is required.', 'NOT_ADMIN');
  return result;
}

function activeTasks(db) {
  return db.tasks
    .filter((task) => task.active !== false)
    .slice()
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || a.id - b.id);
}

function sanitizeTaskIds(db, ids) {
  const known = new Set(db.tasks.map((task) => task.id));
  const out = [];
  for (const raw of ids || []) {
    const id = Number(raw);
    if (!known.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function openClaimForKit(db, kitId, date) {
  return db.logs.find((row) => row.kitId === kitId && row.claimDate === date && row.status === 'Claimed') || null;
}

function userOpenClaim(db, email, date) {
  return db.logs.find((row) => row.userEmail === email && row.claimDate === date && row.status === 'Claimed') || null;
}

function lastCheckedOut(db, kitId, date) {
  const rows = db.logs.filter((row) => row.kitId === kitId && row.claimDate === date && row.status === 'CheckedOut');
  rows.sort((a, b) => String(b.checkOutAt).localeCompare(String(a.checkOutAt)));
  return rows[0] || null;
}

function login(db, params) {
  const email = normalizeEmail(params.email);
  const user = findAccess(db, email);
  if (!user || !user.active) return fail(NO_ACCESS, 'NO_ACCESS');
  return ok({
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  });
}

function getTasks(db, actor) {
  const auth = requireActive(db, actor);
  if (!auth.user) return auth;
  return ok(activeTasks(db).map((task) => ({ id: task.id, title: task.title, order: task.order })));
}

function getKits(db, actor, params) {
  const auth = requireActive(db, actor);
  if (!auth.user) return auth;
  if (!isValidDate(params.date)) return fail('Choose a valid date.', 'INVALID');
  const kits = db.kits
    .filter((kit) => kit.active)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return ok(kits.map((kit) => {
    const claim = openClaimForKit(db, kit.id, params.date);
    const previous = lastCheckedOut(db, kit.id, params.date);
    return {
      id: kit.id,
      name: kit.name,
      sortOrder: kit.sortOrder,
      claim: claim ? publicClaim(claim) : null,
      lastCheckedOut: previous
        ? {
          claimId: previous.id,
          userEmail: previous.userEmail,
          userName: previous.userName,
          checkOutAt: previous.checkOutAt,
        }
        : null,
    };
  }));
}

function checkIn(db, write, actor, params) {
  const auth = requireActive(db, actor);
  if (!auth.user) return auth;
  if (!isValidDate(params.date)) return fail('Choose a valid date.', 'INVALID');
  const kitId = asId(params.kitId);
  const kit = db.kits.find((row) => row.id === kitId);
  if (!kit) return fail('That kit was not found.', 'NOT_FOUND');
  if (!kit.active) return fail('That kit is not active.', 'KIT_INACTIVE');
  if (openClaimForKit(db, kit.id, params.date)) {
    return fail('This kit is already claimed for that date.', 'KIT_CLAIMED');
  }
  if (userOpenClaim(db, auth.user.email, params.date)) {
    return fail('You already have a kit checked in for that date.', 'ALREADY_HAVE_CLAIM');
  }
  const now = new Date().toISOString();
  const log = {
    id: db.nextId.log++,
    title: `${kit.name} ${params.date} ${auth.user.email}`,
    userEmail: auth.user.email,
    userName: auth.user.name,
    kitId: kit.id,
    kitName: kit.name,
    claimDate: params.date,
    checkInAt: now,
    checkOutAt: null,
    status: 'Claimed',
    tasksCompleted: 0,
    tasksTotal: activeTasks(db).length,
    completedTaskIds: [],
  };
  db.logs.push(log);
  write(db);
  return ok({
    claimId: log.id,
    kitId: kit.id,
    kitName: kit.name,
    date: params.date,
    checkInAt: now,
  });
}

function updateTasks(db, write, actor, params) {
  const auth = requireActive(db, actor);
  if (!auth.user) return auth;
  const claim = db.logs.find((row) => row.id === asId(params.claimId));
  if (!claim) return fail('That check-in was not found.', 'NOT_FOUND');
  if (claim.userEmail !== auth.user.email) return fail('Only the person who checked in this kit can update tasks.', 'NOT_OWNER');
  if (claim.status !== 'Claimed') return fail('This kit is already checked out.', 'NOT_OPEN');
  if (!Array.isArray(params.completedTaskIds)) return fail('completedTaskIds must be a list.', 'INVALID');
  claim.completedTaskIds = sanitizeTaskIds(db, params.completedTaskIds);
  claim.tasksCompleted = claim.completedTaskIds.length;
  claim.tasksTotal = activeTasks(db).length;
  write(db);
  return ok({ claimId: claim.id, completedTaskIds: [...claim.completedTaskIds] });
}

function checkOut(db, write, actor, params) {
  const auth = requireActive(db, actor);
  if (!auth.user) return auth;
  const claim = db.logs.find((row) => row.id === asId(params.claimId));
  if (!claim) return fail('That check-in was not found.', 'NOT_FOUND');
  if (claim.status !== 'Claimed') return fail('This kit is already checked out.', 'NOT_OPEN');
  const isOwner = claim.userEmail === auth.user.email;
  if (!isOwner && auth.user.role !== 'Admin') {
    return fail('Only the person who checked in this kit can check it out.', 'NOT_OWNER');
  }
  const ids = Array.isArray(params.completedTaskIds) ? params.completedTaskIds : claim.completedTaskIds;
  claim.completedTaskIds = sanitizeTaskIds(db, ids);
  claim.tasksCompleted = claim.completedTaskIds.length;
  claim.tasksTotal = activeTasks(db).length;
  claim.status = 'CheckedOut';
  claim.checkOutAt = new Date().toISOString();
  write(db);
  return ok({
    claimId: claim.id,
    checkOutAt: claim.checkOutAt,
    tasksCompleted: claim.tasksCompleted,
    tasksTotal: claim.tasksTotal,
  });
}

function getHistory(db, actor, params) {
  const auth = requireActive(db, actor);
  if (!auth.user) return auth;
  let rows = db.logs.slice();
  const email = auth.user.role === 'Admin'
    ? (params.userEmail ? normalizeEmail(params.userEmail) : '')
    : auth.user.email;
  if (email) rows = rows.filter((row) => row.userEmail === email);
  if (params.kitId !== undefined && params.kitId !== null && params.kitId !== '') {
    const kitId = asId(params.kitId);
    rows = rows.filter((row) => row.kitId === kitId);
  }
  if (params.from) rows = rows.filter((row) => row.claimDate >= params.from);
  if (params.to) rows = rows.filter((row) => row.claimDate <= params.to);
  rows.sort((a, b) => String(b.checkInAt).localeCompare(String(a.checkInAt)));
  return ok(rows.map(publicLog));
}

function listAccess(db, actor) {
  const auth = requireAdmin(db, actor);
  if (!auth.user) return auth;
  return ok(db.access.map(publicAccess).sort((a, b) => a.name.localeCompare(b.name)));
}

function activeAdminCount(db, exceptId, next) {
  return db.access.filter((row) => {
    if (row.id === exceptId) return next.active && next.role === 'Admin';
    return row.active && row.role === 'Admin';
  }).length;
}

function upsertAccess(db, write, actor, params) {
  const auth = requireAdmin(db, actor);
  if (!auth.user) return auth;
  const email = normalizeEmail(params.email);
  const name = String(params.name || '').trim();
  if (!name) return fail('Name is required.', 'INVALID');
  if (!isAcceptableEmail(email)) {
    return fail('Use a Centific email (name@centific.com).', 'INVALID');
  }
  if (params.role !== 'Admin' && params.role !== 'User') {
    return fail('Role must be Admin or User.', 'INVALID');
  }
  const active = params.active === undefined ? true : params.active;
  if (typeof active !== 'boolean') return fail('Active must be true or false.', 'INVALID');
  const derived = deriveName(email);
  const firstName = String(params.firstName || '').trim() || derived.firstName;
  const lastName = String(params.lastName || '').trim() || derived.lastName;
  const id = params.id === undefined || params.id === null || params.id === '' ? null : asId(params.id);
  if (params.id !== undefined && params.id !== null && params.id !== '' && id === null) {
    return fail('That person was not found.', 'NOT_FOUND');
  }
  const duplicate = db.access.find((row) => row.email === email && row.id !== id);
  if (duplicate) return fail('That email is already on the access list.', 'DUPLICATE_EMAIL');

  if (id === null) {
    const row = {
      id: db.nextId.access++,
      name,
      email,
      firstName,
      lastName,
      role: params.role,
      active,
      addedBy: auth.user.email,
      addedAt: new Date().toISOString(),
    };
    if (activeAdminCount(db, row.id, row) < 1) return fail('Keep at least one active admin.', 'LAST_ADMIN');
    db.access.push(row);
    write(db);
    return ok(publicAccess(row));
  }

  const row = db.access.find((item) => item.id === id);
  if (!row) return fail('That person was not found.', 'NOT_FOUND');
  const next = { ...row, name, email, firstName, lastName, role: params.role, active };
  if (activeAdminCount(db, row.id, next) < 1) return fail('Keep at least one active admin.', 'LAST_ADMIN');
  Object.assign(row, next);
  write(db);
  return ok(publicAccess(row));
}

function listKits(db, actor) {
  const auth = requireAdmin(db, actor);
  if (!auth.user) return auth;
  return ok(db.kits.map(publicKit).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
}

function upsertKit(db, write, actor, params) {
  const auth = requireAdmin(db, actor);
  if (!auth.user) return auth;
  const name = String(params.name || '').trim();
  if (!name) return fail('Kit name is required.', 'INVALID');
  const active = params.active === undefined ? true : params.active;
  if (typeof active !== 'boolean') return fail('Active must be true or false.', 'INVALID');
  const sortOrder = params.sortOrder === undefined || params.sortOrder === '' ? null : Number(params.sortOrder);
  if (sortOrder !== null && !Number.isFinite(sortOrder)) return fail('Sort order must be a number.', 'INVALID');
  const notes = String(params.notes || '');
  const id = params.id === undefined || params.id === null || params.id === '' ? null : asId(params.id);
  if (id === null) {
    const row = {
      id: db.nextId.kit++,
      name,
      active,
      sortOrder: sortOrder === null ? db.kits.length + 1 : sortOrder,
      notes,
    };
    db.kits.push(row);
    write(db);
    return ok(publicKit(row));
  }
  const row = db.kits.find((kit) => kit.id === id);
  if (!row) return fail('That kit was not found.', 'NOT_FOUND');
  row.name = name;
  row.active = active;
  if (sortOrder !== null) row.sortOrder = sortOrder;
  row.notes = notes;
  write(db);
  return ok(publicKit(row));
}

function dispatch(db, write, body) {
  const action = body && body.action;
  const params = { ...(body || {}) };
  delete params.action;
  const actor = params.actor;
  delete params.actor;

  switch (action) {
    case 'login':
      return login(db, params);
    case 'getTasks':
      return getTasks(db, actor);
    case 'getKits':
      return getKits(db, actor, params);
    case 'checkIn':
      return checkIn(db, write, actor, params);
    case 'updateTasks':
      return updateTasks(db, write, actor, params);
    case 'checkOut':
      return checkOut(db, write, actor, params);
    case 'getHistory':
      return getHistory(db, actor, params);
    case 'listAccess':
      return listAccess(db, actor);
    case 'upsertAccess':
      return upsertAccess(db, write, actor, params);
    case 'listKits':
      return listKits(db, actor);
    case 'upsertKit':
      return upsertKit(db, write, actor, params);
    default:
      return fail('Unknown action.', 'INVALID');
  }
}

export function createMockBackend(storage) {
  const store = storage || memoryStorage();

  function read() {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) {
      const data = seed();
      store.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
    try {
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.access) || !Array.isArray(data.logs)) throw new Error('bad');
      return data;
    } catch {
      const data = seed();
      store.setItem(STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  }

  function write(db) {
    store.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  return {
    call(body) {
      try {
        return Promise.resolve(dispatch(read(), write, body || {}));
      } catch (error) {
        return Promise.resolve(fail(error.message || 'Unexpected error', 'INVALID'));
      }
    },
    reset() {
      store.removeItem(STORAGE_KEY);
    },
  };
}
