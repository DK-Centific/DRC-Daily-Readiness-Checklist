import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMockBackend } from '../js/mock-backend.js';
import {
  formatClaimMessage,
  formatPtDateTime,
  pacificDate,
} from '../js/time.js';

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

function backend() {
  return createMockBackend(memoryStorage());
}

const JANE = 'jane.doe@centific.com';
const BRIAN = 'brian.leong@centific.com';
const DATE = '2026-09-24';
const OTHER_DATE = '2026-09-25';

test('pacific date is the America/Los_Angeles calendar day, not the UTC date', () => {
  // 07:30 UTC on Jan 16 is 11:30 PM on Jan 15 in Pacific Standard Time.
  assert.equal(pacificDate(new Date('2026-01-16T07:30:00.000Z')), '2026-01-15');
  assert.equal(pacificDate(new Date('2026-01-16T08:00:00.000Z')), '2026-01-16');
});

test('history timestamps format in Pacific time with a PT label', () => {
  // 20:30 UTC on Jan 15 is 12:30 PM PST.
  const label = formatPtDateTime('2026-01-15T20:30:00.000Z').replace(/\s+/g, ' ');
  assert.match(label, /Jan 15, 2026/);
  assert.match(label, /12:30 PM PT/);
  assert.equal(formatPtDateTime(''), '');
});

test('claim message uses the selected calendar date and a Pacific clock time', () => {
  const message = formatClaimMessage(
    'Kit 01',
    '2026-09-24',
    '2026-09-24T15:06:00.000Z',
  ).replace(/\s+/g, ' ');
  // 15:06 UTC in September is 8:06 AM PDT.
  assert.equal(message, 'Kit 01 claimed on Sep 24, 2026 at 8:06 AM PT');
});

test('login rejects an email that is not on the access list', async () => {
  const api = backend();
  const result = await api.call({ action: 'login', email: 'nobody@centific.com' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NO_ACCESS');
  assert.equal(result.error, "You don't have access. Ask a DRC admin.");
});

test('login accepts an allowlisted user and returns the stored name', async () => {
  const api = backend();
  const result = await api.call({ action: 'login', email: ' Jane.Doe@Centific.com ' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    email: JANE,
    name: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'User',
  });
});

test('shared admin login accepts admin-drc and the centific alias', async () => {
  const api = backend();
  const short = await api.call({ action: 'login', email: 'admin-drc' });
  const alias = await api.call({ action: 'login', email: 'Admin-DRC@centific.com' });
  assert.equal(short.ok, true);
  assert.equal(short.data.role, 'Admin');
  assert.equal(short.data.email, 'admin-drc');
  assert.equal(alias.ok, true);
  assert.equal(alias.data.email, 'admin-drc');
  assert.equal(alias.data.name, 'admin-drc');
});

test('seeded admins can sign in', async () => {
  const api = backend();
  const brian = await api.call({ action: 'login', email: BRIAN });
  const annie = await api.call({ action: 'login', email: 'thaingan.tran@centific.com' });
  assert.equal(brian.data.role, 'Admin');
  assert.equal(brian.data.name, 'Brian Leong');
  assert.equal(annie.data.role, 'Admin');
  assert.equal(annie.data.name, 'Annie Tran');
  assert.equal(annie.data.firstName, 'Annie');
  assert.equal(annie.data.lastName, 'Tran');
});

test('a deactivated person cannot sign in or call other actions', async () => {
  const api = backend();
  await api.call({
    action: 'upsertAccess',
    actor: BRIAN,
    name: 'Pat Example',
    email: 'pat.example@centific.com',
    role: 'User',
    active: true,
  });
  const created = await api.call({ action: 'listAccess', actor: BRIAN });
  const pat = created.data.find((row) => row.email === 'pat.example@centific.com');
  await api.call({
    action: 'upsertAccess',
    actor: BRIAN,
    id: pat.id,
    name: 'Pat Example',
    email: pat.email,
    role: 'User',
    active: false,
  });
  const login = await api.call({ action: 'login', email: pat.email });
  assert.equal(login.code, 'NO_ACCESS');
  const kits = await api.call({ action: 'getKits', actor: pat.email, date: DATE });
  assert.equal(kits.code, 'NO_ACCESS');
});

test('tasks include the live checklist titles and are ordered by TaskOrder', async () => {
  const api = backend();
  const result = await api.call({ action: 'getTasks', actor: JANE });
  assert.equal(result.ok, true);
  assert.equal(result.data.length, 18);
  assert.ok(result.data.some((task) => task.title.includes('Walkie-talkies')));
  assert.ok(result.data.some((task) => task.title.includes('calibration board')));
  assert.equal(result.data.some((task) => task.title === 'Retired step'), false);
  const orders = result.data.map((task) => task.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

test('only one open claim is allowed per kit per date', async () => {
  const api = backend();
  const first = await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  assert.equal(first.ok, true);
  assert.equal(first.data.kitName, 'Kit 01');
  assert.equal(first.data.date, DATE);
  const second = await api.call({ action: 'checkIn', actor: BRIAN, kitId: 1, date: DATE });
  assert.equal(second.ok, false);
  assert.equal(second.code, 'KIT_CLAIMED');
});

test('the same kit can be claimed on a different date while the first day stays claimed', async () => {
  const api = backend();
  await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  const other = await api.call({ action: 'checkIn', actor: BRIAN, kitId: 1, date: OTHER_DATE });
  assert.equal(other.ok, true);
  const dayOne = await api.call({ action: 'getKits', actor: JANE, date: DATE });
  const kit = dayOne.data.find((row) => row.id === 1);
  assert.equal(kit.claim.userEmail, JANE);
  assert.equal(kit.claim.status, 'Claimed');
});

test('a person can hold only one open claim on a date', async () => {
  const api = backend();
  await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  const second = await api.call({ action: 'checkIn', actor: JANE, kitId: 2, date: DATE });
  assert.equal(second.ok, false);
  assert.equal(second.code, 'ALREADY_HAVE_CLAIM');
});

test('check-out frees the kit so someone else can claim it the same day', async () => {
  const api = backend();
  const claim = await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  const checkedOut = await api.call({
    action: 'checkOut',
    actor: JANE,
    claimId: claim.data.claimId,
    completedTaskIds: [1],
    tasksTotal: 4,
  });
  assert.equal(checkedOut.ok, true);
  assert.equal(checkedOut.data.tasksCompleted, 1);
  assert.ok(checkedOut.data.tasksTotal >= 1);
  assert.ok(checkedOut.data.checkOutAt);
  const next = await api.call({ action: 'checkIn', actor: BRIAN, kitId: 1, date: DATE });
  assert.equal(next.ok, true);
  const kits = await api.call({ action: 'getKits', actor: JANE, date: DATE });
  const kit = kits.data.find((row) => row.id === 1);
  assert.equal(kit.claim.userEmail, BRIAN);
  assert.equal(kit.lastCheckedOut.userEmail, JANE);
});

test('an optional checkout note is stored and returned on history', async () => {
  const api = backend();
  const claim = await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  const checkedOut = await api.call({
    action: 'checkOut',
    actor: JANE,
    claimId: claim.data.claimId,
    completedTaskIds: [1],
    tasksTotal: 18,
    notes: '  Lens was cracked  ',
  });
  assert.equal(checkedOut.ok, true);
  assert.equal(checkedOut.data.notes, 'Lens was cracked');
  const history = await api.call({ action: 'getHistory', actor: JANE, from: DATE, to: DATE });
  const row = history.data.find((item) => item.id === claim.data.claimId);
  assert.equal(row.notes, 'Lens was cracked');
  const blank = await api.call({ action: 'checkIn', actor: JANE, kitId: 2, date: DATE });
  await api.call({
    action: 'checkOut',
    actor: JANE,
    claimId: blank.data.claimId,
    completedTaskIds: [1],
    tasksTotal: 18,
  });
  const again = await api.call({ action: 'getHistory', actor: JANE, from: DATE, to: DATE });
  const plain = again.data.find((item) => item.id === blank.data.claimId);
  assert.equal(plain.notes, '');
  const noNote = await api.call({
    action: 'checkOut',
    actor: BRIAN,
    claimId: (await api.call({ action: 'checkIn', actor: BRIAN, kitId: 3, date: DATE })).data.claimId,
    completedTaskIds: [],
    tasksTotal: 18,
  });
  assert.equal(noNote.data.notes, '');
});

test('checkout notes wins over incompleteReason', async () => {
  const api = backend();
  const claim = await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  const checkedOut = await api.call({
    action: 'checkOut',
    actor: JANE,
    claimId: claim.data.claimId,
    completedTaskIds: [1],
    tasksTotal: 18,
    notes: 'From notes',
    incompleteReason: 'From alias',
  });
  assert.equal(checkedOut.data.notes, 'From notes');
  const aliasOnly = await api.call({ action: 'checkIn', actor: JANE, kitId: 2, date: DATE });
  const aliased = await api.call({
    action: 'checkOut',
    actor: JANE,
    claimId: aliasOnly.data.claimId,
    completedTaskIds: [],
    tasksTotal: 18,
    incompleteReason: '  Alias only  ',
  });
  assert.equal(aliased.data.notes, 'Alias only');
  const history = await api.call({ action: 'getHistory', actor: JANE, from: DATE, to: DATE });
  assert.equal(history.data.find((item) => item.id === aliasOnly.data.claimId).notes, 'Alias only');
});

test('task checkbox changes persist on the open claim and only the owner can change them', async () => {
  const api = backend();
  const claim = await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  const saved = await api.call({
    action: 'updateTasks',
    actor: JANE,
    claimId: claim.data.claimId,
    completedTaskIds: [1, 3, 1],
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.data.completedTaskIds, [1, 3]);
  const kits = await api.call({ action: 'getKits', actor: JANE, date: DATE });
  const kit = kits.data.find((row) => row.id === 1);
  assert.deepEqual(kit.claim.completedTaskIds, [1, 3]);
  const denied = await api.call({
    action: 'updateTasks',
    actor: BRIAN,
    claimId: claim.data.claimId,
    completedTaskIds: [2],
  });
  assert.equal(denied.code, 'NOT_OWNER');
});

test('someone else cannot check out a claim, but an admin can', async () => {
  const api = backend();
  const claim = await api.call({ action: 'checkIn', actor: JANE, kitId: 2, date: DATE });
  const stranger = await api.call({
    action: 'checkOut',
    actor: 'not-a-person@centific.com',
    claimId: claim.data.claimId,
    completedTaskIds: [],
    tasksTotal: 1,
  });
  assert.equal(stranger.code, 'NO_ACCESS');
  await api.call({
    action: 'upsertAccess',
    actor: BRIAN,
    name: 'Sam Lee',
    email: 'sam.lee@centific.com',
    role: 'User',
    active: true,
  });
  const otherUser = await api.call({
    action: 'checkOut',
    actor: 'sam.lee@centific.com',
    claimId: claim.data.claimId,
    completedTaskIds: [],
    tasksTotal: 1,
  });
  assert.equal(otherUser.code, 'NOT_OWNER');
  const admin = await api.call({
    action: 'checkOut',
    actor: BRIAN,
    claimId: claim.data.claimId,
    completedTaskIds: [1],
    tasksTotal: 99,
  });
  assert.equal(admin.ok, true);
  assert.equal(admin.data.tasksCompleted, 1);
  assert.equal(admin.data.checkedOutByEmail, BRIAN);
  assert.equal(admin.data.checkedOutByName, 'Brian Leong');
  const history = await api.call({ action: 'getHistory', actor: JANE, userEmail: JANE });
  assert.equal(history.data[0].userEmail, JANE);
  assert.equal(history.data[0].checkedOutByEmail, BRIAN);
  assert.equal(history.data[0].checkedOutByName, 'Brian Leong');
  const byReleaser = await api.call({ action: 'getHistory', actor: JANE, userEmail: BRIAN });
  assert.equal(byReleaser.data.length, 1);
  assert.equal(byReleaser.data[0].checkedOutByEmail, BRIAN);
});

test('a non-admin cannot call admin actions', async () => {
  const api = backend();
  const access = await api.call({ action: 'listAccess', actor: JANE });
  const kits = await api.call({ action: 'listKits', actor: JANE });
  const upsert = await api.call({
    action: 'upsertAccess',
    actor: JANE,
    name: 'Nope',
    email: 'nope.user@centific.com',
    role: 'Admin',
    active: true,
  });
  const kit = await api.call({
    action: 'upsertKit',
    actor: JANE,
    name: 'Kit 99',
    active: true,
    sortOrder: 9,
  });
  assert.equal(access.code, 'FORBIDDEN');
  assert.equal(kits.code, 'FORBIDDEN');
  assert.equal(upsert.code, 'FORBIDDEN');
  assert.equal(kit.code, 'FORBIDDEN');
});

test('any signed-in person can read the kit log, including someone else', async () => {
  const api = backend();
  const janeClaim = await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  const checkedOut = await api.call({
    action: 'checkOut',
    actor: JANE,
    claimId: janeClaim.data.claimId,
    completedTaskIds: [1],
    tasksTotal: 4,
  });
  assert.equal(checkedOut.data.checkedOutByEmail, JANE);
  await api.call({ action: 'checkIn', actor: BRIAN, kitId: 2, date: DATE });
  const brians = await api.call({
    action: 'getHistory',
    actor: JANE,
    userEmail: BRIAN,
    from: DATE,
    to: DATE,
  });
  assert.equal(brians.ok, true);
  assert.equal(brians.data.length, 1);
  assert.equal(brians.data[0].userEmail, BRIAN);
  const own = await api.call({
    action: 'getHistory',
    actor: JANE,
    userEmail: JANE,
    from: DATE,
    to: DATE,
  });
  assert.equal(own.data.length, 1);
  assert.equal(own.data[0].userEmail, JANE);
  assert.equal(own.data[0].checkedOutByEmail, JANE);
  assert.equal(own.data[0].tasksCompleted, 1);
  assert.equal(formatPtDateTime(own.data[0].checkInAt).replace(/\s+/g, ' ').endsWith('PT'), true);
  assert.equal(formatPtDateTime(own.data[0].checkOutAt).replace(/\s+/g, ' ').endsWith('PT'), true);
  const everyone = await api.call({ action: 'getHistory', actor: JANE });
  assert.equal(everyone.data.length, 2);
});

test('an admin can filter history by user, kit, and date', async () => {
  const api = backend();
  await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  await api.call({ action: 'checkIn', actor: BRIAN, kitId: 2, date: OTHER_DATE });
  const filtered = await api.call({
    action: 'getHistory',
    actor: BRIAN,
    userEmail: JANE,
    kitId: 1,
    from: DATE,
    to: DATE,
  });
  assert.equal(filtered.ok, true);
  assert.equal(filtered.data.length, 1);
  assert.equal(filtered.data[0].userEmail, JANE);
  assert.equal(filtered.data[0].kitId, 1);
  const everyone = await api.call({ action: 'getHistory', actor: 'admin-drc' });
  assert.equal(everyone.data.length, 2);
});

test('an admin can reset one kit for a date without changing the kit list', async () => {
  const api = backend();
  const kitsBefore = await api.call({ action: 'listKits', actor: BRIAN });
  const tasksBefore = await api.call({ action: 'getTasks', actor: BRIAN });
  const accessBefore = await api.call({ action: 'listAccess', actor: BRIAN });
  const first = await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  await api.call({
    action: 'checkOut',
    actor: JANE,
    claimId: first.data.claimId,
    completedTaskIds: [1],
    tasksTotal: 4,
  });
  await api.call({ action: 'checkIn', actor: BRIAN, kitId: 1, date: DATE });
  await api.call({ action: 'checkIn', actor: JANE, kitId: 2, date: DATE });
  await api.call({ action: 'checkIn', actor: BRIAN, kitId: 1, date: OTHER_DATE });

  const reset = await api.call({
    action: 'resetDay',
    actor: BRIAN,
    date: DATE,
    kitId: '1',
  });
  assert.equal(reset.ok, true);
  assert.equal(reset.data.date, DATE);
  assert.equal(reset.data.kitId, 1);
  assert.equal(reset.data.removedCount, 2);

  const kits = await api.call({ action: 'getKits', actor: JANE, date: DATE });
  const kit1 = kits.data.find((row) => row.id === 1);
  const kit2 = kits.data.find((row) => row.id === 2);
  assert.equal(kit1.claim, null);
  assert.equal(kit1.lastCheckedOut, null);
  assert.equal(kit2.claim.userEmail, JANE);
  assert.equal(kits.data.length, kitsBefore.data.filter((row) => row.active).length);

  const history = await api.call({ action: 'getHistory', actor: BRIAN, from: DATE, to: DATE });
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].kitId, 2);
  const otherDay = await api.call({ action: 'getHistory', actor: BRIAN, from: OTHER_DATE, to: OTHER_DATE });
  assert.equal(otherDay.data.length, 1);
  assert.equal(otherDay.data[0].kitId, 1);

  const kitsAfter = await api.call({ action: 'listKits', actor: BRIAN });
  const tasksAfter = await api.call({ action: 'getTasks', actor: BRIAN });
  const accessAfter = await api.call({ action: 'listAccess', actor: BRIAN });
  assert.deepEqual(kitsAfter.data, kitsBefore.data);
  assert.deepEqual(tasksAfter.data, tasksBefore.data);
  assert.deepEqual(accessAfter.data, accessBefore.data);

  const again = await api.call({ action: 'checkIn', actor: BRIAN, kitId: 1, date: DATE });
  assert.equal(again.ok, true);
});

test('an admin can reset every kit for a date', async () => {
  const api = backend();
  const kitsBefore = await api.call({ action: 'listKits', actor: BRIAN });
  await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  const kit2 = await api.call({ action: 'checkIn', actor: BRIAN, kitId: 2, date: DATE });
  await api.call({
    action: 'checkOut',
    actor: BRIAN,
    claimId: kit2.data.claimId,
    completedTaskIds: [1],
    tasksTotal: 4,
  });
  await api.call({ action: 'checkIn', actor: JANE, kitId: 3, date: OTHER_DATE });

  const reset = await api.call({ action: 'resetDay', actor: 'admin-drc', date: DATE });
  assert.equal(reset.ok, true);
  assert.equal(reset.data.date, DATE);
  assert.equal(reset.data.kitId, null);
  assert.equal(reset.data.removedCount, 2);

  const kits = await api.call({ action: 'getKits', actor: JANE, date: DATE });
  assert.ok(kits.data.every((row) => row.claim === null && row.lastCheckedOut === null));
  const history = await api.call({ action: 'getHistory', actor: BRIAN, from: DATE, to: DATE });
  assert.equal(history.data.length, 0);
  const otherDay = await api.call({ action: 'getHistory', actor: BRIAN, from: OTHER_DATE, to: OTHER_DATE });
  assert.equal(otherDay.data.length, 1);
  const kitsAfter = await api.call({ action: 'listKits', actor: BRIAN });
  assert.deepEqual(kitsAfter.data, kitsBefore.data);
});

test('resetDay is admin only and rejects a bad date or unknown kit', async () => {
  const api = backend();
  await api.call({ action: 'checkIn', actor: JANE, kitId: 1, date: DATE });
  const forbidden = await api.call({ action: 'resetDay', actor: JANE, date: DATE, kitId: 1 });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.code, 'FORBIDDEN');
  const missing = await api.call({ action: 'resetDay', actor: BRIAN });
  assert.equal(missing.code, 'VALIDATION');
  const bad = await api.call({ action: 'resetDay', actor: BRIAN, date: '2026-02-31' });
  assert.equal(bad.code, 'VALIDATION');
  const unknown = await api.call({ action: 'resetDay', actor: BRIAN, date: DATE, kitId: 99 });
  assert.equal(unknown.code, 'NOT_FOUND');
  const history = await api.call({ action: 'getHistory', actor: BRIAN, from: DATE, to: DATE });
  assert.equal(history.data.length, 1);
  const kits = await api.call({ action: 'listKits', actor: BRIAN });
  assert.equal(kits.data.length, 4);
});

test('admin can add and edit an access row, and kit management updates the kit list', async () => {
  const api = backend();
  const added = await api.call({
    action: 'upsertAccess',
    actor: 'thaingan.tran@centific.com',
    name: 'Chris Ng',
    email: 'Chris.Ng@centific.com',
    role: 'User',
    active: true,
  });
  assert.equal(added.ok, true);
  assert.equal(added.data.email, 'chris.ng@centific.com');
  assert.equal(added.data.firstName, 'Chris');
  assert.equal(added.data.lastName, 'Ng');
  const login = await api.call({ action: 'login', email: 'chris.ng@centific.com' });
  assert.equal(login.data.name, 'Chris Ng');
  const kit = await api.call({
    action: 'upsertKit',
    actor: BRIAN,
    name: 'Kit 05',
    active: true,
    sortOrder: 5,
  });
  assert.equal(kit.ok, true);
  const listed = await api.call({ action: 'getKits', actor: JANE, date: DATE });
  assert.ok(listed.data.some((row) => row.name === 'Kit 05'));
});
