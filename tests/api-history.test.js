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
    const kits = await api.call({ action: 'getKits', actor: 'brian.leong@centific.com', date: '2026-09-24' });
    assert.equal(kits.data[0].claimDate, undefined);
    assert.equal(kits.data[0].id, 1);
  } finally {
    globalThis.fetch = original;
  }
});
