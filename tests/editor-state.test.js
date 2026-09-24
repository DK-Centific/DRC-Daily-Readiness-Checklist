import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMockBackend } from '../js/mock-backend.js';
import {
  accessFromForm,
  accessPayload,
  blankAccess,
  blankKit,
  editorAfterSettingsRefresh,
  kitFromForm,
  kitPayload,
  validateAccess,
  validateKit,
} from '../js/editor-state.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

test('a late settings refresh keeps the kit name the user is typing', () => {
  let editor = blankKit(1);
  editor = kitFromForm(editor, {
    name: 'ZZ-DRC-TEST-KIT',
    sortOrder: '4',
    notes: '',
    active: 'on',
  });
  editor = editorAfterSettingsRefresh({ openKitForm: true, editor, nextSortOrder: 1 });
  assert.equal(editor.name, 'ZZ-DRC-TEST-KIT');
  assert.equal(editor.sortOrder, '4');
  assert.deepEqual(validateKit(editor), {});
  assert.deepEqual(kitPayload(editor), {
    name: 'ZZ-DRC-TEST-KIT',
    sortOrder: 4,
    notes: '',
    active: true,
  });
});

test('opening the add-kit form does not replace a form that is already open', () => {
  const typing = kitFromForm(blankKit(1), { name: 'Floor', sortOrder: '2', notes: 'left', active: 'on' });
  const kept = editorAfterSettingsRefresh({ openKitForm: true, editor: typing, nextSortOrder: 9 });
  assert.equal(kept.name, 'Floor');
  assert.equal(kept.notes, 'left');
  const fresh = editorAfterSettingsRefresh({ openKitForm: true, editor: null, nextSortOrder: 3 });
  assert.equal(fresh.name, '');
  assert.equal(fresh.sortOrder, 3);
});

test('a decimal sort order is rejected before anything is saved', () => {
  const errors = validateKit({ name: 'Kit 05', sortOrder: '1.5', notes: '', active: true });
  assert.equal(errors.sortOrder, 'Enter a whole number, such as 1.');
  assert.equal(validateKit({ name: '', sortOrder: '1', notes: '', active: true }).name, 'Enter a kit name.');
});

test('typed kit values are what gets saved, even when the practice service is slow', async () => {
  const editor = kitFromForm(blankKit(1), {
    name: 'ZZ-DRC-TEST-KIT',
    sortOrder: '4',
    notes: '',
    active: 'on',
  });
  const payload = kitPayload(editor);
  const api = createMockBackend(memoryStorage(), { latencyMs: 40 });
  const started = Date.now();
  const saved = await api.call({
    action: 'upsertKit',
    actor: 'admin-drc@centific.com',
    ...payload,
  });
  assert.ok(Date.now() - started >= 35);
  assert.equal(saved.ok, true);
  assert.equal(saved.data.name, 'ZZ-DRC-TEST-KIT');
  assert.equal(saved.data.sortOrder, 4);
  assert.equal(saved.data.active, true);
  const list = await api.call({ action: 'listKits', actor: 'brian.leong@centific.com' });
  assert.equal(list.data.some((kit) => kit.id === saved.data.id && kit.name === 'ZZ-DRC-TEST-KIT'), true);
});

test('a late refresh keeps an access form, and save posts the typed person', async () => {
  let editor = accessFromForm(blankAccess(), {
    name: 'Sam Lee',
    email: 'sam.lee@centific.com',
    firstName: 'Sam',
    lastName: 'Lee',
    role: 'User',
    active: 'on',
  });
  editor = editorAfterSettingsRefresh({ openKitForm: true, editor, nextSortOrder: 2 });
  assert.equal(editor.kind, 'access');
  assert.equal(editor.name, 'Sam Lee');
  assert.deepEqual(validateAccess(editor), {});
  const payload = accessPayload(editor);
  const api = createMockBackend(memoryStorage(), { latencyMs: 20 });
  const saved = await api.call({
    action: 'upsertAccess',
    actor: 'brian.leong@centific.com',
    ...payload,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.email, 'sam.lee@centific.com');
  assert.equal(saved.data.name, 'Sam Lee');
});

test('access validation explains a missing name or a non-Centific email', () => {
  assert.equal(validateAccess(blankAccess()).name, 'Enter a name.');
  assert.equal(validateAccess({ ...blankAccess(), name: 'Sam' }).email, 'Enter an email.');
  const bad = validateAccess({ ...blankAccess(), name: 'Sam', email: 'sam@example.com' });
  assert.match(bad.email, /Centific/);
});
