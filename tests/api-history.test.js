import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '../js/api.js';

test('every getHistory result maps live date and claimId', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const data = body.action === 'getHistory'
      ? [{
        claimId: 7,
        date: '2026-09-24',
        kitId: 1,
        kitName: 'Kit 01',
        checkOutAt: '2026-09-24T18:00:00.000Z',
        tasksCompleted: 18,
        tasksTotal: 18,
        userName: 'Jane Doe',
        userEmail: 'jane.doe@centific.com',
      }]
      : [{ id: 1, name: 'Kit 01' }];
    return {
      ok: true,
      json: async () => ({ ok: true, data }),
    };
  };
  try {
    const api = createClient({ backend: 'pa', flowUrl: 'https://example.test/flow' });
    const history = await api.call({ action: 'getHistory', actor: 'brian.leong@centific.com' });
    assert.equal(history.ok, true);
    assert.equal(history.data[0].id, 7);
    assert.equal(history.data[0].claimDate, '2026-09-24');
    assert.equal(history.data[0].claimId, 7);
    assert.equal(history.data[0].notes, '');
    const kits = await api.call({ action: 'getKits', actor: 'brian.leong@centific.com', date: '2026-09-24' });
    assert.equal(kits.data[0].claimDate, undefined);
    assert.equal(kits.data[0].id, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test('checkOut success and history rows always include a notes string', async () => {
  const original = globalThis.fetch;
  let sentCheckOut = null;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const data = body.action === 'checkOut'
      ? { claimId: body.claimId, checkOutAt: '2026-09-26T18:00:00.000Z', notes: null, CheckoutNotes: 'Mount was loose' }
      : [{ claimId: 9, date: '2026-09-26', checkOutAt: '2026-09-26T18:00:00.000Z', status: 'CheckedOut', CheckoutNotes: 'Mount was loose' }];
    if (body.action === 'checkOut') sentCheckOut = body;
    return { ok: true, json: async () => ({ ok: true, data }) };
  };
  try {
    const api = createClient({ backend: 'pa', flowUrl: 'https://example.test/flow' });
    const checkedOut = await api.call({
      action: 'checkOut',
      actor: 'jane.doe@centific.com',
      claimId: 9,
      completedTaskIds: [1],
      tasksTotal: 18,
      notes: 'Mount was loose',
    });
    assert.equal(sentCheckOut.notes, 'Mount was loose');
    assert.equal('incompleteReason' in sentCheckOut, false);
    assert.equal(checkedOut.data.notes, 'Mount was loose');
    const history = await api.call({ action: 'getHistory', actor: 'jane.doe@centific.com' });
    assert.equal(history.data[0].notes, 'Mount was loose');
  } finally {
    globalThis.fetch = original;
  }
});

test('getKits turns a stringified completedTaskIds into an array', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const data = body.action === 'getKits'
      ? [{
        id: 1,
        name: 'Kit 01',
        claim: {
          claimId: 10,
          userEmail: 'jane.doe@centific.com',
          completedTaskIds: '[1, 3]',
        },
      }]
      : { claimId: 10, completedTaskIds: '["1","3"]' };
    return {
      ok: true,
      json: async () => ({ ok: true, data }),
    };
  };
  try {
    const api = createClient({ backend: 'pa', flowUrl: 'https://example.test/flow' });
    const kits = await api.call({ action: 'getKits', actor: 'jane.doe@centific.com', date: '2026-09-24' });
    assert.deepEqual(kits.data[0].claim.completedTaskIds, [1, 3]);
    const saved = await api.call({ action: 'updateTasks', actor: 'jane.doe@centific.com', claimId: 10, completedTaskIds: [1, 3] });
    assert.deepEqual(saved.data.completedTaskIds, [1, 3]);
  } finally {
    globalThis.fetch = original;
  }
});
