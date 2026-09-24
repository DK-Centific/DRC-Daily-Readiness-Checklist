import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAdminRole } from '../js/flow-shape.js';
import { acceptedLoginUser, planSessionRestore } from '../js/session-restore.js';

test('a forged saved role does not open admin chrome before login', () => {
  const forged = {
    email: 'brian.leong@centific.com',
    name: 'Brian Leong',
    role: 'Admin',
  };
  const plan = planSessionRestore(forged);
  assert.deepEqual(plan, {
    action: 'revalidate',
    email: 'brian.leong@centific.com',
    name: 'Brian Leong',
  });
  assert.equal(Object.hasOwn(plan, 'role'), false);
  assert.equal(isAdminRole(plan.role), false);
  assert.equal(acceptedLoginUser(null), null);
  assert.equal(isAdminRole(acceptedLoginUser(null)?.role), false);
});

test('login response supplies role and drops extra fields', () => {
  const user = acceptedLoginUser({
    email: ' brian.leong@centific.com ',
    name: 'Brian Leong',
    role: 'User',
    extra: '<img onerror=alert(1)>',
  });
  assert.deepEqual(user, {
    email: 'brian.leong@centific.com',
    name: 'Brian Leong',
    firstName: '',
    lastName: '',
    role: 'User',
  });
  assert.equal(isAdminRole(user.role), false);
  const admin = acceptedLoginUser({
    email: 'thaingan.tran@centific.com',
    name: 'Annie Tran',
    firstName: 'Annie',
    lastName: 'Tran',
    role: 'Admin',
  });
  assert.equal(isAdminRole(admin.role), true);
});

test('incomplete saved session stays on the sign-in screen', () => {
  assert.deepEqual(planSessionRestore(null), { action: 'show-login', email: '', name: '' });
  assert.deepEqual(
    planSessionRestore({ email: 'a@centific.com', role: 'Admin' }),
    { action: 'show-login', email: '', name: '' },
  );
  assert.equal(acceptedLoginUser({ email: 'a@centific.com', role: 'Admin' }), null);
});

test('startup does not enter the app with the saved session', () => {
  const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const init = source.slice(source.indexOf('async function init'));
  assert.notEqual(init.indexOf('planSessionRestore'), -1);
  assert.notEqual(init.indexOf('acceptedLoginUser'), -1);
  assert.equal(init.includes('enterApp(saved)'), false);
  assert.equal(/state\.user\s*=\s*saved/.test(init), false);
  assert.equal(source.includes('enterApp(saved)'), false);
  assert.equal(source.includes('new Function'), false);
});
