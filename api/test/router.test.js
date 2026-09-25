import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleHttp, route } from '../src/router.js';

const accessRows = [
  { id: 3, Email: 'admin-drc@centific.com', Title: 'admin-drc', Role: 'Admin', Active: true },
  {
    id: 4,
    Email: 'jane.doe@centific.com',
    Title: 'Jane Doe',
    FirstName: 'Jane',
    LastName: 'Doe',
    Role: 'User',
    Active: true,
  },
];

test('login maps bare admin-drc to the canonical admin', async () => {
  const res = await route({ action: 'login', email: 'admin-drc' }, { accessRows });
  assert.equal(res.status, 200);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  assert.deepEqual(res.jsonBody, {
    ok: true,
    data: {
      email: 'admin-drc@centific.com',
      name: 'admin-drc',
      firstName: '',
      lastName: '',
      role: 'Admin',
    },
  });
});

test('unknown login is NO_ACCESS', async () => {
  const res = await route({ action: 'login', email: 'nobody@centific.com' }, { accessRows });
  assert.equal(res.status, 200);
  assert.equal(res.jsonBody.ok, false);
  assert.equal(res.jsonBody.code, 'NO_ACCESS');
  assert.equal(res.jsonBody.error, "You don't have access. Ask a DRC admin.");
});

test('getTasks returns visible tasks ordered by order', async () => {
  let seen;
  const graph = {
    async listItems(listId, options) {
      seen = { listId, options };
      return [
        { id: '2', fields: { Title: 'Second', TaskOrder: 2, Active: true } },
        { id: '1', fields: { Title: 'First', TaskOrder: 1, Active: true } },
        { id: '9', fields: { Title: 'Hidden', TaskOrder: 0, Active: false } },
        { id: '3', fields: { Title: 'No flag', TaskOrder: 3 } },
      ];
    },
  };
  const res = await route({ action: 'getTasks', actor: 'Jane.Doe@centific.com' }, {
    accessRows,
    graph,
    settings: { lists: { tasks: 'tasks-guid', access: 'access-guid' } },
  });
  assert.equal(seen.listId, 'tasks-guid');
  assert.match(seen.options.filter, /Active ne false/);
  assert.deepEqual(seen.options.select, ['Title', 'TaskOrder', 'Active']);
  assert.deepEqual(res.jsonBody.data, [
    { id: 1, title: 'First', order: 1 },
    { id: 2, title: 'Second', order: 2 },
    { id: 3, title: 'No flag', order: 3 },
  ]);
});

test('inactive actor cannot read tasks', async () => {
  const res = await route({ action: 'getTasks', actor: 'gone@centific.com' }, { accessRows });
  assert.equal(res.jsonBody.code, 'NO_ACCESS');
});

test('unknown action is VALIDATION', async () => {
  const res = await route({ action: 'checkIn', actor: 'jane.doe@centific.com' }, { accessRows });
  assert.equal(res.jsonBody.code, 'VALIDATION');
});

test('graph failure becomes BACKEND without the upstream message', async () => {
  const res = await route({ action: 'getTasks', actor: 'jane.doe@centific.com' }, {
    accessRows,
    settings: { lists: { tasks: 'tasks-guid' } },
    graph: {
      async listItems() {
        throw new Error('secret-sig=do-not-leak');
      },
    },
  });
  assert.equal(res.jsonBody.code, 'BACKEND');
  assert.equal(JSON.stringify(res.jsonBody).includes('secret-sig'), false);
});

test('OPTIONS is 204 with CORS and bad JSON is VALIDATION', async () => {
  const preflight = await handleHttp({ method: 'OPTIONS' }, {});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], '*');
  const bad = await handleHttp({
    method: 'POST',
    async json() { throw new SyntaxError('bad'); },
  }, {});
  assert.equal(bad.jsonBody.code, 'VALIDATION');
});
