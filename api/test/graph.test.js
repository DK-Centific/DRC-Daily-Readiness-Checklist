import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';
import {
  buildItemsUrl,
  createCredential,
  createGraphClient,
  fieldsOf,
  loadSettings,
  rowFromItem,
} from '../src/graph.js';

const SITE = 'digitaltechedge.sharepoint.com,site,web';
const LIST = '07c4ca78-f5d8-461b-9138-f5c8ecf1f40e';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

test('loadSettings uses list GUIDs and never invents a router URL', () => {
  const settings = loadSettings({});
  assert.equal(settings.lists.log, '7e537ecf-b161-4904-b238-6c5639a435c1');
  assert.equal(settings.lists.tasks, 'e66c73cb-0810-4547-af8f-46e7f793bdd3');
  assert.equal(settings.lists.kits, '3bfaa34f-e12d-4a03-b29e-e472189f1f6e');
  assert.equal(settings.lists.access, '07c4ca78-f5d8-461b-9138-f5c8ecf1f40e');
  assert.equal(settings.paRouterUrl, '');
  assert.equal(settings.siteId, '');
  const custom = loadSettings({ SP_LIST_ACCESS: 'custom-guid', PA_ROUTER_URL: 'https://example.invalid/router' });
  assert.equal(custom.lists.access, 'custom-guid');
  assert.equal(custom.paRouterUrl, 'https://example.invalid/router');
});

test('buildItemsUrl targets Graph list items with field select', () => {
  const url = new URL(buildItemsUrl(SITE, LIST, {
    filter: "fields/Active ne false",
    select: ['Title', 'Email', 'Active'],
    top: 1,
    orderby: 'fields/Title asc',
  }));
  assert.equal(url.origin, 'https://graph.microsoft.com');
  assert.equal(url.pathname, `/v1.0/sites/${SITE}/lists/${LIST}/items`);
  assert.match(url.searchParams.get('$expand'), /fields\(\$select=Title,Email,Active\)/);
  assert.equal(url.searchParams.get('$filter'), 'fields/Active ne false');
  assert.equal(url.searchParams.get('$top'), '1');
  assert.equal(url.searchParams.get('$orderby'), 'fields/Title asc');
});

test('listItems sends a bearer token and follows nextLink up to top', async () => {
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push({ url, auth: init.headers.Authorization });
    if (urls.length === 1) {
      return jsonResponse({
        value: [{ id: '1', fields: { Title: 'A', Email: 'a@centific.com' } }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next-page',
      });
    }
    return jsonResponse({
      value: [{ id: '2', fields: { Title: 'B', Email: 'b@centific.com' } }],
    });
  };
  const client = createGraphClient({
    settings: { siteId: SITE, tenantId: 't', clientId: 'c', clientSecret: 'secret-value' },
    credential: {
      async getToken() {
        return { token: 'access-token', expiresOnTimestamp: Date.now() + 600_000 };
      },
    },
    fetchImpl,
  });
  const items = await client.listItems(LIST, { select: ['Title', 'Email'], top: 2 });
  assert.equal(items.length, 2);
  assert.equal(urls[0].auth, 'Bearer access-token');
  assert.match(urls[0].url, new RegExp(`/lists/${LIST}/items`));
  assert.equal(urls[1].url, 'https://graph.microsoft.com/v1.0/next-page');
  assert.equal(fieldsOf(items[0]).Email, 'a@centific.com');
  assert.equal(rowFromItem(items[1]).id, 2);
  assert.equal(rowFromItem(items[1]).Title, 'B');
});

test('getGraphToken is cached until near expiry', async () => {
  let calls = 0;
  const client = createGraphClient({
    settings: { siteId: SITE },
    credential: {
      async getToken() {
        calls += 1;
        return { token: `tok-${calls}`, expiresOnTimestamp: Date.now() + 600_000 };
      },
    },
    fetchImpl: async () => jsonResponse({ value: [] }),
  });
  assert.equal(await client.getGraphToken(), 'tok-1');
  assert.equal(await client.getGraphToken(), 'tok-1');
  assert.equal(calls, 1);
});

test('graph errors hide response bodies', async () => {
  const client = createGraphClient({
    settings: { siteId: SITE },
    credential: {
      async getToken() {
        return { token: 'access-token', expiresOnTimestamp: Date.now() + 600_000 };
      },
    },
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      async text() { return 'secret-sig=abc client_secret=hunter2'; },
      async json() { return {}; },
    }),
  });
  await assert.rejects(() => client.listItems(LIST, { top: 1 }), (err) => {
    assert.equal(err.status, 403);
    assert.match(err.message, /403/);
    assert.equal(err.message.includes('hunter2'), false);
    assert.equal(err.message.includes('access-token'), false);
    return true;
  });
});

test('client secret uses ClientSecretCredential; otherwise managed identity', () => {
  const secret = createCredential({ tenantId: 'tenant', clientId: 'client', clientSecret: 'secret' });
  assert.equal(secret instanceof ClientSecretCredential, true);
  const managed = createCredential({ tenantId: '', clientId: '', clientSecret: '' });
  assert.equal(managed instanceof DefaultAzureCredential, true);
});
