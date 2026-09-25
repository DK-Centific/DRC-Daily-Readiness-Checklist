import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';

/** SharePoint list GUIDs on DataCollectionUSHUB. Not secrets. */
export const DEFAULT_LISTS = {
  log: '7e537ecf-b161-4904-b238-6c5639a435c1',
  tasks: 'e66c73cb-0810-4547-af8f-46e7f793bdd3',
  kits: '3bfaa34f-e12d-4a03-b29e-e472189f1f6e',
  access: '07c4ca78-f5d8-461b-9138-f5c8ecf1f40e',
};

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const TOKEN_SKEW_MS = 60_000;

export function loadSettings(env = process.env) {
  return {
    tenantId: env.GRAPH_TENANT_ID || '',
    clientId: env.GRAPH_CLIENT_ID || '',
    clientSecret: env.GRAPH_CLIENT_SECRET || '',
    siteId: env.SP_SITE_ID || '',
    lists: {
      log: env.SP_LIST_LOG || DEFAULT_LISTS.log,
      tasks: env.SP_LIST_TASKS || DEFAULT_LISTS.tasks,
      kits: env.SP_LIST_KITS || DEFAULT_LISTS.kits,
      access: env.SP_LIST_ACCESS || DEFAULT_LISTS.access,
    },
    paRouterUrl: env.PA_ROUTER_URL || '',
  };
}

export function createCredential(settings) {
  if (settings.tenantId && settings.clientId && settings.clientSecret) {
    return new ClientSecretCredential(settings.tenantId, settings.clientId, settings.clientSecret);
  }
  return new DefaultAzureCredential();
}

export function buildItemsUrl(siteId, listId, { filter, select, top, orderby } = {}) {
  const url = new URL(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`);
  const columns = Array.isArray(select) && select.length ? select.join(',') : '';
  url.searchParams.set('$expand', columns ? `fields($select=${columns})` : 'fields');
  if (filter) url.searchParams.set('$filter', filter);
  if (orderby) url.searchParams.set('$orderby', orderby);
  if (top) url.searchParams.set('$top', String(top));
  return url.toString();
}

export function fieldsOf(item) {
  return item?.fields && typeof item.fields === 'object' ? item.fields : {};
}

export function rowFromItem(item) {
  const fields = fieldsOf(item);
  const raw = item?.id ?? fields.id ?? fields.ID;
  const id = Number(raw);
  return { ...fields, id: Number.isFinite(id) ? id : raw };
}

export function createGraphClient({ settings, credential, fetchImpl = globalThis.fetch } = {}) {
  const resolved = settings || loadSettings();
  const cred = credential || createCredential(resolved);
  let cached = null;

  async function getGraphToken() {
    if (cached && cached.expiresOnTimestamp - TOKEN_SKEW_MS > Date.now()) return cached.token;
    const result = await cred.getToken(GRAPH_SCOPE);
    if (!result?.token) {
      throw new Error('Graph token unavailable');
    }
    cached = {
      token: result.token,
      expiresOnTimestamp: result.expiresOnTimestamp || Date.now() + 300_000,
    };
    return result.token;
  }

  async function listItems(listId, options = {}) {
    if (!resolved.siteId) {
      const err = new Error('SP_SITE_ID is not set');
      err.code = 'BACKEND';
      throw err;
    }
    if (!listId) {
      const err = new Error('SharePoint list id is not set');
      err.code = 'BACKEND';
      throw err;
    }
    const top = options.top ?? 200;
    const token = await getGraphToken();
    const collected = [];
    let url = buildItemsUrl(resolved.siteId, listId, { ...options, top });
    while (url && collected.length < top) {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        const err = new Error(`Graph list items failed (${response.status})`);
        err.status = response.status;
        err.code = 'BACKEND';
        throw err;
      }
      const body = await response.json();
      const batch = Array.isArray(body.value) ? body.value : [];
      collected.push(...batch);
      url = body['@odata.nextLink'] || '';
    }
    return collected.slice(0, top);
  }

  return { getGraphToken, listItems, fieldsOf };
}
