import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryFilter } from '../src/actions/getHistory.js';
import { mapHistoryRow } from '../src/shapes.js';
import { route } from '../src/router.js';

test('missing kitId is left out of the history filter', () => {
  const empty = buildHistoryFilter({});
  assert.equal(empty.filter, undefined);
  assert.equal(JSON.stringify(empty).includes('KitID'), false);
  assert.equal(JSON.stringify(empty).includes('int('), false);

  const emailOnly = buildHistoryFilter({ userEmail: 'Jane.Doe@centific.com' });
  assert.match(emailOnly.filter, /fields\/UserEmail eq 'jane.doe@centific.com'/);
  assert.match(emailOnly.filter, /fields\/CheckedOutByEmail eq 'jane.doe@centific.com'/);
  assert.equal(emailOnly.filter.includes('KitID'), false);
  assert.equal(emailOnly.filter.includes('int('), false);
});

test('kitId is added only when it is a real number', () => {
  assert.match(buildHistoryFilter({ kitId: 14 }).filter, /fields\/KitID eq 14$/);
  assert.match(buildHistoryFilter({ kitId: '14' }).filter, /fields\/KitID eq 14$/);
  assert.equal(buildHistoryFilter({ kitId: '' }).filter, undefined);
  assert.equal(buildHistoryFilter({ kitId: null }).filter, undefined);
  assert.equal(buildHistoryFilter({ kitId: undefined }).filter, undefined);
  assert.equal(buildHistoryFilter({ kitId: 'abc' }).error, 'VALIDATION');
});

test('from and to are inclusive claim-date bounds', () => {
  const built = buildHistoryFilter({ from: '2026-09-01', to: '2026-09-24', kitId: 2 });
  assert.match(built.filter, /ClaimDate ge '2026-09-01'/);
  assert.match(built.filter, /ClaimDate le '2026-09-24'/);
  assert.match(built.filter, /KitID eq 2/);
  assert.equal(buildHistoryFilter({ from: '09/01/2026' }).error, 'VALIDATION');
});

test('history row matches the page keys and blanks checkout actor', () => {
  const row = mapHistoryRow({
    id: 27,
    Title: 'Team 1 2026-09-23 jane.doe@centific.com',
    UserEmail: 'jane.doe@centific.com',
    UserName: 'Jane Doe',
    KitID: 1,
    KitName: 'Team 1',
    ClaimDate: '2026-09-23',
    CheckInAt: '2026-09-23T16:00:00.000Z',
    CheckOutAt: null,
    Status: 'CheckedOut',
    TasksCompleted: 2,
    TasksTotal: 18,
    CompletedTaskIDs: '[1,2]',
  });
  assert.equal(row.id, 27);
  assert.equal(row.claimId, 27);
  assert.equal(row.claimDate, '2026-09-23');
  assert.equal(row.date, '2026-09-23');
  assert.deepEqual(row.completedTaskIds, [1, 2]);
  assert.equal(row.checkedOutByEmail, '');
  assert.equal(row.checkedOutByName, '');
});

const accessRows = [
  { id: 3, Email: 'admin-drc@centific.com', Title: 'admin-drc', Role: 'Admin', Active: true },
  { id: 4, Email: 'jane.doe@centific.com', Title: 'Jane Doe', FirstName: 'Jane', LastName: 'Doe', Role: 'User', Active: true },
];

test('non-admin listAccess is FORBIDDEN and does not read the full list', async () => {
  let called = false;
  const res = await route({ action: 'listAccess', actor: 'jane.doe@centific.com' }, {
    accessRows,
    graph: { async listItems() { called = true; return []; } },
    settings: { lists: { access: 'access-guid' } },
  });
  assert.equal(res.status, 200);
  assert.equal(res.jsonBody.code, 'FORBIDDEN');
  assert.equal(called, false);
});

test('admin listAccess includes inactive people', async () => {
  const res = await route({ action: 'listAccess', actor: 'admin-drc' }, {
    accessRows,
    settings: { lists: { access: 'access-guid' } },
    graph: {
      async listItems(listId, options) {
        assert.equal(listId, 'access-guid');
        assert.equal(options.filter, undefined);
        return [
          { id: '9', fields: { Title: 'Gone', Email: 'gone@centific.com', Role: 'User', Active: false } },
          { id: '3', fields: { Title: 'admin-drc', Email: 'admin-drc@centific.com', Role: 'Admin', Active: true } },
        ];
      },
    },
  });
  assert.equal(res.jsonBody.ok, true);
  assert.equal(res.jsonBody.data[0].email, 'admin-drc@centific.com');
  assert.equal(res.jsonBody.data[1].active, false);
  assert.equal(res.jsonBody.data[1].role, 'User');
});

test('getHistory orders newest id first and skips a missing kitId', async () => {
  let options;
  const res = await route({
    action: 'getHistory',
    actor: 'jane.doe@centific.com',
    from: '2026-09-01',
    to: '2026-09-24',
  }, {
    accessRows,
    settings: { lists: { log: 'log-guid' } },
    graph: {
      async listItems(listId, opts) {
        assert.equal(listId, 'log-guid');
        options = opts;
        return [
          { id: '2', fields: { Title: 'older', UserEmail: 'a@centific.com', ClaimDate: '2026-09-02', Status: 'Claimed', CompletedTaskIDs: '[]' } },
          { id: '10', fields: { Title: 'newer', UserEmail: 'b@centific.com', ClaimDate: '2026-09-03', Status: 'CheckedOut', CheckedOutByEmail: 'admin-drc@centific.com', CheckedOutByName: 'admin-drc', CompletedTaskIDs: '[1]' } },
        ];
      },
    },
  });
  assert.equal(options.top, 500);
  assert.equal(options.filter.includes('KitID'), false);
  assert.match(options.filter, /ClaimDate ge '2026-09-01'/);
  assert.deepEqual(res.jsonBody.data.map((row) => row.id), [10, 2]);
  assert.equal(res.jsonBody.data[0].checkedOutByEmail, 'admin-drc@centific.com');
});
